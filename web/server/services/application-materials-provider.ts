import { applicationMaterialsDraftSchema } from '../schemas/application-materials'
import { callStructuredAi } from './openai-compatible-json.service'

export interface ApplicationMaterialsContext {
  companyName: string
  jobTitle: string
  jobDescription: string
  resumeText: string
  evaluationOutput?: unknown
}

export const applicationMaterialsProvider = {
  preview: (context: ApplicationMaterialsContext) => callStructuredAi({
    system: '你是求职投递材料 Agent。只使用输入中的 JD、简历和评估事实，不得新增未出现的公司、项目、技术、数字或成果。输出中文 JSON。',
    task: '生成结构化投递材料：1-8 条 resumeSuggestions、1-6 条 rewrittenSections，以及 short、standard、technicalHighlight 三版 greetings。每一项必须附带可核对的 JD 或简历 evidence。',
    payload: context,
    schema: applicationMaterialsDraftSchema,
  }),
}
