<script setup lang="ts">
type ApplicationStatus = 'SAVED' | 'PREPARING' | 'APPLIED' | 'WRITTEN_TEST' | 'INTERVIEWING' | 'OFFERED' | 'REJECTED' | 'WITHDRAWN'
type ApplicationChannel = 'OFFICIAL_SITE' | 'BOSS' | 'NIUKE' | 'REFERRAL' | 'OTHER'

interface ApplicationItem {
  id: string
  status: ApplicationStatus
  channel: ApplicationChannel
  nextAction: string | null
  nextActionAt: string | null
  updatedAt: string
  job: { title: string, company: { name: string } }
}

interface ApplicationDetail extends ApplicationItem {
  appliedAt: string | null
  notes: string | null
  job: ApplicationItem['job'] & { location: string | null, description: string | null }
}

const applications = ref<ApplicationItem[]>([])
const loading = ref(false)
const databaseError = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const selectedApplication = ref<ApplicationDetail | null>(null)

const statusLabels: Record<ApplicationStatus, string> = {
  SAVED: '收藏', PREPARING: '准备中', APPLIED: '已投递', WRITTEN_TEST: '笔试中',
  INTERVIEWING: '面试中', OFFERED: 'Offer', REJECTED: '已拒绝', WITHDRAWN: '已放弃',
}
const channelLabels: Record<ApplicationChannel, string> = {
  OFFICIAL_SITE: '官网', BOSS: 'BOSS 直聘', NIUKE: '牛客', REFERRAL: '内推', OTHER: '其他',
}
const activeApplications = computed(() => applications.value
  .filter(item => ['PREPARING', 'APPLIED', 'WRITTEN_TEST', 'INTERVIEWING'].includes(item.status))
  .slice(0, 3))
const nextActions = computed(() => applications.value
  .filter(item => item.nextAction)
  .sort((left, right) => (left.nextActionAt ?? left.updatedAt).localeCompare(right.nextActionAt ?? right.updatedAt))
  .slice(0, 4))

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(value)) : '待安排'
}

async function loadDashboard() {
  loading.value = true
  databaseError.value = false
  try {
    const response = await $fetch<{ data: { items: ApplicationItem[] } }>('/api/v1/applications', { query: { pageSize: 100 } })
    applications.value = response.data.items
  }
  catch {
    applications.value = []
    databaseError.value = true
  }
  finally { loading.value = false }
}

async function openDetail(item: ApplicationItem) {
  detailVisible.value = true
  detailLoading.value = true
  selectedApplication.value = null
  try {
    const response = await $fetch<{ data: ApplicationDetail }>(`/api/v1/applications/${item.id}`)
    selectedApplication.value = response.data
  }
  finally { detailLoading.value = false }
}

