<script setup lang="ts">
import { ElMessage } from 'element-plus'

type ApplicationStatus ='SAVED' | 'PREPARING' | 'APPLIED' | 'WRITTEN_TEST' | 'INTERVIEWING' | 'OFFERED' | 'REJECTED' | 'WITHDRAWN'
type ApplicationChannel = 'OFFICIAL_SITE' | 'BOSS' | 'NIUKE' | 'REFERRAL' | 'OTHER'

// 详情接口（GET /api/v1/applications/:id）会带上完整的 job 与 company，
// 所以弹窗可以直接复用岗位库那套 job-detail__* 版式，不用再单独请求岗位。
type ApplicationDetail = {
  id: string
  status: ApplicationStatus
  channel: ApplicationChannel
  appliedAt: string | null
  nextAction: string | null
  nextActionAt: string | null
  notes: string | null
  job: {
    title: string
    location: string | null
    description: string | null
    applicationNotes: string | null
    url: string | null
    referralCode: string | null
    company: { name: string, description: string | null, industry: string | null, companyType: string | null }
  }
}

const loading = ref(false)
const databaseError = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const selectedApplication = ref<ApplicationDetail | null>(null)
// 弹窗里的状态下拉框：选中即保存，不用跳回投递看板
const detailStatus = ref<ApplicationStatus>('SAVED')
const savingStatus = ref(false)

const statusOptions: Array<{ value: ApplicationStatus, label: string }> = [
  { value: 'SAVED', label: '收藏' }, { value: 'PREPARING', label: '准备中' },
  { value: 'APPLIED', label: '已投递' }, { value: 'WRITTEN_TEST', label: '笔试中' },
  { value: 'INTERVIEWING', label: '面试中' }, { value: 'OFFERED', label: 'Offer' },
  { value: 'REJECTED', label: '挂了' }, { value: 'WITHDRAWN', label: '放弃' },
]
const channelLabels: Record<ApplicationChannel, string> = {
  OFFICIAL_SITE: '官网', BOSS: 'BOSS 直聘', NIUKE: '牛客', REFERRAL: '内推', OTHER: '其他',
}
// ---- 投递漏斗 ----
// 数字来自 /api/v1/dashboard/summary：列表接口 pageSize 上限是 100，
// 用它算总数会少算（实际 110 条），所以聚合口径放在服务端。
type FunnelStage = { key: string, label: string, hint: string, count: number }
type FocusItem = { id: string, company: string, title: string, status: ApplicationStatus, statusLabel: string, tier: string, reason: string, daysIdle: number }
type DashboardSummary = {
  total: number
  active: number
  stages: FunnelStage[]
  rhythm: {
    appliedToday: number
    appliedThisWeek: number
    daysSinceLastActivity: number | null
    daily: Array<{ date: string, count: number }>
  }
  focus: { items: FocusItem[], totalActive: number, idleOver14: number }
}
const summary = ref<DashboardSummary | null>(null)
// 0→1 的动画进度，同时驱动条形宽度和数字滚动。
const funnelProgress = ref(0)
const funnelTotal = computed(() => summary.value?.stages[0]?.count ?? 0)
const funnelApplied = computed(() => summary.value?.stages.find(stage => stage.key === 'applied')?.count ?? 0)
const funnelWrittenTest = computed(() => summary.value?.stages.find(stage => stage.key === 'writtenTest')?.count ?? 0)
const funnelRate = computed(() => funnelApplied.value
  ? `${((funnelWrittenTest.value / funnelApplied.value) * 100).toFixed(1)}%`
  : '—')

async function loadSummary() {
  loading.value = true
  databaseError.value = false
  try {
    // "今天/本周"的边界在浏览器这边算好再传给服务端：服务端可能是 UTC 容器，
    // 让它自己算 day boundary，早上 8 点前打开会显示成"昨天"的数据。
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const weekStart = new Date(dayStart)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const response = await $fetch<{ data: DashboardSummary }>('/api/v1/dashboard/summary', {
      query: { dayStart: dayStart.toISOString(), weekStart: weekStart.toISOString() },
    })
    summary.value = response.data
    animateFunnel()
  }
  catch {
    summary.value = null
    databaseError.value = true
  }
  finally { loading.value = false }
}

const focusCount = computed(() => summary.value?.focus.totalActive ?? 0)

