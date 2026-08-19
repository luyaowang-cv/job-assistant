import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: '求职助手',
    description: '在用户主动操作后，辅助保存岗位与准备求职材料。',
    permissions: ['activeTab', 'scripting', 'clipboardWrite'],
    host_permissions: ['http://127.0.0.1:3000/*'],
  },
})
