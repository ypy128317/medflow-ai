<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const username = ref('chenming')
const password = ref('medflow2026')
const error = ref('')
const apiOnline = ref(false)

const accounts = [
  { username: 'chenming', name: '陈明', role: '医院运营主管', scope: '全院运营 / 审批', color: '#0f766e', mark: '陈' },
  { username: 'wangli', name: '王丽', role: '床位管理员', scope: '床位 / 入院', color: '#3b82f6', mark: '王' },
  { username: 'lina', name: '李娜', role: '预约管理员', scope: '预约 / 候补', color: '#8b5cf6', mark: '李' },
  { username: 'zhouhang', name: '周航', role: '医技管理员', scope: '检查 / 设备', color: '#0ea5e9', mark: '周' },
  { username: 'liufang', name: '刘芳', role: '排班管理员', scope: '人员 / 班次', color: '#f59e0b', mark: '刘' },
  { username: 'zhangwei', name: '张伟', role: '系统管理员', scope: '全局 / 审计', color: '#64748b', mark: '张' },
]

function choose(account) {
  username.value = account.username
  password.value = 'medflow2026'
  error.value = ''
}

async function submit() {
  error.value = ''
  try {
    const user = await auth.login(username.value.trim(), password.value)
    if (user.role === 'patient') {
      auth.logout(false)
      throw new Error('患者账号请使用独立的就医助手入口')
    }
    ui.notify(`欢迎回来，${auth.user.name}`, 'success')
    router.replace(route.query.redirect || '/dashboard')
  } catch (e) {
    error.value = e.message || '登录失败'
  }
}

onMounted(async () => {
  try {
    const health = await fetch('/health').then(r => r.ok ? r.json() : null)
    apiOnline.value = Boolean(health && health.status === 'ok')
  } catch { apiOnline.value = false }
})
</script>

<template>
  <div class="login-page">
    <section class="login-hero">
      <div class="login-brand">
        <span class="brand-mark large"><Icon name="spark" :size="24" /></span>
        <div><b>MedFlow AI</b><small>医院运营与医疗资源调度平台</small></div>
      </div>
      <div class="hero-copy">
        <div class="eyebrow light">OPERATIONS INTELLIGENCE</div>
        <h1>让每一张床、<br />每一个号源都有依据。</h1>
        <p>真实业务规则 + LangGraph 审批工作流 + 可追溯的 MCP 工具调用。AI 只生成建议，关键动作始终由人确认。</p>
      </div>
      <div class="hero-metrics">
        <div><b>96</b><span>床位实时状态</span></div>
        <div><b>64</b><span>今日预约</span></div>
        <div><b>11<em>s</em></b><span>平均审批闭环</span></div>
      </div>
      <div class="hero-diagram">
        <div class="flow-node"><Icon name="users" :size="16" /><span>业务快照</span></div>
        <i />
        <div class="flow-node"><Icon name="book" :size="16" /><span>制度检索</span></div>
        <i />
        <div class="flow-node accent"><Icon name="spark" :size="16" /><span>方案生成</span></div>
        <i />
        <div class="flow-node"><Icon name="shield" :size="16" /><span>规则校验</span></div>
        <i />
        <div class="flow-node"><Icon name="approval" :size="16" /><span>人工审批</span></div>
      </div>
      <div class="hero-foot">
        <span><i :class="['status-dot', { online: apiOnline }]" /> {{ apiOnline ? 'API 已连接' : 'API 未连接' }}</span>
        <span>演示数据 · 不含真实患者隐私</span>
      </div>
    </section>

    <section class="login-panel">
      <div class="panel-inner">
        <div class="panel-head">
          <div class="eyebrow">SIGN IN</div>
          <h2>进入运营中心</h2>
          <p>使用演示账号进入，或选择下方角色快速切换。</p>
        </div>

        <form class="login-form" @submit.prevent="submit">
          <label>用户名<input v-model="username" autocomplete="username" placeholder="chenming" /></label>
          <label>密码<input v-model="password" type="password" autocomplete="current-password" placeholder="medflow2026" /></label>
          <div v-if="error" class="form-error"><Icon name="alert" :size="14" /> {{ error }}</div>
          <button class="btn btn-primary btn-block" :disabled="auth.loading">
            <span v-if="auth.loading" class="spinner" /><Icon v-else name="arrow" :size="16" />
            {{ auth.loading ? '正在验证…' : '登录系统' }}
          </button>
        </form>

        <div class="demo-divider"><span>演示角色</span></div>
        <div class="account-grid">
          <button v-for="a in accounts" :key="a.username" :class="['account-card', { selected: username === a.username }]" @click="choose(a)">
            <span class="account-avatar" :style="{ background: a.color }">{{ a.mark }}</span>
            <span class="account-info"><b>{{ a.name }}</b><small>{{ a.role }}</small></span>
            <Icon name="chevron" :size="14" />
          </button>
        </div>
        <div class="login-note">演示密码统一为 <code>medflow2026</code> · 登录失败请确认后端 API 已启动</div>
      </div>
    </section>
  </div>
</template>
