"""Seed SQLite/PostgreSQL from the deterministic synthetic JSON export."""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import DEMO_DATE, DEMO_NOW, DEMO_PASSWORD, SEED_FILE
from .database import Base, SessionLocal, engine
from .models import (Admission, Alert, Appointment, AuditLog, Bed, Department, Device, Doctor,
                     Exam, KnowledgeDoc, Patient, Plan, Setting, Staff, StaffConflict, User, Waitlist,
                     Ward, WorkflowRun)
from .security import ROLE_NAMES, hash_password

USERNAMES = {"u-ops": "chenming", "u-admin": "zhangwei", "u-bed": "wangli",
             "u-appt": "lina", "u-equip": "zhouhang", "u-staff": "liufang"}


DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(.*)$")
ID_DATE_RE = re.compile(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)")
SHORT_DATE_RE = re.compile(r"(?<!\d)(\d{1,2})/(\d{2})(?!\d)")
WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def _shift_string(value: str, delta: int, anchor_year: int) -> str:
    match = DATE_RE.match(value)
    if match:
        day = date(int(match.group(1)), int(match.group(2)), int(match.group(3))) + timedelta(days=delta)
        return f"{day.isoformat()}{match.group(4)}"

    def short(match: re.Match) -> str:
        day = date(anchor_year, int(match.group(1)), int(match.group(2))) + timedelta(days=delta)
        return f"{day.month}/{day.day:02d}"

    def id_date(match: re.Match) -> str:
        try:
            day = date(int(match.group(1)), int(match.group(2)), int(match.group(3))) + timedelta(days=delta)
            return day.strftime("%Y%m%d")
        except ValueError:
            return match.group(0)

    value = ID_DATE_RE.sub(id_date, value)
    return SHORT_DATE_RE.sub(short, value)


def _shift_tree(value: Any, delta: int, anchor_year: int) -> Any:
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            new_key = _shift_string(key, delta, anchor_year) if isinstance(key, str) else key
            out[new_key] = _shift_tree(item, delta, anchor_year)
        return out
    if isinstance(value, list):
        return [_shift_tree(item, delta, anchor_year) for item in value]
    if isinstance(value, str):
        return _shift_string(value, delta, anchor_year)
    return value


def load_seed() -> dict[str, Any]:
    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    anchor = datetime.strptime(data.get("DEMO_DATE", "2026-11-06"), "%Y-%m-%d").date()
    target = datetime.strptime(DEMO_DATE, "%Y-%m-%d").date()
    delta = (target - anchor).days
    data = _shift_tree(data, delta, anchor.year)
    data["DEMO_DATE"] = DEMO_DATE
    data["DEMO_NOW"] = DEMO_NOW
    data["DEMO_WEEKDAY"] = WEEKDAYS[target.weekday()]
    for ward in data.get("wards", []):
        for bed in data.get("beds", []):
            if bed.get("wardId") == ward.get("id"):
                bed["wardName"] = ward.get("name", bed.get("wardName", ""))
    return data


