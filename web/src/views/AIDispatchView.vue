<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import StatusBadge from '../components/StatusBadge.vue'

const router = useRouter()
const ui = useUiStore()
const prompt = ref('帮我制定今天骨科的床位分配方案')
const running = ref(false)
const run = ref(null)
const tasks = ref([])
const historyLoading = ref(true)
const aiStatus = ref(null)

const quick = [
  { label: '骨科床位方案', text: '帮我制定今天骨科的床位分配方案', icon: 'bed' },
  { label: '明日 CT 冲突', text: '检查明天 CT-01 设备是否存在预约冲突，并给出调整建议', icon: 'monitor' },
  { label: '心内科排班', text: '生成心内科排班调整方案', icon: 'users' },
  { label: '床位压力分析', text: '分析本周各科室的床位使用情况和压力', icon: 'spark' },
]

const planId = computed(() => run.value?.plan_id)
const status = computed(() => run.value?.status || '')

async function loadTasks() {
  historyLoading.value = true
  try { tasks.value = (await api.get('/ai/tasks')).slice(0, 8) }
  catch (e) { ui.notify(e.message, 'error') } finally { historyLoading.value = false }
}

async function execute(text = prompt.value) {
  if (!text.trim() || running.value) return
  prompt.value = text
  running.value = true
  run.value = null
  try {
    run.value = await api.post('/ai/tasks', { prompt: text })
    await loadTasks()
    if (run.value.status === 'awaiting_approval') ui.notify('方案已生成，等待人工审批', 'success')
    else if (run.value.status === 'completed') ui.notify('任务已完成', 'success')
    else if (run.value.status === 'failed') ui.notify(run.value.error || '任务失败', 'error')
  } catch (e) { ui.notify(e.message, 'error') } finally { running.value = false }
}

function openTask(t) {
  run.value = t
  prompt.value = t.prompt
}

