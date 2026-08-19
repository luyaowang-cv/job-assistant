import { resolveResumeVersion } from './document-composition.service'

export async function exportResumeMarkdown(resumeId: string, versionId: string) {
  const result = await resolveResumeVersion(resumeId, versionId)
  if (!result) return null
  if (result.resolved.source === 'LEGACY_SNAPSHOT') return result.resolved.legacyContent ?? ''
  const lines: string[] = []
  const basics = Object.entries(result.resolved.basics).filter(([, value]) => value != null && value !== '')
  if (basics.length) lines.push('# 基础信息', '', ...basics.map(([key, value]) => `- **${key}**：${String(value)}`), '')
  for (const reference of result.resolved.references) lines.push(`## ${reference.title}`, '', reference.content, '')
  return lines.join('\n').trim()
}

export function documentExportCapabilities() {
  return [
    { format: 'MARKDOWN', status: 'AVAILABLE' },
    { format: 'PDF', status: 'PLANNED' },
    { format: 'DOCX', status: 'PLANNED' },
  ]
}
