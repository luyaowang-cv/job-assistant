<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const loading = ref(false)
const error = ref('')
const allowSignup = ref(false)

const { login, signup } = useAuthSession()

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
    }
    else {
      await login(email.value.trim(), password.value)
    }
    await navigateTo('/')
  }
  catch {
    error.value = mode.value === 'register'
      ? '注册失败：该邮箱可能已被使用，或当前未开放注册。'
      : '登录失败：邮箱或密码不正确。'
  }
  finally {
    loading.value = false
  }
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

          <h2 class="auth-form__title">{{ mode === 'register' ? '创建你的账号' : '欢迎回来' }}</h2>
          <p class="auth-form__subtitle">{{ mode === 'register' ? '开始整理你的求职节奏' : '登录以继续你的求职工作台' }}</p>

          <el-form label-position="top" @submit.prevent="submit">
            <el-form-item label="邮箱">
              <el-input v-model="email" type="email" placeholder="you@example.com" autocomplete="username" size="large" />
            </el-form-item>
            <el-form-item v-if="mode === 'register'" label="昵称（可选）">
              <el-input v-model="displayName" placeholder="怎么称呼你" autocomplete="nickname" size="large" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="password" type="password" show-password :placeholder="mode === 'register' ? '请设置密码' : '请输入密码'" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" @keyup.enter="submit" size="large" />
            </el-form-item>
            <el-alert v-if="error" class="auth-form__error" type="error" :closable="false" :title="error" show-icon />
            <el-button class="auth-form__submit" type="primary" size="large" :loading="loading" @click="submit">{{ mode === 'register' ? '注册' : '登录' }}</el-button>
          </el-form>

          <div class="auth-form__switch">
            <template v-if="mode === 'login' && allowSignup">
              还没有账号？<el-link type="primary" :underline="false" @click="switchMode('register')">立即注册</el-link>
            </template>
            <template v-else-if="mode === 'register'">
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