onMounted(loadDashboard)
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
        <h2>{{ nextActions.length ? `有 ${nextActions.length} 件事，值得你优先推进` : '从一条投递开始，建立你的节奏' }}</h2>
        <p>{{ nextActions.length ? '先处理截止时间和明确的下一步。' : '新增投递并写下下一步后，它会出现在这里。' }}</p>
        <strong>{{ nextActions.length }}<small>件待推进</small></strong>
      </article>
      <article class="dashboard-card dashboard-stat"><b>{{ activeApplications.length }}</b><span>正在跟进的投递</span><i /></article>
      <article class="dashboard-card dashboard-stat dashboard-stat--amber"><b>{{ nextActions.length }}</b><span>已有下一步安排</span><i /></article>
      <article class="dashboard-card dashboard-stat dashboard-stat--blue"><b>{{ applications.length }}</b><span>已保存投递记录</span><i /></article>
    </section>

    <section class="dashboard-work">
      <article class="dashboard-card dashboard-focus">
        <div class="dashboard-section-title"><h2>今日重点</h2><span>真实下一步</span></div>
        <p>只保留现在可以完成的动作。</p>
        <div v-if="nextActions.length" class="dashboard-task-list">
          <button v-for="item in nextActions" :key="item.id" type="button" class="dashboard-task" @click="openDetail(item)">
            <i class="dashboard-check" />
            <span><b>{{ item.nextAction }}</b><small>{{ item.job.company.name }} · {{ item.job.title }} · {{ item.nextActionAt ? dateText(item.nextActionAt) : '待安排' }}</small></span>
            <em>{{ statusLabels[item.status] }}</em>
          </button>
        </div>
        <p v-else class="dashboard-empty">新增投递或安排下一步后，这里会留下最值得先做的事。</p>
      </article>
      <article class="dashboard-card dashboard-track">
        <h2>行动轨迹</h2>
        <div v-if="activeApplications.length" class="dashboard-track-list">
          <button v-for="item in activeApplications" :key="item.id" type="button" class="dashboard-record" @click="openDetail(item)">
            <span class="dashboard-stage">{{ statusLabels[item.status] }}</span>
            <b>{{ item.job.company.name }} · {{ item.job.title }}</b>
            <p>{{ item.nextAction || '尚未安排下一步' }}</p>
            <footer><span>{{ channelLabels[item.channel] }}</span><em>{{ dateText(item.nextActionAt) }}</em></footer>
          </button>
        </div>
        <p v-else class="dashboard-empty">暂无正在推进的机会。</p>
      </article>
    </section>

    <el-alert v-if="databaseError" class="dashboard-db-alert" type="warning" :closable="false" show-icon title="本地数据暂未连接">
      首页会在本地数据库启动后显示你的真实投递记录。
    </el-alert>

    <section class="dashboard-card dashboard-opportunities">
      <div class="dashboard-table-head"><h2>正在推进的机会</h2><NuxtLink to="/applications">查看全部投递 →</NuxtLink></div>
      <div class="dashboard-opportunity-table" role="table" aria-label="正在推进的机会">
        <div class="dashboard-table-row dashboard-table-row--head" role="row"><span>公司 / 岗位</span><span>当前阶段</span><span>下一步</span><span>渠道</span></div>
        <NuxtLink v-for="item in activeApplications" :key="item.id" to="/applications" class="dashboard-table-row" role="row">
          <strong>{{ item.job.company.name }} · {{ item.job.title }}</strong><span>{{ statusLabels[item.status] }}</span><span>{{ item.nextAction || '待安排' }}</span><span>{{ channelLabels[item.channel] }}</span>
        </NuxtLink>
        <p v-if="!activeApplications.length" class="dashboard-empty dashboard-table-empty">还没有正在推进的投递，先从投递看板新增一条记录。</p>
      </div>
    </section>

    <section class="dashboard-resources" aria-label="资料入口">
      <NuxtLink to="/resumes" class="dashboard-resource"><i>□</i><h2>简历版本</h2><p>针对不同岗位准备表达</p><footer><span>进入简历版本</span><b>→</b></footer></NuxtLink>
      <NuxtLink to="/application-profile" class="dashboard-resource"><i>⌁</i><h2>网申档案</h2><p>固定信息一次维护</p><footer><span>完善基础资料</span><b>→</b></footer></NuxtLink>
      <div class="dashboard-resource dashboard-resource--planned"><i>◇</i><h2>面试准备</h2><p>JD、复习和复盘汇在一起</p><footer><span>规划中</span><b>→</b></footer></div>
    </section>

    <el-dialog v-model="detailVisible" width="560px" destroy-on-close class="dashboard-detail-dialog">
      <template #header><h2 class="dashboard-dialog-title">投递详情</h2></template>
      <div v-loading="detailLoading" class="dashboard-dialog-body">
        <template v-if="selectedApplication">
          <div class="dashboard-dialog-job"><span>{{ statusLabels[selectedApplication.status] }}</span><h3>{{ selectedApplication.job.company.name }}</h3><p>{{ selectedApplication.job.title }}{{ selectedApplication.job.location ? ` · ${selectedApplication.job.location}` : '' }}</p></div>
          <dl class="dashboard-dialog-grid">
            <div><dt>投递渠道</dt><dd>{{ channelLabels[selectedApplication.channel] }}</dd></div>
            <div><dt>投递日期</dt><dd>{{ selectedApplication.appliedAt ? dateText(selectedApplication.appliedAt) : '未记录' }}</dd></div>
            <div><dt>下一步</dt><dd>{{ selectedApplication.nextAction || '尚未安排' }}</dd></div>
            <div><dt>安排时间</dt><dd>{{ dateText(selectedApplication.nextActionAt) }}</dd></div>
          </dl>
          <p v-if="selectedApplication.notes" class="dashboard-dialog-notes">{{ selectedApplication.notes }}</p>
        </template>
      </div>
      <template #footer><NuxtLink to="/applications" class="dashboard-dialog-link" @click="detailVisible = false">前往投递看板编辑</NuxtLink></template>
    </el-dialog>
  </section>
</template>
