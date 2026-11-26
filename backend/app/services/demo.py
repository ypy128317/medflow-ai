"""Explicit demo-event simulator.

Only used in the demo environment. It creates synthetic patients/admissions and
can release an occupied bed, which exercises the same bed replanning path as a
real discharge + cleaning completion.
"""
from __future__ import annotations

import random
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Admission, Bed, Department, Patient, Plan, User
from .beds import discharge, finish_cleaning
from .common import add_days, audit, now, today

FIRST_NAMES = ["赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈", "褚", "卫", "蒋", "沈", "韩", "杨"]
GIVEN_NAMES = ["志强", "秀英", "建国", "桂兰", "明远", "小雨", "文博", "佳怡", "国庆", "丽华", "子涵", "浩然", "雪梅", "俊杰"]
DEPT_CODES = ["ortho", "cardio", "neuro", "resp", "gs", "onco", "peds"]
BED_TYPES = ["三人间", "双人间", "单人间"]
DIAGNOSES = {
    "ortho": ["膝关节疼痛待查", "腰椎间盘突出", "骨折术后观察"],
    "cardio": ["胸闷待查", "高血压控制不佳", "心悸待查"],
    "neuro": ["头晕待查", "头痛待查", "肢体麻木待查"],
    "resp": ["社区获得性肺炎", "慢阻肺急性加重", "咳嗽待查"],
    "gs": ["腹痛待查", "胆囊结石", "腹股沟疝"],
    "onco": ["肿瘤化疗支持", "淋巴结肿大待查", "消瘦待查"],
    "peds": ["发热待查", "支气管炎", "腹泻待查"],
}
PRIORITIES = ["常规", "常规", "常规", "优先", "紧急"]


def _next_patient_id(db: Session) -> str:
    count = db.scalar(select(func.count()).select_from(Patient)) or 0
    return f"PT-DEMO-{count + 1:04d}"


def _next_admission_id(db: Session) -> str:
    count = db.scalar(select(func.count()).select_from(Admission)) or 0
    return f"ADM-DEMO-{count + 1:04d}"


def _unique_name(db: Session) -> str:
    for _ in range(40):
        name = random.choice(FIRST_NAMES) + random.choice(GIVEN_NAMES)
        if not db.scalar(select(Patient).where(Patient.name == name)):
            return name
    return f"演示患者{random.randint(100, 999)}"


def inject_admissions(db: Session, user: User, count: int = 2) -> list[dict]:
    created = []
    depts = {d.id: d for d in db.scalars(select(Department)).all()}
    for _ in range(count):
        dept_id = random.choice(DEPT_CODES)
        dept = depts.get(dept_id)
        if not dept:
            continue
        name = _unique_name(db)
        gender = random.choice(["男", "女"])
        age = random.randint(19, 82)
        priority = random.choice(PRIORITIES)
        bed_type = random.choice(BED_TYPES + (["监护床"] if priority == "紧急" else []))
        diagnosis = random.choice(DIAGNOSES[dept_id])
        patient_id = _next_patient_id(db)
        patient = Patient(
            id=patient_id, name=name, gender=gender, age=age,
            phone=f"139****{random.randint(1000, 9999)}", department_id=dept_id,
            department_name=dept.name, patient_type="住院", status="待入院",
            diagnosis=diagnosis, care_level="二级护理" if priority != "紧急" else "一级护理",
            attending="模拟医师", updated_at=now(), tags=["模拟事件"],
        )
        db.add(patient)
        db.flush()
        admission_id = _next_admission_id(db)
        admission = Admission(
            id=admission_id, patient_id=patient_id, name=name, gender=gender, age=age,
            phone=patient.phone, department_id=dept_id, department_name=dept.name,
            bed_type=bed_type, priority=priority, priority_source="主管医师标注",
            applied_at=now(), diagnosis=diagnosis, care_level=patient.care_level,
            expected_stay=random.randint(3, 10), source="演示事件模拟", attending="模拟医师",
            required_features=["靠近护士站"] if priority == "优先" else [],
            isolation=False, note="由演示事件模拟器生成，用于验证床位调度与候补流程。",
            status="待分配",
        )
        db.add(admission)
        db.flush()
        created.append({"patient_id": patient_id, "admission_id": admission_id,
                        "patient_name": name, "department": dept.name, "bed_type": bed_type})
    audit(db, user, "demo.inject_admissions", "DEMO", f"模拟新增 {len(created)} 位待入院患者")
    db.commit()
    return created


def simulate_release(db: Session, user: User) -> dict:
    beds = db.scalars(select(Bed).where(Bed.status == "已入住")).all()
    if not beds:
        return {"ok": False, "message": "当前没有已入住床位可模拟释放"}

    def pending_for(dept_id: str) -> int:
        return db.scalar(select(func.count()).select_from(Admission).where(
            Admission.department_id == dept_id, Admission.status == "待分配")) or 0

    bed = sorted(beds, key=lambda b: pending_for(b.department_id), reverse=True)[0]
    patient_name = bed.patient_name
    dept_id = bed.department_id
    ok, message = discharge(db, user, bed.id)
    if not ok:
        return {"ok": False, "message": message}
    ok, cleaning_message = finish_cleaning(db, user, bed.id)
    if not ok:
        return {"ok": False, "message": cleaning_message}
    plan = db.scalar(select(Plan).where(
        Plan.kind == "bed", Plan.status == "待审批", Plan.department_id == dept_id))
    audit(db, user, "demo.release_bed", bed.id,
          f"模拟床位释放：{patient_name} 出院，床位 {bed.code} 清洁完成")
    db.commit()
    return {"ok": True, "bed_id": bed.id, "bed_code": bed.code, "patient_name": patient_name,
            "department_id": dept_id, "message": cleaning_message,
            "plan_id": plan.id if plan else None}


def simulate(db: Session, user: User, action: str = "all") -> dict:
    if action not in ("admit", "release", "all"):
        return {"ok": False, "message": "action 必须为 admit / release / all"}
    result = {"ok": True, "action": action, "created": [], "release": None}
    if action in ("admit", "all"):
        result["created"] = inject_admissions(db, user, 2)
    if action in ("release", "all"):
        result["release"] = simulate_release(db, user)
        if not result["release"].get("ok"):
            result["ok"] = False
    return result
