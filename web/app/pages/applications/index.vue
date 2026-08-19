<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type ApplicationStatus = 'SAVED' | 'PREPARING' | 'APPLIED' | 'WRITTEN_TEST' | 'INTERVIEWING' | 'OFFERED' | 'REJECTED' | 'WITHDRAWN'
type ApplicationChannel = 'OFFICIAL_SITE' | 'BOSS' | 'NIUKE' | 'REFERRAL' | 'OTHER'

interface Company { name: string }
interface Job {
  title: string
  department: string | null
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  url: string | null
  description: string | null
  company: Company
}
interface ApplicationItem {
  id: string
  status: ApplicationStatus
  channel: ApplicationChannel
  appliedAt: string | null
  nextAction: string | null
  nextActionAt: string | null
  notes?: string | null
  updatedAt: string
  job: Job
}
interface ApplicationEvent { id: string, type: 'CREATE' | 'UPDATE' | 'STATUS_CHANGED' | 'DELETE', occurredAt: string }
interface ApplicationDetail extends ApplicationItem { events: ApplicationEvent[] }
interface ApplicationListData { items: ApplicationItem[], page: number, pageSize: number, total: number }
interface JobPreference { targetRoles: string[], targetCities: string[], companyTypes: string[], technicalFocus: string[] }
interface EvaluationResult { matchScore: number, priority: string, roleRequirements: Array<{ requirement: string, jdEvidence: string }>, resumeMatches: Array<{ area: string, assessment: string, resumeEvidence: string }>, gapsAndRisks: Array<{ description: string, impact: string, evidence: string }>, preApplicationAdvice: Array<{ action: string, reason: string }> }
interface EvaluationRun { id: string, status: string, provider: string, model: string, startedAt: string, output: EvaluationResult | null }
interface MaterialsDraft { resumeSuggestions: Array<{ target: string, suggestion: string, evidence: string }>, rewrittenSections: Array<{ section: string, originalFocus: string, rewrittenText: string, evidence: string }>, greetings: { short: { text: string, evidence: string }, standard: { text: string, evidence: string }, technicalHighlight: { text: string, evidence: string } } }
interface ResumeDigest { sha256: string, characterCount: number, keywordSummary: string[] }
interface ApplicationMaterial { id: string, wasEdited: boolean, provider: string, model: string, createdAt: string, content: MaterialsDraft }

const statusOptions: Array<{ value: ApplicationStatus, label: string }> = [
  { value: 'SAVED', label: '收藏' }, { value: 'PREPARING', label: '准备中' },
  { value: 'APPLIED', label: '已投递' }, { value: 'WRITTEN_TEST', label: '笔试中' },
  { value: 'INTERVIEWING', label: '面试中' }, { value: 'OFFERED', label: 'Offer' },
  { value: 'REJECTED', label: '挂了' }, { value: 'WITHDRAWN', label: '放弃' },
]
const channelOptions: Array<{ value: ApplicationChannel, label: string }> = [
  { value: 'BOSS', label: 'BOSS 直聘' }, { value: 'OFFICIAL_SITE', label: '官网' },
  { value: 'NIUKE', label: '牛客' }, { value: 'REFERRAL', label: '内推' }, { value: 'OTHER', label: '其他' },
]

const filters = reactive({ search: '', status: undefined as ApplicationStatus | undefined, channel: undefined as ApplicationChannel | undefined })
const applications = ref<ApplicationItem[]>([])
const total = ref(0)
const loading = ref(false)
const databaseError = ref(false)
const createDialogVisible = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const submitting = ref(false)
const deleting = ref(false)
const selectedApplication = ref<ApplicationDetail | null>(null)
const viewMode = ref<'list' | 'kanban'>('list')
const draggedApplicationId = ref<string | null>(null)
type ResumeVersionItem = { id: string; type: 'BASE' | 'TARGETED'; content: string; createdAt: string; application?: { job?: { title?: string; company?: { name?: string } } | null } | null }
const resumeVersions = ref<ResumeVersionItem[]>([])
const evaluationVersionId = ref('')
const evaluationLoading = ref(false)
const preferenceSaving = ref(false)
const evaluationHistory = ref<EvaluationRun[]>([])
const evaluationDialogVisible = ref(false)
const materialsDialogVisible = ref(false)
const materialsLoading = ref(false)
const materialsSaving = ref(false)
const materialVersionId = ref('')
const materialDraft = ref<MaterialsDraft | null>(null)
const materialContent = ref<MaterialsDraft | null>(null)
const materialResumeDigest = ref<ResumeDigest | null>(null)
const materialEvaluationRunId = ref<string | null>(null)
const materialHistory = ref<ApplicationMaterial[]>([])
const preferenceForm = reactive({ targetRoles: '', targetCities: '', companyTypes: '', technicalFocus: '' })

