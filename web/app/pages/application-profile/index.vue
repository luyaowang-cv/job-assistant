<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type Strategy = { targetLocations: string[]; expectedSalary: string; availableDate: string; recruitmentSource: string; referralCode: string }
type Profile = {
  id: string; name: string; targetTags: string[]; strategy: Strategy; resumeVersionId: string | null; currentVersionId: string | null
  /** 接口返回的是「主档案 + 本档案覆盖」合并后的结果，和插件 fill-context 拿到的 basics 同源 */
  basics?: Record<string, unknown>
}
type Variant = { id: string; name: string; content: string }
type Card = { id: string; title: string; type: string; tags: string[]; facts: Record<string, unknown>; variants: Variant[] }
type Field = { key: string; label: string; text: string; limit: number | null }
type Block = { key: string; title: string; fields: Field[] }
type Version = {
  id: string; createdAt: string; blocks: Block[]
  composition: { references: Array<{ cardId: string; variantId: string; fieldKey: string | null; section?: string; sortOrder?: number }> }
}
type Candidate = { sourceKey: string; type: string; title: string; imported: boolean; variant: { content: string } }
type ResumeOption = { id: string; name: string }

/** 一行 = 一张卡 + 一个版本。界面上就是"这一格放了哪份素材"。 */
type Row = { cardId: string; variantId: string }

/**
 * 固定的区块。**key 同时是保存时的 section 名**：插件按它分组、服务端按它排序、
 * 简历里按它决定"这段是不是教育"。所以 key 不能随便改，改了等于让历史档案里的引用
 * 找不到归属。标题可以随便改。
 *
 * 顺序 = 网申表单里的常见顺序（教育 → 实习 → 工作 → 项目 → 校园 → 科研 → 奖项 → 证书 → 技能 → 自评）。
 */
const SECTIONS = [
  { key: 'education', title: '教育背景', cardType: 'EDUCATION', limit: null },
  { key: 'internship', title: '实习经历', cardType: 'INTERNSHIP', limit: 2000 },
  { key: 'work', title: '工作经历', cardType: 'WORK', limit: 2000 },
  { key: 'projects', title: '项目经历', cardType: 'PROJECT', limit: 2000 },
  { key: 'campus', title: '校园经历', cardType: 'CAMPUS', limit: 1000 },
  { key: 'research', title: '科研经历', cardType: 'RESEARCH', limit: 2000 },
  { key: 'awards', title: '荣誉奖项', cardType: 'AWARD', limit: 1000 },
  { key: 'certificates', title: '证书', cardType: 'CERTIFICATE', limit: 1000 },
  { key: 'skills', title: '专业技能', cardType: 'SKILL', limit: 1000 },
  { key: 'self', title: '自我评价', cardType: 'SELF_EVALUATION', limit: 500 },
] as const
type Section = typeof SECTIONS[number]
type SectionKey = Section['key']

const emptyStrategy = (): Strategy => ({ targetLocations: [], expectedSalary: '', availableDate: '', recruitmentSource: '', referralCode: '' })

const profiles = ref<Profile[]>([])
const cards = ref<Card[]>([])
const resumeOptions = ref<ResumeOption[]>([])
const selectedId = ref<string>()
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
/**
 * 每个区块当前的卡片行。十个区块先全部建好空数组，模板里就不用到处判空。
 * 用 Object.fromEntries 而不是逐个手写，加区块只改 SECTIONS。
 */
const rows = reactive<Record<SectionKey, Row[]>>(
  Object.fromEntries(SECTIONS.map(section => [section.key, [] as Row[]])) as Record<SectionKey, Row[]>,
)
/** 左卡片的表单改动：这份档案是谁、投什么。 */
const profileDirty = ref(false)
/** 右卡片的内容改动：区块里放了哪些卡。两者分开，是为了决定保存时要不要写一条新版本。 */
const contentDirty = ref(false)
/**
 * 老档案里自由加的模块（key 不在 SECTIONS 里）。固定区块的设计里没有它们的位置，
 * 但**不能就这么丢掉**——保存时原样带回去，界面上不显示。等于是"冻结的历史内容"。
 */
