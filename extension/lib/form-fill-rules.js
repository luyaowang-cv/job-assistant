/**
 * Local-only form matching rules for F-005B.
 *
 * This module deliberately does not know about the DOM. Callers must pass
 * hasValue rather than the value itself, so existing page input can neither be
 * retained nor appear in the report.
 */

const SENSITIVE_PATTERNS = [
  /(?:password|passcode|密码|口令)/i,
  /(?:captcha|verification\s*code|verify\s*code|验证码|校验码|动态码|短信码)/i,
  /(?:身份证|证件号|证件号码|护照|passport|identity\s*(?:card|number)|id\s*(?:card|number))/i,
  /(?:银行卡|银行账户|开户行|bank\s*(?:card|account)|payment|支付)/i,
  /(?:隐私|个人信息授权|隐私政策|同意声明|法律声明|授权声明|privacy|consent|declaration|agreement)/i,
  /(?:上传|附件|文件|upload|attachment|resume\s*file)/i,
]

const CATEGORY_PATTERNS = [
  ['education', /(?:教育|学历|学校|院校|专业|学位|毕业|education|school|university|major|degree)/i],
  ['work', /(?:工作经历|工作经验|任职|雇主|公司经历|work\s*(?:experience|history)|employment)/i],
  ['project', /(?:项目经历|项目经验|项目名称|project)/i],
  ['skill', /(?:技能|技术栈|skill|technology)/i],
  ['language', /(?:语言能力|外语|language)/i],
  ['certificate', /(?:证书|资格证|certificat|qualification)/i],
  ['campus', /(?:校园|社团|学生工作|campus)/i],
  ['award', /(?:获奖|奖项|荣誉|award|honou?r)/i],
]

const BASIC_RULES = [
  {
    target: 'fullName',
    category: 'basic',
    matches: /^(?:姓名|真实姓名|中文姓名|英文姓名|full\s*name|legal\s*name)$/i,
    reason: '字段标签与“姓名”唯一匹配。',
  },
  {
    target: 'phone',
    category: 'basic',
    matches: /^(?:手机(?:号码|号)?|移动电话|联系电话|mobile(?:\s*(?:phone|number))?|phone(?:\s*number)?)$/i,
    reason: '字段标签与“手机号”唯一匹配。',
  },
  {
    target: 'email',
    category: 'basic',
    matches: /^(?:邮箱|电子邮箱|电子邮件|email(?:\s*address)?)$/i,
    reason: '字段标签与“邮箱”唯一匹配。',
  },
  {
    target: 'city',
    category: 'basic',
    matches: /^(?:所在城市|现居城市|居住城市|居住地|常住地|city\s*of\s*residence|residence\s*city)$/i,
    reason: '字段标签与“所在城市”唯一匹配。',
  },
  {
    target: 'countryRegion',
    category: 'basic',
    matches: /^(?:国家(?:\s*\/\s*地区)?|国家地区|国籍|country(?:\s*\/\s*region)?|nationality)$/i,
    reason: '字段标签与“国家/地区”唯一匹配。',
  },
  {
    target: 'gender',
    category: 'basic',
    matches: /^(?:性别|gender)$/i,
    reason: '字段标签与“性别”唯一匹配。',
  },
  {
    target: 'targetCity',
    category: 'basic',
    matches: /^(?:期望(?:工作)?地点|意向(?:工作)?地点|期望城市|意向城市|expected\s*(?:work\s*)?(?:location|city)|preferred\s*(?:location|city))$/i,
    reason: '字段标签明确为期望工作地点，使用个人档案中的第一意向城市。',
  },
  {
    target: 'wechatId',
    category: 'basic',
    matches: /^(?:微信(?:号)?|wechat(?:\s*id)?)$/i,
    reason: '字段标签与“微信号”唯一匹配。',
  },
  {
    target: 'politicalStatus',
    category: 'basic',
    matches: /^(?:政治面貌|political\s*status)$/i,
    reason: '字段标签与“政治面貌”唯一匹配。',
  },
  {
    target: 'documentType',
    category: 'basic',
    matches: /^(?:个人证件(?:类型)?|证件类型|document\s*type)$/i,
    reason: '字段标签与“证件类型”唯一匹配。',
  },
  {
    target: 'age',
    category: 'basic',
    matches: /^(?:年龄|age)$/i,
    reason: '由档案中的完整出生日期按当前日期计算年龄。',
  },
  { target: 'birthDate', category: 'basic', matches: /^(?:出生日期|出生年月|birth\s*date|date\s*of\s*birth)$/i, reason: '明确出生日期字段。' },
  { target: 'ethnicity', category: 'basic', matches: /^(?:民族|ethnicity)$/i, reason: '明确民族字段。' },
  { target: 'nativePlace', category: 'basic', matches: /^(?:籍贯|native\s*place|hometown)$/i, reason: '明确籍贯字段。' },
  { target: 'householdLocation', category: 'basic', matches: /^(?:户口所在地|户籍所在地|household\s*(?:location|registration))$/i, reason: '明确户口所在地字段。' },
  { target: 'heightCm', category: 'basic', matches: /^(?:身高(?:\s*\(?cm\)?)?|height)$/i, reason: '明确身高字段。' },
  { target: 'weightKg', category: 'basic', matches: /^(?:体重(?:\s*\(?kg\)?)?|weight)$/i, reason: '明确体重字段。' },
  { target: 'maritalStatus', category: 'basic', matches: /^(?:婚姻状况|marital\s*status)$/i, reason: '明确婚姻状况字段。' },
  { target: 'documentNumber', category: 'basic', matches: /^(?:身份证(?:号|号码)?|证件号码|身份证件号码|identity\s*(?:card|number)|id\s*(?:card|number))$/i, reason: '明确本地证件号码字段。' },
  { target: 'emergencyContactName', category: 'basic', matches: /^(?:紧急联系人(?:姓名)?|emergency\s*contact(?:\s*name)?)$/i, reason: '明确紧急联系人姓名字段。' },
  { target: 'emergencyContactRelation', category: 'basic', matches: /^(?:紧急联系人关系|与紧急联系人关系|emergency\s*contact\s*relation)$/i, reason: '明确紧急联系人关系字段。' },
  { target: 'emergencyContactPhone', category: 'basic', matches: /^(?:紧急联系电话|紧急联系人电话|emergency\s*contact\s*(?:phone|mobile))$/i, reason: '明确紧急联系电话字段。' },
]

