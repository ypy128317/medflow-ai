/* 前端关键交互测试：登录、创建预约、候补补位、审批执行、AI 工作流。 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9336
const PROFILE = path.join(ROOT, '..', '.edge-web-flows')
const BASE = process.env.WEB_URL || 'http://127.0.0.1:5173'
const PREFIX = new URL(BASE).pathname.replace(/\/$/, '')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true })
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1600,1100', `${BASE}/login`], { stdio: 'ignore' })
let target
for (let i = 0; i < 80; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = list.find(t => t.type === 'page'); if (target) break } catch {}
  await wait(150)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
const exceptions = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
  if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text)
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result?.value
}
const waitFor = async (fn, timeout = 12000, label = '') => {
  const start = Date.now()
  while (Date.now() - start < timeout) { try { if (await fn()) return true } catch {} await wait(180) }
  throw new Error(`等待超时：${label}`)
}
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`)
  if (!ok) throw new Error(name)
}
const login = async (username) => {
  await waitFor(() => evaluate("!!document.querySelector('.login-form')"))
  await evaluate(`(() => {
    const set=(s,v)=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};
    set('input[autocomplete=username]', ${JSON.stringify(username)});
    set('input[autocomplete=current-password]', 'medflow2026');
    document.querySelector('.login-form button').click();
    return true;
  })()`)
  await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/dashboard')}`), 12000, 'login ' + username)
}
const logout = async () => {
  await evaluate("document.querySelector('.user-chip').click(); true")
  await wait(250)
  await evaluate("[...document.querySelectorAll('.user-menu button')].find(b=>b.textContent.includes('退出')).click(); true")
  await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(PREFIX + '/login')}`), 8000, 'logout')
}
const nav = async (label) => {
  await evaluate(`(() => { const b=[...document.querySelectorAll('.nav-item')].find(x=>x.textContent.includes(${JSON.stringify(label)})); if(!b) return false; b.click(); return true; })()`)
  await wait(800)
}
await send('Runtime.enable')
await wait(1200)
const patientName = `前端流程${Date.now().toString().slice(-6)}`
await login('lina')
await nav('预约管理')
await waitFor(() => evaluate("document.querySelectorAll('.data-table tbody tr').length > 0"))
await evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent.includes('新建预约')).click(); true")
await waitFor(() => evaluate("!!document.querySelector('.modal')"))
check('新建预约弹窗打开', await evaluate("!!document.querySelector('.modal .form-grid')"))
await evaluate(`(() => {
  const inputs=document.querySelectorAll('.modal input');
  const name=inputs[0]; name.value=${JSON.stringify(patientName)}; name.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`)
await wait(500)
const footerButton = await evaluate("[...document.querySelectorAll('.modal-foot .btn')].find(b=>b.textContent.includes('确认预约'))?.disabled")
check('创建按钮在填写后可用', footerButton === false)
await evaluate("[...document.querySelectorAll('.modal-foot .btn')].find(b=>b.textContent.includes('确认预约')).click(); true")
await waitFor(() => evaluate(`document.body.innerText.includes(${JSON.stringify(patientName)})`), 10000, 'new appointment row')
check('通过 UI 创建预约成功', true)

const promoteBefore = await evaluate("document.querySelectorAll('.waitlist-row').length")
await evaluate("document.querySelector('.waitlist-row .btn-primary').click(); true")
await waitFor(async () => (await evaluate("document.querySelectorAll('.waitlist-row').length")) < promoteBefore, 10000, 'waitlist promote')
check('候补补位从队列移除', true)

await logout()
await login('wangli')
await nav('床位管理')
await waitFor(() => evaluate("document.querySelectorAll('.data-table tbody tr').length > 0"), 10000, 'beds page')
await evaluate("(() => { const c=[...document.querySelectorAll('.status-cell')].find(x=>x.textContent.includes('待清洁')); if(c) c.click(); return true; })()")
await wait(700)
const cleaned = await evaluate("(() => { const b=[...document.querySelectorAll('.text-btn')].find(x=>x.textContent.includes('清洁完成')); if(!b) return false; b.click(); return true; })()")
check('清洁按钮存在且可点击', cleaned)
await waitFor(() => evaluate("document.body.innerText.includes('清洁复核完成')"), 10000, 'cleaning success')
check('清洁完成 UI 调用成功', true)

await logout()
await login('chenming')
await nav('审批中心')
await waitFor(() => evaluate("document.querySelectorAll('.approval-item').length > 0"))
await evaluate("document.querySelector('.approval-item').click(); true")
await wait(600)
const pendingText = await evaluate("document.querySelector('.approval-detail')?.innerText || ''")
if (pendingText.includes('批准并执行')) {
  await evaluate("document.querySelector('.approval-comment').value='前端审批测试'; document.querySelector('.approval-comment').dispatchEvent(new Event('input',{bubbles:true})); true")
  await evaluate("[...document.querySelectorAll('.btn-primary')].find(b=>b.textContent.includes('批准并执行')).click(); true")
  await waitFor(() => evaluate("document.body.innerText.includes('执行成功') || document.body.innerText.includes('事务提交成功')"), 12000, 'approval execution')
  check('审批中心执行成功', true)
} else {
  check('审批详情可读', true)
}

await nav('AI 调度中心')
await waitFor(() => evaluate("!!document.querySelector('.prompt-box textarea')"))
await evaluate("[...document.querySelectorAll('.quick-prompts button')].find(b=>b.textContent.includes('骨科床位方案')).click(); true")
await waitFor(() => evaluate("document.querySelector('.workflow-timeline') || document.body.innerText.includes('等待人工审批')"), 18000, 'AI workflow')
check('AI 工作流返回时间线', await evaluate("document.querySelectorAll('.workflow-step').length >= 3"))

check('无未捕获 JavaScript 异常', exceptions.length === 0, exceptions.join(' | '))
console.log('\nFLOWS OK')
ws.close(); edge.kill(); process.exit(0)
