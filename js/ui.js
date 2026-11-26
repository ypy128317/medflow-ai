/* MedFlow AI · 轻量 UI 组件与 SVG 图表（零依赖） */
(function (root) {
  'use strict';

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    bed: '<path d="M3 19V8a2 2 0 0 1 2-2h9a5 5 0 0 1 5 5v8"/><path d="M3 15h18"/><path d="M7 10h3"/><path d="M3 19v2"/><path d="M21 19v2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="M8 15h2M14 15h2M8 18h2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    patient: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M12 14v4M10 16h4"/>',
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M6 11h3l2-4 2 7 2-3h3"/>',
    staff: '<path d="M6 3v6a3 3 0 0 0 6 0V3"/><path d="M9 9v12"/><path d="M18 3v18"/><path d="M15 3h6"/>',
    sparkles: '<path d="M12 3l1.4 4.1L17.5 8.5 13.4 10 12 14l-1.4-4L6.5 8.5l4.1-1.4L12 3z"/><path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14z"/><path d="M5 14l.6 1.9L7.5 16l-1.9.6L5 18.5l-.6-1.9L2.5 16l1.9-.6L5 14z"/>',
    approval: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 6-7"/>',
    alert: '<path d="M10.3 3.8L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2V5z"/><path d="M4 17a2 2 0 0 1 2-2h13"/><path d="M8 7h7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    robot: '<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6"/><path d="M2 12v3M22 12v3"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-3-3 2.4-2.4z"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    external: '<path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    building: '<path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M15 9h4a1 1 0 0 1 1 1v11"/><path d="M8 7h3M8 11h3M8 15h3M2 21h20"/>',
    stethoscope: '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14 9l2 2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    play: '<path d="M8 5v14l11-7L8 5z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h5a4 4 0 0 0 4-4V9M18 7v2"/>'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name, size, cls) {
    const body = ICONS[name] || ICONS.info;
    return '<svg class="icon ' + (cls || '') + '" width="' + (size || 18) + '" height="' + (size || 18) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  function chip(text, kind) {
    return '<span class="chip chip-' + (kind || 'neutral') + '">' + esc(text) + '</span>';
  }
  function statusChip(status) {
    const map = {
      '待确认': 'warning', '已预约': 'info', '已签到': 'teal', '已完成': 'success',
      '已取消': 'muted', '已过期': 'muted', '待分配': 'warning', '已分配': 'success',
      '空闲': 'success', '已入住': 'info', '待清洁': 'warning', '维护中': 'muted',
      '已预留': 'purple', '暂停使用': 'muted', '待审批': 'warning', '已批准': 'success',
      '已驳回': 'danger', '已撤销': 'muted', '执行失败': 'danger', '执行成功': 'success',
      '待处理': 'danger', '处理中': 'warning', '已处理': 'success', '已忽略': 'muted',
      '运行中': 'success', '维护中': 'warning', '紧急': 'danger', '高': 'danger', '中': 'warning', '低': 'info',
      '已完成': 'success', '进行中': 'teal', '已预约': 'info', '启用': 'success', '停用': 'muted'
    };
    return chip(status, map[status] || 'neutral');
  }
  function levelChip(level) {
    return '<span class="level level-' + ({ '紧急': 'urgent', '高': 'high', '中': 'mid', '低': 'low' }[level] || 'low') + '">' +
      '<i></i>' + esc(level) + '</span>';
  }
  function avatar(name, color, size) {
    const s = size || 34;
    const ch = String(name || '?').slice(0, 1);
    return '<span class="avatar" style="width:' + s + 'px;height:' + s + 'px;background:' + (color || '#0f766e') +
      ';font-size:' + Math.max(11, Math.round(s * 0.4)) + 'px">' + esc(ch) + '</span>';
  }
  function pageHead(eyebrow, title, subtitle, actions) {
    return '<div class="page-head">' +
      '<div class="page-head-copy"><div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(title) + '</h1>' +
      '<p>' + esc(subtitle) + '</p></div>' +
      '<div class="page-actions">' + (actions || '') + '</div></div>';
  }
  function cardHead(title, sub, right) {
    return '<div class="card-head"><div><h3>' + esc(title) + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      (right ? '<div class="card-head-right">' + right + '</div>' : '') + '</div>';
  }
  function emptyState(iconName, title, sub, action) {
    return '<div class="empty-state">' + icon(iconName || 'info', 30) + '<strong>' + esc(title) + '</strong>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') + (action || '') + '</div>';
  }
  function progress(value, color, height) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return '<div class="progress" style="height:' + (height || 6) + 'px"><span style="width:' + v + '%;background:' + (color || '#0f766e') + '"></span></div>';
  }
  function sparkline(values, color) {
    const arr = (values || []).map(Number);
    if (!arr.length) return '';
    const w = 116, h = 34, pad = 3;
    const min = Math.min.apply(null, arr), max = Math.max.apply(null, arr);
    const span = max - min || 1;
    const pts = arr.map(function (v, i) {
      return [pad + i * (w - pad * 2) / (arr.length - 1 || 1), h - pad - ((v - min) / span) * (h - pad * 2)];
    });
    const d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    const area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (h - 1) + ' L' + pts[0][0].toFixed(1) + ' ' + (h - 1) + ' Z';
    const id = 'sg' + Math.random().toString(36).slice(2, 7);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".24"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + id + ')"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="2.6" fill="' + color + '"/></svg>';
  }

  function comboChart(opts) {
    const w = 760, h = 286, pl = 46, pr = 18, pt = 26, pb = 38;
    const labels = opts.labels || [];
    const bars = (opts.bars || []).map(Number);
    const line = (opts.line || []).map(Number);
    const barMax = Math.max.apply(null, bars.concat([1])) * 1.25;
    const lineMin = Math.min.apply(null, line) - 1.8;
    const lineMax = Math.max.apply(null, line) + 1.8;
    const pw = w - pl - pr, ph = h - pt - pb;
    const x = function (i) { return pl + (i + 0.5) * pw / (labels.length || 1); };
    const yLine = function (v) { return pt + ph - ((v - lineMin) / (lineMax - lineMin || 1)) * ph; };
    const yBar = function (v) { return pt + ph - (v / barMax) * ph; };
    const grid = [];
    for (let i = 0; i <= 4; i++) {
      const yy = pt + ph * i / 4;
      const val = lineMax - (lineMax - lineMin) * i / 4;
      grid.push('<line x1="' + pl + '" y1="' + yy.toFixed(1) + '" x2="' + (w - pr) + '" y2="' + yy.toFixed(1) + '" stroke="#e9efec" stroke-dasharray="3 4"/>' +
        '<text x="' + (pl - 10) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end" class="axis-label">' + val.toFixed(0) + '%</text>');
    }
    const barW = Math.min(26, (pw / labels.length) * 0.4);
    const barsHtml = bars.map(function (v, i) {
      const yy = yBar(v);
      return '<rect x="' + (x(i) - barW / 2).toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + barW + '" height="' + (pt + ph - yy).toFixed(1) +
        '" rx="5" fill="' + (opts.barColor || '#99d5ca') + '" opacity=".72"><title>' + esc(labels[i]) + ' ' + (opts.barLabel || '预约') + ' ' + v + '</title></rect>';
    }).join('');
    const points = line.map(function (v, i) { return [x(i), yLine(v)]; });
    const path = points.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    const area = path + ' L' + points[points.length - 1][0].toFixed(1) + ' ' + (pt + ph) + ' L' + points[0][0].toFixed(1) + ' ' + (pt + ph) + ' Z';
    const dots = points.map(function (p, i) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (i === points.length - 1 ? 4.2 : 3) + '" fill="#fff" stroke="' + (opts.lineColor || '#0f766e') + '" stroke-width="2"/>' +
        '<title>' + esc(labels[i]) + ' ' + (opts.lineLabel || '床位使用率') + ' ' + line[i] + '%</title>';
    }).join('');
    const labelsHtml = labels.map(function (l, i) {
      return '<text x="' + x(i).toFixed(1) + '" y="' + (h - 12) + '" text-anchor="middle" class="axis-label">' + esc(l) + '</text>';
    }).join('');
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + w + ' ' + h + '" class="chart">' +
      '<defs><linearGradient id="lineArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (opts.lineColor || '#0f766e') + '" stop-opacity=".18"/><stop offset="1" stop-color="' + (opts.lineColor || '#0f766e') + '" stop-opacity="0"/></linearGradient></defs>' +
      grid.join('') + barsHtml + '<path d="' + area + '" fill="url(#lineArea)"/>' +
      '<path d="' + path + '" fill="none" stroke="' + (opts.lineColor || '#0f766e') + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + labelsHtml + '</svg>' +
      '<div class="chart-legend"><span><i style="background:' + (opts.barColor || '#99d5ca') + '"></i>' + esc(opts.barLabel || '预约量') + '</span>' +
      '<span><i class="line-dot" style="background:' + (opts.lineColor || '#0f766e') + '"></i>' + esc(opts.lineLabel || '床位使用率') + '</span></div></div>';
  }

  function donutChart(segments, centerValue, centerLabel, size) {
    const s = size || 190, r = 64, cx = s / 2, cy = s / 2, sw = 18;
    const total = segments.reduce(function (a, x) { return a + x.count; }, 0) || 1;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const rings = segments.map(function (seg) {
      const frac = seg.count / total;
      const dash = frac * circ;
      const el = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + seg.color +
        '" stroke-width="' + sw + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + (circ - dash).toFixed(2) +
        '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-linecap="butt"><title>' +
        esc(seg.status) + ' ' + seg.count + ' 张</title></circle>';
      offset += dash;
      return el;
    }).join('');
    return '<div class="donut-wrap" style="width:' + s + 'px"><svg viewBox="0 0 ' + s + ' ' + s + '" style="width:' + s + 'px;height:' + s + 'px">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eef4f1" stroke-width="' + sw + '"/>' + rings +
      '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="donut-value">' + esc(centerValue) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle" class="donut-label">' + esc(centerLabel) + '</text></svg></div>';
  }

  function barList(rows, opts) {
    const max = opts && opts.max ? opts.max : Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return '<div class="bar-list">' + rows.map(function (r) {
      return '<div class="bar-row"><div class="bar-row-label"><span>' + esc(r.label) + '</span><strong>' + esc(r.display != null ? r.display : r.value) + '</strong></div>' +
        '<div class="bar-track"><span style="width:' + Math.max(3, r.value / max * 100).toFixed(1) + '%;background:' + (r.color || '#0f766e') + '"></span></div>' +
        (r.sub ? '<div class="bar-row-sub">' + esc(r.sub) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString('zh-CN');
  }
  function daysFromNow(dateStr, today) {
    const a = new Date(dateStr + 'T00:00:00Z'), b = new Date(today + 'T00:00:00Z');
    return Math.round((a - b) / 86400000);
  }

  root.MedFlowUI = {
    esc: esc, icon: icon, chip: chip, statusChip: statusChip, levelChip: levelChip,
    avatar: avatar, pageHead: pageHead, cardHead: cardHead, emptyState: emptyState,
    progress: progress, sparkline: sparkline, comboChart: comboChart, donutChart: donutChart,
    barList: barList, formatNumber: formatNumber, daysFromNow: daysFromNow
  };
})(typeof self !== 'undefined' ? self : this);
