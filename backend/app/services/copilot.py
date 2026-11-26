"""Qwen function-calling operations Copilot.

The model can inspect data and create *pending* plans, but it cannot approve or
execute anything. All numbers come from tool results, never from the model.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Admission, Alert, Bed, BedWaitlist, StaffConflict, User
from ..security import can
from .appointments import recommend_slots
from .beds import build_plan, create_plan
from .common import serialize, today
from .exams import conflicts as exam_conflicts
from .knowledge import search
from .llm import qwen
from .metrics import dept_stats, forecast_beds, get_kpis

SESSIONS: dict[str, list[dict]] = {}

TOOLS = [
    {"type": "function", "function": {
        "name": "ops_overview",
        "description": "读取全院运营 KPI、科室排名和未来三天床位压力。用于总体运营分析。",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "bed_snapshot",
        "description": "读取床位供应、待入院人数和床位候补人数。按科室过滤时传 dept。",
        "parameters": {"type": "object", "properties": {
            "dept": {"type": "string", "description": "科室 id：ortho/cardio/neuro/resp/gs/onco/peds"},
        }},
    }},
    {"type": "function", "function": {
        "name": "create_bed_plan",
        "description": "为指定科室或全院生成床位调度方案草稿。只创建待审批方案，不执行分配。仅当用户明确要求制定/生成/分配床位方案时调用。",
        "parameters": {"type": "object", "properties": {
            "dept": {"type": "string", "description": "科室 id；不传表示全院"},
        }},
    }},
    {"type": "function", "function": {
        "name": "appointment_slots",
        "description": "查询科室可用医生和号源，用于预约建议。",
        "parameters": {"type": "object", "properties": {
            "dept": {"type": "string", "description": "科室 id"},
            "date": {"type": "string", "description": "YYYY-MM-DD，默认今天"},
        }},
    }},
    {"type": "function", "function": {
        "name": "exam_conflicts",
        "description": "查询指定日期的检查设备时段冲突。",
        "parameters": {"type": "object", "properties": {
            "date": {"type": "string", "description": "YYYY-MM-DD，默认今天"},
        }},
    }},
    {"type": "function", "function": {
        "name": "staff_conflicts",
        "description": "查询当前医护排班冲突和夜班后休息不足。",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "recent_alerts",
        "description": "读取待处理运营预警。",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "kb_search",
        "description": "检索医院运营制度、床位规则、预约规则、排班规则。",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "检索关键词"},
        }, "required": ["query"]},
    }},
]


def _plan_payload(plan) -> dict:
    return {"plan_id": plan.id, "status": plan.status, "scope": plan.scope,
            "summary": plan.summary, "matched": len(plan.matched or []),
            "unmatched": len(plan.unmatched or []), "requires_approval": True}


def _execute_tool(name: str, args: dict, db: Session, user: User) -> tuple[dict, str | None]:
    try:
        if name == "ops_overview":
            k = get_kpis(db)
            return {"kpis": k, "departments": dept_stats(db)[:5],
                    "forecast": forecast_beds(db, 3)["rows"][:5]}, None
        if name == "bed_snapshot":
            dept = args.get("dept")
            query = select(Bed)
            if dept:
                query = query.where(Bed.department_id == dept)
            beds = db.scalars(query).all()
            pending_query = select(func.count()).select_from(Admission).where(Admission.status == "待分配")
            wait_query = select(func.count()).select_from(BedWaitlist).where(BedWaitlist.status == "候补中")
            if dept:
                pending_query = pending_query.where(Admission.department_id == dept)
                wait_query = wait_query.where(BedWaitlist.department_id == dept)
            return {"dept": dept or "全院", "total": len(beds),
                    "free": sum(1 for b in beds if b.status == "空闲"),
                    "occupied": sum(1 for b in beds if b.status == "已入住"),
                    "cleaning": sum(1 for b in beds if b.status == "待清洁"),
                    "pending_admissions": db.scalar(pending_query) or 0,
                    "bed_waitlist": db.scalar(wait_query) or 0}, None
        if name == "create_bed_plan":
            if not can(user, "plan.create"):
                return {"error": "当前角色没有发起床位方案的权限"}, "当前角色没有发起床位方案的权限"
            plan, draft, error = create_plan(db, user, args.get("dept") or None, "Copilot 生成")
            if error or not plan:
                return {"error": error or "当前没有可执行的床位分配"}, error
            return _plan_payload(plan), None
        if name == "appointment_slots":
            rows = recommend_slots(db, args.get("dept") or None, args.get("date") or today())
            return {"date": args.get("date") or today(), "slots": rows[:4]}, None
        if name == "exam_conflicts":
            rows = exam_conflicts(db, args.get("date") or today())
            return {"date": args.get("date") or today(), "conflicts": rows[:5]}, None
        if name == "staff_conflicts":
            rows = db.scalars(select(StaffConflict)).all()
            return {"conflicts": [serialize(r) for r in rows[:8]]}, None
        if name == "recent_alerts":
            rows = db.scalars(select(Alert).where(Alert.status.in_(["待处理", "处理中"]))).all()
            return {"alerts": [{"id": a.id, "level": a.level, "title": a.title,
                                 "status": a.status, "department": a.department_name}
                                for a in rows[:8]]}, None
        if name == "kb_search":
            rows = search(db, args.get("query", ""), 3)
            return {"results": [{"title": r["title"], "heading": r["heading"],
                                  "content": r["content"][:300], "chunk_id": r["chunk_id"]}
                                 for r in rows]}, None
        return {"error": f"未知工具：{name}"}, f"未知工具：{name}"
    except Exception as exc:
        return {"error": str(exc)}, str(exc)


SYSTEM_PROMPT = """你是 MedFlow AI 的医院运营 Copilot，服务对象是医院内部运营人员。
你可以调用工具读取实时数据，也可以创建待审批的床位方案草稿，但不能审批、执行、分配床位或修改排班。

