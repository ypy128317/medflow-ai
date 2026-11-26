# MedFlow AI · FastAPI 生产化后端

这是与 `../web` Vue 3 前端配套的**可运行后端**，把原先浏览器里的确定性规则、审批事务、RAG、LangGraph 工作流和 MCP 工具迁移到服务端。根目录 `index.html` 作为独立产品原型保留。

## 已实现

- **FastAPI + SQLAlchemy 2**：默认 SQLite，设置 `DATABASE_URL` 可切换 PostgreSQL。
- **JWT + RBAC**：PBKDF2 密码哈希、HS256 JWT、6 个角色、接口级权限依赖。
- **真实 LangGraph 工作流**：`StateGraph` + `interrupt()` + `Command(resume=...)`，审批暂停/恢复由 checkpointer 保存。
- **持久化 checkpointer**：`SqliteSaver`，API 重启后仍能恢复待审批工作流；生产可换 PostgresSaver。
- **原子审批执行**：床位/检查/排班方案在批准时重新校验，任意一项失败整单回滚。
- **完整领域 API**：床位、入院、预约/候补、检查/设备、排班、预警、知识库、用户、审计。
- **独立 MCP Server**：`mcp_server.py`，暴露床位快照/校验/执行、检查冲突、人员负载、知识检索等工具。
- **pytest 端到端测试**：覆盖工作流 interrupt/resume、批准、驳回、回滚、RBAC、预约、检查、排班、预警、知识库、用户和 MCP。

## 启动

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

打开：

- Swagger：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/health>
- Vue 构建版：<http://127.0.0.1:8000/app/login>
- 原有静态演示：<http://127.0.0.1:8000/demo/>

## 接入通义千问（Qwen）

Qwen 只负责**语言组织**：方案数字、床位选择、审批状态仍由确定性服务生成。缺少 key 或调用失败时自动回退到规则摘要，不影响审批和业务事务。

1. 复制配置：

```powershell
cd backend
Copy-Item .env.example .env
```

2. 编辑 `backend/.env`：

```text
DASHSCOPE_API_KEY=sk-你的DashScopeKey
QWEN_MODEL=qwen-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

3. 重启 API，检查状态：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/ai/status -Headers $headers
```

返回 `configured: true` 后：

- AI 工作流结束时新增 `Qwen Agent` 步骤，生成自然语言运营摘要；
- `POST /api/v1/ops/report` 返回 `ai_summary`；
- Vue 的 AI 调度页显示 `Qwen · qwen-plus`，数据分析页可生成 AI 报告。

`backend/.env` 已加入 `.gitignore`，不要把 key 提交到仓库。

首次启动自动建表并导入 `seed_data.json`。演示密码：`medflow2026`。

| 用户名 | 角色 |
|---|---|
| `chenming` | 医院运营主管 |
| `wangli` | 床位管理员 |
| `lina` | 预约管理员 |
| `zhouhang` | 医技科室管理员 |
| `liufang` | 医护排班管理员 |
| `zhangwei` | 系统管理员 |

登录示例：

```powershell
$body = @{ username = "chenming"; password = "medflow2026" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/auth/login -ContentType application/json -Body $body
$headers = @{ Authorization = "Bearer $($login.access_token)" }
Invoke-RestMethod http://127.0.0.1:8000/api/v1/ops/overview -Headers $headers
```

## LangGraph 床位工作流

```text
Coordinator → 数据查询 → RAG 检索 → 生成床位草案 → Validator 校验
            → interrupt(等待人工审批)
            → approve：Bed MCP 原子执行；reject：只改审批状态
```

创建任务：

```powershell
$body = @{ prompt = "帮我制定今天骨科的床位分配方案" } | ConvertTo-Json
$run = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/ai/tasks `
  -Headers $headers -ContentType application/json -Body $body