const EDUCATION_RULES = [
  { target: 'school', matches: /^(?:毕业院校|毕业学校|学校名称|院校名称|最高学历学校|school|university|college)$/i, reason: '明确教育字段：毕业院校。' },
  { target: 'major', matches: /^(?:专业|专业名称|所学专业|最高学历专业|major|field\s*of\s*study)$/i, reason: '明确教育字段：专业。' },
  { target: 'educationLevel', matches: /^(?:最高学历|学历|学历层次|education\s*level|education)$/i, reason: '明确教育字段：学历。' },
  { target: 'academicDegree', matches: /^(?:最高学位|学位|学位名称|academic\s*degree|degree)$/i, reason: '明确教育字段：学位。' },
  { target: 'endDate', matches: /^(?:毕业时间|毕业日期|毕业年月|学历毕业时间|graduation\s*(?:date|time)|graduation)$/i, reason: '明确教育字段：毕业时间。' },
]

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeLabel(value) {
  return normalizeText(value)
    .replace(/^[*＊]\s*/, '')
    .replace(/\s*[*＊]\s*$/, '')
    .replace(/\s*(?:必填|required)?\s*[:：]\s*$/i, '')
    .trim()
}

function ageFromBirthDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(value))
  if (!match) return ''
  const [year, month, day] = match.slice(1).map(Number)
  const birthDate = new Date(year, month - 1, day)
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) return ''
  const today = new Date()
  let age = today.getFullYear() - year
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1
  return age >= 0 && age <= 120 ? String(age) : ''
}

function ruleValue(profile, target) {
  if (target === 'age') return ageFromBirthDate(profile?.basics?.birthDate)
  if (target === 'targetCity') return normalizeText(Array.isArray(profile?.basics?.targetCities) ? profile.basics.targetCities[0] : '')
  return normalizeText(profile?.basics?.[target])
}

