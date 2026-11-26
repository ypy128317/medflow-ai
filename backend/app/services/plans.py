"""Approval plan queries and non-bed plan execution."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Exam, Plan, User
from .beds import execute_plan as execute_bed_plan, reject_plan, validate_plan as validate_bed_plan
from .common import audit, minutes, now, serialize
from .staff import execute_plan as execute_staff_plan


def plan_dict(plan: Plan) -> dict:
    data = serialize(plan)
    # Return both DB names and API-friendly aliases used by the existing demo.
    data["createdAt"] = plan.created_at
    data["createdByName"] = plan.created_by_name
    return data


def get_plan(db: Session, plan_id: str) -> Plan | None:
    return db.get(Plan, plan_id)


def list_plans(db: Session, status: str | None = None) -> list[Plan]:
    query = select(Plan).order_by(Plan.created_at.desc())
    if status:
        query = query.where(Plan.status == status)
    return list(db.scalars(query).all())


def _exam_id(change: dict) -> str:
    return change.get("exam_id") or change.get("examId") or ""


def _expected_start(change: dict) -> str:
    return change.get("expected_start") or change.get("expectedStart") or ""


def execute_equipment_plan(db: Session, plan: Plan, user: User, approval: dict) -> tuple[bool, list[str], int]:
    try:
        prepared = []
        for change in plan.changes or []:
            exam_id = _exam_id(change)
            exam = db.get(Exam, exam_id)
            if not exam:
                raise ValueError(f"检查不存在：{exam_id}")
            if exam.start != _expected_start(change):
                raise ValueError(f"{exam.patient_name} 的原检查时段已变化")
            if exam.status in ("已完成", "进行中"):
                raise ValueError(f"{exam.patient_name} 的检查已开始或完成")
            target_start, target_end = change["to"].split("-")
            conflict = db.scalar(select(Exam).where(
                Exam.id != exam.id, Exam.device_id == exam.device_id, Exam.date == exam.date,
                Exam.status != "已取消", Exam.start < target_end, Exam.end > target_start))
            if conflict:
                raise ValueError(f"{exam.patient_name} 的目标时段已被占用")
            prepared.append((exam, change))
        for exam, change in prepared:
            exam.start, exam.end = change["to"].split("-")
            exam.note = ((exam.note or "") + " · 由 AI 调度方案调整时段").strip()
        plan.status = "执行成功"
        plan.approval = approval
        plan.execution = {"at": now(), "result": "success", "count": len(prepared),
                          "detail": f"Equipment MCP 已调整 {len(prepared)} 个检查时段，事务提交成功"}
        audit(db, user, "plan.approve", plan.id, plan.execution["detail"])
        audit(db, None, "mcp.exam.reschedule", plan.id, plan.execution["detail"])
        db.commit()
        return True, [], len(prepared)
    except Exception as exc:
        db.rollback()
        return False, [str(exc)], 0


def decide(db: Session, plan: Plan, user: User, decision: str, comment: str = "") -> tuple[bool, str, Plan]:
    if plan.status != "待审批":
        return False, f"该审批单已处理：{plan.status}", plan
    approval = {"by": user.name, "role": user.role_name, "at": now(),
                "comment": comment or ("同意，按方案执行。" if decision == "approve" else "")}
    if decision == "reject":
        reject_plan(db, plan, user, approval)
        return True, "已驳回，业务数据未发生变更。", plan
    if decision != "approve":
        return False, "decision 必须为 approve 或 reject", plan

    if plan.kind == "bed":
        ok, errors, changed = execute_bed_plan(db, plan, user, approval)
    elif plan.kind == "equipment":
        ok, errors, changed = execute_equipment_plan(db, plan, user, approval)
    elif plan.kind == "staff":
        ok, errors, changed = execute_staff_plan(db, plan, user, approval)
    else:
        ok, errors, changed = False, ["暂不支持的方案类型"], 0

    if not ok:
        plan.status = "执行失败"
        plan.approval = approval
        plan.execution = {"at": now(), "result": "failed", "count": 0,
                          "detail": "执行前复核失败，事务已回滚", "errors": errors}
        audit(db, user, "plan.execute_failed", plan.id, "执行失败：" + "；".join(errors))
        db.commit()
        return False, "执行前复核失败，已整单回滚：" + "；".join(errors), plan
    db.refresh(plan)
    return True, plan.execution.get("detail", "执行成功"), plan
