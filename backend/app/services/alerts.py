"""Rule-based operational alert engine."""
from __future__ import annotations

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from ..models import Admission, Alert, AlertRead, Bed, Department, Plan, StaffConflict, User
from .beds import ensure_replan_for_dept
from .common import add_days, audit, get_setting, now, parse_date_time, round1, today
from .exams import conflicts as exam_conflicts
from .metrics import appointment_stats, equipment_utilization, forecast_beds, get_kpis


def evaluate(db: Session, user: User | None = None) -> list[Alert]:
    rules = get_setting(db, "alert_rules", {}) or {}
    high = float(rules.get("bedOccupancyHigh", 85))
    urgent = float(rules.get("bedOccupancyUrgent", 95))
    cleaning_limit = int(rules.get("cleaningOverdueMinutes", 30))
    cancel_limit = float(rules.get("cancellationRate", 5))
    existing = db.scalars(select(Alert).where(Alert.status.in_(["待处理", "处理中"]))).all()
    keys = {a.rule_key for a in existing if a.rule_key}
    types = {(a.alert_type, a.department_name) for a in existing}
    drafts: list[dict] = []

    def add(key: str, level: str, alert_type: str, title: str, dept: str, data: list, cause: str,
            ai: str, suggestion: str, related_type: str = "", related_id: str = "") -> None:
        if key in keys or (alert_type, dept) in types:
            return
        keys.add(key)
        types.add((alert_type, dept))
        drafts.append({"rule_key": key, "level": level, "alert_type": alert_type, "title": title,
                       "department_name": dept, "data": data, "cause": cause, "ai_analysis": ai,
                       "suggestion": suggestion, "related_type": related_type, "related_id": related_id})

    k = get_kpis(db)
    if k["occupancy"] >= high:
        add("hospital-bed-occupancy", "紧急" if k["occupancy"] >= urgent else "高", "床位资源",
            f"全院床位使用率达到 {k['occupancy']}%", "全院",
            [f"使用率 {k['occupancy']}%", f"空闲 {k['free']} 张", f"待入院 {k['pending_admissions']} 人"],
            f"全院床位使用率超过阈值 {high}%。", "可用床位与待入院人数接近，建议优先处理预出院和待清洁床位。",
            "启动全院床位协调；关注急诊与重点科室；不自动跨科分配。", "bed", "ALL")
    for dept in db.scalars(select(Department)).all():
        beds = db.scalars(select(Bed).where(Bed.department_id == dept.id)).all()
        free = sum(1 for b in beds if b.status == "空闲")
        pending = db.scalar(select(func.count()).select_from(Admission).where(
            Admission.department_id == dept.id, Admission.status == "待分配")) or 0
        if pending > free:
            add(f"dept-gap-{dept.id}", "高", "床位资源",
                f"{dept.name}可用床位 {free} 张，待入院 {pending} 人", dept.name,
                [f"可用 {free} 张", f"待入院 {pending} 人"], "待入院人数超过当前空闲床位。",
                "需要等待清洁、出院或跨病区协调；AI 不会自行降级床位类型。",
                "优先执行该科室床位调度方案；核对预出院床位和清洁进度。", "bed", dept.id)
    for bed in db.scalars(select(Bed).where(Bed.status == "待清洁", Bed.cleaning_deadline.isnot(None))).all():
        due = parse_date_time(bed.cleaning_deadline)
        now_dt = parse_date_time(now())
        if due and now_dt and (now_dt - due).total_seconds() > cleaning_limit * 60:
            late = int((now_dt - due).total_seconds() / 60)
            dept = db.get(Department, bed.department_id)
            add(f"cleaning-{bed.id}", "中", "清洁超时",
                f"{bed.code} 床清洁超时 {late} 分钟", dept.name if dept else bed.department_id,
                [f"超时 {late} 分钟", f"目标 {bed.cleaning_deadline[-5:]}"],
                "终末清洁超过目标完成时间。", "床位仍不可分配，可能影响收治时序。",
                "通知保洁与护士长；完成清洁复核后再纳入调度。", "bed", bed.id)
    cf = exam_conflicts(db, today())
    if cf:
        c = cf[0]
        add(f"exam-conflict-{c['device_id']}-{today()}", "高", "检查冲突",
            f"{c['device_id']} 今日存在 {len(cf)} 组时段重叠", "医技科",
            [f"冲突 {len(cf)} 组", f"重叠 {c['overlap_minutes']} 分钟"],
            "同一设备检查时段发生重叠。", "仅可调整常规检查时段。",
            "生成检查调整方案并提交审批。", "equipment", c["device_id"])
    for sc in db.scalars(select(StaffConflict)).all():
        dept = db.get(Department, sc.department_id)
        add(f"staff-{sc.id}", sc.severity, "人员负载", f"{sc.staff_name}：{sc.conflict_type}",
            dept.name if dept else sc.department_id, [sc.conflict_type, f"风险 {sc.severity}"],
            sc.detail, "排班规则要求夜班后休息至少 11 小时。", sc.suggestion, "staff", sc.staff_id)
    stats = appointment_stats(db, today())
    if stats["cancel_rate"] > cancel_limit:
        add(f"cancel-rate-{today()}", "低", "预约效率", f"今日预约取消率 {stats['cancel_rate']}%，高于阈值", "全院",
            [f"取消率 {stats['cancel_rate']}%", f"取消 {stats['canceled']} 条", f"阈值 {cancel_limit}%"],
            "当日取消率超过规则阈值。", "可检查重复预约与提醒策略。", "加强就诊前确认与候补补位。",
            "appointment", "ALL")
    for row in forecast_beds(db, 3)["rows"]:
        if row["risk"] in ("高", "紧急"):
            add(f"forecast-{row['dept']}-{add_days(today(), 3)}", "高" if row["risk"] == "紧急" else "中",
                "资源预测", f"{row['dept_name']}未来三天预计使用率 {row['projected']}%", row["dept_name"],
                [f"预计 {row['projected']}%", f"待入 {row['pending']} 人"], row["reason"],
                "按现有申请与出院计划推算，未来三天可能出现床位压力。", "提前核对预出院床位。", "bed", row["dept"])

    # 24-hour proactive planning: alert + draft plan, never auto-execute.
    for row in forecast_beds(db, 1)["rows"][:3]:
        if row["gap"] <= 0 and row["projected"] < 90:
            continue
        plan = ensure_replan_for_dept(db, user, row["dept"]) if user else None
        suggestion = "建议提前制定床位调度方案，系统已生成待审批草案。"
        if plan:
            suggestion = f"系统已生成待审批床位方案 {plan.id}，请管理员审批；批准前不会分配床位。"
        add(f"forecast24-{row['dept']}-{add_days(today(), 1)}",
            "高" if row["gap"] > 0 or row["projected"] >= 95 else "中",
            "资源预测24h", f"{row['dept_name']}未来24小时床位供给不足", row["dept_name"],
            [f"预计使用率 {row['projected']}%", f"待入院 {row['pending']} 人",
             f"预计出院 {row['discharges']} 人", f"床位缺口 {row['gap']}"],
            f"24小时内预计可用床位不足以覆盖 {row['pending']} 位待入院患者。",
            "按当前待入院、预出院和床位释放情况推算，存在短期收治压力。",
            suggestion, "plan" if plan else "bed", plan.id if plan else row["dept"])

    created = []
    base = db.scalar(select(func.count()).select_from(Alert)) or 0
    for i, d in enumerate(drafts[:20], 1):
        alert = Alert(id=f"AL-{today().replace('-', '')}-R{base + i:03d}", level=d["level"],
                      alert_type=d["alert_type"], title=d["title"], department_name=d["department_name"],
                      trigger_at=now(), status="待处理", related_type=d["related_type"],
                      related_id=d["related_id"], data=d["data"], cause=d["cause"],
                      ai_analysis=d["ai_analysis"], suggestion=d["suggestion"],
                      source="规则引擎", rule_key=d["rule_key"])
        db.add(alert)
        created.append(alert)
    audit(db, user, "alerts.evaluate", "ALERT-ENGINE", f"规则引擎重新计算，新增 {len(created)} 条预警")
    db.commit()
    return created


