from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Admission, Bed, User, Ward
from ..schemas import BedAssignRequest
from ..security import get_current_user, require
from ..services.beds import discharge, finish_cleaning, manual_assign, set_maintenance
from ..services.common import serialize
from ..services.metrics import bed_counts, forecast_beds

router = APIRouter(tags=["beds"])


def bed_payload(db: Session, bed: Bed) -> dict:
    data = serialize(bed)
    ward = db.get(Ward, bed.ward_id)
    data["ward_name"] = ward.name if ward else bed.ward_name
    return data


@router.get("/beds")
def list_beds(dept: str | None = None, status: str | None = None, q: str | None = None,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Bed).order_by(Bed.ward_id, Bed.id)
    if dept:
        query = query.where(Bed.department_id == dept)
    if status:
        query = query.where(Bed.status == status)
    if q:
        query = query.where((Bed.code.contains(q)) | (Bed.patient_name.contains(q)))
    return {"counts": bed_counts(db), "beds": [bed_payload(db, b) for b in db.scalars(query).all()]}


@router.get("/beds/waitlist")
def bed_waitlist(dept: str | None = None, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    from ..services.beds import list_waitlist
    return [serialize(w) for w in list_waitlist(db, dept)]


@router.delete("/beds/waitlist/{entry_id}")
def cancel_bed_waitlist(entry_id: str, db: Session = Depends(get_db),
                        user: User = Depends(require("bed.manage"))):
    from ..services.beds import cancel_waitlist
    ok, message = cancel_waitlist(db, user, entry_id)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message}


@router.get("/beds/{bed_id}")
def get_bed(bed_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    bed = db.get(Bed, bed_id)
    if not bed:
        raise HTTPException(404, "床位不存在")
    return bed_payload(db, bed)


@router.post("/beds/{bed_id}/assign")
def assign(bed_id: str, payload: BedAssignRequest, db: Session = Depends(get_db),
           user: User = Depends(require("bed.manage"))):
    ok, message = manual_assign(db, user, payload.admission_id, bed_id)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message, "bed": bed_payload(db, db.get(Bed, bed_id))}


@router.post("/beds/{bed_id}/discharge")
def bed_discharge(bed_id: str, db: Session = Depends(get_db), user: User = Depends(require("bed.manage"))):
    ok, message = discharge(db, user, bed_id)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message}


@router.post("/beds/{bed_id}/cleaning/complete")
def cleaning(bed_id: str, db: Session = Depends(get_db), user: User = Depends(require("bed.manage"))):
    ok, message = finish_cleaning(db, user, bed_id)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message}


@router.post("/beds/{bed_id}/maintenance")
def maintenance(bed_id: str, note: str = "", db: Session = Depends(get_db),
                user: User = Depends(require("bed.manage"))):
    ok, message = set_maintenance(db, user, bed_id, note)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message}


@router.post("/beds/{bed_id}/restore")
def restore(bed_id: str, db: Session = Depends(get_db), user: User = Depends(require("bed.manage"))):
    ok, message = set_maintenance(db, user, bed_id, "", restore=True)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message}


@router.get("/admissions")
def admissions(status: str | None = None, dept: str | None = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Admission).order_by(Admission.applied_at)
    if status:
        query = query.where(Admission.status == status)
    if dept:
        query = query.where(Admission.department_id == dept)
    return [serialize(a) for a in db.scalars(query).all()]


@router.get("/admissions/{admission_id}")
def admission(admission_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(Admission, admission_id)
    if not row:
        raise HTTPException(404, "入院申请不存在")
    return serialize(row)


@router.get("/forecast")
def bed_forecast(days: int = 3, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return forecast_beds(db, days)
