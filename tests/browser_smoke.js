/*
 * Headless Edge 端到端冒烟测试。
 * 运行：node tests/browser_smoke.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 9333;
const PROFILE = path.join(ROOT, '.edge-smoke');
const BASE = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout, label) {
  const start = Date.now();
  while (Date.now() - start < (timeout || 15000)) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await wait(180);
  }
  throw new Error('Timeout: ' + (label || 'condition'));
}
(async () => {
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--disable-extensions','--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'--window-size=1600,1200',BASE+'?auto=1&silent=1#/dashboard'], { stdio: 'ignore' });
  const cleanup = () => { try { edge.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  let target;
  for (let i = 0; i < 100; i++) {
    try { const list = await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json(); target = list.find(t => t.type === 'page'); if (target) break; } catch (e) {}
    await wait(150);
  }
  if (!target) throw new Error('No CDP target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map(); const exceptions = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);
  };
  const send = (method, params) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result ? r.result.value : undefined; };
  const ready = async () => waitFor(async () => ev('document.readyState==="complete" && !!window.__MEDFLOW__'), 12000, 'app ready');
  const nav = async hash => { await ev('(function(){window.__MEDFLOW__.ui.route='+JSON.stringify(hash)+';location.hash="#/'+hash+'";window.__MEDFLOW__.render();return true;})()'); await wait(220); await ready(); };
  const click = async sel => { const ok = await ev('(function(){var el=document.querySelector('+JSON.stringify(sel)+');if(!el)return false;el.click();return true;})()'); if (!ok) throw new Error('Missing element: '+sel); await wait(260); };
  const checks = [];
  const check = (name, ok, extra) => { checks.push({ name, ok: !!ok }); console.log((ok?'PASS ':'FAIL ')+name+(extra?' · '+extra:'')); if (!ok) throw new Error('Assertion failed: '+name); };
  await send('Runtime.enable'); await send('Page.enable'); await wait(900); await ready();

  const initial = await ev('(function(){var s=window.__MEDFLOW__.store.getState();return {beds:s.beds.length,free:s.beds.filter(b=>b.status==="空闲").length,pending:s.admissions.filter(a=>a.status==="待分配").length};})()');
  check('初始数据 96 床 / 11 空闲 / 11 待入院', initial.beds===96&&initial.free===11&&initial.pending===11, JSON.stringify(initial));

  await nav('dispatch');
  await ev("document.getElementById('dispatch-input').value='帮我制定今天骨科的床位分配方案';true");
  await click('[data-action="run-task"]');
  await waitFor(async () => ev("!!document.querySelector('.workflow-approval-card')"), 14000, 'approval card');
  check('AI 工作流暂停在人工审批', /等待人工审批/.test(await ev("document.querySelector('.workflow-approval-card').innerText")));

  await click('[data-action="open-approval-from-workflow"]');
  await waitFor(async () => ev("!!document.querySelector('.approval-decision')"), 5000, 'approval detail');
  await ev("document.getElementById('approval-comment').value='同意，按方案执行。';true");
  await click('[data-action="approve-plan"]');
  await waitFor(async () => ev("!!document.querySelector('.execution-result.success')"), 8000, 'execution success');
  const after = await ev('(function(){var s=window.__MEDFLOW__.store.getState();var p=s.plans.find(p=>p.id==="BP-20261106-001");return {status:p&&p.status,assigned:s.admissions.filter(a=>a.status==="已分配").length,orthoFree:s.beds.filter(b=>b.dept==="ortho"&&b.status==="空闲").length};})()');
  check('批准后床位事务执行成功', after.status==='执行成功'&&after.assigned>=3&&after.orthoFree===0, JSON.stringify(after));

  await send('Page.reload', { ignoreCache: true }); await wait(1200); await ready();
  const persisted = await ev('window.__MEDFLOW__.store.getState().admissions.filter(a=>a.status==="已分配").length');
  check('LocalStorage 持久化审批执行结果', persisted >= 3, 'assigned='+persisted);

  await ev('window.__MEDFLOW__.store.reset();true');
  await send('Page.reload', { ignoreCache: true }); await wait(1200); await ready();
  await nav('approvals');
  await waitFor(async () => ev("!!document.querySelector('.approval-decision')"), 5000, 'seed approval');
  await ev("document.getElementById('approval-comment').value='暂不调整，等待患者确认';true");
  await click('[data-action="reject-plan"]');
  await waitFor(async () => ev("!!document.querySelector('.execution-result')"), 5000, 'reject result');
  const rejected = await ev('(function(){var s=window.__MEDFLOW__.store.getState();var p=s.plans.find(p=>p.id==="AP-20261106-001");var e=s.exams.find(e=>e.id==="EX-20261000-0313");return {status:p&&p.status,start:e&&e.start};})()');
  check('驳回不修改检查时段', rejected.status==='已驳回'&&rejected.start==='14:45', JSON.stringify(rejected));

  await nav('dispatch');
  await ev("document.getElementById('dispatch-input').value='检查明天 CT 设备是否存在预约冲突';true");
  await click('[data-action="run-task"]');
  await waitFor(async () => ev("document.querySelector('.workflow-approval-card,.result-error')"), 14000, 'equipment result');
  check('明日 CT 冲突分析生成方案', /CT-02/.test(await ev("document.querySelector('.workflow-main').innerText")));

  await ev('window.__MEDFLOW__.ui.workflow=null;true'); await nav('dispatch');
  await ev("document.getElementById('dispatch-input').value='分析本周各科室的资源使用情况';true");
  await click('[data-action="run-task"]');
  await waitFor(async () => ev("!!document.querySelector('.report')"), 14000, 'ops report');
  check('运营分析报告渲染', true);

  await nav('knowledge');
  await ev("document.getElementById('kb-search-input').value='单人间 分配 审批';document.getElementById('kb-search-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true");
  await waitFor(async () => ev("document.querySelectorAll('.rag-item').length>0"), 4000, 'rag');
  check('RAG 检索返回制度片段', (await ev("document.querySelectorAll('.rag-item').length")) >= 2);

  await nav('appointments');
  const blocked = await ev('(function(){var s=window.__MEDFLOW__.store.getState();var a=s.appointments.find(x=>x.date==="2026-11-06"&&x.status!=="已取消");return window.__MEDFLOW__.store.createAppointment({patientName:"测试患者",phone:"13800000000",gender:"女",age:30,doctorId:a.doctorId,date:a.date,slot:a.slot,reason:"smoke"});})()');
  check('RBAC 阻断运营主管直接建预约', blocked.ok===false&&/权限/.test(blocked.error), blocked.error||'');
  await ev("window.__MEDFLOW__.store.loginDemo('u-appt');window.__MEDFLOW__.render();true"); await wait(250);
  const conflict = await ev('(function(){var s=window.__MEDFLOW__.store.getState();var a=s.appointments.find(x=>x.date==="2026-11-06"&&x.status!=="已取消");return window.__MEDFLOW__.store.createAppointment({patientName:"测试患者",phone:"13800000000",gender:"女",age:30,doctorId:a.doctorId,date:a.date,slot:a.slot,reason:"smoke"});})()');
  check('重复号源被业务规则阻断', conflict.ok===false&&/冲突/.test(conflict.error), conflict.error||'');

  const audit = await ev('window.__MEDFLOW__.store.getState().audit.map(x=>x.action).join(",")');
  check('审计记录覆盖审批/驳回/工具调用', /plan\.reject/.test(audit)&&/mcp\./.test(audit));
  check('无未捕获 JavaScript 异常', exceptions.length===0, exceptions.join(' | '));

  fs.writeFileSync(path.join(__dirname,'browser_smoke_result.json'), JSON.stringify({ checks, exceptions }, null, 2));
  console.log('\nSMOKE OK · '+checks.length+' checks');
  ws.close(); cleanup(); process.exit(0);
})().catch(e => { console.error('SMOKE FAILED: '+e.message); try { fs.writeFileSync(path.join(__dirname,'browser_smoke_error.txt'), e.stack||e.message); } catch(_){} process.exit(1); });
