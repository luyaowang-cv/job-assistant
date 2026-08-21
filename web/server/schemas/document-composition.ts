import { z } from 'zod'

export const fieldVisibilitySchema = z.record(z.string().min(1).max(120), z.boolean()).default({})
export const renderRulesSchema = z.object({
  compact: z.boolean().default(false),
  hideTechnicalDetails: z.boolean().default(false),
}).strict().default({ compact: false, hideTechnicalDetails: false })

export const resumeLayoutConfigSchema = z.object({
  verticalMarginMm: z.number().min(6).max(16).default(8),
  paragraphGapMm: z.number().min(0).max(1.5).default(0.4),
  sectionGapMm: z.number().min(1).max(6).default(2.4),
}).strict()

const documentConfigSchema = z.object({
  templateId: z.string().trim().min(1).max(80).optional(),
  layout: resumeLayoutConfigSchema.optional(),
}).catchall(z.unknown()).default({})

export const documentReferenceInputSchema = z.object({
  cardId: z.string().trim().min(1).max(64),
  variantId: z.string().trim().min(1).max(64),
  section: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().min(1).max(120).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999),
  visible: z.boolean().default(true),
  renderRules: renderRulesSchema,
}).strict()

export const compositionInputSchema = z.object({
  fieldVisibility: fieldVisibilitySchema,
  config: documentConfigSchema,
  references: z.array(documentReferenceInputSchema).max(100).default([]),
}).strict().superRefine((value, context) => {
  const keys = new Set<string>()
  for (const reference of value.references) {
    const key = `${reference.section}:${reference.sortOrder}`
    if (keys.has(key)) context.addIssue({ code: 'custom', message: 'Duplicate section sort order.', path: ['references'] })
    keys.add(key)
  }
})

export const createComposedResumeVersionSchema = z.object({
  composition: compositionInputSchema,
  name: z.string().trim().min(1).max(80),
}).strict()

export const profileFieldSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  text: z.string().max(20_000).default(''),
  limit: z.number().int().min(0).max(100_000).nullable().default(null),
  referenceId: z.string().trim().min(1).max(64).nullable().optional(),
}).strict()

export const profileBlockSchema = z.object({
  key: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  fields: z.array(profileFieldSchema).max(100).default([]),
}).strict()

export const createApplicationProfileVersionSchema = z.object({
  blocks: z.array(profileBlockSchema).max(30).default([]),
  composition: compositionInputSchema,
}).strict()

export const routeDocumentIdsSchema = z.object({
  id: z.string().trim().min(1).max(64),
  versionId: z.string().trim().min(1).max(64).optional(),
}).strict()

export const impactPreviewSchema = z.object({
  mode: z.enum(['SYNC', 'APPEND']).default('SYNC'),
  targetTags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
}).strict()

export const documentSyncSchema = z.object({
  previewToken: z.string().min(20).max(20_000),
  idempotencyKey: z.string().trim().min(8).max(120),
  targetIds: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
}).strict()

export const migrationConfirmSchema = z.object({
  sourceKeys: z.array(z.string().trim().min(1).max(200)).max(100),
}).strict()

export type CompositionInput = z.infer<typeof compositionInputSchema>
export type CreateApplicationProfileVersionInput = z.infer<typeof createApplicationProfileVersionSchema>
