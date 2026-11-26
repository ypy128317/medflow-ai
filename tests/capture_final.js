/*
 * 生成 README 截图：登录 / 驾驶舱 / AI 床位调度 / 审批执行。
 * 运行：node tests/capture_final.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 9335;
const PROFILE = path.join(ROOT, '.edge-capture');
const BASE = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
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
  let seq = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
  const send = (method, params) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result ? r.result.value : undefined; };
  const ready = async () => { for (let i = 0; i < 80; i++) { if (await ev('document.readyState==="complete" && !!window.__MEDFLOW__')) return; await wait(150); } throw new Error('app not ready'); };
  async function shot(name) {
    const metrics = await send('Page.getLayoutMetrics');
    const w = 1600; const h = Math.min(2800, Math.ceil(metrics.cssContentSize.height));
    const r = await send('Page.captureScreenshot', { format:'png', fromSurface:true, captureBeyondViewport:true, clip:{x:0,y:0,width:w,height:h,scale:1} });
    fs.writeFileSync(path.join(ROOT,name), Buffer.from(r.data,'base64'));
    console.log('saved', name, w+'x'+h);
  }
  await send('Runtime.enable'); await send('Page.enable'); await wait(1100); await ready();
  await shot('screenshot.png');

  await send('Page.navigate', { url: BASE + '?silent=1' }); await wait(1100);
  await ev('localStorage.removeItem("medflow-ai-demo-v1");location.reload();true'); await wait(1500); await ready();
  await shot('screenshot-login.png');

  await ev("window.__MEDFLOW__.store.loginDemo('u-ops');window.__MEDFLOW__.ui.route='dispatch';location.hash='#/dispatch';window.__MEDFLOW__.render();true");
  await wait(500);
  await ev("document.getElementById('dispatch-input').value='帮我制定今天骨科的床位分配方案';document.querySelector('[data-action=\"run-task\"]').click();true");
  for (let i=0;i<70;i++) { if (await ev("!!document.querySelector('.workflow-approval-card')")) break; await wait(300); }
  await wait(4200); await shot('screenshot-workflow.png');

  await ev("document.querySelector('[data-action=\"open-approval-from-workflow\"]').click();true"); await wait(800);
  await ev("document.getElementById('approval-comment').value='同意，按方案执行。';document.querySelector('[data-action=\"approve-plan\"]').click();true");
  for (let i=0;i<50;i++) { if (await ev("!!document.querySelector('.execution-result.success')")) break; await wait(250); }
  await wait(4200); await shot('screenshot-approval.png');
  ws.close(); cleanup(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
