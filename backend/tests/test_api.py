from __future__ import annotations

from conftest import login


def test_auth_rbac_and_metrics(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.post("/api/v1/auth/login", json={"username": "chenming", "password": "bad"}).status_code == 401

    h = login(client)
    me = client.get("/api/v1/auth/me", headers=h).json()["user"]
    assert me["role"] == "ops"
    overview = client.get("/api/v1/ops/overview", headers=h).json()
    assert overview["kpis"]["total_beds"] == 96
    assert overview["kpis"]["free"] == 11
    assert overview["kpis"]["occupancy"] == 84.4
    assert overview["kpis"]["alos"] == 4.5
    assert overview["kpis"]["waitlist"] == 8

    # ops cannot create an appointment; appointment admin can.
    appt = login(client, "lina")
    body = {"patient_name": "接口测试", "doctor_id": "D-OR-02", "date": "2026-11-08",
            "slot": client.get("/api/v1/appointments/slots/D-OR-02?date=2026-11-08", headers=appt).json()[0]["slot"]}
    assert client.post("/api/v1/appointments", headers=h, json=body).status_code == 403
    res = client.post("/api/v1/appointments", headers=appt, json=body)
    assert res.status_code == 200, res.text


def test_langgraph_interrupt_and_approve(client):
    h = login(client)
    run = client.post("/api/v1/ai/tasks", headers=h,
                      json={"prompt": "帮我制定今天骨科的床位分配方案"}).json()
    assert run["status"] == "awaiting_approval"
    assert run["plan_id"].startswith("BP-")
    plan = client.get(f"/api/v1/approvals/{run['plan_id']}", headers=h).json()
    assert plan["scope"] == "骨科"
    assert len(plan["matched"]) == 3
    assert len(plan["unmatched"]) == 1
    assert plan["live_validation"]["valid"] is True

    res = client.post(f"/api/v1/approvals/{run['plan_id']}/decision", headers=h,
                      json={"decision": "approve", "comment": "同意，按方案执行。"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ok"] is True
    assert data["plan"]["status"] == "执行成功"
    assert data["plan"]["execution"]["count"] == 3
    assert data["workflow"]["status"] == "completed"
    assert data["workflow"]["steps"][-1]["agent"] == "Qwen Agent"
    assert "未配置 Qwen" in data["workflow"]["steps"][-1]["detail"]

    beds = client.get("/api/v1/beds?dept=ortho", headers=h).json()["beds"]
    assert sum(1 for b in beds if b["status"] == "已入住") == 22
    audit = client.get("/api/v1/system/audit", headers=login(client, "zhangwei")).json()
    assert any(a["action"] == "mcp.bed.allocate" for a in audit)


def test_existing_pending_bed_plan_is_reused(client):
    h = login(client)
    first = client.post("/api/v1/ai/tasks", headers=h,
                        json={"prompt": "帮我制定今天骨科的床位分配方案"}).json()
    second = client.post("/api/v1/ai/tasks", headers=h,
                         json={"prompt": "帮我制定今天骨科的床位分配方案"}).json()
    assert first["status"] == "awaiting_approval"
    assert second["status"] == "awaiting_approval"
    assert second["plan_id"] == first["plan_id"]
    assert any(s["agent"] == "Approval Guard" for s in second["steps"])
    pending = client.get("/api/v1/approvals", headers=h, params={"status": "待审批"}).json()
    assert len([p for p in pending if p["kind"] == "bed"]) == 1


def test_unmatched_waitlist_and_bed_release_replan(client):
    h = login(client)
    run = client.post("/api/v1/ai/tasks", headers=h,
                      json={"prompt": "帮我制定今天骨科的床位分配方案"}).json()
    waitlist = client.get("/api/v1/beds/waitlist", headers=h).json()
    assert any(w["admission_id"] and w["status"] == "候补中" for w in waitlist)
    assert any(w["reason"] for w in waitlist)

    rejected = client.post(f"/api/v1/approvals/{run['plan_id']}/decision", headers=h,
                           json={"decision": "reject", "comment": "先等待床位释放。"})
    assert rejected.status_code == 200
    cleaning = [b for b in client.get("/api/v1/beds?dept=ortho", headers=h).json()["beds"]
                if b["status"] == "待清洁"]
    assert cleaning
    released = client.post(f"/api/v1/beds/{cleaning[0]['id']}/cleaning/complete", headers=h)
    assert released.status_code == 200, released.text
    pending = client.get("/api/v1/approvals", headers=h, params={"status": "待审批"}).json()
    assert any(p["kind"] == "bed" and p["department_id"] == "ortho" for p in pending)


def test_demo_event_simulator_creates_data_and_release(client):
    h = login(client)
    before = len(client.get("/api/v1/admissions", headers=h).json())
    created = client.post("/api/v1/demo/events", headers=h, json={"action": "admit"})
    assert created.status_code == 200, created.text
    assert len(created.json()["created"]) == 2
    assert len(client.get("/api/v1/admissions", headers=h).json()) == before + 2

    released = client.post("/api/v1/demo/events", headers=h, json={"action": "release"})
    assert released.status_code == 200, released.text
    data = released.json()
    assert data["release"]["ok"] is True
    assert data["release"]["bed_id"]
    assert data["release"]["plan_id"]


def test_24h_alert_creates_plan_draft(client):
    h = login(client)
    refreshed = client.post("/api/v1/alerts/refresh", headers=h)
    assert refreshed.status_code == 200, refreshed.text
    alerts = client.get("/api/v1/alerts", headers=h).json()
    forecast = [a for a in alerts if a["alert_type"] == "资源预测24h"]
    assert forecast
    assert any(a["related_type"] == "plan" and a["related_id"] for a in forecast)
    assert "待审批" in forecast[0]["suggestion"]


def test_copilot_fallback_without_qwen_key(client):
    h = login(client)
    status = client.get("/api/v1/copilot/status", headers=h).json()
    assert status["configured"] is False
    assert "bed_snapshot" in status["tools"]
    reply = client.post("/api/v1/copilot/chat", headers=h,
                        json={"message": "现在全院还有多少张空床？"}).json()
    assert "空闲" in reply["reply"]
    assert reply["tool_trace"][0]["name"] == "bed_snapshot"


def test_qwen_status_and_rule_fallback(client):
    h = login(client)
    status = client.get("/api/v1/ai/status", headers=h).json()
    assert status["provider"] == "qwen"
    assert status["configured"] is False
    report = client.post("/api/v1/ops/report?days=7", headers=h).json()
    assert report["ai_summary"] is None
    assert report["llm"]["configured"] is False


def test_langgraph_reject_keeps_data(client):
    h = login(client)
    run = client.post("/api/v1/ai/tasks", headers=h,
                      json={"prompt": "帮我制定今天骨科的床位分配方案"}).json()
    before = client.get("/api/v1/beds?dept=ortho", headers=h).json()["beds"]
    res = client.post(f"/api/v1/approvals/{run['plan_id']}/decision", headers=h,
                      json={"decision": "reject", "comment": "床位需保留给急诊。"})
    assert res.status_code == 200, res.text
    assert res.json()["plan"]["status"] == "已驳回"
    after = client.get("/api/v1/beds?dept=ortho", headers=h).json()["beds"]
    assert [(b["id"], b["status"]) for b in before] == [(b["id"], b["status"]) for b in after]


def test_execution_rolls_back_when_resource_changed(client):
    h = login(client)
    run = client.post("/api/v1/ai/tasks", headers=h,
                      json={"prompt": "帮我制定今天骨科的床位分配方案"}).json()
    plan = client.get(f"/api/v1/approvals/{run['plan_id']}", headers=h).json()
    first = plan["matched"][0]
    bed_user = login(client, "wangli")
    manual = client.post(f"/api/v1/beds/{first['bed_id']}/assign", headers=bed_user,
                         json={"admission_id": first["admission_id"]})
    assert manual.status_code == 200, manual.text
    res = client.post(f"/api/v1/approvals/{run['plan_id']}/decision", headers=h,
                      json={"decision": "approve", "comment": "同意。"})
    assert res.status_code == 409
    assert "回滚" in res.json()["detail"] or "变化" in res.json()["detail"]
    beds = {b["id"]: b for b in client.get("/api/v1/beds?dept=ortho", headers=h).json()["beds"]}
    assert beds[first["bed_id"]]["status"] == "已入住"
    for m in plan["matched"][1:]:
        assert beds[m["bed_id"]]["status"] == "空闲"


def test_appointment_waitlist_and_state_machine(client):
    h = login(client, "lina")
    slots = client.get("/api/v1/appointments/slots/D-OR-02?date=2026-11-08", headers=h).json()
    body = {"patient_name": "预约状态测试", "doctor_id": "D-OR-02", "date": "2026-11-08",
            "slot": slots[0]["slot"]}
    created = client.post("/api/v1/appointments", headers=h, json=body)
    assert created.status_code == 200, created.text
    appt = created.json()
    assert client.post("/api/v1/appointments", headers=h, json=body).status_code == 409
    assert client.post(f"/api/v1/appointments/{appt['id']}/checkin", headers=h).json()["status"] == "已签到"
    assert client.post(f"/api/v1/appointments/{appt['id']}/complete", headers=h).json()["status"] == "已完成"

    wait = client.post("/api/v1/appointments/waitlist", headers=h, json={
        "patient_name": "候补接口测试", "dept": "ortho", "preferred_date": "2026-11-08",
        "preferred_period": "下午"})
    assert wait.status_code == 200, wait.text
    promoted = client.post(f"/api/v1/appointments/waitlist/{wait.json()['id']}/promote", headers=h)
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["waitlist"]["status"] == "已转预约"
    assert promoted.json()["appointment"]["source"] == "候补补位"


def test_exam_create_conflict_cancel_and_device_status(client):
    h = login(client, "zhouhang")
    free = client.get("/api/v1/exams/free-slot?device_id=CT-01&date=2026-11-06", headers=h).json()
    assert free.get("start")
    body = {"patient_name": "检查接口测试", "device_id": "CT-01", "date": "2026-11-06",
            "start": free["start"], "duration": 30, "dept": "ortho", "dept_name": "骨科"}
    created = client.post("/api/v1/exams", headers=h, json=body)
    assert created.status_code == 200, created.text
    exam = created.json()
    assert client.post("/api/v1/exams", headers=h, json=body).status_code == 409
    assert client.post(f"/api/v1/exams/{exam['id']}/cancel?reason=测试", headers=h).status_code == 200
    maintained = client.post("/api/v1/devices/MRI-02/status", headers=h,
                             json={"status": "维护中", "note": "年度维护"})
    assert maintained.status_code == 200
    assert client.get("/api/v1/devices", headers=h).json()[3]["status"] == "维护中"


def test_staff_leave_swap_plan_and_approve(client):
    staff_h = login(client, "liufang")
    staff = client.get("/api/v1/staff", headers=staff_h).json()
    chen = next(s for s in staff if s["name"] == "陈晨")
    assert client.post(f"/api/v1/staff/{chen['id']}/leave", headers=staff_h,
                       json={"date": "2026-11-06", "reason": "接口测试"}).status_code == 200
    assert client.post(f"/api/v1/staff/{chen['id']}/swap", headers=staff_h,
                       json={"date": "2026-11-06", "new_shift": "早"}).status_code == 200

    plan = client.post("/api/v1/staff/plans", headers=staff_h)
    assert plan.status_code == 200, plan.text
    plan = plan.json()
    assert len(plan["changes"]) == 2
    ops = login(client, "chenming")
    approved = client.post(f"/api/v1/approvals/{plan['id']}/decision", headers=ops,
                           json={"decision": "approve", "comment": "同意调班。"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["plan"]["status"] == "执行成功"
    conflicts = client.get("/api/v1/staff/conflicts", headers=ops).json()
    assert conflicts == []
    after = client.get("/api/v1/staff", headers=ops).json()
    assert next(s for s in after if s["name"] == "孙悦")["shifts"]["2026-11-07"] == "休"


def test_ai_staff_schedule_creates_approvable_plan(client):
    h = login(client)
    run = client.post("/api/v1/ai/tasks", headers=h,
                      json={"prompt": "生成心内科排班调整方案"}).json()
    assert run["intent"] == "staff_schedule"
    assert run["status"] == "awaiting_approval"
    assert run["plan_id"].startswith("SP-")
    res = client.post(f"/api/v1/approvals/{run['plan_id']}/decision", headers=h,
                      json={"decision": "approve", "comment": "同意调班。"})
    assert res.status_code == 200
    assert res.json()["plan"]["status"] == "执行成功"
    assert all(c["department_id"] != "cardio"
               for c in client.get("/api/v1/staff/conflicts", headers=h).json())


def test_patient_portal_triage_and_booking(client):
    staff = login(client)
    assert client.post("/api/v1/portal/triage", headers=staff, json={
        "age": 56, "sex": "男", "symptoms": "胸痛伴大汗" }).status_code == 403

    h = login(client, "patient")
    assert client.get("/api/v1/auth/me", headers=h).status_code == 200
    assert client.get("/api/v1/ops/overview", headers=h).status_code == 403
    emergency = client.post("/api/v1/portal/triage", headers=h, json={
        "age": 56, "sex": "男", "symptoms": "胸痛伴大汗、呼吸困难", "duration": "20分钟"})
    assert emergency.status_code == 200, emergency.text
    data = emergency.json()
    assert data["urgency"] == "emergency"
    assert data["departments"][0]["name"] == "急诊科"
    assert data["doctors"] == []
    assert "不构成诊断" in data["disclaimer"]

    routine = client.post("/api/v1/portal/triage", headers=h, json={
        "age": 32, "sex": "女", "symptoms": "咳嗽三天，低烧，没有呼吸困难", "duration": "3天"})
    assert routine.status_code == 200, routine.text
    result = routine.json()
    assert result["urgency"] == "routine"
    assert result["departments"][0]["id"] == "resp"
    assert result["doctors"], "应返回呼吸内科医生号源"
    doctor = result["doctors"][0]
    booked = client.post("/api/v1/portal/triage/book", headers=h, json={
        "patient_name": "分诊测试患者", "phone": "139****1234", "gender": "女", "age": 32,
        "doctor_id": doctor["doctor_id"], "date": doctor["date"], "slot": doctor["slots"][0],
        "symptoms": "咳嗽三天，低烧"})
    assert booked.status_code == 200, booked.text
    assert booked.json()["appointment"]["source"] == "AI 分诊"
    mine = client.get("/api/v1/portal/appointments", headers=h).json()
    assert any(a["id"] == booked.json()["appointment"]["id"] for a in mine)
    assert client.post(f"/api/v1/portal/appointments/{booked.json()['appointment']['id']}/checkin",
                       headers=h).status_code == 200


def test_alerts_knowledge_and_user_management(client):
    ops = login(client)
    unread = client.get("/api/v1/alerts/unread-count", headers=ops).json()["count"]
    assert unread > 0
    before = len(client.get("/api/v1/alerts", headers=ops).json())
    refreshed = client.post("/api/v1/alerts/refresh", headers=ops)
    assert refreshed.status_code == 200
    assert refreshed.json()["added"] >= 1
    assert len(client.get("/api/v1/alerts", headers=ops).json()) >= before
    marked = client.post("/api/v1/alerts/read", headers=ops).json()
    assert marked["count"] == 0
    assert client.get("/api/v1/alerts/unread-count", headers=ops).json()["count"] == 0

    doc = client.post("/api/v1/kb/documents", headers=ops, json={
        "title": "接口测试制度", "category": "运营制度", "content": "本制度用于验证知识库上传、切分、检索和版本更新。" * 2})
    assert doc.status_code == 200, doc.text
    doc_id = doc.json()["doc"]
    search = client.post("/api/v1/kb/search", headers=ops, json={"query": "制度 检索"})
    assert search.status_code == 200
    assert any(r["doc_id"] == doc_id for r in search.json()["results"])
    assert client.delete(f"/api/v1/kb/documents/{doc_id}", headers=ops).status_code == 200

    admin = login(client, "zhangwei")
    user = client.post("/api/v1/system/users", headers=admin, json={
        "name": "接口用户", "role": "ops", "dept": "运营管理部"})
    assert user.status_code == 200, user.text
    uid = user.json()["id"]
    assert client.put(f"/api/v1/system/users/{uid}", headers=admin,
                      json={"name": "接口用户改"}).json()["name"] == "接口用户改"
    assert client.post(f"/api/v1/system/users/{uid}/toggle", headers=admin).json()["status"] == "停用"


def test_seeded_equipment_plan_is_approved_atomically(client):
    ops = login(client)
    plan = client.get("/api/v1/approvals/AP-20261106-001", headers=ops).json()
    exam_id = plan["changes"][0].get("exam_id") or plan["changes"][0]["examId"]
    before = client.get(f"/api/v1/exams/{exam_id}", headers=ops).json()["start"]
    res = client.post("/api/v1/approvals/AP-20261106-001/decision", headers=ops,
                      json={"decision": "approve", "comment": "同意调整。"})
    assert res.status_code == 200, res.text
    assert res.json()["plan"]["status"] == "执行成功"
    after = client.get(f"/api/v1/exams/{exam_id}", headers=ops).json()
    assert after["start"] != before
    assert after["start"] == "15:30"
    processed = client.get("/api/v1/approvals/AP-20261106-001", headers=ops).json()
    assert processed["live_validation"]["archived"] is True
    assert processed["live_validation"]["valid"] is True
    assert "已归档" in processed["live_validation"]["message"]
