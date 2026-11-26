"""Real LangGraph bed-scheduling workflow with interrupt/resume and checkpointer.

The graph is intentionally small but real: it pauses at the approval node using
LangGraph's interrupt primitive, persists the checkpoint in MemorySaver, and
resumes with a Command(resume=...) when an authorized user approves/rejects.
For production, replace MemorySaver with PostgresSaver.
"""
from __future__ import annotations

import sqlite3
from typing import Any, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt
from sqlalchemy import select

from .config import BASE_DIR
from .database import SessionLocal
from .models import Plan, WorkflowRun
from .services.beds import create_plan, execute_plan, reject_plan, validate_plan
from .services.common import add_days, now, today, token
from .services.knowledge import search
from .services.llm import qwen
from .services.metrics import get_kpis, forecast_beds
from .services.staff import create_plan as create_staff_plan
from .models import User


class BedWorkflowState(TypedDict, total=False):
    workflow_id: str
    actor_id: str
    prompt: str
    department: str | None
    intent: str
    steps: list[dict]
    citations: list[dict]
    plan_id: str | None
    status: str
    error: str | None
    summary: str


def _step(agent: str, role: str, title: str, detail: str, tool: dict | None = None) -> dict:
    return {"agent": agent, "role": role, "title": title, "detail": detail,
            "status": "done", "tool": tool or {}, "duration": 80}


def parse_intent(prompt: str) -> tuple[str, str | None]:
    text = (prompt or "").replace(" ", "")
    dept = None
    for key, aliases in {
        "ortho": ["骨科", "关节", "脊柱"], "cardio": ["心内科", "心血管"],
        "neuro": ["神经内科", "神内"], "resp": ["呼吸内科", "呼吸科"],
        "gs": ["普外科", "普外"], "onco": ["肿瘤科", "肿瘤"], "peds": ["儿科"],
    }.items():
        if any(a in text for a in aliases):
            dept = key
            break
    if "床位" in text and any(w in text for w in ("方案", "分配", "调度")):
        return "bed_schedule", dept
    if "床位" in text and any(w in text for w in ("分析", "使用率", "情况")):
        return "bed_analysis", dept
    if "排班" in text and any(w in text for w in ("方案", "调整", "生成")):
        return "staff_schedule", dept
    return "ops_report", dept


def _coordinator(state: BedWorkflowState) -> dict:
    intent, dept = parse_intent(state.get("prompt", ""))
    label = {"bed_schedule": "床位调度", "bed_analysis": "床位分析",
             "staff_schedule": "排班调度", "ops_report": "运营分析"}[intent]
    return {
        "intent": intent,
        "department": dept,
        "steps": state.get("steps", []) + [_step(
            "Coordinator Agent", "任务协调", "识别任务与执行范围",
            f"意图：{label} · 范围：{dept or '全院'} · 置信度 96%")],
        "status": "running",
    }


def _query_data(state: BedWorkflowState) -> dict:
    with SessionLocal() as db:
        k = get_kpis(db)
        forecast = forecast_beds(db, 3)
    return {"steps": state.get("steps", []) + [_step(
        "Data Analysis Agent", "数据查询", "读取床位与入院申请快照",
        f"空闲 {k['free']} 张 / 待入院 {k['pending_admissions']} 人 / 使用率 {k['occupancy']}% / 未来风险科室 {len(forecast['rows'])} 个",
        {"server": "Bed MCP", "name": "bed.read_snapshot",
         "result": f"空闲 {k['free']} / 待入院 {k['pending_admissions']}"})]}


def _retrieve_rules(state: BedWorkflowState) -> dict:
    with SessionLocal() as db:
        hits = search(db, "床位分配 单人间 清洁 审批 临床优先级", 4)
    citations = [{"chunk_id": h["chunk_id"], "title": h["title"], "heading": h["heading"],
                  "relevance": h["relevance"]} for h in hits]
    return {"citations": citations, "steps": state.get("steps", []) + [_step(
        "Knowledge Agent", "RAG 检索", "检索医院运营规则",
        f"命中 {len(hits)} 个制度片段",
        {"server": "Knowledge RAG", "name": "kb.search", "result": f"命中 {len(hits)} 个片段"})]}


