# MedFlow AI · 架构说明

> 本文件描述演示版的实际实现，以及迁移到 PRD 目标技术栈时的落点。
> 演示版把核心领域规则、审批事务和 RAG 检索做成真实可运行代码；在线模型、MCP Server、PostgreSQL 和 JWT 是生产化替换项。

## 1. 分层

```text
┌──────────────────────────────────────────────────────────────┐
│ 表现层  Vue3 / Vite / Pinia / Element Plus / ECharts         │
│         演示版：原生 ES5 兼容的 SPA + SVG 图表（零依赖）       │
├──────────────────────────────────────────────────────────────┤
│ API 层  FastAPI Router + Pydantic + JWT + RBAC Middleware     │
│         演示版：store.js 中的权限校验 + 本地状态               │
├──────────────────────────────────────────────────────────────┤
│ 业务层  预约 / 床位 / 检查 / 人员 / 预警 / 知识库领域服务      │
│         演示版：engine.js + store.js                          │
├──────────────────────────────────────────────────────────────┤
│ AI 层   LangGraph StateGraph + LangChain + RAG + 通义千问      │
│         演示版：app.js 内的异步工作流 + engine.js 意图/检索    │
├──────────────────────────────────────────────────────────────┤
│ 工具层  MCP Server：Bed / Exam / Appointment / Staff          │
│         演示版：进程内 Tool Adapter，记录参数、结果、耗时       │
├──────────────────────────────────────────────────────────────┤
│ 数据层  PostgreSQL + Redis + 向量数据库                        │
│         演示版：固定种子数据 + localStorage                    │
└──────────────────────────────────────────────────────────────┘
```

核心原则：**AI 不直接修改数据库。** 所有写操作必须经过：

```text
身份认证 → RBAC → 业务规则 → 人工审批 → 执行前复核 → 事务提交 → 审计
```

## 2. 演示版模块

| 文件 | 责任 | 生产落点 |
|---|---|---|
| `js/data.js` | 固定种子的合成数据、制度、预案 | PostgreSQL seed / 数据导入 |
| `js/engine.js` | 床位匹配、冲突检测、预测、RAG、意图、指标、报告 | Python 领域服务 + 统计服务 |
| `js/store.js` | 状态、RBAC、审批决策、事务、审计、持久化 | FastAPI application service + Unit of Work |
| `js/ui.js` | 图标、卡片、表格、SVG 图表 | Vue3 组件库 |
| `js/app.js` | 路由、14 个页面、工作流编排、交互 | Vue3 页面 + LangGraph client |
| `tests/test_engine.js` | 纯领域单元测试 | pytest |
| `tests/browser_smoke.js` | 浏览器端到端闭环 | Playwright |

### 2.1 演示版补齐的业务闭环

| 模块 | 已实现 |
|---|---|
| 预约 | 候补登记、按候补顺序补位、签到、完成、改约；补位/改约重新校验重复和号源占用 |
| 检查 | 新建检查（冲突阻断、推荐空档）、取消检查、设备转维护/恢复；有未完成检查时禁止维护 |
| 排班 | 请假、调班、夜班 11 小时校验、AI 排班草案、审批发布、冲突自动消除 |
| 预警 | 规则引擎：全院/科室床位、清洁超时、检查冲突、人员冲突、取消率、未来压力 |
| 分析 | 平均住院日（ALOS）与 7/30 天报告 |
| 知识库 | 文本导入、文档编辑重建、64 维哈希向量 + 关键词混合检索 |
| 系统 | 用户新增/编辑/停用、角色权限矩阵、审计 |
| AI 分诊（独立患者端） | 患者 H5：症状采集、急症红旗筛查、科室/医生/号源推荐、确认预约、我的预约；不诊断、不直接分床 |
| 床位候补 | 未匹配患者自动进入候补，保留原始需求/原因，按优先级和申请时间排序 |
| 释放重匹配 | 清洁完成释放床位后，自动扫描待入院患者并生成待审批方案 |
| 24h 预警 | 未来 24 小时床位缺口预警，同时生成方案草稿，不自动执行 |
| AI Copilot | Qwen Function Calling 多轮对话，自动选择数据/方案工具，生成待审批方案并展示工具轨迹 |

> 哈希向量是浏览器内的确定性演示实现；生产环境用 bge-m3 + pgvector/Milvus。

## 2.2 FastAPI 后端落地

`backend/` 已实现与本文档对应的第一版服务端：

