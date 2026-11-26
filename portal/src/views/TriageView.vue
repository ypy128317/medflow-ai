<script setup>
import { computed, reactive, ref } from 'vue'
import { api } from '../api'
import Icon from '../components/Icon.vue'
import StatusBadge from '../components/StatusBadge.vue'

const props = defineProps({ notify: { type: Function, required: true } })
const emit = defineEmits(['booked', 'open-appointments'])

const form = reactive({ age: 32, sex: '女', symptoms: '', duration: '' })
const result = ref(null)
const loading = ref(false)
const error = ref('')
const booking = ref(null)
const booked = ref(null)
const saving = ref(false)
const bookForm = reactive({ patient_name: '演示患者', phone: '', gender: '女', age: 32 })
const samples = [
  { label: '咳嗽低烧', text: '咳嗽三天，低烧，没有呼吸困难' },
  { label: '头痛头晕', text: '头痛、头晕两天，伴恶心' },
  { label: '胸痛大汗', text: '胸痛伴大汗、呼吸困难' },
  { label: '腹痛腹泻', text: '腹痛腹泻一天，没有发热' },
]
const emergency = computed(() => result.value?.urgency === 'emergency')
const urgent = computed(() => result.value?.urgency === 'urgent')
const doctors = computed(() => result.value?.doctors || [])

