<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'

const auth = useAuthStore()
const ui = useUiStore()
const beds = ref([])
const counts = ref({})
const dept = ref('')
const status = ref('')
const page = ref(1)
const pageSize = 18
const loading = ref(true)
const canManage = computed(() => auth.can('bed.manage'))

const depts = [['ortho', '骨科'], ['cardio', '心内科'], ['neuro', '神经内科'], ['resp', '呼吸内科'], ['gs', '普外科'], ['onco', '肿瘤科'], ['peds', '儿科']]
const statuses = ['空闲', '已入住', '待清洁', '维护中', '已预留', '暂停使用']
const filtered = computed(() => beds.value)
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))

async function load() {
  loading.value = true
  try {
    const data = await api.get('/beds', { dept: dept.value || undefined, status: status.value || undefined })
    beds.value = data.beds
    counts.value = data.counts
    page.value = 1
  } catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

async function act(bed, kind) {
  if (kind === 'discharge' && !confirm(`为 ${bed.patient_name} 办理出院？床位将进入待清洁。`)) return
  if (kind === 'maintenance' && !confirm(`将 ${bed.code} 床转入维护？`)) return
  try {
    const path = kind === 'cleaning'
      ? `/beds/${bed.id}/cleaning/complete`
      : `/beds/${bed.id}/${kind}`
    if (kind === 'maintenance') await api.post(`${path}?note=设备维护`)
    else await api.post(path)
    ui.notify(kind === 'discharge' ? '已办理出院，床位待清洁' : kind === 'cleaning' ? '清洁复核完成' : kind === 'maintenance' ? '床位已转维护' : '床位已恢复')
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

watch(dept, load); watch(status, load); onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">BED CAPACITY</div><h1>床位管理</h1><p>全院床位状态、入住患者、清洁与维护流转。</p></div>
      <div class="page-actions">
        <button class="btn btn-ghost" @click="$router.push('/admissions')"><Icon name="file" :size="15" /> 入院申请</button>
        <button class="btn btn-primary" @click="$router.push('/ai')"><Icon name="spark" :size="15" /> 生成床位方案</button>
      </div>
    </div>

    <div class="status-strip">
      <div v-for="s in statuses" :key="s" :class="['status-cell', { active: status === s }]" @click="status = status === s ? '' : s">
        <span :class="['status-dot-icon', s]" /><b>{{ counts[s] || 0 }}</b><small>{{ s }}</small>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div><h2>床位清单</h2><p>{{ filtered.length }} 张 · 第 {{ page }} / {{ totalPages }} 页</p></div>
        <div class="filters">
          <select v-model="dept"><option value="">全部科室</option><option v-for="d in depts" :key="d[0]" :value="d[0]">{{ d[1] }}</option></select>
          <select v-model="status"><option value="">全部状态</option><option v-for="s in statuses" :key="s">{{ s }}</option></select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>床位</th><th>病区 / 科室</th><th>类型</th><th>状态</th><th>患者</th><th>设施</th><th /></tr></thead>
          <tbody>
            <tr v-for="b in paged" :key="b.id">
              <td><b class="mono">{{ b.code }}</b><small class="block muted">v{{ b.version }} · {{ b.room_no }} 房</small></td>
              <td>{{ b.ward_name }}<small class="block muted">{{ b.department_id }}</small></td>
              <td>{{ b.bed_type }}<small class="block muted">{{ b.gender_policy }}</small></td>
              <td><StatusBadge :status="b.status" /></td>
              <td><b v-if="b.patient_name">{{ b.patient_name }}</b><span v-else class="muted">—</span><small v-if="b.expected_discharge" class="block muted">预计 {{ b.expected_discharge }}</small></td>
              <td class="features">{{ (b.features || []).slice(0, 2).join(' · ') || '—' }}</td>
              <td class="actions-cell">
                <template v-if="canManage">
                  <button v-if="b.status === '已入住'" class="text-btn" @click="act(b, 'discharge')">出院</button>
                  <button v-if="b.status === '待清洁'" class="text-btn" @click="act(b, 'cleaning')">清洁完成</button>
                  <button v-if="b.status === '空闲'" class="text-btn" @click="act(b, 'maintenance')">维护</button>
                  <button v-if="['维护中','暂停使用'].includes(b.status)" class="text-btn" @click="act(b, 'restore')">恢复</button>
                </template>
                <span v-else class="muted small">只读</span>
              </td>
            </tr>
            <tr v-if="!paged.length"><td colspan="7"><EmptyState text="没有符合条件的床位" icon="bed" /></td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><button class="btn btn-tiny" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ totalPages }}</span><button class="btn btn-tiny" :disabled="page >= totalPages" @click="page++">下一页</button></div>
    </section>
  </div>
</template>
