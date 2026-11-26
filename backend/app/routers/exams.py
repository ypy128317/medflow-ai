from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device, Exam, User
from ..schemas import DeviceStatusRequest, ExamCreateRequest
from ..security import get_current_user, require
from ..services import exams as svc
from ..services.common import serialize, today

router = APIRouter(tags=["exams"])


@router.get("/devices")
def devices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [serialize(d) for d in db.scalars(select(Device)).all()]


@router.get("/devices/utilization")
def utilization(date: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.utilization(db, date or today())


@router.post("/devices/{device_id}/status")
def device_status(device_id: str, payload: DeviceStatusRequest, db: Session = Depends(get_db),
                  user: User = Depends(require("equipment.manage"))):
    ok, result = svc.set_device_status(db, user, device_id, payload.status, payload.note)
    if not ok:
        raise HTTPException(409, result)
    return result


@router.get("/exams/conflicts")
def conflicts(date: str | None = None, device_id: str | None = None,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.conflicts(db, date or today(), device_id)


@router.get("/exams")
def list_exams(date: str | None = None, device_id: str | None = None, status: str | None = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Exam).where(Exam.date == (date or today())).order_by(Exam.start)
    if device_id:
        query = query.where(Exam.device_id == device_id)
    if status:
        query = query.where(Exam.status == status)
    return [serialize(e) for e in db.scalars(query).all()]


@router.get("/exams/free-slot")
def free_slot(device_id: str, date: str, duration: int = 30,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.find_free_slot(db, device_id, date, duration) or {}


@router.get("/exams/{exam_id}")
def exam(exam_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(Exam, exam_id)
    if not row:
        raise HTTPException(404, "检查不存在")
    return serialize(row)


@router.post("/exams")
def create(payload: ExamCreateRequest, db: Session = Depends(get_db),
           user: User = Depends(require("equipment.manage"))):
    ok, result = svc.create_exam(db, user, payload.model_dump())
    if not ok:
        raise HTTPException(409, result)
    return result


@router.post("/exams/{exam_id}/cancel")
def cancel(exam_id: str, reason: str = "", db: Session = Depends(get_db),
           user: User = Depends(require("equipment.manage"))):
    ok, result = svc.cancel_exam(db, user, exam_id, reason)
    if not ok:
        raise HTTPException(409, result)
    return result
