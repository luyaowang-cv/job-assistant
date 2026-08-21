import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: '求职助手',
    description: '连接本地求职工作台，保存岗位、生成话术并使用网申档案智能填写。',
    permissions: ['activeTab', 'scripting', 'clipboardWrite'],
    host_permissions: ['http://127.0.0.1:3000/*'],
  },
})
