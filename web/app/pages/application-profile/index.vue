<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type Strategy = { targetLocations: string[]; expectedSalary: string; availableDate: string; recruitmentSource: string; referralCode: string }
type Profile = { id: string; name: string; targetTags: string[]; strategy: Strategy; resumeVersionId: string | null; currentVersionId: string | null }
type Variant = { id: string; name: string; content: string }
type Card = { id: string; title: string; type: string; tags: string[]; facts: Record<string, unknown>; variants: Variant[] }
type Field = { key: string; label: string; text: string; limit: number | null }
type Block = { key: string; title: string; fields: Field[] }
type Version = { id: string; createdAt: string; blocks: Block[]; composition: { references: Array<{ cardId: string; variantId: string; fieldKey: string | null }> } }
type Candidate = { sourceKey: string; type: string; title: string; imported: boolean; variant: { content: string } }
type ResumeOption = { id: string; name: string }

/**
 * A brand-new profile starts from the modules an application form usually asks for,
 * so the first thing to do is drop material into them rather than invent the shape.
 */
function templateBlocks(): Block[] {
  return [
    { key: 'self', title: '自我评价', fields: [{ key: 'selfEvaluation', label: '自我评价', text: '', limit: 500 }] },
    { key: 'projects', title: '项目经历', fields: [{ key: 'project1', label: '项目经历 1', text: '', limit: 2000 }] },
    { key: 'internship', title: '实习经历', fields: [{ key: 'internship1', label: '实习经历 1', text: '', limit: 2000 }] },
    { key: 'campus', title: '校园经历', fields: [{ key: 'campus1', label: '校园经历 1', text: '', limit: 1000 }] },
    { key: 'research', title: '科研经历', fields: [{ key: 'research1', label: '科研经历 1', text: '', limit: 2000 }] },
    { key: 'awards', title: '荣誉奖项', fields: [{ key: 'award1', label: '荣誉奖项 1', text: '', limit: 1000 }] },
    { key: 'certificates', title: '证书', fields: [{ key: 'certificate1', label: '证书 1', text: '', limit: 1000 }] },
  ]
}

const emptyStrategy = (): Strategy => ({ targetLocations: [], expectedSalary: '', availableDate: '', recruitmentSource: '', referralCode: '' })

const profiles = ref<Profile[]>([])
const cards = ref<Card[]>([])
const resumeOptions = ref<ResumeOption[]>([])
const selectedId = ref<string>()
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const blocks = ref<Block[]>(templateBlocks())
const fieldRefs = reactive<Record<string, { cardId: string; variantId: string }>>({})
/** 左卡片的表单改动：这份档案是谁、投什么。 */
const profileDirty = ref(false)
/** 右卡片的内容改动：模块、字段、素材引用。两者分开，是为了决定保存时要不要写一条新版本。 */
const contentDirty = ref(false)
const pickingBlock = ref<string | null>(null)
const addingBlock = ref(false)
const newBlockTitle = ref('')
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
const allFields = computed(() => blocks.value.flatMap(block => block.fields))
const missingCount = computed(() => allFields.value.filter(field => !fieldRefs[field.key]).length)

