<script setup lang="ts">
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus'

interface Company { name: string, industry: string | null, companyType: string | null, description: string | null }
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
  manualOfflineAt: string | null
  company: Company
  applicationId: string | null
}
interface JobFilters { locations: string[], industries: string[], companyTypes: string[], recruitmentTypes: string[] }
interface JobListData { items: JobItem[], page: number, pageSize: number, total: number, filters: JobFilters }
interface FeishuConnection { connected: boolean, expiresAt: string | null, scopes: string[] }

const filters = reactive({ search: '', location: '', companyType: '', includeOffline: false })
const jobs = ref<JobItem[]>([])
const options = ref<JobFilters>({ locations: [], industries: [], companyTypes: [], recruitmentTypes: [] })
const total = ref(0)
const page = ref(1)
const updatedSort = ref<'asc' | 'desc'>('desc')
const loading = ref(false)
const syncing = ref(false)
const uploading = ref(false)
const clearing = ref(false)
const convertingId = ref<string | null>(null)
const offliningId = ref<string | null>(null)
const databaseError = ref(false)
const syncDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const selectedJob = ref<JobItem | null>(null)
const feishuConnection = ref<FeishuConnection>({ connected: false, expiresAt: null, scopes: [] })
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
function jobOfflineAt(job: JobItem) { return job.manualOfflineAt || job.offlineAt }

