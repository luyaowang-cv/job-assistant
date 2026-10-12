type SessionUser = {
  id: string
  email: string
  displayName: string
  emailVerified: boolean
  createdAt: string
}

// 必须与 server/utils/auth.ts 的 EMAIL_VERIFICATION_REQUIRED_SINCE 保持一致。
// 分界点之后注册的账号必须先验证邮箱才能登录；此前的存量账号保持宽松策略。
const VERIFICATION_REQUIRED_SINCE = new Date('2026-09-29T00:00:00.000Z')

// 登录被拒：这个账号必须先验证邮箱。用独立的错误类型，让调用方能够精确区分，
// 而不是去匹配错误文案。
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('该账号需要先验证邮箱才能登录。')
    this.name = 'EmailNotVerifiedError'
  }
}

// 这个账号是否"必须先验证邮箱才能进来"。
// 注意要区分两类未验证账号：存量账号（分界点之前注册）照常可用，只是界面上提醒；
// 分界点之后注册的账号则必须先点邮件里的链接。
function requiresEmailVerification(user: SessionUser) {
  return !user.emailVerified && new Date(user.createdAt) >= VERIFICATION_REQUIRED_SINCE
}

// 当前登录用户与登录/注册/退出动作。better-auth 的 user 字段里 name 即我们的 displayName。
export function useAuthSession() {
  const user = useState<SessionUser | null>('auth-user', () => null)
  const checked = useState<boolean>('auth-checked', () => false)

  async function fetchSession() {
    try {
      const res = await $fetch<{ user?: { id: string, email: string, name?: string, emailVerified?: boolean, createdAt?: string } } | null>('/api/auth/get-session')
      user.value = res?.user
        ? {
            id: res.user.id,
            email: res.user.email,
            displayName: res.user.name ?? res.user.email,
            // 未验证不构成使用门槛，这里只驱动界面上的软提醒。
            emailVerified: res.user.emailVerified ?? false,
            createdAt: res.user.createdAt ?? new Date(0).toISOString(),
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

    // 服务端的全局门禁是关着的（否则存量账号也会被锁死），所以这里补一道：
    // 新注册且未验证的账号即使登录成功也立刻退掉会话，抛出让登录页提示去验证邮箱。
    if (user.value && requiresEmailVerification(user.value)) {
      await logout()
      throw new EmailNotVerifiedError()
    }
  }

  async function signup(email: string, password: string, name?: string) {
    // better-auth 要求 name 必须是 string；未填昵称时用邮箱前缀兜底。
    await $fetch('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name: name || email.split('@')[0] } })
    // 注册会建立会话，但新账号必须先验证邮箱才能使用，所以立刻退掉，
    // 让用户停在登录页而不是被直接送进工作台。
    // 刻意不用服务端的 autoSignIn: false 来达到这个效果——那会连带触发 better-auth
    // 的防账号枚举行为，把"邮箱已注册"变成静默的假成功（详见 server/utils/auth.ts 的注释）。
    await logout()
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
