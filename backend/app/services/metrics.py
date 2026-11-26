"""Operational KPI and analytics queries."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (Admission, Alert, Appointment, Bed, BedWaitlist, Department, Device, Exam, Plan,
                      Staff, Waitlist)
from .common import DEMO_DATE, DEMO_NOW, add_days, minutes, now, parse_date_time, round1, today


def bed_counts(db: Session) -> dict[str, int]:
    rows = db.execute(select(Bed.status, func.count()).group_by(Bed.status)).all()
    counts = {status: count for status, count in rows}
    for key in ("空闲", "已入住", "待清洁", "维护中", "已预留", "暂停使用"):
        counts.setdefault(key, 0)
    return counts


def equipment_utilization(db: Session, date: str) -> float:
    active = db.scalars(select(Device).where(Device.status != "维护中")).all()
    active_ids = {d.id for d in active}
    used = sum(e.duration or 30 for e in db.scalars(select(Exam).where(Exam.date == date)).all()
               if e.status != "已取消" and e.device_id in active_ids)
    capacity = max(1, len(active) * 600)
    return round1(used / capacity * 100)


def get_kpis(db: Session) -> dict:
    counts = bed_counts(db)
    total = sum(counts.values())
    occupied = counts.get("已入住", 0)
    free = counts.get("空闲", 0)
    today_appts = db.scalars(select(Appointment).where(Appointment.date == today())).all()
    valid = [a for a in today_appts if a.status != "已取消"]
    visits = [a for a in today_appts if a.status in ("已完成", "已签到")]
    completed = [a for a in today_appts if a.status == "已完成" and a.wait_minutes > 0]
    pending_admissions = db.scalar(select(func.count()).select_from(Admission).where(Admission.status == "待分配")) or 0
    pending_approvals = db.scalar(select(func.count()).select_from(Plan).where(Plan.status == "待审批")) or 0
    open_alerts = db.scalars(select(Alert).where(Alert.status.in_(["待处理", "处理中"]))).all()
    high_alerts = sum(1 for a in open_alerts if a.level in ("高", "紧急"))
    los = []
    now_dt = parse_date_time(now())
    for bed in db.scalars(select(Bed).where(Bed.status == "已入住")).all():
        admitted = parse_date_time(bed.occupied_at)
        if admitted and now_dt:
            los.append(max(0, (now_dt - admitted).total_seconds() / 86400))
    waitlist = db.scalar(select(func.count()).select_from(Waitlist).where(Waitlist.status == "等待中")) or 0
    bed_waitlist = db.scalar(select(func.count()).select_from(BedWaitlist).where(
        BedWaitlist.status == "候补中")) or 0
    return {
        "total_beds": total,
        "occupied": occupied,
        "free": free,
        "cleaning": counts.get("待清洁", 0),
        "maintenance": counts.get("维护中", 0) + counts.get("暂停使用", 0),
        "reserved": counts.get("已预留", 0),
        "occupancy": round1(occupied / total * 100) if total else 0,
        "today_appointments": len(today_appts),
        "valid_appointments": len(valid),
        "canceled": len(today_appts) - len(valid),
        "visits": len(visits),
        "completed": len(completed),
        "pre_discharge": db.scalar(select(func.count()).select_from(Bed).where(
            Bed.status == "已入住", Bed.expected_discharge == today())) or 0,
        "avg_wait": round(sum(a.wait_minutes for a in completed) / len(completed)) if completed else 0,
        "alos": round1(sum(los) / len(los)) if los else 0,
        "waitlist": waitlist,
        "bed_waitlist": bed_waitlist,
        "equipment_utilization": equipment_utilization(db, today()),
        "pending_admissions": pending_admissions,
        "pending_approvals": pending_approvals,
        "pending_tasks": pending_approvals,
        "open_alerts": len(open_alerts),
        "high_alerts": high_alerts,
    }


def dept_stats(db: Session) -> list[dict]:
    departments = db.scalars(select(Department)).all()
    out = []
    for dept in departments:
        beds = db.scalars(select(Bed).where(Bed.department_id == dept.id)).all()
        occupied = sum(1 for b in beds if b.status == "已入住")
        free = sum(1 for b in beds if b.status == "空闲")
        appts = db.scalars(select(Appointment).where(
            Appointment.department_id == dept.id, Appointment.date == today(),
            Appointment.status != "已取消")).all()
        pending = db.scalar(select(func.count()).select_from(Admission).where(
            Admission.department_id == dept.id, Admission.status == "待分配")) or 0
        waits = [a.wait_minutes for a in appts if a.wait_minutes > 0]
        out.append({
            "id": dept.id, "name": dept.name, "short": dept.short_name, "color": dept.color,
            "total_beds": len(beds), "occupied": occupied, "free": free,
            "occupancy": round1(occupied / len(beds) * 100) if beds else 0,
            "appointments": len(appts), "pending": pending,
            "avg_wait": round(sum(waits) / len(waits)) if waits else 0,
            "risk": "high" if pending > free else ("medium" if free <= 2 else "low"),
        })
    return sorted(out, key=lambda x: x["appointments"], reverse=True)


def appointment_stats(db: Session, date: str | None = None) -> dict:
    d = date or today()
    appts = db.scalars(select(Appointment).where(Appointment.date == d)).all()
    by_dept = defaultdict(lambda: {"total": 0, "valid": 0, "canceled": 0})
    for a in appts:
        row = by_dept[a.department_id]
        row["total"] += 1
        if a.status == "已取消":
            row["canceled"] += 1
        else:
            row["valid"] += 1
    waited = [a.wait_minutes for a in appts if a.wait_minutes > 0]
    return {
        "date": d, "total": len(appts),
        "valid": sum(1 for a in appts if a.status != "已取消"),
        "canceled": sum(1 for a in appts if a.status == "已取消"),
        "visited": sum(1 for a in appts if a.status in ("已完成", "已签到")),
        "avg_wait": round(sum(waited) / len(waited)) if waited else 0,
        "cancel_rate": round1(sum(1 for a in appts if a.status == "已取消") / len(appts) * 100) if appts else 0,
        "by_dept": [{"dept": k, **v} for k, v in by_dept.items()],
    }


def forecast_beds(db: Session, days: int = 3) -> dict:
    target = add_days(today(), days)
    rows = []
    for dept in db.scalars(select(Department)).all():
        beds = db.scalars(select(Bed).where(Bed.department_id == dept.id)).all()
        occupied = sum(1 for b in beds if b.status == "已入住")
        free = sum(1 for b in beds if b.status == "空闲")
        pending = db.scalar(select(func.count()).select_from(Admission).where(
            Admission.department_id == dept.id, Admission.status == "待分配")) or 0
        discharges = sum(1 for b in beds if b.status == "已入住" and b.expected_discharge and b.expected_discharge <= target)
        projected_occupied = max(0, min(len(beds), occupied + pending - discharges))
        projected = round1(projected_occupied / len(beds) * 100) if beds else 0
        risk = "紧急" if projected >= 95 else ("高" if projected >= 90 else ("中" if projected >= 85 else "低"))
        rows.append({
            "dept": dept.id, "dept_name": dept.name, "color": dept.color,
            "total": len(beds), "occupied": occupied, "free": free, "pending": pending,
            "discharges": discharges, "projected": projected, "risk": risk,
            "gap": max(0, pending - free),
            "reason": f"未来 {days} 天预计出院 {discharges} 人，待入院 {pending} 人",
        })
    return {"horizon": days, "target": target, "rows": sorted(rows, key=lambda r: r["projected"], reverse=True)}


def ops_overview(db: Session) -> dict:
    k = get_kpis(db)
    counts = bed_counts(db)
    return {
        "kpis": k,
        "bed_status": [{"status": s, "count": c} for s, c in counts.items()],
        "departments": dept_stats(db),
        "appointments": appointment_stats(db),
        "forecast": forecast_beds(db, 3),
    }
