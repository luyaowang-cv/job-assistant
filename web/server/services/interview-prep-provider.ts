import { interviewPrepSectionsSchema, interviewReflectionExtractedSchema } from '../schemas/interview-prep'
import { callStructuredAi } from './openai-compatible-json.service'

type AiDependencies = Parameters<typeof callStructuredAi>[1]

export interface InterviewPrepContext {
  resumeContent: string
  resumeLabel: string
  jdText: string
  extraText: string
}

export const interviewPrepProvider = {
  generate: (context: InterviewPrepContext, dependencies?: AiDependencies) => callStructuredAi({
    system: '你是一名资深的求职面试教练，帮助候选人把已有材料转化为非常全面的面试资料。必须基于用户提供的简历与补充材料组织内容，不得虚构简历中不存在的经历、技能、公司、项目或数据；可以基于 JD 与通用知识合理扩展知识面。输出中文 JSON。',
    task: '生成一份非常全面的面试资料，按顺序包含以下部分：1 自我介绍（分别给出 30 秒、1 分钟、2 分钟版本，结合岗位与公司特点）；2 岗位与公司认知（JD 拆解、岗位要求、公司/行业背景与可能的业务问题）；3 高频面试问题与回答要点（每个问题给出结构清晰、可直接背诵的回答要点）；4 项目与实习深挖（基于简历与补充材料，预判追问并准备量化成果、难点、复盘与 STAR 表述）；5 专业知识储备（覆盖岗位核心技能、常见原理、前沿趋势与开放题）；6 压力题与随机应变（刁钻问题、行为问题、情境题）；7 反问面试官的问题。每一部分都要详细、充实、知识面广。直接返回 JSON 数组本身，元素为 { id, title, content }，content 使用 Markdown；不要使用 { sections: [...] } 之类的包装对象。',
    payload: context,
    schema: interviewPrepSectionsSchema,
    timeoutMs: 120_000,
  }, dependencies),

  extractReflection: (context: { recordText: string }, dependencies?: AiDependencies) => callStructuredAi({
    system: '你是一名严谨的面试复盘助手。只摘抄和归纳用户提供的面试记录，不虚构记录中不存在的内容。输出中文 JSON。',
    task: '从面试记录中提取关键信息，输出结构化 JSON：keyPoints 为面试中的关键信息与要点，questions 为被问到的问题，weaknesses 为暴露的不足与改进点，nextFocus 为下次面试的改进重点。每个字段为字符串数组。',
    payload: context,
    schema: interviewReflectionExtractedSchema,
    timeoutMs: 60_000,
  }, dependencies),
}