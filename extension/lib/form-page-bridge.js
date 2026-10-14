/**
 * These functions are injected only from the popup after an explicit click.
 * Keep them self-contained: chrome.scripting serializes their function body.
 */

export function scanVisibleFormFields() {
  // This body is serialised into the page, so the selector cannot live at
  // module scope. Scan and both writers must match the same controls in the
  // same order, or `form-field-N` stops naming the control the plan was built
  // for.
  //
  // `contenteditable` is matched by value because the bare attribute
  // (`<div contenteditable>`, the commonest spelling) and `plaintext-only` are
  // both valid and neither equals the literal "true".
  const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
  /** Only elements actually carrying the attribute; `includes(null)` is false. */
  const isRichText = (element) => ['', 'true', 'plaintext-only'].includes(element.getAttribute?.('contenteditable'))
  const isVisible = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  const normalizeLabel = (value) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[*＊]\s*/, '')
    .replace(/\s*[*＊]\s*$/, '')
    .replace(/\s*(?:必填|required)?\s*[:：]\s*$/i, '')
    .trim()
  const shortVisibleText = (element) => {
    if (!element || !isVisible(element)) return ''
    const text = normalizeLabel(element.textContent)
    return text && text.length <= 80 ? text : ''
  }
  /**
   * The text the control is showing right now, if it is showing anything.
   *
   * 北森 renders a chosen value inside the control's own `<label>`, so a wrapper
   * that merely repeats the value is showing an **answer**, not the column the box
   * belongs to. In one dump of 88 fields that produced “北京市”, “硕士研究生”,
   * “熟练”, “15001～25000” and “应届毕业生” as field names — every one of them the
   * value sitting in the box, while the real name (“意向工作地点”, “学历”, “掌握程度”,
   * “期望月薪(税前)”, “工作年限”) led the container text.
   */
  const ownDisplayText = (element) => {
    if (element instanceof HTMLSelectElement) {
      const selected = element.selectedOptions?.[0] ?? element.options[element.selectedIndex]
      return normalizeLabel(selected?.textContent)
    }
    // Only `value`: a `<label>` wrapping an *empty* box is that box's name, which
    // is the ordinary case and must keep working.
    return normalizeLabel(element.value)
  }
  // These three patterns are also exported from `lib/form-labels.js`, which the
  // rule table imports. This body is serialized into the page, so it cannot
  // import them itself and has to carry a copy; `form-labels.test.js` fails if
  // the two ever drift apart.
  const EMPTY_STATE_PATTERN = /^(?:请选择|请选取|请先选择|请填写|请输入|未选择|暂无选项|暂无数据|暂无内容|暂无|无数据|无选项|无内容|[-—–/]{1,})$/
  const VALUE_LIKE_PATTERN = /^[+-]?\d+(?:[.\-/]\d+)*$/
  const UNIT_OR_SEPARATOR_PATTERN = /^(?:年|月|日|号|至|到|起|止|年月|年月日|[~～—–\-/\\、,，.。:：*·・]+)$/
  /**
   * Text that names no column, so it must never become a field's name.
   *
   * A split date control usually has nothing but the unit character beside it
   * (“年”, “月”) or the separator in front of it (“至”). A dropdown shows its own
   * placeholder (“请选择”, “暂无选项”) or its already-chosen value (“2024”, “+86”)
   * where a label would go. Matched as a name, each of those tells the model
   * about a column that does not exist — and a model asked to fill a separator
   * will gladly write something into it. They are only rejected as a *whole*
   * label: “请输入学校全称” is a real prompt.
   */
  const isUselessLabel = (value) => {
    const text = normalizeLabel(value)
    return !text
      || UNIT_OR_SEPARATOR_PATTERN.test(text)
      || VALUE_LIKE_PATTERN.test(text)
      || EMPTY_STATE_PATTERN.test(text)
  }
  /** Whether a box's text is an answer rather than the page's “nothing chosen”. */
  const hasAnswerText = (value) => {
    const text = normalizeLabel(value)
    return Boolean(text) && !EMPTY_STATE_PATTERN.test(text)
  }
  const isLabelLike = (element) => {
    const className = typeof element?.className === 'string' ? element.className : ''
    return ['LABEL', 'TH'].includes(element?.tagName)
      || /(?:^|[-_\s])label(?:$|[-_\s])/i.test(className)
      || /(?:form-item__label|ant-form-item-label|form-label|formily-item-label)/i.test(className)
      || element?.getAttribute?.('role') === 'label'
  }
  const formContainerFor = (element) => {
    let cursor = element
    while (cursor) {
      const classes = typeof cursor.className === 'string' ? cursor.className.split(/\s+/) : []
      if (classes.includes('ud-formily-item') || classes.some(className => /(?:^|-)formily-item$/.test(className))) return cursor
      cursor = cursor.parentElement
    }
    return null
  }
  const semanticContainerFor = (element) => {
    const knownContainer = formContainerFor(element) ?? element.closest('.el-form-item, .ant-form-item, .form-item, .form-group, tr, fieldset, [role="group"]')
    if (knownContainer) return knownContainer

    let cursor = element.parentElement
    for (let level = 0; cursor && level < 5; level += 1, cursor = cursor.parentElement) {
      const controlsInContainer = cursor.querySelectorAll(CONTROL_SELECTOR).length
      const text = shortVisibleText(cursor)
      // A field wrapper normally holds at most a few related controls. This avoids
      // accidentally using the entire page text as a field label or context.
      if (text && controlsInContainer > 0 && controlsInContainer <= 3) return cursor
    }
    return null
  }
  /**
   * Labels the page declares about the control itself. `title` is deliberately
   * not read here: it is a tooltip, and another autofill tool writes its own
   * status text into it ("拾星已填写：姓名"), which would then be mistaken for
   * the field's name and shadow the page's real label.
   */
  const attributeLabelFor = (element) => {
    const fromData = ['data-field-label', 'data-label', 'data-title']
      .map(attribute => normalizeLabel(element.getAttribute(attribute)))
      .find(Boolean)
    const describedBy = (element.getAttribute('aria-describedby') ?? '').split(/\s+/)
      .map(id => shortVisibleText(document.getElementById(id))).find(Boolean)
    return fromData || describedBy || ''
  }
  /** Last resort only: a tooltip says less than the page's own layout does. */
  const titleLabel = (element) => normalizeLabel(element.getAttribute('title'))
  const formilyMetadataLabel = (element) => {
    const container = formContainerFor(element)
    if (!container) return ''
    return ['data-form-field-i18n-name', 'data-form-field-name']
      .map(attribute => normalizeLabel(container.getAttribute(attribute)))
      .find(Boolean) ?? ''
  }
  const nearestContainerLabel = (element) => {
    const container = semanticContainerFor(element)
    if (!container) return ''
    const shownValue = ownDisplayText(element)
    const labels = Array.from(container.querySelectorAll('.ud-formily-item-label label, .ud-formily-item-label-content label, .ud-formily-item-label-content, .ud-formily-item-label, label, th, .el-form-item__label, .ant-form-item-label, .form-label, [class*="label"]'))
      .filter(candidate => candidate !== element && isLabelLike(candidate))
      .map(shortVisibleText)
      // A label element that holds nothing but the value is that value's wrapper.
      .filter(label => label && label !== shownValue)
    if (labels[0]) return labels[0]

    // The container's own text is the weakest evidence available, so it is only
    // trusted when it cannot be showing this control's *state* instead of the
    // column it belongs to. A wrapper holding several controls is describing a
    // block; a wrapper whose entire text is the control's own value or option list
    // (a chosen city, a filled dropdown, a plain `<select>`) is showing an answer.
    const containerText = shortVisibleText(container)
    if (!containerText || containerText.length > 60) return ''
    if (container.querySelectorAll(CONTROL_SELECTOR).length > 1) return ''
    const ownValue = normalizeLabel(element.value ?? element.textContent)
    return ownValue && containerText === ownValue ? '' : containerText
  }
  const adjacentLabel = (element) => {
    const hasControl = (node) => Boolean(node.querySelector?.(`${CONTROL_SELECTOR}, button`))
    let cursor = element
    for (let level = 0; level < 3 && cursor?.parentElement; level += 1) {
      let sibling = cursor.previousElementSibling
      while (sibling) {
        // A sibling that holds another control is a previous field, not this
        // one's label; reading it names the wrong box.
        if (!hasControl(sibling)) {
          const text = shortVisibleText(sibling)
          if (text && (isLabelLike(sibling) || text.length <= 40) && !isUselessLabel(text)) return text
        }
        sibling = sibling.previousElementSibling
      }
      cursor = cursor.parentElement
    }
    return ''
  }
  const labelFor = (element) => {
    const labels = Array.from(element.labels ?? []).map(shortVisibleText).filter(Boolean)
    const wrappingLabel = shortVisibleText(element.closest('label'))
    const labelledBy = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/)
      .map(id => shortVisibleText(document.getElementById(id))).filter(Boolean)
    const ariaLabel = normalizeLabel(element.getAttribute('aria-label'))
    // Whatever the control is currently showing is an answer, never its own name,
    // so a candidate equal to it is dropped before any of them is chosen.
    const shownValue = ownDisplayText(element)
    // The text sitting next to a control belongs to that control; the text of the
    // container it sits in may belong to its neighbour or to nothing at all. The
    // sibling is therefore read first, and the container text only afterwards.
    return labels.concat(
      wrappingLabel ? [wrappingLabel] : [],
      labelledBy,
      ariaLabel ? [ariaLabel] : [],
      formilyMetadataLabel(element),
      attributeLabelFor(element),
      adjacentLabel(element),
      nearestContainerLabel(element),
      titleLabel(element),
    ).filter(candidate => !(shownValue && normalizeLabel(candidate) === shownValue))
      .find(candidate => candidate && !isUselessLabel(candidate)) ?? ''
  }
  const contextFor = (element) => {
    const container = semanticContainerFor(element)
    const text = shortVisibleText(container)
    return text && text !== labelFor(element) ? text.slice(0, 240) : ''
  }
  // Component libraries increasingly render inside a web component, where an
  // ordinary document query cannot see the form at all. Walk open shadow roots
  // breadth-first: a root can contain a host for the next one down.
  const allRoots = () => {
    const roots = [document]
    for (let index = 0; index < roots.length; index += 1) {
      for (const node of roots[index].querySelectorAll('*')) {
        if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot)
      }
    }
    return roots
  }
  const queryAll = selector => allRoots().flatMap(root => Array.from(root.querySelectorAll(selector)))
  const allControls = queryAll(CONTROL_SELECTOR)
  const customSelectFor = (element) => element.closest('.ud__select, .el-select, .ant-select, .arco-select, .semi-select')
    ?? (element.getAttribute('role') === 'combobox' ? element.closest('[role="combobox"]') ?? element : null)
  const radioGroupFor = (element) => {
    const name = element.getAttribute('name')
    if (name) return allControls.filter(candidate => candidate instanceof HTMLInputElement && candidate.type === 'radio' && candidate.getAttribute('name') === name)
    const container = semanticContainerFor(element)
    return container ? Array.from(container.querySelectorAll('input[type="radio"]')) : [element]
  }
  const radioOptionText = (element) => normalizeLabel(
    element.getAttribute('aria-label')
      ?? element.closest('label')?.textContent
      ?? element.parentElement?.querySelector('.el-radio__label, .ant-radio-wrapper, [class*="radio__label"]')?.textContent
      ?? '',
  )
  /**
   * The question a radio group answers.
   *
   * Every option is wrapped in its own `<label>` (“男”, “女”, “是”, “否”), so
   * asking a group for “its label” through the ordinary path returns one of its
   * options. A 是/否 group then reaches the model named “是” — and answering “是”
   * is both the cheapest and the most wrong thing a model can do with it. The
   * options are therefore taken back out of the group's text and what is left is
   * the question.
   *
   * Nothing is left for a group with no question of its own. That is deliberate —
   * refusing to answer an unidentifiable yes/no question beats answering it from a
   * coin flip — but before giving up, the text *beside* the group is read: plenty
   * of layouts put the question in its own cell or div above the options rather
   * than in the wrapper the options sit in.
   */
  const radioGroupLabel = (group) => {
    const anchor = group[0]
    const container = semanticContainerFor(anchor)
    if (container) {
      // Two ways to drop an option, because wrappers vary: by containment for a
      // component that wraps each option, and by exact text for one that renders
      // the option text into a sibling element. Never by string replacement —
      // removing the text “是” from the question “是否在职期间获取” would eat the
      // question itself.
      const optionNodes = group
        .map(radio => radio.closest('label') ?? (radio.parentElement !== container ? radio.parentElement : radio))
      const optionTexts = new Set(group.map(radio => normalizeLabel(radioOptionText(radio))).filter(Boolean))
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
      const parts = []
      let node
      while ((node = walker.nextNode())) {
        if (optionNodes.some(option => option.contains(node))) continue
        const value = normalizeLabel(node.textContent)
        if (!value || optionTexts.has(value)) continue
        parts.push(value)
      }
      const question = normalizeLabel(parts.join(' '))
      if (question && question.length <= 60 && !isUselessLabel(question)) return question
    }
    // Then the question written beside the options, which is where a plain
    // two-column table or a hand-rolled `<div>` puts it. `adjacentLabel` skips
    // siblings that hold controls, so it cannot land on the previous field.
    const beside = adjacentLabel(anchor)
    if (beside && beside.length >= 2 && !isUselessLabel(beside)) return beside
    // Finally the name the wrapper declares for itself — the page's own word for
    // this control, and never one of its options.
    return normalizeLabel(formilyMetadataLabel(anchor)) || normalizeLabel(attributeLabelFor(anchor)) || ''
  }
  const DATE_UNIT_TEXT = { 年: 'year', 月: 'month', 日: 'day', 号: 'day' }
  const DATE_ROLE_TEXT = { end: /结束|截止|离职|毕业/, start: /开始|起始|入学|入职|起止/ }
  /**
   * The unit character a split date box sits next to (“年”, “月”), read from the
   * box's own wording or from the text beside it. A box whose entire visible name
   * is “年” has no other identity, and the rule table needs to know which
   * component of a date it holds before it can put a value in it.
   */
  const dateUnitOf = (element) => {
    const own = [element.getAttribute?.('placeholder'), element.getAttribute?.('aria-label'), element.getAttribute?.('title')]
      .map(normalizeLabel)
      .find(value => DATE_UNIT_TEXT[value])
    if (own) return DATE_UNIT_TEXT[own]
    const nearby = []
    const following = element.nextSibling
    if (following && following.nodeType === 3) nearby.push(normalizeLabel(following.textContent))
    if (element.nextElementSibling) nearby.push(normalizeLabel(element.nextElementSibling.textContent))
    const wrapper = element.parentElement
    if (wrapper && wrapper.querySelectorAll(CONTROL_SELECTOR).length <= 1) nearby.push(normalizeLabel(wrapper.textContent))
    const hit = nearby.find(value => DATE_UNIT_TEXT[value])
    return hit ? DATE_UNIT_TEXT[hit] : ''
  }
  /**
   * Which end of a date range a box holds, read off the block around it.
   *
   * The box itself usually says only “年”; “入学时间” / “毕业时间” is written two
   * or three levels up, which is why this climbs further than the label search
   * does. A level that names both ends tells us nothing about one box, so it ends
   * the search rather than guessing.
   */
  const dateRoleOf = (element) => {
    let cursor = element
    for (let level = 0; cursor && level < 5; level += 1, cursor = cursor.parentElement) {
      const text = normalizeLabel(cursor.textContent)
      if (!text || text.length > 120) continue
      const isEnd = DATE_ROLE_TEXT.end.test(text)
      const isStart = DATE_ROLE_TEXT.start.test(text)
      if (isEnd !== isStart) return isEnd ? 'end' : 'start'
      if (isEnd && isStart) return ''
    }
    return ''
  }
  /**
   * Whether a `<select>` really holds an answer.
   *
   * With no option marked `selected` the browser selects the first one, so a
   * dropdown showing “请选择” or “暂无选项” still reports a value and came back as
   * “已有内容，已跳过” — silently losing the field. A chosen value has to be a
   * real option. A numeric default is deliberately left alone: a year box that
   * opens on 1990 is indistinguishable from one the applicant set to 1990.
   */
  const selectHasValue = (element) => {
    const selected = element.selectedOptions?.[0] ?? element.options[element.selectedIndex]
    if (!selected) return false
    if (!normalizeLabel(selected.value)) return false
    return !EMPTY_STATE_PATTERN.test(normalizeLabel(selected.textContent))
  }
  /**
   * The control's shape as the transport contract names it.
   *
   * `div` is not a shape. A contenteditable editor is the page's `<textarea>`, and
   * reporting the tag name instead made the server reject the whole batch — which
   * took every field after it down with it, because a rejected batch was treated
   * as fatal.
   */
  const controlTypeOf = (element) => (isRichText(element) ? 'textarea' : element.tagName.toLowerCase())
  const visibleControls = allControls.map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden' && !(element instanceof HTMLInputElement && element.type === 'radio'))
    .filter(({ element }) => !customSelectFor(element))
    .filter(({ element }) => !element.hasAttribute('disabled') && !element.hasAttribute('readonly') && element.getAttribute('aria-disabled') !== 'true')
  const radioGroups = []
  const seenRadioAnchors = new Set()
  allControls.forEach((element, index) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || seenRadioAnchors.has(index)) return
    const group = radioGroupFor(element)
    const anchorIndex = allControls.indexOf(group[0])
    group.forEach(radio => seenRadioAnchors.add(allControls.indexOf(radio)))
    const visibleOption = group.find(radio => isVisible(radio.closest('label') ?? radio.parentElement ?? radio))
    if (!visibleOption) return
    radioGroups.push({
      sortIndex: anchorIndex,
      id: `radio-group-${anchorIndex}`,
      label: radioGroupLabel(group),
      context: contextFor(element),
      name: element.getAttribute('name') ?? '',
      placeholder: '',
      inputType: 'radio',
      controlType: 'radio-group',
      options: group.map(radioOptionText).filter(Boolean),
      multiple: false,
      hasValue: group.some(radio => radio.checked),
      isEditable: group.every(radio => !radio.disabled),
    })
  })
  const seenCustomSelects = new Set()
  const customSelects = allControls.map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden' && Boolean(customSelectFor(element)))
    .filter(({ element }) => {
      const container = customSelectFor(element)
      if (!container || seenCustomSelects.has(container)) return false
      seenCustomSelects.add(container)
      return true
    })
    .map(({ element, index }) => ({
      sortIndex: index,
      id: `custom-select-${index}`,
      label: labelFor(element),
      context: contextFor(element),
      name: element.getAttribute('name') ?? '',
      placeholder: element.getAttribute('placeholder') ?? '',
      inputType: element instanceof HTMLInputElement ? element.type : (isRichText(element) ? 'contenteditable' : ''),
      controlType: 'custom-select',
      options: [],
      multiple: false,
      // A dropdown whose box still reads “请选择” is empty, however the component
      // stores that placeholder.
      hasValue: hasAnswerText(element.value ?? element.textContent),
      isEditable: !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
    }))

  const descriptors = visibleControls.map(({ element, index }) => {
    // A split date box is recognised by the unit beside it, and placed on the
    // start or the end of the range by the block it sits in. Both are read here
    // because neither is recoverable later: the rules only see descriptors.
    const dateUnit = dateUnitOf(element)
    return {
      sortIndex: index,
      id: `form-field-${index}`,
      label: labelFor(element),
      context: contextFor(element),
      name: element.getAttribute('name') ?? '',
      placeholder: element.getAttribute('placeholder') ?? '',
      inputType: element instanceof HTMLInputElement ? element.type : (isRichText(element) ? 'contenteditable' : ''),
      controlType: controlTypeOf(element),
      dateUnit: dateUnit || undefined,
      dateRole: dateUnit ? dateRoleOf(element) || undefined : undefined,
      options: element instanceof HTMLSelectElement ? Array.from(element.options).map(option => option.textContent?.trim() ?? '') : [],
      multiple: element instanceof HTMLSelectElement && element.multiple,
      hasValue: element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
        ? element.checked
        : element instanceof HTMLSelectElement
          ? selectHasValue(element)
          : Boolean((element.value ?? element.textContent ?? '').trim()),
      isEditable: !element.hasAttribute('disabled') && !element.hasAttribute('readonly') && element.getAttribute('aria-disabled') !== 'true',
    }
  }).concat(radioGroups, customSelects).sort((left, right) => left.sortIndex - right.sortIndex || left.id.localeCompare(right.id))
  const labelTotals = descriptors.reduce((counts, field) => {
    const key = normalizeLabel(field.label)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    return counts
  }, new Map())
  const labelSeen = new Map()
  return descriptors.map((field, index) => {
    const { sortIndex: _sortIndex, ...descriptor } = field
    const label = normalizeLabel(field.label)
    const occurrence = label ? (labelSeen.get(label) ?? 0) + 1 : 0
    if (label) labelSeen.set(label, occurrence)
    const nearby = descriptors.slice(Math.max(0, index - 2), index + 3)
      .filter(candidate => candidate !== field)
      .map(candidate => normalizeLabel(candidate.label))
      .filter(Boolean)
    const context = [
      field.context,
      `页面字段 ${index + 1}/${descriptors.length}`,
      label && labelTotals.get(label) > 1 ? `同名字段 ${occurrence}/${labelTotals.get(label)}` : '',
      nearby.length ? `相邻字段：${nearby.join('、')}` : '',
    ].filter(Boolean).join('；').slice(0, 240)
    return { ...descriptor, context }
  })
}

