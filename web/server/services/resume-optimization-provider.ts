import { resumeOptimizationResultSchema } from '../schemas/resume'
import { callStructuredAi } from './openai-compatible-json.service'

export interface ResumeOptimizationContext {
  baseContent: string
  companyName: string
  jobTitle: string
  jobDescription: string
  evaluationOutput?: unknown
}

export const resumeOptimizationProvider = {
  preview: (context: ResumeOptimizationContext) => callStructuredAi({
    system: '你是简历优化 Agent。保持原简历的真实事实边界，只能重组、压缩和润色已有内容；不得编造经历、数字、技术或成果。输出中文 JSON。',
    task: '针对 JD 返回完整 optimizedContent 和 1-12 条 changeSummary。优化稿必须可直接作为完整简历文本使用；每条修改摘要都要引用输入中的 evidence。',
    payload: context,
    schema: resumeOptimizationResultSchema,
    timeoutMs: 90_000,
  }),
}