function preferredEducation(profile) {
  const items = Array.isArray(profile?.educations) ? profile.educations : []
  return items
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({ item, index, endDate: normalizeText(item.endDate) }))
    .sort((left, right) => right.endDate.localeCompare(left.endDate) || right.index - left.index)[0]?.item ?? {}
}

function educationValue(profile, target) {
  const education = preferredEducation(profile)
  if (target === 'educationLevel') return normalizeText(education.educationLevel ?? education.degree)
  if (target === 'academicDegree') return normalizeText(education.academicDegree ?? education.degree)
  return normalizeText(education[target])
}

function matchingRule(field) {
  const labels = [field?.label, field?.name, field?.placeholder].map(normalizeLabel).filter(Boolean)
  const controlType = String(field?.controlType ?? '').toLowerCase()
  for (const label of labels) {
    // A number of application forms render one shared “personal document”
    // label above two native controls. The select is the type (e.g. resident
    // identity card); the neighbouring text input is the actual number.
    // Do this before the general label rules so a generic label cannot put
    // the type text into the number field.
    if (/^(?:个人证件|证件信息|document)$/i.test(label)) {
      if (controlType === 'select') return BASIC_RULES.find(rule => rule.target === 'documentType')
      if (['input', 'textarea'].includes(controlType)) {
        return BASIC_RULES.find(rule => rule.target === 'documentNumber')
      }
    }
    const basic = BASIC_RULES.find(rule => rule.matches.test(label))
    if (basic) return { ...basic, source: 'basic' }
    const education = EDUCATION_RULES.find(rule => rule.matches.test(label))
    if (education) return { ...education, category: 'education', source: 'education' }
  }
}

function hasUniqueExactOption(options, value) {
  const wanted = normalizeLabel(value)
  return Boolean(wanted) && (Array.isArray(options) ? options : [])
    .filter(option => normalizeLabel(option) === wanted).length === 1
}

function fieldText(field) {
  return [field.label, field.name, field.placeholder, ...(Array.isArray(field.options) ? field.options : [])]
    .map(normalizeText)
    .filter(Boolean)
    .join(' | ')
}

function fieldIdentityText(field) {
  return [field.label, field.name, field.placeholder]
    .map(normalizeText)
    .filter(Boolean)
    .join(' | ')
}

function isSensitive(field) {
  return ['password', 'file'].includes(String(field.inputType ?? '').toLowerCase())
    || SENSITIVE_PATTERNS.filter((_, index) => index !== 2).some(pattern => pattern.test(fieldIdentityText(field)))
    || /(?:护照|passport)/i.test(fieldIdentityText(field))
}

export function classifyField(field) {
  const text = fieldText(field)
  if (isSensitive(field)) return 'sensitive'
  if (matchingRule(field)) return matchingRule(field).category
  if (['date', 'datetime-local', 'month', 'week', 'time'].includes(String(field.inputType ?? '').toLowerCase()) || /(?:日期|时间|date|time)/i.test(text)) return 'date'

  const category = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text))
  return category?.[0] ?? 'unknown'
}

function baseEntry(field, category, status, reason, extra = {}) {
  return {
    fieldId: normalizeText(field.id),
    label: normalizeText(field.label) || normalizeText(field.name) || '未命名字段',
    category,
    status,
    reason,
    ...extra,
  }
}

/**
 * @typedef {{ id: string, label?: string, name?: string, placeholder?: string, inputType?: string, controlType?: string, options?: string[], multiple?: boolean, hasValue?: boolean }} FormFieldDescriptor
 * @typedef {{ basics?: { fullName?: string, phone?: string, email?: string, city?: string, countryRegion?: string, gender?: string, birthDate?: string, wechatId?: string, politicalStatus?: string, documentType?: string } }} FillProfile
 */

/**
 * Builds a report and no-DOM fill plan from safe field metadata.
 * @param {FillProfile} profile
 * @param {FormFieldDescriptor[]} fields
 */