- `app/main.py`：FastAPI 入口、CORS、`/api/v1` 路由、`/demo` 静态演示。
- `app/models.py`：SQLAlchemy 2 模型，默认 SQLite，`DATABASE_URL` 切换 PostgreSQL。
- `app/security.py`：PBKDF2 密码哈希 + HS256 JWT + 接口级 RBAC。
- `app/workflow.py`：LangGraph `StateGraph` + `interrupt()` + `Command(resume=...)`，`SqliteSaver` 持久化 checkpoint。
- `app/services/`：床位、预约、检查、排班、预警、知识库、指标等领域服务；审批执行使用数据库事务和版本复核。
- `mcp_server.py`：独立 stdio MCP Server，和 API 共用领域服务。
- `backend/tests/`：pytest 覆盖 interrupt/resume、批准、驳回、回滚、RBAC、预约、检查、排班、知识库、用户、MCP。

`web/` 已提供 Vue 3 + Vite + Pinia 前端，通过 `/api/v1` 异步调用后端；根目录零构建演示作为独立产品原型保留。

## 3. AI 调度工作流

### 3.1 Agent 角色

| Agent | 职责 | 工具 |
|---|---|---|
| Coordinator | 意图识别、任务拆解、范围确认 | 无 |
| Data Analysis | 床位、申请、检查、预约、人员快照 | Bed / Exam / Appointment / Staff MCP |
| Knowledge Agent | 检索制度条款，提供规则依据 | Knowledge RAG |
| Bed Scheduling | 生成可解释的床位候选方案 | Planner |
| Equipment Agent | 生成检查时段调整建议 | Planner |
| Validator | 状态、重复占用、类型、性别、隔离、版本校验 | Bed / Exam MCP |
| Report Agent | 用已计算指标组织报告 | 无（禁止编造数字） |
| Human Approval | `interrupt()` 暂停，等待授权人 | Approval Service |

### 3.2 状态机

```text
START
  │
  ▼
understand ──► query_data ──► retrieve_rules
                                  │
                                  ▼
                             generate_plan
                                  │
                                  ▼
                              validate
                         ┌────────┴────────┐
                     blockers            pass
                         │                  │
                         ▼                  ▼
                    re-plan / fail     interrupt
                                           │
                              ┌────────────┴────────────┐
                          approve                    reject
                              │                        │
                              ▼                        ▼
                    revalidate_live               mark_rejected
                     ┌───────┴────────┐               │
                   pass             fail              ▼
                     │                │             END
                     ▼                ▼
              execute_write      rollback_all
                     │                │
                     └────────┬───────┘
                              ▼
                         report_result
                              │
                              ▼
                             END
```

演示版在 `app.js runWorkflow()` 中实现同样的节点顺序；`ui.workflow.status` 对应 `running / awaiting_approval / completed / failed`。生产版：

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver

