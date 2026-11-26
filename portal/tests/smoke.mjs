/*
 * 独立患者 H5 冒烟测试。
 * 前置：API :8010，portal build 已由 FastAPI 挂载到 /portal/
 * 运行：node tests/smoke.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9337
const PROFILE = path.join(ROOT, '..', '.edge-portal-smoke')
const BASE = process.env.PORTAL_URL || 'http://127.0.0.1:8010/portal'
const wait = (ms) => new Promise(r => setTimeout(r, ms))
if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true })
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=430,900', `${BASE}/login`], { stdio: 'ignore' })
let target
for (let i = 0; i < 80; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = list.find(t => t.type === 'page'); if (target) break } catch {}
  await wait(150)
}
if (!target) throw new Error('没有找到浏览器页面')
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
const waitFor = async (fn, timeout = 15000, label = '') => {
  const start = Date.now()
  while (Date.now() - start < timeout) { try { if (await fn()) return true } catch {} await wait(180) }
  throw new Error(`等待超时：${label}`)
}
const checks = []
const check = (name, ok, extra = '') => {
  checks.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`)
  if (!ok) throw new Error(name)
}
const screenshot = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'screenshots', `${name}.png`), Buffer.from(shot.data, 'base64'))
}
await send('Runtime.enable')
await wait(1200)
await waitFor(() => evaluate("document.readyState==='complete' && !!document.querySelector('.portal-login-form')"), 12000, 'patient login')
check('患者端登录页渲染', await evaluate("document.body.innerText.includes('就医助手')"))
await screenshot('login')
await evaluate(`(() => {
  const set=(s,v)=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};
  set('input[autocomplete=username]','patient');
  set('input[autocomplete=current-password]','medflow2026');
  document.querySelector('.portal-login-form .portal-btn').click();
  return true;
})()`)
await waitFor(() => evaluate("!!document.querySelector('.portal-hero')"), 15000, 'triage home')
check('患者 JWT 登录并进入分诊', true)
await screenshot('home')

await evaluate(`(() => {
  const t=document.querySelector('.portal-card textarea');
  t.value='咳嗽三天，低烧，没有呼吸困难';
  t.dispatchEvent(new Event('input',{bubbles:true}));
  [...document.querySelectorAll('.portal-card .portal-btn')].find(b=>b.textContent.includes('开始分诊')).click();
  return true;
})()`)
await waitFor(() => evaluate("!!document.querySelector('.portal-slots button')"), 40000, 'triage result')
check('患者分诊返回科室和号源', await evaluate("document.body.innerText.includes('呼吸内科')"))
await evaluate("document.querySelector('.portal-dept')?.scrollIntoView({block:'center'}); true")
await wait(300)
await screenshot('triage')

await evaluate("document.querySelector('.portal-slots button').click(); true")
await waitFor(() => evaluate("!!document.querySelector('.portal-modal')"), 8000, 'booking modal')
await evaluate(`(() => {
  const input=document.querySelector('.portal-modal input');
  input.value='患者端演示';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`)
await evaluate("[...document.querySelectorAll('.portal-modal .portal-btn')].find(b=>b.textContent.includes('确认预约')).click(); true")
await waitFor(() => evaluate("!!document.querySelector('.booking-success')"), 15000, 'booking success')
check('患者预约成功页显示', true)
await evaluate("document.querySelector('.booking-success')?.scrollIntoView({block:'center'}); true")
await wait(300)
await screenshot('booking')

await evaluate("document.querySelector('.booking-success .portal-btn.primary').click(); true")
await waitFor(() => evaluate("!!document.querySelector('.appointment-card')"), 10000, 'my appointments')
check('我的预约包含待就诊记录', true)
await screenshot('appointments')
await evaluate("document.querySelector('.appointment-actions .portal-btn.primary').click(); true")
await waitFor(() => evaluate("document.body.innerText.includes('已签到')"), 10000, 'portal checkin')
check('患者端签到成功', true)
check('无未捕获 JavaScript 异常', exceptions.length === 0, exceptions.join(' | '))
console.log(`\nPORTAL SMOKE OK · ${checks.length} checks`)
ws.close(); edge.kill(); process.exit(0)
