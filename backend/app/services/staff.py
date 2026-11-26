"""Staff scheduling, leave/swap and staff plan domain service."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Department, Plan, Staff, StaffConflict, User
from .common import add_days, audit, now, serialize, today

SHIFT_HOURS = {"早": 8, "中": 8, "夜": 8, "白": 9.5, "休": 0}


def rest_errors(staff: Staff, date: str, new_shift: str) -> list[str]:
    shifts = staff.shifts or {}
    errors = []
    if new_shift not in SHIFT_HOURS:
        errors.append(f"班次代码无效：{new_shift}")
    prev = shifts.get(add_days(date, -1))
    nxt = shifts.get(add_days(date, 1))
    if new_shift == "早" and prev == "夜":
        errors.append("前一日夜班后接早班，休息间隔不足 11 小时")
    if new_shift == "中" and prev == "夜":
        errors.append("前一日夜班后接中班，休息间隔不足 11 小时")
    if new_shift == "夜" and nxt == "早":
        errors.append("夜班后次日早班，休息间隔不足 11 小时")
    return errors


def recalc(staff: Staff) -> None:
    values = list((staff.shifts or {}).values())
    work_days = sum(1 for v in values if v != "休")
    nights = sum(1 for v in values if v == "夜")
    staff.work_days = work_days
    staff.night_shifts = nights
    staff.weekly_hours = round(sum(SHIFT_HOURS.get(v, 0) for v in values), 1)
    staff.workload = min(98, 52 + work_days * 5 + nights * 6)


def request_leave(db: Session, user: User, staff_id: str, date: str, reason: str = "") -> tuple[bool, str]:
    staff = db.get(Staff, staff_id)
    if not staff:
        return False, "人员不存在"
    if date not in (staff.shifts or {}):
        return False, "该日期不在排班周期内"
    if staff.shifts[date] == "休":
        return False, "该人员当天已经是休息"
    old = staff.shifts[date]
    shifts = dict(staff.shifts or {})
    shifts[date] = "休"
    staff.shifts = shifts
    recalc(staff)
    audit(db, user, "staff.leave", staff.id, f"请假登记：{staff.name} {date} {old} → 休")
    db.commit()
    return True, f"{staff.name} {date} 已登记请假"


def swap_shift(db: Session, user: User, staff_id: str, date: str, new_shift: str) -> tuple[bool, str]:
    staff = db.get(Staff, staff_id)
    if not staff:
        return False, "人员不存在"
    if date not in (staff.shifts or {}):
        return False, "该日期不在排班周期内"
    old = staff.shifts[date]
    if old == new_shift:
        return False, "新旧班次相同"
    errors = rest_errors(staff, date, new_shift)
    if errors:
        return False, "；".join(errors)
    shifts = dict(staff.shifts or {})
    shifts[date] = new_shift
    staff.shifts = shifts
    recalc(staff)
    audit(db, user, "staff.swap", staff.id, f"调班：{staff.name} {date} {old} → {new_shift}")
    db.commit()
    return True, f"{staff.name} {date} 已由 {old} 调为 {new_shift}"


def build_plan(db: Session, dept_id: str | None = None) -> dict:
    query = select(StaffConflict)
    if dept_id:
        query = query.where(StaffConflict.department_id == dept_id)
    conflicts = db.scalars(query).all()
    changes = []
    seen = set()
    for c in conflicts:
        if not c.date or not c.from_shift or not c.to_shift:
            continue
        key = (c.staff_id, c.date)
        if key in seen:
            continue
        seen.add(key)
        staff = db.get(Staff, c.staff_id)
        if not staff:
            continue
        changes.append({"staff_id": staff.id, "staff_name": staff.name, "dept": staff.department_id,
                        "dept_name": staff.department_name, "date": c.date,
                        "from_shift": c.from_shift, "to_shift": c.to_shift,
                        "expected_from": c.from_shift, "conflict_id": c.id,
                        "reason": f"{c.conflict_type}：{c.detail}"})
    dept = db.get(Department, dept_id) if dept_id else None
    scope = dept.name if dept else "全院"
    draft = {"kind": "staff", "scope": scope, "title": f"{scope}医护排班调整方案",
             "summary": f"针对 {len(conflicts)} 条排班冲突，提出 {len(changes)} 条调整建议；不自动发布，需授权管理员审批。",
             "changes": changes, "conflicts": [{"id": c.id, "staff_name": c.staff_name,
                                                  "type": c.conflict_type} for c in conflicts],
             "snapshot": {"conflicts": len(conflicts), "affected": len(changes), "scope": scope},
             "rationale": ["夜班结束后至下一班开始至少 11 小时。", "调整不改变岗位与技能要求。",
                           "最终排班必须由授权管理员确认后发布。"],
             "generated_at": now()}
    draft["validation"] = validate_plan(db, changes)
    return draft


def validate_plan(db: Session, changes: list[dict]) -> dict:
    blockers = []
    if not changes:
        blockers.append("方案中没有可执行的排班调整")
    for c in changes:
        staff = db.get(Staff, c["staff_id"])
        if not staff:
            blockers.append(f"人员不存在：{c['staff_id']}")
            continue
        if (staff.shifts or {}).get(c["date"]) != c["expected_from"]:
            blockers.append(f"{staff.name} 在 {c['date']} 的班次已变化")
        blockers.extend(f"{staff.name}：{e}" for e in rest_errors(staff, c["date"], c["to_shift"]))
    return {"valid": not blockers, "blockers": list(dict.fromkeys(blockers)),
            "checks": [
                {"name": "班次快照", "pass": not any("已变化" in b for b in blockers), "detail": f"{len(changes)} 条调整"},
                {"name": "夜班 11 小时间隔", "pass": not any("11 小时" in b for b in blockers), "detail": "调整后休息间隔符合规则"},
                {"name": "发布前复核", "pass": not blockers, "detail": "可提交审批" if not blockers else "存在阻断"},
            ], "checked_at": now()}


def create_plan(db: Session, user: User, dept_id: str | None, prompt: str = "") -> tuple[Plan | None, dict, str | None]:
    draft = build_plan(db, dept_id)
    if not draft["changes"]:
        return None, draft, "当前没有需要调整的排班冲突"
    existing = db.scalar(select(Plan).where(Plan.kind == "staff", Plan.status == "待审批", Plan.scope == draft["scope"]))
    if existing:
        return existing, draft, None
    count = db.scalar(select(func.count()).select_from(Plan).where(Plan.kind == "staff")) or 0
    plan = Plan(id=f"SP-{today().replace('-', '')}-{count + 1:03d}", kind="staff", title=draft["title"],
                scope=draft["scope"], status="待审批", version=1, summary=draft["summary"],
                snapshot=draft["snapshot"], changes=draft["changes"], conflicts=draft["conflicts"],
                validation=draft["validation"], rationale=draft["rationale"], created_at=now(),
                created_by="MedFlow Coordinator", created_by_name=user.name,
                department_id=dept_id, approval={}, execution={})
    db.add(plan)
    audit(db, user, "plan.create", plan.id, f"创建{draft['scope']}排班调整方案，变更 {len(draft['changes'])} 条")
    db.commit()
    db.refresh(plan)
    return plan, draft, None


def execute_plan(db: Session, plan: Plan, user: User, approval: dict) -> tuple[bool, list[str], int]:
    live = validate_plan(db, plan.changes or [])
    if not live["valid"]:
        return False, live["blockers"], 0
    try:
        for c in plan.changes or []:
            staff = db.get(Staff, c["staff_id"])
            if not staff or (staff.shifts or {}).get(c["date"]) != c["expected_from"]:
                raise ValueError(f"人员 {c.get('staff_name')} 班次已变化")
            shifts = dict(staff.shifts or {})
            shifts[c["date"]] = c["to_shift"]
            staff.shifts = shifts
            recalc(staff)
            conflict = db.get(StaffConflict, c.get("conflict_id"))
            if conflict:
                db.delete(conflict)
        plan.status = "执行成功"
        plan.approval = approval
        plan.execution = {"at": now(), "result": "success", "count": len(plan.changes or []),
                          "detail": f"Staff MCP 已发布 {len(plan.changes or [])} 条排班调整，事务提交成功"}
        audit(db, user, "plan.approve", plan.id, plan.execution["detail"])
        audit(db, None, "mcp.staff.publish", plan.id, plan.execution["detail"])
        db.commit()
        return True, [], len(plan.changes or [])
    except Exception as exc:
        db.rollback()
        return False, [str(exc)], 0
