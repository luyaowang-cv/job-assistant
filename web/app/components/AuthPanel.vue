<script setup lang="ts">
import { appName } from '~/constants'

// 辅助认证页（找回密码 / 重置密码 / 验证邮箱）的通用卡片外壳。
// 登录页有完整的品牌分栏，这些页面只需要一个简洁的居中卡片。
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="auth-panel">
    <div class="auth-panel__card">
      <div class="auth-panel__brand">
        <span class="auth-panel__logo">✓</span>
        <span class="auth-panel__name">{{ appName }}</span>
      </div>

      <h1 class="auth-panel__title">{{ title }}</h1>
      <p v-if="subtitle" class="auth-panel__subtitle">{{ subtitle }}</p>

      <slot />

      <div class="auth-panel__foot">
        <slot name="foot" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 与登录页一致：页面透明，让 body 的粉彩渐变透出来，玻璃卡片浮在上面 */
.auth-panel {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
}

.auth-panel__card {
  width: min(460px, 100%);
  padding: 40px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 24px;
  background: var(--workbench-glass);
  box-shadow: 0 24px 60px rgba(100, 114, 148, 0.14), inset 0 1px rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(28px) saturate(140%);
}

.auth-panel__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}

.auth-panel__logo {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--workbench-blue);
  color: #fff;
  font-size: 15px;
}

.auth-panel__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--workbench-ink);
}

.auth-panel__title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: var(--workbench-ink);
}

.auth-panel__subtitle {
  margin: 0 0 24px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--workbench-slate);
}

.auth-panel__foot {
  margin-top: 22px;
  text-align: center;
  font-size: 13px;
  color: var(--workbench-slate);
}
</style>
