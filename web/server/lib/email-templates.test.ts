import assert from 'node:assert/strict'
import test from 'node:test'

import { renderAuthMail } from './email-templates'

const base = {
  url: 'https://example.com/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email',
  displayName: '小明',
  expiresInMinutes: 60,
  appName: 'Offer来',
  appUrl: 'https://example.com',
}

test('两种邮件类型的主题不同', () => {
  const verify = renderAuthMail({ ...base, kind: 'verify-email' })
  const reset = renderAuthMail({ ...base, kind: 'reset-password' })
  assert.notEqual(verify.subject, reset.subject)
  assert.match(verify.subject, /验证/)
  assert.match(reset.subject, /密码/)
})

test('完整链接同时出现在纯文本与 HTML 版本中', () => {
  const mail = renderAuthMail({ ...base, kind: 'verify-email' })
  // 纯文本必须带完整 URL：多数客户端默认只渲染 text/plain。
  assert.ok(mail.text.includes(base.url))
  // HTML 里 & 会被转义成 &amp;，所以按转义后的形态断言。
  assert.ok(mail.html.includes(base.url.replace(/&/g, '&amp;')))
})

test('有效期分钟数写进两份正文', () => {
  const mail = renderAuthMail({ ...base, kind: 'reset-password', expiresInMinutes: 30 })
  assert.match(mail.text, /30 分钟/)
  assert.match(mail.html, /30 分钟/)
})

test('昵称中的 HTML 特殊字符被转义', () => {
  const mail = renderAuthMail({ ...base, kind: 'verify-email', displayName: '<img src=x onerror=alert(1)>' })
  assert.ok(!mail.html.includes('<img src=x'))
  assert.ok(mail.html.includes('&lt;img src=x'))
})

test('主题是固定文案，不含用户可控内容', () => {
  // 昵称不参与主题拼接，因此不存在邮件头发注入面。这条断言把这个安全属性固定下来。
  const mail = renderAuthMail({ ...base, kind: 'verify-email', displayName: '小明' })
  assert.ok(!mail.subject.includes('小明'))
})

test('昵称中的换行被折叠为单行，不会破坏正文排版', () => {
  const mail = renderAuthMail({ ...base, kind: 'verify-email', displayName: '小明\r\nBcc: evil@example.com' })
  assert.match(mail.text, /小明 Bcc: evil@example.com/)
  assert.ok(!mail.text.includes('\r'))
})

test('昵称为空时回退到通用称呼', () => {
  const mail = renderAuthMail({ ...base, kind: 'verify-email', displayName: '   ' })
  assert.match(mail.text, /同学/)
})
