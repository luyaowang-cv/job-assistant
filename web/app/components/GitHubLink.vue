<script setup lang="ts">
import pkg from '~/../package.json'
const repositoryUrl = (pkg as { repository?: { url?: string } }).repository?.url ?? ''
</script>

<template>
  <a v-if="repositoryUrl" class="inline-flex justify-center items-center dark:text-white" :href="repositoryUrl" target="_blank">
    <div i-ri-github-line />
  </a>
</template>