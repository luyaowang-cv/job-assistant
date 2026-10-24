<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

// 类型的名字、该有哪些字段、列表副标题拼什么都来自这里。页面不再自己判断「这个类型有没有时间」，
// 只问注册表。见 web/shared/material-types.ts 的头注释。
import { MATERIAL_TYPE_LABELS, formatTechStack, groupFieldRows, materialDateInput, materialHasVersion, materialListMeta, materialPeriod, materialTypeLabel, materialTypeSpec, parseTechStack, type MaterialFieldSpec } from '#shared/material-types'

type Variant = { id: string; name: string; content: string; createdAt: string }
type Card = { id: string; type: string; title: string; tags: string[]; facts: Record<string, unknown>; archivedAt: string | null; variants: Variant[] }
type ListResponse = { items: Card[]; total: number; page: number; pageSize: number }
const cards = ref<Card[]>([])
const selected = ref<Card | null>(null)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const search = ref('')
const type = ref('')
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
/** 表单初值。所有可能出现的字段键都先声明，Vue 的响应式对象才稳定。 */
const emptyForm = () => ({
  type: 'PROJECT',
  title: '',
  tags: [] as string[],
  organization: '',
  role: '',
  projectUrl: '',
  techStackText: '',
  college: '',
  major: '',
  educationLevel: '',
  academicDegree: '',
  studyMode: '',
  duration: '',
  schoolCategory: '',
  trainingMode: '',
  overseas: '',
  ranking: '',
  studentId: '',
  campusRole: '',
  lab: '',
  advisor: '',
  researchDirection: '',
  thesis: '',
  majorDescription: '',
  courses: '',
  // 数字字段在表单里也存字符串：受控输入框如果存 number，打「3.」时会被解析成 3，
  // 小数点当场消失，永远打不出 3.94。转换只在保存时做（见 buildFacts）。
  gpa: '',
  gpaScale: '',
  startDate: '',
  endDate: '',
  current: false,
  variantName: '简短版',
  content: '',
})
const form = reactive(emptyForm())
/** 泛型写入用：字段 key 是运行时字符串，TS 的键类型推导不到。 */
const formRecord = () => form as unknown as Record<string, unknown>
const variant = reactive({ name: '网申版', content: '' })
const variantNameOptions = ['简短版', '网申版', '完整版']

/**
 * 当前类型该长什么样。整页只有这一个判断入口——下面所有「有没有这个字段」都问它，
 * 不再按类型名写 if。
 */
const spec = computed(() => materialTypeSpec(form.type))

/**
 * 注册表的字段 key → 表单字段。两者形状本来就不一样：表单要能装下没填完的半成品
 * （技术栈先是一串带逗号的文字），facts 要的是干净的 string[]。这层翻译只在提交时做。
 */
/**
 * 注册表 key → 表单字段。只有名字对不上的才写在这里：技术栈在表单里是一串待拆分的文字，
 * 存进 facts 才是 string[]。其余字段的表单名和 key 同名，不用再维护一张全量表。
 */
const FORM_ALIAS: Record<string, string> = { techStack: 'techStackText' }
const formKeyOf = (field: MaterialFieldSpec) => FORM_ALIAS[field.key] ?? field.key

function fieldValue(field: MaterialFieldSpec): string {
  const value = formRecord()[formKeyOf(field)]
  return typeof value === 'string' ? value : ''
}
function setFieldValue(field: MaterialFieldSpec, value: string) {
  formRecord()[formKeyOf(field)] = value
}

/**
 * 把字段排成行：相邻的两个 text 字段并排（沿用原来的两列布局），其余各占一行。
 * 顺序完全由注册表的 fields 决定，这里不做任何按类型的判断。
 */
const fieldRows = computed(() => groupFieldRows(spec.value?.fields ?? []))

/**
 * 成果要点那一栏：
 * - `contentField: 'hidden'`（教育背景）—— 根本不显示，因为这类卡没有"一段经历描述"；
 * - `contentRequired: false`（奖项、证书）—— 显示但不强制填，写不写都行。
 */
