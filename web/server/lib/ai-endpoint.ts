/**
 * What the provider adapter actually calls, and how to explain what came back.
 *
 * A settings page that only stores a URL cannot tell "I typed the wrong address"
 * from "the account is out of credit" — both surface later as a failed form fill.
 * These helpers exist so the test button can name the reason, including the one
 * that already cost a real debugging session: an Anthropic-format base URL pasted
 * into an OpenAI-compatible client.
 */

/** The URL both provider adapters call. Kept identical to their own concatenation. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${String(baseUrl ?? '').trim().replace(/\/+$/, '')}/chat/completions`
}

/**
 * A likely cause read from the address alone, before any request is made.
 *
 * Empty string means "nothing suspicious". These are the two mistakes that produce
 * a 404 rather than an auth error, so the request would otherwise look like a
 * server problem.
 */
export function baseUrlHint(baseUrl: string): string {
  const url = String(baseUrl ?? '').trim()
  if (!url) return '还没有填写 Base URL。'
  if (/\/chat\/completions\/?$/i.test(url)) {
    return 'Base URL 不应包含 /chat/completions——扩展会自动拼接这一段，填了就会变成两段。'
  }
  if (/\/anthropic\/?$/i.test(url)) {
    return '这是 Anthropic 格式的地址；接口类型选的是 OpenAI Compatible，应去掉末尾的 /anthropic（DeepSeek 的 OpenAI 地址是 https://api.deepseek.com）。'
  }
  if (/\/(messages|v1\/messages)\/?$/i.test(url)) {
    return '这是 Anthropic 的 /messages 路径；OpenAI 兼容接口只需要填到域名（或 /v1）。'
  }
  return ''
}

/**
 * Turns a provider answer into one sentence plus one hint.
 *
 * The status is authoritative; the upstream body is only quoted because it often
 * says something more specific ("model not found", "insufficient balance") that no
 * status code carries.
 */
export function explainProviderFailure(status: number, bodyText: string): { message: string; hint: string } {
  const body = String(bodyText ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const byStatus: Record<number, { message: string; hint: string }> = {
    400: { message: '请求被拒绝（HTTP 400）。', hint: '常见原因是模型名不属于这家服务商，或该模型需要额外的参数。' },
    401: { message: 'API Key 无效（HTTP 401）。', hint: '检查 Key 是否完整、是否属于这个服务地址；换过 Key 后要重新保存。' },
    402: { message: '账户余额不足（HTTP 402）。', hint: '到服务商控制台充值后重试。' },
    403: { message: '没有权限（HTTP 403）。', hint: '这个 Key 可能没有调用该模型的权限。' },
    404: { message: '接口地址不存在（HTTP 404）。', hint: 'Base URL 很可能填错了：只需要填到服务商给的根地址，不要带 /chat/completions 之类的路径。' },
    429: { message: '被限流或额度用尽（HTTP 429）。', hint: '同一个 Key 短时间内调用过多，或账户额度已用尽；稍等一两分钟再试。' },
  }
  const known = byStatus[status]
  if (known) return { message: body ? `${known.message} 上游说：${body}` : known.message, hint: known.hint }
  if (status >= 500) {
    return {
      message: body ? `服务商自身故障（HTTP ${status}）。上游说：${body}` : `服务商自身故障（HTTP ${status}）。`,
      hint: '重试一次；仍然失败说明对端在维护。',
    }
  }
  return { message: body ? `请求失败（HTTP ${status}）。上游说：${body}` : `请求失败（HTTP ${status}）。`, hint: '' }
}
