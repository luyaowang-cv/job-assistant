import type { InterviewPrepSection } from '../schemas/interview-prep'

export interface InterviewReflectionEntry {
  id: string
  date: string
  recordText: string
  extracted: {
    keyPoints: string[]
    questions: string[]
    weaknesses: string[]
    nextFocus: string[]
  }
}

function bullet(items: string[]) {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- （无）'
}

export function buildInterviewPrepMarkdown(input: {
  resumeLabel: string
  sections: InterviewPrepSection[]
  reflection: InterviewReflectionEntry[]
  provider: string
  model: string
  updatedAt?: Date | string
}) {
  const lines: string[] = []
  lines.push('# 面试资料')
  lines.push('')
  lines.push(`> 简历版本：${input.resumeLabel}`)
  lines.push(`> 生成模型：${input.provider} / ${input.model}`)
  if (input.updatedAt) lines.push(`> 更新时间：${new Date(input.updatedAt).toLocaleString('zh-CN')}`)
  lines.push('')
  for (const section of input.sections) {
    lines.push(`## ${section.title}`)
    lines.push('')
    lines.push(section.content)
    lines.push('')
  }
  if (input.reflection.length) {
    lines.push('---')
    lines.push('')
    lines.push('# 面试复盘')
    lines.push('')
    for (const entry of input.reflection) {
      lines.push(`## ${entry.date}`)
      lines.push('')
      lines.push('**关键信息**')
      lines.push('')
      lines.push(bullet(entry.extracted.keyPoints))
      lines.push('')
      lines.push('**被问到的问题**')
      lines.push('')
      lines.push(bullet(entry.extracted.questions))
      lines.push('')
      lines.push('**不足与改进**')
      lines.push('')
      lines.push(bullet(entry.extracted.weaknesses))
      lines.push('')
      lines.push('**下次重点**')
      lines.push('')
      lines.push(bullet(entry.extracted.nextFocus))
      lines.push('')
    }
  }
  return lines.join('\n')
}