const orphanBlocks = ref<Block[]>([])
const orphanReferences = ref<Array<{ cardId: string; variantId: string; section: string; fieldKey: string | null; sortOrder: number }>>([])
const migrationOpen = ref(false)
const candidates = ref<Candidate[]>([])
const selectedSources = ref<string[]>([])

// 标签不在这个页面上编辑，但档案上一直有它（素材的 TAG_MATCH 会用到），所以要原样带回去——
// PUT 的 schema 给 targetTags 设了默认空数组，漏发就等于把标签清空。
const form = reactive({ name: '', targetTags: [] as string[], strategy: emptyStrategy(), resumeVersionId: null as string | null })

const isDirty = computed(() => profileDirty.value || contentDirty.value)
const currentProfile = computed(() => profiles.value.find(item => item.id === selectedId.value))
const legacyCount = computed(() => {
  const item = currentProfile.value as (Profile & { workExperiences?: unknown[], projects?: unknown[], skills?: unknown[], campusExperiences?: unknown[], awards?: unknown[], certificates?: unknown[], languages?: unknown[] }) | undefined
  if (!item) return 0
  return ['workExperiences', 'projects', 'skills', 'campusExperiences', 'awards', 'certificates', 'languages']
    .reduce((total, key) => total + (Array.isArray(item[key as keyof typeof item]) ? (item[key as keyof typeof item] as unknown[]).length : 0), 0)
})

/**
 * 这份档案会填进表单的「固定信息」。
 *
 * 数据取接口返回的 basics —— 它已经是「个人主档案 + 本档案覆盖」合并后的结果，
 * 和插件 fill-context 拿到的同源，所以这里显示的就是插件实际会填的值，不是另算一份。
 * 之前页面上完全看不到这部分：右卡只有经历模块，用户不知道插件到底会填哪个电话、哪个城市。
 */
const fixedInfo = computed(() => {
  const basics = currentProfile.value?.basics ?? {}
  const text = (key: string) => (typeof basics[key] === 'string' ? (basics[key] as string) : '').trim()
  return [
    { label: '姓名', value: text('fullName') },
    { label: '手机', value: text('phone') },
    { label: '邮箱', value: text('email') },
    { label: '现居城市', value: text('city') },
    { label: '政治面貌', value: text('politicalStatus') },
    { label: '证件类型', value: text('documentType') },
    { label: '紧急联系人', value: text('emergencyContactName') },
  ].filter(item => item.value)
})

const typeLabels: Record<string, string> = { PROJECT: '项目经历', INTERNSHIP: '实习经历', WORK: '工作经历', CAMPUS: '校园经历', AWARD: '荣誉奖项', RESEARCH: '科研经历', CERTIFICATE: '证书', SKILL: '专业技能', SELF_EVALUATION: '自我评价', CUSTOM_ANSWER: '自定义问答' }
const displayCardTitle = (card: Pick<Card, 'title' | 'type'>) => card.title.trim() || typeLabels[card.type] || '未命名素材'
/** 某个区块能选的卡：只列这一类型，免得在「项目经历」里挑到一张实习卡。 */
const cardsOf = (section: Section) => cards.value.filter(card => card.type === section.cardType)
const rowCard = (row: Row) => cards.value.find(card => card.id === row.cardId)
const rowVariants = (row: Row) => rowCard(row)?.variants ?? []

// 滚动位置的暗示。卡片不再让页面变长，所以"还能不能滚"只能靠边缘阴影说；
// 阴影只在真的滚出内容时才画，没有可滚内容就什么都不出现。
const leftBody = ref<HTMLElement | null>(null)
const rightBody = ref<HTMLElement | null>(null)
const leftEdge = reactive({ top: false, bottom: false })
const rightEdge = reactive({ top: false, bottom: false })

function measure(body: HTMLElement | null, edge: { top: boolean, bottom: boolean }) {
  if (!body) return
  edge.top = body.scrollTop > 1
  edge.bottom = body.scrollTop + body.clientHeight < body.scrollHeight - 1
}
function measureEdges() {
  measure(leftBody.value, leftEdge)
  measure(rightBody.value, rightEdge)
}

