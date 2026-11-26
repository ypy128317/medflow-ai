<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import { TODAY, chineseDate } from '../utils/date'

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const userOpen = ref(false)
const alertCount = ref(0)
const approvalCount = ref(0)

const groups = computed(() => [
  {
    label: '运营总览',
    items: [
      { to: '/dashboard', label: '运营驾驶舱', icon: 'dashboard' },
      { to: '/alerts', label: '运营预警', icon: 'bell', badge: alertCount.value },
      { to: '/analytics', label: '数据分析', icon: 'spark' },
    ],
  },
  {
    label: '业务资源',
    items: [
      { to: '/appointments', label: '预约管理', icon: 'calendar' },
      { to: '/beds', label: '床位管理', icon: 'bed' },
      { to: '/admissions', label: '入院申请', icon: 'file' },
      { to: '/exams', label: '检查资源', icon: 'monitor' },
      { to: '/staff', label: '人员排班', icon: 'users' },
    ],
  },
  {
    label: '智能中枢',
    items: [
      { to: '/copilot', label: 'AI Copilot', icon: 'spark' },
      { to: '/ai', label: 'AI 调度中心', icon: 'spark' },
      { to: '/approvals', label: '审批中心', icon: 'approval', badge: approvalCount.value },
      { to: '/knowledge', label: '运营知识库', icon: 'book' },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/users', label: '系统管理', icon: 'settings', adminOnly: true },
    ],
  },
])

const visibleGroups = computed(() => groups.value.map(g => ({
  ...g,
  items: g.items.filter(i => !i.adminOnly || auth.isAdmin),
})).filter(g => g.items.length))

const initials = computed(() => (auth.user?.name || 'M').slice(0, 1))
const currentTitle = computed(() => route.meta.title || '运营驾驶舱')

async function loadCounters() {
  try {
    const [unread, plans] = await Promise.all([
      api.get('/alerts/unread-count'),
      api.get('/approvals', { status: '待审批' }),
    ])
    alertCount.value = unread.count
    approvalCount.value = plans.length
  } catch { /* non-blocking */ }
}

function go(path) {
  mobileOpen.value = false
  userOpen.value = false
  router.push(path)
}

function logout() {
  try { localStorage.removeItem(`medflow_copilot_${auth.user?.id || 'anon'}`) } catch { /* ignore */ }
  auth.logout()
  ui.notify('已退出登录', 'info')
}

watch(() => route.path, loadCounters)
const onNotificationsChanged = () => loadCounters()
onMounted(() => {
  loadCounters()
  window.addEventListener('medflow:notifications-changed', onNotificationsChanged)
})
onUnmounted(() => window.removeEventListener('medflow:notifications-changed', onNotificationsChanged))
</script>

<template>
  <div class="shell">
    <div v-if="mobileOpen" class="sidebar-mask" @click="mobileOpen = false" />
    <aside :class="['sidebar', { open: mobileOpen }]">
      <button class="brand" @click="go('/dashboard')">
        <span class="brand-mark"><Icon name="spark" :size="19" /></span>
        <span class="brand-copy"><b>MedFlow AI</b><small>医院运营与医疗资源调度平台</small></span>
      </button>

      <div class="hospital-pill">
        <span class="hospital-dot" />
        <div><b>中心医院</b><small>运营沙盘环境</small></div>
        <span class="demo-pill">DEMO</span>
      </div>

      <nav class="nav">
        <div v-for="group in visibleGroups" v-show="group.items.length" :key="group.label" class="nav-group">
          <div class="nav-label">{{ group.label }}</div>
          <button v-for="item in group.items" :key="item.to"
                  :class="['nav-item', { active: route.path === item.to }]" @click="go(item.to)">
            <Icon :name="item.icon" :size="17" />
            <span>{{ item.label }}</span>
            <em v-if="item.badge" class="nav-badge">{{ item.badge }}</em>
          </button>
        </div>
      </nav>

      <div class="sidebar-foot">
        <div class="mcp-line"><span class="pulse" /> MCP 工具在线</div>
        <small>Bed · Exam · Appointment · Staff</small>
        <small class="version">Demo v1.0 · API connected</small>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <button class="icon-btn mobile-menu" @click="mobileOpen = true"><Icon name="menu" :size="19" /></button>
        <div class="crumbs">
          <span>MedFlow AI</span><Icon name="chevron" :size="12" /><b>{{ currentTitle }}</b>
        </div>
        <div class="topbar-right">
          <div class="demo-date"><Icon name="calendar" :size="14" /> {{ chineseDate(TODAY) }}</div>
          <button class="icon-btn notification" @click="go('/alerts')">
            <Icon name="bell" :size="18" /><span v-if="alertCount" class="dot">{{ alertCount }}</span>
          </button>
          <div class="user-wrap">
            <button class="user-chip" @click="userOpen = !userOpen">
              <span class="avatar" :style="{ background: auth.user?.color || '#0f766e' }">{{ initials }}</span>
              <span class="user-copy"><b>{{ auth.user?.name }}</b><small>{{ auth.roleLabel }}</small></span>
              <Icon name="chevronDown" :size="13" />
            </button>
            <transition name="fade">
              <div v-if="userOpen" class="user-menu">
                <div class="user-menu-head"><b>{{ auth.user?.name }}</b><small>{{ auth.user?.dept }} · {{ auth.user?.username }}</small></div>
                <button @click="go('/knowledge')"><Icon name="book" :size="14" /> 知识库</button>
                <button class="danger" @click="logout"><Icon name="logout" :size="14" /> 退出登录</button>
              </div>
            </transition>
          </div>
        </div>
      </header>

      <div class="content">
        <router-view />
      </div>
    </main>
  </div>
</template>
