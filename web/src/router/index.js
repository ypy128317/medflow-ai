import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('../layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: '运营驾驶舱' } },
      { path: 'appointments', name: 'appointments', component: () => import('../views/AppointmentsView.vue'), meta: { title: '预约管理' } },
      { path: 'beds', name: 'beds', component: () => import('../views/BedsView.vue'), meta: { title: '床位管理' } },
      { path: 'admissions', name: 'admissions', component: () => import('../views/AdmissionsView.vue'), meta: { title: '入院申请' } },
      { path: 'exams', name: 'exams', component: () => import('../views/ExamsView.vue'), meta: { title: '检查资源' } },
      { path: 'staff', name: 'staff', component: () => import('../views/StaffView.vue'), meta: { title: '人员排班' } },
      { path: 'copilot', name: 'copilot', component: () => import('../views/CopilotView.vue'), meta: { title: 'AI Copilot' } },
      { path: 'ai', name: 'ai', component: () => import('../views/AIDispatchView.vue'), meta: { title: 'AI 调度中心' } },
      { path: 'approvals', name: 'approvals', component: () => import('../views/ApprovalsView.vue'), meta: { title: '审批中心' } },
      { path: 'alerts', name: 'alerts', component: () => import('../views/AlertsView.vue'), meta: { title: '运营预警' } },
      { path: 'analytics', name: 'analytics', component: () => import('../views/AnalyticsView.vue'), meta: { title: '数据分析' } },
      { path: 'knowledge', name: 'knowledge', component: () => import('../views/KnowledgeView.vue'), meta: { title: '运营知识库' } },
      {
        path: 'users',
        name: 'users',
        component: () => import('../views/UsersView.vue'),
        meta: { title: '系统管理', permission: 'system.manage' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.restore()
  document.title = to.meta.title ? `${to.meta.title} · MedFlow AI` : 'MedFlow AI'
  if (to.meta.public) {
    if (to.name === 'login' && auth.isLoggedIn) return '/dashboard'
    return true
  }
  if (!auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (auth.user?.role === 'patient') {
    auth.logout(false)
    return { name: 'login' }
  }
  if (to.meta.permission && !auth.can(to.meta.permission)) return '/dashboard'
  return true
})

export default router
