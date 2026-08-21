<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'

type BlockKind = 'KNOWLEDGE' | 'QUESTION_ASK' | 'ROLE_POINT'
interface PrepBlock { id: string, kind: BlockKind, title: string, content: string }
interface ReviewExtracted { questionsAsked: string[], strengths: string[], improvements: string[] }
interface ReviewEntry { id: string, date: string, transcript: string, extracted: ReviewExtracted }
interface InterviewRecordPayload {
  id: string
  applicationId: string | null
  resumeVersionId: string | null
  companyName: string | null
  jobTitle: string | null
  jdText: string | null
  round: string | null
  interviewAt: string | null
  methodAndAddress: string | null
  briefNote: string | null
  prepSections: PrepBlock[]
  prepNotes: string | null
  result: string | null
  review: ReviewEntry[]
  updatedAt?: string
}
interface ApplicationOption { id: string, job: { title: string, company: { name: string }, description: string | null } }
interface ResumeVersionOption { id: string, name: string, type: 'BASE' | 'TARGETED', application?: { id: string, job?: { title?: string, company?: { name?: string } } } | null }

const route = useRoute()

const roundOptions = [
  { value: 'FIRST', label: '一面' },
  { value: 'SECOND', label: '二面' },
  { value: 'HR', label: 'HR 面' },
  { value: 'FINAL', label: '终面' },
]
const resultOptions = [
  { value: 'UNDECIDED', label: '待定' },
  { value: 'PASSED', label: '通过' },
  { value: 'FAILED', label: '未通过' },
  { value: 'WITHDRAWN', label: '放弃' },
]
const kindMeta: Record<BlockKind, { label: string, hint: string }> = {
  KNOWLEDGE: { label: '知识点复习', hint: '针对不同项目经历 / 实习经历生成本场需要复习的知识点' },
  QUESTION_ASK: { label: '要提问面试官的问题', hint: '面试反问准备' },
  ROLE_POINT: { label: '岗位针对性准备要点', hint: '结合 JD 与岗位要求的准备要点' },
}
const kindOrder: BlockKind[] = ['KNOWLEDGE', 'QUESTION_ASK', 'ROLE_POINT']

const recordId = ref('')
const records = ref<InterviewRecordPayload[]>([])
const contextEditing = ref(true)
const applications = ref<ApplicationOption[]>([])
const applicationId = ref('')
const resumeVersions = ref<ResumeVersionOption[]>([])
const resumeVersionId = ref('')
const companyName = ref('')
const jobTitle = ref('')
const jdText = ref('')
const round = ref('')
const interviewAt = ref('')
const methodAndAddress = ref('')
const briefNote = ref('')
const prepBlocks = ref<PrepBlock[]>([])
const prepNotes = ref('')
const result = ref('')
const reviewEntries = ref<ReviewEntry[]>([])
const transcript = ref('')
const activeTab = ref('prep')

const saving = ref(false)
const extracting = ref(false)
const confirming = ref(false)
const reviewPreviewVisible = ref(false)
const reviewPreview = ref<ReviewExtracted | null>(null)

const prepGroups = computed(() => kindOrder.map(kind => ({
  kind,
  label: kindMeta[kind].label,
  hint: kindMeta[kind].hint,
  blocks: prepBlocks.value.filter(block => block.kind === kind),
})))
const currentResumeName = computed(() => resumeVersions.value.find(item => item.id === resumeVersionId.value)?.name ?? '未绑定简历')

function versionLabel(version: ResumeVersionOption) {
  return version.name
}

async function loadApplications() {
  try {
    const response = await $fetch<{ data: { items: ApplicationOption[] } }>('/api/v1/applications', { query: { pageSize: 100 } })
    applications.value = response.data.items
  }
  catch { applications.value = [] }
}

async function loadResumeVersions() {
  try {
    const response = await $fetch<{ data: { versions: ResumeVersionOption[] } | null }>('/api/v1/resumes')
    resumeVersions.value = response.data?.versions ?? []
  }
  catch { resumeVersions.value = [] }
}

