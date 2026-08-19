import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../server/generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the local user.')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'local@job-assistant.local' },
    update: { displayName: '本地用户' },
    create: {
      email: 'local@job-assistant.local',
      displayName: '本地用户',
    },
  })

  await prisma.jobPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      targetRoles: ['前端工程师', 'AI 前端工程师'],
      targetCities: ['北京'],
      companyTypes: [],
      technicalFocus: ['Vue', 'TypeScript', 'Agent'],
    },
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect()
    throw error
  })
