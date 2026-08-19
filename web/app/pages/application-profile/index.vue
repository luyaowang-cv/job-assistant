<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type Strategy = { targetLocations: string[]; expectedSalary: string; availableDate: string; recruitmentSource: string; referralCode: string }
type Profile = { id: string; name: string; targetTags: string[]; strategy: Strategy; resumeVersionId: string | null; currentVersionId: string | null; workExperiences: unknown[]; projects: unknown[]; skills: unknown[]; campusExperiences: unknown[]; awards: unknown[]; certificates: unknown[]; languages: unknown[] }
type Variant = { id: string; name: string; content: string }
type Card = { id: string; title: string; type: string; tags: string[]; facts: Record<string, unknown>; variants: Variant[] }
type Field = { key: string; label: string; text: string; limit: number | null }
type Block = { key: string; title: string; fields: Field[] }
type Version = { id: string; createdAt: string; blocks: Block[]; composition: { references: Array<{ cardId: string; variantId: string; fieldKey: string | null }> } }
type Candidate = { sourceKey: string; type: string; title: string; imported: boolean; variant: { content: string } }
const profiles = ref<Profile[]>([])
const cards = ref<Card[]>([])
const versions = ref<Version[]>([])
const selectedId = ref<string>()
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const profile = reactive({ name: '', targetTags: [] as string[], strategy: { targetLocations: [] as string[], expectedSalary: '', availableDate: '', recruitmentSource: '', referralCode: '' }, resumeVersionId: null as string | null })
const blocks = ref<Block[]>([
  { key: 'self', title: '自我评价', fields: [{ key: 'selfEvaluation', label: '自我评价', text: '', limit: 500 }] },
  { key: 'projects', title: '项目经历', fields: [{ key: 'project1', label: '项目经历 1', text: '', limit: 2000 }] },
  { key: 'campus', title: '校园经历', fields: [{ key: 'campus1', label: '校园经历 1', text: '', limit: 1000 }] },
  { key: 'extra', title: '附加问答', fields: [{ key: 'question1', label: '开放问题', text: '', limit: 500 }] },
])
const fieldRefs = reactive<Record<string, { cardId: string; variantId: string }>>({})
const migrationOpen = ref(false)
const candidates = ref<Candidate[]>([])
const selectedSources = ref<string[]>([])
const legacyCount = computed(() => {
  const item = profiles.value.find(value => value.id === selectedId.value)
  return item ? item.workExperiences.length + item.projects.length + item.skills.length + item.campusExperiences.length + item.awards.length + item.certificates.length + item.languages.length : 0
})
const selectedCard = (fieldKey: string) => cards.value.find(card => card.id === fieldRefs[fieldKey]?.cardId)
const typeLabels: Record<string, string> = { PROJECT: '项目经历', INTERNSHIP: '实习经历', WORK: '工作经历', CAMPUS: '校园经历', AWARD: '荣誉奖项', SKILL: '专业技能', SELF_EVALUATION: '自我评价', CUSTOM_ANSWER: '自定义问答' }
function cardPeriod(card: Card) {
  return [card.facts.startDate, card.facts.endDate].filter(value => typeof value === 'string' && value).join(' — ')
}
function cardMeta(card: Card) {
  return [card.facts.role, card.facts.organization, cardPeriod(card)].filter(value => typeof value === 'string' && value).join(' · ')
}
function cardTechStack(card: Card) {
  const stack = card.facts.techStack
  return Array.isArray(stack) ? stack.filter(value => typeof value === 'string').join(' · ') : ''
}
function selectedVariant(fieldKey: string) {
  const card = selectedCard(fieldKey)
  return card?.variants.find(item => item.id === fieldRefs[fieldKey]?.variantId)
}

