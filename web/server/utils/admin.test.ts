import assert from 'node:assert/strict'
import test from 'node:test'

import { isAdminEmail } from './admin'

test('isAdminEmail 精确匹配 ADMIN_EMAILS 中的邮箱', () => {
  process.env.ADMIN_EMAILS = 'admin@example.com'
  assert.equal(isAdminEmail('admin@example.com'), true)
  assert.equal(isAdminEmail('other@example.com'), false)
})

test('isAdminEmail 支持逗号分隔、空白与大小写', () => {
  process.env.ADMIN_EMAILS = '  Admin@Example.com ,boss@corp.cn '
  assert.equal(isAdminEmail('admin@example.com'), true)
  assert.equal(isAdminEmail('boss@corp.cn'), true)
  assert.equal(isAdminEmail('stranger@corp.cn'), false)
})

test('isAdminEmail 在 ADMIN_EMAILS 为空或未设置时返回 false', () => {
  process.env.ADMIN_EMAILS = ''
  assert.equal(isAdminEmail('admin@example.com'), false)
  delete process.env.ADMIN_EMAILS
  assert.equal(isAdminEmail('admin@example.com'), false)
})
