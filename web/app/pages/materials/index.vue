<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

// 类型的名字、该有哪些字段、列表副标题拼什么都来自这里。页面不再自己判断「这个类型有没有时间」，
// 只问注册表。见 web/shared/material-types.ts 的头注释。
import { MATERIAL_TYPE_LABELS, materialListMeta, materialTypeLabel, materialTypeSpec, type MaterialFieldSpec } from '#shared/material-types'

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
const form = reactive({ type: 'PROJECT', title: '', organization: '', role: '', techStackText: '', tags: [] as string[], startDate: '', endDate: '', current: false, projectUrl: '', variantName: '简短版', content: '' })
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
const FORM_KEY: Record<string, 'role' | 'organization' | 'projectUrl' | 'techStackText' | 'startDate' | 'endDate'> = {
  role: 'role',
  organization: 'organization',
  projectUrl: 'projectUrl',
  techStack: 'techStackText',
  startDate: 'startDate',
  endDate: 'endDate',
}

function fieldValue(field: MaterialFieldSpec): string {
  // 必须先把 key 取成局部变量再索引：TS 不会把 `FORM_KEY[field.key]` 第一次查表的结果
  // 带进第二次查表，那边仍然可能是 undefined。
  const key = FORM_KEY[field.key]
  if (!key) return ''
  const value = form[key]
  return typeof value === 'string' ? value : ''
}
function setFieldValue(field: MaterialFieldSpec, value: string) {
  const key = FORM_KEY[field.key]
  if (key) (form as Record<string, unknown>)[key] = value
}

/**
 * 把字段排成行：相邻的两个 text 字段并排（沿用原来的两列布局），其余各占一行。
 * 顺序完全由注册表的 fields 决定，这里不做任何按类型的判断。
 */
const fieldRows = computed(() => {
  const rows: MaterialFieldSpec[][] = []
  for (const field of spec.value?.fields ?? []) {
    const previous = rows[rows.length - 1]
    if (field.kind === 'text' && previous && previous.length === 1 && previous[0]?.kind === 'text') previous.push(field)
    else rows.push([field])
  }
  return rows
})

/** 技术栈是整行输入框；其余单字段行沿用原来的 dialog-grid 列宽。 */
function rowClass(row: MaterialFieldSpec[]) {
  if (row[0]?.kind === 'techList') return 'wide-grid'
  if (row[0]?.kind === 'monthRange') return 'dialog-grid time-grid'
  return 'dialog-grid'
}

const displayCardTitle = (card: Pick<Card, 'title' | 'type'>) => card.title.trim() || materialTypeLabel(card.type) || '未命名素材'
const cardMeta = (card: Card) => materialListMeta(card.type, card.facts)

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
  Object.assign(form, { type: 'PROJECT', title: '', organization: '', role: '', techStackText: '', tags: [], startDate: '', endDate: '', current: false, projectUrl: '', variantName: '简短版', content: '' })
  editorOpen.value = true
}
function beginEdit(card: Card) {
  editingId.value = card.id
  const facts = card.facts as Record<string, unknown>
  Object.assign(form, {
    type: card.type, title: card.title,
    organization: typeof facts.organization === 'string' ? facts.organization : '',
    role: typeof facts.role === 'string' ? facts.role : '',
    techStackText: Array.isArray(facts.techStack) ? facts.techStack.filter(value => typeof value === 'string').join('、') : '',
    tags: [...card.tags],
    startDate: typeof facts.startDate === 'string' ? facts.startDate : '',
    endDate: facts.endDate === '至今' ? '' : (typeof facts.endDate === 'string' ? facts.endDate : ''),
    current: facts.endDate === '至今',
    projectUrl: typeof facts.projectUrl === 'string' ? facts.projectUrl : '',
    variantName: '简短版',
    content: '',
  })
  editorOpen.value = true
}
/**
 * 表单状态 → facts。写哪些键、写成什么形状，全由注册表的字段列表决定，这里不出现任何类型名。
 * 空值一律不写，库里不留一堆空字符串。
 */