const showContentField = computed(() => !editingId.value && spec.value?.contentField !== 'hidden')
/** 没有右栏时（编辑态，或不写成果要点的类型）整宽排布。 */
const hasAside = computed(() => showContentField.value)
/** 整宽且字段多的时候流成两列：教育卡二十来个字段，单列会把弹窗拉成一长条。 */
const denseFields = computed(() => !hasAside.value && fieldRows.value.length >= 6)

/** 正在编辑的类型有没有「版本」这回事（教育背景没有文案，也就没有版本）。 */
const formHasVersion = computed(() => materialHasVersion(form.type))
/** 右侧详情面板用：选中卡片的规格，以及它有没有版本。 */
const selectedSpec = computed(() => (selected.value ? materialTypeSpec(selected.value.type) : undefined))
const selectedHasVersion = computed(() => (selected.value ? materialHasVersion(selected.value.type) : true))

/**
 * 详情面板里只读展示字段值。没有版本的卡片（教育背景）没有文案可看，
 * 面板就用这些字段填满，而不是空着一片。
 */
function fieldText(facts: Record<string, unknown>, field: MaterialFieldSpec): string {
  if (field.kind === 'dateRange') return materialPeriod(facts)
  const value = facts[field.key]
  if (field.kind === 'techList') return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('、') : ''
  if (field.kind === 'number') return typeof value === 'number' ? String(value) : ''
  return typeof value === 'string' ? value : ''
}

/**
 * 单字段行（项目/科研的链接、技术栈、技能卡的熟练程度…）一律整行铺满；
 * 只有成对的 text 字段用两列。dialog-grid 是 1fr 2fr，单个控件塞进去只占左边三分之一，
 * 链接框尤其明显——看着像没做完。
 * 单个日期例外：日期选择器被拉成整行会很空，保持原来的窄列。
 */
function rowClass(row: MaterialFieldSpec[]) {
  if (row[0]?.kind === 'dateRange') return 'dialog-grid time-grid'
  if (row.length > 1) return 'dialog-grid'
  return row[0]?.kind === 'date' ? 'dialog-grid' : 'wide-grid'
}

const displayCardTitle = (card: Pick<Card, 'title' | 'type'>) => card.title.trim() || materialTypeLabel(card.type) || '未命名素材'
const cardMeta = (card: Card) => materialListMeta(card.type, card.facts)

// ------------------------------------------------------------ 校验与错误提示
//
// 分两层，各自负责不同的边界：
// - 前端只管「必填」——它决定星号、失焦提示和提交前的拦截，目的是别让用户白跑一次网络。
// - 格式类校验留在服务端（那是边界）。服务端把 zod 的每条 issue 放在响应的 details 里，
//   这里把 path 翻成中文字段名，再把错误标到对应控件下面。以前这里直接吞成一句
//   「保存失败，请检查标题和文案」，用户根本不知道是哪一项。

const formRef = ref<FormInstance>()
/** 服务端返回的字段级错误。键是路径末段：title / startDate / techStack / content … */
const fieldErrors = reactive<Record<string, string>>({})

const rules = computed<FormRules>(() => ({
  title: spec.value?.titleRequired === false
    ? []
    : [{ required: true, message: `请填写${spec.value?.titleLabel ?? '标题'}`, trigger: 'blur' }],
  // 成果要点默认必填；奖项、证书这类在注册表里标了 contentRequired: false。
  // 编辑已有卡片时不显示这一项（文案版本在右侧单独维护），所以也就不校验。
  content: editingId.value || spec.value?.contentRequired === false
    ? []
    : [{ required: true, message: '请填写成果要点', trigger: 'blur' }],
}))

function clearFieldErrors() {
  for (const key of Object.keys(fieldErrors)) Reflect.deleteProperty(fieldErrors, key)
}

