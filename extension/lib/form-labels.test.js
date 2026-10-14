import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EMPTY_STATE_PATTERN,
  UNIT_OR_SEPARATOR_PATTERN,
  VALUE_LIKE_PATTERN,
  isEmptyStateText,
  isUnitOrSeparator,
  isUselessLabel,
  isValueLikeLabel,
} from './form-labels.js'
import { applyChoiceEntries, applyFillEntries, scanVisibleFormFields } from './form-page-bridge.js'

test('rejects the wording a page shows where nothing is chosen yet', () => {
  for (const value of ['请选择', ' 请选择 ', '请先选择', '请输入', '未选择', '暂无选项', '暂无数据', '暂无', '--', '-']) {
    assert.equal(isEmptyStateText(value), true, `${value} 是空态文案`)
  }
  // Only as a whole string: a prompt that merely starts with “请” is a real label.
  for (const value of ['请输入学校全称', '请选择毕业时间', '姓名', '请填写您的期望薪资', '暂无实习经历']) {
    assert.equal(isEmptyStateText(value), false, `${value} 是真实标签`)
  }
})

test('rejects a control whose whole name is its own value', () => {
  // “2024”, “9” and “+86” are what a year box, a month box and a country-code
  // picker show *inside* themselves. Read as a name they describe no column.
  for (const value of ['2024', '9', '+86', '2000-01-01']) {
    assert.equal(isValueLikeLabel(value), true, `${value} 是值`)
  }
  for (const value of ['GPA', '第 3 名', '学历', '2024 年毕业']) {
    assert.equal(isValueLikeLabel(value), false, `${value} 不是纯数值`)
  }
})

test('rejects the unit characters a split date control sits next to', () => {
  for (const value of ['年', '月', '日', '至', '年月', '年月日', '~', '—', '··']) {
    assert.equal(isUnitOrSeparator(value), true, `${value} 是单位或分隔符`)
  }
  // Anchored: a real label that merely contains a unit character is kept.
  for (const value of ['至今', '毕业年月', '开始时间', '年收入']) {
    assert.equal(isUnitOrSeparator(value), false, `${value} 不只是单位字符`)
  }
})

test('treats every one of those as naming no column', () => {
  for (const value of ['年', '请选择', '2024', '+86', '', '   ']) {
    assert.equal(isUselessLabel(value), true, `${value} 不能当字段名`)
  }
  for (const value of ['学校名称', '是否在职期间获取', '个人年薪期望值 (税前含福利)']) {
    assert.equal(isUselessLabel(value), false, `${value} 是字段名`)
  }
})

test('keeps the page-side copy of these patterns identical', () => {
  // `chrome.scripting` serializes the scan's own source into the frame, so it
  // cannot import this module and has to carry a copy of the three patterns. A
  // copy that has drifted would decide labels differently inside the page than in
  // the rule table, and nothing else would notice.
  const source = scanVisibleFormFields.toString()
  for (const pattern of [EMPTY_STATE_PATTERN, VALUE_LIKE_PATTERN, UNIT_OR_SEPARATOR_PATTERN]) {
    assert.ok(source.includes(pattern.source), `页面侧扫描缺少这个模式：${pattern}`)
  }
})

test('applies the patterns when choosing a label', () => {
  const source = scanVisibleFormFields.toString()
  assert.match(source, /const isUselessLabel = /)
  // Empty text is part of the same rule on both sides: it names nothing either.
  assert.match(source, /return !text/)
  assert.match(source, /EMPTY_STATE_PATTERN\.test\(text\)/)
  assert.match(source, /VALUE_LIKE_PATTERN\.test\(text\)/)
  assert.match(source, /UNIT_OR_SEPARATOR_PATTERN\.test\(text\)/)
})

test('asks a radio group for its question, never for its first option', () => {
  // A 是/否 group rendered as `<label><input>是</label><label><input>否</label>`
  // used to arrive at the model named “是”, and “是” is both the cheapest answer
  // and the wrongest. The group's own text, minus its options, is the question.
  const source = scanVisibleFormFields.toString()
  assert.match(source, /const radioGroupLabel = /)
  assert.match(source, /label: radioGroupLabel\(group\),/)
  // And when the question lives beside the options rather than around them — a
  // two-column table, a hand-rolled `<div>` — it is read from there next, so a
  // group that used to be named “是” does not simply become unnamed instead.
  assert.match(source, /const beside = adjacentLabel\(anchor\)/)
})

test('reports a contenteditable editor as the textarea it is', () => {
  // `div` is not a control shape the workbench accepts; reporting the tag name
  // made it reject the whole batch, and a rejected batch used to end the fill.
  const source = scanVisibleFormFields.toString()
  assert.match(source, /const controlTypeOf = /)
  assert.match(source, /controlType: controlTypeOf\(element\),/)
  assert.doesNotMatch(source, /controlType: element\.tagName\.toLowerCase\(\),/)
})

test('does not read a dropdown that still says “请选择” as already answered', () => {
  const source = scanVisibleFormFields.toString()
  assert.match(source, /const selectHasValue = /)
  assert.match(source, /return !EMPTY_STATE_PATTERN\.test\(normalizeLabel\(selected\.textContent\)\)/)
  assert.match(source, /\? selectHasValue\(element\)/)
})

test('reads the unit and the role of a split date box on the page', () => {
  const source = scanVisibleFormFields.toString()
  assert.match(source, /const dateUnitOf = /)
  assert.match(source, /const dateRoleOf = /)
  assert.match(source, /dateUnit: dateUnit \|\| undefined,/)
  assert.match(source, /dateRole: dateUnit \? dateRoleOf\(element\) \|\| undefined : undefined,/)
})

test('says why a control could not be written to, in both writers', () => {
  // “未能应用” covered a control that had moved, a framework that reverted the
  // value, an empty dropdown and a disabled box alike. The reason now travels
  // back with the id so the report can name the one it was.
  for (const source of [applyFillEntries.toString(), applyChoiceEntries.toString()]) {
    assert.match(source, /const unavailableReasons = \{\}/)
    assert.match(source, /return \{ appliedIds, skippedExistingIds, unavailableIds, unavailableReasons \}/)
  }
})

test('types into a search-backed dropdown before giving up on it', () => {
  // 学校名称 and 专业名称 are a text filter with a lookup list behind them:
  // clicking opens a box that stays empty until something is typed, so looking
  // alone could never fill them.
  const source = applyChoiceEntries.toString()
  assert.match(source, /const typeToSearch = /)
  assert.match(source, /typed = await typeToSearch\(element, entry\.value\)/)
  assert.match(source, /const REMOTE_SEARCH_MS = /)
})
