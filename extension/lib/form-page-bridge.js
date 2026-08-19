/**
 * These functions are injected only from the popup after an explicit click.
 * Keep them self-contained: chrome.scripting serializes their function body.
 */

export function scanVisibleFormFields() {
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
      const controlsInContainer = cursor.querySelectorAll('input, textarea, select').length
      const text = shortVisibleText(cursor)
      // A field wrapper normally holds at most a few related controls. This avoids
      // accidentally using the entire page text as a field label or context.
      if (text && controlsInContainer > 0 && controlsInContainer <= 3) return cursor
    }
    return null
  }
  const attributeLabelFor = (element) => {
    const fromData = ['data-field-label', 'data-label', 'data-title']
      .map(attribute => normalizeLabel(element.getAttribute(attribute)))
      .find(Boolean)
    const title = normalizeLabel(element.getAttribute('title'))
    const describedBy = (element.getAttribute('aria-describedby') ?? '').split(/\s+/)
      .map(id => shortVisibleText(document.getElementById(id))).find(Boolean)
    return fromData || title || describedBy || ''
  }
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
    const labels = Array.from(container.querySelectorAll('.ud-formily-item-label label, .ud-formily-item-label-content label, .ud-formily-item-label-content, .ud-formily-item-label, label, th, .el-form-item__label, .ant-form-item-label, .form-label, [class*="label"]'))
      .filter(candidate => candidate !== element && isLabelLike(candidate))
      .map(shortVisibleText)
      .filter(Boolean)
    if (labels[0]) return labels[0]

    const containerText = shortVisibleText(container)
    return containerText && containerText.length <= 60 ? containerText : ''
  }
  const adjacentLabel = (element) => {
    let cursor = element
    for (let level = 0; level < 3 && cursor?.parentElement; level += 1) {
      let sibling = cursor.previousElementSibling
      while (sibling) {
        const text = shortVisibleText(sibling)
        if (text && (isLabelLike(sibling) || text.length <= 40)) return text
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
    return labels.concat(
      wrappingLabel ? [wrappingLabel] : [],
      labelledBy,
      ariaLabel ? [ariaLabel] : [],
      formilyMetadataLabel(element),
      attributeLabelFor(element),
      nearestContainerLabel(element),
      adjacentLabel(element),
    ).find(Boolean) ?? ''
  }
  const contextFor = (element) => {
    const container = semanticContainerFor(element)
    const text = shortVisibleText(container)
    return text && text !== labelFor(element) ? text.slice(0, 240) : ''
  }
  const allControls = Array.from(document.querySelectorAll('input, textarea, select'))
  const customSelectFor = (element) => element.closest('.ud__select')
    ?? element.closest('.el-select')
    ?? (element.getAttribute('role') === 'combobox' && element.hasAttribute('readonly') ? element : null)
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
  const visibleControls = allControls.map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden' && !(element instanceof HTMLInputElement && element.type === 'radio'))
    .filter(({ element }) => !customSelectFor(element))
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
      id: `radio-group-${anchorIndex}`,
      label: labelFor(element),
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
  const customSelects = allControls.map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden' && Boolean(customSelectFor(element)))
    .map(({ element, index }) => ({
      id: `custom-select-${index}`,
      label: labelFor(element),
      context: contextFor(element),
      name: element.getAttribute('name') ?? '',
      placeholder: element.getAttribute('placeholder') ?? '',
      inputType: element instanceof HTMLInputElement ? element.type : '',
      controlType: 'custom-select',
      options: [],
      multiple: false,
      hasValue: Boolean(element.value?.trim()),
      // Universe Design selectors are intentionally outside the current fill
      // scope. Marking them unavailable prevents both local and AI paths from
      // clicking a dropdown, search input or clear affordance.
      isEditable: !element.closest('.ud__select') && !element.hasAttribute('disabled'),
    }))

  return visibleControls.map(({ element, index }) => ({
    id: `form-field-${index}`,
    label: labelFor(element),
    context: contextFor(element),
    name: element.getAttribute('name') ?? '',
    placeholder: element.getAttribute('placeholder') ?? '',
    inputType: element instanceof HTMLInputElement ? element.type : '',
    controlType: element.tagName.toLowerCase(),
    options: element instanceof HTMLSelectElement ? Array.from(element.options).map(option => option.textContent?.trim() ?? '') : [],
    multiple: element instanceof HTMLSelectElement && element.multiple,
    hasValue: element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
      ? element.checked
      : Boolean(element.value?.trim()),
    isEditable: !element.hasAttribute('disabled') && !element.hasAttribute('readonly'),
  })).concat(radioGroups, customSelects)
}

export function applyFillEntries(instructions) {
  const entries = Array.isArray(instructions) ? instructions : (instructions?.entries ?? [])
  const unresolvedIds = new Set(Array.isArray(instructions) ? [] : (instructions?.unresolvedIds ?? []))
  const isVisible = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  const controls = Array.from(document.querySelectorAll('input, textarea, select'))
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden')
    .filter(({ element }) => !(element instanceof HTMLInputElement && element.type === 'radio'))
    .filter(({ element }) => !(element.closest('.ud__select') || element.closest('.el-select') || (element.getAttribute('role') === 'combobox' && element.hasAttribute('readonly'))))
  const byId = new Map(entries.map(entry => [entry.fieldId, entry]))
  const appliedIds = []
  const skippedExistingIds = []
  const unavailableIds = []
  const seenIds = new Set()
  const mark = (element, color) => {
    element.style.backgroundColor = color
    element.style.transition = 'background-color 160ms ease'
  }

  controls.forEach(({ element, index }) => {
    const fieldId = `form-field-${index}`
    const entry = byId.get(fieldId)
    if (!entry) {
      if (unresolvedIds.has(fieldId) && !element.value?.trim() && !element.hasAttribute('disabled') && !element.hasAttribute('readonly')) mark(element, '#fee2e2')
      return
    }
    seenIds.add(fieldId)

    if (element.hasAttribute('disabled') || element.hasAttribute('readonly')) {
      unavailableIds.push(fieldId)
      if (unresolvedIds.has(fieldId)) mark(element, '#fee2e2')
      return
    }
    if (element.value.trim()) {
      skippedExistingIds.push(fieldId)
      return
    }

    if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        unavailableIds.push(fieldId)
        if (unresolvedIds.has(fieldId)) mark(element, '#fee2e2')
        return
      }
      const normalizeOption = (value) => String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/^[*＊]\s*/, '')
        .replace(/\s*[*＊]\s*$/, '')
        .replace(/\s*(?:必填|required)?\s*[:：]\s*$/i, '')
        .trim()
      const matches = Array.from(element.options)
        .filter(option => !option.disabled && normalizeOption(option.textContent) === normalizeOption(entry.value))
      if (matches.length !== 1) {
        unavailableIds.push(fieldId)
        mark(element, '#fee2e2')
        return
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      if (setter) setter.call(element, matches[0].value)
      else element.value = matches[0].value
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(entry.value) }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      element.dispatchEvent(new Event('blur', { bubbles: true }))
      if (element.value !== matches[0].value) {
        unavailableIds.push(fieldId)
        mark(element, '#fee2e2')
        return
      }
      mark(element, '#dcfce7')
      appliedIds.push(fieldId)
      return
    }

    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (setter) setter.call(element, entry.value)
    else element.value = entry.value
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(entry.value) }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    element.dispatchEvent(new Event('blur', { bubbles: true }))
    if (element.value !== String(entry.value)) {
      unavailableIds.push(fieldId)
      mark(element, '#fee2e2')
      return
    }
    mark(element, '#dcfce7')
    appliedIds.push(fieldId)
  })

  return {
    appliedIds,
    skippedExistingIds,
    unavailableIds: unavailableIds.concat(entries.filter(entry => !seenIds.has(entry.fieldId)).map(entry => entry.fieldId)),
  }
}

