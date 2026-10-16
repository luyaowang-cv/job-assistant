<script setup lang="ts">
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus'

interface Company { name: string, industry: string | null, companyType: string | null, description: string | null }
// 当前用户对这个岗位的个人判断；岗位是共享数据，判断按用户存。
interface JobDecision { status: 'NOT_SUITABLE', createdAt: string }
interface JobItem {
  id: string
  title: string
  location: string | null
  recruitmentType: string | null
  announcementUrl: string | null
  url: string | null
  description: string | null
  referralCode: string | null
  applicationNotes: string | null
  sourceUpdatedAt: string | null
  hasWrittenTest: boolean | null
  deadlineAt: string | null
  offlineAt: string | null
  company: Company
  applicationId: string | null
  decision: JobDecision | null
}
interface JobFilters { locations: string[], industries: string[], companyTypes: string[], recruitmentTypes: string[] }
interface JobListData { items: JobItem[], page: number, pageSize: number, total: number, filters: JobFilters }
interface FeishuAutoSyncSource {
  id: string
  sourceType: 'BITABLE' | 'SHEET_EXPORT'
  enabled: boolean
  lastSuccessfulSyncAt: string | null
  lastAutomaticSyncAt: string | null
  lastAttemptAt: string | null
  lastError: string | null
  syncing: boolean
}
interface FeishuAutoSync { enabled: boolean, timeZone: string, scheduledTime: string, nextScheduledAt: string, sources: FeishuAutoSyncSource[] }
interface FeishuConnection { connected: boolean, expiresAt: string | null, scopes: string[], autoSync: FeishuAutoSync }

const filters = reactive({ search: '', location: '', companyType: '', includeHidden: false })
const jobs = ref<JobItem[]>([])
const options = ref<JobFilters>({ locations: [], industries: [], companyTypes: [], recruitmentTypes: [] })
const total = ref(0)
const page = ref(1)
const updatedSort = ref<'asc' | 'desc'>('desc')
const loading = ref(false)
const syncing = ref(false)
const uploading = ref(false)
const clearing = ref(false)
const busyJobId = ref<string | null>(null)
const databaseError = ref(false)
const isAdmin = ref(false)
const syncDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const selectedJob = ref<JobItem | null>(null)
const emptyAutoSync: FeishuAutoSync = { enabled: true, timeZone: 'Asia/Shanghai', scheduledTime: '08:00', nextScheduledAt: '', sources: [] }
const feishuConnection = ref<FeishuConnection>({ connected: false, expiresAt: null, scopes: [], autoSync: emptyAutoSync })
const wikiReadScopes = ['wiki:wiki', 'wiki:wiki:readonly', 'wiki:node:read']
const needsFeishuReconnect = computed(() => feishuConnection.value.connected && (!wikiReadScopes.some(scope => feishuConnection.value.scopes.includes(scope)) || !feishuConnection.value.scopes.includes('drive:export:readonly')))
const defaultFeishuShareUrl = 'https://yal2at57cvq.feishu.cn/base/GtSLbyyR3aCENOsJYC6cdlsVnih?table=tblH4au5rnBcqHgJ&view=vewMjMLWkM'
const referralFeishuShareUrl = 'https://my.feishu.cn/wiki/TfJkwz7yIil5qvktSKOcBJj8nFd?table=tblzpVqcTKlokUA6&view=vewG7JtQCU'
const syncSources = [
  { value: 'campus', label: '27 届秋招岗位', url: defaultFeishuShareUrl, description: '仅同步 2027 届秋招专场与秋招提前批。' },
  { value: 'referral', label: '内推岗位库', url: referralFeishuShareUrl, description: '同步表内全部岗位，并从企业名称括号中提取更新时间。' },
] as const
const syncSource = ref<(typeof syncSources)[number]['value']>('campus')
const selectedSyncSource = computed(() => syncSources.find(source => source.value === syncSource.value) ?? syncSources[0])
const shareUrl = ref(defaultFeishuShareUrl)

