import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional()
const date = z.string().trim().regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/).optional()
const educationEndDate = z.string().trim().regex(/^(?:\d{4}(?:-\d{2})?(?:-\d{2})?|至今)$/).optional()

export const commonBasicsSchema = z.object({
  fullName: text(80), countryRegion: text(80), gender: text(20), email: z.string().trim().email().max(160).optional(),
  birthDate: date, wechatId: text(80), targetCities: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  documentType: text(40), documentNumber: z.string().trim().min(6).max(80).optional(),
  phone: z.string().trim().regex(/^[+()\-\s\d]{6,32}$/).optional(), politicalStatus: text(60), city: text(120),
  ethnicity: text(40), nativePlace: text(160), householdLocation: text(160),
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
export const personalProfileSchema = z.object({ basics: commonBasicsSchema.default({}), educations: z.array(educationSchema).max(10).default([]) }).strict()
export type CommonBasics = z.infer<typeof commonBasicsSchema>
export type Education = z.infer<typeof educationSchema>
export type PersonalProfileInput = z.infer<typeof personalProfileSchema>
