from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, User
from ..schemas import AlertHandleRequest
from ..security import get_current_user, require
from ..services import alerts as svc
from ..services.common import serialize

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(status: str | None = None, level: str | None = None,
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Alert).order_by(Alert.trigger_at.desc())
    if status and status != "all":
        query = query.where(Alert.status == status)
    if level:
        query = query.where(Alert.level == level)
    return [serialize(a) for a in db.scalars(query).all()]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"count": svc.unread_count(db, user)}


@router.post("/read")
def mark_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"marked": svc.mark_all_read(db, user), "count": svc.unread_count(db, user)}


@router.post("/refresh")
def refresh(db: Session = Depends(get_db), user: User = Depends(require("alert.handle"))):
    created = svc.evaluate(db, user)
    return {"added": len(created), "alerts": [serialize(a) for a in created]}


@router.post("/{alert_id}/handle")
def handle(alert_id: str, payload: AlertHandleRequest, db: Session = Depends(get_db),
           user: User = Depends(require("alert.handle"))):
    ok, message = svc.handle(db, user, alert_id, payload.status, payload.note)
    if not ok:
        raise HTTPException(404, message)
    return {"ok": True, "message": message}
