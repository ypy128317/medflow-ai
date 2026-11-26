<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StatusBadge from '../components/StatusBadge.vue'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const demoOpen = ref(false)
const demoLoading = ref(false)
const loading = ref(true)
const data = ref(null)
const alerts = ref([])
const error = ref('')

const k = computed(() => data.value?.kpis || {})
const departments = computed(() => data.value?.departments || [])
const forecast = computed(() => data.value?.forecast?.rows || [])
const occupancyStyle = computed(() => ({
  background: `conic-gradient(#0f766e ${(k.value.occupancy || 0) * 3.6}deg, #e5efeb 0deg)`,
}))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [overview, alertRows] = await Promise.all([
      api.get('/ops/overview'),
      api.get('/alerts', { status: '待处理' }),
    ])
    data.value = overview
    alerts.value = alertRows.slice(0, 5)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function simulate(action) {
  demoLoading.value = true
  try {
    const res = await api.post('/demo/events', { action })
    demoOpen.value = false
    await load()
    if (res.release?.plan_id) {
      ui.notify(`模拟释放 ${res.release.bed_code}，已生成待审批方案 ${res.release.plan_id}`, 'success', 4500)
    } else if (res.created?.length) {
      ui.notify(`已生成 ${res.created.length} 位新患者和入院申请`, 'success')
    } else {
      ui.notify(res.message || '演示事件已执行', 'info')
    }
  } catch (e) {
    ui.notify(e.message, 'error')
  } finally {
    demoLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <div class="eyebrow">OPERATIONS COCKPIT</div>
        <h1>运营驾驶舱</h1>
        <p>全院床位、预约、检查与人员资源的实时运营视图。</p>
      </div>
      <div class="page-actions">
        <button v-if="auth.can('plan.create')" class="btn btn-ghost" @click="demoOpen = true"><Icon name="play" :size="15" /> 模拟业务事件</button>
        <button class="btn btn-ghost" @click="load"><Icon name="refresh" :size="15" /> 刷新数据</button>
        <button class="btn btn-primary" @click="router.push('/ai')"><Icon name="spark" :size="15" /> 发起 AI 调度</button>
      </div>
    </div>

    <div v-if="error" class="panel error-panel">{{ error }}</div>
    <div v-if="loading" class="skeleton-grid">
      <div v-for="i in 4" :key="i" class="skeleton-card" />
    </div>

    <template v-else-if="data">
      <div class="stat-grid">
        <article class="stat-card">
          <div class="stat-top"><span class="stat-icon teal"><Icon name="calendar" :size="18" /></span><span class="trend up">实时</span></div>
          <div class="stat-label">今日预约</div><div class="stat-value">{{ k.today_appointments }}<em>人次</em></div>
          <div class="stat-foot">有效 {{ k.valid_appointments }} · 取消 {{ k.canceled }}</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-icon blue"><Icon name="bed" :size="18" /></span><span class="trend">床位 {{ k.total_beds }}</span></div>
          <div class="stat-label">当前住院</div><div class="stat-value">{{ k.occupied }}<em>人</em></div>
          <div class="stat-foot">今日预出院 {{ k.pre_discharge }} 人</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-icon amber"><Icon name="box" :size="18" /></span><span class="trend warn">待清洁 {{ k.cleaning }}</span></div>
          <div class="stat-label">可用床位</div><div class="stat-value">{{ k.free }}<em>张</em></div>
          <div class="stat-foot">待入院 {{ k.pending_admissions }} 人</div>
        </article>
        <article class="stat-card">
          <div class="stat-top"><span class="stat-icon rose"><Icon name="shield" :size="18" /></span><span class="trend warn">预警阈值 85%</span></div>
          <div class="stat-label">床位使用率</div><div class="stat-value">{{ k.occupancy }}<em>%</em></div>
          <div class="stat-foot">急诊与重点科室优先</div>
        </article>
      </div>

      <div class="mini-stat-row">
        <div><Icon name="user" :size="15" /><span>今日到诊</span><b>{{ k.visits }}</b></div>
        <div><Icon name="monitor" :size="15" /><span>检查设备利用率</span><b>{{ k.equipment_utilization }}%</b></div>
        <div><Icon name="clock" :size="15" /><span>平均等待</span><b>{{ k.avg_wait }} 分钟</b></div>
        <div><Icon name="bed" :size="15" /><span>平均住院日 ALOS</span><b>{{ k.alos }} 天</b></div>
        <div><Icon name="approval" :size="15" /><span>待审批</span><b>{{ k.pending_approvals }}</b></div>
        <div><Icon name="bell" :size="15" /><span>待处理预警</span><b>{{ k.open_alerts }}</b></div>
      </div>

      <div class="dashboard-grid">
        <section class="panel span-2">
          <div class="panel-head"><div><h2>科室运营结构</h2><p>按今日预约量与床位使用率排序</p></div><button class="link-btn" @click="router.push('/analytics')">查看分析 <Icon name="arrow" :size="14" /></button></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>科室</th><th>预约</th><th>床位</th><th>空闲</th><th>使用率</th><th>状态</th></tr></thead>
              <tbody>
                <tr v-for="d in departments" :key="d.id">
                  <td><span class="dept-dot" :style="{ background: d.color }" /><b>{{ d.name }}</b></td>
                  <td>{{ d.appointments }}</td><td>{{ d.occupied }}/{{ d.total_beds }}</td><td>{{ d.free }}</td>
                  <td><div class="progress"><i :style="{ width: Math.min(100, d.occupancy) + '%', background: d.color }" /></div><small>{{ d.occupancy }}%</small></td>
                  <td><StatusBadge :status="d.risk === 'high' ? '高' : d.risk === 'medium' ? '中' : '低'" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel occupancy-panel">
          <div class="panel-head"><div><h2>床位状态</h2><p>全院 {{ k.total_beds }} 张</p></div></div>
          <div class="donut-wrap">
            <div class="donut" :style="occupancyStyle"><div><b>{{ k.occupancy }}%</b><span>使用率</span></div></div>
            <div class="legend">
              <div><i class="teal" /><span>已入住</span><b>{{ k.occupied }}</b></div>
              <div><i class="mint" /><span>空闲</span><b>{{ k.free }}</b></div>
              <div><i class="amber" /><span>待清洁</span><b>{{ k.cleaning }}</b></div>
              <div><i class="rose" /><span>维护 / 暂停</span><b>{{ k.maintenance }}</b></div>
              <div><i class="violet" /><span>已预留</span><b>{{ k.reserved }}</b></div>
            </div>
          </div>
        </section>

        <section class="panel span-2">
          <div class="panel-head"><div><h2>AI 运营预警</h2><p>按风险等级排序 · 当前 {{ k.open_alerts }} 条待处理</p></div><button class="link-btn" @click="router.push('/alerts')">全部预警 <Icon name="arrow" :size="14" /></button></div>
          <div class="alert-list">
            <button v-for="a in alerts" :key="a.id" class="alert-row" @click="router.push('/alerts')">
              <span :class="['alert-level', a.level === '高' || a.level === '紧急' ? 'danger' : 'warning']">{{ a.level }}</span>
              <span class="alert-main"><b>{{ a.title }}</b><small>{{ a.department_name }} · {{ a.alert_type }} · {{ a.trigger_at?.slice(11) }}</small></span>
              <StatusBadge :status="a.status" />
            </button>
            <div v-if="!alerts.length" class="empty-inline">暂无待处理预警</div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><div><h2>未来三天床位压力</h2><p>预计使用率</p></div></div>
          <div class="forecast-list">
            <div v-for="row in forecast.slice(0, 5)" :key="row.dept">
              <div class="forecast-top"><b>{{ row.dept_name }}</b><span :class="['risk', row.risk === '高' || row.risk === '紧急' ? 'high' : 'mid']">{{ row.risk }}</span></div>
              <div class="progress tall"><i :style="{ width: Math.min(100, row.projected) + '%' }" /></div>
              <small>预计 {{ row.projected }}% · 待入 {{ row.pending }} 人</small>
            </div>
          </div>
        </section>
      </div>

      <section class="agent-banner">
        <div class="agent-orb"><Icon name="spark" :size="24" /></div>
        <div><div class="eyebrow light">LANGGRAPH + RAG</div><h3>把一句运营问题，变成可审批的调度方案</h3><p>Agent 查询业务快照、检索制度、生成草案；Validator 复核后等待人工审批，批准前不会修改任何数据。</p></div>
        <button class="btn btn-light" @click="router.push('/copilot')">问 AI Copilot <Icon name="arrow" :size="15" /></button>
      </section>
    </template>

    <Modal v-if="demoOpen" title="模拟业务事件" subtitle="显式生成演示数据，不会在登录时随机换人。" width="600px" @close="demoOpen = false">
      <div class="demo-event-grid">
        <button :disabled="demoLoading" @click="simulate('admit')"><span class="demo-event-icon"><Icon name="users" :size="19" /></span><b>新增待入院患者</b><small>生成 2 位新患者和入院申请，进入床位调度候选池</small></button>
        <button :disabled="demoLoading" @click="simulate('release')"><span class="demo-event-icon"><Icon name="bed" :size="19" /></span><b>模拟出院并释放床位</b><small>选择待入院患者最多的科室，出院 + 清洁完成，触发床位重匹配</small></button>
        <button :disabled="demoLoading" class="wide" @click="simulate('all')"><span class="demo-event-icon"><Icon name="spark" :size="19" /></span><b>一键模拟完整事件</b><small>先新增患者，再释放一张床位，生成新的待审批调度方案</small></button>
      </div>
      <div class="info-box"><Icon name="shield" :size="16" /> 这是显式的演示事件，不会自动在登录时生成；生成后仍需人工审批才会修改床位。</div>
    </Modal>
  </div>
</template>
