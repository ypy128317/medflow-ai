<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'

const auth = useAuthStore()
const ui = useUiStore()
const rows = ref([])
const waitlist = ref([])
const status = ref('待分配')
const loading = ref(true)
const selected = ref(null)
const beds = ref([])
const bedId = ref('')
const saving = ref(false)
const canManage = computed(() => auth.can('bed.manage'))

const depts = [['ortho', '骨科'], ['cardio', '心内科'], ['neuro', '神经内科'], ['resp', '呼吸内科'], ['gs', '普外科'], ['onco', '肿瘤科'], ['peds', '儿科']]

async function load() {
  loading.value = true
  try {
    const [admissions, wait] = await Promise.all([
      api.get('/admissions', { status: status.value === '全部' ? undefined : status.value }),
      api.get('/beds/waitlist'),
    ])
    rows.value = admissions
    waitlist.value = wait.filter(w => w.status === '候补中')
  }
  catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

async function openAssign(row) {
  selected.value = row
  bedId.value = ''
  try {
    const data = await api.get('/beds', { dept: row.department_id, status: '空闲' })
    beds.value = data.beds
    if (!beds.value.length) ui.notify('该科室当前没有空闲床位', 'info')
  } catch (e) { ui.notify(e.message, 'error') }
}

async function cancelWait(entry) {
  if (!confirm(`取消 ${entry.patient_name} 的床位候补？`)) return
  try {
    await api.delete(`/beds/waitlist/${entry.id}`)
    ui.notify('床位候补已取消', 'info')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

async function assign() {
  saving.value = true
  try {
    await api.post(`/beds/${bedId.value}/assign`, { admission_id: selected.value.id })
    ui.notify('床位分配成功')
    selected.value = null
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">ADMISSION QUEUE</div><h1>入院申请</h1><p>按主管医师标注的优先级与申请时间排序，不做自动降级。</p></div>
      <div class="page-actions">
        <select v-model="status" @change="load"><option>待分配</option><option>已分配</option><option>全部</option></select>
        <button class="btn btn-primary" @click="$router.push('/ai')"><Icon name="spark" :size="15" /> AI 床位方案</button>
      </div>
    </div>

    <div class="stat-grid compact-grid">
      <article class="stat-card"><div class="stat-label">待分配申请</div><div class="stat-value">{{ rows.filter(r => r.status === '待分配').length }}<em>人</em></div><div class="stat-foot">按优先级排序</div></article>
      <article class="stat-card"><div class="stat-label">紧急 / 优先</div><div class="stat-value">{{ rows.filter(r => ['紧急','优先'].includes(r.priority)).length }}<em>人</em></div><div class="stat-foot">不自动跨越临床优先级</div></article>
      <article class="stat-card"><div class="stat-label">床位候补</div><div class="stat-value">{{ waitlist.length }}<em>人</em></div><div class="stat-foot">未匹配自动进入候补</div></article>
      <article class="stat-card"><div class="stat-label">涉及科室</div><div class="stat-value">{{ new Set(rows.map(r => r.department_id)).size }}<em>个</em></div><div class="stat-foot">全院协调</div></article>
    </div>

    <section class="panel">
      <div class="panel-head"><div><h2>申请列表</h2><p>{{ rows.length }} 条 · 状态 {{ status }}</p></div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>患者</th><th>科室</th><th>需求</th><th>优先级</th><th>申请时间</th><th>状态</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td><b>{{ r.name }}</b><small class="block muted">{{ r.gender }} · {{ r.age }} 岁 · {{ r.id }}</small></td>
              <td>{{ r.department_name }}<small class="block muted">{{ r.diagnosis }}</small></td>
              <td>{{ r.bed_type }}<small class="block muted">{{ r.care_level }} · {{ (r.required_features || []).join(' / ') || '无附加设施' }}</small></td>
              <td><StatusBadge :status="r.priority" /></td>
              <td class="mono">{{ r.applied_at }}</td>
              <td><StatusBadge :status="r.status" /></td>
              <td class="actions-cell">
                <button v-if="canManage && r.status === '待分配'" class="text-btn" @click="openAssign(r)">分配床位</button>
                <span v-else class="muted small">{{ r.assigned_bed_id || '—' }}</span>
              </td>
            </tr>
            <tr v-if="!rows.length"><td colspan="7"><EmptyState text="没有符合条件的入院申请" icon="file" /></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="waitlist.length" class="panel waitlist-bed-panel">
      <div class="panel-head"><div><h2>床位候补队列</h2><p>未匹配患者自动进入，按临床优先级和申请时间排序</p></div><span class="badge warning">{{ waitlist.length }} 人候补中</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>患者</th><th>科室</th><th>原始需求</th><th>优先级</th><th>申请时间</th><th>未匹配原因</th><th /></tr></thead>
          <tbody>
            <tr v-for="w in waitlist" :key="w.id">
              <td><b>{{ w.patient_name }}</b><small class="block muted">{{ w.gender }} · {{ w.age }} 岁 · {{ w.id }}</small></td>
              <td>{{ w.department_name }}</td>
              <td>{{ w.bed_type }}<small class="block muted">{{ (w.required_features || []).join(' / ') || '无附加设施' }}</small></td>
              <td><StatusBadge :status="w.priority" /></td>
              <td class="mono">{{ w.applied_at }}</td>
              <td class="muted small">{{ w.reason }}</td>
              <td class="actions-cell"><button v-if="canManage" class="text-btn danger" @click="cancelWait(w)">取消候补</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Modal v-if="selected" title="手动分配床位" :subtitle="`${selected.name} · ${selected.department_name} · ${selected.bed_type}`" @close="selected = null">
      <div class="form-grid">
        <label class="span-2">选择空闲床位<select v-model="bedId"><option value="" disabled>请选择</option><option v-for="b in beds" :key="b.id" :value="b.id">{{ b.code }} · {{ b.ward_name }} · {{ b.bed_type }} · {{ b.room_no }} 房</option></select></label>
        <div class="info-box span-2"><Icon name="shield" :size="16" /> 系统会再次校验科室、类型、性别、隔离与版本；硬约束不通过会拒绝分配。</div>
      </div>
      <template #footer><button class="btn btn-ghost" @click="selected = null">取消</button><button class="btn btn-primary" :disabled="!bedId || saving" @click="assign">{{ saving ? '分配中…' : '确认分配' }}</button></template>
    </Modal>
  </div>
</template>
