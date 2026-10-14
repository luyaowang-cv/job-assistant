// Measures what one fill batch actually uploads, using the real evidence
// builder. Run:
//   cd web && node --experimental-strip-types ../docs/diagnosis-scripts/prompt-size-check.mjs
import { buildFillEvidence } from '../../web/server/services/form-fill-context.ts'

const resume = [
  '# 王路瑶',
  '## 教育背景',
  '北方工业大学 物联网工程 本科 2024.09-2027.06 GPA 3.6/4.0 专业排名前 15%',
  '## 专业技能',
  'TypeScript / Vue 3 / Nuxt / Node.js / PostgreSQL / Prisma / LangChain',
  '## 项目经历',
  '### Offer来 · 秋招求职工作台 2025.01-2025.06 独立开发',
  '一句话：把岗位采集、简历管理、网申填写、面试准备收进一个工作台。',
  '- 前端 Nuxt 4 + Element Plus + Pinia + UnoCSS，90 个服务端接口，28 张表，27 个迁移；',
  '- 用 WXT 写 MV3 侧边插件，把岗位一键存进工作台，并做网申表单的规则 + 模型填写；',
  '- 服务端用 ZIP + 流式导出简历 PDF，前端做 A4 预览与分页控制。',
  '### 论文：基于改进 YOLOv8 的XXXX检测 2024.03-2024.12 第二作者',
  '- 负责数据增强与消融实验，mAP 提升 3.2 个百分点。',
  '## 实习经历',
  '### 某某科技有限公司 前端开发实习生 2025.07-2025.09',
  '- 负责运营后台表单引擎，抽象出 12 个可复用字段组件；',
  '- 把首屏加载从 3.1s 优化到 1.4s。',
  '## 校园经历',
  '校科技协会 技术部负责人 2023.09-2024.06',
  '## 获奖情况',
  '全国大学生计算机设计大赛 省级二等奖；校级一等奖学金两次',
  '## 自我评价',
  '喜欢把复杂流程拆成能跑起来的最小步骤，做完再回头补设计。独立做完一个从数据到前端到插件的完整项目。',
].join('\n')
// A two-page dense resume runs to several thousand characters; repeating the
// sample is how this measures the cap the server actually sends.
const longResume = Array.from({ length: 9 }, () => resume).join('\n\n').slice(0, 12_000)

const profile = {
  basics: {
    fullName: '王路瑶',
    gender: '女',
    birthDate: '2002-05-01',
    phone: '13800000000',
    email: 'wangluyao@example.com',
    city: '北京市',
    countryRegion: '中国',
    politicalStatus: '共青团员',
    ethnicity: '汉族',
    nativePlace: '河北省石家庄市',
    householdLocation: '北京市海淀区',
    documentType: '居民身份证',
    wechatId: 'wangluyao',
    maritalStatus: '未婚',
    heightCm: '165',
    weightKg: '52',
    targetCities: ['北京市', '上海市'],
    emergencyContactName: '王某某',
    emergencyContactRelation: '父女',
    emergencyContactPhone: '13900000000',
  },
  educations: [
    { school: '北方工业大学', college: '信息学院', major: '物联网工程', educationLevel: '本科', academicDegree: '学士', startDate: '2024-09', endDate: '2027-06', gpa: '3.6', gpaScale: '4.0', ranking: '前 15%', campusRole: '学习委员' },
    { school: '北京市第X中学', major: '理科', educationLevel: '高中', startDate: '2021-09', endDate: '2024-06' },
  ],
  strategy: { targetLocations: ['北京市'], expectedSalary: '15000-20000', availableDate: '2026-07-01', targetRoles: ['大模型应用开发'] },
  workExperiences: [
    { company: '某某科技有限公司', title: '前端开发实习生', startDate: '2025-07', endDate: '2025-09', description: '负责运营后台表单引擎，抽象出 12 个可复用字段组件；把首屏加载从 3.1s 优化到 1.4s。' },
  ],
  projects: [
    { name: 'Offer来 · 秋招求职工作台', role: '独立开发', startDate: '2025-01', endDate: '2025-06', description: 'Nuxt 4 全栈工作台 + MV3 浏览器插件，90 个接口 / 28 张表；插件侧做网申表单的规则与模型填写。' },
    { name: '基于改进 YOLOv8 的XXXX检测', role: '第二作者', startDate: '2024-03', endDate: '2024-12', description: '负责数据增强与消融实验，mAP 提升 3.2 个百分点。' },
  ],
  skills: ['TypeScript', 'Vue 3', 'Nuxt', 'Node.js', 'PostgreSQL', 'Prisma', 'LangChain'],
  languages: [{ name: '英语', detail: 'CET-6 528' }],
  certificates: [{ name: '全国计算机等级考试二级', detail: '优秀' }],
  campusExperiences: [{ name: '校科技协会 技术部负责人', role: '负责人', startDate: '2023-09', endDate: '2024-06', description: '组织 6 场技术分享。' }],
  awards: [{ name: '全国大学生计算机设计大赛', detail: '省级二等奖' }, { name: '校级一等奖学金', detail: '两次' }],
  blocks: [
    { title: '自我评价', fields: [{ label: '自我评价', text: '喜欢把复杂流程拆成能跑起来的最小步骤，做完再回头补设计。' }] },
    { title: '项目描述', fields: [{ label: '项目描述', text: 'Nuxt 4 全栈 + MV3 插件的完整闭环。' }] },
  ],
  references: [
    { type: 'INTERNSHIP', title: '某某科技实习', facts: { company: '某某科技有限公司', title: '前端开发实习生' }, content: '负责运营后台表单引擎。' },
    { type: 'PROJECT', title: 'Offer来', facts: { name: 'Offer来' }, content: '秋招求职工作台。' },
  ],
  resumeVersion: { id: 'r1', type: 'DENSE_TWO_PAGE', content: longResume },
}