规则：
1. 所有数字必须来自工具结果，禁止编造。
2. 用户只问情况时，先查数据再回答，不要自动创建方案。
3. 用户明确说“制定/生成/分配/给方案”时才调用 create_bed_plan。
4. 创建方案后必须说明“已生成待审批方案，需管理员在审批中心确认”，不能声称已执行。
5. 缺少科室、日期等关键信息时先追问，不要猜。
6. 不提供疾病诊断、处方或治疗建议。
7. 回答简洁，用中文，优先给结论和下一步。"""


def _fallback(db: Session, user: User, message: str) -> dict:
    text = message.replace(" ", "")
    trace = []
    plan_id = None
    if "床位" in text or "空床" in text or "入院" in text:
        data, err = _execute_tool("bed_snapshot", {}, db, user)
        trace.append({"name": "bed_snapshot", "args": {}, "result": data})
        if ("方案" in text or "分配" in text or "生成" in text) and can(user, "plan.create"):
            plan, draft, error = create_plan(db, user, None, message)
            if plan:
                plan_id = plan.id
                trace.append({"name": "create_bed_plan", "args": {}, "result": _plan_payload(plan)})
                reply = f"当前全院空闲床位 {data.get('free')} 张、待入院 {data.get('pending_admissions')} 人。已生成待审批床位方案 {plan.id}，请到审批中心确认；批准前不会分配床位。"
            else:
                reply = f"当前全院空闲床位 {data.get('free')} 张、待入院 {data.get('pending_admissions')} 人。{error or '暂时没有可执行方案'}。"
        else:
            reply = f"当前全院空闲床位 {data.get('free')} 张、待入院 {data.get('pending_admissions')} 人、床位候补 {data.get('bed_waitlist')} 人。"
    elif "检查" in text or "CT" in text.upper():
        data, _ = _execute_tool("exam_conflicts", {}, db, user)
        trace.append({"name": "exam_conflicts", "args": {}, "result": data})
        reply = f"今天检查冲突 {len(data.get('conflicts', []))} 组。建议先看冲突设备，再决定是否调整常规检查；优先/紧急检查保持原时段。"
    elif "排班" in text:
        data, _ = _execute_tool("staff_conflicts", {}, db, user)
        trace.append({"name": "staff_conflicts", "args": {}, "result": data})
        reply = f"当前排班冲突 {len(data.get('conflicts', []))} 条，主要是夜班后休息不足。可在人员排班页生成调整方案，审批后发布。"
    else:
        data, _ = _execute_tool("ops_overview", {}, db, user)
        trace.append({"name": "ops_overview", "args": {}, "result": data})
        k = data.get("kpis", {})
        reply = f"当前床位使用率 {k.get('occupancy')}%，空闲 {k.get('free')} 张，待入院 {k.get('pending_admissions')} 人，今日预约 {k.get('today_appointments')} 人次，待处理预警 {k.get('open_alerts')} 条。"
    return {"reply": reply, "tool_trace": trace, "plan_id": plan_id, "qwen": {"configured": False, "ok": False}}


def chat(db: Session, user: User, message: str, session_id: str | None = None) -> dict:
    session_id = session_id or f"CS-{uuid.uuid4().hex[:10]}"
    key = f"{user.id}:{session_id}"
    history = SESSIONS.setdefault(key, [])
    if not qwen.configured:
        result = _fallback(db, user, message)
        history.extend([{"role": "user", "content": message},
                        {"role": "assistant", "content": result["reply"]}])
        return {"session_id": session_id, **result, "messages": history[-10:]}

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-8:])
    messages.append({"role": "user", "content": message})
    trace = []
    plan_id = None
    final_text = ""
    for _ in range(4):
        result = qwen.chat_with_tools(messages, TOOLS)
        if not result.get("ok"):
            final_text = "Qwen 暂时不可用，已切换到规则模式。"
            break
        assistant = result.get("message", {})
        tool_calls = assistant.get("tool_calls") or []
        if not tool_calls:
            final_text = (assistant.get("content") or "").strip()
            break
        messages.append(assistant)
        for call in tool_calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except Exception:
                args = {}
            data, error = _execute_tool(name, args, db, user)
            if name == "create_bed_plan" and data.get("plan_id"):
                plan_id = data["plan_id"]
            trace.append({"name": name, "args": args, "result": data, "error": error})
            messages.append({"role": "tool", "tool_call_id": call.get("id", name),
                             "content": json.dumps(data, ensure_ascii=False)[:6000]})
    if not final_text:
        final_text = "我已经完成数据查询，但暂时没有生成可执行方案。请补充科室或具体调度目标。"
    history.extend([{"role": "user", "content": message},
                    {"role": "assistant", "content": final_text}])
    SESSIONS[key] = history[-16:]
    return {"session_id": session_id, "reply": final_text, "tool_trace": trace,
            "plan_id": plan_id, "qwen": {"configured": True, "ok": True, "model": qwen.model},
            "messages": SESSIONS[key][-10:]}
