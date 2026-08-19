import type { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { PersonalProfileInput } from '../schemas/personal-profile'
import { getLocalUser } from './local-user'

const publicSelect = { id: true, basics: true, educations: true, photoMimeType: true, photoUpdatedAt: true } satisfies Prisma.PersonalProfileSelect
const asJson = (value: unknown) => value as Prisma.InputJsonValue

export async function getPersonalProfile() {
  const user = await getLocalUser()
  return prisma.personalProfile.findUnique({ where: { userId: user.id }, select: publicSelect })
}

export async function getPersonalProfilePhoto() {
  const user = await getLocalUser()
  return prisma.personalProfile.findUnique({ where: { userId: user.id }, select: { photoMimeType: true, photoData: true, photoUpdatedAt: true } })
}

export async function savePersonalProfilePhoto(mimeType: string, data: Uint8Array) {
  const user = await getLocalUser()
  const photoData: Uint8Array<ArrayBuffer> = new Uint8Array(data.byteLength)
  photoData.set(data)
  return prisma.personalProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, photoMimeType: mimeType, photoData, photoUpdatedAt: new Date() }, update: { photoMimeType: mimeType, photoData, photoUpdatedAt: new Date() }, select: publicSelect })
}

export async function deletePersonalProfilePhoto() {
  const user = await getLocalUser()
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!profile) return null
  return prisma.personalProfile.update({ where: { id: profile.id }, data: { photoMimeType: null, photoData: null, photoUpdatedAt: null }, select: publicSelect })
}

export async function savePersonalProfile(input: PersonalProfileInput) {
  const user = await getLocalUser()
  return prisma.personalProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, basics: asJson(input.basics), educations: asJson(input.educations) },
    update: { basics: asJson(input.basics), educations: asJson(input.educations) },
    select: publicSelect,
  })
}