export function buildFillPlan(profile, fields) {
  const claimedTargets = new Set()
  const entries = []

  for (const candidate of Array.isArray(fields) ? fields : []) {
    const field = candidate && typeof candidate === 'object' ? candidate : {}
    if (!normalizeText(field.id)) {
      entries.push(baseEntry(field, 'unknown', 'needs_manual', '字段缺少稳定标识，无法安全填写。'))
      continue
    }

    const text = fieldText(field)
    const category = classifyField(field)
    if (category === 'sensitive') {
      entries.push(baseEntry(field, category, 'skipped_sensitive', '敏感字段或上传控件不会填写。'))
      continue
    }
    if (field.hasValue === true) {
      entries.push(baseEntry(field, category, 'skipped_existing', '字段已有内容，不会覆盖。'))
      continue
    }
    if (field.isEditable === false) {
      entries.push(baseEntry(field, category, 'needs_manual', '字段当前不可编辑。'))
      continue
    }
    if (category === 'date') {
      entries.push(baseEntry(field, category, 'needs_manual', '日期控件的归属或格式无法可靠确认。'))
      continue
    }
    const rule = matchingRule(field)
    if (!rule) {
      const reason = category === 'unknown'
        ? '字段含义无法可靠确认。'
        : '重复经历或非基础资料字段需要人工确认。'
      entries.push(baseEntry(field, category, 'needs_manual', reason))
      continue
    }

    const value = rule.source === 'education' ? educationValue(profile, rule.target) : ruleValue(profile, rule.target)
    if (!value) {
      entries.push(baseEntry(field, rule.category, 'needs_manual', '所选资料档案没有该字段的可用内容。', { target: rule.target }))
      continue
    }
    const controlType = String(field.controlType ?? '').toLowerCase()
    if (controlType === 'select' || controlType === 'radio-group') {
      if (field.multiple === true) {
        entries.push(baseEntry(field, rule.category, 'needs_manual', '多选下拉框需要人工确认。', { target: rule.target }))
        continue
      }
      if (!hasUniqueExactOption(field.options, value)) {
        entries.push(baseEntry(field, rule.category, 'needs_manual', '下拉选项不存在唯一精确匹配，需要人工确认。', { target: rule.target }))
        continue
      }
    }
    else if (controlType === 'custom-select') {
      if (field.multiple === true) {
        entries.push(baseEntry(field, rule.category, 'needs_manual', '多选下拉框需要人工确认。', { target: rule.target }))
        continue
      }
    }
    else if (['radio', 'checkbox'].includes(controlType)) {
      entries.push(baseEntry(field, rule.category, 'needs_manual', '选项控件需要人工确认其可选值。', { target: rule.target }))
      continue
    }

    if (claimedTargets.has(rule.target)) {
      entries.push(baseEntry(field, rule.category, 'needs_manual', '页面存在多个相同目标字段，需要人工确认。', { target: rule.target }))
      continue
    }

    claimedTargets.add(rule.target)
    entries.push(baseEntry(field, rule.category, 'filled', rule.reason, { target: rule.target, value }))
  }

  return {
    entries,
    summary: entries.reduce((summary, entry) => {
      summary[entry.status] += 1
      return summary
    }, { filled: 0, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 }),
  }
}

/** Reconciles the just-in-time page-side result without exposing page values. */
export function reconcileFillOutcome(plan, outcome) {
  const applied = new Set(outcome?.appliedIds ?? [])
  const existing = new Set(outcome?.skippedExistingIds ?? [])
  const unavailable = new Set(outcome?.unavailableIds ?? [])
  const entries = (plan?.entries ?? []).map((entry) => {
    const { value: _value, ...reportEntry } = entry
    if (entry.status !== 'filled') return reportEntry
    if (applied.has(entry.fieldId)) return reportEntry
    if (existing.has(entry.fieldId)) return { ...reportEntry, status: 'skipped_existing', reason: '字段在填写前已有内容，不会覆盖。' }
    if (unavailable.has(entry.fieldId)) return { ...reportEntry, status: 'needs_manual', reason: '字段在填写时不可用或已变化。' }
    return { ...reportEntry, status: 'needs_manual', reason: '字段未能可靠填写，请人工处理。' }
  })
  return {
    entries,
    summary: entries.reduce((summary, entry) => {
      summary[entry.status] += 1
      return summary
    }, { filled: 0, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 }),
  }
}
