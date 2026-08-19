import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional()
// 空串/null 视作「未填写」，避免前端把可到岗日期等留空时（发送 ''）触发校验失败。
const date = z.preprocess(
  value => (value === '' || value === null ? undefined : value),
  z.string().trim().regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/, '日期格式应为 YYYY、YYYY-MM 或 YYYY-MM-DD。').optional(),
)

const basicsSchema = z.object({
  fullName: text(80),
  phone: z.string().trim().regex(/^[+()\-\s\d]{6,32}$/, '手机号格式不正确。').optional(),
  email: z.string().trim().email().max(160).optional(),
  city: text(120),
}).strict()

const educationSchema = z.object({ school: text(160), major: text(120), degree: text(80), startDate: date, endDate: date }).strict()
const workExperienceSchema = z.object({ company: text(160), title: text(120), startDate: date, endDate: date, description: text(4_000) }).strict()
const projectSchema = z.object({ name: text(160), role: text(120), startDate: date, endDate: date, description: text(4_000) }).strict()
const namedDetailSchema = z.object({ name: z.string().trim().min(1).max(120), detail: text(500) }).strict()
const experienceSchema = z.object({ name: z.string().trim().min(1).max(160), startDate: date, endDate: date, description: text(2_000) }).strict()
const applicationStrategySchema = z.object({
  targetLocations: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  expectedSalary: text(80), availableDate: date, recruitmentSource: text(120), referralCode: text(160),
}).strict()

export const applicationProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetTags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  strategy: applicationStrategySchema.default({ targetLocations: [] }),
  resumeVersionId: z.string().trim().min(1).max(64).nullable().optional(),
  // Legacy content remains readable for existing profiles. Omitting it during a
  // strategy-only update must not erase data before the future material library migrates it.
  basics: basicsSchema.optional(),
  educations: z.array(educationSchema).max(10).optional(),
  workExperiences: z.array(workExperienceSchema).max(12).optional(),
  projects: z.array(projectSchema).max(12).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  languages: z.array(namedDetailSchema).max(20).optional(),
  certificates: z.array(namedDetailSchema).max(20).optional(),
  campusExperiences: z.array(experienceSchema).max(12).optional(),
  awards: z.array(namedDetailSchema).max(20).optional(),
}).strict()

export const applicationProfileIdSchema = z.object({
  id: z.string().trim().min(1).max(64),
}).strict()

export type ApplicationProfileInput = z.infer<typeof applicationProfileSchema>
export type ApplicationStrategy = z.infer<typeof applicationStrategySchema>