async function loadRecords() {
  try {
    const response = await $fetch<{ data: InterviewRecordPayload[] }>('/api/v1/interview-records')
    records.value = response.data
  }
  catch { records.value = [] }
}

function handleApplicationChange() {
  const app = applications.value.find(item => item.id === applicationId.value)
  if (!app) return
  companyName.value = app.job.company.name
  jobTitle.value = app.job.title
  jdText.value = app.job.description ?? ''
  const bound = resumeVersions.value.find(version => version.application?.id === app.id)
  resumeVersionId.value = bound?.id ?? ''
}

async function loadRecord(id: string) {
  try {
    const response = await $fetch<{ data: InterviewRecordPayload | null }>('/api/v1/interview-records', { query: { id } })
    const record = response.data
    if (!record) return
    recordId.value = record.id
    applicationId.value = record.applicationId ?? ''
    resumeVersionId.value = record.resumeVersionId ?? ''
    companyName.value = record.companyName ?? ''
    jobTitle.value = record.jobTitle ?? ''
    jdText.value = record.jdText ?? ''
    round.value = record.round ?? ''
    interviewAt.value = record.interviewAt ?? ''
    methodAndAddress.value = record.methodAndAddress ?? ''
    briefNote.value = record.briefNote ?? ''
    prepBlocks.value = record.prepSections ?? []
    prepNotes.value = record.prepNotes ?? ''
    result.value = record.result ?? ''
    reviewEntries.value = record.review ?? []
    contextEditing.value = false
  }
  catch { ElMessage.error('面试记录读取失败。') }
}

function removeBlock(id: string) {
  prepBlocks.value = prepBlocks.value.filter(block => block.id !== id)
}

async function save() {
  saving.value = true
  const payload = {
    applicationId: applicationId.value || null,
    resumeVersionId: resumeVersionId.value || null,
    companyName: companyName.value || null,
    jobTitle: jobTitle.value || null,
    jdText: jdText.value || null,
    round: round.value || null,
    interviewAt: interviewAt.value || null,
    methodAndAddress: methodAndAddress.value || null,
    briefNote: briefNote.value || null,
    prepSections: prepBlocks.value,
    prepNotes: prepNotes.value || null,
    result: result.value || null,
    review: reviewEntries.value,
  }
  try {
    if (recordId.value) {
      const response = await $fetch<{ data: InterviewRecordPayload }>('/api/v1/interview-records/' + recordId.value, { method: 'PATCH', body: payload })
      recordId.value = response.data.id
    }
    else {
      const response = await $fetch<{ data: InterviewRecordPayload }>('/api/v1/interview-records', { method: 'POST', body: payload })
      recordId.value = response.data.id
    }
    contextEditing.value = false
    await loadRecords()
    ElMessage.success('面试记录已保存。')
  }
  catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    ElMessage.error(message ?? '保存失败。')
  }
  finally { saving.value = false }
}

function exportMd() {
  if (!recordId.value) { ElMessage.warning('请先保存面试记录。'); return }
  window.open('/api/v1/interview-records/' + recordId.value + '/export', '_blank')
}

async function previewReview() {
  if (!recordId.value) { ElMessage.warning('请先保存面试记录，再提取复盘。'); return }
  if (!transcript.value.trim()) { ElMessage.warning('请先粘贴或上传录音文字内容。'); return }
  extracting.value = true
  try {
    const response = await $fetch<{ data: ReviewExtracted }>('/api/v1/interview-records/' + recordId.value + '/review/preview', {
      method: 'POST',
      body: { transcript: transcript.value },
    })
    reviewPreview.value = response.data
    reviewPreviewVisible.value = true
  }
  catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    ElMessage.error(message ?? '复盘提取失败，请重试。')
  }
  finally { extracting.value = false }
}

