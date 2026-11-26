/*
 * Vue + Vite 前端冒烟测试。
 * 前置：API http://127.0.0.1:8010，Vite http://127.0.0.1:5173
 * 运行：node tests/smoke.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9335
const PROFILE = path.join(ROOT, '..', '.edge-web-smoke')
const BASE = process.env.WEB_URL || 'http://127.0.0.1:5173'
const PREFIX = new URL(BASE).pathname.replace(/\/$/, '')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true })
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1600,1100',
  `${BASE}/login`,
], { stdio: 'ignore' })

let target
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find((t) => t.type === 'page')
    if (target) break
  } catch { /* not ready */ }
  await wait(150)
}
if (!target) throw new Error('没有找到浏览器页面')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const pending = new Map()
const exceptions = []
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
  }
  if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.text)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result?.value
}
const waitFor = async (fn, timeout = 12000, label = '') => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { if (await fn()) return true } catch { /* retry */ }
    await wait(180)
  }
  throw new Error(`等待超时：${label}`)
}
const checks = []
const check = (name, ok, extra = '') => {
  checks.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`)
  if (!ok) throw new Error(name)
}
const screenshot = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'screenshots', `${name}.png`), Buffer.from(shot.data, 'base64'))
}

await send('Runtime.enable')
await send('Page.enable')
await wait(1500)
await waitFor(() => evaluate("document.readyState==='complete' && !!document.querySelector('.login-form')"), 12000, 'login render')
check('登录页渲染', await evaluate("document.querySelectorAll('.account-card').length === 6"))
await evaluate(`(() => {
  const set = (sel, value) => { const el=document.querySelector(sel); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); };
  set('input[autocomplete=username]', 'chenming');
  set('input[autocomplete=current-password]', 'medflow2026');
  return true;
})()`)
await evaluate("document.querySelector('.login-form button').click(); true")
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/dashboard')}`), 12000, 'dashboard route')
await waitFor(() => evaluate("document.querySelectorAll('.stat-card').length >= 4"), 12000, 'dashboard data')
check('JWT 登录并进入驾驶舱', true)
check('驾驶舱 4 项主指标', await evaluate("document.querySelectorAll('.stat-grid .stat-card').length >= 4"))
check('科室运营表渲染', await evaluate("document.querySelectorAll('.data-table tbody tr').length >= 5"))
check('演示事件入口渲染', await evaluate("[...document.querySelectorAll('.page-actions button')].some(b=>b.textContent.includes('模拟业务事件'))"))
await evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent.includes('模拟业务事件')).click(); true")
await waitFor(() => evaluate("!!document.querySelector('.demo-event-grid')"), 5000, 'demo modal')
check('模拟事件弹窗包含三种事件', await evaluate("document.querySelectorAll('.demo-event-grid button').length === 3"))
await evaluate("document.querySelector('.modal-head .icon-btn').click(); true")
await wait(3400)
await screenshot('dashboard')

const nav = async (label) => {
  await evaluate(`(() => { const b=[...document.querySelectorAll('.nav-item')].find(x=>x.textContent.includes(${JSON.stringify(label)})); if(!b) return false; b.click(); return true; })()`)
  await wait(700)
}

await nav('预约管理')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/appointments')}`))
await waitFor(() => evaluate("document.querySelectorAll('.data-table tbody tr').length > 0"), 10000, 'appointments')
check('预约列表渲染', await evaluate("document.querySelectorAll('.data-table tbody tr').length > 5"))
check('候补队列渲染', await evaluate("document.querySelectorAll('.waitlist-row').length >= 5"))
await screenshot('appointments')

await nav('床位管理')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/beds')}`))
await waitFor(() => evaluate("document.querySelectorAll('.data-table tbody tr').length > 5"), 10000, 'beds')
check('床位列表渲染', true)
await screenshot('beds')

await nav('检查资源')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/exams')}`))
await waitFor(() => evaluate("document.querySelectorAll('.device-card').length >= 6"), 10000, 'exams')
check('设备卡片渲染', await evaluate("document.querySelectorAll('.device-card').length >= 6"))
await screenshot('exams')

await nav('人员排班')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/staff')}`))
await waitFor(() => evaluate("document.querySelectorAll('.shift-table tbody tr').length > 5"), 10000, 'staff')
check('排班表渲染', true)
await screenshot('staff')

await nav('审批中心')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/approvals')}`))
await wait(600)
check('审批详情渲染', await evaluate("document.querySelectorAll('.approval-item').length >= 1"))
await screenshot('approvals')

await nav('AI 调度中心')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/ai')}`))
check('AI 调度页渲染', await evaluate("!!document.querySelector('.prompt-box textarea')"))
await screenshot('ai')

await nav('AI Copilot')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/copilot')}`), 10000, 'copilot route')
check('AI Copilot 对话页渲染', await evaluate("!!document.querySelector('.copilot-input textarea')"))
await evaluate(`(() => {
  const t=document.querySelector('.copilot-input textarea');
  t.value='现在全院还有多少张空床？';
  t.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`)
await wait(350)
await evaluate("[...document.querySelectorAll('.copilot-input button')].find(b=>b.textContent.includes('发送')).click(); true")
await waitFor(() => evaluate("!document.querySelector('.copilot-bubble.typing') && document.querySelectorAll('.copilot-message.assistant').length >= 2"), 40000, 'copilot reply')
check('Copilot 工具调用并返回回答', await evaluate("document.body.innerText.includes('空床') || document.body.innerText.includes('空闲')"))
await evaluate(`(() => {
  const t=document.querySelector('.copilot-input textarea');
  t.value='帮我制定今天骨科的床位分配方案';
  t.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`)
await wait(350)
await evaluate("[...document.querySelectorAll('.copilot-input button')].find(b=>b.textContent.includes('发送')).click(); true")
await waitFor(() => evaluate("!!document.querySelector('.copilot-plan')"), 40000, 'copilot plan')
check('Copilot 生成待审批床位方案', await evaluate("document.querySelector('.copilot-plan').innerText.includes('待审批')"))
await screenshot('copilot')

await nav('运营预警')
await wait(500)
await nav('AI Copilot')
await waitFor(() => evaluate("!!document.querySelector('.copilot-plan')"), 8000, 'copilot restore')
check('切换页面后 Copilot 会话保留', await evaluate("document.querySelectorAll('.copilot-message.user').length >= 2 && document.querySelector('.copilot-plan') !== null"))

await nav('运营预警')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/alerts')}`))
await waitFor(() => evaluate("document.querySelectorAll('.alert-card').length >= 3"), 10000, 'alerts')
check('预警卡片渲染', true)
await screenshot('alerts')

await nav('运营知识库')
await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/knowledge')}`))
await waitFor(() => evaluate("document.querySelectorAll('.doc-item').length >= 5"), 10000, 'knowledge')
check('知识库文档渲染', true)
await screenshot('knowledge')

check('无未捕获 JavaScript 异常', exceptions.length === 0, exceptions.join(' | '))
console.log(`\nWEB SMOKE OK · ${checks.length} checks`)
ws.close()
edge.kill()
process.exit(0)
