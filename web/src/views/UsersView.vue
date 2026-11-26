<script setup>
import { onMounted, reactive, ref } from 'vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'

const auth = useAuthStore()
const ui = useUiStore()
const users = ref([])
const permissions = ref([])
const loading = ref(true)
const modal = ref('')
const saving = ref(false)
const form = reactive({ id: '', name: '', role: 'ops', dept: '运营管理部', phone: '', username: '' })
const roles = [
  ['ops', '医院运营主管'], ['bed', '床位管理员'], ['appt', '预约管理员'],
  ['equip', '医技科室管理员'], ['staff', '医护排班管理员'], ['admin', '系统管理员'],
]

async function load() {
  loading.value = true
  try {
    const [u, p] = await Promise.all([api.get('/system/users'), api.get('/system/permissions')])
    users.value = u
    permissions.value = p.roles
  } catch (e) { ui.notify(e.message, 'error') } finally { loading.value = false }
}

function openEdit(u) {
  Object.assign(form, u ? { id: u.id, name: u.name, role: u.role, dept: u.dept, phone: u.phone, username: u.username } : { id: '', name: '', role: 'ops', dept: '运营管理部', phone: '', username: '' })
  modal.value = 'user'
}

async function save() {
  saving.value = true
  try {
    if (form.id) {
      await api.put(`/system/users/${form.id}`, { name: form.name, role: form.role, dept: form.dept, phone: form.phone })
      ui.notify('用户已更新')
    } else {
      await api.post('/system/users', { name: form.name, role: form.role, dept: form.dept, phone: form.phone, username: form.username || undefined })
      ui.notify('用户已创建')
    }
    modal.value = ''
    await load()
  } catch (e) { ui.notify(e.message, 'error') } finally { saving.value = false }
}

async function toggle(u) {
  if (!confirm(`${u.status === '启用' ? '停用' : '启用'}用户 ${u.name}？`)) return
  try { await api.post(`/system/users/${u.id}/toggle`); ui.notify('用户状态已更新'); await load() }
  catch (e) { ui.notify(e.message, 'error') }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-header">
      <div><div class="eyebrow">ADMINISTRATION</div><h1>系统管理</h1><p>账号、角色权限与审计日志。当前后端使用 JWT + RBAC。</p></div>
      <div class="page-actions"><button class="btn btn-primary" @click="openEdit()"><Icon name="plus" :size="15" /> 新增用户</button></div>
    </div>

    <div class="stat-grid compact-grid">
      <article class="stat-card"><div class="stat-label">系统用户</div><div class="stat-value">{{ users.length }}<em>人</em></div><div class="stat-foot">{{ users.filter(u => u.status === '启用').length }} 个启用</div></article>
      <article class="stat-card"><div class="stat-label">角色</div><div class="stat-value">{{ permissions.length }}<em>类</em></div><div class="stat-foot">接口级权限矩阵</div></article>
      <article class="stat-card"><div class="stat-label">当前账号</div><div class="stat-value small-value">{{ auth.user?.name }}</div><div class="stat-foot">{{ auth.roleLabel }}</div></article>
      <article class="stat-card"><div class="stat-label">认证</div><div class="stat-value small-value">JWT + RBAC</div><div class="stat-foot">HS256 · 8 小时</div></article>
    </div>

    <div class="split-layout user-layout">
      <section class="panel">
        <div class="panel-head"><div><h2>用户列表</h2><p>密码统一由演示环境初始化</p></div></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>用户</th><th>角色</th><th>部门</th><th>状态</th><th>最近登录</th><th /></tr></thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td><span class="person"><i :style="{ background: u.color }">{{ u.name.slice(0,1) }}</i><b>{{ u.name }}</b></span><small class="block muted">{{ u.username }} · {{ u.phone }}</small></td>
                <td>{{ u.role_name }}</td><td>{{ u.dept }}</td><td><StatusBadge :status="u.status" /></td><td class="mono">{{ u.last_login }}</td>
                <td class="actions-cell"><button class="text-btn" @click="openEdit(u)">编辑</button><button class="text-btn danger" :disabled="u.id === auth.user?.id" @click="toggle(u)">{{ u.status === '启用' ? '停用' : '启用' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <aside class="panel">
        <div class="panel-head"><div><h2>角色权限矩阵</h2><p>服务端校验，不信任前端</p></div></div>
        <div class="permission-list">
          <div v-for="r in permissions" :key="r.code" class="permission-role"><div><b>{{ r.name }}</b><small>{{ r.code }}</small></div><p>{{ r.permissions.join(' · ') }}</p></div>
        </div>
      </aside>
    </div>

    <Modal v-if="modal === 'user'" :title="form.id ? '编辑用户' : '新增用户'" subtitle="新增用户默认演示密码 medflow2026。" @close="modal = ''">
      <div class="form-grid">
        <label>姓名<input v-model="form.name" /></label>
        <label>用户名<input v-model="form.username" :disabled="!!form.id" placeholder="留空自动生成" /></label>
        <label>角色<select v-model="form.role"><option v-for="r in roles" :key="r[0]" :value="r[0]">{{ r[1] }}</option></select></label>
        <label>部门<input v-model="form.dept" /></label>
        <label class="span-2">手机号<input v-model="form.phone" /></label>
      </div>
      <template #footer><button class="btn btn-ghost" @click="modal = ''">取消</button><button class="btn btn-primary" :disabled="saving || !form.name" @click="save">{{ saving ? '保存中…' : '保存' }}</button></template>
    </Modal>
  </div>
</template>
