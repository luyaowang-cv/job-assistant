import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { applyChoiceEntries, collectControlValues, scanVisibleFormFields } from './form-page-bridge.js'

/**
 * A stand-in for the page, just big enough to run the radio-group rules.
 *
 * The real scanner cannot run here: it is serialised into a live frame and walks
 * a real document. Those rules are nevertheless the ones that decide whether a
 * 是/否 question arrives as one field or as two — so the shared block is lifted
 * out of the function source and run against a hand-built tree instead of being
 * checked by regex alone.
 */
const REGION = /\/\/ #region radio-group identity([\s\S]*?)\/\/ #endregion radio-group identity/

function radioRegion(source) {
  const block = source.match(REGION)
  assert.ok(block, '找不到 radio-group identity 区块，分组规则没有被测到')
  return block[1]
}

const CONTROL_SELECTOR = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'form-page-bridge.js'), 'utf8')
  .match(/const CONTROL_SELECTOR = '([^']+)'/)[1]

class FakeNode {
  constructor(tag, { cls = '', attrs = {}, text = '' } = {}) {
    this.tagName = tag.toUpperCase()
    this.attrs = { ...attrs, ...(cls ? { class: cls } : {}) }
    this.type = attrs.type
    this.classes = cls ? cls.split(/\s+/) : []
    this.ownText = text
    this.children = []
    this.parentElement = null
  }

  add(...kids) {
    for (const kid of kids) {
      kid.parentElement = this
      this.children.push(kid)
    }
    return this
  }

  get textContent() {
    return this.ownText + this.children.map(child => child.textContent).join('')
  }

  getAttribute(name) {
    return this.attrs[name] ?? null
  }

  get nextElementSibling() {
    const siblings = this.parentElement?.children ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }

  contains(node) {
    for (let cursor = node; cursor; cursor = cursor.parentElement) if (cursor === this) return true
    return false
  }

  *descendants() {
    for (const child of this.children) {
      yield child
      yield* child.descendants()
    }
  }

  querySelectorAll(selector) {
    return [...this.descendants()].filter(node => matches(node, selector))
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }

  closest(selector) {
    for (let cursor = this; cursor; cursor = cursor.parentElement) if (matches(cursor, selector)) return cursor
    return null
  }
}

