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
      const controlsInContainer = cursor.querySelectorAll('input, textarea, select, [contenteditable="true"]').length
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
  const allControls = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
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
      inputType: element instanceof HTMLInputElement ? element.type : (element.getAttribute('contenteditable') === 'true' ? 'contenteditable' : ''),
      controlType: 'custom-select',
      options: [],
      multiple: false,
      hasValue: Boolean((element.value ?? element.textContent ?? '').trim()),
      isEditable: !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
    }))

  const descriptors = visibleControls.map(({ element, index }) => ({
    sortIndex: index,
    id: `form-field-${index}`,
    label: labelFor(element),
    context: contextFor(element),
    name: element.getAttribute('name') ?? '',
    placeholder: element.getAttribute('placeholder') ?? '',
    inputType: element instanceof HTMLInputElement ? element.type : (element.getAttribute('contenteditable') === 'true' ? 'contenteditable' : ''),
    controlType: element.tagName.toLowerCase(),
    options: element instanceof HTMLSelectElement ? Array.from(element.options).map(option => option.textContent?.trim() ?? '') : [],
    multiple: element instanceof HTMLSelectElement && element.multiple,
    hasValue: element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
      ? element.checked
      : Boolean((element.value ?? element.textContent ?? '').trim()),
    isEditable: !element.hasAttribute('disabled') && !element.hasAttribute('readonly') && element.getAttribute('aria-disabled') !== 'true',
  })).concat(radioGroups, customSelects).sort((left, right) => left.sortIndex - right.sortIndex || left.id.localeCompare(right.id))
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
  const isVisible = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  const controls = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
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
  const mark = (element, color) => {
    element.style.backgroundColor = color
    element.style.transition = 'background-color 160ms ease'
  }
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  const reveal = async (element) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    mark(element, '#fef3c7')
    element.focus?.({ preventScroll: true })
    await pause(220)
  }

  for (const { element, index } of controls) {
    const fieldId = `form-field-${index}`
    const entry = byId.get(fieldId)
    if (!entry) {
      if (unresolvedIds.has(fieldId) && !(element.value ?? element.textContent ?? '').trim()) mark(element, '#fee2e2')
      continue
    }
    seenIds.add(fieldId)

    if (element.hasAttribute('disabled') || element.hasAttribute('readonly')) {
      unavailableIds.push(fieldId)
      if (unresolvedIds.has(fieldId)) mark(element, '#fee2e2')
      continue
    }
    if ((element.value ?? element.textContent ?? '').trim()) {
      skippedExistingIds.push(fieldId)
      continue
    }

    await reveal(element)

    if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        unavailableIds.push(fieldId)
        if (unresolvedIds.has(fieldId)) mark(element, '#fee2e2')
        continue
      }
      const normalizeOption = (value) => String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/^[*＊]\s*/, '')
        .replace(/\s*[*＊]\s*$/, '')
        .replace(/\s*(?:必填|required)?\s*[:：]\s*$/i, '')
        .trim()
      const availableOptions = Array.from(element.options).filter(option => !option.disabled)
      const wanted = normalizeOption(entry.value)
      const exactMatches = availableOptions.filter(option => normalizeOption(option.textContent) === wanted)
      const relaxedWanted = wanted.replace(/[省市]$/, '')
      const matches = exactMatches.length ? exactMatches : availableOptions.filter((option) => {
        const optionValue = normalizeOption(option.textContent)
        return Boolean(optionValue) && (optionValue.replace(/[省市]$/, '') === relaxedWanted
          || optionValue.includes(wanted)
          || wanted.includes(optionValue))
      })
      if (matches.length !== 1) {
        unavailableIds.push(fieldId)
        mark(element, '#fee2e2')
        continue
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
        continue
      }
      mark(element, '#dcfce7')
      appliedIds.push(fieldId)
      await pause(180)
      continue
    }

    if (element.getAttribute('contenteditable') === 'true') element.textContent = String(entry.value)
    else {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (setter) setter.call(element, entry.value)
      else element.value = entry.value
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(entry.value) }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    element.dispatchEvent(new Event('blur', { bubbles: true }))
    if (String(element.value ?? element.textContent ?? '') !== String(entry.value)) {
      unavailableIds.push(fieldId)
      mark(element, '#fee2e2')
      continue
    }
    mark(element, '#dcfce7')
    appliedIds.push(fieldId)
    await pause(180)
  }

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
  const allControls = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
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
  const waitForRender = async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await pause(140)
  }
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
      markUnavailable(fieldId, element)
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
    await pause(220)
    selectContainer.click()
    await waitForRender()
    const options = Array.from(document.querySelectorAll('.ud__select-option, .ud__select-dropdown-option, .ud__select-option-item, .el-select-dropdown__item, .ant-select-item-option, .arco-select-option, .semi-select-option, [role="option"]'))
      .filter(option => isVisible(option) && option.getAttribute('aria-disabled') !== 'true' && !option.classList.contains('is-disabled'))
    const exactMatches = options.filter(option => normalizeOption(option.textContent) === normalizeOption(entry.value))
    const wanted = normalizeOption(entry.value)
    const relaxedWanted = wanted.replace(/[省市]$/, '')
    const matches = exactMatches.length ? exactMatches : options.filter((option) => {
      const optionValue = normalizeOption(option.textContent)
      return Boolean(optionValue) && (optionValue.replace(/[省市]$/, '') === relaxedWanted
        || optionValue.includes(wanted)
        || wanted.includes(optionValue))
    })
    if (matches.length !== 1) {
      markUnavailable(fieldId, element)
      continue
    }
    matches[0].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    await pause(120)
    matches[0].click()
    await waitForRender()
    const selectedText = normalizeOption(selectContainer.textContent)
    if (normalizeOption(element.value ?? element.textContent) !== normalizeOption(entry.value) && !selectedText.includes(normalizeOption(entry.value))) {
      markUnavailable(fieldId, element)
      continue
    }
    mark(element, '#dcfce7')
    appliedIds.push(fieldId)
    await pause(180)
  }

  for (const entry of entries) {
    if (!seenIds.has(entry.fieldId) && unresolvedIds.has(entry.fieldId)) unavailableIds.push(entry.fieldId)
  }
  return { appliedIds, skippedExistingIds, unavailableIds }
}
