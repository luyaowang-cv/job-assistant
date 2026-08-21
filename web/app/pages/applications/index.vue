<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type ApplicationStatus = 'SAVED' | 'PREPARING' | 'APPLIED' | 'WRITTEN_TEST' | 'INTERVIEWING' | 'OFFERED' | 'REJECTED' | 'WITHDRAWN'
type ApplicationChannel = 'OFFICIAL_SITE' | 'BOSS' | 'NIUKE' | 'REFERRAL' | 'OTHER'

interface Company { name: string, description: string | null }
interface Job {
  title: string
  department: string | null
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  url: string | null
  description: string | null
  referralCode: string | null
  applicationNotes: string | null
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

const filters = reactive({ search: '', status: undefined as ApplicationStatus | undefined })
const applications = ref<ApplicationItem[]>([])
const total = ref(0)
const updatedSort = ref<'asc' | 'desc'>('desc')
const loading = ref(false)
const databaseError = ref(false)
const createDialogVisible = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const submitting = ref(false)
const deleting = ref(false)
const deletingId = ref<string | null>(null)
const selectedApplication = ref<ApplicationDetail | null>(null)
const viewMode = ref<'list' | 'kanban'>('list')
const draggedApplicationId = ref<string | null>(null)
type ResumeVersionItem = { id: string; name: string; type: 'BASE' | 'TARGETED'; content: string; createdAt: string; application?: { job?: { title?: string; company?: { name?: string } } | null } | null }
const resumeVersions = ref<ResumeVersionItem[]>([])
const evaluationVersionId = ref('')

const emptyForm = () => ({
  companyName: '', companyDescription: '', jobTitle: '', department: '', location: '', salaryMin: undefined as number | undefined,
  salaryMax: undefined as number | undefined, channel: 'BOSS' as ApplicationChannel, status: 'SAVED' as ApplicationStatus,
  appliedAt: '', jobUrl: '', description: '', referralCode: '', applicationNotes: '', notes: '', nextAction: '', nextActionAt: '',
})
const form = reactive(emptyForm())
const originalStatus = ref<ApplicationStatus>('SAVED')

function statusLabel(status: ApplicationStatus) { return statusOptions.find(option => option.value === status)?.label ?? status }
function statusTone(status: ApplicationStatus) {
  return ({
    SAVED: 'neutral', PREPARING: 'amber', APPLIED: 'blue', WRITTEN_TEST: 'violet',
    INTERVIEWING: 'green', OFFERED: 'success', REJECTED: 'danger', WITHDRAWN: 'neutral',
  } as Record<ApplicationStatus, string>)[status]
}
function eventLabel(type: ApplicationEvent['type']) { return ({ CREATE: '创建投递', UPDATE: '编辑信息', STATUS_CHANGED: '状态变更', DELETE: '删除投递' })[type] }
function dateText(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
}
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
  Object.assign(filters, { search: '', status: undefined })
  void fetchApplications()
}
function applicationPayload() {
  return {
    companyName: form.companyName.trim(), companyDescription: optional(form.companyDescription), jobTitle: form.jobTitle.trim(), department: optional(form.department), location: optional(form.location),
    salaryMin: form.salaryMin || null, salaryMax: form.salaryMax || null, channel: form.channel,
    appliedAt: optional(form.appliedAt), jobUrl: optional(form.jobUrl), description: optional(form.description), referralCode: optional(form.referralCode), applicationNotes: optional(form.applicationNotes), notes: optional(form.notes),
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
async function fetchApplications() {
  loading.value = true
  databaseError.value = false
  try {
    const response = await $fetch<{ data: ApplicationListData }>('/api/v1/applications', { query: { search: filters.search || undefined, status: filters.status, updatedSort: updatedSort.value } })
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

function sortByUpdatedAt({ order }: { order: 'ascending' | 'descending' | null }) {
  updatedSort.value = order === 'ascending' ? 'asc' : 'desc'
  void fetchApplications()
}

async function openDetail(item: ApplicationItem) {
  detailVisible.value = true; detailLoading.value = true; selectedApplication.value = null
  try {
    const response = await $fetch<{ data: ApplicationDetail }>(`/api/v1/applications/${item.id}`)
    selectedApplication.value = response.data
    Object.assign(form, {
      companyName: response.data.job.company.name, companyDescription: response.data.job.company.description ?? '', jobTitle: response.data.job.title, department: response.data.job.department ?? '',
      location: response.data.job.location ?? '', salaryMin: response.data.job.salaryMin ?? undefined, salaryMax: response.data.job.salaryMax ?? undefined,
      channel: response.data.channel, status: response.data.status, appliedAt: toDateInput(response.data.appliedAt), jobUrl: response.data.job.url ?? '',
      description: response.data.job.description ?? '', referralCode: response.data.job.referralCode ?? '', applicationNotes: response.data.job.applicationNotes ?? '', notes: response.data.notes ?? '', nextAction: response.data.nextAction ?? '', nextActionAt: toDateInput(response.data.nextActionAt),
    })
    originalStatus.value = response.data.status
    evaluationVersionId.value = resumeVersions.value[0]?.id ?? ''
  }
  catch { ElMessage.error('加载投递详情失败。'); detailVisible.value = false }
  finally { detailLoading.value = false }
}

function openAgent(mode: 'evaluate' | 'interview') {
  if (!selectedApplication.value) return
  const versionId = evaluationVersionId.value || resumeVersions.value[0]?.id
  navigateTo({ path: '/agent', query: { applicationId: selectedApplication.value.id, ...(versionId ? { resumeVersionId: versionId } : {}), mode } })
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

async function removeApplicationItem(application: ApplicationItem, closeDetail = false) {
  try { await ElMessageBox.confirm('删除后不会在看板中显示，但审计记录会保留。确定删除吗？', '删除投递', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) }
  catch { return }
  deleting.value = true
  deletingId.value = application.id
  try {
    await $fetch(`/api/v1/applications/${application.id}`, { method: 'DELETE' })
    ElMessage.success('投递记录已删除')
    if (closeDetail || selectedApplication.value?.id === application.id) detailVisible.value = false
    await fetchApplications()
  }
  catch { ElMessage.error('删除失败，请稍后重试。') }
  finally { deleting.value = false; deletingId.value = null }
}

async function removeApplication() {
  if (selectedApplication.value) await removeApplicationItem(selectedApplication.value, true)
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
      <el-button class="application-records__reset" plain @click="resetFilters">重置</el-button>
      <el-button-group class="application-records__view-toggle ml-auto"><el-button :class="{ 'is-active': viewMode === 'list' }" @click="viewMode = 'list'">列表</el-button>
        <el-button :class="{ 'is-active': viewMode === 'kanban' }" @click="viewMode = 'kanban'">看板</el-button></el-button-group>
    </div>

    <div v-if="viewMode === 'list'" class="workbench-table-shell workbench-table-shell--transparent"><el-table v-loading="loading" :data="applications" empty-text="还没有投递记录，先创建第一条吧。" class="w-full" :default-sort="{ prop: 'updatedAt', order: 'descending' }" @row-click="openDetail" @sort-change="sortByUpdatedAt">
      <el-table-column label="更新时间" prop="updatedAt" sortable="custom" :sort-orders="['descending', 'ascending']" width="132"><template #default="{ row }">{{ dateText(row.updatedAt) }}</template></el-table-column>
      <el-table-column label="公司 / 岗位" min-width="250"><template #default="{ row }"><div class="application-cell-role"><strong>{{ row.job.company.name }}</strong><span>{{ row.job.title }}</span></div></template></el-table-column>
      <el-table-column label="当前阶段" width="140"><template #default="{ row }"><span :class="['application-status', `application-status--${statusTone(row.status)}`]">{{ statusLabel(row.status) }}</span></template></el-table-column>
      <el-table-column label="下一步" min-width="190"><template #default="{ row }"><span class="application-cell-next">{{ row.nextAction || '待安排' }}</span></template></el-table-column>
      <el-table-column label="内推码" min-width="120"><template #default="{ row }"><span class="application-cell-referral">{{ row.job.referralCode || '—' }}</span></template></el-table-column>
      <el-table-column label="操作" fixed="right" width="132"><template #default="{ row }"><div class="application-cell-actions"><el-button class="application-cell-action-button" size="small" type="danger" plain :loading="deletingId === row.id" @click.stop="removeApplicationItem(row)">删除</el-button><el-button v-if="row.job.url" class="application-cell-action-button" size="small" type="success" plain tag="a" :href="row.job.url" target="_blank" rel="noopener noreferrer" @click.stop>投递</el-button><el-button v-else class="application-cell-action-button" size="small" type="success" plain disabled>投递</el-button></div></template></el-table-column>
    </el-table></div>

    <div v-else v-loading="loading" class="grid gap-3 overflow-x-auto pb-2" style="grid-template-columns: repeat(8, minmax(200px, 1fr))">
      <section v-for="status in statusOptions" :key="status.value" class="min-h-96 rounded-[20px] border border-white/70 bg-white/48 p-3 shadow-[0_10px_24px_rgba(100,114,148,.06)] backdrop-blur-xl" @dragover.prevent @drop="dropOnStatus(status.value)">
        <div class="mb-3 flex items-center justify-between"><span :class="['application-status', `application-status--${statusTone(status.value)}`]">{{ status.label }}</span><el-tag size="small" effect="plain">{{ applications.filter(item => item.status === status.value).length }}</el-tag></div>
        <div class="space-y-2"><article v-for="item in applications.filter(application => application.status === status.value)" :key="item.id" draggable="true" class="application-kanban-card cursor-grab rounded-[14px] border border-white/80 bg-white/78 p-3 shadow-[0_7px_16px_rgba(100,114,148,.08)]" @click="openDetail(item)" @dragstart="draggedApplicationId = item.id"><strong class="block text-sm text-slate-800">{{ item.job.company.name }}</strong><p class="my-1 text-sm text-slate-600">{{ item.job.title }}</p><p class="m-0 text-xs text-slate-400">{{ item.job.location || '地点待定' }} · {{ salaryText(item) }}</p><p v-if="item.nextAction" class="mb-0 mt-2 border-t border-slate-100 pt-2 text-xs text-[#6385be]">下一步：{{ item.nextAction }}</p></article></div>
      </section>
    </div>
    </section>

    <el-dialog v-model="createDialogVisible" title="新增投递" width="620px" destroy-on-close @closed="resetForm">
      <el-form label-position="top"><div class="grid grid-cols-1 gap-x-4 md:grid-cols-2"><el-form-item label="公司名称" required><el-input v-model="form.companyName" placeholder="例如：字节跳动" /></el-form-item><el-form-item label="岗位名称" required><el-input v-model="form.jobTitle" placeholder="例如：前端开发工程师" /></el-form-item><el-form-item label="投递状态" required><el-select v-model="form.status" class="w-full"><el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item><el-form-item label="投递渠道"><el-select v-model="form.channel" class="w-full"><el-option v-for="option in channelOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item></div><el-form-item label="工作地点"><el-input v-model="form.location" placeholder="例如：北京" /></el-form-item><el-form-item label="岗位链接"><el-input v-model="form.jobUrl" placeholder="https://..." /></el-form-item><el-form-item label="内推码"><el-input v-model="form.referralCode" placeholder="如无内推码可留空" /></el-form-item><el-form-item label="下一步安排"><el-input v-model="form.nextAction" placeholder="例如：本周五前完成笔试" /></el-form-item><el-form-item label="JD 原文"><el-input v-model="form.description" type="textarea" :rows="4" placeholder="可粘贴职位描述，后续用于匹配与打招呼话生成。" /></el-form-item><el-form-item label="投递注意事项"><el-input v-model="form.applicationNotes" type="textarea" :rows="3" /></el-form-item><el-form-item label="公司介绍"><el-input v-model="form.companyDescription" type="textarea" :rows="3" /></el-form-item></el-form>
      <template #footer><el-button type="primary" :loading="submitting" @click="createApplication">保存投递</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="投递详情" size="400px" destroy-on-close :show-close="false" header-class="!mb-0 !pb-2">
      <template #header><div class="flex w-full items-center justify-between gap-2"><h2 class="m-0 text-lg font-semibold text-slate-800">投递详情</h2><div class="flex gap-1"><el-button size="small" type="primary" plain @click="openAgent('evaluate')">在 Agent 中分析</el-button><el-button size="small" type="primary" plain @click="openAgent('interview')">准备面试</el-button></div></div></template>
      <div v-loading="detailLoading" class="pr-3"><template v-if="selectedApplication"><el-form label-position="top"><div class="grid grid-cols-1 gap-x-4 md:grid-cols-2"><el-form-item label="公司名称" required><el-input v-model="form.companyName" /></el-form-item><el-form-item label="岗位名称" required><el-input v-model="form.jobTitle" /></el-form-item><el-form-item label="部门"><el-input v-model="form.department" /></el-form-item><el-form-item label="工作地点"><el-input v-model="form.location" /></el-form-item><el-form-item label="薪资下限（元/月）"><el-input-number v-model="form.salaryMin" class="w-full" :min="1" controls-position="right" /></el-form-item><el-form-item label="薪资上限（元/月）"><el-input-number v-model="form.salaryMax" class="w-full" :min="1" controls-position="right" /></el-form-item><el-form-item label="状态"><el-select v-model="form.status" class="w-full"><el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item><el-form-item label="投递渠道"><el-select v-model="form.channel" class="w-full"><el-option v-for="option in channelOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item><el-form-item label="投递日期"><el-date-picker v-model="form.appliedAt" class="w-full" type="date" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="下一步日期"><el-date-picker v-model="form.nextActionAt" class="w-full" type="date" value-format="YYYY-MM-DD" /></el-form-item></div><el-form-item label="岗位链接"><el-input v-model="form.jobUrl" /></el-form-item><el-form-item label="内推码"><el-input v-model="form.referralCode" /></el-form-item><el-form-item label="下一步安排"><el-input v-model="form.nextAction" /></el-form-item><el-form-item label="JD 原文"><el-input v-model="form.description" type="textarea" :rows="5" /></el-form-item><el-form-item label="投递注意事项"><el-input v-model="form.applicationNotes" type="textarea" :rows="4" /></el-form-item><el-form-item label="公司介绍"><el-input v-model="form.companyDescription" type="textarea" :rows="4" /></el-form-item><el-form-item label="备注"><el-input v-model="form.notes" type="textarea" :rows="4" /></el-form-item></el-form><div class="mt-6 border-t border-slate-200 pt-5"><h3 class="mb-3 text-base text-slate-800">操作时间线</h3><el-timeline><el-timeline-item v-for="event in selectedApplication.events" :key="event.id" :timestamp="dateText(event.occurredAt)" placement="top">{{ eventLabel(event.type) }}</el-timeline-item></el-timeline></div></template></div>
      <template #footer><div class="flex items-center justify-between"><el-button type="danger" plain :loading="deleting" @click="removeApplication">删除投递</el-button><el-button type="primary" :loading="submitting" @click="saveDetail">保存修改</el-button></div></template>
    </el-drawer>
  </section>
</template>
