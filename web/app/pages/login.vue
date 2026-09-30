<script setup lang="ts">
import { ElMessage } from 'element-plus'

import { EmailNotVerifiedError } from '~/composables/use-session'

definePageMeta({ layout: 'auth' })

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const loading = ref(false)
const error = ref('')
const allowSignup = ref(false)

// 注册成功后把凭据留在页面上：用户点完邮件里的验证链接回来，
// 按一个按钮就能重新登录，不必再把邮箱密码敲一遍。
const pendingVerification = ref<{ email: string, password: string } | null>(null)
const checkingVerification = ref(false)
const resending = ref(false)

const { login, signup, resendVerificationEmail } = useAuthSession()

const formTitle = computed(() => {
  if (pendingVerification.value) return '验证你的邮箱'
  return mode.value === 'register' ? '创建你的账号' : '欢迎回来'
})

const formSubtitle = computed(() => {
  if (pendingVerification.value) return '就差最后一步了'
  return mode.value === 'register' ? '开始整理你的求职节奏' : '登录以继续你的求职工作台'
})

// 读取公开注册总开关，决定是否展示"注册"入口。
async function loadSignupConfig() {
  try {
    const res = await $fetch<{ data: { enabled: boolean } }>('/api/signup-config')
    allowSignup.value = res.data.enabled
  }
  catch { allowSignup.value = false }
}

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = ''
}

async function submit() {
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱和密码。'
    return
  }
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'register') {
      await signup(email.value.trim(), password.value, displayName.value.trim() || undefined)
      // 新账号必须先验证邮箱才能用，服务端注册后（autoSignIn: true + 立即登出）
      // 不会留下会话。这里记下凭据，切到"待验证"界面等用户去邮箱点链接。
      pendingVerification.value = { email: email.value.trim(), password: password.value }
      return
    }
    await login(email.value.trim(), password.value)
    await navigateTo('/')
  }
  catch (err) {
    if (err instanceof EmailNotVerifiedError) {
      // 用户常常刚点完验证链接就回来登录，但页面上的状态是旧的。
      // 明确告诉他"再点一次就行"，避免他以为是链接没生效。
      error.value = '这个账号还需要先验证邮箱。验证链接已发到你的邮箱——如果你刚刚点过链接，再点一次「登录」就能进了。'
    }
    else {
      error.value = mode.value === 'register'
        ? '注册失败：该邮箱可能已被使用，或当前未开放注册。'
        : '登录失败：邮箱或密码不正确。'
    }
  }
  finally {
    loading.value = false
  }
}

// 用户从邮箱点完验证链接回来，按这个按钮自动重试登录——不用重新输密码。
// 本质上就是再查一次服务端状态：验证过了就能进，没验证会被拦回来并给出提示。
//
// 刻意不做"点完链接就自动登录"：如果是电脑上注册、手机上点开邮件链接，
// 自动登录会把会话建在手机上，而用户其实想在电脑上继续。
async function retryAfterVerification() {
  if (!pendingVerification.value) return
  checkingVerification.value = true
  error.value = ''
  try {
    await login(pendingVerification.value.email, pendingVerification.value.password)
    await navigateTo('/')
  }
  catch (err) {
    error.value = err instanceof EmailNotVerifiedError
      ? '还没查到验证记录。请确认你点开了邮件里的链接，有时候需要等几秒再试。'
      : '登录没能完成，请用邮箱和密码手动登录。'
  }
  finally {
    checkingVerification.value = false
  }
}

async function resendVerification() {
  if (!pendingVerification.value) return
  resending.value = true
  try {
    await resendVerificationEmail(pendingVerification.value.email)
    ElMessage.success('验证邮件已重新发送。')
  }
  catch {
    ElMessage.error('发送失败，请稍后再试。')
  }
  finally {
    resending.value = false
  }
}

function backToLogin() {
  pendingVerification.value = null
  error.value = ''
  mode.value = 'login'
}