onMounted(async () => {
  loadTasks()
  try { aiStatus.value = await api.get('/ai/status') } catch { aiStatus.value = null }
})
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">AGENT ORCHESTRATION</div><h1>AI 调度中心</h1><p>输入一句运营指令，Agent 查询快照、检索制度、生成方案，并在人工审批前暂停。</p></div>
      <div class="page-actions">
        <span class="live-pill"><i /> LangGraph · interrupt</span>
        <span :class="['live-pill', aiStatus?.configured ? 'qwen-on' : 'qwen-off']"><i /> {{ aiStatus?.configured ? `Qwen · ${aiStatus.model}` : 'Qwen 未配置 · 规则摘要' }}</span>
      </div>
    </div>

    <section class="prompt-panel">
      <div class="prompt-head"><span class="agent-orb small"><Icon name="spark" :size="17" /></span><div><b>运营调度助手</b><small>只生成建议，不直接修改业务数据</small></div></div>
      <form class="prompt-box" @submit.prevent="execute()">
        <textarea v-model="prompt" rows="3" placeholder="例如：帮我制定今天骨科的床位分配方案" />
        <div class="prompt-foot"><span>支持：床位调度 / 检查冲突 / 排班调整 / 运营分析</span><button class="btn btn-primary" :disabled="running || !prompt.trim()"><span v-if="running" class="spinner" /><Icon v-else name="send" :size="15" /> {{ running ? 'Agent 执行中…' : '发送任务' }}</button></div>
      </form>
      <div class="quick-prompts"><button v-for="q in quick" :key="q.label" @click="execute(q.text)"><Icon :name="q.icon" :size="14" /> {{ q.label }}</button></div>
    </section>

    <div v-if="running" class="panel running-panel"><span class="spinner large" /><div><b>Agent 正在执行</b><p>读取业务快照 → 检索制度 → 生成方案 → 规则校验 → 等待审批</p></div></div>

    <section v-if="!run && !running" class="panel pipeline-panel">
      <div class="panel-head"><div><h2>一次完整调度如何发生</h2><p>每一步都有可追溯的工具调用与制度引用</p></div><span class="live-pill"><i /> 等待任务</span></div>
      <div class="pipeline">
        <div class="pipeline-step"><span>01</span><Icon name="user" :size="18" /><b>理解任务</b><small>识别科室、资源类型和日期范围</small></div>
        <i class="pipeline-arrow" />
        <div class="pipeline-step"><span>02</span><Icon name="database" :size="18" /><b>查询快照</b><small>床位、预约、设备、人员实时数据</small></div>
        <i class="pipeline-arrow" />
        <div class="pipeline-step"><span>03</span><Icon name="book" :size="18" /><b>检索制度</b><small>RAG 命中规则条款并附引用</small></div>
        <i class="pipeline-arrow" />
        <div class="pipeline-step"><span>04</span><Icon name="spark" :size="18" /><b>生成草案</b><small>按硬约束生成可解释方案</small></div>
        <i class="pipeline-arrow" />
        <div class="pipeline-step accent"><span>05</span><Icon name="approval" :size="18" /><b>校验 + 审批</b><small>Validator 复核，人工批准后才执行</small></div>
      </div>
      <div class="pipeline-note"><Icon name="shield" :size="15" /> AI 不会直接修改业务数据；LangGraph 在审批节点暂停，批准后由 MCP 执行并再次复核。</div>
    </section>

    <div v-if="run" class="workflow-layout">
      <section class="panel">
        <div class="panel-head"><div><h2>{{ run.id }}</h2><p>{{ run.prompt }}</p></div><StatusBadge :status="run.status" /></div>
        <div class="workflow-timeline">
          <div v-for="(s, i) in run.steps" :key="i" class="workflow-step">
            <span class="step-dot"><Icon :name="s.agent.includes('Knowledge') ? 'book' : s.agent.includes('Validator') ? 'shield' : s.agent.includes('Human') ? 'approval' : 'spark'" :size="14" /></span>
            <div class="step-copy"><div class="step-title"><b>{{ s.title }}</b><span>{{ s.agent }}</span></div><p>{{ s.detail }}</p><div v-if="s.tool?.name" class="tool-call"><span>{{ s.tool.server }}</span><code>{{ s.tool.name }}</code><em>{{ s.tool.result }}</em></div></div>
          </div>
          <div v-if="!run.steps?.length" class="empty-inline">该任务没有执行轨迹</div>
        </div>
        <div v-if="run.status === 'awaiting_approval'" class="workflow-cta"><Icon name="approval" :size="20" /><div><b>LangGraph 已暂停，等待人工审批</b><p>批准前不会改变任何床位 / 检查 / 班次。</p></div><button class="btn btn-primary" @click="router.push({ path: '/approvals', query: { plan: planId } })">前往审批 <Icon name="arrow" :size="14" /></button></div>
        <div v-else-if="run.status === 'failed'" class="workflow-cta danger"><Icon name="alert" :size="20" /><div><b>任务未生成可执行方案</b><p>{{ run.error || '请检查输入范围或当前资源状态。' }}</p></div></div>
      </section>

      <aside class="panel">
        <div class="panel-head"><div><h2>方案引用</h2><p>{{ run.citations?.length || 0 }} 个制度片段</p></div></div>
        <div class="citation-list">
          <div v-for="c in run.citations" :key="c.chunk_id" class="citation"><Icon name="book" :size="14" /><div><b>{{ c.title }}</b><small>{{ c.heading }} · {{ c.chunk_id }}</small></div></div>
          <div v-if="!run.citations?.length" class="empty-inline">暂无引用</div>
        </div>
        <div class="workflow-side-actions"><button v-if="planId" class="btn btn-ghost btn-block" @click="router.push({ path: '/approvals', query: { plan: planId } })">查看方案 {{ planId }}</button></div>
      </aside>
    </div>

    <section class="panel">
      <div class="panel-head"><div><h2>最近任务</h2><p>工作流执行记录</p></div></div>
      <div class="task-list">
        <button v-for="t in tasks" :key="t.id" class="task-row" @click="openTask(t)">
          <span class="task-icon"><Icon name="spark" :size="16" /></span>
          <span class="task-copy"><b>{{ t.prompt }}</b><small>{{ t.id }} · {{ t.created_at }}</small></span>
          <span class="task-intent">{{ t.intent_label }}</span>
          <StatusBadge :status="t.status" />
        </button>
        <div v-if="!historyLoading && !tasks.length" class="empty-inline">还没有任务记录</div>
      </div>
    </section>
  </div>
</template>