async function assess() {
  error.value = ''
  booked.value = null
  if (form.symptoms.trim().length < 4) { error.value = '请至少描述一句症状'; return }
  loading.value = true
  result.value = null
  try {
    result.value = await api.post('/portal/triage', {
      age: Number(form.age), sex: form.sex, symptoms: form.symptoms, duration: form.duration,
    })
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

function useSample(text) {
  form.symptoms = text
  result.value = null
  booked.value = null
}

function openBook(doctor, slot) {
  booking.value = { doctor, slot }
  Object.assign(bookForm, { patient_name: '演示患者', phone: '', gender: form.sex, age: Number(form.age) })
}

async function book() {
  saving.value = true
  try {
    const res = await api.post('/portal/triage/book', {
      patient_name: bookForm.patient_name, phone: bookForm.phone, gender: bookForm.gender,
      age: Number(bookForm.age), doctor_id: booking.value.doctor.doctor_id,
      date: booking.value.doctor.date, slot: booking.value.slot, symptoms: form.symptoms,
    })
    booked.value = res.appointment
    booking.value = null
    props.notify('预约成功，请按时到院签到')
  } catch (e) { props.notify(e.message, 'error') } finally { saving.value = false }
}
</script>

<template>
  <div class="portal-triage">
    <section class="portal-hero">
      <div class="eyebrow light">AI TRIAGE</div>
      <h1>哪里不舒服？</h1>
      <p>先做急症筛查，再推荐科室和号源。AI 不做疾病诊断。</p>
      <div class="hero-chip"><Icon name="shield" :size="15" /> 急症请直接拨打 120</div>
    </section>

    <section class="portal-card">
      <div class="form-row two">
        <label>年龄<input v-model.number="form.age" type="number" min="0" max="120" /></label>
        <label>性别<select v-model="form.sex"><option>女</option><option>男</option><option>其他</option></select></label>
      </div>
      <label>症状描述<textarea v-model="form.symptoms" rows="4" placeholder="例如：咳嗽三天，低烧，没有呼吸困难" /></label>
      <label>持续时间<input v-model="form.duration" placeholder="例如：3 天 / 2 小时" /></label>
      <div class="portal-samples"><button v-for="s in samples" :key="s.label" @click="useSample(s.text)">{{ s.label }}</button></div>
      <div v-if="error" class="portal-error"><Icon name="alert" :size="14" /> {{ error }}</div>
      <button class="portal-btn primary block" :disabled="loading" @click="assess"><span v-if="loading" class="portal-spinner" /><Icon v-else name="spark" :size="16" /> {{ loading ? '正在分诊…' : '开始分诊' }}</button>
      <p class="portal-safety"><Icon name="shield" :size="13" /> 分诊结果不构成诊断，不替代医生面诊，不直接分配床位。</p>
    </section>

    <template v-if="result">
      <section :class="['portal-card', 'portal-urgency', result.urgency]">
        <div class="urgency-head"><span class="urgency-icon"><Icon :name="emergency ? 'alert' : 'stethoscope'" :size="20" /></span><div><span class="eyebrow">{{ emergency ? 'EMERGENCY' : 'TRIAGE RESULT' }}</span><h2>{{ result.urgency_label }}</h2></div><StatusBadge :status="emergency ? '紧急' : urgent ? '优先' : '常规'" /></div>
        <p>{{ result.advice }}</p>
      </section>

      <section v-if="result.red_flags?.length" class="portal-card red">
        <div class="card-line"><Icon name="alert" :size="18" /><b>发现急症红旗</b></div>
        <p>{{ result.red_flags.map(f => f.label).join('、') }}。请立即前往急诊科或拨打 120，不要等待普通门诊。</p>
      </section>

      <section class="portal-card">
        <div class="portal-card-head"><h3>推荐科室</h3><span class="badge muted">规则 + Qwen</span></div>
        <div v-for="d in result.departments" :key="d.id" class="portal-dept"><span><Icon name="bed" :size="16" /></span><div><b>{{ d.name }}</b><small>{{ d.reason }}</small></div></div>
        <div class="portal-narrative"><Icon name="spark" :size="15" /><p>{{ result.narrative }}</p></div>
      </section>

      <section v-if="doctors.length" class="portal-card">
        <div class="portal-card-head"><h3>可选医生与号源</h3><span>点击号源预约</span></div>
        <div v-for="d in doctors" :key="d.doctor_id" class="portal-doctor">
          <div class="doctor-line"><span class="portal-avatar">{{ d.doctor_name.slice(0,1) }}</span><div><b>{{ d.doctor_name }}</b><small>{{ d.title }} · {{ d.department_name }}</small></div></div>
          <div class="portal-slots"><button v-for="s in d.slots" :key="s" @click="openBook(d, s)">{{ s }}</button><small>{{ d.date }} · {{ d.room }}</small></div>
        </div>
      </section>

      <section class="portal-card disclaimer"><Icon name="shield" :size="14" /><p>{{ result.disclaimer }} {{ result.bed_note }}</p></section>
    </template>

    <section v-if="booked" class="portal-card booking-success">
      <div class="success-icon"><Icon name="check" :size="22" /></div>
      <h2>预约成功</h2>
      <p class="booking-no">{{ booked.id }}</p>
      <div class="booking-info"><div><span>医生</span><b>{{ booked.doctor_name }}</b></div><div><span>科室</span><b>{{ booked.department_name }}</b></div><div><span>时间</span><b>{{ booked.date }} {{ booked.slot }}</b></div><div><span>地点</span><b>{{ booked.room }}</b></div></div>
      <div class="patient-journey"><span class="active">预约成功</span><i /><span>到院签到</span><i /><span>医生接诊</span><i /><span>完成</span></div>
      <button class="portal-btn primary block" @click="emit('open-appointments')">查看我的预约</button>
      <button class="portal-btn ghost block" @click="booked = null">继续分诊</button>
    </section>

    <div v-if="booking" class="portal-modal-mask" @click.self="booking = null">
      <div class="portal-modal">
        <div class="portal-modal-head"><h3>确认预约</h3><button @click="booking = null"><Icon name="close" :size="17" /></button></div>
        <p class="modal-sub">{{ booking.doctor.doctor_name }} · {{ booking.doctor.date }} {{ booking.slot }}</p>
        <label>患者姓名<input v-model="bookForm.patient_name" /></label>
        <label>手机号<input v-model="bookForm.phone" placeholder="选填" /></label>
        <div class="form-row two"><label>性别<select v-model="bookForm.gender"><option>女</option><option>男</option><option>其他</option></select></label><label>年龄<input v-model.number="bookForm.age" type="number" /></label></div>
        <div class="portal-safety"><Icon name="shield" :size="13" /> 提交前会再次校验号源占用和重复预约。</div>
        <button class="portal-btn primary block" :disabled="saving || !bookForm.patient_name" @click="book">{{ saving ? '预约中…' : '确认预约' }}</button>
      </div>
    </div>
  </div>
</template>
