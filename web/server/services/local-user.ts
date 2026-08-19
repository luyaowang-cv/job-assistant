import { prisma } from '../lib/prisma'

export const LOCAL_USER_EMAIL = 'local@job-assistant.local'

export async function getLocalUser() {
  return prisma.user.upsert({
    where: { email: LOCAL_USER_EMAIL },
    update: { displayName: '本地用户' },
    create: {
      email: LOCAL_USER_EMAIL,
      displayName: '本地用户',
    },
  })
}
