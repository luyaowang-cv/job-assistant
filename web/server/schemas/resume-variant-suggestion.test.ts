import assert from 'node:assert/strict'
import test from 'node:test'
import { variantSuggestionConfirmSchema, variantSuggestionPreviewSchema } from './resume-variant-suggestion'

test('validates explicit card references and strict confirmation', () => {
  assert.equal(variantSuggestionPreviewSchema.safeParse({ applicationId: 'app-1', references: [{ cardId: 'card-1', variantId: 'variant-1' }] }).success, true)
  assert.equal(variantSuggestionPreviewSchema.safeParse({ applicationId: 'app-1', references: [], userId: 'forbidden' }).success, false)
  assert.equal(variantSuggestionConfirmSchema.safeParse({ previewToken: 'x'.repeat(20), selectedSuggestionIds: ['card-1:0'], idempotencyKey: 'request-123' }).success, true)
})
