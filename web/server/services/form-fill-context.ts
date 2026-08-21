function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function referenceExperience(candidate: unknown) {
  const reference = record(candidate)
  const facts = record(reference.facts)
  return {
    ...facts,
    title: reference.title,
    description: reference.content,
    content: reference.content,
  }
}

export function buildFillEvidence(value: unknown) {
  const profile = record(value)
  const references = array(profile.references)
  const experiences = references.map((candidate) => {
    const reference = record(candidate)
    return {
      type: reference.type,
      title: reference.title,
      section: reference.section,
      facts: record(reference.facts),
      content: reference.content,
    }
  })
  const sections = array(profile.blocks).map((candidate) => {
    const block = record(candidate)
    const fields = array(block.fields).map((fieldCandidate) => {
      const field = record(fieldCandidate)
      return { label: field.label, text: field.text }
    }).filter(field => typeof field.text === 'string' && field.text.trim())
    return { title: block.title, fields }
  }).filter(section => section.fields.length)
  const resumeVersion = record(profile.resumeVersion)
  const explicitWorkExperiences = array(profile.workExperiences)
  const explicitProjects = array(profile.projects)
  const referencedInternships = references.filter(candidate => record(candidate).type === 'INTERNSHIP').map(referenceExperience)
  const referencedProjects = references.filter(candidate => record(candidate).type === 'PROJECT').map(referenceExperience)
  return {
    basics: record(profile.basics),
    educations: array(profile.educations),
    strategy: record(profile.strategy),
    experiences,
    sections,
    workExperiences: explicitWorkExperiences.length ? explicitWorkExperiences : referencedInternships,
    projects: explicitProjects.length ? explicitProjects : referencedProjects,
    skills: array(profile.skills),
    languages: array(profile.languages),
    certificates: array(profile.certificates),
    campusExperiences: array(profile.campusExperiences),
    awards: array(profile.awards),
    resumeContent: typeof resumeVersion.content === 'string' ? resumeVersion.content : '',
    legacyContent: typeof profile.legacyContent === 'string' ? profile.legacyContent : '',
  }
}

type FillField = {
  id: string
  label?: string
  name?: string
  placeholder?: string
  inputType?: string
  controlType?: string
}

function ownFieldText(field: FillField) {
  return [field.label, field.name, field.placeholder].map(text).filter(Boolean).join(' | ')
}

function firstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(source[key])
    if (value) return value
  }
  return ''
}

function datedItems(value: unknown) {
  return array(value).map(record).sort((left, right) => firstText(right, ['endDate']).localeCompare(firstText(left, ['endDate'])))
}

function namedItems(value: unknown) {
  return array(value).map((candidate) => {
    if (typeof candidate === 'string') return { name: candidate }
    return record(candidate)
  })
}

