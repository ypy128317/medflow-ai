from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Appointment, User
from ..security import require
from ..services import appointments as svc
from ..services.common import serialize

router = APIRouter(prefix="/portal", tags=["patient-portal"])


@router.get("/appointments")
def my_appointments(db: Session = Depends(get_db), user: User = Depends(require("portal.use", portal=True))):
    rows = db.scalars(select(Appointment).where(Appointment.patient_user_id == user.id)
                      .order_by(Appointment.date.desc(), Appointment.slot.desc())).all()
    return [serialize(a) for a in rows]


@router.post("/appointments/{appointment_id}/checkin")
def checkin(appointment_id: str, db: Session = Depends(get_db),
            user: User = Depends(require("portal.use", portal=True))):
    appt = db.get(Appointment, appointment_id)
    if not appt or appt.patient_user_id != user.id:
        raise HTTPException(404, "预约不存在")
    ok, result = svc.check_in(db, user, appointment_id)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.post("/appointments/{appointment_id}/cancel")
def cancel(appointment_id: str, reason: str = "患者取消", db: Session = Depends(get_db),
           user: User = Depends(require("portal.use", portal=True))):
    appt = db.get(Appointment, appointment_id)
    if not appt or appt.patient_user_id != user.id:
        raise HTTPException(404, "预约不存在")
    ok, result = svc.cancel_appointment(db, user, appointment_id, reason)
    if not ok:
        raise HTTPException(409, result)
    return result

