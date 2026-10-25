export type ResolverReference = {
  id?: string
  cardId: string
  variantId: string
  section: string
  fieldKey?: string | null
  sortOrder: number
  visible: boolean
  renderRules: unknown
  card: { id: string, title: string, type: string, facts?: unknown, archivedAt?: Date | string | null }
  variant: { id: string, name: string, content: string }
}

export function countCodePoints(value: string) {
  return Array.from(value).length
}

/** 只需要这几个字段，所以不依赖完整的 ResolverReference。 */
type EducationReferenceInput = {
  visible?: boolean
  /** 引用挂在哪个区块下。老档案的教育可能挂在自定义模块（block-xxx）里，所以要看它 */
  section?: string
  sortOrder: number
  card: { id?: string, type: string, title: string, facts?: unknown }
}

/**
 * 教育背景卡片 → 简历/网申要的 `educations` 数组项。
 *
 * 卡片的标题是学校名，其余（学院、专业、学历、GPA、导师…）都在 facts 里；`educationUnit`
 * 和插件的 education 段读的是同一套键，所以这里只是把两者拼起来，不做形状翻译。
 *
 * **顺序按引用顺序（sortOrder）**：用户在简历里拖动教育卡就是在定顺序，再按毕业时间重排
 * 等于让拖动失效。
 *
 * 返回 null 表示"这份文档没有引用教育卡"。2026-10-24 起调用方**不再回退**到主档案的
 * educations 数组（教育已全部迁成素材卡，个人档案页也不再编辑它），所以 null 就是"这段不显示"。
 * 这就是「高中那张不引用就不出现」的实现位置。
 */
export function educationsFromReferences(references: EducationReferenceInput[]): unknown[] | null {
  const education = references
    .filter(reference => reference.visible !== false && reference.card.type === 'EDUCATION')
    // 认得出的教育区块排前面：老档案里"教育背景"常挂在自定义模块下（section 是 block-xxx），
    // 而新页面把教育放进 section='education'。两者都该被认，但顺序要优先前者。
    .sort((left, right) => {
      const leftPriority = left.section === 'education' ? 0 : 1
      const rightPriority = right.section === 'education' ? 0 : 1
      return leftPriority - rightPriority || left.sortOrder - right.sortOrder
    })
  if (!education.length) return null
  // 同一张卡被引用多次只算一次：否则一张教育卡插两行就会让简历上出现两段一样的学历。
  const seen = new Set<string>()
  const unique = education.filter((reference) => {
    const id = reference.card.id
    if (!id) return true
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return unique.map(reference => ({
    ...(reference.card.facts && typeof reference.card.facts === 'object' ? reference.card.facts as Record<string, unknown> : {}),
    school: reference.card.title,
  }))
}

export function resolveDocument(input: {
  basics?: Record<string, unknown>
  educations?: unknown[]
  fieldVisibility?: Record<string, boolean>
  references: ResolverReference[]
  blocks?: Array<{ key: string, title: string, fields: Array<{ key: string, label: string, text?: string, limit?: number | null, referenceId?: string | null }> }>
  legacyContent?: string
}) {
  const visibility = input.fieldVisibility ?? {}
  const basics = Object.fromEntries(Object.entries(input.basics ?? {}).filter(([key]) => visibility[key] !== false))
  const visibleReferences = input.references
    .filter(reference => reference.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.section.localeCompare(b.section))
    .map(reference => ({
      id: reference.id,
      cardId: reference.card.id,
      variantId: reference.variant.id,
      section: reference.section,
      sortOrder: reference.sortOrder,
      fieldKey: reference.fieldKey ?? null,
      renderRules: reference.renderRules,
      title: reference.card.title,
      type: reference.card.type,
      facts: reference.card.facts && typeof reference.card.facts === 'object' ? reference.card.facts : {},
      variantName: reference.variant.name,
      content: reference.variant.content,
      source: 'MATERIAL_VARIANT' as const,
    }))
  const referenceById = new Map(visibleReferences.map(reference => [reference.id, reference]))
  const blocks = (input.blocks ?? []).map(block => ({
    ...block,
    fields: block.fields.map(field => {
      const inserted = field.referenceId
        ? referenceById.get(field.referenceId)?.content
        : visibleReferences.find(reference => reference.fieldKey === field.key)?.content
      const text = inserted ?? field.text ?? ''
      const count = countCodePoints(text)
      return { ...field, text, count, limit: field.limit ?? null, overLimit: field.limit != null && count > field.limit }
    }),
  }))
  return {
    basics,
    educations: visibility.educations === false ? [] : (input.educations ?? []),
    references: visibleReferences,
    blocks,
    legacyContent: input.legacyContent ?? null,
    source: input.legacyContent && !input.references.length ? 'LEGACY_SNAPSHOT' as const : 'COMPOSITION' as const,
  }
}