const emptyForm = () => ({
  companyName: '', jobTitle: '', department: '', location: '', salaryMin: undefined as number | undefined,
  salaryMax: undefined as number | undefined, channel: 'BOSS' as ApplicationChannel, status: 'SAVED' as ApplicationStatus,
  appliedAt: '', jobUrl: '', description: '', notes: '', nextAction: '', nextActionAt: '',
})
const form = reactive(emptyForm())
const originalStatus = ref<ApplicationStatus>('SAVED')

function statusLabel(status: ApplicationStatus) { return statusOptions.find(option => option.value === status)?.label ?? status }
function channelLabel(channel: ApplicationChannel) { return channelOptions.find(option => option.value === channel)?.label ?? channel }
function statusTone(status: ApplicationStatus) {
  return ({
    SAVED: 'neutral', PREPARING: 'amber', APPLIED: 'blue', WRITTEN_TEST: 'violet',
    INTERVIEWING: 'green', OFFERED: 'success', REJECTED: 'danger', WITHDRAWN: 'neutral',
  } as Record<ApplicationStatus, string>)[status]
}
function priorityLabel(priority: string) {
  return ({
    HIGH_APPLY_SOON: '建议尽快投递',
    MEDIUM_PREPARE_THEN_APPLY: '建议准备后投递',
    LOW_BACKUP: '可作为备选',
    DO_NOT_APPLY_HARD_MISMATCH: '暂不建议投递',
  } as Record<string, string>)[priority] ?? priority
}
function eventLabel(type: ApplicationEvent['type']) { return ({ CREATE: '创建投递', UPDATE: '编辑信息', STATUS_CHANGED: '状态变更', DELETE: '删除投递' })[type] }
function dateText(value: string | null) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '—' }
function toDateInput(value: string | null) { return value ? value.slice(0, 10) : '' }
function optional(value: string) { return value.trim() || null }
function salaryText(item: ApplicationItem) {
  const { salaryMin, salaryMax } = item.job
  if (!salaryMin && !salaryMax) return '薪资面议'
  const format = (value: number | null) => value ? `${Math.round(value / 1000)}k` : ''
  return `${format(salaryMin)}${salaryMin && salaryMax ? '-' : ''}${format(salaryMax)}`
}
function resetForm() { Object.assign(form, emptyForm()) }
function resetFilters() {
  Object.assign(filters, { search: '', status: undefined, channel: undefined })
  void fetchApplications()
}
function applicationPayload() {
  return {
    companyName: form.companyName.trim(), jobTitle: form.jobTitle.trim(), department: optional(form.department), location: optional(form.location),
    salaryMin: form.salaryMin || null, salaryMax: form.salaryMax || null, channel: form.channel,
    appliedAt: optional(form.appliedAt), jobUrl: optional(form.jobUrl), description: optional(form.description), notes: optional(form.notes),
    nextAction: optional(form.nextAction), nextActionAt: optional(form.nextActionAt),
  }
}

