<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'

const auth = useAuthStore()
const ui = useUiStore()
const alerts = ref([])
const filter = ref('待处理')
const loading = ref(true)
const selected = ref(null)
const saving = ref(false)
const form = reactive({ status: '处理中', note: '' })
const canHandle = computed(() => auth.can('alert.handle'))
const filtered = computed(() => alerts.value.filter(a => filter.value === '全部' || a.status === filter.value))
const counts = computed(() => ({
  open: alerts.value.filter(a => a.status === '待处理').length,
  urgent: alerts.value.filter(a => ['高', '紧急'].includes(a.level) && a.status !== '已处理').length,
  handling: alerts.value.filter(a => a.status === '处理中').length,
}))

async function load() {
  loading.value = true
  try { alerts.value = await api.get('/alerts') }
  catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

async function refresh() {
  try {
    const res = await api.post('/alerts/refresh')
    ui.notify(res.added ? `规则引擎新增 ${res.added} 条预警` : '规则扫描完成，没有新增预警', res.added ? 'success' : 'info')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

function openHandle(a) {
  selected.value = a
  form.status = a.status === '待处理' ? '处理中' : '已处理'
  form.note = ''
}

async function handle() {
  saving.value = true
  try {
    await api.post(`/alerts/${selected.value.id}/handle`, { status: form.status, note: form.note })
    ui.notify(`预警已更新为${form.status}`)
    selected.value = null
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

onMounted(async () => {
  await load()
  try {
    await api.post('/alerts/read')
    window.dispatchEvent(new CustomEvent('medflow:notifications-changed'))
  } catch { /* non-blocking */ }
})
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">RISK SIGNALS</div><h1>运营预警</h1><p>主动发现床位、设备与人员资源的异常。高级预警需 2 小时内响应。</p></div>
      <div class="page-actions"><button class="btn btn-ghost" @click="load"><Icon name="refresh" :size="15" /> 刷新</button><button v-if="canHandle" class="btn btn-primary" @click="refresh"><Icon name="play" :size="15" /> 运行规则引擎</button></div>
    </div>

    <div class="stat-grid compact-grid">
      <article class="stat-card"><div class="stat-label">待处理</div><div class="stat-value">{{ counts.open }}<em>条</em></div><div class="stat-foot">规则引擎持续扫描</div></article>
      <article class="stat-card"><div class="stat-label">高等级</div><div class="stat-value danger">{{ counts.urgent }}<em>条</em></div><div class="stat-foot">优先处置</div></article>
      <article class="stat-card"><div class="stat-label">处理中</div><div class="stat-value">{{ counts.handling }}<em>条</em></div><div class="stat-foot">已分派责任人</div></article>
      <article class="stat-card"><div class="stat-label">规则集</div><div class="stat-value">6<em>类</em></div><div class="stat-foot">床位 / 清洁 / 设备 / 人员 / 预约 / 预测</div></article>
    </div>

    <div class="rule-strip"><Icon name="shield" :size="14" /><span>当前阈值</span><b>床位 ≥ 85%</b><b>科室缺口 ≥ 1</b><b>清洁超时 &gt; 30 分钟</b><b>人员间隔 &lt; 11 小时</b><b>取消率 &gt; 5%</b></div>

    <div class="alert-filter"><div class="segmented"><button v-for="f in ['待处理','处理中','已处理','全部']" :key="f" :class="{ active: filter === f }" @click="filter = f">{{ f }}</button></div><span>{{ filtered.length }} 条</span></div>

    <div class="alert-grid">
      <article v-for="a in filtered" :key="a.id" :class="['alert-card', a.level === '高' || a.level === '紧急' ? 'urgent' : '']">
        <div class="alert-card-head"><span :class="['level-dot', a.level]">{{ a.level }}</span><span class="muted small">{{ a.alert_type }} · {{ a.trigger_at }}</span><StatusBadge :status="a.status" /></div>
        <h3>{{ a.title }}</h3>
        <p class="muted">{{ a.department_name }} · {{ a.cause }}</p>
        <div class="alert-data"><span v-for="(d, i) in a.data || []" :key="i">{{ d }}</span></div>
        <div class="alert-ai"><Icon name="spark" :size="14" /><div><b>AI 建议</b><p>{{ a.suggestion }}</p></div></div>
        <div class="alert-card-foot"><span>来源 {{ a.source }}</span><button v-if="canHandle && a.status !== '已处理'" class="btn btn-tiny" @click="openHandle(a)">处置</button></div>
      </article>
      <EmptyState v-if="!filtered.length" text="这个状态下没有预警" icon="bell" />
    </div>

    <Modal v-if="selected" title="处置预警" :subtitle="selected.title" @close="selected = null">
      <div class="form-grid">
        <label class="span-2">目标状态<select v-model="form.status"><option>处理中</option><option>已处理</option></select></label>
        <label class="span-2">处置说明<textarea v-model="form.note" rows="3" placeholder="记录处置动作与结果" /></label>
      </div>
      <template #footer><button class="btn btn-ghost" @click="selected = null">取消</button><button class="btn btn-primary" :disabled="saving" @click="handle">{{ saving ? '保存中…' : '保存处置' }}</button></template>
    </Modal>
  </div>
</template>