async function load() {
  loading.value = true
  try {
    const [profileResponse, materialResponse, resumeResponse] = await Promise.all([
      $fetch<{ data: Profile[] }>('/api/v1/application-profiles'),
      $fetch<{ data: { items: Card[] } }>('/api/v1/material-cards', { query: { pageSize: 100 } }),
      $fetch<{ data: { versions?: Array<{ id: string, name: string }> } | null }>('/api/v1/resumes'),
    ])
    profiles.value = profileResponse.data
    cards.value = materialResponse.data.items
    resumeOptions.value = resumeResponse.data?.versions?.map(version => ({ id: version.id, name: version.name })) ?? []
    await selectProfile(profiles.value.find(item => item.id === selectedId.value) ?? profiles.value[0])
  }
  catch {
    ElMessage.error('网申档案读取失败。')
  }
  finally {
    loading.value = false
    void nextTick(measureEdges)
  }
}

/** 清空所有区块。splice 而不是换新数组，避免模板里已经绑定的代理失效。 */
function resetRows() {
  for (const section of SECTIONS) rows[section.key].splice(0)
  orphanBlocks.value = []
  orphanReferences.value = []
}

/**
 * 把一条版本还原成界面状态：引用按 section 归到对应区块。
 *
 * 服务端返回的顺序已经是 section 升序 + sortOrder 升序，直接 push 就是界面顺序。
 * 认不出的 section（老档案里自由加的自定义模块）跳过——固定区块的设计里没有它们的位置。
 */
function applyVersion(version: Version) {
  resetRows()
  const known = new Set<string>(SECTIONS.map(section => section.key))
  // 认不出的模块整块留档：不显示，但保存时带回去
  orphanBlocks.value = (version.blocks ?? []).filter(block => !known.has(block.key))
  orphanReferences.value = (version.composition?.references ?? [])
    .filter(reference => !known.has(String(reference.section)))
    .map(reference => ({
      cardId: reference.cardId,
      variantId: reference.variantId,
      section: String(reference.section),
      fieldKey: reference.fieldKey ?? null,
      sortOrder: reference.sortOrder ?? 0,
    }))
  for (const reference of version.composition?.references ?? []) {
    const list = rows[reference.section as SectionKey]
    if (!list) continue
    list.push({ cardId: reference.cardId, variantId: reference.variantId })
  }
}

/**
 * 切换正在编辑的档案。
 *
 * 顺带把内容统一读成"当前内容"：界面不再呈现版本这个概念，所以只取最新的一条
 * （`?limit=1`），它就是这个档案现在长什么样。
 */
async function selectProfile(item?: Profile) {
  selectedId.value = item?.id
  form.name = item?.name ?? ''
  form.targetTags = [...(item?.targetTags ?? [])]
  form.strategy = { ...emptyStrategy(), ...item?.strategy }
  form.resumeVersionId = item?.resumeVersionId ?? null
  // 先清空：没有内容的档案看到的是"十个空区块"，比一片空白更明确该往哪放东西
  resetRows()
  profileDirty.value = false
  contentDirty.value = false
  if (!item) return
  try {
    const response = await $fetch<{ data: Version[] }>(`/api/v1/application-profiles/${item.id}/versions`, { query: { limit: 1 } })
    const latest = response.data[0]
    if (!latest) return
    applyVersion(latest)
  }
  catch {
    ElMessage.error('这份档案的内容读取失败，可以先建一个新档案。')
  }
}

async function confirmDiscard() {
  try {
    await ElMessageBox.confirm('有未保存的改动，切过去会丢掉。继续？', '未保存的改动', { confirmButtonText: '继续', cancelButtonText: '取消' })
    return true
  }
  catch {
    return false
  }
}

async function pickProfile(id: string) {
  if (id === selectedId.value) return
  if (isDirty.value && !await confirmDiscard()) return
  await selectProfile(profiles.value.find(item => item.id === id))
  await nextTick(measureEdges)
}

/** 新建：先进入一个没保存的状态，等点了保存才真的落库。 */
async function createProfile() {
  if (isDirty.value && !await confirmDiscard()) return
  selectedId.value = undefined
  form.name = ''
  form.targetTags = []
  form.strategy = emptyStrategy()
  form.resumeVersionId = null
  resetRows()
  profileDirty.value = true
  contentDirty.value = false
  await nextTick()
  measureEdges()
  ElMessage.info('新档案还没保存。填好名称和策略后点「保存档案」。')
}

