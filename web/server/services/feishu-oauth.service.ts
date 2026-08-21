import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { prisma } from '../lib/prisma'

import { getLocalUser } from './local-user'

const authorizationScopes = ['bitable:app:readonly', 'wiki:wiki', 'wiki:wiki:readonly', 'wiki:node:read', 'drive:export:readonly', 'offline_access']
const stateMaxAgeMs = 10 * 60 * 1_000

export class FeishuOAuthError extends Error {
  constructor(message: string, readonly code: 'FEISHU_NOT_CONFIGURED' | 'FEISHU_NOT_CONNECTED' | 'FEISHU_AUTH_FAILED' | 'FEISHU_REAUTH_REQUIRED') {
    super(message)
  }
}

function requiredEnv(name: 'FEISHU_APP_ID' | 'FEISHU_APP_SECRET' | 'FEISHU_OAUTH_REDIRECT_URI') {
  const value = process.env[name]?.trim()
  if (!value) throw new FeishuOAuthError(`缺少 ${name}，无法完成飞书授权。`, 'FEISHU_NOT_CONFIGURED')
  return value
}

function encryptionKey() {
  const raw = process.env.FEISHU_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) return createHmac('sha256', requiredEnv('FEISHU_APP_SECRET')).update('job-assistant/feishu-token-encryption/v1').digest()
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new FeishuOAuthError('FEISHU_TOKEN_ENCRYPTION_KEY 必须是 32 字节的 Base64 密钥。', 'FEISHU_NOT_CONFIGURED')
  return key
}

function encrypt(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

function decrypt(value: string) {
  const payload = Buffer.from(value, 'base64url')
  const iv = payload.subarray(0, 12)
  const authTag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function stateSecret() { return requiredEnv('FEISHU_APP_SECRET') }

function sign(value: string) { return createHmac('sha256', stateSecret()).update(value).digest('base64url') }

function createState() {
  const payload = Buffer.from(JSON.stringify({ nonce: randomBytes(18).toString('base64url'), issuedAt: Date.now() })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function validateState(state: string | undefined) {
  if (!state) throw new FeishuOAuthError('飞书授权回调缺少 state。', 'FEISHU_AUTH_FAILED')
  const [payload, signature] = state.split('.')
  if (!payload || !signature) throw new FeishuOAuthError('飞书授权状态无效。', 'FEISHU_AUTH_FAILED')
  const expected = sign(payload)
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new FeishuOAuthError('飞书授权状态校验失败。请重新连接。', 'FEISHU_AUTH_FAILED')
  try {
    const { issuedAt } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { issuedAt?: number }
    if (!issuedAt || Date.now() - issuedAt > stateMaxAgeMs) throw new Error('expired')
  }
  catch { throw new FeishuOAuthError('飞书授权已过期。请重新连接。', 'FEISHU_AUTH_FAILED') }
}

type FeishuTokenResponse = { code: number, msg?: string, access_token?: string, expires_in?: number, refresh_token?: string, refresh_token_expires_in?: number, scope?: string }

async function requestToken(body: Record<string, string>) {
  const response = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
  const token = await response.json() as FeishuTokenResponse
  if (!response.ok || token.code !== 0 || !token.access_token || !token.refresh_token || !token.expires_in) throw new FeishuOAuthError(`飞书授权失败：${token.msg ?? response.statusText}`, 'FEISHU_AUTH_FAILED')
  return token as Required<Pick<FeishuTokenResponse, 'access_token' | 'expires_in' | 'refresh_token'>> & FeishuTokenResponse
}

async function persistTokens(tokens: Awaited<ReturnType<typeof requestToken>>) {
  const user = await getLocalUser()
  const now = Date.now()
  return prisma.feishuConnection.upsert({
    where: { userId: user.id },
    create: { userId: user.id, encryptedAccessToken: encrypt(tokens.access_token), accessTokenExpiresAt: new Date(now + tokens.expires_in * 1_000), encryptedRefreshToken: encrypt(tokens.refresh_token), refreshTokenExpiresAt: tokens.refresh_token_expires_in ? new Date(now + tokens.refresh_token_expires_in * 1_000) : null, scopes: tokens.scope?.split(' ').filter(Boolean) ?? authorizationScopes },
    update: { encryptedAccessToken: encrypt(tokens.access_token), accessTokenExpiresAt: new Date(now + tokens.expires_in * 1_000), encryptedRefreshToken: encrypt(tokens.refresh_token), refreshTokenExpiresAt: tokens.refresh_token_expires_in ? new Date(now + tokens.refresh_token_expires_in * 1_000) : null, scopes: tokens.scope?.split(' ').filter(Boolean) ?? authorizationScopes },
  })
}

export function getFeishuAuthorizationUrl() {
  const appId = requiredEnv('FEISHU_APP_ID')
  const redirectUri = requiredEnv('FEISHU_OAUTH_REDIRECT_URI')
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: 'code', scope: authorizationScopes.join(' '), state: createState() })
  return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${params}`
}

export const feishuOAuthScopes = authorizationScopes

export async function completeFeishuAuthorization(code: string, state: string | undefined) {
  validateState(state)
  const tokens = await requestToken({ grant_type: 'authorization_code', client_id: requiredEnv('FEISHU_APP_ID'), client_secret: requiredEnv('FEISHU_APP_SECRET'), code, redirect_uri: requiredEnv('FEISHU_OAUTH_REDIRECT_URI') })
  await persistTokens(tokens)
}

export async function getFeishuConnectionStatus() {
  const user = await getLocalUser()
  const connection = await prisma.feishuConnection.findUnique({ where: { userId: user.id }, select: { accessTokenExpiresAt: true, scopes: true } })
  return { connected: Boolean(connection), expiresAt: connection?.accessTokenExpiresAt ?? null, scopes: connection?.scopes ?? [] }
}

export async function disconnectFeishu() {
  const user = await getLocalUser()
  await prisma.feishuConnection.deleteMany({ where: { userId: user.id } })
  return { disconnected: true }
}

export async function getFeishuUserAccessToken() {
  const user = await getLocalUser()
  const connection = await prisma.feishuConnection.findUnique({ where: { userId: user.id } })
  if (!connection) throw new FeishuOAuthError('请先连接你的飞书账号，然后再同步岗位。', 'FEISHU_NOT_CONNECTED')
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return decrypt(connection.encryptedAccessToken)
  if (connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt.getTime() <= Date.now()) throw new FeishuOAuthError('飞书授权已过期，请重新连接账号。', 'FEISHU_REAUTH_REQUIRED')
  try {
    const tokens = await requestToken({ grant_type: 'refresh_token', client_id: requiredEnv('FEISHU_APP_ID'), client_secret: requiredEnv('FEISHU_APP_SECRET'), refresh_token: decrypt(connection.encryptedRefreshToken) })
    await persistTokens(tokens)
    return tokens.access_token
  }
  catch (error) {
    if (error instanceof FeishuOAuthError) throw new FeishuOAuthError('飞书授权已失效，请重新连接账号。', 'FEISHU_REAUTH_REQUIRED')
    throw error
  }
}
