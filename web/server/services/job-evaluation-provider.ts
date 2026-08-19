import { jobEvaluationResultSchema, type JobPreferenceInput } from '../schemas/job-evaluation'
import { callStructuredAi } from './openai-compatible-json.service'

export interface JobEvaluationContext {
  companyName: string
  jobTitle: string
  jobDescription: string
  preference: JobPreferenceInput
  resumeText: string
}

export const jobEvaluationProvider = {
  evaluate: (context: JobEvaluationContext) => callStructuredAi({
    system: '你是严谨的求职岗位评估 Agent。只能使用用户提供的 JD、偏好和简历事实，不得编造经历。所有证据必须能在输入中直接找到。输出中文 JSON。',
    task: '提取岗位要求，对照简历证据，识别缺口与风险，计算 0-100 整数匹配分并给出投递优先级和投递前建议。输出字段必须严格为 roleRequirements、resumeMatches、gapsAndRisks、matchScore、priority、preApplicationAdvice。',
    payload: context,
    schema: jobEvaluationResultSchema,
  }),
}
