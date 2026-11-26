import { defineStore } from 'pinia'
import { api, clearToken, getToken, setToken } from '../api/client'

const ROLE_LABELS = {
  admin: '系统管理员',
  ops: '医院运营主管',
  bed: '床位管理员',
  appt: '预约管理员',
  equip: '医技科室管理员',
  staff: '医护排班管理员',
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: null,
    ready: false,
    loading: false,
  }),
  getters: {
    isLoggedIn: (s) => Boolean(s.token && s.user),
    roleLabel: (s) => s.user?.role_name || ROLE_LABELS[s.user?.role] || '',
    permissions: (s) => s.user?.permission_codes || [],
    isAdmin: (s) => s.user?.role === 'admin',
  },
  actions: {
    async login(username, password) {
      this.loading = true
      try {
        const data = await api.post('/auth/login', { username, password })
        setToken(data.access_token)
        this.token = data.access_token
        this.user = data.user
        this.ready = true
        return data.user
      } finally {
        this.loading = false
      }
    },
    async restore() {
      if (this.ready) return
      if (!this.token) { this.ready = true; return }
      try {
        const data = await api.get('/auth/me')
        this.user = data.user
      } catch {
        this.logout(false)
      } finally {
        this.ready = true
      }
    },
    can(permission) {
      if (!permission) return true
      return this.permissions.includes(permission)
    },
    logout(redirect = true) {
      this.token = ''
      this.user = null
      clearToken()
      const base = import.meta.env.BASE_URL || '/'
      if (redirect && !window.location.pathname.endsWith('/login')) {
        window.location.assign(`${base.replace(/\/$/, '')}/login`)
      }
    },
  },
})
