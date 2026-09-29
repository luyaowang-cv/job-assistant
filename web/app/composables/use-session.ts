type SessionUser = { id: string; email: string; displayName: string; emailVerified: boolean }

// 当前登录用户与登录/注册/退出动作。better-auth 的 user 字段里 name 即我们的 displayName。
export function useAuthSession() {
  const user = useState<SessionUser | null>('auth-user', () => null)
  const checked = useState<boolean>('auth-checked', () => false)

  async function fetchSession() {
    try {
      const res = await $fetch<{ user?: { id: string; email: string; name?: string; emailVerified?: boolean } } | null>('/api/auth/get-session')
      user.value = res?.user
        ? {
            id: res.user.id,
            email: res.user.email,
            displayName: res.user.name ?? res.user.email,
            // 未验证不构成使用门槛，这里只驱动界面上的软提醒。
            emailVerified: res.user.emailVerified ?? false,
          }
        : null
    }
    catch {
      user.value = null
    }
    checked.value = true
    return user.value
  }

  async function login(email: string, password: string) {
    await $fetch('/api/auth/sign-in/email', { method: 'POST', body: { email, password } })
    await fetchSession()
  }

  async function signup(email: string, password: string, name?: string) {
    // better-auth 要求 name 必须是 string；未填昵称时用邮箱前缀兜底。
    await $fetch('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name: name || email.split('@')[0] } })
    await fetchSession()
    // better-auth 若未自动建立会话，则补一次登录兜底。
    if (!user.value) await login(email, password)
  }

  // 重发验证邮件。刻意不依赖会话：验证链接点失败的用户可能已经登出，
  // 该端点本身也不要求登录（对未注册邮箱返回相同结果，不泄露账号是否存在）。
  async function resendVerificationEmail(email: string) {
    await $fetch('/api/auth/send-verification-email', {
      method: 'POST',
      body: { email, callbackURL: '/verify-email' },
    })
  }

  async function logout() {
    await $fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined)
    user.value = null
    checked.value = true
  }

  return { user, checked, fetchSession, login, signup, resendVerificationEmail, logout }
}