async function removeProfile() {
  if (!selectedId.value) return
  try {
    await ElMessageBox.confirm('删除后该档案及其所有版本将从工作台移除，且不可恢复。确认删除？', '确认删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  }
  catch {
    return
  }
  deleting.value = true
  try {
    await $fetch(`/api/v1/application-profiles/${selectedId.value}`, { method: 'DELETE' })
    profiles.value = profiles.value.filter(item => item.id !== selectedId.value)
    await selectProfile(profiles.value[0])
    ElMessage.success('网申档案已删除。')
  }
  catch {
    ElMessage.error('删除失败，请重试。')
  }
  finally {
    deleting.value = false
    void nextTick(measureEdges)
  }
}

/**
 * 界面状态 → blocks + references。
 *
 * **复用原有数据结构，不新增表、不迁移**：一个区块 = 一个 block，一行卡 = 一个 field + 一条 reference。
 * 这样服务端解析、简历渲染、插件取数全都不用改。
 *
 * `section` 取区块 key；`fieldKey` 把 reference 绑到 field 上——服务端靠它把素材文案填进
 * block 的字段（自我评价走的就是这条路）。
 */
function buildPayload() {
  const blocks = SECTIONS.map((section) => {
    const filled = rows[section.key].filter(row => row.cardId && row.variantId)
    const fields = filled.map((_, index) => ({
      key: `${section.key}-${index + 1}`,
      label: `${section.title} ${index + 1}`,
      text: '',
      limit: section.limit,
    }))
    // 自我评价的文案是插件按 block 标题匹配、再取字段 text 拿的；
    // 哪怕没选卡也留一个空字段，保持这个 block 的形状稳定。
    if (!fields.length && section.key === 'self') {
      fields.push({ key: 'selfEvaluation', label: '自我评价', text: '', limit: section.limit })
    }
    return { key: section.key, title: section.title, fields }
  })
  const references = SECTIONS.flatMap(section => rows[section.key]
    .filter(row => row.cardId && row.variantId)
    .map((row, index) => ({
      cardId: row.cardId,
      variantId: row.variantId,
      section: section.key,
      fieldKey: `${section.key}-${index + 1}`,
      sortOrder: index,
      visible: true,
      renderRules: { compact: false, hideTechnicalDetails: false },
    })))
  // 老档案里的自定义模块原样带回：界面上不显示，但不能在保存时被抹掉
  return {
    blocks: [...blocks, ...orphanBlocks.value],
    references: [...references, ...orphanReferences.value],
  }
}

/** 把当前内容写成一条版本记录（服务端会把它设为当前版本）。 */
async function persistContent(profileId: string) {
  const { blocks, references } = buildPayload()
  await $fetch(`/api/v1/application-profiles/${profileId}/versions`, {
    method: 'POST',
    body: { blocks, composition: { fieldVisibility: {}, config: { editor: 'section-editor' }, references } },
  })
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写档案名称。')
    return
  }
  saving.value = true
  try {
    const response = await $fetch<{ data: Profile }>(selectedId.value ? `/api/v1/application-profiles/${selectedId.value}` : '/api/v1/application-profiles', {
      method: selectedId.value ? 'PUT' : 'POST',
      body: {
        name: form.name.trim(),
        targetTags: form.targetTags,
        strategy: form.strategy,
        resumeVersionId: form.resumeVersionId,
      },
    })
    selectedId.value = response.data.id
    // 只改了策略就不该产生一条内容记录；但一份还没有内容的档案必须写一条，否则它没有"现在长什么样"。
    if (contentDirty.value || !response.data.currentVersionId) await persistContent(response.data.id)
    await load()
    ElMessage.success('已保存。')
  }
  catch (error) {
    const details = (error as { data?: { error?: { details?: Array<{ message?: string }> } } })?.data?.error?.details
    ElMessage.error(details?.[0]?.message || '保存失败，请检查后重试。')
  }
  finally {
    saving.value = false
  }
}

/** 区块里加一行空的选择器。 */
function addRow(section: Section) {
  rows[section.key].push({ cardId: '', variantId: '' })
  contentDirty.value = true
}

/** 选了卡之后自动带一个默认版本（优先「网申版」），省一步点击。 */
function chooseCard(row: Row, cardId: string) {
  const card = cards.value.find(item => item.id === cardId)
  row.cardId = cardId
  row.variantId = card?.variants.find(item => item.name === '网申版')?.id ?? card?.variants[0]?.id ?? ''
  contentDirty.value = true
}

function setVariant(row: Row, variantId: string) {
  row.variantId = variantId
  contentDirty.value = true
}

function removeRow(section: Section, index: number) {
  rows[section.key].splice(index, 1)
  contentDirty.value = true
}

async function previewMigration() {
  if (!selectedId.value) return
  const response = await $fetch<{ data: { candidates: Candidate[] } }>(`/api/v1/material-migrations/application-profiles/${selectedId.value}/preview`, { method: 'POST' })
  candidates.value = response.data.candidates
  selectedSources.value = []
  migrationOpen.value = true
}
async function confirmMigration() {
  if (!selectedId.value) return
  await $fetch(`/api/v1/material-migrations/application-profiles/${selectedId.value}/confirm`, { method: 'POST', body: { sourceKeys: selectedSources.value } })
  migrationOpen.value = false
  await load()
  ElMessage.success('已导入选中的素材；原档案未修改。')
}

onMounted(() => {
  void load()
  window.addEventListener('resize', measureEdges)
})
onBeforeUnmount(() => window.removeEventListener('resize', measureEdges))
watch([rows, legacyCount], () => void nextTick(measureEdges), { deep: true })
</script>

<template>
  <section v-loading="loading" class="page-rail material-page application-editor workbench-window">
    <div class="application-editor__layout">
      <!-- 左：这份档案是谁、投什么 -->
      <aside class="material-surface workbench-surface--fit">
        <!-- 头部只放"我在编辑哪一份"这个上下文控件，以及新建；它不是任何一份档案的属性 -->
        <div class="workbench-surface__head">
          <div class="application-editor__picker">
            <el-select :model-value="selectedId" filterable placeholder="新建档案（未保存）" aria-label="选择网申档案" @update:model-value="pickProfile">
              <el-option v-for="item in profiles" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-button @click="createProfile">＋ 新建档案</el-button>
          </div>
        </div>

        <div class="workbench-surface__scroll" :class="{ 'is-top': leftEdge.top, 'is-bottom': leftEdge.bottom }">
          <div ref="leftBody" class="workbench-surface__body" @scroll="measureEdges">
            <el-form label-position="top" class="application-editor__form">
              <el-form-item label="名称"><el-input v-model="form.name" maxlength="80" placeholder="例如：应用开发 / 大模型" @input="profileDirty = true" /></el-form-item>

              <el-form-item label="期望地点"><el-select v-model="form.strategy.targetLocations" multiple filterable allow-create default-first-option placeholder="可填多个城市" @change="profileDirty = true" /></el-form-item>
              <el-form-item label="期望薪资"><el-input v-model="form.strategy.expectedSalary" maxlength="80" placeholder="例如：15001～25000" @input="profileDirty = true" /></el-form-item>
              <el-form-item label="可到岗时间"><el-input v-model="form.strategy.availableDate" maxlength="80" placeholder="例如：一个月内" @input="profileDirty = true" /></el-form-item>
              <el-form-item label="招聘来源"><el-input v-model="form.strategy.recruitmentSource" maxlength="120" placeholder="例如：BOSS直聘" @input="profileDirty = true" /></el-form-item>

              <!-- 简历版本是另一件事（导出 PDF / 投递），跟上面的策略拉开一点距离代替原来的小标题 -->
              <el-form-item label="简历版本" class="application-editor__form-tail">
                <el-select v-model="form.resumeVersionId" clearable placeholder="暂不挂载" @change="profileDirty = true">
                  <el-option v-for="item in resumeOptions" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </aside>

      <!-- 右：每个字段引用哪张素材卡——插件就是按这里的引用填表的 -->
      <main class="material-surface workbench-surface--fit">
        <div class="workbench-surface__head application-editor__head">
          <div>
            <h2>这份档案往表单里填什么</h2>
            <p class="application-editor__state">{{ isDirty ? '有未保存的改动' : '每个字段从素材库里引用一段固定文案，插件按它填表。' }}</p>
          </div>
          <div class="application-editor__actions">
            <el-button type="danger" plain :disabled="!selectedId" :loading="deleting" @click="removeProfile">删除档案</el-button>
            <el-button type="primary" :disabled="!isDirty" :loading="saving" @click="save">保存档案</el-button>
          </div>
        </div>

        <div class="workbench-surface__scroll" :class="{ 'is-top': rightEdge.top, 'is-bottom': rightEdge.bottom }">
          <div ref="rightBody" class="workbench-surface__body" @scroll="measureEdges">
            <div v-if="legacyCount" class="application-editor__banner application-editor__banner--info">
              这份档案还有 {{ legacyCount }} 项历史内容没有变成素材卡。
              <el-button text type="primary" @click="previewMigration">预览迁移</el-button>
            </div>
            <!-- 基本信息 + 十个类型，全都是卡片，一行按宽度放三张。
                 选中的素材一行里放「卡 + 版本 + 移除」，不再渲染正文——正文去素材库看。 -->
            <div class="application-editor__tiles">
              <!-- 基本信息也是一张卡：它不随岗位变，但同样是"这份档案会填什么"的一部分 -->
              <section class="application-editor__tile application-editor__tile--info">
                <header class="application-editor__tile-head">
                  <h3>基本信息</h3>
                </header>
                <div class="application-editor__info-grid">
                  <div v-for="item in fixedInfo" :key="item.label"><span>{{ item.label }}</span><b>{{ item.value }}</b></div>
                </div>
                <footer class="application-editor__tile-foot">
                  <NuxtLink to="/personal-profile">去个人档案修改</NuxtLink>
                </footer>
              </section>
              <section v-for="section in SECTIONS" :key="section.key" class="application-editor__tile">
                <header class="application-editor__tile-head">
                  <h3>{{ section.title }}</h3>
                  <span v-if="rows[section.key].length" class="application-editor__tile-count">{{ rows[section.key].length }}</span>
                </header>

                <div class="application-editor__tile-body">
                  <div v-for="(row, index) in rows[section.key]" :key="index" class="application-editor__tile-row">
                    <el-select
                      :model-value="row.cardId || undefined" filterable placeholder="选择素材卡"
                      @update:model-value="(value: string) => chooseCard(row, value)"
                    >
                      <el-option v-for="card in cardsOf(section)" :key="card.id" :label="displayCardTitle(card)" :value="card.id" />
                    </el-select>
                    <el-select
                      :model-value="row.variantId || undefined" placeholder="版本" :disabled="!rowCard(row)"
                      @update:model-value="(value: string) => setVariant(row, value)"
                    >
                      <el-option v-for="variant in rowVariants(row)" :key="variant.id" :label="variant.name" :value="variant.id" />
                    </el-select>
                    <el-button text type="danger" class="application-editor__tile-remove" @click="removeRow(section, index)">移除</el-button>
                  </div>
                  <p v-if="!cardsOf(section).length" class="application-editor__note">素材库里还没有这个类型的卡</p>
                </div>

                <footer class="application-editor__tile-foot">
                  <el-button text @click="addRow(section)">＋ 添加</el-button>
                </footer>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>

    <el-dialog v-model="migrationOpen" title="历史内容迁移预览" width="min(720px, 94vw)">
      <p class="application-editor__note">只有勾选并确认的条目会创建素材卡片；原档案 JSON 不会删除或改写。</p>
      <el-checkbox-group v-model="selectedSources" class="application-editor__migration">
        <el-checkbox v-for="item in candidates" :key="item.sourceKey" :value="item.sourceKey" :disabled="item.imported">
          <b>{{ item.title }}</b>
          <span>{{ item.variant.content }}</span>
          <el-tag v-if="item.imported">已导入</el-tag>
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="migrationOpen = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedSources.length" @click="confirmMigration">确认导入所选项</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
/* 页面高度锁到视口、底边和左侧栏底边齐平：靠全局的 .workbench-window 和 --workbench-window-chrome
   （在 index.scss 里，附了 110 的分解）。这里只负责把它变成一条纵向的弹性列，
   让两张卡去分剩下的高度。 */
.page-rail.application-editor { display: flex; flex-direction: column; }
.application-editor__layout { flex: 1; min-height: 520px; display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: var(--space-4); align-items: stretch; }
.application-editor__picker { display: flex; gap: var(--space-2); align-items: center; }
.application-editor__picker :deep(.el-select) { flex: 1; min-width: 0; }
.application-editor__form :deep(.el-form-item) { margin-bottom: var(--space-3); }
/* 去掉小标题后，用间距代替它把「简历版本」和上面那组策略分开 */
.application-editor__form :deep(.application-editor__form-tail) { margin-top: var(--space-6); }
.application-editor__form :deep(.el-select) { width: 100%; }
.application-editor__note { margin: 0; color: var(--workbench-slate); font-size: 12px; line-height: 1.6; }

/* 这一行留标题和一句说明：只有两个按钮的话整条看起来太空。
   说明位在有未保存改动时让给状态提示。 */
.application-editor__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); border-bottom: 1px solid rgba(190,204,195,.7); }
.application-editor__head h2 { margin: 0; }
.application-editor__state { margin: 5px 0 0; color: var(--workbench-slate); font-size: 13px; }
.application-editor__actions { display: flex; gap: var(--space-2); align-items: center; }

