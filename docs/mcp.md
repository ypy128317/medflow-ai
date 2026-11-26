# MedFlow AI · MCP 工具契约

> 零构建演示前端在浏览器进程中模拟 MCP 工具调用；`backend/mcp_server.py` 已提供独立 stdio MCP Server，先实现了床位快照/校验/执行、检查冲突、人员负载、知识检索和 KPI 工具。
> 本文件保留完整目标契约；生产版应继续把各工具拆成独立进程，只暴露显式工具，不暴露 SQL 或数据库连接。

## 1. Server 划分

| Server | 工具 | 读/写 |
|---|---|---|
| Bed MCP | `bed.read_snapshot` | 读 |
| Bed MCP | `bed.read_bed` | 读 |
| Bed MCP | `bed.validate_plan` | 读 |
| Bed MCP | `bed.allocate` | 写（需审批） |
| Bed MCP | `bed.discharge` | 写 |
| Bed MCP | `bed.finish_cleaning` | 写 |
| Exam MCP | `exam.find_conflicts` | 读 |
| Exam MCP | `exam.validate_plan` | 读 |
| Exam MCP | `exam.reschedule` | 写（需审批） |
| Appointment MCP | `appointment.summary` | 读 |
| Appointment MCP | `appointment.available_slots` | 读 |
| Appointment MCP | `appointment.create` | 写 |
| Staff MCP | `staff.workload` | 读 |
| Knowledge Server | `kb.search` | 读 |
| Approval Server | `approval.create` | 写（仅创建审批单） |

## 2. 通用要求

- 所有工具必须带 `trace_id`、`workflow_id`、`caller`（服务身份，不是用户 token）。
- 写工具额外要求：
  - `approval_id`：已批准且未执行的审批单；
  - `idempotency_key`：24 小时内幂等；
  - `expected_version`：资源快照版本；
  - `plan_version`：方案版本。
- 返回值只包含必要字段，患者姓名/电话等根据调用方权限脱敏。
- 工具调用超时：读 3s，写 10s；写操作必须具备事务或补偿。
- 任何工具错误都返回结构化错误码，不把内部堆栈返回给模型。

## 3. `bed.read_snapshot`

读取指定范围的床位、待入院和释放计划。

请求：

```json
{
  "scope": {"dept_id": "ortho", "ward_id": null},
  "include_expected_discharge": true,
  "as_of": "2026-11-06T14:20:00+08:00"
}
```

响应：

```json
{
  "as_of": "2026-11-06T14:20:00+08:00",
  "scope": {"dept_id": "ortho", "name": "骨科"},
  "summary": {
    "total_beds": 24,
    "occupied": 19,
    "free": 3,
    "cleaning": 1,
    "maintenance": 1,
    "reserved": 0,
    "pending_admissions": 4,
    "expected_discharge_today": 3
  },
  "beds": [
    {
      "bed_id": "ORTHO-A-03", "code": "301-3", "ward_id": "ORTHO-A",
      "type": "三人间", "gender_policy": "男", "status": "free",
      "features": ["靠近护士站", "靠窗"], "version": 3
    }
  ],
  "pending_admissions": [
    {
      "admission_id": "ADM-20261106-001", "patient_name": "张建国",
      "gender": "male", "age": 67, "bed_type": "三人间",
      "priority": "优先", "priority_source": "attending_physician",
      "applied_at": "2026-11-06T08:12:00+08:00",
      "required_features": ["靠近护士站"], "isolation": false
    }
  ],
  "expected_discharge": [
    {"bed_id": "ORTHO-A-12", "time": "16:00", "status": "待出院"}
  ]
}
```

## 4. `bed.validate_plan`

请求：

```json
{
  "plan": {
    "scope": "骨科",
    "matched": [
      {
        "admission_id": "ADM-20261106-001",
        "bed_id": "ORTHO-A-03",
        "expected_version": 3
      }
    ]
  }
}
```

响应：

```json
{
  "valid": true,
  "checked_at": "2026-11-06T14:21:00+08:00",
  "checks": [
    {"name": "床位状态", "pass": true, "detail": "3 张床位均为空闲"},
    {"name": "重复占用", "pass": true, "detail": "无重复"},
    {"name": "类型/性别/隔离", "pass": true, "detail": "硬约束通过"},
    {"name": "版本", "pass": true, "detail": "快照版本一致"}
  ],
  "blockers": [],
  "warnings": ["1 位患者未匹配，需候补"]
}
```

## 5. `bed.allocate`

请求：

```json
{
  "plan_id": "BP-20261106-001",
  "plan_version": 1,
  "approval_id": "AP-20261106-010",
  "assignments": [
    {"bed_id": "ORTHO-A-03", "admission_id": "ADM-20261106-001", "expected_version": 3}
  ],
  "idempotency_key": "bed-alloc-BP-20261106-001-v1",
  "trace_id": "trace_..."
}
```

