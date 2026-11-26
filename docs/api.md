# MedFlow AI · API 契约（生产化目标）

> 当前仓库的 `backend/` 已实现第一版 FastAPI 服务，启动后可在 `/docs` 查看真实 OpenAPI。本文件保留目标契约；当前实现使用 FastAPI 原生响应，尚未统一 `data/meta/error` 包装、分页参数和 `Idempotency-Key`，以 Swagger 为准。

> 早期零构建演示仍可在浏览器内独立运行。

## 0. 约定

- Base URL：`/api/v1`
- 认证：`Authorization: Bearer <JWT>`
- 内容：`application/json; charset=utf-8`
- 时间：ISO 8601，带时区，例如 `2026-11-06T14:20:00+08:00`
- 分页：`page`（从 1 开始）、`page_size`（默认 20，最大 100）
- 幂等：写接口接受 `Idempotency-Key` 请求头，24 小时内相同 key 返回原结果
- 统一响应：

```json
{
  "data": {},
  "meta": {"request_id": "req_01...", "page": 1, "page_size": 20, "total": 64},
  "error": null
}
```

错误：

```json
{
  "data": null,
  "error": {
    "code": "BED_VERSION_CONFLICT",
    "message": "床位 301-3 状态已变化，方案失效",
    "details": [{"bed_id": "ORTHO-A-03", "expected_version": 3, "current_version": 4}]
  }
}
```

## 1. 认证与当前用户

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 用户名/密码登录，返回 JWT + 用户 |
| POST | `/auth/refresh` | 刷新 token |
| POST | `/auth/logout` | 注销 |
| GET | `/me` | 当前用户、角色、数据范围、权限 |

登录请求：

```json
{"username": "chenming", "password": "******"}
```

响应：

```json
{
  "data": {
    "access_token": "eyJ...",
    "expires_in": 3600,
    "user": {
      "id": "u-ops",
      "name": "陈明",
      "role": "ops",
      "role_name": "医院运营主管",
      "dept": "运营管理部",
      "permissions": ["approval.decide", "plan.create", "alert.handle"]
    }
  }
}
```

## 2. 运营驾驶舱

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ops/overview?date=2026-11-06` | KPI、趋势、床位分布、科室排名 |
| GET | `/ops/alerts?status=open&level=high` | 预警列表 |
| GET | `/ops/analytics?from=...&to=...` | 统计与趋势 |
| POST | `/ops/reports` | 生成 AI 报告（返回任务 ID 或同步结果） |

`/ops/overview` 响应片段：

```json
{
  "data": {
    "kpis": {
      "appointments": 64,
      "visits": 37,
      "inpatients": 81,
      "available_beds": 11,
      "occupancy_rate": 84.4,
      "equipment_utilization": 67.4,
      "avg_wait_minutes": 18,
      "pending_tasks": 1,
      "open_alerts": 8
    },
    "bed_status": [
      {"status": "空闲", "count": 11},
      {"status": "已入住", "count": 81},
      {"status": "待清洁", "count": 2}
    ],
    "trend": {
      "labels": ["10/31", "11/01"],
      "appointments": [52, 58],
      "occupancy": [81.2, 82.3]
    }
  }
}
```

## 3. 患者与入院

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/patients?query=&type=&dept=&page=` | 患者列表 |
| GET | `/patients/{id}` | 患者详情 |
| POST | `/patients` | 新建患者（演示版由入院/预约创建） |
| GET | `/admissions?status=&dept=` | 入院申请 |
| POST | `/admissions` | 新建申请 |
| GET | `/admissions/{id}` | 申请详情 |

新建入院申请：

```json
{
  "patient": {"name": "张建国", "gender": "male", "age": 67, "phone": "138****3107"},
  "dept_id": "ortho",
  "bed_type": "三人间",
  "priority": "优先",
  "priority_source": "attending_physician",
  "diagnosis": "股骨颈骨折术后复查",
  "care_level": "二级护理",
  "expected_stay_days": 7,
  "required_features": ["靠近护士站"],
  "isolation": false,
  "note": "需助行器；家属陪护 1 人"
}
```

> `priority` 必须由主管医师端写入。运营/调度服务只有读权限。

