'use strict';
const assert = require('assert');
const data = require('../js/data.js');
const engine = require('../js/engine.js');
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function state() { return Object.assign(clone(data), { meta: { demoDate: data.DEMO_DATE, now: data.DEMO_NOW }, departments: clone(data.DEPARTMENTS) }); }
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

test('床位状态与 KPI 计数一致', () => {
  const k = engine.getKpis(state());
  assert.strictEqual(k.totalBeds, 96); assert.strictEqual(k.occupied, 81); assert.strictEqual(k.free, 11);
  assert.strictEqual(k.cleaning, 2); assert.strictEqual(k.maintenance, 1); assert.strictEqual(k.occupancy, 84.4);
  assert.strictEqual(k.todayAppointments, 64); assert.strictEqual(k.validAppointments, 59); assert.strictEqual(k.pendingAdmissions, 11);
});
test('意图识别覆盖核心场景', () => {
  assert.strictEqual(engine.parseIntent('帮我制定今天骨科的床位分配方案').intent, 'bed_schedule');
  assert.strictEqual(engine.parseIntent('分析今天骨科床位使用情况').intent, 'bed_analysis');
  assert.strictEqual(engine.parseIntent('找出未来三天可能出现床位紧张的科室').intent, 'bed_forecast');
  const eq = engine.parseIntent('检查明天 CT 设备是否存在预约冲突');
  assert.strictEqual(eq.intent, 'equipment_conflict'); assert.strictEqual(eq.date, '2026-11-07');
  assert.strictEqual(engine.parseIntent('分析本周各科室的资源使用情况').intent, 'ops_report');
  assert.strictEqual(engine.parseIntent('你能帮我做什么').intent, 'general');
});
test('骨科方案：3 匹配 / 1 缺口 / 单人间不降级', () => {
  const p = engine.buildBedPlan(state(), 'ortho');
  assert.strictEqual(p.matched.length, 3); assert.strictEqual(p.unmatched.length, 1);
  assert.strictEqual(p.unmatched[0].patientName, '郑霞');
  assert.ok(p.unmatched[0].alternatives.some(a => a.bedId === 'ORTHO-A-05'));
  assert.strictEqual(new Set(p.matched.map(m => m.bedId)).size, 3);
  assert.ok(p.matched.some(m => m.patientName === '王强' && m.bedId === 'ORTHO-B-11'));
  assert.strictEqual(p.validation.valid, true);
});
test('全院方案：9 匹配 / 2 缺口', () => {
  const p = engine.buildBedPlan(state(), null);
  assert.strictEqual(p.matched.length, 9); assert.strictEqual(p.unmatched.length, 2);
  assert.deepStrictEqual(p.unmatched.map(u => u.patientName).sort(), ['郑霞', '陈敏']);
  assert.strictEqual(p.validation.valid, true);
});
test('审批执行成功：原子更新床位/申请/患者', () => {
  const s = state(); const p = engine.buildBedPlan(s, 'ortho'); const r = engine.applyBedPlan(s, p, '陈明');
  assert.strictEqual(r.ok, true); assert.strictEqual(r.changed, 3);
  assert.strictEqual(s.beds.filter(b => b.dept === 'ortho' && b.status === '空闲').length, 0);
  assert.strictEqual(s.admissions.filter(a => a.status === '已分配').length, 3);
  p.matched.forEach(m => { const b = s.beds.find(x => x.id === m.bedId); assert.strictEqual(b.status, '已入住'); assert.strictEqual(b.patientName, m.patientName); assert.ok(b.version > 1); });
});
test('执行前状态变化：整单回滚', () => {
  const s = state(); const p = engine.buildBedPlan(s, 'ortho');
  s.beds.find(b => b.id === p.matched[0].bedId).status = '已入住';
  const before = s.admissions.filter(a => a.status === '已分配').length;
  const r = engine.applyBedPlan(s, p, '陈明');
  assert.strictEqual(r.ok, false); assert.strictEqual(r.changed, 0);
  assert.strictEqual(s.admissions.filter(a => a.status === '已分配').length, before);
});
test('审批期间床位版本变化会阻断执行', () => {
  const s = state(); const p = engine.buildBedPlan(s, 'ortho');
  s.beds.find(b => b.id === p.matched[0].bedId).version += 1;
  const r = engine.applyBedPlan(s, p, '陈明');
  assert.strictEqual(r.ok, false); assert.ok(r.errors.some(e => e.indexOf('版本') >= 0));
});
test('检查冲突：今天 CT-01 / 明天 CT-02 各 1 组', () => {
  const s = state();
  const a = engine.detectExamConflicts(s.exams, '2026-11-06', 'CT-01');
  const b = engine.detectExamConflicts(s.exams, '2026-11-07', 'CT-02');
  assert.strictEqual(a.length, 1); assert.strictEqual(b.length, 1);
  assert.strictEqual(a[0].overlap, 15); assert.strictEqual(b[0].overlap, 15);
});
test('检查方案只移动常规检查并校验空档', () => {
  const s = state(); const a = engine.analyzeEquipment(s, { date: '2026-11-07', deviceType: 'CT' });
  assert.strictEqual(a.conflicts.length, 1); assert.strictEqual(a.changes.length, 1);
  assert.strictEqual(a.changes[0].examId, 'EX-20261000-0315'); assert.strictEqual(a.validation.valid, true);
  const r = engine.applyEquipmentPlan(s, { kind: 'equipment', date: a.date, changes: a.changes }, '陈明');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.exams.find(e => e.id === 'EX-20261000-0315').start, a.changes[0].to.slice(0, 5));
});
test('RAG 命中床位分配与审批条款', () => {
  const hits = engine.retrieveKnowledge(state().knowledgeDocs, '床位分配 单人间 审批', 4);
  assert.ok(hits.length >= 3);
  assert.ok(hits.some(h => h.chunkId === 'KB-001-02'));
  assert.ok(hits.some(h => h.chunkId === 'KB-001-04'));
});
test('未来三天预测包含高等级风险科室', () => {
  const f = engine.forecastBeds(state(), 3);
  assert.ok(f.rows.length >= 7);
  assert.ok(f.rows.some(r => r.risk === '高' || r.risk === '紧急'));
  assert.ok(f.rows.some(r => r.gap > 0));
});
test('运营报告包含真实统计与数据来源', () => {
  const r = engine.generateOpsReport(state(), 7);
  assert.strictEqual(r.kind, 'ops_report'); assert.ok(r.metrics.totalAppts > 0);
  assert.strictEqual(r.sections.length, 4); assert.ok(r.dataSource.indexOf('运营指标服务') >= 0);
  assert.ok(!/NaN|undefined/.test(JSON.stringify(r)));
});
test('预约统计与号源推荐', () => {
  const st = engine.appointmentStats(state(), '2026-11-06');
  assert.strictEqual(st.total, 64); assert.strictEqual(st.canceled, 5);
  const rec = engine.recommendSlots(state(), 'ortho', '2026-11-07', '测试患者');
  assert.ok(rec.length > 0); assert.ok(rec[0].score >= 58);
});
test('平均住院日与候补补位计算', () => {
  const s = state();
  assert.ok(engine.getKpis(s).alos > 0);
  const slot = engine.findWaitlistSlot(s, s.waitlist[0]);
  assert.ok(slot && slot.slot);
  assert.strictEqual(slot.doctorId, 'D-OR-02');
});