function buildFacts(): Record<string, unknown> {
  const facts: Record<string, unknown> = {}
  for (const field of spec.value?.fields ?? []) {
    if (field.kind === 'monthRange') {
      if (form.startDate) facts[field.key] = form.startDate
      const endDate = form.current ? '至今' : form.endDate
      if (endDate) facts.endDate = endDate
      continue
    }
    if (field.kind === 'techList') {
      const list = form.techStackText.split(/[,，/]/).map(value => value.trim()).filter(Boolean)
      if (list.length) facts[field.key] = list
      continue
    }
    const value = fieldValue(field).trim()
    if (value) facts[field.key] = value
  }
  return facts
}
async function createCard() {
  const title = form.title.trim()
  // 标题是否必填也来自注册表；拿不到规格时按必填处理，宁可多问一句。
  if (!title && spec.value?.titleRequired !== false) {
    ElMessage.warning('请填写素材标题。')
    return
  }
  const facts = buildFacts()
  saving.value = true
  try {
    const wasEditing = Boolean(editingId.value)
    if (editingId.value) {
      await $fetch(`/api/v1/material-cards/${editingId.value}`, { method: 'PATCH', body: { title, tags: form.tags, facts } })
    }
    else {
      await $fetch('/api/v1/material-cards', { method: 'POST', body: { type: form.type, title, tags: form.tags, facts, variant: { name: form.variantName, content: form.content } } })
    }
    editorOpen.value = false
    editingId.value = null
    await load()
    ElMessage.success(wasEditing ? '素材卡片已更新。' : '素材卡片已创建。')
  } catch { ElMessage.error('保存失败，请检查标题和文案。') } finally { saving.value = false }
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
  } catch { ElMessage.error('保存失败，请检查版本名称和文案。') } finally { saving.value = false }
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
            <div class="variant-history"><article v-for="item in selected.variants" :key="item.id"><b>{{ item.name }}</b><small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</small><p>{{ item.content }}</p></article></div>
            <el-form label-position="top">
              <el-form-item label="新增或覆盖文案版本"><el-select v-model="variant.name" allow-create filterable placeholder="选择或输入版本名称"><el-option v-for="name in variantNameOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item>
              <el-form-item label="文案"><el-input v-model="variant.content" type="textarea" :rows="5" show-word-limit maxlength="20000" /></el-form-item>
              <div class="card-actions"><el-button type="primary" :loading="saving" @click="addVariant">保存文案版本</el-button></div>
            </el-form>
          </template>
          <el-empty v-else description="选择一张素材查看版本" />
        </aside>
      </div>
    </div>
    <el-dialog v-model="editorOpen" :title="editingId ? '编辑素材卡片' : '新建素材卡片'" width="min(720px, 92vw)">
      <el-form label-position="top">
        <div class="dialog-grid">
          <el-form-item label="经历类型"><el-select v-model="form.type" :disabled="!!editingId"><el-option v-for="(label, key) in MATERIAL_TYPE_LABELS" :key="key" :label="label" :value="key" /></el-select></el-form-item>
          <el-form-item :label="spec?.titleLabel ?? '标题'"><el-input v-model="form.title" :placeholder="spec?.titlePlaceholder ?? '输入素材标题'" /></el-form-item>
        </div>
        <!-- 字段全部来自注册表：有几行、每行放什么控件，由 spec.fields 的顺序和 kind 决定。
             这里不再出现任何按类型名的判断。 -->
        <div v-for="(row, rowIndex) in fieldRows" :key="rowIndex" :class="rowClass(row)">
          <template v-if="row[0]?.kind === 'monthRange'">
            <el-form-item label="开始时间"><el-date-picker v-model="form.startDate" type="month" value-format="YYYY-MM" format="YYYY-MM" placeholder="选择月份" /></el-form-item>
            <el-form-item label="结束时间">
              <div class="end-date-control"><el-date-picker v-model="form.endDate" type="month" value-format="YYYY-MM" format="YYYY-MM" placeholder="选择月份" :disabled="form.current" /><el-checkbox v-model="form.current">至今</el-checkbox></div>
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item v-for="field in row" :key="field.key" :label="field.label">
              <el-input :model-value="fieldValue(field)" :placeholder="field.placeholder" @update:model-value="value => setFieldValue(field, value)" />
              <p v-if="field.help" class="form-help">{{ field.help }}</p>
            </el-form-item>
          </template>
        </div>
        <el-form-item label="标签（可选）">
          <el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="输入后按回车，例如：前端、Vue、数据分析" />
          <p class="form-help">标签只用于搜索素材、匹配岗位和查找受影响的简历，不会显示在简历正文中。</p>
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item v-if="!editingId" label="版本名称"><el-select v-model="form.variantName" allow-create filterable placeholder="选择或输入版本名称"><el-option v-for="name in variantNameOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item>
        </div>
        <el-form-item v-if="!editingId" label="成果要点"><el-input v-model="form.content" type="textarea" :rows="7" placeholder="每行写一个重点；可用“架构设计：……”这样的格式，冒号前会自动加粗。" /></el-form-item>
      </el-form>
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
.card-list{display:grid;align-content:start;gap:8px}.material-card-row{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;text-align:left;border:1px solid transparent;border-radius:12px;background:transparent;padding:14px;color:inherit;cursor:pointer}.material-card-row:hover,.material-card-row.active{border-color:var(--el-color-primary-light-5);background:var(--el-color-primary-light-9)}.material-card-row__meta{grid-column:2;color:var(--el-text-color-secondary);font-size:12px}.material-card-row__type{font-size:12px;color:var(--el-color-primary)}.card-detail__heading{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:start}.card-detail__title{min-width:0}.card-detail__heading h2{margin:4px 0 2px}.card-detail__actions{display:flex;flex:none;flex-wrap:wrap;gap:8px;justify-content:flex-end}.card-detail__actions .el-button{width:64px;margin:0}.card-period{margin:0 0 16px;color:var(--el-text-color-secondary);font-size:13px}.variant-history{display:grid;gap:10px;margin-bottom:20px}.variant-history article{padding:14px;border-radius:12px;background:var(--el-fill-color-light)}.variant-history small{float:right;color:var(--el-text-color-secondary)}.variant-history p{white-space:pre-wrap;margin-bottom:0}.card-actions{display:flex;justify-content:flex-end;gap:8px}.dialog-grid{display:grid;grid-template-columns:1fr 2fr;gap:12px}
/* 单字段整行的行（技术栈这类）：原来它不在 grid 里、天然满宽，这里显式写成单列保持一致 */
.wide-grid{display:grid;grid-template-columns:1fr;gap:12px}.time-grid{grid-template-columns:1fr 1fr}.time-grid :deep(.el-date-editor){width:100%}.end-date-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;width:100%}.form-help{width:100%;margin:7px 0 0;color:var(--el-text-color-secondary);font-size:12px;line-height:1.5}.facts-note{align-self:start;display:grid;gap:4px;margin-top:30px;padding:10px 12px;border-left:3px solid var(--el-color-primary);background:var(--el-color-primary-light-9);color:var(--el-text-color-regular);font-size:12px}.facts-note b{font-size:13px;color:var(--el-text-color-primary)}
/* 单列之后就没有"和侧边栏并排"这回事了，解除锁高：回到普通文档流，页面整体滚。
   这里的高度/内边距覆盖要压过全局的 .page-rail.workbench-window——scoped 会给选择器
   加上 [data-v-x]，所以下面这个选择器比全局那条更具体，不受样式注入顺序影响。 */
@media(max-width:900px){
  .page-rail.material-library-page{height:auto;padding:20px 3px 40px}
  .page-rail.material-library-page .material-library{min-height:0}
  .material-layout{grid-template-columns:1fr;min-height:0}
  .card-list,.card-detail{overflow:visible}
  .card-detail{min-height:360px}
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
