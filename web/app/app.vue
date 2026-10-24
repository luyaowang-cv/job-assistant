<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import { appName } from '~/constants'

useHead({
  title: appName,
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Serif+SC:wght@600;700&display=swap' },
  ],
})
</script>
<template>
  <!-- Element Plus 默认是英文 locale：日期面板的月份/星期、分页器、空状态文案都会是英文。
       在这里统一注入中文，影响全站所有 EP 组件，不用每个页面单独配。 -->
  <el-config-provider :locale="zhCn">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </el-config-provider>
</template>