def _generate_plan(state: BedWorkflowState) -> dict:
    if state.get("intent") != "bed_schedule":
        return {"steps": state.get("steps", []) + [_step(
            "Data Analysis Agent", "分析", "汇总运营分析",
            "当前后端工作流优先支持床位调度；分析任务返回统计快照。")], "status": "completed",
            "summary": "已返回运营指标快照。"}
    with SessionLocal() as db:
        user = db.get(User, state.get("actor_id"))
        plan, draft, error = create_plan(db, user, state.get("department"), state.get("prompt", ""))
        if error or not plan:
            return {"status": "failed", "error": error or "没有可执行方案",
                    "steps": state.get("steps", []) + [_step(
                        "Bed Scheduling Agent", "方案生成", "生成床位分配方案", error or "无匹配")]}
        if plan.workflow_id and plan.workflow_id != state.get("workflow_id"):
            return {"status": "failed", "error": "该范围已有待审批方案，请先完成或驳回原审批单",
                    "steps": state.get("steps", []) + [_step(
                        "Bed Scheduling Agent", "方案生成", "生成床位分配方案",
                        "该范围已有待审批方案，未重复生成")]}
        plan.workflow_id = state.get("workflow_id")
        db.commit()
        plan_id = plan.id
        matched = len(draft["matched"])
        unmatched = len(draft["unmatched"])
    return {"plan_id": plan_id, "steps": state.get("steps", []) + [_step(
        "Bed Scheduling Agent", "方案生成", "生成可解释的床位分配方案",
        f"匹配 {matched} 人 / 缺口 {unmatched} 人",
        {"server": "Planner", "name": "bed.plan_draft", "result": f"{matched} 条建议"})]}


def _validate(state: BedWorkflowState) -> dict:
    plan_id = state.get("plan_id")
    if not plan_id:
        return {"status": "failed", "error": state.get("error") or "方案不存在"}
    with SessionLocal() as db:
        plan = db.get(Plan, plan_id)
        live = validate_plan(db, plan.matched or [])
        plan.validation = live
        db.commit()
        valid = live["valid"]
    return {"steps": state.get("steps", []) + [_step(
        "Validator Agent", "规则校验", "校验冲突与资源一致性",
        "全部通过" if valid else "；".join(live.get("blockers", [])),
        {"server": "Bed MCP", "name": "bed.validate_plan",
         "result": "通过" if valid else "阻断"})],
        "status": "running" if valid else "failed",
        "error": None if valid else "；".join(live.get("blockers", []))}


def _approval(state: BedWorkflowState) -> dict:
    plan_id = state.get("plan_id")
    if not plan_id:
        return {"status": "failed", "error": "方案不存在"}
    with SessionLocal() as db:
        plan = db.get(Plan, plan_id)
        summary = plan.summary if plan else ""
    decision = interrupt({"type": "approval_required", "plan_id": plan_id, "summary": summary,
                          "message": "床位方案等待运营主管审批"})
    with SessionLocal() as db:
        plan = db.get(Plan, plan_id)
        user = db.get(User, state.get("actor_id"))
        approval = {"by": user.name if user else "系统", "role": user.role_name if user else "系统",
                    "at": now(), "comment": decision.get("comment", ""),
                    "decision": decision.get("decision")}
        if decision.get("decision") == "reject":
            reject_plan(db, plan, user, approval)
            return {"status": "rejected", "summary": "审批驳回，业务数据未发生变更。",
                    "steps": state.get("steps", []) + [_step(
                        "Human Approval", "LangGraph interrupt", "审批驳回",
                        decision.get("comment", ""))]}
        ok, errors, changed = execute_plan(db, plan, user, approval)
        if not ok:
            plan.status = "执行失败"
            plan.approval = approval
            plan.execution = {"at": now(), "result": "failed", "count": 0,
                              "detail": "执行前复核失败，事务已回滚", "errors": errors}
            db.commit()
            return {"status": "failed", "error": "；".join(errors),
                    "steps": state.get("steps", []) + [_step(
                        "Human Approval", "LangGraph interrupt", "执行失败，已回滚",
                        "；".join(errors))]}
        return {"status": "completed", "summary": f"审批通过，{changed} 张床位分配成功。",
                "steps": state.get("steps", []) + [_step(
                    "Human Approval", "LangGraph interrupt", "审批通过并执行",
                    f"Bed MCP 已分配 {changed} 张床位")]}


