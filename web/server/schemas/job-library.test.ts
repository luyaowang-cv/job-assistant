import assert from 'node:assert/strict'
import test from 'node:test'

import { feishuImportSchema, importedJobRowSchema, listJobsQuerySchema } from './job-library'
import { feishuOAuthCallbackSchema } from './feishu-oauth'

test('accepts the configured public Feishu Bitable link and rejects other hosts', () => {
  const shareUrl = 'https://yal2at57cvq.feishu.cn/base/GtSLbyyR3aCENOsJYC6cdlsVnih?table=tblH4au5rnBcqHgJ&view=vewMjMLWkM'
  assert.equal(feishuImportSchema.safeParse({ shareUrl }).success, true)
  assert.equal(feishuImportSchema.safeParse({ shareUrl: 'https://example.com/base/GtSLbyyR3aCENOsJYC6cdlsVnih' }).success, false)
})

test('requires source company and job title while preserving empty optional fields as null', () => {
  const valid = { companyName: '示例公司', title: '前端工程师', announcementUrl: null, url: null, hasWrittenTest: null }
  assert.equal(importedJobRowSchema.safeParse(valid).success, true)
  assert.equal(importedJobRowSchema.safeParse({ ...valid, title: '岗位、'.repeat(500) }).success, true)
  assert.equal(importedJobRowSchema.parse({ ...valid, announcementUrl: '点击查看', url: '/' }).announcementUrl, null)
  assert.equal(importedJobRowSchema.safeParse({ ...valid, companyName: ' ' }).success, false)
  assert.equal(importedJobRowSchema.safeParse({ ...valid, title: ' ' }).success, false)
})

test('defaults hidden offline jobs and valid pagination', () => {
  const parsed = listJobsQuerySchema.parse({})
  assert.equal(parsed.page, 1)
  assert.equal(parsed.pageSize, 20)
  assert.equal(parsed.includeOffline, false)
})

test('requires a bounded OAuth callback code and signed-state parameter', () => {
  assert.equal(feishuOAuthCallbackSchema.safeParse({ code: 'one-time-code', state: 'signed-state' }).success, true)
  assert.equal(feishuOAuthCallbackSchema.safeParse({ code: 'one-time-code' }).success, false)
  assert.equal(feishuOAuthCallbackSchema.safeParse({ code: '', state: 'signed-state' }).success, false)
})
