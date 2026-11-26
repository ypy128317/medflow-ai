<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api/client'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import StatusBadge from '../components/StatusBadge.vue'

const ui = useUiStore()
const days = ref(7)
const data = ref(null)
const loading = ref(true)
const report = ref(null)
const reportLoading = ref(false)
const k = computed(() => data.value?.kpis || {})
const departments = computed(() => data.value?.departments || [])
const forecast = computed(() => data.value?.forecast?.rows || [])

async function load() {
  loading.value = true
  try { data.value = await api.get('/ops/analytics', { days: days.value }) }
  catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

async function generateReport() {
  reportLoading.value = true
  try { report.value = await api.post(`/ops/report?days=${days.value}`) }
  catch (e) { ui.notify(e.message, 'error') } finally { reportLoading.value = false }
}

watch(days, load); onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">ANALYTICS</div><h1>数据分析</h1><p>床位、预约、设备与人员指标，全部来自后端统计服务。</p></div>
      <div class="page-actions">
        <div class="segmented"><button :class="{ active: days === 7 }" @click="days = 7">近 7 天</button><button :class="{ active: days === 30 }" @click="days = 30">近 30 天</button></div>
        <button class="btn btn-primary" :disabled="reportLoading" @click="generateReport"><Icon name="spark" :size="15" /> {{ reportLoading ? '生成中…' : '生成 AI 报告' }}</button>
      </div>
    </div>

    <div class="stat-grid">
      <article class="stat-card"><div class="stat-label">床位使用率</div><div class="stat-value">{{ k.occupancy }}<em>%</em></div><div class="stat-foot">已入住 {{ k.occupied }} / {{ k.total_beds }}</div></article>
      <article class="stat-card"><div class="stat-label">平均住院日</div><div class="stat-value">{{ k.alos }}<em>天</em></div><div class="stat-foot">ALOS · 当前在院患者</div></article>
      <article class="stat-card"><div class="stat-label">检查设备利用率</div><div class="stat-value">{{ k.equipment_utilization }}<em>%</em></div><div class="stat-foot">08:00–18:00 窗口</div></article>
      <article class="stat-card"><div class="stat-label">预约取消率</div><div class="stat-value">{{ data?.appointments?.cancel_rate || 0 }}<em>%</em></div><div class="stat-foot">今日 {{ data?.appointments?.total || 0 }} 条预约</div></article>
    </div>

    <div class="dashboard-grid">
      <section class="panel span-2">
        <div class="panel-head"><div><h2>科室运营对比</h2><p>预约量 / 床位使用率 / 平均等待</p></div></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>科室</th><th>预约</th><th>床位</th><th>使用率</th><th>待入院</th><th>平均等待</th><th>风险</th></tr></thead>
            <tbody><tr v-for="d in departments" :key="d.id"><td><span class="dept-dot" :style="{ background: d.color }" /><b>{{ d.name }}</b></td><td>{{ d.appointments }}</td><td>{{ d.occupied }}/{{ d.total_beds }}</td><td><div class="progress"><i :style="{ width: d.occupancy + '%', background: d.color }" /></div><small>{{ d.occupancy }}%</small></td><td>{{ d.pending }}</td><td>{{ d.avg_wait }} 分</td><td><StatusBadge :status="d.risk === 'high' ? '高' : d.risk === 'medium' ? '中' : '低'" /></td></tr></tbody>
          </table>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>未来三天风险</h2><p>预计使用率</p></div></div>
        <div class="forecast-list">
          <div v-for="r in forecast.slice(0, 6)" :key="r.dept"><div class="forecast-top"><b>{{ r.dept_name }}</b><StatusBadge :status="r.risk" /></div><div class="progress tall"><i :style="{ width: Math.min(100, r.projected) + '%' }" /></div><small>预计 {{ r.projected }}% · 待入 {{ r.pending }} 人</small></div>
        </div>
      </section>
      <section class="panel span-2">
        <div class="panel-head"><div><h2>指标说明</h2><p>{{ data?.range }}</p></div></div>
        <div class="metric-notes">
          <div><Icon name="bed" :size="18" /><b>ALOS</b><p>当前在院患者从入住到演示时间点的平均天数，排除空床和维护床位。</p></div>
          <div><Icon name="monitor" :size="18" /><b>设备利用率</b><p>当天有效检查总时长 / 设备开放总时长，取消检查不计入。</p></div>
          <div><Icon name="calendar" :size="18" /><b>取消率</b><p>当天已取消预约 / 当天全部预约，用于观察号源浪费。</p></div>
        </div>
      </section>
    </div>

    <section v-if="report" class="panel report-panel">
      <div class="panel-head">
        <div><h2>{{ report.title }}</h2><p>{{ report.range }} · {{ report.generated_at }} · {{ report.llm?.configured ? `Qwen ${report.llm.model}` : '规则模板（Qwen 未配置）' }}</p></div>
        <StatusBadge :status="report.llm?.ok ? '已完成' : '规则模板'" />
      </div>
      <div v-if="report.ai_summary" class="ai-summary"><Icon name="spark" :size="17" /><div><b>Qwen 管理摘要</b><p>{{ report.ai_summary }}</p></div></div>
      <div v-else class="info-box"><Icon name="alert" :size="16" /> Qwen 未配置或调用失败，以下使用规则模板摘要；配置 `DASHSCOPE_API_KEY` 后自动生成。</div>
      <div class="report-sections">
        <div v-for="s in report.sections" :key="s.title"><b>{{ s.title }}</b><p>{{ s.body }}</p></div>
      </div>
    </section>
  </div>
</template>