export async function applyFillEntries(instructions) {
  const entries = Array.isArray(instructions) ? instructions : (instructions?.entries ?? [])
  const unresolvedIds = new Set(Array.isArray(instructions) ? [] : (instructions?.unresolvedIds ?? []))
  // Must stay identical to the scan's selector: the ids name controls by their
  // position in this list. See `scanVisibleFormFields` for why the
  // `contenteditable` variants are spelled out.
  const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
  const isRichText = (element) => ['', 'true', 'plaintext-only'].includes(element.getAttribute?.('contenteditable'))
  const isVisible = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  // Mirrors the scan: the same open shadow roots must be walked so `form-field-N`
  // still names the same control it named when the plan was built.
  const allRoots = () => {
    const roots = [document]
    for (let index = 0; index < roots.length; index += 1) {
      for (const node of roots[index].querySelectorAll('*')) {
        if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot)
      }
    }
    return roots
  }
  const queryAll = selector => allRoots().flatMap(root => Array.from(root.querySelectorAll(selector)))
  const controls = queryAll(CONTROL_SELECTOR)
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden')
    .filter(({ element }) => !(element instanceof HTMLInputElement && element.type === 'radio'))
    .filter(({ element }) => !(element.closest('.ud__select, .el-select, .ant-select, .arco-select, .semi-select') || element.getAttribute('role') === 'combobox'))
    .filter(({ element }) => !element.hasAttribute('disabled') && !element.hasAttribute('readonly') && element.getAttribute('aria-disabled') !== 'true')
  const byId = new Map(entries.map(entry => [entry.fieldId, entry]))
  const appliedIds = []
  const skippedExistingIds = []
  const unavailableIds = []
  const seenIds = new Set()
  // Chrome serialises this function body into the page, so every constant it
  // needs has to live inside it rather than at module scope.
  const REVEAL_MS = 90
  // A framework may commit its model one task after the input event. Settling
  // once per field is what keeps `change` and `blur` validators from reading a
  // stale value, and it is why this runs before those two events rather than
  // during the batch audit.
  const COMMIT_SETTLE_MS = 48
  // Text controls can still be reverted on the following render. One short wait
  // for the whole batch is cheaper than a longer wait on every single field.
  const BATCH_AUDIT_MS = 120

  const mark = (element, color) => {
    element.style.backgroundColor = color
    element.style.transition = 'background-color 160ms ease'
  }
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  /**
   * Why a field could not be written.
   *
   * “未能应用” on its own told the applicant nothing and told us less: it covered
   * a control that had moved, a framework that reverted the value, a dropdown
   * with no matching option and a disabled box alike. The reason travels back
   * with the id so the report can say which one it was.
   */
  const unavailableReasons = {}
  const markUnavailable = (fieldId, element, reason, paint = true) => {
    if (!unavailableIds.includes(fieldId)) unavailableIds.push(fieldId)
    unavailableReasons[fieldId] = reason
    if (paint && element) mark(element, '#fee2e2')
  }
  const reveal = async (element) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    mark(element, '#fef3c7')
    element.focus?.({ preventScroll: true })
    await pause(REVEAL_MS)
  }
  const normalizeValue = value => String(value ?? '').trim()
  /**
   * An ATS may reformat what it was given — a phone box that inserts spaces, a
   * province box that appends “省”. This check exists to catch a write that
   * silently did not happen, not to demand the page echo our exact string back,
   * so a value that still contains ours counts as written.
   */
  const readbackMatches = (element, expected) => {
    const actual = normalizeValue(element.value ?? element.textContent)
    const wanted = normalizeValue(expected)
    if (!actual || !wanted) return false
    if (actual === wanted) return true
    return wanted.length >= 2 && (actual.includes(wanted) || wanted.includes(actual))
  }
  /**
   * Writes a text value the way a user would, so framework-controlled inputs
   * commit it: `beforeinput` and `input` carry the value because React and Vue
   * read it there, and only the native prototype setter reaches past a value a
   * controlled component is holding.
   */
  const commitTextValue = async (element, value) => {
    element.focus?.({ preventScroll: true })
    try {
      element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(value) }))
    }
    catch { /* older engines reject the full InputEvent init */ }
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (setter) setter.call(element, value)
    else element.value = value
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }))
    await pause(COMMIT_SETTLE_MS)
    element.dispatchEvent(new Event('change', { bubbles: true }))
    element.blur?.()
  }
  const deferredReadbacks = []
  const auditDeferredReadbacks = async () => {
    if (!deferredReadbacks.length) return
    await pause(BATCH_AUDIT_MS)
    for (const pending of deferredReadbacks) {
      if (readbackMatches(pending.element, pending.expected)) continue
      const applied = appliedIds.indexOf(pending.fieldId)
      if (applied >= 0) appliedIds.splice(applied, 1)
      if (!unavailableIds.includes(pending.fieldId)) unavailableIds.push(pending.fieldId)
      unavailableReasons[pending.fieldId] = '写进去之后被页面还原了，框架不接受这个值。'
      mark(pending.element, '#fee2e2')
    }
  }

  for (const { element, index } of controls) {
    const fieldId = `form-field-${index}`
    const entry = byId.get(fieldId)
    if (!entry) {
      if (unresolvedIds.has(fieldId) && !(element.value ?? element.textContent ?? '').trim()) mark(element, '#fee2e2')
      continue
    }
    seenIds.add(fieldId)

    // A checkbox carries no text: its default `value` of "on" must not read as
    // pre-existing content, and the answer belongs in `checked`, not `value`.
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      if (element.hasAttribute('disabled')) {
        markUnavailable(fieldId, element, '复选框处于禁用状态。', false)
        continue
      }
      const shouldCheck = /^(?:true|1|yes|是|有)$/i.test(String(entry.value ?? '').trim())
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      await pause(REVEAL_MS)
      if (element.checked !== shouldCheck) element.click()
      if (Boolean(element.checked) !== shouldCheck) {
        markUnavailable(fieldId, element, '点击后复选框的状态没有变化，页面阻止了这次勾选。')
        continue
      }
      element.style.outline = '2px solid #16a34a'
      element.style.outlineOffset = '2px'
      appliedIds.push(fieldId)
      continue
    }

    if (element.hasAttribute('disabled') || element.hasAttribute('readonly')) {
      markUnavailable(
        fieldId,
        element,
        element.hasAttribute('readonly') ? '控件是只读的，无法写入。' : '控件被禁用，无法写入。',
        // Painting every read-only box red would bury the ones we actually tried.
        unresolvedIds.has(fieldId),
      )
      continue
    }
    if ((element.value ?? element.textContent ?? '').trim()) {
      skippedExistingIds.push(fieldId)
      continue
    }

    await reveal(element)

    if (element instanceof HTMLSelectElement) {
      const normalizeOption = (value) => String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/^[*＊]\s*/, '')
        .replace(/\s*[*＊]\s*$/, '')
        .replace(/\s*(?:必填|required)?\s*[:：]\s*$/i, '')
        .trim()
      const availableOptions = Array.from(element.options).filter(option => !option.disabled)
      const selectOption = (rawValue) => {
        const wanted = normalizeOption(rawValue)
        if (!wanted) return null
        const exactMatches = availableOptions.filter(option => normalizeOption(option.textContent) === wanted)
        const relaxedWanted = wanted.replace(/[省市]$/, '')
        const matches = exactMatches.length ? exactMatches : availableOptions.filter((option) => {
          const optionValue = normalizeOption(option.textContent)
          return Boolean(optionValue) && (optionValue.replace(/[省市]$/, '') === relaxedWanted
            || optionValue.includes(wanted)
            || wanted.includes(optionValue))
        })
        return matches.length === 1 ? matches[0] : null
      }
      // A multi-select answers with one option per saved value; a single-select
      // goes through the native setter so a framework's value tracker sees it.
      const wantedValues = element.multiple
        ? String(entry.value ?? '').split(/[、,，;；|]/).map(part => part.trim()).filter(Boolean)
        : [entry.value]
      const targets = wantedValues.map(selectOption)
      if (!targets.length || targets.some(target => !target)) {
        markUnavailable(fieldId, element, '页面的下拉选项里找不到与答案唯一对应的一项。')
        continue
      }
      if (element.multiple) targets.forEach(option => { option.selected = true })
      else {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        if (setter) setter.call(element, targets[0].value)
        else element.value = targets[0].value
      }
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(entry.value) }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      element.dispatchEvent(new Event('blur', { bubbles: true }))
      const applied = element.multiple
        ? targets.every(option => option.selected)
        : element.value === targets[0].value
      if (!applied) {
        markUnavailable(fieldId, element, '下拉选中之后页面的取值没有变化。')
        continue
      }
      mark(element, '#dcfce7')
      appliedIds.push(fieldId)
      continue
    }

    if (isRichText(element)) {
      element.focus?.({ preventScroll: true })
      element.textContent = String(entry.value)
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(entry.value) }))
      await pause(COMMIT_SETTLE_MS)
      element.dispatchEvent(new Event('change', { bubbles: true }))
      element.blur?.()
    }
    else {
      await commitTextValue(element, entry.value)
    }
    if (!readbackMatches(element, entry.value)) {
      markUnavailable(fieldId, element, '写入之后读回的值与要填的不一致。')
      continue
    }
    // Text controls — including rich-text contenteditable editors, which accept
    // a write and then restore their own model on the next render — are the
    // ones a framework can quietly revert.
    deferredReadbacks.push({ fieldId, element, expected: entry.value })
    mark(element, '#dcfce7')
    appliedIds.push(fieldId)
  }

  await auditDeferredReadbacks()

  // An entry whose id never matched a control is not a write that failed, it is a
  // write that had nowhere to go: the page moved under the scan and the position
  // the id named is no longer this control. Reported separately, because the fix
  // for it is not the fix for a value the framework rejected.
  for (const entry of entries) {
    if (seenIds.has(entry.fieldId)) continue
    markUnavailable(entry.fieldId, null, '写入时页面已经找不到这个控件（页面结构变了，控件序号错位）。')
  }

  return { appliedIds, skippedExistingIds, unavailableIds, unavailableReasons }
}

