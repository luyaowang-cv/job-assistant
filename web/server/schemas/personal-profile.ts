import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional()
const date = z.string().trim().regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/).optional()
const educationEndDate = z.string().trim().regex(/^(?:\d{4}(?:-\d{2})?(?:-\d{2})?|至今)$/).optional()

export const commonBasicsSchema = z.object({
  fullName: text(80), countryRegion: text(80), gender: text(20), email: z.string().trim().email().max(160).optional(),
  // birthDate 只做格式校验（YYYY / YYYY-MM / YYYY-MM-DD 都放行）：页面用日期选择器提交 YYYY-MM-DD，
  // 但历史数据里存在只填年月的值，收紧会让人一保存就失败。
  birthDate: date, wechatId: text(80),
  documentType: text(40), documentNumber: z.string().trim().min(6).max(80).optional(),
  phone: z.string().trim().regex(/^[+()\-\s\d]{6,32}$/).optional(), politicalStatus: text(60), city: text(120),
  ethnicity: text(40),
  // 籍贯 / 生源地 / 户籍所在地 是三件事，网申表单常常分开问，以前插件把它们当同一个字段。
  // 现在拆开：nativePlace=籍贯、originPlace=生源地、householdLocation=户籍所在地。
  nativePlace: text(160), originPlace: text(160), householdLocation: text(160),
  // 户籍类型（城镇/农村）和「户籍所在地」不是一回事，别混。
  householdType: text(40), healthStatus: text(40),
  specialty: text(200), hobbies: text(200),
  heightCm: z.number().int().min(30).max(300).optional(), weightKg: z.number().min(1).max(500).optional(), maritalStatus: text(40),
  emergencyContactName: text(80), emergencyContactRelation: text(40),
  emergencyContactPhone: z.string().trim().regex(/^[+()\-\s\d]{6,32}$/).optional(),
}).strict()

export const educationSchema = z.object({
  school: text(160), major: text(120),
  // degree is retained for existing records. New UI should use educationLevel/academicDegree.
  degree: text(80), educationLevel: text(80), academicDegree: text(80),
  gpa: z.number().min(0).max(10).optional(),
  gpaScale: z.number().positive().max(100).optional(), ranking: text(80), campusRole: text(120),
  college: text(160), lab: text(160), researchDirection: text(200), advisor: text(80),
  startDate: date, endDate: educationEndDate,
}).strict()
/**
 * 家庭成员。放主档案、不做素材卡——姓名/关系/工作单位拼不出简历上的一段话，
 * 属于「不变的身份信息」而不是「要挑着用的素材」。
 *
 * 注意 `age` 是会失真的字段（每年都变）。之所以存年龄而不是生日，是因为父辈的出生日期
 * 通常没人记得；代价是填过一次之后要自己记得回来改。
 */
export const familyMemberSchema = z.object({
  name: text(80),
  relation: text(40),
  organization: text(160),
  role: text(80),
  phone: z.string().trim().regex(/^[+()\-\s\d]{6,32}$/).optional(),
  age: z.number().int().min(0).max(150).optional(),
  politicalStatus: text(60),
  nativePlace: text(160),
}).strict()
export const personalProfileSchema = z.object({
  basics: commonBasicsSchema.default({}),
  educations: z.array(educationSchema).max(10).optional(),
  // 必须 optional：页面某次没提交这个字段时，服务端要「不动它」。
  // 写成 default([]) 会把它覆盖成空数组——educations 上一轮就是这么差点丢数据的。
  familyMembers: z.array(familyMemberSchema).max(12).optional(),
}).strict()
export type CommonBasics = z.infer<typeof commonBasicsSchema>
export type Education = z.infer<typeof educationSchema>
export type FamilyMember = z.infer<typeof familyMemberSchema>
export type PersonalProfileInput = z.infer<typeof personalProfileSchema>
