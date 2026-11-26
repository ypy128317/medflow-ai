from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..security import get_current_user
from ..services.common import audit, get_setting, now
from ..services.llm import qwen
from ..services.metrics import (appointment_stats, dept_stats, forecast_beds, get_kpis,
                                ops_overview)

router = APIRouter(prefix="/ops", tags=["operations"])


@router.get("/overview")
def overview(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return ops_overview(db)


@router.get("/departments")
def departments(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return dept_stats(db)


@router.get("/forecast")
def forecast(days: int = 3, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return forecast_beds(db, max(1, min(days, 14)))


@router.get("/analytics")
def analytics(days: int = 7, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stats = get_setting(db, "daily_stats", {}) or {}
    if days not in (7, 30):
        days = 7
    return {"range": f"近 {days} 天", "daily": stats, "kpis": get_kpis(db),
            "departments": dept_stats(db), "appointments": appointment_stats(db),
            "forecast": forecast_beds(db, 3)}


@router.post("/report")
def report(days: int = 7, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    k = get_kpis(db)
    depts = dept_stats(db)
    stats = appointment_stats(db)
    pressure = max(depts, key=lambda x: x["occupancy"]) if depts else None
    top = depts[0] if depts else None
    text = {
        "title": "医院运营分析报告",
        "range": f"近 {days} 天",
        "generated_at": now(),
        "data_source": "运营指标服务（数据库实时快照）",
        "metrics": k,
        "sections": [
            {"title": "一、总体运营", "body": f"当前床位使用率 {k['occupancy']}%，可用床位 {k['free']} 张，待入院 {k['pending_admissions']} 人；今日预约 {k['today_appointments']} 人次，已到诊 {k['visits']} 人次。"},
            {"title": "二、科室表现", "body": f"预约量最高的是{top['name'] if top else '—'}；床位使用率最高的是{pressure['name'] if pressure else '—'}（{pressure['occupancy'] if pressure else 0}%）。"},
            {"title": "三、效率与风险", "body": f"检查设备利用率 {k['equipment_utilization']}%，平均预约等待 {k['avg_wait']} 分钟，取消率 {stats['cancel_rate']}%，平均住院日 {k['alos']} 天。"},
            {"title": "四、建议", "body": f"优先处理 {k['pending_admissions']} 位待入院患者，关注高使用率科室预出院床位，并对人员冲突执行排班调整审批。"},
        ],
    }
    llm = qwen.summarize_report(text)
    text["ai_summary"] = llm.get("text") if llm.get("ok") else None
    text["llm"] = {"provider": "qwen", "configured": qwen.configured, "model": qwen.model,
                   "ok": bool(llm.get("ok")), "error": None if llm.get("ok") else llm.get("error")}
    audit(db, user, "report.generate", "OPS-REPORT",
          f"生成 {days} 天运营报告" + ("（Qwen 语言组织）" if llm.get("ok") else "（规则模板）"))
    db.commit()
    return text
