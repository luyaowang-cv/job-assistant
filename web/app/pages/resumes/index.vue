<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type Variant = { id: string; name: string; content: string }
type Card = { id: string; type: string; title: string; tags: string[]; facts: Record<string, unknown>; variants: Variant[] }
type Version = { id: string; type: 'BASE' | 'TARGETED'; content: string; createdAt: string }
type Resume = { id: string; name: string; versions: Version[] }
type Application = { id: string; job: { title: string; description?: string | null; company: { name: string } } }
type Profile = { photoMimeType?: string | null; photoUpdatedAt?: string | null }
type Suggestion = { suggestionId: string; cardId: string; sourceVariantId: string; sourceContent: string; content: string; evidence: string[]; warnings: string[] }
type DraftRef = { cardId: string; variantId: string; section: string; fieldKey: null; sortOrder: number; visible: boolean; renderRules: { compact: boolean; hideTechnicalDetails: boolean } }
const resume = ref<Resume | null>(null)
const cards = ref<Card[]>([])
const refs = ref<DraftRef[]>([])
const selectedIndex = ref<number | null>(null)
const loading = ref(false)
const saving = ref(false)
const deletingVersionId = ref<string | null>(null)
const previewing = ref(false)
const previewHtml = ref('')
const applications = ref<Application[]>([])
const profile = ref<Profile | null>(null)
const applicationId = ref('')
const aiLoading = ref(false)
const aiDialog = ref(false)
const aiPreviewToken = ref('')
const suggestions = ref<Suggestion[]>([])
const selectedSuggestionIds = ref<string[]>([])
const search = ref('')
const baseName = ref('我的组合简历')
const baseContent = ref('组合简历初始化')
const fieldVisibility = reactive<Record<string, boolean>>({ fullName: true, phone: true, email: true, birthDate: true, gender: true, politicalStatus: true, educations: true })
const fieldLabels: Record<string, string> = { fullName: '姓名', phone: '电话', email: '邮箱', birthDate: '出生日期', gender: '性别', politicalStatus: '政治面貌', educations: '教育信息' }
const cardTypeLabels: Record<string, string> = { PROJECT: '项目经历', INTERNSHIP: '实习经历', WORK: '工作经历', CAMPUS: '校园经历', AWARD: '荣誉奖项', SKILL: '专业技能', SELF_EVALUATION: '自我评价', CUSTOM_ANSWER: '自定义问答' }
const filteredCards = computed(() => cards.value.filter(card => !search.value || card.title.toLowerCase().includes(search.value.toLowerCase()) || card.tags.some(tag => tag.includes(search.value))))
const selectedRef = computed(() => selectedIndex.value == null ? null : refs.value[selectedIndex.value])
const cardById = computed(() => new Map(cards.value.map(card => [card.id, card])))
const selectedCard = computed(() => selectedRef.value ? cardById.value.get(selectedRef.value.cardId) : undefined)
function cardSummary(card: Card) {
  const period = [card.facts.startDate, card.facts.endDate].filter(value => typeof value === 'string' && value).join(' — ')
  return [cardTypeLabels[card.type] ?? card.type, card.facts.role, card.facts.organization, period].filter(value => typeof value === 'string' && value).join(' · ')
}

