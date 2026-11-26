/*
 * MedFlow AI · 合成医院运营数据
 * 所有患者、床位、预约、检查与人员数据均为演示用合成数据，不含任何真实隐私信息。
 * 固定业务日期，保证每次打开演示的指标、冲突和方案可复现。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MedFlowData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEMO_DATE = '2026-11-06';
  const DEMO_NOW = '2026-11-06 14:20';
  const DEMO_WEEKDAY = '周五';

  function pad(n) { return String(n).padStart(2, '0'); }
  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function shortDate(dateStr) {
    const p = dateStr.split('-');
    return Number(p[1]) + '月' + Number(p[2]) + '日';
  }
  function minutes(t) {
    const p = t.split(':').map(Number);
    return p[0] * 60 + p[1];
  }
  function hhmm(min) {
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }
  function between(t, a, b) {
    return minutes(t) >= minutes(a) && minutes(t) <= minutes(b);
  }

  const DEPARTMENTS = [
    { id: 'ortho', name: '骨科', short: '骨科', color: '#0f766e', wards: ['ORTHO-A', 'ORTHO-B'], director: '赵志强', phone: '8101' },
    { id: 'cardio', name: '心内科', short: '心内', color: '#2563eb', wards: ['CARDIO'], director: '韩立新', phone: '8201' },
    { id: 'neuro', name: '神经内科', short: '神内', color: '#7c3aed', wards: ['NEURO'], director: '徐文', phone: '8301' },
    { id: 'resp', name: '呼吸内科', short: '呼吸', color: '#0891b2', wards: ['RESP'], director: '高翔', phone: '8401' },
    { id: 'gs', name: '普外科', short: '普外', color: '#d97706', wards: ['GS'], director: '何建', phone: '8501' },
    { id: 'onco', name: '肿瘤科', short: '肿瘤', color: '#be123c', wards: ['ONCO'], director: '沈岚', phone: '8601' },
    { id: 'peds', name: '儿科', short: '儿科', color: '#16a34a', wards: ['PEDS'], director: '唐悦', phone: '8701' }
  ];

  const ROOM_SPECS = [
    { no: '01', count: 3, type: '三人间', gender: '男' },
    { no: '02', count: 3, type: '三人间', gender: '女' },
    { no: '03', count: 2, type: '双人间', gender: '男' },
    { no: '04', count: 2, type: '双人间', gender: '女' },
    { no: '05', count: 1, type: '单人间', gender: '不限' },
    { no: '06', count: 1, type: '隔离间', gender: '不限' }
  ];

  // 状态顺序对应 12 张床位：O 入住 / F 空闲 / C 待清洁 / M 维护 / R 预留
  const WARD_SPECS = [
    { code: 'ORTHO-A', name: '骨科一病区', dept: 'ortho', floor: 3, side: '东区', nurse: '王丽', phone: '8301', statuses: ['O','O','F','O','C','O','O','O','F','M','O','O'], specialType: null },
    { code: 'ORTHO-B', name: '骨科二病区', dept: 'ortho', floor: 3, side: '西区', nurse: '陈晨', phone: '8302', statuses: ['O','O','O','O','O','O','O','O','O','O','F','O'], specialType: null },
    { code: 'CARDIO', name: '心内科病区', dept: 'cardio', floor: 5, side: '东区', nurse: '刘芳', phone: '8501', statuses: ['O','O','O','O','O','O','F','O','O','O','O','O'], specialType: '监护床' },
    { code: 'NEURO', name: '神经内科病区', dept: 'neuro', floor: 6, side: '东区', nurse: '周敏', phone: '8601', statuses: ['O','O','O','O','O','O','O','O','F','O','F','O'], specialType: null },
    { code: 'RESP', name: '呼吸内科病区', dept: 'resp', floor: 4, side: '西区', nurse: '郑洁', phone: '8401', statuses: ['O','O','O','O','O','O','O','O','F','C','O','F'], specialType: null },
    { code: 'GS', name: '普外科病区', dept: 'gs', floor: 7, side: '东区', nurse: '张薇', phone: '8701', statuses: ['O','O','F','O','O','O','O','O','O','O','O','O'], specialType: null },
    { code: 'ONCO', name: '肿瘤科病区', dept: 'onco', floor: 8, side: '西区', nurse: '李娜', phone: '8801', statuses: ['O','O','O','O','O','O','O','O','O','O','F','R'], specialType: null },
    { code: 'PEDS', name: '儿科病区', dept: 'peds', floor: 2, side: '东区', nurse: '陈露', phone: '8202', statuses: ['O','O','O','O','O','O','O','O','O','O','F','O'], specialType: null }
  ];

  const OCCUPANT_NAMES = [
    '李桂英', '王德海', '张淑珍', '刘振华', '陈玉兰', '杨志明', '赵秀云', '黄文山', '周桂芳', '吴国栋',
    '徐秀梅', '孙立国', '马凤兰', '朱建军', '胡秀英', '郭明远', '何淑华', '高长林', '林玉珍', '罗志刚',
    '郑桂香', '梁国强', '谢秀荣', '宋建平', '唐玉华', '许志远', '邓淑芬', '冯国华', '曾秀英', '彭立新',
    '苏桂兰', '蒋文华', '蔡秀珍', '贾建国', '丁玉梅', '魏志强', '薛淑珍', '叶国平', '阎秀云', '余建华',
    '潘桂英', '杜志国', '戴秀兰', '夏建明', '钟玉珍', '汪国华', '田秀芳', '任志远', '姜桂芝', '范建平',
    '方秀华', '石国栋', '姚玉兰', '谭志刚', '廖桂珍', '邹建国', '熊秀英', '金志华', '陆桂芳', '郝建东',
    '孔玉梅', '白国华', '崔秀兰', '康志远', '毛桂英', '邱建平', '秦秀珍', '江国栋', '史玉华', '顾志刚',
    '侯桂兰', '邵建国', '孟秀英', '龙志华', '万桂芳', '段建东', '雷玉梅', '钱国华', '汤秀兰', '尹志远',
    '黎桂英', '易建平', '常秀珍', '武国栋', '乔玉华', '贺志刚', '赖桂兰', '龚建国', '文秀英', '庞志华'
  ];

  const OUTPATIENT_NAMES = [
    '张伟', '王芳', '李娜', '刘洋', '陈静', '杨帆', '赵磊', '黄敏', '周涛', '吴倩',
    '徐亮', '孙丽', '马超', '朱婷', '胡军', '郭燕', '何平', '高远', '林雪', '罗刚',
    '郑爽', '梁晨', '谢宇', '宋佳', '唐磊', '许晴', '邓超', '冯雪', '曾毅', '彭飞'
  ];

  const DIAGNOSES = {
    ortho: ['髋关节置换术后', '腰椎间盘突出', '股骨骨折术后', '膝关节镜术后', '颈椎病'],
    cardio: ['冠心病', '心律失常', '高血压病', '慢性心衰'],
    neuro: ['脑梗死恢复期', '眩晕综合征', '帕金森病', '面神经炎'],
    resp: ['社区获得性肺炎', '慢阻肺急性加重', '支气管哮喘', '胸腔积液'],
    gs: ['胆囊结石', '腹股沟疝', '阑尾炎术后', '甲状腺结节'],
    onco: ['肿瘤化疗周期', '术后随访', '靶向治疗', '营养支持'],
    peds: ['支气管肺炎', '急性扁桃体炎', '腹泻病', '高热惊厥']
  };

  let bedSeq = 0;
  const beds = [];
  const wards = WARD_SPECS.map(function (spec) {
    const dept = DEPARTMENTS.find(function (d) { return d.id === spec.dept; });
    const ward = {
      id: spec.code,
      name: spec.name,
      dept: spec.dept,
      deptName: dept.name,
      floor: spec.floor + 'F',
      side: spec.side,
      nurse: spec.nurse,
      phone: spec.phone,
      roomCount: 6,
      bedCount: 12,
      color: dept.color
    };
    const statusMap = { O: '已入住', F: '空闲', C: '待清洁', M: '维护中', R: '已预留' };
    let localIndex = 0;
    ROOM_SPECS.forEach(function (room, roomIndex) {
      for (let i = 1; i <= room.count; i++) {
        localIndex += 1;
        bedSeq += 1;
        const roomNo = String(spec.floor) + room.no;
        const status = statusMap[spec.statuses[localIndex - 1]] || '空闲';
        const type = room.type === '单人间' && spec.specialType ? spec.specialType : room.type;
        const bed = {
          id: spec.code + '-' + String(localIndex).padStart(2, '0'),
          code: roomNo + '-' + i,
          wardId: ward.id,
          wardName: ward.name,
          dept: ward.dept,
          deptName: ward.deptName,
          floor: ward.floor,
          room: roomNo,
          roomType: room.type,
          type: type,
          genderPolicy: room.gender,
          status: status,
          features: [],
          version: 1,
          patientId: null,
          patientName: null,
          admissionId: null,
          occupiedAt: null,
          expectedDischarge: null,
          cleaningStartedAt: null,
          cleaningDeadline: null,
          maintenanceNote: null,
          pausedReason: null,
          reservedFor: null,
          reservedUntil: null
        };
        if (room.no === '01') bed.features.push('靠近护士站');
        if (room.no === '05') bed.features.push('独立卫浴');
        if (room.no === '06') bed.features.push('独立卫浴', '感染隔离');
        if (type === '监护床') bed.features.push('心电监护', '中心供氧');
        if (room.gender === '男' || room.gender === '女') bed.features.push(room.gender + '性病房');
        bed.features.push(roomIndex % 2 === 0 ? '靠窗' : '近走廊');
        beds.push(bed);
      }
    });
    return ward;
  });

  const patients = [];
  const usedNames = {};
  let inpatientSeq = 0;
  let patientSeq = 0;

  function nextOccupantName(index) {
    let name = OCCUPANT_NAMES[index % OCCUPANT_NAMES.length];
    let n = 1;
    while (usedNames[name]) {
      name = OCCUPANT_NAMES[(index + n * 7) % OCCUPANT_NAMES.length];
      n += 1;
      if (n > 300) break;
    }
    usedNames[name] = true;
    return name;
  }

  const specialDischarge = {
    'ORTHO-A-12': '16:00',
    'ORTHO-B-09': '15:30',
    'ORTHO-B-10': '17:00',
    'CARDIO-04': '16:30',
    'NEURO-12': '15:00'
  };

  let nameCursor = 0;
  beds.forEach(function (bed) {
    if (bed.status !== '已入住') return;
    inpatientSeq += 1;
    patientSeq += 1;
    const name = nextOccupantName(nameCursor++);
    const gender = bed.genderPolicy === '不限' ? (inpatientSeq % 2 === 0 ? '女' : '男') : bed.genderPolicy;
    let age = 28 + ((inpatientSeq * 7) % 58);
    if (bed.dept === 'peds') age = 1 + (inpatientSeq % 12);
    const dischargeTime = specialDischarge[bed.id];
    const discharge = dischargeTime ? DEMO_DATE : addDays(DEMO_DATE, 4 + ((inpatientSeq * 3) % 7));
    const diagnoses = DIAGNOSES[bed.dept] || ['术后康复'];
    const patient = {
      id: 'PT-IP-' + String(patientSeq).padStart(4, '0'),
      name: name,
      gender: gender,
      age: age,
      phone: '138****' + String(1000 + ((inpatientSeq * 37) % 9000)).slice(-4),
      dept: bed.dept,
      deptName: bed.deptName,
      type: '住院',
      status: dischargeTime ? '待出院' : '住院',
      diagnosis: diagnoses[inpatientSeq % diagnoses.length],
      careLevel: ['一级护理', '二级护理', '三级护理'][inpatientSeq % 3],
      attending: DEPARTMENTS.find(function (d) { return d.id === bed.dept; }).director,
      bedId: bed.id,
      bedCode: bed.code,
      wardName: bed.wardName,
      admittedAt: addDays(DEMO_DATE, -(1 + (inpatientSeq % 8))) + ' ' + String(8 + (inpatientSeq % 9)).padStart(2, '0') + ':' + (inpatientSeq % 2 ? '20' : '40'),
      expectedDischarge: discharge,
      expectedDischargeTime: dischargeTime || '12:00',
      updatedAt: '2026-11-06 1' + (inpatientSeq % 3) + ':' + String(10 + (inpatientSeq % 45)).padStart(2, '0'),
      tags: dischargeTime ? ['今日预出院'] : []
    };
    bed.patientId = patient.id;
    bed.patientName = patient.name;
    bed.admissionId = 'IP-' + String(inpatientSeq).padStart(4, '0');
    bed.occupiedAt = patient.admittedAt;
    bed.expectedDischarge = discharge;
    bed.expectedDischargeTime = patient.expectedDischargeTime;
    patients.push(patient);
  });

  // 待清洁 / 维护 / 预留状态补充操作信息
  const bedById = function (id) { return beds.find(function (b) { return b.id === id; }); };
  const orthoCleaning = bedById('ORTHO-A-05');
  if (orthoCleaning) {
    orthoCleaning.cleaningStartedAt = '2026-11-06 14:55';
    orthoCleaning.cleaningDeadline = '2026-11-06 15:30';
    orthoCleaning.cleaningType = '终末清洁';
  }
  const respCleaning = bedById('RESP-10');
  if (respCleaning) {
    respCleaning.cleaningStartedAt = '2026-11-06 13:20';
    respCleaning.cleaningDeadline = '2026-11-06 14:05';
    respCleaning.cleaningType = '终末清洁';
    respCleaning.cleaningOverdue = true;
  }
  const maintenanceBed = bedById('ORTHO-A-10');
  if (maintenanceBed) {
    maintenanceBed.maintenanceNote = '电动床护栏维修 · 工单 FM-20261106-018';
    maintenanceBed.maintenanceUntil = '2026-11-07 10:00';
  }
  const reservedBed = bedById('ONCO-12');
  if (reservedBed) {
    reservedBed.reservedFor = '肿瘤科隔离待入院患者';
    reservedBed.reservedUntil = '2026-11-07 12:00';
  }

  // ------------------------- 入院申请 -------------------------
  const ADMISSION_SPECS = [
    {
      name: '张建国', gender: '男', age: 67, dept: 'ortho', bedType: '三人间', priority: '优先',
      appliedAt: '2026-11-06 08:12', diagnosis: '股骨颈骨折术后复查', careLevel: '二级护理',
      expectedStay: 7, source: '骨科门诊', attending: '赵志强', phone: '138****3107',
      requiredFeatures: ['靠近护士站'], isolation: false, note: '需助行器；家属陪护 1 人'
    },
    {
      name: '李秀兰', gender: '女', age: 72, dept: 'ortho', bedType: '双人间', priority: '常规',
      appliedAt: '2026-11-06 08:26', diagnosis: '腰椎间盘突出症', careLevel: '二级护理',
      expectedStay: 5, source: '骨科门诊', attending: '周雪', phone: '139****6281',
      requiredFeatures: [], isolation: false, note: '夜间需陪护'
    },
    {
      name: '王强', gender: '男', age: 45, dept: 'ortho', bedType: '单人间', priority: '优先',
      appliedAt: '2026-11-06 09:05', diagnosis: '膝关节镜术后', careLevel: '三级护理',
      expectedStay: 3, source: '骨科门诊', attending: '赵志强', phone: '137****1902',
      requiredFeatures: [], isolation: false, note: '患者书面申请单人间，已签署知情同意'
    },
    {
      name: '陈敏', gender: '女', age: 58, dept: 'cardio', bedType: '监护床', priority: '优先',
      appliedAt: '2026-11-06 07:50', diagnosis: '心律失常', careLevel: '一级护理',
      expectedStay: 4, source: '心内科门诊', attending: '韩立新', phone: '136****8824',
      requiredFeatures: ['心电监护'], isolation: false, note: '需持续心电监护；由主管医师标注优先'
    },
    {
      name: '刘洋', gender: '男', age: 34, dept: 'resp', bedType: '隔离间', priority: '优先',
      appliedAt: '2026-11-06 08:05', diagnosis: '社区获得性肺炎', careLevel: '二级护理',
      expectedStay: 6, source: '呼吸内科门诊', attending: '高翔', phone: '135****7719',
      requiredFeatures: ['感染隔离'], isolation: true, note: '接触隔离；需独立卫浴'
    },
    {
      name: '赵芳', gender: '女', age: 61, dept: 'neuro', bedType: '双人间', priority: '常规',
      appliedAt: '2026-11-06 09:20', diagnosis: '脑梗死恢复期', careLevel: '一级护理',
      expectedStay: 9, source: '神经内科门诊', attending: '徐文', phone: '138****4470',
      requiredFeatures: [], isolation: false, note: '需康复训练评估'
    },
    {
      name: '孙伟', gender: '男', age: 52, dept: 'gs', bedType: '三人间', priority: '常规',
      appliedAt: '2026-11-06 09:45', diagnosis: '胆囊结石伴胆囊炎', careLevel: '二级护理',
      expectedStay: 5, source: '普外科门诊', attending: '何建', phone: '139****2036',
      requiredFeatures: [], isolation: false, note: '拟行择期手术，术前检查已完成'
    },
    {
      name: '吴刚', gender: '男', age: 70, dept: 'onco', bedType: '单人间', priority: '常规',
      appliedAt: '2026-11-06 10:10', diagnosis: '肿瘤化疗周期', careLevel: '二级护理',
      expectedStay: 4, source: '肿瘤科门诊', attending: '沈岚', phone: '137****9135',
      requiredFeatures: [], isolation: false, note: '单人间用于化疗期间休息，患者自费'
    },
    {
      name: '郑霞', gender: '女', age: 49, dept: 'ortho', bedType: '三人间', priority: '常规',
      appliedAt: '2026-11-06 10:40', diagnosis: '踝关节骨折术后', careLevel: '二级护理',
      expectedStay: 6, source: '骨科门诊', attending: '周雪', phone: '136****5628',
      requiredFeatures: [], isolation: false, note: '需轮椅转运'
    },
    {
      name: '冯磊', gender: '男', age: 38, dept: 'cardio', bedType: '双人间', priority: '常规',
      appliedAt: '2026-11-06 11:05', diagnosis: '高血压病 3 级', careLevel: '三级护理',
      expectedStay: 3, source: '心内科门诊', attending: '罗敏', phone: '135****6703',
      requiredFeatures: [], isolation: false, note: '需动态血压监测'
    },
    {
      name: '何燕', gender: '女', age: 65, dept: 'resp', bedType: '双人间', priority: '常规',
      appliedAt: '2026-11-06 11:30', diagnosis: '慢阻肺急性加重', careLevel: '二级护理',
      expectedStay: 7, source: '呼吸内科门诊', attending: '高翔', phone: '138****1288',
      requiredFeatures: [], isolation: false, note: '需低流量吸氧'
    }
  ];

  const admissions = ADMISSION_SPECS.map(function (a, i) {
    patientSeq += 1;
    const patient = {
      id: 'PT-ADM-' + String(i + 1).padStart(4, '0'),
      name: a.name,
      gender: a.gender,
      age: a.age,
      phone: a.phone,
      dept: a.dept,
      deptName: DEPARTMENTS.find(function (d) { return d.id === a.dept; }).name,
      type: '待入院',
      status: '待入院',
      diagnosis: a.diagnosis,
      careLevel: a.careLevel,
      attending: a.attending,
      bedId: null,
      bedCode: null,
      wardName: null,
      admittedAt: null,
      expectedDischarge: null,
      updatedAt: a.appliedAt,
      tags: ['待床位']
    };
    patients.push(patient);
    return {
      id: 'ADM-20261106-' + String(i + 1).padStart(3, '0'),
      patientId: patient.id,
      name: a.name,
      gender: a.gender,
      age: a.age,
      phone: a.phone,
      dept: a.dept,
      deptName: patient.deptName,
      bedType: a.bedType,
      priority: a.priority,
      prioritySource: '主管医师标注',
      appliedAt: a.appliedAt,
      diagnosis: a.diagnosis,
      careLevel: a.careLevel,
      expectedStay: a.expectedStay,
      source: a.source,
      attending: a.attending,
      requiredFeatures: a.requiredFeatures,
      isolation: a.isolation,
      note: a.note,
      status: '待分配',
      assignedBedId: null,
      assignedAt: null
    };
  });

  // ------------------------- 门诊患者 -------------------------
  const outpatients = [];
  OUTPATIENT_NAMES.forEach(function (name, i) {
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    const patient = {
      id: 'PT-OP-' + String(i + 1).padStart(4, '0'),
      name: name,
      gender: i % 3 === 0 ? '男' : '女',
      age: 18 + ((i * 11) % 62),
      phone: '137****' + String(1000 + ((i * 73) % 9000)).slice(-4),
      dept: dept.id,
      deptName: dept.name,
      type: '门诊',
      status: i % 7 === 0 ? '复诊' : '门诊',
      diagnosis: (DIAGNOSES[dept.id] || ['健康咨询'])[i % 3],
      careLevel: '门诊',
      attending: dept.director,
      bedId: null,
      bedCode: null,
      wardName: null,
      admittedAt: null,
      expectedDischarge: null,
      updatedAt: '2026-11-0' + (1 + (i % 6)) + ' 1' + (i % 4) + ':' + String(10 + (i % 45)).padStart(2, '0'),
      tags: i % 7 === 0 ? ['复诊'] : []
    };
    outpatients.push(patient);
    patients.push(patient);
  });

  // ------------------------- 医生与号源 -------------------------
  const DOCTOR_SPECS = [
    { id: 'D-OR-01', name: '赵志强', dept: 'ortho', title: '主任医师', period: '上午', room: '门诊 3F A03', rating: 4.9, specialty: '关节外科' },
    { id: 'D-OR-02', name: '周雪', dept: 'ortho', title: '副主任医师', period: '下午', room: '门诊 3F A05', rating: 4.8, specialty: '脊柱外科' },
    { id: 'D-CA-01', name: '韩立新', dept: 'cardio', title: '主任医师', period: '上午', room: '门诊 5F B01', rating: 4.9, specialty: '冠心病' },
    { id: 'D-CA-02', name: '罗敏', dept: 'cardio', title: '副主任医师', period: '下午', room: '门诊 5F B03', rating: 4.7, specialty: '心律失常' },
    { id: 'D-NE-01', name: '徐文', dept: 'neuro', title: '主任医师', period: '上午', room: '门诊 6F C02', rating: 4.8, specialty: '脑血管病' },
    { id: 'D-RE-01', name: '高翔', dept: 'resp', title: '副主任医师', period: '下午', room: '门诊 4F D01', rating: 4.6, specialty: '慢阻肺' },
    { id: 'D-GS-01', name: '何建', dept: 'gs', title: '主任医师', period: '上午', room: '门诊 7F E03', rating: 4.8, specialty: '肝胆外科' },
    { id: 'D-ON-01', name: '沈岚', dept: 'onco', title: '副主任医师', period: '下午', room: '门诊 8F F02', rating: 4.7, specialty: '胸部肿瘤' },
    { id: 'D-PE-01', name: '唐悦', dept: 'peds', title: '主治医师', period: '上午', room: '门诊 2F G01', rating: 4.9, specialty: '小儿呼吸' }
  ];

  const AM_SLOTS = ['08:30', '08:50', '09:10', '09:30', '09:50', '10:10', '10:30', '10:50'];
  const PM_SLOTS = ['13:30', '13:50', '14:10', '14:30', '14:50', '15:10', '15:30', '15:50'];
  const doctors = DOCTOR_SPECS.map(function (d) {
    const dept = DEPARTMENTS.find(function (x) { return x.id === d.dept; });
    return Object.assign({}, d, {
      deptName: dept.name,
      color: dept.color,
      slots: d.period === '上午' ? AM_SLOTS.slice() : PM_SLOTS.slice(),
      clinicDays: [5, 6, 3],
      capacity: 8
    });
  });

  const appointments = [];
  let appointmentSeq = 0;
  function addAppointment(o) {
    appointmentSeq += 1;
    appointments.push(Object.assign({
      id: 'AP-20261106-' + String(appointmentSeq).padStart(4, '0'),
      code: 'A' + String(1100 + appointmentSeq),
      date: DEMO_DATE,
      status: '已预约',
      waitMinutes: 0,
      createdAt: '2026-11-05 16:20',
      source: '线上预约',
      note: ''
    }, o));
  }

  const AM_STATUS = ['已完成', '已完成', '已完成', '已完成', '已签到', '已完成', '已取消', '已过期'];
  const PM_STATUS = ['已完成', '已签到', '已签到', '已预约', '待确认', '已预约', '已取消', '待确认'];

  doctors.forEach(function (doc, di) {
    const slots = doc.slots;
    const skip = (di * 3 + 1) % slots.length;
    slots.forEach(function (slot, si) {
      if (si === skip && di !== 0) return;
      const patient = outpatients[(di * 7 + si * 3) % outpatients.length];
      let status = doc.period === '上午' ? AM_STATUS[si] : PM_STATUS[si];
      if (doc.period === '下午' && si >= 6) status = '已预约';
      if (doc.period === '下午' && si === 7) status = '待确认';
      const wait = (status === '已完成' || status === '已签到') ? 8 + ((di * 5 + si * 7) % 21) : 0;
      addAppointment({
        patientId: patient.id,
        patientName: patient.name,
        phone: patient.phone,
        dept: doc.dept,
        deptName: doc.deptName,
        doctorId: doc.id,
        doctorName: doc.name,
        title: doc.title,
        date: DEMO_DATE,
        slot: slot,
        status: status,
        waitMinutes: wait,
        room: doc.room,
        source: si % 3 === 0 ? '院内自助机' : '线上预约',
        createdAt: addDays(DEMO_DATE, -1 - (si % 4)) + ' ' + String(9 + (si % 8)).padStart(2, '0') + ':' + (si % 2 ? '20' : '40')
      });
    });
  });

  // 明日预约
  doctors.forEach(function (doc, di) {
    doc.slots.slice(0, 4).forEach(function (slot, si) {
      const patient = outpatients[(di * 5 + si + 11) % outpatients.length];
      addAppointment({
        patientId: patient.id,
        patientName: patient.name,
        phone: patient.phone,
        dept: doc.dept,
        deptName: doc.deptName,
        doctorId: doc.id,
        doctorName: doc.name,
        title: doc.title,
        date: addDays(DEMO_DATE, 1),
        slot: slot,
        status: si === 3 ? '待确认' : '已预约',
        waitMinutes: 0,
        room: doc.room,
        source: '线上预约',
        createdAt: '2026-11-05 18:10'
      });
    });
  });

  const appointmentStats = {
    todayTotal: appointments.filter(function (a) { return a.date === DEMO_DATE; }).length,
    todayValid: appointments.filter(function (a) { return a.date === DEMO_DATE && a.status !== '已取消'; }).length,
    todayVisited: appointments.filter(function (a) { return a.date === DEMO_DATE && (a.status === '已完成' || a.status === '已签到'); }).length
  };

  // 候补队列：按登记时间排序，有空号时由预约管理员确认补位
  const WAITLIST_SPECS = [
    { name: '周敏', phone: '137****5301', dept: 'ortho', doctorId: 'D-OR-02', date: addDays(DEMO_DATE, 1), period: '下午', source: '线上候补', note: '希望明天下午复诊' },
    { name: '许文', phone: '138****2214', dept: 'cardio', doctorId: 'D-CA-01', date: DEMO_DATE, period: '上午', source: '电话候补', note: '仅今天上午可到院' },
    { name: '郑小雨', phone: '139****6730', dept: 'neuro', doctorId: 'D-NE-01', date: addDays(DEMO_DATE, 1), period: '上午', source: '线上候补', note: '头晕复诊' },
    { name: '王海', phone: '136****9042', dept: 'resp', doctorId: 'D-RE-01', date: addDays(DEMO_DATE, 1), period: '下午', source: '院内自助机', note: '' },
    { name: '李倩', phone: '135****4471', dept: 'gs', doctorId: 'D-GS-01', date: addDays(DEMO_DATE, 1), period: '上午', source: '线上候补', note: '术后复查' },
    { name: '陈立', phone: '137****1189', dept: 'onco', doctorId: 'D-ON-01', date: addDays(DEMO_DATE, 2), period: '下午', source: '电话候补', note: '' },
    { name: '赵可', phone: '139****8822', dept: 'peds', doctorId: 'D-PE-01', date: addDays(DEMO_DATE, 1), period: '上午', source: '线上候补', note: '儿童发热复诊' },
    { name: '孙悦', phone: '138****6635', dept: 'ortho', doctorId: 'D-OR-01', date: addDays(DEMO_DATE, 2), period: '上午', source: '线上候补', note: '腰椎复诊' }
  ];
  const waitlist = WAITLIST_SPECS.map(function (w, i) {
    const dept = DEPARTMENTS.find(function (d) { return d.id === w.dept; });
    const doc = doctors.find(function (d) { return d.id === w.doctorId; });
    return {
      id: 'WL-20261106-' + String(i + 1).padStart(3, '0'),
      patientName: w.name,
      phone: w.phone,
      dept: w.dept,
      deptName: dept.name,
      doctorId: w.doctorId,
      doctorName: doc ? doc.name : '',
      preferredDate: w.date,
      preferredPeriod: w.period,
      priority: i === 1 ? '优先' : '常规',
      source: w.source,
      note: w.note,
      status: '等待中',
      registeredAt: '2026-11-06 ' + String(8 + (i % 6)).padStart(2, '0') + ':' + (i % 2 ? '20' : '40'),
      appointmentId: null,
      promotedAt: null
    };
  });

  const alertRules = {
    bedOccupancyHigh: 85,
    bedOccupancyUrgent: 95,
    departmentFreeThreshold: 2,
    cleaningOverdueMinutes: 30,
    equipmentConflict: true,
    staffConflict: true,
    cancellationRate: 5
  };

  // ------------------------- 检查设备 -------------------------
  const DEVICES = [
    { id: 'CT-01', name: 'CT-01', type: 'CT', model: 'GE Revolution 256', room: '影像中心 1F · CT 室 1', status: '运行中', open: '08:00-18:00', capabilities: ['头颅平扫', '胸部平扫', '腹部平扫', '增强 CT'], color: '#0f766e' },
    { id: 'CT-02', name: 'CT-02', type: 'CT', model: 'Siemens SOMATOM go', room: '影像中心 1F · CT 室 2', status: '运行中', open: '08:00-18:00', capabilities: ['头颅平扫', '胸部平扫', '骨三维重建'], color: '#0d9488' },
    { id: 'MRI-01', name: 'MRI-01', type: 'MRI', model: 'Siemens MAGNETOM Vida', room: '影像中心 B1 · MRI 室 1', status: '运行中', open: '08:00-18:00', capabilities: ['头颅 MRI', '脊柱 MRI', '关节 MRI'], color: '#2563eb' },
    { id: 'MRI-02', name: 'MRI-02', type: 'MRI', model: 'Philips Ingenia 3.0T', room: '影像中心 B1 · MRI 室 2', status: '维护中', open: '08:00-18:00', capabilities: ['头颅 MRI', '腹部 MRI', '盆腔 MRI'], color: '#1d4ed8' },
    { id: 'US-01', name: '超声-01', type: '超声', model: 'GE LOGIQ E10', room: '门诊 2F · 超声 1 室', status: '运行中', open: '08:00-18:00', capabilities: ['腹部超声', '心脏超声', '血管超声'], color: '#7c3aed' },
    { id: 'US-02', name: '超声-02', type: '超声', model: 'Philips EPIQ 7C', room: '门诊 2F · 超声 2 室', status: '运行中', open: '08:00-18:00', capabilities: ['腹部超声', '妇产超声', '甲状腺超声'], color: '#8b5cf6' },
    { id: 'US-03', name: '超声-03', type: '超声', model: 'Mindray Resona R9', room: '门诊 2F · 超声 3 室', status: '运行中', open: '08:00-18:00', capabilities: ['腹部超声', '泌尿超声', '肌骨超声'], color: '#a855f7' },
    { id: 'XR-01', name: 'DR-01', type: 'X 光', model: 'Philips DigitalDiagnost', room: '影像中心 1F · DR 室', status: '运行中', open: '08:00-18:00', capabilities: ['胸部正位', '四肢摄片', '脊柱摄片'], color: '#d97706' }
  ];

  const EXAMS_BY_TYPE = {
    CT: ['头颅平扫', '胸部平扫', '腹部平扫', '增强 CT', '骨三维重建', '冠脉 CTA'],
    MRI: ['头颅 MRI', '脊柱 MRI', '关节 MRI', '腹部 MRI', '盆腔 MRI'],
    '超声': ['腹部超声', '心脏超声', '血管超声', '甲状腺超声', '泌尿超声'],
    'X 光': ['胸部正位', '四肢摄片', '脊柱摄片', '骨盆正位']
  };
  const examPrep = {
    'CT': '去除金属物品；腹部检查需空腹 4 小时',
    'MRI': '去除所有金属物品；体内植入物需提前申报',
    '超声': '腹部超声需空腹 8 小时；泌尿超声需憋尿',
    'X 光': '去除项链、纽扣等金属物品'
  };
  const DURATIONS = { CT: 30, MRI: 40, '超声': 20, 'X 光': 15 };

  const exams = [];
  let examSeq = 0;
  function addExam(o) {
    examSeq += 1;
    exams.push(Object.assign({
      id: 'EX-20261000-' + String(examSeq).padStart(4, '0'),
      date: DEMO_DATE,
      status: '已预约',
      priority: '常规',
      prioritySource: '开单医师标注',
      prep: '',
      note: '',
      orderedBy: '门诊医师'
    }, o));
  }

  function statusFor(date, start, end) {
    if (date !== DEMO_DATE) return '已预约';
    if (minutes(end) <= minutes(DEMO_NOW.slice(11))) return '已完成';
    if (minutes(start) <= minutes(DEMO_NOW.slice(11))) return '进行中';
    return '已预约';
  }

  function buildDeviceDay(device, date, fillRate, offset) {
    const dur = DURATIONS[device.type];
    let t = 8 * 60;
    let idx = 0;
    while (t + dur <= 18 * 60) {
      const keep = ((idx + offset) % 10) < fillRate * 10;
      if (keep) {
        const p = outpatients[(examSeq * 3 + idx) % outpatients.length];
        const itemList = EXAMS_BY_TYPE[device.type];
        const start = hhmm(t);
        const end = hhmm(t + dur);
        addExam({
          patientId: p.id,
          patientName: p.name,
          gender: p.gender,
          age: p.age,
          dept: p.dept,
          deptName: p.deptName,
          deviceId: device.id,
          deviceName: device.name,
          deviceType: device.type,
          examItem: itemList[(idx + offset) % itemList.length],
          date: date,
          start: start,
          end: end,
          duration: dur,
          status: statusFor(date, start, end),
          priority: (idx % 11 === 0) ? '紧急' : (idx % 4 === 0 ? '优先' : '常规'),
          orderedBy: p.attending,
          prep: examPrep[device.type],
          room: device.room
        });
      }
      t += dur + (device.type === 'MRI' ? 10 : 5);
      idx += 1;
    }
  }

  DEVICES.forEach(function (device, di) {
    if (device.id === 'MRI-02') return; // 维护中，不排检查
    buildDeviceDay(device, DEMO_DATE, di % 3 === 0 ? 0.9 : 0.8, di);
    buildDeviceDay(device, addDays(DEMO_DATE, 1), 0.7, di + 2);
    buildDeviceDay(device, addDays(DEMO_DATE, 2), 0.55, di + 4);
  });

  // 清理冲突窗口内原有检查，再放入可控冲突
  function removeWindow(deviceId, date, start, end) {
    for (let i = exams.length - 1; i >= 0; i--) {
      const e = exams[i];
      if (e.deviceId === deviceId && e.date === date && e.start >= start && e.start < end) exams.splice(i, 1);
    }
  }
  removeWindow('CT-01', DEMO_DATE, '14:00', '15:40');
  removeWindow('CT-01', DEMO_DATE, '17:00', '18:00');
  removeWindow('CT-02', addDays(DEMO_DATE, 1), '09:00', '11:00');
  const conflictPatient1 = outpatients[3];
  const conflictPatient2 = outpatients[8];
  const conflictPatient3 = outpatients[12];
  const conflictPatient4 = outpatients[16];
  addExam({
    patientId: conflictPatient1.id, patientName: conflictPatient1.name, gender: conflictPatient1.gender, age: conflictPatient1.age,
    dept: conflictPatient1.dept, deptName: conflictPatient1.deptName, deviceId: 'CT-01', deviceName: 'CT-01', deviceType: 'CT',
    examItem: '胸部平扫', date: DEMO_DATE, start: '14:30', end: '15:00', duration: 30, status: '已预约',
    priority: '优先', orderedBy: '高翔', prep: examPrep.CT, room: '影像中心 1F · CT 室 1', note: '复查，已确认可按时到院'
  });
  addExam({
    patientId: conflictPatient2.id, patientName: conflictPatient2.name, gender: conflictPatient2.gender, age: conflictPatient2.age,
    dept: conflictPatient2.dept, deptName: conflictPatient2.deptName, deviceId: 'CT-01', deviceName: 'CT-01', deviceType: 'CT',
    examItem: '腹部平扫', date: DEMO_DATE, start: '14:45', end: '15:15', duration: 30, status: '已预约',
    priority: '常规', orderedBy: '何建', prep: examPrep.CT, room: '影像中心 1F · CT 室 1', note: '患者可调整至下午晚些时候'
  });
  addExam({
    patientId: conflictPatient3.id, patientName: conflictPatient3.name, gender: conflictPatient3.gender, age: conflictPatient3.age,
    dept: conflictPatient3.dept, deptName: conflictPatient3.deptName, deviceId: 'CT-02', deviceName: 'CT-02', deviceType: 'CT',
    examItem: '头颅平扫', date: addDays(DEMO_DATE, 1), start: '09:20', end: '09:50', duration: 30, status: '已预约',
    priority: '优先', orderedBy: '徐文', prep: examPrep.CT, room: '影像中心 1F · CT 室 2', note: '卒中随访'
  });
  addExam({
    patientId: conflictPatient4.id, patientName: conflictPatient4.name, gender: conflictPatient4.gender, age: conflictPatient4.age,
    dept: conflictPatient4.dept, deptName: conflictPatient4.deptName, deviceId: 'CT-02', deviceName: 'CT-02', deviceType: 'CT',
    examItem: '胸部平扫', date: addDays(DEMO_DATE, 1), start: '09:35', end: '10:05', duration: 30, status: '已预约',
    priority: '常规', orderedBy: '高翔', prep: examPrep.CT, room: '影像中心 1F · CT 室 2', note: '年度复查，可改期'
  });

  // ------------------------- 医护人员 -------------------------
  const STAFF_SPECS = [
    { name: '王丽', role: '护士长', dept: 'ortho', title: '主管护师', skills: ['骨科护理', '疼痛管理'], phone: '139****1001' },
    { name: '陈晨', role: '责任护士', dept: 'ortho', title: '护师', skills: ['骨科护理', '伤口换药'], phone: '139****1002' },
    { name: '李敏', role: '护士', dept: 'ortho', title: '护士', skills: ['基础护理'], phone: '139****1003' },
    { name: '赵志强', role: '主任医师', dept: 'ortho', title: '主任医师', skills: ['关节置换', '关节镜'], phone: '139****1004' },
    { name: '周雪', role: '副主任医师', dept: 'ortho', title: '副主任医师', skills: ['脊柱外科'], phone: '139****1005' },
    { name: '刘芳', role: '护士长', dept: 'cardio', title: '主管护师', skills: ['心血管护理', 'CCU'], phone: '139****1006' },
    { name: '孙悦', role: '护士', dept: 'cardio', title: '护师', skills: ['心电监护', '静脉治疗'], phone: '139****1007' },
    { name: '韩立新', role: '主任医师', dept: 'cardio', title: '主任医师', skills: ['冠心病介入'], phone: '139****1008' },
    { name: '罗敏', role: '副主任医师', dept: 'cardio', title: '副主任医师', skills: ['心律失常'], phone: '139****1009' },
    { name: '周敏', role: '护士长', dept: 'neuro', title: '主管护师', skills: ['神经内科护理', '吞咽评估'], phone: '139****1010' },
    { name: '吴静', role: '护士', dept: 'neuro', title: '护士', skills: ['基础护理', '康复协助'], phone: '139****1011' },
    { name: '徐文', role: '主任医师', dept: 'neuro', title: '主任医师', skills: ['脑血管病'], phone: '139****1012' },
    { name: '郑洁', role: '护士长', dept: 'resp', title: '主管护师', skills: ['呼吸专科护理', '气道管理'], phone: '139****1013' },
    { name: '王磊', role: '护士', dept: 'resp', title: '护师', skills: ['氧疗', '肺功能'], phone: '139****1014' },
    { name: '高翔', role: '副主任医师', dept: 'resp', title: '副主任医师', skills: ['慢阻肺', '肺部感染'], phone: '139****1015' },
    { name: '张薇', role: '护士长', dept: 'gs', title: '主管护师', skills: ['外科护理', '造口护理'], phone: '139****1016' },
    { name: '何建', role: '主任医师', dept: 'gs', title: '主任医师', skills: ['肝胆外科', '腹腔镜'], phone: '139****1017' },
    { name: '沈岚', role: '副主任医师', dept: 'onco', title: '副主任医师', skills: ['肿瘤内科', '化疗管理'], phone: '139****1018' },
    { name: '李娜', role: '护士', dept: 'onco', title: '护师', skills: ['PICC', '肿瘤护理'], phone: '139****1019' },
    { name: '唐悦', role: '主治医师', dept: 'peds', title: '主治医师', skills: ['小儿呼吸', '新生儿'], phone: '139****1020' },
    { name: '陈露', role: '护士', dept: 'peds', title: '护师', skills: ['儿科护理', '静脉穿刺'], phone: '139****1021' }
  ];

  const SHIFT_TIMES = {
    '早': '08:00-16:00',
    '中': '14:00-22:00',
    '夜': '22:00-08:00',
    '白': '08:00-17:30',
    '休': '—'
  };
  const weekDates = [0, 1, 2, 3, 4, 5, 6].map(function (n) { return addDays(DEMO_DATE, n); });
  const weekLabels = ['周五', '周六', '周日', '周一', '周二', '周三', '周四'];
  const staff = STAFF_SPECS.map(function (s, i) {
    const dept = DEPARTMENTS.find(function (d) { return d.id === s.dept; });
    const isDoctor = s.role.indexOf('医师') >= 0;
    let pattern;
    if (isDoctor) pattern = ['白', '白', '休', '白', '白', '白', '休'];
    else {
      const base = [
        ['早', '中', '夜', '休', '早', '中', '休'],
        ['中', '夜', '休', '早', '中', '休', '早'],
        ['夜', '休', '早', '中', '休', '早', '中'],
        ['早', '早', '中', '休', '夜', '休', '早']
      ];
      pattern = base[i % base.length].slice();
    }
    if (s.name === '孙悦') pattern = ['夜', '早', '休', '中', '夜', '休', '早'];
    if (s.name === '王磊') pattern = ['中', '夜', '夜', '早', '中', '休', '早'];
    const shifts = {};
    weekDates.forEach(function (d, di) { shifts[d] = pattern[di]; });
    const workDays = pattern.filter(function (x) { return x !== '休'; }).length;
    const nightShifts = pattern.filter(function (x) { return x === '夜'; }).length;
    return {
      id: 'S-' + String(i + 1).padStart(3, '0'),
      name: s.name,
      role: s.role,
      dept: s.dept,
      deptName: dept.name,
      title: s.title,
      skills: s.skills,
      phone: s.phone,
      color: dept.color,
      shifts: shifts,
      shiftTimes: SHIFT_TIMES,
      weeklyHours: Math.round((workDays * 8 + nightShifts * 0.5) * 10) / 10,
      nightShifts: nightShifts,
      workDays: workDays,
      workload: Math.min(98, 52 + workDays * 5 + nightShifts * 6 + (i % 5) * 3),
      status: '在岗'
    };
  });

  const staffConflicts = [
    {
      id: 'SC-20261106-01',
      staffId: staff.find(function (s) { return s.name === '孙悦'; }).id,
      staffName: '孙悦',
      dept: 'cardio',
      type: '夜班间隔不足',
      detail: '11/06 夜班至 11/07 08:00，11/07 早班 08:00 开始，休息间隔不足 11 小时',
      severity: '高',
      date: '2026-11-07',
      fromShift: '早',
      toShift: '休',
      suggestion: '将 11/07 早班调整为休息，由同科室护士长确认替班；不经授权不自动改班'
    },
    {
      id: 'SC-20261106-02',
      staffId: staff.find(function (s) { return s.name === '王磊'; }).id,
      staffName: '王磊',
      dept: 'resp',
      type: '夜班后休息不足',
      detail: '11/08 夜班至 11/09 08:00，11/09 早班 08:00 开始，休息间隔不足 11 小时',
      severity: '中',
      date: '2026-11-09',
      fromShift: '早',
      toShift: '休',
      suggestion: '将 11/09 早班调整为休息，或由郑洁护士长确认替班人员'
    }
  ];

  // ------------------------- 知识库 -------------------------
  const knowledgeDocs = [
    {
      id: 'KB-001',
      title: '床位分配与调整管理制度（2026 版）',
      category: '床位管理',
      owner: '医务处',
      version: 'v2026.3',
      updatedAt: '2026-10-18',
      summary: '规定床位分配原则、单人间/隔离间使用、清洁复核和审批执行要求。',
      chunks: [
        {
          id: 'KB-001-01', heading: '3.1 分配基本原则',
          content: '床位分配按入院申请时间、科室归属、床位类型、性别适配和感染隔离要求排序。临床优先级由主管医师在申请单中标注，调度系统只读取该标注，不得自行判断或改变临床优先级。对同一科室、同一床位类型的申请，按申请时间先后分配。',
          keywords: ['床位分配', '申请时间', '科室', '性别', '隔离', '临床优先级', '主管医师']
        },
        {
          id: 'KB-001-02', heading: '3.2 床位类型与单人间',
          content: '单人间、监护床、隔离间属于刚性床位类型。患者书面申请单人间但当日无单人间时，不得自动降级至多人间，应由运营主管与患者沟通并留存书面确认。监护床仅用于需要持续心电监护的患者，由主管医师开具。',
          keywords: ['单人间', '监护床', '隔离间', '降级', '患者沟通', '书面确认']
        },
        {
          id: 'KB-001-03', heading: '3.3 清洁、维护与预留',
          content: '待清洁床位在完成终末清洁并由护理人员复核前不得分配；维护中、暂停使用床位不参与调度；已预留床位仅在预留解除后进入可分配池。床位状态以 Bed MCP 实时查询结果为准，不接受缓存数据直接执行。',
          keywords: ['待清洁', '维护中', '暂停使用', '预留', '终末清洁', '实时状态']
        },
        {
          id: 'KB-001-04', heading: '4.2 审批与执行',
          content: '床位分配方案须由医院运营主管审批。审批通过后，执行服务必须再次校验床位状态、患者状态和床位版本号，防止审批期间床位被占用。校验失败时整单回滚，不得部分执行。审批人、审批时间、意见、方案版本和执行结果须完整留痕。',
          keywords: ['审批', '运营主管', '床位版本', '整单回滚', '重复占用', '留痕']
        },
        {
          id: 'KB-001-05', heading: '5.1 今日出院床位处理',
          content: '预计当日出院的床位不计入当前可用床位。患者办理出院后床位进入待清洁状态，终末清洁通常需要 30 至 45 分钟。调度方案可将此类床位列为候补资源，但不得在清洁复核前写入分配结果。',
          keywords: ['预计出院', '候补资源', '终末清洁', '30 分钟', '分配结果']
        }
      ]
    },
    {
      id: 'KB-002',
      title: '门诊预约与号源管理规范',
      category: '预约管理',
      owner: '门诊部',
      version: 'v2026.2',
      updatedAt: '2026-09-30',
      summary: '规定号源开放、重复预约、冲突检测、取消与候补队列。',
      chunks: [
        {
          id: 'KB-002-01', heading: '2.3 重复预约与冲突',
          content: '同一患者同一就诊日、同一科室不得重复预约。系统在提交预约前须同时校验患者、医生、日期和号源四个维度；同一医生同一时段的号源只能被一个有效预约占用。已取消预约不占用号源。',
          keywords: ['重复预约', '同一科室', '同一医生', '号源', '冲突检测', '已取消']
        },
        {
          id: 'KB-002-02', heading: '3.1 取消与候补',
          content: '预约取消后号源立即释放，候补队列按登记时间顺序自动补位。距就诊时间不足 2 小时的取消计入爽约观察，不直接处罚患者。AI 可以推荐候补顺序，但不得绕过实名认证和支付规则。',
          keywords: ['取消', '候补队列', '号源释放', '两小时', '实名认证']
        },
        {
          id: 'KB-002-03', heading: '4.1 AI 推荐边界',
          content: 'AI 预约推荐只能基于科室、医生出诊时间、号源余量和预约规则生成建议。正式预约、取消和改约必须由用户确认或由授权管理员执行，AI 不得自动完成涉及患者权益的变更。',
          keywords: ['AI 推荐', '预约', '确认', '授权', '患者权益']
        }
      ]
    },
    {
      id: 'KB-003',
      title: '医学检查设备调度管理办法',
      category: '检查管理',
      owner: '医技科',
      version: 'v2026.1',
      updatedAt: '2026-08-22',
      summary: '规定设备能力匹配、维护窗口、冲突处理和临床优先级边界。',
      chunks: [
        {
          id: 'KB-003-01', heading: '3.1 设备与项目匹配',
          content: '检查预约必须校验设备能力、检查项目、患者准备要求和预计时长。增强 CT 需确认肾功能与过敏史；MRI 需完成金属植入物筛查。设备维护时段不可预约，维护完成需由医技科确认后恢复放号。',
          keywords: ['设备能力', '检查项目', '增强 CT', 'MRI', '维护时段', '恢复放号']
        },
        {
          id: 'KB-003-02', heading: '4.2 时间冲突处理',
          content: '发现同一设备时间重叠时，优先保留紧急和优先检查，常规检查可在患者可接受的前提下调整至最近空档。不得因调度而改变开单医师标注的临床优先级。无法在当日安排时，应提交人工协调并记录原因。',
          keywords: ['时间冲突', '紧急', '优先', '常规', '调整时段', '临床优先级']
        },
        {
          id: 'KB-003-03', heading: '5.1 审批要求',
          content: '涉及患者到院时间变更的检查调度方案须经运营主管或医技科负责人审批。执行前需再次检查设备时段和患者预约状态；若原时段已被其他检查占用，方案失效并重新规划。',
          keywords: ['审批', '到院时间', '医技科', '执行前复核', '重新规划']
        }
      ]
    },
    {
      id: 'KB-004',
      title: '医护排班与工作负载规则',
      category: '人员排班',
      owner: '护理部 / 人力资源部',
      version: 'v2026.4',
      updatedAt: '2026-10-02',
      summary: '规定夜班间隔、连续夜班上限、技能覆盖和调班审批。',
      chunks: [
        {
          id: 'KB-004-01', heading: '2.2 休息与夜班',
          content: '夜班结束后至下一班次开始应保证不少于 11 小时休息。同一人员连续夜班不超过 2 个。排班系统发现间隔不足时应阻断发布，并由护士长调整班次或安排替班。',
          keywords: ['夜班', '11 小时', '连续夜班', '休息', '排班冲突', '替班']
        },
        {
          id: 'KB-004-02', heading: '3.1 技能与科室覆盖',
          content: '每个病区每个班次至少配置 1 名具备该专科核心技能的护士。ICU、CCU、儿科等特殊区域须满足额外资质要求。AI 排班建议只能作为草案，最终排班由授权管理员确认后生效。',
          keywords: ['技能', '专科', 'CCU', '儿科', 'AI 排班', '授权管理员']
        },
        {
          id: 'KB-004-03', heading: '4.2 工作负载',
          content: '工作负载按班次时长、夜班系数、管床数和专科操作加权计算。连续两周工作负载超过科室均值 120% 的人员应优先安排调休。负载统计只用于管理决策，不作为个人绩效处罚依据。',
          keywords: ['工作负载', '夜班系数', '管床数', '调休', '绩效']
        }
      ]
    },
    {
      id: 'KB-005',
      title: '运营预警分级与处置流程',
      category: '运营预警',
      owner: '运营管理部',
      version: 'v2026.1',
      updatedAt: '2026-07-15',
      summary: '定义床位、预约、设备和人员的预警阈值与升级路径。',
      chunks: [
        {
          id: 'KB-005-01', heading: '2.1 床位预警阈值',
          content: '全院床位使用率达到 85% 触发中级预警，达到 90% 触发高级预警，达到 95% 触发紧急预警。单个科室可用床位少于 3 张且未来 48 小时预计入院人数大于可用床位时，触发科室高级预警。',
          keywords: ['床位使用率', '85%', '90%', '95%', '可用床位', '48 小时', '预警']
        },
        {
          id: 'KB-005-02', heading: '3.2 预警处置',
          content: '预警分为待处理、处理中、已处理和已忽略。高级及以上预警应在 2 小时内响应。预警处置建议由规则引擎和 AI 共同生成，但关闭预警必须由授权管理员填写处置说明并留痕。',
          keywords: ['预警处置', '2 小时', '关闭预警', '处置说明', '留痕']
        }
      ]
    },
    {
      id: 'KB-006',
      title: 'AI 运营助手使用与审计规范',
      category: '系统治理',
      owner: '信息中心',
      version: 'v2026.1',
      updatedAt: '2026-10-10',
      summary: '明确 AI 不直连数据库、工具调用留痕和人工审批边界。',
      chunks: [
        {
          id: 'KB-006-01', heading: '1.2 AI 权限边界',
          content: 'AI 不得直接修改数据库。所有业务变更必须通过经过身份认证、权限校验和业务规则校验的服务接口执行。AI 可以生成建议、调用只读工具和发起审批，但不得代替人工做出临床决策。',
          keywords: ['AI', '数据库', '服务接口', '权限校验', '临床决策', '审批']
        },
        {
          id: 'KB-006-02', heading: '2.1 工具调用留痕',
          content: '每次 MCP 工具调用须记录调用方、工具名、参数摘要、返回摘要、耗时和关联工作流。涉及患者数据的返回值应脱敏。审计日志保留不少于 180 天，支持按工作流和操作人检索。',
          keywords: ['MCP', '工具调用', '审计日志', '工作流', '脱敏', '180 天']
        },
        {
          id: 'KB-006-03', heading: '3.3 人工审批',
          content: '床位分配、检查调度、人员排班等高风险操作须由授权角色审批。审批界面应展示方案版本、资源快照、规则依据和冲突检查结果。审批完成后执行服务必须再次校验实时状态。',
          keywords: ['人工审批', '方案版本', '资源快照', '规则依据', '冲突检查', '实时状态']
        }
      ]
    }
  ];

  // ------------------------- 预警 -------------------------
  const orthoFree = beds.filter(function (b) { return b.dept === 'ortho' && b.status === '空闲'; }).length;
  const orthoPending = admissions.filter(function (a) { return a.dept === 'ortho' && a.status === '待分配'; }).length;
  const alerts = [
    {
      id: 'AL-20261106-001', level: '高', type: '床位资源', title: '骨科可用床位仅 ' + orthoFree + ' 张，待入院 ' + orthoPending + ' 人',
      dept: '骨科', triggerAt: '2026-11-06 13:50', status: '待处理',
      relatedType: 'bed', relatedId: 'ORTHO-A-05',
      data: ['可用床位 ' + orthoFree + ' 张', '待分配 ' + orthoPending + ' 人', '待清洁 1 张 · 15:30 完成', '今日预出院 3 人'],
      cause: '骨科一、二病区共 24 张床位，当前仅 3 张空闲；4 位待入院患者中有 1 位要求单人间、1 位要求三人间，类型不完全匹配。',
      ai: '按现有申请与床位状态，若不进行跨病区协调，今日 16:00 前骨科将出现 1 至 2 个床位缺口。待清洁床位 ORTHO-A-05 可在 15:30 后释放，但不能提前分配。',
      suggestion: '优先执行今日床位调度方案；与骨科二病区确认 15:30 后出院床位；如单人间缺口持续，由运营主管协调特需床位或与患者沟通调整，不由 AI 自行降级。'
    },
    {
      id: 'AL-20261106-002', level: '高', type: '检查冲突', title: 'CT-01 下午存在 1 组时段重叠',
      dept: '医技科', triggerAt: '2026-11-06 14:12', status: '待处理',
      relatedType: 'equipment', relatedId: 'CT-01',
      data: ['14:30-15:00 与 14:45-15:15', '重叠 15 分钟', '涉及 2 名患者', '设备利用率 86%'],
      cause: '两条检查预约被安排在同一设备的重叠时段，系统在日终校验中发现。',
      ai: '两组检查均为非紧急安排，其中 14:45 的腹部平扫为常规优先级，具备调整时段的条件；14:30 的胸部平扫为优先检查，建议保留。',
      suggestion: '将 14:45 的常规检查调整至 16:20 后空档，提交运营主管审批；执行前再次校验设备时段。'
    },
    {
      id: 'AL-20261106-003', level: '中', type: '清洁超时', title: '呼吸内科 401-2 床清洁已超时 35 分钟',
      dept: '呼吸内科', triggerAt: '2026-11-06 14:05', status: '待处理',
      relatedType: 'bed', relatedId: 'RESP-10',
      data: ['开始 13:20', '应完成 14:05', '超时 35 分钟', '床位状态：待清洁'],
      cause: '终末清洁工单未在目标时间内完成，护理端尚未复核。',
      ai: '该床位当前不可分配。若 14:45 前仍未完成，将影响呼吸内科今日 1 位待入院患者的收治时序。',
      suggestion: '通知当班保洁与护士长；完成清洁并复核后将床位改为空闲，再纳入下一轮调度。'
    },
    {
      id: 'AL-20261106-004', level: '中', type: '人员负载', title: '心内科夜班集中度高于科室均值',
      dept: '心内科', triggerAt: '2026-11-06 12:30', status: '处理中',
      relatedType: 'staff', relatedId: 'S-007',
      data: ['本周夜班 5 人次', '人均夜班 2.5 次', '孙悦夜班间隔不足', '1 条排班冲突'],
      cause: '两名护士承担了本周 80% 的夜班，排班时未充分校验夜班后休息间隔。',
      ai: '孙悦在 11/06 夜班后紧接 11/07 早班，休息间隔不足 11 小时，已触发排班冲突。继续发布将违反护理部排班规则。',
      suggestion: '将 11/07 早班调整为中班或安排替班；下周夜班向刘芳、罗敏之外的人员均衡。'
    },
    {
      id: 'AL-20261106-005', level: '中', type: '资源预测', title: '心内科 3 天后预计满床，床位缺口 1 张',
      dept: '心内科', triggerAt: '2026-11-06 11:40', status: '待处理',
      relatedType: 'bed', relatedId: 'CARDIO',
      data: ['当前使用率 91.7%', '待入院 2 人', '预计出院 1 人', '3 天后预计使用率 100%'],
      cause: '心内科 2 位待入院患者中，1 位需要监护床，当前无可用监护床；下周一前仅 1 张床位预计释放。',
      ai: '按当前出院计划，心内科 3 天后可用床位为 0。若监护床需求持续，需提前协调 CCU 或调整收治计划，并由临床确认。',
      suggestion: '提前核对 11/07 预出院床位；与 CCU 确认监护床协调可能性；必要时启动跨病区床位协调。'
    },
    {
      id: 'AL-20261106-006', level: '低', type: '预约积压', title: '儿科明日候补 8 人，号源释放率偏低',
      dept: '儿科', triggerAt: '2026-11-06 10:20', status: '待处理',
      relatedType: 'appointment', relatedId: 'D-PE-01',
      data: ['候补 8 人', '明日号源 8 个', '已预约 8 个', '取消率 2.1%'],
      cause: '唐悦医师明日号源已满，候补队列持续增长。',
      ai: '按当前取消率，预计明日仅释放 0 至 1 个号源，候补患者当日就诊概率较低。',
      suggestion: '评估是否加开下午门诊；优先通知候补序列前 3 位患者；不建议 AI 自动加号。'
    },
    {
      id: 'AL-20261106-007', level: '低', type: '预约效率', title: '本周预约取消率较上周上升 2.1 个百分点',
      dept: '全院', triggerAt: '2026-11-06 09:30', status: '待处理',
      relatedType: 'appointment', relatedId: 'ALL',
      data: ['本周取消率 4.8%', '上周 2.7%', '取消 14 人次', '线上渠道占 71%'],
      cause: '线上预约提醒发送时间较早，部分患者重复预约后取消。',
      ai: '取消率仍处于可控范围，但重复预约检测可进一步降低无效占号。',
      suggestion: '在预约提交前增加同科室同日重复校验；就诊前 24 小时发送二次确认。'
    },
    {
      id: 'AL-20261106-008', level: '高', type: '设备维护', title: 'MRI-02 维护至明日 12:00，4 个复查预约需改期',
      dept: '医技科', triggerAt: '2026-11-06 08:10', status: '处理中',
      relatedType: 'equipment', relatedId: 'MRI-02',
      data: ['维护开始 11/06 08:00', '预计恢复 11/07 12:00', '受影响预约 4 个', '备用设备 MRI-01'],
      cause: '梯度线圈预防性维护超出原计划 4 小时。',
      ai: 'MRI-01 明日 10:40 后仍有 2 个空档，可承接 2 个优先复查；其余 2 个建议顺延。',
      suggestion: '由医技科联系患者确认改期；不调整临床优先级；维护完成后经工程确认再放号。'
    }
  ];

  // ------------------------- 方案与工作流 -------------------------
  const ct1MoveExam = exams.find(function (e) {
    return e.deviceId === 'CT-01' && e.date === DEMO_DATE && e.start === '14:45';
  });
  let moveTarget = '16:20';
  // 选一个 CT-01 当日下午的 30 分钟空档
  for (let t = 15 * 60 + 30; t <= 17 * 60; t += 10) {
    const candidate = hhmm(t);
    const candidateEnd = hhmm(t + 30);
    const busy = exams.some(function (e) {
      return e.deviceId === 'CT-01' && e.date === DEMO_DATE && e.id !== (ct1MoveExam && ct1MoveExam.id) &&
        minutes(e.start) < minutes(candidateEnd) && minutes(e.end) > minutes(candidate);
    });
    if (!busy) { moveTarget = candidate; break; }
  }
  const moveEnd = hhmm(minutes(moveTarget) + 30);

  const plans = [
    {
      id: 'AP-20261106-001',
      kind: 'equipment',
      title: 'CT-01 下午检查时段冲突调整',
      scope: '医技科 · CT-01',
      status: '待审批',
      createdBy: 'MedFlow Coordinator',
      createdByName: 'AI 调度中心',
      createdAt: '2026-11-06 13:42',
      workflowId: 'WF-20261106-003',
      summary: '将 CT-01 14:45 的常规腹部平扫调整至 ' + moveTarget + '，保留 14:30 优先检查，不改动临床优先级。',
      changes: ct1MoveExam ? [{
        examId: ct1MoveExam.id,
        patientName: ct1MoveExam.patientName,
        examItem: ct1MoveExam.examItem,
        deviceId: 'CT-01',
        from: '14:45-15:15',
        to: moveTarget + '-' + moveEnd,
        reason: '常规检查，可调整至当日空档；保留优先检查原时段',
        expectedStart: '14:45',
        expectedDate: DEMO_DATE
      }] : [],
      validation: {
        valid: true,
        checks: [
          { name: '设备时段冲突', pass: true, detail: '目标时段 ' + moveTarget + '-' + moveEnd + ' 无其他检查' },
          { name: '临床优先级', pass: true, detail: '未调整任何检查的临床优先级' },
          { name: '患者状态', pass: true, detail: '患者尚未到检，可联系改期' },
          { name: '设备维护窗口', pass: true, detail: 'CT-01 当日无维护计划' }
        ]
      },
      citations: [
        { chunkId: 'KB-003-02', title: '医学检查设备调度管理办法', heading: '4.2 时间冲突处理' },
        { chunkId: 'KB-003-03', title: '医学检查设备调度管理办法', heading: '5.1 审批要求' }
      ],
      snapshot: { conflictCount: 1, affectedPatients: 2, device: 'CT-01' },
      approval: null,
      execution: null
    },
    {
      id: 'BP-20261105-001',
      kind: 'bed',
      title: '呼吸内科 11 月 5 日床位分配',
      scope: '呼吸内科',
      status: '执行成功',
      createdBy: 'MedFlow Coordinator',
      createdByName: 'AI 调度中心',
      createdAt: '2026-11-05 10:18',
      workflowId: 'WF-20261105-002',
      summary: '为 2 位待入院患者分配呼吸内科双人间与隔离间，执行前复核通过。',
      matched: [],
      unmatched: [],
      validation: { valid: true, checks: [{ name: '执行前复核', pass: true, detail: '2 张床位状态一致' }] },
      citations: [{ chunkId: 'KB-001-04', title: '床位分配与调整管理制度（2026 版）', heading: '4.2 审批与执行' }],
      snapshot: { freeBeds: 2, pending: 2 },
      approval: { by: '陈明', role: '运营主管', at: '2026-11-05 10:26', comment: '同意，按方案执行。' },
      execution: { at: '2026-11-05 10:27', result: 'success', count: 2, detail: 'Bed MCP 已分配 2 张床位' }
    }
  ];

  const tasks = [
    {
      id: 'WF-20261106-003', prompt: '检查今天 CT-01 设备是否存在预约冲突，并给出调整建议',
      intent: 'equipment_conflict', intentLabel: '检查资源调度', status: 'awaiting_approval',
      createdAt: '2026-11-06 13:42', completedAt: null, planId: 'AP-20261106-001',
      summary: '发现 1 组 CT-01 时段重叠，已生成调整方案，等待审批。', actor: '陈明'
    },
    {
      id: 'WF-20261106-002', prompt: '分析本周各科室的资源使用情况',
      intent: 'ops_report', intentLabel: '运营分析', status: 'completed',
      createdAt: '2026-11-06 10:22', completedAt: '2026-11-06 10:23', planId: null,
      summary: '完成 7 个科室的床位、预约、设备与人员负载对比，生成运营摘要。', actor: '陈明'
    },
    {
      id: 'WF-20261105-002', prompt: '帮我制定呼吸内科今天的床位分配方案',
      intent: 'bed_schedule', intentLabel: '床位调度', status: 'completed',
      createdAt: '2026-11-05 10:18', completedAt: '2026-11-05 10:27', planId: 'BP-20261105-001',
      summary: '2 位患者完成床位分配，方案执行成功。', actor: '陈明'
    }
  ];

  const audit = [
    { id: 'LOG-20261106-0008', at: '2026-11-06 13:42', actor: 'MedFlow Coordinator', role: 'AI 工作流', action: 'plan.create', target: 'AP-20261106-001', detail: '创建 CT-01 检查冲突调整方案，等待人工审批', ip: '10.24.8.31' },
    { id: 'LOG-20261106-0007', at: '2026-11-06 13:41', actor: 'MedFlow Coordinator', role: 'AI 工作流', action: 'mcp.call', target: 'Equipment MCP · exam.find_conflicts', detail: '查询 11/06 CT-01 检查时段，返回 1 组重叠', ip: '10.24.8.31' },
    { id: 'LOG-20261106-0006', at: '2026-11-06 10:23', actor: '陈明', role: '运营主管', action: 'report.generate', target: 'WF-20261106-002', detail: '生成 7 日运营分析报告', ip: '10.24.8.21' },
    { id: 'LOG-20261105-0004', at: '2026-11-05 10:27', actor: '陈明', role: '运营主管', action: 'plan.approve', target: 'BP-20261105-001', detail: '批准呼吸内科床位分配方案', ip: '10.24.8.21' },
    { id: 'LOG-20261105-0003', at: '2026-11-05 10:27', actor: 'Bed MCP', role: '工具服务', action: 'mcp.bed.allocate', target: 'BP-20261105-001', detail: '执行床位分配 2 张，事务提交成功', ip: '10.24.8.42' }
  ];

  const users = [
    { id: 'u-ops', name: '陈明', role: 'ops', roleName: '医院运营主管', dept: '运营管理部', phone: '138****0021', status: '启用', lastLogin: '2026-11-06 08:02', color: '#0f766e', permissions: '全院运营、审批、报告' },
    { id: 'u-admin', name: '张伟', role: 'admin', roleName: '系统管理员', dept: '信息中心', phone: '138****0008', status: '启用', lastLogin: '2026-11-06 07:48', color: '#334155', permissions: '全局配置、账号、审计' },
    { id: 'u-bed', name: '王丽', role: 'bed', roleName: '床位管理员', dept: '骨科一病区', phone: '139****1001', status: '启用', lastLogin: '2026-11-06 07:55', color: '#0d9488', permissions: '床位管理、方案发起' },
    { id: 'u-appt', name: '李娜', role: 'appt', roleName: '预约管理员', dept: '门诊部', phone: '139****2201', status: '启用', lastLogin: '2026-11-06 08:10', color: '#2563eb', permissions: '预约、号源、候补' },
    { id: 'u-equip', name: '周航', role: 'equip', roleName: '医技科室管理员', dept: '医技科', phone: '139****3302', status: '启用', lastLogin: '2026-11-06 08:05', color: '#7c3aed', permissions: '设备、检查预约' },
    { id: 'u-staff', name: '刘芳', role: 'staff', roleName: '医护排班管理员', dept: '护理部', phone: '139****4403', status: '启用', lastLogin: '2026-11-06 08:15', color: '#d97706', permissions: '人员、班次、排班' }
  ];

  const rolePermissions = [
    { role: '系统管理员', code: 'admin', scope: '全局', items: ['系统配置', '账号管理', '审计日志', '全部业务只读'] },
    { role: '医院运营主管', code: 'ops', scope: '全院', items: ['运营数据', '审批调度', 'AI 调度', '运营报告', '预警处置'] },
    { role: '床位管理员', code: 'bed', scope: '床位', items: ['床位档案', '分配/释放', '发起床位方案', '床位状态'] },
    { role: '预约管理员', code: 'appt', scope: '预约', items: ['患者预约', '号源管理', '候补队列', '取消预约'] },
    { role: '医技科室管理员', code: 'equip', scope: '检查', items: ['设备管理', '检查预约', '维护窗口', '冲突处理'] },
    { role: '医护排班管理员', code: 'staff', scope: '排班', items: ['人员档案', '班次', '排班', '请假/调班', '发起排班方案', '负载统计'] }
  ];

  const dailyStats = {
    labels: ['10/31', '11/01', '11/02', '11/03', '11/04', '11/05', '11/06'],
    appointments: [52, 58, 55, 61, 64, 59, appointmentStats.todayTotal],
    visits: [40, 44, 43, 47, 51, 46, appointmentStats.todayVisited],
    occupancy: [81.2, 82.3, 82.9, 83.1, 84.4, 84.0, 84.4],
    equipment: [71, 74, 69, 78, 80, 76, 79],
    avgWait: [21, 19, 20, 18, 17, 19, 18],
    cancellation: [4.1, 3.8, 4.5, 4.2, 3.6, 4.8, 5.2],
    dates: ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
  };

  return {
    DEMO_DATE: DEMO_DATE,
    DEMO_NOW: DEMO_NOW,
    DEMO_WEEKDAY: DEMO_WEEKDAY,
    DEPARTMENTS: DEPARTMENTS,
    wards: wards,
    beds: beds,
    patients: patients,
    outpatients: outpatients,
    admissions: admissions,
    doctors: doctors,
    appointments: appointments,
    appointmentStats: appointmentStats,
    waitlist: waitlist,
    alertRules: alertRules,
    devices: DEVICES,
    exams: exams,
    staff: staff,
    staffConflicts: staffConflicts,
    alerts: alerts,
    plans: plans,
    tasks: tasks,
    audit: audit,
    users: users,
    rolePermissions: rolePermissions,
    knowledgeDocs: knowledgeDocs,
    dailyStats: dailyStats,
    weekDates: weekDates,
    weekLabels: weekLabels,
    shiftTimes: SHIFT_TIMES
  };
});
