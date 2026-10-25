import type { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { PersonalProfileInput } from '../schemas/personal-profile'
import { getCurrentUser } from './current-user'

// ⚠️ 加字段时这里也要跟着加：select 没列出来的列，写进去了也读不回来，
// 表现是"保存成功、刷新后没了"，排查时很容易往保存逻辑上怀疑。
const publicSelect = { id: true, basics: true, educations: true, familyMembers: true, photoMimeType: true, photoUpdatedAt: true } satisfies Prisma.PersonalProfileSelect
const asJson = (value: unknown) => value as Prisma.InputJsonValue

export async function getPersonalProfile() {
  const user = await getCurrentUser()
  return prisma.personalProfile.findUnique({ where: { userId: user.id }, select: publicSelect })
}

export async function getPersonalProfilePhoto() {
  const user = await getCurrentUser()
  return prisma.personalProfile.findUnique({ where: { userId: user.id }, select: { photoMimeType: true, photoData: true, photoUpdatedAt: true } })
}

export async function savePersonalProfilePhoto(mimeType: string, data: Uint8Array) {
  const user = await getCurrentUser()
  const photoData: Uint8Array<ArrayBuffer> = new Uint8Array(data.byteLength)
  photoData.set(data)
  return prisma.personalProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, photoMimeType: mimeType, photoData, photoUpdatedAt: new Date() }, update: { photoMimeType: mimeType, photoData, photoUpdatedAt: new Date() }, select: publicSelect })
}

export async function deletePersonalProfilePhoto() {
  const user = await getCurrentUser()
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!profile) return null
  return prisma.personalProfile.update({ where: { id: profile.id }, data: { photoMimeType: null, photoData: null, photoUpdatedAt: null }, select: publicSelect })
}

export async function savePersonalProfile(input: PersonalProfileInput) {
  const user = await getCurrentUser()
  // 可选字段：传了才写、没传就别动。
  // 写成 `educations: asJson(input.educations)` 的话，undefined 会被当成一个值写进去，
  // 把库里的历史数据清掉——只有 basics 是每次都会整体覆盖的（它是页面的主表单）。
  const optionalFields = {
    ...(input.educations === undefined ? {} : { educations: asJson(input.educations) }),
    ...(input.familyMembers === undefined ? {} : { familyMembers: asJson(input.familyMembers) }),
  }
  return prisma.personalProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, basics: asJson(input.basics), ...optionalFields },
    update: { basics: asJson(input.basics), ...optionalFields },
    select: publicSelect,
  })
}
