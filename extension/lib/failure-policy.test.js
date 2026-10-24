import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError, isGlobalFailure, isRetryable, retryDelayFor } from './failure-policy.js'

test('F-055 限流等得久，掉线等得短', () => {
  const limited = new ApiError('限流', 429, 'AI_PROVIDER_RATE_LIMITED')
  const dropped = new ApiError('掉线', 0, 'NETWORK_UNREACHABLE')
  assert.equal(retryDelayFor(limited, 0), 15_000, '限流第一次重试应等 15 秒')
  assert.equal(retryDelayFor(limited, 1), 30_000, '限流第二次重试应等 30 秒')
  assert.equal(retryDelayFor(dropped, 0), 1_000)
  assert.equal(retryDelayFor(dropped, 1), 3_000)
  // 第三次没有更长的等待可给：返回 undefined 就是让调用方停手。
  assert.equal(retryDelayFor(limited, 2), undefined)
})

test('F-055 客户端超时不重试（等满 100 秒说明服务端已经卡住）', () => {
  const timeout = new ApiError('超时', 0, 'NETWORK_TIMEOUT')
  assert.equal(isRetryable(timeout), false, '再等 100 秒只是把同一个问题再问一遍')
  assert.equal(isRetryable(new ApiError('连不上', 0, 'NETWORK_UNREACHABLE')), true)
})

test('F-055 未知的 5xx 值得一次重试，未知的 4xx 不值得', () => {
  assert.equal(isRetryable(new ApiError('上游挂了', 502, '')), true)
  assert.equal(isRetryable(new ApiError('请求有问题', 400, '')), false)
  assert.equal(isRetryable(new Error('普通错误')), false, '不是 ApiError 一律不重试')
})

test('F-055 只有密钥/登录类错误会中止整轮，限流不会', () => {
  assert.equal(isGlobalFailure(new ApiError('密钥无效', 502, 'AI_KEY_INVALID')), true)
  assert.equal(isGlobalFailure(new ApiError('未登录', 401, 'UNAUTHORIZED')), true)
  assert.equal(isGlobalFailure(new ApiError('邮箱未验证', 403, '')), true)
  // 限流只毁这一批，其余批次还有机会。
  assert.equal(isGlobalFailure(new ApiError('限流', 429, 'AI_PROVIDER_RATE_LIMITED')), false)
  assert.equal(isGlobalFailure(new Error('普通错误')), false)
})

test('F-055 popup 里不再有第二份 ApiError（两份会让 instanceof 静默失效）', async () => {
  const { readFileSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../entrypoints/popup/main.ts'), 'utf8')
  assert.equal(main.includes('class ApiError'), false, 'ApiError 只能有一份实现，否则 isRetryable 恒为 false')
  assert.match(main, /from '\.\.\/\.\.\/lib\/failure-policy\.js'/)
})