async function loadResumeVersions() {
  try {
    const response = await $fetch<{ data: { id: string; versions: ResumeVersionItem[] } | null }>('/api/v1/resumes')
    resumeVersions.value = response.data?.versions ?? []
    const firstVersion = resumeVersions.value[0]
    if (firstVersion) evaluationVersionId.value = firstVersion.id
  }
  catch { resumeVersions.value = [] }
}
function versionLabel(version: ResumeVersionItem) {
  if (version.type === 'BASE') return '基础版'
  const job = version.application?.job
  return job ? `定制版（${job.company?.name ?? ''}-${job.title ?? ''}）` : `定制版（${new Date(version.createdAt).toLocaleDateString('zh-CN')}）`
}
async function fetchApplications() {
  loading.value = true
  databaseError.value = false
  try {
    const response = await $fetch<{ data: ApplicationListData }>('/api/v1/applications', { query: { search: filters.search || undefined, status: filters.status, channel: filters.channel } })
    applications.value = response.data.items
    total.value = response.data.total
  }
  catch { applications.value = []; total.value = 0; databaseError.value = true }
  finally { loading.value = false }
}

async function createApplication() {
  if (!form.companyName.trim() || !form.jobTitle.trim()) { ElMessage.warning('请至少填写公司名称和岗位名称。'); return }
  submitting.value = true
  try {
    await $fetch('/api/v1/applications', { method: 'POST', body: { ...applicationPayload(), status: form.status } })
    ElMessage.success('投递记录已创建'); createDialogVisible.value = false; resetForm(); await fetchApplications()
  }
  catch { ElMessage.error('保存失败，请检查必填信息和本地数据库连接。') }
  finally { submitting.value = false }
}

async function openDetail(item: ApplicationItem) {
  detailVisible.value = true; detailLoading.value = true; selectedApplication.value = null
  try {
    const response = await $fetch<{ data: ApplicationDetail }>(`/api/v1/applications/${item.id}`)
    selectedApplication.value = response.data
    Object.assign(form, {
      companyName: response.data.job.company.name, jobTitle: response.data.job.title, department: response.data.job.department ?? '',
      location: response.data.job.location ?? '', salaryMin: response.data.job.salaryMin ?? undefined, salaryMax: response.data.job.salaryMax ?? undefined,
      channel: response.data.channel, status: response.data.status, appliedAt: toDateInput(response.data.appliedAt), jobUrl: response.data.job.url ?? '',
      description: response.data.job.description ?? '', notes: response.data.notes ?? '', nextAction: response.data.nextAction ?? '', nextActionAt: toDateInput(response.data.nextActionAt),
    })
    originalStatus.value = response.data.status
    evaluationVersionId.value = resumeVersions.value[0]?.id ?? ''
    await loadEvaluationData(response.data.id)
  }
  catch { ElMessage.error('加载投递详情失败。'); detailVisible.value = false }
  finally { detailLoading.value = false }
}

function splitPreference(value: string) { return value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean) }
function applyPreference(preference: JobPreference) {
  preferenceForm.targetRoles = preference.targetRoles.join('、')
  preferenceForm.targetCities = preference.targetCities.join('、')
  preferenceForm.companyTypes = preference.companyTypes.join('、')
  preferenceForm.technicalFocus = preference.technicalFocus.join('、')
}
async function loadEvaluationData(applicationId: string) {
  try {
    const [preference, history] = await Promise.all([
      $fetch<{ data: JobPreference }>('/api/v1/job-preference'),
      $fetch<{ data: EvaluationRun[] }>(`/api/v1/applications/${applicationId}/evaluations`),
    ])
    applyPreference(preference.data); evaluationHistory.value = history.data
  }
  catch { evaluationHistory.value = []; ElMessage.warning('岗位评估数据加载失败。') }
}
async function savePreference() {
  preferenceSaving.value = true
  try {
    const response = await $fetch<{ data: JobPreference }>('/api/v1/job-preference', { method: 'PATCH', body: {
      targetRoles: splitPreference(preferenceForm.targetRoles), targetCities: splitPreference(preferenceForm.targetCities),
      companyTypes: splitPreference(preferenceForm.companyTypes), technicalFocus: splitPreference(preferenceForm.technicalFocus),
    } })
    applyPreference(response.data); ElMessage.success('求职偏好已保存')
  }
  catch { ElMessage.error('求职偏好保存失败，请检查输入。') }
  finally { preferenceSaving.value = false }
}
async function runEvaluation() {
  if (!selectedApplication.value) return
  const version = resumeVersions.value.find(item => item.id === evaluationVersionId.value)
  if (!version?.content.trim()) { ElMessage.warning('请选择用于评估的简历版本。'); return }
  if (!selectedApplication.value.job.description?.trim()) { ElMessage.warning('请先保存岗位 JD，再进行评估。'); return }
  evaluationLoading.value = true
  try {
    await $fetch(`/api/v1/applications/${selectedApplication.value.id}/evaluations`, { method: 'POST', body: { resumeText: version.content } })
    await loadEvaluationData(selectedApplication.value.id)
    ElMessage.success('岗位评估已完成')
  }
  catch { ElMessage.error('岗位评估失败，请检查 JD 和 AI 设置。') }
  finally { evaluationLoading.value = false }
}
function cloneMaterials(draft: MaterialsDraft) { return JSON.parse(JSON.stringify(draft)) as MaterialsDraft }
async function loadMaterialsHistory(applicationId: string) {
  const response = await $fetch<{ data: ApplicationMaterial[] }>(`/api/v1/applications/${applicationId}/materials`)
  materialHistory.value = response.data
}
function openInterviewPrep() {
  if (!selectedApplication.value) return
  navigateTo('/interview-prep?applicationId=' + selectedApplication.value.id)
}

