import { DocumentMutationType } from '../generated/prisma/client'
import type { MaterialCardType, Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { CreateMaterialCardInput, MaterialCardListQuery, UpdateMaterialCardInput } from '../schemas/material-card'
import { getLocalUser } from './local-user'

const cardInclude = { variants: { orderBy: { createdAt: 'desc' as const } } }
const json = (value: unknown) => value as Prisma.InputJsonValue

export async function listMaterialCards(query: MaterialCardListQuery) {
  const user = await getLocalUser()
  const where: Prisma.MaterialCardWhereInput = {
    userId: user.id,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.type ? { type: query.type as MaterialCardType } : {}),
    ...(query.tags.length ? { tags: { hasEvery: query.tags } } : {}),
    ...(query.search ? {
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { variants: { some: { content: { contains: query.search, mode: 'insensitive' } } } },
      ],
    } : {}),
  }
  const [items, total] = await prisma.$transaction([
    prisma.materialCard.findMany({ where, include: cardInclude, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.materialCard.count({ where }),
  ])
  return { items, total, page: query.page, pageSize: query.pageSize }
}

export async function getMaterialCard(cardId: string, includeArchived = true) {
  const user = await getLocalUser()
  return prisma.materialCard.findFirst({ where: { id: cardId, userId: user.id, ...(includeArchived ? {} : { archivedAt: null }) }, include: cardInclude })
}

export async function createMaterialCard(input: CreateMaterialCardInput, legacySourceKey?: string) {
  const user = await getLocalUser()
  return prisma.$transaction(async (tx) => {
    const card = await tx.materialCard.create({
      data: {
        userId: user.id, type: input.type as MaterialCardType, title: input.title, tags: input.tags,
        facts: json(input.facts), legacySourceKey,
        variants: { create: { name: input.variant.name, content: input.variant.content } },
      },
      include: cardInclude,
    })
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: legacySourceKey ? DocumentMutationType.MATERIAL_MIGRATED : DocumentMutationType.MATERIAL_CREATED,
      entityType: 'MaterialCard', entityId: card.id, source: legacySourceKey ? 'LEGACY_MIGRATION' : 'USER',
      payload: json({ type: card.type, title: card.title, legacySourceKey }),
    } })
    return { card, eventId: event.id }
  })
}

export async function updateMaterialCard(cardId: string, input: UpdateMaterialCardInput) {
  const user = await getLocalUser()
  const existing = await prisma.materialCard.findFirst({ where: { id: cardId, userId: user.id, archivedAt: null } })
  if (!existing) return null
  return prisma.$transaction(async (tx) => {
    const card = await tx.materialCard.update({ where: { id: cardId }, data: {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.tags === undefined ? {} : { tags: input.tags }),
      ...(input.facts === undefined ? {} : { facts: json(input.facts) }),
    }, include: cardInclude })
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.MATERIAL_UPDATED, entityType: 'MaterialCard', entityId: card.id,
      payload: json({ fields: Object.keys(input) }),
    } })
    return { card, eventId: event.id }
  })
}

export async function addMaterialVariant(cardId: string, input: { name: string, content: string }) {
  const user = await getLocalUser()
  const card = await prisma.materialCard.findFirst({ where: { id: cardId, userId: user.id, archivedAt: null } })
  if (!card) return null
  return prisma.$transaction(async (tx) => {
    const variant = await tx.materialCardVariant.create({ data: { cardId, name: input.name, content: input.content } })
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.MATERIAL_VARIANT_CREATED, entityType: 'MaterialCardVariant', entityId: variant.id,
      payload: json({ cardId, name: variant.name }),
    } })
    return { variant, eventId: event.id }
  })
}

export async function archiveMaterialCard(cardId: string) {
  const user = await getLocalUser()
  const card = await prisma.materialCard.findFirst({ where: { id: cardId, userId: user.id, archivedAt: null } })
  if (!card) return null
  return prisma.$transaction(async (tx) => {
    const archived = await tx.materialCard.update({ where: { id: cardId }, data: { archivedAt: new Date() }, include: cardInclude })
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.MATERIAL_ARCHIVED, entityType: 'MaterialCard', entityId: cardId,
    } })
    return { card: archived, eventId: event.id }
  })
}

export async function deleteMaterialCard(cardId: string) {
  const user = await getLocalUser()
  const card = await prisma.materialCard.findFirst({ where: { id: cardId, userId: user.id }, select: { id: true, title: true } })
  if (!card) return null
  return prisma.$transaction(async (tx) => {
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.MATERIAL_DELETED, entityType: 'MaterialCard', entityId: cardId,
      payload: json({ title: card.title }),
    } })
    await tx.documentCardReference.deleteMany({ where: { cardId } })
    await tx.materialCardVariant.deleteMany({ where: { cardId } })
    const deleted = await tx.materialCard.delete({ where: { id: cardId } })
    return { card: deleted, eventId: event.id }
  })
}