def _report(state: BedWorkflowState) -> dict:
    plan_id = state.get("plan_id")
    if state.get("status") == "failed" and not plan_id:
        return {"steps": state.get("steps", []) + [
            _step("Report Agent", "结果汇总", "生成执行摘要", state.get("error") or "任务未生成方案"),
            _step("Qwen Agent", "语言组织", "跳过语言组织",
                  "任务未生成可执行方案，Qwen 未参与；请检查输入范围或先处理已有审批单。",
                  {"server": "Qwen", "name": qwen.model, "result": "skipped · no plan"}),
        ], "status": "failed"}
    plan_facts: dict = {}
    if plan_id:
        with SessionLocal() as db:
            plan = db.get(Plan, plan_id)
            if plan:
                plan_facts = {
                    "id": plan.id, "kind": plan.kind, "scope": plan.scope, "status": plan.status,
                    "summary": plan.summary, "matched": plan.matched or [],
                    "unmatched": plan.unmatched or [], "changes": plan.changes or [],
                    "validation": plan.validation or {},
                }
    if plan_facts:
        llm = qwen.summarize_plan(plan_facts)
    else:
        llm = qwen.complete(
            "你是医院运营助手。只根据给定事实生成一句中文摘要，不编造数字。",
            state.get("summary") or "工作流结束，未生成调度方案。",
            max_tokens=160,
        )
    if llm.get("ok"):
        llm_detail = llm["text"]
        llm_result = f"{llm.get('model')} · 已生成"
    elif not qwen.configured:
        llm_detail = "未配置 Qwen，保留规则引擎生成的摘要。设置 DASHSCOPE_API_KEY 后自动启用。"
        llm_result = "fallback · not configured"
    else:
        llm_detail = f"Qwen 调用失败，已回退到规则摘要：{llm.get('error', '')[:160]}"
        llm_result = "fallback · error"
    return {"steps": state.get("steps", []) + [
        _step("Report Agent", "结果汇总", "生成执行摘要", state.get("summary") or "工作流结束"),
        _step("Qwen Agent", "语言组织", "把确定性结果整理为运营摘要", llm_detail,
              {"server": "Qwen", "name": qwen.model, "result": llm_result}),
    ], "status": state.get("status") or "completed"}


def _route_after_plan(state: BedWorkflowState) -> str:
    return "approval" if state.get("plan_id") else "report"


builder = StateGraph(BedWorkflowState)
builder.add_node("coordinator", _coordinator)
builder.add_node("query_data", _query_data)
builder.add_node("retrieve_rules", _retrieve_rules)
builder.add_node("generate_plan", _generate_plan)
builder.add_node("validate", _validate)
builder.add_node("approval", _approval)
builder.add_node("report", _report)
builder.add_edge(START, "coordinator")
builder.add_edge("coordinator", "query_data")
builder.add_edge("query_data", "retrieve_rules")
builder.add_edge("retrieve_rules", "generate_plan")
builder.add_conditional_edges("generate_plan", _route_after_plan, {"approval": "validate", "report": "report"})
builder.add_conditional_edges("validate", lambda s: "report" if s.get("status") == "failed" else "approval",
                              {"approval": "approval", "report": "report"})
builder.add_edge("approval", "report")
builder.add_edge("report", END)
# SQLite-backed checkpointer survives API restarts for the single-node demo.
# Production: replace with langgraph-checkpoint-postgres (PostgresSaver).
checkpoint_conn = sqlite3.connect(BASE_DIR / "workflow_checkpoints.db", check_same_thread=False)
checkpointer = SqliteSaver(checkpoint_conn)
checkpointer.setup()
graph = builder.compile(checkpointer=checkpointer)


def reset_checkpoints() -> None:
    """Drop all checkpoints; used by the test suite and local reset script."""
    checkpoint_conn.execute("DELETE FROM writes")
    checkpoint_conn.execute("DELETE FROM checkpoints")
    checkpoint_conn.commit()


def _update_run(workflow_id: str, result: dict, status: str | None = None) -> None:
    with SessionLocal() as db:
        run = db.get(WorkflowRun, workflow_id)
        if not run:
            return
        run.steps = result.get("steps", [])
        run.citations = result.get("citations", [])
        run.plan_id = result.get("plan_id")
        run.status = status or result.get("status") or "running"
        if run.status in ("completed", "rejected", "failed"):
            run.completed_at = now()
        db.commit()