async function openMaterials() {
  if (!selectedApplication.value) return
  materialVersionId.value = resumeVersions.value[0]?.id ?? ''; materialDraft.value = null; materialContent.value = null; materialResumeDigest.value = null
  materialsDialogVisible.value = true
  try { await loadMaterialsHistory(selectedApplication.value.id) }
  catch { materialHistory.value = []; ElMessage.warning('投递材料历史加载失败。') }
}
async function previewMaterials() {
  if (!selectedApplication.value) return
  const version = resumeVersions.value.find(item => item.id === materialVersionId.value)
  if (!version?.content.trim()) { ElMessage.warning('请选择用于生成材料的简历版本。'); return }
  if (!selectedApplication.value.job.description?.trim()) { ElMessage.warning('请先保存岗位 JD，再生成投递材料。'); return }
  materialsLoading.value = true
  try {
    const response = await $fetch<{ data: { aiDraft: MaterialsDraft, resumeDigest: ResumeDigest, evaluationRunId: string | null } }>(`/api/v1/applications/${selectedApplication.value.id}/materials/preview`, { method: 'POST', body: { resumeText: version.content } })
    materialDraft.value = response.data.aiDraft; materialContent.value = cloneMaterials(response.data.aiDraft)
    materialResumeDigest.value = response.data.resumeDigest; materialEvaluationRunId.value = response.data.evaluationRunId
    ElMessage.success('投递材料已生成，可编辑后保存。')
  }
  catch { ElMessage.error('生成失败，请检查 JD 和 AI 设置。') }
  finally { materialsLoading.value = false }
}
async function saveMaterials() {
  if (!selectedApplication.value || !materialDraft.value || !materialContent.value || !materialResumeDigest.value) return
  materialsSaving.value = true
  try {
    await $fetch(`/api/v1/applications/${selectedApplication.value.id}/materials`, { method: 'POST', body: { aiDraft: materialDraft.value, content: materialContent.value, resumeDigest: materialResumeDigest.value, evaluationRunId: materialEvaluationRunId.value } })
    await loadMaterialsHistory(selectedApplication.value.id)
    ElMessage.success('投递材料已保存')
  }
  catch { ElMessage.error('材料保存失败，请稍后重试。') }
  finally { materialsSaving.value = false }
}

async function saveDetail() {
  if (!selectedApplication.value || !form.companyName.trim() || !form.jobTitle.trim()) { ElMessage.warning('公司名称和岗位名称不能为空。'); return }
  submitting.value = true
  try {
    await $fetch(`/api/v1/applications/${selectedApplication.value.id}`, { method: 'PATCH', body: applicationPayload() })
    if (form.status !== originalStatus.value) await $fetch(`/api/v1/applications/${selectedApplication.value.id}/status`, { method: 'PATCH', body: { status: form.status, source: 'DETAIL' } })
    ElMessage.success('投递信息已保存'); detailVisible.value = false; await fetchApplications()
  }
  catch { ElMessage.error('保存失败，请检查输入内容。') }
  finally { submitting.value = false }
}

