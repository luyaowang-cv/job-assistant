import assert from 'node:assert/strict'
import test from 'node:test'

import { formFillPreviewSchema, modelFormFillResponseSchema } from './form-fill'

const valid = { profileId: 'profile_1', fields: [{ id: 'f1', label: '姓名', controlType: 'input' }] }

test('accepts value-free ordinary form descriptors only', () => {
  assert.equal(formFillPreviewSchema.safeParse(valid).success, true)
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ ...valid.fields[0], value: '页面原值' }] }).success, false)
})

test('allows personal-profile fields but rejects authentication and action controls', () => {
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ id: 'f1', label: '身份证号码', controlType: 'input' }] }).success, true)
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ id: 'f1', label: '紧急联系人电话', controlType: 'input' }] }).success, true)
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ id: 'f1', label: '登录密码', controlType: 'input' }] }).success, false)
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ id: 'f1', label: '同意授权', inputType: 'checkbox', controlType: 'input' }] }).success, false)
  assert.equal(modelFormFillResponseSchema.safeParse({ fills: [{ fieldId: 'f1', value: '王路瑶', extra: true }] }).success, false)
})
