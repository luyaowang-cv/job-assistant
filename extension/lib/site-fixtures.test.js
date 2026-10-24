import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildFillPlan } from './form-fill-rules.js'

const here = dirname(fileURLToPath(import.meta.url))
const dumpsDir = join(here, '../../docs/diagnosis-scripts/dumps')

/**
 * Every site we have adapted, replayed from the page structure it was adapted on.
 *
 * The point is not that the rules produce "a" answer for these pages, but that they
 * produce *the* answer each entry records. Expectations are written by hand from
 * what the page means, never captured from the current output — otherwise the file
 * would only prove that today's behaviour is today's behaviour.
 */
const fixtures = readdirSync(dumpsDir)
  .filter(name => name.endsWith('.expect.json'))
  .map(name => ({ name, ...JSON.parse(readFileSync(join(dumpsDir, name), 'utf8')) }))

test('至少有一份站点夹具', () => {
  assert.ok(fixtures.length > 0, '没有任何 *.expect.json，站点适配就没有回归保护')
})

for (const fixture of fixtures) {
  test(`F-056 站点夹具：${fixture.site}`, () => {
    const dump = JSON.parse(readFileSync(join(dumpsDir, fixture.dump), 'utf8'))
    const profile = JSON.parse(readFileSync(join(dumpsDir, fixture.profile), 'utf8'))
    const plan = buildFillPlan(profile, dump.fields)
    const byId = new Map(plan.entries.map(entry => [entry.fieldId, entry]))
    const dumpIds = new Set(dump.fields.map(field => field.id))

    for (const expectation of fixture.expect) {
      assert.ok(dumpIds.has(expectation.id), `${fixture.name}: dump 里没有 ${expectation.id}，期望写错了`)
      const entry = byId.get(expectation.id)
      assert.ok(entry, `${fixture.name}: ${expectation.id} 没有产出条目`)
      if (expectation.status) {
        assert.equal(entry.status, expectation.status, `${expectation.why ?? expectation.id}：期望 ${expectation.status}，实际 ${entry.status}（${entry.reason}）`)
      }
      if (expectation.key) {
        assert.equal(entry.target, expectation.key, `${expectation.id}：期望栏目 ${expectation.key}，实际 ${entry.target ?? '无'}（${entry.reason}）`)
      }
      if (expectation.value !== undefined) {
        assert.equal(entry.value, expectation.value, `${expectation.id}：期望值 ${expectation.value}，实际 ${entry.value}`)
      }
    }
  })
}
