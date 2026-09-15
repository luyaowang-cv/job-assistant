import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM 加密（与飞书 OAuth 令牌加密算法一致）。key 为 32 字节 Buffer。
export function encrypt(value: string, key: Buffer) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

export function decrypt(value: string, key: Buffer) {
  const payload = Buffer.from(value, 'base64url')
  const iv = payload.subarray(0, 12)
  const authTag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
