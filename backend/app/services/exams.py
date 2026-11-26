"""Diagnostic device and exam scheduling domain service."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Device, Exam, User
from .common import audit, hhmm, minutes, now, serialize, today

DEFAULT_DURATION = {"CT": 30, "MRI": 40, "超声": 20, "X 光": 15}


def conflicts(db: Session, date: str, device_id: str | None = None) -> list[dict]:
    query = select(Exam).where(Exam.date == date, Exam.status != "已取消")
    if device_id:
        query = query.where(Exam.device_id == device_id)
    by_device: dict[str, list[Exam]] = {}
    for e in db.scalars(query).all():
        by_device.setdefault(e.device_id, []).append(e)
    out = []
    for dev, rows in by_device.items():
        rows.sort(key=lambda e: minutes(e.start))
        for i in range(len(rows)):
            for j in range(i + 1, len(rows)):
                if minutes(rows[j].start) >= minutes(rows[i].end):
                    break
                overlap = min(minutes(rows[i].end), minutes(rows[j].end)) - max(minutes(rows[i].start), minutes(rows[j].start))
                if overlap > 0:
                    out.append({"device_id": dev, "date": date, "overlap_minutes": overlap,
                                "a": serialize(rows[i]), "b": serialize(rows[j])})
    return out


def find_free_slot(db: Session, device_id: str, date: str, duration: int, after: int = 480) -> dict | None:
    exams = db.scalars(select(Exam).where(Exam.device_id == device_id, Exam.date == date,
                                         Exam.status != "已取消")).all()
    t = max(480, after)
    while t + duration <= 1080:
        end = t + duration
        if not any(minutes(e.start) < end and minutes(e.end) > t for e in exams):
            return {"start": hhmm(t), "end": hhmm(end)}
        t += 10
    return None


def create_exam(db: Session, user: User, payload: dict) -> tuple[bool, dict | str]:
    device = db.get(Device, payload.get("device_id"))
    if not device:
        return False, "设备不存在"
    if device.status == "维护中":
        return False, "设备处于维护中，不能创建检查"
    name = payload.get("patient_name")
    if not name:
        return False, "请填写患者姓名"
    date = payload.get("date") or today()
    start = payload.get("start")
    if not start:
        return False, "请选择检查开始时间"
    duration = int(payload.get("duration") or DEFAULT_DURATION.get(device.device_type, 30))
    begin = minutes(start)
    if begin < 480 or begin + duration > 1080:
        return False, "检查需在 08:00–18:00 设备开放时段内"
    end = hhmm(begin + duration)
    conflict = db.scalar(select(Exam).where(
        Exam.device_id == device.id, Exam.date == date, Exam.status != "已取消",
        Exam.start < end, Exam.end > start))
    if conflict:
        return False, f"设备时段冲突：{conflict.start}–{conflict.end} 已有检查"
    count = db.scalar(select(func.count()).select_from(Exam)) or 0
    exam = Exam(id=f"EX-{date.replace('-', '')}-{count + 1:04d}", patient_name=name,
                gender=payload.get("gender", ""), age=int(payload.get("age") or 40),
                department_id=payload.get("dept", "ortho"),
                department_name=payload.get("dept_name", "骨科"),
                device_id=device.id, device_name=device.name, device_type=device.device_type,
                exam_item=payload.get("exam_item") or (device.capabilities or ["检查"])[0],
                date=date, start=start, end=end, duration=duration, status="已预约",
                priority=payload.get("priority", "常规"), priority_source="开单医师标注",
                ordered_by=payload.get("ordered_by", "门诊医师"), note=payload.get("note", ""),
                room=device.room, created_at=now())
    db.add(exam)
    audit(db, user, "exam.create", exam.id, f"新建检查：{name} / {device.id} / {date} {start}–{end}")
    db.commit()
    db.refresh(exam)
    return True, serialize(exam)


def cancel_exam(db: Session, user: User, exam_id: str, reason: str = "") -> tuple[bool, dict | str]:
    exam = db.get(Exam, exam_id)
    if not exam:
        return False, "检查不存在"
    if exam.status in ("已完成", "已取消"):
        return False, f"当前状态不可取消：{exam.status}"
    exam.status = "已取消"
    exam.canceled_at = now()
    exam.cancel_reason = reason or "管理员取消"
    audit(db, user, "exam.cancel", exam.id, f"取消检查：{exam.patient_name} / {exam.device_id}")
    db.commit()
    return True, serialize(exam)


def set_device_status(db: Session, user: User, device_id: str, status: str, note: str = "") -> tuple[bool, dict | str]:
    device = db.get(Device, device_id)
    if not device:
        return False, "设备不存在"
    if status == "维护中":
        active = db.scalar(select(func.count()).select_from(Exam).where(
            Exam.device_id == device_id, Exam.status.notin_(["已取消", "已完成"]),
            Exam.date >= today())) or 0
        if active:
            return False, f"设备还有 {active} 个未完成检查，不能转入维护"
    old = device.status
    device.status = status
    device.maintenance_note = note if status == "维护中" else None
    audit(db, user, "device.status", device.id, f"设备状态：{old} → {status}" + (f" · {note}" if note else ""))
    db.commit()
    return True, serialize(device)


def utilization(db: Session, date: str) -> list[dict]:
    out = []
    for device in db.scalars(select(Device)).all():
        exams = db.scalars(select(Exam).where(Exam.device_id == device.id, Exam.date == date,
                                              Exam.status != "已取消")).all()
        used = sum(e.duration or 30 for e in exams)
        out.append({"device": serialize(device), "exams": len(exams),
                    "utilization": round(used / 600 * 100, 1)})
    return out
