// 客户端全局守卫：未登录跳转登录页（登录页自身放行）。
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (to.path === '/login') return

  const { user, checked, fetchSession } = useAuthSession()
  if (!checked.value) await fetchSession()
  if (!user.value) return navigateTo('/login')
})
