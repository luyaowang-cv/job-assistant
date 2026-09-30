import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import type { Transporter } from 'nodemailer'

import { __setTransportFactoryForTest, mailFrom, sendMail, smtpConfigured } from './mailer'

afterEach(() => {
  delete process.env.SMTP_HOST
  delete process.env.SMTP_PORT
  delete process.env.SMTP_SECURE
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASSWORD
  delete process.env.SMTP_FROM
  delete process.env.MAIL_DEV_LOG_ONLY
  __setTransportFactoryForTest(null)
})

// 只实现被测代码真正调用的两个方法，其余用断言绕过。
function fakeTransport(overrides: Partial<Record<'sendMail' | 'verify', unknown>>): Transporter {
  return {
    sendMail: async () => ({ messageId: 'stub' }),
    verify: async () => true,
    ...overrides,
  } as unknown as Transporter
}

const sampleMessage = {
  to: 'someone@example.com',
  subject: '测试邮件',
  text: '纯文本正文',
  html: '<p>HTML 正文</p>',
}

test('smtpConfigured 只认 SMTP_HOST', () => {
  assert.equal(smtpConfigured(), false)
  process.env.SMTP_HOST = '   '
  assert.equal(smtpConfigured(), false)
  process.env.SMTP_HOST = 'smtp.example.com'
  assert.equal(smtpConfigured(), true)
})

test('mailFrom 优先 SMTP_FROM，其次 SMTP_USER', () => {
  process.env.SMTP_USER = 'resend'
  assert.equal(mailFrom(), 'resend')
  process.env.SMTP_FROM = 'Offer来 <no-reply@example.com>'
  assert.equal(mailFrom(), 'Offer来 <no-reply@example.com>')
})

test('未配置 SMTP_HOST 时返回 unconfigured，不抛错', async () => {
  const result = await sendMail(sampleMessage)
  assert.equal(result.status, 'unconfigured')
})

test('MAIL_DEV_LOG_ONLY=true 时返回 skipped，且不调用 transporter', async () => {
  process.env.SMTP_HOST = 'smtp.example.com'
  process.env.MAIL_DEV_LOG_ONLY = 'true'

  let called = false
  __setTransportFactoryForTest(() => fakeTransport({
    sendMail: async () => {
      called = true
      return { messageId: 'should-not-happen' }
    },
  }))

  const originalInfo = console.info
  console.info = () => {}
  try {
    const result = await sendMail(sampleMessage)
    assert.equal(result.status, 'skipped')
  }
  finally {
    console.info = originalInfo
  }
  assert.equal(called, false)
})

test('SMTP 发送抛错时返回 failed，绝不向上抛异常', async () => {
  process.env.SMTP_HOST = 'smtp.example.com'
  process.env.SMTP_FROM = 'no-reply@example.com'
  __setTransportFactoryForTest(() => fakeTransport({
    sendMail: async () => { throw new Error('connection timeout') },
  }))

  const originalError = console.error
  console.error = () => {}
  let result
  try {
    // 这是本模块最关键的一条契约：better-auth 的 sendOnSignUp 会同步等待这个
    // Promise，一旦抛出异常，注册接口就会 500。
    result = await sendMail(sampleMessage)
  }
  finally {
    console.error = originalError
  }

  assert.equal(result.status, 'failed')
  assert.match((result as { error: string }).error, /connection timeout/)
})

test('发送成功时返回 sent 与 messageId，并按配置透传字段', async () => {
  process.env.SMTP_HOST = 'smtp.example.com'
  process.env.SMTP_FROM = 'Offer来 <no-reply@example.com>'

  let seen: Record<string, unknown> | undefined
  __setTransportFactoryForTest(() => fakeTransport({
    sendMail: async (options: unknown) => {
      seen = options as Record<string, unknown>
      return { messageId: '<abc@example.com>' }
    },
  }))

  const result = await sendMail({ ...sampleMessage, replyTo: 'support@example.com' })

  assert.deepEqual(result, { status: 'sent', messageId: '<abc@example.com>' })
  assert.equal(seen?.from, 'Offer来 <no-reply@example.com>')
  assert.equal(seen?.to, 'someone@example.com')
  assert.equal(seen?.subject, '测试邮件')
  assert.equal(seen?.replyTo, 'support@example.com')
})
