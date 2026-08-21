<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type Variant = { id: string; name: string; content: string; createdAt: string }
type Card = { id: string; type: string; title: string; tags: string[]; facts: Record<string, unknown>; archivedAt: string | null; variants: Variant[] }
type ListResponse = { items: Card[]; total: number; page: number; pageSize: number }
const typeLabels: Record<string, string> = { PROJECT: '项目经历', INTERNSHIP: '实习经历', WORK: '工作经历', CAMPUS: '校园经历', AWARD: '荣誉奖项', RESEARCH: '科研经历', CERTIFICATE: '证书', SKILL: '专业技能', SELF_EVALUATION: '自我评价', CUSTOM_ANSWER: '自定义问答' }
const cards = ref<Card[]>([])
const selected = ref<Card | null>(null)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const search = ref('')
const type = ref('')
const tags = ref<string[]>([])
const includeArchived = ref(false)
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ type: 'PROJECT', title: '', organization: '', role: '', techStackText: '', tags: [] as string[], startDate: '', endDate: '', current: false, projectUrl: '', variantName: '简短版', content: '' })
const variant = reactive({ name: '网申版', content: '' })
const variantNameOptions = ['简短版', '网申版', '完整版']
const impact = ref<{ previewToken: string; targets: Array<{ id: string; title: string; reason: string }> } | null>(null)
const selectedTargets = ref<string[]>([])
const timedTypes = new Set(['PROJECT', 'INTERNSHIP', 'WORK', 'CAMPUS', 'AWARD', 'RESEARCH', 'CERTIFICATE'])
const detailedTypes = new Set(['PROJECT', 'INTERNSHIP', 'WORK', 'CAMPUS', 'AWARD', 'RESEARCH', 'CERTIFICATE'])
const technicalTypes = new Set(['PROJECT', 'INTERNSHIP', 'WORK'])
const supportsTime = (cardType: string) => timedTypes.has(cardType)
const supportsDetails = (cardType: string) => detailedTypes.has(cardType)
const supportsTechStack = (cardType: string) => technicalTypes.has(cardType)
const supportsProjectUrl = (cardType: string) => cardType === 'PROJECT'
const titleLabels: Record<string, string> = { PROJECT: '项目名称', INTERNSHIP: '公司名称', WORK: '公司名称', CAMPUS: '组织或活动名称', AWARD: '奖项名称', RESEARCH: '论文 / 科研项目名称', CERTIFICATE: '证书名称', SELF_EVALUATION: '标题（可选）' }
const titlePlaceholders: Record<string, string> = { PROJECT: '例如：多 Agent 前端迁移系统', INTERNSHIP: '例如：搜狐', WORK: '例如：某科技公司', CAMPUS: '例如：校学生会', AWARD: '例如：全国大学生竞赛一等奖', RESEARCH: '例如：DA-PhysDiff', CERTIFICATE: '例如：软考数据库系统工程师', SELF_EVALUATION: '可留空；素材库中显示为“自我评价”' }
const roleLabels: Record<string, string> = { PROJECT: '项目职责 / 角色', INTERNSHIP: '实习职位', WORK: '工作职位', CAMPUS: '担任角色', AWARD: '奖项等级', RESEARCH: '作者顺位 / 研究角色', CERTIFICATE: '级别 / 成绩（可选）' }
const organizationLabels: Record<string, string> = { PROJECT: '所属组织 / 公司', INTERNSHIP: '部门 / 团队（可选）', WORK: '部门 / 团队（可选）', CAMPUS: '学校 / 社团（可选）', AWARD: '关联学校 / 颁发机构（可选）', RESEARCH: '关联学校 / 实验室（可选）', CERTIFICATE: '关联学校 / 颁发机构（可选）' }
const displayCardTitle = (card: Pick<Card, 'title' | 'type'>) => card.title.trim() || typeLabels[card.type] || '未命名素材'
function cardPeriod(card: Card) {
  return [card.facts.startDate, card.facts.endDate].filter(value => typeof value === 'string' && value).join(' — ')
}
function cardMeta(card: Card) {
  return [card.facts.role, card.facts.organization, cardPeriod(card)].filter(value => typeof value === 'string' && value).join(' · ')
}

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ data: ListResponse }>('/api/v1/material-cards', { query: { search: search.value, type: type.value || undefined, tags: tags.value.join(','), includeArchived: includeArchived.value, pageSize: 100 } })
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
async function createCard() {
  const title = form.title.trim()
  if (form.type !== 'SELF_EVALUATION' && !title) {
    ElMessage.warning('请填写素材标题。')
    return
  }
  const techStack = form.techStackText.split(/[,，/]/).map(value => value.trim()).filter(Boolean)
  const facts = Object.fromEntries([
    ['organization', supportsDetails(form.type) ? form.organization.trim() : ''],
    ['role', supportsDetails(form.type) ? form.role.trim() : ''],
    ['projectUrl', supportsProjectUrl(form.type) ? form.projectUrl.trim() : ''],
    ['techStack', supportsTechStack(form.type) && techStack.length ? techStack : undefined],
    ['startDate', supportsTime(form.type) ? form.startDate : ''],
    ['endDate', supportsTime(form.type) ? (form.current ? '至今' : form.endDate) : ''],
  ].filter(([, value]) => value !== '' && value !== undefined))
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
  saving.value = true
  try {
    await $fetch(`/api/v1/material-cards/${selected.value.id}/variants`, { method: 'POST', body: variant })
    Object.assign(variant, { name: '网申版', content: '' })
    await load()
    ElMessage.success('新文案版本已保存。')
  } catch { ElMessage.error('保存失败；版本名称不能重复。') } finally { saving.value = false }
}
async function archive() {
  if (!selected.value) return
  await ElMessageBox.confirm('归档后不再进入新文档候选，历史引用仍可读取。', '确认归档')
  await $fetch(`/api/v1/material-cards/${selected.value.id}/archive`, { method: 'POST' })
  selected.value = null
  await load()
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
async function previewImpact() {
  if (!selected.value) return
  const response = await $fetch<{ data: NonNullable<typeof impact.value> }>(`/api/v1/material-cards/${selected.value.id}/impact-preview`, { method: 'POST', body: { mode: 'SYNC', targetTags: selected.value.tags } })
  impact.value = response.data
  selectedTargets.value = []
}
async function confirmSync() {
  if (!selected.value || !impact.value || !selectedTargets.value.length) return
  const response = await $fetch<{ data: { results: Array<{ status: string }> } }>(`/api/v1/material-cards/${selected.value.id}/sync`, { method: 'POST', body: { previewToken: impact.value.previewToken, idempotencyKey: crypto.randomUUID(), targetIds: selectedTargets.value } })
  ElMessage.success(`同步完成：${response.data.results.filter(item => item.status === 'created').length} 个新版本`)
  impact.value = null
}
watch([search, type, tags, includeArchived], () => void load(), { deep: true })
onMounted(() => void load())
</script>

<template>
  <section class="page-rail material-page">
    <div class="material-surface material-library">
      <header class="material-surface__header">
        <div><span class="application-board__eyebrow">MATERIAL LIBRARY</span><h1>可复用素材库</h1><p>事实只维护一份，文案按版本固定引用。</p></div>
        <el-button type="primary" @click="beginCreate">＋ 新建素材</el-button>
      </header>
      <div class="material-toolbar">
        <el-input v-model="search" clearable placeholder="搜索标题或文案" />
        <el-select v-model="type" clearable placeholder="全部类型"><el-option v-for="(label, key) in typeLabels" :key="key" :label="label" :value="key" /></el-select>
        <el-select v-model="tags" multiple filterable allow-create placeholder="标签全部匹配" />
        <el-checkbox v-model="includeArchived">显示已归档</el-checkbox>
      </div>
      <div v-loading="loading" class="material-layout">
        <div class="card-list" role="list" aria-label="素材卡片">
          <button v-for="card in cards" :key="card.id" class="material-card-row" :class="{ active: selected?.id === card.id }" type="button" @click="selected = card">
            <span class="material-card-row__type">{{ typeLabels[card.type] }}</span><strong>{{ displayCardTitle(card) }}</strong><el-tag v-if="card.archivedAt" type="info">已归档</el-tag>
            <span class="material-card-row__meta">{{ [cardMeta(card), card.tags.join(' · ')].filter(Boolean).join(' · ') || '未填写补充信息' }}</span>
          </button>
          <el-empty v-if="!loading && !cards.length" description="没有符合条件的素材" />
        </div>
        <aside class="card-detail" aria-live="polite">
          <template v-if="selected">
            <div class="card-detail__heading"><div><span>{{ typeLabels[selected.type] }}</span><h2>{{ displayCardTitle(selected) }}</h2><p v-if="cardMeta(selected)" class="card-period">{{ cardMeta(selected) }}</p></div><el-button v-if="!selected.archivedAt" plain type="primary" @click="beginEdit(selected)">编辑</el-button><el-button v-if="!selected.archivedAt" plain type="danger" @click="archive">归档</el-button><el-button plain type="danger" :loading="deleting" @click="removeCard">删除</el-button></div>
            <div class="variant-history"><article v-for="item in selected.variants" :key="item.id"><b>{{ item.name }}</b><small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</small><p>{{ item.content }}</p></article></div>
            <el-form v-if="!selected.archivedAt" label-position="top">
              <el-form-item label="新增文案版本"><el-select v-model="variant.name" allow-create filterable placeholder="选择或输入版本名称"><el-option v-for="name in variantNameOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item>
              <el-form-item label="文案"><el-input v-model="variant.content" type="textarea" :rows="5" show-word-limit maxlength="20000" /></el-form-item>
              <div class="card-actions"><el-button :loading="saving" @click="addVariant">保存新版本</el-button><el-button type="primary" plain @click="previewImpact">查看影响</el-button></div>
            </el-form>
          </template>
          <el-empty v-else description="选择一张素材查看版本" />
        </aside>
      </div>
    </div>
    <el-dialog v-model="editorOpen" :title="editingId ? '编辑素材卡片' : '新建素材卡片'" width="min(720px, 92vw)">
      <el-form label-position="top">
        <div class="dialog-grid">
          <el-form-item label="经历类型"><el-select v-model="form.type" :disabled="!!editingId"><el-option v-for="(label, key) in typeLabels" :key="key" :label="label" :value="key" /></el-select></el-form-item>
          <el-form-item :label="titleLabels[form.type] || '标题'"><el-input v-model="form.title" :placeholder="titlePlaceholders[form.type] || '输入素材标题'" /></el-form-item>
        </div>
        <div v-if="supportsDetails(form.type)" class="dialog-grid detail-grid">
          <el-form-item :label="roleLabels[form.type]"><el-input v-model="form.role" placeholder="显示在卡片标题右侧" /></el-form-item>
          <el-form-item :label="organizationLabels[form.type]"><el-input v-model="form.organization" /></el-form-item>
        </div>
        <div v-if="supportsProjectUrl(form.type)" class="dialog-grid detail-grid"><el-form-item label="项目链接"><el-input v-model="form.projectUrl" placeholder="https://github.com/... 或项目主页（可选）" /></el-form-item></div>
          <div v-if="supportsTime(form.type)" class="dialog-grid time-grid">
          <el-form-item label="开始时间"><el-date-picker v-model="form.startDate" type="month" value-format="YYYY-MM" format="YYYY-MM" placeholder="选择月份" /></el-form-item>
          <el-form-item label="结束时间">
            <div class="end-date-control"><el-date-picker v-model="form.endDate" type="month" value-format="YYYY-MM" format="YYYY-MM" placeholder="选择月份" :disabled="form.current" /><el-checkbox v-model="form.current">至今</el-checkbox></div>
          </el-form-item>
        </div>
        <el-form-item v-if="supportsTechStack(form.type)" label="技术栈">
          <el-input v-model="form.techStackText" placeholder="例如：Claude API / TypeScript / Vue 3 / LangChain" />
          <p class="form-help">使用斜杠、中文逗号或英文逗号分隔；技术栈会直接显示在简历卡片中。</p>
        </el-form-item>
        <el-form-item label="标签（可选）">
          <el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="输入后按回车，例如：前端、Vue、数据分析" />
          <p class="form-help">标签只用于搜索素材、匹配岗位和查找受影响的简历，不会显示在简历正文中。</p>
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item v-if="!editingId" label="版本名称"><el-select v-model="form.variantName" allow-create filterable placeholder="选择或输入版本名称"><el-option v-for="name in variantNameOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item>
          <div v-if="!editingId" class="facts-note"><b>结构化信息由系统保存</b><span>角色、组织、时间和技术栈会跟随卡片进入简历或网申版本，不需要填写 JSON。</span></div>
        </div>
        <el-form-item v-if="!editingId" label="成果要点"><el-input v-model="form.content" type="textarea" :rows="7" placeholder="每行写一个重点；可用“架构设计：……”这样的格式，冒号前会自动加粗。" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editorOpen = false">取消</el-button><el-button text type="primary" :loading="saving" @click="createCard">{{ editingId ? '保存' : '创建' }}</el-button></template>
    </el-dialog>
    <el-dialog :model-value="Boolean(impact)" title="影响预览" width="min(680px, 92vw)" @close="impact = null">
      <p>预览不会修改任何文档。请选择要创建新版本的目标：</p>
      <el-checkbox-group v-if="impact?.targets.length" v-model="selectedTargets" class="impact-targets"><el-checkbox v-for="target in impact.targets" :key="target.id" :value="target.id"><b>{{ target.title }}</b> · {{ target.reason === 'DIRECT_REFERENCE' ? '正在引用' : '标签匹配' }}</el-checkbox></el-checkbox-group>
      <el-empty v-else description="当前没有受影响文档" />
      <template #footer><el-button @click="impact = null">取消</el-button><el-button type="primary" :disabled="!selectedTargets.length" @click="confirmSync">确认并创建新版本</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.material-library{padding:24px}.material-surface__header h1{margin:4px 0 6px}.material-toolbar{display:grid;grid-template-columns:2fr 1fr 1.4fr auto;gap:12px;align-items:center;margin:20px 0}.material-layout{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(360px,1.4fr);gap:18px;min-height:520px}.card-list,.card-detail{border:1px solid var(--el-border-color-lighter);border-radius:16px;background:var(--el-bg-color);padding:12px}.card-list{display:flex;flex-direction:column;gap:8px}.material-card-row{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;text-align:left;border:1px solid transparent;border-radius:12px;background:transparent;padding:14px;color:inherit;cursor:pointer}.material-card-row:hover,.material-card-row.active{border-color:var(--el-color-primary-light-5);background:var(--el-color-primary-light-9)}.material-card-row__meta{grid-column:2;color:var(--el-text-color-secondary);font-size:12px}.material-card-row__type{font-size:12px;color:var(--el-color-primary)}.card-detail__heading{display:flex;justify-content:space-between;align-items:start}.card-detail__heading h2{margin:4px 0 2px}.card-period{margin:0 0 16px;color:var(--el-text-color-secondary);font-size:13px}.variant-history{display:grid;gap:10px;max-height:290px;overflow:auto;margin-bottom:20px}.variant-history article{padding:14px;border-radius:12px;background:var(--el-fill-color-light)}.variant-history small{float:right;color:var(--el-text-color-secondary)}.variant-history p{white-space:pre-wrap;margin-bottom:0}.card-actions{display:flex;justify-content:flex-end;gap:8px}.dialog-grid{display:grid;grid-template-columns:1fr 2fr;gap:12px}.time-grid{grid-template-columns:1fr 1fr}.time-grid :deep(.el-date-editor){width:100%}.end-date-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;width:100%}.form-help{width:100%;margin:7px 0 0;color:var(--el-text-color-secondary);font-size:12px;line-height:1.5}.facts-note{align-self:start;display:grid;gap:4px;margin-top:30px;padding:10px 12px;border-left:3px solid var(--el-color-primary);background:var(--el-color-primary-light-9);color:var(--el-text-color-regular);font-size:12px}.facts-note b{font-size:13px;color:var(--el-text-color-primary)}.impact-targets{display:grid;gap:12px}.impact-targets :deep(.el-checkbox){height:auto;white-space:normal}
@media(max-width:900px){.material-toolbar{grid-template-columns:1fr 1fr}.material-layout{grid-template-columns:1fr}.card-detail{min-height:360px}}
@media(max-width:560px){.material-library{padding:16px}.material-toolbar,.dialog-grid{grid-template-columns:1fr}.material-surface__header{align-items:flex-start;gap:12px}.material-card-row{grid-template-columns:auto 1fr}}
</style>
