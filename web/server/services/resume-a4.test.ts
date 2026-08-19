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
    references: [{ id: 'r1', cardId: 'c1', variantId: 'v1', section: 'internship', fieldKey: null, title: '搜狐', type: 'INTERNSHIP', facts: { role: '前端开发实习生', organization: '智能平台部', techStack: ['Vue 3', 'TypeScript'], startDate: '2025-06', endDate: '至今' }, variantName: '精简版', content: '架构设计：完成核心模块\n性能提升 20%', source: 'MATERIAL_VARIANT' }],
  } })
  assert.match(html, /width:210mm;height:297mm/)
  assert.match(html, /padding:12mm/)
  assert.match(html, /b\.children\.length>=3/)
  assert.match(html, /&lt;王小明&gt;/)
  assert.doesNotMatch(html, /<王小明>/)
  assert.equal(html.match(/教育背景/g)?.length, 1)
  assert.match(html, /class="identity"/)
  assert.match(html, /class="unit education"/)
  assert.match(html, /第一大学 \| 计算机 \| 本科/)
  assert.match(html, /GPA 3\.75 \/ 4（专业前 10%） \| 学生会主席/)
  assert.match(html, /实习经历/)
  assert.match(html, /2025-06 — 至今/)
  assert.match(html, /前端开发实习生 \| 智能平台部 \| 2025-06 — 至今/)
  assert.match(html, /技术栈：<\/b>Vue 3 \/ TypeScript/)
  assert.match(html, /<li><b>架构设计：<\/b>/)
  assert.match(html, /class="material-entry"/)
  assert.match(html, /background:transparent/)
  assert.doesNotMatch(html, /border-left:/)
  assert.doesNotMatch(html, /linear-gradient/)
})
