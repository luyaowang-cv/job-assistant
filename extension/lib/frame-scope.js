/**
 * A page can host its application form inside an iframe, and every frame
 * numbers its own controls from zero — each one has its own `form-field-0`. Field
 * ids are therefore namespaced with the frame that owns them, and split apart
 * again when a write has to travel back to that frame.
 *
 * Keeping this a pure module matters: a mistake here does not throw, it
 * silently sends a value to the wrong frame or drops it entirely.
 */

const SEPARATOR = '::'

export function qualifyFieldId(frameId, fieldId) {
  return `${frameId}${SEPARATOR}${fieldId}`
}

/** The owning frame id, or `null` for an id that was never namespaced. */
export function frameOf(fieldId) {
  const value = String(fieldId ?? '')
  const separator = value.indexOf(SEPARATOR)
  return separator < 0 ? null : Number(value.slice(0, separator))
}

/** Strips the namespace, leaving the id the page-side writer knows. */
export function localFieldId(fieldId) {
  const value = String(fieldId ?? '')
  const separator = value.indexOf(SEPARATOR)
  return separator < 0 ? value : value.slice(separator + SEPARATOR.length)
}

/** True for the ids that `applyChoiceEntries`, not `applyFillEntries`, owns. */
export function isChoiceField(fieldId) {
  return /^(?:radio-group|custom-select)-/.test(localFieldId(fieldId))
}

/**
 * How many frames were declared by the page but never answered.
 *
 * Every reachable frame reports how many frames it embeds. All of them answered
 * when `reachedFrames === 1 + declaredChildren`, because the top frame is
 * counted in `reachedFrames` but not among any frame's children. A frame skipped
 * for permission never gets to report its own children either, so the shortfall
 * undercounts grandchildren while still naming the frames that were missed.
 */
export function countUnreachedFrames(reachedFrames, declaredChildren) {
  return Math.max(0, declaredChildren - (reachedFrames - 1))
}

/**
 * Groups entries and unresolved ids by the frame they belong to, rewriting each
 * id to its local form. Returns `null` for an id with no namespace, which means
 * it never came from a scan.
 */
export function groupByFrame(entries, unresolvedIds) {
  const perFrame = new Map()
  const bucketFor = (fieldId) => {
    const frameId = frameOf(fieldId)
    if (frameId === null || !Number.isInteger(frameId)) return null
    const existing = perFrame.get(frameId) ?? { entries: [], unresolvedIds: [] }
    perFrame.set(frameId, existing)
    return existing
  }
  for (const entry of entries ?? []) {
    bucketFor(entry.fieldId)?.entries.push({ ...entry, fieldId: localFieldId(entry.fieldId) })
  }
  for (const fieldId of unresolvedIds ?? []) {
    bucketFor(fieldId)?.unresolvedIds.push(localFieldId(fieldId))
  }
  return perFrame
}