// 设计规范只允许"辅助理解"的动效，且不能缩放放大——条形生长和数字滚动都属于这一类。
// index.scss 里的全局 prefers-reduced-motion 规则只能压 CSS 过渡，压不住这里用 rAF 写的动画，所以要自己判断。
function animateFunnel() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { funnelProgress.value = 1; return }
  const duration = 720
  const start = performance.now()
  const step = (now: number) => {
    const ratio = Math.min(1, (now - start) / duration)
    funnelProgress.value = 1 - (1 - ratio) ** 3
    if (ratio < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ---- 每日投递柱状图 ----
const dailyList = computed(() => summary.value?.rhythm.daily ?? [])
const dailyWindow = computed(() => dailyList.value.length)
// 最高的那根柱子占满高度；全为 0 时用 1 兜底，避免除零
const dailyMax = computed(() => Math.max(1, ...dailyList.value.map(day => day.count)))
const dailyTotal = computed(() => dailyList.value.reduce((sum, day) => sum + day.count, 0))
const dailyLastActive = computed(() => {
  for (let index = dailyList.value.length - 1; index >= 0; index--) {
    const day = dailyList.value[index]!
    if (day.count > 0) return day
  }
  return null
})
const dailyLead = computed(() => {
  if (!summary.value) return '正在读取投递数据…'
  if (!dailyTotal.value) return `近 ${dailyWindow.value} 天还没有投递记录。`
  const last = dailyLastActive.value
  const gap = last ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000) : null
  const tail = gap === null ? '' : gap === 0 ? '，最近一次就是今天' : `，最近一次在 ${gap} 天前`
  return `近 ${dailyWindow.value} 天投出 ${dailyTotal.value} 条${tail}。`
})
const dailyHeight = (day: { count: number }) => `${(day.count / dailyMax.value) * 100 * funnelProgress.value}%`
const dailyTitle = (day: { date: string, count: number }) => {
  const value = new Date(day.date)
  return `${value.getMonth() + 1} 月 ${value.getDate()} 日 · ${day.count} 条`
}
const dailyLabel = (day: { date: string }) => {
  const value = new Date(day.date)
  return `${value.getMonth() + 1}/${value.getDate()}`
}

const stageCount = (stage: FunnelStage) => Math.round(stage.count * funnelProgress.value)
const stageWidth = (stage: FunnelStage) => (funnelTotal.value ? `${(stage.count / funnelTotal.value) * 100 * funnelProgress.value}%` : '0%')
const stageRate = (stage: FunnelStage, index: number) => (index === 0 || !funnelTotal.value
  ? ''
  : `${((stage.count / funnelTotal.value) * 100).toFixed(1)}%`)

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(value)) : '待安排'
}

async function openDetail(id: string) {
  detailVisible.value = true
  detailLoading.value = true
  selectedApplication.value = null
  try {
    const response = await $fetch<{ data: ApplicationDetail }>(`/api/v1/applications/${id}`)
    selectedApplication.value = response.data
    detailStatus.value = response.data.status
  }
  finally { detailLoading.value = false }
}

// 用专门的 /status 接口而不是通用 PATCH：只有它会写入一条状态变更事件，
// 而漏斗的"到达过某阶段"和今日重点的停滞天数都依赖事件历史，走通用 PATCH 会把这些算漏。
async function changeStatus() {
  const target = selectedApplication.value
  if (!target || detailStatus.value === target.status) return
  savingStatus.value = true
  try {
    await $fetch(`/api/v1/applications/${target.id}/status`, {
      method: 'PATCH',
      body: { status: detailStatus.value, source: 'DETAIL' },
    })
    target.status = detailStatus.value
    ElMessage.success('状态已更新。')
    // 状态一变，漏斗数字和今日重点的排序都会跟着变，重新拉一次
    await loadSummary()
  }
  catch {
    detailStatus.value = target.status
    ElMessage.error('状态更新失败，请重试。')
  }
  finally { savingStatus.value = false }
}

// 页面只需要一个聚合接口，不再单独拉 100 条投递快照
onMounted(() => { void loadSummary() })
</script>