## 4. 床位

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/beds?ward_id=&status=&query=` | 床位快照 |
| GET | `/beds/{id}` | 床位详情、版本、操作记录 |
| POST | `/beds/{id}/assign` | 手动分配（需 bed.manage + 审批策略） |
| POST | `/beds/{id}/discharge` | 办理出院 → 待清洁 |
| POST | `/beds/{id}/cleaning/complete` | 清洁复核 → 空闲 |
| POST | `/beds/{id}/maintenance` | 转入维护 |
| POST | `/beds/{id}/restore` | 恢复空闲 |
| GET | `/wards` | 病区与床位统计 |

床位详情：

```json
{
  "data": {
    "id": "ORTHO-A-03",
    "code": "301-3",
    "ward": {"id": "ORTHO-A", "name": "骨科一病区"},
    "type": "三人间",
    "gender_policy": "男",
    "status": "空闲",
    "features": ["靠近护士站", "靠窗"],
    "version": 3,
    "patient": null,
    "cleaning_deadline": null,
    "expected_discharge": null
  }
}
```

手动分配请求：

```json
{"admission_id": "ADM-20261106-001", "comment": "运营主管授权分配"}
```

冲突返回 `409 BED_VERSION_CONFLICT` 或 `409 BED_NOT_AVAILABLE`。

## 5. 预约

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/appointments?date=&status=&dept=` | 预约列表 |
| GET | `/appointments/slots?doctor_id=&date=` | 可用号源 |
| GET | `/appointments/recommend?dept_id=&date=&patient_name=` | AI 推荐（只读） |
| POST | `/appointments` | 创建预约（需 appointment.manage） |
| POST | `/appointments/{id}/cancel` | 取消预约 |
| GET | `/doctors?dept_id=` | 医生与出诊 |
| GET | `/appointments/waitlist` | 候补队列 |

创建请求：

```json
{
  "patient": {"name": "张伟", "phone": "137****1000", "gender": "male", "age": 35},
  "doctor_id": "D-OR-01",
  "date": "2026-11-07",
  "slot": "09:10",
  "reason": "腰椎复诊"
}
```

可能错误：

- `409 DUPLICATE_APPOINTMENT`：同患者同医生同日已有有效预约；
- `409 SLOT_TAKEN`：号源已被占用；
- `422 INVALID_SLOT`：不在医生出诊号源内。

## 6. 检查资源

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/devices?date=` | 设备与利用率 |
| GET | `/exams?date=&device_id=&status=` | 检查列表 |
| GET | `/exams/conflicts?date=&device_type=` | 冲突检测 |
| GET | `/exams/{id}` | 检查详情 |
| POST | `/exams` | 创建检查预约 |
| POST | `/exams/{id}/cancel` | 取消 |
| GET | `/devices/{id}/schedule?date=` | 时段排程 |

冲突响应：

```json
{
  "data": [
    {
      "device_id": "CT-01",
      "date": "2026-11-06",
      "overlap_minutes": 15,
      "a": {"exam_id": "EX-...0312", "start": "14:30", "end": "15:00", "priority": "优先"},
      "b": {"exam_id": "EX-...0313", "start": "14:45", "end": "15:15", "priority": "常规"}
    }
  ]
}
```

## 7. AI 任务 / 工作流

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/ai/tasks` | 提交自然语言任务 |
| GET | `/ai/tasks/{id}` | 查询任务、节点、工具调用、结果 |
| GET | `/ai/tasks/{id}/events` | SSE：节点进度、interrupt、完成 |
| POST | `/ai/tasks/{id}/cancel` | 取消（未进入写操作时） |
| GET | `/ai/tasks?page=` | 任务历史 |

创建任务：

```json
{"prompt": "帮我制定今天骨科的床位分配方案", "client_request_id": "demo-001"}
```

响应：

```json
{
  "data": {
    "task_id": "WF-20261106-004",
    "intent": "bed_schedule",
    "status": "running",
    "stream_url": "/api/v1/ai/tasks/WF-20261106-004/events"
  }
}
```

任务详情：

```json
{
  "data": {
    "task_id": "WF-20261106-004",
    "status": "awaiting_approval",
    "intent": {"code": "bed_schedule", "label": "床位调度", "confidence": 0.97},
    "nodes": [
      {"name": "coordinator", "status": "done", "duration_ms": 240},
      {"name": "query_data", "status": "done", "duration_ms": 182},
      {"name": "retrieve_rules", "status": "done", "duration_ms": 96},
      {"name": "plan", "status": "done", "duration_ms": 217},
      {"name": "validate", "status": "done", "duration_ms": 84},
      {"name": "approval", "status": "interrupted", "duration_ms": null}
    ],
    "tool_calls": [
      {"server": "Bed MCP", "tool": "bed.read_snapshot", "duration_ms": 64, "result_summary": "96 beds"}
    ],
    "plan_id": "BP-20261106-001"
  }
}
```

SSE 事件：

```text
event: node
data: {"node":"coordinator","status":"running"}

event: node
data: {"node":"coordinator","status":"done","duration_ms":240}

event: interrupt
data: {"type":"approval_required","plan_id":"BP-20261106-001","approval_url":"/approvals/BP-20261106-001"}

event: done
data: {"status":"awaiting_approval"}
```

