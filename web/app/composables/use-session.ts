type SessionUser = { id: string; email: string; displayName: string }

// 当前登录用户与登录/注册/退出动作。better-auth 的 user 字段里 name 即我们的 displayName。
export function useAuthSession() {
  const user = useState<SessionUser | null>('auth-user', () => null)
  const checked = useState<boolean>('auth-checked', () => false)

  async function fetchSession() {
    try {
      const res = await $fetch<{ user?: { id: string; email: string; name?: string } } | null>('/api/auth/get-session')
      user.value = res?.user
        ? { id: res.user.id, email: res.user.email, displayName: res.user.name ?? res.user.email }
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

  async function logout() {
    await $fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined)
    user.value = null
    checked.value = true
  }

  return { user, checked, fetchSession, login, signup, logout }
}
