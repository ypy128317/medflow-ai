"""Safe symptom triage assistant.

Deterministic red-flag rules decide urgency and department. Qwen may only
rephrase the explanation; it never makes the diagnosis or the safety decision.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Department, Doctor, User
from .appointments import active_slots, create_appointment
from .common import add_days, audit, now, today
from .llm import qwen

DISCLAIMER = "本结果仅用于就医分诊，不构成诊断，也不能替代医生面诊。"
BED_NOTE = "是否需要住院由医生面诊后判断；分诊助手不会直接分配床位。"

RED_FLAG_GROUPS = [
    (["胸痛", "胸闷"], ["大汗", "呼吸困难", "晕厥", "放射"], "胸痛伴高危症状"),
    (["呼吸困难", "喘不上气", "窒息"], [], "呼吸困难"),
    (["意识不清", "昏迷", "晕厥", "叫不醒"], [], "意识障碍"),
    (["大出血", "呕血", "咯血", "便血", "血便"], [], "大出血"),
    (["剧烈腹痛", "腹痛难忍"], [], "剧烈腹痛"),
    (["抽搐", "惊厥"], [], "抽搐/惊厥"),
    (["孕", "怀孕"], ["出血", "腹痛"], "孕产期出血或腹痛"),
    (["自杀", "自伤", "不想活"], [], "自伤/自杀风险"),
    (["中毒", "误服", "农药"], [], "中毒/误服"),
]

DEPARTMENT_RULES = [
    ("peds", ["儿童", "孩子", "宝宝", "婴儿", "小儿"]),
    ("resp", ["咳嗽", "发烧", "发热", "咽痛", "气促", "哮喘", "咳痰", "鼻塞"]),
    ("cardio", ["心悸", "心慌", "血压", "胸闷", "胸痛", "心跳"]),
    ("neuro", ["头痛", "头晕", "眩晕", "麻木", "抽搐", "失眠", "晕倒"]),
    ("gs", ["腹痛", "胃痛", "腹泻", "呕吐", "便秘", "腹胀", "肚子"]),
    ("ortho", ["骨折", "关节", "腰痛", "颈痛", "扭伤", "外伤", "膝盖", "肩膀"]),
    ("onco", ["肿块", "肿瘤", "淋巴结", "消瘦", "包块"]),
]
DEPT_NAMES = {"peds": "儿科", "resp": "呼吸内科", "cardio": "心内科", "neuro": "神经内科",
              "gs": "普外科", "ortho": "骨科", "onco": "肿瘤科", "emergency": "急诊科",
              "general": "全科门诊"}


def _hit(text: str, words: list[str]) -> bool:
    for word in words:
        start = text.find(word)
        while start >= 0:
            prefix = text[max(0, start - 3):start]
            if not any(neg in prefix for neg in ("没有", "无", "不", "未", "否认")):
                return True
            start = text.find(word, start + 1)
    return False


def detect_red_flags(text: str) -> list[dict]:
    hits = []
    for primary, secondary, label in RED_FLAG_GROUPS:
        if _hit(text, primary) and (not secondary or _hit(text, secondary)):
            hits.append({"label": label, "level": "急症"})
    return hits


def _departments(text: str, age: int, emergency: bool) -> list[dict]:
    if emergency:
        return [{"id": "emergency", "name": "急诊科", "reason": "存在急症红旗，需要立即急诊评估"}]
    found = []
    if age < 14:
        found.append("peds")
    for dept, words in DEPARTMENT_RULES:
        if _hit(text, words) and dept not in found:
            found.append(dept)
    if not found:
        return [{"id": "general", "name": "全科门诊", "reason": "症状不典型，建议先由全科/导诊台评估"}]
    return [{"id": d, "name": DEPT_NAMES.get(d, d),
             "reason": f"症状描述与{DEPT_NAMES.get(d, d)}常见就诊范围匹配"} for d in found[:2]]


def _urgency(text: str, red_flags: list[dict]) -> str:
    if red_flags:
        return "emergency"
    if _hit(text, ["高热", "39度", "40度", "持续呕吐", "不能进食", "脱水", "骨折", "外伤"]):
        return "urgent"
    return "routine"


def _doctor_options(db: Session, departments: list[dict]) -> list[dict]:
    out = []
    for dept in departments:
        if dept["id"] in ("emergency", "general"):
            continue
        for doctor in db.scalars(select(Doctor).where(Doctor.department_id == dept["id"])).all():
            for date in (today(), add_days(today(), 1)):
                slots = active_slots(db, doctor, date)
                if slots:
                    out.append({"doctor_id": doctor.id, "doctor_name": doctor.name,
                                "title": doctor.title, "department_id": doctor.department_id,
                                "department_name": doctor.department_name,
                                "room": doctor.room, "date": date,
                                "slots": slots[:3]})
                    break
    return out[:4]


def assess(db: Session, user: User, age: int, sex: str, symptoms: str, duration: str = "") -> dict:
    text = f"{symptoms} {duration}".strip()
    red_flags = detect_red_flags(text)
    urgency = _urgency(text, red_flags)
    departments = _departments(text, age, urgency == "emergency")
    doctors = [] if urgency == "emergency" else _doctor_options(db, departments)
    dept_names = [d["name"] for d in departments]
    if urgency == "emergency":
        advice = "请立即前往急诊科，或拨打 120。不要等待普通门诊。"
    elif urgency == "urgent":
        advice = f"建议今天尽快到{'、'.join(dept_names)}就诊；如症状加重请立即急诊。"
    else:
        advice = f"建议预约{'、'.join(dept_names)}门诊，由医生面诊判断。"
    note = qwen.triage_note(symptoms, dept_names, urgency)
    narrative = note.get("text") if note.get("ok") else advice
    audit(db, user, "triage.assess", "TRIAGE",
          f"AI分诊：{age}岁{sex} · 紧迫度{urgency} · 推荐{'/'.join(dept_names)}")
    db.commit()
    return {
        "urgency": urgency,
        "urgency_label": {"emergency": "立即急诊", "urgent": "尽快就医", "routine": "普通门诊"}[urgency],
        "red_flags": red_flags,
        "departments": departments,
        "doctors": doctors,
        "advice": advice,
        "narrative": narrative,
        "qwen": {"configured": qwen.configured, "ok": bool(note.get("ok")), "model": qwen.model,
                 "error": None if note.get("ok") else note.get("error")},
        "disclaimer": DISCLAIMER,
        "bed_note": BED_NOTE,
        "assessed_at": now(),
    }


def book(db: Session, user: User, payload: dict) -> tuple[bool, dict | str]:
    if not payload.get("patient_name") or not payload.get("doctor_id") or not payload.get("slot"):
        return False, "请填写患者姓名并选择医生号源"
    if len((payload.get("symptoms") or "").strip()) < 4:
        return False, "请先完成症状分诊"
    ok, result = create_appointment(db, user, {
        "patient_name": payload["patient_name"], "phone": payload.get("phone", ""),
        "gender": payload.get("gender", "女"), "age": payload.get("age", 30),
        "doctor_id": payload["doctor_id"], "date": payload["date"], "slot": payload["slot"],
        "reason": "AI 分诊预约", "source": "AI 分诊", "patient_user_id": user.id,
    })
    if not ok:
        return False, result
    audit(db, user, "triage.book", result["id"], "通过 AI 分诊助手创建预约")
    db.commit()
    return True, result
