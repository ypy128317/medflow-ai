/* MedFlow AI · 单页应用（演示版） */
(function () {
  'use strict';

  const data = window.MedFlowData;
  const engine = window.MedFlowEngine;
  const store = window.MedFlowStore.create();
  const U = window.MedFlowUI;
  const esc = U.esc, icon = U.icon, chip = U.chip, statusChip = U.statusChip, levelChip = U.levelChip;
  const avatar = U.avatar, pageHead = U.pageHead, cardHead = U.cardHead, emptyState = U.emptyState;
  const progress = U.progress, sparkline = U.sparkline, comboChart = U.comboChart, donutChart = U.donutChart;
  const barList = U.barList, fmt = U.formatNumber;

  const TODAY = data.DEMO_DATE;
  const TOMORROW = engine.addDays(TODAY, 1);
  const WEEKDAY = data.DEMO_WEEKDAY;

  const ui = {
    route: 'dashboard',
    loginUser: 'u-ops',
    patientQuery: '', patientType: '全部', patientDept: '全部', patientPage: 1,
    apptDate: TODAY, apptStatus: '全部', apptDept: '全部', apptPage: 1, apptDoctor: '全部',
    bedWard: 'ORTHO-A', bedStatus: '全部', bedQuery: '',
    admissionStatus: '全部', admissionDept: '全部', admissionPage: 1,
    equipDate: TODAY, equipDevice: 'CT-01',
    staffDept: '全部',
    dispatchInput: '',
    workflow: null,
    approvalTab: 'pending', approvalId: null,
    alertLevel: '全部', alertStatus: 'open',
    analyticsRange: 7, report: null,
    kbQuery: '床位分配 单人间 审批', kbResults: null, kbDocId: 'KB-001',
    systemTab: 'users', auditQuery: '',
    searchQuery: '', searchResults: null,
    notifOpen: false, profileOpen: false,
    drawer: null,
    modal: null,
    modalError: '',
    confirmIntent: null,
    loginError: '',
    fastWorkflow: false,
    lastUpdated: data.DEMO_NOW
  };

  const ROUTE_META = {
    dashboard: { title: '运营驾驶舱', eyebrow: 'OPERATIONS COCKPIT' },
    patients: { title: '患者管理', eyebrow: 'PATIENT REGISTRY' },
    appointments: { title: '预约管理', eyebrow: 'APPOINTMENTS' },
    beds: { title: '床位管理', eyebrow: 'BED COMMAND' },
    admissions: { title: '入院申请', eyebrow: 'ADMISSION REQUESTS' },
    equipment: { title: '检查资源', eyebrow: 'DIAGNOSTIC RESOURCES' },
    staff: { title: '人员排班', eyebrow: 'WORKFORCE' },
    dispatch: { title: 'AI 调度中心', eyebrow: 'AGENT ORCHESTRATION' },
    approvals: { title: '审批中心', eyebrow: 'HUMAN APPROVAL' },
    alerts: { title: '运营预警', eyebrow: 'RISK SIGNALS' },
    analytics: { title: '数据分析', eyebrow: 'ANALYTICS' },
    knowledge: { title: '运营知识库', eyebrow: 'RAG KNOWLEDGE' },
    system: { title: '系统管理', eyebrow: 'SYSTEM' }
  };

  const NAV_GROUPS = [
    { label: '运营总览', items: [
      { route: 'dashboard', label: '运营驾驶舱', icon: 'dashboard' },
      { route: 'alerts', label: '运营预警', icon: 'alert', badge: 'alerts' },
      { route: 'analytics', label: '数据分析', icon: 'chart' }
    ] },
    { label: '业务资源', items: [
      { route: 'patients', label: '患者管理', icon: 'patient' },
      { route: 'appointments', label: '预约管理', icon: 'calendar' },
      { route: 'beds', label: '床位管理', icon: 'bed' },
      { route: 'admissions', label: '入院申请', icon: 'file' },
      { route: 'equipment', label: '检查资源', icon: 'monitor' },
      { route: 'staff', label: '人员排班', icon: 'staff' }
    ] },
    { label: '智能中枢', items: [
      { route: 'dispatch', label: 'AI 调度中心', icon: 'sparkles' },
      { route: 'approvals', label: '审批中心', icon: 'approval', badge: 'approvals' },
      { route: 'knowledge', label: '运营知识库', icon: 'book' }
    ] },
    { label: '系统', items: [
      { route: 'system', label: '系统管理', icon: 'settings', adminOnly: true }
    ] }
  ];

  const STATUS_ZH = {
    '空闲': '可分配', '已入住': '已入住', '待清洁': '待清洁', '维护中': '维护中',
    '已预留': '已预留', '暂停使用': '暂停使用'
  };

  function S() { return store.getState(); }
  function user() { return store.currentUser(); }
  function can(p) { return store.can(p); }
  function now() { return S().meta.now; }
  function today() { return S().meta.now.slice(0, 10); }
  function dateText(d) {
    const p = String(d).split('-');
    return p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
  }
  function shortDate(d) { return String(d).slice(5).replace('-', '/'); }
  function parseRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTE_META[raw] ? raw : 'dashboard';
  }
  function go(route, opts) {
    const target = '#/' + route;
    if (location.hash === target) {
      ui.route = route;
      render();
    } else {
      location.hash = target;
    }
    if (opts && opts.after) setTimeout(opts.after, 20);
  }
  function toast(message, type) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'success');
    el.innerHTML = icon(type === 'error' ? 'alert' : (type === 'info' ? 'info' : 'check'), 17) + '<span>' + esc(message) + '</span>';
    root.appendChild(el);
    setTimeout(function () { el.classList.add('toast-out'); }, 3200);
    setTimeout(function () { el.remove(); }, 3700);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function num(n) { return Number(n || 0).toLocaleString('zh-CN'); }
  function pct(n) { return Number(n || 0).toFixed(1) + '%'; }
  function nowTime() { return now().slice(11); }
  function setModal(type, dataObj) {
    ui.modal = { type: type, data: dataObj || {} };
    ui.modalError = '';
    renderOverlay();
    if (type === 'appointment') setTimeout(updateAppointmentSlots, 20);
    if (type === 'reschedule') setTimeout(updateRescheduleSlots, 20);
    if (type === 'exam') setTimeout(updateExamForm, 20);
  }
  function closeModal() { ui.modal = null; ui.modalError = ''; ui.confirmIntent = null; renderOverlay(); }
  function setDrawer(type, id) { ui.drawer = { type: type, id: id }; renderOverlay(); }
  function closeDrawer() { ui.drawer = null; renderOverlay(); }
  function openConfirm(config) {
    ui.confirmIntent = config;
    ui.modal = { type: 'confirm', data: config };
    renderOverlay();
  }

  // ------------------------------ Login ------------------------------
  function renderLogin() {
    const users = S().users;
    const selected = users.find(function (u) { return u.id === ui.loginUser; }) || users[0];
    const accounts = [
      { id: 'u-ops', desc: '全院运营 · 审批调度', icon: 'chart', color: '#0f766e' },
      { id: 'u-bed', desc: '床位分配 · 状态管理', icon: 'bed', color: '#0d9488' },
      { id: 'u-appt', desc: '预约号源 · 候补队列', icon: 'calendar', color: '#2563eb' },
      { id: 'u-admin', desc: '系统配置 · 审计日志', icon: 'shield', color: '#334155' }
    ];
    return '<div class="login-page">' +
      '<section class="login-visual">' +
        '<div class="login-brand"><span class="brand-mark">' + icon('activity', 22) + '</span><div><strong>MedFlow AI</strong><small>医院运营与医疗资源调度平台</small></div></div>' +
        '<div class="login-copy"><span class="login-kicker">AI HOSPITAL OPERATIONS</span>' +
          '<h1>让每一次资源调度<br><em>都有依据。</em></h1>' +
          '<p>把床位、预约、检查与人员放进同一个运营视图。AI 负责查询、分析与规划，人负责关键审批，业务服务负责执行。</p>' +
          '<div class="login-points"><div><span>01</span><b>数据可追溯</b><small>每个结论都能回到业务数据与制度条款</small></div>' +
          '<div><span>02</span><b>执行有边界</b><small>AI 不直连数据库，高风险操作必须审批</small></div>' +
          '<div><span>03</span><b>冲突可复核</b><small>执行前再次校验，防止审批期间资源变化</small></div></div>' +
        '</div>' +
        '<div class="login-mock">' +
          '<div class="login-mock-head"><span>LIVE OPERATIONS</span><i></i><small>2026.11.06</small></div>' +
          '<div class="login-mock-kpis"><div><small>床位使用率</small><strong>84.4<em>%</em></strong><span class="up">+0.4</span></div>' +
          '<div><small>待分配患者</small><strong>11<em>人</em></strong><span class="warn">骨科 4</span></div>' +
          '<div><small>待审批方案</small><strong>1<em>项</em></strong><span class="up">已暂停</span></div></div>' +
          '<div class="login-mock-chart">' + sparkline([81,83,82,84,85,84,84.4], '#5eead4') + '</div>' +
          '<div class="login-mock-foot"><span><i></i>Bed MCP 在线</span><span>LangGraph · 6 个节点</span><span>合成数据</span></div>' +
        '</div>' +
        '<div class="login-disclaimer">演示环境 · 仅使用合成患者数据 · 不接入真实诊疗系统</div>' +
      '</section>' +
      '<section class="login-panel">' +
        '<div class="login-card">' +
          '<div class="login-card-head"><span class="eyebrow">MEDFLOW AI · V1.0</span><h2>登录运营工作台</h2><p>选择一个演示角色，体验不同权限下的调度与审批。</p></div>' +
          '<div class="account-grid">' + accounts.map(function (a) {
            const u = users.find(function (x) { return x.id === a.id; });
            return '<button type="button" class="account-card ' + (ui.loginUser === a.id ? 'active' : '') + '" data-action="select-account" data-user="' + a.id + '">' +
              '<span class="account-icon" style="background:' + a.color + '1a;color:' + a.color + '">' + icon(a.icon, 19) + '</span>' +
              '<span><b>' + esc(u.name) + '</b><small>' + esc(u.roleName) + '</small></span>' +
              '<i class="account-check">' + icon('check', 12) + '</i></button>';
          }).join('') + '</div>' +
          '<form id="login-form" class="login-form" autocomplete="off">' +
            '<label>当前账号<input type="text" value="' + esc(selected.name + ' · ' + selected.roleName) + '" readonly></label>' +
            '<label>演示密码<input id="login-password" type="password" value="medflow2026" placeholder="请输入演示密码"></label>' +
            (ui.loginError ? '<div class="form-error">' + icon('alert', 14) + esc(ui.loginError) + '</div>' : '') +
            '<button class="btn btn-primary btn-block" type="submit">' + icon('arrow', 17) + ' 进入工作台</button>' +
          '</form>' +
          '<div class="login-hint">' + icon('info', 14) + '演示密码 <code>medflow2026</code>；也可以点击上方角色卡直接进入。</div>' +
          '<div class="login-footer"><span>© 2026 MedFlow AI</span><span>合成数据 · 本地运行</span><span>V1.0 Demo</span></div>' +
        '</div>' +
      '</section></div>';
  }

  // ------------------------------ Shell ------------------------------
  function renderSidebar() {
    const k = engine.getKpis(S());
    const u = user();
    const nav = NAV_GROUPS.map(function (group) {
      return '<div class="nav-group"><div class="nav-label">' + esc(group.label) + '</div>' +
        group.items.filter(function (item) { return !item.adminOnly || (u && (u.role === 'admin' || u.role === 'ops')); }).map(function (item) {
          let badge = '';
          if (item.badge === 'approvals' && k.pendingApprovals) badge = '<span class="nav-badge amber">' + k.pendingApprovals + '</span>';
          if (item.badge === 'alerts' && k.highAlerts) badge = '<span class="nav-badge red">' + k.highAlerts + '</span>';
          return '<a class="nav-item ' + (ui.route === item.route ? 'active' : '') + '" href="#/' + item.route + '" data-nav="' + item.route + '">' +
            icon(item.icon, 18) + '<span>' + esc(item.label) + '</span>' + badge + '</a>';
        }).join('') + '</div>';
    }).join('');
    return '<aside class="sidebar" id="sidebar">' +
      '<a class="brand" href="#/dashboard"><span class="brand-mark">' + icon('activity', 20) + '</span><span class="brand-text"><strong>MedFlow <em>AI</em></strong><small>医院运营调度平台</small></span></a>' +
      '<div class="workspace"><span class="workspace-dot"></span><div><strong>中心医院</strong><small>运营演示环境</small></div><span class="workspace-env">DEMO</span></div>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="sidebar-foot"><div class="mcp-status"><span class="pulse-dot"></span><div><strong>MCP 工具在线</strong><small>Bed · Exam · Appointment · Staff</small></div></div>' +
      '<div class="sidebar-version">合成数据 · Demo V1.0</div></div></aside>';
  }

  function renderTopbar() {
    const u = user();
    const k = engine.getKpis(S());
    const notifCount = k.pendingApprovals + k.highAlerts;
    const meta = ROUTE_META[ui.route] || ROUTE_META.dashboard;
    return '<header class="topbar">' +
      '<div class="topbar-left"><button class="icon-btn mobile-menu" data-action="toggle-sidebar" aria-label="菜单">' + icon('menu', 20) + '</button>' +
      '<div class="breadcrumb"><span>MedFlow AI</span>' + icon('chevron', 12) + '<strong>' + esc(meta.title) + '</strong></div></div>' +
      '<div class="topbar-right">' +
        '<button class="search-trigger" data-action="open-search">' + icon('search', 16) + '<span>搜索患者、床位、审批单</span><kbd>⌘ K</kbd></button>' +
        '<span class="topbar-date">' + icon('calendar', 15) + '2026年11月6日 周五</span>' +
        '<div class="notif-wrap"><button class="icon-btn notif-btn" data-action="toggle-notif" aria-label="通知">' + icon('bell', 19) +
          (notifCount ? '<span class="notif-count">' + notifCount + '</span>' : '') + '</button>' +
          (ui.notifOpen ? renderNotifications() : '') + '</div>' +
        '<div class="profile-wrap"><div class="profile-chip" data-action="toggle-profile">' + avatar(u.name, u.color, 32) +
          '<span><b>' + esc(u.name) + '</b><small>' + esc(u.roleName) + '</small></span>' + icon('chevronDown', 14) + '</div>' +
          (ui.profileOpen ? renderProfileMenu() : '') + '</div>' +
      '</div></header>';
  }

  function renderNotifications() {
    const plans = store.getOpenPlans();
    const alerts = S().alerts.filter(function (a) { return (a.level === '高' || a.level === '紧急') && (a.status === '待处理' || a.status === '处理中'); }).slice(0, 3);
    const items = plans.map(function (p) {
      return '<button class="notif-item" data-action="open-plan" data-id="' + p.id + '"><span class="notif-ic amber">' + icon('approval', 16) + '</span>' +
        '<span><b>待审批 · ' + esc(p.title) + '</b><small>' + esc(p.summary) + '</small></span></button>';
    }).concat(alerts.map(function (a) {
      return '<button class="notif-item" data-action="open-alert" data-id="' + a.id + '"><span class="notif-ic red">' + icon('alert', 16) + '</span>' +
        '<span><b>' + esc(a.title) + '</b><small>' + esc(a.dept) + ' · ' + esc(a.triggerAt.slice(11)) + '</small></span></button>';
    })).join('');
    return '<div class="notif-panel"><div class="notif-head"><strong>待处理事项</strong><span>' + (plans.length + alerts.length) + ' 项</span></div>' +
      (items || '<div class="notif-empty">暂无待处理事项</div>') +
      '<div class="notif-foot"><a href="#/approvals">查看全部审批</a><a href="#/alerts">查看预警</a></div></div>';
  }

  function renderProfileMenu() {
    const u = user();
    return '<div class="profile-menu"><div class="profile-menu-head">' + avatar(u.name, u.color, 40) + '<div><b>' + esc(u.name) + '</b><small>' + esc(u.roleName) + ' · ' + esc(u.dept) + '</small></div></div>' +
      '<div class="profile-menu-info"><span>工作台</span><b>中心医院 · 运营演示</b></div>' +
      '<button data-action="open-search">' + icon('search', 15) + '全局搜索</button>' +
      '<button data-action="open-plan" data-id="' + ((store.getOpenPlans()[0] || {}).id || '') + '">' + icon('approval', 15) + '待审批事项</button>' +
      '<button data-action="logout" class="danger">' + icon('logout', 15) + '退出登录</button></div>';
  }

  function renderShell() {
    return '<div class="app-shell">' + renderSidebar() +
      '<div class="main-wrap">' + renderTopbar() + '<main class="page" id="page-content">' + renderRoute() + '</main>' +
      '<footer class="app-foot"><span>MedFlow AI Demo · 合成数据</span><span>AI 只生成建议，关键操作需人工审批</span><span>业务时间 ' + esc(now()) + '</span></footer>' +
      '</div></div>';
  }

  function render() {
    const app = document.getElementById('app');
    if (!app) return;
    if (!user()) {
      app.innerHTML = renderLogin();
      document.title = '登录 · MedFlow AI';
      renderOverlay();
      return;
    }
    app.innerHTML = renderShell();
    document.title = (ROUTE_META[ui.route] || ROUTE_META.dashboard).title + ' · MedFlow AI';
    document.body.dataset.route = ui.route;
    renderOverlay();
  }

  function refreshContent() {
    const el = document.getElementById('page-content');
    if (!el) { render(); return; }
    el.innerHTML = renderRoute();
  }

  // ------------------------------ Dashboard ------------------------------
  function deltaText(value, suffix) {
    return '<span class="delta up">' + icon('arrow', 12) + ' ' + esc(value) + '</span>' + (suffix ? '<span class="delta-note">' + esc(suffix) + '</span>' : '');
  }

  function kpiCard(cfg) {
    return '<article class="kpi-card ' + (cfg.tone || '') + '">' +
      '<div class="kpi-top"><span class="kpi-icon" style="background:' + cfg.color + '15;color:' + cfg.color + '">' + icon(cfg.icon, 19) + '</span>' +
      '<span class="kpi-label">' + esc(cfg.label) + '</span>' + (cfg.right || '') + '</div>' +
      '<div class="kpi-value">' + esc(cfg.value) + '<em>' + esc(cfg.unit || '') + '</em></div>' +
      '<div class="kpi-foot"><span>' + (cfg.foot || '') + '</span>' + sparkline(cfg.spark, cfg.color) + '</div>' +
      (cfg.note ? '<div class="kpi-note">' + cfg.note + '</div>' : '') + '</article>';
  }

  function renderDashboard() {
    const s = S();
    const k = engine.getKpis(s);
    const depts = engine.getDeptStats(s);
    const statusCounts = engine.getBedStatusCounts(s.beds);
    const openAlerts = s.alerts.filter(function (a) { return a.status === '待处理' || a.status === '处理中'; });
    const tasks = s.tasks.slice(0, 5);
    const plans = s.plans.filter(function (p) { return p.status === '待审批'; });
    const stats = s.dailyStats;
    const actions = '<button class="btn btn-ghost" data-action="refresh-dashboard">' + icon('refresh', 16) + '刷新数据</button>' +
      '<button class="btn btn-primary" data-action="new-task">' + icon('sparkles', 16) + '发起 AI 调度</button>';
    let html = pageHead('OPERATIONS COCKPIT', '运营驾驶舱', '全院床位、预约、检查与人员资源的实时运营视图。', actions);
    html += '<div class="kpi-grid">' +
      kpiCard({
        label: '今日预约', value: fmt(k.todayAppointments), unit: '人次', icon: 'calendar', color: '#2563eb',
        right: '<span class="delta up">+' + Math.max(1, Math.round((k.todayAppointments / 59 - 1) * 100)) + '%</span>',
        foot: '有效 ' + k.validAppointments + ' · 取消 ' + k.canceled,
        spark: stats.appointments
      }) +
      kpiCard({
        label: '当前住院', value: fmt(k.occupied), unit: '人', icon: 'bed', color: '#0f766e',
        right: '<span class="delta neutral">床位 ' + k.totalBeds + '</span>',
        foot: '今日就诊 ' + k.visits + ' · 预出院 ' + k.preDischarge,
        spark: stats.visits
      }) +
      kpiCard({
        label: '可用床位', value: fmt(k.free), unit: '张', icon: 'approval', color: '#d97706',
        right: '<span class="delta warn">待清洁 ' + k.cleaning + '</span>',
        foot: '待入院 ' + k.pendingAdmissions + ' 人',
        spark: [9, 10, 8, 11, 10, 12, k.free]
      }) +
      kpiCard({
        label: '床位使用率', value: k.occupancy.toFixed(1), unit: '%', icon: 'activity', color: '#be123c',
        right: '<span class="delta ' + (k.occupancy >= 85 ? 'warn' : 'up') + '">' + (k.occupancy >= 85 ? '高于阈值' : '运行平稳') + '</span>',
        foot: '预警阈值 85% · 当前 ' + (k.occupancy >= 85 ? '需关注' : '可控'),
        spark: stats.occupancy
      }) +
      '</div>';
    html += '<div class="mini-stats">' +
      '<div>' + icon('patient', 17) + '<span>今日就诊</span><strong>' + k.visits + '</strong><small>已完成 ' + k.completed + '</small></div>' +
      '<div>' + icon('monitor', 17) + '<span>检查设备利用率</span><strong>' + k.equipmentUtil.toFixed(1) + '%</strong><small>7 台在用</small></div>' +
      '<div>' + icon('clock', 17) + '<span>平均预约等待</span><strong>' + k.avgWait + '<em>分钟</em></strong><small>较昨日 ' + (stats.avgWait[6] - stats.avgWait[5] >= 0 ? '+' : '') + (stats.avgWait[6] - stats.avgWait[5]) + ' 分钟</small></div>' +
      '<div>' + icon('bed', 17) + '<span>平均住院日</span><strong>' + k.alos + '<em>天</em></strong><small>当前在院患者</small></div>' +
      '<div>' + icon('approval', 17) + '<span>待处理调度</span><strong>' + k.pendingTasks + '</strong><small>高预警 ' + k.highAlerts + '</small></div>' +
      '</div>';
    html += '<div class="dashboard-grid">';
    html += '<section class="card span-8">' + cardHead('床位使用率与预约趋势', '近 7 天 · 数据来自运营指标服务',
      '<div class="segmented"><button class="active">7 天</button><button data-action="go-analytics">30 天</button></div>') +
      comboChart({ labels: stats.labels, bars: stats.appointments, line: stats.occupancy, barLabel: '预约量', lineLabel: '床位使用率' }) + '</section>';
    html += '<section class="card span-4">' + cardHead('床位状态分布', '全院 ' + k.totalBeds + ' 张床位',
      '<a class="text-link" href="#/beds">查看床位图 ' + icon('chevron', 12) + '</a>') +
      '<div class="donut-card-body">' + donutChart(statusCounts, k.occupancy.toFixed(1) + '%', '使用率', 184) +
      '<div class="legend-list">' + statusCounts.map(function (c) {
        return '<div><span><i style="background:' + c.color + '"></i>' + esc(c.status) + '</span><strong>' + c.count + '</strong></div>';
      }).join('') + '</div></div></section>';
    html += '<section class="card span-5">' + cardHead('科室运营排名', '今日有效预约量 · 床位使用率',
      '<a class="text-link" href="#/analytics">分析 ' + icon('chevron', 12) + '</a>') +
      '<div class="dept-ranking">' + depts.map(function (d, i) {
        return '<div class="rank-row"><span class="rank-no">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="rank-name"><b>' + esc(d.name) + '</b><small>' + d.pending + ' 人待入院</small></span>' +
          '<span class="rank-bar"><i style="width:' + Math.max(8, d.appointments / Math.max.apply(null, depts.map(function (x) { return x.appointments; })) * 100) + '%;background:' + d.color + '"></i></span>' +
          '<span class="rank-val">' + d.appointments + '</span>' +
          '<span class="rank-occ ' + (d.occupancy >= 90 ? 'hot' : '') + '">' + d.occupancy.toFixed(0) + '%</span></div>';
      }).join('') + '</div></section>';
    html += '<section class="card span-7">' + cardHead('AI 运营预警', '按风险等级排序', '<a class="text-link" href="#/alerts">全部 ' + openAlerts.length + ' 条 ' + icon('chevron', 12) + '</a>') +
      '<div class="alert-list">' + openAlerts.slice(0, 4).map(function (a) {
        return '<button class="alert-row" data-action="open-alert" data-id="' + a.id + '">' +
          '<span class="alert-level-dot lv-' + ({ '高': 'high', '紧急': 'urgent', '中': 'mid', '低': 'low' }[a.level] || 'low') + '"></span>' +
          '<span class="alert-main"><b>' + esc(a.title) + '</b><small>' + esc(a.dept) + ' · ' + esc(a.triggerAt.slice(11)) + ' · ' + esc(a.type) + '</small></span>' +
          levelChip(a.level) + icon('chevron', 14) + '</button>';
      }).join('') + '</div></section>';
    html += '<section class="card span-7">' + cardHead('近期调度任务', 'AI 工作流执行记录', '<a class="text-link" href="#/dispatch">调度中心 ' + icon('chevron', 12) + '</a>') +
      '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>任务</th><th>类型</th><th>状态</th><th>时间</th><th></th></tr></thead><tbody>' +
      tasks.map(function (t) {
        return '<tr><td><div class="cell-main">' + esc(t.prompt.length > 30 ? t.prompt.slice(0, 30) + '…' : t.prompt) + '<small>' + esc(t.id) + '</small></div></td>' +
          '<td><span class="muted">' + esc(t.intentLabel) + '</span></td><td>' + statusChip(t.status === 'awaiting_approval' ? '待审批' : (t.status === 'completed' ? '执行成功' : t.status === 'rejected' ? '已驳回' : '执行失败')) + '</td>' +
          '<td class="mono muted">' + esc(t.createdAt.slice(5)) + '</td>' +
          '<td class="right">' + (t.planId ? '<button class="btn btn-tiny" data-action="open-plan" data-id="' + t.planId + '">查看</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    html += '<section class="card span-5">' + cardHead('待审批事项', 'AI 工作流已暂停，等待人工决策',
      '<a class="text-link" href="#/approvals">审批中心 ' + icon('chevron', 12) + '</a>') +
      (plans.length ? '<div class="approval-mini-list">' + plans.slice(0, 3).map(function (p) {
        return '<div class="approval-mini"><span class="approval-mini-icon">' + icon(p.kind === 'bed' ? 'bed' : 'monitor', 18) + '</span>' +
          '<div><b>' + esc(p.title) + '</b><small>' + esc(p.id) + ' · ' + esc(p.createdAt.slice(11)) + '</small></div>' +
          '<button class="btn btn-tiny btn-primary" data-action="open-plan" data-id="' + p.id + '">审批</button></div>';
      }).join('') + '</div>' : emptyState('check', '暂无待审批事项', '所有 AI 方案均已处理')) + '</section>';
    html += '</div>';
    return html;
  }

  function filteredPatients() {
    const q = ui.patientQuery.trim();
    const rank = { '待入院': 0, '住院': 1, '门诊': 2 };
    return S().patients.filter(function (p) {
      if (ui.patientType === '住院' && !(p.type === '住院')) return false;
      if (ui.patientType === '待入院' && p.type !== '待入院') return false;
      if (ui.patientType === '门诊' && p.type !== '门诊') return false;
      if (ui.patientDept !== '全部' && p.dept !== ui.patientDept) return false;
      if (!q) return true;
      return (p.name + ' ' + p.id + ' ' + (p.phone || '') + ' ' + (p.bedCode || '') + ' ' + (p.diagnosis || '')).indexOf(q) >= 0;
    }).sort(function (a, b) {
      const ra = rank[a.type] == null ? 9 : rank[a.type];
      const rb = rank[b.type] == null ? 9 : rank[b.type];
      if (ra !== rb) return ra - rb;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function filteredAppointments() {
    return S().appointments.filter(function (a) {
      if (a.date !== ui.apptDate) return false;
      if (ui.apptStatus !== '全部' && a.status !== ui.apptStatus) return false;
      if (ui.apptDept !== '全部' && a.dept !== ui.apptDept) return false;
      if (ui.apptDoctor !== '全部' && a.doctorId !== ui.apptDoctor) return false;
      return true;
    }).sort(function (a, b) { return a.slot.localeCompare(b.slot); });
  }

  function filteredAdmissions() {
    return S().admissions.filter(function (a) {
      if (ui.admissionStatus !== '全部' && a.status !== ui.admissionStatus) return false;
      if (ui.admissionDept !== '全部' && a.dept !== ui.admissionDept) return false;
      return true;
    }).sort(function (a, b) { return a.appliedAt.localeCompare(b.appliedAt); });
  }

  function filteredPlans() {
    const plans = S().plans.filter(function (p) {
      if (ui.approvalTab === 'pending') return p.status === '待审批';
      if (ui.approvalTab === 'processed') return p.status !== '待审批';
      return true;
    });
    return plans;
  }

  function pager(total, page, perPage, target) {
    const pages = Math.max(1, Math.ceil(total / (perPage || 10)));
    const p = Math.min(pages, Math.max(1, page || 1));
    return '<div class="pager"><span>共 ' + total + ' 条 · 第 ' + p + '/' + pages + ' 页</span><div>' +
      '<button class="btn btn-tiny" data-action="page-prev" data-target="' + target + '" ' + (p <= 1 ? 'disabled' : '') + '>上一页</button>' +
      '<button class="btn btn-tiny" data-action="page-next" data-target="' + target + '" ' + (p >= pages ? 'disabled' : '') + '>下一页</button></div></div>';
  }

  // ------------------------------ 患者管理 ------------------------------
  function renderPatients() {
    const all = S().patients;
    const list = filteredPatients();
    const page = ui.patientPage || 1;
    const per = 12;
    const rows = list.slice((page - 1) * per, page * per);
    const counts = {
      inpatient: all.filter(function (p) { return p.type === '住院'; }).length,
      pending: all.filter(function (p) { return p.type === '待入院'; }).length,
      outpatient: all.filter(function (p) { return p.type === '门诊'; }).length,
      newToday: all.filter(function (p) { return (p.updatedAt || '').slice(0, 10) === TODAY; }).length
    };
    let html = pageHead('PATIENT REGISTRY', '患者管理', '住院、待入院与门诊患者档案。演示环境仅使用合成数据。',
      '<button class="btn btn-ghost" data-action="export-patients">' + icon('download', 16) + '导出 CSV</button>' +
      '<button class="btn btn-primary" data-action="new-admission">' + icon('plus', 16) + '新建入院申请</button>');
    html += '<div class="stat-strip">' +
      '<div class="stat-cell"><span>在院患者</span><strong>' + counts.inpatient + '</strong><small>含今日待出院 5 人</small></div>' +
      '<div class="stat-cell"><span>待入院</span><strong>' + counts.pending + '</strong><small>等待床位分配</small></div>' +
      '<div class="stat-cell"><span>门诊档案</span><strong>' + counts.outpatient + '</strong><small>近 30 天活跃</small></div>' +
      '<div class="stat-cell"><span>今日更新</span><strong>' + counts.newToday + '</strong><small>业务系统同步</small></div>' +
      '</div>';
    html += '<section class="card">' + cardHead('患者档案', '共 ' + all.length + ' 份合成档案',
      '<div class="filter-row"><div class="search-box">' + icon('search', 15) + '<input data-filter="patientQuery" value="' + esc(ui.patientQuery) + '" placeholder="搜索姓名 / 患者号 / 床位" onkeydown="if(event.key===\'Enter\'){this.blur()}"></div>' +
      '<select data-filter="patientType"><option' + (ui.patientType === '全部' ? ' selected' : '') + '>全部</option><option' + (ui.patientType === '住院' ? ' selected' : '') + '>住院</option><option' + (ui.patientType === '待入院' ? ' selected' : '') + '>待入院</option><option' + (ui.patientType === '门诊' ? ' selected' : '') + '>门诊</option></select>' +
      '<select data-filter="patientDept"><option value="全部">全部科室</option>' + S().departments.map(function (d) {
        return '<option value="' + d.id + '"' + (ui.patientDept === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
      }).join('') + '</select></div>');
    html += '<div class="table-wrap"><table class="data-table patient-table"><thead><tr><th>患者</th><th>类型</th><th>科室</th><th>性别 / 年龄</th><th>床位 / 状态</th><th>诊断</th><th>联系电话</th><th>更新时间</th><th></th></tr></thead><tbody>';
    html += rows.map(function (p) {
      const dept = S().departments.find(function (d) { return d.id === p.dept; });
      return '<tr><td><div class="person-cell">' + avatar(p.name, dept ? dept.color : '#64748b', 32) + '<div><b>' + esc(p.name) + '</b><small>' + esc(p.id) + '</small></div></div></td>' +
        '<td>' + chip(p.type, p.type === '住院' ? 'info' : (p.type === '待入院' ? 'warning' : 'neutral')) + '</td>' +
        '<td>' + esc(p.deptName) + '</td><td>' + esc(p.gender) + ' · ' + p.age + ' 岁</td>' +
        '<td>' + (p.bedCode ? '<span class="mono">' + esc(p.bedCode) + '</span><small class="block muted">' + esc(p.wardName) + '</small>' : '<span class="muted">未分配</span>') + '</td>' +
        '<td class="ellipsis">' + esc(p.diagnosis || '—') + '</td><td class="mono muted">' + esc(p.phone) + '</td>' +
        '<td class="mono muted">' + esc((p.updatedAt || '').slice(5)) + '</td>' +
        '<td class="right"><button class="btn btn-tiny" data-action="open-patient" data-id="' + p.id + '">查看</button></td></tr>';
    }).join('');
    if (!rows.length) html += '<tr><td colspan="9">' + emptyState('search', '没有匹配的患者', '调整关键词或筛选条件') + '</td></tr>';
    html += '</tbody></table></div>' + pager(list.length, page, per, 'patient') + '</section>';
    return html;
  }

  // ------------------------------ 预约管理 ------------------------------
  function renderAppointments() {
    const stats = engine.appointmentStats(S(), ui.apptDate);
    const list = filteredAppointments();
    const page = ui.apptPage || 1, per = 10;
    const rows = list.slice((page - 1) * per, page * per);
    const docs = S().doctors.filter(function (d) { return ui.apptDept === '全部' || d.dept === ui.apptDept; });
    const tomorrow = ui.apptDate !== TODAY;
    const waitDelta = S().dailyStats.avgWait[6] - S().dailyStats.avgWait[5];
    const waitlist = (S().waitlist || []).filter(function (w) {
      return w.status === '等待中' && (ui.apptDept === '全部' || w.dept === ui.apptDept);
    });
    let html = pageHead('APPOINTMENTS', '预约管理', '号源、预约状态与候补队列。AI 只推荐可用时段，正式变更需确认。',
      '<button class="btn btn-ghost" data-action="new-waitlist">' + icon('clock', 16) + '加入候补</button>' +
      '<button class="btn btn-primary" data-action="new-appointment">' + icon('plus', 16) + '新建预约</button>');
    html += '<div class="stat-strip">' +
      '<div class="stat-cell"><span>今日预约</span><strong>' + stats.total + '</strong><small>有效 ' + stats.valid + ' · 取消 ' + stats.canceled + '</small></div>' +
      '<div class="stat-cell"><span>已签到 / 完成</span><strong>' + stats.visited + '</strong><small>到诊率 ' + engine.pct(stats.visited, stats.total) + '%</small></div>' +
      '<div class="stat-cell"><span>平均等待</span><strong>' + stats.avgWait + '<em>分</em></strong><small>较昨日 ' + (waitDelta >= 0 ? '+' : '') + waitDelta + ' 分钟</small></div>' +
      '<div class="stat-cell"><span>候补队列</span><strong>' + waitlist.length + '</strong><small>等待中 · 可按号源补位</small></div>' +
      '</div>';
    html += '<div class="appt-layout"><section class="card">' +
      cardHead(tomorrow ? '明日预约明细' : '今日预约明细', '共 ' + list.length + ' 条 · 按号源时间排序',
        '<div class="filter-row"><select data-filter="apptDept"><option value="全部">全部科室</option>' + S().departments.map(function (d) {
          return '<option value="' + d.id + '"' + (ui.apptDept === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
        }).join('') + '</select><select data-filter="apptStatus"><option value="全部">全部状态</option>' + ['待确认', '已预约', '已签到', '已完成', '已取消', '已过期'].map(function (s) {
          return '<option' + (ui.apptStatus === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('') + '</select></div>');
    html += '<div class="date-switch"><button class="' + (!tomorrow ? 'active' : '') + '" data-action="set-appt-date" data-date="' + TODAY + '">今天 · 11/06</button>' +
      '<button class="' + (tomorrow ? 'active' : '') + '" data-action="set-appt-date" data-date="' + TOMORROW + '">明天 · 11/07</button></div>';
    html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>时段</th><th>患者</th><th>科室 / 医生</th><th>号源</th><th>状态</th><th>等待</th><th></th></tr></thead><tbody>';
    html += rows.map(function (a) {
      return '<tr><td><span class="slot-pill">' + esc(a.slot) + '</span></td>' +
        '<td><div class="cell-main">' + esc(a.patientName) + '<small>' + esc(a.patientId) + ' · ' + esc(a.phone) + '</small></div></td>' +
        '<td><div class="cell-main">' + esc(a.deptName) + '<small>' + esc(a.doctorName) + ' ' + esc(a.title) + '</small></div></td>' +
        '<td class="mono muted">' + esc(a.room) + '</td><td>' + statusChip(a.status) + '</td>' +
        '<td>' + (a.waitMinutes ? a.waitMinutes + ' 分' : '—') + '</td>' +
        '<td class="right"><button class="btn btn-tiny" data-action="open-appointment" data-id="' + a.id + '">详情</button>' +
        (['待确认', '已预约'].indexOf(a.status) >= 0 && can('appointment.manage') ? '<button class="btn btn-tiny btn-danger-ghost" data-action="cancel-appointment" data-id="' + a.id + '">取消</button>' : '') + '</td></tr>';
    }).join('');
    if (!rows.length) html += '<tr><td colspan="7">' + emptyState('calendar', '该日期暂无预约', '切换日期或新建预约') + '</td></tr>';
    html += '</tbody></table></div>' + pager(list.length, page, per, 'appt') + '</section>';
    html += '<aside class="appt-side"><section class="card">' + cardHead('今日号源看板', '医生出诊与号源余量') +
      '<div class="doctor-list">' + docs.map(function (d) {
        const booked = S().appointments.filter(function (a) { return a.doctorId === d.id && a.date === TODAY && a.status !== '已取消'; }).length;
        const avail = engine.getAvailableSlots(S(), d.id, TODAY);
        return '<div class="doctor-row"><div class="doctor-top"><span class="doctor-avatar" style="background:' + d.color + '1a;color:' + d.color + '">' + esc(d.name.slice(0, 1)) + '</span>' +
          '<div><b>' + esc(d.name) + '</b><small>' + esc(d.title) + ' · ' + esc(d.period) + '</small></div><span class="doctor-load">' + booked + '/' + d.slots.length + '</span></div>' +
          progress(booked / d.slots.length * 100, d.color, 5) +
          '<div class="doctor-next">' + (avail.length ? '最近可约 <b>' + esc(avail[0].slot) + '</b>' : '<span class="muted">今日可约号源已结束</span>') + '</div></div>';
      }).join('') + '</div></section>' +
      '<section class="card waitlist-card">' + cardHead('候补队列', waitlist.length + ' 位等待中 · 按登记时间', '<button class="btn btn-tiny btn-soft" data-action="new-waitlist">' + icon('plus', 12) + '加入</button>') +
      (waitlist.length ? '<div class="waitlist-list">' + waitlist.slice(0, 5).map(function (w) {
        return '<div class="waitlist-row"><div class="waitlist-top"><b>' + esc(w.patientName) + '</b>' + chip(w.priority, w.priority === '优先' ? 'warning' : 'neutral') + '<small>' + esc(w.registeredAt.slice(11)) + '</small></div>' +
          '<p>' + esc(w.deptName) + ' · ' + esc(w.doctorName || '不指定医生') + ' · ' + esc(w.preferredDate.slice(5).replace('-', '/')) + ' ' + esc(w.preferredPeriod) + '</p>' +
          '<div class="waitlist-actions"><span>' + esc(w.note || '无备注') + '</span>' +
          (can('appointment.manage') ? '<button class="btn btn-tiny btn-primary" data-action="promote-waitlist" data-id="' + w.id + '">补位</button><button class="btn btn-tiny btn-ghost" data-action="remove-waitlist" data-id="' + w.id + '">移除</button>' : '') + '</div></div>';
      }).join('') + '</div>' : emptyState('clock', '暂无候补患者', '有患者需要候补时，可加入队列')) + '</section>' +
      '<section class="card ai-suggest-card"><div class="ai-suggest-head">' + icon('sparkles', 18) + '<strong>AI 预约建议</strong><span>RAG</span></div>' +
      '<p>当患者提出科室或时间偏好时，AI 会结合出诊时间、号源余量、等待时间与重复预约规则推荐 3 个时段，不会自动提交。</p>' +
      '<button class="btn btn-soft btn-block" data-action="new-appointment">' + icon('sparkles', 15) + '打开智能预约</button></section></aside></div>';
    return html;
  }

  // ------------------------------ 入院申请 ------------------------------
  function renderAdmissions() {
    const all = S().admissions;
    const list = filteredAdmissions();
    const page = ui.admissionPage || 1, per = 10;
    const rows = list.slice((page - 1) * per, page * per);
    const pending = all.filter(function (a) { return a.status === '待分配'; }).length;
    const ortho = all.filter(function (a) { return a.dept === 'ortho' && a.status === '待分配'; }).length;
    const nowMin = engine.minutes(now().slice(11));
    const waitingHours = all.filter(function (a) { return a.status === '待分配'; }).map(function (a) {
      return Math.max(0, (nowMin - engine.minutes(a.appliedAt.slice(11))) / 60);
    });
    const avgWaitH = waitingHours.length ? engine.mean(waitingHours) : 0;
    let html = pageHead('ADMISSION REQUESTS', '入院申请', '从申请、床位匹配到入住的状态闭环。AI 只按行政规则生成建议。',
      '<button class="btn btn-ghost" data-action="open-bed-plan" data-prompt="帮我制定今天的全院床位分配方案">' + icon('bed', 16) + '全院床位方案</button>' +
      '<button class="btn btn-primary" data-action="new-admission">' + icon('plus', 16) + '新建申请</button>');
    html += '<div class="stat-strip">' +
      '<div class="stat-cell"><span>待分配</span><strong>' + pending + '</strong><small>全院等待床位</small></div>' +
      '<div class="stat-cell"><span>骨科待分配</span><strong>' + ortho + '</strong><small>当前压力最高</small></div>' +
      '<div class="stat-cell"><span>今日已分配</span><strong>' + all.filter(function (a) { return a.status === '已分配'; }).length + '</strong><small>来自审批执行</small></div>' +
      '<div class="stat-cell"><span>平均等待</span><strong>' + avgWaitH.toFixed(1) + '<em>h</em></strong><small>从申请到当前</small></div>' +
      '</div>';
    html += '<section class="card">' + cardHead('入院申请队列', '共 ' + all.length + ' 条 · 按申请时间排序',
      '<div class="filter-row"><select data-filter="admissionDept"><option value="全部">全部科室</option>' + S().departments.map(function (d) {
        return '<option value="' + d.id + '"' + (ui.admissionDept === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
      }).join('') + '</select><select data-filter="admissionStatus"><option>全部</option><option' + (ui.admissionStatus === '待分配' ? ' selected' : '') + '>待分配</option><option' + (ui.admissionStatus === '已分配' ? ' selected' : '') + '>已分配</option></select></div>');
    html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>患者</th><th>科室</th><th>床位需求</th><th>优先级</th><th>申请时间</th><th>状态</th><th>审批 / 床位</th><th></th></tr></thead><tbody>';
    html += rows.map(function (a) {
      return '<tr><td><div class="cell-main">' + esc(a.name) + '<small>' + esc(a.id) + ' · ' + esc(a.gender) + ' / ' + a.age + ' 岁</small></div></td>' +
        '<td>' + esc(a.deptName) + '</td>' +
        '<td><span class="bed-type-tag">' + esc(a.bedType) + '</span>' + (a.isolation ? ' ' + chip('隔离', 'purple') : '') + '<small class="block muted">' + esc((a.requiredFeatures || []).join(' · ') || '标准配置') + '</small></td>' +
        '<td>' + chip(a.priority, a.priority === '优先' ? 'warning' : 'neutral') + '<small class="block muted">' + esc(a.prioritySource) + '</small></td>' +
        '<td class="mono muted">' + esc(a.appliedAt.slice(5)) + '</td><td>' + statusChip(a.status) + '</td>' +
        '<td>' + (a.assignedBedId ? '<span class="mono">' + esc(a.assignedBedId) + '</span>' : '<span class="muted">等待方案</span>') + '</td>' +
        '<td class="right"><button class="btn btn-tiny" data-action="open-admission" data-id="' + a.id + '">详情</button>' +
        (a.status === '待分配' ? '<button class="btn btn-tiny btn-soft" data-action="open-bed-plan" data-prompt="帮我制定今天' + esc(a.deptName) + '的床位分配方案">AI 方案</button>' : '') + '</td></tr>';
    }).join('');
    if (!rows.length) html += '<tr><td colspan="8">' + emptyState('file', '没有匹配的入院申请', '调整筛选条件') + '</td></tr>';
    html += '</tbody></table></div>' + pager(list.length, page, per, 'admission') + '</section>';
    return html;
  }

  // ------------------------------ 床位管理 ------------------------------
  function renderBeds() {
    const k = engine.getKpis(S());
    const counts = engine.getBedStatusCounts(S().beds);
    const selectedWard = S().wards.find(function (w) { return w.id === ui.bedWard; }) || S().wards[0];
    let wardBeds = S().beds.filter(function (b) { return b.wardId === selectedWard.id; });
    if (ui.bedStatus !== '全部') wardBeds = wardBeds.filter(function (b) { return b.status === ui.bedStatus; });
    if (ui.bedQuery.trim()) {
      const q = ui.bedQuery.trim();
      wardBeds = wardBeds.filter(function (b) { return (b.code + ' ' + (b.patientName || '') + ' ' + b.room).indexOf(q) >= 0; });
    }
    let html = pageHead('BED COMMAND', '床位管理', '病区、床位状态与分配执行。待清洁和维护中的床位不会进入 AI 候选池。',
      '<button class="btn btn-ghost" data-action="open-bed-plan" data-prompt="帮我制定今天的骨科床位分配方案">' + icon('sparkles', 16) + 'AI 床位调度</button>' +
      '<button class="btn btn-primary" data-action="new-admission">' + icon('plus', 16) + '收治申请</button>');
    html += '<div class="stat-strip bed-stats">' +
      '<div class="stat-cell"><span>床位总数</span><strong>' + k.totalBeds + '</strong><small>8 个病区</small></div>' +
      '<div class="stat-cell"><span>当前空闲</span><strong class="teal">' + k.free + '</strong><small>可进入分配池</small></div>' +
      '<div class="stat-cell"><span>已入住</span><strong>' + k.occupied + '</strong><small>使用率 ' + k.occupancy + '%</small></div>' +
      '<div class="stat-cell"><span>待清洁 / 维护</span><strong class="amber">' + (k.cleaning + k.maintenance) + '</strong><small>暂不可分配</small></div>' +
      '</div>';
    html += '<div class="ward-tabs">' + S().wards.map(function (w) {
      const beds = S().beds.filter(function (b) { return b.wardId === w.id; });
      const free = beds.filter(function (b) { return b.status === '空闲'; }).length;
      return '<button class="ward-tab ' + (w.id === selectedWard.id ? 'active' : '') + '" data-action="set-bed-ward" data-ward="' + w.id + '">' +
        '<span><b>' + esc(w.name) + '</b><small>' + esc(w.floor) + ' · ' + esc(w.side) + ' · 护士长 ' + esc(w.nurse) + '</small></span>' +
        '<em>' + free + ' 空闲</em></button>';
    }).join('') + '</div>';
    html += '<section class="card bed-board-card"><div class="bed-board-head"><div><span class="eyebrow">' + esc(selectedWard.floor + ' · ' + selectedWard.side) + '</span>' +
      '<h2>' + esc(selectedWard.name) + '</h2><p>共 12 张床位 · 护士长 ' + esc(selectedWard.nurse) + ' · 分机 ' + esc(selectedWard.phone) + '</p></div>' +
      '<div class="filter-row"><div class="search-box">' + icon('search', 15) + '<input data-filter="bedQuery" value="' + esc(ui.bedQuery) + '" placeholder="床位号 / 患者"></div>' +
      '<select data-filter="bedStatus"><option>全部</option>' + ['空闲', '已入住', '待清洁', '维护中', '已预留'].map(function (s) {
        return '<option' + (ui.bedStatus === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select></div></div>';
    html += '<div class="bed-grid">' + wardBeds.map(function (b) {
      const cls = { '空闲': 'free', '已入住': 'occupied', '待清洁': 'cleaning', '维护中': 'maintenance', '已预留': 'reserved', '暂停使用': 'paused' }[b.status] || 'free';
      let foot = '';
      if (b.status === '已入住') {
        const d = b.expectedDischarge ? U.daysFromNow(b.expectedDischarge, TODAY) : null;
        foot = d === 0 ? '今日预出院 ' + (b.expectedDischargeTime || '') : '预计 ' + (b.expectedDischarge ? b.expectedDischarge.slice(5).replace('-', '/') : '—') + ' 出院';
      } else if (b.status === '空闲') foot = '点击查看 · 可分配';
      else if (b.status === '待清洁') foot = '预计 ' + (b.cleaningDeadline ? b.cleaningDeadline.slice(11) : '—') + ' 完成';
      else if (b.status === '维护中') foot = b.maintenanceNote || '维护中';
      else foot = b.reservedFor || '已预留';
      return '<button class="bed-card st-' + cls + '" data-action="open-bed" data-id="' + b.id + '">' +
        '<div class="bed-card-top"><span class="bed-code">' + esc(b.code) + '</span><span class="bed-type">' + esc(b.type) + '</span></div>' +
        '<div class="bed-patient">' + (b.patientName ? esc(b.patientName) : (b.status === '空闲' ? '空床' : STATUS_ZH[b.status])) + '</div>' +
        '<div class="bed-meta">' + (b.patientName ? esc(b.genderPolicy === '男' ? '男' : (b.genderPolicy === '女' ? '女' : '—')) + ' · ' + esc(b.deptName) : esc(b.features.slice(0, 2).join(' · '))) + '</div>' +
        '<div class="bed-card-foot"><span class="bed-state">' + statusChip(b.status) + '</span><small>' + esc(foot) + '</small></div>' +
        '</button>';
    }).join('') + '</div>';
    if (!wardBeds.length) html += emptyState('bed', '没有匹配的床位', '调整状态筛选或床位号');
    html += '<div class="bed-board-foot"><div class="legend-inline">' + counts.map(function (c) {
      return '<span><i style="background:' + c.color + '"></i>' + esc(c.status) + ' ' + c.count + '</span>';
    }).join('') + '</div><div class="muted small">床位状态通过 Bed MCP 实时读取 · 每次操作写入审计日志</div></div></section>';
    html += '<div class="two-col"><section class="card">' + cardHead('今日预计释放', '出院与清洁完成后可进入分配池') + '<div class="release-list">' +
      S().beds.filter(function (b) { return b.status === '已入住' && b.expectedDischarge === TODAY; }).map(function (b) {
        return '<div class="release-row"><span class="release-time">' + esc(b.expectedDischargeTime || '12:00') + '</span><div><b>' + esc(b.code) + ' · ' + esc(b.wardName) + '</b><small>' + esc(b.patientName) + ' · ' + esc(b.type) + '</small></div>' + statusChip('已入住') + '</div>';
      }).join('') + '</div></section>' +
      '<section class="card">' + cardHead('状态规则', 'AI 调度不会越过的边界') + '<div class="rule-list">' +
      '<div><span class="rule-dot green"></span><b>空闲</b><small>唯一可被方案直接分配的床位状态</small></div>' +
      '<div><span class="rule-dot amber"></span><b>待清洁</b><small>完成终末清洁和护理复核后才可分配</small></div>' +
      '<div><span class="rule-dot slate"></span><b>维护中 / 暂停</b><small>不进入候选池，需工程或管理员恢复</small></div>' +
      '<div><span class="rule-dot purple"></span><b>已预留</b><small>预留解除前不参与调度</small></div></div></section></div>';
    return html;
  }

  // ------------------------------ 检查资源 ------------------------------
  function renderEquipment() {
    const date = ui.equipDate;
    const dayExams = S().exams.filter(function (e) { return e.date === date && e.status !== '已取消'; });
    const conflicts = engine.detectExamConflicts(S().exams, date);
    const selected = S().devices.find(function (d) { return d.id === ui.equipDevice; }) || S().devices[0];
    const selectedExams = dayExams.filter(function (e) { return e.deviceId === selected.id; }).sort(function (a, b) { return a.start.localeCompare(b.start); });
    const conflictIds = {};
    conflicts.forEach(function (c) { conflictIds[c.a.id] = true; conflictIds[c.b.id] = true; });
    const activeDevices = S().devices.filter(function (d) { return d.status !== '维护中'; });
    const totalMinutes = dayExams.reduce(function (sum, e) { return sum + (e.duration || 30); }, 0);
    const util = engine.pct(totalMinutes, activeDevices.length * 600);
    const dateLabel = date === TODAY ? '今天 · 11/06' : '明天 · 11/07';
    let html = pageHead('DIAGNOSTIC RESOURCES', '检查资源', 'CT、MRI、超声与 X 光的设备能力、预约时段与冲突分析。',
      '<button class="btn btn-ghost" data-action="maintain-device">' + icon('tool', 16) + '设备维护</button>' +
      '<button class="btn btn-ghost" data-action="new-equipment-analysis" data-device="CT" data-date="' + (date === TODAY ? 'today' : 'tomorrow') + '">' + icon('sparkles', 16) + 'AI 冲突分析</button>' +
      '<button class="btn btn-primary" data-action="new-exam">' + icon('plus', 16) + '新建检查</button>');
    html += '<div class="stat-strip">' +
      '<div class="stat-cell"><span>设备总数</span><strong>8</strong><small>7 台在用 · 1 台维护</small></div>' +
      '<div class="stat-cell"><span>' + (date === TODAY ? '今日' : '明日') + '检查</span><strong>' + dayExams.length + '</strong><small>按预约时段统计</small></div>' +
      '<div class="stat-cell"><span>时段冲突</span><strong class="' + (conflicts.length ? 'danger' : 'teal') + '">' + conflicts.length + '</strong><small>需人工确认调整</small></div>' +
      '<div class="stat-cell"><span>设备利用率</span><strong>' + util.toFixed(1) + '<em>%</em></strong><small>8:00–18:00 可用窗口</small></div>' +
      '</div>';
    html += '<div class="date-switch equipment-date"><button class="' + (date === TODAY ? 'active' : '') + '" data-action="set-equip-date" data-date="' + TODAY + '">今天 · 11/06</button>' +
      '<button class="' + (date === TOMORROW ? 'active' : '') + '" data-action="set-equip-date" data-date="' + TOMORROW + '">明天 · 11/07</button>' +
      '<span class="muted small">' + conflicts.length + ' 组冲突 · ' + dayExams.length + ' 个检查</span></div>';
    html += '<div class="device-grid">' + S().devices.map(function (d) {
      const ex = dayExams.filter(function (e) { return e.deviceId === d.id; });
      const used = ex.reduce(function (sum, e) { return sum + (e.duration || 30); }, 0);
      const u = engine.pct(used, 600);
      const isSel = d.id === selected.id;
      const dc = conflicts.filter(function (c) { return c.deviceId === d.id; }).length;
      return '<button class="device-card ' + (isSel ? 'active' : '') + ' ' + (d.status === '维护中' ? 'maintenance' : '') + '" data-action="set-equip-device" data-device="' + d.id + '">' +
        '<div class="device-head"><span class="device-icon" style="color:' + d.color + ';background:' + d.color + '14">' + icon('monitor', 18) + '</span>' +
        '<span class="device-status">' + (d.status === '维护中' ? chip('维护中', 'muted') : (dc ? chip(dc + ' 冲突', 'danger') : chip('运行中', 'success'))) + '</span></div>' +
        '<div class="device-name">' + esc(d.name) + '<small>' + esc(d.model) + '</small></div>' +
        '<div class="device-util"><span>' + ex.length + ' 个检查</span><strong>' + u.toFixed(0) + '%</strong></div>' + progress(u, d.color, 5) +
        '</button>';
    }).join('') + '</div>';
    html += '<div class="equipment-layout"><section class="card">' + cardHead(selected.name + ' · 时段排程', (date === TODAY ? '今日' : '明日') + ' · ' + selected.model,
      '<div class="legend-inline compact">' + statusChip('已预约') + '<span class="legend-dot blue"></span>已完成<span class="legend-dot amber"></span>冲突</div>');
    html += '<div class="timeline"><div class="timeline-hours">' + [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(function (h) {
      return '<span>' + String(h).padStart(2, '0') + ':00</span>';
    }).join('') + '</div><div class="timeline-track">' + selectedExams.map(function (e) {
      const start = engine.minutes(e.start), end = engine.minutes(e.end);
      const left = (start - 480) / 600 * 100;
      const width = (end - start) / 600 * 100;
      const conflict = conflictIds[e.id];
      return '<button class="exam-block ' + (e.status === '已完成' ? 'done' : (e.status === '进行中' ? 'live' : '')) + (conflict ? ' conflict' : '') + '" ' +
        'style="left:' + left.toFixed(2) + '%;width:' + Math.max(1.5, width).toFixed(2) + '%" data-action="open-exam" data-id="' + e.id + '" title="' + esc(e.patientName + ' · ' + e.examItem + ' · ' + e.start + '-' + e.end) + '">' +
        '<span>' + esc(e.patientName) + '</span><small>' + esc(e.start) + '</small></button>';
    }).join('') + '</div></div>';
    html += '<div class="timeline-foot"><span><i class="legend-dot teal"></i>已预约</span><span><i class="legend-dot blue"></i>已完成</span><span><i class="legend-dot amber"></i>重叠冲突</span><span class="muted">点击检查块查看详情 · 维护设备不排程</span></div></section>';
    html += '<aside class="conflict-panel">' + cardHead('冲突与建议', conflicts.length ? '发现 ' + conflicts.length + ' 组重叠' : '当前无时段重叠') +
      (conflicts.length ? conflicts.map(function (c) {
        return '<div class="conflict-card"><div class="conflict-head"><span>' + esc(c.deviceName) + '</span>' + chip('重叠 ' + c.overlap + ' 分钟', 'danger') + '</div>' +
          '<div class="conflict-pair"><div><b>' + esc(c.a.start) + '–' + esc(c.a.end) + '</b><small>' + esc(c.a.patientName) + ' · ' + esc(c.a.examItem) + ' · ' + esc(c.a.priority) + '</small></div>' +
          '<span class="vs">VS</span><div><b>' + esc(c.b.start) + '–' + esc(c.b.end) + '</b><small>' + esc(c.b.patientName) + ' · ' + esc(c.b.examItem) + ' · ' + esc(c.b.priority) + '</small></div></div>' +
          '<button class="btn btn-tiny btn-soft" data-action="open-exam" data-id="' + c.b.id + '">查看后一个检查</button></div>';
      }).join('') : emptyState('check', '该日期无检查冲突', '设备时段全部通过校验')) +
      '<div class="ai-note">' + icon('sparkles', 15) + '<p>AI 只会调整<b>常规</b>检查到最近空档；优先/紧急检查保持原时段，无法自动调整时提交人工协调。</p></div></aside></div>';
    html += '<section class="card">' + cardHead(selected.name + ' 检查明细', selectedExams.length + ' 条') +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>时间</th><th>患者</th><th>检查项目</th><th>开单科室</th><th>优先级</th><th>状态</th><th></th></tr></thead><tbody>' +
      selectedExams.map(function (e) {
        return '<tr class="' + (conflictIds[e.id] ? 'row-conflict' : '') + '"><td class="mono">' + esc(e.start) + '–' + esc(e.end) + '</td>' +
          '<td>' + esc(e.patientName) + '</td><td>' + esc(e.examItem) + '</td><td>' + esc(e.deptName) + '</td>' +
          '<td>' + chip(e.priority, e.priority === '紧急' ? 'danger' : (e.priority === '优先' ? 'warning' : 'neutral')) + '</td>' +
          '<td>' + statusChip(e.status) + '</td><td class="right"><button class="btn btn-tiny" data-action="open-exam" data-id="' + e.id + '">详情</button></td></tr>';
      }).join('') + '</tbody></table></div></section>';
    return html;
  }

  // ------------------------------ 人员排班 ------------------------------
  function renderStaff() {
    const stats = engine.getStaffStats(S());
    const staff = S().staff.filter(function (s) { return ui.staffDept === '全部' || s.dept === ui.staffDept; });
    const dayNames = { '早': '早班', '中': '中班', '夜': '夜班', '白': '白班', '休': '休息' };
    let html = pageHead('WORKFORCE', '人员排班', '医护档案、班次、技能与工作负载。排班冲突由规则引擎阻断。',
      '<button class="btn btn-ghost" data-action="request-leave">' + icon('calendar', 16) + '请假登记</button>' +
      '<button class="btn btn-ghost" data-action="swap-shift">' + icon('refresh', 16) + '调班</button>' +
      '<button class="btn btn-primary" data-action="generate-staff-plan">' + icon('sparkles', 16) + '生成排班方案</button>');
    html += '<div class="stat-strip">' +
      '<div class="stat-cell"><span>医护人员</span><strong>' + stats.total + '</strong><small>覆盖 7 个科室</small></div>' +
      '<div class="stat-cell"><span>今日在岗</span><strong>' + stats.onDuty + '</strong><small>含夜班交接</small></div>' +
      '<div class="stat-cell"><span>平均负载</span><strong>' + stats.avgLoad + '<em>%</em></strong><small>按班次 / 夜班加权</small></div>' +
      '<div class="stat-cell"><span>排班冲突</span><strong class="' + (stats.conflicts ? 'danger' : 'teal') + '">' + stats.conflicts + '</strong><small>需护士长确认</small></div>' +
      '</div>';
    html += '<div class="staff-layout"><section class="card">' + cardHead('本周排班表', '2026/11/06 – 11/12 · 班次与休息',
      '<select data-filter="staffDept"><option value="全部">全部科室</option>' + S().departments.map(function (d) {
        return '<option value="' + d.id + '"' + (ui.staffDept === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
      }).join('') + '</select>');
    html += '<div class="table-wrap roster-wrap"><table class="data-table roster-table"><thead><tr><th>人员</th><th>科室 / 岗位</th>' +
      S().weekDates.map(function (d, i) {
        return '<th class="' + (d === TODAY ? 'today-col' : '') + '">' + S().weekLabels[i] + '<small>' + d.slice(5) + '</small></th>';
      }).join('') + '<th>周工时</th></tr></thead><tbody>';
    html += staff.map(function (s) {
      return '<tr><td><div class="person-cell">' + avatar(s.name, s.color, 30) + '<div><b>' + esc(s.name) + '</b><small>' + esc(s.title) + '</small></div></div></td>' +
        '<td><div class="cell-main">' + esc(s.deptName) + '<small>' + esc(s.role) + '</small></div></td>' +
        S().weekDates.map(function (d) {
          const shift = s.shifts[d];
          const isConflict = S().staffConflicts.some(function (c) { return c.staffId === s.id && c.date === d; });
          return '<td class="' + (d === TODAY ? 'today-col' : '') + '"><span class="shift shift-' + ({ '早': 'am', '中': 'pm', '夜': 'night', '白': 'day', '休': 'off' }[shift] || 'off') + (isConflict ? ' shift-conflict' : '') + '" title="' + dayNames[shift] + '">' + shift + '</span></td>';
        }).join('') +
        '<td><b>' + s.weeklyHours + 'h</b><small class="block muted">' + s.nightShifts + ' 夜</small></td></tr>';
    }).join('') + '</tbody></table></div>' +
      '<div class="roster-legend"><span><i class="shift am">早</i>08:00–16:00</span><span><i class="shift pm">中</i>14:00–22:00</span><span><i class="shift night">夜</i>22:00–08:00</span><span><i class="shift day">白</i>08:00–17:30</span><span><i class="shift off">休</i>休息</span></div></section>';
    html += '<aside class="staff-side">' + '<section class="card">' + cardHead('科室负载', '按人员加权平均') +
      barList(stats.byDept.map(function (d) { return { label: d.name, value: d.avgLoad, display: d.avgLoad + '%', color: d.color, sub: d.count + ' 人 · ' + d.night + ' 个夜班' }; }), { max: 100 }) + '</section>';
    html += '<section class="card">' + cardHead('排班冲突', '规则引擎检测') + '<div class="conflict-list">' +
      S().staffConflicts.map(function (c) {
        return '<div class="staff-conflict"><div class="staff-conflict-head">' + levelChip(c.severity) + '<b>' + esc(c.type) + '</b></div>' +
          '<p>' + esc(c.detail) + '</p><small>' + esc(c.suggestion) + '</small></div>';
      }).join('') + '</div></section>';
    html += '<section class="card ai-suggest-card">' + '<div class="ai-suggest-head">' + icon('sparkles', 18) + '<strong>AI 排班建议</strong><span>草案</span></div>' +
      '<p>规则引擎检测到 ' + S().staffConflicts.length + ' 条冲突。AI 只会把冲突班次调整为休息，不会自动发布；最终排班需运营主管/系统管理员审批。</p>' +
      '<button class="btn btn-soft btn-block" data-action="generate-staff-plan">' + icon('sparkles', 15) + '生成全院调整草案</button></section>';
    if ((S().leaveRecords || []).length || (S().swapRecords || []).length) {
      html += '<section class="card">' + cardHead('最近请假 / 调班', '操作留痕') + '<div class="mini-record-list">' +
        (S().leaveRecords || []).slice(0, 4).map(function (r) {
          return '<div><span class="mono">' + esc(r.date.slice(5)) + '</span><b>' + esc(r.staffName) + ' 请假</b><small class="muted">' + esc(r.reason || '') + '</small></div>';
        }).join('') +
        (S().swapRecords || []).slice(0, 4).map(function (r) {
          return '<div><span class="mono">' + esc(r.date.slice(5)) + '</span><b>' + esc(r.staffName) + ' ' + esc(r.from) + '→' + esc(r.to) + '</b><small class="muted">调班</small></div>';
        }).join('') + '</div></section>';
    }
    html += '</aside></div>';
    return html;
  }

  // ------------------------------ 运营预警 ------------------------------
  function renderAlerts() {
    const all = S().alerts;
    const open = all.filter(function (a) { return a.status === '待处理' || a.status === '处理中'; });
    const filtered = all.filter(function (a) {
      if (ui.alertStatus === 'open' && a.status !== '待处理' && a.status !== '处理中') return false;
      if (ui.alertStatus === 'handled' && a.status !== '已处理' && a.status !== '已忽略') return false;
      if (ui.alertLevel !== '全部' && a.level !== ui.alertLevel) return false;
      return true;
    });
    const counts = { '紧急': 0, '高': 0, '中': 0, '低': 0 };
    open.forEach(function (a) { counts[a.level] = (counts[a.level] || 0) + 1; });
    let html = pageHead('RISK SIGNALS', '运营预警', '主动发现床位、预约、设备与人员资源的异常。高级预警需 2 小时内响应。',
      '<button class="btn btn-ghost" data-action="refresh-alerts">' + icon('refresh', 16) + '运行规则引擎</button>' +
      '<button class="btn btn-primary" data-action="open-bed-plan" data-prompt="找出未来三天可能出现床位紧张的科室">' + icon('sparkles', 16) + 'AI 风险预测</button>');
    html += '<div class="alert-summary">' +
      '<div class="alert-summary-main"><span class="eyebrow">OPEN SIGNALS</span><strong>' + open.length + '</strong><p>条待处置预警，其中 <b>' + counts['高'] + '</b> 条高等级</p></div>' +
      ['紧急', '高', '中', '低'].map(function (lv) {
        return '<button class="alert-summary-cell lv-' + ({ '紧急': 'urgent', '高': 'high', '中': 'mid', '低': 'low' }[lv]) + ' ' + (ui.alertLevel === lv ? 'active' : '') + '" data-action="set-alert-level" data-level="' + lv + '"><span>' + lv + '</span><strong>' + (counts[lv] || 0) + '</strong></button>';
      }).join('') + '</div>';
    const rules = S().alertRules || {};
    html += '<div class="alert-rule-strip"><span>' + icon('activity', 13) + '规则引擎阈值</span><b>床位 ≥ ' + rules.bedOccupancyHigh + '%</b><b>科室缺口</b><b>清洁超时 > ' + rules.cleaningOverdueMinutes + ' min</b><b>夜班间隔 < 11h</b><b>取消率 > ' + rules.cancellationRate + '%</b></div>';
    html += '<div class="toolbar-row"><div class="segmented"><button class="' + (ui.alertStatus === 'open' ? 'active' : '') + '" data-action="set-alert-status" data-status="open">待处置</button><button class="' + (ui.alertStatus === 'handled' ? 'active' : '') + '" data-action="set-alert-status" data-status="handled">已处置</button><button class="' + (ui.alertStatus === 'all' ? 'active' : '') + '" data-action="set-alert-status" data-status="all">全部</button></div>' +
      '<div class="filter-row"><select data-filter="alertLevel"><option>全部</option>' + ['紧急', '高', '中', '低'].map(function (l) { return '<option' + (ui.alertLevel === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></div></div>';
    html += '<div class="alert-grid">' + filtered.map(function (a) {
      return '<button class="alert-card lv-' + ({ '紧急': 'urgent', '高': 'high', '中': 'mid', '低': 'low' }[a.level] || 'low') + '" data-action="open-alert" data-id="' + a.id + '">' +
        '<div class="alert-card-head">' + levelChip(a.level) + '<span class="alert-type">' + esc(a.type) + '</span>' + statusChip(a.status) + '</div>' +
        '<h3>' + esc(a.title) + '</h3><p>' + esc(a.cause) + '</p>' +
        '<div class="alert-data">' + a.data.slice(0, 3).map(function (d) { return '<span>' + esc(d) + '</span>'; }).join('') + '</div>' +
        '<div class="alert-card-foot"><span>' + esc(a.dept) + ' · ' + esc(a.triggerAt.slice(5)) + '</span><span>' + esc(a.ai.slice(0, 38)) + '… ' + icon('chevron', 13) + '</span></div></button>';
    }).join('') + '</div>';
    if (!filtered.length) html += emptyState('check', '没有符合条件的预警', '调整筛选或切换待处置/已处置');
    return html;
  }

  // ------------------------------ 数据分析 ------------------------------
  function renderAnalytics() {
    const range = engine.getRangeStats(S(), ui.analyticsRange);
    const depts = engine.getDeptStats(S());
    const k = engine.getKpis(S());
    const totalAppts = engine.sum(range.appointments);
    const avgOcc = engine.round(engine.mean(range.occupancy), 1);
    const avgWait = engine.round(engine.mean(range.avgWait), 1);
    const avgCancel = engine.round(engine.mean(range.cancellation), 1);
    let html = pageHead('ANALYTICS', '数据分析', '从业务数据到自然语言报告。AI 不自行编造统计数字。',
      '<button class="btn btn-ghost" data-action="export-analytics">' + icon('download', 16) + '导出统计 CSV</button>' +
      '<button class="btn btn-primary" data-action="generate-report">' + icon('sparkles', 16) + '生成 AI 报告</button>');
    html += '<div class="toolbar-row"><div class="segmented"><button class="' + (ui.analyticsRange === 7 ? 'active' : '') + '" data-action="set-range" data-range="7">近 7 天</button><button class="' + (ui.analyticsRange === 30 ? 'active' : '') + '" data-action="set-range" data-range="30">近 30 天</button></div>' +
      '<span class="data-source">' + icon('database', 14) + '数据来源：运营指标服务 · 更新于 ' + esc(now()) + '</span></div>';
    html += '<div class="stat-strip analytics-stats">' +
      '<div class="stat-cell"><span>累计预约</span><strong>' + fmt(totalAppts) + '</strong><small>近 ' + ui.analyticsRange + ' 天</small>' + sparkline(range.appointments, '#2563eb') + '</div>' +
      '<div class="stat-cell"><span>平均床位使用率</span><strong>' + avgOcc + '<em>%</em></strong><small>当前 ' + k.occupancy + '%</small>' + sparkline(range.occupancy, '#0f766e') + '</div>' +
      '<div class="stat-cell"><span>平均预约等待</span><strong>' + avgWait + '<em>分</em></strong><small>目标 ≤ 20 分钟</small>' + sparkline(range.avgWait, '#d97706') + '</div>' +
      '<div class="stat-cell"><span>平均取消率</span><strong>' + avgCancel + '<em>%</em></strong><small>院级目标 ≤ 5%</small>' + sparkline(range.cancellation, '#be123c') + '</div>' +
      '<div class="stat-cell"><span>平均住院日</span><strong>' + k.alos + '<em>天</em></strong><small>当前在院患者</small>' + sparkline([4.8, 5.1, 5.0, 5.3, 5.2, 5.1, k.alos], '#7c3aed') + '</div>' +
      '</div>';
    html += '<div class="analytics-grid"><section class="card span-8">' + cardHead('床位使用率与预约量', '近 ' + ui.analyticsRange + ' 天 · 双轴趋势') +
      comboChart({ labels: range.labels, bars: range.appointments, line: range.occupancy, barLabel: '预约量', lineLabel: '床位使用率' }) + '</section>';
    html += '<section class="card span-4">' + cardHead('科室床位使用率', '当前实时快照') +
      barList(depts.map(function (d) { return { label: d.name, value: d.occupancy, display: d.occupancy + '%', color: d.color, sub: d.free + ' 张空闲 · ' + d.pending + ' 人待入院' }; }), { max: 100 }) + '</section>';
    html += '<section class="card span-5">' + cardHead('检查设备利用率', '按 8:00–18:00 可用窗口') +
      barList(S().devices.map(function (d) {
        const ex = S().exams.filter(function (e) { return e.deviceId === d.id && e.date === TODAY && e.status !== '已取消'; });
        const used = ex.reduce(function (sum, e) { return sum + (e.duration || 30); }, 0);
        return { label: d.name, value: engine.pct(used, 600), display: engine.pct(used, 600).toFixed(0) + '%', color: d.color, sub: d.status + ' · ' + ex.length + ' 个检查' };
      }), { max: 100 }) + '</section>';
    html += '<section class="card span-7 ai-report-card">' + cardHead('AI 运营报告', '基于统计服务计算结果生成', '<span class="ai-mode">' + icon('sparkles', 14) + 'RAG + 数据工具</span>') +
      (ui.report ? renderReport(ui.report) : '<div class="report-placeholder">' + icon('sparkles', 30) + '<h3>生成一份有数据依据的运营周报</h3><p>系统会先统计预约、床位、检查与人员数据，再由 AI 组织语言。报告中的每个数字都来自业务库。</p>' +
        '<button class="btn btn-primary" data-action="generate-report">' + icon('sparkles', 16) + '生成近 ' + ui.analyticsRange + ' 天报告</button>' +
        '<small>预计 2 秒 · 不调用外部模型（演示模式）</small></div>') + '</section></div>';
    return html;
  }

  function renderReport(r) {
    return '<div class="report"><div class="report-head"><div><span class="eyebrow">GENERATED REPORT</span><h3>' + esc(r.title) + '</h3><p>' + esc(r.range) + ' · ' + esc(r.generatedAt) + '</p></div>' +
      '<button class="btn btn-tiny" data-action="copy-report">' + icon('file', 14) + '复制</button></div>' +
      '<div class="report-highlights">' + r.highlights.map(function (h) { return '<div><span>' + esc(h.label) + '</span><strong>' + fmt(h.value) + '<em>' + esc(h.unit) + '</em></strong></div>'; }).join('') + '</div>' +
      '<div class="report-sections">' + r.sections.map(function (s) { return '<div><h4>' + esc(s.title) + '</h4><p>' + esc(s.body) + '</p></div>'; }).join('') + '</div>' +
      '<div class="report-source">' + icon('database', 13) + '数据来源：' + esc(r.dataSource) + ' · AI 未生成任何未经查询的数字</div></div>';
  }

  // ------------------------------ 知识库 ------------------------------
  function renderKnowledge() {
    const docs = S().knowledgeDocs;
    const selected = docs.find(function (d) { return d.id === ui.kbDocId; }) || null;
    const chunks = docs.reduce(function (s, d) { return s + d.chunks.length; }, 0);
    let html = pageHead('RAG KNOWLEDGE', '运营知识库', '医院制度、规则与操作手册的检索依据。Agent 在生成方案前必须引用这里的条款。',
      '<button class="btn btn-ghost" data-action="open-kb-doc" data-id="KB-001">' + icon('book', 16) + '查看制度</button>' +
      '<button class="btn btn-primary" data-action="upload-kb">' + icon('upload', 16) + '上传文档</button>');
    html += '<div class="stat-strip">' +
      '<div class="stat-cell"><span>制度文档</span><strong>' + docs.length + '</strong><small>6 类运营制度</small></div>' +
      '<div class="stat-cell"><span>知识片段</span><strong>' + chunks + '</strong><small>按章节切分</small></div>' +
      '<div class="stat-cell"><span>检索方式</span><strong class="text-normal">向量 + 关键词</strong><small>64 维本地哈希向量（演示）</small></div>' +
      '<div class="stat-cell"><span>引用覆盖率</span><strong>100<em>%</em></strong><small>AI 方案均附条款引用</small></div>' +
      '</div>';
    html += '<div class="kb-layout"><aside class="card kb-docs">' + cardHead('文档库', '点击查看章节') +
      '<div class="doc-list">' + docs.map(function (d) {
        return '<button class="doc-item ' + (ui.kbDocId === d.id ? 'active' : '') + '" data-action="open-kb-doc" data-id="' + d.id + '">' +
          '<span class="doc-icon">' + icon('file', 17) + '</span><span><b>' + esc(d.title) + '</b><small>' + esc(d.category) + ' · ' + esc(d.version) + ' · ' + d.chunks.length + ' 段</small></span>' + icon('chevron', 13) + '</button>';
      }).join('') + '</div></aside>';
    html += '<section class="card kb-main"><div class="kb-search">' + icon('search', 18) +
      '<form id="kb-search-form"><input id="kb-search-input" value="' + esc(ui.kbQuery) + '" placeholder="检索制度，例如：单人间 分配 审批 / 夜班 间隔 / CT 冲突">' +
      '<button class="btn btn-primary btn-tiny" type="submit">检索</button></form></div>';
    if (ui.kbResults) {
      html += '<div class="search-result-head"><strong>检索结果</strong><span>' + ui.kbResults.length + ' 个相关片段 · 查询 “' + esc(ui.kbQuery) + '”</span></div>' +
        '<div class="rag-results">' + ui.kbResults.map(function (r) {
          return '<article class="rag-item"><div class="rag-meta"><span class="rag-score">' + Math.round(r.relevance * 100) + '% 相关</span><span class="rag-vector">向量 ' + Math.round((r.vectorScore || 0) * 100) + '%</span>' + chip(r.category, 'teal') +
            '<span class="muted">' + esc(r.title) + ' · ' + esc(r.heading) + '</span></div>' +
            '<p>' + esc(r.content) + '</p><div class="rag-foot"><span class="mono">' + esc(r.chunkId) + '</span>' +
            '<button class="btn btn-tiny" data-action="open-kb-doc" data-id="' + r.docId + '">查看原文</button></div></article>';
        }).join('') + '</div>';
    } else if (selected) {
      html += '<div class="doc-detail"><div class="doc-detail-head"><div><span class="eyebrow">' + esc(selected.category) + ' · ' + esc(selected.version) + '</span><h2>' + esc(selected.title) + '</h2>' +
        '<p>' + esc(selected.summary) + '</p></div><div class="doc-actions"><button class="btn btn-tiny" data-action="edit-kb" data-id="' + selected.id + '">' + icon('file', 14) + '编辑</button><button class="btn btn-tiny btn-danger-ghost" data-action="delete-kb" data-id="' + selected.id + '">' + icon('trash', 14) + '删除</button></div></div>' +
        '<div class="doc-meta-row"><span>' + icon('building', 14) + esc(selected.owner) + '</span><span>' + icon('clock', 14) + '更新于 ' + esc(selected.updatedAt) + '</span><span>' + icon('database', 14) + selected.chunks.length + ' 个片段</span></div>' +
        '<div class="chunk-list">' + selected.chunks.map(function (c) {
          return '<article class="chunk"><div class="chunk-head"><span class="mono">' + esc(c.id) + '</span><h4>' + esc(c.heading) + '</h4></div><p>' + esc(c.content) + '</p>' +
            '<div class="chunk-tags">' + (c.keywords || []).slice(0, 6).map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</div></article>';
        }).join('') + '</div></div>';
    } else {
      html += '<div class="kb-empty">' + icon('book', 34) + '<h3>把医院制度变成 Agent 的依据</h3><p>检索床位分配、预约、设备、排班和审计规则。每条 AI 建议都会附带引用的条款。</p>' +
        '<div class="kb-samples">' + ['床位分配 单人间 审批', 'CT 时间冲突 临床优先级', '夜班 间隔 11 小时', '预警 95% 处置'].map(function (q) {
          return '<button data-action="kb-sample" data-query="' + esc(q) + '">' + esc(q) + '</button>';
        }).join('') + '</div></div>';
    }
    html += '</section></div>';
    return html;
  }

  // ------------------------------ 系统管理 ------------------------------
  function renderSystem() {
    const u = user();
    if (u.role !== 'admin' && u.role !== 'ops') {
      return pageHead('SYSTEM', '系统管理', '权限受限') + '<div class="card">' + emptyState('lock', '当前角色无系统管理权限', '请使用系统管理员或运营主管账号') + '</div>';
    }
    const tab = ui.systemTab;
    let html = pageHead('SYSTEM', '系统管理', '账号、角色权限、审计日志与演示环境设置。',
      '<button class="btn btn-ghost" data-action="reset-demo">' + icon('refresh', 16) + '重置演示数据</button>');
    html += '<div class="system-health">' +
      '<div class="health-card"><span class="health-icon green">' + icon('activity', 18) + '</span><div><b>API 服务</b><small>本地演示 · 正常</small></div><em>ONLINE</em></div>' +
      '<div class="health-card"><span class="health-icon green">' + icon('database', 18) + '</span><div><b>业务数据</b><small>localStorage · 合成数据</small></div><em>DEMO</em></div>' +
      '<div class="health-card"><span class="health-icon green">' + icon('tool', 18) + '</span><div><b>MCP 工具</b><small>Bed / Exam / Appointment / Staff</small></div><em>4/4</em></div>' +
      '<div class="health-card"><span class="health-icon amber">' + icon('robot', 18) + '</span><div><b>模型服务</b><small>未接入在线 LLM</small></div><em>SIM</em></div></div>';
    html += '<div class="tabs"><button class="' + (tab === 'users' ? 'active' : '') + '" data-action="system-tab" data-tab="users">用户与角色</button>' +
      '<button class="' + (tab === 'roles' ? 'active' : '') + '" data-action="system-tab" data-tab="roles">权限矩阵</button>' +
      '<button class="' + (tab === 'audit' ? 'active' : '') + '" data-action="system-tab" data-tab="audit">审计日志</button>' +
      '<button class="' + (tab === 'about' ? 'active' : '') + '" data-action="system-tab" data-tab="about">关于演示</button></div>';
    if (tab === 'users') {
      html += '<section class="card">' + cardHead('用户账号', 'RBAC 角色 · 演示账号可直接切换', '<button class="btn btn-tiny btn-primary" data-action="new-user">' + icon('plus', 13) + '新增用户</button>') + '<div class="table-wrap"><table class="data-table"><thead><tr><th>用户</th><th>角色</th><th>部门</th><th>权限范围</th><th>最近登录</th><th>状态</th><th></th></tr></thead><tbody>' +
        S().users.map(function (x) {
          return '<tr><td><div class="person-cell">' + avatar(x.name, x.color, 32) + '<div><b>' + esc(x.name) + '</b><small>' + esc(x.id) + ' · ' + esc(x.phone) + '</small></div></div></td>' +
            '<td>' + chip(x.roleName, 'teal') + '</td><td>' + esc(x.dept) + '</td><td class="muted">' + esc(x.permissions) + '</td>' +
            '<td class="mono muted">' + esc(x.lastLogin) + '</td><td>' + statusChip(x.status) + '</td>' +
            '<td class="right">' + (x.id === u.id ? '<span class="muted small">当前账号</span>' : '<button class="btn btn-tiny" data-action="edit-user" data-id="' + x.id + '">编辑</button><button class="btn btn-tiny" data-action="toggle-user" data-id="' + x.id + '">' + (x.status === '启用' ? '停用' : '启用') + '</button><button class="btn btn-tiny" data-action="switch-user" data-user="' + x.id + '">切换</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    if (tab === 'roles') {
      html += '<section class="card">' + cardHead('RBAC 权限矩阵', '角色与可执行操作') +
        '<div class="table-wrap"><table class="data-table role-table"><thead><tr><th>角色</th><th>范围</th><th>权限项</th><th>审批权</th><th>数据范围</th></tr></thead><tbody>' +
        S().rolePermissions.map(function (r) {
          return '<tr><td><b>' + esc(r.role) + '</b><small class="block muted">' + esc(r.code) + '</small></td><td>' + esc(r.scope) + '</td>' +
            '<td><div class="tag-wrap">' + r.items.map(function (i) { return '<span>' + esc(i) + '</span>'; }).join('') + '</div></td>' +
            '<td>' + (r.code === 'ops' || r.code === 'admin' ? statusChip('已批准') : '<span class="muted">无</span>') + '</td>' +
            '<td class="muted">' + (r.code === 'admin' ? '全局' : (r.code === 'ops' ? '全院' : r.scope)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="permission-note">' + icon('shield', 15) + 'AI 服务账号不具备审批权；审批通过后才允许调用写工具。所有写操作二次校验资源状态。</div></section>';
    }
    if (tab === 'audit') {
      const q = ui.auditQuery.trim();
      const logs = S().audit.filter(function (l) { return !q || (l.actor + l.action + l.target + l.detail).indexOf(q) >= 0; });
      html += '<section class="card">' + cardHead('审计日志', '最近 ' + logs.length + ' 条 · 工具调用与审批全程留痕',
        '<div class="search-box">' + icon('search', 15) + '<input id="audit-query" data-filter="auditQuery" value="' + esc(ui.auditQuery) + '" placeholder="操作人 / 动作 / 对象"></div>') +
        '<div class="table-wrap"><table class="data-table audit-table"><thead><tr><th>时间</th><th>操作人</th><th>角色</th><th>动作</th><th>对象</th><th>详情</th><th>来源 IP</th></tr></thead><tbody>' +
        logs.slice(0, 24).map(function (l) {
          return '<tr><td class="mono muted">' + esc(l.at) + '</td><td><b>' + esc(l.actor) + '</b></td><td>' + esc(l.role) + '</td>' +
            '<td><span class="audit-action">' + esc(l.action) + '</span></td><td class="mono">' + esc(l.target) + '</td><td class="ellipsis">' + esc(l.detail) + '</td><td class="mono muted">' + esc(l.ip) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    if (tab === 'about') {
      html += '<div class="two-col"><section class="card">' + cardHead('演示边界', '诚实说明') +
        '<div class="about-list"><div><b>真实计算</b><p>床位匹配、冲突检测、RAG 检索、指标计算均为确定性代码；修改数据会改变结果。</p></div>' +
        '<div><b>模拟部分</b><p>在线 LLM 未接入，自然语言由规则模板组织；数据库用 localStorage 代替；MCP 工具为本地适配器。</p></div>' +
        '<div><b>不会发生</b><p>AI 不直接改数据库；不自动做临床决策；不自动跨科室分配；不执行未经审批的写操作。</p></div>' +
        '<div><b>生产落地</b><p>替换为 FastAPI + PostgreSQL + LangGraph + 独立 MCP Server，并把审批、审计和版本校验保留。</p></div></div></section>' +
        '<section class="card">' + cardHead('版本信息', 'MedFlow AI') + '<div class="version-table">' +
        '<div><span>产品版本</span><b>V1.0 Demo</b></div><div><span>业务日期</span><b>' + TODAY + '</b></div>' +
        '<div><span>数据规模</span><b>96 床位 · 122 患者 · 100 预约 · 309 检查</b></div>' +
        '<div><span>规则文档</span><b>6 份 · 21 个片段</b></div>' +
        '<div><span>本地存储</span><b>medflow-ai-demo-v1</b></div></div>' +
        '<button class="btn btn-danger-ghost btn-block" data-action="reset-demo">' + icon('refresh', 15) + '恢复初始演示数据</button></section></div>';
    }
    return html;
  }

  // ------------------------------ 审批中心 ------------------------------
  function planIcon(kind) { return kind === 'bed' ? 'bed' : (kind === 'equipment' ? 'monitor' : 'staff'); }
  function planKindName(kind) { return kind === 'bed' ? '床位调度' : (kind === 'equipment' ? '检查调度' : '排班调整'); }

  function renderApprovals() {
    const all = S().plans;
    const pending = all.filter(function (p) { return p.status === '待审批'; });
    const success = all.filter(function (p) { return p.status === '执行成功'; });
    const failed = all.filter(function (p) { return p.status === '执行失败' || p.status === '已驳回'; });
    let list = filteredPlans();
    if (!ui.approvalId || !all.some(function (p) { return p.id === ui.approvalId; })) {
      ui.approvalId = list.length ? list[0].id : null;
    }
    const selected = all.find(function (p) { return p.id === ui.approvalId; });
    let html = pageHead('HUMAN APPROVAL', '审批中心', 'AI 工作流在这里暂停。批准、驳回与执行结果全程留痕。',
      '<button class="btn btn-ghost" data-action="open-plan" data-id="' + (pending[0] ? pending[0].id : '') + '" ' + (pending.length ? '' : 'disabled') + '>' + icon('approval', 16) + '打开待审批</button>');
    html += '<div class="approval-summary">' +
      '<div><span>待审批</span><strong>' + pending.length + '</strong><small>等待人工决策</small></div>' +
      '<div><span>执行成功</span><strong class="teal">' + success.length + '</strong><small>业务状态已变更</small></div>' +
      '<div><span>驳回 / 失败</span><strong class="danger">' + failed.length + '</strong><small>未执行业务变更</small></div>' +
      '<div class="approval-note">' + icon('shield', 17) + '<p>审批通过后，执行服务会再次校验资源状态与版本。<b>复核失败则整单回滚</b>。</p></div></div>';
    html += '<div class="approval-layout"><aside class="card approval-list-card"><div class="tabs small-tabs">' +
      '<button class="' + (ui.approvalTab === 'pending' ? 'active' : '') + '" data-action="approval-tab" data-tab="pending">待审批 <em>' + pending.length + '</em></button>' +
      '<button class="' + (ui.approvalTab === 'processed' ? 'active' : '') + '" data-action="approval-tab" data-tab="processed">已处理</button>' +
      '<button class="' + (ui.approvalTab === 'all' ? 'active' : '') + '" data-action="approval-tab" data-tab="all">全部</button></div>' +
      '<div class="approval-list">' + (list.length ? list.map(function (p) {
        return '<button class="approval-item ' + (p.id === ui.approvalId ? 'active' : '') + '" data-action="select-approval" data-id="' + p.id + '">' +
          '<span class="approval-item-icon kind-' + p.kind + '">' + icon(planIcon(p.kind), 18) + '</span>' +
          '<span class="approval-item-main"><b>' + esc(p.title) + '</b><small>' + esc(p.id) + ' · ' + esc(p.createdAt.slice(5)) + '</small>' +
          '<span class="approval-item-meta">' + chip(planKindName(p.kind), 'neutral') + statusChip(p.status) + '</span></span>' +
          icon('chevron', 14) + '</button>';
      }).join('') : emptyState('check', '暂无审批单', 'AI 生成方案后会出现在这里')) + '</div></aside>';
    html += '<section class="card approval-detail">' + (selected ? renderApprovalDetail(selected) : emptyState('approval', '选择一份审批单', '查看方案、校验结果与执行记录')) + '</section></div>';
    return html;
  }

  function liveEquipmentValidation(plan) {
    const errors = [];
    (plan.changes || []).forEach(function (c) {
      const exam = S().exams.find(function (e) { return e.id === c.examId; });
      if (!exam) { errors.push('检查记录不存在：' + c.examId); return; }
      if (exam.start !== c.expectedStart) errors.push(c.patientName + ' 的原检查时段已变化（快照 ' + c.expectedStart + ' / 当前 ' + exam.start + '）');
      if (exam.status === '已完成' || exam.status === '进行中') errors.push(c.patientName + ' 的检查已开始或完成');
      const ts = c.to.split('-')[0], te = c.to.split('-')[1];
      const conflict = S().exams.some(function (e) {
        return e.id !== exam.id && e.deviceId === exam.deviceId && e.date === exam.date && e.status !== '已取消' &&
          engine.minutes(e.start) < engine.minutes(te) && engine.minutes(e.end) > engine.minutes(ts);
      });
      if (conflict) errors.push(c.patientName + ' 的目标时段已被占用：' + c.to);
    });
    return { valid: errors.length === 0, errors: errors };
  }

  function liveStaffValidation(plan) {
    const v = engine.validateStaffPlan(S(), plan);
    return { valid: v.valid, errors: v.blockers || [], checks: v.checks || [] };
  }

  function livePlanValidation(plan) {
    if (plan.kind === 'bed') return engine.validateBedPlan(S(), plan);
    if (plan.kind === 'staff') return liveStaffValidation(plan);
    return liveEquipmentValidation(plan);
  }

  function renderApprovalDetail(plan) {
    const live = livePlanValidation(plan);
    const stored = plan.validation || {};
    const validation = plan.status === '待审批'
      ? Object.assign({}, stored, { valid: live.valid, blockers: live.blockers || live.errors || [], checks: live.checks || stored.checks || [] })
      : Object.assign({}, stored, { valid: stored.valid !== false });
    const checks = (validation && validation.checks) || [];
    const blockers = (validation && validation.blockers) || [];
    const canApprove = can('approval.decide');
    let html = '<div class="approval-detail-head"><div><div class="approval-title-line"><span class="approval-kind-icon kind-' + plan.kind + '">' + icon(planIcon(plan.kind), 19) + '</span>' +
      '<div><span class="eyebrow">' + esc(plan.id) + ' · V' + (plan.version || 1) + '</span><h2>' + esc(plan.title) + '</h2></div></div>' +
      '<p class="approval-summary-text">' + esc(plan.summary) + '</p></div><div class="approval-status-block">' + statusChip(plan.status) +
      '<small>' + (plan.status === '待审批' ? 'LangGraph interrupt' : (plan.execution ? plan.execution.at : plan.approval ? plan.approval.at : '')) + '</small></div></div>';
    html += '<div class="approval-meta">' +
      '<div><span>发起人</span><b>' + esc(plan.createdByName || 'AI 调度中心') + '</b></div>' +
      '<div><span>方案范围</span><b>' + esc(plan.scope) + '</b></div>' +
      '<div><span>创建时间</span><b>' + esc(plan.createdAt) + '</b></div>' +
      '<div><span>工作流</span><b class="mono">' + esc(plan.workflowId || '—') + '</b></div></div>';
    if (plan.kind === 'bed') {
      const matched = plan.matched || [];
      html += '<div class="approval-section-title"><h3>分配方案</h3><span>' + matched.length + ' 条匹配 · ' + (plan.unmatched || []).length + ' 位未匹配</span></div>';
      if (matched.length) {
        html += '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>患者</th><th>科室</th><th>需求</th><th>建议床位</th><th>匹配依据</th><th>评分</th></tr></thead><tbody>' +
          matched.map(function (m) {
            return '<tr><td><b>' + esc(m.patientName) + '</b><small class="block muted">' + esc(m.gender) + ' · ' + m.age + ' 岁</small></td>' +
              '<td>' + esc(m.deptName) + '</td><td><span class="bed-type-tag">' + esc(m.bedType) + '</span></td>' +
              '<td><b>' + esc(m.bedCode) + '</b><small class="block muted">' + esc(m.wardName) + ' · ' + esc(m.actualType) + '</small></td>' +
              '<td class="muted small">' + esc(m.reasons.join(' / ')) + '</td><td><span class="score-pill">' + m.score + '</span></td></tr>';
          }).join('') + '</tbody></table></div>';
      } else {
        html += '<div class="notice">' + icon('info', 15) + '该方案无床位明细，仅保留历史执行记录。</div>';
      }
      if ((plan.unmatched || []).length) {
        html += '<div class="unmatched-list">' + plan.unmatched.map(function (u) {
          return '<div class="unmatched-item"><div><b>' + esc(u.patientName) + '</b><small>' + esc(u.deptName) + ' · ' + esc(u.bedType) + ' · ' + esc(u.gender) + ' / ' + u.age + ' 岁</small></div>' +
            '<p>' + esc(u.reason) + '</p>' + (u.alternatives && u.alternatives.length ? '<div class="alt-resource">' + icon('clock', 13) + '候补：' + u.alternatives.map(function (a) { return esc(a.bedCode) + '（' + esc(a.reason) + '）'; }).join('；') + '</div>' : '') + '</div>';
        }).join('') + '</div>';
      }
    }
    if (plan.kind === 'equipment') {
      html += '<div class="approval-section-title"><h3>检查时段调整</h3><span>' + (plan.changes || []).length + ' 条变更</span></div>' +
        '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>患者</th><th>设备</th><th>检查项目</th><th>原时段</th><th>目标时段</th><th>原因</th></tr></thead><tbody>' +
        (plan.changes || []).map(function (c) {
          return '<tr><td><b>' + esc(c.patientName) + '</b></td><td>' + esc(c.deviceName || c.deviceId) + '</td><td>' + esc(c.examItem) + '</td>' +
            '<td class="mono muted"><s>' + esc(c.from) + '</s></td><td class="mono"><b>' + esc(c.to) + '</b></td><td class="muted small">' + esc(c.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (plan.kind === 'staff') {
      html += '<div class="approval-section-title"><h3>排班调整</h3><span>' + (plan.changes || []).length + ' 条变更</span></div>' +
        '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>人员</th><th>科室</th><th>日期</th><th>原班次</th><th>建议班次</th><th>依据</th></tr></thead><tbody>' +
        (plan.changes || []).map(function (c) {
          return '<tr><td><b>' + esc(c.staffName) + '</b></td><td>' + esc(c.deptName) + '</td><td class="mono">' + esc(c.date) + '</td>' +
            '<td><span class="shift shift-' + ({ '早': 'am', '中': 'pm', '夜': 'night', '白': 'day', '休': 'off' }[c.fromShift] || 'off') + '">' + esc(c.fromShift) + '</span></td>' +
            '<td><span class="shift shift-' + ({ '早': 'am', '中': 'pm', '夜': 'night', '白': 'day', '休': 'off' }[c.toShift] || 'off') + '">' + esc(c.toShift) + '</span></td>' +
            '<td class="muted small">' + esc(c.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '<div class="approval-section-title"><h3>执行前复核</h3><span class="' + (validation.valid ? 'text-teal' : 'text-danger') + '">' + (validation.valid ? '全部通过' : blockers.length + ' 项阻断') + '</span></div>';
    if (blockers.length) {
      html += '<div class="validation-blocker">' + icon('alert', 16) + '<div><b>实时复核未通过，批准将触发整单回滚</b><ul>' + blockers.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div></div>';
    }
    html += '<div class="checks-grid">' + checks.map(function (c) {
      return '<div class="check-item ' + (c.pass ? 'pass' : 'fail') + '"><span>' + icon(c.pass ? 'check' : 'close', 14) + '</span><div><b>' + esc(c.name) + '</b><small>' + esc(c.detail) + '</small></div></div>';
    }).join('') + '</div>';
    html += '<div class="approval-section-title"><h3>规则依据</h3><span>RAG 检索</span></div><div class="citation-list">' +
      (plan.citations || []).map(function (c) {
        return '<div class="citation"><span class="citation-icon">' + icon('book', 15) + '</span><div><b>' + esc(c.title) + '</b><small>' + esc(c.heading) + ' · ' + esc(c.chunkId) + '</small></div>' + icon('external', 13) + '</div>';
      }).join('') + '</div>';
    if (plan.status === '待审批') {
      html += '<div class="approval-decision"><div class="approval-decision-head">' + icon('shield', 17) + '<div><b>人工审批</b><small>审批人：运营主管 / 系统管理员 · 审批后会再次校验并执行</small></div></div>';
      if (canApprove) {
        html += '<label class="field-label">审批意见<textarea id="approval-comment" rows="3" placeholder="同意/驳回理由（驳回至少 2 个字）"></textarea></label>' +
          '<div class="approval-actions"><button class="btn btn-danger-ghost" data-action="reject-plan">' + icon('close', 15) + '驳回，不执行</button>' +
          '<button class="btn btn-primary" data-action="approve-plan">' + icon('check', 15) + '批准并执行</button></div>' +
          '<div class="decision-hint">' + icon('info', 13) + '执行前会再次校验实时状态；审批期间资源变化将导致整单回滚。</div>';
      } else {
        html += '<div class="no-permission">' + icon('lock', 16) + '<div><b>当前角色无审批权限</b><small>床位与检查方案需由医院运营主管或系统管理员审批。你可以查看方案，但不能改变业务状态。</small></div></div>';
      }
      html += '</div>';
    } else {
      html += '<div class="execution-result ' + (plan.status === '执行成功' ? 'success' : (plan.status === '已驳回' ? 'muted' : 'danger')) + '">' +
        '<div class="execution-head">' + icon(plan.status === '执行成功' ? 'check' : (plan.status === '已驳回' ? 'info' : 'alert'), 18) +
        '<div><b>' + (plan.status === '执行成功' ? '执行成功' : (plan.status === '已驳回' ? '已驳回，未执行' : '执行失败，已回滚')) + '</b>' +
        '<small>' + esc(plan.execution ? plan.execution.at : (plan.approval ? plan.approval.at : '')) + '</small></div></div>' +
        (plan.execution && plan.execution.detail ? '<p>' + esc(plan.execution.detail) + '</p>' : '') +
        (plan.execution && plan.execution.errors ? '<ul>' + plan.execution.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : '') +
        (plan.approval ? '<div class="approval-sign">审批人：<b>' + esc(plan.approval.by) + '</b>（' + esc(plan.approval.role) + '） · ' + esc(plan.approval.comment) + '</div>' : '') + '</div>';
      if (plan.status === '待审批') {
        html += '<div class="notice">等待审批</div>';
      }
    }
    html += '<div class="approval-footer-actions"><button class="btn btn-ghost btn-tiny" data-action="export-plan" data-id="' + plan.id + '">' + icon('download', 14) + '导出方案 CSV</button>' +
      '<span class="muted small">方案版本 V' + (plan.version || 1) + ' · 每次决策都会写入审计日志</span></div>';
    return html;
  }

  // ------------------------------ AI 调度中心 ------------------------------
  const QUICK_PROMPTS = [
    { icon: 'bed', title: '今日床位分配', prompt: '帮我制定今天骨科的床位分配方案', desc: '查询床位与申请，生成方案并等待审批' },
    { icon: 'alert', title: '未来床位风险', prompt: '找出未来三天可能出现床位紧张的科室', desc: '基于预出院与待入院预测' },
    { icon: 'monitor', title: 'CT 冲突检查', prompt: '检查明天 CT 设备是否存在预约冲突', desc: '识别重叠并给出调整建议' },
    { icon: 'chart', title: '本周运营分析', prompt: '分析本周各科室的资源使用情况', desc: '预约、床位、设备、人员综合报告' }
  ];

  function renderDispatch() {
    const wf = ui.workflow;
    if (wf) return renderWorkflowView(wf);
    const k = engine.getKpis(S());
    const tasks = S().tasks.slice(0, 6);
    let html = pageHead('AGENT ORCHESTRATION', 'AI 调度中心', '用一句自然语言发起运营任务。Agent 查询、分析、规划、校验，关键动作交给你审批。',
      '<button class="btn btn-ghost" data-action="open-approval-from-workflow" disabled>' + icon('approval', 16) + '审批中心</button>');
    html += '<section class="dispatch-hero"><div class="dispatch-hero-copy"><span class="ai-chip">' + icon('sparkles', 14) + 'MedFlow Agent</span>' +
      '<h2>把今天的运营问题<br>交给一支 Agent 团队。</h2>' +
      '<p>Coordinator 理解任务，Data Agent 查询数据，Knowledge Agent 检索制度，Scheduling Agent 生成方案，Validator 检查冲突。所有写操作等待人工审批。</p>' +
      '<div class="hero-capabilities"><span><i></i>LangGraph 多节点</span><span><i></i>4 个 MCP 工具</span><span><i></i>RAG 规则引用</span><span><i></i>interrupt 审批</span></div></div>' +
      '<div class="dispatch-snapshot"><div class="snapshot-head"><span>实时运营快照</span><b>' + esc(now().slice(11)) + '</b></div>' +
      '<div class="snapshot-grid"><div><span>可用床位</span><strong>' + k.free + '</strong><small>张</small></div>' +
      '<div><span>待入院</span><strong>' + k.pendingAdmissions + '</strong><small>人</small></div>' +
      '<div><span>待审批</span><strong>' + k.pendingApprovals + '</strong><small>项</small></div>' +
      '<div><span>高预警</span><strong class="' + (k.highAlerts ? 'danger' : '') + '">' + k.highAlerts + '</strong><small>条</small></div></div>' +
      '<div class="snapshot-chart">' + sparkline(S().dailyStats.occupancy, '#2dd4bf') + '<span>床位使用率 7 日趋势</span></div></div></section>';
    html += '<section class="composer-card"><div class="composer-top"><span class="composer-avatar">' + icon('sparkles', 18) + '</span>' +
      '<textarea id="dispatch-input" rows="2" placeholder="例如：帮我制定今天骨科的床位分配方案。按回车换行，⌘/Ctrl + Enter 发送。">' + esc(ui.dispatchInput) + '</textarea></div>' +
      '<div class="composer-bottom"><div class="composer-hints"><span>' + icon('shield', 13) + 'AI 不直接修改数据库</span><span>' + icon('book', 13) + '引用制度条款</span><span>' + icon('approval', 13) + '写操作需审批</span></div>' +
      '<button class="btn btn-primary" data-action="run-task">' + icon('send', 15) + '运行工作流</button></div></section>';
    html += '<div class="quick-grid">' + QUICK_PROMPTS.map(function (q) {
      return '<button class="quick-card" data-action="quick-prompt" data-prompt="' + esc(q.prompt) + '"><span class="quick-icon">' + icon(q.icon, 19) + '</span>' +
        '<span><b>' + esc(q.title) + '</b><small>' + esc(q.desc) + '</small></span>' + icon('arrow', 15) + '</button>';
    }).join('') + '</div>';
    html += '<div class="dispatch-lower"><section class="card">' + cardHead('最近工作流', '任务、审批与执行记录', '<span class="muted small">共 ' + S().tasks.length + ' 条</span>') +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>任务</th><th>类型</th><th>状态</th><th>创建时间</th><th>执行结果</th><th></th></tr></thead><tbody>' +
      tasks.map(function (t) {
        return '<tr><td><div class="cell-main">' + esc(t.prompt) + '<small>' + esc(t.id) + ' · ' + esc(t.actor) + '</small></div></td>' +
          '<td>' + chip(t.intentLabel, 'neutral') + '</td><td>' + statusChip(t.status === 'awaiting_approval' ? '待审批' : (t.status === 'completed' ? '执行成功' : (t.status === 'rejected' ? '已驳回' : '执行失败'))) + '</td>' +
          '<td class="mono muted">' + esc(t.createdAt.slice(5)) + '</td><td class="muted small ellipsis">' + esc(t.summary || '—') + '</td>' +
          '<td class="right">' + (t.planId ? '<button class="btn btn-tiny" data-action="open-plan" data-id="' + t.planId + '">查看方案</button>' : '<button class="btn btn-tiny" data-action="replay-task" data-prompt="' + esc(t.prompt) + '">再运行</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    html += '<aside class="card dispatch-cap-card">' + cardHead('Agent 能力边界', '设计约束') + '<div class="cap-list">' +
      '<div><span class="cap-num">01</span><b>只读查询</b><p>Agent 通过 MCP 读取床位、预约、设备和人员快照，不直接连数据库。</p></div>' +
      '<div><span class="cap-num">02</span><b>行政规则</b><p>按申请时间、类型、性别、隔离要求匹配；不判断临床优先级。</p></div>' +
      '<div><span class="cap-num">03</span><b>人工审批</b><p>LangGraph 在写操作前 interrupt，审批通过才调用业务写工具。</p></div>' +
      '<div><span class="cap-num">04</span><b>执行复核</b><p>执行前再次检查资源状态与版本，失败则整单回滚。</p></div></div></aside></div>';
    return html;
  }

  function workflowStages(intent) {
    if (intent === 'bed_schedule' || intent === 'equipment_conflict' || intent === 'staff_schedule') return ['理解任务', '查询数据', '检索规则', '生成方案', '规则校验', '人工审批', '执行完成'];
    if (intent === 'general') return ['理解任务', '能力建议'];
    return ['理解任务', '查询数据', '检索规则', '分析', '生成结论'];
  }

  function renderWorkflowView(wf) {
    const plan = wf.planId ? store.getPlan(wf.planId) : null;
    if (plan && plan.status === '执行成功' && wf.status === 'awaiting_approval') wf.status = 'completed';
    const stages = workflowStages(wf.intent.intent);
    const stageIndex = wf.status === 'completed' ? stages.length - 1 : Math.min(wf.stage, stages.length - 2);
    const running = wf.status === 'running';
    let html = '<div class="workflow-top"><div><button class="btn btn-tiny btn-ghost" data-action="new-workflow">' + icon('arrow', 14) + '新建任务</button>' +
      '<span class="workflow-id">' + esc(wf.id) + '</span>' +
      '<span class="workflow-mode">' + icon('robot', 13) + '演示模式 · 规则引擎</span></div><div class="workflow-status">' +
      (wf.status === 'running' ? '<span class="live-dot"></span>执行中' : (wf.status === 'awaiting_approval' ? '已暂停 · 等待审批' : '已完成')) + '</div></div>';
    html += '<div class="stage-stepper">' + stages.map(function (s, i) {
      const st = i < stageIndex ? 'done' : (i === stageIndex ? (wf.status === 'completed' ? 'done' : 'active') : 'pending');
      return '<div class="stage ' + st + '"><span class="stage-dot">' + (st === 'done' ? icon('check', 11) : (st === 'active' ? '<i></i>' : i + 1)) + '</span><b>' + esc(s) + '</b></div>';
    }).join('') + '</div>';
    html += '<div class="workflow-grid"><div class="workflow-main">' +
      '<div class="user-message"><span class="user-avatar">' + avatar(user().name, user().color, 30) + '</span><div><span>你 · ' + esc(now().slice(11)) + '</span><p>' + esc(wf.prompt) + '</p></div></div>' +
      '<div class="agent-intro"><span class="agent-avatar">' + icon('sparkles', 17) + '</span><div><b>MedFlow Coordinator</b><p>' + esc(wf.intro || '已理解任务，正在协调 Agent 执行。') + '</p></div></div>';
    html += '<div class="agent-trace">' + wf.steps.map(function (step, i) {
      const st = step.status || 'pending';
      return '<div class="trace-step ' + st + '"><div class="trace-rail"><span class="trace-dot">' + (st === 'done' ? icon('check', 11) : (st === 'running' ? '<i></i>' : (i + 1))) + '</span></div>' +
        '<div class="trace-body"><div class="trace-head"><span class="trace-agent">' + icon(step.icon || 'route', 14) + esc(step.agent) + '</span>' +
        '<span class="trace-role">' + esc(step.role) + '</span>' + (step.duration ? '<span class="trace-time">' + step.duration + ' ms</span>' : '') + '</div>' +
        '<h4>' + esc(step.title) + '</h4><p>' + esc(step.detail) + '</p>' +
        (step.tool ? '<div class="tool-call"><span class="tool-server">' + esc(step.tool.server) + '</span><code>' + esc(step.tool.name) + '</code>' +
          (step.tool.result ? '<span class="tool-result">→ ' + esc(step.tool.result) + '</span>' : '') + '</div>' : '') +
        '</div></div>';
    }).join('') + '</div>';
    if (running) {
      html += '<div class="thinking"><span></span><span></span><span></span><em>' + esc(wf.thinking || 'Agent 正在处理…') + '</em><button class="btn btn-tiny" data-action="skip-workflow">加速</button></div>';
    } else {
      html += renderWorkflowResult(wf, plan);
    }
    html += '</div><aside class="workflow-rail">';
    html += '<section class="rail-card"><div class="rail-title">' + icon('database', 14) + '资源快照</div>' + renderWorkflowSnapshot(wf) + '</section>';
    html += '<section class="rail-card"><div class="rail-title">' + icon('tool', 14) + '工具调用 <span>' + wf.steps.filter(function (s) { return s.tool; }).length + '</span></div>' +
      (wf.steps.some(function (s) { return s.tool; }) ? wf.steps.filter(function (s) { return s.tool; }).map(function (s) {
        return '<div class="rail-tool"><span>' + esc(s.tool.server) + '</span><code>' + esc(s.tool.name) + '</code>' +
          (s.tool.result ? '<small>' + esc(s.tool.result) + '</small>' : '<small class="muted">等待执行</small>') + '</div>';
      }).join('') : '<div class="rail-empty">任务暂未调用工具</div>') + '</section>';
    html += '<section class="rail-card"><div class="rail-title">' + icon('book', 14) + '制度依据 <span>' + (wf.citations || []).length + '</span></div>' +
      ((wf.citations || []).length ? wf.citations.map(function (c) {
        return '<button class="rail-citation" data-action="open-kb-doc" data-id="' + c.docId + '"><b>' + esc(c.title) + '</b><small>' + esc(c.heading) + ' · ' + esc(c.chunkId) + '</small></button>';
      }).join('') : '<div class="rail-empty">检索尚未完成</div>') + '</section>';
    html += '<section class="rail-card rail-safety"><div class="rail-title">' + icon('shield', 14) + '安全边界</div><p>AI 不直连数据库；写操作经 MCP 服务执行；审批后再次校验资源状态。</p></section>';
    html += '</aside></div>';
    return html;
  }

  function renderWorkflowSnapshot(wf) {
    const k = engine.getKpis(S());
    const rows = [
      { label: '可用床位', value: k.free + ' 张' },
      { label: '待入院', value: k.pendingAdmissions + ' 人' },
      { label: '床位使用率', value: k.occupancy + '%' },
      { label: '待审批', value: k.pendingApprovals + ' 项' }
    ];
    return '<div class="rail-snapshot">' + rows.map(function (r) { return '<div><span>' + esc(r.label) + '</span><b>' + esc(r.value) + '</b></div>'; }).join('') + '</div>';
  }

  function renderWorkflowResult(wf, plan) {
    if (wf.status === 'failed') {
      return '<div class="result-error">' + icon('alert', 20) + '<div><b>工作流执行失败</b><p>' + esc(wf.error || '未完成本次任务，请重试。') + '</p></div></div>';
    }
    if (plan) return renderPlanWorkflowResult(wf, plan);
    if (wf.result) {
      const r = wf.result;
      if (r.kind === 'bed_analysis') return renderBedAnalysisResult(r);
      if (r.kind === 'bed_forecast') return renderForecastResult(r);
      if (r.kind === 'appointment_analysis') return renderAppointmentResult(r);
      if (r.kind === 'staff_analysis') return renderStaffResult(r);
      if (r.kind === 'ops_report') return renderOpsResult(r);
      if (r.kind === 'general') return renderGeneralResult(r);
    }
    return '';
  }

  function approvalInlineCard(plan) {
    const live = livePlanValidation(plan);
    if (plan.status === '待审批') {
      return '<div class="workflow-approval-card"><div class="wa-head">' + icon('approval', 20) + '<div><b>LangGraph interrupt · 等待人工审批</b><p>方案已写入审批中心，批准前不会修改任何业务状态。</p></div><span class="wa-badge">待审批</span></div>' +
        '<div class="wa-meta"><span>审批单 <b>' + esc(plan.id) + '</b></span><span>方案版本 <b>V' + (plan.version || 1) + '</b></span><span>实时复核 <b class="' + (live.valid ? 'text-teal' : 'text-danger') + '">' + (live.valid ? '全部通过' : '发现冲突') + '</b></span></div>' +
        '<div class="wa-actions"><button class="btn btn-primary" data-action="open-approval-from-workflow">' + icon('approval', 15) + '前往审批中心</button>' +
        '<button class="btn btn-ghost btn-tiny" data-action="export-plan" data-id="' + plan.id + '">' + icon('download', 14) + '导出方案</button></div></div>';
    }
    if (plan.status === '执行成功') {
      return '<div class="workflow-approval-card success"><div class="wa-head">' + icon('check', 20) + '<div><b>审批通过 · 业务 MCP 执行成功</b><p>' + esc(plan.execution ? plan.execution.detail : '') + '</p></div><span class="wa-badge success">执行成功</span></div>' +
        '<div class="wa-meta"><span>审批人 <b>' + esc(plan.approval ? plan.approval.by : '—') + '</b></span><span>执行时间 <b>' + esc(plan.execution ? plan.execution.at : '—') + '</b></span><span>变更 <b>' + (plan.execution ? plan.execution.count : 0) + ' 条</b></span></div></div>';
    }
    if (plan.status === '已驳回') {
      return '<div class="workflow-approval-card rejected"><div class="wa-head">' + icon('close', 20) + '<div><b>审批已驳回</b><p>业务数据未发生变更。' + esc(plan.approval ? plan.approval.comment : '') + '</p></div><span class="wa-badge rejected">已驳回</span></div></div>';
    }
    return '<div class="workflow-approval-card rejected"><div class="wa-head">' + icon('alert', 20) + '<div><b>执行失败 · 整单回滚</b><p>' + esc(plan.execution && plan.execution.errors ? plan.execution.errors.join('；') : '执行前复核未通过') + '</p></div><span class="wa-badge rejected">0 条变更</span></div></div>';
  }

  function renderPlanWorkflowResult(wf, plan) {
    if (plan.kind === 'staff') {
      let html = '<div class="workflow-result-head"><div><span class="eyebrow">STAFF SCHEDULING PLAN</span><h3>' + esc(plan.title) + '</h3><p>' + esc(plan.summary) + '</p></div>' + statusChip(plan.status) + '</div>';
      html += '<div class="result-kpis"><div><span>排班冲突</span><b class="text-danger">' + plan.conflicts.length + '</b></div><div><span>调整建议</span><b>' + plan.changes.length + '</b></div><div><span>受影响人员</span><b>' + new Set(plan.changes.map(function (c) { return c.staffId; })).size + '</b></div><div><span>发布状态</span><b>' + (plan.status === '执行成功' ? '已发布' : '待审批') + '</b></div></div>';
      html += '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>人员</th><th>科室</th><th>日期</th><th>原班次</th><th>建议班次</th><th>依据</th></tr></thead><tbody>' +
        plan.changes.map(function (c) {
          return '<tr><td><b>' + esc(c.staffName) + '</b></td><td>' + esc(c.deptName) + '</td><td class="mono">' + esc(c.date) + '</td>' +
            '<td><span class="shift shift-' + ({ '早': 'am', '中': 'pm', '夜': 'night', '白': 'day', '休': 'off' }[c.fromShift] || 'off') + '">' + esc(c.fromShift) + '</span></td>' +
            '<td><span class="shift shift-' + ({ '早': 'am', '中': 'pm', '夜': 'night', '白': 'day', '休': 'off' }[c.toShift] || 'off') + '">' + esc(c.toShift) + '</span></td>' +
            '<td class="muted small">' + esc(c.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      html += approvalInlineCard(plan);
      return html;
    }
    if (plan.kind === 'equipment') {
      let html = '<div class="workflow-result-head"><div><span class="eyebrow">EQUIPMENT PLAN</span><h3>' + esc(plan.title) + '</h3><p>' + esc(plan.summary) + '</p></div>' + statusChip(plan.status) + '</div>';
      html += '<div class="result-kpis"><div><span>冲突组</span><b>' + (plan.conflicts ? plan.conflicts.length : 1) + '</b></div><div><span>调整建议</span><b>' + plan.changes.length + '</b></div><div><span>影响患者</span><b>' + plan.changes.length + '</b></div><div><span>临床优先级</span><b class="text-teal">未改变</b></div></div>';
      html += '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>患者</th><th>设备</th><th>原时段</th><th>目标时段</th><th>依据</th></tr></thead><tbody>' +
        plan.changes.map(function (c) {
          return '<tr><td><b>' + esc(c.patientName) + '</b><small class="block muted">' + esc(c.examItem) + '</small></td><td>' + esc(c.deviceName || c.deviceId) + '</td>' +
            '<td class="mono muted"><s>' + esc(c.from) + '</s></td><td class="mono"><b>' + esc(c.to) + '</b></td><td class="muted small">' + esc(c.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      html += approvalInlineCard(plan);
      return html;
    }
    let html = '<div class="workflow-result-head"><div><span class="eyebrow">BED SCHEDULING PLAN</span><h3>' + esc(plan.title) + '</h3><p>' + esc(plan.summary) + '</p></div>' + statusChip(plan.status) + '</div>';
    html += '<div class="result-kpis"><div><span>待分配</span><b>' + plan.snapshot.pending + '</b></div><div><span>已匹配</span><b class="text-teal">' + plan.matched.length + '</b></div><div><span>未匹配</span><b class="' + (plan.unmatched.length ? 'text-danger' : '') + '">' + plan.unmatched.length + '</b></div><div><span>冲突</span><b class="text-teal">' + (plan.validation.blockers.length || 0) + '</b></div></div>';
    html += '<div class="plan-table-wrap"><table class="data-table plan-table"><thead><tr><th>患者</th><th>需求</th><th>建议床位</th><th>匹配分</th><th>匹配依据</th></tr></thead><tbody>' +
      plan.matched.map(function (m) {
        return '<tr><td><b>' + esc(m.patientName) + '</b><small class="block muted">' + esc(m.gender) + ' · ' + m.age + ' 岁 · ' + esc(m.deptName) + '</small></td>' +
          '<td><span class="bed-type-tag">' + esc(m.bedType) + '</span></td>' +
          '<td><b>' + esc(m.bedCode) + '</b><small class="block muted">' + esc(m.wardName) + '</small></td>' +
          '<td><span class="score-pill">' + m.score + '</span></td><td class="muted small">' + esc(m.reasons.slice(0, 3).join(' / ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (plan.unmatched.length) {
      html += '<div class="unmatched-list">' + plan.unmatched.map(function (u) {
        return '<div class="unmatched-item"><div><b>' + esc(u.patientName) + '</b><small>' + esc(u.deptName) + ' · ' + esc(u.bedType) + ' · ' + esc(u.gender) + '</small></div><p>' + esc(u.reason) + '</p>' +
          (u.alternatives && u.alternatives.length ? '<div class="alt-resource">' + icon('clock', 13) + u.alternatives.map(function (a) { return esc(a.bedCode) + ' ' + esc(a.reason); }).join('；') + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    html += '<div class="validation-strip">' + icon('shield', 15) + '<b>Validator Agent</b><span>' + plan.validation.checks.map(function (c) { return c.name + (c.pass ? ' ✓' : ' ✕'); }).join(' · ') + '</span></div>';
    html += approvalInlineCard(plan);
    return html;
  }

  function renderBedAnalysisResult(r) {
    const k = r.kpis;
    let html = '<div class="workflow-result-head"><div><span class="eyebrow">BED ANALYSIS</span><h3>' + esc(r.title) + '</h3><p>' + esc(r.summary) + '</p></div><span class="result-complete">' + icon('check', 13) + '分析完成</span></div>';
    html += '<div class="result-kpis"><div><span>可用床位</span><b>' + k.free + '</b></div><div><span>当前占用</span><b>' + k.occupied + '/' + k.totalBeds + '</b></div><div><span>使用率</span><b>' + k.occupancy + '%</b></div><div><span>待入院</span><b>' + k.pendingAdmissions + '</b></div></div>';
    html += '<div class="table-wrap compact"><table class="data-table"><thead><tr><th>病区</th><th>床位</th><th>已入住</th><th>空闲</th><th>使用率</th><th>状态</th></tr></thead><tbody>' +
      r.wards.map(function (w) {
        return '<tr><td><b>' + esc(w.name) + '</b></td><td>' + w.total + '</td><td>' + w.occupied + '</td><td>' + w.free + '</td><td>' + w.occupancy + '%</td><td>' + chip(w.status, w.status === '紧张' ? 'danger' : (w.status === '关注' ? 'warning' : 'success')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    html += '<div class="insight-list">' + r.insights.map(function (i) { return '<div class="insight">' + icon('sparkles', 14) + '<p>' + esc(i) + '</p></div>'; }).join('') + '</div>';
    return html;
  }

  function renderForecastResult(r) {
    let html = '<div class="workflow-result-head"><div><span class="eyebrow">CAPACITY FORECAST</span><h3>' + esc(r.title) + '</h3><p>' + esc(r.summary) + '</p></div><span class="result-complete">' + icon('chart', 13) + '预测完成</span></div>';
    html += '<div class="forecast-grid">' + r.rows.map(function (x) {
      return '<div class="forecast-card risk-' + (x.risk === '紧急' ? 'urgent' : (x.risk === '高' ? 'high' : (x.risk === '中' ? 'mid' : 'low'))) + '">' +
        '<div class="forecast-head"><b>' + esc(x.deptName) + '</b>' + levelChip(x.risk) + '</div>' +
        '<div class="forecast-value">' + x.projected + '<em>%</em></div>' + progress(x.projected, x.risk === '紧急' ? '#dc2626' : (x.risk === '高' ? '#d97706' : '#0f766e'), 5) +
        '<div class="forecast-meta"><span>当前 ' + x.occupied + '/' + x.total + '</span><span>待入 ' + x.pending + '</span><span>预出院 ' + x.discharges + '</span></div>' +
        '<p>' + esc(x.reason) + '</p></div>';
    }).join('') + '</div>';
    html += '<div class="insight-list"><div class="insight">' + icon('info', 14) + '<p>预测只使用已登记的待入院申请与预计出院日期，不推断尚未开单的临床需求。</p></div></div>';
    return html;
  }

  function renderAppointmentResult(r) {
    let html = '<div class="workflow-result-head"><div><span class="eyebrow">APPOINTMENT ANALYSIS</span><h3>' + esc(r.title) + '</h3><p>' + esc(r.summary) + '</p></div><span class="result-complete">' + icon('check', 13) + '分析完成</span></div>';
    html += '<div class="result-kpis"><div><span>预约总量</span><b>' + r.total + '</b></div><div><span>有效预约</span><b>' + r.valid + '</b></div><div><span>已到诊</span><b>' + r.visited + '</b></div><div><span>平均等待</span><b>' + r.avgWait + ' 分</b></div></div>';
    html += '<div class="analysis-bars">' + r.byDept.map(function (d) {
      return '<div class="analysis-bar"><span><b>' + esc(d.name) + '</b><small>' + d.total + ' 预约 · 取消 ' + d.canceled + '</small></span><div>' + progress(d.total / Math.max.apply(null, r.byDept.map(function (x) { return x.total; })) * 100, d.color, 6) + '</div></div>';
    }).join('') + '</div>';
    return html;
  }

  function renderStaffResult(r) {
    let html = '<div class="workflow-result-head"><div><span class="eyebrow">WORKFORCE ANALYSIS</span><h3>' + esc(r.title) + '</h3><p>' + esc(r.summary) + '</p></div><span class="result-complete">' + icon('check', 13) + '分析完成</span></div>';
    html += '<div class="result-kpis"><div><span>人员</span><b>' + r.total + '</b></div><div><span>今日在岗</span><b>' + r.onDuty + '</b></div><div><span>平均负载</span><b>' + r.avgLoad + '%</b></div><div><span>排班冲突</span><b class="text-danger">' + r.conflicts + '</b></div></div>';
    html += '<div class="conflict-list">' + r.staffConflicts.map(function (c) {
      return '<div class="staff-conflict"><div class="staff-conflict-head">' + levelChip(c.severity) + '<b>' + esc(c.type) + ' · ' + esc(c.staffName) + '</b></div><p>' + esc(c.detail) + '</p><small>' + esc(c.suggestion) + '</small></div>';
    }).join('') + '</div>';
    return html;
  }

  function renderOpsResult(r) {
    return '<div class="workflow-result-head"><div><span class="eyebrow">OPERATIONS REPORT</span><h3>' + esc(r.title) + '</h3><p>' + esc(r.range) + ' · ' + esc(r.generatedAt) + '</p></div><span class="result-complete">' + icon('check', 13) + '已生成</span></div>' + renderReport(r);
  }

  function renderGeneralResult(r) {
    return '<div class="workflow-result-head"><div><span class="eyebrow">CAPABILITIES</span><h3>我可以帮你处理这些运营任务</h3><p>请用一句自然语言描述目标，例如「制定今天骨科床位方案」。</p></div></div>' +
      '<div class="capability-result">' + QUICK_PROMPTS.map(function (q) {
        return '<button data-action="quick-prompt" data-prompt="' + esc(q.prompt) + '"><span>' + icon(q.icon, 18) + '</span><b>' + esc(q.title) + '</b><small>' + esc(q.desc) + '</small></button>';
      }).join('') + '</div>';
  }

  function buildBedAnalysis(intent) {
    const k = engine.getKpis(S());
    const dept = intent.department;
    const wards = S().wards.filter(function (w) { return !dept || w.dept === dept; }).map(function (w) {
      const beds = S().beds.filter(function (b) { return b.wardId === w.id; });
      const occupied = beds.filter(function (b) { return b.status === '已入住'; }).length;
      const free = beds.filter(function (b) { return b.status === '空闲'; }).length;
      const pending = S().admissions.filter(function (a) { return a.dept === w.dept && a.status === '待分配'; }).length;
      const occ = engine.pct(occupied, beds.length);
      return {
        id: w.id, name: w.name, total: beds.length, occupied: occupied, free: free, pending: pending,
        occupancy: occ,
        status: (free <= 1 || pending > free) ? '紧张' : (free <= 3 ? '关注' : '平稳')
      };
    });
    const scopeBeds = dept ? S().beds.filter(function (b) { return b.dept === dept; }) : S().beds;
    const scopePending = intent.department ? S().admissions.filter(function (a) { return a.dept === dept && a.status === '待分配'; }).length : k.pendingAdmissions;
    const cleaning = scopeBeds.filter(function (b) { return b.status === '待清洁'; });
    const scopeName = dept ? engine.DEPT_NAMES[dept] : '全院';
    const insights = [
      scopeName + '当前可用床位 ' + scopeBeds.filter(function (b) { return b.status === '空闲'; }).length + ' 张，待入院 ' + scopePending + ' 人，床位使用率 ' + engine.pct(scopeBeds.filter(function (b) { return b.status === '已入住'; }).length, scopeBeds.length) + '%。',
      cleaning.length ? ('待清洁床位 ' + cleaning.map(function (b) { return b.code; }).join('、') + ' 不参与分配；完成清洁后可释放。') : '当前无待清洁床位。',
      '今日预出院床位 ' + scopeBeds.filter(function (b) { return b.status === '已入住' && b.expectedDischarge === TODAY; }).length + ' 张，需出院和终末清洁后才能进入分配池。',
      '单人间、监护床、隔离间为刚性类型；AI 不会自动降级或跨科室占用。'
    ];
    return {
      kind: 'bed_analysis',
      title: scopeName + '床位运行分析',
      summary: '使用率、可用床位、待入院申请与类型缺口的结构化分析，数据来自 Bed MCP 实时快照。',
      kpis: k,
      wards: wards,
      insights: insights
    };
  }

  function buildForecastResult(intent) {
    const f = engine.forecastBeds(S(), 3);
    return {
      kind: 'bed_forecast',
      title: '未来三天床位压力预测',
      summary: f.summary + '。预测基于已登记的待入院申请与预计出院日期。',
      rows: f.rows,
      horizon: f.horizon,
      target: f.target
    };
  }

  function buildAppointmentResult() {
    const st = engine.appointmentStats(S(), TODAY);
    return {
      kind: 'appointment_analysis',
      title: '今日预约结构与效率分析',
      summary: '今日预约 ' + st.total + ' 人次，有效 ' + st.valid + ' 人次，取消率 ' + st.cancelRate + '%，平均等待 ' + st.avgWait + ' 分钟。',
      total: st.total, valid: st.valid, canceled: st.canceled, visited: st.visited,
      avgWait: st.avgWait, cancelRate: st.cancelRate, byDept: st.byDept, byStatus: st.byStatus
    };
  }

  function buildStaffResult() {
    const st = engine.getStaffStats(S());
    return {
      kind: 'staff_analysis',
      title: '本周医护排班与工作负载分析',
      summary: '全院 ' + st.total + ' 名医护人员，今日 ' + st.onDuty + ' 人在岗，发现 ' + st.conflicts + ' 条排班冲突。',
      total: st.total, onDuty: st.onDuty, avgLoad: st.avgLoad, conflicts: st.conflicts,
      byDept: st.byDept, staffConflicts: S().staffConflicts
    };
  }

  function ragQueryFor(intent) {
    if (intent.intent === 'bed_schedule') return '床位分配 单人间 清洁 审批 临床优先级 ' + (intent.departmentName || '全院');
    if (intent.intent === 'bed_analysis') return '床位使用率 可用床位 待清洁 出院 预警';
    if (intent.intent === 'bed_forecast') return '床位预警 85% 90% 95% 未来 48 小时';
    if (intent.intent === 'equipment_conflict') return '检查设备 时间冲突 临床优先级 审批 患者改期';
    if (intent.intent === 'appointment_analysis') return '预约 重复预约 号源 取消 候补';
    if (intent.intent === 'staff_analysis' || intent.intent === 'staff_schedule') return '排班 夜班 11 小时 工作负载 技能覆盖 审批';
    if (intent.intent === 'ops_report') return '运营分析 床位 预约 设备 人员 指标';
    return 'AI 运营助手 权限边界 审计 人工审批';
  }

  function summaryForResult(result) {
    if (!result) return '任务已完成。';
    if (result.kind === 'bed_analysis') return result.summary;
    if (result.kind === 'bed_forecast') return result.summary;
    if (result.kind === 'appointment_analysis') return result.summary;
    if (result.kind === 'staff_analysis') return result.summary;
    if (result.kind === 'ops_report') return '已生成 ' + result.range + '运营报告。';
    return '已返回可执行建议。';
  }

  function completeAnalysis(wf, result, step) {
    wf.result = result;
    wf.status = 'completed';
    wf.completedAt = now();
    step.tool = step.tool || null;
    const task = store.addAnalysisTask(wf.prompt, wf.intent, summaryForResult(result));
    wf.taskId = task.id;
    wf.stage = wf.steps.length - 1;
  }

  async function executeWorkflowStep(wf, index) {
    const intent = wf.intent;
    const step = wf.steps[index];
    const ctx = wf.context;
    const kind = intent.intent;

    if (index === 0) {
      wf.intro = '已识别为「' + intent.label + '」任务，范围：' + intent.departmentName +
        (kind === 'equipment_conflict' ? ' · ' + (intent.isTomorrow ? '明天' : '今天') : '') + '。开始协调 Agent。';
      return;
    }

    if (index === 1) {
      if (kind === 'bed_schedule' || kind === 'bed_analysis' || kind === 'bed_forecast') {
        const k = engine.getKpis(S());
        ctx.snapshot = { free: k.free, pending: k.pendingAdmissions, occupancy: k.occupancy, total: k.totalBeds };
        if (step.tool) step.tool.result = '空闲 ' + k.free + ' 张 / 待入院 ' + k.pendingAdmissions + ' 人 / 使用率 ' + k.occupancy + '%';
      } else if (kind === 'equipment_conflict') {
        const a = engine.analyzeEquipment(S(), { date: intent.date, deviceType: intent.deviceType });
        ctx.analysis = a;
        if (step.tool) step.tool.result = '检查冲突 ' + a.conflicts.length + ' 组 / 涉及 ' + (a.conflicts.length * 2) + ' 名患者';
      } else if (kind === 'appointment_analysis') {
        ctx.appt = engine.appointmentStats(S(), TODAY);
        if (step.tool) step.tool.result = '预约 ' + ctx.appt.total + ' 条 / 取消 ' + ctx.appt.canceled + ' 条';
      } else if (kind === 'staff_analysis' || kind === 'staff_schedule') {
        ctx.staff = engine.getStaffStats(S());
        if (step.tool) step.tool.result = '人员 ' + ctx.staff.total + ' 名 / 冲突 ' + ctx.staff.conflicts + ' 条';
      } else if (kind === 'ops_report') {
        ctx.kpis = engine.getKpis(S());
        if (step.tool) step.tool.result = '已汇总 4 类资源指标';
      } else {
        if (step.tool) step.tool.result = '能力范围已加载';
      }
      return;
    }

    if (index === 2) {
      const found = engine.retrieveKnowledge(S().knowledgeDocs, ragQueryFor(intent), 4);
      wf.citations = found.map(function (x) {
        return { docId: x.docId, chunkId: x.chunkId, title: x.title, heading: x.heading, relevance: x.relevance };
      });
      if (step.tool) step.tool.result = '命中 ' + found.length + ' 个片段 · 最高 ' + (found[0] ? Math.round(found[0].relevance * 100) : 0) + '%';
      return;
    }

    if (kind === 'bed_schedule') {
      if (index === 3) {
        ctx.draft = engine.buildBedPlan(S(), intent.department || null);
        if (step.tool) step.tool.result = '匹配 ' + ctx.draft.matched.length + ' 人 / 缺口 ' + ctx.draft.unmatched.length + ' 人';
        step.detail = '按主管医师优先级和申请时间排序，生成 ' + ctx.draft.matched.length + ' 条床位建议，' + ctx.draft.unmatched.length + ' 位暂未匹配。';
      } else if (index === 4) {
        ctx.validation = engine.validateBedPlan(S(), ctx.draft);
        if (step.tool) step.tool.result = ctx.validation.valid ? '全部通过 · ' + ctx.draft.matched.length + ' 床可执行' : ctx.validation.blockers.length + ' 项阻断';
        step.detail = ctx.validation.valid ? '床位状态、类型、性别、隔离与版本校验全部通过。' : '发现冲突：' + ctx.validation.blockers.join('；');
      } else if (index === 5) {
        const res = store.createBedPlan(intent.department || null, wf.prompt, intent);
        if (!res.ok) {
          wf.status = 'failed';
          wf.error = res.error;
          throw new Error(res.error);
        }
        wf.planId = res.plan.id;
        wf.planSnapshot = res.plan;
        wf.status = 'awaiting_approval';
        step.tool = { server: 'Approval Service', name: 'approval.create', result: res.existing ? '复用待审批方案 ' + res.plan.id : '审批单 ' + res.plan.id + ' 已创建' };
      }
      return;
    }

    if (kind === 'staff_schedule') {
      if (index === 3) {
        ctx.draft = engine.buildStaffPlan(S(), intent.department || null);
        if (step.tool) step.tool.result = '冲突 ' + ctx.draft.conflicts.length + ' 条 / 调整 ' + ctx.draft.changes.length + ' 条';
        step.detail = '生成 ' + ctx.draft.changes.length + ' 条调班建议，优先满足夜班后 11 小时休息。';
      } else if (index === 4) {
        ctx.validation = engine.validateStaffPlan(S(), ctx.draft);
        if (step.tool) step.tool.result = ctx.validation.valid ? '全部通过 · ' + ctx.draft.changes.length + ' 条可执行' : ctx.validation.blockers.length + ' 项阻断';
      } else if (index === 5) {
        const res = store.createStaffPlan(intent.department || null, wf.prompt);
        if (!res.ok) {
          wf.status = 'failed';
          wf.error = res.error;
          throw new Error(res.error);
        }
        wf.planId = res.plan.id;
        wf.planSnapshot = res.plan;
        wf.status = 'awaiting_approval';
        step.tool = { server: 'Approval Service', name: 'approval.create', result: res.existing ? '复用待审批方案 ' + res.plan.id : '审批单 ' + res.plan.id + ' 已创建' };
      }
      return;
    }

    if (kind === 'equipment_conflict') {
      if (index === 3) {
        if (step.tool) step.tool.result = ctx.analysis.changes.length + ' 条调整建议 / ' + ctx.analysis.escalations.length + ' 组需人工协调';
        step.detail = '找到 ' + ctx.analysis.conflicts.length + ' 组冲突；仅调整常规检查，保留优先/紧急优先级。';
      } else if (index === 4) {
        ctx.validation = ctx.analysis.validation;
        if (step.tool) step.tool.result = ctx.validation.valid ? '校验通过' : '存在需人工协调项';
      } else if (index === 5) {
        const res = store.createEquipmentPlan(ctx.analysis, wf.prompt, intent);
        if (!res.ok) {
          wf.status = 'failed';
          wf.error = res.error;
          throw new Error(res.error);
        }
        wf.planId = res.plan.id;
        wf.planSnapshot = res.plan;
        wf.status = 'awaiting_approval';
        step.tool = { server: 'Approval Service', name: 'approval.create', result: res.existing ? '复用待审批方案 ' + res.plan.id : '审批单 ' + res.plan.id + ' 已创建' };
      }
      return;
    }

    if (index === 3) {
      if (kind === 'bed_analysis') {
        const r = buildBedAnalysis(intent);
        ctx.result = r;
        if (step.tool) step.tool.result = r.wards.length + ' 个病区 / ' + r.kpis.free + ' 张空闲';
      } else if (kind === 'bed_forecast') {
        const r = buildForecastResult(intent);
        ctx.result = r;
        if (step.tool) step.tool.result = r.rows.filter(function (x) { return x.risk === '高' || x.risk === '紧急'; }).length + ' 个高风险科室';
      } else if (kind === 'appointment_analysis') {
        const r = buildAppointmentResult();
        ctx.result = r;
        if (step.tool) step.tool.result = r.total + ' 条预约 / 取消率 ' + r.cancelRate + '%';
      } else if (kind === 'staff_analysis') {
        const r = buildStaffResult();
        ctx.result = r;
        if (step.tool) step.tool.result = r.conflicts + ' 条冲突 / 平均负载 ' + r.avgLoad + '%';
      } else if (kind === 'ops_report') {
        const r = engine.generateOpsReport(S(), 7);
        ctx.result = r;
        if (step.tool) step.tool.result = '已生成报告骨架 · ' + r.metrics.totalAppts + ' 预约';
      } else {
        const r = { kind: 'general', summary: '已返回能力建议。' };
        ctx.result = r;
        completeAnalysis(wf, r, step);
      }
      return;
    }

    if (index === 4) {
      if (kind === 'staff_analysis') {
        const conflicts = S().staffConflicts;
        step.detail = '检测到 ' + conflicts.length + ' 条排班冲突，其中 ' + conflicts.filter(function (c) { return c.severity === '高'; }).length + ' 条高等级。';
        completeAnalysis(wf, ctx.result, step);
      } else {
        completeAnalysis(wf, ctx.result, step);
      }
    }
  }

  async function runWorkflow(rawPrompt) {
    const prompt = String(rawPrompt || '').trim();
    if (!prompt) { toast('请先描述一个运营任务', 'error'); return; }
    if (ui.workflow && ui.workflow.status === 'running') { toast('当前已有工作流在执行', 'info'); return; }
    const intent = engine.parseIntent(prompt);
    const steps = engine.workflowSteps(intent).map(function (s) {
      return Object.assign({}, s, { status: 'pending', duration: 0 });
    });
    const stamp = now().slice(11).replace(':', '');
    const wf = {
      id: 'WF-' + TODAY.replace(/-/g, '') + '-' + stamp + String(S().tasks.length + 1).padStart(2, '0'),
      prompt: prompt,
      intent: intent,
      steps: steps,
      stage: 0,
      status: 'running',
      startedAt: now(),
      context: {},
      citations: [],
      planId: null,
      result: null,
      intro: '',
      thinking: 'Coordinator 正在拆解任务…'
    };
    ui.workflow = wf;
    if (ui.route !== 'dispatch') {
      ui.route = 'dispatch';
      location.hash = '#/dispatch';
    }
    ui.dispatchInput = prompt;
    render();
    await sleep(ui.fastWorkflow ? 80 : 420);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      wf.stage = i;
      step.status = 'running';
      wf.thinking = step.agent + ' 正在' + step.title + '…';
      if (ui.route === 'dispatch') refreshContent(); else render();
      await sleep(ui.fastWorkflow ? 60 : (260 + i * 90));
      const t0 = Date.now();
      try {
        await executeWorkflowStep(wf, i);
        step.status = 'done';
        step.duration = Math.max(38, Date.now() - t0 + 40 + i * 17);
      } catch (e) {
        step.status = 'error';
        step.duration = Math.max(30, Date.now() - t0);
        if (wf.status !== 'failed') { wf.status = 'failed'; wf.error = e.message; }
        break;
      }
      if (ui.route === 'dispatch') refreshContent(); else render();
      await sleep(ui.fastWorkflow ? 30 : 120);
    }
    ui.fastWorkflow = false;
    if (wf.status === 'running') wf.status = 'completed';
    if (wf.status === 'completed' && !wf.completedAt) wf.completedAt = now();
    render();
    if (wf.status === 'failed') toast(wf.error || '工作流执行失败', 'error');
    else if (wf.status === 'awaiting_approval') toast('方案已生成，工作流暂停等待审批');
    else toast('工作流执行完成');
  }

  function runWorkflowFromInput() {
    const el = document.getElementById('dispatch-input');
    const prompt = el ? el.value : ui.dispatchInput;
    if (ui.workflow && ui.workflow.status === 'running') { toast('当前已有工作流在执行', 'info'); return; }
    runWorkflow(prompt);
  }

  /* __DRAWERS2__ */

  function renderRoute() {
    switch (ui.route) {
      case 'dashboard': return renderDashboard();
      case 'patients': return renderPatients();
      case 'appointments': return renderAppointments();
      case 'beds': return renderBeds();
      case 'admissions': return renderAdmissions();
      case 'equipment': return renderEquipment();
      case 'staff': return renderStaff();
      case 'dispatch': return renderDispatch();
      case 'approvals': return renderApprovals();
      case 'alerts': return renderAlerts();
      case 'analytics': return renderAnalytics();
      case 'knowledge': return renderKnowledge();
      case 'system': return renderSystem();
      default: return renderDashboard();
    }
  }

  // ------------------------------ Overlay ------------------------------
  function renderOverlay() {
    const root = document.getElementById('overlay-root');
    if (!root) return;
    let html = '';
    if (ui.drawer) html += renderDrawer(ui.drawer.type, ui.drawer.id);
    if (ui.modal) html += renderModal(ui.modal.type, ui.modal.data || {});
    root.innerHTML = html;
    document.body.classList.toggle('no-scroll', !!(ui.drawer || ui.modal));
  }

  function drawerShell(title, subtitle, body, foot) {
    return '<div class="scrim" data-action="close-overlay"></div><aside class="drawer" role="dialog" aria-modal="true">' +
      '<div class="drawer-head"><div><span class="eyebrow">' + esc(subtitle || 'DETAIL') + '</span><h2>' + esc(title) + '</h2></div>' +
      '<button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close', 19) + '</button></div>' +
      '<div class="drawer-body">' + body + '</div>' + (foot ? '<div class="drawer-foot">' + foot + '</div>' : '') + '</aside>';
  }

  function modalShell(title, body, foot, wide) {
    return '<div class="scrim" data-action="close-overlay"></div><div class="modal-wrap"><div class="modal ' + (wide ? 'modal-wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2>' + esc(title) + '</h2><button class="icon-btn" data-action="close-overlay">' + icon('close', 18) + '</button></div>' +
      '<div class="modal-body">' + body + '</div>' + (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div></div>';
  }

  function renderDrawer(type, id) {
    if (type === 'bed') return renderBedDrawer(id);
    if (type === 'patient') return renderPatientDrawer(id);
    if (type === 'appointment') return renderAppointmentDrawer(id);
    if (type === 'admission') return renderAdmissionDrawer(id);
    if (type === 'alert') return renderAlertDrawer(id);
    if (type === 'exam') return renderExamDrawer(id);
    return '';
  }

  function renderBedDrawer(id) {
    const b = S().beds.find(function (x) { return x.id === id; });
    if (!b) return drawerShell('床位不存在', 'BED', emptyState('bed', '找不到床位'), '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>');
    const statusHero = { '空闲': '可分配', '已入住': '已入住', '待清洁': '待清洁', '维护中': '维护中', '已预留': '已预留', '暂停使用': '暂停使用' }[b.status];
    let body = '<div class="bed-detail-hero st-' + ({ '空闲': 'free', '已入住': 'occupied', '待清洁': 'cleaning', '维护中': 'maintenance', '已预留': 'reserved', '暂停使用': 'paused' }[b.status] || 'free') + '">' +
      '<div><span class="eyebrow">' + esc(b.wardName) + ' · ' + esc(b.floor) + '</span><h3>' + esc(b.code) + ' 床</h3><p>' + esc(b.type) + ' · ' + esc(b.genderPolicy === '不限' ? '性别不限' : b.genderPolicy + '性病房') + '</p></div>' +
      '<span class="bed-big-state">' + esc(statusHero) + '</span></div>';
    body += '<div class="detail-kv-grid">' +
      '<div><span>病区</span><b>' + esc(b.wardName) + '</b></div><div><span>房间</span><b>' + esc(b.room) + '</b></div>' +
      '<div><span>床位类型</span><b>' + esc(b.type) + '</b></div><div><span>床位版本</span><b class="mono">v' + b.version + '</b></div>' +
      '<div><span>设施</span><b class="small">' + esc(b.features.join(' · ')) + '</b></div><div><span>床位 ID</span><b class="mono small">' + esc(b.id) + '</b></div></div>';
    if (b.patientId) {
      const p = S().patients.find(function (x) { return x.id === b.patientId; });
      body += '<div class="patient-summary-card"><div class="patient-summary-head">' + avatar(b.patientName, '#0f766e', 38) + '<div><b>' + esc(b.patientName) + '</b><small>' + (p ? esc(p.gender) + ' · ' + p.age + ' 岁 · ' + esc(p.diagnosis) : '住院患者') + '</small></div>' +
        (p ? '<button class="btn btn-tiny" data-action="open-patient" data-id="' + p.id + '">档案</button>' : '') + '</div>' +
        '<div class="mini-kv"><span>入院时间<b>' + esc((b.occupiedAt || '').slice(0, 10)) + '</b></span><span>预计出院<b>' + esc(b.expectedDischarge || '—') + '</b></span><span>护理等级<b>' + esc(p ? p.careLevel : '—') + '</b></span></div></div>';
    } else if (b.status === '空闲') {
      body += '<div class="notice">' + icon('check', 15) + '该床位当前可参与 AI 调度或手动分配。分配前会再次校验性别、科室、类型和版本。</div>';
    } else if (b.status === '待清洁') {
      body += '<div class="cleaning-box"><div class="cleaning-ring">' + icon('refresh', 18) + '</div><div><b>终末清洁</b><p>开始：' + esc(b.cleaningStartedAt || '—') + ' · 目标：' + esc(b.cleaningDeadline || '—') + '</p>' +
        (b.cleaningOverdue ? '<span class="text-danger small">已超时，需通知保洁与护士长</span>' : '<span class="muted small">完成后需护理复核，床位才会转为空闲</span>') + '</div></div>';
    } else if (b.status === '维护中') {
      body += '<div class="notice amber">' + icon('tool', 15) + (b.maintenanceNote || '床位维护中') + (b.maintenanceUntil ? ' · 预计 ' + esc(b.maintenanceUntil) + ' 恢复' : '') + '</div>';
    } else if (b.status === '已预留') {
      body += '<div class="notice">' + icon('clock', 15) + (b.reservedFor || '已预留') + ' · 预留至 ' + esc(b.reservedUntil || '—') + '</div>';
    }
    const logs = S().audit.filter(function (l) { return l.target === b.id; }).slice(0, 3);
    if (logs.length) {
      body += '<div class="section-mini-title">操作记录</div><div class="mini-timeline">' + logs.map(function (l) {
        return '<div><span>' + esc(l.at.slice(5)) + '</span><p>' + esc(l.detail) + '<small>' + esc(l.actor) + '</small></p></div>';
      }).join('') + '</div>';
    }
    let foot = '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>';
    if (can('bed.manage')) {
      if (b.status === '空闲') foot += '<button class="btn btn-ghost" data-action="maintain-bed" data-bed="' + b.id + '">' + icon('tool', 14) + '转入维护</button><button class="btn btn-primary" data-action="assign-bed" data-bed="' + b.id + '">' + icon('plus', 14) + '分配患者</button>';
      if (b.status === '已入住') foot += '<button class="btn btn-danger-ghost" data-action="discharge-bed" data-bed="' + b.id + '">' + icon('logout', 14) + '办理出院</button>';
      if (b.status === '待清洁') foot += '<button class="btn btn-primary" data-action="clean-bed" data-bed="' + b.id + '">' + icon('check', 14) + '完成清洁复核</button>';
      if (b.status === '维护中' || b.status === '暂停使用') foot += '<button class="btn btn-primary" data-action="restore-bed" data-bed="' + b.id + '">' + icon('refresh', 14) + '恢复使用</button>';
    }
    return drawerShell('床位 ' + b.code, b.wardName + ' · ' + b.floor, body, foot);
  }

  function renderPatientDrawer(id) {
    const p = S().patients.find(function (x) { return x.id === id; });
    if (!p) return drawerShell('患者不存在', 'PATIENT', emptyState('patient', '找不到患者'), '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>');
    const dept = S().departments.find(function (d) { return d.id === p.dept; });
    const adm = S().admissions.find(function (a) { return a.patientId === p.id; });
    let body = '<div class="patient-profile"><div class="patient-profile-head">' + avatar(p.name, dept ? dept.color : '#0f766e', 54) +
      '<div><h3>' + esc(p.name) + '</h3><p>' + esc(p.gender) + ' · ' + p.age + ' 岁 · ' + esc(p.deptName) + '</p><div class="profile-tags">' + statusChip(p.status) + chip(p.type, p.type === '住院' ? 'info' : 'neutral') + (p.tags || []).map(function (t) { return chip(t, 'teal'); }).join('') + '</div></div></div>' +
      '<div class="detail-kv-grid"><div><span>患者号</span><b class="mono">' + esc(p.id) + '</b></div><div><span>联系电话</span><b class="mono">' + esc(p.phone) + '</b></div>' +
      '<div><span>主诊医师</span><b>' + esc(p.attending || '—') + '</b></div><div><span>护理等级</span><b>' + esc(p.careLevel) + '</b></div></div>' +
      '<div class="patient-diagnosis"><span>主要诊断 / 就诊原因</span><p>' + esc(p.diagnosis || '—') + '</p></div></div>';
    if (p.bedId) {
      const bed = S().beds.find(function (b) { return b.id === p.bedId; });
      body += '<div class="record-card"><div class="record-icon">' + icon('bed', 18) + '</div><div><b>当前床位</b><p>' + esc(p.wardName) + ' · ' + esc(p.bedCode) + ' 床 · ' + esc(bed ? bed.type : '') + '</p><small>入院时间 ' + esc((p.admittedAt || '').slice(0, 10)) + ' · 预计出院 ' + esc(p.expectedDischarge || '—') + '</small></div>' +
        (bed ? '<button class="btn btn-tiny" data-action="open-bed" data-id="' + bed.id + '">床位</button>' : '') + '</div>';
    } else if (p.type === '待入院') {
      body += '<div class="record-card pending"><div class="record-icon">' + icon('clock', 18) + '</div><div><b>等待床位分配</b><p>' + (adm ? '申请 ' + esc(adm.bedType) + ' · 期望住院 ' + adm.expectedStay + ' 天' : '入院申请处理中') + '</p><small>申请时间 ' + esc(adm ? adm.appliedAt : p.updatedAt) + '</small></div></div>';
    }
    const appts = S().appointments.filter(function (a) { return a.patientId === p.id; }).slice(-3).reverse();
    if (appts.length) {
      body += '<div class="section-mini-title">预约记录</div><div class="mini-record-list">' + appts.map(function (a) {
        return '<div><span class="mono">' + esc(a.date.slice(5)) + ' ' + esc(a.slot) + '</span><b>' + esc(a.deptName) + ' · ' + esc(a.doctorName) + '</b>' + statusChip(a.status) + '</div>';
      }).join('') + '</div>';
    }
    const logs = S().audit.filter(function (l) { return (adm && l.target === adm.id) || l.target === p.id || l.target === p.bedId; }).slice(0, 3);
    if (logs.length) {
      body += '<div class="section-mini-title">最近操作</div><div class="mini-timeline">' + logs.map(function (l) {
        return '<div><span>' + esc(l.at.slice(5)) + '</span><p>' + esc(l.detail) + '<small>' + esc(l.actor) + '</small></p></div>';
      }).join('') + '</div>';
    }
    let foot = '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>';
    if (adm && adm.status === '待分配') foot += '<button class="btn btn-primary" data-action="open-bed-plan" data-prompt="帮我制定今天' + esc(adm.deptName) + '的床位分配方案">' + icon('sparkles', 14) + '为该科室生成方案</button>';
    return drawerShell('患者档案', p.id, body, foot);
  }

  function renderAppointmentDrawer(id) {
    const a = S().appointments.find(function (x) { return x.id === id; });
    if (!a) return drawerShell('预约不存在', 'APPOINTMENT', emptyState('calendar', '找不到预约'), '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>');
    let body = '<div class="appointment-hero"><div><span class="eyebrow">' + esc(a.date) + ' · ' + esc(a.slot) + '</span><h3>' + esc(a.patientName) + '</h3><p>' + esc(a.deptName) + ' · ' + esc(a.doctorName) + ' ' + esc(a.title) + '</p></div>' + statusChip(a.status) + '</div>';
    body += '<div class="detail-kv-grid"><div><span>预约号</span><b class="mono">' + esc(a.code) + '</b></div><div><span>就诊日期</span><b>' + esc(a.date) + '</b></div>' +
      '<div><span>号源时段</span><b>' + esc(a.slot) + '</b></div><div><span>诊室</span><b>' + esc(a.room) + '</b></div>' +
      '<div><span>患者号</span><b class="mono">' + esc(a.patientId) + '</b></div><div><span>联系电话</span><b class="mono">' + esc(a.phone) + '</b></div>' +
      '<div><span>预约来源</span><b>' + esc(a.source) + '</b></div><div><span>等待时长</span><b>' + (a.waitMinutes ? a.waitMinutes + ' 分钟' : '—') + '</b></div></div>';
    if (a.status === '已取消') body += '<div class="notice">' + icon('info', 15) + '该预约已取消：' + esc(a.cancelReason || '') + ' · ' + esc(a.canceledAt || '') + '</div>';
    if (a.status === '已完成') body += '<div class="notice success">' + icon('check', 15) + '该预约已完成就诊，不能再次取消。</div>';
    body += '<div class="timeline-mini"><div class="done"><span></span><p>预约创建<small>' + esc(a.createdAt) + '</small></p></div>' +
      (a.status === '已签到' || a.status === '已完成' ? '<div class="done"><span></span><p>患者签到<small>等待 ' + (a.waitMinutes || 0) + ' 分钟</small></p></div>' : '') +
      (a.status === '已完成' ? '<div class="done"><span></span><p>就诊完成<small>预约闭环</small></p></div>' : '') +
      (a.status === '已取消' ? '<div class="cancel"><span></span><p>预约取消<small>' + esc(a.canceledAt || '') + '</small></p></div>' : '') + '</div>';
    let foot = '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>';
    if (can('appointment.manage')) {
      if (['待确认', '已预约'].indexOf(a.status) >= 0) {
        foot += '<button class="btn btn-ghost" data-action="reschedule-appt" data-id="' + a.id + '">' + icon('calendar', 14) + '改约</button>';
        foot += '<button class="btn btn-danger-ghost" data-action="cancel-appointment" data-id="' + a.id + '">' + icon('close', 14) + '取消</button>';
        foot += '<button class="btn btn-primary" data-action="checkin-appt" data-id="' + a.id + '">' + icon('check', 14) + '患者签到</button>';
      }
      if (a.status === '已签到') {
        foot += '<button class="btn btn-primary" data-action="complete-appt" data-id="' + a.id + '">' + icon('check', 14) + '完成就诊</button>';
      }
    }
    return drawerShell('预约详情', a.code, body, foot);
  }

  function renderAdmissionDrawer(id) {
    const a = S().admissions.find(function (x) { return x.id === id; });
    if (!a) return drawerShell('申请不存在', 'ADMISSION', emptyState('file', '找不到入院申请'), '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>');
    let body = '<div class="admission-hero"><div><span class="eyebrow">' + esc(a.id) + '</span><h3>' + esc(a.name) + '</h3><p>' + esc(a.deptName) + ' · ' + esc(a.bedType) + ' · ' + esc(a.gender) + ' / ' + a.age + ' 岁</p></div>' + statusChip(a.status) + '</div>';
    body += '<div class="detail-kv-grid"><div><span>主管医师</span><b>' + esc(a.attending) + '</b></div><div><span>临床优先级</span><b>' + esc(a.priority) + '（' + esc(a.prioritySource) + '）</b></div>' +
      '<div><span>护理等级</span><b>' + esc(a.careLevel) + '</b></div><div><span>预计住院</span><b>' + a.expectedStay + ' 天</b></div>' +
      '<div><span>申请时间</span><b>' + esc(a.appliedAt) + '</b></div><div><span>申请来源</span><b>' + esc(a.source) + '</b></div></div>' +
      '<div class="patient-diagnosis"><span>诊断 / 收治原因</span><p>' + esc(a.diagnosis) + '</p></div>' +
      '<div class="requirement-box"><b>床位要求</b><div class="tag-wrap">' + (a.requiredFeatures || []).map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('') +
      (a.isolation ? '<span>感染隔离</span>' : '') + '<span>' + esc(a.bedType) + '</span><span>' + esc(a.gender) + '性适配</span></div>' +
      '<p>' + esc(a.note || '无额外说明') + '</p></div>';
    if (a.assignedBedId) {
      const bed = S().beds.find(function (b) { return b.id === a.assignedBedId; });
      body += '<div class="record-card success"><div class="record-icon">' + icon('check', 18) + '</div><div><b>已分配床位</b><p>' + esc(bed ? bed.code + ' · ' + bed.wardName + ' · ' + bed.type : a.assignedBedId) + '</p><small>' + esc(a.assignedAt) + '</small></div></div>';
    }
    body += '<div class="notice">' + icon('shield', 15) + 'AI 只依据科室、类型、性别、隔离要求和申请时间匹配床位，不自行判断或改变临床优先级。</div>';
    let foot = '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>';
    if (a.status === '待分配') foot += '<button class="btn btn-primary" data-action="open-bed-plan" data-prompt="帮我制定今天' + esc(a.deptName) + '的床位分配方案">' + icon('sparkles', 14) + '生成床位方案</button>';
    return drawerShell('入院申请', a.id, body, foot);
  }

  function renderAlertDrawer(id) {
    const a = S().alerts.find(function (x) { return x.id === id; });
    if (!a) return drawerShell('预警不存在', 'ALERT', emptyState('alert', '找不到预警'), '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>');
    let body = '<div class="alert-detail-hero lv-' + ({ '紧急': 'urgent', '高': 'high', '中': 'mid', '低': 'low' }[a.level] || 'low') + '"><div>' + levelChip(a.level) + chip(a.type, 'neutral') + '<h3>' + esc(a.title) + '</h3><p>' + esc(a.dept) + ' · 触发于 ' + esc(a.triggerAt) + '</p></div>' + statusChip(a.status) + '</div>';
    body += '<div class="alert-data-grid">' + a.data.map(function (d) { return '<div><span>' + esc(d) + '</span></div>'; }).join('') + '</div>';
    body += '<div class="analysis-block"><span class="analysis-label">风险原因</span><p>' + esc(a.cause) + '</p></div>' +
      '<div class="analysis-block ai"><span class="analysis-label">' + icon('sparkles', 13) + 'AI 分析</span><p>' + esc(a.ai) + '</p></div>' +
      '<div class="analysis-block suggest"><span class="analysis-label">处理建议</span><p>' + esc(a.suggestion) + '</p></div>';
    if (a.handledBy) body += '<div class="notice">' + icon('check', 15) + '已由 ' + esc(a.handledBy) + ' 处理 · ' + esc(a.handledAt) + (a.handleNote ? ' · ' + esc(a.handleNote) : '') + '</div>';
    if (a.status !== '已处理' && a.status !== '已忽略' && can('alert.handle')) {
      body += '<label class="field-label">处置说明<textarea id="alert-note" rows="2" placeholder="记录本次处置动作或原因"></textarea></label>';
    }
    let foot = '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>';
    if (a.relatedType === 'bed' && a.relatedId && S().beds.some(function (b) { return b.id === a.relatedId; })) {
      foot += '<button class="btn btn-ghost" data-action="open-bed" data-id="' + a.relatedId + '">查看床位</button>';
    }
    if (can('alert.handle') && a.status !== '已处理' && a.status !== '已忽略') {
      if (a.status === '待处理') foot += '<button class="btn btn-ghost" data-action="alert-handle" data-status="处理中">开始处理</button>';
      foot += '<button class="btn btn-primary" data-action="alert-handle" data-status="已处理">标记已处理</button>';
      foot += '<button class="btn btn-tiny btn-ghost" data-action="alert-handle" data-status="已忽略">忽略</button>';
    }
    return drawerShell('预警详情', a.id, body, foot);
  }

  function renderExamDrawer(id) {
    const e = S().exams.find(function (x) { return x.id === id; });
    if (!e) return drawerShell('检查不存在', 'EXAM', emptyState('monitor', '找不到检查记录'), '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>');
    const conflicts = engine.detectExamConflicts(S().exams, e.date, e.deviceId).filter(function (c) { return c.a.id === e.id || c.b.id === e.id; });
    let body = '<div class="exam-hero"><div><span class="eyebrow">' + esc(e.id) + '</span><h3>' + esc(e.examItem) + '</h3><p>' + esc(e.deviceName) + ' · ' + esc(e.date) + ' ' + esc(e.start) + '–' + esc(e.end) + '</p></div>' + statusChip(e.status) + '</div>';
    body += '<div class="detail-kv-grid"><div><span>患者</span><b>' + esc(e.patientName) + ' · ' + esc(e.gender) + ' / ' + e.age + ' 岁</b></div><div><span>开单科室</span><b>' + esc(e.deptName) + '</b></div>' +
      '<div><span>开单医师</span><b>' + esc(e.orderedBy) + '</b></div><div><span>临床优先级</span><b>' + esc(e.priority) + '（' + esc(e.prioritySource) + '）</b></div>' +
      '<div><span>检查时长</span><b>' + (e.duration || 30) + ' 分钟</b></div><div><span>设备房间</span><b>' + esc(e.room) + '</b></div></div>' +
      '<div class="prep-box"><b>' + icon('info', 15) + '检查准备</b><p>' + esc(e.prep || '—') + '</p></div>' +
      (e.note ? '<div class="analysis-block"><span class="analysis-label">备注</span><p>' + esc(e.note) + '</p></div>' : '');
    if (conflicts.length) {
      body += '<div class="validation-blocker">' + icon('alert', 16) + '<div><b>该检查存在时段重叠</b><ul>' + conflicts.map(function (c) {
        const other = c.a.id === e.id ? c.b : c.a;
        return '<li>与 ' + esc(other.patientName) + ' 的 ' + esc(other.examItem) + '（' + esc(other.start) + '–' + esc(other.end) + '）重叠 ' + c.overlap + ' 分钟</li>';
      }).join('') + '</ul></div></div>';
    }
    let foot = '<button class="btn btn-ghost" data-action="close-overlay">关闭</button>';
    if (can('equipment.manage') && ['已预约', '已签到', '进行中'].indexOf(e.status) >= 0) {
      foot += '<button class="btn btn-danger-ghost" data-action="cancel-exam" data-id="' + e.id + '">' + icon('close', 14) + '取消检查</button>';
    }
    foot += '<button class="btn btn-primary" data-action="new-equipment-analysis" data-device="' + esc(e.deviceType === 'X 光' ? 'DR' : e.deviceType) + '" data-date="' + (e.date === TODAY ? 'today' : 'tomorrow') + '">' + icon('sparkles', 14) + '让 AI 分析冲突</button>';
    return drawerShell('检查详情', e.deviceName, body, foot);
  }

  /* __DRAWERS3__ */

  function renderModal(type, d) {
    if (type === 'search') return renderSearchModal();
    if (type === 'appointment') return renderAppointmentModal();
    if (type === 'waitlist') return renderWaitlistModal();
    if (type === 'reschedule') return renderRescheduleModal(d);
    if (type === 'admission') return renderAdmissionModal();
    if (type === 'assign') return renderAssignModal(d);
    if (type === 'exam') return renderExamModal();
    if (type === 'maintenance') return renderMaintenanceModal();
    if (type === 'leave') return renderLeaveModal();
    if (type === 'swap') return renderSwapModal();
    if (type === 'user') return renderUserModal(d);
    if (type === 'kb') return renderKbModal();
    if (type === 'kb-edit') return renderKbEditModal(d);
    if (type === 'confirm') return renderConfirmModal(d);
    return '';
  }

  function renderSearchModal() {
    const results = ui.searchResults;
    let body = '<form id="search-form" class="global-search-form">' + icon('search', 18) +
      '<input id="global-search-input" value="' + esc(ui.searchQuery) + '" placeholder="搜索患者姓名 / 患者号 / 床位号 / 审批单" autofocus>' +
      '<button class="btn btn-primary btn-tiny" type="submit">搜索</button></form>';
    if (!results) {
      body += '<div class="search-hint"><span>可以这样搜</span><div><button data-action="search-preset" data-query="张建国">张建国</button><button data-action="search-preset" data-query="ORTHO-A-03">ORTHO-A-03</button><button data-action="search-preset" data-query="BP-20261106">床位方案</button><button data-action="search-preset" data-query="CT-01">CT-01</button></div></div>';
    } else {
      const total = results.patients.length + results.beds.length + results.plans.length + results.admissions.length;
      body += '<div class="search-result-count">找到 ' + total + ' 条结果</div>';
      if (results.patients.length) {
        body += '<div class="search-group"><h4>患者</h4>' + results.patients.map(function (p) {
          return '<button class="search-result" data-action="search-open" data-type="patient" data-id="' + p.id + '">' + avatar(p.name, '#0f766e', 30) + '<span><b>' + esc(p.name) + '</b><small>' + esc(p.id) + ' · ' + esc(p.deptName) + ' · ' + esc(p.type) + '</small></span>' + icon('chevron', 13) + '</button>';
        }).join('') + '</div>';
      }
      if (results.beds.length) {
        body += '<div class="search-group"><h4>床位</h4>' + results.beds.map(function (b) {
          return '<button class="search-result" data-action="search-open" data-type="bed" data-id="' + b.id + '"><span class="search-ic">' + icon('bed', 16) + '</span><span><b>' + esc(b.code) + ' · ' + esc(b.wardName) + '</b><small>' + esc(b.status) + ' · ' + esc(b.type) + (b.patientName ? ' · ' + esc(b.patientName) : '') + '</small></span>' + icon('chevron', 13) + '</button>';
        }).join('') + '</div>';
      }
      if (results.admissions.length) {
        body += '<div class="search-group"><h4>入院申请</h4>' + results.admissions.map(function (a) {
          return '<button class="search-result" data-action="search-open" data-type="admission" data-id="' + a.id + '"><span class="search-ic">' + icon('file', 16) + '</span><span><b>' + esc(a.name) + '</b><small>' + esc(a.id) + ' · ' + esc(a.deptName) + ' · ' + esc(a.status) + '</small></span>' + icon('chevron', 13) + '</button>';
        }).join('') + '</div>';
      }
      if (results.plans.length) {
        body += '<div class="search-group"><h4>审批单</h4>' + results.plans.map(function (p) {
          return '<button class="search-result" data-action="search-open" data-type="plan" data-id="' + p.id + '"><span class="search-ic">' + icon('approval', 16) + '</span><span><b>' + esc(p.title) + '</b><small>' + esc(p.id) + ' · ' + esc(p.status) + '</small></span>' + icon('chevron', 13) + '</button>';
        }).join('') + '</div>';
      }
      if (!total) body += emptyState('search', '没有找到匹配结果', '尝试患者姓名、床位号或审批单号');
    }
    return modalShell('全局搜索', body, '<span class="modal-foot-hint">⌘K 随时打开 · 仅检索演示环境合成数据</span>', true);
  }

  function renderAppointmentModal() {
    const docs = S().doctors;
    const defaultDoc = docs.find(function (d) { return d.period === '下午'; }) || docs[0];
    let body = '<div class="form-intro">' + icon('sparkles', 17) + '<p>填写患者信息后选择医生与号源。提交前会检查 <b>重复预约</b> 和 <b>号源占用</b>，AI 推荐只生成建议。</p></div>' +
      '<form id="appointment-form" class="form-grid"><label>患者姓名<input name="patientName" required placeholder="请输入姓名"></label>' +
      '<label>联系电话<input name="phone" placeholder="138****0000"></label>' +
      '<label>性别<select name="gender"><option>女</option><option>男</option></select></label>' +
      '<label>年龄<input name="age" type="number" min="0" max="120" value="35"></label>' +
      '<label>就诊科室<select id="appt-dept">' + S().departments.map(function (dep) { return '<option value="' + dep.id + '">' + esc(dep.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>医生<select id="appt-doctor" name="doctorId">' + docs.map(function (doc) {
        return '<option value="' + doc.id + '" data-dept="' + doc.dept + '"' + (doc.id === defaultDoc.id ? ' selected' : '') + '>' + esc(doc.name) + ' · ' + esc(doc.deptName) + ' · ' + esc(doc.title) + '</option>';
      }).join('') + '</select></label>' +
      '<label>就诊日期<input id="appt-date" name="date" type="date" value="' + TODAY + '" min="' + TODAY + '" max="' + engine.addDays(TODAY, 7) + '"></label>' +
      '<label>号源时段<select id="appt-slot" name="slot"></select></label>' +
      '<label class="span-2">就诊原因<input name="reason" placeholder="选填，例如：腰椎复诊 / 术后随访"></label>' +
      '<div class="span-2 ai-recommend-row"><div id="appt-recommend-text">' + icon('sparkles', 14) + '选择医生后，可让 AI 推荐最合适的可用时段。</div><button type="button" class="btn btn-soft btn-tiny" data-action="ai-recommend">' + icon('sparkles', 13) + 'AI 推荐号源</button></div>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '确认创建预约</button></div></form>';
    return modalShell('新建预约', body, '', true);
  }

  function updateAppointmentSlots() {
    const docSel = document.getElementById('appt-doctor');
    const dateEl = document.getElementById('appt-date');
    const slotSel = document.getElementById('appt-slot');
    if (!docSel || !slotSel || !dateEl) return;
    const slots = engine.getAvailableSlots(S(), docSel.value, dateEl.value);
    slotSel.innerHTML = slots.length
      ? slots.map(function (s) { return '<option value="' + s.slot + '">' + s.slot + '</option>'; }).join('')
      : '<option value="">该医生该日期暂无可用号源</option>';
  }

  function renderWaitlistModal() {
    let body = '<div class="form-intro">' + icon('clock', 17) + '<p>候补按登记时间排序。系统只推荐可补位号源，补位前会再次校验重复预约与号源占用。</p></div>' +
      '<form id="waitlist-form" class="form-grid"><label>患者姓名<input name="patientName" required placeholder="请输入姓名"></label>' +
      '<label>联系电话<input name="phone" placeholder="138****0000"></label>' +
      '<label>科室<select name="dept">' + S().departments.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>指定医生<select name="doctorId"><option value="">不指定</option>' + S().doctors.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + ' · ' + esc(d.deptName) + '</option>'; }).join('') + '</select></label>' +
      '<label>期望日期<input name="preferredDate" type="date" value="' + TOMORROW + '" min="' + TODAY + '" max="' + engine.addDays(TODAY, 7) + '"></label>' +
      '<label>期望时段<select name="preferredPeriod"><option>上午</option><option>下午</option></select></label>' +
      '<label>优先级<select name="priority"><option>常规</option><option>优先</option></select></label>' +
      '<label class="span-2">备注<input name="note" placeholder="例如：仅上午可到院 / 复诊"></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('plus', 15) + '加入候补队列</button></div></form>';
    return modalShell('加入候补', body, '', true);
  }

  function renderRescheduleModal(d) {
    const a = S().appointments.find(function (x) { return x.id === d.id; });
    if (!a) return modalShell('改约', emptyState('calendar', '预约不存在'), '');
    let body = '<div class="assign-bed-banner"><div><span class="eyebrow">' + esc(a.code) + '</span><h3>' + esc(a.patientName) + '</h3><p>' + esc(a.deptName) + ' · ' + esc(a.doctorName) + ' · 当前 ' + esc(a.date) + ' ' + esc(a.slot) + '</p></div>' + statusChip(a.status) + '</div>' +
      '<form id="reschedule-form" class="form-grid"><input type="hidden" name="id" value="' + a.id + '">' +
      '<label>新日期<input id="res-date" name="date" type="date" value="' + a.date + '" min="' + TODAY + '" max="' + engine.addDays(TODAY, 7) + '"></label>' +
      '<label>医生<input value="' + esc(a.doctorName) + ' · ' + esc(a.title) + '" readonly></label>' +
      '<label class="span-2">可用号源<select id="res-slot" name="slot"></select></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '确认改约</button></div></form>';
    return modalShell('预约改约', body, '', true);
  }

  function updateRescheduleSlots() {
    const sel = document.getElementById('res-slot');
    const dateEl = document.getElementById('res-date');
    const form = document.getElementById('reschedule-form');
    if (!sel || !dateEl || !form) return;
    const id = form.querySelector('[name="id"]').value;
    const a = S().appointments.find(function (x) { return x.id === id; });
    if (!a) return;
    const taken = S().appointments.filter(function (x) {
      return x.id !== a.id && x.doctorId === a.doctorId && x.date === dateEl.value && x.status !== '已取消';
    }).map(function (x) { return x.slot; });
    const doc = S().doctors.find(function (d) { return d.id === a.doctorId; });
    const slots = (doc ? doc.slots : []).filter(function (s) { return taken.indexOf(s) < 0; });
    sel.innerHTML = slots.length ? slots.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('') : '<option value="">该日期暂无可用号源</option>';
  }

  function updateExamForm() {
    const deviceSel = document.getElementById('exam-device');
    const itemSel = document.getElementById('exam-item');
    const durationEl = document.getElementById('exam-duration');
    if (!deviceSel || !itemSel) return;
    const device = S().devices.find(function (d) { return d.id === deviceSel.value; });
    if (!device) return;
    itemSel.innerHTML = device.capabilities.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    if (durationEl) durationEl.value = ({ CT: 30, MRI: 40, '超声': 20, 'X 光': 15 }[device.type] || 30);
  }

  function suggestExamSlot() {
    const deviceSel = document.getElementById('exam-device');
    const dateEl = document.getElementById('exam-date');
    const durationEl = document.getElementById('exam-duration');
    const startEl = document.getElementById('exam-start');
    const text = document.getElementById('exam-suggest-text');
    if (!deviceSel || !dateEl || !startEl) return;
    const duration = Number(durationEl ? durationEl.value : 30) || 30;
    const slot = engine.findFreeSlot(S(), deviceSel.value, dateEl.value, duration, 8 * 60);
    if (!slot) {
      if (text) text.innerHTML = icon('alert', 14) + '所选日期没有满足时长的空档。';
      return;
    }
    startEl.value = slot.start;
    if (text) text.innerHTML = icon('sparkles', 14) + '建议空档 <b>' + esc(slot.start) + '–' + esc(slot.end) + '</b>，已填入开始时间。';
  }

  function renderExamModal() {
    const devices = S().devices.filter(function (d) { return d.status !== '维护中'; });
    let body = '<div class="form-intro">' + icon('monitor', 17) + '<p>创建前会校验设备维护状态、08:00–18:00 开放时段和同设备时间重叠。推荐空档只作为建议。</p></div>' +
      '<form id="exam-form" class="form-grid"><label>患者姓名<input name="patientName" required placeholder="请输入姓名"></label>' +
      '<label>性别<select name="gender"><option>女</option><option>男</option></select></label>' +
      '<label>年龄<input name="age" type="number" min="0" max="120" value="45"></label>' +
      '<label>开单科室<select name="dept">' + S().departments.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>设备<select id="exam-device" name="deviceId">' + devices.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + ' · ' + esc(d.type) + '</option>'; }).join('') + '</select></label>' +
      '<label>检查项目<select id="exam-item" name="examItem"></select></label>' +
      '<label>检查日期<input id="exam-date" name="date" type="date" value="' + TODAY + '" min="' + TODAY + '" max="' + engine.addDays(TODAY, 7) + '"></label>' +
      '<label>开始时间<input id="exam-start" name="start" type="time" value="09:00" min="08:00" max="17:30"></label>' +
      '<label>时长（分钟）<input id="exam-duration" name="duration" type="number" min="10" max="90" value="30"></label>' +
      '<label>临床优先级<select name="priority"><option>常规</option><option>优先</option><option>紧急</option></select></label>' +
      '<label class="span-2">备注<input name="note" placeholder="例如：空腹 / 需家属陪同"></label>' +
      '<div class="span-2 ai-recommend-row"><div id="exam-suggest-text">' + icon('sparkles', 14) + '可选择设备后获取最近可用空档。</div><button type="button" class="btn btn-soft btn-tiny" data-action="suggest-exam-slot">' + icon('sparkles', 13) + '推荐空档</button></div>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '创建检查</button></div></form>';
    return modalShell('新建检查', body, '', true);
  }

  function renderMaintenanceModal() {
    let body = '<div class="form-intro">' + icon('tool', 17) + '<p>设备还有未完成检查时不能转入维护。恢复运行前请确认工程验收。</p></div>' +
      '<form id="maintenance-form" class="form-grid"><label class="span-2">设备<select name="deviceId">' + S().devices.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + ' · 当前' + esc(d.status) + '</option>'; }).join('') + '</select></label>' +
      '<label>目标状态<select name="status"><option value="维护中">转入维护</option><option value="运行中">恢复运行</option></select></label>' +
      '<label>维护说明<input name="note" placeholder="例如：球管预防性维护"></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '更新设备状态</button></div></form>';
    return modalShell('设备维护', body);
  }

  function renderLeaveModal() {
    let body = '<div class="form-intro">' + icon('staff', 17) + '<p>请假会直接把当天班次改为休息，并写入审计日志；如影响夜班间隔，需护士长再次确认。</p></div>' +
      '<form id="leave-form" class="form-grid"><label class="span-2">人员<select name="staffId">' + S().staff.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' · ' + esc(s.deptName) + ' · ' + esc(s.role) + '</option>'; }).join('') + '</select></label>' +
      '<label>日期<select name="date">' + S().weekDates.map(function (d, i) { return '<option value="' + d + '">' + S().weekLabels[i] + ' ' + d + '</option>'; }).join('') + '</select></label>' +
      '<label>原因<input name="reason" placeholder="例如：事假 / 病假"></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '登记请假</button></div></form>';
    return modalShell('请假登记', body, '', true);
  }

  function renderSwapModal() {
    let body = '<div class="form-intro">' + icon('staff', 17) + '<p>调班前会校验夜班后 11 小时间隔和连续夜班规则；冲突时阻断提交。</p></div>' +
      '<form id="swap-form" class="form-grid"><label class="span-2">人员<select name="staffId">' + S().staff.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' · ' + esc(s.deptName) + ' · ' + esc(s.role) + '</option>'; }).join('') + '</select></label>' +
      '<label>日期<select name="date">' + S().weekDates.map(function (d, i) { return '<option value="' + d + '">' + S().weekLabels[i] + ' ' + d + '</option>'; }).join('') + '</select></label>' +
      '<label>新班次<select name="newShift"><option>早</option><option>中</option><option>夜</option><option>白</option><option>休</option></select></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '提交调班</button></div></form>';
    return modalShell('调班', body, '', true);
  }

  function renderUserModal(d) {
    const editing = d.mode === 'edit';
    const target = editing ? S().users.find(function (u) { return u.id === d.id; }) : null;
    if (editing && !target) return modalShell('用户', emptyState('users', '用户不存在'), '');
    let body = '<form id="user-form" class="form-grid"><input type="hidden" name="id" value="' + (editing ? target.id : '') + '">' +
      '<label>姓名<input name="name" required value="' + esc(editing ? target.name : '') + '"></label>' +
      '<label>联系电话<input name="phone" value="' + esc(editing ? target.phone : '138****0000') + '"></label>' +
      '<label>角色<select name="role">' + S().rolePermissions.map(function (r) { return '<option value="' + r.code + '"' + (editing && target.role === r.code ? ' selected' : '') + '>' + esc(r.role) + '</option>'; }).join('') + '</select></label>' +
      '<label>部门<input name="dept" value="' + esc(editing ? target.dept : '运营管理部') + '"></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + (editing ? '保存修改' : '创建用户') + '</button></div></form>';
    return modalShell(editing ? '编辑用户' : '新增用户', body);
  }

  function renderKbEditModal(d) {
    const doc = S().knowledgeDocs.find(function (x) { return x.id === d.id; });
    if (!doc) return modalShell('编辑文档', emptyState('book', '文档不存在'), '');
    const content = doc.chunks.map(function (c) { return c.content; }).join('\n\n');
    let body = '<div class="form-intro">' + icon('book', 17) + '<p>保存后会重新切分并更新版本号，历史引用片段编号会重建。</p></div>' +
      '<form id="kb-edit-form" class="form-grid"><input type="hidden" name="id" value="' + doc.id + '">' +
      '<label>标题<input name="title" required value="' + esc(doc.title) + '"></label>' +
      '<label>分类<select name="category">' + ['床位管理', '预约管理', '检查管理', '人员排班', '运营预警', '系统治理'].map(function (c) { return '<option' + (doc.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>' +
      '<label>归口部门<input name="owner" value="' + esc(doc.owner) + '"></label>' +
      '<label class="span-2">正文<textarea name="content" rows="10" required>' + esc(content) + '</textarea></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('upload', 15) + '保存并重建索引</button></div></form>';
    return modalShell('编辑制度文档', body, '', true);
  }

  function renderAdmissionModal() {
    let body = '<div class="form-intro">' + icon('shield', 17) + '<p>入院申请由业务人员录入。临床优先级必须由主管医师标注，AI 只读取该字段，不自行判断。</p></div>' +
      '<form id="admission-form" class="form-grid"><label>患者姓名<input name="name" required placeholder="请输入姓名"></label>' +
      '<label>性别<select name="gender"><option>男</option><option>女</option></select></label>' +
      '<label>年龄<input name="age" type="number" min="0" max="120" value="58"></label>' +
      '<label>联系电话<input name="phone" placeholder="138****0000"></label>' +
      '<label>申请科室<select name="dept">' + S().departments.map(function (dep) { return '<option value="' + dep.id + '">' + esc(dep.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>床位类型<select name="bedType">' + ['三人间', '双人间', '单人间', '监护床', '隔离间'].map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></label>' +
      '<label>临床优先级<select name="priority"><option>常规</option><option>优先</option><option>紧急</option></select></label>' +
      '<label>护理等级<select name="careLevel"><option>二级护理</option><option>一级护理</option><option>三级护理</option></select></label>' +
      '<label>预计住院天数<input name="expectedStay" type="number" min="1" max="90" value="5"></label>' +
      '<label>诊断 / 收治原因<input name="diagnosis" placeholder="例如：股骨骨折术后"></label>' +
      '<label class="span-2">备注<textarea name="note" rows="2" placeholder="例如：需靠近护士站 / 家属陪护"></textarea></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '提交入院申请</button></div></form>';
    return modalShell('新建入院申请', body, '', true);
  }

  function renderAssignModal(d) {
    const bedId = d.bedId || (ui.drawer && ui.drawer.id);
    const bed = S().beds.find(function (b) { return b.id === bedId; });
    if (!bed) return modalShell('分配床位', emptyState('bed', '床位不存在'), '');
    const eligible = S().admissions.filter(function (a) {
      return a.status === '待分配' && engine.bedEligibility(bed, a, false).length === 0;
    });
    let body = '<div class="assign-bed-banner"><div><span class="eyebrow">' + esc(bed.wardName) + '</span><h3>' + esc(bed.code) + ' · ' + esc(bed.type) + '</h3><p>' + esc(bed.genderPolicy === '不限' ? '性别不限' : bed.genderPolicy + '性病房') + ' · ' + esc(bed.features.join(' · ')) + '</p></div>' + statusChip(bed.status) + '</div>';
    if (!eligible.length) {
      body += emptyState('alert', '没有符合硬约束的待入院患者', '该床位与当前申请的科室、类型、性别或隔离要求不匹配');
    } else {
      body += '<div class="form-intro">' + icon('shield', 17) + '<p>仅列出通过科室、床位类型、性别与隔离校验的患者。提交时会再次校验床位状态与版本。</p></div>' +
        '<form id="assign-form" class="form-grid"><input type="hidden" name="bedId" value="' + bed.id + '"><label class="span-2">选择患者<select name="admissionId">' +
        eligible.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + ' · ' + esc(a.deptName) + ' · ' + esc(a.bedType) + ' · ' + esc(a.priority) + '</option>'; }).join('') +
        '</select></label><div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('check', 15) + '确认分配</button></div></form>';
    }
    return modalShell('手动分配床位', body);
  }

  function renderKbModal() {
    let body = '<div class="form-intro">' + icon('book', 17) + '<p>上传后会按段落切分、提取关键词并加入本地检索索引。生产环境将使用向量化模型和向量数据库。</p></div>' +
      '<form id="kb-form" class="form-grid"><label>文档标题<input name="title" required placeholder="例如：骨科床位协调补充规定"></label>' +
      '<label>分类<select name="category"><option>床位管理</option><option>预约管理</option><option>检查管理</option><option>人员排班</option><option>运营预警</option><option>系统治理</option></select></label>' +
      '<label>归口部门<input name="owner" value="运营管理部"></label>' +
      '<label class="span-2">从文本文件导入（.txt / .md）<input id="kb-file" type="file" accept=".txt,.md,text/plain,text/markdown"></label>' +
      '<label class="span-2">正文<textarea name="content" id="kb-content" rows="9" required placeholder="粘贴制度正文，段落之间用空行分隔。"></textarea></label>' +
      '<div class="span-2 form-foot"><button type="button" class="btn btn-ghost" data-action="close-overlay">取消</button><button type="submit" class="btn btn-primary">' + icon('upload', 15) + '上传并建立索引</button></div></form>';
    return modalShell('上传运营制度', body, '', true);
  }

  function runGlobalSearch() {
    const input = document.getElementById('global-search-input');
    if (input) ui.searchQuery = input.value;
    const q = (ui.searchQuery || '').trim();
    if (!q) { ui.searchResults = null; renderOverlay(); return; }
    const lower = q.toLowerCase();
    ui.searchResults = {
      patients: S().patients.filter(function (p) { return (p.name + ' ' + p.id + ' ' + p.phone).toLowerCase().indexOf(lower) >= 0; }).slice(0, 5),
      beds: S().beds.filter(function (b) { return (b.code + ' ' + b.id + ' ' + (b.patientName || '')).toLowerCase().indexOf(lower) >= 0; }).slice(0, 5),
      admissions: S().admissions.filter(function (a) { return (a.name + ' ' + a.id + ' ' + a.patientId).toLowerCase().indexOf(lower) >= 0; }).slice(0, 4),
      plans: S().plans.filter(function (p) { return (p.title + ' ' + p.id).toLowerCase().indexOf(lower) >= 0; }).slice(0, 4)
    };
    renderOverlay();
  }

  function recommendAppointmentSlot() {
    const docSel = document.getElementById('appt-doctor');
    const dateEl = document.getElementById('appt-date');
    const patientEl = document.querySelector('#appointment-form [name="patientName"]');
    if (!docSel || !dateEl) return;
    const option = docSel.options[docSel.selectedIndex];
    const dept = option ? option.dataset.dept : null;
    const date = dateEl.value;
    const name = patientEl ? patientEl.value.trim() : '';
    const recs = engine.recommendSlots(S(), dept, date, name);
    const text = document.getElementById('appt-recommend-text');
    if (!recs.length) {
      if (text) text.innerHTML = icon('alert', 14) + '该科室在所选日期暂无可用号源，请更换日期。';
      return;
    }
    const top = recs[0];
    docSel.value = top.doctorId;
    updateAppointmentSlots();
    const slotSel = document.getElementById('appt-slot');
    if (slotSel) slotSel.value = top.slot;
    if (text) text.innerHTML = icon('sparkles', 14) + '推荐 <b>' + esc(top.doctorName) + '</b> · <b>' + esc(top.slot) + '</b> · ' + esc(top.reason) + (top.warning ? ' · <span class="text-danger">' + esc(top.warning) + '</span>' : '');
  }

  function renderConfirmModal(d) {
    return modalShell(d.title || '确认操作', '<div class="confirm-body">' + icon(d.danger ? 'alert' : 'info', 28) + '<p>' + esc(d.message || '') + '</p></div>',
      '<button class="btn btn-ghost" data-action="close-overlay">取消</button><button class="btn ' + (d.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm-run">' + esc(d.confirmLabel || '确认') + '</button>');
  }

  /* __MODALS2__ */

  // ------------------------------ Events ------------------------------
  function handleLogin(userId) {
    const res = store.login(userId);
    if (!res.ok) { toast(res.error, 'error'); return; }
    ui.loginError = '';
    ui.route = parseRoute();
    render();
    toast('已进入工作台 · ' + res.user.roleName);
  }

  function handleAction(action, el) {
    const id = el.dataset.id;
    switch (action) {
      case 'select-account':
        ui.loginUser = el.dataset.user;
        ui.loginError = '';
        render();
        break;
      case 'login-direct':
        handleLogin(el.dataset.user);
        break;
      case 'logout':
        store.logout();
        ui.workflow = null;
        ui.drawer = null;
        ui.modal = null;
        render();
        toast('已退出登录');
        break;
      case 'toggle-sidebar':
        document.body.classList.toggle('sidebar-open');
        break;
      case 'toggle-notif':
        ui.notifOpen = !ui.notifOpen;
        render();
        break;
      case 'toggle-profile':
        ui.profileOpen = !ui.profileOpen;
        ui.notifOpen = false;
        render();
        break;
      case 'open-search':
        ui.notifOpen = false;
        ui.searchResults = null;
        ui.searchQuery = '';
        setModal('search', {});
        break;
      case 'search-preset':
        ui.searchQuery = el.dataset.query;
        runGlobalSearch();
        break;
      case 'search-open':
        ui.modal = null;
        ui.searchResults = null;
        if (el.dataset.type === 'patient') { ui.drawer = { type: 'patient', id: el.dataset.id }; render(); }
        else if (el.dataset.type === 'bed') {
          const bed = S().beds.find(function (b) { return b.id === el.dataset.id; });
          if (bed) { ui.bedWard = bed.wardId; ui.route = 'beds'; location.hash = '#/beds'; ui.drawer = { type: 'bed', id: bed.id }; render(); }
        } else if (el.dataset.type === 'admission') { ui.drawer = { type: 'admission', id: el.dataset.id }; render(); }
        else if (el.dataset.type === 'plan') { ui.approvalId = el.dataset.id; ui.approvalTab = 'all'; ui.route = 'approvals'; location.hash = '#/approvals'; render(); }
        break;
      case 'ai-recommend':
        recommendAppointmentSlot();
        break;
      case 'close-overlay':
        if (ui.modal) closeModal(); else closeDrawer();
        break;
      case 'refresh-dashboard':
        (function () {
          let added = 0;
          if (can('alert.handle')) {
            const r = store.refreshAlerts();
            if (r.ok) added = r.count;
          } else {
            store.advance(1);
          }
          ui.lastUpdated = now();
          render();
          toast('数据已同步 · 新增 ' + added + ' 条规则预警 · ' + now().slice(11));
        })();
        break;
      case 'new-task':
        ui.workflow = null;
        go('dispatch');
        break;
      case 'go-analytics':
        go('analytics');
        break;
      case 'set-alert-level':
        ui.alertLevel = el.dataset.level;
        render();
        break;
      case 'set-alert-status':
        ui.alertStatus = el.dataset.status;
        render();
        break;
      case 'kb-sample':
        ui.kbQuery = el.dataset.query;
        ui.kbResults = engine.retrieveKnowledge(S().knowledgeDocs, ui.kbQuery, 4);
        ui.kbDocId = null;
        render();
        break;
      case 'switch-user':
        handleLogin(el.dataset.user);
        break;
      case 'replay-task':
        ui.workflow = null;
        ui.dispatchInput = el.dataset.prompt || '';
        go('dispatch');
        setTimeout(function () { runWorkflow(el.dataset.prompt || ''); }, 30);
        break;
      case 'open-dispatch-prompt':
        ui.dispatchInput = el.dataset.prompt || '';
        ui.workflow = null;
        go('dispatch');
        break;
      case 'open-plan':
        ui.approvalId = id;
        ui.approvalTab = 'all';
        ui.notifOpen = false;
        go('approvals');
        break;
      case 'select-approval':
        ui.approvalId = id;
        render();
        break;
      case 'approval-tab':
        ui.approvalTab = el.dataset.tab;
        const first = filteredPlans()[0];
        ui.approvalId = first ? first.id : null;
        render();
        break;
      case 'open-alert':
        ui.notifOpen = false;
        setDrawer('alert', id);
        break;
      case 'open-bed':
        setDrawer('bed', id);
        break;
      case 'open-patient':
        setDrawer('patient', id);
        break;
      case 'open-appointment':
        setDrawer('appointment', id);
        break;
      case 'open-admission':
        setDrawer('admission', id);
        break;
      case 'open-exam':
        setDrawer('exam', id);
        break;
      case 'open-kb-doc':
        ui.kbDocId = id;
        ui.kbResults = null;
        render();
        break;
      case 'open-bed-plan':
        ui.workflow = null;
        ui.dispatchInput = el.dataset.prompt || '帮我制定今天的床位分配方案';
        go('dispatch');
        break;
      case 'new-bed-plan':
        ui.dispatchInput = '帮我制定' + (ui.bedWard ? '' : '') + '今天的床位分配方案';
        ui.workflow = null;
        go('dispatch');
        break;
      case 'new-equipment-analysis':
        const dev = el.dataset.device || 'CT';
        const dateText = el.dataset.date === 'tomorrow' ? '明天' : '今天';
        ui.dispatchInput = '检查' + dateText + ' ' + dev + ' 设备是否存在预约冲突，并给出调整建议';
        ui.workflow = null;
        go('dispatch');
        break;
      case 'run-task':
        runWorkflowFromInput();
        break;
      case 'quick-prompt':
        ui.dispatchInput = el.dataset.prompt || '';
        runWorkflowFromInput();
        break;
      case 'new-workflow':
        ui.workflow = null;
        ui.dispatchInput = '';
        render();
        break;
      case 'skip-workflow':
        ui.fastWorkflow = true;
        toast('已加速工作流演出');
        break;
      case 'open-approval-from-workflow':
        if (ui.workflow && ui.workflow.planId) {
          ui.approvalId = ui.workflow.planId;
          ui.approvalTab = 'all';
          go('approvals');
        }
        break;
      case 'approve-plan':
        decideCurrentPlan('approve');
        break;
      case 'reject-plan':
        decideCurrentPlan('reject');
        break;
      case 'export-plan':
        exportPlan(id);
        break;
      case 'export-patients':
        exportPatients();
        break;
      case 'export-analytics':
        exportAnalytics();
        break;
      case 'new-appointment':
        setModal('appointment', {});
        break;
      case 'new-waitlist':
        setModal('waitlist', {});
        break;
      case 'checkin-appt':
        (function () {
          const r = store.checkInAppointment(id);
          if (!r.ok) { toast(r.error, 'error'); return; }
          closeDrawer(); render(); toast(r.message);
        })();
        break;
      case 'complete-appt':
        (function () {
          const r = store.completeAppointment(id);
          if (!r.ok) { toast(r.error, 'error'); return; }
          closeDrawer(); render(); toast(r.message);
        })();
        break;
      case 'reschedule-appt':
        setModal('reschedule', { id: id });
        break;
      case 'promote-waitlist':
        (function () {
          const r = store.promoteWaitlist(id);
          if (!r.ok) { toast(r.error, 'error'); return; }
          render(); toast(r.message);
        })();
        break;
      case 'remove-waitlist':
        (function () {
          const r = store.removeWaitlist(id);
          if (!r.ok) { toast(r.error, 'error'); return; }
          render(); toast(r.message);
        })();
        break;
      case 'new-exam':
        setModal('exam', {});
        break;
      case 'suggest-exam-slot':
        suggestExamSlot();
        break;
      case 'maintain-device':
        setModal('maintenance', {});
        break;
      case 'cancel-exam':
        openConfirm({
          title: '取消检查', message: '确认取消该检查预约？取消后设备时段会立即释放。',
          confirmLabel: '确认取消', danger: true, action: 'cancel-exam', payload: id
        });
        break;
      case 'generate-staff-plan':
        (function () {
          const r = store.createStaffPlan(el.dataset.dept || null);
          if (!r.ok) { toast(r.error, 'error'); return; }
          ui.approvalId = r.plan.id;
          ui.approvalTab = 'all';
          go('approvals');
          toast(r.existing ? '已存在待审批排班方案' : '排班调整方案已生成，等待审批');
        })();
        break;
      case 'request-leave':
        setModal('leave', {});
        break;
      case 'swap-shift':
        setModal('swap', {});
        break;
      case 'refresh-alerts':
        (function () {
          const r = store.refreshAlerts();
          if (!r.ok) { toast(r.error, 'error'); return; }
          render(); toast(r.message);
        })();
        break;
      case 'new-user':
        setModal('user', { mode: 'create' });
        break;
      case 'edit-user':
        setModal('user', { mode: 'edit', id: id });
        break;
      case 'toggle-user':
        (function () {
          const r = store.toggleUser(id);
          if (!r.ok) { toast(r.error, 'error'); return; }
          render(); toast(r.message);
        })();
        break;
      case 'edit-kb':
        setModal('kb-edit', { id: id });
        break;
      case 'new-admission':
        setModal('admission', {});
        break;
      case 'assign-bed':
        setModal('assign', { bedId: el.dataset.bed || (ui.drawer && ui.drawer.id) });
        break;
      case 'discharge-bed':
        const bedD = S().beds.find(function (b) { return b.id === (el.dataset.bed || (ui.drawer && ui.drawer.id)); });
        openConfirm({
          title: '办理出院', message: '确认将 ' + (bedD ? bedD.code + ' 床 ' + bedD.patientName : '该患者') + ' 办理出院？床位将进入待清洁状态。',
          confirmLabel: '确认出院', danger: false, action: 'discharge', payload: el.dataset.bed || (ui.drawer && ui.drawer.id)
        });
        break;
      case 'clean-bed':
        doBedAction('completeCleaning', el.dataset.bed || (ui.drawer && ui.drawer.id));
        break;
      case 'maintain-bed':
        doBedAction('setMaintenance', el.dataset.bed || (ui.drawer && ui.drawer.id));
        break;
      case 'restore-bed':
        doBedAction('restoreBed', el.dataset.bed || (ui.drawer && ui.drawer.id));
        break;
      case 'cancel-appointment':
        openConfirm({
          title: '取消预约', message: '确认取消该预约？取消后号源会立即释放，操作将写入审计日志。',
          confirmLabel: '确认取消', danger: true, action: 'cancel-appt', payload: el.dataset.id
        });
        break;
      case 'confirm-run':
        runConfirm();
        break;
      case 'alert-handle':
        handleAlertAction(el.dataset.status);
        break;
      case 'upload-kb':
        setModal('kb', {});
        break;
      case 'delete-kb':
        openConfirm({
          title: '删除知识文档', message: '确认删除《' + (S().knowledgeDocs.find(function (d) { return d.id === id; }) || {}).title + '》？删除后将不再参与 RAG 检索。',
          confirmLabel: '删除文档', danger: true, action: 'delete-kb', payload: id
        });
        break;
      case 'generate-report':
        ui.report = engine.generateOpsReport(S(), ui.analyticsRange);
        render();
        toast('AI 运营报告已生成 · 指标来自业务统计');
        break;
      case 'copy-report':
        copyReport();
        break;
      case 'reset-demo':
        openConfirm({
          title: '重置演示数据', message: '将清除本地审批、床位变更、预警处置和知识库上传记录，恢复到初始演示状态。此操作不可撤销。',
          confirmLabel: '重置演示', danger: true, action: 'reset', payload: null
        });
        break;
      case 'system-tab':
        ui.systemTab = el.dataset.tab;
        render();
        break;
      case 'set-range':
        ui.analyticsRange = Number(el.dataset.range);
        ui.report = null;
        render();
        break;
      case 'set-appt-date':
        ui.apptDate = el.dataset.date;
        ui.apptPage = 1;
        render();
        break;
      case 'set-equip-date':
        ui.equipDate = el.dataset.date;
        render();
        break;
      case 'set-equip-device':
        ui.equipDevice = el.dataset.device;
        render();
        break;
      case 'set-bed-ward':
        ui.bedWard = el.dataset.ward;
        render();
        break;
      case 'page-prev':
      case 'page-next':
        changePage(el.dataset.target, action === 'page-prev' ? -1 : 1);
        break;
      default:
        break;
    }
  }

  function changePage(target, dir) {
    const key = target + 'Page';
    const filtered = target === 'patient' ? filteredPatients() : (target === 'appt' ? filteredAppointments() : filteredAdmissions());
    const per = target === 'patient' ? 12 : 10;
    const pages = Math.max(1, Math.ceil(filtered.length / per));
    ui[key] = Math.min(pages, Math.max(1, (ui[key] || 1) + dir));
    render();
  }

  function downloadCSV(filename, rows) {
    const body = rows.map(function (row) {
      return row.map(function (v) {
        const s = String(v == null ? '' : v).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
    }).join('\r\n');
    const blob = new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    toast('已导出 ' + filename);
  }

  function exportPatients() {
    const rows = [['患者号', '姓名', '性别', '年龄', '类型', '状态', '科室', '床位', '诊断', '联系电话', '更新时间']];
    filteredPatients().forEach(function (p) {
      rows.push([p.id, p.name, p.gender, p.age, p.type, p.status, p.deptName, p.bedCode || '', p.diagnosis || '', p.phone, p.updatedAt]);
    });
    downloadCSV('MedFlow-患者档案-' + TODAY + '.csv', rows);
  }

  function exportPlan(id) {
    const plan = store.getPlan(id) || (ui.workflow && ui.workflow.planId ? store.getPlan(ui.workflow.planId) : null);
    if (!plan) { toast('未找到方案', 'error'); return; }
    if (plan.kind === 'bed') {
      const rows = [['审批单号', '患者', '性别', '年龄', '科室', '床位需求', '建议床位', '病区', '匹配分', '匹配依据']];
      (plan.matched || []).forEach(function (m) {
        rows.push([plan.id, m.patientName, m.gender, m.age, m.deptName, m.bedType, m.bedCode, m.wardName, m.score, m.reasons.join(' / ')]);
      });
      (plan.unmatched || []).forEach(function (u) {
        rows.push([plan.id, u.patientName, u.gender, u.age, u.deptName, u.bedType, '未匹配', '', '', u.reason]);
      });
      downloadCSV('MedFlow-床位方案-' + plan.id + '.csv', rows);
    } else if (plan.kind === 'staff') {
      const rows = [['审批单号', '人员', '科室', '日期', '原班次', '建议班次', '依据']];
      (plan.changes || []).forEach(function (c) { rows.push([plan.id, c.staffName, c.deptName, c.date, c.fromShift, c.toShift, c.reason]); });
      downloadCSV('MedFlow-排班方案-' + plan.id + '.csv', rows);
    } else {
      const rows = [['审批单号', '患者', '设备', '检查项目', '原时段', '目标时段', '原因']];
      (plan.changes || []).forEach(function (c) { rows.push([plan.id, c.patientName, c.deviceName || c.deviceId, c.examItem, c.from, c.to, c.reason]); });
      downloadCSV('MedFlow-检查调度方案-' + plan.id + '.csv', rows);
    }
  }

  function exportAnalytics() {
    const range = engine.getRangeStats(S(), ui.analyticsRange);
    const rows = [['日期', '预约量', '就诊量', '床位使用率(%)', '设备利用率(%)', '平均等待(分钟)', '取消率(%)']];
    range.labels.forEach(function (label, i) {
      rows.push([label, range.appointments[i], range.visits[i], range.occupancy[i], range.equipment[i], range.avgWait[i], range.cancellation[i]]);
    });
    downloadCSV('MedFlow-运营统计-' + ui.analyticsRange + '天-' + TODAY + '.csv', rows);
  }

  function decideCurrentPlan(decision) {
    const planId = ui.approvalId;
    const commentEl = document.getElementById('approval-comment');
    const comment = commentEl ? commentEl.value : '';
    const res = store.decidePlan(planId, decision, comment);
    if (!res.ok) { toast(res.error, 'error'); return; }
    ui.approvalTab = 'all';
    render();
    toast(res.message, 'success');
  }

  function doBedAction(method, bedId) {
    const res = store[method](bedId);
    if (!res.ok) { toast(res.error, 'error'); return; }
    render();
    toast(res.message);
  }

  function handleAlertAction(status) {
    if (!ui.drawer || ui.drawer.type !== 'alert') return;
    const noteEl = document.getElementById('alert-note');
    const res = store.handleAlert(ui.drawer.id, status, noteEl ? noteEl.value : '');
    if (!res.ok) { toast(res.error, 'error'); return; }
    render();
    toast('预警状态已更新为「' + status + '」');
  }

  function runConfirm() {
    const cfg = ui.confirmIntent;
    if (!cfg) return;
    let res;
    if (cfg.action === 'discharge') res = store.discharge(cfg.payload);
    else if (cfg.action === 'cancel-appt') res = store.cancelAppointment(cfg.payload, '运营后台取消');
    else if (cfg.action === 'cancel-exam') res = store.cancelExam(cfg.payload, '运营后台取消');
    else if (cfg.action === 'delete-kb') res = store.deleteKnowledgeDoc(cfg.payload);
    else if (cfg.action === 'reset') {
      store.reset();
      ui.workflow = null;
      closeModal();
      location.reload();
      return;
    }
    if (!res || !res.ok) { toast((res && res.error) || '操作失败', 'error'); return; }
    closeModal();
    if (ui.drawer) closeDrawer();
    render();
    toast(res.message || '操作已完成');
  }

  function copyReport() {
    if (!ui.report) return;
    const r = ui.report;
    const text = r.title + '\n' + r.range + ' · ' + r.generatedAt + '\n\n' +
      r.sections.map(function (s) { return s.title + '\n' + s.body; }).join('\n\n') + '\n\n数据来源：' + r.dataSource;
    navigator.clipboard && navigator.clipboard.writeText(text).then(function () { toast('报告已复制到剪贴板'); })
      .catch(function () { toast('当前浏览器不允许剪贴板，请手动选择文本', 'info'); });
  }

  // ------------------------------ Forms / input ------------------------------
  document.addEventListener('click', function (e) {
    const actionEl = e.target.closest('[data-action]');
    if (ui.profileOpen && !e.target.closest('.profile-wrap') && !(actionEl && actionEl.dataset.action === 'toggle-profile')) {
      ui.profileOpen = false;
      if (!actionEl) { render(); return; }
    }
    if (ui.notifOpen && !e.target.closest('.notif-wrap') && !actionEl) {
      ui.notifOpen = false;
      render();
      return;
    }
    if (!actionEl) return;
    if (actionEl.tagName === 'A' && actionEl.getAttribute('href')) return;
    e.preventDefault();
    handleAction(actionEl.dataset.action, actionEl);
  });

  document.addEventListener('change', function (e) {
    const el = e.target.closest('[data-filter]');
    if (el) {
      const key = el.dataset.filter;
      ui[key] = el.value;
      if (key === 'patientType' || key === 'patientDept') ui.patientPage = 1;
      if (key === 'apptStatus' || key === 'apptDept' || key === 'apptDoctor') ui.apptPage = 1;
      if (key === 'admissionStatus' || key === 'admissionDept') ui.admissionPage = 1;
      render();
      return;
    }
    const sortEl = e.target.closest('[data-sort]');
    if (sortEl) { ui.sort = sortEl.value; render(); }
    if (e.target.id === 'appt-dept') {
      const docSel = document.getElementById('appt-doctor');
      if (docSel) {
        const first = Array.prototype.find.call(docSel.options, function (o) { return o.dataset.dept === e.target.value; });
        if (first) docSel.value = first.value;
      }
      updateAppointmentSlots();
    }
    if (e.target.id === 'appt-doctor' || e.target.id === 'appt-date') updateAppointmentSlots();
    if (e.target.id === 'res-date') updateRescheduleSlots();
    if (e.target.id === 'exam-device') updateExamForm();
    if (e.target.id === 'kb-file' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = function () {
        const text = String(reader.result || '');
        const contentEl = document.getElementById('kb-content');
        if (contentEl) contentEl.value = text;
        const titleEl = document.querySelector('#kb-form [name="title"]');
        if (titleEl && !titleEl.value) titleEl.value = file.name.replace(/\.[^.]+$/, '');
      };
      reader.readAsText(file, 'utf-8');
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'dispatch-input') ui.dispatchInput = e.target.value;
    if (e.target.id === 'global-search-input') ui.searchQuery = e.target.value;
    if (e.target.id === 'audit-query') ui.auditQuery = e.target.value;
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setModal('search', {});
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && document.getElementById('dispatch-input')) {
      e.preventDefault();
      runWorkflowFromInput();
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target;
    const formId = form.getAttribute ? form.getAttribute('id') : '';
    if (formId === 'login-form') {
      e.preventDefault();
      const pass = (document.getElementById('login-password') || {}).value || '';
      if (pass !== 'medflow2026') {
        ui.loginError = '演示密码为 medflow2026';
        render();
        return;
      }
      handleLogin(ui.loginUser);
    }
    if (formId === 'appointment-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.createAppointment({
        patientName: fd.get('patientName'), phone: fd.get('phone'), gender: fd.get('gender'),
        age: fd.get('age'), dept: fd.get('dept'), doctorId: fd.get('doctorId'),
        date: fd.get('date'), slot: fd.get('slot'), reason: fd.get('reason')
      });
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal();
      render();
      toast('预约已创建 · ' + res.appointment.doctorName + ' ' + res.appointment.date + ' ' + res.appointment.slot);
    }
    if (formId === 'admission-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.createAdmission({
        name: fd.get('name'), gender: fd.get('gender'), age: fd.get('age'), phone: fd.get('phone'),
        dept: fd.get('dept'), bedType: fd.get('bedType'), priority: fd.get('priority'),
        diagnosis: fd.get('diagnosis'), careLevel: fd.get('careLevel'), expectedStay: fd.get('expectedStay'),
        note: fd.get('note'), isolation: fd.get('bedType') === '隔离间'
      });
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal();
      render();
      toast('入院申请已创建 · ' + res.admission.name + ' · ' + res.admission.deptName);
    }
    if (formId === 'assign-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.manualAssign(fd.get('bedId'), fd.get('admissionId'));
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); closeDrawer(); render();
      toast('床位分配成功 · ' + res.result.bed.code);
    }
    if (formId === 'kb-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.addKnowledgeDoc({
        title: fd.get('title'), category: fd.get('category'), owner: fd.get('owner'),
        content: fd.get('content')
      });
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); ui.kbDocId = res.doc.id; ui.kbResults = null; render();
      toast('文档已入库并完成切分 · ' + res.doc.chunks.length + ' 个片段');
    }
    if (formId === 'waitlist-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.addWaitlist({
        patientName: fd.get('patientName'), phone: fd.get('phone'), dept: fd.get('dept'),
        doctorId: fd.get('doctorId'), preferredDate: fd.get('preferredDate'),
        preferredPeriod: fd.get('preferredPeriod'), priority: fd.get('priority'), note: fd.get('note')
      });
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); render(); toast(res.message);
    }
    if (formId === 'reschedule-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.rescheduleAppointment(fd.get('id'), fd.get('date'), fd.get('slot'));
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); closeDrawer(); render(); toast(res.message);
    }
    if (formId === 'exam-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.createExam({
        patientName: fd.get('patientName'), gender: fd.get('gender'), age: fd.get('age'),
        dept: fd.get('dept'), deviceId: fd.get('deviceId'), examItem: fd.get('examItem'),
        date: fd.get('date'), start: fd.get('start'), duration: fd.get('duration'),
        priority: fd.get('priority'), note: fd.get('note')
      });
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); render(); toast(res.message);
    }
    if (formId === 'maintenance-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.setDeviceStatus(fd.get('deviceId'), fd.get('status'), fd.get('note'));
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); render(); toast(res.message);
    }
    if (formId === 'leave-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.requestLeave(fd.get('staffId'), fd.get('date'), fd.get('reason'));
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); render(); toast(res.message);
    }
    if (formId === 'swap-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.swapShift(fd.get('staffId'), fd.get('date'), fd.get('newShift'));
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); render(); toast(res.message);
    }
    if (formId === 'user-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const id = fd.get('id');
      const payload = { name: fd.get('name'), phone: fd.get('phone'), role: fd.get('role'), dept: fd.get('dept') };
      const res = id ? store.updateUser(id, payload) : store.createUser(payload);
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); render(); toast(res.message);
    }
    if (formId === 'kb-edit-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const res = store.updateKnowledgeDoc(fd.get('id'), {
        title: fd.get('title'), category: fd.get('category'), owner: fd.get('owner'), content: fd.get('content')
      });
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); ui.kbDocId = fd.get('id'); ui.kbResults = null; render(); toast(res.message);
    }
    if (formId === 'search-form') {
      e.preventDefault();
      runGlobalSearch();
    }
    if (formId === 'kb-search-form') {
      e.preventDefault();
      const input = document.getElementById('kb-search-input');
      ui.kbQuery = input ? input.value : ui.kbQuery;
      ui.kbResults = engine.retrieveKnowledge(S().knowledgeDocs, ui.kbQuery, 4);
      ui.kbDocId = null;
      render();
    }
  });

  window.addEventListener('hashchange', function () {
    ui.route = parseRoute();
    ui.notifOpen = false;
    window.scrollTo(0, 0);
    render();
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 1100) document.body.classList.remove('sidebar-open');
  });

  // ------------------------------ Boot ------------------------------
  (function boot() {
    const params = new URLSearchParams(location.search);
    if (params.get('auto') === '1' && !user()) store.loginDemo('u-ops');
    ui.route = parseRoute();
    window.__MEDFLOW__ = { store: store, ui: ui, engine: engine, render: render };
    render();
    if (params.get('auto') === '1' && !params.get('silent')) {
      setTimeout(function () { toast('演示模式 · 已以运营主管身份进入', 'info'); }, 600);
    }
  })();
})();
