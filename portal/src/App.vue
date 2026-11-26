<script setup>
import { onMounted, ref } from 'vue'
import { api, getToken, setToken } from './api'
import Icon from './components/Icon.vue'
import LoginView from './views/LoginView.vue'
import TriageView from './views/TriageView.vue'
import AppointmentsView from './views/AppointmentsView.vue'

const token = ref(getToken())
const user = ref(null)
const booting = ref(true)
const page = ref('triage')
const toasts = ref([])
let toastId = 0

function notify(message, type = 'success') {
  const id = ++toastId
  toasts.value.push({ id, message, type })
  window.setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 3200)
}

async function restore() {
  if (!token.value) { booting.value = false; return }
  try {
    const data = await api.get('/auth/me')
    user.value = data.user
  } catch {
    token.value = ''
    setToken('')
  } finally {
    booting.value = false
  }
}

async function onLogin(credentials) {
  const data = await api.post('/auth/login', credentials)
  if (!data.user?.permission_codes?.includes('portal.use')) {
    throw new Error('该账号不是患者账号，请使用患者端演示账号')
  }
  setToken(data.access_token)
  token.value = data.access_token
  user.value = data.user
  page.value = 'triage'
  notify(`欢迎，${data.user.name}`, 'success')
}

function logout() {
  token.value = ''
  user.value = null
  setToken('')
  page.value = 'triage'
}

onMounted(restore)
</script>

<template>
  <div class="portal-shell">
    <header v-if="token" class="portal-header">
      <div class="portal-brand"><span class="portal-logo"><Icon name="stethoscope" :size="19" /></span><div><b>MedFlow 就医助手</b><small>患者端 · 预约与分诊</small></div></div>
      <button class="portal-user" @click="logout"><span>{{ user?.name?.slice(0, 1) || '患' }}</span><Icon name="logout" :size="15" /></button>
    </header>

    <main v-if="booting" class="portal-loading"><span class="spinner large" /><p>正在加载…</p></main>
    <main v-else-if="!token" class="portal-auth"><LoginView :login="onLogin" /></main>
    <main v-else class="portal-main">
      <TriageView v-if="page === 'triage'" :notify="notify" @booked="page = 'appointments'" @open-appointments="page = 'appointments'" />
      <AppointmentsView v-else :notify="notify" @back="page = 'triage'" />
    </main>

    <nav v-if="token" class="portal-tabs">
      <button :class="{ active: page === 'triage' }" @click="page = 'triage'"><Icon name="stethoscope" :size="18" /><span>AI 分诊</span></button>
      <button :class="{ active: page === 'appointments' }" @click="page = 'appointments'"><Icon name="calendar" :size="18" /><span>我的预约</span></button>
    </nav>

    <div class="portal-toasts">
      <div v-for="t in toasts" :key="t.id" :class="['portal-toast', t.type]"><Icon :name="t.type === 'error' ? 'alert' : 'check'" :size="15" />{{ t.message }}</div>
    </div>
  </div>
</template>
