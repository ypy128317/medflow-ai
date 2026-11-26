from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Exam, Plan, User, WorkflowRun
from ..schemas import PlanDecisionRequest
from ..security import get_current_user, require
from ..services import plans as plan_service
from ..services import staff as staff_service
from ..services.beds import validate_plan as validate_bed
from ..services.common import now
from ..workflow import resume as resume_workflow

router = APIRouter(prefix="/approvals", tags=["approvals"])


def live_validation(db: Session, plan: Plan) -> dict:
    # Once a plan is processed, its snapshot should not be re-validated against
    # the mutated resources (the exam has moved / the bed is occupied by design).
    if plan.status != "待审批":
        archived = plan.validation or {}
        execution = plan.execution or {}
        if plan.status == "执行成功":
            valid, message = True, "方案已执行，执行前复核记录已归档。"
        elif plan.status == "已驳回":
            valid, message = True, "方案已驳回，未执行任何业务变更。"
        else:
            valid, message = False, "方案执行失败，事务已回滚。"
        return {"valid": valid, "blockers": execution.get("errors", []) if not valid else [],
                "checks": archived.get("checks", []), "archived": True, "message": message,
                "checked_at": (plan.approval or {}).get("at") or archived.get("checked_at") or now()}
    if plan.kind == "bed":
        return validate_bed(db, plan.matched or [])
    if plan.kind == "staff":
        return staff_service.validate_plan(db, plan.changes or [])
    if plan.kind == "equipment":
        blockers = []
        for c in plan.changes or []:
            exam_id = c.get("exam_id") or c.get("examId")
            exam = db.get(Exam, exam_id)
            if not exam:
                blockers.append("检查不存在")
                continue
            if exam.start != (c.get("expected_start") or c.get("expectedStart")):
                blockers.append(f"{exam.patient_name} 的原时段已变化")
            target_start, target_end = c.get("to", "-").split("-")
            conflict = db.scalar(select(Exam).where(
                Exam.id != exam.id, Exam.device_id == exam.device_id, Exam.date == exam.date,
                Exam.status != "已取消", Exam.start < target_end, Exam.end > target_start))
            if conflict:
                blockers.append(f"{exam.patient_name} 的目标时段已被占用")
        return {"valid": not blockers, "blockers": blockers, "checks": plan.validation.get("checks", []),
                "checked_at": now()}
    return plan.validation or {"valid": True, "blockers": [], "checks": [], "checked_at": now()}


@router.get("")
def list_plans(status: str | None = None, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    plans = plan_service.list_plans(db, status)
    return [plan_service.plan_dict(p) for p in plans]


@router.get("/{plan_id}")
def detail(plan_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "审批单不存在")
    data = plan_service.plan_dict(plan)
    data["live_validation"] = live_validation(db, plan)
    return data


@router.post("/{plan_id}/decision")
def decision(plan_id: str, payload: PlanDecisionRequest, db: Session = Depends(get_db),
             user: User = Depends(require("approval.decide"))):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "审批单不存在")
    if payload.decision not in ("approve", "reject"):
        raise HTTPException(422, "decision 必须为 approve 或 reject")
    if payload.decision == "reject" and len(payload.comment.strip()) < 2:
        raise HTTPException(422, "驳回必须填写审批意见")
    if plan.status != "待审批":
        raise HTTPException(409, f"该审批单已处理：{plan.status}")

    workflow = None
    if plan.kind == "bed" and plan.workflow_id:
        run = db.get(WorkflowRun, plan.workflow_id)
        if run and run.status == "awaiting_approval":
            workflow = resume_workflow(plan.workflow_id, payload.decision, payload.comment, user.id)
            db.expire_all()
            plan = db.get(Plan, plan_id)
            if plan and plan.status != "待审批":
                if plan.status == "执行失败":
                    raise HTTPException(409, (plan.execution or {}).get("detail", "方案执行失败，已回滚"))
                message = "已驳回，业务数据未发生变更。" if plan.status == "已驳回" else \
                    (plan.execution or {}).get("detail", "执行成功")
                return {"ok": plan.status in ("执行成功", "已驳回"), "message": message,
                        "plan": plan_service.plan_dict(plan), "workflow": workflow,
                        "live_validation": live_validation(db, plan)}
            # checkpoint lost / graph did not execute: fall through to direct service

    ok, message, plan = plan_service.decide(db, plan, user, payload.decision, payload.comment)
    if not ok:
        raise HTTPException(409, message)
    return {"ok": True, "message": message, "plan": plan_service.plan_dict(plan),
            "live_validation": live_validation(db, plan)}