async function load() {
  loading.value = true
  try {
    const [resumeResponse, materialResponse, applicationResponse, profileResponse] = await Promise.all([
      $fetch<{ data: Resume | null }>('/api/v1/resumes'),
      $fetch<{ data: { items: Card[] } }>('/api/v1/material-cards', { query: { pageSize: 100 } }),
      $fetch<{ data: { items: Application[] } }>('/api/v1/applications', { query: { pageSize: 100 } }),
      $fetch<{ data: Profile | null }>('/api/v1/personal-profile'),
    ])
    resume.value = resumeResponse.data
    cards.value = materialResponse.data.items
    applications.value = applicationResponse.data.items.filter(item => item.job.description?.trim())
    profile.value = profileResponse.data
    if (resume.value) baseName.value = resume.value.name
  } catch { ElMessage.error('简历工作区读取失败。') } finally { loading.value = false }
}
async function initializeResume() {
  if (!baseName.value.trim()) return
  await $fetch('/api/v1/resumes/base', { method: 'POST', body: { name: baseName.value, content: baseContent.value } })
  await load()
}
function addCard(card: Card) {
  if (refs.value.some(item => item.cardId === card.id)) return ElMessage.info('当前编排已包含该素材。')
  const variant = card.variants[0]
  if (!variant) return ElMessage.warning('该素材没有可用文案。')
  refs.value.push({ cardId: card.id, variantId: variant.id, section: card.type.toLowerCase(), fieldKey: null, sortOrder: refs.value.length, visible: true, renderRules: { compact: false, hideTechnicalDetails: false } })
  selectedIndex.value = refs.value.length - 1
  void refreshPreview()
}
function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= refs.value.length) return
  const copy = [...refs.value]
  const [item] = copy.splice(index, 1)
  if (!item) return
  copy.splice(target, 0, item)
  refs.value = copy.map((value, sortOrder) => ({ ...value, sortOrder }))
  selectedIndex.value = target
  void refreshPreview()
}
function remove(index: number) {
  refs.value = refs.value.filter((_, current) => current !== index).map((value, sortOrder) => ({ ...value, sortOrder }))
  selectedIndex.value = refs.value.length ? Math.min(index, refs.value.length - 1) : null
  void refreshPreview()
}
function dropOn(index: number, event: DragEvent) {
  const source = Number(event.dataTransfer?.getData('text/plain'))
  if (Number.isInteger(source)) move(source, index - source)
}
async function save() {
  if (!resume.value) return
  saving.value = true
  try {
    await $fetch(`/api/v1/resumes/${resume.value.id}/composed-versions`, { method: 'POST', body: { name: baseName.value, composition: { fieldVisibility, config: { templateId: 'A4_DENSE_V1' }, references: refs.value } } })
    await load()
    ElMessage.success('已创建新的不可变简历版本。')
  } catch { ElMessage.error('保存失败，请检查素材引用。') } finally { saving.value = false }
}
async function refreshPreview() {
  if (!resume.value) return
  previewing.value = true
  try {
    const response = await $fetch<{ data: { html: string } }>(`/api/v1/resumes/${resume.value.id}/a4-preview`, { method: 'POST', body: { fieldVisibility, config: { templateId: 'A4_DENSE_V1' }, references: refs.value } })
    previewHtml.value = response.data.html
  } catch { previewHtml.value = '' } finally { previewing.value = false }
}
async function uploadPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const form = new FormData(); form.append('photo', file)
  try { await $fetch('/api/v1/personal-profile/photo', { method: 'PUT', body: form }); ElMessage.success('证件照已更新。'); await load(); await refreshPreview() }
  catch { ElMessage.error('照片上传失败，仅支持 5 MiB 内的 JPEG、PNG 或 WebP。') }
  finally { input.value = '' }
}
async function previewSuggestions() {
  if (!resume.value || !applicationId.value || !refs.value.length) return ElMessage.warning('请先选择岗位并加入素材。')
  aiLoading.value = true
  try {
    const response = await $fetch<{ data: { suggestions: Suggestion[]; previewToken: string } }>(`/api/v1/resumes/${resume.value.id}/variant-suggestions/preview`, { method: 'POST', body: { applicationId: applicationId.value, references: refs.value.map(item => ({ cardId: item.cardId, variantId: item.variantId })) } })
    suggestions.value = response.data.suggestions; aiPreviewToken.value = response.data.previewToken
    selectedSuggestionIds.value = suggestions.value.filter(item => item.content !== item.sourceContent).map(item => item.suggestionId); aiDialog.value = true
  } catch { ElMessage.error('岗位适配文案生成失败，请检查 JD。') } finally { aiLoading.value = false }
}
async function confirmSuggestions() {
  if (!resume.value || !selectedSuggestionIds.value.length) return
  aiLoading.value = true
  try {
    const response = await $fetch<{ data: { results: Array<{ cardId: string; variantId: string }> } }>(`/api/v1/resumes/${resume.value.id}/variant-suggestions/confirm`, { method: 'POST', body: { previewToken: aiPreviewToken.value, selectedSuggestionIds: selectedSuggestionIds.value, idempotencyKey: crypto.randomUUID() } })
    for (const result of response.data.results) { const ref = refs.value.find(item => item.cardId === result.cardId); if (ref) ref.variantId = result.variantId }
    aiDialog.value = false; await load(); await refreshPreview(); ElMessage.success('已创建岗位适配文案版本；保存简历后才会形成新简历版本。')
  } catch { ElMessage.error('确认失败，预览可能已过期。') } finally { aiLoading.value = false }
}
async function removeVersion(version: Version) {
  if (!resume.value) return
  await ElMessageBox.confirm('删除后该定制版本及其组合文档将不可恢复。确认删除？', '确认删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
  deletingVersionId.value = version.id
  try {
    await $fetch(`/api/v1/resumes/${resume.value.id}/versions/${version.id}`, { method: 'DELETE' })
    await load()
    ElMessage.success('简历版本已删除。')
  }
  catch { ElMessage.error('删除失败，请重试。') }
  finally { deletingVersionId.value = null }
}
function exportUrl(versionId: string) {
  return resume.value ? `/api/v1/resumes/${resume.value.id}/versions/${versionId}/exports/pdf` : '#'
}
onMounted(async () => { await load(); await refreshPreview() })
watch(refs, () => void refreshPreview(), { deep: true })
watch(fieldVisibility, () => void refreshPreview(), { deep: true })
</script>

<template>
  <section v-loading="loading" class="page-rail material-page">
    <div v-if="!resume" class="material-surface resume-onboarding">
      <span class="application-board__eyebrow">COMPOSED RESUME</span><h1>创建简历工作区</h1><p>初始化只建立简历身份；之后每次编排都创建不可变版本。</p>
      <el-form label-position="top"><el-form-item label="简历名称"><el-input v-model="baseName" /></el-form-item><el-form-item label="兼容初始快照"><el-input v-model="baseContent" type="textarea" :rows="4" /></el-form-item><el-button type="primary" @click="initializeResume">创建工作区</el-button></el-form>
    </div>
    <template v-else>
      <header class="resume-header"><div><span class="application-board__eyebrow">A4 RESUME · DENSE V1</span><h1>{{ baseName }}</h1><p>从素材卡组合简历；A4 预览与 PDF 使用同一版式。</p></div><div class="header-actions"><label class="photo-button"><input type="file" accept="image/jpeg,image/png,image/webp" @change="uploadPhoto">{{ profile?.photoMimeType ? '更换证件照' : '上传证件照' }}</label><el-button type="primary" :loading="saving" @click="save">保存新版本</el-button></div></header>
      <div class="resume-composer">
        <aside class="composer-panel material-palette"><h2>素材库</h2><el-input v-model="search" clearable placeholder="搜索标题或标签" />
          <button v-for="card in filteredCards" :key="card.id" type="button" class="palette-card" @click="addCard(card)"><strong>{{ card.title }}</strong><span>{{ cardSummary(card) }}</span><small>＋ 加入编排</small></button>
          <el-empty v-if="!filteredCards.length" description="暂无素材" />
        </aside>
        <main class="composer-panel canvas"><div class="canvas-heading"><h2>A4 实时预览</h2><span>{{ refs.length }} 张卡片 · 最多 3 页</span></div>
          <div v-loading="previewing" class="a4-stage"><iframe v-if="previewHtml" title="A4 简历预览" :srcdoc="previewHtml" /><el-empty v-else description="从左侧选择素材；个人信息来自个人档案" /></div>
          <div class="order-list"><article v-for="(item, index) in refs" :key="`${item.cardId}-${index}`" class="order-card" :class="{ selected: selectedIndex === index }" draggable="true" tabindex="0" @dragstart="event => event.dataTransfer?.setData('text/plain', String(index))" @dragover.prevent @drop="dropOn(index, $event)" @click="selectedIndex = index" @keydown.up.prevent="move(index, -1)" @keydown.down.prevent="move(index, 1)"><span>{{ index + 1 }}. {{ cardById.get(item.cardId)?.title }}</span><div><el-button text @click.stop="move(index, -1)">↑</el-button><el-button text @click.stop="move(index, 1)">↓</el-button><el-button text type="danger" @click.stop="remove(index)">×</el-button></div></article></div>
        </main>
        <aside class="composer-panel inspector"><h2>岗位适配</h2><el-select v-model="applicationId" clearable placeholder="选择含 JD 的岗位"><el-option v-for="item in applications" :key="item.id" :label="`${item.job.company.name} · ${item.job.title}`" :value="item.id" /></el-select><el-button class="ai-button" :loading="aiLoading" :disabled="!applicationId || !refs.length" @click="previewSuggestions">生成候选文案</el-button><el-alert title="本地仅重排原文语句，不外发数据、不编造事实。确认后才创建新文案版本。" type="info" :closable="false" />
          <h2 class="inspector-title">基础字段</h2><div class="base-visibility"><el-checkbox v-for="(label, key) in fieldLabels" :key="key" v-model="fieldVisibility[key]">{{ label }}</el-checkbox></div><h2 class="inspector-title">卡片配置</h2><template v-if="selectedRef && selectedCard">
          <el-form label-position="top"><el-form-item label="文案版本"><el-select v-model="selectedRef.variantId"><el-option v-for="item in selectedCard.variants" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="区块"><el-input v-model="selectedRef.section" /></el-form-item><el-checkbox v-model="selectedRef.visible">在此版本展示</el-checkbox><el-checkbox v-model="selectedRef.renderRules.compact">精简显示</el-checkbox><el-checkbox v-model="selectedRef.renderRules.hideTechnicalDetails">隐藏技术细节</el-checkbox></el-form>
          <el-alert class="mt-4" type="info" :closable="false" title="规则不会改写素材正文" />
        </template><el-empty v-else description="选择画布中的卡片" /></aside>
      </div>
      <section class="material-surface version-history"><h2>版本历史</h2><el-table :data="resume.versions"><el-table-column prop="type" label="类型" width="110" /><el-table-column label="创建时间"><template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template></el-table-column><el-table-column label="快照"><template #default="{ row }"><span class="snapshot">{{ row.content }}</span></template></el-table-column><el-table-column label="操作" width="200"><template #default="{ row }"><el-link :href="exportUrl(row.id)" target="_blank">导出 PDF</el-link><el-button v-if="row.type === 'TARGETED'" text type="danger" :loading="deletingVersionId === row.id" @click="removeVersion(row)">删除</el-button></template></el-table-column></el-table></section>
      <el-dialog v-model="aiDialog" title="确认岗位适配文案" width="min(920px, 92vw)"><p class="dialog-note">仅勾选你确认的候选；原文不会被覆盖。</p><el-checkbox-group v-model="selectedSuggestionIds"><article v-for="item in suggestions" :key="item.suggestionId" class="suggestion"><el-checkbox :value="item.suggestionId">{{ cardById.get(item.cardId)?.title }}</el-checkbox><div class="diff"><div><strong>原文</strong><p>{{ item.sourceContent }}</p></div><div><strong>候选</strong><p>{{ item.content }}</p></div></div><el-alert v-for="warning in item.warnings" :key="warning" :title="warning" type="warning" :closable="false" /></article></el-checkbox-group><template #footer><el-button @click="aiDialog = false">取消</el-button><el-button type="primary" :loading="aiLoading" :disabled="!selectedSuggestionIds.length" @click="confirmSuggestions">确认创建文案版本</el-button></template></el-dialog>
    </template>
  </section>
</template>

<style scoped>
.resume-onboarding{max-width:680px;margin:auto;padding:28px}.resume-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.resume-header h1{margin:4px 0}.header-actions{display:flex;gap:10px;align-items:center}.photo-button{cursor:pointer;padding:8px 14px;border:1px solid #b9c7da;border-radius:8px;color:#2458b8;background:#fff}.photo-button input{display:none}.resume-composer{display:grid;grid-template-columns:minmax(210px,.65fr) minmax(540px,1.8fr) minmax(250px,.75fr);gap:14px;align-items:start}.composer-panel{min-width:0;border:1px solid var(--el-border-color-lighter);border-radius:16px;background:var(--el-bg-color);padding:16px}.composer-panel h2{font-size:16px;margin:0 0 14px}.material-palette{display:flex;flex-direction:column;gap:9px;max-height:900px;overflow:auto}.palette-card{display:grid;gap:4px;text-align:left;padding:12px;border:1px solid var(--el-border-color-lighter);border-radius:12px;background:transparent;color:inherit;cursor:pointer}.palette-card:hover{border-color:var(--el-color-primary-light-5);background:var(--el-color-primary-light-9)}.palette-card span,.palette-card small{font-size:12px;color:var(--el-text-color-secondary)}.canvas{min-height:700px;background:#f1f4f8}.canvas-heading{display:flex;justify-content:space-between}.a4-stage{min-height:700px;overflow:auto;border-radius:12px;background:#dfe5ed}.a4-stage iframe{display:block;width:100%;height:760px;border:0}.order-list{display:grid;gap:6px;margin-top:12px}.order-card{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;border:1px solid #d9e0ea;border-radius:8px;background:#fff;font-size:12px;cursor:grab}.order-card.selected{border-color:#2458b8}.base-visibility{padding:10px;background:var(--el-fill-color-light);border-radius:10px}.inspector :deep(.el-checkbox){display:block;margin:7px 0}.ai-button{width:100%;margin:10px 0}.inspector-title{margin-top:20px!important}.version-history{margin-top:18px;padding:20px}.snapshot{display:block;max-width:520px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dialog-note{color:var(--el-text-color-secondary)}.suggestion{padding:14px 0;border-bottom:1px solid var(--el-border-color-lighter)}.diff{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}.diff>div{padding:10px;border-radius:8px;background:var(--el-fill-color-light)}.diff p{white-space:pre-wrap;font-size:13px;line-height:1.55;margin:6px 0}
@media(max-width:1100px){.resume-composer{grid-template-columns:260px 1fr}.inspector{grid-column:1/-1}}
@media(max-width:760px){.resume-header{align-items:flex-start;gap:12px;flex-direction:column}.header-actions{width:100%;flex-wrap:wrap}.resume-composer{grid-template-columns:1fr}.inspector{grid-column:auto}.canvas{min-height:420px}.a4-stage iframe{height:600px}.diff{grid-template-columns:1fr}}
</style>
