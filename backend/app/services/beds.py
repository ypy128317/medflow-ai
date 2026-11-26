"""Bed inventory, allocation planning, transactional execution and bed operations."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (Admission, Bed, BedWaitlist, Department, KnowledgeDoc, Patient, Plan, User,
                      Ward)
from .common import add_days, audit, minutes, new_id, now, round1, serialize, today


def _features(bed: Bed) -> list[str]:
    return list(bed.features or [])


def bed_eligibility(bed: Bed, adm: Admission) -> list[str]:
    errors: list[str] = []
    if bed.status != "空闲":
        errors.append(f"床位当前为{bed.status}")
    if bed.department_id != adm.department_id:
        errors.append("科室不匹配")
    if bed.bed_type != adm.bed_type:
        errors.append(f"床位类型不匹配（需要{adm.bed_type}，实际{bed.bed_type}）")
    if bed.gender_policy not in (adm.gender, "不限"):
        errors.append("性别适配不通过")
    required = list(adm.required_features or [])
    for feature in required:
        if feature not in _features(bed) and not (feature == "感染隔离" and bed.bed_type == "隔离间"):
            errors.append("必要设施不满足")
            break
    if bed.bed_type == "隔离间" and not adm.isolation:
        errors.append("隔离间不可用于普通患者")
    if adm.isolation and bed.bed_type != "隔离间":
        errors.append("需要隔离间")
    return errors


def score_bed(bed: Bed, adm: Admission) -> tuple[int, list[str]]:
    score = 52
    reasons = []
    if bed.department_id == adm.department_id:
        score += 16
        reasons.append("科室匹配")
    if bed.bed_type == adm.bed_type:
        score += 14
        reasons.append(f"床位类型匹配（{bed.bed_type}）")
    if bed.gender_policy == adm.gender:
        score += 8
        reasons.append("性别适配")
    elif bed.gender_policy == "不限":
        score += 6
        reasons.append("病房性别不限")
    for f in adm.required_features or []:
        if f in _features(bed):
            score += 4
            reasons.append(f"满足「{f}」")
    return min(99, score), reasons


def candidate_beds(db: Session, adm: Admission) -> list[tuple[Bed, int, list[str]]]:
    beds = db.scalars(select(Bed).where(Bed.department_id == adm.department_id, Bed.status == "空闲")).all()
    out = []
    for bed in beds:
        if not bed_eligibility(bed, adm):
            score, reasons = score_bed(bed, adm)
            out.append((bed, score, reasons))
    return sorted(out, key=lambda x: (-x[1], x[0].id))


def _alternatives(db: Session, adm: Admission) -> list[dict]:
    out = []
    beds = db.scalars(select(Bed).where(Bed.department_id == adm.department_id)).all()
    for bed in beds:
        ward = db.get(Ward, bed.ward_id)
        if bed.status == "待清洁" and bed.bed_type == adm.bed_type and bed.gender_policy in (adm.gender, "不限"):
            out.append({"bed_id": bed.id, "bed_code": bed.code, "ward_name": ward.name if ward else "",
                        "reason": f"待清洁 · 预计 {(bed.cleaning_deadline or '')[-5:]} 完成",
                        "available_at": bed.cleaning_deadline})
        if bed.status == "已入住" and bed.expected_discharge == today():
            if bed.bed_type == adm.bed_type and bed.gender_policy in (adm.gender, "不限"):
                out.append({"bed_id": bed.id, "bed_code": bed.code, "ward_name": ward.name if ward else "",
                            "reason": f"预计今日 {bed.expected_discharge_time or '下午'} 出院，清洁后才能分配",
                            "available_at": bed.expected_discharge})
    return out[:3]


def _citations(db: Session) -> list[dict]:
    doc = db.get(KnowledgeDoc, "KB-001")
    if not doc:
        return []
    return [{"chunk_id": c.get("id"), "title": doc.title, "heading": c.get("heading")}
            for c in (doc.chunks or [])[:4]]


def validate_plan(db: Session, matched: list[dict]) -> dict:
    blockers: list[str] = []
    seen_beds: set[str] = set()
    seen_admissions: set[str] = set()
    for m in matched:
        bed = db.get(Bed, m["bed_id"])
        adm = db.get(Admission, m["admission_id"])
        if not bed:
            blockers.append(f"床位 {m['bed_id']} 不存在")
            continue
        if not adm:
            blockers.append(f"入院申请 {m['admission_id']} 不存在")
            continue
        if bed.id in seen_beds:
            blockers.append(f"床位 {bed.code} 被重复分配")
        seen_beds.add(bed.id)
        if adm.id in seen_admissions:
            blockers.append(f"患者 {adm.name} 被重复分配")
        seen_admissions.add(adm.id)
        blockers.extend(f"{adm.name}：{e}" for e in bed_eligibility(bed, adm))
        expected = m.get("expected_version")
        if expected is not None and bed.version != expected:
            blockers.append(f"床位 {bed.code} 版本已变化（快照 v{expected} / 当前 v{bed.version}）")
        if adm.status != "待分配":
            blockers.append(f"患者 {adm.name} 的申请状态已变更为{adm.status}")
    blockers = list(dict.fromkeys(blockers))
    checks = [
        {"name": "床位状态实时复核", "pass": not any("状态" in b or "不可分配" in b for b in blockers),
         "detail": f"{len(matched)} 张床位参与校验"},
        {"name": "重复占用检查", "pass": not any("重复" in b or "已在" in b for b in blockers),
         "detail": "床位与患者均无重复占用"},
        {"name": "科室 / 类型 / 性别 / 隔离", "pass": not any(
            x in b for b in blockers for x in ("不匹配", "性别", "隔离", "设施")),
         "detail": "硬约束全部通过"},
        {"name": "床位版本一致性", "pass": not any("版本" in b for b in blockers),
         "detail": "执行快照与当前版本一致"},
    ]
    return {"valid": not blockers, "blockers": blockers, "checks": checks, "checked_at": now()}


def build_plan(db: Session, dept_id: str | None = None) -> dict:
    query = select(Admission).where(Admission.status == "待分配")
    if dept_id:
        query = query.where(Admission.department_id == dept_id)
    admissions = list(db.scalars(query).all())
    rank = {"紧急": 0, "优先": 1, "常规": 2}
    admissions.sort(key=lambda a: (rank.get(a.priority, 9), a.applied_at))
    used: set[str] = set()
    matched: list[dict] = []
    unmatched: list[dict] = []
    for adm in admissions:
        candidates = [c for c in candidate_beds(db, adm) if c[0].id not in used]
        if not candidates:
            unmatched.append({
                "admission_id": adm.id, "patient_name": adm.name, "gender": adm.gender, "age": adm.age,
                "dept": adm.department_id, "dept_name": adm.department_name, "bed_type": adm.bed_type,
                "priority": adm.priority,
                "reason": "当前无同时满足科室、床位类型、性别和隔离要求的空闲床位",
                "alternatives": _alternatives(db, adm),
            })
            continue
        bed, score, reasons = candidates[0]
        used.add(bed.id)
        matched.append({
            "admission_id": adm.id, "patient_id": adm.patient_id, "patient_name": adm.name,
            "gender": adm.gender, "age": adm.age, "dept": adm.department_id, "dept_name": adm.department_name,
            "priority": adm.priority, "bed_type": adm.bed_type, "bed_id": bed.id, "bed_code": bed.code,
            "ward_id": bed.ward_id, "ward_name": "", "room": bed.room_no, "actual_type": bed.bed_type,
            "score": score, "reasons": reasons, "expected_version": bed.version,
        })
    all_beds_query = select(Bed)
    if dept_id:
        all_beds_query = all_beds_query.where(Bed.department_id == dept_id)
    all_beds = db.scalars(all_beds_query).all()
    cleaning = sum(1 for b in all_beds if b.status == "待清洁")
    dept = db.get(Department, dept_id) if dept_id else None
    scope = dept.name if dept else "全院"
    draft = {
        "kind": "bed", "scope": scope, "dept": dept_id, "title": f"{scope}床位调度方案",
        "summary": f"为 {len(admissions)} 位待入院患者生成 {len(matched)} 条床位分配建议"
                   + (f"，{len(unmatched)} 位暂未匹配" if unmatched else "") + "。",
        "matched": matched, "unmatched": unmatched,
        "snapshot": {"total_beds": len(all_beds), "occupied": sum(1 for b in all_beds if b.status == "已入住"),
                     "free": sum(1 for b in all_beds if b.status == "空闲"), "cleaning": cleaning,
                     "pending": len(admissions), "scope": scope},
        "rationale": ["按主管医师标注的优先级和申请时间排序，未自行改变临床优先级。",
                      "床位类型、性别、隔离要求作为刚性约束，不做自动降级。",
                      "待清洁、维护中、已预留床位不纳入本次分配。"],
        "citations": _citations(db),
        "priority_basis": "主管医师标注 + 申请时间",
        "generated_at": now(),
    }
    draft["validation"] = validate_plan(db, matched)
    return draft


def create_plan(db: Session, user: User, dept_id: str | None, prompt: str = "") -> tuple[Plan | None, dict, str | None]:
    draft = build_plan(db, dept_id)
    if not draft["matched"]:
        return None, draft, "当前没有可执行的床位分配"
    existing = db.scalar(select(Plan).where(Plan.kind == "bed", Plan.status == "待审批", Plan.scope == draft["scope"]))
    if existing:
        return existing, draft, None
    count = db.scalar(select(func.count()).select_from(Plan).where(Plan.kind == "bed")) or 0
    plan_id = f"BP-{today().replace('-', '')}-{count + 1:03d}"
    plan = Plan(
        id=plan_id, kind="bed", title=draft["title"], scope=draft["scope"], status="待审批",
        version=1, summary=draft["summary"], snapshot=draft["snapshot"], matched=draft["matched"],
        unmatched=draft["unmatched"], validation=draft["validation"], citations=draft["citations"],
        rationale=draft["rationale"], created_at=now(), created_by="MedFlow Coordinator",
        created_by_name=user.name, department_id=dept_id, approval={}, execution={},
    )
    db.add(plan)
    sync_waitlist_from_plan(db, plan)
    audit(db, user, "plan.create", plan_id,
          f"创建{draft['scope']}床位调度方案，匹配 {len(draft['matched'])} 位患者")
    db.commit()
    db.refresh(plan)
    return plan, draft, None


def sync_waitlist_from_plan(db: Session, plan: Plan) -> list[BedWaitlist]:
    """Persist unmatched admissions into the bed waitlist, preserving requirements."""
    out = []
    for item in plan.unmatched or []:
        adm = db.get(Admission, item.get("admission_id"))
        if not adm:
            continue
        entry = db.scalar(select(BedWaitlist).where(BedWaitlist.admission_id == adm.id))
        if not entry:
            count = db.scalar(select(func.count()).select_from(BedWaitlist)) or 0
            entry = BedWaitlist(
                id=f"BW-{today().replace('-', '')}-{count + 1:03d}", admission_id=adm.id,
                patient_id=adm.patient_id, patient_name=adm.name, gender=adm.gender, age=adm.age,
                department_id=adm.department_id, department_name=adm.department_name,
                bed_type=adm.bed_type, priority=adm.priority, priority_source=adm.priority_source,
                applied_at=adm.applied_at, required_features=adm.required_features or [],
                isolation=adm.isolation, reason=item.get("reason", ""), status="候补中",
                last_plan_id=plan.id, created_at=now(), updated_at=now(),
            )
            db.add(entry)
            db.flush()
        else:
            entry.status = "候补中"
            entry.reason = item.get("reason", entry.reason)
            entry.last_plan_id = plan.id
            entry.updated_at = now()
        out.append(entry)
    return out


def mark_waitlist_assigned(db: Session, admission_ids: list[str], bed_ids: dict[str, str] | None = None) -> None:
    for admission_id in admission_ids:
        entry = db.scalar(select(BedWaitlist).where(BedWaitlist.admission_id == admission_id))
        if entry:
            entry.status = "已分配"
            entry.matched_bed_id = (bed_ids or {}).get(admission_id)
            entry.updated_at = now()


def cancel_waitlist(db: Session, user: User, entry_id: str) -> tuple[bool, str]:
    entry = db.get(BedWaitlist, entry_id)
    if not entry:
        return False, "候补记录不存在"
    if entry.status != "候补中":
        return False, f"当前候补状态为{entry.status}"
    entry.status = "已取消"
    entry.updated_at = now()
    audit(db, user, "bed.waitlist_cancel", entry.id, f"取消床位候补：{entry.patient_name}")
    db.commit()
    return True, "床位候补已取消"


def list_waitlist(db: Session, dept_id: str | None = None) -> list[BedWaitlist]:
    query = select(BedWaitlist)
    if dept_id:
        query = query.where(BedWaitlist.department_id == dept_id)
    rank = {"紧急": 0, "优先": 1, "常规": 2}
    rows = list(db.scalars(query).all())
    return sorted(rows, key=lambda r: (0 if r.status == "候补中" else 1, rank.get(r.priority, 9), r.applied_at))


def ensure_replan_for_dept(db: Session, user: User, dept_id: str) -> Plan | None:
    """On bed release: create one pending plan for the dept if candidates exist."""
    existing = db.scalar(select(Plan).where(
        Plan.kind == "bed", Plan.status == "待审批", Plan.department_id == dept_id))
    if existing:
        return existing
    plan, draft, error = create_plan(db, user, dept_id)
    if plan and not error:
        audit(db, user, "bed.auto_replan", plan.id,
              f"床位释放后自动触发重新匹配，生成待审批方案 {plan.id}")
        db.commit()
    return plan


def execute_plan(db: Session, plan: Plan, user: User, approval: dict) -> tuple[bool, list[str], int]:
    live = validate_plan(db, plan.matched or [])
    if not live["valid"]:
        return False, live["blockers"], 0
    try:
        prepared = []
        for m in plan.matched or []:
            bed = db.scalar(select(Bed).where(Bed.id == m["bed_id"]).with_for_update())
            adm = db.get(Admission, m["admission_id"])
            if not bed or not adm:
                raise ValueError("资源不存在")
            errors = bed_eligibility(bed, adm)
            if errors:
                raise ValueError("；".join(errors))
            if bed.version != m.get("expected_version"):
                raise ValueError(f"床位 {bed.code} 版本已变化")
            prepared.append((bed, adm, m))
        for bed, adm, m in prepared:
            bed.status = "已入住"
            bed.patient_id = adm.patient_id
            bed.patient_name = adm.name
            bed.admission_id = adm.id
            bed.occupied_at = now()
            bed.expected_discharge = add_days(today(), adm.expected_stay or 5)
            bed.expected_discharge_time = "12:00"
            bed.version += 1
            adm.status = "已分配"
            adm.assigned_bed_id = bed.id
            adm.assigned_at = now()
            patient = db.get(Patient, adm.patient_id)
            if patient:
                patient.patient_type = "住院"
                patient.status = "住院"
                patient.bed_id = bed.id
                patient.bed_code = bed.code
                patient.ward_name = bed.ward_name
                patient.admitted_at = now()
                patient.expected_discharge = bed.expected_discharge
        mark_waitlist_assigned(db, [a.id for _, a, _ in prepared],
                               {a.id: b.id for b, a, _ in prepared})
        plan.status = "执行成功"
        plan.approval = approval
        plan.execution = {"at": now(), "result": "success", "count": len(prepared),
                          "detail": f"Bed MCP 已分配 {len(prepared)} 张床位，事务提交成功",
                          "assignments": [{"bed_id": b.id, "bed_code": b.code, "admission_id": a.id,
                                           "patient_name": a.name} for b, a, _ in prepared]}
        audit(db, user, "plan.approve", plan.id, plan.execution["detail"])
        audit(db, None, "mcp.bed.allocate", plan.id, plan.execution["detail"])
        db.commit()
        return True, [], len(prepared)
    except Exception as exc:
        db.rollback()
        return False, [str(exc)], 0


def reject_plan(db: Session, plan: Plan, user: User, approval: dict) -> None:
    plan.status = "已驳回"
    plan.approval = approval
    audit(db, user, "plan.reject", plan.id, f"驳回方案：{approval.get('comment', '')}")
    db.commit()


def manual_assign(db: Session, user: User, admission_id: str, bed_id: str) -> tuple[bool, str]:
    bed = db.get(Bed, bed_id)
    adm = db.get(Admission, admission_id)
    if not bed or not adm:
        return False, "床位或入院申请不存在"
    errors = bed_eligibility(bed, adm)
    if errors:
        return False, "；".join(errors)
    bed.status = "已入住"
    bed.patient_id = adm.patient_id
    bed.patient_name = adm.name
    bed.admission_id = adm.id
    bed.occupied_at = now()
    bed.expected_discharge = add_days(today(), adm.expected_stay or 5)
    bed.version += 1
    adm.status = "已分配"
    adm.assigned_bed_id = bed.id
    adm.assigned_at = now()
    mark_waitlist_assigned(db, [adm.id], {adm.id: bed.id})
    audit(db, user, "bed.manual_assign", bed_id, f"手动分配床位给 {adm.name}")
    db.commit()
    return True, "床位分配成功"


def discharge(db: Session, user: User, bed_id: str) -> tuple[bool, str]:
    bed = db.get(Bed, bed_id)
    if not bed or bed.status != "已入住":
        return False, "只有已入住床位可以办理出院"
    patient = db.get(Patient, bed.patient_id) if bed.patient_id else None
    name = bed.patient_name or ""
    if patient:
        patient.status = "已出院"
        patient.patient_type = "门诊"
        patient.bed_id = None
        patient.bed_code = None
        patient.ward_name = None
    bed.status = "待清洁"
    bed.patient_id = None
    bed.patient_name = None
    bed.admission_id = None
    bed.expected_discharge = None
    bed.cleaning_started_at = now()
    bed.cleaning_deadline = add_days(today(), 0) + " 15:00"
    bed.version += 1
    audit(db, user, "bed.discharge", bed_id, f"{name} 办理出院，床位转入待清洁")
    db.commit()
    return True, f"{name} 已办理出院，床位进入待清洁"


def finish_cleaning(db: Session, user: User, bed_id: str) -> tuple[bool, str]:
    bed = db.get(Bed, bed_id)
    if not bed or bed.status != "待清洁":
        return False, "当前床位不是待清洁状态"
    bed.status = "空闲"
    bed.cleaning_started_at = None
    bed.cleaning_deadline = None
    bed.version += 1
    audit(db, user, "bed.cleaning_done", bed_id, "完成终末清洁与护理复核，床位恢复空闲")
    db.commit()
    plan = ensure_replan_for_dept(db, user, bed.department_id)
    message = "床位已完成清洁复核"
    if plan:
        message += f"；系统已自动重新匹配并生成待审批方案 {plan.id}"
    return True, message


def set_maintenance(db: Session, user: User, bed_id: str, note: str, restore: bool = False) -> tuple[bool, str]:
    bed = db.get(Bed, bed_id)
    if not bed:
        return False, "床位不存在"
    if restore:
        if bed.status not in ("维护中", "暂停使用"):
            return False, "当前床位不在维护/暂停状态"
        bed.status = "空闲"
        bed.maintenance_note = None
        action, detail = "bed.restore", "维护完成，床位恢复空闲"
    else:
        if bed.status != "空闲":
            return False, "只有空闲床位可以转入维护"
        bed.status = "维护中"
        bed.maintenance_note = note or f"设备维护 · {now()}"
        action, detail = "bed.maintenance", f"床位转入维护：{bed.maintenance_note}"
    bed.version += 1
    audit(db, user, action, bed_id, detail)
    db.commit()
    return True, detail
