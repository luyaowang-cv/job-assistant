/**
 * What shape a form control is, and what question it asks.
 *
 * Two callers need the same answer to those questions and must not disagree:
 * the rule table decides whether a 是/否 question may be handed to a model at all,
 * and the answer memory decides how far an answer to it is allowed to travel. A
 * second copy of this logic is how a “是” ends up in a text box.
 */

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_./\\:：,，、;；()（）[\]【】{}<>《》?？*#"']+/g, '')
}

/**
 * Which bucket a control's answer belongs to, so that a “是” chosen for a radio
 * group is never handed to a text box, and a paragraph is never handed to a
 * one-line field.
 */
export function fieldKind(field) {
  const controlType = String(field?.controlType ?? '').toLowerCase()
  const inputType = String(field?.inputType ?? '').toLowerCase()
  if (controlType === 'textarea' || inputType === 'textarea' || inputType === 'contenteditable') return 'longtext'
  if (controlType === 'select' || controlType === 'custom-select' || controlType === 'radio-group') return 'choice'
  return 'text'
}

/**
 * The question a control asks: what is being asked, with the page's decoration
 * removed. The control's shape is deliberately not part of it — that is the kind —
 * so the same question asked by a dropdown on one form and a text box on the next
 * is still one question.
 */
export function questionOf(field) {
  for (const candidate of [field?.label, field?.name, field?.placeholder]) {
    const question = normalize(candidate)
    if (question) return question
  }
  return ''
}

/** Only “是/否”-shaped questions: the answers whose meaning depends on the asker. */
const BINARY_OPTION_PATTERN = /^(?:是|否|有|无|对|错|同意的?|不同意的?|yes|no|y|n|true|false)$/i

/**
 * Whether the answer can only be yes or no.
 *
 * These are the questions a model must never answer by guessing: the page asks
 * about the employer's own records (“是否有亲属在本公司工作”), so the profile says
 * nothing about them, and a coin flip is indistinguishable from an answer.
 */
export function isBinaryQuestion(field) {
  const options = (Array.isArray(field?.options) ? field.options : [])
    .map(option => normalize(option))
    .filter(Boolean)
  if (options.length === 2) return options.every(option => BINARY_OPTION_PATTERN.test(option))
  return String(field?.inputType ?? '').toLowerCase() === 'checkbox'
}

/** A checkbox that means “this experience has not ended yet”. */
const PRESENT_TOGGLE_PATTERN = /^(?:至今|现在|目前|直至|至今为止|至今仍在|在职|仍在职)$/

/**
 * Whether a control is the “至今” half of a date range rather than a question.
 *
 * 北森 renders “开始时间 / 结束时间 / □至今”, and that box is not asking anything:
 * it is checked exactly when the record has no end date, which is a fact the
 * profile already holds. Treating it as a yes/no question would have it flagged as
 * unanswerable — and, worse, answered by a coin flip.
 */
export function isPresentToggle(field) {
  if (String(field?.inputType ?? '').toLowerCase() !== 'checkbox') return false
  return PRESENT_TOGGLE_PATTERN.test(normalize(field?.label ?? ''))
}
