import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional()
const fieldId = z.string().trim().min(1).max(120)

// The user explicitly chooses Fill in this local single-user product, so the
// complete saved candidate profile may be sent to their configured AI provider.
// These controls are not candidate-profile fields and remain outside the flow.
const excludedFieldLabel = /(?:密码|口令|验证码|校验码|动态码|短信码|银行|支付|隐私|授权|同意声明|法律声明|上传|附件|文件|password|passcode|captcha|verification|bank|payment|privacy|consent|upload|attachment)/i

export const formFillFieldSchema = z.object({
  id: fieldId,
  label: text(180),
  context: text(240),
  name: text(160),
  placeholder: text(180),
  inputType: text(40),
  controlType: z.enum(['input', 'textarea', 'select', 'radio-group', 'custom-select']),
  options: z.array(z.string().trim().min(1).max(160)).max(80).default([]),
  multiple: z.boolean().default(false),
}).strict().superRefine((field, ctx) => {
  const identity = [field.label, field.context, field.name, field.placeholder].filter(Boolean).join(' | ')
  if (excludedFieldLabel.test(identity) || ['password', 'file', 'checkbox'].includes(field.inputType ?? '')) {
    ctx.addIssue({ code: 'custom', message: 'Field is excluded from AI form filling.' })
  }
  if (field.multiple) ctx.addIssue({ code: 'custom', message: 'Multiple-select fields are excluded from AI form filling.' })
})

export const formFillPreviewSchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  fields: z.array(formFillFieldSchema).min(1).max(100),
}).strict()

const modelFillSchema = z.object({
  fieldId,
  value: z.string().trim().min(1).max(4_000),
}).strict()

export const modelFormFillResponseSchema = z.object({
  fills: z.array(modelFillSchema).max(100).default([]),
  unresolvedIds: z.array(fieldId).max(100).default([]),
}).strict()

export type FormFillPreviewInput = z.infer<typeof formFillPreviewSchema>