test('排班方案校验并原子发布', () => {
  const s = state();
  const p = engine.buildStaffPlan(s, null);
  assert.strictEqual(p.changes.length, 2);
  assert.strictEqual(p.validation.valid, true);
  const r = engine.applyStaffPlan(s, p, '陈明');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.changed, 2);
  assert.strictEqual(s.staff.find(x => x.name === '孙悦').shifts['2026-11-07'], '休');
  assert.strictEqual(s.staff.find(x => x.name === '王磊').shifts['2026-11-09'], '休');
  assert.strictEqual(s.staffConflicts.length, 0);
});

test('预警规则引擎生成可解释预警', () => {
  const s = state();
  const drafts = engine.evaluateAlertRules(s);
  assert.ok(drafts.length >= 1);
  drafts.forEach(d => {
    assert.ok(d.ruleKey && d.level && d.title && d.suggestion);
  });
  assert.ok(drafts.some(d => d.ruleKey.indexOf('dept-gap-') === 0));
});

test('混合检索返回向量相似度', () => {
  const hits = engine.retrieveKnowledge(state().knowledgeDocs, '床位 单人间 审批', 3);
  assert.ok(hits.length > 0);
  assert.ok(hits[0].vectorScore > 0);
  assert.ok(hits[0].relevance > 0.4);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' · some failed' : ''));
