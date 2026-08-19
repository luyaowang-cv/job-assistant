import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInterviewPrepMarkdown } from './interview-prep-markdown'

test('builds markdown with sections and reflection', () => {
  const md = buildInterviewPrepMarkdown({
    resumeLabel: '基础版',
    sections: [{ id: 'intro', title: '自我介绍', content: '**内容**' }],
    reflection: [{
      id: 'r1',
      date: '2026-08-19',
      recordText: '原始记录',
      extracted: { keyPoints: ['关键信息'], questions: [], weaknesses: ['不足'], nextFocus: [] },
    }],
    provider: 'OPENAI_COMPATIBLE',
    model: 'deepseek-v4-pro',
    updatedAt: new Date('2026-08-19T00:00:00Z'),
  })
  assert.ok(md.includes('# 面试资料'))
  assert.ok(md.includes('> 简历版本：基础版'))
  assert.ok(md.includes('> 生成模型：OPENAI_COMPATIBLE / deepseek-v4-pro'))
  assert.ok(md.includes('## 自我介绍'))
  assert.ok(md.includes('# 面试复盘'))
  assert.ok(md.includes('## 2026-08-19'))
  assert.ok(md.includes('- 关键信息'))
  assert.ok(md.includes('- 不足'))
})