export async function applyChoiceEntries(instructions) {
  const entries = Array.isArray(instructions) ? instructions : (instructions?.entries ?? [])
  const unresolvedIds = new Set(Array.isArray(instructions) ? [] : (instructions?.unresolvedIds ?? []))
  // Must stay identical to the scan's selector; see `scanVisibleFormFields`.
  const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
  const isVisible = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  const normalizeOption = (value) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[*\s]+|[*\s]+$/g, '')
    .replace(/[:：]\s*$/, '')
    .trim()
  const allRoots = () => {
    const roots = [document]
    for (let index = 0; index < roots.length; index += 1) {
      for (const node of roots[index].querySelectorAll('*')) {
        if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot)
      }
    }
    return roots
  }
  const queryAll = selector => allRoots().flatMap(root => Array.from(root.querySelectorAll(selector)))
  const allControls = queryAll(CONTROL_SELECTOR)
  const byId = new Map(entries.map(entry => [entry.fieldId, entry]))
  const appliedIds = []
  const skippedExistingIds = []
  const unavailableIds = []
  const seenIds = new Set()
  const mark = (element, color) => {
    element.style.backgroundColor = color
    element.style.transition = 'background-color 160ms ease'
  }
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  // Long enough to see which control is being worked on; the dropdown waits
  // below are the ones that are actually load-bearing.
  const REVEAL_MS = 90
  // A search-backed dropdown fetches its list after the keystroke, so its wait is
  // longer than a locally rendered one.
  const REMOTE_SEARCH_MS = 320
  const waitForRender = async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await pause(140)
  }
  /**
   * Types the answer into a dropdown's own filter box, the way a user would.
   *
   * The value goes in through the native setter as well as the event, because a
   * controlled component's filter lives in its own state and only the setter
   * reaches past it — the same reason `applyFillEntries` writes text that way.
   */
  const typeToSearch = async (element, value) => {
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(element, String(value))
      else element.value = String(value)
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }))
    }
    catch {
      return false
    }
    await waitForRender()
    await pause(REMOTE_SEARCH_MS)
    return true
  }
  const radioOptionText = (element) => normalizeOption(
    element.getAttribute('aria-label')
      ?? element.closest('label')?.textContent
      ?? element.parentElement?.querySelector('.el-radio__label, .ant-radio-wrapper, [class*="radio__label"]')?.textContent
      ?? '',
  )
  /**
   * Why a choice control could not be set. See `applyFillEntries` for why the
   * reason travels back with the id instead of being collapsed into “未能应用”.
   */
  const unavailableReasons = {}
  const markUnavailable = (fieldId, element, reason) => {
    if (!unavailableIds.includes(fieldId)) unavailableIds.push(fieldId)
    unavailableReasons[fieldId] = reason
    if (element) mark(element, '#fee2e2')
  }

  const radioAnchors = new Set()
  allControls.forEach((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio') return
    const name = element.getAttribute('name')
    const group = name
      ? allControls.filter(candidate => candidate instanceof HTMLInputElement && candidate.type === 'radio' && candidate.getAttribute('name') === name)
      : Array.from((element.closest('.el-form-item, .ant-form-item, .form-item, .form-group, .ud-formily-item, [role="group"]') ?? element.parentElement)?.querySelectorAll('input[type="radio"]') ?? [])
    const anchorIndex = allControls.indexOf(group[0])
    const fieldId = `radio-group-${anchorIndex}`
    if (radioAnchors.has(fieldId)) return
    radioAnchors.add(fieldId)
    const entry = byId.get(fieldId)
    if (!entry) return
    seenIds.add(fieldId)
    const visibleAnchor = group.find(radio => isVisible(radio.closest('label') ?? radio.parentElement ?? radio)) ?? group[0]
    if (!visibleAnchor || group.some(radio => radio.disabled)) {
      markUnavailable(fieldId, visibleAnchor ?? document.body, '单选组里有被禁用的选项。')
      return
    }
    if (group.some(radio => radio.checked)) {
      skippedExistingIds.push(fieldId)
      return
    }
    const matches = group.filter(radio => radioOptionText(radio) === normalizeOption(entry.value))
    if (matches.length !== 1) {
      markUnavailable(fieldId, visibleAnchor, '单选组的选项里没有与答案完全对应的一项。')
      return
    }
    const target = matches[0]
    ;(target.closest('label') ?? target).click()
    // The result is checked below after all synchronous page click handlers run.
    if (!target.checked) {
      markUnavailable(fieldId, visibleAnchor, '点击之后单选没有被选中，页面用自己的状态覆盖了这次点击。')
      return
    }
    mark(target.closest('label') ?? target, '#dcfce7')
    appliedIds.push(fieldId)
  })

  const seenCustomInputs = new Set()
  const customInputs = allControls.map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden')
    .filter(({ element }) => element.closest('.ud__select, .el-select, .ant-select, .arco-select, .semi-select') || element.getAttribute('role') === 'combobox')
    .filter(({ element }) => {
      const container = element.closest('.ud__select, .el-select, .ant-select, .arco-select, .semi-select') ?? element.closest('[role="combobox"]') ?? element
      if (seenCustomInputs.has(container)) return false
      seenCustomInputs.add(container)
      return true
    })
  for (const { element, index } of customInputs) {
    const fieldId = `custom-select-${index}`
    const entry = byId.get(fieldId)
    if (!entry) continue
    seenIds.add(fieldId)
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
      markUnavailable(fieldId, element, '下拉处于禁用状态。')
      continue
    }
    if ((element.value ?? element.textContent ?? '').trim()) {
      skippedExistingIds.push(fieldId)
      continue
    }
    const selectContainer = element.closest('.ud__select, .el-select, .ant-select, .arco-select, .semi-select') ?? element.closest('[role="combobox"]') ?? element
    selectContainer.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    mark(element, '#fef3c7')
    element.focus?.({ preventScroll: true })
    await pause(REVEAL_MS)
    selectContainer.click()
    await waitForRender()
    // A dropdown opened from inside a shadow root renders its list in that same
    // root, so the option lookup has to walk them too.
    const collectOptions = () => queryAll('.ud__select-option, .ud__select-dropdown-option, .ud__select-option-item, .el-select-dropdown__item, .ant-select-item-option, .arco-select-option, .semi-select-option, [role="option"]')
      .filter(option => isVisible(option) && option.getAttribute('aria-disabled') !== 'true' && !option.classList.contains('is-disabled'))
    const matchOptions = (options) => {
      const wanted = normalizeOption(entry.value)
      const relaxedWanted = wanted.replace(/[省市]$/, '')
      const exactMatches = options.filter(option => normalizeOption(option.textContent) === wanted)
      if (exactMatches.length) return exactMatches
      return options.filter((option) => {
        const optionValue = normalizeOption(option.textContent)
        return Boolean(optionValue) && (optionValue.replace(/[省市]$/, '') === relaxedWanted
          || optionValue.includes(wanted)
          || wanted.includes(optionValue))
      })
    }
    let matches = matchOptions(collectOptions())
    let typed = false
    if (matches.length !== 1 && element instanceof HTMLInputElement && !element.readOnly) {
      // 学校名称, 专业名称 and 研究方向 in most Chinese ATS products are a text
      // filter with a lookup list behind it: opening the box shows nothing at all
      // until something has been typed. Clicking and looking can therefore never
      // fill them, whatever the answer is.
      typed = await typeToSearch(element, entry.value)
      if (typed) matches = matchOptions(collectOptions())
    }
    if (matches.length !== 1) {
      markUnavailable(fieldId, element, typed
        // The answer is already sitting in the box; what is missing is the
        // *selection*, and guessing which entry of a school list to pick is the
        // applicant's call, not ours.
        ? '已在下拉框里输入答案，但页面没有给出可选项，需要你手动确认选哪一项。'
        : '展开下拉后没有与答案唯一对应的选项。')
      continue
    }
    matches[0].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    await pause(120)
    matches[0].click()
    await waitForRender()
    const selectedText = normalizeOption(selectContainer.textContent)
    if (normalizeOption(element.value ?? element.textContent) !== normalizeOption(entry.value) && !selectedText.includes(normalizeOption(entry.value))) {
      markUnavailable(fieldId, element, '选中之后页面显示的取值与答案不一致。')
      continue
    }
    mark(element, '#dcfce7')
    appliedIds.push(fieldId)
  }

  for (const entry of entries) {
    if (seenIds.has(entry.fieldId)) continue
    markUnavailable(entry.fieldId, null, '写入时页面已经找不到这个控件（页面结构变了，控件序号错位）。')
  }
  return { appliedIds, skippedExistingIds, unavailableIds, unavailableReasons }
}

