"""Appointment, slot, check-in and waitlist domain service."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Appointment, Department, Doctor, Patient, User, Waitlist
from .common import audit, minutes, new_id, now, serialize, today


def active_slots(db: Session, doctor: Doctor, date: str) -> list[str]:
    booked = {a.slot for a in db.scalars(select(Appointment).where(
        Appointment.doctor_id == doctor.id, Appointment.date == date,
        Appointment.status != "已取消")).all()}
    current = minutes(now()[11:16]) if date == today() else -1
    return [s for s in (doctor.slots or []) if s not in booked and minutes(s) > current]


def available_slots(db: Session, doctor_id: str, date: str) -> list[dict]:
    doctor = db.get(Doctor, doctor_id)
    if not doctor:
        return []
    return [{"slot": s, "doctor_id": doctor.id, "doctor_name": doctor.name,
             "dept": doctor.department_id, "dept_name": doctor.department_name, "room": doctor.room}
            for s in active_slots(db, doctor, date)]


def recommend_slots(db: Session, dept_id: str | None, date: str, patient_name: str = "") -> list[dict]:
    query = select(Doctor)
    if dept_id:
        query = query.where(Doctor.department_id == dept_id)
    out = []
    for doctor in db.scalars(query).all():
        load = db.scalar(select(func.count()).select_from(Appointment).where(
            Appointment.doctor_id == doctor.id, Appointment.date == date,
            Appointment.status != "已取消")) or 0
        for s in active_slots(db, doctor, date):
            score = 92 - load * 2 + (3 if doctor.rating >= 4.8 else 0)
            if s.startswith("09:") or s.startswith("14:"):
                score += 2
            out.append({"slot": s, "doctor_id": doctor.id, "doctor_name": doctor.name,
                        "dept": doctor.department_id, "dept_name": doctor.department_name,
                        "room": doctor.room, "score": max(58, min(98, score)),
                        "reason": f"{doctor.title} · 已约 {load}/{len(doctor.slots or [])}"})
    if patient_name and any(a.patient_name == patient_name and a.date == date and a.status != "已取消"
                            for a in db.scalars(select(Appointment)).all()):
        for item in out:
            item["warning"] = "该患者当日已有有效预约"
    return sorted(out, key=lambda x: x["score"], reverse=True)[:5]


def create_appointment(db: Session, user: User, payload: dict) -> tuple[bool, dict | str]:
    doctor = db.get(Doctor, payload.get("doctor_id"))
    if not doctor:
        return False, "请选择医生"
    date = payload.get("date") or today()
    slot = payload.get("slot")
    name = (payload.get("patient_name") or "").strip()
    if not name:
        return False, "请填写患者姓名"
    if slot not in (doctor.slots or []):
        return False, "该时段不在医生出诊号源内"
    duplicate = db.scalar(select(Appointment).where(
        Appointment.patient_name == name, Appointment.doctor_id == doctor.id,
        Appointment.date == date, Appointment.status != "已取消"))
    if duplicate:
        return False, f"重复预约：该患者当日已预约 {doctor.name} 医师（{duplicate.slot}）"
    taken = db.scalar(select(Appointment).where(
        Appointment.doctor_id == doctor.id, Appointment.date == date, Appointment.slot == slot,
        Appointment.status != "已取消"))
    if taken:
        return False, f"号源冲突：{slot} 已被占用"
    patient = db.scalar(select(Patient).where(Patient.name == name, Patient.phone == payload.get("phone", "")))
    if not patient:
        count = db.scalar(select(func.count()).select_from(Patient)) or 0
        patient = Patient(id=f"PT-OP-{count + 1:04d}", name=name, gender=payload.get("gender", "女"),
                          age=int(payload.get("age") or 35), phone=payload.get("phone", "138****0000"),
                          department_id=doctor.department_id, department_name=doctor.department_name,
                          patient_type="门诊", status="门诊", diagnosis=payload.get("reason", "门诊就诊"),
                          care_level="门诊", attending=doctor.name, updated_at=now(), tags=["新预约"])
        db.add(patient)
    count = db.scalar(select(func.count()).select_from(Appointment)) or 0
    appt = Appointment(id=f"AP-{date.replace('-', '')}-{count + 1:04d}", code=f"A{1200 + count}",
                       patient_id=patient.id, patient_user_id=payload.get("patient_user_id"),
                       patient_name=name, phone=patient.phone,
                       department_id=doctor.department_id, department_name=doctor.department_name,
                       doctor_id=doctor.id, doctor_name=doctor.name, title=doctor.title,
                       date=date, slot=slot, status="待确认", room=doctor.room,
                       source=payload.get("source", "运营后台"), note=payload.get("reason", ""),
                       created_at=now())
    db.add(appt)
    audit(db, user, "appointment.create", appt.id,
          f"新建预约：{name} / {doctor.name} / {date} {slot}")
    db.commit()
    db.refresh(appt)
    return True, serialize(appt)


def check_in(db: Session, user: User, appointment_id: str) -> tuple[bool, dict | str]:
    appt = db.get(Appointment, appointment_id)
    if not appt:
        return False, "预约不存在"
    if appt.status not in ("待确认", "已预约"):
        return False, f"当前状态不可签到：{appt.status}"
    appt.status = "已签到"
    appt.checked_in_at = now()
    appt.wait_minutes = max(0, minutes(now()[11:16]) - minutes(appt.slot))
    audit(db, user, "appointment.checkin", appt.id, f"患者签到：{appt.patient_name}")
    db.commit()
    return True, serialize(appt)


def complete(db: Session, user: User, appointment_id: str) -> tuple[bool, dict | str]:
    appt = db.get(Appointment, appointment_id)
    if not appt:
        return False, "预约不存在"
    if appt.status not in ("已签到", "已预约"):
        return False, f"当前状态不可完成：{appt.status}"
    appt.status = "已完成"
    appt.completed_at = now()
    if not appt.wait_minutes:
        appt.wait_minutes = max(0, minutes(now()[11:16]) - minutes(appt.slot))
    audit(db, user, "appointment.complete", appt.id, f"完成就诊：{appt.patient_name}")
    db.commit()
    return True, serialize(appt)


def reschedule(db: Session, user: User, appointment_id: str, date: str, slot: str) -> tuple[bool, dict | str]:
    appt = db.get(Appointment, appointment_id)
    if not appt:
        return False, "预约不存在"
    if appt.status not in ("待确认", "已预约"):
        return False, "只有待确认/已预约可以改约"
    doctor = db.get(Doctor, appt.doctor_id)
    if slot not in ((doctor.slots if doctor else []) or []):
        return False, "目标时段不在医生出诊号源内"
    taken = db.scalar(select(Appointment).where(
        Appointment.id != appt.id, Appointment.doctor_id == appt.doctor_id, Appointment.date == date,
        Appointment.slot == slot, Appointment.status != "已取消"))
    if taken:
        return False, "目标号源已被占用"
    duplicate = db.scalar(select(Appointment).where(
        Appointment.id != appt.id, Appointment.patient_name == appt.patient_name,
        Appointment.doctor_id == appt.doctor_id, Appointment.date == date,
        Appointment.status != "已取消"))
    if duplicate:
        return False, "该患者目标日期已有同一医生预约"
    appt.reschedule_from = f"{appt.date} {appt.slot}"
    appt.date = date
    appt.slot = slot
    appt.status = "待确认"
    appt.rescheduled_at = now()
    audit(db, user, "appointment.reschedule", appt.id,
          f"预约改约：{appt.patient_name} {appt.reschedule_from} → {date} {slot}")
    db.commit()
    return True, serialize(appt)


def cancel_appointment(db: Session, user: User, appointment_id: str, reason: str = "") -> tuple[bool, dict | str]:
    appt = db.get(Appointment, appointment_id)
    if not appt:
        return False, "预约不存在"
    if appt.status in ("已取消", "已完成"):
        return False, "该预约不可取消"
    appt.status = "已取消"
    appt.canceled_at = now()
    appt.cancel_reason = reason or "管理员取消"
    audit(db, user, "appointment.cancel", appt.id, f"取消预约：{appt.patient_name}")
    db.commit()
    return True, serialize(appt)


def add_waitlist(db: Session, user: User, payload: dict) -> tuple[bool, dict | str]:
    dept = db.get(Department, payload.get("dept"))
    if not dept:
        return False, "科室不存在"
    date = payload.get("preferred_date") or today()
    name = payload.get("patient_name")
    if not name:
        return False, "请填写患者姓名"
    existing = db.scalar(select(Waitlist).where(
        Waitlist.patient_name == name, Waitlist.department_id == dept.id,
        Waitlist.preferred_date == date, Waitlist.status == "等待中"))
    if existing:
        return False, "该患者在该科室该日期已在候补队列中"
    doctor = db.get(Doctor, payload.get("doctor_id")) if payload.get("doctor_id") else None
    count = db.scalar(select(func.count()).select_from(Waitlist)) or 0
    entry = Waitlist(id=f"WL-{today().replace('-', '')}-{count + 1:03d}",
                     patient_name=name, phone=payload.get("phone", ""),
                     department_id=dept.id, department_name=dept.name,
                     doctor_id=doctor.id if doctor else None, doctor_name=doctor.name if doctor else "",
                     preferred_date=date, preferred_period=payload.get("preferred_period", "上午"),
                     priority=payload.get("priority", "常规"), source=payload.get("source", "运营后台"),
                     note=payload.get("note", ""), status="等待中", registered_at=now())
    db.add(entry)
    audit(db, user, "waitlist.add", entry.id, f"加入候补：{name} / {dept.name} / {date}")
    db.commit()
    return True, serialize(entry)


def find_waitlist_slot(db: Session, entry: Waitlist) -> dict | None:
    doctors = [db.get(Doctor, entry.doctor_id)] if entry.doctor_id else \
        db.scalars(select(Doctor).where(Doctor.department_id == entry.department_id)).all()
    candidates = []
    for doctor in doctors:
        if not doctor:
            continue
        for slot in active_slots(db, doctor, entry.preferred_date):
            if entry.preferred_period == "上午" and minutes(slot) >= 720:
                continue
            if entry.preferred_period == "下午" and minutes(slot) < 720:
                continue
            candidates.append({"doctor_id": doctor.id, "doctor_name": doctor.name,
                               "date": entry.preferred_date, "slot": slot, "room": doctor.room})
    return sorted(candidates, key=lambda x: minutes(x["slot"]))[0] if candidates else None


def promote_waitlist(db: Session, user: User, entry_id: str) -> tuple[bool, dict | str]:
    entry = db.get(Waitlist, entry_id)
    if not entry:
        return False, "候补记录不存在"
    if entry.status != "等待中":
        return False, f"该候补已处理：{entry.status}"
    slot = find_waitlist_slot(db, entry)
    if not slot:
        return False, "该科室/医生在期望时段暂无可用号源"
    ok, result = create_appointment(db, user, {
        "patient_name": entry.patient_name, "phone": entry.phone,
        "doctor_id": slot["doctor_id"], "date": slot["date"], "slot": slot["slot"],
        "source": "候补补位", "reason": entry.note or "候补补位",
    })
    if not ok:
        return False, result
    entry.status = "已转预约"
    entry.appointment_id = result["id"] if isinstance(result, dict) else None
    entry.promoted_at = now()
    audit(db, user, "waitlist.promote", entry.id,
          f"候补补位成功：{entry.patient_name} → {slot['doctor_name']} {slot['slot']}")
    db.commit()
    return True, {"waitlist": serialize(entry), "appointment": result}


def remove_waitlist(db: Session, user: User, entry_id: str) -> tuple[bool, dict | str]:
    entry = db.get(Waitlist, entry_id)
    if not entry:
        return False, "候补记录不存在"
    if entry.status != "等待中":
        return False, f"该候补已处理：{entry.status}"
    entry.status = "已取消"
    entry.canceled_at = now()
    audit(db, user, "waitlist.cancel", entry.id, f"取消候补：{entry.patient_name}")
    db.commit()
    return True, serialize(entry)