<template>
  <section v-loading="loading" class="page-rail dashboard-home">
    <header class="dashboard-heading">
      <div>
        <h1>今天，推进一点点。</h1>
        <p>让每一层信息都指向一个真实的下一步。</p>
      </div>
      <NuxtLink to="/applications" class="dashboard-primary-action">＋ 新增投递</NuxtLink>
    </header>

    <section class="dashboard-metrics" aria-label="求职概览">
      <article class="dashboard-card dashboard-hero">
        <span class="dashboard-eyebrow">THIS WEEK</span>
        <h2>{{ focusCount ? `有 ${focusCount} 件事，值得你优先推进` : '从一条投递开始，建立你的节奏' }}</h2>
        <p>{{ focusCount ? `按紧急度排序，其中 ${summary?.focus.idleOver14 ?? 0} 条已超过两周没推进。` : '新增投递后，它会自动出现在这里。' }}</p>
        <strong>{{ focusCount }}<small>件待推进</small></strong>
      </article>
      <article class="dashboard-card dashboard-stat"><b>{{ summary?.rhythm.appliedToday ?? 0 }}</b><span>今日投递</span><i /></article>
      <article class="dashboard-card dashboard-stat dashboard-stat--amber"><b>{{ summary?.rhythm.appliedThisWeek ?? 0 }}</b><span>本周投递</span><i /></article>
    </section>

    <div class="dashboard-insight">
      <section class="dashboard-card dashboard-focus">
        <div class="dashboard-section-title">
          <h2>今日重点</h2>
          <NuxtLink to="/applications" class="dashboard-focus__more">查看全部投递 →</NuxtLink>
        </div>
        <div v-if="summary?.focus.items.length" class="dashboard-task-list">
          <button v-for="item in summary.focus.items" :key="item.id" type="button" class="dashboard-task" @click="openDetail(item.id)">
            <span><b>{{ item.company }} · {{ item.title }}</b><small>{{ item.reason }}</small></span>
            <em>{{ item.statusLabel }}</em>
          </button>
        </div>
        <p v-else-if="summary" class="dashboard-empty">暂时没有需要优先处理的投递，节奏不错。</p>
        <p v-else class="dashboard-empty">正在读取投递数据…</p>
      </section>

      <div class="dashboard-insight__side">
        <section class="dashboard-card dashboard-funnel" aria-label="投递转化漏斗">
          <div class="dashboard-section-title"><h2>投递转化</h2></div>
          <p class="dashboard-funnel__lead">
            <template v-if="summary">投出去 {{ funnelApplied }} 条，其中 {{ funnelWrittenTest }} 条进到笔试 —— 转化 {{ funnelRate }}。</template>
            <template v-else>正在读取投递数据…</template>
          </p>
          <div v-if="summary" class="dashboard-funnel__rows">
            <div v-for="(stage, index) in summary.stages" :key="stage.key" class="dashboard-funnel__row">
              <span class="dashboard-funnel__label">{{ stage.label }}</span>
              <div class="dashboard-funnel__track"><i class="dashboard-funnel__bar" :style="{ width: stageWidth(stage) }" /></div>
              <b class="dashboard-funnel__count">{{ stageCount(stage) }}</b>
              <small class="dashboard-funnel__rate">{{ stageRate(stage, index) }}</small>
            </div>
          </div>
        </section>

        <section class="dashboard-card dashboard-daily" aria-label="每日投递量">
          <div class="dashboard-section-title"><h2>每日投递</h2><span>近 {{ dailyWindow }} 天</span></div>
          <p class="dashboard-daily__lead">{{ dailyLead }}</p>
          <div v-if="summary" class="dashboard-daily__chart">
            <div v-for="day in dailyList" :key="day.date" class="dashboard-daily__col" :title="dailyTitle(day)">
              <i :style="{ height: dailyHeight(day) }" />
            </div>
          </div>
          <div v-if="summary" class="dashboard-daily__axis">
            <span>{{ dailyList.length ? dailyLabel(dailyList[0]!) : '' }}</span>
            <span>{{ dailyMax }} 条为最高</span>
            <span>{{ dailyList.length ? dailyLabel(dailyList[dailyList.length - 1]!) : '' }}</span>
          </div>
        </section>
      </div>
    </div>

    <el-alert v-if="databaseError" class="dashboard-db-alert" type="warning" :closable="false" show-icon title="本地数据暂未连接">
      首页会在本地数据库启动后显示你的真实投递记录。
    </el-alert>

    <el-dialog v-model="detailVisible" width="min(720px, calc(100vw - 32px))" destroy-on-close class="dashboard-detail-dialog">
      <template #header><h2 class="dashboard-dialog-title">投递详情</h2></template>
      <div v-loading="detailLoading" class="dashboard-dialog-body">
        <div v-if="selectedApplication" class="job-detail">
          <header class="job-detail__header">
            <div class="dashboard-dialog-heading"><span>{{ selectedApplication.job.company.name }}</span><h2>{{ selectedApplication.job.title }}</h2></div>
            <!-- 状态直接在这里改，不用跳回投递看板。改完会写一条状态变更事件，漏斗和今日重点随之更新。 -->
            <el-select v-model="detailStatus" class="dashboard-dialog-status" :loading="savingStatus" @change="changeStatus">
              <el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </header>
          <dl class="job-detail__facts">
            <div><dt>投递渠道</dt><dd>{{ channelLabels[selectedApplication.channel] }}</dd></div>
            <div><dt>投递日期</dt><dd>{{ selectedApplication.appliedAt ? dateText(selectedApplication.appliedAt) : '未记录' }}</dd></div>
            <div><dt>下一步</dt><dd>{{ selectedApplication.nextAction || '尚未安排' }}</dd></div>
            <div><dt>安排时间</dt><dd>{{ dateText(selectedApplication.nextActionAt) }}</dd></div>
            <div><dt>工作地点</dt><dd>{{ selectedApplication.job.location || '—' }}</dd></div>
            <div><dt>投递入口</dt><dd><a v-if="selectedApplication.job.url" :href="selectedApplication.job.url" target="_blank" rel="noopener noreferrer">打开投递页面</a><span v-else>—</span></dd></div>
          </dl>
          <p v-if="selectedApplication.notes" class="dashboard-dialog-notes">{{ selectedApplication.notes }}</p>
          <section class="job-detail__section"><h3>岗位信息</h3><p>{{ selectedApplication.job.description || '暂无岗位详细信息。' }}</p></section>
          <section class="job-detail__section"><h3>投递注意事项</h3><p>{{ selectedApplication.job.applicationNotes || '暂无投递注意事项。' }}</p></section>
          <section class="job-detail__section"><h3>公司介绍</h3><p>{{ selectedApplication.job.company.description || '暂无公司介绍。' }}</p></section>
        </div>
      </div>
      <template #footer><NuxtLink to="/applications" class="dashboard-dialog-link" @click="detailVisible = false">前往投递看板编辑</NuxtLink></template>
    </el-dialog>
  </section>
</template>