const evidence = buildFillEvidence(profile)

// One batch as `buildFillBatches` would cut it: 24 fields of a real education +
// basics form, mixed short inputs, selects and narratives.
const batch = Array.from({ length: 24 }, (_, i) => ({
  id: `form-field-${i}`,
  label: ['姓名', '性别', '出生日期', '手机号码', '电子邮箱', '现居城市', '政治面貌', '民族', '籍贯', '婚姻状况', '紧急联系人', '紧急联系人电话', '学校名称', '专业名称', '学历', '学位', '入学时间', '毕业时间', 'GPA', '专业排名', '项目名称', '项目描述', '自我评价', '期望薪资'][i],
  context: `教育经历；页面字段 ${i + 1}/24；相邻字段：专业名称、学历`,
  name: `RecruitmentPortal_Field_${i}`,
  placeholder: '请选择',
  inputType: i === 21 || i === 22 ? 'textarea' : 'text',
  controlType: i === 21 || i === 22 ? 'textarea' : 'input',
  options: [],
  multiple: false,
}))

const prompt = JSON.stringify({
  task: 'Fill an online job-application form using only the selected candidate profile. Return JSON only.',
  rules: new Array(9).fill('规则文本'),
  profile: evidence,
  fields: batch,
  output: { fills: [{ fieldId: 'field id from fields', value: 'suggested text' }], unresolvedIds: ['field ids with no answer'] },
})

const chars = prompt.length
// Chinese-heavy text tokenizes at roughly 1 token per 1.3–1.6 characters on the
// Qwen/GLM family. Reported as a range rather than a false precision.
const tokens = [Math.round(chars / 1.6 / 100) * 100, Math.round(chars / 1.3 / 100) * 100]

console.log(`简历正文上限 12000 字，实际 ${longResume.length} 字`)
console.log(`证据对象 JSON 长度：${JSON.stringify(evidence).length} 字`)
console.log(`一个 24 字段批次的完整 prompt：${chars} 字  ≈ ${tokens[0]}–${tokens[1]} token`)
for (const batches of [1, 3, 5, 8]) {
  console.log(`  拆成 ${batches} 批：累计上传 ${(chars * batches / 10_000).toFixed(1)} 万字 ≈ ${((chars * batches) / 1.3 / 1000).toFixed(0)}–${((chars * batches) / 1.6 / 1000).toFixed(0)}k token 输入（同一份档案被重发 ${batches} 次）`)
}
console.log(`\n换成一次请求填完整张表：输入 ≈ ${((chars) / 1.3 / 1000).toFixed(0)}k token（不再乘以批数）`)