async function removeApplication() {
  if (!selectedApplication.value) return
  try { await ElMessageBox.confirm('删除后不会在看板中显示，但审计记录会保留。确定删除吗？', '删除投递', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) }
  catch { return }
  deleting.value = true
  try {
    await $fetch(`/api/v1/applications/${selectedApplication.value.id}`, { method: 'DELETE' })
    ElMessage.success('投递记录已删除'); detailVisible.value = false; await fetchApplications()
  }
  catch { ElMessage.error('删除失败，请稍后重试。') }
  finally { deleting.value = false }
}

async function moveApplication(application: ApplicationItem, status: ApplicationStatus) {
  if (application.status === status) return
  const previousStatus = application.status; application.status = status
  try { await $fetch(`/api/v1/applications/${application.id}/status`, { method: 'PATCH', body: { status, source: 'KANBAN' } }); ElMessage.success(`已移动到「${statusLabel(status)}」`) }
  catch { application.status = previousStatus; ElMessage.error('状态更新失败，请确认本地数据库已经启动。') }
}
function dropOnStatus(status: ApplicationStatus) { const application = applications.value.find(item => item.id === draggedApplicationId.value); draggedApplicationId.value = null; if (application) void moveApplication(application, status) }

onMounted(() => { void loadResumeVersions(); void fetchApplications() })
</script>