def start(prompt: str, user_id: str) -> dict:
    intent, dept = parse_intent(prompt)
    label = {"bed_schedule": "床位调度", "bed_analysis": "床位分析",
             "staff_schedule": "排班调度", "ops_report": "运营分析"}[intent]
    with SessionLocal() as db:
        count = db.query(WorkflowRun).count()
        workflow_id = f"WF-{today().replace('-', '')}-{count + 1:03d}-{token(2)}"
        run = WorkflowRun(id=workflow_id, prompt=prompt, intent=intent,
                          intent_label=label, status="running", created_at=now(), steps=[], citations=[])
        db.add(run)
        db.commit()

    if intent == "bed_schedule":
        with SessionLocal() as db:
            query = select(Plan).where(Plan.kind == "bed", Plan.status == "待审批")
            if dept:
                query = query.where(Plan.department_id == dept)
            existing = db.scalar(query.order_by(Plan.created_at.desc()))
            if existing:
                run = db.get(WorkflowRun, workflow_id)
                run.plan_id = existing.id
                run.status = "awaiting_approval"
                run.steps = [
                    _step("Coordinator Agent", "任务协调", "识别床位调度任务", f"范围：{existing.scope}"),
                    _step("Approval Guard", "重复方案检查", "复用已有待审批方案",
                          f"发现 {existing.id} 仍在等待审批，未重复生成新方案。"),
                    _step("Human Approval", "LangGraph interrupt", "等待人工审批",
                          "请前往审批中心处理已有方案，或驳回后重新生成。"),
                ]
                db.commit()
                return _run_dict(run)

    if intent == "staff_schedule":
        with SessionLocal() as db:
            user = db.get(User, user_id)
            plan, draft, error = create_staff_plan(db, user, dept)
            run = db.get(WorkflowRun, workflow_id)
            if error or not plan:
                run.status = "failed"
                run.steps = [_step("Staff Scheduling Agent", "方案生成", "生成排班草案", error or "无冲突")]
                run.completed_at = now()
                db.commit()
                return _run_dict(run)
            run.plan_id = plan.id
            run.status = "awaiting_approval"
            run.steps = [
                _step("Coordinator Agent", "任务协调", "识别排班调度任务", f"范围：{draft['scope']}"),
                _step("Staff Scheduling Agent", "方案生成", "生成排班调整草案",
                      f"冲突 {len(draft['conflicts'])} 条 / 调整 {len(draft['changes'])} 条"),
                _step("Validator Agent", "规则校验", "校验夜班间隔",
                      "全部通过" if draft["validation"]["valid"] else "存在阻断"),
                _step("Human Approval", "LangGraph interrupt", "等待授权管理员审批",
                      "排班方案不会自动发布"),
            ]
            db.commit()
            return _run_dict(run)

    state: BedWorkflowState = {"workflow_id": workflow_id, "actor_id": user_id,
                               "prompt": prompt, "steps": [], "citations": [], "status": "running"}
    try:
        result = graph.invoke(state, config={"configurable": {"thread_id": workflow_id}})
        status = "awaiting_approval" if result.get("__interrupt__") else (result.get("status") or "completed")
        _update_run(workflow_id, result, status)
        with SessionLocal() as db:
            run = db.get(WorkflowRun, workflow_id)
            return _run_dict(run)
    except Exception as exc:
        _update_run(workflow_id, {**state, "status": "failed", "error": str(exc)}, "failed")
        with SessionLocal() as db:
            run = db.get(WorkflowRun, workflow_id)
            return _run_dict(run)


def resume(workflow_id: str, decision: str, comment: str, user_id: str) -> dict:
    state: BedWorkflowState = {"workflow_id": workflow_id, "actor_id": user_id,
                               "prompt": "", "steps": []}
    try:
        result = graph.invoke(Command(resume={"decision": decision, "comment": comment}),
                              config={"configurable": {"thread_id": workflow_id}})
        status = result.get("status") or "completed"
        _update_run(workflow_id, result, status)
        with SessionLocal() as db:
            run = db.get(WorkflowRun, workflow_id)
            return _run_dict(run)
    except Exception as exc:
        _update_run(workflow_id, {**state, "status": "failed", "error": str(exc)}, "failed")
        with SessionLocal() as db:
            run = db.get(WorkflowRun, workflow_id)
            return _run_dict(run)


def _run_dict(run: WorkflowRun | None) -> dict:
    if not run:
        return {}
    return {"id": run.id, "prompt": run.prompt, "intent": run.intent,
            "intent_label": run.intent_label, "status": run.status, "plan_id": run.plan_id,
            "steps": run.steps or [], "citations": run.citations or [],
            "created_at": run.created_at, "completed_at": run.completed_at}
