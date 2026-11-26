from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Appointment, Doctor, User, Waitlist
from ..schemas import AppointmentCreateRequest, RescheduleRequest, WaitlistCreateRequest
from ..security import get_current_user, require
from ..services import appointments as svc
from ..services.common import serialize, today

router = APIRouter(tags=["appointments"])


@router.get("/doctors")
def doctors(dept: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Doctor)
    if dept:
        query = query.where(Doctor.department_id == dept)
    return [serialize(d) for d in db.scalars(query).all()]


@router.get("/appointments")
def list_appointments(date: str | None = None, status: str | None = None, dept: str | None = None,
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Appointment).where(Appointment.date == (date or today())).order_by(Appointment.slot)
    if status:
        query = query.where(Appointment.status == status)
    if dept:
        query = query.where(Appointment.department_id == dept)
    return [serialize(a) for a in db.scalars(query).all()]


@router.get("/appointments/slots/{doctor_id}")
def slots(doctor_id: str, date: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.available_slots(db, doctor_id, date)


@router.get("/appointments/recommend")
def recommend(dept: str | None = None, date: str | None = None, patient_name: str = "",
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.recommend_slots(db, dept, date or today(), patient_name)


@router.post("/appointments")
def create(payload: AppointmentCreateRequest, db: Session = Depends(get_db),
           user: User = Depends(require("appointment.manage"))):
    ok, result = svc.create_appointment(db, user, payload.model_dump())
    if not ok:
        raise HTTPException(409, result)
    return result


@router.post("/appointments/{appointment_id}/checkin")
def checkin(appointment_id: str, db: Session = Depends(get_db),
            user: User = Depends(require("appointment.manage"))):
    ok, result = svc.check_in(db, user, appointment_id)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.post("/appointments/{appointment_id}/complete")
def complete(appointment_id: str, db: Session = Depends(get_db),
             user: User = Depends(require("appointment.manage"))):
    ok, result = svc.complete(db, user, appointment_id)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.post("/appointments/{appointment_id}/reschedule")
def reschedule(appointment_id: str, payload: RescheduleRequest, db: Session = Depends(get_db),
               user: User = Depends(require("appointment.manage"))):
    ok, result = svc.reschedule(db, user, appointment_id, payload.date, payload.slot)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.post("/appointments/{appointment_id}/cancel")
def cancel(appointment_id: str, reason: str = "", db: Session = Depends(get_db),
           user: User = Depends(require("appointment.manage"))):
    ok, result = svc.cancel_appointment(db, user, appointment_id, reason)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.get("/appointments/waitlist")
def waitlist(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Waitlist).order_by(Waitlist.registered_at)).all()
    return [serialize(w) for w in rows]


@router.post("/appointments/waitlist")
def add_waitlist(payload: WaitlistCreateRequest, db: Session = Depends(get_db),
                 user: User = Depends(require("appointment.manage"))):
    ok, result = svc.add_waitlist(db, user, payload.model_dump())
    if not ok:
        raise HTTPException(409, result)
    return result


@router.post("/appointments/waitlist/{entry_id}/promote")
def promote(entry_id: str, db: Session = Depends(get_db),
            user: User = Depends(require("appointment.manage"))):
    ok, result = svc.promote_waitlist(db, user, entry_id)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.delete("/appointments/waitlist/{entry_id}")
def remove(entry_id: str, db: Session = Depends(get_db),
           user: User = Depends(require("appointment.manage"))):
    ok, result = svc.remove_waitlist(db, user, entry_id)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.get("/appointments/{appointment_id}")
def get_appointment(appointment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(Appointment, appointment_id)
    if not row:
        raise HTTPException(404, "预约不存在")
    return serialize(row)
