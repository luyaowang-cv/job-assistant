/**
 * Answers the applicant has already given, kept so the next form does not ask.
 *
 * The questions worth remembering are the ones the profile cannot answer:
 * “是否服从调剂”, “招聘信息来源”, “个人年薪期望值”. They are not facts about the
 * applicant so much as decisions she makes once and holds, and every company's
 * form asks them again.
 *
 * Three rules keep this from becoming a place where wrong answers accumulate:
 *
 * - An entry exists only because a person put it there. Nothing the model guessed
 *   is ever remembered, so a bad guess cannot become a permanent one.
 * - A question the profile can already answer is never remembered. Those fields
 *   are filled from saved facts on every form, and caching them would only add a
 *   second, staler source of truth.
 * - How far an answer travels depends on what kind of answer it is. “否” to “是否
 *   有亲属在本公司工作” means one employer; a narrative answer (“为什么选择我们
 *   公司”) is written for one employer. Both are kept for that host alone. A
 *   preference such as a source channel or a salary figure travels everywhere.
 */

import { fieldKind, isBinaryQuestion, questionOf } from './field-shape.js'

export const MEMORY_VERSION = 1

/** Enough for every recurring question a person will ever meet, and bounded. */
export const MAX_ENTRIES = 400

/** The longest answer worth remembering: a paragraph, not an essay. */
const MAX_VALUE_LENGTH = 2_000

/** Kinds whose answer is written for one employer rather than for the person. */
const NARRATIVE_KINDS = new Set(['longtext'])

/** Hosts are compared without the `www.` an applicant never types. */
function hostKey(host) {
  return String(host ?? '').toLowerCase().replace(/^www\./, '')
}

/**
 * How far an answer is allowed to travel: `host` for the ones that mean something
 * only to the employer that asked, `global` for a preference of the applicant's.
 */
export function scopeOf(field) {
  if (isBinaryQuestion(field)) return 'host'
  if (NARRATIVE_KINDS.has(fieldKind(field))) return 'host'
  return 'global'
}

/** The storage key. `host` is empty for an answer that travels everywhere. */
export function answerKey(field, host = '') {
  const question = questionOf(field)
  if (!question) return ''
  const scope = scopeOf(field)
  return `${fieldKind(field)}|${scope === 'host' ? hostKey(host) : ''}|${question}`
}

/** A stored entry plus the key it lives under, which is what the UI acts on. */
function entryView({ key, value, label, host, scope, updatedAt, uses }) {
  return { key, value, label, host, scope, updatedAt, uses }
}

/** Reads whatever is in storage into a shape the rest of this module trusts. */
export function readMemory(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const entries = Array.isArray(source.entries) ? source.entries : []
  const kept = entries
    .map((candidate) => {
      const key = String(candidate?.key ?? '')
      const value = String(candidate?.value ?? '').slice(0, MAX_VALUE_LENGTH)
      if (!key || !value) return null
      return {
        key,
        value,
        label: String(candidate?.label ?? ''),
        host: String(candidate?.host ?? ''),
        scope: candidate?.scope === 'host' ? 'host' : 'global',
        updatedAt: String(candidate?.updatedAt ?? ''),
        uses: Number.isInteger(candidate?.uses) ? candidate.uses : 0,
      }
    })
    .filter(Boolean)
    .slice(0, MAX_ENTRIES)
  return { version: MEMORY_VERSION, entries: kept }
}

/**
 * Adds or refreshes one answer. Re-answering a question overwrites it rather than
 * adding a second entry, and the least recently answered entry is dropped once
 * the cap is reached.
 */
export function rememberAnswer(memory, field, value, options = {}) {
  const answer = String(value ?? '').trim().slice(0, MAX_VALUE_LENGTH)
  if (!answer) return readMemory(memory)
  const host = String(options.host ?? '')
  const key = answerKey(field, host)
  if (!key) return readMemory(memory)
  const scope = scopeOf(field)
  const store = readMemory(memory)
  const entry = {
    key,
    value: answer,
    label: String(field?.label ?? field?.placeholder ?? field?.name ?? '').slice(0, 120),
    host: scope === 'host' ? hostKey(host) : '',
    scope,
    updatedAt: options.now ?? new Date().toISOString(),
    uses: 0,
  }
  const kept = store.entries.filter(candidate => candidate.key !== key)
  kept.push(entry)
  // Oldest first goes first: dropping by recency keeps the questions a person
  // actually keeps meeting.
  kept.sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)))
  return { version: MEMORY_VERSION, entries: kept.slice(-MAX_ENTRIES) }
}

/**
 * The answer stored for a field, or `null`.
 *
 * `answerKey` carries the scope, so this is one lookup: a host-scoped question is
 * only ever answered from that host, and a global one from whichever host it was
 * first answered on.
 */
export function lookupAnswer(memory, field, host = '') {
  const key = answerKey(field, host)
  if (!key) return null
  const hit = readMemory(memory).entries.find(candidate => candidate.key === key)
  return hit ? entryView(hit) : null
}

/** Counts one use, so the cap drops what is never met again. */
export function touchAnswer(memory, key, now = new Date().toISOString()) {
  const store = readMemory(memory)
  return {
    version: MEMORY_VERSION,
    entries: store.entries.map(entry => (entry.key === key
      ? { ...entry, uses: entry.uses + 1, updatedAt: now }
      : entry)),
  }
}

export function forgetAnswer(memory, key) {
  const store = readMemory(memory)
  return { version: MEMORY_VERSION, entries: store.entries.filter(entry => entry.key !== key) }
}

export function clearMemory() {
  return { version: MEMORY_VERSION, entries: [] }
}

/** Newest first, which is the order a person recognises their own answers in. */
export function listAnswers(memory) {
  return readMemory(memory).entries
    .slice()
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .map(entryView)
}