$run.status   # awaiting_approval
$run.plan_id  # BP-...
```

批准：

```powershell
$body = @{ decision = "approve"; comment = "同意，按方案执行。" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/api/v1/approvals/$($run.plan_id)/decision" `
  -Headers $headers -ContentType application/json -Body $body
```

拒绝不会修改床位。审批期间如果床位被手动占用，执行会返回 `409` 并整单回滚。

## AI Copilot（Qwen Function Calling）

```text
GET  /api/v1/copilot/status
POST /api/v1/copilot/chat   {"message":"...","session_id":"..."}
```

Qwen 可自主调用：

- `ops_overview`：运营 KPI
- `bed_snapshot`：床位/待入院/候补
- `create_bed_plan`：只生成待审批床位方案
- `appointment_slots`：医生和可用号源
- `exam_conflicts`：检查冲突
- `staff_conflicts`：排班冲突
- `recent_alerts`：待处理预警
- `kb_search`：制度检索

工具结果来自实时数据库，模型只负责选择工具和组织回答。`create_bed_plan` 仍受 `plan.create` 权限限制，且只创建待审批方案，不能审批或执行。

## 演示事件模拟器

```text
POST /api/v1/demo/events  {"action":"admit|release|all"}
```

- `admit`：生成 2 位新的合成待入院患者和入院申请
- `release`：选择待入院患者最多的科室，模拟出院 + 清洁完成，触发布局重匹配
- `all`：先新增患者，再释放床位

这是显式演示事件，不会在登录时自动随机生成；测试默认使用固定种子，保证可复现。

## 床位候补与自动重匹配

- 床位方案中的未匹配患者写入 `bed_waitlist`，保留床位类型、设施、隔离要求、优先级和未匹配原因。
- 候补按临床优先级 + 申请时间排序；分配到床位后标记 `已分配`。
- 清洁完成、床位变成空闲时，触发 `ensure_replan_for_dept`：同科室没有待审批方案则自动生成一个床位方案，等待人工审批。
- 规则引擎计算未来 24 小时床位缺口，生成 `资源预测24h` 预警，并尝试生成待审批方案草稿。
- 自动生成的方案不会自动执行；审批前仍会复核床位状态和版本。

## 患者端 API（独立产品）

分诊不属于医院内部运营端，接口在独立的患者端命名空间：

```text
POST /api/v1/portal/triage                  症状 + 年龄/性别/持续时间
POST /api/v1/portal/triage/book             确认后创建预约
GET  /api/v1/portal/appointments            我的预约
POST /api/v1/portal/appointments/{id}/checkin
POST /api/v1/portal/appointments/{id}/cancel
```

患者演示账号：`patient` / `medflow2026`，权限为 `portal.use`。员工账号不能调用患者端接口；内部端也不再提供 `/triage` 页面。

规则：

- 先做胸痛、呼吸困难、意识障碍、大出血等急症红旗筛查
- 命中红旗直接建议急诊/120，不推荐普通门诊
- Qwen 只解释就医科室和紧迫度，**不输出疾病诊断、概率、用药或处方**
- 后端再次过滤 Qwen 输出中的诊断性措辞，失败自动回退规则文案
- 分诊助手不直接分配床位，住院由医生面诊后走入院流程

## MCP Server

```powershell
cd backend
python mcp_server.py
```

工具：

| 工具 | 作用 |
|---|---|
| `bed_read_snapshot` | 床位/入院/KPI 快照 |
| `bed_validate_plan` | 执行前规则校验 |
| `bed_allocate` | 审批通过后受控执行床位方案 |
| `exam_find_conflicts` | 设备检查冲突 |
| `staff_workload` | 人员班次与负载 |
| `kb_search` | 制度混合检索 |
| `ops_kpi_snapshot` | 运营 KPI |

MCP 与 API 共用领域服务，不复制业务规则。

## PostgreSQL

```powershell
$env:DATABASE_URL = "postgresql+psycopg://medflow:medflow@localhost:5432/medflow"
python -m uvicorn app.main:app --port 8000
```

`db/schema.sql` 是数据库蓝图；SQLAlchemy 模型会创建运行表。

## 测试

```powershell
cd backend
python -m pytest tests -q
```

当前结果：`20 passed`。

## 目录

```text
backend/
├─ app/
│  ├─ main.py          # FastAPI 入口、CORS、静态演示
│  ├─ config.py        # 环境变量
│  ├─ database.py      # engine / session
│  ├─ models.py        # SQLAlchemy 模型
│  ├─ seed.py          # 从 seed_data.json 导入
│  ├─ security.py      # JWT / PBKDF2 / RBAC
│  ├─ workflow.py      # LangGraph interrupt/resume + SqliteSaver
│  ├─ services/        # 床位、预约、检查、排班、预警、知识库、指标
│  └─ routers/         # REST API
├─ mcp_server.py       # 独立 MCP Server
├─ seed_data.json      # 与前端一致的合成数据
├─ requirements.txt
├─ Dockerfile
├─ docker-compose.yml
└─ tests/
```

## 生产化边界

- 当前默认 SQLite 和 `SqliteSaver`，适合单机演示；多实例生产需 PostgreSQL + `PostgresSaver`。
- `JWT_SECRET` 必须通过环境变量注入，默认值仅用于本地。
- 还没有接入医院统一认证、HIS/EMR/设备系统，也没有 Redis 限流、审计 outbox、Prometheus 指标。
- `web/` 已提供 Vue 3 + Pinia API 客户端；根目录 `index.html` 仍是独立的 localStorage 产品原型。








