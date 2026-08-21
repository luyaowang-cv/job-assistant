import assert from 'node:assert/strict'
import test from 'node:test'
import { detectProfilePhoto, MAX_PHOTO_BYTES } from '../utils/profile-photo'
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
const { buildA4ResumeHtml } = await import('./resume-a4.service')

test('detects supported profile photo signatures and rejects invalid data', () => {
  assert.equal(detectProfilePhoto(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg')
  assert.equal(detectProfilePhoto(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(detectProfilePhoto(new Uint8Array(MAX_PHOTO_BYTES + 1)), null)
  assert.equal(detectProfilePhoto(Uint8Array.from([1, 2, 3])), null)
})

test('renders fixed A4 metadata, escaped content and pagination guard', () => {
  const html = buildA4ResumeHtml({ title: '测试简历', resolved: {
    basics: { fullName: '<王小明>', phone: '13800000000' },
    educations: [{ school: '第一大学', major: '计算机', educationLevel: '本科', gpa: 3.75, gpaScale: 4, ranking: '专业前 10%', campusRole: '学生会主席', startDate: '2020-09', endDate: '2024-06' }, { school: '第二大学', major: '软件工程', educationLevel: '硕士', startDate: '2024-09', endDate: '至今' }],
    blocks: [], legacyContent: null, source: 'COMPOSITION',
    references: [
      { id: 'r0', cardId: 'c0', variantId: 'v0', section: 'education', sortOrder: 0, fieldKey: null, renderRules: {}, title: 'DA-PhysDiff', type: 'RESEARCH', facts: { role: '第一作者', organization: '第一大学' }, variantName: '简短版', content: '面向 SAR 图像去斑的扩散模型', source: 'MATERIAL_VARIANT' },
      { id: 'r2', cardId: 'c2', variantId: 'v2', section: 'education', sortOrder: 1, fieldKey: null, renderRules: {}, title: '学业一等奖学金', type: 'AWARD', facts: { organization: '第一大学' }, variantName: '简短版', content: '学业一等奖学金', source: 'MATERIAL_VARIANT' },
      { id: 'r3', cardId: 'c3', variantId: 'v3', section: 'education', sortOrder: 2, fieldKey: null, renderRules: {}, title: '全国计算机挑战赛一等奖', type: 'AWARD', facts: { organization: '第一大学' }, variantName: '简短版', content: '', source: 'MATERIAL_VARIANT' },
      { id: 'r4', cardId: 'c4', variantId: 'v4', section: 'education', sortOrder: 3, fieldKey: null, renderRules: {}, title: '数据库系统工程师（中级）', type: 'CERTIFICATE', facts: { organization: '第一大学' }, variantName: '简短版', content: '', source: 'MATERIAL_VARIANT' },
      { id: 'r5', cardId: 'c5', variantId: 'v5', section: 'education', sortOrder: 4, fieldKey: null, renderRules: {}, title: '华为 HCIA-AI 认证', type: 'CERTIFICATE', facts: { organization: '第一大学' }, variantName: '简短版', content: '', source: 'MATERIAL_VARIANT' },
      { id: 'r1', cardId: 'c1', variantId: 'v1', section: 'internship', sortOrder: 1, fieldKey: null, renderRules: {}, title: '搜狐', type: 'INTERNSHIP', facts: { role: '前端开发实习生', organization: '智能平台部', techStack: ['Vue 3', 'TypeScript'], startDate: '2025-06', endDate: '至今' }, variantName: '精简版', content: '架构设计：完成核心模块\n性能提升 20%', source: 'MATERIAL_VARIANT' },
      { id: 'r6', cardId: 'c6', variantId: 'v6', section: 'self_evaluation', sortOrder: 2, fieldKey: null, renderRules: {}, title: '', type: 'SELF_EVALUATION', facts: {}, variantName: '简短版', content: '能够快速理解业务并推动落地。', source: 'MATERIAL_VARIANT' },
    ],
  } })
  assert.match(html, /width:210mm;height:297mm/)
  assert.match(html, /padding:8mm 12mm/)
  assert.match(html, /margin-bottom:2\.4mm/)
  assert.match(html, /\.copy ul\{gap:0\.4mm\}/)
  assert.match(html, /postMessage\(\{type:'resume-layout'/)
  assert.match(html, /book\.children\.length>=3/)
  assert.match(html, /&lt;王小明&gt;/)
  assert.doesNotMatch(html, /<王小明>/)
  assert.equal(html.match(/教育背景/g)?.length, 1)
  assert.match(html, /class="identity"/)
  assert.match(html, /class="unit education"/)
  assert.match(html, /class="education-line"/)
  assert.match(html, /计算机 · 本科 · GPA 3\.75 \/ 4（专业前 10%）/)
  assert.match(html, /2020\/09 - 2024\/06/)
  assert.doesNotMatch(html, /校园职务/)
  assert.match(html, /第一作者：<\/b> DA-PhysDiff：面向 SAR/)
  assert.equal(html.match(/核心荣誉/g)?.length, 1)
  assert.match(html, /核心荣誉：<\/b> 学业一等奖学金；全国计算机挑战赛一等奖/)
  assert.equal(html.match(/核心证书/g)?.length, 1)
  assert.match(html, /核心证书：<\/b> 数据库系统工程师（中级）；华为 HCIA-AI 认证/)
  assert.match(html, /实习经历/)
  assert.match(html, /2025-06 — 至今/)
  assert.match(html, /前端开发实习生 \| 智能平台部 \| 2025-06 — 至今/)
  assert.match(html, /技术栈：<\/b>Vue 3 \/ TypeScript/)
  assert.match(html, /<li><b>架构设计：<\/b>/)
  assert.match(html, /class="material-entry"/)
  assert.match(html, /background:transparent/)
  assert.match(html, /个人总结/)
  assert.match(html, /能够快速理解业务并推动落地。/)
  assert.doesNotMatch(html, /<strong><\/strong>/)
  assert.doesNotMatch(html, /border-left:/)
  assert.doesNotMatch(html, /linear-gradient/)
})
