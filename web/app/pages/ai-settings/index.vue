<script setup lang="ts">
import { ElMessage } from 'element-plus'

type AiSettings = {
  provider: 'OPENAI_COMPATIBLE'
  baseUrl: string
  model: string
  apiKeyConfigured: boolean
}

type AiProviderTestResult = {
  ok: boolean
  /** 实际请求的地址——测试按钮存在的意义就是把它显示出来 */
  url: string
  model: string
  status: number
  elapsedMs: number
  message: string
  hint: string
}

const settings = reactive<AiSettings>({
  provider: 'OPENAI_COMPATIBLE',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyConfigured: false,
})
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const apiKey = ref('')
const testResult = ref<AiProviderTestResult | null>(null)

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
    const body: Record<string, string> = { provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model }
    if (apiKey.value.trim()) body.apiKey = apiKey.value.trim()
    const response = await $fetch<{ data: AiSettings }>('/api/v1/ai-settings', {
      method: 'PUT',
      body,
    })
    Object.assign(settings, response.data)
    apiKey.value = ''
    ElMessage.success('API 设置已保存；本次不会调用模型。')
  }
  catch { ElMessage.error('保存失败：请检查服务地址和模型名称。') }
  finally { saving.value = false }
}

/**
 * 用表单里当前的地址与模型发一次最小请求。
 *
 * 表单值优先于已保存的值，所以「先改、先测、再保存」是可行的；只有填了新 Key
 * 才会带上 Key，否则服务端用已保存的那个。测试本身不会保存任何东西。
 */
async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    const body: Record<string, string> = { baseUrl: settings.baseUrl.trim(), model: settings.model.trim() }
    if (apiKey.value.trim()) body.apiKey = apiKey.value.trim()
    const response = await $fetch<{ data: AiProviderTestResult }>('/api/v1/ai-settings/test', { method: 'POST', body })
    testResult.value = response.data
  }
  catch {
    testResult.value = null
    ElMessage.error('测试请求没有发出去，请检查网络后重试。')
  }
  finally { testing.value = false }
}

onMounted(() => { void load() })
</script>

<template>
  <section v-loading="loading" class="page-rail page-rail--narrow material-page settings-page">
    <div class="material-surface material-surface--transparent">
      <div class="material-surface__header">
      <div>
        <p class="page-heading__eyebrow">系统 / AI PROVIDER</p>
        <p>配置工作台所使用的 AI 接口地址和模型；保存设置不会发起调用，「测试连接」会。</p>
      </div>
      </div>
      <el-alert class="mb-5" type="info" :closable="false" show-icon title="可填写你自己的 API Key（服务端加密存储、不返回明文）；留空保持原值，未配置时回退服务端环境变量。密钥不会显示或发送给浏览器扩展。" />
      <el-form label-position="top">
        <el-form-item label="接口类型"><el-input model-value="OpenAI Compatible" disabled /></el-form-item>
        <el-form-item label="Base URL"><el-input v-model="settings.baseUrl" placeholder="https://api.openai.com/v1" /></el-form-item>
        <el-form-item label="模型名称"><el-input v-model="settings.model" placeholder="例如：gpt-4o-mini" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="apiKey" type="password" show-password :placeholder="settings.apiKeyConfigured ? '已配置，留空保持不变' : '输入你的 API Key'" /></el-form-item>
      </el-form>
      <div class="settings-page__status">
        <span>当前 API Key 状态</span>
        <el-tag :type="settings.apiKeyConfigured ? 'success' : 'warning'" effect="plain">{{ settings.apiKeyConfigured ? '已配置' : '未配置' }}</el-tag>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-end gap-3">
        <el-button :loading="testing" @click="testConnection">测试连接</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存 API 设置</el-button>
      </div>
      <p class="settings-page__note">「测试连接」会用表单里当前的地址与模型真实调用一次（约 1 个 token），不保存任何改动；表单里的 Key 优先于已保存的 Key。</p>

      <el-alert
        v-if="testResult"
        class="mt-4"
        :type="testResult.ok ? 'success' : 'error'"
        :closable="false"
        show-icon
        :title="testResult.ok ? '连接成功' : '连接失败'"
      >
        <p class="settings-page__test-line"><strong>请求地址</strong> {{ testResult.url }}</p>
        <p class="settings-page__test-line"><strong>模型</strong> {{ testResult.model }}<span v-if="testResult.status">　<strong>状态</strong> HTTP {{ testResult.status }}</span><span v-if="testResult.elapsedMs">　<strong>耗时</strong> {{ testResult.elapsedMs }} ms</span></p>
        <p class="settings-page__test-line">{{ testResult.message }}</p>
        <p v-if="testResult.hint" class="settings-page__test-line settings-page__test-hint">{{ testResult.hint }}</p>
      </el-alert>
    </div>
  </section>
</template>

<style scoped>
.settings-page__test-line {
  margin: 2px 0;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

.settings-page__test-hint {
  color: var(--el-text-color-secondary);
}
</style>