function markdownSection(content: string, headings: RegExp) {
  const lines = content.split(/\r?\n/)
  const start = lines.findIndex(line => /^\s*#{1,6}\s+/.test(line) && headings.test(line))
  if (start < 0) return []
  const result: string[] = []
  for (const line of lines.slice(start + 1)) {
    const nextHeading = /^\s*(#{1,6})\s+/.exec(line)
    if (nextHeading) break
    const normalized = line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim()
    if (normalized && !/^\s*#{1,6}\s+/.test(line)) result.push(normalized)
  }
  return result
}

function resumeFacts(content: string) {
  const honorParts = markdownSection(content, /(?:荣誉|奖项|获奖|证书|认证)/i)
    .flatMap(line => line.split(/\s*[|｜；;]\s*/))
    .map(value => value.trim())
    .filter(Boolean)
  const certificatePattern = /(?:证书|认证|工程师|CET[-\s]?\d|大学英语|雅思|托福|IELTS|TOEFL|普通话|计算机等级)/i
  const awardPattern = /(?:奖学金|奖项|获奖|荣誉|大赛|竞赛|比赛|挑战赛|第[一二三123]名|等奖)/i
  const urls = Array.from(content.matchAll(/https?:\/\/[^\s<>]+/g)).map((match) => {
    const raw = match[0].replace(/[),，。；;]+$/, '')
    try {
      const parsed = new URL(raw)
      const target = parsed.searchParams.get('target')
      return target && /^https?:\/\//i.test(target) ? target : parsed.href
    }
    catch {
      return raw
    }
  })
  return {
    awards: honorParts.filter(part => awardPattern.test(part) && !certificatePattern.test(part)).map(name => ({ name })),
    certificates: honorParts.filter(part => certificatePattern.test(part)).map(name => ({ name })),
    languages: honorParts.filter(part => /(?:CET[-\s]?\d|大学英语|雅思|托福|IELTS|TOEFL)/i.test(part)).map(name => ({ name, detail: name })),
    selfEvaluation: markdownSection(content, /(?:自我评价|个人评价|个人总结|专业总结|职业概述|专业技能)/i).join('\n').slice(0, 1000),
    socialUrl: urls.find(url => /(?:github|gitee|gitlab|linkedin|zhihu|xiaohongshu|weibo)/i.test(url)) ?? '',
  }
}

function platformForUrl(value: string) {
  if (/github/i.test(value)) return 'GitHub'
  if (/gitee/i.test(value)) return 'Gitee'
  if (/gitlab/i.test(value)) return 'GitLab'
  if (/linkedin/i.test(value)) return 'LinkedIn'
  if (/zhihu/i.test(value)) return '知乎'
  if (/xiaohongshu/i.test(value)) return '小红书'
  if (/weibo/i.test(value)) return '微博'
  return ''
}

function dateValue(source: Record<string, unknown>, kind: 'start' | 'end') {
  return firstText(source, kind === 'start' ? ['startDate', 'beginDate', 'from'] : ['endDate', 'finishDate', 'to'])
}

function dateKind(label: string, fallbackIndex: number): 'start' | 'end' {
  if (/(?:结束|截止|毕业|end|finish|to)/i.test(label)) return 'end'
  if (/(?:开始|起始|入学|start|begin|from)/i.test(label)) return 'start'
  return fallbackIndex % 2 === 0 ? 'start' : 'end'
}

/** Direct profile facts that should not depend on a model reproducing field ids. */
export function buildStructuredFillCandidates(value: unknown, fields: FillField[]) {
  const evidence = buildFillEvidence(value)
  const basics = record(evidence.basics)
  const strategy = record(evidence.strategy)
  const educations = datedItems(evidence.educations)
  const internships = array(evidence.workExperiences).map(record)
  const projects = array(evidence.projects).map(record)
  const resume = resumeFacts(text(evidence.resumeContent) || text(evidence.legacyContent))
  const experiences = array(evidence.experiences).map(record)
  const awards = namedItems(evidence.awards).concat(experiences.filter(item => item.type === 'AWARD').map(referenceExperience), resume.awards)
  const certificates = namedItems(evidence.certificates).concat(experiences.filter(item => item.type === 'CERTIFICATE').map(referenceExperience), resume.certificates)
  const languages = namedItems(evidence.languages).concat(resume.languages)
  const campusExperiences = namedItems(evidence.campusExperiences).concat(experiences.filter(item => item.type === 'CAMPUS').map(referenceExperience))
  const savedSelfEvaluation = array(evidence.sections).map(record)
    .filter(item => /(?:自我评价|个人评价|个人总结)/i.test(text(item.title)))
    .flatMap(item => array(item.fields).map(record))
    .map(item => text(item.text)).find(Boolean) ?? resume.selfEvaluation
  let section: 'education' | 'work' | 'project' | 'campus' | 'award' | 'certificate' | 'language' | 'social' | 'self' | 'portfolio' = 'education'
  let educationIndex = 0
  let educationSchoolCount = 0
  let workIndex = -1
  let projectIndex = -1
  let campusIndex = -1
  let awardIndex = -1
  let certificateIndex = -1
  let languageIndex = -1
  const dateCounters = { education: 0, work: 0, project: 0 }
  const results: Array<{ fieldId: string, value: string }> = []

  const push = (fieldId: string, value: unknown) => {
    const normalized = text(value)
    if (normalized) results.push({ fieldId, value: normalized })
  }

  for (const field of fields) {
    const label = ownFieldText(field)
    const controlType = text(field.controlType).toLowerCase()

    if (/(?:没有实习经历|公司名称|职位名称|工作单位|实习单位)/i.test(label)) section = 'work'
    if (/(?:项目名称|项目角色|项目链接)/i.test(label)) section = 'project'
    if (/(?:校园经历|社团名称|组织名称|校园职务)/i.test(label)) section = 'campus'
    if (/(?:竞赛名称|奖项名称|荣誉名称)/i.test(label)) section = 'award'
    if (/(?:证书名称|资格证书)/i.test(label)) section = 'certificate'
    if (/(?:语言|精通程度|熟练程度)/i.test(label)) section = 'language'
    if (/(?:自我评价|个人评价|个人总结)/i.test(label)) section = 'self'
    if (/(?:社交平台|URL\s*\/\s*ID|社交账号)/i.test(label)) section = 'social'
    if (/(?:作品名称|作品链接|作品地址)/i.test(label)) section = 'portfolio'

    if (/^(?:姓名|真实姓名|中文姓名|full\s*name|legal\s*name)(?:\s*\|.*)?$/i.test(label)) push(field.id, basics.fullName)
    else if (/(?:手机号码|手机号|移动电话|mobile|phone)/i.test(label)) push(field.id, basics.phone)
    else if (/(?:电子邮箱|电子邮件|邮箱|email)/i.test(label)) push(field.id, basics.email)
    else if (/(?:期望工作地点|意向工作地点|期望城市|意向城市)/i.test(label)) {
      push(field.id, array(basics.targetCities)[0] ?? array(strategy.targetLocations)[0])
    }
    else if (/(?:个人证件|证件信息)/i.test(label)) {
      push(field.id, ['select', 'custom-select'].includes(controlType) ? basics.documentType : basics.documentNumber)
    }
    else if (/(?:证件号码|身份证号码|身份证号)/i.test(label)) push(field.id, basics.documentNumber)
    else if (section === 'education') {
      if (/(?:学校名称|院校名称|毕业院校|毕业学校)/i.test(label)) {
        if (educationSchoolCount > 0 && educationIndex < educations.length - 1) educationIndex += 1
        educationSchoolCount += 1
      }
      const education = educations[educationIndex] ?? educations[0] ?? {}
      if (/(?:学校名称|院校名称|毕业院校|毕业学校)/i.test(label)) push(field.id, education.school)
      else if (/(?:专业名称|所学专业|专业)(?:\s*\|.*)?$/i.test(label)) push(field.id, education.major)
      else if (/(?:学院|院系)/i.test(label)) push(field.id, education.college)
      else if (/(?:实验室)/i.test(label)) push(field.id, education.lab)
      else if (/(?:领域方向|研究方向)/i.test(label)) push(field.id, education.researchDirection)
      else if (/(?:导师)/i.test(label)) push(field.id, education.advisor)
      else if (/(?:最高学位|学位名称|学位)(?:\s*\|.*)?$/i.test(label)) push(field.id, education.academicDegree)
      else if (/(?:最高学历|学历层次|学历)(?:\s*\|.*)?$/i.test(label) && !/(?:学历类型)/i.test(label)) push(field.id, education.degree ?? education.educationLevel)
      else if (/(?:起止时间|开始时间|结束时间|入学时间|毕业时间|start|end)/i.test(label)) {
        const counter = dateCounters.education++
        push(field.id, dateValue(educations[Math.floor(counter / 2)] ?? education, dateKind(label, counter)))
      }
    }

    if (section === 'work') {
      if (/(?:公司名称|工作单位|实习单位|雇主)/i.test(label)) workIndex += 1
      const internship = internships[Math.max(0, workIndex)] ?? {}
      if (/(?:公司名称|工作单位|实习单位|雇主)/i.test(label)) push(field.id, firstText(internship, ['organization', 'company', 'employer']))
      else if (/(?:职位名称|岗位名称|职位|岗位)(?:\s*\|.*)?$/i.test(label)) push(field.id, firstText(internship, ['role', 'position', 'title']))
      else if (/(?:起止时间|开始时间|结束时间|入职时间|离职时间|start|end)/i.test(label)) {
        const counter = dateCounters.work++
        push(field.id, dateValue(internship, dateKind(label, counter)))
      }
      else if (/(?:工作描述|实习描述|职责描述|描述)(?:\s*\|.*)?$/i.test(label)) push(field.id, firstText(internship, ['description', 'content']))
    }

    if (section === 'project') {
      if (/(?:项目名称)/i.test(label)) projectIndex += 1
      const project = projects[Math.max(0, projectIndex)] ?? {}
      if (/(?:项目名称)/i.test(label)) push(field.id, firstText(project, ['title', 'name', 'projectName']))
      else if (/(?:项目角色|担任角色|项目职位)/i.test(label)) push(field.id, firstText(project, ['role', 'position']))
      else if (/(?:项目链接|项目地址|project\s*(?:url|link))/i.test(label)) push(field.id, firstText(project, ['url', 'link', 'projectUrl']))
      else if (/(?:起止时间|开始时间|结束时间|start|end)/i.test(label)) {
        const counter = dateCounters.project++
        push(field.id, dateValue(project, dateKind(label, counter)))
      }
      else if (/(?:项目描述|职责描述|描述)(?:\s*\|.*)?$/i.test(label)) push(field.id, firstText(project, ['description', 'content']))
    }

    if (section === 'campus') {
      if (/(?:校园经历名称|社团名称|组织名称)/i.test(label)) campusIndex += 1
      const campus = campusExperiences[Math.max(0, campusIndex)] ?? {}
      if (/(?:校园经历名称|社团名称|组织名称)/i.test(label)) push(field.id, firstText(campus, ['name', 'title', 'organization']))
      else if (/(?:校园职务|担任职务|角色)/i.test(label)) push(field.id, firstText(campus, ['role', 'position']))
      else if (/(?:起止时间|开始时间|结束时间)/i.test(label)) push(field.id, dateValue(campus, dateKind(label, dateCounters.work++)))
      else if (/(?:描述)(?:\s*\|.*)?$/i.test(label)) push(field.id, firstText(campus, ['detail', 'description', 'content']))
    }

    if (section === 'award') {
      if (/(?:竞赛名称|奖项名称|荣誉名称)/i.test(label)) awardIndex += 1
      const award = awards[Math.max(0, awardIndex)] ?? {}
      if (/(?:竞赛名称|奖项名称|荣誉名称)/i.test(label)) push(field.id, firstText(award, ['name', 'title']))
      else if (/(?:描述)(?:\s*\|.*)?$/i.test(label)) push(field.id, firstText(award, ['detail', 'description', 'content']))
    }

    if (section === 'certificate') {
      if (/(?:证书名称|资格证书)/i.test(label)) certificateIndex += 1
      const certificate = certificates[Math.max(0, certificateIndex)] ?? {}
      if (/(?:证书名称|资格证书)/i.test(label)) push(field.id, firstText(certificate, ['name', 'title']))
      else if (/(?:描述)(?:\s*\|.*)?$/i.test(label)) push(field.id, firstText(certificate, ['detail', 'description', 'content']))
    }

    if (section === 'language') {
      if (/(?:语言)(?:\s*\|.*)?$/i.test(label)) languageIndex += 1
      const language = languages[Math.max(0, languageIndex)] ?? {}
      if (/(?:语言)(?:\s*\|.*)?$/i.test(label)) push(field.id, firstText(language, ['name', 'language', 'title']))
      else if (/(?:精通程度|熟练程度|语言水平)/i.test(label)) push(field.id, firstText(language, ['detail', 'level', 'proficiency']))
    }

    if (section === 'self' && /(?:自我评价|个人评价|个人总结)/i.test(label)) push(field.id, savedSelfEvaluation)
    if (section === 'social') {
      if (/(?:社交平台)/i.test(label)) push(field.id, platformForUrl(resume.socialUrl))
      else if (/(?:URL\s*\/\s*ID|社交账号|主页链接)/i.test(label)) push(field.id, resume.socialUrl)
    }
  }

  return Array.from(new Map(results.map(result => [result.fieldId, result])).values())
}
