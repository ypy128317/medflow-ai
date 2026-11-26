<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import { TODAY } from '../utils/date'

const auth = useAuthStore()
const ui = useUiStore()
const devices = ref([])
const exams = ref([])
const conflicts = ref([])
const date = ref(TODAY)
const deviceId = ref('')
const loading = ref(true)
const modal = ref('')
const saving = ref(false)
const selected = ref(null)
const form = reactive({ patient_name: '', device_id: '', date: TODAY, start: '', duration: 30, exam_item: '', priority: '常规', note: '' })
const canManage = computed(() => auth.can('equipment.manage'))
const currentDevice = computed(() => devices.value.find(d => d.id === form.device_id))

async function load() {
  loading.value = true
  try {
    const [u, e, c] = await Promise.all([
      api.get('/devices/utilization', { date: date.value }),
      api.get('/exams', { date: date.value, device_id: deviceId.value || undefined }),
      api.get('/exams/conflicts', { date: date.value }),
    ])
    devices.value = u.map(x => ({ ...x.device, exams_count: x.exams, utilization: x.utilization }))
    exams.value = e
    conflicts.value = c
  } catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

function openCreate(device) {
  Object.assign(form, { patient_name: '', device_id: device?.id || devices.value[0]?.id || '', date: date.value, start: '', duration: 30, exam_item: '', priority: '常规', note: '' })
  modal.value = 'create'
}

async function suggest() {
  if (!form.device_id) return
  try {
    const slot = await api.get('/exams/free-slot', { device_id: form.device_id, date: form.date, duration: form.duration })
    if (slot.start) form.start = slot.start
    else ui.notify('当天没有可用空档', 'info')
  } catch (e) { ui.notify(e.message, 'error') }
}

async function create() {
  saving.value = true
  try {
    await api.post('/exams', {
      patient_name: form.patient_name, device_id: form.device_id, date: form.date, start: form.start,
      duration: Number(form.duration), exam_item: form.exam_item || null, priority: form.priority, note: form.note,
    })
    ui.notify('检查已创建')
    modal.value = ''
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

async function cancel(exam) {
  if (!confirm(`取消 ${exam.patient_name} 的 ${exam.exam_item}？`)) return
  try {
    await api.post(`/exams/${exam.id}/cancel?reason=运营后台取消`)
    ui.notify('检查已取消')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

async function toggleDevice(d) {
  const next = d.status === '维护中' ? '运行中' : '维护中'
  if (next === '维护中' && !confirm(`将 ${d.name} 转入维护？有未完成检查时会被拒绝。`)) return
  try {
    await api.post(`/devices/${d.id}/status`, { status: next, note: next === '维护中' ? '计划维护' : '' })
    ui.notify(next === '维护中' ? '设备已转维护' : '设备已恢复运行')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

watch(date, load); watch(deviceId, load); onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">DIAGNOSTIC RESOURCES</div><h1>检查资源</h1><p>CT、MRI、超声与 X 光的设备能力、预约时段和冲突分析。</p></div>
      <div class="page-actions">
        <button v-if="canManage" class="btn btn-ghost" @click="modal = 'device'"><Icon name="wrench" :size="15" /> 设备维护</button>
        <button v-if="canManage" class="btn btn-primary" @click="openCreate()"><Icon name="plus" :size="15" /> 新建检查</button>
      </div>
    </div>

    <div class="stat-grid compact-grid">
      <article class="stat-card"><div class="stat-label">设备总数</div><div class="stat-value">{{ devices.length }}<em>台</em></div><div class="stat-foot">{{ devices.filter(d => d.status === '运行中').length }} 台运行中</div></article>
      <article class="stat-card"><div class="stat-label">今日检查</div><div class="stat-value">{{ exams.length }}<em>项</em></div><div class="stat-foot">按设备开放窗口</div></article>
      <article class="stat-card"><div class="stat-label">时段冲突</div><div class="stat-value">{{ conflicts.length }}<em>组</em></div><div class="stat-foot">需人工确认或调整</div></article>
      <article class="stat-card"><div class="stat-label">平均利用率</div><div class="stat-value">{{ devices.length ? Math.round(devices.reduce((s, d) => s + d.utilization, 0) / devices.length) : 0 }}<em>%</em></div><div class="stat-foot">08:00–18:00</div></article>
    </div>

    <div class="device-grid">
      <button v-for="d in devices" :key="d.id" :class="['device-card', { active: deviceId === d.id, off: d.status === '维护中' }]" @click="deviceId = deviceId === d.id ? '' : d.id">
        <div class="device-top"><span class="device-icon"><Icon name="monitor" :size="18" /></span><StatusBadge :status="d.status" /></div>
        <b>{{ d.id }}</b><small>{{ d.name }}</small>
        <div class="device-meter"><i :style="{ width: Math.min(100, d.utilization) + '%' }" /></div>
        <div class="device-foot"><span>{{ d.exams_count }} 项检查</span><b>{{ d.utilization }}%</b></div>
      </button>
    </div>

    <div v-if="conflicts.length" class="conflict-banner"><Icon name="alert" :size="17" /><div><b>发现 {{ conflicts.length }} 组设备时段重叠</b><p>{{ conflicts.slice(0, 3).map(c => `${c.device_id} 重叠 ${c.overlap_minutes} 分钟`).join(' · ') }}。AI 只调整常规检查，优先/紧急检查保持原时段。</p></div><button class="btn btn-tiny" @click="$router.push('/ai')">生成调整方案</button></div>

    <section class="panel">
      <div class="panel-head">
        <div><h2>{{ deviceId || '全部设备' }} · 检查明细</h2><p>{{ exams.length }} 条 · {{ date }}</p></div>
        <div class="filters">
          <input v-model="date" type="date" />
          <select v-model="deviceId"><option value="">全部设备</option><option v-for="d in devices" :key="d.id" :value="d.id">{{ d.id }}</option></select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>时间</th><th>患者</th><th>设备</th><th>检查项目</th><th>优先级</th><th>状态</th><th /></tr></thead>
          <tbody>
            <tr v-for="e in exams" :key="e.id">
              <td class="mono">{{ e.start }}–{{ e.end }}</td>
              <td><b>{{ e.patient_name }}</b><small class="block muted">{{ e.department_name }}</small></td>
              <td>{{ e.device_id }}</td>
              <td>{{ e.exam_item }}<small class="block muted">{{ e.room }}</small></td>
              <td><StatusBadge :status="e.priority" /></td>
              <td><StatusBadge :status="e.status" /></td>
              <td class="actions-cell"><button v-if="canManage && !['已完成','已取消'].includes(e.status)" class="text-btn danger" @click="cancel(e)">取消</button></td>
            </tr>
            <tr v-if="!exams.length"><td colspan="7"><EmptyState text="当天没有检查" icon="monitor" /></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <Modal v-if="modal === 'create'" title="新建检查" subtitle="设备维护窗口和时段冲突会在提交时校验。" @close="modal = ''">
      <div class="form-grid">
        <label>患者姓名<input v-model="form.patient_name" /></label>
        <label>设备<select v-model="form.device_id"><option v-for="d in devices" :key="d.id" :value="d.id">{{ d.id }} · {{ d.name }}</option></select></label>
        <label>日期<input v-model="form.date" type="date" /></label>
        <label>开始时间<input v-model="form.start" type="time" /></label>
        <label>时长（分钟）<input v-model.number="form.duration" type="number" min="10" step="5" /></label>
        <label>检查项目<select v-model="form.exam_item"><option value="">默认项目</option><option v-for="c in currentDevice?.capabilities || []" :key="c" :value="c">{{ c }}</option></select></label>
        <label>优先级<select v-model="form.priority"><option>常规</option><option>优先</option><option>紧急</option></select></label>
        <div class="inline-action"><button class="btn btn-ghost" type="button" @click="suggest"><Icon name="clock" :size="14" /> 推荐空档</button></div>
      </div>
      <template #footer><button class="btn btn-ghost" @click="modal = ''">取消</button><button class="btn btn-primary" :disabled="saving || !form.patient_name || !form.start" @click="create">{{ saving ? '创建中…' : '创建检查' }}</button></template>
    </Modal>

    <Modal v-if="modal === 'device'" title="设备状态" subtitle="维护中的设备不能创建新检查。" @close="modal = ''">
      <div class="device-maintenance-list">
        <div v-for="d in devices" :key="d.id" class="maintenance-row"><span><b>{{ d.id }}</b><small>{{ d.name }}</small></span><StatusBadge :status="d.status" /><button class="btn btn-tiny" @click="toggleDevice(d)">{{ d.status === '维护中' ? '恢复运行' : '转入维护' }}</button></div>
      </div>
    </Modal>
  </div>
</template>
