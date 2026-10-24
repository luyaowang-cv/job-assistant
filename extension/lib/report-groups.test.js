import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { applyChoiceEntries, applyFillEntries, clearFieldMarks, markFieldStates } from './form-page-bridge.js'
import { progressText } from './progress-text.js'
import { groupReportEntries, MANUAL_GROUPS } from './report-groups.js'

const here = dirname(fileURLToPath(import.meta.url))

test('F-054 四个分组之和等于需手动处理总数', () => {
  const entries = [
    { fieldId: 'a', status: 'filled', label: '姓名' },
    { fieldId: 'b', status: 'skipped_existing', label: '公司' },
    { fieldId: 'c', status: 'skipped_sensitive', label: '身份证' },
    { fieldId: 'd', status: 'needs_manual', group: 'write_failed', label: '学历' },
    { fieldId: 'e', status: 'needs_manual', group: 'unanswered', label: '专业' },
    { fieldId: 'f', status: 'needs_manual', group: 'not_attempted', label: '描述' },
    { fieldId: 'g', status: 'needs_manual', group: 'manual', label: '父亲姓名' },
    { fieldId: 'h', status: 'needs_manual', label: '没有分组的字段' },
  ]
  const grouped = groupReportEntries(entries)
  assert.equal(grouped.manualTotal, 5)
  const sum = grouped.buckets.reduce((total, bucket) => total + bucket.count, 0)
  assert.equal(sum, grouped.manualTotal, '四类之和必须等于需手动处理总数')
  assert.deepEqual(grouped.buckets.map(bucket => bucket.key), MANUAL_GROUPS.map(group => group.key))
  // 没带 group 的字段落进「需手动确认」，不能凭空消失
  assert.equal(grouped.buckets.find(bucket => bucket.key === 'manual').count, 2)
})

test('F-054 进度文案带字段名；取不到标签时省略而不是编造', () => {
  assert.equal(progressText({ done: 12, total: 34, label: '学历' }), '正在填写 12/34：学历')
  assert.equal(progressText({ done: 0, total: 5 }), '正在填写 0/5')
  assert.equal(progressText({ done: 3, total: 2, label: '  ' }), '正在填写 3/3', '已完成数不得超过总数')
  assert.doesNotMatch(progressText({ done: 1, total: 2 }), /字段/, '不能编一个字段名')
})

test('F-054 页面标记只写 outline 与 data 属性，不碰背景与 class', () => {
  const source = markFieldStates.toString()
  assert.match(source, /outline/, '应当用 outline 标记')
  assert.match(source, /data-wl-fill-state/)
  assert.doesNotMatch(source, /classList/, '不得修改页面的 class')
  assert.doesNotMatch(source, /backgroundColor\s*=/, '不得覆盖背景色——那是写入过程中的临时高亮')
  // 页面侧函数会被序列化，不能引用模块常量
  assert.match(source, /const STATE_ATTRIBUTE = /)
})

test('F-054 清理函数同时清掉上一轮的临时高亮', () => {
  const source = clearFieldMarks.toString()
  assert.match(source, /dcfce7/)
  assert.match(source, /fee2e2/)
  assert.match(source, /removeAttribute/)
})

test('F-054 标记函数与扫描共用同一套控件编号', () => {
  const marker = markFieldStates.toString()
  const scan = applyFillEntries.toString()
  const choice = applyChoiceEntries.toString()
  for (const source of [marker, scan, choice]) {
    assert.match(source, /CONTROL_SELECTOR/)
  }
  // 标记按 id 末尾的数字定位控件，与扫描、写入同一套编号
  assert.match(marker, /\(\\d\+\)\$/)
})

test('F-054 标记与清理都在页面侧内联执行，不依赖 popup 存活', () => {
  const main = readFileSync(join(here, '../entrypoints/popup/main.ts'), 'utf8')
  assert.match(main, /func: markFieldStates/, '标记必须注入到页面里，而不是留在 popup')
  assert.match(main, /func: clearFieldMarks/)
})