const typeLabels: Record<string, string> = { PROJECT: '项目经历', INTERNSHIP: '实习经历', WORK: '工作经历', CAMPUS: '校园经历', AWARD: '荣誉奖项', RESEARCH: '科研经历', CERTIFICATE: '证书', SKILL: '专业技能', SELF_EVALUATION: '自我评价', CUSTOM_ANSWER: '自定义问答' }
const displayCardTitle = (card: Pick<Card, 'title' | 'type'>) => card.title.trim() || typeLabels[card.type] || '未命名素材'
const cardPeriod = (card: Card) => [card.facts.startDate, card.facts.endDate].filter(value => typeof value === 'string' && value).join(' — ')
const cardMeta = (card: Card) => [card.facts.role, card.facts.organization, cardPeriod(card)].filter(value => typeof value === 'string' && value).join(' · ')
const cardOf = (fieldKey: string) => cards.value.find(card => card.id === fieldRefs[fieldKey]?.cardId)
const variantOf = (fieldKey: string) => cardOf(fieldKey)?.variants.find(item => item.id === fieldRefs[fieldKey]?.variantId)
/** 字段最终会填进表单的那段文字：引用了素材卡就是那张卡的文案，否则是字段自己存的文本。 */
const fieldText = (field: Field) => variantOf(field.key)?.content ?? field.text
const fieldLength = (field: Field) => [...fieldText(field)].length

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
  // 先摆上模板：没有内容的档案看到的是"该往哪几块放素材"，而不是一片空白。
  blocks.value = templateBlocks()
  for (const key of Object.keys(fieldRefs)) Reflect.deleteProperty(fieldRefs, key)
  pickingBlock.value = null
  addingBlock.value = false
  profileDirty.value = false
  contentDirty.value = false
  if (!item) return
  try {
    const response = await $fetch<{ data: Version[] }>(`/api/v1/application-profiles/${item.id}/versions`, { query: { limit: 1 } })
    const latest = response.data[0]
    if (!latest) return
    blocks.value = latest.blocks ?? []
    for (const reference of latest.composition?.references ?? []) {
      if (reference.fieldKey) fieldRefs[reference.fieldKey] = { cardId: reference.cardId, variantId: reference.variantId }
    }
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
  blocks.value = templateBlocks()
  for (const key of Object.keys(fieldRefs)) Reflect.deleteProperty(fieldRefs, key)
  pickingBlock.value = null
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

/** 把模块与素材引用写成语义上的"当前内容"（服务端存成一条版本记录并设为当前版本）。 */
async function persistContent(profileId: string) {
  const references = blocks.value.flatMap(block => block.fields.flatMap((field, index) => {
    const reference = fieldRefs[field.key]
    return reference
      ? [{ ...reference, section: block.key, fieldKey: field.key, sortOrder: index, visible: true, renderRules: { compact: false, hideTechnicalDetails: false } }]
      : []
  }))
  await $fetch(`/api/v1/application-profiles/${profileId}/versions`, {
    method: 'POST',
    body: { blocks: blocks.value, composition: { fieldVisibility: {}, config: { editor: 'structured-form' }, references } },
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

function chooseCard(field: Field, cardId: string) {
  const card = cards.value.find(item => item.id === cardId)
  if (!card?.variants[0]) {
    Reflect.deleteProperty(fieldRefs, field.key)
    contentDirty.value = true
    return
  }
  // “网申版”是这份文案给表单用的那一版；没有就直接取第一版。
  const variant = card.variants.find(item => item.name === '网申版') ?? card.variants[0]
  fieldRefs[field.key] = { cardId, variantId: variant.id }
  contentDirty.value = true
}

function setVariant(fieldKey: string, variantId: string) {
  const reference = fieldRefs[fieldKey]
  if (reference) reference.variantId = variantId
  contentDirty.value = true
}

/** 从素材库挑一张卡插进这个模块：插完就是一行已经引用的字段。 */
function insertCard(block: Block, card: Card) {
  const variant = card.variants.find(item => item.name === '网申版') ?? card.variants[0]
  if (!variant) {
    ElMessage.warning('这张素材卡还没有文案版本，先去素材库补一个。')
    return
  }
  const field: Field = { key: `${block.key}-${Date.now()}`, label: `${block.title} ${block.fields.length + 1}`, text: '', limit: 1000 }
  block.fields.push(field)
  fieldRefs[field.key] = { cardId: card.id, variantId: variant.id }
  contentDirty.value = true
  pickingBlock.value = null
}

async function removeBlock(block: Block) {
  try {
    await ElMessageBox.confirm(`移除「${block.title}」模块及其 ${block.fields.length} 个字段？`, '移除模块', { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' })
  }
  catch {
    return
  }
  for (const field of block.fields) Reflect.deleteProperty(fieldRefs, field.key)
  blocks.value = blocks.value.filter(item => item.key !== block.key)
  contentDirty.value = true
}

function confirmAddBlock() {
  const title = newBlockTitle.value.trim()
  if (!title) return
  blocks.value.push({ key: `block-${Date.now()}`, title, fields: [] })
  newBlockTitle.value = ''
  addingBlock.value = false
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
watch([blocks, missingCount, addingBlock, pickingBlock, legacyCount], () => void nextTick(measureEdges), { deep: true })
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
            <div v-if="missingCount" class="application-editor__banner">
              还有 <b>{{ missingCount }}</b> 个字段没有引用素材卡：填表时这些字段只能靠基础档案里的事实或 AI，文案不会来自素材库。
            </div>

            <section v-for="block in blocks" :key="block.key" class="application-editor__block">
              <div class="application-editor__block-head">
                <h3>{{ block.title }}</h3>
                <div class="application-editor__block-actions">
                  <el-button text @click="pickingBlock = pickingBlock === block.key ? null : block.key">＋ 插入素材卡片</el-button>
                  <el-button text type="danger" @click="removeBlock(block)">移除模块</el-button>
                </div>
              </div>

              <!-- 从素材库挑一张卡：挑完这个模块就多一条已引用的字段，不需要先加空字段 -->
              <div v-if="pickingBlock === block.key" class="application-editor__library">
                <div class="application-editor__library-head">
                  <span>从素材库挑一张卡，插到这个模块里</span>
                  <el-button text @click="pickingBlock = null">取消</el-button>
                </div>
                <button v-for="card in cards" :key="card.id" type="button" class="application-editor__library-item" @click="insertCard(block, card)">
                  <span class="application-editor__library-type">{{ typeLabels[card.type] ?? card.type }}</span>
                  <span>
                    <b>{{ displayCardTitle(card) }}</b>
                    <span v-if="cardPeriod(card)" class="application-editor__library-meta"> · {{ cardPeriod(card) }}</span>
                  </span>
                </button>
                <p v-if="!cards.length" class="application-editor__note">素材库还是空的，先去「素材库」建一张卡。</p>
              </div>

              <div v-for="field in block.fields" :key="field.key" class="application-editor__field">
                <div class="application-editor__field-head">
                  <strong>{{ field.label }}</strong>
                  <span v-if="cardOf(field.key)" class="application-editor__note">{{ typeLabels[cardOf(field.key)!.type] ?? cardOf(field.key)!.type }} · 引用自素材库</span>
                  <span v-else class="application-editor__note">这个字段还没有内容</span>
                </div>
                <div class="application-editor__field-picks">
                  <el-select :model-value="fieldRefs[field.key]?.cardId" clearable placeholder="选择素材卡片…" @update:model-value="value => chooseCard(field, value)">
                    <el-option v-for="card in cards" :key="card.id" :label="displayCardTitle(card)" :value="card.id" />
                  </el-select>
                  <el-select v-if="cardOf(field.key)" :model-value="fieldRefs[field.key]?.variantId" placeholder="文案版本" @update:model-value="value => setVariant(field.key, value)">
                    <el-option v-for="item in cardOf(field.key)?.variants" :key="item.id" :label="item.name" :value="item.id" />
                  </el-select>
                </div>
                <div v-if="cardOf(field.key)" class="application-editor__preview">
                  <span v-if="cardMeta(cardOf(field.key)!)" class="application-editor__note">{{ cardMeta(cardOf(field.key)!) }}</span>
                  <p>{{ variantOf(field.key)?.content }}</p>
                </div>
                <div class="application-editor__field-foot">
                  <span>{{ cardOf(field.key) ? '改文案请去素材库改这张卡的版本，这里只选引用' : '不引用素材卡时，插件只能用基础事实或 AI' }}</span>
                  <span :class="{ 'application-editor__over': field.limit && fieldLength(field) > field.limit }">
                    {{ fieldLength(field) }} / {{ field.limit ?? '不限' }}{{ field.limit && fieldLength(field) > field.limit ? ' · 超出上限' : '' }}
                  </span>
                </div>
              </div>

              <p v-if="!block.fields.length" class="application-editor__empty">这个模块还没有素材。点右上角「＋ 插入素材卡片」从素材库挑一张。</p>
            </section>

            <p v-if="!blocks.length" class="application-editor__empty">这份档案还没有模块。用下面的「＋ 添加模块」建第一个，例如"实习经历"。</p>
          </div>
        </div>

        <!-- 加模块固定在底部，模块变多也够得着 -->
        <div class="workbench-surface__foot application-editor__foot">
          <template v-if="addingBlock">
            <el-input v-model="newBlockTitle" class="application-editor__new-block" placeholder="模块名称，例如：科研经历" maxlength="40" @keyup.enter="confirmAddBlock" />
            <el-button type="primary" @click="confirmAddBlock">添加</el-button>
            <el-button text @click="addingBlock = false; newBlockTitle = ''">取消</el-button>
          </template>
          <template v-else>
            <el-button text @click="addingBlock = true">＋ 添加模块</el-button>
            <span class="application-editor__note">模块是一组字段（如"实习经历"）；素材卡是字段的内容来源</span>
          </template>
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

.application-editor__block { margin-top: var(--space-6); }
.application-editor__block:first-of-type { margin-top: var(--space-4); }
.application-editor__block-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid rgba(190,204,195,.7); }
.application-editor__block-head h3 { margin: 0; }
.application-editor__block-actions { display: flex; gap: var(--space-1); align-items: center; }

.application-editor__library { margin-top: var(--space-3); padding: var(--space-3); border: 1px solid rgba(112,132,120,.16); border-radius: var(--radius-control); background: rgba(255,254,250,.86); display: grid; gap: var(--space-1); }
.application-editor__library-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); color: var(--workbench-slate); font-size: 12px; }
.application-editor__library-item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2); align-items: baseline; text-align: left; padding: var(--space-2) var(--space-3); border: 1px solid transparent; border-radius: 8px; background: transparent; font: inherit; color: var(--workbench-ink); cursor: pointer; }
.application-editor__library-item:hover { border-color: var(--workbench-blue); background: rgba(122,150,137,.08); }
.application-editor__library-type { color: var(--workbench-slate); font-size: 11px; white-space: nowrap; }
.application-editor__library-meta { color: var(--workbench-slate); font-size: 12px; }

.application-editor__field { margin-top: var(--space-3); padding: var(--space-4); border: 1px solid rgba(112,132,120,.16); border-radius: var(--radius-control); background: rgba(255,255,255,.46); display: grid; gap: var(--space-3); }
.application-editor__field-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); }
.application-editor__field-picks { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-2); }
.application-editor__field-picks :deep(.el-select) { width: 100%; }
.application-editor__preview { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid rgba(112,132,120,.16); border-radius: 8px; background: rgba(255,254,250,.7); }
.application-editor__preview p { margin: 0; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
.application-editor__field-foot { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); color: var(--workbench-slate); font-size: 12px; }
.application-editor__over { color: #8a5a44; }
.application-editor__empty { margin-top: var(--space-3); padding: var(--space-4); border: 1px dashed rgba(112,132,120,.28); border-radius: var(--radius-control); color: var(--workbench-slate); font-size: 13px; }

.application-editor__foot { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.application-editor__foot .application-editor__note { flex: 1; min-width: 180px; }
.application-editor__new-block { max-width: 260px; }

.application-editor__migration { display: grid; gap: var(--space-3); max-height: 460px; overflow: auto; }
.application-editor__migration :deep(.el-checkbox) { height: auto; display: grid; grid-template-columns: auto 1fr; white-space: normal; }
.application-editor__migration span { display: block; color: var(--workbench-slate); font-size: 12px; }

@media (max-width: 1100px) { .application-editor__layout { grid-template-columns: 280px minmax(0, 1fr); } }
@media (max-width: 760px) {
  /* 窄屏没有并排的侧边栏，"和侧边栏底边齐平"也就无从谈起，回到普通文档流 */
  .page-rail.application-editor { height: auto; padding: 20px 3px 40px; }
  .application-editor__layout { grid-template-columns: 1fr; min-height: 0; }
  .application-editor__field-picks { grid-template-columns: 1fr; }
  .application-editor__head { flex-direction: column; }
}
</style>
