<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import { TODAY, TOMORROW, shortDate } from '../utils/date'

const auth = useAuthStore()
const ui = useUiStore()
const date = ref(TODAY)
const status = ref('全部状态')
const dept = ref('')
const rows = ref([])
const waitlist = ref([])
const doctors = ref([])
const loading = ref(true)
const modal = ref('')
const slots = ref([])
const saving = ref(false)
const selected = ref(null)

const createForm = reactive({ patient_name: '', phone: '', gender: '女', age: 35, doctor_id: '', date: TODAY, slot: '', reason: '' })
const resForm = reactive({ date: TODAY, slot: '' })
const waitForm = reactive({ patient_name: '', phone: '', dept: 'ortho', preferred_date: TOMORROW, preferred_period: '上午', note: '' })

const depts = [
  ['ortho', '骨科'], ['cardio', '心内科'], ['neuro', '神经内科'], ['resp', '呼吸内科'],
  ['gs', '普外科'], ['onco', '肿瘤科'], ['peds', '儿科'],
]
const statuses = ['全部状态', '待确认', '已预约', '已签到', '已完成', '已取消']
const canManage = computed(() => auth.can('appointment.manage'))
const filtered = computed(() => rows.value.filter(r => status.value === '全部状态' || r.status === status.value))
const stats = computed(() => {
  const total = rows.value.length
  const canceled = rows.value.filter(r => r.status === '已取消').length
  const visited = rows.value.filter(r => ['已签到', '已完成'].includes(r.status)).length
  const waits = rows.value.filter(r => r.wait_minutes > 0).map(r => r.wait_minutes)
  return { total, canceled, visited, avgWait: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0 }
})
const waiting = computed(() => waitlist.value.filter(w => w.status === '等待中'))

