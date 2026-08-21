import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional()
const fieldId = z.string().trim().min(1).max(120)
const formOptions = z.array(z.string().trim().max(500)).max(1_000).default([])
  .transform(options => options.filter(Boolean))

// The user explicitly chooses Fill in this local single-user product, so the
// complete saved candidate profile may be sent to their configured AI provider.
// These controls are not candidate-profile fields and remain outside the flow.
const excludedFieldLabel = /(?:密码|口令|验证码|校验码|动态码|短信码|银行|支付|隐私|授权|同意声明|法律声明|上传|附件|文件|password|passcode|captcha|verification|bank|payment|privacy|consent|upload|attachment)/i

export const formFillFieldSchema = z.object({
  id: fieldId,
  label: text(500),
  context: text(1_000),
  name: text(500),
  placeholder: text(500),
  inputType: text(40),
  controlType: z.enum(['input', 'textarea', 'select', 'radio-group', 'custom-select']),
  options: formOptions,
  multiple: z.boolean().default(false),
}).strict()

export type FormFillField = z.infer<typeof formFillFieldSchema>

export function isAiFillEligibleField(field: FormFillField) {
  // Context contains neighbouring labels and may mention a consent field next
  // to an ordinary input. Only the field's own identity controls exclusion.
  const identity = [field.label, field.name, field.placeholder].filter(Boolean).join(' | ')
  return !excludedFieldLabel.test(identity)
    && !['password', 'file', 'checkbox'].includes(field.inputType ?? '')
    && !field.multiple
}

export const formFillPreviewSchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  fields: z.array(formFillFieldSchema).min(1).max(500),
}).strict()

const modelFillSchema = z.object({
  fieldId,
  value: z.string().trim().min(1).max(4_000),
}).strict()

export const modelFormFillResponseSchema = z.object({
  fills: z.array(modelFillSchema).max(250).default([]),
  unresolvedIds: z.array(fieldId).max(250).default([]),
}).strict()

export type FormFillPreviewInput = z.infer<typeof formFillPreviewSchema>
