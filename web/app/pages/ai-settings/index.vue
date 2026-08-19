<script setup lang="ts">
import { ElMessage } from 'element-plus'

type AiSettings = {
  provider: 'OPENAI_COMPATIBLE'
  baseUrl: string
  model: string
  apiKeyConfigured: boolean
}

const settings = reactive<AiSettings>({
  provider: 'OPENAI_COMPATIBLE',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyConfigured: false,
})
const loading = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ data: AiSettings }>('/api/v1/ai-settings')
    Object.assign(settings, response.data)
  }
  catch { ElMessage.error('API 设置读取失败。') }
  finally { loading.value = false }
}

async function save() {
  saving.value = true
  try {
    const response = await $fetch<{ data: AiSettings }>('/api/v1/ai-settings', {
      method: 'PUT',
      body: { provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model },
    })
    Object.assign(settings, response.data)
    ElMessage.success('API 设置已保存；本次不会调用模型。')
  }
  catch { ElMessage.error('保存失败：请检查服务地址和模型名称。') }
  finally { saving.value = false }
}

onMounted(() => { void load() })
</script>

<template>
  <section v-loading="loading" class="page-rail page-rail--narrow material-page settings-page">
    <div class="material-surface material-surface--transparent">
      <div class="material-surface__header">
      <div>
        <p class="page-heading__eyebrow">系统 / AI PROVIDER</p>
        <p>配置工作台所使用的 AI 接口地址和模型；保存设置不会发起调用。</p>
      </div>
      </div>
      <el-alert class="mb-5" type="info" :closable="false" show-icon title="API Key 仅保存在服务端环境变量中：DeepSeek 可用 DEEPSEEK_API_KEY，其他兼容服务可用 OPENAI_API_KEY，通用回退为 AI_API_KEY。密钥不会显示、写入数据库或发送给浏览器扩展。" />
      <el-form label-position="top">
        <el-form-item label="接口类型"><el-input model-value="OpenAI Compatible" disabled /></el-form-item>
        <el-form-item label="Base URL"><el-input v-model="settings.baseUrl" placeholder="https://api.openai.com/v1" /></el-form-item>
        <el-form-item label="模型名称"><el-input v-model="settings.model" placeholder="例如：gpt-4o-mini" /></el-form-item>
      </el-form>
      <div class="settings-page__status">
        <span>服务端 API Key 状态</span>
        <el-tag :type="settings.apiKeyConfigured ? 'success' : 'warning'" effect="plain">{{ settings.apiKeyConfigured ? '已配置' : '未配置' }}</el-tag>
      </div>
      <p class="settings-page__note">本页目前只保存后续 Agent 共用的接口地址和模型；不会测试连通性或产生调用费用。</p>
      <div class="mt-5 text-right"><el-button type="primary" :loading="saving" @click="save">保存 API 设置</el-button></div>
    </div>
  </section>
</template>
