<template>
  <div class="auth-layout">
    <slot />
  </div>
</template>

<style scoped>
/* 独立登录/注册布局：不套工作台侧边菜单，仅撑满整屏。 */
.auth-layout {
  min-height: 100vh;
}
</style>