def unread_count(db: Session, user: User) -> int:
    query = select(func.count()).select_from(Alert).outerjoin(
        AlertRead,
        and_(AlertRead.alert_id == Alert.id, AlertRead.user_id == user.id),
    ).where(
        Alert.status.in_(["待处理", "处理中"]),
        AlertRead.alert_id.is_(None),
    )
    return db.scalar(query) or 0


def mark_all_read(db: Session, user: User) -> int:
    alerts = db.scalars(select(Alert).where(Alert.status.in_(["待处理", "处理中"]))).all()
    read_ids = set(db.scalars(select(AlertRead.alert_id).where(AlertRead.user_id == user.id)).all())
    added = 0
    for alert in alerts:
        if alert.id in read_ids:
            continue
        db.add(AlertRead(user_id=user.id, alert_id=alert.id, read_at=now()))
        added += 1
    db.commit()
    return added


def handle(db: Session, user: User, alert_id: str, status: str, note: str = "") -> tuple[bool, str]:
    alert = db.get(Alert, alert_id)
    if not alert:
        return False, "预警不存在"
    alert.status = status
    alert.handled_by = user.name
    alert.handled_at = now()
    alert.handle_note = note
    audit(db, user, "alert.handle", alert.id, f"预警状态更新为{status}" + (f"：{note}" if note else ""))
    db.commit()
    return True, f"预警状态已更新为{status}"
