from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, WorkflowRun
from ..schemas import AITaskRequest
from ..security import can, get_current_user
from ..services.llm import qwen
from ..workflow import parse_intent, start, _run_dict

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status")
def ai_status(user: User = Depends(get_current_user)):
    return qwen.status()


@router.post("/tasks")
def create_task(payload: AITaskRequest, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    intent, _ = parse_intent(payload.prompt)
    if intent == "bed_schedule" and not can(user, "plan.create"):
        raise HTTPException(403, "当前角色无发起床位调度方案的权限")
    result = start(payload.prompt, user.id)
    return result


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    runs = db.scalars(select(WorkflowRun).order_by(WorkflowRun.created_at.desc())).all()
    return [_run_dict(r) for r in runs]


@router.get("/tasks/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    run = db.get(WorkflowRun, task_id)
    if not run:
        raise HTTPException(404, "任务不存在")
    return _run_dict(run)
