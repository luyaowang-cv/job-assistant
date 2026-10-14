import { defineEventHandler } from 'h3'

import { mailFrom, smtpConfigured, verifySmtpConnection } from '../../../lib/mailer'
import { isCurrentUserAdmin } from '../../../services/current-user'
import { apiError, apiSuccess } from '../../../utils/api-response'

// 管理员专用的发信健康检查。这是排查"注册了但收不到验证信"的唯一入口：
// 它会真实建连 SMTP 并完成认证，但不发送任何邮件。
// 只返回连通性结论与发件人地址——SMTP 主机、用户名、密码一律不出现在响应里。
export default defineEventHandler(async (event) => {
  if (!await isCurrentUserAdmin()) {
    return apiError(event, 403, 'FORBIDDEN', '仅管理员可调用。')
  }

  const configured = smtpConfigured()
  const result = configured
    ? await verifySmtpConnection()
    : { ok: false, error: '未配置 SMTP_HOST。' }

  return apiSuccess(event, {
    configured,
    ok: result.ok,
    from: mailFrom(),
    error: result.error,
  })
})
