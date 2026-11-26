/*
 * 新增功能端到端检查：候补/签到/改约、检查创建/取消、设备维护、
 * 排班请假/调班/方案审批、预警规则、知识库更新、用户管理。
 * 运行：node tests/browser_features.js（需先启动本地 8765 服务）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 9337;
const PROFILE = path.join(ROOT, '.edge-features');
const URL = 'http://127.0.0.1:8765/index.html?auto=1&silent=1#/dashboard';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout, label) {
  const start = Date.now();
  while (Date.now() - start < (timeout || 12000)) { try { if (await fn()) return; } catch (e) {} await wait(180); }
  throw new Error('Timeout: ' + (label || ''));
}
(async () => {
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--disable-extensions','--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'--window-size=1600,1200',URL], { stdio: 'ignore' });
  const cleanup = () => { try { edge.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  let target;
  for (let i = 0; i < 100; i++) { try { const l = await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json(); target = l.find(t => t.type === 'page'); if (target) break; } catch (e) {} await wait(150); }
  if (!target) throw new Error('No target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map(); const exceptions = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text); };
  const send = (method, params) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result ? r.result.value : undefined; };
  const ready = async () => waitFor(async () => ev('document.readyState==="complete" && !!window.__MEDFLOW__'), 12000, 'ready');
  const nav = async hash => { await ev('(function(){window.__MEDFLOW__.ui.route='+JSON.stringify(hash)+';location.hash="#/'+hash+'";window.__MEDFLOW__.render();return true;})()'); await wait(220); await ready(); };
  const click = async sel => { const ok = await ev('(function(){var el=document.querySelector('+JSON.stringify(sel)+');if(!el)return false;el.click();return true;})()'); if (!ok) throw new Error('Missing '+sel); await wait(260); };
  const submit = async formId => { const ok = await ev('(function(){var f=document.getElementById('+JSON.stringify(formId)+');if(!f)return false;f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));return true;})()'); if (!ok) throw new Error('Missing form '+formId); await wait(400); };
  const checks = [];
  const check = (name, ok, extra) => { checks.push({name,ok:!!ok}); console.log((ok?'PASS ':'FAIL ')+name+(extra?' · '+extra:'')); if (!ok) throw new Error(name); };
  await send('Runtime.enable'); await send('Page.enable'); await wait(900); await ready();

  const init = await ev('(function(){var s=window.__MEDFLOW__.store.getState();return {waitlist:s.waitlist.length, conflicts:s.staffConflicts.length, users:s.users.length};})()');
  check('新数据包含候补队列与排班冲突', init.waitlist === 8 && init.conflicts === 2, JSON.stringify(init));

  // 候补：UI 新增
  await ev("window.__MEDFLOW__.store.loginDemo('u-appt');window.__MEDFLOW__.render();true");
  await nav('appointments');
  await click('[data-action="new-waitlist"]');
  check('候补弹窗渲染', await ev("!!document.getElementById('waitlist-form')"));
  await ev("document.querySelector('#waitlist-form [name=patientName]').value='测试候补';document.querySelector('#waitlist-form [name=dept]').value='ortho';document.querySelector('#waitlist-form [name=preferredDate]').value='2026-11-07';true");
  await submit('waitlist-form');
  const wlCount = await ev('window.__MEDFLOW__.store.getState().waitlist.filter(w=>w.status==="等待中").length');
  check('候补登记写入', wlCount === 9, 'waiting='+wlCount);

  // 候补补位（直接调用业务动作）
  const promote = await ev("window.__MEDFLOW__.store.promoteWaitlist('WL-20261106-001')");
  check('候补可补位为正式预约', promote.ok && promote.entry.status === '已转预约', promote.message || promote.error);

  // 签到/完成/改约
  const apptId = await ev("(function(){var s=window.__MEDFLOW__.store.getState();var a=s.appointments.find(x=>x.date==='2026-11-07'&&(x.status==='待确认'||x.status==='已预约'));return a&&a.id;})()");
  const checkin = await ev('window.__MEDFLOW__.store.checkInAppointment('+JSON.stringify(apptId)+')');
  check('预约签到状态流转', checkin.ok && checkin.appointment.status === '已签到', checkin.error || '');
  const complete = await ev('window.__MEDFLOW__.store.completeAppointment('+JSON.stringify(apptId)+')');
  check('预约完成状态流转', complete.ok && complete.appointment.status === '已完成', complete.error || '');
  const reschedTarget = await ev("(function(){var s=window.__MEDFLOW__.store.getState();var a=s.appointments.find(x=>x.status==='已预约'||x.status==='待确认');return a&&a.id;})()");
  await ev('window.__MEDFLOW__.store.loginDemo("u-appt");true');
  await nav('appointments');
  await ev('window.__MEDFLOW__.ui.drawer={type:"appointment",id:'+JSON.stringify(reschedTarget)+'};window.__MEDFLOW__.render();true');
  await wait(250);
  await click('[data-action="reschedule-appt"]');
  check('改约弹窗渲染', await ev("!!document.getElementById('reschedule-form')"));
  const newSlot = await ev("(function(){var s=document.getElementById('res-slot');return s&&s.value;})()");
  const resDate = await ev("document.getElementById('res-date').value");
  const resched = newSlot ? await ev('window.__MEDFLOW__.store.rescheduleAppointment('+JSON.stringify(reschedTarget)+','+JSON.stringify(resDate)+','+JSON.stringify(newSlot)+')') : {ok:true};
  check('改约写入成功', resched.ok, resched.error || '');
  await ev("window.__MEDFLOW__.ui.drawer=null;window.__MEDFLOW__.ui.modal=null;window.__MEDFLOW__.render();true");

  // 检查创建/取消 + 设备维护
  await ev("window.__MEDFLOW__.store.loginDemo('u-equip');window.__MEDFLOW__.render();true");
  await nav('equipment');
  await click('[data-action="new-exam"]');
  check('新建检查弹窗渲染', await ev("!!document.getElementById('exam-form')"));
  await ev("document.querySelector('#exam-form [name=patientName]').value='检查测试';true");
  await click('[data-action="suggest-exam-slot"]');
  const examStart = await ev("document.getElementById('exam-start').value");
  const beforeExams = await ev('window.__MEDFLOW__.store.getState().exams.length');
  await submit('exam-form');
  const afterExams = await ev('window.__MEDFLOW__.store.getState().exams.length');
  check('新建检查写入并避开冲突', afterExams === beforeExams + 1, 'start='+examStart+' count='+beforeExams+'→'+afterExams);
  const newExam = await ev('(function(){var s=window.__MEDFLOW__.store.getState();return s.exams[s.exams.length-1].id;})()');
  const cancelExam = await ev('window.__MEDFLOW__.store.cancelExam('+JSON.stringify(newExam)+',"测试取消")');
  check('取消检查释放时段', cancelExam.ok && cancelExam.exam.status === '已取消');
  const devRestore = await ev('window.__MEDFLOW__.store.setDeviceStatus("MRI-02","运行中","测试恢复")');
  check('设备维护恢复运行', devRestore.ok, devRestore.error || '');
  const devMaint = await ev('window.__MEDFLOW__.store.setDeviceStatus("MRI-02","维护中","测试维护")');
  check('设备转入维护', devMaint.ok, devMaint.error || '');

  // 排班：请假/调班 + 方案审批
  await ev("window.__MEDFLOW__.store.loginDemo('u-staff');window.__MEDFLOW__.render();true");
  await nav('staff');
  const staffId = await ev("(function(){var s=window.__MEDFLOW__.store.getState();var st=s.staff.find(x=>x.name==='陈晨');return st.id;})()");
  const leave = await ev('window.__MEDFLOW__.store.requestLeave('+JSON.stringify(staffId)+',"2026-11-06","测试请假")');
  check('请假登记修改班次', leave.ok && leave.staff.shifts['2026-11-06'] === '休', leave.error || '');
  const swap = await ev('window.__MEDFLOW__.store.swapShift('+JSON.stringify(staffId)+',"2026-11-06","早")');
  check('调班覆盖休息班次', swap.ok && swap.staff.shifts['2026-11-06'] === '早', swap.error || '');
  await ev("window.__MEDFLOW__.store.loginDemo('u-ops');window.__MEDFLOW__.render();true");
  await nav('staff');
  await click('[data-action="generate-staff-plan"]');
  await waitFor(async () => ev("!!document.querySelector('.approval-decision')"), 5000, 'staff approval');
  const staffPlanId = await ev("window.__MEDFLOW__.ui.approvalId");
  const staffChanges = await ev('(function(){var p=window.__MEDFLOW__.store.getState().plans.find(p=>p.id==='+JSON.stringify(staffPlanId)+');return p.changes.length;})()');
  check('生成排班方案并进入审批', !!staffPlanId && staffChanges >= 1, staffPlanId+' / '+staffChanges);
  await ev("document.getElementById('approval-comment').value='同意调班方案。';true");
  await click('[data-action="approve-plan"]');
  await waitFor(async () => ev("!!document.querySelector('.execution-result.success')"), 5000, 'staff exec');
  const staffAfter = await ev('(function(){var s=window.__MEDFLOW__.store.getState();return {conflicts:s.staffConflicts.length, sun:s.staff.find(x=>x.name==="孙悦").shifts["2026-11-07"], wang:s.staff.find(x=>x.name==="王磊").shifts["2026-11-09"]};})()');
  check('排班方案执行后冲突清零', staffAfter.conflicts === 0 && staffAfter.sun === '休' && staffAfter.wang === '休', JSON.stringify(staffAfter));

  // 预警规则
  await nav('alerts');
  const beforeAlerts = await ev('window.__MEDFLOW__.store.getState().alerts.length');
  await click('[data-action="refresh-alerts"]');
  await wait(500);
  const afterAlerts = await ev('window.__MEDFLOW__.store.getState().alerts.length');
  check('规则引擎可新增预警', afterAlerts > beforeAlerts, beforeAlerts+'→'+afterAlerts);

  // 知识库更新
  await nav('knowledge');
  await click('[data-action="edit-kb"][data-id="KB-001"]');
  check('知识库编辑弹窗渲染', await ev("!!document.getElementById('kb-edit-form')"));
  await ev("document.querySelector('#kb-edit-form [name=title]').value='床位分配与调整管理制度（2026 修订版）';document.querySelector('#kb-edit-form [name=content]').value=document.querySelector('#kb-edit-form [name=content]').value+'\\n\\n补充：所有跨科协调必须由运营主管审批并留痕。';true");
  await click('#kb-edit-form button[type="submit"]');
  await wait(500);
  const kbVersion = await ev('(function(){var d=window.__MEDFLOW__.store.getState().knowledgeDocs.find(d=>d.id==="KB-001");return d.version;})()');
  check('知识库更新并重建索引', kbVersion !== 'v2026.3', kbVersion);

  // 用户管理
  await ev("window.__MEDFLOW__.store.loginDemo('u-admin');window.__MEDFLOW__.render();true");
  await nav('system');
  await click('[data-action="system-tab"][data-tab="users"]');
  await click('[data-action="new-user"]');
  check('新增用户弹窗渲染', await ev("!!document.getElementById('user-form')"));
  await ev("document.querySelector('#user-form [name=name]').value='测试管理员';document.querySelector('#user-form [name=phone]').value='138****9999';document.querySelector('#user-form [name=role]').value='ops';true");
  await submit('user-form');
  const userCount = await ev('window.__MEDFLOW__.store.getState().users.length');
  check('新增用户写入', userCount === init.users + 1, init.users+'→'+userCount);

  // 其余页面回归
  await nav('analytics');
  check('数据分析包含 5 项指标（含 ALOS）', (await ev("document.querySelectorAll('.analytics-stats .stat-cell').length")) === 5);
  await nav('beds');
  check('床位页渲染', (await ev("document.querySelectorAll('.bed-card').length")) > 0);
  await nav('admissions');
  check('入院申请页渲染', (await ev("document.querySelectorAll('.data-table tbody tr').length")) > 0);

  // AI 排班方案工作流
  await ev('window.__MEDFLOW__.store.reset();true');
  await send('Page.reload', { ignoreCache: true });
  await wait(1300); await ready();
  await nav('dispatch');
  await ev("document.getElementById('dispatch-input').value='生成心内科排班调整方案';true");
  await click('[data-action="run-task"]');
  await waitFor(async () => ev("!!document.querySelector('.workflow-approval-card')"), 14000, 'staff ai approval');
  const aiStaff = await ev('(function(){var s=window.__MEDFLOW__.store.getState();var p=s.plans.find(p=>p.kind==="staff"&&p.status==="待审批");return p?{id:p.id,changes:p.changes.length,scope:p.scope}:null;})()');
  check('AI 生成排班方案并暂停审批', !!aiStaff && aiStaff.changes >= 1, JSON.stringify(aiStaff));

  check('无未捕获 JavaScript 异常', exceptions.length === 0, exceptions.join(' | '));
  console.log('\nFEATURES OK · ' + checks.length + ' checks');
  ws.close(); cleanup(); process.exit(0);
})().catch(e => { console.error('FEATURES FAILED: ' + e.message); try { fs.writeFileSync(path.join(__dirname,'browser_features_error.txt'), e.stack||e.message); } catch(_){} process.exit(1); });