graph = StateGraph(WorkflowState)
graph.add_node("coordinator", coordinator)
graph.add_node("query_data", query_data)
graph.add_node("retrieve_rules", retrieve_rules)
graph.add_node("plan", generate_plan)
graph.add_node("validate", validate_plan)
graph.add_node("approval", interrupt_before_write)   # 内部调用 interrupt()
graph.add_node("execute", execute_approved_plan)
...
checkpointer = PostgresSaver.from_conn_string(POSTGRES_DSN)
app = graph.compile(checkpointer=checkpointer, interrupt_before=["approval"])
```

### 3.3 MCP 工具边界

读工具：

- `bed.read_snapshot(scope, include_expected_discharge)`
- `bed.validate_plan(plan_id)`
- `exam.find_conflicts(date, device_type)`
- `appointment.check_slot(doctor_id, start_at)`
- `staff.workload(week, dept)`
- `kb.search(query, top_k)`

写工具（仅审批后调用）：

- `bed.allocate(plan_id, approval_id, idempotency_key)`
- `bed.discharge(bed_id, operator)`
- `bed.finish_cleaning(bed_id, operator)`
- `exam.reschedule(plan_id, approval_id)`
- `appointment.create(payload)`

工具契约详见 [`mcp.md`](mcp.md)。

## 4. 床位调度算法

### 4.1 输入

- 待分配入院申请（科室、床位类型、性别、隔离、设施、主管医师优先级、申请时间）；
- 床位快照（状态、版本、病区、房间、类型、性别适配、设施、预计出院）；
- 医院制度（床位分配、单人间、清洁、审批、执行复核）。

### 4.2 硬约束

```text
bed.status == "空闲"
bed.dept == admission.dept
bed.type == admission.bedType
bed.genderPolicy in [admission.gender, "不限"]
admission.isolation  => bed.type == "隔离间"
bed.type == "隔离间" => admission.isolation
requiredFeatures ⊆ bed.features
```

### 4.3 排序与评分

排序只读取主管医师标注的优先级和申请时间：

```text
priorityRank: 紧急 0 / 优先 1 / 常规 2
sort by (priorityRank, appliedAt)
```

候选评分（示例）：

```text
基础分 52
+ 科室匹配 16
+ 床位类型匹配 14
+ 性别适配 8（不限 6）
+ 每项必要设施 4
+ 病区负载较低 3
+ 靠近护士站 3
```

AI 不产生“临床优先级”，只是使用医生已经写好的字段。方案中的每条匹配都带 `reasons` 和 `score`，审批人能看到为什么。

### 4.4 缺口与候补

未匹配患者会返回：

- 原因（没有同时满足科室/类型/性别/隔离的空闲床）；
- 候补资源（待清洁床位的预计完成时间、今日预出院床位）；
- 不自动降级、不跨科室。

演示数据中骨科 4 位待入院、3 张空闲床：

- 张建国 → 301-3（三人间/男）
- 王强 → 305-1（单人间）
- 李秀兰 → 304-1（双人间/女）
- 郑霞 → 无当日匹配，候补 302-2（15:30 完成清洁）

### 4.5 一致性

`dispatch_plan` 保存执行快照：

```json
{
  "plan_version": 1,
  "matched": [{"bed_id": "...", "expected_version": 3}]
}
```

执行服务在一个数据库事务中：

1. `SELECT ... FOR UPDATE` 锁定床位与入院申请；
2. 校验状态、版本、患者是否已在其他床；
3. 更新床位、申请、患者、床位版本；
4. 写审计；
5. 提交。

任何一步失败 → rollback，返回 0 条变更。演示版 `engine.applyBedPlan()` 用内存对象模拟同一过程，浏览器测试覆盖了“先污染一张床位，再批准”的整单回滚。

## 5. RAG

### 演示版

- 6 份制度、19 个章节片段；
- 检索：关键词命中 + 中文二元组/三元组 + 标题/章节加权；
- 返回 `relevance`、`chunkId`、标题、章节、原文；
- 方案和审批页展示引用；点击可回原文。

### 生产版

```text
文档上传 → 解析（PDF/DOCX）→ 清洗 → 按标题/段落切分
        → embedding（bge-m3）→ pgvector / Milvus
        → 混合检索（BM25 + 向量）→ rerank → 引用
```

关键约束：

- 引用必须能定位到文档、版本、章节；
- 制度更新后旧引用保留历史版本；
- 报告数字不经过模型生成，只由统计服务计算后注入 prompt。

## 6. 权限模型

```text
User ── N:M ── Role ── N:M ── Permission
                    └── DataScope（全院 / 科室 / 病区）
```

演示版权限表（`store.js`）：

| 角色 | 关键权限 |
|---|---|
| admin | 全局、审批、所有写操作 |
| ops | 审批、床位管理、预警处置、知识库、报告 |
| bed | 床位管理、发起方案 |
| appt | 预约管理 |
| equip | 设备/检查、发起方案 |
| staff | 人员/排班 |

生产版必须在服务端校验，前端隐藏按钮只是体验优化，不能作为安全边界。

## 7. 可观测性

每个工作流记录：

- `workflow_id`、`trace_id`、`task_id`；
- 节点名、Agent、开始/结束时间、耗时；
- 工具名、参数摘要（脱敏）、返回摘要、错误码；
- 审批单、审批人、方案版本；
- 最终执行结果和业务变更数量。

演示版把这些展示在 AI 调度中心右侧和系统管理审计日志中；生产版接入 OpenTelemetry + Prometheus + Loki。

## 8. 非功能需求落点

| PRD 要求 | 演示版 | 生产版 |
|---|---|---|
| 安全性 | 前端 RBAC + 审批 | JWT、服务端权限、字段级脱敏 |
| 一致性 | 内存事务 + 版本校验 | PostgreSQL 行锁 + 乐观锁 + 单事务 |
| 可追溯 | 本地审计日志 | 审计表 + trace_id + 不可篡改存储 |
| 可恢复 | 审批单持久化，刷新可恢复 | LangGraph Postgres checkpointer |
| 可扩展 | 模块化 engine/store | 领域服务拆分、消息队列、MCP Server |
| 可观测 | 工具耗时与步骤 | OTel / Prometheus / 日志平台 |
| 数据保护 | 全合成数据 | 最小化、脱敏、访问审计 |