.application-editor__banner { margin: 0 0 var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--radius-control); background: rgba(215,169,149,.18); font-size: 13px; }
.application-editor__banner--info { background: rgba(122,150,137,.14); }
/* 固定信息：只读，用比经历模块更轻的底色，避免被误认为可编辑 */

/* 基本信息 + 十个类型都是卡片，一行按可用宽度放三张（320px 起）。
   再窄的话「卡 + 版本 + 移除」一行放不下，又得拆成两行。 */
/* 滚动态的容器顶部没有内边距（全局 .workbench-surface__body 只给了左右和底部），
   所以第一排卡片要自己往下让一点，否则贴着标题栏 */
.application-editor__tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-3); align-items: start; margin-top: var(--space-4); }
/* 卡片高度跟着内容走：空卡片就是「标题 + ＋ 添加」两行，不留大片空白 */
.application-editor__tile { display: grid; gap: var(--space-2); align-content: start; padding: var(--space-3); border: 1px solid rgba(112,132,120,.18); border-radius: var(--radius-control); background: rgba(255,255,255,.55); }
.application-editor__tile--info { background: rgba(122,150,137,.10); }
.application-editor__tile-head { display: flex; align-items: center; gap: var(--space-2); padding-bottom: var(--space-2); border-bottom: 1px solid rgba(190,204,195,.6); }
.application-editor__tile-head h3 { margin: 0; font-size: 13.5px; font-weight: 650; }
.application-editor__tile-count { min-width: 18px; padding: 0 5px; border-radius: 9px; background: rgba(122,150,137,.16); color: var(--workbench-slate); font-size: 11px; line-height: 18px; text-align: center; }
.application-editor__tile-body { display: grid; gap: var(--space-2); align-content: start; }
/* 一行三样：卡、版本（固定 88px）、移除。都在同一行，不再拆两行 */
.application-editor__tile-row { display: grid; grid-template-columns: minmax(0, 1fr) 88px auto; gap: var(--space-1); align-items: center; }
.application-editor__tile-row :deep(.el-select) { width: 100%; }
.application-editor__tile-remove { padding: 0 2px; font-size: 12px; }
.application-editor__tile-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding-top: var(--space-1); font-size: 12px; }
/* 基本信息卡里的字段：两列，标签淡、值深，省高度 */
.application-editor__info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px var(--space-3); font-size: 12px; }
.application-editor__info-grid span { color: var(--workbench-subtle); }
.application-editor__info-grid b { margin-left: 6px; font-weight: 500; }


.application-editor__migration { display: grid; gap: var(--space-3); max-height: 460px; overflow: auto; }
.application-editor__migration :deep(.el-checkbox) { height: auto; display: grid; grid-template-columns: auto 1fr; white-space: normal; }
.application-editor__migration span { display: block; color: var(--workbench-slate); font-size: 12px; }

@media (max-width: 1100px) { .application-editor__layout { grid-template-columns: 280px minmax(0, 1fr); } }
@media (max-width: 760px) {
  /* 窄屏没有并排的侧边栏，"和侧边栏底边齐平"也就无从谈起，回到普通文档流 */
  .page-rail.application-editor { height: auto; padding: 20px 3px 40px; }
  .application-editor__layout { grid-template-columns: 1fr; min-height: 0; }
  /* 窄屏方块卡收窄，保证一屏至少放得下两张 */
  .application-editor__tiles { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .application-editor__head { flex-direction: column; }
}
</style>