/** The selector subset the radio rules use: `tag`, `tag[attr="v"]`, `.class`, `[attr*="v"]`. */
function matches(node, selector) {
  return selector.split(',').map(part => part.trim()).filter(Boolean).some((part) => {
    const [, tag = '', rest = ''] = part.match(/^([a-z]*)((?:[.#[][^\]]*\]?)*)$/i) ?? []
    if (tag && node.tagName !== tag.toUpperCase()) return false
    return (rest.match(/[.#][^.#[]+|\[[^\]]*\]/g) ?? []).every((token) => {
      if (token.startsWith('.')) return node.classes.includes(token.slice(1))
      const attribute = token.slice(1, -1)
      const equal = attribute.match(/^([\w-]+)="([^"]*)"$/)
      if (equal) return node.getAttribute(equal[1]) === equal[2]
      const contains = attribute.match(/^([\w-]+)\*="([^"]*)"$/)
      if (contains) return String(node.getAttribute(contains[1]) ?? '').includes(contains[2])
      return node.getAttribute(attribute) !== null
    })
  })
}

function radio(attrs = {}) {
  return new FakeNode('input', { attrs: { type: 'radio', ...attrs } })
}

/** Runs the shipped grouping block from one function against a fake tree. */
function groupRulesIn(functionSource, controls) {
  // `element instanceof HTMLInputElement` has to resolve inside the lifted block.
  globalThis.HTMLInputElement ??= FakeNode
  return new Function('allControls', 'CONTROL_SELECTOR', `${radioRegion(functionSource)}; return { radioGroupFor, radioOptionText }`)(
    controls,
    CONTROL_SELECTOR,
  )
}

function scanTree(root) {
  const controls = root.querySelectorAll(CONTROL_SELECTOR)
  const { radioGroupFor, radioOptionText } = groupRulesIn(scanVisibleFormFields.toString(), controls)
  return { controls, radioGroupFor, radioOptionText }
}

test('三处单选组识别是同一份实现', () => {
  // 扫描用它算出 `radio-group-<第一个 radio 的下标>`；写入和收集在页面上把同一个
  // id 重建出来。任何一处单独改过，认的组和写的组就会错位，而页面上看不出来。
  const regions = [scanVisibleFormFields, applyChoiceEntries, collectControlValues].map(fn => radioRegion(fn.toString()))
  assert.equal(new Set(regions).size, 1, '三处单选组逻辑已经不一致')
})

test('没有 name 的兄弟单选归成一组，题面不会被两个选项各认领一次', () => {
  // recruit.cscec.com 的样子：每个选项一个盒子，`name` 是空的。
  // 按“控件所在的盒子”分组只会拿到一个选项，于是同一道是非题裂成两个字段。
  const groupBox = new FakeNode('div', { cls: 'radio-group' })
    .add(new FakeNode('div', { cls: 'opt', text: '是' }).add(radio()))
    .add(new FakeNode('div', { cls: 'opt', text: '否' }).add(radio()))
  const root = new FakeNode('div', { cls: 'form-item' })
    .add(new FakeNode('div', { cls: 'label', text: '是否服从调剂' }), groupBox)

  const { controls, radioGroupFor, radioOptionText } = scanTree(root)
  const radios = controls.filter(control => control.type === 'radio')
  const group = radioGroupFor(radios[0])

  assert.equal(group.length, 2, '两个选项没有被认成一组')
  assert.deepEqual(group.map(radioOptionText), ['是', '否'], '选项文字应从各自的小盒子里读出来')
  assert.deepEqual(radioGroupFor(radios[1]), group, '从第二个选项出发也要得到同一组')
})

test('两道是非题并排在一个盒子里时拒绝合并', () => {
  // 合并之后一个答案会同时命中两个 radio。写错比不写更糟，所以退回单个选项。
  const flat = new FakeNode('div', { cls: 'flat' })
  for (const text of ['是', '否', '是', '否']) flat.add(new FakeNode('div', { cls: 'o', text }).add(radio()))
  const { controls, radioGroupFor } = scanTree(flat)
  const radios = controls.filter(control => control.type === 'radio')
  assert.equal(radioGroupFor(radios[0]).length, 1, '内容重复的两道题被并成了一道')
})

test('组件库用 <label> 包住选项时照样成组', () => {
  const box = new FakeNode('div', { cls: 'el-radio-group' })
  for (const text of ['男', '女']) {
    box.add(new FakeNode('label', { cls: 'el-radio' })
      .add(new FakeNode('span', { cls: 'el-radio__input' }).add(radio()), new FakeNode('span', { cls: 'el-radio__label', text })))
  }
  const { controls, radioGroupFor, radioOptionText } = scanTree(box)
  const radios = controls.filter(control => control.type === 'radio')
  const group = radioGroupFor(radios[0])
  assert.equal(group.length, 2)
  assert.deepEqual(group.map(radioOptionText), ['男', '女'])
})

test('写了 name 的组按 name 认，不看它们分在哪些盒子里', () => {
  const first = new FakeNode('div', { cls: 'cell' }).add(radio({ name: 'gender' }))
  const second = new FakeNode('div', { cls: 'cell' }).add(radio({ name: 'gender' }))
  const root = new FakeNode('div', { cls: 'row' }).add(first, new FakeNode('div', { cls: 'gap' }), second)
  const { controls, radioGroupFor } = scanTree(root)
  const radios = controls.filter(control => control.type === 'radio')
  assert.equal(radioGroupFor(radios[0]).length, 2, 'name 相同却被分成了两组')
})
