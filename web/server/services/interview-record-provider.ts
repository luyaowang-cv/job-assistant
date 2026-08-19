import { interviewPrepBlocksSchema, interviewReviewExtractedSchema } from '../schemas/interview-record'
import { callStructuredAi } from './openai-compatible-json.service'

type AiDependencies = Parameters<typeof callStructuredAi>[1]

export interface InterviewRecordGenerateContext {
  companyName?: string | null
  jobTitle?: string | null
  jdText?: string | null
  resumeContent: string
  materialCardsDigest: string
}

export const interviewRecordProvider = {
  generate: (context: InterviewRecordGenerateContext, dependencies?: AiDependencies) => callStructuredAi({
    system: '你是一名资深的求职面试教练，帮助候选人把已有素材转化为针对本场面试的复习材料。必须基于用户提供的 JD、简历版本与素材卡片组织内容，不得虚构简历中不存在的经历、技能、公司或项目；可以基于 JD 与通用知识合理扩展知识面。输出中文 JSON。',
    task: '生成面试准备内容，按 kind 分为三类：KNOWLEDGE 针对不同项目经历/实习经历生成本场需要复习的知识点；QUESTION_ASK 生成要提问面试官的问题；ROLE_POINT 生成岗位针对性准备要点。直接返回 JSON 数组本身，元素为 { id, kind, title, content }，content 使用 Markdown。',
    payload: context,
    schema: interviewPrepBlocksSchema,
    timeoutMs: 120_000,
  }, dependencies),

  extractReview: (context: { transcript: string }, dependencies?: AiDependencies) => callStructuredAi({
    system: '你是一名严谨的面试复盘助手。只摘抄和归纳用户提供的录音文字内容，不虚构内容。输出中文 JSON。',
    task: '从录音文字内容中提取：questionsAsked 为被问到的问题，strengths 为发挥不错的地方，improvements 为不足与改进点。每个字段为字符串数组。',
    payload: context,
    schema: interviewReviewExtractedSchema,
    timeoutMs: 60_000,
  }, dependencies),
}

/** 测试/离线演示用 Mock：固定输出，provider=MOCK，零外部网络调用。 */
export const interviewRecordMockProvider = {
  generate: async () => ({
    data: [
      { id: 'mock-1', kind: 'KNOWLEDGE' as const, title: 'Mock 知识点', content: '复习 Vue 响应式' },
      { id: 'mock-2', kind: 'QUESTION_ASK' as const, title: 'Mock 反问', content: '团队如何分工' },
    ],
    provider: 'MOCK' as const,
    model: 'local-interview-record-v1',
  }),
  extractReview: async () => ({
    data: {
      questionsAsked: ['Mock 问题'],
      strengths: ['Mock 亮点'],
      improvements: ['Mock 改进'],
    },
    provider: 'MOCK' as const,
    model: 'local-interview-record-v1',
  }),
}