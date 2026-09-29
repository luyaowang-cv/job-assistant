// 与服务端 middleware/auth.ts 的 PUBLIC_PAGES 保持一致：邮件里的验证与重置链接
// 会直接落到这些页面上，漏放行会让用户点开链接后被弹回登录页。
const PUBLIC_PAGES = ['/login', '/forgot-password', '/reset-password', '/verify-email']

// 客户端全局守卫：未登录跳转登录页（公开页自身放行）。
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (PUBLIC_PAGES.includes(to.path)) return

  const { user, checked, fetchSession } = useAuthSession()
  if (!checked.value) await fetchSession()
  if (!user.value) return navigateTo('/login')
})
