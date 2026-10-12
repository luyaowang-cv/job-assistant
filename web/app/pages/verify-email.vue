<script setup lang="ts">
import { ElMessage } from 'element-plus'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const { user, fetchSession, resendVerificationEmail } = useAuthSession()

const resendEmail = ref('')
const sending = ref(false)
const sent = ref(false)

// 三种进入方式，对应三种界面：
// - 邮件链接点进来：令牌已在 better-auth 侧消费，这里只展示结果，不要再调一次验证接口；
// - 链接失效跳回来：带 error 参数；
// - 从工作台顶栏的软提醒点进来（pending=1）：用户还没验证，这里给他重发的入口。
const state = computed<'success' | 'failed' | 'pending'>(() => {
  const queryError = route.query.error
  if (typeof queryError === 'string' && queryError.length > 0) return 'failed'
  return route.query.pending === '1' ? 'pending' : 'success'
})

const title = computed(() => ({
  success: '邮箱已验证',
  failed: '验证链接无效',
  pending: '邮箱尚未验证',
})[state.value])

const subtitle = computed(() => ({
  success: '感谢确认，你的账号多了一层保障',
  failed: '链接可能已经使用过，或已超过 1 小时有效期',
  pending: '不验证也能正常使用工作台，验证后账号更安全',
})[state.value])

onMounted(async () => {
  // 刷新会话，让顶栏那条提醒在验证成功后立刻消失。
  await fetchSession()
  if (user.value?.email) resendEmail.value = user.value.email
})

async function resend() {
  const value = resendEmail.value.trim()
  if (!value) {
    ElMessage.warning('请输入要接收验证邮件的邮箱。')
    return
  }

  sending.value = true
  try {
    await resendVerificationEmail(value)
    sent.value = true
    ElMessage.success('验证邮件已重新发送。')
  }
  catch {
    // 该接口对已注册与未注册邮箱返回相同结果，失败只可能是网络问题或触发限流。
    ElMessage.error('发送失败，请稍后再试。')
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <AuthPanel :title="title" :subtitle="subtitle">
    <template v-if="state === 'success'">
      <template v-if="user">
        <el-alert
          type="success"
          :closable="false"
          show-icon
          title="验证完成。"
          description="回到工作台继续你的求职节奏吧。"
        />
        <el-button class="w-full mt-5" type="primary" size="large" @click="navigateTo('/')">
          进入工作台
        </el-button>
      </template>
      <template v-else>
        <!-- 未登录通常是「电脑上注册、手机上点邮件链接」这种跨设备场景。
             此时绝不能自动登录——那会把会话建在手机上，而用户其实想在电脑上用。 -->
        <el-alert
          type="success"
          :closable="false"
          show-icon
          title="邮箱已验证。"
          description="请回到你注册时用的设备，用邮箱和密码登录。"
        />
        <el-button class="w-full mt-5" type="primary" size="large" @click="navigateTo('/login')">
          去登录
        </el-button>
      </template>
    </template>

    <template v-else>
      <el-alert
        v-if="state === 'failed'"
        class="mb-5"
        type="error"
        :closable="false"
        show-icon
        title="这个链接已经不能用了。"
        description="验证链接只能点一次，且只有 1 小时有效期。"
      />
      <el-form label-position="top" @submit.prevent="resend">
        <el-form-item label="发送验证邮件到">
          <el-input
            v-model="resendEmail"
            type="email"
            placeholder="you@example.com"
            autocomplete="username"
            size="large"
            @keyup.enter="resend"
          />
        </el-form-item>
        <el-button class="w-full" type="primary" size="large" :loading="sending" @click="resend">
          发送验证邮件
        </el-button>
      </el-form>
      <p v-if="sent" class="verify-email__hint">没收到的话请检查垃圾邮件文件夹。</p>
    </template>

    <template #foot>
      <el-link type="info" :underline="false" @click="navigateTo('/login')">返回登录</el-link>
    </template>
  </AuthPanel>
</template>

<style scoped>
.verify-email__hint {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--workbench-slate);
}
</style>
