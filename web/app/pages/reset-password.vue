<script setup lang="ts">
import { ElMessage } from 'element-plus'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const done = ref(false)
const error = ref('')

// better-auth 校验重置令牌后 302 到本页，并把 token 追加到查询串上；
// 令牌无效或过期时则带上 error 参数。
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

onMounted(() => {
  const queryError = route.query.error
  if (typeof queryError === 'string' && queryError) {
    error.value = '重置链接无效或已过期，请重新申请。'
  }
  else if (!token.value) {
    error.value = '这个链接缺少重置令牌，请从邮件里的按钮重新打开。'
  }
})

async function submit() {
  if (!token.value) return
  if (password.value.length < 8) {
    ElMessage.warning('密码至少 8 位。')
    return
  }
  if (password.value !== confirmPassword.value) {
    ElMessage.warning('两次输入的密码不一致。')
    return
  }

  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { newPassword: password.value, token: token.value },
    })
    done.value = true
    ElMessage.success('密码已重置。')
  }
  catch {
    error.value = '重置失败：链接可能已经使用过或已过期，请重新申请。'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthPanel title="设置新密码" subtitle="设置成功后，此前登录过的设备会被登出">
    <template v-if="done">
      <el-alert
        type="success"
        :closable="false"
        show-icon
        title="密码已重置。"
        description="现在可以用新密码登录了。"
      />
      <el-button class="w-full mt-5" type="primary" size="large" @click="navigateTo('/login')">去登录</el-button>
    </template>

    <template v-else-if="!token || error">
      <el-alert type="error" :closable="false" show-icon :title="error || '这个链接无效。'" />
      <el-button class="w-full mt-5" size="large" @click="navigateTo('/forgot-password')">重新申请重置链接</el-button>
    </template>

    <el-form v-else label-position="top" @submit.prevent="submit">
      <el-form-item label="新密码">
        <el-input
          v-model="password"
          type="password"
          show-password
          placeholder="至少 8 位"
          autocomplete="new-password"
          size="large"
        />
      </el-form-item>
      <el-form-item label="确认新密码">
        <el-input
          v-model="confirmPassword"
          type="password"
          show-password
          placeholder="再输入一次"
          autocomplete="new-password"
          size="large"
          @keyup.enter="submit"
        />
      </el-form-item>
      <el-button class="w-full" type="primary" size="large" :loading="loading" @click="submit">
        重置密码
      </el-button>
    </el-form>

    <template #foot>
      <el-link type="info" :underline="false" @click="navigateTo('/login')">返回登录</el-link>
    </template>
  </AuthPanel>
</template>
