import assert from 'node:assert/strict'
import test from 'node:test'

import { listApplicationsQuerySchema } from './application'

test('keeps paginated list defaults and accepts the full kanban view', () => {
  assert.deepEqual(listApplicationsQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
    updatedSort: 'desc',
    view: 'list',
  })

  assert.deepEqual(listApplicationsQuerySchema.parse({ page: '4', pageSize: '20', view: 'kanban' }), {
    page: 4,
    pageSize: 20,
    updatedSort: 'desc',
    view: 'kanban',
  })
})

test('rejects unknown application list views while preserving page-size bounds', () => {
  assert.equal(listApplicationsQuerySchema.safeParse({ view: 'board' }).success, false)
  assert.equal(listApplicationsQuerySchema.safeParse({ pageSize: 101 }).success, false)
})