<template>
  <section class="page-rail application-board">
    <el-alert v-if="databaseError" class="mb-3" type="warning" :closable="false" show-icon>
      <template #title>本地数据库未连接</template>
      请启动 Docker Desktop 后，在仓库根目录运行 <code>docker compose up -d db</code>，再刷新本页。
    </el-alert>

    <section class="application-records">
    <div class="application-records__header">
      <div><span class="application-board__eyebrow">ALL APPLICATIONS</span></div>
      <span class="application-records__count">{{ total }} 条记录</span>
    </div>
    <div class="application-records__toolbar">
      <el-input v-model="filters.search" style="width: 180px" clearable placeholder="搜索公司或岗位" @input="fetchApplications" @clear="fetchApplications" />
      <el-select v-model="filters.status" style="width: 104px" clearable placeholder="状态" @change="fetchApplications" @clear="fetchApplications"><el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select>
      <el-select v-model="filters.channel" style="width: 104px" clearable placeholder="渠道" @change="fetchApplications" @clear="fetchApplications"><el-option v-for="option in channelOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select>
      <el-button class="application-records__reset" plain @click="resetFilters">重置</el-button>
      <el-button-group class="application-records__view-toggle ml-auto"><el-button :class="{ 'is-active': viewMode === 'list' }" @click="viewMode = 'list'">列表</el-button>
        <el-button :class="{ 'is-active': viewMode === 'kanban' }" @click="viewMode = 'kanban'">看板</el-button></el-button-group>
    </div>

    <div v-if="viewMode === 'list'" class="workbench-table-shell workbench-table-shell--transparent"><el-table v-loading="loading" :data="applications" empty-text="还没有投递记录，先创建第一条吧。" class="w-full" @row-click="openDetail">
      <el-table-column label="公司 / 岗位" min-width="290"><template #default="{ row }"><strong class="application-cell-company">{{ row.job.company.name }} · {{ row.job.title }}</strong></template></el-table-column>
      <el-table-column label="当前阶段" width="140"><template #default="{ row }"><span :class="['application-status', `application-status--${statusTone(row.status)}`]">{{ statusLabel(row.status) }}</span></template></el-table-column>
      <el-table-column label="下一步" min-width="220"><template #default="{ row }"><span class="application-cell-next">{{ row.nextAction || '待安排' }}</span></template></el-table-column>
      <el-table-column label="渠道" width="120"><template #default="{ row }"><span class="application-cell-channel">{{ channelLabel(row.channel) }}</span></template></el-table-column>
      <el-table-column label="地点 / 薪资" min-width="160"><template #default="{ row }"><span class="application-cell-meta">{{ row.job.location || '地点待定' }} · {{ salaryText(row) }}</span></template></el-table-column>
    </el-table></div>

    <div v-else v-loading="loading" class="grid gap-3 overflow-x-auto pb-2" style="grid-template-columns: repeat(8, minmax(200px, 1fr))">
      <section v-for="status in statusOptions" :key="status.value" class="min-h-96 rounded-[20px] border border-white/70 bg-white/48 p-3 shadow-[0_10px_24px_rgba(100,114,148,.06)] backdrop-blur-xl" @dragover.prevent @drop="dropOnStatus(status.value)">
        <div class="mb-3 flex items-center justify-between"><span :class="['application-status', `application-status--${statusTone(status.value)}`]">{{ status.label }}</span><el-tag size="small" effect="plain">{{ applications.filter(item => item.status === status.value).length }}</el-tag></div>
        <div class="space-y-2"><article v-for="item in applications.filter(application => application.status === status.value)" :key="item.id" draggable="true" class="application-kanban-card cursor-grab rounded-[14px] border border-white/80 bg-white/78 p-3 shadow-[0_7px_16px_rgba(100,114,148,.08)]" @click="openDetail(item)" @dragstart="draggedApplicationId = item.id"><strong class="block text-sm text-slate-800">{{ item.job.company.name }}</strong><p class="my-1 text-sm text-slate-600">{{ item.job.title }}</p><p class="m-0 text-xs text-slate-400">{{ item.job.location || '地点待定' }} · {{ salaryText(item) }}</p><p v-if="item.nextAction" class="mb-0 mt-2 border-t border-slate-100 pt-2 text-xs text-[#6385be]">下一步：{{ item.nextAction }}</p></article></div>
      </section>
    </div>
    </section>

    <el-dialog v-model="createDialogVisible" title="新增投递" width="620px" destroy-on-close @closed="resetForm">
      <el-form label-position="top"><div class="grid grid-cols-1 gap-x-4 md:grid-cols-2"><el-form-item label="公司名称" required><el-input v-model="form.companyName" placeholder="例如：字节跳动" /></el-form-item><el-form-item label="岗位名称" required><el-input v-model="form.jobTitle" placeholder="例如：前端开发工程师" /></el-form-item><el-form-item label="投递状态" required><el-select v-model="form.status" class="w-full"><el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item><el-form-item label="投递渠道"><el-select v-model="form.channel" class="w-full"><el-option v-for="option in channelOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item></div><el-form-item label="工作地点"><el-input v-model="form.location" placeholder="例如：北京" /></el-form-item><el-form-item label="岗位链接"><el-input v-model="form.jobUrl" placeholder="https://..." /></el-form-item><el-form-item label="下一步安排"><el-input v-model="form.nextAction" placeholder="例如：本周五前完成笔试" /></el-form-item><el-form-item label="JD 原文"><el-input v-model="form.description" type="textarea" :rows="4" placeholder="可粘贴职位描述，后续用于匹配与打招呼话生成。" /></el-form-item></el-form>
      <template #footer><el-button type="primary" :loading="submitting" @click="createApplication">保存投递</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="投递详情" size="400px" destroy-on-close :show-close="false" header-class="!mb-0 !pb-2">
      <template #header><div class="flex w-full items-center justify-between gap-2"><h2 class="m-0 text-lg font-semibold text-slate-800">投递详情</h2><div class="flex gap-1"><el-button size="small" type="primary" plain @click="evaluationDialogVisible = true">AI 评估</el-button><el-button size="small" type="primary" plain @click="openInterviewPrep">面试准备</el-button><el-button size="small" type="primary" plain @click="openMaterials">投递材料</el-button></div></div></template>
      <div v-loading="detailLoading" class="pr-3"><template v-if="selectedApplication"><el-form label-position="top"><div class="grid grid-cols-1 gap-x-4 md:grid-cols-2"><el-form-item label="公司名称" required><el-input v-model="form.companyName" /></el-form-item><el-form-item label="岗位名称" required><el-input v-model="form.jobTitle" /></el-form-item><el-form-item label="部门"><el-input v-model="form.department" /></el-form-item><el-form-item label="工作地点"><el-input v-model="form.location" /></el-form-item><el-form-item label="薪资下限（元/月）"><el-input-number v-model="form.salaryMin" class="w-full" :min="1" controls-position="right" /></el-form-item><el-form-item label="薪资上限（元/月）"><el-input-number v-model="form.salaryMax" class="w-full" :min="1" controls-position="right" /></el-form-item><el-form-item label="状态"><el-select v-model="form.status" class="w-full"><el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item><el-form-item label="投递渠道"><el-select v-model="form.channel" class="w-full"><el-option v-for="option in channelOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item><el-form-item label="投递日期"><el-date-picker v-model="form.appliedAt" class="w-full" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="下一步日期"><el-date-picker v-model="form.nextActionAt" class="w-full" type="date" value-format="YYYY-MM-DD" /></el-form-item></div><el-form-item label="岗位链接"><el-input v-model="form.jobUrl" /></el-form-item><el-form-item label="下一步安排"><el-input v-model="form.nextAction" /></el-form-item><el-form-item label="JD 原文"><el-input v-model="form.description" type="textarea" :rows="5" /></el-form-item><el-form-item label="备注"><el-input v-model="form.notes" type="textarea" :rows="4" /></el-form-item></el-form><div class="mt-6 border-t border-slate-200 pt-5"><h3 class="mb-3 text-base text-slate-800">操作时间线</h3><el-timeline><el-timeline-item v-for="event in selectedApplication.events" :key="event.id" :timestamp="dateText(event.occurredAt)" placement="top">{{ eventLabel(event.type) }}</el-timeline-item></el-timeline></div></template></div>
      <template #footer><div class="flex items-center justify-between"><el-button type="danger" plain :loading="deleting" @click="removeApplication">删除投递</el-button><el-button type="primary" :loading="submitting" @click="saveDetail">保存修改</el-button></div></template>
    </el-drawer>
    <el-dialog v-model="evaluationDialogVisible" title="AI 评估岗位" width="640px" destroy-on-close>
      <el-alert class="mb-4" type="info" :closable="false" title="评估使用 AI 设置中的真实模型；简历内容仅用于本次评估，系统只保存摘要和结果，不保存完整原文。" />
      <el-select v-model="evaluationVersionId" class="w-full" placeholder="选择简历版本"><el-option v-for="v in resumeVersions" :key="v.id" :label="versionLabel(v)" :value="v.id" /></el-select>
      <el-collapse class="mt-3"><el-collapse-item title="求职偏好"><div class="grid grid-cols-1 gap-2 md:grid-cols-2"><el-input v-model="preferenceForm.targetRoles" placeholder="目标岗位（逗号分隔）" /><el-input v-model="preferenceForm.targetCities" placeholder="目标城市" /><el-input v-model="preferenceForm.companyTypes" placeholder="公司类型（可选）" /><el-input v-model="preferenceForm.technicalFocus" placeholder="技术方向" /></div><el-button class="mt-3" plain type="primary" :loading="preferenceSaving" @click="savePreference">保存求职偏好</el-button></el-collapse-item></el-collapse>
      <div v-if="evaluationHistory.length" class="mt-4 space-y-3"><article v-for="run in evaluationHistory" :key="run.id" class="rounded border border-slate-200 p-3"><div class="flex items-center justify-between"><strong>匹配度 {{ run.output?.matchScore ?? '-' }} 分</strong><el-tag type="success">{{ run.output ? priorityLabel(run.output.priority) : run.status }}</el-tag></div><p class="mt-2 text-xs text-slate-500">{{ dateText(run.startedAt) }} · {{ run.provider }} / {{ run.model }}</p><p v-for="advice in run.output?.preApplicationAdvice ?? []" :key="advice.action" class="mb-1 text-sm">{{ advice.action }}</p></article></div>
      <template #footer><el-button type="primary" :loading="evaluationLoading" @click="runEvaluation">运行评估</el-button></template>
    </el-dialog>
    <el-dialog v-model="materialsDialogVisible" title="投递材料" width="720px" destroy-on-close>
      <el-alert class="mb-4" type="info" :closable="false" title="预览使用 AI 设置中的真实模型生成；简历仅用于本次生成，预览不会保存，点击保存材料后才写入历史。" />
      <section v-if="materialHistory.length" class="mb-4 rounded border border-slate-200 bg-slate-50 p-3"><h3 class="m-0 text-base text-slate-800">已保存历史</h3><el-collapse class="mt-2"><el-collapse-item v-for="item in materialHistory" :key="item.id" :title="`${dateText(item.createdAt)} · ${item.wasEdited ? '已编辑后保存' : '保留 AI 初稿'}`"><h4 class="mb-2 mt-0 text-sm">简历优化建议</h4><div v-for="suggestion in item.content.resumeSuggestions" :key="suggestion.target" class="mb-2"><strong class="text-sm">{{ suggestion.target }}</strong><p class="my-1 text-sm">{{ suggestion.suggestion }}</p><p class="m-0 text-xs text-slate-500">依据：{{ suggestion.evidence }}</p></div><h4 class="mb-2 mt-3 text-sm">改写段落</h4><div v-for="section in item.content.rewrittenSections" :key="section.section" class="mb-2"><strong class="text-sm">{{ section.section }}</strong><p class="my-1 whitespace-pre-wrap text-sm">{{ section.rewrittenText }}</p></div><h4 class="mb-2 mt-3 text-sm">打招呼话术</h4><p class="mb-1 text-sm">短版：{{ item.content.greetings.short.text }}</p><p class="mb-1 text-sm">标准版：{{ item.content.greetings.standard.text }}</p><p class="m-0 text-sm">技术亮点版：{{ item.content.greetings.technicalHighlight.text }}</p></el-collapse-item></el-collapse></section>
      <template v-if="!materialContent"><el-select v-model="materialVersionId" class="w-full" placeholder="选择简历版本"><el-option v-for="v in resumeVersions" :key="v.id" :label="versionLabel(v)" :value="v.id" /></el-select><div class="mt-4 text-right"><el-button type="primary" :loading="materialsLoading" @click="previewMaterials">生成预览</el-button></div></template>
      <template v-else><h3 class="mb-2 text-base">简历优化建议</h3><div v-for="item in materialContent.resumeSuggestions" :key="item.target" class="mb-3 rounded border border-slate-200 p-3"><strong>{{ item.target }}</strong><el-input v-model="item.suggestion" class="mt-2" type="textarea" :rows="2" /><p class="mb-0 mt-2 text-xs text-slate-500">依据：{{ item.evidence }}</p></div><h3 class="mb-2 text-base">可复制改写段落</h3><div v-for="item in materialContent.rewrittenSections" :key="item.section" class="mb-3 rounded border border-slate-200 p-3"><strong>{{ item.section }}</strong><el-input v-model="item.rewrittenText" class="mt-2" type="textarea" :rows="3" /><p class="mb-0 mt-2 text-xs text-slate-500">依据：{{ item.evidence }}</p></div><h3 class="mb-2 text-base">打招呼话术</h3><el-form label-position="top"><el-form-item label="短版"><el-input v-model="materialContent.greetings.short.text" type="textarea" :rows="2" /></el-form-item><el-form-item label="标准版"><el-input v-model="materialContent.greetings.standard.text" type="textarea" :rows="3" /></el-form-item><el-form-item label="技术亮点版"><el-input v-model="materialContent.greetings.technicalHighlight.text" type="textarea" :rows="3" /></el-form-item></el-form><div v-if="materialHistory.length" class="mt-4 border-t pt-3"><h3 class="mb-2 text-base">已保存历史</h3><p v-for="item in materialHistory" :key="item.id" class="text-sm text-slate-500">{{ dateText(item.createdAt) }} · {{ item.wasEdited ? '已编辑后保存' : '保留 AI 初稿' }} · {{ item.provider }}</p></div></template>
      <template #footer><el-button v-if="materialContent" type="primary" :loading="materialsSaving" @click="saveMaterials">保存材料</el-button></template>
    </el-dialog>
  </section>
</template>
