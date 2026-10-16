import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApplicationFromJobSeed } from './job-library-decision'

test('marks the job-library conversion as submitted today', () => {
  const now = new Date('2026-10-15T02:30:00.000Z')
  assert.deepEqual(buildApplicationFromJobSeed('APPLIED', now), { channel: 'OTHER', appliedAt: now })
})

test('a saved-only conversion keeps the applied date empty', () => {
  const now = new Date('2026-10-15T02:30:00.000Z')
  assert.deepEqual(buildApplicationFromJobSeed('SAVED', now), { channel: 'OTHER', appliedAt: null })
})