## 8. 审批

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/approvals?status=pending` | 审批列表 |
| GET | `/approvals/{id}` | 方案、实时复核、引用、历史 |
| POST | `/approvals/{id}/decision` | 批准/驳回（需 approval.decide） |
| GET | `/approvals/{id}/audit` | 审批与执行审计 |

决策请求：

```json
{"decision": "approve", "comment": "同意，按方案执行。"}
```

批准后的响应：

```json
{
  "data": {
    "approval_id": "BP-20261106-001",
    "status": "executed",
    "execution": {
      "changed": 3,
      "assignments": [
        {"bed_id": "ORTHO-A-03", "bed_code": "301-3", "patient_name": "张建国"}
      ],
      "executed_at": "2026-11-06T14:23:00+08:00"
    }
  }
}
```

执行失败：

```json
{
  "data": null,
  "error": {
    "code": "PLAN_STALE",
    "message": "执行前复核失败，已整单回滚",
    "details": ["床位 301-3 当前状态为已入住"],
    "execution": {"changed": 0}
  }
}
```

## 9. 预警与知识库

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/alerts?status=&level=` | 预警 |
| POST | `/alerts/{id}/handle` | 处理/忽略，必须写说明 |
| GET | `/kb/documents` | 文档列表 |
| POST | `/kb/documents` | 上传/解析/切分/向量化 |
| DELETE | `/kb/documents/{id}` | 删除并重建索引 |
| POST | `/kb/search` | 检索（返回片段、相关度、引用） |

检索请求：

```json
{"query": "床位分配 单人间 审批", "top_k": 4, "filters": {"category": "床位管理"}}
```

## 10. 审计

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/audit?actor=&action=&target=&from=&to=` | 审计检索（需 admin/ops） |
| GET | `/audit/{id}` | 单条详情 |

审计条目：

```json
{
  "id": "LOG-20261106-0009",
  "at": "2026-11-06T14:23:00+08:00",
  "actor": {"id": "u-ops", "name": "陈明", "role": "ops"},
  "action": "mcp.bed.allocate",
  "target": "BP-20261106-001",
  "detail": "Bed MCP 已分配 3 张床位，事务提交成功",
  "trace_id": "trace_...",
  "ip": "10.24.8.21",
  "result": "success"
}
```

## 11. 错误码

| Code | HTTP | 含义 |
|---|---:|---|
| `UNAUTHORIZED` | 401 | 未登录/token 失效 |
| `FORBIDDEN` | 403 | 角色无权限 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 422 | 参数校验失败 |
| `DUPLICATE_APPOINTMENT` | 409 | 重复预约 |
| `SLOT_TAKEN` | 409 | 号源占用 |
| `BED_NOT_AVAILABLE` | 409 | 床位不可用 |
| `BED_VERSION_CONFLICT` | 409 | 床位版本变化 |
| `PLAN_STALE` | 409 | 审批期间资源变化，执行回滚 |
| `APPROVAL_REQUIRED` | 428 | 缺少人工审批 |
| `IDEMPOTENCY_CONFLICT` | 409 | 幂等键重复但参数不同 |
| `RATE_LIMITED` | 429 | 限流 |

## AI 分诊助手（独立患者端）

```text
POST /portal/triage
POST /portal/triage/book
```

`POST /portal/triage` 只返回分诊结果，不写入病历：

```json
{
  "age": 32,
  "sex": "女",
  "symptoms": "咳嗽三天，低烧，没有呼吸困难",
  "duration": "3天"
}
```

返回 `urgency`、`red_flags`、`departments`、`doctors`、`advice`、`disclaimer`、`bed_note`。命中胸痛、呼吸困难、意识障碍等红旗时直接返回急诊建议，不推荐普通门诊。

`POST /portal/triage/book` 在患者确认后创建预约；不直接分配床位，住院必须由医生面诊后走入院流程。Qwen 只解释科室和紧迫度，后端会过滤诊断性措辞。


## AI Copilot（医院内部）

```text
GET  /copilot/status
POST /copilot/chat
```

`POST /copilot/chat`：

```json
{"message": "帮我制定今天骨科的床位分配方案", "session_id": "CS-..."}
```

返回 `reply`、`tool_trace`、`plan_id`、`session_id`、`qwen`。Qwen 可自主调用运营 KPI、床位快照、生成待审批床位方案、号源、检查冲突、排班冲突、预警和知识库工具。

`create_bed_plan` 仅创建待审批草稿，仍受 `plan.create` 权限限制；Copilot 不能审批或执行。
