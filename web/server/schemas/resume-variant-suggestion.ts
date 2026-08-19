import { z } from 'zod'

export const variantSuggestionPreviewSchema = z.object({
  applicationId: z.string().trim().min(1).max(64),
  references: z.array(z.object({ cardId: z.string().trim().min(1).max(64), variantId: z.string().trim().min(1).max(64) }).strict()).min(1).max(20),
}).strict()

export const modelVariantSuggestionsSchema = z.object({ suggestions: z.array(z.object({
  cardId: z.string().min(1).max(64), content: z.string().trim().min(1).max(8000),
  evidence: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  warnings: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
}).strict()).min(1).max(20) }).strict()

export const variantSuggestionConfirmSchema = z.object({
  previewToken: z.string().min(20).max(100_000), selectedSuggestionIds: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  idempotencyKey: z.string().trim().min(8).max(120),
}).strict()

export type VariantSuggestionPreviewInput = z.infer<typeof variantSuggestionPreviewSchema>