function resetFilters() {
  Object.assign(filters, { search: '', location: '', companyType: '', includeOffline: false })
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

function connectFeishu() { window.location.assign('/api/v1/integrations/feishu/authorize') }

async function disconnectFeishu() {
  try {
    await $fetch('/api/v1/integrations/feishu', { method: 'DELETE' })
    feishuConnection.value = { connected: false, expiresAt: null, scopes: [] }
    ElMessage.success('已断开飞书账号，本地授权令牌已删除。')
  }
  catch { ElMessage.error('断开飞书账号失败，请稍后重试。') }
}

async function fetchJobs() {
  loading.value = true
  databaseError.value = false
  try {
    const response = await $fetch<{ data: JobListData }>('/api/v1/jobs', {
      query: { page: page.value, pageSize: 20, search: filters.search || undefined, location: filters.location || undefined, companyType: filters.companyType || undefined, includeOffline: String(filters.includeOffline), updatedSort: updatedSort.value },
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
    const response = await $fetch<{ data: { created: number, updated: number, offlined: number, skipped: number, total: number } }>('/api/v1/jobs/imports/feishu', { method: 'POST', body: { shareUrl: shareUrl.value.trim() } })
    const { created, updated, offlined, skipped, total } = response.data
    ElMessage.success(`同步完成：导入 ${total} 条，新增 ${created} 条，更新 ${updated} 条${skipped ? `，跳过 ${skipped} 条非岗位记录` : ''}${offlined ? `，标记 ${offlined} 条已下线` : ''}。`)
    syncDialogVisible.value = false
    shareUrl.value = selectedSyncSource.value.url
    page.value = 1
    await fetchJobs()
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

async function convertJob(job: JobItem) {
  if (job.applicationId) { await navigateTo('/applications'); return }
  convertingId.value = job.id
  try {
    const response = await $fetch<{ data: { application: { id: string }, created: boolean } }>(`/api/v1/jobs/${job.id}/application`, { method: 'POST' })
    job.applicationId = response.data.application.id
    ElMessage.success(response.data.created ? '已加入投递看板。' : '该岗位已在投递看板中。')
  }
  catch { ElMessage.error('转换投递失败，请稍后重试。') }
  finally { convertingId.value = null }
}

async function offlineJob(job: JobItem) {
  if (jobOfflineAt(job)) return
  try { await ElMessageBox.confirm('下线后该岗位默认不再显示；勾选“显示已下线”仍可查看。确定下线吗？', '下线岗位', { type: 'warning', confirmButtonText: '下线', cancelButtonText: '取消' }) }
  catch { return }
  offliningId.value = job.id
  try {
    await $fetch(`/api/v1/jobs/${job.id}/offline`, { method: 'POST' })
    ElMessage.success('岗位已移至下线区域。')
    if (!filters.includeOffline) {
      const remainingTotal = Math.max(0, total.value - 1)
      page.value = Math.min(page.value, Math.max(1, Math.ceil(remainingTotal / 20)))
    }
    await fetchJobs()
  }
  catch { ElMessage.error('岗位下线失败，请稍后重试。') }
  finally { offliningId.value = null }
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

watch(() => [filters.location, filters.companyType, filters.includeOffline], () => { page.value = 1; void fetchJobs() })
onMounted(async () => { await Promise.all([fetchJobs(), loadFeishuConnection()]); oauthMessage() })
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
        <el-checkbox v-model="filters.includeOffline" class="job-library__offline-toggle">显示已下线</el-checkbox>
        <el-button plain class="application-records__reset" @click="resetFilters">重置</el-button>
        <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx" :on-change="onExcelChange" class="job-library__upload">
          <el-button plain :loading="uploading">上传 Excel</el-button>
        </el-upload>
        <el-button v-if="!feishuConnection.connected" type="primary" @click="connectFeishu">连接飞书账号</el-button>
        <el-button v-else-if="needsFeishuReconnect" type="primary" @click="connectFeishu">更新飞书授权</el-button>
        <el-button v-else type="primary" @click="syncDialogVisible = true">同步飞书文档</el-button>
        <el-button type="danger" plain :loading="clearing" @click="clearAllJobs">清空岗位库</el-button>
      </div>

      <div class="workbench-table-shell job-library__table">
        <el-table v-loading="loading" :data="jobs" empty-text="还没有岗位。上传一份 Excel 或同步飞书公开表格开始整理。" class="w-full" :default-sort="{ prop: 'sourceUpdatedAt', order: 'descending' }" @row-click="openJobDetail" @sort-change="sortByUpdatedAt">
          <el-table-column label="更新时间" prop="sourceUpdatedAt" sortable="custom" :sort-orders="['descending', 'ascending']" width="132"><template #default="{ row }">{{ dateText(row.sourceUpdatedAt) }}</template></el-table-column>
          <el-table-column label="公司 / 招聘岗位" min-width="230">
            <template #default="{ row }"><div class="job-library__role"><strong>{{ row.company.name }}</strong><span>{{ row.title }}</span><small v-if="jobOfflineAt(row)">已下线 · {{ dateText(jobOfflineAt(row)) }}</small></div></template>
          </el-table-column>
          <el-table-column label="工作地点" prop="location" min-width="110"><template #default="{ row }">{{ row.location || '—' }}</template></el-table-column>
          <el-table-column label="行业 / 性质" min-width="150"><template #default="{ row }"><span>{{ row.company.industry || '未分类' }}</span><small class="job-library__secondary">{{ row.company.companyType || '—' }}</small></template></el-table-column>
          <el-table-column label="公告 / 投递" width="126"><template #default="{ row }"><div class="job-library__links"><a v-if="row.announcementUrl" :href="row.announcementUrl" target="_blank" rel="noopener noreferrer" @click.stop>公告</a><span v-else>—</span><a v-if="row.url" :href="row.url" target="_blank" rel="noopener noreferrer" @click.stop>投递</a><span v-else>—</span></div></template></el-table-column>
          <el-table-column label="操作" fixed="right" width="160"><template #default="{ row }"><div class="job-library__actions"><el-button class="job-library__compact-action" size="small" type="warning" plain :disabled="Boolean(jobOfflineAt(row))" :loading="offliningId === row.id" @click.stop="offlineJob(row)">{{ jobOfflineAt(row) ? '已下线' : '下线' }}</el-button><el-button class="job-library__compact-action" size="small" :type="row.applicationId ? 'success' : 'primary'" plain :loading="convertingId === row.id" @click.stop="convertJob(row)">{{ row.applicationId ? '查看面板' : '加入面板' }}</el-button></div></template></el-table-column>
        </el-table>
      </div>
      <el-pagination v-if="total > 20" class="job-library__pagination" layout="prev, pager, next" :current-page="page" :page-size="20" :total="total" @current-change="page = $event; fetchJobs()" />
    </section>

    <section class="job-library__connection" :class="{ 'job-library__connection--connected': feishuConnection.connected && !needsFeishuReconnect }">
      <div><strong>{{ needsFeishuReconnect ? '需要更新飞书授权' : feishuConnection.connected ? '飞书账号已连接' : '尚未连接飞书账号' }}</strong><span>{{ needsFeishuReconnect ? '新增 Wiki 表格数据源需要知识库读取和云文档导出只读权限，更新授权后即可同步。' : feishuConnection.connected ? '同步将使用你个人账号可读取的表格权限。' : '连接后可读取你本人已获访问权限的飞书表格。' }}</span></div>
      <el-button v-if="feishuConnection.connected" size="small" plain @click="disconnectFeishu">断开连接</el-button>
      <el-button v-else size="small" plain type="primary" @click="connectFeishu">去连接</el-button>
    </section>

    <el-dialog v-model="syncDialogVisible" title="同步飞书岗位表格" width="min(520px, calc(100vw - 32px))" destroy-on-close>
      <p class="job-library__dialog-copy">选择岗位来源后，系统只提取岗位库所需字段并增量更新本地数据。</p>
      <el-form label-position="top"><el-form-item label="岗位数据源" required><el-select v-model="syncSource" class="w-full"><el-option v-for="source in syncSources" :key="source.value" :label="source.label" :value="source.value" /></el-select><p class="job-library__source-help">{{ selectedSyncSource.description }}</p></el-form-item><el-form-item label="飞书表格链接" required><el-input v-model="shareUrl" placeholder="https://...feishu.cn/base/app?table=tbl..." /></el-form-item></el-form>
      <el-alert type="info" :closable="false" show-icon>将使用你已连接飞书账号的只读权限。授权令牌仅加密保存在本地数据库，绝不会展示或发送至浏览器。</el-alert>
      <template #footer><el-button @click="syncDialogVisible = false">取消</el-button><el-button type="primary" :loading="syncing" @click="syncJobs">同步飞书文档</el-button></template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="岗位详情" width="min(760px, calc(100vw - 32px))" destroy-on-close>
      <div v-if="selectedJob" class="job-detail">
        <header class="job-detail__header"><div><span>{{ selectedJob.company.name }}</span><h2>{{ selectedJob.title }}</h2></div><span v-if="jobOfflineAt(selectedJob)" class="job-detail__offline">已下线</span></header>
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
      <template #footer><el-button @click="detailDialogVisible = false">关闭</el-button><el-button :type="selectedJob?.applicationId ? 'success' : 'primary'" :loading="selectedJob ? convertingId === selectedJob.id : false" @click="selectedJob && convertJob(selectedJob)">{{ selectedJob?.applicationId ? '查看面板' : '加入面板' }}</el-button></template>
    </el-dialog>
  </section>
</template>
