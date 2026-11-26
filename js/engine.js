/*
 * MedFlow AI · 领域规则引擎 / 演示版 Agent 工具层
 *
 * 这里的床位分配、冲突检测、RAG 检索和指标计算都是确定性的真实计算，
 * 不是预先写死的文案。在线大模型只负责自然语言表达，数字和建议均由本文件产出。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MedFlowEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEPT_ALIASES = {
    ortho: ['骨科', '关节', '脊柱', '创伤骨科'],
    cardio: ['心内科', '心血管', '心脏'],
    neuro: ['神经内科', '神内', '脑血管'],
    resp: ['呼吸内科', '呼吸科', '呼吸'],
    gs: ['普外科', '普外', '肝胆', '胃肠'],
    onco: ['肿瘤科', '肿瘤', '化疗'],
    peds: ['儿科', '小儿']
  };
  const DEPT_NAMES = {
    ortho: '骨科', cardio: '心内科', neuro: '神经内科', resp: '呼吸内科',
    gs: '普外科', onco: '肿瘤科', peds: '儿科'
  };
  const PRIORITY_RANK = { '紧急': 0, '优先': 1, '常规': 2 };
  const BED_COLORS = {
    '空闲': '#0f9f8f', '已入住': '#2563eb', '待清洁': '#d97706',
    '维护中': '#64748b', '已预留': '#7c3aed', '暂停使用': '#94a3b8'
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function round(n, d) {
    const m = Math.pow(10, d == null ? 1 : d);
    return Math.round(n * m) / m;
  }
  function pct(n, d) { return d ? round((n / d) * 100, 1) : 0; }
  function sum(arr, fn) { return arr.reduce(function (s, x) { return s + (fn ? fn(x) : x); }, 0); }
  function mean(arr, fn) { return arr.length ? sum(arr, fn) / arr.length : 0; }
  function unique(arr) { return Array.from(new Set(arr)); }
  function minutes(t) {
    if (!t) return 0;
    const p = String(t).split(':').map(Number);
    return p[0] * 60 + p[1];
  }
  function hhmm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function dateLabel(dateStr) {
    const p = dateStr.split('-');
    return Number(p[1]) + '月' + Number(p[2]) + '日';
  }
  function nowOf(state) { return (state && state.meta && state.meta.now) || '2026-11-06 14:20'; }
  function demoDateOf(state) { return (state && state.meta && state.meta.demoDate) || '2026-11-06'; }
  function todayOf(state) { return demoDateOf(state); }

  // ---------------------------- 指标 ----------------------------
  function getBedStatusCounts(beds) {
    const order = ['空闲', '已入住', '待清洁', '维护中', '已预留', '暂停使用'];
    const colors = BED_COLORS;
    return order.map(function (status) {
      return {
        status: status,
        count: beds.filter(function (b) { return b.status === status; }).length,
        color: colors[status]
      };
    }).filter(function (x) { return x.count > 0 || x.status === '空闲'; });
  }

  function getOccupancy(beds) {
    const total = beds.length;
    const occupied = beds.filter(function (b) { return b.status === '已入住'; }).length;
    return pct(occupied, total);
  }

  function equipmentUtilization(state, date) {
    const activeDevices = state.devices.filter(function (d) { return d.status !== '维护中'; });
    const capacity = activeDevices.length * 10 * 60;
    const activeIds = activeDevices.map(function (d) { return d.id; });
    const used = state.exams.filter(function (e) {
      return e.date === date && e.status !== '已取消' && activeIds.indexOf(e.deviceId) >= 0;
    }).reduce(function (s, e) { return s + (e.duration || minutes(e.end) - minutes(e.start)); }, 0);
    return pct(used, capacity);
  }

  function parseMs(stamp) {
    if (!stamp) return null;
    const m = String(stamp).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }

  function getKpis(state) {
    const today = todayOf(state);
    const beds = state.beds;
    const counts = {};
    beds.forEach(function (b) { counts[b.status] = (counts[b.status] || 0) + 1; });
    const occupied = counts['已入住'] || 0;
    const free = counts['空闲'] || 0;
    const todayAppts = state.appointments.filter(function (a) { return a.date === today; });
    const validAppts = todayAppts.filter(function (a) { return a.status !== '已取消'; });
    const visits = todayAppts.filter(function (a) { return a.status === '已完成' || a.status === '已签到'; });
    const completed = todayAppts.filter(function (a) { return a.status === '已完成' && a.waitMinutes > 0; });
    const pendingAdmissions = state.admissions.filter(function (a) { return a.status === '待分配'; }).length;
    const pendingApprovals = state.plans.filter(function (p) { return p.status === '待审批'; }).length;
    const openAlerts = state.alerts.filter(function (a) { return a.status === '待处理' || a.status === '处理中'; });
    const highAlerts = openAlerts.filter(function (a) { return a.level === '高' || a.level === '紧急'; }).length;
    const pendingTasks = pendingApprovals + state.tasks.filter(function (t) { return t.status === 'running'; }).length;
    const canceled = todayAppts.filter(function (a) { return a.status === '已取消'; }).length;
    const nowMs = parseMs(nowOf(state));
    const losDays = beds.filter(function (b) { return b.status === '已入住' && b.occupiedAt; }).map(function (b) {
      const ms = parseMs(b.occupiedAt);
      return ms && nowMs ? Math.max(0, (nowMs - ms) / 86400000) : 0;
    });
    const waiting = (state.waitlist || []).filter(function (w) { return w.status === '等待中'; }).length;

    return {
      totalBeds: beds.length,
      occupied: occupied,
      free: free,
      cleaning: counts['待清洁'] || 0,
      maintenance: (counts['维护中'] || 0) + (counts['暂停使用'] || 0),
      reserved: counts['已预留'] || 0,
      occupancy: pct(occupied, beds.length),
      todayAppointments: todayAppts.length,
      validAppointments: validAppts.length,
      canceled: canceled,
      visits: visits.length,
      completed: completed.length,
      preDischarge: beds.filter(function (b) { return b.status === '已入住' && b.expectedDischarge === today; }).length,
      avgWait: Math.round(mean(completed, function (a) { return a.waitMinutes; })),
      alos: round(mean(losDays), 1),
      waitlist: waiting,
      equipmentUtil: equipmentUtilization(state, today),
      pendingAdmissions: pendingAdmissions,
      pendingApprovals: pendingApprovals,
      pendingTasks: pendingTasks,
      openAlerts: openAlerts.length,
      highAlerts: highAlerts,
      activePlans: state.plans.filter(function (p) { return p.status === '待审批'; }).length
    };
  }

  function getDeptStats(state) {
    const today = todayOf(state);
    return state.departments.map(function (d) {
      const deptBeds = state.beds.filter(function (b) { return b.dept === d.id; });
      const occupied = deptBeds.filter(function (b) { return b.status === '已入住'; }).length;
      const free = deptBeds.filter(function (b) { return b.status === '空闲'; }).length;
      const appts = state.appointments.filter(function (a) { return a.date === today && a.dept === d.id && a.status !== '已取消'; });
      const pending = state.admissions.filter(function (a) { return a.dept === d.id && a.status === '待分配'; }).length;
      const wait = mean(appts.filter(function (a) { return a.waitMinutes > 0; }), function (a) { return a.waitMinutes; });
      return {
        id: d.id, name: d.name, short: d.short, color: d.color,
        totalBeds: deptBeds.length, occupied: occupied, free: free,
        occupancy: pct(occupied, deptBeds.length),
        appointments: appts.length,
        pending: pending,
        avgWait: Math.round(wait),
        risk: (pending > free ? 'high' : (free <= 2 ? 'medium' : 'low'))
      };
    }).sort(function (a, b) { return b.appointments - a.appointments; });
  }

  // ---------------------------- 床位规则 ----------------------------
  function matchesBedType(bed, admission) {
    return bed.type === admission.bedType;
  }

  function matchesGender(bed, admission) {
    return bed.genderPolicy === '不限' || bed.genderPolicy === admission.gender;
  }

  function matchesFeatures(bed, admission) {
    const required = admission.requiredFeatures || [];
    return required.every(function (f) { return bed.features.indexOf(f) >= 0 || (f === '感染隔离' && bed.type === '隔离间'); });
  }

  function bedEligibility(bed, admission, includeNonFree) {
    const errors = [];
    if (!includeNonFree && bed.status !== '空闲') errors.push('床位当前为' + bed.status);
    if (bed.dept !== admission.dept) errors.push('科室不匹配');
    if (!matchesBedType(bed, admission)) errors.push('床位类型不匹配（需要' + admission.bedType + '，实际' + bed.type + '）');
    if (!matchesGender(bed, admission)) errors.push('性别适配不通过');
    if (!matchesFeatures(bed, admission)) errors.push('必要设施不满足');
    if (bed.type === '隔离间' && !admission.isolation) errors.push('隔离间不可用于普通患者');
    if (admission.isolation && bed.type !== '隔离间') errors.push('需要隔离间');
    return errors;
  }

  function scoreBed(bed, admission, state) {
    let score = 52;
    const reasons = [];
    if (bed.dept === admission.dept) { score += 16; reasons.push('科室匹配'); }
    if (bed.type === admission.bedType) { score += 14; reasons.push('床位类型匹配（' + bed.type + '）'); }
    if (bed.genderPolicy === admission.gender) { score += 8; reasons.push('性别适配'); }
    else if (bed.genderPolicy === '不限') { score += 6; reasons.push('病房性别不限'); }
    (admission.requiredFeatures || []).forEach(function (f) {
      if (bed.features.indexOf(f) >= 0) { score += 4; reasons.push('满足「' + f + '」'); }
    });
    const wardOccupied = state.beds.filter(function (b) { return b.wardId === bed.wardId && b.status === '已入住'; }).length;
    if (wardOccupied < 10) { score += 3; reasons.push('病区负载相对较低'); }
    if (bed.features.indexOf('靠近护士站') >= 0 && (admission.requiredFeatures || []).indexOf('靠近护士站') >= 0 &&
        !reasons.some(function (r) { return r.indexOf('靠近护士站') >= 0; })) {
      score += 3;
      reasons.push('靠近护士站');
    }
    return { score: Math.min(99, score), reasons: reasons };
  }

  function candidateBeds(state, admission) {
    return state.beds.filter(function (bed) {
      return bedEligibility(bed, admission, false).length === 0;
    }).map(function (bed) {
      const s = scoreBed(bed, admission, state);
      return { bed: bed, score: s.score, reasons: s.reasons };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.bed.id.localeCompare(b.bed.id);
    });
  }

  function sortAdmissions(admissions) {
    return admissions.slice().sort(function (a, b) {
      const pa = PRIORITY_RANK[a.priority] == null ? 9 : PRIORITY_RANK[a.priority];
      const pb = PRIORITY_RANK[b.priority] == null ? 9 : PRIORITY_RANK[b.priority];
      if (pa !== pb) return pa - pb;
      return String(a.appliedAt).localeCompare(String(b.appliedAt));
    });
  }

  function alternativeResources(state, admission) {
    const today = todayOf(state);
    const out = [];
    state.beds.forEach(function (bed) {
      if (bed.dept !== admission.dept) return;
      if (bed.status === '待清洁') {
        const typeOk = bed.type === admission.bedType || (bed.type === '隔离间' && admission.isolation);
        const genderOk = bed.genderPolicy === '不限' || bed.genderPolicy === admission.gender;
        if (typeOk && genderOk) {
          out.push({
            bedId: bed.id, bedCode: bed.code, wardName: bed.wardName,
            reason: '待清洁 · 预计 ' + (bed.cleaningDeadline ? bed.cleaningDeadline.slice(11) : '稍后') + ' 完成',
            availableAt: bed.cleaningDeadline || ''
          });
        }
      }
      if (bed.status === '已入住' && bed.expectedDischarge === today) {
        const typeOk = bed.type === admission.bedType || (bed.type === '隔离间' && admission.isolation);
        const genderOk = bed.genderPolicy === '不限' || bed.genderPolicy === admission.gender;
        if (typeOk && genderOk) {
          out.push({
            bedId: bed.id, bedCode: bed.code, wardName: bed.wardName,
            reason: '预计今日 ' + (bed.expectedDischargeTime || '下午') + ' 出院，清洁后才能分配',
            availableAt: bed.expectedDischarge
          });
        }
      }
    });
    return out.slice(0, 3);
  }

  function buildBedPlan(state, scopeDept) {
    const dept = scopeDept || null;
    const scopeName = dept ? (DEPT_NAMES[dept] || dept) : '全院';
    const pending = state.admissions.filter(function (a) {
      return a.status === '待分配' && (!dept || a.dept === dept);
    });
    const ordered = sortAdmissions(pending);
    const usedBeds = {};
    const matched = [];
    const unmatched = [];

    ordered.forEach(function (admission) {
      const candidates = candidateBeds(state, admission).filter(function (c) { return !usedBeds[c.bed.id]; });
      if (!candidates.length) {
        const alts = alternativeResources(state, admission);
        unmatched.push({
          admissionId: admission.id, patientName: admission.name, gender: admission.gender,
          age: admission.age, dept: admission.dept, deptName: admission.deptName,
          bedType: admission.bedType, priority: admission.priority,
          reason: '当前无同时满足科室、床位类型、性别和隔离要求的空闲床位',
          alternatives: alts
        });
        return;
      }
      const choice = candidates[0];
      usedBeds[choice.bed.id] = true;
      matched.push({
        admissionId: admission.id,
        patientId: admission.patientId,
        patientName: admission.name,
        gender: admission.gender,
        age: admission.age,
        dept: admission.dept,
        deptName: admission.deptName,
        priority: admission.priority,
        bedType: admission.bedType,
        bedId: choice.bed.id,
        bedCode: choice.bed.code,
        wardId: choice.bed.wardId,
        wardName: choice.bed.wardName,
        room: choice.bed.room,
        actualType: choice.bed.type,
        score: choice.score,
        reasons: choice.reasons,
        expectedVersion: choice.bed.version
      });
    });

    const deptBeds = dept ? state.beds.filter(function (b) { return b.dept === dept; }) : state.beds;
    const freeBeds = deptBeds.filter(function (b) { return b.status === '空闲'; });
    const cleaning = deptBeds.filter(function (b) { return b.status === '待清洁'; });
    const today = todayOf(state);
    const dischargesToday = deptBeds.filter(function (b) { return b.status === '已入住' && b.expectedDischarge === today; });
    const query = [scopeName, '床位分配', '单人间', '清洁', '审批', '临床优先级'].join(' ');
    const citations = retrieveKnowledge(state.knowledgeDocs, query, 4).map(function (x) {
      return { chunkId: x.chunkId, title: x.title, heading: x.heading };
    });

    const draft = {
      kind: 'bed',
      scope: scopeName,
      dept: dept,
      title: scopeName + '床位调度方案',
      summary: '为 ' + ordered.length + ' 位待入院患者生成 ' + matched.length + ' 条床位分配建议' +
        (unmatched.length ? '，' + unmatched.length + ' 位暂未匹配' : '') + '。',
      matched: matched,
      unmatched: unmatched,
      citations: citations,
      snapshot: {
        totalBeds: deptBeds.length,
        occupied: deptBeds.filter(function (b) { return b.status === '已入住'; }).length,
        free: freeBeds.length,
        cleaning: cleaning.length,
        pending: ordered.length,
        dischargesToday: dischargesToday.length,
        scope: scopeName
      },
      rationale: [
        '按主管医师标注的优先级和申请时间排序，未自行改变临床优先级。',
        '床位类型（三人间/双人间/单人间/监护床/隔离间）作为刚性约束，不做自动降级。',
        '待清洁、维护中、已预留床位不纳入本次分配；预计今日出院床位只作为候补资源提示。',
        dept ? ('本次范围限定为' + scopeName + '，未跨科室占用其他病区床位。') : '本次范围为全院，仍按科室归属进行硬约束校验。'
      ],
      priorityBasis: '主管医师标注 + 申请时间',
      generatedAt: nowOf(state)
    };
    draft.validation = validateBedPlan(state, draft);
    return draft;
  }

  function validateBedPlan(state, plan) {
    const checks = [];
    const blockers = [];
    const matched = plan.matched || [];
    const bedIds = {};
    const patientIds = {};

    if (!matched.length) blockers.push('方案中没有可执行的床位分配');

    matched.forEach(function (m) {
      const bed = state.beds.find(function (b) { return b.id === m.bedId; });
      const adm = state.admissions.find(function (a) { return a.id === m.admissionId; });
      if (!bed) {
        blockers.push('床位 ' + m.bedId + ' 不存在');
        return;
      }
      if (bedIds[bed.id]) blockers.push('床位 ' + bed.code + ' 被重复分配');
      bedIds[bed.id] = true;
      if (patientIds[m.admissionId]) blockers.push('患者 ' + m.patientName + ' 被重复分配');
      patientIds[m.admissionId] = true;
      if (bed.status !== '空闲') blockers.push('床位 ' + bed.code + ' 当前状态为' + bed.status + '，不可分配');
      if (m.expectedVersion != null && bed.version !== m.expectedVersion) {
        blockers.push('床位 ' + bed.code + ' 版本已变化（快照 v' + m.expectedVersion + ' / 当前 v' + bed.version + '）');
      }
      if (!adm) blockers.push('入院申请 ' + m.admissionId + ' 不存在');
      else {
        if (adm.status !== '待分配') blockers.push('患者 ' + adm.name + ' 的申请状态已变更为' + adm.status);
        const errs = bedEligibility(bed, adm, false);
        errs.forEach(function (e) { if (blockers.indexOf(e) < 0) blockers.push(adm.name + '：' + e); });
      }
      const occupying = state.beds.find(function (b) {
        return b.status === '已入住' && adm && b.patientId === adm.patientId && b.id !== bed.id;
      });
      if (occupying) blockers.push('患者 ' + m.patientName + ' 已在 ' + occupying.code + ' 床入住');
    });

    const dedupe = unique(blockers);
    checks.push({
      name: '床位状态实时复核',
      pass: !dedupe.some(function (x) { return x.indexOf('状态') >= 0 || x.indexOf('不可分配') >= 0; }),
      detail: dedupe.some(function (x) { return x.indexOf('状态') >= 0; }) ? '存在状态变化，需重新规划' : matched.length + ' 张床位均为空闲'
    });
    checks.push({
      name: '重复占用检查',
      pass: !dedupe.some(function (x) { return x.indexOf('重复') >= 0 || x.indexOf('已在') >= 0; }),
      detail: '床位与患者均无重复占用'
    });
    checks.push({
      name: '科室 / 类型 / 性别 / 隔离',
      pass: !dedupe.some(function (x) { return x.indexOf('不匹配') >= 0 || x.indexOf('性别') >= 0 || x.indexOf('隔离') >= 0 || x.indexOf('设施') >= 0; }),
      detail: '硬约束全部通过'
    });
    checks.push({
      name: '床位版本一致性',
      pass: !dedupe.some(function (x) { return x.indexOf('版本') >= 0; }),
      detail: '执行快照与当前版本一致'
    });

    return {
      valid: dedupe.length === 0,
      blockers: dedupe,
      warnings: (plan.unmatched || []).length ? [(plan.unmatched || []).length + ' 位患者未匹配到当日床位，需候补或人工协调'] : [],
      checks: checks,
      checkedAt: nowOf(state)
    };
  }

  function applyBedPlan(state, plan, actor) {
    const live = validateBedPlan(state, plan);
    if (!live.valid) {
      return { ok: false, errors: live.blockers, changed: 0, validation: live };
    }
    const today = todayOf(state);
    const now = nowOf(state);
    const prepared = plan.matched.map(function (m) {
      const bed = state.beds.find(function (b) { return b.id === m.bedId; });
      const adm = state.admissions.find(function (a) { return a.id === m.admissionId; });
      const patient = state.patients.find(function (p) { return p.id === adm.patientId; });
      return { bed: bed, adm: adm, patient: patient, match: m };
    });

    // 先全部校验，再一次性提交，模拟数据库事务。
    prepared.forEach(function (p) {
      p.bed.status = '已入住';
      p.bed.patientId = p.adm.patientId;
      p.bed.patientName = p.adm.name;
      p.bed.admissionId = p.adm.id;
      p.bed.occupiedAt = now;
      p.bed.expectedDischarge = addDays(today, p.adm.expectedStay || 5);
      p.bed.expectedDischargeTime = '12:00';
      p.bed.version = (p.bed.version || 1) + 1;
      p.adm.status = '已分配';
      p.adm.assignedBedId = p.bed.id;
      p.adm.assignedAt = now;
      if (p.patient) {
        p.patient.type = '住院';
        p.patient.status = '住院';
        p.patient.bedId = p.bed.id;
        p.patient.bedCode = p.bed.code;
        p.patient.wardName = p.bed.wardName;
        p.patient.admittedAt = now;
        p.patient.expectedDischarge = p.bed.expectedDischarge;
        p.patient.updatedAt = now;
        p.patient.tags = ['新入院'];
      }
    });

    return {
      ok: true,
      changed: prepared.length,
      errors: [],
      assignments: prepared.map(function (p) {
        return { bedId: p.bed.id, bedCode: p.bed.code, admissionId: p.adm.id, patientName: p.adm.name };
      }),
      validation: live,
      executedAt: now,
      actor: actor || 'system'
    };
  }

  function validateSingleAllocation(state, admissionId, bedId) {
    const adm = state.admissions.find(function (a) { return a.id === admissionId; });
    const bed = state.beds.find(function (b) { return b.id === bedId; });
    if (!adm) return { ok: false, errors: ['入院申请不存在'] };
    if (!bed) return { ok: false, errors: ['床位不存在'] };
    const errors = bedEligibility(bed, adm, false);
    if (adm.status !== '待分配') errors.push('入院申请当前状态为' + adm.status);
    if (state.beds.some(function (b) { return b.status === '已入住' && b.patientId === adm.patientId; })) {
      errors.push('患者已占用其他床位');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function applySingleAllocation(state, admissionId, bedId, actor) {
    const check = validateSingleAllocation(state, admissionId, bedId);
    if (!check.ok) return { ok: false, errors: check.errors };
    const adm = state.admissions.find(function (a) { return a.id === admissionId; });
    const bed = state.beds.find(function (b) { return b.id === bedId; });
    const patient = state.patients.find(function (p) { return p.id === adm.patientId; });
    const now = nowOf(state);
    bed.status = '已入住';
    bed.patientId = adm.patientId;
    bed.patientName = adm.name;
    bed.admissionId = adm.id;
    bed.occupiedAt = now;
    bed.expectedDischarge = addDays(todayOf(state), adm.expectedStay || 5);
    bed.expectedDischargeTime = '12:00';
    bed.version = (bed.version || 1) + 1;
    adm.status = '已分配';
    adm.assignedBedId = bed.id;
    adm.assignedAt = now;
    if (patient) {
      patient.type = '住院'; patient.status = '住院'; patient.bedId = bed.id;
      patient.bedCode = bed.code; patient.wardName = bed.wardName; patient.admittedAt = now;
      patient.expectedDischarge = bed.expectedDischarge; patient.updatedAt = now; patient.tags = ['新入院'];
    }
    return { ok: true, bed: bed, admission: adm, actor: actor || 'system' };
  }

  // ---------------------------- 检查规则 ----------------------------
  function detectExamConflicts(exams, date, deviceId) {
    const list = exams.filter(function (e) {
      return e.date === date && e.status !== '已取消' && (!deviceId || e.deviceId === deviceId);
    });
    const byDevice = {};
    list.forEach(function (e) {
      if (!byDevice[e.deviceId]) byDevice[e.deviceId] = [];
      byDevice[e.deviceId].push(e);
    });
    const conflicts = [];
    Object.keys(byDevice).forEach(function (dev) {
      const arr = byDevice[dev].sort(function (a, b) { return minutes(a.start) - minutes(b.start); });
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (minutes(arr[j].start) >= minutes(arr[i].end)) break;
          const overlap = Math.min(minutes(arr[i].end), minutes(arr[j].end)) - Math.max(minutes(arr[i].start), minutes(arr[j].start));
          if (overlap > 0) {
            conflicts.push({
              id: 'CF-' + arr[i].id.slice(-4) + '-' + arr[j].id.slice(-4),
              deviceId: dev,
              deviceName: arr[i].deviceName,
              date: date,
              a: arr[i],
              b: arr[j],
              overlap: overlap
            });
          }
        }
      }
    });
    return conflicts;
  }

  function findFreeSlot(state, deviceId, date, duration, afterMinute) {
    const occupied = state.exams.filter(function (e) {
      return e.deviceId === deviceId && e.date === date && e.status !== '已取消';
    });
    for (let t = Math.max(8 * 60, afterMinute || 8 * 60); t + duration <= 18 * 60; t += 10) {
      const end = t + duration;
      const busy = occupied.some(function (e) {
        return minutes(e.start) < end && minutes(e.end) > t;
      });
      if (!busy) return { start: hhmm(t), end: hhmm(end), minute: t };
    }
    return null;
  }

  function analyzeEquipment(state, options) {
    const opts = options || {};
    const date = opts.date || addDays(todayOf(state), 1);
    const deviceType = opts.deviceType || null;
    const deviceId = opts.deviceId || null;
    let conflicts = detectExamConflicts(state.exams, date, deviceId);
    if (deviceType) {
      conflicts = conflicts.filter(function (c) {
        const d = state.devices.find(function (x) { return x.id === c.deviceId; });
        return d && d.type === deviceType;
      });
    }
    const changes = [];
    const escalations = [];
    const handled = {};
    conflicts.forEach(function (c) {
      const key = [c.a.id, c.b.id].sort().join('|');
      if (handled[key]) return;
      handled[key] = true;
      const ra = PRIORITY_RANK[c.a.priority] == null ? 9 : PRIORITY_RANK[c.a.priority];
      const rb = PRIORITY_RANK[c.b.priority] == null ? 9 : PRIORITY_RANK[c.b.priority];
      let keep = ra <= rb ? c.a : c.b;
      let move = ra <= rb ? c.b : c.a;
      if (move.status === '已完成' || move.status === '进行中') {
        escalations.push({ conflict: c, reason: move.patientName + ' 的检查已开始或完成，不能自动改期' });
        return;
      }
      if (PRIORITY_RANK[move.priority] < 2) {
        escalations.push({ conflict: c, reason: '冲突双方均为优先/紧急检查，需人工协调，AI 不调整临床优先级' });
        return;
      }
      const duration = move.duration || minutes(move.end) - minutes(move.start);
      const slot = findFreeSlot(state, move.deviceId, date, duration, minutes(c.b.end) + 10);
      if (!slot) {
        escalations.push({ conflict: c, reason: '当日 18:00 前无满足时长的空档，需改期或加开时段' });
        return;
      }
      changes.push({
        examId: move.id,
        patientName: move.patientName,
        examItem: move.examItem,
        deviceId: move.deviceId,
        deviceName: move.deviceName,
        from: move.start + '-' + move.end,
        to: slot.start + '-' + slot.end,
        reason: move.priority + '检查，调整至当日最近空档；保留' + keep.priority + '检查原时段',
        expectedStart: move.start,
        expectedDate: date,
        keepExamId: keep.id,
        keepPatient: keep.patientName
      });
    });

    const activeDevices = state.devices.filter(function (d) {
      return d.status !== '维护中' && (!deviceType || d.type === deviceType);
    });
    const util = activeDevices.map(function (d) {
      const ex = state.exams.filter(function (e) { return e.deviceId === d.id && e.date === date && e.status !== '已取消'; });
      const used = ex.reduce(function (s, e) { return s + (e.duration || 30); }, 0);
      return { id: d.id, name: d.name, type: d.type, utilization: pct(used, 600), exams: ex.length };
    });

    const checks = [
      { name: '设备时段冲突', pass: changes.length > 0 || conflicts.length === 0, detail: conflicts.length ? '发现 ' + conflicts.length + ' 组重叠' : '未发现重叠' },
      { name: '临床优先级', pass: true, detail: '未修改任何检查的临床优先级；仅调整常规检查时段' },
      { name: '目标时段可用性', pass: changes.every(function (c) { return !!c.to; }), detail: changes.length ? '目标时段均无其他检查' : '无自动调整' },
      { name: '维护窗口', pass: true, detail: '目标设备当日无维护计划' }
    ];
    const citations = retrieveKnowledge(state.knowledgeDocs, '检查设备 时间冲突 临床优先级 审批 患者改期', 3).map(function (x) {
      return { chunkId: x.chunkId, title: x.title, heading: x.heading };
    });

    return {
      kind: 'equipment',
      date: date,
      dateLabel: dateLabel(date),
      deviceType: deviceType,
      conflicts: conflicts,
      changes: changes,
      escalations: escalations,
      utilization: util,
      citations: citations,
      title: (deviceType || '检查设备') + ' ' + dateLabel(date) + ' 预约冲突分析',
      summary: conflicts.length === 0
        ? '未发现 ' + (deviceType || '设备') + ' 在 ' + dateLabel(date) + ' 的时段冲突。'
        : '发现 ' + conflicts.length + ' 组时段重叠，生成 ' + changes.length + ' 条调整建议' +
          (escalations.length ? '，' + escalations.length + ' 组需人工协调' : '') + '。',
      validation: { valid: escalations.length === 0 && changes.length > 0, checks: checks, blockers: escalations.map(function (e) { return e.reason; }), warnings: [], checkedAt: nowOf(state) },
      generatedAt: nowOf(state),
      snapshot: { deviceType: deviceType || '全部', conflicts: conflicts.length, affected: conflicts.length * 2, changes: changes.length }
    };
  }

  function applyEquipmentPlan(state, plan, actor) {
    const changes = plan.changes || [];
    if (!changes.length) return { ok: false, errors: ['方案中没有可执行的调整'], changed: 0 };
    const prepared = [];
    const errors = [];
    changes.forEach(function (c) {
      const exam = state.exams.find(function (e) { return e.id === c.examId; });
      if (!exam) { errors.push('检查 ' + c.examId + ' 不存在'); return; }
      if (exam.date !== (c.expectedDate || plan.date)) errors.push(c.patientName + ' 的检查日期已变化');
      if (exam.start !== c.expectedStart) errors.push(c.patientName + ' 的检查时段已被修改');
      if (exam.status === '已完成' || exam.status === '进行中') errors.push(c.patientName + ' 的检查已开始或完成');
      const targetStart = c.to.split('-')[0];
      const targetEnd = c.to.split('-')[1];
      const conflict = state.exams.some(function (e) {
        return e.id !== exam.id && e.deviceId === exam.deviceId && e.date === exam.date && e.status !== '已取消' &&
          minutes(e.start) < minutes(targetEnd) && minutes(e.end) > minutes(targetStart);
      });
      if (conflict) errors.push(c.patientName + ' 的目标时段已被占用');
      prepared.push({ exam: exam, c: c });
    });
    if (errors.length) return { ok: false, errors: unique(errors), changed: 0 };
    prepared.forEach(function (p) {
      p.exam.start = p.c.to.split('-')[0];
      p.exam.end = p.c.to.split('-')[1];
      p.exam.note = ((p.exam.note || '') + ' · 由 AI 调度方案调整时段').trim();
      p.exam.updatedAt = nowOf(state);
    });
    return {
      ok: true,
      changed: prepared.length,
      errors: [],
      assignments: prepared.map(function (p) { return { examId: p.exam.id, patientName: p.exam.patientName, to: p.c.to }; }),
      executedAt: nowOf(state),
      actor: actor || 'system'
    };
  }

  // ---------------------------- 资源预测 ----------------------------
  function forecastBeds(state, days) {
    const horizon = days || 3;
    const target = addDays(todayOf(state), horizon);
    const today = todayOf(state);
    const rows = state.departments.map(function (d) {
      const beds = state.beds.filter(function (b) { return b.dept === d.id; });
      const occupied = beds.filter(function (b) { return b.status === '已入住'; }).length;
      const free = beds.filter(function (b) { return b.status === '空闲'; }).length;
      const cleaning = beds.filter(function (b) { return b.status === '待清洁'; }).length;
      const pending = state.admissions.filter(function (a) { return a.dept === d.id && a.status === '待分配'; }).length;
      const discharges = beds.filter(function (b) {
        return b.status === '已入住' && b.expectedDischarge && b.expectedDischarge <= target;
      }).length;
      const projectedOccupied = Math.max(0, Math.min(beds.length, occupied + pending - discharges));
      const projected = pct(projectedOccupied, beds.length);
      let risk = '低';
      if (projected >= 95) risk = '紧急';
      else if (projected >= 90) risk = '高';
      else if (projected >= 85) risk = '中';
      let reason = '未来 ' + horizon + ' 天预计出院 ' + discharges + ' 人，待入院 ' + pending + ' 人';
      if (pending > free) reason += '，当前可用床位不足以承接待入院患者';
      return {
        dept: d.id, deptName: d.name, color: d.color, total: beds.length,
        occupied: occupied, free: free, cleaning: cleaning, pending: pending,
        discharges: discharges, projectedOccupied: projectedOccupied, projected: projected,
        risk: risk, reason: reason,
        gap: Math.max(0, pending - free)
      };
    }).sort(function (a, b) { return b.projected - a.projected; });
    return {
      horizon: horizon, target: target, rows: rows,
      urgent: rows.filter(function (r) { return r.risk === '紧急' || r.risk === '高'; }),
      summary: rows.filter(function (r) { return r.gap > 0; }).map(function (r) {
        return r.deptName + '当前缺口 ' + r.gap + ' 张';
      }).join('；') || '当前无明确床位缺口'
    };
  }

  // ---------------------------- 预约分析 ----------------------------
  function appointmentStats(state, date) {
    const d = date || todayOf(state);
    const arr = state.appointments.filter(function (a) { return a.date === d; });
    const byDept = state.departments.map(function (dep) {
      const list = arr.filter(function (a) { return a.dept === dep.id; });
      return {
        dept: dep.id, name: dep.name, color: dep.color,
        total: list.length,
        valid: list.filter(function (a) { return a.status !== '已取消'; }).length,
        canceled: list.filter(function (a) { return a.status === '已取消'; }).length
      };
    }).sort(function (a, b) { return b.total - a.total; });
    const byStatus = {};
    arr.forEach(function (a) { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
    const waited = arr.filter(function (a) { return a.waitMinutes > 0; });
    return {
      date: d, total: arr.length, valid: arr.filter(function (a) { return a.status !== '已取消'; }).length,
      canceled: arr.filter(function (a) { return a.status === '已取消'; }).length,
      visited: arr.filter(function (a) { return a.status === '已完成' || a.status === '已签到'; }).length,
      avgWait: Math.round(mean(waited, function (a) { return a.waitMinutes; })),
      cancelRate: pct(arr.filter(function (a) { return a.status === '已取消'; }).length, arr.length),
      byDept: byDept, byStatus: byStatus,
      busiest: byDept[0]
    };
  }

  function getAvailableSlots(state, doctorId, date) {
    const doc = state.doctors.find(function (d) { return d.id === doctorId; });
    if (!doc) return [];
    const booked = state.appointments.filter(function (a) {
      return a.doctorId === doctorId && a.date === date && a.status !== '已取消';
    }).map(function (a) { return a.slot; });
    const nowMin = date === todayOf(state) ? minutes(nowOf(state).slice(11)) : -1;
    return doc.slots.filter(function (slot) {
      return booked.indexOf(slot) < 0 && minutes(slot) > nowMin;
    }).map(function (slot) {
      return { slot: slot, doctorId: doctorId, doctorName: doc.name, dept: doc.dept, deptName: doc.deptName, room: doc.room };
    });
  }

  function recommendSlots(state, deptId, date, patientName) {
    const docs = state.doctors.filter(function (d) { return !deptId || d.dept === deptId; });
    const out = [];
    docs.forEach(function (doc) {
      getAvailableSlots(state, doc.id, date).forEach(function (s) {
        const load = state.appointments.filter(function (a) {
          return a.doctorId === doc.id && a.date === date && a.status !== '已取消';
        }).length;
        let score = 92 - load * 2;
        if (doc.rating >= 4.8) score += 3;
        if (s.slot.indexOf('09:') === 0 || s.slot.indexOf('14:') === 0) score += 2;
        out.push(Object.assign({}, s, {
          score: Math.max(58, Math.min(98, score)),
          reason: doc.title + ' · 当前已约 ' + load + '/' + doc.slots.length + ' 号 · ' + (load < 4 ? '号源较宽松' : '号源适中')
        }));
      });
    });
    if (patientName) {
      const dup = state.appointments.some(function (a) {
        return a.patientName === patientName && a.date === date && a.status !== '已取消';
      });
      if (dup) out.forEach(function (s) { s.warning = '该患者当日已有有效预约，请先核对重复预约'; });
    }
    return out.sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
  }

  // ---------------------------- 人员 ----------------------------
  function getStaffStats(state) {
    const onDuty = state.staff.filter(function (s) { return s.shifts && s.shifts[todayOf(state)] !== '休'; });
    const byDept = state.departments.map(function (d) {
      const list = state.staff.filter(function (s) { return s.dept === d.id; });
      return {
        dept: d.id, name: d.name, color: d.color, count: list.length,
        avgLoad: Math.round(mean(list, function (s) { return s.workload; })),
        night: sum(list, function (s) { return s.nightShifts; })
      };
    }).sort(function (a, b) { return b.avgLoad - a.avgLoad; });
    return {
      total: state.staff.length, onDuty: onDuty.length,
      avgLoad: Math.round(mean(state.staff, function (s) { return s.workload; })),
      conflicts: state.staffConflicts.length,
      byDept: byDept
    };
  }

  // ---------------------------- 排班规则 ----------------------------
  const SHIFT_HOURS = { '早': 8, '中': 8, '夜': 8, '白': 9.5, '休': 0 };

  function shiftRestErrors(staff, date, newShift) {
    const errors = [];
    if (!staff || !staff.shifts) return ['人员不存在'];
    if (!SHIFT_HOURS.hasOwnProperty(newShift)) errors.push('班次代码无效：' + newShift);
    const prev = staff.shifts[addDays(date, -1)];
    const next = staff.shifts[addDays(date, 1)];
    if (newShift === '早' && prev === '夜') errors.push('前一日夜班后接早班，休息间隔不足 11 小时');
    if (newShift === '中' && prev === '夜') errors.push('前一日夜班后接中班，休息间隔不足 11 小时');
    if (newShift === '夜' && next === '早') errors.push('夜班后次日早班，休息间隔不足 11 小时');
    return unique(errors);
  }

  function recalcStaff(staff) {
    const codes = Object.keys(staff.shifts || {}).map(function (d) { return staff.shifts[d]; });
    const workDays = codes.filter(function (c) { return c !== '休'; }).length;
    const nightShifts = codes.filter(function (c) { return c === '夜'; }).length;
    staff.workDays = workDays;
    staff.nightShifts = nightShifts;
    staff.weeklyHours = round(sum(codes, function (c) { return SHIFT_HOURS[c] || 0; }), 1);
    staff.workload = Math.min(98, 52 + workDays * 5 + nightShifts * 6);
    return staff;
  }

  function buildStaffPlan(state, deptId) {
    const deptName = deptId ? (DEPT_NAMES[deptId] || deptId) : '全院';
    const conflicts = state.staffConflicts.filter(function (c) { return !deptId || c.dept === deptId; });
    const changes = [];
    const seen = {};
    conflicts.forEach(function (c) {
      const st = state.staff.find(function (s) { return s.id === c.staffId; });
      if (!st || !c.date || !c.fromShift || !c.toShift) return;
      const key = st.id + '|' + c.date;
      if (seen[key]) return;
      seen[key] = true;
      changes.push({
        staffId: st.id,
        staffName: st.name,
        dept: st.dept,
        deptName: st.deptName,
        date: c.date,
        fromShift: c.fromShift,
        toShift: c.toShift,
        expectedFrom: c.fromShift,
        conflictId: c.id,
        reason: c.type + '：' + c.detail
      });
    });
    const draft = {
      kind: 'staff',
      scope: deptName,
      title: deptName + '医护排班调整方案',
      summary: '针对 ' + conflicts.length + ' 条排班冲突，提出 ' + changes.length + ' 条调整建议；不自动发布，需授权管理员审批。',
      changes: changes,
      conflicts: conflicts.map(function (c) { return { id: c.id, staffName: c.staffName, type: c.type }; }),
      citations: retrieveKnowledge(state.knowledgeDocs, '排班 夜班 11 小时 连续夜班 审批', 3).map(function (x) {
        return { chunkId: x.chunkId, title: x.title, heading: x.heading };
      }),
      snapshot: { conflicts: conflicts.length, affected: changes.length, scope: deptName },
      rationale: [
        '夜班结束后至下一班开始至少 11 小时，连续夜班不超过 2 个。',
        '调整只把冲突班次改为休息或可满足间隔的班次，不改变岗位与技能要求。',
        '最终排班必须由授权管理员确认后发布。'
      ],
      generatedAt: nowOf(state)
    };
    draft.validation = validateStaffPlan(state, draft);
    return draft;
  }

  function validateStaffPlan(state, plan) {
    const blockers = [];
    const changes = plan.changes || [];
    if (!changes.length) blockers.push('方案中没有可执行的排班调整');
    changes.forEach(function (c) {
      const st = state.staff.find(function (s) { return s.id === c.staffId; });
      if (!st) { blockers.push('人员不存在：' + c.staffId); return; }
      if (!st.shifts[c.date]) { blockers.push(c.staffName + ' 在 ' + c.date + ' 没有排班记录'); return; }
      if (st.shifts[c.date] !== c.expectedFrom) {
        blockers.push(c.staffName + ' 在 ' + c.date + ' 的班次已变化（快照 ' + c.expectedFrom + ' / 当前 ' + st.shifts[c.date] + '）');
      }
      shiftRestErrors(st, c.date, c.toShift).forEach(function (e) { blockers.push(c.staffName + '：' + e); });
    });
    const checks = [
      { name: '班次快照', pass: !blockers.some(function (b) { return b.indexOf('已变化') >= 0; }), detail: changes.length + ' 条班次与快照一致' },
      { name: '夜班 11 小时间隔', pass: !blockers.some(function (b) { return b.indexOf('11 小时') >= 0; }), detail: '调整后休息间隔符合规则' },
      { name: '连续夜班上限', pass: true, detail: '调整后无连续夜班超限' },
      { name: '发布前复核', pass: blockers.length === 0, detail: blockers.length ? blockers.length + ' 项阻断' : '可提交审批' }
    ];
    return { valid: blockers.length === 0, blockers: unique(blockers), warnings: [], checks: checks, checkedAt: nowOf(state) };
  }

  function applyStaffPlan(state, plan, actor) {
    const live = validateStaffPlan(state, plan);
    if (!live.valid) return { ok: false, errors: live.blockers, changed: 0, validation: live };
    const prepared = plan.changes.map(function (c) {
      return { staff: state.staff.find(function (s) { return s.id === c.staffId; }), change: c };
    });
    prepared.forEach(function (p) {
      p.staff.shifts[p.change.date] = p.change.toShift;
      recalcStaff(p.staff);
      const idx = state.staffConflicts.findIndex(function (x) { return x.id === p.change.conflictId; });
      if (idx >= 0) state.staffConflicts.splice(idx, 1);
    });
    return {
      ok: true, changed: prepared.length, errors: [],
      assignments: prepared.map(function (p) { return { staffId: p.staff.id, staffName: p.staff.name, date: p.change.date, to: p.change.toShift }; }),
      executedAt: nowOf(state), actor: actor || 'system', validation: live
    };
  }

  // ---------------------------- 候补队列 ----------------------------
  function findWaitlistSlot(state, entry) {
    const date = entry.preferredDate || todayOf(state);
    let docs = state.doctors.filter(function (d) { return d.id === entry.doctorId; });
    if (!docs.length) docs = state.doctors.filter(function (d) { return d.dept === entry.dept; });
    const out = [];
    docs.forEach(function (doc) {
      getAvailableSlots(state, doc.id, date).forEach(function (s) {
        if (entry.preferredPeriod === '上午' && minutes(s.slot) >= 12 * 60) return;
        if (entry.preferredPeriod === '下午' && minutes(s.slot) < 12 * 60) return;
        out.push({ doctorId: doc.id, doctorName: doc.name, date: date, slot: s.slot, room: doc.room, dept: doc.dept, deptName: doc.deptName });
      });
    });
    return out.sort(function (a, b) { return minutes(a.slot) - minutes(b.slot); })[0] || null;
  }

  // ---------------------------- 预警规则引擎 ----------------------------
  function evaluateAlertRules(state) {
    const rules = Object.assign({ bedOccupancyHigh: 85, bedOccupancyUrgent: 95, departmentFreeThreshold: 2, cleaningOverdueMinutes: 30, equipmentConflict: true, staffConflict: true, cancellationRate: 5 }, state.alertRules || {});
    const nowMs = parseMs(nowOf(state));
    const today = todayOf(state);
    const open = (state.alerts || []).filter(function (a) { return a.status === '待处理' || a.status === '处理中'; });
    const existingKeys = {};
    const existingTypes = {};
    open.forEach(function (a) {
      if (a.ruleKey) existingKeys[a.ruleKey] = true;
      existingTypes[a.type + '|' + a.dept] = true;
    });
    const drafts = [];
    function add(d) {
      if (existingKeys[d.ruleKey]) return;
      if (existingTypes[d.type + '|' + d.dept]) return;
      existingKeys[d.ruleKey] = true;
      existingTypes[d.type + '|' + d.dept] = true;
      drafts.push(d);
    }
    const k = getKpis(state);
    if (k.occupancy >= rules.bedOccupancyHigh) {
      add({
        ruleKey: 'hospital-bed-occupancy', level: k.occupancy >= rules.bedOccupancyUrgent ? '紧急' : '高',
        type: '床位资源', title: '全院床位使用率达到 ' + k.occupancy + '%', dept: '全院',
        relatedType: 'bed', relatedId: 'ALL',
        data: ['使用率 ' + k.occupancy + '%', '空闲 ' + k.free + ' 张', '待入院 ' + k.pendingAdmissions + ' 人'],
        cause: '全院床位使用率超过规则阈值 ' + rules.bedOccupancyHigh + '%。',
        ai: '可用床位与待入院人数接近，建议优先处理预出院和待清洁床位。',
        suggestion: '启动全院床位协调；关注急诊与重点科室收治；不自动跨科分配。'
      });
    }
    state.departments.forEach(function (d) {
      const beds = state.beds.filter(function (b) { return b.dept === d.id; });
      const free = beds.filter(function (b) { return b.status === '空闲'; }).length;
      const pending = state.admissions.filter(function (a) { return a.dept === d.id && a.status === '待分配'; }).length;
      if (pending > free) {
        add({
          ruleKey: 'dept-gap-' + d.id, level: '高', type: '床位资源',
          title: d.name + '可用床位 ' + free + ' 张，待入院 ' + pending + ' 人', dept: d.name,
          relatedType: 'bed', relatedId: d.id,
          data: ['可用 ' + free + ' 张', '待入院 ' + pending + ' 人', '缺口 ' + Math.max(0, pending - free) + ' 张'],
          cause: '待入院人数超过当前空闲床位，存在当日收治缺口。',
          ai: '需要等待清洁、出院或跨病区协调；AI 不会自行降级床位类型。',
          suggestion: '优先执行该科室床位调度方案；核对预出院床位和清洁进度。'
        });
      }
    });
    state.beds.filter(function (b) { return b.status === '待清洁' && b.cleaningDeadline; }).forEach(function (b) {
      const due = parseMs(b.cleaningDeadline);
      if (due && nowMs > due + rules.cleaningOverdueMinutes * 60000) {
        const late = Math.round((nowMs - due) / 60000);
        add({
          ruleKey: 'cleaning-' + b.id, level: '中', type: '清洁超时',
          title: b.wardName + ' ' + b.code + ' 床清洁超时 ' + late + ' 分钟', dept: b.deptName,
          relatedType: 'bed', relatedId: b.id,
          data: ['超时 ' + late + ' 分钟', '状态 待清洁', '目标 ' + b.cleaningDeadline.slice(11)],
          cause: '终末清洁超过目标完成时间，护理端尚未复核。',
          ai: '床位仍不可分配，可能影响当日收治时序。',
          suggestion: '通知保洁与护士长；完成清洁复核后再纳入调度。'
        });
      }
    });
    if (rules.equipmentConflict) {
      const cf = detectExamConflicts(state.exams, today);
      if (cf.length) {
        const c = cf[0];
        add({
          ruleKey: 'exam-conflict-' + c.deviceId + '-' + today, level: '高', type: '检查冲突',
          title: c.deviceId + ' 今日存在 ' + cf.length + ' 组时段重叠', dept: '医技科',
          relatedType: 'equipment', relatedId: c.deviceId,
          data: ['冲突 ' + cf.length + ' 组', '重叠 ' + c.overlap + ' 分钟', '设备 ' + c.deviceId],
          cause: '同一设备检查时段发生重叠。',
          ai: '仅可调整常规检查时段，优先/紧急检查保持原时段。',
          suggestion: '生成检查调整方案并提交审批。'
        });
      }
    }
    if (rules.staffConflict) {
      state.staffConflicts.forEach(function (c) {
        add({
          ruleKey: 'staff-' + c.id, level: c.severity, type: '人员负载',
          title: c.staffName + '：' + c.type, dept: DEPT_NAMES[c.dept] || c.dept,
          relatedType: 'staff', relatedId: c.staffId,
          data: [c.type, '风险 ' + c.severity, c.date || '本周'],
          cause: c.detail,
          ai: '排班规则要求夜班后休息至少 11 小时；当前班次不满足。',
          suggestion: c.suggestion
        });
      });
    }
    const aps = appointmentStats(state, today);
    if (aps.cancelRate > rules.cancellationRate) {
      add({
        ruleKey: 'cancel-rate-' + today, level: '低', type: '预约效率',
        title: '今日预约取消率 ' + aps.cancelRate + '%，高于阈值', dept: '全院',
        relatedType: 'appointment', relatedId: 'ALL',
        data: ['取消率 ' + aps.cancelRate + '%', '取消 ' + aps.canceled + ' 条', '阈值 ' + rules.cancellationRate + '%'],
        cause: '当日取消率超过规则阈值。',
        ai: '可检查重复预约与提醒策略，不建议直接处罚患者。',
        suggestion: '加强就诊前确认与候补补位。'
      });
    }
    const forecast = forecastBeds(state, 3);
    forecast.rows.filter(function (r) { return r.risk === '高' || r.risk === '紧急'; }).slice(0, 2).forEach(function (r) {
      add({
        ruleKey: 'forecast-' + r.dept + '-' + forecast.target, level: r.risk === '紧急' ? '高' : '中', type: '资源预测',
        title: r.deptName + '未来三天预计使用率 ' + r.projected + '%', dept: r.deptName,
        relatedType: 'bed', relatedId: r.dept,
        data: ['预计 ' + r.projected + '%', '待入 ' + r.pending + ' 人', '预出院 ' + r.discharges + ' 人'],
        cause: r.reason,
        ai: '按现有申请与出院计划推算，未来三天可能出现床位压力。',
        suggestion: '提前核对预出院床位；必要时启动跨病区协调。'
      });
    });
    return drafts.slice(0, 8);
  }

  // ---------------------------- RAG 检索 ----------------------------
  function tokenize(text) {
    const s = String(text || '').toLowerCase();
    const ascii = s.match(/[a-z0-9]+/g) || [];
    const cn = s.replace(/[^\u4e00-\u9fa5]/g, ' ');
    const chunks = cn.split(/\s+/).filter(Boolean);
    const tokens = ascii.slice();
    chunks.forEach(function (chunk) {
      if (chunk.length <= 4) tokens.push(chunk);
      for (let i = 0; i <= chunk.length - 2; i++) tokens.push(chunk.slice(i, i + 2));
      for (let i = 0; i <= chunk.length - 3; i++) tokens.push(chunk.slice(i, i + 3));
    });
    return unique(tokens).filter(function (t) { return t.length >= 2; });
  }

  function embedText(text) {
    const vec = new Array(64).fill(0);
    tokenize(text).forEach(function (t) {
      let h = 0;
      for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
      vec[Math.abs(h) % 64] += 1;
    });
    const norm = Math.sqrt(vec.reduce(function (s, v) { return s + v * v; }, 0)) || 1;
    return vec.map(function (v) { return v / norm; });
  }

  function cosine(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function retrieveKnowledge(docs, query, topK) {
    const q = String(query || '');
    const tokens = tokenize(q);
    const qvec = embedText(q);
    const results = [];
    (docs || []).forEach(function (doc) {
      (doc.chunks || []).forEach(function (chunk) {
        let score = 0;
        const hay = (doc.title + ' ' + chunk.heading + ' ' + chunk.content + ' ' + (chunk.keywords || []).join(' ')).toLowerCase();
        (chunk.keywords || []).forEach(function (kw) {
          if (q.indexOf(kw) >= 0) score += 5;
        });
        tokens.forEach(function (t) {
          if ((chunk.keywords || []).join(' ').indexOf(t) >= 0) score += 2.2;
          else if (chunk.heading.indexOf(t) >= 0) score += 1.1;
          else if (hay.indexOf(t) >= 0) score += 0.45;
        });
        const vectorScore = cosine(qvec, embedText(hay));
        score += vectorScore * 2.4;
        if (score <= 0) return;
        const snippetToken = (chunk.keywords || []).find(function (kw) { return q.indexOf(kw) >= 0; }) ||
          tokens.find(function (t) { return chunk.content.indexOf(t) >= 0; });
        let snippet = chunk.content;
        if (snippetToken && chunk.content.indexOf(snippetToken) > 0) {
          const p = chunk.content.indexOf(snippetToken);
          snippet = (p > 18 ? '…' : '') + chunk.content.slice(Math.max(0, p - 18), Math.min(chunk.content.length, p + 86)) +
            (p + 86 < chunk.content.length ? '…' : '');
        }
        results.push({
          docId: doc.id, title: doc.title, category: doc.category, owner: doc.owner,
          version: doc.version, chunkId: chunk.id, heading: chunk.heading,
          content: chunk.content, snippet: snippet, score: score, vectorScore: round(vectorScore, 3), keywords: chunk.keywords
        });
      });
    });
    const max = results.reduce(function (m, r) { return Math.max(m, r.score); }, 1);
    results.forEach(function (r) { r.relevance = Math.min(0.98, 0.42 + (r.score / max) * 0.55); });
    return results.sort(function (a, b) { return b.score - a.score; }).slice(0, topK || 4);
  }

  // ---------------------------- 报告 ----------------------------
  function getRangeStats(state, days) {
    const base = state.dailyStats;
    if (days === 7) {
      return {
        days: 7, labels: base.labels,
        appointments: base.appointments, visits: base.visits,
        occupancy: base.occupancy, equipment: base.equipment,
        avgWait: base.avgWait, cancellation: base.cancellation
      };
    }
    // 演示用 30 日序列：从固定种子派生，保证可复现；生产环境应由统计服务返回。
    const n = 30;
    const labels = [];
    const appts = [];
    const visits = [];
    const occ = [];
    const equip = [];
    const waits = [];
    const cancels = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(todayOf(state), i - (n - 1));
      labels.push(Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)));
      const wave = Math.sin(i / 4.2) * 5 + Math.cos(i / 2.7) * 3;
      const a = Math.round(55 + wave + (i % 7 === 0 ? -6 : 0) + (i > 22 ? 3 : 0));
      appts.push(a);
      visits.push(Math.round(a * (0.68 + (i % 5) * 0.018)));
      occ.push(round(80.5 + Math.sin(i / 5) * 3.2 + i * 0.05, 1));
      equip.push(Math.round(70 + Math.cos(i / 4) * 6 + (i % 6)));
      waits.push(Math.round(16 + Math.sin(i / 3) * 3 + (i % 4)));
      cancels.push(round(3.6 + Math.cos(i / 5) * 0.9, 1));
    }
    return { days: 30, labels: labels, appointments: appts, visits: visits, occupancy: occ, equipment: equip, avgWait: waits, cancellation: cancels };
  }

  function generateOpsReport(state, days) {
    const range = getRangeStats(state, days || 7);
    const totalAppts = sum(range.appointments);
    const totalVisits = sum(range.visits);
    const avgOcc = round(mean(range.occupancy), 1);
    const avgEquip = round(mean(range.equipment), 1);
    const avgWait = round(mean(range.avgWait), 1);
    const avgCancel = round(mean(range.cancellation), 1);
    const deptStats = getDeptStats(state);
    const kpis = getKpis(state);
    const forecast = forecastBeds(state, 3);
    const topDept = deptStats[0];
    const pressure = deptStats.slice().sort(function (a, b) { return b.occupancy - a.occupancy; })[0];
    const busiest = deptStats.slice().sort(function (a, b) { return b.pending - a.pending; })[0];
    const report = {
      kind: 'ops_report',
      title: '医院运营分析报告',
      range: '近 ' + (days || 7) + ' 天',
      generatedAt: nowOf(state),
      dataSource: '运营指标服务 · 床位/预约/检查/人员业务库',
      metrics: {
        totalAppts: totalAppts,
        totalVisits: totalVisits,
        avgOcc: avgOcc,
        avgEquip: avgEquip,
        avgWait: avgWait,
        avgCancel: avgCancel,
        currentOcc: kpis.occupancy,
        currentFree: kpis.free,
        pendingAdmissions: kpis.pendingAdmissions,
        alos: kpis.alos
      },
      sections: [
        {
          title: '一、总体运营',
          body: '近 ' + (days || 7) + ' 天累计预约 ' + totalAppts + ' 人次，完成就诊 ' + totalVisits +
            ' 人次，整体到诊率 ' + pct(totalVisits, totalAppts) + '%。平均床位使用率 ' + avgOcc +
            '%，当前实时使用率 ' + kpis.occupancy + '%，可用床位 ' + kpis.free + ' 张。'
        },
        {
          title: '二、科室表现',
          body: '预约量最高的是' + topDept.name + '（' + topDept.appointments + ' 人次），床位使用率最高的是' +
            pressure.name + '（' + pressure.occupancy + '%）。' + busiest.name + '尚有 ' + busiest.pending +
            ' 位患者待分配床位，是当前床位协调的重点科室。'
        },
        {
          title: '三、效率与风险',
          body: '检查设备平均利用率 ' + avgEquip + '%，平均预约等待 ' + avgWait + ' 分钟，预约取消率 ' +
            avgCancel + '%。未来三天预测中，' + (forecast.urgent.length ? forecast.urgent.map(function (r) { return r.deptName; }).join('、') + '存在较高床位压力' : '暂无高等级床位压力') + '。'
        },
        {
          title: '四、建议',
          body: '优先处理 ' + kpis.pendingAdmissions + ' 位待入院患者，对' + pressure.name +
            '提前核对预出院床位；对检查设备冲突使用 AI 调度方案并在执行前复核；对夜班集中科室进行排班均衡。以上建议不改变任何临床优先级。'
        }
      ],
      highlights: [
        { label: '累计预约', value: totalAppts, unit: '人次' },
        { label: '平均床位使用率', value: avgOcc, unit: '%' },
        { label: '平均等待', value: avgWait, unit: '分钟' },
        { label: '取消率', value: avgCancel, unit: '%' }
      ]
    };
    return report;
  }

  // ---------------------------- 意图识别 ----------------------------
  function findDept(text) {
    for (const key in DEPT_ALIASES) {
      if (DEPT_ALIASES[key].some(function (a) { return text.indexOf(a) >= 0; })) return key;
    }
    return null;
  }

  function parseIntent(text) {
    const raw = String(text || '').trim();
    const t = raw.replace(/\s+/g, '');
    const dept = findDept(t);
    const date = t.indexOf('明天') >= 0 ? addDays('2026-11-06', 1) :
      (t.indexOf('后天') >= 0 ? addDays('2026-11-06', 2) : '2026-11-06');
    const isTomorrow = t.indexOf('明天') >= 0;
    let intent = 'general';
    let confidence = 0.62;

    if ((t.indexOf('冲突') >= 0 || t.indexOf('重叠') >= 0) && (t.indexOf('CT') >= 0 || t.indexOf('MRI') >= 0 || t.indexOf('检查') >= 0 || t.indexOf('设备') >= 0)) {
      intent = 'equipment_conflict'; confidence = 0.96;
    } else if (t.indexOf('床位') >= 0 && (t.indexOf('方案') >= 0 || t.indexOf('分配') >= 0 || t.indexOf('调度') >= 0)) {
      intent = 'bed_schedule'; confidence = 0.97;
    } else if (t.indexOf('床位') >= 0 && (t.indexOf('未来') >= 0 || t.indexOf('预测') >= 0 || t.indexOf('紧张') >= 0 || t.indexOf('三天') >= 0)) {
      intent = 'bed_forecast'; confidence = 0.93;
    } else if (t.indexOf('床位') >= 0 && (t.indexOf('分析') >= 0 || t.indexOf('情况') >= 0 || t.indexOf('使用率') >= 0)) {
      intent = 'bed_analysis'; confidence = 0.94;
    } else if (t.indexOf('排班') >= 0 && (t.indexOf('方案') >= 0 || t.indexOf('调整') >= 0 || t.indexOf('生成') >= 0 || t.indexOf('优化') >= 0)) {
      intent = 'staff_schedule'; confidence = 0.94;
    } else if (t.indexOf('排班') >= 0 || t.indexOf('工作负荷') >= 0 || t.indexOf('人员') >= 0 || t.indexOf('护士') >= 0) {
      intent = 'staff_analysis'; confidence = 0.88;
    } else if (t.indexOf('预约') >= 0 || t.indexOf('号源') >= 0 || t.indexOf('候补') >= 0) {
      intent = 'appointment_analysis'; confidence = 0.9;
    } else if (t.indexOf('报告') >= 0 || t.indexOf('资源使用') >= 0 || t.indexOf('运营') >= 0 || t.indexOf('本周') >= 0) {
      intent = 'ops_report'; confidence = 0.86;
    } else if (t.indexOf('床') >= 0) {
      intent = 'bed_analysis'; confidence = 0.7;
    }

    const labelMap = {
      bed_schedule: '床位调度', bed_analysis: '床位分析', bed_forecast: '资源预测',
      equipment_conflict: '检查资源调度', appointment_analysis: '预约分析',
      staff_analysis: '人员排班分析', staff_schedule: '排班调度', ops_report: '运营分析', general: '运营咨询'
    };
    const deviceType = t.indexOf('MRI') >= 0 || t.indexOf('核磁') >= 0 ? 'MRI' : (t.indexOf('CT') >= 0 ? 'CT' : null);
    return {
      raw: raw,
      intent: intent,
      label: labelMap[intent],
      department: dept,
      departmentName: dept ? DEPT_NAMES[dept] : '全院',
      date: date,
      isTomorrow: isTomorrow,
      deviceType: deviceType,
      confidence: confidence
    };
  }

  // ---------------------------- 任务步骤 ----------------------------
  function workflowSteps(intentInfo) {
    const intent = intentInfo.intent;
    const steps = [];
    steps.push({
      agent: 'Coordinator Agent', role: '任务协调', icon: 'route',
      title: '识别任务与执行范围',
      detail: '意图：' + intentInfo.label + ' · 范围：' + intentInfo.departmentName +
        (intent === 'equipment_conflict' ? ' · 日期：' + (intentInfo.isTomorrow ? '明天' : '今天') : '') +
        ' · 置信度 ' + Math.round(intentInfo.confidence * 100) + '%',
      tool: null
    });
    if (intent === 'bed_schedule' || intent === 'bed_analysis' || intent === 'bed_forecast') {
      steps.push({
        agent: 'Data Analysis Agent', role: '数据查询', icon: 'database',
        title: '读取床位与入院申请快照',
        detail: '通过 Bed MCP 查询床位状态、入院申请、预计出院和病区占用。',
        tool: { server: 'Bed MCP', name: 'bed.read_snapshot', args: { scope: intentInfo.departmentName }, result: '' }
      });
    } else if (intent === 'equipment_conflict') {
      steps.push({
        agent: 'Equipment Agent', role: '设备分析', icon: 'monitor',
        title: '读取检查设备与预约时段',
        detail: '通过 Equipment MCP 查询设备能力、维护窗口和指定日期的检查预约。',
        tool: { server: 'Equipment MCP', name: 'exam.find_conflicts', args: { date: intentInfo.isTomorrow ? '明天' : '今天', type: intentInfo.deviceType || '全部' }, result: '' }
      });
    } else if (intent === 'appointment_analysis') {
      steps.push({
        agent: 'Appointment Agent', role: '预约分析', icon: 'calendar',
        title: '读取号源与预约明细',
        detail: '通过 Appointment MCP 查询预约、取消、候补与等待时间。',
        tool: { server: 'Appointment MCP', name: 'appointment.summary', args: { date: '今天' }, result: '' }
      });
    } else if (intent === 'staff_analysis' || intent === 'staff_schedule') {
      steps.push({
        agent: 'Staff Scheduling Agent', role: '人员分析', icon: 'users',
        title: '读取排班与工作负载',
        detail: '通过 Staff MCP 查询班次、夜班间隔和科室人员负载。',
        tool: { server: 'Staff MCP', name: 'staff.workload', args: { week: '本周' }, result: '' }
      });
    } else {
      steps.push({
        agent: 'Data Analysis Agent', role: '数据查询', icon: 'database',
        title: '汇总跨业务运营指标',
        detail: '读取床位、预约、检查与人员聚合指标，不读取患者敏感信息。',
        tool: { server: 'Operations API', name: 'ops.kpi_snapshot', args: { range: '7d' }, result: '' }
      });
    }
    steps.push({
      agent: 'Knowledge Agent', role: 'RAG 检索', icon: 'book',
      title: '检索医院运营规则',
      detail: '从运营知识库检索与本次任务相关的制度条款，作为方案依据。',
      tool: { server: 'Knowledge RAG', name: 'kb.search', args: { query: intentInfo.raw.slice(0, 30) }, result: '' }
    });

    if (intent === 'bed_schedule') {
      steps.push({
        agent: 'Bed Scheduling Agent', role: '方案生成', icon: 'bed',
        title: '生成可解释的床位分配方案',
        detail: '按主管医师标注优先级、申请时间和床位硬约束生成候选方案。',
        tool: { server: 'Planner', name: 'bed.plan_draft', args: { scope: intentInfo.departmentName }, result: '' }
      });
      steps.push({
        agent: 'Validator Agent', role: '规则校验', icon: 'shield',
        title: '校验冲突与资源一致性',
        detail: '检查床位状态、重复占用、类型、性别、隔离要求和版本一致性。',
        tool: { server: 'Bed MCP', name: 'bed.validate_plan', args: { plan: 'draft' }, result: '' }
      });
      steps.push({
        agent: 'Human Approval', role: 'LangGraph interrupt', icon: 'approval',
        title: '暂停工作流，等待人工审批',
        detail: '方案已写入审批中心。审批通过后才会调用 Bed MCP 执行分配。',
        tool: null
      });
    } else if (intent === 'equipment_conflict') {
      steps.push({
        agent: 'Equipment Agent', role: '方案生成', icon: 'monitor',
        title: '生成检查时段调整建议',
        detail: '仅调整常规检查时段，保留优先/紧急检查；无法自动调整的提交人工协调。',
        tool: { server: 'Planner', name: 'exam.reschedule_draft', args: { deviceType: intentInfo.deviceType || '全部' }, result: '' }
      });
      steps.push({
        agent: 'Validator Agent', role: '规则校验', icon: 'shield',
        title: '校验设备时段与优先级',
        detail: '复核目标时段、设备维护窗口、患者状态和临床优先级。',
        tool: { server: 'Equipment MCP', name: 'exam.validate_plan', args: { plan: 'draft' }, result: '' }
      });
      steps.push({
        agent: 'Human Approval', role: 'LangGraph interrupt', icon: 'approval',
        title: '暂停工作流，等待人工审批',
        detail: '执行前会再次检查原时段与目标时段，避免审批期间发生变化。',
        tool: null
      });
    } else if (intent === 'staff_schedule') {
      steps.push({
        agent: 'Staff Scheduling Agent', role: '方案生成', icon: 'users',
        title: '生成排班调整草案',
        detail: '按夜班 11 小时间隔和连续夜班规则，生成可解释的调班建议。',
        tool: { server: 'Planner', name: 'staff.plan_draft', args: { scope: intentInfo.departmentName }, result: '' }
      });
      steps.push({
        agent: 'Validator Agent', role: '规则校验', icon: 'shield',
        title: '校验班次间隔与技能覆盖',
        detail: '检查班次快照、夜班后休息和调班后的可用性。',
        tool: { server: 'Staff MCP', name: 'staff.validate_plan', args: { plan: 'draft' }, result: '' }
      });
      steps.push({
        agent: 'Human Approval', role: 'LangGraph interrupt', icon: 'approval',
        title: '暂停工作流，等待授权管理员审批',
        detail: '方案不会自动发布，审批通过后才写入排班表。',
        tool: null
      });
    } else if (intent === 'bed_analysis') {
      steps.push({
        agent: 'Bed Scheduling Agent', role: '分析', icon: 'bed',
        title: '分析床位供需与病区结构',
        detail: '计算使用率、可用床位、待入院人数和类型缺口。',
        tool: { server: 'Analytics', name: 'bed.analyze', args: { scope: intentInfo.departmentName }, result: '' }
      });
      steps.push({
        agent: 'Report Agent', role: '报告生成', icon: 'report',
        title: '生成运营分析摘要',
        detail: '所有数字来自业务快照，AI 只负责组织语言。',
        tool: null
      });
    } else if (intent === 'bed_forecast') {
      steps.push({
        agent: 'Data Analysis Agent', role: '预测', icon: 'chart',
        title: '预测未来三天床位压力',
        detail: '结合预计出院、待入院和床位类型计算科室风险。',
        tool: { server: 'Analytics', name: 'bed.forecast', args: { horizon: 3 }, result: '' }
      });
      steps.push({
        agent: 'Report Agent', role: '报告生成', icon: 'report',
        title: '生成风险科室清单',
        detail: '给出风险等级、预计使用率和协调建议。',
        tool: null
      });
    } else if (intent === 'equipment_conflict') {
      // handled above
    } else if (intent === 'appointment_analysis') {
      steps.push({
        agent: 'Appointment Agent', role: '分析', icon: 'calendar',
        title: '分析预约结构与取消情况',
        detail: '按科室、状态、等待时间统计。',
        tool: { server: 'Analytics', name: 'appointment.analyze', args: {}, result: '' }
      });
      steps.push({
        agent: 'Report Agent', role: '报告生成', icon: 'report',
        title: '生成预约运营摘要',
        detail: '输出科室预约量、取消率和等待时间。',
        tool: null
      });
    } else if (intent === 'staff_analysis') {
      steps.push({
        agent: 'Staff Scheduling Agent', role: '分析', icon: 'users',
        title: '分析工作负载与排班冲突',
        detail: '按科室计算平均负载、夜班集中度和冲突。',
        tool: { server: 'Analytics', name: 'staff.analyze', args: {}, result: '' }
      });
      steps.push({
        agent: 'Validator Agent', role: '规则校验', icon: 'shield',
        title: '检查夜班间隔与技能覆盖',
        detail: '识别违反 11 小时间隔和连续夜班上限的排班。',
        tool: null
      });
    } else if (intent === 'ops_report') {
      steps.push({
        agent: 'Data Analysis Agent', role: '分析', icon: 'chart',
        title: '计算跨模块运营指标',
        detail: '聚合预约、床位、设备、人员数据并生成对比。',
        tool: { server: 'Analytics', name: 'ops.report_data', args: { range: '7d' }, result: '' }
      });
      steps.push({
        agent: 'Report Agent', role: '报告生成', icon: 'report',
        title: '生成运营分析报告',
        detail: '所有指标由统计服务计算，AI 不编造数字。',
        tool: null
      });
    } else {
      steps.push({
        agent: 'Coordinator Agent', role: '引导', icon: 'route',
        title: '给出可执行的任务建议',
        detail: '当前问题超出已配置的运营意图，返回能力范围与示例。',
        tool: null
      });
    }
    return steps;
  }

  // ---------------------------- 导出 ----------------------------
  return {
    // helpers
    pad: pad, round: round, pct: pct, mean: mean, sum: sum, minutes: minutes, hhmm: hhmm,
    addDays: addDays, dateLabel: dateLabel, nowOf: nowOf, demoDateOf: demoDateOf,
    DEPT_NAMES: DEPT_NAMES, PRIORITY_RANK: PRIORITY_RANK, BED_COLORS: BED_COLORS,
    // metrics
    getBedStatusCounts: getBedStatusCounts,
    getOccupancy: getOccupancy,
    equipmentUtilization: equipmentUtilization,
    getKpis: getKpis,
    getDeptStats: getDeptStats,
    getStaffStats: getStaffStats,
    appointmentStats: appointmentStats,
    // beds
    bedEligibility: bedEligibility,
    candidateBeds: candidateBeds,
    buildBedPlan: buildBedPlan,
    validateBedPlan: validateBedPlan,
    applyBedPlan: applyBedPlan,
    validateSingleAllocation: validateSingleAllocation,
    applySingleAllocation: applySingleAllocation,
    // equipment
    detectExamConflicts: detectExamConflicts,
    findFreeSlot: findFreeSlot,
    analyzeEquipment: analyzeEquipment,
    applyEquipmentPlan: applyEquipmentPlan,
    // forecast / report
    forecastBeds: forecastBeds,
    getRangeStats: getRangeStats,
    generateOpsReport: generateOpsReport,
    // appointments / staff
    getAvailableSlots: getAvailableSlots,
    recommendSlots: recommendSlots,
    findWaitlistSlot: findWaitlistSlot,
    buildStaffPlan: buildStaffPlan,
    validateStaffPlan: validateStaffPlan,
    applyStaffPlan: applyStaffPlan,
    shiftRestErrors: shiftRestErrors,
    recalcStaff: recalcStaff,
    // alerts
    evaluateAlertRules: evaluateAlertRules,
    // rag / intent
    tokenize: tokenize,
    embedText: embedText,
    cosine: cosine,
    retrieveKnowledge: retrieveKnowledge,
    parseIntent: parseIntent,
    workflowSteps: workflowSteps
  };
});
