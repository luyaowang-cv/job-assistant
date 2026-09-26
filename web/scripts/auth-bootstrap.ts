import 'dotenv/config'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

import { prisma } from '../server/lib/prisma'

const LOCAL_EMAIL = 'local@job-assistant.local'

// 一次性命令：创建所有者账号，并把旧 local user 名下的数据整体迁移到新账号，再删除 local user。
// 运行前请先 `pg_dump` 备份数据库；重复运行幂等（找不到 local user 时直接跳过迁移）。
async function main() {
  const email = process.env.OWNER_EMAIL?.trim()
  const password = process.env.OWNER_PASSWORD
  if (!email || !password) {
    throw new Error('请先设置 OWNER_EMAIL 与 OWNER_PASSWORD 环境变量。')
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('请先设置 BETTER_AUTH_SECRET 环境变量。')
  }

  // 独立实例允许注册（运行中的服务仍禁用公开注册）。
  const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true },
    user: { fields: { name: 'displayName' } },
    secret: process.env.BETTER_AUTH_SECRET,
  })

  const existing = await prisma.user.findUnique({ where: { email } })
  const ownerId = existing?.id
    ?? (await auth.api.signUpEmail({ body: { email, password, name: '本地用户' } })).user.id
  console.log(`所有者账号就绪：${email} (id=${ownerId})`)

  const local = await prisma.user.findUnique({ where: { email: LOCAL_EMAIL } })
  if (!local) {
    console.log('未找到 local user，无需迁移。')
    await prisma.$disconnect()
    return
  }
  if (local.id === ownerId) {
    console.log('local user 与所有者账号相同，无需迁移。')
    await prisma.$disconnect()
    return
  }

  const moved = await prisma.$transaction(async (tx) => {
    const move = async (name: string, delegate: { updateMany: (args: { where: { userId: string }, data: { userId: string } }) => Promise<{ count: number }> }) => {
      const { count } = await delegate.updateMany({ where: { userId: local.id }, data: { userId: ownerId } })
      return [name, count] as const
    }

    const counts = Object.fromEntries(await Promise.all([
      move('application', tx.application),
      move('agentRun', tx.agentRun),
      move('applicationMaterial', tx.applicationMaterial),
      move('jobPreference', tx.jobPreference),
      move('resume', tx.resume),
      move('applicationProfile', tx.applicationProfile),
      move('personalProfile', tx.personalProfile),
      move('aiProviderSetting', tx.aiProviderSetting),
      move('feishuConnection', tx.feishuConnection),
      move('feishuJobSyncSource', tx.feishuJobSyncSource),
      move('materialCard', tx.materialCard),
      move('documentMutationEvent', tx.documentMutationEvent),
      move('interviewPrepDocument', tx.interviewPrepDocument),
      move('interviewRecord', tx.interviewRecord),
      move('careerAgentConversation', tx.careerAgentConversation),
    ]))

    await tx.user.delete({ where: { id: local.id } })
    return counts
  })

  console.log('数据迁移完成，已删除 local user：')
  console.log(JSON.stringify(moved, null, 2))
  await prisma.$disconnect()
}

main().catch(async (error: unknown) => {
  console.error('auth:bootstrap 失败：', error)
  await prisma.$disconnect()
  process.exit(1)
})
