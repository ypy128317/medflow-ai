<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const plans = ref([])
const filter = ref('待审批')
const selected = ref(null)
const detail = ref(null)
const loading = ref(true)
const comment = ref('')
const saving = ref(false)
const result = ref('')
const canDecide = computed(() => auth.can('approval.decide'))

const filtered = computed(() => plans.value.filter(p => filter.value === '全部' || p.status === filter.value))
const valid = computed(() => detail.value?.live_validation?.valid !== false)
const blockers = computed(() => detail.value?.live_validation?.blockers || [])
const archived = computed(() => Boolean(detail.value?.live_validation?.archived))
const validationTitle = computed(() => {
  if (archived.value) return valid.value ? '执行前复核通过 · 已归档' : '执行失败 · 已回滚'
  return valid.value ? '执行前复核通过' : '执行前复核发现冲突'
})
const validationDetail = computed(() => {
  if (archived.value) return detail.value?.live_validation?.message || '方案已处理，复核记录已归档。'
  return valid.value ? '床位 / 检查 / 班次快照与版本一致' : blockers.value.join('；')
})

async function load() {
  loading.value = true
  try {
    plans.value = await api.get('/approvals')
    const target = route.query.plan || selected.value?.id || plans.value.find(p => p.status === '待审批')?.id || plans.value[0]?.id
    if (target) await select(target)
  } catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

async function select(id) {
  selected.value = plans.value.find(p => p.id === id) || selected.value
  detail.value = await api.get(`/approvals/${id}`)
  comment.value = ''
  result.value = ''
}

async function decide(decision) {
  if (decision === 'reject' && comment.value.trim().length < 2) {
    ui.notify('驳回必须填写审批意见', 'error')
    return
  }
  saving.value = true
  try {
    const res = await api.post(`/approvals/${detail.value.id}/decision`, { decision, comment: comment.value })
    result.value = res.message
    ui.notify(res.message, 'success')
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

function kindLabel(kind) { return { bed: '床位调度', equipment: '检查调整', staff: '排班调整' }[kind] || kind }

watch(filter, () => { if (filtered.value.length) select(filtered.value[0].id) })
watch(() => route.query.plan, (id) => { if (id) select(id) })
onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">HUMAN IN THE LOOP</div><h1>审批中心</h1><p>AI 方案与执行之间的人工闸门。批准前不会修改任何业务数据。</p></div>
      <div class="page-actions"><div class="segmented"><button v-for="f in ['待审批','全部','执行成功','已驳回']" :key="f" :class="{ active: filter === f }" @click="filter = f">{{ f }}</button></div></div>
    </div>

    <div class="split-layout approval-layout">
      <aside class="panel approval-list">
        <div class="panel-head"><div><h2>审批单</h2><p>{{ filtered.length }} 条</p></div></div>
        <button v-for="p in filtered" :key="p.id" :class="['approval-item', { active: detail?.id === p.id }]" @click="select(p.id)">
          <span :class="['approval-icon', p.kind]"><Icon :name="p.kind === 'bed' ? 'bed' : p.kind === 'staff' ? 'users' : 'monitor'" :size="17" /></span>
          <span class="approval-copy"><b>{{ p.title }}</b><small>{{ p.id }} · {{ p.scope }}</small><em>{{ p.created_at?.slice(11) }}</em></span>
          <StatusBadge :status="p.status" />
        </button>
        <EmptyState v-if="!filtered.length" text="没有符合条件的审批单" icon="approval" />
      </aside>

      <section v-if="detail" class="panel approval-detail">
        <div class="detail-head">
          <div><div class="eyebrow">{{ kindLabel(detail.kind) }} · {{ detail.id }}</div><h2>{{ detail.title }}</h2><p>{{ detail.summary }}</p></div>
          <StatusBadge :status="detail.status" />
        </div>

        <div class="validation-strip" :class="{ bad: !valid, archived }">
          <Icon :name="valid ? 'shield' : 'alert'" :size="17" />
          <div><b>{{ validationTitle }}</b><small>{{ validationDetail }}</small></div>
          <span>{{ detail.live_validation?.checked_at }}</span>
        </div>

        <div v-if="detail.kind === 'bed'" class="table-wrap">
          <table class="data-table"><thead><tr><th>患者</th><th>需求</th><th>建议床位</th><th>匹配分</th><th>依据</th></tr></thead><tbody>
            <tr v-for="m in detail.matched" :key="m.admission_id"><td><b>{{ m.patient_name }}</b><small class="block muted">{{ m.gender }} · {{ m.age }} 岁 · {{ m.dept_name }}</small></td><td>{{ m.bed_type }}</td><td><b class="mono">{{ m.bed_code }}</b><small class="block muted">{{ m.ward_name }}</small></td><td><span class="score">{{ m.score }}</span></td><td class="muted small">{{ (m.reasons || []).join(' / ') }}</td></tr>
          </tbody></table>
        </div>

        <div v-if="detail.kind === 'equipment'" class="table-wrap">
          <table class="data-table"><thead><tr><th>患者</th><th>设备</th><th>原时段</th><th>目标时段</th><th>原因</th></tr></thead><tbody>
            <tr v-for="c in detail.changes" :key="c.examId || c.exam_id"><td><b>{{ c.patientName }}</b><small class="block muted">{{ c.examItem }}</small></td><td>{{ c.deviceId }}</td><td class="mono muted"><s>{{ c.from }}</s></td><td class="mono"><b>{{ c.to }}</b></td><td class="muted small">{{ c.reason }}</td></tr>
          </tbody></table>
        </div>

        <div v-if="detail.kind === 'staff'" class="table-wrap">
          <table class="data-table"><thead><tr><th>人员</th><th>科室</th><th>日期</th><th>原班次</th><th>建议班次</th><th>依据</th></tr></thead><tbody>
            <tr v-for="c in detail.changes" :key="c.staff_id + c.date"><td><b>{{ c.staff_name }}</b></td><td>{{ c.dept_name }}</td><td class="mono">{{ c.date }}</td><td><span class="shift off">{{ c.from_shift }}</span></td><td><span class="shift am">{{ c.to_shift }}</span></td><td class="muted small">{{ c.reason }}</td></tr>
          </tbody></table>
        </div>

        <div v-if="detail.unmatched?.length" class="unmatched-box">
          <b>未匹配 {{ detail.unmatched.length }} 位</b>
          <div v-for="u in detail.unmatched" :key="u.admission_id"><span>{{ u.patient_name }} · {{ u.dept_name }} · {{ u.bed_type }}</span><small>{{ u.reason }}</small></div>
        </div>

        <div class="evidence-block">
          <div><b>方案依据</b><span v-for="(r, i) in detail.rationale || []" :key="i">{{ r }}</span><span v-if="!detail.rationale?.length">按规则校验结果生成；批准前会再次复核资源状态与版本。</span></div>
          <div><b>RAG 引用</b><span v-for="c in detail.citations || []" :key="c.chunk_id">{{ c.title }} · {{ c.heading }}</span><span v-if="!detail.citations?.length">该方案暂无制度引用。</span></div>
        </div>

        <div v-if="detail.status === '待审批'">
          <div v-if="!canDecide" class="readonly-note"><Icon name="shield" :size="15" /> 当前角色无审批权限，只能查看方案。</div>
          <template v-else>
            <textarea v-model="comment" class="approval-comment" rows="3" placeholder="填写审批意见（驳回必填）" />
            <div class="approval-actions"><button class="btn btn-ghost danger" :disabled="saving" @click="decide('reject')">驳回，不执行</button><button class="btn btn-primary" :disabled="saving || !valid" @click="decide('approve')"><Icon name="approval" :size="15" /> {{ saving ? '执行中…' : '批准并执行' }}</button></div>
          </template>
        </div>
        <div v-else class="result-line"><Icon name="check" :size="16" /> {{ result || detail.execution?.detail || (detail.status === '已驳回' ? '已驳回，业务数据未变更' : '该审批单已处理') }}</div>
      </section>
      <section v-else class="panel"><EmptyState text="选择一个审批单查看详情" icon="approval" /></section>
    </div>
  </div>
</template>
