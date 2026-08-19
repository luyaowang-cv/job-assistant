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
    .sort((a, b) => a.section.localeCompare(b.section) || a.sortOrder - b.sortOrder)
    .map(reference => ({
      id: reference.id,
      cardId: reference.card.id,
      variantId: reference.variant.id,
      section: reference.section,
      fieldKey: reference.fieldKey ?? null,
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
    educations: input.educations ?? [],
    references: visibleReferences,
    blocks,
    legacyContent: input.legacyContent ?? null,
    source: input.legacyContent && !input.references.length ? 'LEGACY_SNAPSHOT' as const : 'COMPOSITION' as const,
  }
}