def init_db(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_db(db)


def seed_db(db: Session) -> None:
    if db.scalar(select(User).limit(1)):
        return
    data = load_seed()

    for d in data["departments"]:
        db.add(Department(id=d["id"], name=d["name"], short_name=d.get("short", ""),
                          color=d.get("color", "#0f766e"), director=d.get("director", ""),
                          phone=d.get("phone", "")))

    for w in data["wards"]:
        db.add(Ward(id=w["id"], department_id=w["dept"], name=w["name"], floor=w.get("floor", ""),
                    side=w.get("side", ""), head_nurse=w.get("nurse", ""), phone=w.get("phone", "")))

    for b in data["beds"]:
        db.add(Bed(id=b["id"], ward_id=b["wardId"], ward_name=b.get("wardName", ""),
                   department_id=b["dept"], code=b["code"],
                   room_no=b["room"], room_type=b.get("roomType", b["type"]), bed_type=b["type"],
                   gender_policy=b.get("genderPolicy", "不限"), status=b["status"],
                   features=b.get("features", []), version=b.get("version", 1),
                   patient_id=b.get("patientId"), patient_name=b.get("patientName"),
                   admission_id=b.get("admissionId"), occupied_at=b.get("occupiedAt"),
                   expected_discharge=b.get("expectedDischarge"),
                   expected_discharge_time=b.get("expectedDischargeTime"),
                   cleaning_started_at=b.get("cleaningStartedAt"), cleaning_deadline=b.get("cleaningDeadline"),
                   maintenance_note=b.get("maintenanceNote"), reserved_for=b.get("reservedFor"),
                   reserved_until=b.get("reservedUntil")))

    for p in data["patients"]:
        db.add(Patient(id=p["id"], name=p["name"], gender=p["gender"], age=p["age"], phone=p.get("phone", ""),
                       department_id=p["dept"], department_name=p.get("deptName", ""),
                       patient_type=p.get("type", "住院"), status=p.get("status", ""),
                       diagnosis=p.get("diagnosis", ""), care_level=p.get("careLevel", ""),
                       attending=p.get("attending", ""), bed_id=p.get("bedId"), bed_code=p.get("bedCode"),
                       ward_name=p.get("wardName"), admitted_at=p.get("admittedAt"),
                       expected_discharge=p.get("expectedDischarge"), updated_at=p.get("updatedAt", ""),
                       tags=p.get("tags", [])))

    for a in data["admissions"]:
        db.add(Admission(id=a["id"], patient_id=a["patientId"], name=a["name"], gender=a["gender"], age=a["age"],
                         phone=a.get("phone", ""), department_id=a["dept"], department_name=a["deptName"],
                         bed_type=a["bedType"], priority=a["priority"], priority_source=a.get("prioritySource", ""),
                         applied_at=a["appliedAt"], diagnosis=a.get("diagnosis", ""), care_level=a.get("careLevel", ""),
                         expected_stay=a.get("expectedStay", 5), source=a.get("source", ""),
                         attending=a.get("attending", ""), required_features=a.get("requiredFeatures", []),
                         isolation=a.get("isolation", False), note=a.get("note", ""), status=a["status"],
                         assigned_bed_id=a.get("assignedBedId"), assigned_at=a.get("assignedAt")))

    for d in data["doctors"]:
        db.add(Doctor(id=d["id"], name=d["name"], department_id=d["dept"], department_name=d.get("deptName", ""),
                      title=d.get("title", ""), specialty=d.get("specialty", ""), room=d.get("room", ""),
                      period=d.get("period", ""), rating=d.get("rating", 4.8), slots=d.get("slots", []),
                      clinic_days=d.get("clinicDays", [])))

    for a in data["appointments"]:
        db.add(Appointment(id=a["id"], code=a.get("code", ""), patient_id=a.get("patientId"),
                           patient_name=a["patientName"], phone=a.get("phone", ""),
                           department_id=a["dept"], department_name=a["deptName"], doctor_id=a["doctorId"],
                           doctor_name=a["doctorName"], title=a.get("title", ""), date=a["date"], slot=a["slot"],
                           status=a["status"], wait_minutes=a.get("waitMinutes", 0), room=a.get("room", ""),
                           source=a.get("source", ""), note=a.get("note", ""), created_at=a["createdAt"]))

    for w in data["waitlist"]:
        db.add(Waitlist(id=w["id"], patient_name=w["patientName"], phone=w.get("phone", ""),
                        department_id=w["dept"], department_name=w["deptName"], doctor_id=w.get("doctorId"),
                        doctor_name=w.get("doctorName", ""), preferred_date=w["preferredDate"],
                        preferred_period=w["preferredPeriod"], priority=w.get("priority", "常规"),
                        source=w.get("source", ""), note=w.get("note", ""), status=w["status"],
                        appointment_id=w.get("appointmentId"), registered_at=w["registeredAt"],
                        promoted_at=w.get("promotedAt")))

    for d in data["devices"]:
        db.add(Device(id=d["id"], name=d["name"], device_type=d["type"], model=d.get("model", ""),
                      room=d.get("room", ""), status=d.get("status", "运行中"), capabilities=d.get("capabilities", []),
                      color=d.get("color", "#0f766e")))

    for e in data["exams"]:
        db.add(Exam(id=e["id"], patient_name=e["patientName"], gender=e.get("gender", ""), age=e.get("age", 0),
                    department_id=e.get("dept", ""), department_name=e.get("deptName", ""),
                    device_id=e["deviceId"], device_name=e.get("deviceName", ""), device_type=e.get("deviceType", ""),
                    exam_item=e["examItem"], date=e["date"], start=e["start"], end=e["end"],
                    duration=e.get("duration", 30), status=e["status"], priority=e.get("priority", "常规"),
                    priority_source=e.get("prioritySource", ""), ordered_by=e.get("orderedBy", ""),
                    prep=e.get("prep", ""), note=e.get("note", ""), room=e.get("room", ""),
                    created_at=e.get("createdAt", "")))

    for s in data["staff"]:
        db.add(Staff(id=s["id"], name=s["name"], role=s.get("role", ""), department_id=s["dept"],
                     department_name=s.get("deptName", ""), title=s.get("title", ""), skills=s.get("skills", []),
                     phone=s.get("phone", ""), color=s.get("color", "#0f766e"), shifts=s.get("shifts", {}),
                     shift_times=s.get("shiftTimes", {}), weekly_hours=s.get("weeklyHours", 0),
                     night_shifts=s.get("nightShifts", 0), work_days=s.get("workDays", 0),
                     workload=s.get("workload", 0), status=s.get("status", "在岗")))

    for c in data["staffConflicts"]:
        db.add(StaffConflict(id=c["id"], staff_id=c["staffId"], staff_name=c["staffName"],
                             department_id=c["dept"], conflict_type=c["type"], detail=c["detail"],
                             severity=c["severity"], date=c.get("date"), from_shift=c.get("fromShift"),
                             to_shift=c.get("toShift"), suggestion=c.get("suggestion", "")))

    for a in data["alerts"]:
        db.add(Alert(id=a["id"], level=a["level"], alert_type=a["type"], title=a["title"],
                     department_name=a.get("dept", ""), trigger_at=a["triggerAt"], status=a["status"],
                     related_type=a.get("relatedType"), related_id=a.get("relatedId"), data=a.get("data", []),
                     cause=a.get("cause", ""), ai_analysis=a.get("ai", ""), suggestion=a.get("suggestion", ""),
                     source=a.get("source", "规则引擎"), rule_key=a.get("ruleKey")))

    for doc in data["knowledgeDocs"]:
        db.add(KnowledgeDoc(id=doc["id"], title=doc["title"], category=doc.get("category", ""),
                            owner=doc.get("owner", ""), version=doc.get("version", "v1.0"),
                            updated_at=doc.get("updatedAt", ""), summary=doc.get("summary", ""),
                            chunks=doc.get("chunks", [])))

    for p in data["plans"]:
        db.add(Plan(id=p["id"], kind=p["kind"], title=p["title"], scope=p.get("scope", ""),
                    status=p["status"], version=p.get("version", 1), summary=p.get("summary", ""),
                    snapshot=p.get("snapshot", {}), matched=p.get("matched", []), unmatched=p.get("unmatched", []),
                    changes=p.get("changes", []), conflicts=p.get("conflicts", []),
                    validation=p.get("validation", {}), citations=p.get("citations", []),
                    rationale=p.get("rationale", []), created_at=p["createdAt"],
                    created_by=p.get("createdBy", "MedFlow Coordinator"),
                    created_by_name=p.get("createdByName", "AI 调度中心"),
                    workflow_id=p.get("workflowId"), approval=p.get("approval") or {},
                    execution=p.get("execution") or {}, department_id=p.get("dept")))

    for t in data["tasks"]:
        db.add(WorkflowRun(id=t["id"], prompt=t["prompt"], intent=t["intent"], intent_label=t["intentLabel"],
                           status=t["status"], plan_id=t.get("planId"), steps=[], citations=[],
                           created_at=t["createdAt"], completed_at=t.get("completedAt"), actor=t.get("actor", "")))

    for log in data["audit"]:
        db.add(AuditLog(at=log["at"], actor=log["actor"], role=log.get("role", ""),
                        action=log["action"], target=log.get("target", ""), detail=log.get("detail", ""),
                        ip=log.get("ip", "127.0.0.1")))

    for u in data["users"]:
        username = USERNAMES.get(u["id"], u["id"])
        db.add(User(id=u["id"], username=username, name=u["name"], role=u["role"],
                    role_name=u.get("roleName", ROLE_NAMES.get(u["role"], u["role"])),
                    dept=u.get("dept", ""), phone=u.get("phone", ""), password_hash=hash_password(DEMO_PASSWORD),
                    status=u.get("status", "启用"), color=u.get("color", "#0f766e"),
                    permissions=u.get("permissions", ""), last_login=u.get("lastLogin", "—")))

    # Patient demo account for the separate patient portal.
    db.add(User(id="u-patient", username="patient", name="演示患者", role="patient",
                role_name="患者", dept="患者端", phone="", password_hash=hash_password(DEMO_PASSWORD),
                status="启用", color="#0ea5e9", permissions="AI 分诊、预约挂号、我的预约",
                last_login="—"))

    db.add(Setting(key="alert_rules", value=data.get("alertRules", {})))
    db.add(Setting(key="daily_stats", value=data.get("dailyStats", {})))
    db.add(Setting(key="week_dates", value={"dates": data.get("weekDates", []), "labels": data.get("weekLabels", [])}))
    db.commit()


if __name__ == "__main__":
    init_db(reset=True)
    print("MedFlow database reset and seeded.")

