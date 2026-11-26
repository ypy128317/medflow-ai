<script setup>
import { ref } from 'vue'
import Icon from '../components/Icon.vue'

const props = defineProps({ login: { type: Function, required: true } })
const username = ref('patient')
const password = ref('medflow2026')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await props.login({ username: username.value.trim(), password: password.value })
  } catch (e) {
    error.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="portal-login">
    <div class="portal-login-hero">
      <span class="portal-logo large"><Icon name="stethoscope" :size="28" /></span>
      <div class="eyebrow">PATIENT PORTAL</div>
      <h1>先分诊，<br />再挂号。</h1>
      <p>描述症状，获得就医科室与号源建议。不诊断疾病，不替代医生面诊。</p>
      <div class="login-flow"><span>症状</span><i /><span>分诊</span><i /><span>医生</span><i /><span>预约</span></div>
    </div>
    <form class="portal-login-form" @submit.prevent="submit">
      <div class="eyebrow">SIGN IN</div>
      <h2>患者登录</h2>
      <p>演示账号已填入，直接登录即可体验。</p>
      <label>手机号 / 账号<input v-model="username" autocomplete="username" /></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" /></label>
      <div v-if="error" class="portal-error"><Icon name="alert" :size="14" /> {{ error }}</div>
      <button class="portal-btn primary block" :disabled="loading"><span v-if="loading" class="portal-spinner" /><Icon v-else name="arrow" :size="16" /> {{ loading ? '登录中…' : '进入就医助手' }}</button>
      <div class="portal-demo">患者演示账号：<code>patient / medflow2026</code></div>
    </form>
    <div class="portal-disclaimer"><Icon name="shield" :size="14" /> 本工具仅用于就医分诊和预约，不构成诊断；急症请立即拨打 120。</div>
  </div>
</template>
