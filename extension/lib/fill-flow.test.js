import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const mainSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../entrypoints/popup/main.ts'), 'utf8')

/** The source of one top-level function, up to the next one. */
function functionSource(name) {
  const start = mainSource.indexOf(`async function ${name}(`)
  assert.notEqual(start, -1, `没找到 ${name}`)
  const end = mainSource.indexOf('\nasync function ', start + 1)
  const sync = mainSource.indexOf('\nfunction ', start + 1)
  const stop = [end, sync].filter(index => index > 0).sort((a, b) => a - b)[0] ?? mainSource.length
  return mainSource.slice(start, stop)
}

test('F-052 一次填写只扫描一轮页面', () => {
  const body = functionSource('fillCurrentPage')
  const scans = body.match(/scanEveryFrame\(/g) ?? []
  // A second scan costs a full label-geometry pass over every control and is only
  // ever used to answer “does this box have a value now?” — which the light read
  // (`readControlValuesEveryFrame`) answers without rebuilding anything.
  assert.equal(scans.length, 1, `fillCurrentPage 里出现了 ${scans.length} 次 scanEveryFrame`)
  const plans = body.match(/buildFillPlan\(/g) ?? []
  assert.equal(plans.length, 1, `fillCurrentPage 里出现了 ${plans.length} 次 buildFillPlan`)
})

test('F-052 填写后的状态来自回读，不来自第二遍扫描', () => {
  const body = functionSource('fillCurrentPage')
  assert.match(body, /readControlValuesEveryFrame\(/, '应当用轻量回读确认写入结果')
  assert.doesNotMatch(body, /appliedSignatureCounts/, '签名计数已随第二遍扫描一起移除')
})

// ------------------------------------------------- F-053 写入顺序的不变量

test('F-053 两个写入器都按页面顺序写，而不是按答案到达的顺序', async () => {
  const { applyChoiceEntries, applyFillEntries } = await import('./form-page-bridge.js')
  const text = applyFillEntries.toString()
  const choice = applyChoiceEntries.toString()

  // Text: walks the control list, looks each one up in `byId`.
  assert.match(text, /of controls\)/, '文本写入应当遍历控件列表')
  assert.match(text, /byId\.get\(/, '文本写入应当按 id 查答案')
  assert.doesNotMatch(text, /for \(const \{ fieldId, value \} of entries\)/, '文本写入不应遍历答案列表')

  // Choice: same idea, over `allControls`.
  assert.match(choice, /allControls\.forEach\(/, '选择写入应当遍历控件列表')
  assert.match(choice, /byId\.get\(/, '选择写入应当按 id 查答案')
})
