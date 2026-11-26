# MedFlow 就医助手 · 患者 H5

独立的患者端，不放在医院内部运营后台里。患者可以描述症状、获得分诊建议、选择医生/号源并预约。

## 启动

```powershell
# 后端
cd ..\backend
python -m uvicorn app.main:app --port 8010

# 患者端（开发服务器）
cd ..\portal
npm install
npm run dev
```

- 开发地址：<http://127.0.0.1:5174>
- 生产构建由 FastAPI 挂载：<http://127.0.0.1:8010/portal/login>
- 患者演示账号：`patient` / `medflow2026`

## 功能

- 患者 JWT 登录
- 症状采集（年龄、性别、症状、持续时间）
- 急症红旗筛查
- 受限科室推荐
- 医生与可用号源
- 确认预约
- 预约成功页
- 我的预约
- 自助签到 / 取消预约

## 安全边界

- 不输出疾病诊断
- 不给疾病概率
- 不给用药/处方
- 不直接分配床位
- 急症红旗由后端确定性规则先判断
- Qwen 只负责解释科室和紧迫度
- 后端过滤 Qwen 的诊断性措辞

## API

```text
POST /api/v1/auth/login
POST /api/v1/portal/triage
POST /api/v1/portal/triage/book
GET  /api/v1/portal/appointments
POST /api/v1/portal/appointments/{id}/checkin
POST /api/v1/portal/appointments/{id}/cancel
```

患者角色只有 `portal.use` 权限；内部员工角色不能调用患者端接口。

## 测试

```powershell
node tests/smoke.mjs
```

测试流程：患者登录 → 分诊 → 选择号源 → 预约成功 → 我的预约 → 签到。

截图输出在 `screenshots/`。