/** zod issue 的 path（如 ['facts','startDate']）→ 中文字段名 + 人话原因。 */
function describeIssue(issue: unknown): { key: string, text: string } {
  const item = issue as { path?: unknown, message?: unknown }
  const path = Array.isArray(item.path) ? item.path.join('.') : ''
  const rawMessage = typeof item.message === 'string' ? item.message : ''
  if (path === 'title') return { key: 'title', text: `${spec.value?.titleLabel ?? '标题'}不能为空` }
  if (path === 'type') return { key: 'type', text: '经历类型不合法' }
  if (path === 'variant.content') return { key: 'content', text: '成果要点不能为空' }
  if (path === 'variant.name') return { key: 'variantName', text: '版本名称不能为空' }
  if (path.startsWith('facts.')) {
    const key = path.slice('facts.'.length)
    // 服务端按类型白名单拒绝的键（正常流程不会出现，前端只发注册表里的字段）
    if (/unknown fact key/i.test(rawMessage)) return { key: '', text: `这个类型不支持字段「${key}」` }
    if (key === 'endDate' && /earlier/i.test(rawMessage)) return { key, text: '结束时间不能早于开始时间' }
    if (key === 'startDate' || key === 'endDate') return { key, text: `${key === 'startDate' ? '开始时间' : '结束时间'}格式不对，应为 2025-06-15 这样的年月日` }
    const label = spec.value?.fields.find(field => field.key === key)?.label ?? key
    return { key, text: `${label}格式不对` }
  }
  // 认不出的路径就把服务端原话抛出来，总比一句"保存失败"有信息量
  return { key: '', text: rawMessage || '保存失败，请稍后重试。' }
}

/** 把一次失败翻译成人话，并把字段级错误标到对应控件下方。 */
function reportSaveFailure(error: unknown, fallback: string) {
  clearFieldErrors()
  const details = (error as { data?: { error?: { details?: unknown[] } } })?.data?.error?.details
  const issues = Array.isArray(details) ? details.map(describeIssue) : []
  if (!issues.length) { ElMessage.error(fallback); return }
  for (const issue of issues) if (issue.key) fieldErrors[issue.key] = issue.text
  ElMessage.error(issues[0]?.text ?? fallback)
}

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ data: ListResponse }>('/api/v1/material-cards', { query: { search: search.value, type: type.value || undefined, pageSize: 100 } })
    cards.value = response.data.items
    if (selected.value) selected.value = cards.value.find(card => card.id === selected.value?.id) ?? null
  } catch { ElMessage.error('素材库读取失败。') } finally { loading.value = false }
}
function beginCreate() {
  editingId.value = null
  clearFieldErrors()
  Object.assign(form, emptyForm())
  editorOpen.value = true
  void nextTick(() => formRef.value?.clearValidate())
}
/**
 * 卡片 facts → 表单。按注册表的字段列表走一遍，以后加字段不用再回来改这里
 * （之前是手写 Object.assign 逐个字段，加一个漏一个）。
 */
function fillFormFromFacts(cardType: string, facts: Record<string, unknown>) {
  for (const field of materialTypeSpec(cardType)?.fields ?? []) {
    if (field.kind === 'number') {
      formRecord()[field.key] = typeof facts[field.key] === 'number' ? String(facts[field.key]) : ''
      continue
    }
    if (field.kind === 'dateRange') {
      // 存量卡片可能还存着 YYYY-MM，交给 shared 补成当月 1 日，否则控件解析失败显示成空
      form.startDate = materialDateInput(facts.startDate)
      form.endDate = facts.endDate === '至今' ? '' : materialDateInput(facts.endDate)
      form.current = facts.endDate === '至今'
      continue
    }
    if (field.kind === 'techList') {
      form.techStackText = formatTechStack(facts[field.key])
      continue
    }
    formRecord()[field.key] = typeof facts[field.key] === 'string' ? facts[field.key] : ''
  }
}
function beginEdit(card: Card) {
  editingId.value = card.id
  clearFieldErrors()
  Object.assign(form, emptyForm(), { type: card.type, title: card.title, tags: [...card.tags] })
  fillFormFromFacts(card.type, card.facts as Record<string, unknown>)
  editorOpen.value = true
  void nextTick(() => formRef.value?.clearValidate())
}
/**
 * 表单状态 → facts。写哪些键、写成什么形状，全由注册表的字段列表决定，这里不出现任何类型名。
 * 空值一律不写，库里不留一堆空字符串。
 */