async function confirmReview() {
  if (!recordId.value || !reviewPreview.value) return
  confirming.value = true
  try {
    const response = await $fetch<{ data: { record: InterviewRecordPayload } }>('/api/v1/interview-records/' + recordId.value + '/review/confirm', {
      method: 'POST',
      body: { transcript: transcript.value, extracted: reviewPreview.value },
    })
    reviewEntries.value = response.data.record.review
    reviewPreviewVisible.value = false
    reviewPreview.value = null
    transcript.value = ''
    ElMessage.success('复盘已加入面试记录。')
  }
  catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    ElMessage.error(message ?? '复盘保存失败。')
  }
  finally { confirming.value = false }
}

const MAX_IMPORT_CHARS = 50_000

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

async function importTranscript(file: File) {
  if (!/\.(md|txt)$/i.test(file.name)) {
    ElMessage.warning('仅支持 .md 或 .txt 文本文件。')
    return
  }
  try {
    const content = await readFileText(file)
    transcript.value = content.length > MAX_IMPORT_CHARS ? content.slice(0, MAX_IMPORT_CHARS) : content
    if (content.length > MAX_IMPORT_CHARS) ElMessage.warning('文本超过 5 万字符，已自动截断为前 5 万字符。')
    else ElMessage.success('录音文字内容已导入，可开始 AI 分析。')
  }
  catch { ElMessage.error('文件读取失败，请重试。') }
}

function onTranscriptFileChange(uploadFile: UploadFile) {
  if (uploadFile.raw) void importTranscript(uploadFile.raw)
}

function openAgent() {
  navigateTo({
    path: '/agent',
    query: {
      ...(applicationId.value ? { applicationId: applicationId.value } : {}),
      ...(resumeVersionId.value ? { resumeVersionId: resumeVersionId.value } : {}),
      mode: 'interview',
    },
  })
}

function newRecord() {
  recordId.value = ''
  applicationId.value = ''
  resumeVersionId.value = ''
  companyName.value = ''
  jobTitle.value = ''
  jdText.value = ''
  round.value = ''
  interviewAt.value = ''
  methodAndAddress.value = ''
  briefNote.value = ''
  prepBlocks.value = []
  prepNotes.value = ''
  result.value = ''
  reviewEntries.value = []
  contextEditing.value = true
  void navigateTo('/interview-prep', { replace: true })
}

onMounted(async () => {
  await Promise.all([loadApplications(), loadResumeVersions(), loadRecords()])
  const appId = typeof route.query.applicationId === 'string' ? route.query.applicationId : ''
  const id = typeof route.query.id === 'string' ? route.query.id : ''
  if (id) await loadRecord(id)
  else if (appId) {
    const existing = records.value.find(item => item.applicationId === appId)
    if (existing) { await loadRecord(existing.id); return }
    applicationId.value = appId
    handleApplicationChange()
  }
  else if (records.value[0]) await loadRecord(records.value[0].id)
})
</script>

