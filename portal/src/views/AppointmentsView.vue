<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import Icon from '../components/Icon.vue'
import StatusBadge from '../components/StatusBadge.vue'

const props = defineProps({ notify: { type: Function, required: true } })
const emit = defineEmits(['back'])
const rows = ref([])
const loading = ref(true)
const acting = ref('')
const active = computed(() => rows.value.filter(a => !['已完成', '已取消'].includes(a.status)))
const history = computed(() => rows.value.filter(a => ['已完成', '已取消'].includes(a.status)))

async function load() {
  loading.value = true
  try { rows.value = await api.get('/portal/appointments') }
  catch (e) { props.notify(e.message, 'error') } finally { loading.value = false }
}

async function checkin(row) {
  acting.value = row.id
  try { await api.post(`/portal/appointments/${row.id}/checkin`); props.notify('签到成功，请候诊'); await load() }
  catch (e) { props.notify(e.message, 'error') } finally { acting.value = '' }
}

async function cancel(row) {
  if (!confirm(`确认取消 ${row.date} ${row.slot} 的预约？`)) return
  acting.value = row.id
  try { await api.post(`/portal/appointments/${row.id}/cancel?reason=患者取消`); props.notify('预约已取消', 'info'); await load() }
  catch (e) { props.notify(e.message, 'error') } finally { acting.value = '' }
}

onMounted(load)
</script>

<template>
  <div class="portal-appointments">
    <section class="portal-hero small">
      <div class="eyebrow light">MY APPOINTMENTS</div>
      <h1>我的预约</h1>
      <p>到院后先签到，再等待医生接诊。</p>
    </section>

    <div v-if="loading" class="portal-loading"><span class="spinner large" /></div>
    <template v-else>
      <section class="portal-card">
        <div class="portal-card-head"><h3>待就诊</h3><span>{{ active.length }} 条</span></div>
        <div v-for="a in active" :key="a.id" class="appointment-card">
          <div class="appointment-top"><div><b>{{ a.department_name }}</b><small>{{ a.doctor_name }} · {{ a.room }}</small></div><StatusBadge :status="a.status" /></div>
          <div class="appointment-time"><Icon name="calendar" :size="15" /><b>{{ a.date }} {{ a.slot }}</b><span>{{ a.id }}</span></div>
          <div class="appointment-actions">
            <button v-if="['待确认','已预约'].includes(a.status)" class="portal-btn primary tiny" :disabled="acting === a.id" @click="checkin(a)">到院签到</button>
            <button class="portal-btn ghost tiny" :disabled="acting === a.id" @click="cancel(a)">取消预约</button>
          </div>
        </div>
        <div v-if="!active.length" class="portal-empty"><Icon name="calendar" :size="30" /><p>还没有待就诊预约</p><button class="portal-btn primary" @click="emit('back')">去分诊预约</button></div>
      </section>

      <section v-if="history.length" class="portal-card">
        <div class="portal-card-head"><h3>历史记录</h3><span>{{ history.length }} 条</span></div>
        <div v-for="a in history" :key="a.id" class="history-row"><div><b>{{ a.department_name }} · {{ a.doctor_name }}</b><small>{{ a.date }} {{ a.slot }}</small></div><StatusBadge :status="a.status" /></div>
      </section>
    </template>
  </div>
</template>
