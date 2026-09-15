<script setup lang="ts">
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const { login } = useAuthSession()

async function submit() {
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱和密码。'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await login(email.value.trim(), password.value)
    await navigateTo('/')
  }
  catch {
    error.value = '登录失败：邮箱或密码不正确。'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="mb-8 flex items-center gap-3">
        <span class="grid h-11 w-11 place-items-center rounded-[14px] bg-[linear-gradient(145deg,#a6bce6,#7898d0)] text-lg text-white shadow-[0_8px_18px_rgba(93,125,182,.25)]">求</span>
        <span>
          <strong class="block text-[15px] tracking-wide text-[#3b4657]">求职小助手</strong>
          <small class="font-mono text-[11px] tracking-wide text-[#8c98ab]">PERSONAL CAREER OS</small>
        </span>
      </div>

      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="邮箱">
          <el-input v-model="email" type="email" placeholder="you@example.com" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" type="password" show-password placeholder="请输入密码" autocomplete="current-password" @keyup.enter="submit" />
        </el-form-item>
        <el-alert v-if="error" class="mb-4" type="error" :closable="false" :title="error" show-icon />
        <el-button class="mt-2 w-full" type="primary" :loading="loading" @click="submit">登录</el-button>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #eef2f7;
}
.login-card {
  width: 100%;
  max-width: 360px;
  padding: 32px 28px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 50px rgba(80, 100, 130, 0.12);
}
</style>
