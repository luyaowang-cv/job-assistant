import assert from 'node:assert/strict'
import test from 'node:test'

import { educationsFromReferences } from './document-resolver'

/** 数据库里引用是嵌套形状：card 里带 type/title/facts */
const reference = (id: string, type: string, title: string, sortOrder: number, facts: Record<string, unknown> = {}, visible = true) => ({
  id, sortOrder, visible, card: { type, title, facts },
})

test('教育卡按拖动顺序转成 educations 数组项', () => {
  const converted = educationsFromReferences([
    reference('e1', 'EDUCATION', '第二大学', 1, { major: '软件工程', educationLevel: '硕士' }),
    reference('e0', 'EDUCATION', '第一大学', 0, { major: '计算机', gpa: 3.8, gpaScale: 4 }),
  ])
  assert.ok(converted)
  const records = converted as Array<Record<string, unknown>>
  // sortOrder 决定顺序，不是毕业时间——用户在简历里拖动就是在定顺序
  assert.deepEqual(records.map(item => item.school), ['第一大学', '第二大学'])
  // 卡片标题即学校名，其余字段直接展开
  assert.equal(records[0]?.major, '计算机')
  assert.equal(records[0]?.gpa, 3.8)
})

test('只收教育类型的卡片，隐藏的引用也不算', () => {
  const converted = educationsFromReferences([
    reference('e0', 'EDUCATION', '第一大学', 0),
    reference('a1', 'AWARD', '一等奖学金', 1),
    reference('e2', 'EDUCATION', '隐藏大学', 2, {}, false),
  ])
  const records = converted as Array<Record<string, unknown>>
  assert.equal(records.length, 1)
  assert.equal(records[0]?.school, '第一大学')
})

test('没有教育卡时返回 null，调用方据此回退主档案数组', () => {
  assert.equal(educationsFromReferences([]), null)
  assert.equal(educationsFromReferences([reference('a1', 'AWARD', '奖学金', 0)]), null)
})

test('同一张教育卡被引用多次只算一段，且优先认 education 区块', () => {
  // 真实档案里出现过的情况：新「教育背景」区块插了两行同一张卡，
  // 老的自定义模块（section 是 block-xxx）里还留着一份同样的引用。
  const same = (id: string, section: string, sortOrder: number) => ({
    id: `${section}-${sortOrder}`, section, sortOrder, visible: true,
    card: { id, type: 'EDUCATION', title: id === 'card-master' ? '北方工业大学' : '河北科技师范学院', facts: {} },
  })
  const converted = educationsFromReferences([
    same('card-master', 'education', 0),
    same('card-master', 'education', 1),
    same('card-master', 'block-1', 0),
    same('card-bachelor', 'block-1', 1),
  ]) as Array<Record<string, unknown>>
  assert.deepEqual(converted.map(item => item.school), ['北方工业大学', '河北科技师范学院'])
})

test('facts 缺失时只给出 school，不编造字段', () => {
  const records = educationsFromReferences([{ sortOrder: 0, card: { type: 'EDUCATION', title: '第一大学' } }]) as Array<Record<string, unknown>>
  assert.deepEqual(records, [{ school: '第一大学' }])
})
