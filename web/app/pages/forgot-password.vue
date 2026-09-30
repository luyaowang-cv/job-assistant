<script setup lang="ts">
import { ElMessage } from 'element-plus'

definePageMeta({ layout: 'auth' })

const email = ref('')
const loading = ref(false)
const sent = ref(false)

async function submit() {
  const value = email.value.trim()
  if (!value) {
    ElMessage.warning('请输入注册时使用的邮箱。')
    return
  }

  loading.value = true
  try {
    await $fetch('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email: value, redirectTo: '/reset-password' },
    })
  }
  catch {
    // 刻意吞掉错误并展示同一句提示：若按"邮箱是否存在"给出不同结果，
    // 这个页面就成了账号枚举工具。
  }
  finally {
    loading.value = false
    sent.value = true
  }
}
</script>

<template>
  <AuthPanel title="找回密码" subtitle="填写注册邮箱，我们会发送一封重置邮件">
    <template v-if="sent">
      <el-alert
        type="success"
        :closable="false"
        show-icon
        title="如果这个邮箱已注册，我们已发送重置链接。"
        description="没收到的话请看一眼垃圾邮件文件夹；链接 1 小时内有效。"
      />
      <el-button class="w-full mt-5" size="large" @click="navigateTo('/login')">返回登录</el-button>
    </template>

    <el-form v-else label-position="top" @submit.prevent="submit">
      <el-form-item label="邮箱">
        <el-input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="username"
          size="large"
          @keyup.enter="submit"
        />
      </el-form-item>
      <el-button class="w-full" type="primary" size="large" :loading="loading" @click="submit">
        发送重置链接
      </el-button>
    </el-form>

    <template #foot>
      <el-link type="info" :underline="false" @click="navigateTo('/login')">返回登录</el-link>
    </template>
  </AuthPanel>
</template>
