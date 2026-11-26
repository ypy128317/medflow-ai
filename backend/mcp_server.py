"""Standalone MedFlow MCP Server (stdio).

Run:
    cd backend
    python mcp_server.py

The server exposes read/validate/execute tools over the same SQLAlchemy domain
services. In production, run it as a separate process/container and restrict
network access with mTLS or a private service mesh.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Exam, Plan, Staff, User
from app.services.beds import execute_plan, validate_plan
from app.services.common import serialize
from app.services.exams import conflicts as exam_conflicts
from app.services.knowledge import search
from app.services.metrics import get_kpis, appointment_stats

mcp = FastMCP("MedFlow MCP", instructions="医院运营资源查询、校验与受控执行工具。写操作必须携带审批单。")


@mcp.tool()
def bed_read_snapshot(scope: str = "全院") -> dict:
    """读取床位、入院申请和占用快照。scope 可为科室 id 或 全院。"""
    with SessionLocal() as db:
        k = get_kpis(db)
        return {"scope": scope, "kpis": k}


@mcp.tool()
def bed_validate_plan(plan_id: str) -> dict:
    """执行前校验床位方案，返回阻断项和检查项。"""
    with SessionLocal() as db:
        plan = db.get(Plan, plan_id)
        if not plan:
            return {"valid": False, "blockers": ["审批单不存在"]}
        return validate_plan(db, plan.matched or [])


@mcp.tool()
def bed_allocate(plan_id: str, approver_id: str = "u-admin", comment: str = "MCP 审批执行") -> dict:
    """在审批通过后执行床位方案；失败会整单回滚。"""
    with SessionLocal() as db:
        plan = db.get(Plan, plan_id)
        user = db.get(User, approver_id)
        if not plan or not user:
            return {"ok": False, "error": "审批单或审批人不存在"}
        if plan.status != "待审批":
            return {"ok": False, "error": f"审批单状态为{plan.status}"}
        ok, errors, changed = execute_plan(db, plan, user, {"by": user.name, "comment": comment})
        return {"ok": ok, "errors": errors, "changed": changed, "plan": serialize(plan)}


@mcp.tool()
def exam_find_conflicts(date: str = "2026-11-06", device_id: str = "") -> list:
    """查询指定日期设备检查时段冲突。"""
    with SessionLocal() as db:
        return exam_conflicts(db, date, device_id or None)


@mcp.tool()
def staff_workload(dept_id: str = "") -> list:
    """读取人员班次、夜班数与负载。"""
    with SessionLocal() as db:
        query = select(Staff)
        if dept_id:
            query = query.where(Staff.department_id == dept_id)
        return [{"id": s.id, "name": s.name, "dept": s.department_id, "role": s.role,
                 "weekly_hours": s.weekly_hours, "night_shifts": s.night_shifts,
                 "workload": s.workload, "shifts": s.shifts} for s in db.scalars(query).all()]


@mcp.tool()
def kb_search(query: str, top_k: int = 4) -> list:
    """混合检索运营制度。"""
    with SessionLocal() as db:
        return search(db, query, top_k)


@mcp.tool()
def ops_kpi_snapshot() -> dict:
    """读取运营 KPI 与今日预约统计。"""
    with SessionLocal() as db:
        return {"kpis": get_kpis(db), "appointments": appointment_stats(db)}


if __name__ == "__main__":
    mcp.run()
