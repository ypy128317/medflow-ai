from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Plan, Staff, StaffConflict, User
from ..schemas import StaffLeaveRequest, StaffSwapRequest
from ..security import get_current_user, require
from ..services import staff as svc
from ..services.common import serialize
from ..services.plans import plan_dict

router = APIRouter(tags=["staff"])


@router.get("/staff")
def list_staff(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [serialize(s) for s in db.scalars(select(Staff)).all()]


@router.get("/staff/conflicts")
def conflicts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [serialize(c) for c in db.scalars(select(StaffConflict)).all()]


@router.post("/staff/{staff_id}/leave")
def leave(staff_id: str, payload: StaffLeaveRequest, db: Session = Depends(get_db),
          user: User = Depends(require("staff.manage"))):
    ok, message = svc.request_leave(db, user, staff_id, payload.date, payload.reason)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message}


@router.post("/staff/{staff_id}/swap")
def swap(staff_id: str, payload: StaffSwapRequest, db: Session = Depends(get_db),
         user: User = Depends(require("staff.manage"))):
    ok, message = svc.swap_shift(db, user, staff_id, payload.date, payload.new_shift)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message}


@router.post("/staff/plans")
def create_plan(dept: str | None = None, db: Session = Depends(get_db),
                user: User = Depends(require("plan.create"))):
    plan, draft, error = svc.create_plan(db, user, dept)
    if error or not plan:
        raise HTTPException(409, error or "没有可执行的排班调整")
    return plan_dict(plan)


@router.get("/staff/plans")
def list_plans(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [plan_dict(p) for p in db.scalars(select(Plan).where(Plan.kind == "staff")).all()]
