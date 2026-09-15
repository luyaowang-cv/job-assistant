type SessionUser = { id: string; email: string; displayName: string }

// 当前登录用户与登录/退出动作。better-auth 的 user 字段里 name 即我们的 displayName。
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

  async function logout() {
    await $fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined)
    user.value = null
    checked.value = true
  }

  return { user, checked, fetchSession, login, logout }
}
