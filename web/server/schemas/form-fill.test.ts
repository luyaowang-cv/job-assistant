import assert from 'node:assert/strict'
import test from 'node:test'

import { formFillPreviewSchema, isAiFillEligibleField, modelFormFillResponseSchema } from './form-fill'

const valid = { profileId: 'profile_1', fields: [{ id: 'f1', label: '姓名', controlType: 'input' }] }

test('accepts value-free ordinary form descriptors only', () => {
  assert.equal(formFillPreviewSchema.safeParse(valid).success, true)
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ ...valid.fields[0], value: '页面原值' }] }).success, false)
})

test('accepts page descriptors structurally and filters authentication or action controls separately', () => {
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ id: 'f1', label: '身份证号码', controlType: 'input' }] }).success, true)
  assert.equal(formFillPreviewSchema.safeParse({ ...valid, fields: [{ id: 'f1', label: '紧急联系人电话', controlType: 'input' }] }).success, true)
  const password = formFillPreviewSchema.parse({ ...valid, fields: [{ id: 'f1', label: '登录密码', controlType: 'input' }] }).fields[0]
  const consent = formFillPreviewSchema.parse({ ...valid, fields: [{ id: 'f1', label: '同意授权', inputType: 'checkbox', controlType: 'input' }] }).fields[0]
  assert.equal(isAiFillEligibleField(password), false)
  assert.equal(isAiFillEligibleField(consent), false)
  assert.equal(modelFormFillResponseSchema.safeParse({ fills: [{ fieldId: 'f1', value: '王路瑶', extra: true }] }).success, false)
})

test('does not exclude an ordinary field because neighbouring context mentions privacy consent', () => {
  const field = formFillPreviewSchema.parse({
    profileId: 'profile_1',
    fields: [{ id: 'f1', label: '姓名', context: '页面字段 15/40；相邻字段：邮箱、我已阅读并同意隐私政策', controlType: 'input' }],
  }).fields[0]

  assert.equal(isAiFillEligibleField(field), true)
})

test('accepts experience, self-evaluation, date and choice descriptors for AI filling', () => {
  const fields = [
    { id: 'project-description', label: '项目描述', controlType: 'textarea', inputType: 'textarea' },
    { id: 'internship-start', label: '实习开始时间', controlType: 'input', inputType: 'month' },
    { id: 'self-evaluation', label: '自我评价', controlType: 'textarea', inputType: 'textarea' },
    { id: 'employment-type', label: '工作性质', controlType: 'radio-group', inputType: 'radio', options: ['实习', '全职'] },
  ]
  assert.equal(formFillPreviewSchema.safeParse({ profileId: 'profile_1', fields }).success, true)
})

test('normalizes empty native-select placeholders and accepts long real-world option lists', () => {
  const options = ['', '请选择', ...Array.from({ length: 300 }, (_, index) => `选项 ${index + 1}`)]
  const result = formFillPreviewSchema.safeParse({
    profileId: 'profile_1',
    fields: [{
      id: 'country',
      label: '国家或地区',
      name: 'application.education.history.'.repeat(8),
      controlType: 'select',
      options,
    }],
  })

  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.fields[0].options.includes(''), false)
    assert.equal(result.data.fields[0].options.length, options.length - 1)
  }
})
