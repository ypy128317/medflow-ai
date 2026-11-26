from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import DemoEventRequest
from ..security import require
from ..services import demo as svc

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/events")
def events(payload: DemoEventRequest, db: Session = Depends(get_db),
           user: User = Depends(require("plan.create"))):
    result = svc.simulate(db, user, payload.action)
    return result
