import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBitableRecordSearchBody, nextFeishuAutoSyncAt, shouldReconcileOffline, shouldRunMissedFeishuAutoSync } from './job-library-sync'

test('builds a full-table Bitable search body without a last-modified filter', () => {
  assert.deepEqual(buildBitableRecordSearchBody(), { automatic_fields: true })
})

test('only a full source reconciliation can mark unseen jobs offline', () => {
  assert.equal(shouldReconcileOffline('FULL'), true)
  assert.equal(shouldReconcileOffline('INCREMENTAL'), false)
})

test('schedules at 08:00 Asia/Shanghai and catches up one missed daily run', () => {
  const beforeEight = new Date('2026-08-26T23:59:00.000Z')
  const afterEight = new Date('2026-08-27T00:01:00.000Z')
  assert.equal(nextFeishuAutoSyncAt(beforeEight).toISOString(), '2026-08-27T00:00:00.000Z')
  assert.equal(nextFeishuAutoSyncAt(afterEight).toISOString(), '2026-08-28T00:00:00.000Z')
  assert.equal(shouldRunMissedFeishuAutoSync(afterEight, new Date('2026-08-26T00:00:00.000Z')), true)
  assert.equal(shouldRunMissedFeishuAutoSync(afterEight, new Date('2026-08-27T00:00:00.000Z')), false)
  assert.equal(shouldRunMissedFeishuAutoSync(beforeEight, null), false)
})