function buildFacts(): Record<string, unknown> {
  const facts: Record<string, unknown> = {}
  for (const field of spec.value?.fields ?? []) {
    if (field.kind === 'dateRange') {
      if (form.startDate) facts[field.key] = form.startDate
      const endDate = form.current ? '至今' : form.endDate
      if (endDate) facts.endDate = endDate
      continue
    }
    if (field.kind === 'techList') {
      // 解析和格式化共用 shared 里那一对函数：以前回填用 '、'、这里按 ,，/ 拆，两边不一致，
      // 每编辑保存一次就把数组又合并一层。
      const list = parseTechStack(form.techStackText)
      if (list.length) facts[field.key] = list
      continue
    }
    // 单月份只写 startDate。注意 PATCH 是整体替换 facts，所以不写 endDate 就等于删掉它——
    // 这正是「编辑即清洗」：存量奖项卡里那个多余的结束月份会在下次保存时消失。
    if (field.kind === 'date') {
      if (form.startDate) facts[field.key] = form.startDate
      continue
    }
    if (field.kind === 'number') {
      const raw = fieldValue(field).trim()
      const value = Number(raw)
      if (raw && Number.isFinite(value)) facts[field.key] = value
      continue
    }
    const value = fieldValue(field).trim()
    if (value) facts[field.key] = value
  }
  return facts
}
async function createCard() {
  clearFieldErrors()
  // 必填校验交给 el-form：它会显示星号、在字段下方标红，并靠 scroll-to-error 滚到第一个错处。
  const valid = formRef.value ? await formRef.value.validate().catch(() => false) : true
  if (!valid) return
  const title = form.title.trim()
  const facts = buildFacts()
  saving.value = true
  try {
    const wasEditing = Boolean(editingId.value)
    if (editingId.value) {
      await $fetch(`/api/v1/material-cards/${editingId.value}`, { method: 'PATCH', body: { title, tags: form.tags, facts } })
    }
    else {
      await $fetch('/api/v1/material-cards', { method: 'POST', body: { type: form.type, title, tags: form.tags, facts, variant: { name: formHasVersion.value ? form.variantName : '默认', content: form.content } } })
    }
    editorOpen.value = false
    editingId.value = null
    await load()
    ElMessage.success(wasEditing ? '素材卡片已更新。' : '素材卡片已创建。')
  } catch (error) { reportSaveFailure(error, '保存失败，请稍后重试。') } finally { saving.value = false }
}
async function addVariant() {
  if (!selected.value) return
  const existingVariant = selected.value.variants.find(item => item.name === variant.name.trim())
  if (existingVariant) {
    try {
      await ElMessageBox.confirm(`“${existingVariant.name}”已存在。覆盖后，所有引用该版本的简历和网申在后续读取时都会使用新文案。是否覆盖旧版本？`, '覆盖旧版本', {
        confirmButtonText: '覆盖',
        cancelButtonText: '取消',
        type: 'warning',
      })
    }
    catch { return }
  }
  saving.value = true
  try {
    await $fetch(`/api/v1/material-cards/${selected.value.id}/variants`, { method: 'POST', body: { ...variant, overwrite: Boolean(existingVariant) } })
    Object.assign(variant, { name: '网申版', content: '' })
    await load()
    ElMessage.success(existingVariant ? '旧文案版本已覆盖。' : '新文案版本已保存。')
  } catch (error) { reportSaveFailure(error, '保存失败，请检查版本名称和文案。') } finally { saving.value = false }
}
async function removeCard() {
  if (!selected.value) return
  await ElMessageBox.confirm('删除后该卡片及其所有版本将从素材库和相关文档中移除，且不可恢复。确认删除？', '确认删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
  deleting.value = true
  try {
    await $fetch(`/api/v1/material-cards/${selected.value.id}`, { method: 'DELETE' })
    selected.value = null
    await load()
    ElMessage.success('素材卡片已删除。')
  }
  catch { ElMessage.error('删除失败，请重试。') }
  finally { deleting.value = false }
}
watch([search, type], () => void load(), { deep: true })
onMounted(() => void load())
</script>

<template>
  <section class="page-rail material-page material-library-page workbench-window">
    <div class="material-surface material-library">
      <!-- 一行：搜索 + 类型 + 新建素材。标题和说明文案按需求去掉，页面靠侧边栏告知在哪里 -->
      <header class="material-surface__header material-toolbar">
        <el-input v-model="search" clearable placeholder="搜索标题或文案" />
        <el-select v-model="type" clearable placeholder="全部类型"><el-option v-for="(label, key) in MATERIAL_TYPE_LABELS" :key="key" :label="label" :value="key" /></el-select>
        <el-button type="primary" class="material-library__create" @click="beginCreate">＋ 新建素材</el-button>
      </header>
      <div v-loading="loading" class="material-layout">
        <div class="card-list" role="list" aria-label="素材卡片">
          <button v-for="card in cards" :key="card.id" class="material-card-row" :class="{ active: selected?.id === card.id }" type="button" @click="selected = card">
            <span class="material-card-row__type">{{ materialTypeLabel(card.type) }}</span><strong>{{ displayCardTitle(card) }}</strong>
            <span class="material-card-row__meta">{{ [cardMeta(card), card.tags.join(' · ')].filter(Boolean).join(' · ') || '未填写补充信息' }}</span>
          </button>
          <el-empty v-if="!loading && !cards.length" description="没有符合条件的素材" />
        </div>
        <aside class="card-detail" aria-live="polite">
          <template v-if="selected">
            <div class="card-detail__heading"><div class="card-detail__title"><span>{{ materialTypeLabel(selected.type) }}</span><h2>{{ displayCardTitle(selected) }}</h2><p v-if="cardMeta(selected)" class="card-period">{{ cardMeta(selected) }}</p></div><div class="card-detail__actions"><el-button plain type="primary" @click="beginEdit(selected)">编辑</el-button><el-button plain type="danger" :loading="deleting" @click="removeCard">删除</el-button></div></div>
            <!-- 有文案的类型才谈"版本"；没有文案的（教育背景）用只读字段列表填满面板 -->
            <template v-if="selectedHasVersion">
              <div class="variant-history"><article v-for="item in selected.variants" :key="item.id"><b>{{ item.name }}</b><small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</small><p>{{ item.content }}</p></article></div>
              <el-form label-position="top">
                <el-form-item label="新增或覆盖文案版本"><el-select v-model="variant.name" allow-create filterable placeholder="选择或输入版本名称"><el-option v-for="name in variantNameOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item>
                <el-form-item label="文案"><el-input v-model="variant.content" type="textarea" :rows="5" show-word-limit maxlength="20000" /></el-form-item>
                <div class="card-actions"><el-button type="primary" :loading="saving" @click="addVariant">保存文案版本</el-button></div>
              </el-form>
            </template>
            <ul v-else class="facts-readonly">
              <template v-for="field in selectedSpec?.fields ?? []" :key="field.key">
                <li v-if="fieldText(selected.facts, field)"><span>{{ field.label }}</span><b>{{ fieldText(selected.facts, field) }}</b></li>
              </template>
              <li v-if="!selectedSpec?.fields.some(field => fieldText(selected.facts, field))"><span>还没有填写任何字段</span></li>
            </ul>
          </template>
          <el-empty v-else description="选择一张素材查看版本" />
        </aside>
      </div>
    </div>
    <!-- 宽度跟着布局走：有右栏或要排两列时放宽，单列时收窄，免得字段被拉得稀稀拉拉。 -->
    <el-dialog v-model="editorOpen" :title="editingId ? '编辑素材卡片' : '新建素材卡片'" :width="hasAside || denseFields ? 'min(1120px, 88vw)' : 'min(760px, 92vw)'">
      <!-- 左栏字段、右栏成果要点。以前全部竖着堆在 720px 里，又长又窄；
           现在宽度按视口比例走、正文两栏，高度砍掉一半。编辑已有卡片时右栏不出现，自动退成单栏。 -->
      <div class="editor-shell">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" scroll-to-error>
          <div class="editor-layout" :class="{ 'editor-layout--single': !hasAside }">
            <div class="editor-main">
              <div class="dialog-grid">
                <el-form-item label="经历类型"><el-select v-model="form.type" :disabled="!!editingId"><el-option v-for="(label, key) in MATERIAL_TYPE_LABELS" :key="key" :label="label" :value="key" /></el-select></el-form-item>
                <el-form-item prop="title" :label="spec?.titleLabel ?? '标题'"><el-input v-model="form.title" :placeholder="spec?.titlePlaceholder ?? '输入素材标题'" /></el-form-item>
              </div>
              <!-- 字段全部来自注册表：有几行、每行放什么控件，由 spec.fields 的顺序和 kind 决定。
                   这里不再出现任何按类型名的判断。
                   字段多的时候（教育卡有二十来个）这一块在整宽里流成两列，弹窗就不会被拉成一长条。 -->
              <div class="editor-fields" :class="{ 'editor-fields--columns': denseFields }">
              <div v-for="(row, rowIndex) in fieldRows" :key="rowIndex" :class="rowClass(row)">
                <template v-if="row[0]?.kind === 'dateRange'">
                  <el-form-item label="开始时间" :error="fieldErrors.startDate"><el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
                  <el-form-item label="结束时间" :error="fieldErrors.endDate">
                    <div class="end-date-control"><el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" placeholder="选择日期" :disabled="form.current" /><el-checkbox v-model="form.current">至今</el-checkbox></div>
                  </el-form-item>
                </template>
                <template v-else-if="row[0]?.kind === 'date'">
                  <el-form-item :label="row[0]?.label" :error="fieldErrors.startDate">
                    <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" placeholder="选择日期" />
                  </el-form-item>
                </template>
                <template v-else>
                  <el-form-item v-for="field in row" :key="field.key" :label="field.label" :error="fieldErrors[field.key]">
                    <el-select v-if="field.kind === 'select'" :model-value="fieldValue(field)" clearable :placeholder="field.placeholder ?? '请选择'" @update:model-value="(value: string | undefined) => setFieldValue(field, value ?? '')">
                      <el-option v-for="option in field.options ?? []" :key="option.value" :label="option.label" :value="option.value" />
                    </el-select>
                    <el-input v-else-if="field.kind === 'textarea'" type="textarea" :rows="3" :model-value="fieldValue(field)" :placeholder="field.placeholder" @update:model-value="value => setFieldValue(field, value)" />
                    <el-input v-else :type="field.kind === 'number' ? 'number' : 'text'" :model-value="fieldValue(field)" :placeholder="field.placeholder" @update:model-value="value => setFieldValue(field, value)" />
                    <p v-if="field.help" class="form-help">{{ field.help }}</p>
                  </el-form-item>
                </template>
              </div>
              <el-form-item label="标签（可选）">
                <el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="输入后按回车，例如：前端、Vue、数据分析" />
                <p class="form-help">标签只用于搜索素材、匹配岗位和查找受影响的简历，不会显示在简历正文中。</p>
              </el-form-item>
              <el-form-item v-if="!editingId && formHasVersion" label="版本名称" :error="fieldErrors.variantName"><el-select v-model="form.variantName" allow-create filterable placeholder="选择或输入版本名称"><el-option v-for="name in variantNameOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item>
              </div>
            </div>
            <div v-if="showContentField" class="editor-aside">
              <el-form-item prop="content" label="成果要点" :error="fieldErrors.content"><el-input v-model="form.content" type="textarea" :rows="17" placeholder="每行写一个重点；可用“架构设计：……”这样的格式，冒号前会自动加粗。" /></el-form-item>
            </div>
          </div>
        </el-form>
      </div>
      <template #footer><el-button @click="editorOpen = false">取消</el-button><el-button text type="primary" :loading="saving" @click="createCard">{{ editingId ? '保存' : '创建' }}</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
/* 固定窗口：高度由 .workbench-window 锁到视口（底边和左侧栏底边齐平），
   卡片列表和详情各自在框内滚，页面不再随卡片数量越撑越长。
   必须靠确定的算式——百分比在这个外壳里会退化成 auto，那就又变回"随内容长高"了。
   520px 的下限放在最外层这个圆角框上、而不是内层 grid 上：窗口很矮时内层溢出会把内容
   甩到框外面去；撑在最外层则整页回退成可以滚，内容始终在框内。 */
.page-rail.material-library-page { display: flex; flex-direction: column; }
.material-library { flex: 1; min-height: 520px; display: flex; flex-direction: column; padding: 24px; }
.material-surface__header { flex: none; }
/* 工具栏：搜索框和类型筛选共用同一个固定宽高，主按钮仍然贴右。
   宽度用变量是为了"一样宽"由结构保证；高度也必须两个都写死——Element Plus 自带的
   .el-select__wrapper{min-height:32px} 和全局那条 .el-select__wrapper{min-height:40px}
   优先级相同（都是 0,1,0），实测赢的是 EP 那条：搜索框 40px、筛选框 32px，两个框就不一样高。
   这里用 `.material-surface__header.material-toolbar` + :deep（编译后 0,3,0）压过它们，
   跟样式注入顺序无关。别只写一个类去压全局那条——那又变成看打包顺序了。 */
.material-surface__header.material-toolbar { --material-filter-width: 200px; --material-filter-height: 32px; display: flex; align-items: center; justify-content: flex-start; gap: var(--space-3); margin-bottom: var(--space-4); }
.material-surface__header.material-toolbar :deep(.el-input),
.material-surface__header.material-toolbar :deep(.el-select) { flex: none; width: var(--material-filter-width); }
.material-surface__header.material-toolbar :deep(.el-input__wrapper),
.material-surface__header.material-toolbar :deep(.el-select__wrapper) { min-height: var(--material-filter-height); box-sizing: border-box; }
/* 整行压到 32px，和投递记录、岗位库两条工具栏一致（按钮本来也是 32px，这里写出来是为了自成一体） */
.material-surface__header.material-toolbar :deep(.el-button) { min-height: var(--material-filter-height); }
.material-library__create { margin-left: auto; }
.material-layout{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(360px,1.4fr);gap:18px;flex:1;min-height:0}
.card-list,.card-detail{border:1px solid var(--el-border-color-lighter);border-radius:16px;background:var(--el-bg-color);padding:12px;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(116,132,124,.32) transparent}
.card-list::-webkit-scrollbar,.card-detail::-webkit-scrollbar{width:8px}
.card-list::-webkit-scrollbar-track,.card-detail::-webkit-scrollbar-track{background:transparent}
.card-list::-webkit-scrollbar-thumb,.card-detail::-webkit-scrollbar-thumb{border-radius:4px;background:rgba(116,132,124,.28)}
/* 用 grid + align-content:start，而不是 flex 列：flex 项默认会收缩，
   卡片会被压扁去适应框高，而不是让框滚起来。 */
.card-list{display:grid;align-content:start;gap:8px}.material-card-row{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;text-align:left;border:1px solid transparent;border-radius:12px;background:transparent;padding:14px;color:inherit;cursor:pointer}.material-card-row:hover,.material-card-row.active{border-color:var(--el-color-primary-light-5);background:var(--el-color-primary-light-9)}.material-card-row__meta{grid-column:2;color:var(--el-text-color-secondary);font-size:12px}.material-card-row__type{font-size:12px;color:var(--el-color-primary)}.card-detail__heading{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:start}.card-detail__title{min-width:0}.card-detail__heading h2{margin:4px 0 2px}.card-detail__actions{display:flex;flex:none;flex-wrap:wrap;gap:8px;justify-content:flex-end}.card-detail__actions .el-button{width:64px;margin:0}.card-period{margin:0 0 16px;color:var(--el-text-color-secondary);font-size:13px}.variant-history{display:grid;gap:10px;margin-bottom:20px}.variant-history article{padding:14px;border-radius:12px;background:var(--el-fill-color-light)}.variant-history small{float:right;color:var(--el-text-color-secondary)}.variant-history p{white-space:pre-wrap;margin-bottom:0}.card-actions{display:flex;justify-content:flex-end;gap:8px}
/* 没有文案的卡片（教育背景）：详情面板用只读字段列表填满，而不是空着一片 */
.facts-readonly{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.facts-readonly li{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:8px 12px;border-radius:10px;background:var(--el-fill-color-light);font-size:13px}
.facts-readonly span{color:var(--el-text-color-secondary)}
.facts-readonly b{font-weight:500;color:var(--el-text-color-primary);white-space:pre-wrap}
.dialog-grid{display:grid;grid-template-columns:1fr 2fr;gap:12px}
/* 单字段整行的行（技术栈这类）：原来它不在 grid 里、天然满宽，这里显式写成单列保持一致 */
.wide-grid{display:grid;grid-template-columns:1fr;gap:12px}
/* 编辑弹窗：宽度在 el-dialog 上按视口比例给（min(1120px, 88vw)），这里补左右内边距，
   再把正文分成两栏——左栏字段、右栏成果要点。以前全竖着堆在 720px 里，所以显得又长又窄。 */
.editor-shell{padding:4px 14px 8px}
.editor-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:28px;align-items:stretch}
.editor-layout--single{grid-template-columns:1fr}
.editor-main{min-width:0}
/* 字段多的时候在整宽里流成两列（CSS 多列，不是 grid）：字段按顺序往下填，填满一列自动接到
   第二列，高度自然平衡。每个"行"是一个块，break-inside: avoid 保证一行不会被拆到两列去。 */
.editor-fields--columns{column-count:2;column-gap:26px}
.editor-fields--columns > *{break-inside:avoid}
/* 教育卡有二十来个字段，按 Element Plus 默认的 18px 行距会拉到两屏。
   压到 10px、标签也收紧，一屏能多放三四条。 */
.editor-main :deep(.el-form-item){margin-bottom:10px}
.editor-main :deep(.el-form-item__label){margin-bottom:2px;line-height:1.3;font-size:13px}
/* 数字字段用的是普通 el-input + type="number"，所以外框、聚焦、内边距、高度全都和其它字段
   同一个组件保证一致，不需要额外的框样式。这里只做两件事：干掉浏览器自带的上下箭头，
   以及数字向左对齐（右对齐在表单里看着像金额）。 */
.editor-main :deep(input[type='number']){text-align:left;-moz-appearance:textfield}
.editor-main :deep(input[type='number']::-webkit-outer-spin-button),
.editor-main :deep(input[type='number']::-webkit-inner-spin-button){-webkit-appearance:none;margin:0}
/* 右栏的文本域撑满整列，和左栏字段区等高 */
.editor-aside{display:flex;min-width:0}
.editor-aside :deep(.el-form-item){display:flex;flex:1;flex-direction:column;margin-bottom:0;min-height:0}
.editor-aside :deep(.el-form-item__content){flex:1;min-height:0}
.editor-aside :deep(.el-textarea){height:100%}
.editor-aside :deep(.el-textarea__inner){height:100%;resize:none}.time-grid{grid-template-columns:1fr 1fr}.time-grid :deep(.el-date-editor){width:100%}.end-date-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;width:100%}.form-help{width:100%;margin:7px 0 0;color:var(--el-text-color-secondary);font-size:12px;line-height:1.5}
/* 单列之后就没有"和侧边栏并排"这回事了，解除锁高：回到普通文档流，页面整体滚。
   这里的高度/内边距覆盖要压过全局的 .page-rail.workbench-window——scoped 会给选择器
   加上 [data-v-x]，所以下面这个选择器比全局那条更具体，不受样式注入顺序影响。 */
@media(max-width:900px){
  .page-rail.material-library-page{height:auto;padding:20px 3px 40px}
  .page-rail.material-library-page .material-library{min-height:0}
  .material-layout{grid-template-columns:1fr;min-height:0}
  .card-list,.card-detail{overflow:visible}
  .card-detail{min-height:360px}
  /* 窄屏下编辑弹窗退回单栏：两栏在 900px 以下会把字段挤成一列字 */
  .editor-layout{grid-template-columns:1fr}
  .editor-fields--columns{column-count:1}
  .editor-shell{padding:4px 0 8px}
  .editor-aside :deep(.el-textarea__inner){min-height:180px}
}
@media(max-width:560px){
  .material-library{padding:16px}
  /* 手机上工具栏竖排：搜索框、类型、新建素材各占一行，固定宽度这时放开成整行 */
  .material-surface__header.material-toolbar{flex-direction:column;align-items:stretch}
  .material-surface__header.material-toolbar :deep(.el-input),
  .material-surface__header.material-toolbar :deep(.el-select){width:100%}
  .material-library__create{margin-left:0}
  .dialog-grid{grid-template-columns:1fr}
  .material-card-row{grid-template-columns:auto 1fr}
}
</style>