成功：

```json
{
  "ok": true,
  "changed": 1,
  "assignments": [
    {"bed_id": "ORTHO-A-03", "bed_code": "301-3", "admission_id": "ADM-20261106-001", "patient_name": "张建国"}
  ],
  "executed_at": "2026-11-06T14:23:00+08:00"
}
```

失败（整单回滚）：

```json
{
  "ok": false,
  "changed": 0,
  "error": {
    "code": "PLAN_STALE",
    "message": "执行前复核失败，已整单回滚",
    "details": ["床位 301-3 当前状态为已入住"]
  }
}
```

服务端实现必须：

1. 在一个事务里 `SELECT ... FOR UPDATE` 锁定所有床位与申请；
2. 重新校验状态、版本、患者占用；
3. 更新床位（`patient_id`, `status`, `version+1`）、入院申请、患者；
4. 写 `audit_log` 与 `bed_assignment`；
5. 提交；任何失败 rollback。

## 6. `bed.discharge` / `bed.finish_cleaning`

`bed.discharge`：

```json
{"bed_id": "ORTHO-A-12", "operator_id": "u-bed", "reason": "医嘱出院", "idempotency_key": "..."}
```

响应：

```json
{"ok": true, "bed_status": "cleaning", "cleaning_deadline": "2026-11-06T16:30:00+08:00"}
```

`bed.finish_cleaning`：

```json
{"bed_id": "ORTHO-A-12", "operator_id": "u-bed", "checklist": ["终末清洁", "床单位更换", "护理复核"]}
```

只有 `待清洁` → `空闲`，并写审计。

## 7. `exam.find_conflicts`

请求：

```json
{"date": "2026-11-07", "device_type": "CT", "device_ids": ["CT-02"]}
```

响应：

```json
{
  "conflicts": [
    {
      "device_id": "CT-02",
      "overlap_minutes": 15,
      "a": {"exam_id": "EX-...0314", "start": "09:20", "end": "09:50", "priority": "优先"},
      "b": {"exam_id": "EX-...0315", "start": "09:35", "end": "10:05", "priority": "常规"}
    }
  ]
}
```

## 8. `exam.reschedule`

请求：

```json
{
  "plan_id": "AP-20261106-002",
  "plan_version": 1,
  "approval_id": "AP-20261106-011",
  "changes": [
    {"exam_id": "EX-...0315", "expected_start": "09:35", "new_start": "10:15", "new_end": "10:45"}
  ],
  "idempotency_key": "exam-resched-..."
}
```

约束：

- 只允许移动 `常规` 检查；`优先/紧急` 不动；
- 执行前校验原时段未被修改、目标时段未被占用、设备无维护；
- 所有变更在同一事务中提交。

## 9. `appointment.available_slots` / `appointment.create`

`available_slots`：

```json
{"doctor_id": "D-OR-01", "date": "2026-11-07"}
```

响应：

```json
{"slots": [{"slot": "10:30", "available": true}], "source": "doctor_schedule"}
```

`create`：

```json
{
  "patient": {"name": "张伟", "phone": "137****1000", "gender": "male", "age": 35},
  "doctor_id": "D-OR-01",
  "date": "2026-11-07",
  "slot": "10:30",
  "idempotency_key": "..."
}
```

业务错误：`DUPLICATE_APPOINTMENT`、`SLOT_TAKEN`、`INVALID_SLOT`。

## 10. `staff.workload`

```json
{"week_start": "2026-11-02", "dept_id": "cardio"}
```

响应包含人员、班次、周工时、夜班数、冲突、负载分。

## 11. `kb.search`

```json
{"query": "床位分配 单人间 审批", "top_k": 4, "filters": {"category": "床位管理"}}
```

响应：

```json
{
  "results": [
    {
      "chunk_id": "KB-001-04",
      "document_id": "KB-001",
      "title": "床位分配与调整管理制度（2026 版）",
      "heading": "4.2 审批与执行",
      "content": "床位分配方案须由医院运营主管审批……",
      "relevance": 0.96,
      "version": "v2026.3"
    }
  ]
}
```

## 12. 安全与审计

- MCP Server 使用服务间 mTLS 或内网 token，不接受浏览器直连。
- 工具调用日志只记录参数摘要，不记录完整患者隐私。
- 写工具的 `approval_id` 必须由 Approval Server 校验：状态为 `approved`、方案版本一致、尚未执行。
- 禁止向模型暴露 `bed.allocate` 等写工具的原始执行能力；模型只能发起审批单。
- 生产环境对 `bed.allocate` 加限流、告警和人工复核开关。
