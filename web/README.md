# MedFlow AI · Vue 3 生产前端

与 `backend/` FastAPI 服务配套的**医院内部运营端** Vue 3 + Vite + Pinia 前端。它不再读取 localStorage，而是通过 `/api/v1` 使用真实 JWT、数据库和 LangGraph 审批工作流。

> 患者症状分诊已拆到独立 H5 患者端 [`../portal`](../portal)，不再出现在内部运营后台。

## 启动

```powershell
# 1. 启动后端（端口 8010）
cd ..\backend
python -m uvicorn app.main:app --port 8010

# 2. 启动前端（端口 5173）
cd ..\web
npm install
npm run dev
```

打开 <http://127.0.0.1:5173/login>，登录账号：

```text
chenming / medflow2026    医院运营主管
wangli   / medflow2026    床位管理员
lina     / medflow2026    预约管理员
zhouhang / medflow2026    医技管理员
liufang  / medflow2026    排班管理员
zhangwei / medflow2026    系统管理员
```

Vite 已配置代理：

```text
/api   → http://127.0.0.1:8010
/health → http://127.0.0.1:8010
```

## 页面

- 登录：6 个演示角色，JWT 登录
- 运营驾驶舱：床位、预约、检查、ALOS、预警、科室排名、未来压力
- 预约管理：号源、签到/完成/取消、改约、候补补位
- 床位管理：96 张床位状态、出院、清洁、维护
- 入院申请：优先级、硬约束、手动分配
- 检查资源：设备利用率、冲突、新建/取消检查、设备维护
- 人员排班：7 天班次、夜班间隔冲突、请假/调班、生成排班方案
- AI Copilot：Qwen Function Calling、多轮对话、工具轨迹、生成待审批方案；会话按用户保存在本机，切换页面不丢失
- AI 调度中心：真实 LangGraph 工作流时间线、RAG 引用、审批入口
- 审批中心：床位/检查/排班方案详情、实时复核、批准/驳回
- 运营预警：规则引擎、处置状态
- 数据分析：KPI、科室对比、未来风险
- 运营知识库：文档列表、章节、混合检索、编辑/新增
- 系统管理：用户、角色权限矩阵（仅 admin）

## 构建

```powershell
npm run build
npm run preview
```

构建输出在 `dist/`，可以交给 Nginx/CDN；需要把 `/api` 反代到 FastAPI。

本仓库的 FastAPI 会在存在 `web/dist/index.html` 时自动挂载：

- 生产构建入口：`http://127.0.0.1:8010/app/login`
- SPA history 路由：`/app/dashboard` 等会回退到 `index.html`
- 静态资源：`/app/assets/*`

## 测试

前置：API `8010`、Vite `5173` 都在运行。

```powershell
node tests/smoke.mjs   # 20 项：登录 + 主要页面 + Copilot 会话 + 演示事件 + 无 JS 异常 + 截图
node tests/flows.mjs   # 9 项：创建预约、候补补位、清洁完成、审批执行、AI 工作流
```

`tests/flows.mjs` 会真的写数据库，跑完建议重启后端并设置 `MEDFLOW_RESET_DB=1` 重置演示数据。

截图输出在 `screenshots/`。

## 结构

```text
web/
├─ src/
│  ├─ api/client.js       # fetch + JWT + 统一错误
│  ├─ stores/auth.js      # JWT、用户、权限
│  ├─ stores/ui.js        # toast
│  ├─ router/index.js     # 路由 + 登录/权限守卫
│  ├─ layouts/AppLayout.vue
│  ├─ components/         # Icon / Modal / Toast / Badge
│  ├─ views/              # 13 个页面（患者分诊已拆到 ../portal）
│  └─ styles.css
├─ tests/
│  ├─ smoke.mjs
│  └─ flows.mjs
├─ screenshots/
└─ vite.config.js
```







