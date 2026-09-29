// 事务邮件模板。刻意内联成 TS 字符串而非独立模板文件：生产镜像只 COPY .output，
// 任何靠 fs 读取的模板路径都会在构建产物里丢失。
// 纯函数、无 IO，便于单测。

export type AuthMailKind = 'verify-email' | 'reset-password'

export type AuthMailParams = {
  kind: AuthMailKind
  url: string
  displayName: string
  expiresInMinutes: number
  appName: string
  appUrl: string
}

export type RenderedMail = {
  subject: string
  text: string
  html: string
}

// 邮件客户端不认 <style> 和 flex，只能用表格布局 + 内联样式。
const INK = '#3d464b'
const SLATE = '#64716d'
const MIST = '#f2f3f0'
const SURFACE = '#fffefb'
const ACCENT = '#668476'
const BORDER = '#d9dfda'

// 昵称是用户可控输入，直接拼进 HTML 会形成注入，拼进主题会形成头注入。
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function singleLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

const COPY = {
  'verify-email': {
    subject: '验证你的邮箱',
    heading: '确认这个邮箱是你',
    lead: '完成验证后，你的账号会多一层保障，将来忘记密码也能自己找回。',
    action: '验证邮箱',
    ignore: '如果这不是你本人的操作，忽略这封邮件即可，你的账号不会有任何变化。',
  },
  'reset-password': {
    subject: '重置你的密码',
    heading: '重新设置登录密码',
    lead: '我们收到了重置密码的请求。点击下面的按钮设置新密码，设置成功后此前登录的设备会被登出。',
    action: '设置新密码',
    ignore: '如果你没有申请重置密码，忽略这封邮件即可，你的密码不会改变。',
  },
} as const

export function renderAuthMail(params: AuthMailParams): RenderedMail {
  const copy = COPY[params.kind]
  const name = singleLine(params.displayName) || '同学'
  const subject = singleLine(`${copy.subject} · ${params.appName}`)
  const safeName = escapeHtml(name)
  const safeUrl = escapeHtml(params.url)
  const safeAppName = escapeHtml(params.appName)
  const safeAppUrl = escapeHtml(params.appUrl)

  // 纯文本版本必须带完整链接：不少客户端默认只显示 text/plain。
  const text = [
    `${name}，你好：`,
    '',
    copy.lead,
    '',
    `${copy.action}：${params.url}`,
    '',
    `链接 ${params.expiresInMinutes} 分钟内有效，过期后可以重新申请。`,
    copy.ignore,
    '',
    `${params.appName} · ${params.appUrl}`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:${MIST};font-family:'PingFang SC','Microsoft YaHei',Helvetica,Arial,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${SURFACE};border:1px solid ${BORDER};border-radius:16px;">
<tr><td style="padding:32px 32px 8px 32px;">
<p style="margin:0 0 24px 0;font-size:13px;letter-spacing:2px;color:${SLATE};">${safeAppName}</p>
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.4;color:${INK};">${copy.heading}</h1>
<p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:${SLATE};">${safeName}，你好：</p>
<p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:${SLATE};">${copy.lead}</p>
</td></tr>
<tr><td align="center" style="padding:0 32px 24px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${ACCENT}" style="border-radius:10px;">
<a href="${safeUrl}" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${copy.action}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 32px 24px 32px;">
<p style="margin:0 0 8px 0;font-size:13px;line-height:1.7;color:${SLATE};">按钮点不动的话，把下面的链接复制到浏览器打开：</p>
<p style="margin:0;font-size:13px;line-height:1.7;word-break:break-all;"><a href="${safeUrl}" style="color:${ACCENT};">${safeUrl}</a></p>
</td></tr>
<tr><td style="padding:0 32px 32px 32px;border-top:1px solid ${BORDER};">
<p style="margin:24px 0 0 0;font-size:13px;line-height:1.7;color:${SLATE};">链接 ${params.expiresInMinutes} 分钟内有效，过期后可以重新申请。</p>
<p style="margin:8px 0 0 0;font-size:13px;line-height:1.7;color:${SLATE};">${copy.ignore}</p>
<p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:${SLATE};"><a href="${safeAppUrl}" style="color:${SLATE};">${safeAppName}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, text, html }
}