<template>
  <section class="page-rail interview-record-page">
    <div class="interview-record-shell">
      <div class="interview-record-topbar">
        <div class="flex min-w-0 items-center gap-2 text-sm text-[#7b899a]">
          <span class="truncate">{{ companyName || '未绑定投递记录' }}{{ companyName && jobTitle ? ' · ' + jobTitle : '' }}</span>
          <el-tag v-if="recordId" size="small" effect="plain" type="success">已保存</el-tag>
        </div>
        <div class="flex flex-none items-center gap-2">
          <el-button @click="newRecord">新建档案</el-button>
          <el-button :loading="saving" @click="save">保存</el-button>
          <el-button type="primary" plain @click="openAgent">在 Agent 中准备</el-button>
          <el-button :disabled="!recordId" @click="exportMd">导出Markdown</el-button>
        </div>
      </div>

      <div class="interview-record-body">
        <aside class="interview-record-sidebar">
          <div class="interview-record-sidebar-panel">
            <div class="record-heading"><p class="material-section-label">面试档案</p><button type="button" @click="newRecord">＋ 新建</button></div>
            <div class="record-list">
              <button v-for="item in records" :key="item.id" type="button" :class="{ active: item.id === recordId }" @click="loadRecord(item.id)">
                <strong>{{ item.companyName || '未命名公司' }}</strong>
                <span>{{ item.jobTitle || '未命名岗位' }}</span>
                <small>{{ item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('zh-CN') : '' }}</small>
              </button>
              <p v-if="!records.length" class="record-empty">还没有面试档案，可从 Agent 保存回答后自动创建。</p>
            </div>

            <el-divider class="!mb-4 !mt-5" />

            <div v-if="contextEditing" class="context-editor">
              <div class="record-heading"><p class="material-section-label">新档案上下文</p><button v-if="recordId" type="button" @click="contextEditing = false">收起</button></div>
              <el-form label-position="top" size="small">
                <el-form-item label="投递岗位">
                  <el-select v-model="applicationId" clearable filterable placeholder="选择岗位后自动带入 JD" class="w-full" @change="handleApplicationChange">
                    <el-option v-for="app in applications" :key="app.id" :label="app.job.company.name + ' · ' + app.job.title" :value="app.id" />
                  </el-select>
                </el-form-item>
                <el-form-item label="简历版本">
                  <el-select v-model="resumeVersionId" clearable placeholder="选择简历版本" class="w-full">
                    <el-option v-for="version in resumeVersions" :key="version.id" :label="versionLabel(version)" :value="version.id" />
                  </el-select>
                </el-form-item>
              </el-form>
            </div>
            <div v-else class="context-brief">
              <div><small>岗位上下文</small><button type="button" @click="contextEditing = true">更换</button></div>
              <strong>{{ companyName || '未绑定公司' }} · {{ jobTitle || '未绑定岗位' }}</strong>
              <span>{{ currentResumeName }}</span>
            </div>

            <el-divider class="!mb-4 !mt-5" />

            <p class="material-section-label">面试信息</p>
            <el-form label-position="top" size="small">
              <el-form-item label="面试轮次">
                <el-select v-model="round" clearable placeholder="选择轮次" class="w-full">
                  <el-option v-for="option in roundOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="面试时间">
                <el-date-picker v-model="interviewAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择日期时间" class="w-full" />
              </el-form-item>
              <el-form-item label="面试方式 & 地址">
                <el-input v-model="methodAndAddress" placeholder="会议链接 / 线下地址" />
              </el-form-item>
              <el-form-item label="简短备注">
                <el-input v-model="briefNote" placeholder="单行备注" />
              </el-form-item>
            </el-form>
          </div>
        </aside>

        <main class="interview-record-main">
          <el-tabs v-model="activeTab" class="interview-record-tabs">
            <el-tab-pane label="面试准备" name="prep">
              <div class="interview-record-tab-body">
                <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p class="m-0 max-w-xl text-[13px] leading-relaxed text-[#7b899a]">
                    可从上方进入求职 Agent，自动带上当前投递与简历；确认后的复习内容仍可手动整理在这里。
                  </p>
                </div>

                <section v-for="group in prepGroups" :key="group.kind" class="mb-6">
                  <div class="mb-2 flex items-baseline gap-2">
                    <h3 class="m-0 text-[15px] font-semibold text-[#31445b]">{{ group.label }}</h3>
                    <span class="text-xs text-[#8a96a6]">{{ group.hint }}</span>
                  </div>
                  <div v-if="group.blocks.length" class="space-y-3">
                    <el-card v-for="block in group.blocks" :key="block.id" shadow="never" class="material-surface !p-0">
                      <div class="p-4">
                        <div class="mb-2 flex items-center gap-2">
                          <el-input v-model="block.title" class="max-w-sm" placeholder="标题" />
                          <el-button link type="danger" @click="removeBlock(block.id)">删除</el-button>
                        </div>
                        <el-input v-model="block.content" type="textarea" :rows="6" placeholder="内容（Markdown）" />
                      </div>
                    </el-card>
                  </div>
                  <el-empty v-else :description="'暂无内容，点击上方 AI 分析生成'" :image-size="56" />
                </section>

                <el-divider content-position="left">本场笔记 / 项目问答</el-divider>
                <el-input v-model="prepNotes" type="textarea" :rows="12" placeholder="面试前在这里写项目问答、STAR 表述、要复习的笔记……（导出 Markdown 时会包含本段）" />
              </div>
            </el-tab-pane>

            <el-tab-pane label="面试复盘" name="review">
              <div class="interview-record-tab-body">
                <el-alert class="mb-4" type="info" :closable="false" show-icon>
                  <template #title>面试结束后再切换到这里填写，复盘内容与面试准备内容完全隔离。</template>
                  面试结果保存后会自动同步投递台账状态：通过且为终面/HR面 → Offer，其余通过 → 面试中；未通过 → 挂了；放弃 → 放弃。
                </el-alert>

                <div class="mb-6 max-w-md">
                  <p class="mb-2 text-[13px] font-semibold text-[#31445b]">面试结果</p>
                  <el-select v-model="result" clearable placeholder="选择面试结果" class="w-full">
                    <el-option v-for="option in resultOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>
                  <p v-if="applicationId" class="mt-1 text-xs text-[#8a96a6]">已绑定投递记录，保存后自动同步对应投递状态。</p>
                </div>

                <el-divider content-position="left">录音文字内容（转写文本）</el-divider>
                <div class="mb-2 flex items-center justify-between">
                  <p class="m-0 text-[13px] text-[#7b899a]">粘贴或上传录音文字内容，AI 将提取被问到的问题、发挥不错的地方、不足改进点。</p>
                  <el-upload :auto-upload="false" :show-file-list="false" accept=".md,.txt,text/markdown,text/plain" :on-change="onTranscriptFileChange">
                    <el-button plain size="small">上传文字文件</el-button>
                  </el-upload>
                </div>
                <el-input v-model="transcript" type="textarea" :rows="8" placeholder="粘贴面试录音的转写文字……" />
                <div class="mt-3 text-right">
                  <el-button type="primary" :loading="extracting" @click="previewReview">AI 提取复盘</el-button>
                </div>

                <el-divider content-position="left">历史复盘</el-divider>
                <div v-if="reviewEntries.length" class="space-y-3">
                  <el-card v-for="entry in reviewEntries" :key="entry.id" shadow="never" class="material-surface">
                    <template #header><strong>{{ entry.date }}</strong></template>
                    <p class="mb-1 mt-0 text-xs font-semibold text-[#8a96a6]">被问到的问题</p>
                    <p v-for="item in entry.extracted.questionsAsked" :key="item" class="my-0.5 text-sm">- {{ item }}</p>
                    <p v-if="!entry.extracted.questionsAsked.length" class="my-0.5 text-sm text-[#8a96a6]">- （无）</p>
                    <p class="mb-1 mt-3 text-xs font-semibold text-[#8a96a6]">发挥不错的地方</p>
                    <p v-for="item in entry.extracted.strengths" :key="item" class="my-0.5 text-sm">- {{ item }}</p>
                    <p v-if="!entry.extracted.strengths.length" class="my-0.5 text-sm text-[#8a96a6]">- （无）</p>
                    <p class="mb-1 mt-3 text-xs font-semibold text-[#8a96a6]">不足与改进点</p>
                    <p v-for="item in entry.extracted.improvements" :key="item" class="my-0.5 text-sm">- {{ item }}</p>
                    <p v-if="!entry.extracted.improvements.length" class="my-0.5 text-sm text-[#8a96a6]">- （无）</p>
                  </el-card>
                </div>
                <el-empty v-else description="还没有复盘记录" :image-size="72" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </main>
      </div>
    </div>

    <el-dialog v-model="reviewPreviewVisible" title="复盘提取预览" width="640px" destroy-on-close>
      <template v-if="reviewPreview">
        <p class="mb-1 mt-0 text-xs font-semibold text-[#8a96a6]">被问到的问题</p>
        <p v-for="item in reviewPreview.questionsAsked" :key="item" class="my-0.5 text-sm">- {{ item }}</p>
        <p v-if="!reviewPreview.questionsAsked.length" class="my-0.5 text-sm text-[#8a96a6]">- （无）</p>
        <p class="mb-1 mt-3 text-xs font-semibold text-[#8a96a6]">发挥不错的地方</p>
        <p v-for="item in reviewPreview.strengths" :key="item" class="my-0.5 text-sm">- {{ item }}</p>
        <p v-if="!reviewPreview.strengths.length" class="my-0.5 text-sm text-[#8a96a6]">- （无）</p>
        <p class="mb-1 mt-3 text-xs font-semibold text-[#8a96a6]">不足与改进点</p>
        <p v-for="item in reviewPreview.improvements" :key="item" class="my-0.5 text-sm">- {{ item }}</p>
        <p v-if="!reviewPreview.improvements.length" class="my-0.5 text-sm text-[#8a96a6]">- （无）</p>
      </template>
      <template #footer>
        <el-button @click="reviewPreviewVisible = false">取消</el-button>
        <el-button type="primary" :loading="confirming" @click="confirmReview">确认加入复盘</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.interview-record-page {
  height: calc(100vh - 128px);
  min-height: 560px;
}

