import type { Transporter } from 'nodemailer'
import nodemailer from 'nodemailer'

// 事务邮件的最小描述：调用方只关心收件人、主题与两种正文。
export type MailMessage = {
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
}

export type MailSendResult =
  | { status: 'sent', messageId?: string }
  | { status: 'skipped' }
  | { status: 'unconfigured' }
  | { status: 'failed', error: string }

const globalForMail = globalThis as unknown as {
  __mailTransporter?: Transporter
  __mailTransportFactory?: (() => Transporter) | null
}

// 未配置 SMTP_HOST 时所有发信降级为打日志：本地开发与首次部署不必先申请
// 发信服务，就能完整跑通注册验证与找回密码流程。
export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim())
}

// 仅本地开发使用：不发信，把正文（含验证链接）打到终端。
function devLogOnly() {
  return process.env.MAIL_DEV_LOG_ONLY === 'true'
}

// 发件人。没配 SMTP_FROM 时退化到 SMTP_USER——但注意部分服务商（如 Resend）
// 的用户名是字面量而非邮箱，那种情况下必须显式配 SMTP_FROM 才能发出去。
export function mailFrom() {
  return process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || ''
}

function createTransporter(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    // 465 用隐式 TLS，587 用 STARTTLS。默认按 465 处理。
    secure: process.env.SMTP_SECURE !== 'false',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' }
      : undefined,
    // 显式超时：发信挂在注册请求的后台任务里，没有超时会让连接一直悬着。
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { minVersion: 'TLSv1.2' },
  })
}

// 惰性建 transporter：构建期（nuxt build 会 import 服务端模块做预渲染）
// 没有 SMTP 环境变量，import 时就建连接会直接让构建失败。
// 每个 worker 进程各持一份，这是 node-cluster 下想要的结果——不是共享一个连接。
function getTransporter(): Transporter | null {
  const factory = globalForMail.__mailTransportFactory
  if (factory) return factory()
  if (!smtpConfigured()) return null
  if (!globalForMail.__mailTransporter) {
    globalForMail.__mailTransporter = createTransporter()
  }
  return globalForMail.__mailTransporter
}

// 验证链接只该出现在收件箱和本地终端里，绝不进生产日志。
function describeForLog(message: MailMessage) {
  return `to=${message.to} subject=${message.subject}\n\n${message.text}`
}

// 发一封事务邮件。**永不抛错**——better-auth 的 sendOnSignUp 会同步等待
// 这个 Promise，SMTP 抖动绝不能连坐注册接口。
export async function sendMail(message: MailMessage): Promise<MailSendResult> {
  if (devLogOnly()) {
    console.info(`[mail] MAIL_DEV_LOG_ONLY=true，未真正发送：\n${describeForLog(message)}`)
    return { status: 'skipped' }
  }

  const transporter = getTransporter()
  if (!transporter) {
    console.warn(`[mail] 未配置 SMTP_HOST，跳过发送：to=${message.to} subject=${message.subject}`)
    return { status: 'unconfigured' }
  }

  try {
    const info = await transporter.sendMail({
      from: mailFrom(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    })
    return { status: 'sent', messageId: info.messageId }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[mail] 发送失败：to=${message.to} subject=${message.subject} reason=${reason}`)
    return { status: 'failed', error: reason }
  }
}

// 管理员健康检查：真实建连 + EHLO + AUTH，但不发信。
export async function verifySmtpConnection(): Promise<{ ok: boolean, error?: string }> {
  if (!smtpConfigured()) {
    return { ok: false, error: '未配置 SMTP_HOST。' }
  }
  if (devLogOnly()) {
    return { ok: false, error: 'MAIL_DEV_LOG_ONLY=true，当前不会真正发信。' }
  }
  try {
    const transporter = getTransporter()
    if (!transporter) return { ok: false, error: '未配置 SMTP_HOST。' }
    await transporter.verify()
    return { ok: true }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// 仅供单测：注入假 transport，避免测试依赖真实 SMTP 服务。
export function __setTransportFactoryForTest(factory: (() => Transporter) | null) {
  globalForMail.__mailTransportFactory = factory
  // 一并清掉已缓存的真实实例，避免测试之间互相污染。
  globalForMail.__mailTransporter = undefined
}