onMounted(loadSignupConfig)
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <aside class="auth-brand">
        <p class="auth-brand__eyebrow">OFFER ON THE WAY</p>
        <h1 class="auth-brand__name">Offer<span class="auth-brand__accent">来</span></h1>
        <p class="auth-brand__tagline">让每一次投递，都更接近 Offer</p>
        <ul class="auth-brand__points">
          <li>投递看板，进度一眼看清</li>
          <li>素材复用，一份事实多处用</li>
          <li>AI 辅助，只推进真实下一步</li>
        </ul>
      </aside>

      <div class="auth-form-panel">
        <div class="auth-form__inner">
          <div class="auth-form__brand">
            <span class="auth-form__logo">✓</span>
            <span class="auth-form__name">Offer来</span>
          </div>

          <h2 class="auth-form__title">{{ formTitle }}</h2>
          <p class="auth-form__subtitle">{{ formSubtitle }}</p>

          <!-- 待验证状态：注册完成，等用户去邮箱点链接回来 -->
          <template v-if="pendingVerification">
            <el-alert
              type="success"
              :closable="false"
              show-icon
              title="注册成功，验证链接已发送"
              :description="`请打开 ${pendingVerification.email} 查收邮件（没看到就翻一下垃圾邮件文件夹）`"
            />
            <el-alert v-if="error" class="auth-form__error mt-4" type="error" :closable="false" show-icon :title="error" />
            <el-button
              class="auth-form__submit mt-5"
              type="primary"
              size="large"
              :loading="checkingVerification"
              @click="retryAfterVerification"
            >
              我已完成验证，重新登录
            </el-button>
            <div class="auth-form__switch">
              <div>
                没收到邮件？<el-link type="primary" :underline="false" @click="resendVerification">重新发送</el-link>
              </div>
              <div class="auth-form__aside">
                <el-link type="info" :underline="false" @click="backToLogin">返回登录</el-link>
              </div>
            </div>
          </template>

          <el-form v-else label-position="top" @submit.prevent="submit">
            <el-form-item label="邮箱">
              <el-input v-model="email" type="email" placeholder="you@example.com" autocomplete="username" size="large" />
            </el-form-item>
            <el-form-item v-if="mode === 'register'" label="昵称（可选）">
              <el-input v-model="displayName" placeholder="怎么称呼你" autocomplete="nickname" size="large" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="password" type="password" show-password size="large" :placeholder="mode === 'register' ? '请设置密码' : '请输入密码'" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" @keyup.enter="submit" />
            </el-form-item>
            <el-alert v-if="error" class="auth-form__error" type="error" :closable="false" :title="error" show-icon />
            <el-button class="auth-form__submit" type="primary" size="large" :loading="loading" @click="submit">{{ mode === 'register' ? '注册' : '登录' }}</el-button>
          </el-form>

          <div v-if="!pendingVerification" class="auth-form__switch">
            <template v-if="mode === 'login'">
              <div v-if="allowSignup">
                还没有账号？<el-link type="primary" :underline="false" @click="switchMode('register')">立即注册</el-link>
              </div>
              <!-- 忘记密码入口不受注册开关影响：关闭注册时老用户仍然需要找回密码。 -->
              <div class="auth-form__aside">
                <el-link type="info" :underline="false" @click="navigateTo('/forgot-password')">忘记密码？</el-link>
              </div>
            </template>
            <template v-else>
              已有账号？<el-link type="primary" :underline="false" @click="switchMode('login')">返回登录</el-link>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 登录页透明，让 body 的粉彩渐变透出来，玻璃卡片浮在上面 */
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
}

.auth-card {
  width: min(920px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 24px;
  background: var(--workbench-glass);
  box-shadow: 0 24px 60px rgba(100, 114, 148, 0.14), inset 0 1px rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(28px) saturate(140%);
}

/* 左侧品牌区 */
.auth-brand {
  padding: 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-right: 1px solid var(--workbench-line);
}
.auth-brand__eyebrow {
  margin: 0 0 18px;
  color: var(--workbench-slate);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  letter-spacing: 0.22em;
}
.auth-brand__name {
  margin: 0 0 20px;
  color: var(--workbench-ink);
  font-family: 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif;
  font-size: 56px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.auth-brand__accent {
  color: var(--workbench-blue);
}
.auth-brand__tagline {
  margin: 0 0 36px;
  color: var(--workbench-slate);
  font-size: 16px;
  line-height: 1.7;
}
.auth-brand__points {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 14px;
}
.auth-brand__points li {
  position: relative;
  padding-left: 22px;
  color: var(--workbench-slate);
  font-size: 14px;
}
.auth-brand__points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--workbench-green);
}

/* 右侧表单区 */
.auth-form-panel {
  padding: 48px 40px;
  display: flex;
  align-items: center;
}
.auth-form__inner {
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
}
.auth-form__brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}
.auth-form__logo {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #fff;
  font-size: 15px;
  background: linear-gradient(145deg, var(--workbench-green), var(--workbench-blue));
  box-shadow: 0 6px 14px rgba(102, 132, 118, 0.3);
}
.auth-form__name {
  font-size: 17px;
  font-weight: 700;
  color: var(--workbench-ink);
}
.auth-form__title {
  margin: 0 0 8px;
  color: var(--workbench-ink);
  font-family: 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 600;
}
.auth-form__subtitle {
  margin: 0 0 26px;
  color: var(--workbench-slate);
  font-size: 14px;
}
.auth-form__error {
  margin-bottom: 16px;
}
.auth-form__submit {
  width: 100%;
  margin-top: 8px;
}
.auth-form__switch {
  margin-top: 22px;
  text-align: center;
  font-size: 13px;
  color: var(--workbench-slate);
}

.auth-form__aside {
  margin-top: 10px;
}

@media (max-width: 760px) {
  .auth-card {
    grid-template-columns: 1fr;
  }
  .auth-brand {
    display: none;
  }
  .auth-form__brand {
    display: flex;
  }
}
</style>
