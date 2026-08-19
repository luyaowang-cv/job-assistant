import type { InterviewPrepBlock, InterviewReviewEntry } from '../schemas/interview-record'

const kindLabels: Record<string, string> = {
  KNOWLEDGE: '知识点复习',
  QUESTION_ASK: '提问面试官的问题',
  ROLE_POINT: '岗位针对性准备要点',
}

function bullet(items: string[]) {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- （无）'
}

export function buildInterviewRecordMarkdown(input: {
  companyName?: string | null
  jobTitle?: string | null
  jdText?: string | null
  round?: string | null
  interviewAt?: Date | string | null
  methodAndAddress?: string | null
  briefNote?: string | null
  prepBlocks: InterviewPrepBlock[]
  prepNotes?: string | null
  review: InterviewReviewEntry[]
  provider: string
  model: string
  updatedAt?: Date | string
}) {
  const lines: string[] = []
  lines.push('# 面试记录')
  lines.push('')
  lines.push(`> 生成模型：${input.provider} / ${input.model}`)
  if (input.updatedAt) lines.push(`> 更新时间：${new Date(input.updatedAt).toLocaleString('zh-CN')}`)
  lines.push('')

  const meta: Array<[string, string]> = []
  if (input.companyName) meta.push(['公司', input.companyName])
  if (input.jobTitle) meta.push(['岗位', input.jobTitle])
  if (input.round) meta.push(['面试轮次', input.round])
  if (input.interviewAt) meta.push(['面试时间', new Date(input.interviewAt).toLocaleString('zh-CN')])
  if (input.methodAndAddress) meta.push(['面试方式/地址', input.methodAndAddress])
  if (input.briefNote) meta.push(['备注', input.briefNote])
  if (meta.length) {
    lines.push('## 面试信息')
    lines.push('')
    for (const [label, value] of meta) lines.push(`- **${label}**：${value}`)
    lines.push('')
  }

  if (input.jdText) {
    lines.push('## JD 原文')
    lines.push('')
    lines.push(input.jdText)
    lines.push('')
  }

  lines.push('## 面试准备')
  lines.push('')
  const byKind = new Map<string, InterviewPrepBlock[]>()
  for (const block of input.prepBlocks) {
    const list = byKind.get(block.kind) ?? []
    list.push(block)
    byKind.set(block.kind, list)
  }
  for (const kind of ['KNOWLEDGE', 'QUESTION_ASK', 'ROLE_POINT']) {
    const blocks = byKind.get(kind)
    if (!blocks?.length) continue
    lines.push(`### ${kindLabels[kind] ?? kind}`)
    lines.push('')
    for (const block of blocks) {
      lines.push(`#### ${block.title}`)
      lines.push('')
      lines.push(block.content)
      lines.push('')
    }
  }
  if (input.prepNotes) {
    lines.push('### 本场笔记 / 项目问答')
    lines.push('')
    lines.push(input.prepNotes)
    lines.push('')
  }

  if (input.review.length) {
    lines.push('---')
    lines.push('')
    lines.push('# 面试复盘')
    lines.push('')
    for (const entry of input.review) {
      lines.push(`## ${entry.date}`)
      lines.push('')
      lines.push('**被问到的问题**')
      lines.push('')
      lines.push(bullet(entry.extracted.questionsAsked))
      lines.push('')
      lines.push('**发挥不错的地方**')
      lines.push('')
      lines.push(bullet(entry.extracted.strengths))
      lines.push('')
      lines.push('**不足与改进点**')
      lines.push('')
      lines.push(bullet(entry.extracted.improvements))
      lines.push('')
    }
  }
  return lines.join('\n')
}