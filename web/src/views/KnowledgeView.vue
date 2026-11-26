<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import EmptyState from '../components/EmptyState.vue'

const auth = useAuthStore()
const ui = useUiStore()
const docs = ref([])
const doc = ref(null)
const query = ref('')
const results = ref(null)
const loading = ref(true)
const modal = ref('')
const saving = ref(false)
const form = reactive({ id: '', title: '', category: '运营制度', owner: '运营管理部', content: '', summary: '' })
const canManage = computed(() => auth.can('knowledge.manage'))
const chunkCount = computed(() => docs.value.reduce((s, d) => s + d.chunks, 0))

async function load() {
  loading.value = true
  try { docs.value = await api.get('/kb/documents'); if (!doc.value && docs.value.length) await openDoc(docs.value[0].id) }
  catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

async function openDoc(id) {
  try { doc.value = await api.get(`/kb/documents/${id}`) }
  catch (e) { ui.notify(e.message, 'error') }
}

async function search() {
  if (!query.value.trim()) { results.value = null; return }
  try { results.value = (await api.post('/kb/search', { query: query.value, top_k: 6 })).results }
  catch (e) { ui.notify(e.message, 'error') }
}

function openEdit(item) {
  if (item) {
    form.id = item.id
    form.title = item.title
    form.category = item.category
    form.owner = item.owner
    form.summary = item.summary
    api.get(`/kb/documents/${item.id}`).then(d => { form.content = d.chunks.map(c => c.content).join('\n\n') })
  } else {
    Object.assign(form, { id: '', title: '', category: '运营制度', owner: '运营管理部', content: '', summary: '' })
  }
  modal.value = 'edit'
}

async function save() {
  saving.value = true
  try {
    if (form.id) {
      await api.put(`/kb/documents/${form.id}`, { ...form })
      ui.notify('文档已更新，索引已重建')
    } else {
      await api.post('/kb/documents', { ...form })
      ui.notify('文档已入库并切分')
    }
    modal.value = ''
    await load()
    if (form.id) await openDoc(form.id)
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

async function remove() {
  if (!doc.value || !confirm(`删除文档「${doc.value.title}」？`)) return
  try {
    await api.delete(`/kb/documents/${doc.value.id}`)
    ui.notify('文档已删除', 'info')
    doc.value = null
    await load()
  } catch (e) { ui.notify(e.message, 'error') }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">KNOWLEDGE BASE</div><h1>运营知识库</h1><p>制度文档切分、向量 + 关键词混合检索，为 AI 方案提供可追溯依据。</p></div>
      <div class="page-actions"><button v-if="canManage" class="btn btn-primary" @click="openEdit()"><Icon name="plus" :size="15" /> 新增文档</button></div>
    </div>

    <div class="stat-grid compact-grid">
      <article class="stat-card"><div class="stat-label">制度文档</div><div class="stat-value">{{ docs.length }}<em>份</em></div><div class="stat-foot">运营 / 预约 / 检查 / 排班 / 预警</div></article>
      <article class="stat-card"><div class="stat-label">知识片段</div><div class="stat-value">{{ chunkCount }}<em>段</em></div><div class="stat-foot">按章节切分</div></article>
      <article class="stat-card"><div class="stat-label">检索方式</div><div class="stat-value small-value">向量 + 关键词</div><div class="stat-foot">64 维本地哈希向量</div></article>
      <article class="stat-card"><div class="stat-label">引用覆盖</div><div class="stat-value">100<em>%</em></div><div class="stat-foot">AI 方案均附条款引用</div></article>
    </div>

    <section class="panel">
      <form class="kb-search" @submit.prevent="search"><Icon name="search" :size="17" /><input v-model="query" placeholder="检索制度，例如：单人间 分配 审批 / 夜班 间隔" /><button class="btn btn-primary" type="submit">检索</button></form>
      <div v-if="results" class="search-results">
        <div class="search-head"><b>检索结果</b><span>{{ results.length }} 个片段 · “{{ query }}”</span><button class="text-btn" @click="results = null">清除</button></div>
        <article v-for="r in results" :key="r.chunk_id" class="search-item"><div class="search-meta"><span class="score">{{ Math.round(r.relevance * 100) }}% 相关</span><span class="badge muted">向量 {{ Math.round(r.vector_score * 100) }}%</span><span>{{ r.title }} · {{ r.heading }}</span></div><p>{{ r.content }}</p><small class="mono">{{ r.chunk_id }}</small></article>
      </div>
    </section>

    <div class="kb-layout">
      <aside class="panel doc-list-panel">
        <div class="panel-head"><div><h2>文档库</h2><p>点击查看章节</p></div></div>
        <button v-for="d in docs" :key="d.id" :class="['doc-item', { active: doc?.id === d.id }]" @click="openDoc(d.id)"><span class="doc-icon"><Icon name="file" :size="17" /></span><span><b>{{ d.title }}</b><small>{{ d.category }} · {{ d.version }} · {{ d.chunks }} 段</small></span><Icon name="chevron" :size="13" /></button>
      </aside>
      <section v-if="doc" class="panel doc-detail">
        <div class="doc-head"><div><div class="eyebrow">{{ doc.category }}</div><h2>{{ doc.title }}</h2><p>{{ doc.summary }}</p><small>{{ doc.owner }} · {{ doc.version }} · 更新于 {{ doc.updated_at }}</small></div><div v-if="canManage" class="doc-actions"><button class="btn btn-tiny" @click="openEdit(doc)">编辑</button><button class="btn btn-tiny danger" @click="remove">删除</button></div></div>
        <article v-for="(c, i) in doc.chunks" :key="c.id" class="chunk"><span class="chunk-index">{{ String(i + 1).padStart(2, '0') }}</span><div><h3>{{ c.heading }}</h3><p>{{ c.content }}</p><small class="mono">{{ c.id }}</small></div></article>
      </section>
      <section v-else class="panel"><EmptyState text="选择一份文档查看章节" icon="book" /></section>
    </div>

    <Modal v-if="modal === 'edit'" :title="form.id ? '编辑文档' : '新增文档'" subtitle="保存后会重新切分并重建检索索引。" width="760px" @close="modal = ''">
      <div class="form-grid">
        <label class="span-2">标题<input v-model="form.title" required /></label>
        <label>分类<input v-model="form.category" /></label>
        <label>维护部门<input v-model="form.owner" /></label>
        <label class="span-2">正文<textarea v-model="form.content" rows="12" placeholder="使用空行分隔章节；正文至少 20 字" /></label>
      </div>
      <template #footer><button class="btn btn-ghost" @click="modal = ''">取消</button><button class="btn btn-primary" :disabled="saving || !form.title || form.content.length < 20" @click="save">{{ saving ? '保存中…' : '保存并重建索引' }}</button></template>
    </Modal>
  </div>
</template>