export async function applyChoiceEntries(instructions) {
  const entries = Array.isArray(instructions) ? instructions : (instructions?.entries ?? [])
  const unresolvedIds = new Set(Array.isArray(instructions) ? [] : (instructions?.unresolvedIds ?? []))
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
  const allControls = Array.from(document.querySelectorAll('input, textarea, select'))
  const byId = new Map(entries.map(entry => [entry.fieldId, entry]))
  const appliedIds = []
  const skippedExistingIds = []
  const unavailableIds = []
  const seenIds = new Set()
  const mark = (element, color) => {
    element.style.backgroundColor = color
    element.style.transition = 'background-color 160ms ease'
  }
  const waitForRender = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const radioOptionText = (element) => normalizeOption(
    element.getAttribute('aria-label')
      ?? element.closest('label')?.textContent
      ?? element.parentElement?.querySelector('.el-radio__label, .ant-radio-wrapper, [class*="radio__label"]')?.textContent
      ?? '',
  )
  const markUnavailable = (fieldId, element) => {
    unavailableIds.push(fieldId)
    mark(element, '#fee2e2')
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
      markUnavailable(fieldId, visibleAnchor ?? document.body)
      return
    }
    if (group.some(radio => radio.checked)) {
      skippedExistingIds.push(fieldId)
      return
    }
    const matches = group.filter(radio => radioOptionText(radio) === normalizeOption(entry.value))
    if (matches.length !== 1) {
      markUnavailable(fieldId, visibleAnchor)
      return
    }
    const target = matches[0]
    ;(target.closest('label') ?? target).click()
    // The result is checked below after all synchronous page click handlers run.
    if (!target.checked) {
      markUnavailable(fieldId, visibleAnchor)
      return
    }
    mark(target.closest('label') ?? target, '#dcfce7')
    appliedIds.push(fieldId)
  })

  const customInputs = allControls.map((element, index) => ({ element, index }))
    .filter(({ element }) => isVisible(element) && element.type !== 'hidden')
    .filter(({ element }) => element.closest('.el-select') || (element.getAttribute('role') === 'combobox' && element.hasAttribute('readonly')))
  for (const { element, index } of customInputs) {
    const fieldId = `custom-select-${index}`
    const entry = byId.get(fieldId)
    if (!entry) continue
    seenIds.add(fieldId)
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
      markUnavailable(fieldId, element)
      continue
    }
    if (element.value.trim()) {
      skippedExistingIds.push(fieldId)
      continue
    }
    ;(element.closest('.el-select') ?? element).click()
    await waitForRender()
    const matches = Array.from(document.querySelectorAll('.el-select-dropdown__item, [role="option"]'))
      .filter(option => isVisible(option) && option.getAttribute('aria-disabled') !== 'true' && !option.classList.contains('is-disabled'))
      .filter(option => normalizeOption(option.textContent) === normalizeOption(entry.value))
    if (matches.length !== 1) {
      markUnavailable(fieldId, element)
      continue
    }
    matches[0].click()
    await waitForRender()
    if (normalizeOption(element.value) !== normalizeOption(entry.value)) {
      markUnavailable(fieldId, element)
      continue
    }
    mark(element, '#dcfce7')
    appliedIds.push(fieldId)
  }

  for (const entry of entries) {
    if (!seenIds.has(entry.fieldId) && unresolvedIds.has(entry.fieldId)) unavailableIds.push(entry.fieldId)
  }
  return { appliedIds, skippedExistingIds, unavailableIds }
}