.interview-record-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 14px 34px rgba(89, 96, 98, 0.08), inset 0 1px rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(14px) saturate(108%);
}

.interview-record-topbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(190, 204, 195, 0.7);
  background: rgba(255, 254, 250, 0.72);
}

.interview-record-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.interview-record-sidebar {
  flex: none;
  width: 324px;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 22px 24px;
  border-right: 1px solid rgba(190, 204, 195, 0.65);
  background: rgba(248, 250, 252, 0.55);
}

.interview-record-sidebar-panel {
  padding: 2px;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.interview-record-sidebar .el-form-item {
  margin-bottom: 14px;
}

.record-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.record-heading button,
.context-brief button {
  border: 0;
  background: transparent;
  color: #7c6f9d;
  font-size: 12px;
  cursor: pointer;
}

.record-list {
  display: grid;
  gap: 7px;
  max-height: 210px;
  overflow-y: auto;
  padding-right: 2px;
}

.record-list > button {
  position: relative;
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid rgba(132, 149, 171, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.46);
  color: #607086;
  text-align: left;
  cursor: pointer;
}

.record-list > button.active {
  border-color: rgba(112, 139, 126, 0.46);
  background: rgba(231, 240, 234, 0.72);
}

.record-list strong { color: #344960; font-size: 13px; }
.record-list span { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.record-list small { position: absolute; top: 10px; right: 10px; color: #98a3b0; font-size: 10px; }
.record-empty { margin: 2px 0; color: #8a96a6; font-size: 12px; line-height: 1.6; }

.context-brief {
  display: grid;
  gap: 5px;
  padding: 11px 12px;
  border-left: 3px solid #8ca999;
  background: rgba(238, 244, 240, 0.7);
}

.context-brief > div { display: flex; align-items: center; justify-content: space-between; }
.context-brief small { color: #7c8998; font-size: 11px; }
.context-brief strong { color: #344960; font-size: 13px; }
.context-brief span { color: #788697; font-size: 12px; }

.interview-record-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 22px 32px;
}

.interview-record-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.interview-record-tab-body {
  padding-bottom: 12px;
}

@media (max-width: 767px) {
  .interview-record-page {
    height: auto;
    min-height: 0;
  }

  .interview-record-shell {
    height: auto;
    overflow: visible;
  }

  .interview-record-topbar {
    flex-wrap: wrap;
    padding: 12px;
  }

  .interview-record-body {
    flex-direction: column;
  }

  .interview-record-sidebar {
    width: 100%;
    overflow: visible;
    border-right: 0;
    border-bottom: 1px solid rgba(190, 204, 195, 0.65);
  }

  .interview-record-main {
    overflow: visible;
  }
}
</style>