/**
 * Reads back what each control on the page currently holds, keyed by the same
 * positional ids a scan produces.
 *
 * This is the one function here that returns page input, and it may only run
 * behind an explicit click from the applicant. Everything else in this file
 * deliberately never sees a value: the scan reports `hasValue` rather than the
 * value, so page content is neither retained nor printed. “记住我填的答案” is the
 * applicant asking for her own answers to be kept, which is a different thing
 * from a tool quietly hoovering up whatever a page was pre-filled with — and it
 * is why this is a separate pass rather than a flag on the scan.
 *
 * Only the id arithmetic is repeated here; labels come from the scan the caller
 * already has. The three id spellings below have to stay identical to the scan's,
 * or a value is filed against the wrong question.
 */
export function collectControlValues() {
  const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
  const isVisible = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  const allRoots = () => {
    const roots = [document]
    for (let index = 0; index < roots.length; index += 1) {
      for (const node of roots[index].querySelectorAll('*')) {
        if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot)
      }
    }
    return roots
  }
  const queryAll = selector => allRoots().flatMap(root => Array.from(root.querySelectorAll(selector)))
  const readText = value => String(value ?? '').replace(/\s+/g, ' ').trim()
  const allControls = queryAll(CONTROL_SELECTOR)
  const customSelectFor = (element) => element.closest('.ud__select, .el-select, .ant-select, .arco-select, .semi-select')
    ?? (element.getAttribute('role') === 'combobox' ? element.closest('[role="combobox"]') ?? element : null)
  const values = {}

  allControls.map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden' && !(element instanceof HTMLInputElement && element.type === 'radio'))
    .filter(({ element }) => !customSelectFor(element))
    .filter(({ element }) => !element.hasAttribute('disabled') && !element.hasAttribute('readonly') && element.getAttribute('aria-disabled') !== 'true')
    .forEach(({ element, index }) => {
      // An unchecked box holds no answer: it may simply be a box nobody has
      // reached yet, and remembering “no” for it would forbid ever checking it.
      const value = element instanceof HTMLInputElement && element.type === 'checkbox'
        ? (element.checked ? '是' : '')
        : readText(element.value ?? element.textContent)
      if (value) values[`form-field-${index}`] = value
    })

  const seenRadioAnchors = new Set()
  allControls.forEach((element, index) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || seenRadioAnchors.has(index)) return
    const name = element.getAttribute('name')
    const group = name
      ? allControls.filter(candidate => candidate instanceof HTMLInputElement && candidate.type === 'radio' && candidate.getAttribute('name') === name)
      : Array.from((element.closest('.el-form-item, .ant-form-item, .form-item, .form-group, .ud-formily-item, [role="group"]') ?? element.parentElement)?.querySelectorAll('input[type="radio"]') ?? [])
    const anchorIndex = allControls.indexOf(group[0])
    group.forEach(radio => seenRadioAnchors.add(allControls.indexOf(radio)))
    const checked = group.find(radio => radio.checked)
    if (!checked) return
    const optionText = readText(
      checked.getAttribute('aria-label')
        ?? checked.closest('label')?.textContent
        ?? checked.parentElement?.querySelector('.el-radio__label, .ant-radio-wrapper, [class*="radio__label"]')?.textContent
        ?? '',
    )
    if (optionText) values[`radio-group-${anchorIndex}`] = optionText
  })

  const seenCustomSelects = new Set()
  allControls.forEach((element, index) => {
    if (!isVisible(element) || element.type === 'hidden') return
    const container = customSelectFor(element)
    if (!container || seenCustomSelects.has(container)) return
    seenCustomSelects.add(container)
    const value = readText(element.value ?? element.textContent)
    if (value) values[`custom-select-${index}`] = value
  })

  return values
}
