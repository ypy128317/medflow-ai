/*
 * MedFlow AI · 演示状态与应用服务
 * 用 localStorage 模拟业务数据库；所有状态变更都走这里，AI 工具不直接改数据。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.MedFlowStore = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'medflow-ai-demo-v1';
  const SEED_VERSION = 4;
  const API_BASE = 'demo://medflow';

  function getData() {
    if (typeof module === 'object' && module.exports) return require('./data.js');
    return root.MedFlowData;
  }
  function getEngine() {
    if (typeof module === 'object' && module.exports) return require('./engine.js');
    return root.MedFlowEngine;
  }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function compact(date) { return String(date || '').replace(/-/g, ''); }

  function parseStamp(s) {
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return new Date(Date.UTC(2026, 10, 6, 14, 20));
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  }
  function formatStamp(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function addMinutes(stamp, n) {
    const d = parseStamp(stamp);
    d.setUTCMinutes(d.getUTCMinutes() + n);
    return formatStamp(d);
  }
  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  const PERMISSIONS = {
    admin: ['system.manage', 'approval.decide', 'plan.create', 'bed.manage', 'appointment.manage', 'equipment.manage', 'staff.manage', 'alert.handle', 'knowledge.manage', 'report.generate'],
    ops: ['approval.decide', 'plan.create', 'alert.handle', 'knowledge.manage', 'report.generate', 'bed.manage'],
    bed: ['plan.create', 'bed.manage'],
    appt: ['appointment.manage'],
    equip: ['equipment.manage', 'plan.create'],
    staff: ['staff.manage', 'plan.create']
  };

  const ROLE_NAMES = {
    admin: '系统管理员', ops: '医院运营主管', bed: '床位管理员',
    appt: '预约管理员', equip: '医技科室管理员', staff: '医护排班管理员'
  };

  function makeSeed() {
    const data = clone(getData());
    const state = {
      seedVersion: SEED_VERSION,
      meta: {
        demoDate: data.DEMO_DATE,
        now: data.DEMO_NOW,
        weekday: data.DEMO_WEEKDAY,
        seq: { log: 8, task: 3, bedPlan: 0, eqPlan: 1, appointment: 100, admission: 11, patient: 122, bedVersion: 1, exam: 400, waitlist: 8, user: 6, staffPlan: 0 }
      },
      session: null,
      departments: data.DEPARTMENTS,
      wards: data.wards,
      beds: data.beds,
      patients: data.patients,
      admissions: data.admissions,
      doctors: data.doctors,
      appointments: data.appointments,
      waitlist: data.waitlist,
      alertRules: data.alertRules,
      leaveRecords: [],
      swapRecords: [],
      devices: data.devices,
      exams: data.exams,
      staff: data.staff,
      staffConflicts: data.staffConflicts,
      alerts: data.alerts,
      plans: data.plans,
      tasks: data.tasks,
      audit: data.audit,
      users: data.users,
      rolePermissions: data.rolePermissions,
      knowledgeDocs: data.knowledgeDocs,
      dailyStats: data.dailyStats,
      weekDates: data.weekDates,
      weekLabels: data.weekLabels,
      shiftTimes: data.shiftTimes,
      savedAt: data.DEMO_NOW
    };
    return state;
  }

  function getStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const t = '__medflow_test__';
        localStorage.setItem(t, '1');
        localStorage.removeItem(t);
        return localStorage;
      }
    } catch (e) { /* file:// 或隐私模式下退化为内存存储 */ }
    let memory = null;
    return {
      getItem: function () { return memory; },
      setItem: function (k, v) { memory = v; },
      removeItem: function () { memory = null; }
    };
  }

  function create() {
    const storage = getStorage();
    const engine = getEngine();
    let state;

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.seedVersion === SEED_VERSION && Array.isArray(parsed.beds)) state = parsed;
      }
    } catch (e) { state = null; }
    if (!state) state = makeSeed();

    function save() {
      state.savedAt = state.meta.now;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore quota */ }
    }
    function tick(n) {
      state.meta.now = addMinutes(state.meta.now, n == null ? 1 : n);
    }
    function nextLogId() {
      state.meta.seq.log = (state.meta.seq.log || 0) + 1;
      return 'LOG-' + compact(state.meta.demoDate) + '-' + String(state.meta.seq.log).padStart(4, '0');
    }
    function nextTaskId() {
      const date = state.meta.now.slice(0, 10);
      const prefix = 'WF-' + compact(date) + '-';
      const nums = state.tasks.filter(function (t) { return t.id.indexOf(prefix) === 0; })
        .map(function (t) { return Number(t.id.slice(prefix.length)) || 0; });
      const next = Math.max.apply(null, [0].concat(nums)) + 1;
      return prefix + String(next).padStart(3, '0');
    }
    function nextPlanId(kind) {
      const date = state.meta.now.slice(0, 10);
      const prefix = (kind === 'bed' ? 'BP' : (kind === 'equipment' ? 'AP' : 'SP')) + '-' + compact(date) + '-';
      const nums = state.plans.filter(function (p) { return p.id.indexOf(prefix) === 0; })
        .map(function (p) { return Number(p.id.slice(prefix.length)) || 0; });
      const next = Math.max.apply(null, [0].concat(nums)) + 1;
      return prefix + String(next).padStart(3, '0');
    }
    function currentUser() {
      if (!state.session) return null;
      return state.users.find(function (u) { return u.id === state.session.userId; }) || null;
    }
    function roleName(user) { return user ? (user.roleName || ROLE_NAMES[user.role] || user.role) : '匿名'; }
    function can(permission) {
      const user = currentUser();
      if (!user) return false;
      const perms = PERMISSIONS[user.role] || [];
      return perms.indexOf(permission) >= 0 || perms.indexOf('system.manage') >= 0;
    }
    function audit(action, target, detail, actor, role) {
      const user = currentUser();
      const entry = {
        id: nextLogId(),
        at: state.meta.now,
        actor: actor || (user ? user.name : '系统'),
        role: role || (user ? roleName(user) : '系统'),
        action: action,
        target: target || '-',
        detail: detail || '',
        ip: actor ? '10.24.8.42' : '10.24.8.21'
      };
      state.audit.unshift(entry);
      if (state.audit.length > 240) state.audit.length = 240;
      return entry;
    }
    function addTask(task) {
      state.tasks.unshift(task);
      if (state.tasks.length > 40) state.tasks.length = 40;
      return task;
    }
    function planById(id) { return state.plans.find(function (p) { return p.id === id; }); }
    function userById(id) { return state.users.find(function (u) { return u.id === id; }); }

    const api = {
      getState: function () { return state; },
      save: save,
      engine: engine,
      currentUser: currentUser,
      can: can,
      roleName: roleName,
      isApprover: function () { return can('approval.decide'); },
      login: function (userId, silent) {
        const user = userById(userId);
        if (!user) return { ok: false, error: '账号不存在' };
        state.session = { userId: user.id, loginAt: state.meta.now };
        if (!silent) {
          tick(1);
          audit('auth.login', user.id, '登录演示环境 · ' + roleName(user), user.name, roleName(user));
        }
        save();
        return { ok: true, user: user };
      },
      loginDemo: function (userId) { return api.login(userId, true); },
      logout: function () {
        const u = currentUser();
        if (u) {
          tick(1);
          audit('auth.logout', u.id, '退出工作台', u.name, roleName(u));
        }
        state.session = null;
        save();
      },
      reset: function () {
        try { storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        state = makeSeed();
        save();
        return state;
      },
      now: function () { return state.meta.now; },
      date: function () { return state.meta.now.slice(0, 10); },
      tick: tick,

      // ------------------------- 工作流任务 -------------------------
      createBedPlan: function (scopeDept, prompt, intentInfo) {
        const user = currentUser();
        if (!can('plan.create')) return { ok: false, error: '当前角色无发起调度方案的权限' };
        const draft = engine.buildBedPlan(state, scopeDept || null);
        const existing = state.plans.find(function (p) {
          return p.kind === 'bed' && p.status === '待审批' && p.scope === draft.scope;
        });
        if (existing) {
          return { ok: true, existing: true, plan: existing, draft: draft };
        }
        if (!draft.matched.length) {
          return { ok: false, error: '当前没有可执行的床位分配，未创建审批单', draft: draft };
        }
        const taskId = nextTaskId();
        const plan = Object.assign({}, draft, {
          id: nextPlanId('bed'),
          status: '待审批',
          createdBy: 'MedFlow Coordinator',
          createdByName: user.name,
          requestedBy: user.name,
          createdAt: state.meta.now,
          workflowId: taskId,
          approval: null,
          execution: null,
          version: 1
        });
        state.plans.unshift(plan);
        addTask({
          id: taskId, prompt: prompt || ('制定' + draft.scope + '床位分配方案'),
          intent: 'bed_schedule', intentLabel: '床位调度', status: 'awaiting_approval',
          createdAt: state.meta.now, completedAt: null, planId: plan.id,
          summary: draft.summary + ' 等待运营主管审批。', actor: user.name
        });
        audit('plan.create', plan.id, '创建' + draft.scope + '床位调度方案，匹配 ' + draft.matched.length + ' 位患者', user.name, roleName(user));
        tick(1);
        save();
        return { ok: true, plan: plan, draft: draft, taskId: taskId };
      },

      createEquipmentPlan: function (analysis, prompt, intentInfo) {
        const user = currentUser();
        if (!can('plan.create')) return { ok: false, error: '当前角色无发起调度方案的权限' };
        const scope = (analysis.deviceType || '检查设备') + ' · ' + analysis.dateLabel;
        const newExamIds = (analysis.changes || []).map(function (c) { return c.examId; });
        const existing = state.plans.find(function (p) {
          return p.kind === 'equipment' && p.status === '待审批' &&
            (p.scope === scope || (p.changes || []).some(function (c) { return newExamIds.indexOf(c.examId) >= 0; }));
        });
        if (existing) return { ok: true, existing: true, plan: existing };
        if (!analysis.changes || !analysis.changes.length) {
          return { ok: false, error: '没有可自动执行的调整，已生成人工协调建议', analysis: analysis };
        }
        const taskId = nextTaskId();
        const plan = {
          id: nextPlanId('equipment'),
          kind: 'equipment',
          title: analysis.title,
          scope: scope,
          status: '待审批',
          createdBy: 'MedFlow Coordinator',
          createdByName: user.name,
          requestedBy: user.name,
          createdAt: state.meta.now,
          workflowId: taskId,
          summary: analysis.summary,
          changes: analysis.changes,
          conflicts: analysis.conflicts.map(function (c) {
            return { deviceId: c.deviceId, a: c.a.id, b: c.b.id, overlap: c.overlap };
          }),
          escalations: analysis.escalations,
          validation: analysis.validation,
          citations: analysis.citations,
          snapshot: analysis.snapshot,
          approval: null,
          execution: null,
          version: 1
        };
        state.plans.unshift(plan);
        addTask({
          id: taskId, prompt: prompt || analysis.title,
          intent: 'equipment_conflict', intentLabel: '检查资源调度', status: 'awaiting_approval',
          createdAt: state.meta.now, completedAt: null, planId: plan.id,
          summary: analysis.summary + ' 等待审批。', actor: user.name
        });
        audit('plan.create', plan.id, '创建' + analysis.title + '，调整 ' + analysis.changes.length + ' 个检查时段', user.name, roleName(user));
        tick(1);
        save();
        return { ok: true, plan: plan, analysis: analysis, taskId: taskId };
      },

      addAnalysisTask: function (prompt, intentInfo, summary) {
        const user = currentUser();
        const task = addTask({
          id: nextTaskId(), prompt: prompt,
          intent: intentInfo.intent, intentLabel: intentInfo.label, status: 'completed',
          createdAt: state.meta.now, completedAt: addMinutes(state.meta.now, 1), planId: null,
          summary: summary, actor: user ? user.name : '访客'
        });
        tick(1);
        save();
        return task;
      },

      decidePlan: function (planId, decision, comment) {
        const user = currentUser();
        if (!user) return { ok: false, error: '请先登录' };
        if (!can('approval.decide')) {
          return { ok: false, error: '当前角色无审批权限，床位方案需由运营主管或系统管理员审批' };
        }
        const plan = planById(planId);
        if (!plan) return { ok: false, error: '审批单不存在' };
        if (plan.status !== '待审批') return { ok: false, error: '该审批单已处理：' + plan.status };
        if (decision === 'reject' && (!comment || comment.trim().length < 2)) {
          return { ok: false, error: '驳回时必须填写审批意见（至少 2 个字）' };
        }
        const approval = {
          by: user.name, role: roleName(user), at: state.meta.now,
          comment: (comment || '').trim() || (decision === 'approve' ? '同意，按方案执行。' : ''), userRole: user.role
        };
        if (decision === 'reject') {
          plan.status = '已驳回';
          plan.approval = approval;
          const task = state.tasks.find(function (t) { return t.id === plan.workflowId; });
          if (task) { task.status = 'rejected'; task.completedAt = state.meta.now; task.summary = '审批驳回，业务数据未发生变更。'; }
          audit('plan.reject', plan.id, '驳回方案：' + (comment || ''), user.name, roleName(user));
          tick(2);
          save();
          return { ok: true, plan: plan, changed: 0, message: '已驳回，床位/设备状态未发生任何变更。' };
        }

        let result;
        if (plan.kind === 'bed') result = engine.applyBedPlan(state, plan, user.name);
        else if (plan.kind === 'equipment') result = engine.applyEquipmentPlan(state, plan, user.name);
        else if (plan.kind === 'staff') result = engine.applyStaffPlan(state, plan, user.name);
        else result = { ok: false, errors: ['暂不支持的方案类型'] };

        if (!result.ok) {
          plan.status = '执行失败';
          plan.approval = approval;
          plan.execution = { at: state.meta.now, result: 'failed', errors: result.errors, count: 0, detail: '执行前复核失败，事务已回滚' };
          const task = state.tasks.find(function (t) { return t.id === plan.workflowId; });
          if (task) { task.status = 'failed'; task.completedAt = state.meta.now; task.summary = '审批通过但执行前复核失败：' + result.errors.join('；'); }
          audit('plan.execute_failed', plan.id, '执行前复核失败，0 条变更：' + result.errors.join('；'), user.name, roleName(user));
          tick(2);
          save();
          return { ok: false, error: '执行前复核失败，已整单回滚：' + result.errors.join('；'), plan: plan, changed: 0 };
        }

        plan.status = '执行成功';
        plan.approval = approval;
        const detailText = plan.kind === 'bed'
          ? 'Bed MCP 已分配 ' + result.changed + ' 张床位，事务提交成功'
          : (plan.kind === 'equipment'
            ? 'Equipment MCP 已调整 ' + result.changed + ' 个检查时段，事务提交成功'
            : 'Staff MCP 已发布 ' + result.changed + ' 条排班调整，事务提交成功');
        plan.execution = {
          at: state.meta.now, result: 'success', count: result.changed,
          detail: detailText,
          assignments: result.assignments
        };
        const task = state.tasks.find(function (t) { return t.id === plan.workflowId; });
        if (task) {
          task.status = 'completed';
          task.completedAt = state.meta.now;
          task.summary = plan.kind === 'bed'
            ? '审批通过，' + result.changed + ' 张床位分配成功，已写入业务库。'
            : (plan.kind === 'equipment'
              ? '审批通过，' + result.changed + ' 个检查时段调整成功。'
              : '审批通过，' + result.changed + ' 条排班调整已发布。');
        }
        audit('mcp.' + (plan.kind === 'bed' ? 'bed.allocate' : (plan.kind === 'equipment' ? 'exam.reschedule' : 'staff.publish')), plan.id,
          plan.execution.detail, 'MedFlow Tool Service', '工具服务');
        audit('plan.approve', plan.id, '审批通过并执行：' + plan.execution.detail, user.name, roleName(user));
        if (plan.kind === 'bed' && plan.dept) {
          const deptName = engine.DEPT_NAMES[plan.dept] || plan.dept;
          const free = state.beds.filter(function (b) { return b.dept === plan.dept && b.status === '空闲'; }).length;
          if (free === 0) {
            state.alerts.unshift({
              id: 'AL-' + compact(state.meta.now.slice(0, 10)) + '-DYN-' + String(state.meta.seq.log).padStart(2, '0'),
              level: '高', type: '床位资源', title: deptName + '可用床位已耗尽，需启动候补协调',
              dept: deptName, triggerAt: state.meta.now, status: '待处理', relatedType: 'bed', relatedId: plan.dept,
              data: ['可用床位 0 张', '今日新分配 ' + result.changed + ' 张', '待清洁床位可继续释放'],
              cause: '刚执行的床位调度方案占用了该科室最后一张空闲床位。',
              ai: '下一位待入院患者将无法在本科室匹配到床位，需要等待清洁、出院或跨病区协调。',
              suggestion: '关注待清洁床位完成时间；必要时由运营主管协调其他病区，不由 AI 自动跨科分配。'
            });
          }
        }
        tick(2);
        save();
        return { ok: true, plan: plan, changed: result.changed, message: plan.execution.detail };
      },

      // ------------------------- 床位操作 -------------------------
      manualAssign: function (bedId, admissionId) {
        const user = currentUser();
        if (!user) return { ok: false, error: '请先登录' };
        if (!can('bed.manage')) return { ok: false, error: '当前角色无床位管理权限' };
        const result = engine.applySingleAllocation(state, admissionId, bedId, user.name);
        if (!result.ok) return { ok: false, error: result.errors.join('；') };
        audit('bed.manual_assign', bedId, '手动分配床位给 ' + result.admission.name + '（入院申请 ' + admissionId + '）', user.name, roleName(user));
        tick(1);
        save();
        return { ok: true, result: result };
      },

      discharge: function (bedId) {
        const user = currentUser();
        if (!user) return { ok: false, error: '请先登录' };
        if (!can('bed.manage')) return { ok: false, error: '当前角色无床位管理权限' };
        const bed = state.beds.find(function (b) { return b.id === bedId; });
        if (!bed) return { ok: false, error: '床位不存在' };
        if (bed.status !== '已入住') return { ok: false, error: '只有已入住床位可以办理出院' };
        const patient = state.patients.find(function (p) { return p.id === bed.patientId; });
        const name = bed.patientName;
        if (patient) {
          patient.status = '已出院';
          patient.type = '门诊';
          patient.bedId = null; patient.bedCode = null; patient.wardName = null;
          patient.updatedAt = state.meta.now;
          patient.tags = ['已出院'];
        }
        bed.status = '待清洁';
        bed.patientId = null; bed.patientName = null; bed.admissionId = null;
        bed.expectedDischarge = null; bed.expectedDischargeTime = null;
        bed.cleaningStartedAt = state.meta.now;
        bed.cleaningDeadline = addMinutes(state.meta.now, 30);
        bed.cleaningType = '终末清洁';
        bed.version = (bed.version || 1) + 1;
        audit('bed.discharge', bedId, name + ' 办理出院，床位转入待清洁', user.name, roleName(user));
        tick(2);
        save();
        return { ok: true, bed: bed, message: name + ' 已办理出院，床位 ' + bed.code + ' 进入待清洁，预计 30 分钟。' };
      },

      completeCleaning: function (bedId) {
        const user = currentUser();
        if (!can('bed.manage')) return { ok: false, error: '当前角色无床位管理权限' };
        const bed = state.beds.find(function (b) { return b.id === bedId; });
        if (!bed) return { ok: false, error: '床位不存在' };
        if (bed.status !== '待清洁') return { ok: false, error: '当前床位不是待清洁状态' };
        bed.status = '空闲';
        bed.cleaningStartedAt = null; bed.cleaningDeadline = null; bed.cleaningOverdue = false;
        bed.version = (bed.version || 1) + 1;
        audit('bed.cleaning_done', bedId, '完成终末清洁与护理复核，床位恢复空闲', user.name, roleName(user));
        tick(1);
        save();
        return { ok: true, bed: bed, message: '床位 ' + bed.code + ' 已完成清洁复核，恢复空闲。' };
      },

      setMaintenance: function (bedId, note) {
        const user = currentUser();
        if (!can('bed.manage')) return { ok: false, error: '当前角色无床位管理权限' };
        const bed = state.beds.find(function (b) { return b.id === bedId; });
        if (!bed) return { ok: false, error: '床位不存在' };
        if (bed.status !== '空闲') return { ok: false, error: '只有空闲床位可以转入维护' };
        bed.status = '维护中';
        bed.maintenanceNote = note || '设备维护 · ' + state.meta.now;
        bed.version = (bed.version || 1) + 1;
        audit('bed.maintenance', bedId, '床位转入维护：' + bed.maintenanceNote, user.name, roleName(user));
        tick(1); save();
        return { ok: true, bed: bed, message: '床位 ' + bed.code + ' 已转入维护状态。' };
      },

      restoreBed: function (bedId) {
        const user = currentUser();
        if (!can('bed.manage')) return { ok: false, error: '当前角色无床位管理权限' };
        const bed = state.beds.find(function (b) { return b.id === bedId; });
        if (!bed) return { ok: false, error: '床位不存在' };
        if (bed.status !== '维护中' && bed.status !== '暂停使用') return { ok: false, error: '当前床位不在维护/暂停状态' };
        bed.status = '空闲';
        bed.maintenanceNote = null; bed.pausedReason = null;
        bed.version = (bed.version || 1) + 1;
        audit('bed.restore', bedId, '维护完成，床位恢复空闲', user.name, roleName(user));
        tick(1); save();
        return { ok: true, bed: bed, message: '床位 ' + bed.code + ' 已恢复空闲。' };
      },

      // ------------------------- 入院 / 预约 -------------------------
      createAdmission: function (input) {
        const user = currentUser();
        if (!can('bed.manage') && !can('plan.create')) return { ok: false, error: '当前角色无入院申请权限' };
        if (!input.name || !input.dept || !input.bedType) return { ok: false, error: '请填写患者姓名、科室和床位类型' };
        const dept = state.departments.find(function (d) { return d.id === input.dept; });
        if (!dept) return { ok: false, error: '科室不存在' };
        state.meta.seq.patient += 1;
        state.meta.seq.admission += 1;
        const pId = 'PT-ADM-' + String(state.meta.seq.patient).padStart(4, '0');
        const aId = 'ADM-' + compact(state.meta.now.slice(0, 10)) + '-' + String(state.meta.seq.admission).padStart(3, '0');
        const patient = {
          id: pId, name: input.name, gender: input.gender || '男', age: Number(input.age) || 50,
          phone: input.phone || '138****0000', dept: dept.id, deptName: dept.name,
          type: '待入院', status: '待入院', diagnosis: input.diagnosis || '待完善',
          careLevel: input.careLevel || '二级护理', attending: dept.director,
          bedId: null, bedCode: null, wardName: null, admittedAt: null, expectedDischarge: null,
          updatedAt: state.meta.now, tags: ['待床位']
        };
        const admission = {
          id: aId, patientId: pId, name: input.name, gender: patient.gender, age: patient.age,
          phone: patient.phone, dept: dept.id, deptName: dept.name, bedType: input.bedType,
          priority: input.priority || '常规', prioritySource: '主管医师标注', appliedAt: state.meta.now,
          diagnosis: patient.diagnosis, careLevel: patient.careLevel, expectedStay: Number(input.expectedStay) || 5,
          source: input.source || '院内录入', attending: dept.director,
          requiredFeatures: input.requiredFeatures || [], isolation: input.bedType === '隔离间' || !!input.isolation,
          note: input.note || '', status: '待分配', assignedBedId: null, assignedAt: null
        };
        state.patients.push(patient);
        state.admissions.unshift(admission);
        audit('admission.create', aId, '新建入院申请：' + input.name + ' / ' + dept.name + ' / ' + input.bedType, user.name, roleName(user));
        tick(1); save();
        return { ok: true, admission: admission, patient: patient };
      },

      createAppointment: function (input) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        const doc = state.doctors.find(function (d) { return d.id === input.doctorId; });
        if (!doc) return { ok: false, error: '请选择医生' };
        if (!input.slot) return { ok: false, error: '请选择号源时段' };
        const date = input.date || state.meta.now.slice(0, 10);
        const name = (input.patientName || '').trim();
        if (!name) return { ok: false, error: '请填写患者姓名' };
        const duplicate = state.appointments.find(function (a) {
          return a.patientName === name && a.doctorId === doc.id && a.date === date && a.status !== '已取消';
        });
        if (duplicate) return { ok: false, error: '重复预约：该患者当日已预约 ' + doc.name + ' 医师（' + duplicate.slot + '）' };
        const slotTaken = state.appointments.find(function (a) {
          return a.doctorId === doc.id && a.date === date && a.slot === input.slot && a.status !== '已取消';
        });
        if (slotTaken) return { ok: false, error: '号源冲突：' + input.slot + ' 已被占用，请选择其他时段' };
        if (doc.slots.indexOf(input.slot) < 0) return { ok: false, error: '该时段不在医生出诊号源内' };
        let patient = state.patients.find(function (p) { return p.name === name && p.phone === input.phone; });
        if (!patient) {
          state.meta.seq.patient += 1;
          patient = {
            id: 'PT-OP-' + String(state.meta.seq.patient).padStart(4, '0'), name: name,
            gender: input.gender || '女', age: Number(input.age) || 35, phone: input.phone || '138****0000',
            dept: doc.dept, deptName: doc.deptName, type: '门诊', status: '门诊', diagnosis: input.reason || '门诊就诊',
            careLevel: '门诊', attending: doc.name, bedId: null, bedCode: null, wardName: null,
            admittedAt: null, expectedDischarge: null, updatedAt: state.meta.now, tags: ['新预约']
          };
          state.patients.push(patient);
        }
        state.meta.seq.appointment += 1;
        const appointment = {
          id: 'AP-' + compact(date) + '-' + String(state.meta.seq.appointment).padStart(4, '0'),
          code: 'A' + String(1200 + state.meta.seq.appointment), date: date,
          patientId: patient.id, patientName: name, phone: patient.phone,
          dept: doc.dept, deptName: doc.deptName, doctorId: doc.id, doctorName: doc.name, title: doc.title,
          slot: input.slot, status: '待确认', waitMinutes: 0, room: doc.room,
          source: input.source || '运营后台', note: input.reason || '',
          createdAt: state.meta.now
        };
        state.appointments.push(appointment);
        audit('appointment.create', appointment.id, '新建预约：' + name + ' / ' + doc.name + ' / ' + date + ' ' + input.slot, user.name, roleName(user));
        tick(1); save();
        return { ok: true, appointment: appointment, patient: patient };
      },

      cancelAppointment: function (id, reason) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        const appt = state.appointments.find(function (a) { return a.id === id; });
        if (!appt) return { ok: false, error: '预约不存在' };
        if (appt.status === '已取消') return { ok: false, error: '该预约已取消' };
        if (appt.status === '已完成') return { ok: false, error: '已完成的预约不能取消' };
        appt.status = '已取消';
        appt.canceledAt = state.meta.now;
        appt.cancelReason = reason || '管理员取消';
        audit('appointment.cancel', id, '取消预约：' + appt.patientName + ' / ' + appt.doctorName + ' / ' + appt.slot, user.name, roleName(user));
        tick(1); save();
        return { ok: true, appointment: appt };
      },

      checkInAppointment: function (id) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        const appt = state.appointments.find(function (a) { return a.id === id; });
        if (!appt) return { ok: false, error: '预约不存在' };
        if (['待确认', '已预约'].indexOf(appt.status) < 0) return { ok: false, error: '当前状态不可签到：' + appt.status };
        appt.status = '已签到';
        appt.checkedInAt = state.meta.now;
        appt.waitMinutes = Math.max(0, engine.minutes(state.meta.now.slice(11)) - engine.minutes(appt.slot));
        audit('appointment.checkin', id, '患者签到：' + appt.patientName + ' / 等待 ' + appt.waitMinutes + ' 分钟', user.name, roleName(user));
        tick(1); save();
        return { ok: true, appointment: appt, message: appt.patientName + ' 已签到，当前等待 ' + appt.waitMinutes + ' 分钟。' };
      },

      completeAppointment: function (id) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        const appt = state.appointments.find(function (a) { return a.id === id; });
        if (!appt) return { ok: false, error: '预约不存在' };
        if (['已签到', '已预约'].indexOf(appt.status) < 0) return { ok: false, error: '当前状态不可完成：' + appt.status };
        appt.status = '已完成';
        appt.completedAt = state.meta.now;
        if (!appt.waitMinutes) appt.waitMinutes = Math.max(0, engine.minutes(state.meta.now.slice(11)) - engine.minutes(appt.slot));
        audit('appointment.complete', id, '完成就诊：' + appt.patientName + ' / ' + appt.doctorName, user.name, roleName(user));
        tick(1); save();
        return { ok: true, appointment: appt, message: '预约已完成，等待时长 ' + appt.waitMinutes + ' 分钟。' };
      },

      rescheduleAppointment: function (id, date, slot) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        const appt = state.appointments.find(function (a) { return a.id === id; });
        if (!appt) return { ok: false, error: '预约不存在' };
        if (['待确认', '已预约'].indexOf(appt.status) < 0) return { ok: false, error: '只有待确认/已预约可以改约' };
        const doc = state.doctors.find(function (d) { return d.id === appt.doctorId; });
        if (!doc.slots || doc.slots.indexOf(slot) < 0) return { ok: false, error: '目标时段不在医生出诊号源内' };
        const taken = state.appointments.find(function (a) {
          return a.id !== id && a.doctorId === appt.doctorId && a.date === date && a.slot === slot && a.status !== '已取消';
        });
        if (taken) return { ok: false, error: '目标号源已被占用' };
        const duplicate = state.appointments.find(function (a) {
          return a.id !== id && a.patientName === appt.patientName && a.doctorId === appt.doctorId && a.date === date && a.status !== '已取消';
        });
        if (duplicate) return { ok: false, error: '该患者目标日期已有同一医生预约' };
        const from = appt.date + ' ' + appt.slot;
        appt.date = date;
        appt.slot = slot;
        appt.status = '待确认';
        appt.rescheduledAt = state.meta.now;
        appt.rescheduleFrom = from;
        audit('appointment.reschedule', id, '预约改约：' + appt.patientName + ' ' + from + ' → ' + date + ' ' + slot, user.name, roleName(user));
        tick(1); save();
        return { ok: true, appointment: appt, message: '已改约至 ' + date + ' ' + slot + '，状态回到待确认。' };
      },

      addWaitlist: function (input) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        if (!input.patientName || !input.dept) return { ok: false, error: '请填写患者姓名和科室' };
        const dept = state.departments.find(function (d) { return d.id === input.dept; });
        if (!dept) return { ok: false, error: '科室不存在' };
        const date = input.preferredDate || state.meta.now.slice(0, 10);
        const dup = (state.waitlist || []).find(function (w) {
          return w.status === '等待中' && w.patientName === input.patientName && w.dept === input.dept && w.preferredDate === date;
        });
        if (dup) return { ok: false, error: '该患者在该科室该日期已在候补队列中' };
        state.meta.seq.waitlist += 1;
        const entry = {
          id: 'WL-' + compact(state.meta.now.slice(0, 10)) + '-' + String(state.meta.seq.waitlist).padStart(3, '0'),
          patientName: input.patientName, phone: input.phone || '138****0000',
          dept: dept.id, deptName: dept.name,
          doctorId: input.doctorId || null,
          doctorName: input.doctorId ? (state.doctors.find(function (d) { return d.id === input.doctorId; }) || {}).name || '' : '',
          preferredDate: date, preferredPeriod: input.preferredPeriod || '上午',
          priority: input.priority || '常规', source: input.source || '运营后台',
          note: input.note || '', status: '等待中', appointmentId: null, promotedAt: null,
          registeredAt: state.meta.now
        };
        state.waitlist.unshift(entry);
        audit('waitlist.add', entry.id, '加入候补：' + entry.patientName + ' / ' + dept.name + ' / ' + date + ' ' + entry.preferredPeriod, user.name, roleName(user));
        tick(1); save();
        return { ok: true, entry: entry, message: '已加入候补队列，当前排在第 ' + state.waitlist.filter(function (w) { return w.status === '等待中' && w.dept === dept.id; }).length + ' 位。' };
      },

      promoteWaitlist: function (id) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        const entry = state.waitlist.find(function (w) { return w.id === id; });
        if (!entry) return { ok: false, error: '候补记录不存在' };
        if (entry.status !== '等待中') return { ok: false, error: '该候补已处理：' + entry.status };
        const slot = engine.findWaitlistSlot(state, entry);
        if (!slot) return { ok: false, error: '该科室/医生在 ' + entry.preferredDate + ' ' + entry.preferredPeriod + ' 暂无可用号源' };
        const res = api.createAppointment({
          patientName: entry.patientName, phone: entry.phone,
          doctorId: slot.doctorId, date: slot.date, slot: slot.slot,
          source: '候补补位', reason: entry.note || '候补补位'
        });
        if (!res.ok) return res;
        entry.status = '已转预约';
        entry.appointmentId = res.appointment.id;
        entry.promotedAt = state.meta.now;
        audit('waitlist.promote', entry.id, '候补补位成功：' + entry.patientName + ' → ' + slot.doctorName + ' ' + slot.date + ' ' + slot.slot, user.name, roleName(user));
        save();
        return { ok: true, entry: entry, appointment: res.appointment, message: '候补补位成功：' + slot.doctorName + ' ' + slot.date + ' ' + slot.slot + '。' };
      },

      removeWaitlist: function (id) {
        const user = currentUser();
        if (!can('appointment.manage')) return { ok: false, error: '当前角色无预约管理权限' };
        const entry = state.waitlist.find(function (w) { return w.id === id; });
        if (!entry) return { ok: false, error: '候补记录不存在' };
        if (entry.status !== '等待中') return { ok: false, error: '该候补已处理：' + entry.status };
        entry.status = '已取消';
        entry.canceledAt = state.meta.now;
        audit('waitlist.cancel', id, '取消候补：' + entry.patientName, user.name, roleName(user));
        tick(1); save();
        return { ok: true, entry: entry, message: '候补记录已取消。' };
      },

      // ------------------------- 检查 / 设备 -------------------------
      createExam: function (input) {
        const user = currentUser();
        if (!can('equipment.manage')) return { ok: false, error: '当前角色无检查管理权限' };
        const device = state.devices.find(function (d) { return d.id === input.deviceId; });
        if (!device) return { ok: false, error: '设备不存在' };
        if (device.status === '维护中') return { ok: false, error: '设备处于维护中，不能创建检查' };
        const date = input.date || state.meta.now.slice(0, 10);
        const start = input.start;
        if (!start || !/^\d{2}:\d{2}$/.test(start)) return { ok: false, error: '请选择检查开始时间' };
        const duration = Number(input.duration) || ({ CT: 30, MRI: 40, '超声': 20, 'X 光': 15 }[device.type] || 30);
        const startMin = engine.minutes(start);
        if (startMin < 8 * 60 || startMin + duration > 18 * 60) return { ok: false, error: '检查需在 08:00–18:00 设备开放时段内' };
        const end = engine.hhmm(startMin + duration);
        const conflict = state.exams.find(function (e) {
          return e.deviceId === device.id && e.date === date && e.status !== '已取消' &&
            engine.minutes(e.start) < engine.minutes(end) && engine.minutes(e.end) > startMin;
        });
        if (conflict) return { ok: false, error: '设备时段冲突：' + conflict.start + '–' + conflict.end + ' 已有检查' };
        if (!input.patientName) return { ok: false, error: '请填写患者姓名' };
        state.meta.seq.exam += 1;
        const exam = {
          id: 'EX-' + compact(date) + '-' + String(state.meta.seq.exam).padStart(4, '0'),
          patientId: input.patientId || null, patientName: input.patientName, gender: input.gender || '女', age: Number(input.age) || 40,
          dept: input.dept || 'ortho', deptName: (state.departments.find(function (d) { return d.id === (input.dept || 'ortho'); }) || {}).name || '骨科',
          deviceId: device.id, deviceName: device.name, deviceType: device.type,
          examItem: input.examItem || device.capabilities[0], date: date, start: start, end: end, duration: duration,
          status: '已预约', priority: input.priority || '常规', prioritySource: '开单医师标注',
          orderedBy: input.orderedBy || '门诊医师', prep: input.prep || '', note: input.note || '',
          room: device.room, createdAt: state.meta.now
        };
        state.exams.push(exam);
        audit('exam.create', exam.id, '新建检查：' + exam.patientName + ' / ' + device.id + ' / ' + date + ' ' + start + '–' + end, user.name, roleName(user));
        tick(1); save();
        return { ok: true, exam: exam, message: '检查已创建：' + device.id + ' ' + date + ' ' + start + '–' + end };
      },

      cancelExam: function (id, reason) {
        const user = currentUser();
        if (!can('equipment.manage')) return { ok: false, error: '当前角色无检查管理权限' };
        const exam = state.exams.find(function (e) { return e.id === id; });
        if (!exam) return { ok: false, error: '检查不存在' };
        if (['已完成', '已取消'].indexOf(exam.status) >= 0) return { ok: false, error: '当前状态不可取消：' + exam.status };
        exam.status = '已取消';
        exam.canceledAt = state.meta.now;
        exam.cancelReason = reason || '管理员取消';
        audit('exam.cancel', id, '取消检查：' + exam.patientName + ' / ' + exam.deviceId + ' ' + exam.start, user.name, roleName(user));
        tick(1); save();
        return { ok: true, exam: exam, message: '检查已取消。' };
      },

      setDeviceStatus: function (deviceId, status, note) {
        const user = currentUser();
        if (!can('equipment.manage')) return { ok: false, error: '当前角色无设备管理权限' };
        const device = state.devices.find(function (d) { return d.id === deviceId; });
        if (!device) return { ok: false, error: '设备不存在' };
        if (status === '维护中') {
          const active = state.exams.filter(function (e) {
            return e.deviceId === deviceId && e.date >= state.meta.now.slice(0, 10) && e.status !== '已取消' && e.status !== '已完成';
          });
          if (active.length) return { ok: false, error: '设备还有 ' + active.length + ' 个未完成检查，不能转入维护' };
        }
        const from = device.status;
        device.status = status;
        device.maintenanceNote = status === '维护中' ? (note || '预防性维护 · ' + state.meta.now) : null;
        audit('device.status', deviceId, '设备状态：' + from + ' → ' + status + (note ? ' · ' + note : ''), user.name, roleName(user));
        tick(1); save();
        return { ok: true, device: device, message: device.name + ' 已' + (status === '维护中' ? '转入维护' : '恢复运行') + '。' };
      },

      // ------------------------- 人员排班 -------------------------
      requestLeave: function (staffId, date, reason) {
        const user = currentUser();
        if (!can('staff.manage')) return { ok: false, error: '当前角色无排班管理权限' };
        const st = state.staff.find(function (s) { return s.id === staffId; });
        if (!st) return { ok: false, error: '人员不存在' };
        if (!st.shifts[date]) return { ok: false, error: '该日期不在排班周期内' };
        if (st.shifts[date] === '休') return { ok: false, error: '该人员当天已经是休息' };
        const from = st.shifts[date];
        st.shifts[date] = '休';
        engine.recalcStaff(st);
        state.leaveRecords.unshift({ id: 'LV-' + compact(date) + '-' + String(state.leaveRecords.length + 1).padStart(3, '0'), staffId: staffId, staffName: st.name, date: date, fromShift: from, reason: reason || '', createdAt: state.meta.now, createdBy: user.name });
        audit('staff.leave', staffId, '请假登记：' + st.name + ' ' + date + ' ' + from + ' → 休', user.name, roleName(user));
        tick(1); save();
        return { ok: true, staff: st, message: st.name + ' ' + date + ' 已登记请假，原班次 ' + from + ' 改为休息。' };
      },

      swapShift: function (staffId, date, newShift) {
        const user = currentUser();
        if (!can('staff.manage')) return { ok: false, error: '当前角色无排班管理权限' };
        const st = state.staff.find(function (s) { return s.id === staffId; });
        if (!st) return { ok: false, error: '人员不存在' };
        if (!st.shifts[date]) return { ok: false, error: '该日期不在排班周期内' };
        const from = st.shifts[date];
        if (from === newShift) return { ok: false, error: '新旧班次相同' };
        if (newShift === '休') return api.requestLeave(staffId, date, '调班为休息');
        const errors = engine.shiftRestErrors(st, date, newShift);
        if (errors.length) return { ok: false, error: errors.join('；') };
        st.shifts[date] = newShift;
        engine.recalcStaff(st);
        state.swapRecords.unshift({ id: 'SW-' + compact(date) + '-' + String(state.swapRecords.length + 1).padStart(3, '0'), staffId: staffId, staffName: st.name, date: date, from: from, to: newShift, createdAt: state.meta.now, createdBy: user.name });
        audit('staff.swap', staffId, '调班：' + st.name + ' ' + date + ' ' + from + ' → ' + newShift, user.name, roleName(user));
        tick(1); save();
        return { ok: true, staff: st, message: st.name + ' ' + date + ' 已由 ' + from + ' 调为 ' + newShift + '。' };
      },

      createStaffPlan: function (deptId, prompt) {
        const user = currentUser();
        if (!can('plan.create')) return { ok: false, error: '当前角色无发起排班方案的权限' };
        const draft = engine.buildStaffPlan(state, deptId || null);
        const existing = state.plans.find(function (p) {
          return p.kind === 'staff' && p.status === '待审批' && p.scope === draft.scope;
        });
        if (existing) return { ok: true, existing: true, plan: existing, draft: draft };
        if (!draft.changes.length) return { ok: false, error: '当前没有需要调整的排班冲突', draft: draft };
        const taskId = nextTaskId();
        const plan = Object.assign({}, draft, {
          id: nextPlanId('staff'), status: '待审批',
          createdBy: 'MedFlow Coordinator', createdByName: user.name, requestedBy: user.name,
          createdAt: state.meta.now, workflowId: taskId, approval: null, execution: null, version: 1
        });
        state.plans.unshift(plan);
        addTask({
          id: taskId, prompt: prompt || ('生成' + draft.scope + '排班调整方案'),
          intent: 'staff_schedule', intentLabel: '排班调度', status: 'awaiting_approval',
          createdAt: state.meta.now, completedAt: null, planId: plan.id,
          summary: draft.summary + ' 等待授权管理员审批。', actor: user.name
        });
        audit('plan.create', plan.id, '创建排班调整方案，变更 ' + draft.changes.length + ' 条', user.name, roleName(user));
        tick(1); save();
        return { ok: true, plan: plan, draft: draft, taskId: taskId };
      },

      // ------------------------- 预警 / 知识库 -------------------------
      refreshAlerts: function () {
        const user = currentUser();
        if (!can('alert.handle')) return { ok: false, error: '当前角色无预警计算权限' };
        const drafts = engine.evaluateAlertRules(state);
        const added = drafts.map(function (d, i) {
          const alert = Object.assign({}, d, {
            id: 'AL-' + compact(state.meta.now.slice(0, 10)) + '-R' + String(state.alerts.length + i + 1).padStart(2, '0'),
            triggerAt: state.meta.now,
            status: '待处理',
            source: '规则引擎'
          });
          state.alerts.unshift(alert);
          return alert;
        });
        audit('alerts.evaluate', 'ALERT-ENGINE', '规则引擎重新计算，新增 ' + added.length + ' 条预警', user.name, roleName(user));
        tick(1); save();
        return { ok: true, added: added, count: added.length, message: added.length ? ('规则引擎新增 ' + added.length + ' 条预警') : '规则引擎未发现新的预警' };
      },

      handleAlert: function (id, status, note) {
        const user = currentUser();
        if (!can('alert.handle')) return { ok: false, error: '当前角色无预警处置权限' };
        const alert = state.alerts.find(function (a) { return a.id === id; });
        if (!alert) return { ok: false, error: '预警不存在' };
        alert.status = status;
        alert.handledBy = user.name;
        alert.handledAt = state.meta.now;
        alert.handleNote = note || '';
        audit('alert.handle', id, '预警状态更新为' + status + (note ? '：' + note : ''), user.name, roleName(user));
        tick(1); save();
        return { ok: true, alert: alert };
      },

      addKnowledgeDoc: function (input) {
        const user = currentUser();
        if (!can('knowledge.manage')) return { ok: false, error: '当前角色无知识库管理权限' };
        if (!input.title || !input.content || input.content.trim().length < 20) {
          return { ok: false, error: '请填写标题，并输入至少 20 个字的制度内容' };
        }
        const kbNums = state.knowledgeDocs.map(function (d) { return Number(String(d.id).replace('KB-', '')) || 0; });
        const id = 'KB-' + String(Math.max.apply(null, [0].concat(kbNums)) + 1).padStart(3, '0');
        const paras = input.content.split(/\n\s*\n|\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        const parts = paras.length > 1 ? paras : [input.content];
        const chunks = parts.map(function (p, i) {
          return {
            id: id + '-' + String(i + 1).padStart(2, '0'),
            heading: '上传文档 · 第 ' + (i + 1) + ' 节',
            content: p,
            keywords: [input.category || '运营制度', input.title].concat(engine.tokenize(p).filter(function (t) { return t.length >= 2; }).slice(0, 12))
          };
        });
        const doc = {
          id: id, title: input.title, category: input.category || '运营制度',
          owner: input.owner || user.dept, version: 'v1.0', updatedAt: state.meta.now.slice(0, 10),
          summary: input.summary || input.content.slice(0, 56) + '…', chunks: chunks
        };
        state.knowledgeDocs.unshift(doc);
        audit('kb.upload', id, '上传知识库文档：' + input.title + '（' + chunks.length + ' 个片段）', user.name, roleName(user));
        tick(2); save();
        return { ok: true, doc: doc };
      },

      deleteKnowledgeDoc: function (id) {
        const user = currentUser();
        if (!can('knowledge.manage')) return { ok: false, error: '当前角色无知识库管理权限' };
        const idx = state.knowledgeDocs.findIndex(function (d) { return d.id === id; });
        if (idx < 0) return { ok: false, error: '文档不存在' };
        const doc = state.knowledgeDocs[idx];
        state.knowledgeDocs.splice(idx, 1);
        audit('kb.delete', id, '删除知识库文档：' + doc.title, user.name, roleName(user));
        tick(1); save();
        return { ok: true };
      },

      updateKnowledgeDoc: function (id, input) {
        const user = currentUser();
        if (!can('knowledge.manage')) return { ok: false, error: '当前角色无知识库管理权限' };
        const doc = state.knowledgeDocs.find(function (d) { return d.id === id; });
        if (!doc) return { ok: false, error: '文档不存在' };
        if (!input.title || !input.content || input.content.trim().length < 20) return { ok: false, error: '标题和正文不能为空，正文至少 20 字' };
        const oldVersion = doc.version;
        const parts = input.content.split(/\n\s*\n|\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        doc.title = input.title;
        doc.category = input.category || doc.category;
        doc.owner = input.owner || doc.owner;
        doc.summary = input.summary || input.content.slice(0, 56) + '…';
        doc.updatedAt = state.meta.now.slice(0, 10);
        const v = Number(String(doc.version).replace(/[^\d.]/g, '')) || 1;
        doc.version = 'v' + (v + 0.1).toFixed(1);
        doc.chunks = (parts.length ? parts : [input.content]).map(function (p, i) {
          return {
            id: id + '-' + String(i + 1).padStart(2, '0'),
            heading: input.heading || ('修订版 · 第 ' + (i + 1) + ' 节'),
            content: p,
            keywords: [doc.category, doc.title].concat(engine.tokenize(p).filter(function (t) { return t.length >= 2; }).slice(0, 12))
          };
        });
        audit('kb.update', id, '更新知识文档：' + doc.title + '（' + oldVersion + ' → ' + doc.version + '，' + doc.chunks.length + ' 个片段）', user.name, roleName(user));
        tick(2); save();
        return { ok: true, doc: doc, message: '文档已更新并重新切分索引。' };
      },

      // ------------------------- 用户管理 -------------------------
      createUser: function (input) {
        const user = currentUser();
        if (!can('system.manage')) return { ok: false, error: '只有系统管理员可以新增用户' };
        if (!input.name || !input.role) return { ok: false, error: '请填写姓名和角色' };
        if (!ROLE_NAMES[input.role]) return { ok: false, error: '角色不存在' };
        if (state.users.some(function (u) { return u.name === input.name && u.status === '启用'; })) return { ok: false, error: '同名启用用户已存在' };
        state.meta.seq.user += 1;
        const dept = input.dept || '运营管理部';
        const newUser = {
          id: 'u-' + String(state.meta.seq.user).padStart(3, '0'),
          name: input.name, role: input.role, roleName: ROLE_NAMES[input.role],
          dept: dept, phone: input.phone || '138****0000', status: '启用',
          lastLogin: '—', color: input.color || '#0f766e',
          permissions: input.permissions || '演示新增账号'
        };
        state.users.push(newUser);
        audit('user.create', newUser.id, '新增用户：' + newUser.name + ' / ' + newUser.roleName, user.name, roleName(user));
        tick(1); save();
        return { ok: true, user: newUser, message: '用户已创建：' + newUser.name };
      },

      updateUser: function (id, input) {
        const user = currentUser();
        if (!can('system.manage')) return { ok: false, error: '只有系统管理员可以编辑用户' };
        const target = state.users.find(function (u) { return u.id === id; });
        if (!target) return { ok: false, error: '用户不存在' };
        if (input.role && !ROLE_NAMES[input.role]) return { ok: false, error: '角色不存在' };
        const before = target.name + ' / ' + target.roleName;
        if (input.name) target.name = input.name;
        if (input.role) { target.role = input.role; target.roleName = ROLE_NAMES[input.role]; }
        if (input.dept) target.dept = input.dept;
        if (input.phone) target.phone = input.phone;
        audit('user.update', id, '编辑用户：' + before + ' → ' + target.name + ' / ' + target.roleName, user.name, roleName(user));
        tick(1); save();
        return { ok: true, user: target, message: '用户信息已更新。' };
      },

      toggleUser: function (id) {
        const user = currentUser();
        if (!can('system.manage')) return { ok: false, error: '只有系统管理员可以停用用户' };
        const target = state.users.find(function (u) { return u.id === id; });
        if (!target) return { ok: false, error: '用户不存在' };
        if (target.id === user.id) return { ok: false, error: '不能停用当前登录账号' };
        target.status = target.status === '启用' ? '停用' : '启用';
        audit('user.toggle', id, (target.status === '启用' ? '启用' : '停用') + '用户：' + target.name, user.name, roleName(user));
        tick(1); save();
        return { ok: true, user: target, message: target.name + ' 已' + (target.status === '启用' ? '启用' : '停用') + '。' };
      },

      // ------------------------- 查询辅助 -------------------------
      getPlan: function (id) { return planById(id); },
      getUser: function (id) { return userById(id); },
      getOpenPlans: function () { return state.plans.filter(function (p) { return p.status === '待审批'; }); },
      getUsers: function () { return state.users; },
      getPermissions: function () { return PERMISSIONS; },
      getRoleNames: function () { return ROLE_NAMES; },
      advance: function (n) { tick(n); save(); },
      apiBase: API_BASE
    };
    return api;
  }

  return { create: create, STORAGE_KEY: STORAGE_KEY, ROLE_NAMES: ROLE_NAMES };
});