function addField(block: Block) {
  const key = `${block.key}${block.fields.length + 1}-${Date.now()}`
  block.fields.push({ key, label: '新字段', text: '', limit: 500 })
}
async function addBlock() {
  try {
    const { value } = await ElMessageBox.prompt('输入模块名称，例如：实习经历', '新增模块', {
      confirmButtonText: '添加',
      cancelButtonText: '取消',
      inputValue: '实习经历',
      inputPlaceholder: '实习经历',
    })
    const title = (value ?? '').trim() || `自定义模块 ${blocks.value.length + 1}`
    const stamp = Date.now()
    blocks.value.push({
      key: `block-${stamp}`,
      title,
      fields: [{ key: `field-${stamp}`, label: title, text: '', limit: 500 }],
    })
  }
  catch { /* user cancelled */ }
}
function emptyProfile() {
  return { name: '', targetTags: [], strategy: { targetLocations: [], expectedSalary: '', availableDate: '', recruitmentSource: '', referralCode: '' }, resumeVersionId: null }
}
function setProfile(item?: Profile) {
  selectedId.value = item?.id
  Object.assign(profile, emptyProfile(), item ? { name: item.name, targetTags: [...item.targetTags], strategy: { ...emptyProfile().strategy, ...item.strategy }, resumeVersionId: item.resumeVersionId } : {})
  if (item) void loadVersions(item.id)
  else versions.value = []
}
async function load() {
  loading.value = true
  try {
    const [profileResponse, materialResponse] = await Promise.all([
      $fetch<{ data: Profile[] }>('/api/v1/application-profiles'),
      $fetch<{ data: { items: Card[] } }>('/api/v1/material-cards', { query: { pageSize: 100 } }),
    ])
    profiles.value = profileResponse.data
    cards.value = materialResponse.data.items
    setProfile(profiles.value.find(item => item.id === selectedId.value) ?? profiles.value[0])
  } catch { ElMessage.error('网申档案读取失败。') } finally { loading.value = false }
}
async function removeProfile() {
  if (!selectedId.value) return
  await ElMessageBox.confirm('删除后该档案及其所有版本将从工作台移除，且不可恢复。确认删除？', '确认删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  })
  deleting.value = true
  try {
    await $fetch(`/api/v1/application-profiles/${selectedId.value}`, { method: 'DELETE' })
    setProfile()
    await load()
    ElMessage.success('网申档案已删除。')
  }
  catch { ElMessage.error('删除失败，请重试。') }
  finally { deleting.value = false }
}
async function loadVersions(id: string) {
  const response = await $fetch<{ data: Version[] }>(`/api/v1/application-profiles/${id}/versions`)
  versions.value = response.data
  const latest = versions.value[0]
  if (!latest) return
  blocks.value = latest.blocks
  Object.keys(fieldRefs).forEach(key => Reflect.deleteProperty(fieldRefs, key))
  for (const reference of latest.composition?.references ?? []) {
    if (reference.fieldKey) fieldRefs[reference.fieldKey] = { cardId: reference.cardId, variantId: reference.variantId }
  }
}
async function saveProfile() {
  if (!profile.name.trim()) return ElMessage.warning('请填写档案名称。')
  saving.value = true
  try {
    const response = await $fetch<{ data: Profile }>(selectedId.value ? `/api/v1/application-profiles/${selectedId.value}` : '/api/v1/application-profiles', {
      method: selectedId.value ? 'PUT' : 'POST', body: profile,
    })
    selectedId.value = response.data.id
    await load()
    ElMessage.success('档案身份与策略已保存。')
  } catch { ElMessage.error('档案保存失败。') } finally { saving.value = false }
}
function chooseCard(field: Field, cardId: string) {
  const card = cards.value.find(item => item.id === cardId)
  if (!card?.variants[0]) { Reflect.deleteProperty(fieldRefs, field.key); return }
  fieldRefs[field.key] = { cardId, variantId: card.variants[0].id }
}
function setVariant(fieldKey: string, variantId: string) {
  const reference = fieldRefs[fieldKey]
  if (reference) reference.variantId = variantId
}
async function saveVersion() {
  if (!selectedId.value) return ElMessage.warning('请先保存档案。')
  const references = blocks.value.flatMap(block => block.fields.flatMap((field, index) => {
    const reference = fieldRefs[field.key]
    return reference ? [{ ...reference, section: block.key, fieldKey: field.key, sortOrder: index, visible: true, renderRules: { compact: false, hideTechnicalDetails: false } }] : []
  }))
  saving.value = true
  try {
    const endpoint: string = `/api/v1/application-profiles/${selectedId.value}/versions`
    await $fetch(endpoint, { method: 'POST', body: { blocks: blocks.value, composition: { fieldVisibility: {}, config: { editor: 'structured-form' }, references } } })
    await loadVersions(selectedId.value)
    ElMessage.success('已创建新的网申档案版本。')
  } catch { ElMessage.error('版本保存失败，请检查素材引用。') } finally { saving.value = false }
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
onMounted(() => void load())
</script>

<template>
  <section v-loading="loading" class="page-rail material-page application-editor">
    <header class="application-editor__header"><div><span class="application-board__eyebrow">APPLICATION PROFILE</span><h1>结构化网申档案</h1><p>基础事实来自个人档案；这里仅保存策略、素材引用和不可变版本。</p></div><div><el-button @click="setProfile()">＋ 新建档案</el-button><el-button type="primary" :loading="saving" @click="saveProfile">保存档案策略</el-button><el-button type="danger" plain :disabled="!selectedId" :loading="deleting" @click="removeProfile">删除档案</el-button></div></header>
    <div class="application-editor__layout">
      <aside class="material-surface profile-sidebar">
        <h2>网申档案</h2><el-select :model-value="selectedId" placeholder="选择档案" @update:model-value="id => setProfile(profiles.find(item => item.id === id))"><el-option v-for="item in profiles" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        <el-form label-position="top"><el-form-item label="名称"><el-input v-model="profile.name" /></el-form-item><el-form-item label="标签"><el-select v-model="profile.targetTags" multiple filterable allow-create /></el-form-item><el-form-item label="期望地点"><el-select v-model="profile.strategy.targetLocations" multiple filterable allow-create /></el-form-item><el-form-item label="期望薪资"><el-input v-model="profile.strategy.expectedSalary" /></el-form-item><el-form-item label="可到岗日期"><el-input v-model="profile.strategy.availableDate" placeholder="YYYY-MM-DD" /></el-form-item><el-form-item label="招聘来源"><el-input v-model="profile.strategy.recruitmentSource" /></el-form-item><el-form-item label="内推码"><el-input v-model="profile.strategy.referralCode" /></el-form-item></el-form>
        <el-alert v-if="legacyCount" type="info" :closable="false" :title="`检测到 ${legacyCount} 项历史内容`"><el-button text type="primary" @click="previewMigration">预览迁移</el-button></el-alert>
      </aside>
      <main class="material-surface structured-form">
        <div class="structured-form__heading"><div><h2>当前编辑草稿</h2><p>插卡只引用固定文案，不修改素材原文。</p></div><el-button text @click="addBlock">＋ 模块</el-button><el-button type="primary" :disabled="!selectedId" :loading="saving" @click="saveVersion">保存为新版本</el-button></div>
        <section v-for="block in blocks" :key="block.key" class="profile-block"><div class="profile-block__heading"><h3>{{ block.title }}</h3><el-button text @click="addField(block)">＋ 字段</el-button></div>
          <div v-for="field in block.fields" :key="field.key" class="profile-field">
                        
            <div class="field-material"><el-select :model-value="fieldRefs[field.key]?.cardId" clearable placeholder="插入素材卡片" @update:model-value="value => chooseCard(field, value)"><el-option v-for="card in cards" :key="card.id" :label="card.title" :value="card.id" /></el-select>
              <el-select v-if="selectedCard(field.key)" :model-value="fieldRefs[field.key]?.variantId" placeholder="文案版本" @update:model-value="value => setVariant(field.key, value)"><el-option v-for="item in selectedCard(field.key)?.variants" :key="item.id" :label="item.name" :value="item.id" /></el-select></div>
            <div v-if="selectedCard(field.key)" class="material-card-preview">
              <div class="preview-head"><span>{{ typeLabels[selectedCard(field.key)!.type] }}</span><strong>{{ selectedCard(field.key)!.title }}</strong></div>
              <span v-if="cardMeta(selectedCard(field.key)!)" class="preview-meta">{{ cardMeta(selectedCard(field.key)!) }}</span>
              <span v-if="cardTechStack(selectedCard(field.key)!)" class="preview-tech">{{ cardTechStack(selectedCard(field.key)!) }}</span>
              <p v-if="selectedVariant(field.key)?.content" class="preview-content">{{ selectedVariant(field.key)!.content }}</p>
            </div>
          </div>
        </section>
      </main>
      
    </div>
    <el-dialog v-model="migrationOpen" title="历史内容迁移预览" width="min(720px, 94vw)">
      <p>只有勾选并确认的条目会创建素材卡片；原网申 JSON 不会删除或改写。</p><el-checkbox-group v-model="selectedSources" class="migration-list"><el-checkbox v-for="item in candidates" :key="item.sourceKey" :value="item.sourceKey" :disabled="item.imported"><b>{{ item.title }}</b><span>{{ item.variant.content }}</span><el-tag v-if="item.imported">已导入</el-tag></el-checkbox></el-checkbox-group>
      <template #footer><el-button @click="migrationOpen = false">取消</el-button><el-button type="primary" :disabled="!selectedSources.length" @click="confirmMigration">确认导入所选项</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.application-editor__header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.application-editor__header h1{margin:4px 0}.application-editor__layout{display:grid;grid-template-columns:260px minmax(480px,1fr);gap:14px}.application-editor__layout>.material-surface{padding:18px;min-width:0}.profile-sidebar h2,.structured-form h2{margin-top:0}.profile-sidebar :deep(.el-form-item){margin-bottom:12px}.structured-form__heading,.profile-block__heading{display:flex;justify-content:space-between;align-items:start}.profile-block{margin-top:18px;padding-top:14px;border-top:1px solid var(--el-border-color-lighter)}.profile-field{display:grid;gap:8px;margin:12px 0;padding:14px;border-radius:14px;background:var(--el-fill-color-lighter)}.field-material{display:grid;grid-template-columns:1fr 1fr;gap:8px}.material-card-preview{display:grid;gap:6px;padding:12px 14px;border:1px solid var(--el-color-primary-light-7);border-radius:12px;background:var(--el-color-primary-light-9)}.preview-head{display:flex;align-items:center;gap:8px}.preview-head span{font-size:12px;color:var(--el-color-primary)}.preview-head strong{font-size:14px}.preview-meta,.preview-tech{font-size:12px;color:var(--el-text-color-secondary)}.preview-content{margin:0;white-space:pre-wrap;font-size:13px;color:var(--el-text-color-regular);line-height:1.6}.migration-list{display:grid;gap:10px;max-height:460px;overflow:auto}.migration-list :deep(.el-checkbox){height:auto;display:grid;grid-template-columns:auto 1fr;white-space:normal}.migration-list span{display:block;color:var(--el-text-color-secondary)}
@media(max-width:1150px){.application-editor__layout{grid-template-columns:240px 1fr}}
@media(max-width:760px){.application-editor__header{align-items:flex-start;gap:12px}.application-editor__layout{grid-template-columns:1fr}.field-material{grid-template-columns:1fr}.structured-form__heading{gap:10px}}
</style>
