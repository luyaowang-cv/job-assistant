import assert from 'node:assert/strict'
import test from 'node:test'

import { formatTechStack, materialDateInput, materialPeriod, parseTechStack } from './material-types'

test('技术栈读进来再写出去必须原样往返', () => {
  const list = ['Vue 3', 'TypeScript', 'Vite']
  // 曾经回填用 '、'、保存按 ,，/ 拆，两边分隔符不一致：每编辑保存一次就把数组又合并一层，
  // ["Vue 3","TypeScript"] → ["Vue 3、TypeScript"] → 再合并一层。这条测试锁住往返。
  assert.deepEqual(parseTechStack(formatTechStack(list)), list)
  assert.deepEqual(parseTechStack(formatTechStack(parseTechStack(formatTechStack(list)))), list)
})

test('技术栈接受手打的四种分隔符', () => {
  assert.deepEqual(parseTechStack('Vue 3, TypeScript/Vite、React，Node'), ['Vue 3', 'TypeScript', 'Vite', 'React', 'Node'])
  assert.deepEqual(parseTechStack('   '), [])
  assert.deepEqual(parseTechStack(''), [])
  assert.deepEqual(formatTechStack(undefined), '')
  assert.deepEqual(formatTechStack(['Vue', '', 42, 'React']), 'Vue、React')
})

test('起止时间只显示到月，两种精度都能读', () => {
  assert.equal(materialPeriod({ startDate: '2024-09-15', endDate: '2025-03-01' }), '2024-09 — 2025-03')
  assert.equal(materialPeriod({ startDate: '2024-09-15' }), '2024-09')
  assert.equal(materialPeriod({ startDate: '2024-09-15', endDate: '至今' }), '2024-09 — 至今')
  // 存量数据是月精度，截断逻辑不能把它弄坏
  assert.equal(materialPeriod({ startDate: '2024-09', endDate: '2025-03' }), '2024-09 — 2025-03')
  assert.equal(materialPeriod({}), '')
})

test('日期回填把月精度补成当月 1 日', () => {
  assert.equal(materialDateInput('2024-09'), '2024-09-01')
  assert.equal(materialDateInput('2024-09-15'), '2024-09-15')
  assert.equal(materialDateInput('至今'), '至今')
  assert.equal(materialDateInput(undefined), '')
  assert.equal(materialDateInput(20240915), '')
})
