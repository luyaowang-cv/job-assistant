import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInterviewRecordMarkdown } from './interview-record-markdown'

test('builds markdown with metadata, JD, prep blocks, notes and review', () => {
  const md = buildInterviewRecordMarkdown({
    companyName: '字节跳动',
    jobTitle: '前端开发工程师',
    jdText: '负责 Web 前端开发',
    round: 'FIRST',
    interviewAt: new Date('2026-08-20T10:00:00+08:00'),
    methodAndAddress: '腾讯会议 https://meet.example.com/1',
    briefNote: '提前 10 分钟进会',
    prepBlocks: [
      { id: 'b1', kind: 'KNOWLEDGE', title: '项目知识点', content: '复习 Vue 响应式原理' },
      { id: 'b2', kind: 'QUESTION_ASK', title: '反问面试官', content: '团队技术栈' },
    ],
    prepNotes: 'Q: 介绍项目 A\nA: STAR 表述',
    review: [{
      id: 'r1',
      date: '2026-08-20',
      transcript: '面试录音文字',
      extracted: { questionsAsked: ['讲讲项目难点'], strengths: ['表达清晰'], improvements: ['时间控制'] },
    }],
    provider: 'OPENAI_COMPATIBLE',
    model: 'deepseek-v4-pro',
    updatedAt: new Date('2026-08-20T00:00:00Z'),
  })
  assert.ok(md.includes('# 面试记录'))
  assert.ok(md.includes('> 生成模型：OPENAI_COMPATIBLE / deepseek-v4-pro'))
  assert.ok(md.includes('## 面试信息'))
  assert.ok(md.includes('- **公司**：字节跳动'))
  assert.ok(md.includes('## JD 原文'))
  assert.ok(md.includes('负责 Web 前端开发'))
  assert.ok(md.includes('## 面试准备'))
  assert.ok(md.includes('### 知识点复习'))
  assert.ok(md.includes('### 提问面试官的问题'))
  assert.ok(md.includes('#### 项目知识点'))
  assert.ok(md.includes('### 本场笔记 / 项目问答'))
  assert.ok(md.includes('# 面试复盘'))
  assert.ok(md.includes('**被问到的问题**'))
  assert.ok(md.includes('- 讲讲项目难点'))
  assert.ok(md.includes('**发挥不错的地方**'))
  assert.ok(md.includes('- 表达清晰'))
  assert.ok(md.includes('**不足与改进点**'))
  assert.ok(md.includes('- 时间控制'))
})