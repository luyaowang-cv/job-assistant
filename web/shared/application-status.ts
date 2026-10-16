// 投递状态机：唯一的定义处。
//
// 客户端（app/）和服务端（server/）都从这里取。之前这套「顺序 + 文案 + 配色」重复写在
// 6 个地方（投递看板页、首页、zod 校验、dashboard 服务、以及各自的文案/配色表），
// 加一个状态要改六遍、漏一处就是界面和校验对不上。现在只改这一份。
//
// 放在 Nuxt 4 的 shared/ 目录里，两边都能 import（别名 #shared）。
// #shared 在三种加载器下都验证过可用：Vite（客户端）、Nitro（服务端）、裸 tsx（跑单测，
// 靠 web/tsconfig.json → .nuxt/tsconfig.json 里的 paths）。所以单测里也能直接 import。

/** 顺序 = 招聘流程顺序，也是看板从左到右的列顺序 */
export const APPLICATION_STATUSES = [
  'SAVED',
  'APPLIED',
  'ASSESSMENT',
  'AI_INTERVIEW',
  'WRITTEN_TEST',
  'INTERVIEWING',
  'OFFERED',
  'REJECTED',
  'WITHDRAWN',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: '收藏',
  APPLIED: '已投递',
  ASSESSMENT: '测评中',
  AI_INTERVIEW: 'AI面试',
  WRITTEN_TEST: '笔试中',
  INTERVIEWING: '面试中',
  OFFERED: 'Offer',
  REJECTED: '挂了',
  WITHDRAWN: '放弃',
}

export type ApplicationStatusTone = 'neutral' | 'amber' | 'blue' | 'violet' | 'teal' | 'green' | 'success' | 'danger'

// 配色分组，对应 index.scss 里的 .application-status--*。
// 每一档都保留原来的颜色，只给新增的「测评中」「AI面试」补了 amber / teal 两个。
export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, ApplicationStatusTone> = {
  SAVED: 'neutral',
  APPLIED: 'blue',
  ASSESSMENT: 'amber',
  AI_INTERVIEW: 'teal',
  WRITTEN_TEST: 'violet',
  INTERVIEWING: 'green',
  OFFERED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
}

export const APPLICATION_STATUS_OPTIONS: Array<{ value: ApplicationStatus, label: string }> =
  APPLICATION_STATUSES.map(value => ({ value, label: APPLICATION_STATUS_LABELS[value] }))

export function applicationStatusLabel(status: ApplicationStatus) {
  return APPLICATION_STATUS_LABELS[status] ?? status
}

export function applicationStatusTone(status: ApplicationStatus) {
  return APPLICATION_STATUS_TONES[status] ?? 'neutral'
}
