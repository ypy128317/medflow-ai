<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const input = ref('')
const loading = ref(false)
const sessionId = ref('')
const status = ref(null)
const scroller = ref(null)
const greeting = '你好，我是 MedFlow Copilot。可以问我全院床位、入院申请、检查冲突、排班冲突或制度条款。也可以让我生成待审批的调度方案。'
const messages = ref([{ role: 'assistant', content: greeting, tools: [] }])
let restored = false

const storageKey = () => `medflow_copilot_${auth.user?.id || 'anon'}`

function saveConversation() {
  if (!restored) return
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      sessionId: sessionId.value,
      messages: messages.value.slice(-20),
    }))
  } catch { /* quota issues are non-blocking */ }
}

const suggestions = [
  '现在全院还有多少空床？',
  '帮我制定今天骨科的床位分配方案',
  '今天 CT-01 有没有检查冲突？',
  '现在有哪些排班冲突？',
]

onMounted(async () => {
  try {
    const raw = localStorage.getItem(storageKey())
    if (raw) {
      const saved = JSON.parse(raw)
      if (Array.isArray(saved.messages) && saved.messages.length) {
        messages.value = saved.messages
        sessionId.value = saved.sessionId || ''
      }
    }
  } catch { /* ignore malformed local history */ }
  restored = true
  try { status.value = await api.get('/copilot/status') } catch { status.value = null }
  await scrollBottom()
})

watch([messages, sessionId], saveConversation, { deep: true })

async function scrollBottom() {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

async function send(text = input.value) {
  const prompt = String(text || '').trim()
  if (!prompt || loading.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: prompt, tools: [] })
  loading.value = true
  await scrollBottom()
  try {
    const res = await api.post('/copilot/chat', { message: prompt, session_id: sessionId.value || undefined })
    sessionId.value = res.session_id
    messages.value.push({
      role: 'assistant', content: res.reply, tools: res.tool_trace || [],
      planId: res.plan_id, qwen: res.qwen,
    })
  } catch (e) {
    messages.value.push({ role: 'assistant', content: `请求失败：${e.message}`, tools: [], error: true })
  } finally {
    loading.value = false
    await scrollBottom()
  }
}

function reset() {
  sessionId.value = ''
  messages.value = [{
    role: 'assistant',
    content: '会话已清空。可以继续问我运营数据，或让我生成床位调度方案。',
    tools: [],
  }]
  try { localStorage.removeItem(storageKey()) } catch { /* ignore */ }
}

function openPlan(id) {
  router.push({ path: '/approvals', query: { plan: id } })
}

function formatMessage(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}
</script>

<template>
  <div class="copilot-page">
    <div class="page-header">
      <div>
        <div class="eyebrow">AI COPILOT</div>
        <h1>运营 Copilot</h1>
        <p>用一句话查数据、找冲突、生成待审批方案。Qwen 自主选择工具，所有数字来自实时业务服务。</p>
      </div>
      <div class="page-actions">
        <span :class="['live-pill', status?.configured ? 'qwen-on' : 'qwen-off']"><i /> {{ status?.configured ? `Qwen · ${status.model}` : 'Qwen 未配置' }}</span>
        <button class="btn btn-ghost" @click="reset"><Icon name="refresh" :size="14" /> 新会话</button>
      </div>
    </div>

    <div class="copilot-layout">
      <section class="panel copilot-chat-panel">
        <div ref="scroller" class="copilot-messages">
          <div v-for="(m, i) in messages" :key="i" :class="['copilot-message', m.role]">
            <div class="copilot-avatar"><Icon :name="m.role === 'assistant' ? 'spark' : 'user'" :size="16" /></div>
            <div class="copilot-bubble">
              <p v-html="formatMessage(m.content)" />

              <details v-if="m.tools?.length" class="copilot-tools">
                <summary><Icon name="play" :size="12" /> 工具调用 {{ m.tools.length }} 次</summary>
                <div v-for="(t, ti) in m.tools" :key="ti" class="copilot-tool">
                  <code>{{ t.name }}</code>
                  <span v-if="t.error" class="danger">{{ t.error }}</span>
                  <pre>{{ JSON.stringify(t.result, null, 2).slice(0, 500) }}</pre>
                </div>
              </details>

              <div v-if="m.planId" class="copilot-plan">
                <div><b>已生成待审批方案</b><small>{{ m.planId }} · 尚未执行</small></div>
                <button class="btn btn-tiny btn-primary" @click="openPlan(m.planId)">前往审批</button>
              </div>
            </div>
          </div>
          <div v-if="loading" class="copilot-message assistant"><div class="copilot-avatar"><Icon name="spark" :size="16" /></div><div class="copilot-bubble typing"><span /><span /><span /></div></div>
        </div>

        <div class="copilot-suggestions">
          <button v-for="s in suggestions" :key="s" @click="send(s)">{{ s }}</button>
        </div>
        <form class="copilot-input" @submit.prevent="send()">
          <textarea v-model="input" rows="2" placeholder="问床位、入院、检查、排班，或让我生成调度方案…" @keydown.enter.exact.prevent="send()" />
          <button class="btn btn-primary" :disabled="loading || !input.trim()"><Icon name="send" :size="15" /> 发送</button>
        </form>
      </section>

      <aside class="panel copilot-side">
        <div class="panel-head"><div><h2>能做什么</h2><p>Function Calling 工具</p></div></div>
        <div class="copilot-capabilities">
          <div><Icon name="bed" :size="17" /><div><b>床位与入院</b><p>查空床、待入院、候补，生成待审批床位方案</p></div></div>
          <div><Icon name="calendar" :size="17" /><div><b>预约号源</b><p>查科室医生和可用时段</p></div></div>
          <div><Icon name="monitor" :size="17" /><div><b>检查冲突</b><p>查设备时段重叠</p></div></div>
          <div><Icon name="users" :size="17" /><div><b>排班冲突</b><p>查夜班后休息不足</p></div></div>
          <div><Icon name="bell" :size="17" /><div><b>运营预警</b><p>读取待处理风险</p></div></div>
          <div><Icon name="book" :size="17" /><div><b>制度检索</b><p>检索 RAG 制度条款</p></div></div>
        </div>
        <div class="copilot-guard"><Icon name="shield" :size="16" /><p>Copilot 只能创建待审批方案，不能审批、执行或修改排班；审批仍由人完成。</p></div>
      </aside>
    </div>
  </div>
</template>
