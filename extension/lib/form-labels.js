/**
 * What a piece of page text has to be before it can name a form control.
 *
 * These are pure predicates on strings, because the same question is asked in
 * two places that cannot share an import:
 *
 * - `form-fill-rules.js` asks it about the report's display name.
 * - `form-page-bridge.js` asks it inside the page, where `chrome.scripting`
 *   serializes the function's own source and module-scope references would be
 *   lost. It therefore carries a copy of these three patterns, and
 *   `form-labels.test.js` asserts the copies are the literals defined here.
 *
 * Everything is anchored: a label is rejected for being *exactly* a unit
 * character or an empty-state phrase, never for merely containing one. “请输入
 * 学校全称” is a real prompt; “请选择” is not a name.
 */

/** Wording a page shows where an answer has not been chosen yet. */
export const EMPTY_STATE_PATTERN = /^(?:请选择|请选取|请先选择|请填写|请输入|未选择|暂无选项|暂无数据|暂无内容|暂无|无数据|无选项|无内容|[-—–/]{1,})$/

/**
 * A bare number. Years, months and country codes are shown *inside* controls,
 * so a control whose entire visible name is `2024` or `+86` was named after its
 * own value, not after the column it belongs to.
 */
export const VALUE_LIKE_PATTERN = /^[+-]?\d+(?:[.\-/]\d+)*$/

/**
 * Unit characters and range separators. A split date control sits next to “年”
 * or “至”; matched as a name those give the model a box it can only fill by
 * inventing something.
 */
export const UNIT_OR_SEPARATOR_PATTERN = /^(?:年|月|日|号|至|到|起|止|年月|年月日|[~～—–\-/\\、,，.。:：*·・]+)$/

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function isEmptyStateText(value) {
  const text = normalizeText(value)
  return Boolean(text) && EMPTY_STATE_PATTERN.test(text)
}

export function isValueLikeLabel(value) {
  const text = normalizeText(value)
  return Boolean(text) && VALUE_LIKE_PATTERN.test(text)
}

export function isUnitOrSeparator(value) {
  const text = normalizeText(value)
  return Boolean(text) && UNIT_OR_SEPARATOR_PATTERN.test(text)
}

/** True for text that names no column: a unit character, a bare value, “请选择”. */
export function isUselessLabel(value) {
  const text = normalizeText(value)
  // Nothing at all names nothing. The page-side copy treats text that only
  // reduces to whitespace the same way, and the two must agree.
  if (!text) return true
  return isUnitOrSeparator(text) || isValueLikeLabel(text) || isEmptyStateText(text)
}
