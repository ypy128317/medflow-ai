<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StatusBadge from '../components/StatusBadge.vue'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const staff = ref([])
const conflicts = ref([])
const plans = ref([])
const loading = ref(true)
const modal = ref('')
const saving = ref(false)
const selected = ref(null)
const mode = ref('leave')
const form = reactive({ date: '', new_shift: '休', reason: '' })
const canManage = computed(() => auth.can('staff.manage'))
const dates = computed(() => staff.value.length ? Object.keys(staff.value[0].shifts || {}).sort() : [])
const avgLoad = computed(() => staff.value.length ? Math.round(staff.value.reduce((s, x) => s + x.workload, 0) / staff.value.length) : 0)

async function load() {
  loading.value = true
  try {
    const [s, c, p] = await Promise.all([
      api.get('/staff'), api.get('/staff/conflicts'), api.get('/approvals', { status: '待审批' }),
    ])
    staff.value = s
    conflicts.value = c
    plans.value = p.filter(x => x.kind === 'staff')
  } catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

function openAction(row, kind) {
  selected.value = row
  mode.value = kind
  form.date = dates.value[0] || ''
  form.new_shift = kind === 'leave' ? '休' : '早'
  form.reason = ''
  modal.value = 'action'
}

async function submitAction() {
  saving.value = true
  try {
    if (mode.value === 'leave') {
      await api.post(`/staff/${selected.value.id}/leave`, { date: form.date, reason: form.reason })
      ui.notify('请假已登记')
    } else {
      await api.post(`/staff/${selected.value.id}/swap`, { date: form.date, new_shift: form.new_shift })
      ui.notify('调班已保存')
    }
    modal.value = ''
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

async function generatePlan() {
  try {
    const plan = await api.post('/staff/plans')
    ui.notify('排班方案已生成，等待审批')
    router.push({ path: '/approvals', query: { plan: plan.id } })
  } catch (e) { ui.notify(e.message, 'error') }
}

const shiftClass = (s) => ({ 早: 'am', 中: 'pm', 夜: 'night', 白: 'day', 休: 'off' }[s] || 'off')

onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">WORKFORCE</div><h1>人员排班</h1><p>医护档案、班次、夜班间隔与工作负载。冲突由规则引擎检测，调整必须审批。</p></div>
      <div class="page-actions">
        <button v-if="canManage" class="btn btn-ghost" @click="openAction(null, 'leave')"><Icon name="file" :size="15" /> 请假登记</button>
        <button v-if="canManage" class="btn btn-ghost" @click="openAction(null, 'swap')"><Icon name="refresh" :size="15" /> 调班</button>
        <button v-if="canManage" class="btn btn-primary" @click="generatePlan"><Icon name="spark" :size="15" /> 生成排班方案</button>
      </div>
    </div>

    <div class="stat-grid compact-grid">
      <article class="stat-card"><div class="stat-label">医护人员</div><div class="stat-value">{{ staff.length }}<em>人</em></div><div class="stat-foot">{{ new Set(staff.map(s => s.department_id)).size }} 个科室</div></article>
      <article class="stat-card"><div class="stat-label">平均负载</div><div class="stat-value">{{ avgLoad }}<em>%</em></div><div class="stat-foot">按班次 / 夜班加权</div></article>
      <article class="stat-card"><div class="stat-label">排班冲突</div><div class="stat-value">{{ conflicts.length }}<em>条</em></div><div class="stat-foot">夜班后 11 小时间隔</div></article>
      <article class="stat-card"><div class="stat-label">待审批方案</div><div class="stat-value">{{ plans.length }}<em>个</em></div><div class="stat-foot">在审批中心查看</div></article>
    </div>

    <div class="split-layout wide-main">
      <section class="panel">
        <div class="panel-head"><div><h2>本周排班表</h2><p>{{ dates[0] }} – {{ dates[dates.length - 1] }} · 班次与休息</p></div></div>
        <div class="table-wrap shift-wrap">
          <table class="data-table shift-table">
            <thead><tr><th>人员</th><th>科室</th><th v-for="d in dates" :key="d">{{ d.slice(5) }}</th><th>工时</th><th /></tr></thead>
            <tbody>
              <tr v-for="s in staff" :key="s.id">
                <td><span class="person"><i :style="{ background: s.color }">{{ s.name.slice(0, 1) }}</i><b>{{ s.name }}</b></span><small class="block muted">{{ s.role }} · {{ s.title }}</small></td>
                <td>{{ s.department_name }}<small class="block muted">{{ s.skills?.slice(0, 2).join(' / ') }}</small></td>
                <td v-for="d in dates" :key="d" class="shift-cell">
                  <span :class="['shift', shiftClass(s.shifts[d])]">{{ s.shifts[d] }}</span>
                </td>
                <td><b>{{ s.weekly_hours }}</b><small class="block muted">{{ s.night_shifts }} 夜</small></td>
                <td><button v-if="canManage" class="text-btn" @click="openAction(s, 'swap')">调整</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-head"><div><h2>排班冲突</h2><p>{{ conflicts.length }} 条 · 规则检测</p></div></div>
        <div class="conflict-list">
          <div v-for="c in conflicts" :key="c.id" class="conflict-card">
            <div class="conflict-head"><StatusBadge :status="c.severity" /><b>{{ c.conflict_type }}</b></div>
            <p>{{ c.staff_name }} · {{ c.date }}</p>
            <small>{{ c.detail }}</small>
            <div class="conflict-suggestion">{{ c.suggestion }}</div>
          </div>
          <div v-if="!conflicts.length" class="empty-inline">当前没有排班冲突</div>
        </div>
        <div class="ai-hint"><Icon name="spark" :size="16" /><div><b>AI 排班建议</b><p>生成调整草案并提交授权管理员审批，不会自动发布。</p></div><button v-if="canManage" class="btn btn-tiny btn-primary" @click="generatePlan">生成</button></div>
      </aside>
    </div>

    <Modal v-if="modal === 'action'" :title="mode === 'leave' ? '请假登记' : '调班'" :subtitle="selected ? `${selected.name} · ${selected.department_name}` : '选择人员后提交'" @close="modal = ''">
      <div class="form-grid">
        <label class="span-2" v-if="!selected">人员<select v-model="selected"><option :value="null" disabled>请选择</option><option v-for="s in staff" :key="s.id" :value="s">{{ s.name }} · {{ s.department_name }}</option></select></label>
        <label>日期<select v-model="form.date"><option v-for="d in dates" :key="d">{{ d }}</option></select></label>
        <label v-if="mode === 'swap'">新班次<select v-model="form.new_shift"><option>早</option><option>中</option><option>夜</option><option>休</option></select></label>
        <label class="span-2">原因<input v-model="form.reason" placeholder="选填" /></label>
      </div>
      <template #footer><button class="btn btn-ghost" @click="modal = ''">取消</button><button class="btn btn-primary" :disabled="saving || !selected || !form.date" @click="submitAction">{{ saving ? '提交中…' : '确认' }}</button></template>
    </Modal>
  </div>
</template>