watch(syncSource, () => { shareUrl.value = selectedSyncSource.value.url })

function dateText(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
}
function dateTimeText(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
// 「标记为…」下拉框选完就执行、然后回到占位文案，所以每行存一个临时值，请求结束就清掉。
const rowActions = reactive<Record<string, string | undefined>>({})
// 岗位默认看不见有两种原因：数据源自己下线了（全局事实），或我标了「不合适」（只对我生效）。
function rowHiddenLabel(job: JobItem) {
  if (job.decision) return `不合适 · ${dateText(job.decision.createdAt)}`
  if (job.offlineAt) return `已下线 · ${dateText(job.offlineAt)}`
  return ''
}
const autoSyncSummary = computed(() => {
  const autoSync = feishuConnection.value.autoSync
  const source = autoSync.sources.find(item => item.enabled)
  if (!feishuConnection.value.connected) return '连接后首次同步会建立数据源；之后每天北京时间 08:00 自动增量同步。'
  if (!autoSync.enabled) return '自动同步已由服务端暂停。'
  if (!source) return '请先完成一次飞书 Bitable 同步，系统会自动登记为每日增量来源。'
  if (source.syncing) return '飞书岗位正在同步中。'
  if (source.lastError) return `上次自动同步失败：${source.lastError}`
  return `已开启每天 ${autoSync.scheduledTime} 自动增量同步；下次：${dateTimeText(autoSync.nextScheduledAt)}。`
})

function resetFilters() {
  Object.assign(filters, { search: '', location: '', companyType: '', includeHidden: false })
  page.value = 1
  void fetchJobs()
}

function oauthMessage() {
  const query = useRoute().query
  if (query.feishu === 'connected') ElMessage.success('飞书账号已连接，现在可以同步你有权限查看的表格。')
  if (query.feishu === 'error') ElMessage.error(typeof query.reason === 'string' ? query.reason : '飞书授权未完成，请重新连接账号。')
}

async function loadFeishuConnection() {
  try {
    const response = await $fetch<{ data: FeishuConnection }>('/api/v1/integrations/feishu')
    feishuConnection.value = response.data
  }
  catch { ElMessage.error('无法读取飞书连接状态。') }
}

// 读取当前用户身份，决定是否展示岗位库的管理员写操作。
async function loadMe() {
  try {
    const response = await $fetch<{ data: { user: { isAdmin: boolean } } }>('/api/v1/me')
    isAdmin.value = response.data.user.isAdmin
  }
  catch { isAdmin.value = false }
}

function connectFeishu() { window.location.assign('/api/v1/integrations/feishu/authorize') }

async function disconnectFeishu() {
  try {
    await $fetch('/api/v1/integrations/feishu', { method: 'DELETE' })
    feishuConnection.value = { connected: false, expiresAt: null, scopes: [], autoSync: emptyAutoSync }
    ElMessage.success('已断开飞书账号，本地授权令牌已删除。')
  }
  catch { ElMessage.error('断开飞书账号失败，请稍后重试。') }
}

async function fetchJobs() {
  loading.value = true
  databaseError.value = false
  try {
    const response = await $fetch<{ data: JobListData }>('/api/v1/jobs', {
      query: { page: page.value, pageSize: 20, search: filters.search || undefined, location: filters.location || undefined, companyType: filters.companyType || undefined, includeHidden: String(filters.includeHidden), updatedSort: updatedSort.value },
    })
    jobs.value = response.data.items
    total.value = response.data.total
    options.value = response.data.filters
  }
  catch { jobs.value = []; total.value = 0; databaseError.value = true }
  finally { loading.value = false }
}

async function syncJobs() {
  if (!shareUrl.value.trim()) { ElMessage.warning('请粘贴飞书多维表格公开分享链接。'); return }
  syncing.value = true
  try {
    const response = await $fetch<{ data: { created: number, updated: number, offlined: number, skipped: number, total: number, mode: 'FULL' | 'INCREMENTAL', cutoffAt: string | null } }>('/api/v1/jobs/imports/feishu', { method: 'POST', body: { shareUrl: shareUrl.value.trim() } })
    const { created, updated, offlined, skipped, total, mode } = response.data
    ElMessage.success(`${mode === 'INCREMENTAL' ? '增量' : '首次完整'}同步完成：读取 ${total} 条，新增 ${created} 条，更新 ${updated} 条${skipped ? `，跳过 ${skipped} 条非岗位记录` : ''}${offlined ? `，标记 ${offlined} 条已下线` : ''}。`)
    syncDialogVisible.value = false
    shareUrl.value = selectedSyncSource.value.url
    page.value = 1
    await Promise.all([fetchJobs(), loadFeishuConnection()])
  }
  catch (error: unknown) {
    const message = typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
      : undefined
    ElMessage.error(message ?? '同步失败。请检查飞书链接、应用授权和服务端配置后重试。')
  }
  finally { syncing.value = false }
}

function onExcelChange(uploadFile: UploadFile) {
  const file = uploadFile.raw
  if (!file) return
  void importExcel(file)
}

async function importExcel(file: File) {
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await $fetch<{ data: { created: number, updated: number, offlined: number, skipped: number, total: number } }>('/api/v1/jobs/imports/excel', { method: 'POST', body: formData })
    const { created, updated, skipped, total } = response.data
    ElMessage.success(`Excel 导入完成：共 ${total} 条，新增 ${created} 条${updated ? `，更新 ${updated} 条` : ''}${skipped ? `，跳过 ${skipped} 条` : ''}。`)
    page.value = 1
    await fetchJobs()
  }
  catch (error: unknown) {
    const message = typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
      : undefined
    ElMessage.error(message ?? 'Excel 导入失败，请检查文件格式后重试。')
  }
  finally { uploading.value = false }
}

