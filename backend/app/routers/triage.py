from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import TriageBookRequest, TriageRequest
from ..security import require
from ..services import triage as svc

router = APIRouter(prefix="/portal", tags=["patient-portal"])


@router.post("/triage")
def assess(payload: TriageRequest, db: Session = Depends(get_db),
           user: User = Depends(require("portal.use", portal=True))):
    if not payload.symptoms.strip():
        raise HTTPException(422, "请描述症状")
    return svc.assess(db, user, payload.age, payload.sex, payload.symptoms, payload.duration)


@router.post("/triage/book")
def book(payload: TriageBookRequest, db: Session = Depends(get_db),
         user: User = Depends(require("portal.use", portal=True))):
    ok, result = svc.book(db, user, payload.model_dump())
    if not ok:
        raise HTTPException(409, result)
    return {"ok": True, "appointment": result}