async function load() {
  loading.value = true
  try {
    const [appts, wl] = await Promise.all([
      api.get('/appointments', { date: date.value, dept: dept.value || undefined }),
      api.get('/appointments/waitlist'),
    ])
    rows.value = appts
    waitlist.value = wl
  } catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

async function loadDoctors() {
  if (doctors.value.length) return
  doctors.value = await api.get('/doctors', { dept: createForm.dept || undefined })
}

async function openCreate() {
  modal.value = 'create'
  Object.assign(createForm, { patient_name: '', phone: '', gender: '女', age: 35, doctor_id: '', date: TOMORROW, slot: '', reason: '' })
  await loadDoctors()
  createForm.doctor_id = doctors.value.find(d => d.department_id === 'ortho')?.id || doctors.value[0]?.id || ''
  await refreshSlots()
}

async function refreshSlots() {
  if (!createForm.doctor_id || !createForm.date) { slots.value = []; return }
  slots.value = await api.get(`/appointments/slots/${createForm.doctor_id}`, { date: createForm.date })
  if (!slots.value.some(s => s.slot === createForm.slot)) createForm.slot = slots.value[0]?.slot || ''
}

async function createAppointment() {
  saving.value = true
  try {
    await api.post('/appointments', {
      patient_name: createForm.patient_name, phone: createForm.phone, gender: createForm.gender,
      age: Number(createForm.age), doctor_id: createForm.doctor_id, date: createForm.date,
      slot: createForm.slot, reason: createForm.reason,
    })
    ui.notify('预约已创建')
    modal.value = ''
    date.value = createForm.date
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

async function action(row, kind) {
  if (kind === 'cancel' && !confirm(`确认取消 ${row.patient_name} 的预约？`)) return
  try {
    const path = `/appointments/${row.id}/${kind}`
    if (kind === 'cancel') await api.post(`${path}?reason=运营后台取消`)
    else await api.post(path)
    ui.notify(kind === 'checkin' ? '签到成功' : kind === 'complete' ? '已完成就诊' : '预约已取消')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

async function openReschedule(row) {
  selected.value = row
  resForm.date = row.date
  resForm.slot = ''
  modal.value = 'reschedule'
  slots.value = await api.get(`/appointments/slots/${row.doctor_id}`, { date: resForm.date })
  resForm.slot = slots.value[0]?.slot || ''
}

async function changeResDate() {
  if (!selected.value) return
  slots.value = await api.get(`/appointments/slots/${selected.value.doctor_id}`, { date: resForm.date })
  resForm.slot = slots.value[0]?.slot || ''
}

async function reschedule() {
  saving.value = true
  try {
    await api.post(`/appointments/${selected.value.id}/reschedule`, { date: resForm.date, slot: resForm.slot })
    ui.notify('改约成功')
    modal.value = ''
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

async function addWaitlist() {
  saving.value = true
  try {
    await api.post('/appointments/waitlist', { ...waitForm })
    ui.notify('已加入候补队列')
    modal.value = ''
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

async function promote(w) {
  try {
    await api.post(`/appointments/waitlist/${w.id}/promote`)
    ui.notify('候补补位成功')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

async function removeWait(w) {
  if (!confirm(`移除候补 ${w.patient_name}？`)) return
  try {
    await api.delete(`/appointments/waitlist/${w.id}`)
    ui.notify('候补已移除', 'info')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

watch(date, load)
watch(dept, load)
watch(() => createForm.doctor_id, refreshSlots)
watch(() => createForm.date, refreshSlots)
onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <div class="eyebrow">APPOINTMENTS</div>
        <h1>预约管理</h1>
        <p>号源、预约状态与候补队列。AI 只推荐可用时段，正式变更需确认。</p>
      </div>
      <div class="page-actions">
        <button v-if="canManage" class="btn btn-ghost" @click="modal = 'waitlist'"><Icon name="clock" :size="15" /> 加入候补</button>
        <button v-if="canManage" class="btn btn-primary" @click="openCreate"><Icon name="plus" :size="15" /> 新建预约</button>
      </div>
    </div>

    <div class="stat-grid compact-grid">
      <article class="stat-card"><div class="stat-label">当日预约</div><div class="stat-value">{{ stats.total }}<em>条</em></div><div class="stat-foot">取消 {{ stats.canceled }} 条</div></article>
      <article class="stat-card"><div class="stat-label">已签到 / 完成</div><div class="stat-value">{{ stats.visited }}<em>人</em></div><div class="stat-foot">到诊率 {{ stats.total ? Math.round(stats.visited / stats.total * 100) : 0 }}%</div></article>
      <article class="stat-card"><div class="stat-label">平均等待</div><div class="stat-value">{{ stats.avgWait }}<em>分钟</em></div><div class="stat-foot">按已叫号样本计算</div></article>
      <article class="stat-card"><div class="stat-label">候补队列</div><div class="stat-value">{{ waiting.length }}<em>人</em></div><div class="stat-foot">按登记时间排序</div></article>
    </div>

    <div class="split-layout">
      <section class="panel">
        <div class="panel-head">
          <div class="segmented">
            <button :class="{ active: date === TODAY }" @click="date = TODAY">今天 · {{ shortDate(TODAY) }}</button>
            <button :class="{ active: date === TOMORROW }" @click="date = TOMORROW">明天 · {{ shortDate(TOMORROW) }}</button>
          </div>
          <div class="filters">
            <select v-model="dept"><option value="">全部科室</option><option v-for="d in depts" :key="d[0]" :value="d[0]">{{ d[1] }}</option></select>
            <select v-model="status"><option v-for="s in statuses" :key="s">{{ s }}</option></select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>时段</th><th>患者</th><th>科室 / 医生</th><th>状态</th><th>等待</th><th /></tr></thead>
            <tbody>
              <tr v-for="r in filtered" :key="r.id">
                <td class="mono">{{ r.slot }}</td>
                <td><b>{{ r.patient_name }}</b><span v-if="r.source === 'AI 分诊'" class="source-tag">患者端预约</span><small class="block muted">{{ r.id }} · {{ r.phone }}</small></td>
                <td>{{ r.department_name }}<small class="block muted">{{ r.doctor_name }} · {{ r.room }}</small></td>
                <td><StatusBadge :status="r.status" /></td>
                <td>{{ r.wait_minutes ? `${r.wait_minutes} 分` : '—' }}</td>
                <td class="actions-cell">
                  <template v-if="canManage">
                    <button v-if="['待确认','已预约'].includes(r.status)" class="text-btn" @click="action(r, 'checkin')">签到</button>
                    <button v-if="r.status === '已签到'" class="text-btn" @click="action(r, 'complete')">完成</button>
                    <button v-if="['待确认','已预约'].includes(r.status)" class="text-btn" @click="openReschedule(r)">改约</button>
                    <button v-if="!['已完成','已取消'].includes(r.status)" class="text-btn danger" @click="action(r, 'cancel')">取消</button>
                  </template>
                  <span v-else class="muted small">只读</span>
                </td>
              </tr>
              <tr v-if="!filtered.length"><td colspan="6"><EmptyState text="当天没有符合条件的预约" icon="calendar" /></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel waitlist-panel">
        <div class="panel-head"><div><h2>候补队列</h2><p>{{ waiting.length }} 位等待中 · 按登记时间</p></div><button v-if="canManage" class="icon-btn" @click="modal = 'waitlist'"><Icon name="plus" :size="15" /></button></div>
        <div class="waitlist-list">
          <div v-for="w in waiting" :key="w.id" class="waitlist-row">
            <div class="waitlist-top"><b>{{ w.patient_name }}</b><StatusBadge :status="w.priority" /></div>
            <p>{{ w.department_name }} · {{ w.preferred_date }} · {{ w.preferred_period }}</p>
            <div class="waitlist-actions">
              <span>{{ w.registered_at?.slice(11) }} 登记</span>
              <button v-if="canManage" class="btn btn-tiny btn-primary" @click="promote(w)">补位</button>
              <button v-if="canManage" class="btn btn-tiny" @click="removeWait(w)">移除</button>
            </div>
          </div>
          <EmptyState v-if="!waiting.length" text="候补队列为空" icon="clock" />
        </div>
      </aside>
    </div>

    <Modal v-if="modal === 'create'" title="新建预约" subtitle="号源冲突和重复预约会在提交时再次校验。" @close="modal = ''">
      <form class="form-grid" @submit.prevent="createAppointment">
        <label>患者姓名<input v-model="createForm.patient_name" required placeholder="患者姓名" /></label>
        <label>手机号<input v-model="createForm.phone" placeholder="138****0000" /></label>
        <label>科室<select v-model="createForm.dept" @change="loadDoctors"><option v-for="d in depts" :key="d[0]" :value="d[0]">{{ d[1] }}</option></select></label>
        <label>医生<select v-model="createForm.doctor_id"><option v-for="d in doctors.filter(x => !createForm.dept || x.department_id === createForm.dept)" :key="d.id" :value="d.id">{{ d.name }} · {{ d.title }}</option></select></label>
        <label>日期<input v-model="createForm.date" type="date" /></label>
        <label>号源<select v-model="createForm.slot"><option v-for="s in slots" :key="s.slot" :value="s.slot">{{ s.slot }} · {{ s.room }}</option></select></label>
        <label class="span-2">就诊原因<input v-model="createForm.reason" placeholder="选填" /></label>
      </form>
      <template #footer><button class="btn btn-ghost" @click="modal = ''">取消</button><button class="btn btn-primary" :disabled="saving || !createForm.patient_name || !createForm.slot" @click="createAppointment">{{ saving ? '提交中…' : '确认预约' }}</button></template>
    </Modal>

    <Modal v-if="modal === 'reschedule'" title="改约" :subtitle="selected?.patient_name" @close="modal = ''">
      <div class="form-grid">
        <label>日期<input v-model="resForm.date" type="date" @change="changeResDate" /></label>
        <label>新号源<select v-model="resForm.slot"><option v-for="s in slots" :key="s.slot" :value="s.slot">{{ s.slot }} · {{ s.room }}</option></select></label>
      </div>
      <template #footer><button class="btn btn-ghost" @click="modal = ''">取消</button><button class="btn btn-primary" :disabled="saving || !resForm.slot" @click="reschedule">确认改约</button></template>
    </Modal>

    <Modal v-if="modal === 'waitlist'" title="加入候补" subtitle="补位前会重新校验重复预约与号源占用。" @close="modal = ''">
      <form class="form-grid" @submit.prevent="addWaitlist">
        <label>患者姓名<input v-model="waitForm.patient_name" required /></label>
        <label>手机号<input v-model="waitForm.phone" /></label>
        <label>科室<select v-model="waitForm.dept"><option v-for="d in depts" :key="d[0]" :value="d[0]">{{ d[1] }}</option></select></label>
        <label>期望日期<input v-model="waitForm.preferred_date" type="date" /></label>
        <label>期望时段<select v-model="waitForm.preferred_period"><option>上午</option><option>下午</option></select></label>
        <label>优先级<select v-model="waitForm.priority"><option>常规</option><option>优先</option></select></label>
        <label class="span-2">备注<input v-model="waitForm.note" placeholder="选填" /></label>
      </form>
      <template #footer><button class="btn btn-ghost" @click="modal = ''">取消</button><button class="btn btn-primary" :disabled="saving || !waitForm.patient_name" @click="addWaitlist">加入候补</button></template>
    </Modal>
  </div>
</template>