async function clearAllJobs() {
  try {
    await ElMessageBox.confirm('将删除岗位库里的全部岗位与公司，且不可恢复。确定清空吗？', '清空岗位库', { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' })
  }
  catch { return }
  clearing.value = true
  try {
    await $fetch('/api/v1/jobs', { method: 'DELETE' })
    ElMessage.success('岗位库已清空。')
    page.value = 1
    await fetchJobs()
  }
  catch { ElMessage.error('清空失败，请稍后重试。') }
  finally { clearing.value = false }
}

// 操作列只留一个动作下拉框，两个选项各自对应一条链路：
// 「不合适」写 JobDecision（只对当前用户隐藏），「已投递」直接进看板且状态=已投递。
async function openBoard() { await navigateTo('/applications') }

// 详情弹窗里的 selectedJob 是列表行的引用，而 fetchJobs 会整批换掉 jobs，
// 所以刷新之后要把详情重新指到新对象上；岗位被隐藏了就直接关掉弹窗。
function syncSelectedJob() {
  const current = selectedJob.value
  if (!current) return
  const fresh = jobs.value.find(item => item.id === current.id)
  if (fresh) selectedJob.value = fresh
  else detailDialogVisible.value = false
}

// 「已投递」和「收藏」走的是同一条链路——都是往投递看板里加一条记录，只是初始状态不同：
// 已投递会补上投递日期（默认当天），收藏不补。这个区别在服务端的 buildApplicationFromJobSeed 里。
async function markJobToBoard(job: JobItem, status: 'SAVED' | 'APPLIED') {
  busyJobId.value = job.id
  const label = status === 'APPLIED' ? '已投递' : '收藏'
  try {
    const response = await $fetch<{ data: { application: { id: string }, created: boolean } }>(`/api/v1/jobs/${job.id}/application`, { method: 'POST', body: { status } })
    ElMessage.success(response.data.created ? `已加入投递看板，状态为「${label}」。` : '该岗位已在投递看板中。')
    await fetchJobs()
    syncSelectedJob()
  }
  catch { ElMessage.error('加入投递看板失败，请稍后重试。') }
  finally { busyJobId.value = null }
}

// 标记可逆（下拉框里能选「恢复」），而且只影响自己的账号，所以不做二次确认。
async function markJobNotSuitable(job: JobItem) {
  busyJobId.value = job.id
  try {
    await $fetch(`/api/v1/jobs/${job.id}/decision`, { method: 'POST' })
    ElMessage.success('已标记为不合适，可用「显示已隐藏」找回。')
    // 标记后这条会从默认视图消失，往回补一页，免得停在空页上。
    if (!filters.includeHidden) {
      const remainingTotal = Math.max(0, total.value - 1)
      page.value = Math.min(page.value, Math.max(1, Math.ceil(remainingTotal / 20)))
    }
    await fetchJobs()
    syncSelectedJob()
  }
  catch { ElMessage.error('标记失败，请稍后重试。') }
  finally { busyJobId.value = null }
}

async function restoreJob(job: JobItem) {
  busyJobId.value = job.id
  try {
    await $fetch(`/api/v1/jobs/${job.id}/decision`, { method: 'DELETE' })
    ElMessage.success('已恢复，岗位回到列表里。')
    await fetchJobs()
    syncSelectedJob()
  }
  catch { ElMessage.error('恢复失败，请稍后重试。') }
  finally { busyJobId.value = null }
}

async function runRowAction(job: JobItem, action: string) {
  try {
    if (action === 'APPLIED') await markJobToBoard(job, 'APPLIED')
    else if (action === 'SAVED') await markJobToBoard(job, 'SAVED')
    else if (action === 'NOT_SUITABLE') await markJobNotSuitable(job)
    else if (action === 'RESTORE') await restoreJob(job)
  }
  finally { rowActions[job.id] = undefined }
}

function openJobDetail(job: JobItem) {
  selectedJob.value = job
  detailDialogVisible.value = true
}

function sortByUpdatedAt({ order }: { order: 'ascending' | 'descending' | null }) {
  updatedSort.value = order === 'ascending' ? 'asc' : 'desc'
  page.value = 1
  void fetchJobs()
}

watch(() => [filters.location, filters.companyType, filters.includeHidden], () => { page.value = 1; void fetchJobs() })
onMounted(async () => { await Promise.all([fetchJobs(), loadFeishuConnection(), loadMe()]); oauthMessage() })
</script>

<template>
  <section class="page-rail job-library">
    <el-alert v-if="databaseError" class="mb-3" type="warning" :closable="false" show-icon>
      <template #title>岗位库暂时无法连接本地数据库</template>
      启动数据库后刷新页面，或检查服务端数据库配置。
    </el-alert>

    <section class="application-records job-library__surface">
      <header class="job-library__heading">
        <div>
          <span class="application-board__eyebrow">JOB LIBRARY</span>
          <h1>把分散的岗位，变成可行动的清单</h1>
          <p>从飞书多维表格同步，或上传 Excel 导入；薪资信息不会导入或展示。</p>
        </div>
        <div class="job-library__summary"><strong>{{ total }}</strong><span>个可检索岗位</span></div>
      </header>

      <div class="job-library__toolbar">
        <el-input v-model="filters.search" class="job-library__search" clearable placeholder="搜索公司或岗位" aria-label="搜索公司或岗位" @input="page = 1; fetchJobs()" @clear="page = 1; fetchJobs()" />
        <el-select v-model="filters.location" clearable filterable placeholder="工作地点" aria-label="按工作地点筛选"><el-option v-for="value in options.locations" :key="value" :label="value" :value="value" /></el-select>
        <el-select v-model="filters.companyType" clearable filterable placeholder="企业性质" aria-label="按企业性质筛选"><el-option v-for="value in options.companyTypes" :key="value" :label="value" :value="value" /></el-select>
        <el-checkbox v-model="filters.includeHidden" class="job-library__offline-toggle">显示已隐藏</el-checkbox>
        <el-button plain class="application-records__reset" @click="resetFilters">重置</el-button>
        <el-upload v-if="isAdmin" :auto-upload="false" :show-file-list="false" accept=".xlsx" :on-change="onExcelChange" class="job-library__upload">
          <el-button plain :loading="uploading">上传 Excel</el-button>
        </el-upload>
        <template v-if="isAdmin">
          <el-button v-if="!feishuConnection.connected" type="primary" @click="connectFeishu">连接飞书账号</el-button>
          <el-button v-else-if="needsFeishuReconnect" type="primary" @click="connectFeishu">更新飞书授权</el-button>
          <el-button v-else type="primary" @click="syncDialogVisible = true">同步飞书文档</el-button>
          <el-button type="danger" plain :loading="clearing" @click="clearAllJobs">清空岗位库</el-button>
        </template>
      </div>

      <div class="workbench-table-shell job-library__table">
        <el-table v-loading="loading" :data="jobs" row-key="id" empty-text="还没有岗位。上传一份 Excel 或同步飞书公开表格开始整理。" class="w-full" :default-sort="{ prop: 'sourceUpdatedAt', order: 'descending' }" @row-click="openJobDetail" @sort-change="sortByUpdatedAt">
          <el-table-column label="更新时间" prop="sourceUpdatedAt" sortable="custom" :sort-orders="['descending', 'ascending']" width="132"><template #default="{ row }">{{ dateText(row.sourceUpdatedAt) }}</template></el-table-column>
          <el-table-column label="公司 / 招聘岗位" min-width="230">
            <template #default="{ row }"><div class="job-library__role"><strong>{{ row.company.name }}</strong><span>{{ row.title }}</span><small v-if="rowHiddenLabel(row)">{{ rowHiddenLabel(row) }}</small></div></template>
          </el-table-column>
          <el-table-column label="工作地点" prop="location" min-width="110"><template #default="{ row }">{{ row.location || '—' }}</template></el-table-column>
          <el-table-column label="行业 / 性质" min-width="150"><template #default="{ row }"><span>{{ row.company.industry || '未分类' }}</span><small class="job-library__secondary">{{ row.company.companyType || '—' }}</small></template></el-table-column>
          <el-table-column label="公告 / 投递" width="126"><template #default="{ row }"><div class="job-library__links"><a v-if="row.announcementUrl" :href="row.announcementUrl" target="_blank" rel="noopener noreferrer" @click.stop>公告</a><span v-else>—</span><a v-if="row.url" :href="row.url" target="_blank" rel="noopener noreferrer" @click.stop>投递</a><span v-else>—</span></div></template></el-table-column>
          <el-table-column label="操作" fixed="right" width="150"><template #default="{ row }"><div class="job-library__actions"><el-button v-if="row.applicationId" class="job-library__compact-action" size="small" type="success" plain @click.stop="openBoard">查看面板</el-button><el-select v-else v-model="rowActions[row.id]" class="job-library__mark" size="small" placeholder="标记为…" :disabled="busyJobId === row.id" @click.stop @change="runRowAction(row, $event)"><el-option v-if="row.decision" label="恢复" value="RESTORE" /><el-option v-else label="不合适" value="NOT_SUITABLE" /><el-option label="收藏" value="SAVED" /><el-option label="已投递" value="APPLIED" /></el-select></div></template></el-table-column>
        </el-table>
      </div>
      <el-pagination v-if="total > 20" class="job-library__pagination" layout="prev, pager, next" :current-page="page" :page-size="20" :total="total" @current-change="page = $event; fetchJobs()" />
    </section>

    <section v-if="isAdmin" class="job-library__connection" :class="{ 'job-library__connection--connected': feishuConnection.connected && !needsFeishuReconnect }">
      <div><strong>{{ needsFeishuReconnect ? '需要更新飞书授权' : feishuConnection.connected ? '飞书账号已连接' : '尚未连接飞书账号' }}</strong><span>{{ needsFeishuReconnect ? '新增 Wiki 表格数据源需要知识库读取和云文档导出只读权限，更新授权后即可同步。' : autoSyncSummary }}</span></div>
      <el-button v-if="feishuConnection.connected" size="small" plain @click="disconnectFeishu">断开连接</el-button>
      <el-button v-else size="small" plain type="primary" @click="connectFeishu">去连接</el-button>
    </section>

    <el-dialog v-model="syncDialogVisible" title="同步飞书岗位表格" width="min(520px, calc(100vw - 32px))" destroy-on-close>
      <p class="job-library__dialog-copy">首次同步会建立本地基线；之后只拉取飞书中发生变化的记录，并在每天北京时间 08:00 自动增量更新。</p>
      <el-form label-position="top"><el-form-item label="岗位数据源" required><el-select v-model="syncSource" class="w-full"><el-option v-for="source in syncSources" :key="source.value" :label="source.label" :value="source.value" /></el-select><p class="job-library__source-help">{{ selectedSyncSource.description }}</p></el-form-item><el-form-item label="飞书表格链接" required><el-input v-model="shareUrl" placeholder="https://...feishu.cn/base/app?table=tbl..." /></el-form-item></el-form>
      <el-alert type="info" :closable="false" show-icon>将使用你已连接飞书账号的只读权限。授权令牌仅加密保存在本地数据库，绝不会展示或发送至浏览器。</el-alert>
      <template #footer><el-button @click="syncDialogVisible = false">取消</el-button><el-button type="primary" :loading="syncing" @click="syncJobs">同步飞书文档</el-button></template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="岗位详情" width="min(760px, calc(100vw - 32px))" destroy-on-close>
      <div v-if="selectedJob" class="job-detail">
        <header class="job-detail__header"><div><span>{{ selectedJob.company.name }}</span><h2>{{ selectedJob.title }}</h2></div><span v-if="rowHiddenLabel(selectedJob)" class="job-detail__offline">{{ selectedJob.decision ? '不合适' : '已下线' }}</span></header>
        <dl class="job-detail__facts">
          <div><dt>更新时间</dt><dd>{{ dateText(selectedJob.sourceUpdatedAt) }}</dd></div>
          <div><dt>工作地点</dt><dd>{{ selectedJob.location || '—' }}</dd></div>
          <div><dt>行业 / 性质</dt><dd>{{ selectedJob.company.industry || '未分类' }} / {{ selectedJob.company.companyType || '—' }}</dd></div>
          <div><dt>内推码</dt><dd>{{ selectedJob.referralCode || '—' }}</dd></div>
          <div><dt>公告</dt><dd><a v-if="selectedJob.announcementUrl" :href="selectedJob.announcementUrl" target="_blank" rel="noopener noreferrer">查看招聘公告</a><span v-else>—</span></dd></div>
          <div><dt>投递入口</dt><dd><a v-if="selectedJob.url" :href="selectedJob.url" target="_blank" rel="noopener noreferrer">打开投递页面</a><span v-else>—</span></dd></div>
        </dl>
        <section class="job-detail__section"><h3>岗位信息</h3><p>{{ selectedJob.description || '暂无岗位详细信息。' }}</p></section>
        <section class="job-detail__section"><h3>投递注意事项</h3><p>{{ selectedJob.applicationNotes || '暂无投递注意事项。' }}</p></section>
        <section class="job-detail__section"><h3>公司介绍</h3><p>{{ selectedJob.company.description || '暂无公司介绍。' }}</p></section>
      </div>
      <template #footer><el-button @click="detailDialogVisible = false">关闭</el-button><el-button v-if="selectedJob?.applicationId" type="success" plain @click="openBoard">查看面板</el-button><template v-else><el-button plain :loading="Boolean(selectedJob) && busyJobId === selectedJob?.id" @click="selectedJob && markJobToBoard(selectedJob, 'SAVED')">收藏</el-button><el-button type="primary" :loading="Boolean(selectedJob) && busyJobId === selectedJob?.id" @click="selectedJob && markJobToBoard(selectedJob, 'APPLIED')">标记为已投递</el-button></template><el-button v-if="selectedJob && !selectedJob.applicationId && selectedJob.decision" plain @click="selectedJob && restoreJob(selectedJob)">恢复</el-button></template>
    </el-dialog>
  </section>
</template>
