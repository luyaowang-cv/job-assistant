<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Expand, Fold } from '@element-plus/icons-vue'

type Application = { id: string; job: { title: string; description?: string | null; company: { name: string } } }
type ResumeVersion = { id: string; name: string; type: 'BASE' | 'TARGETED'; content: string; createdAt: string }
type Resume = { id: string; name: string; versions: ResumeVersion[] }
type StoredMessage = { id: string; role: 'user' | 'assistant'; content: string; error: boolean; provider?: string | null; model?: string | null }
type Message = { id: string; persistedId?: string; role: 'user' | 'assistant'; content: string; error?: boolean; provider?: string; model?: string; savedToInterview?: boolean }
type Conversation = {
  id: string
  title: string
  applicationId: string | null
  resumeVersionId: string | null
  updatedAt: string
  application?: { id: string; job: { title: string; company: { name: string } } } | null
  resumeVersion?: { id: string; name: string; type: string } | null
  messages?: StoredMessage[]
  _count?: { messages: number }
}
type StreamEvent = { type: 'delta'; text: string } | { type: 'done'; provider: string; model: string } | { type: 'error'; message: string }
type TypewriterState = { buffer: string; ended: boolean; wake: (() => void) | null }

const route = useRoute()
const applications = ref<Application[]>([])
const resume = ref<Resume | null>(null)
const conversations = ref<Conversation[]>([])
const conversationId = ref('')
const applicationId = ref('')
const resumeVersionId = ref('')
const messages = ref<Message[]>([])
const input = ref('')
const loading = ref(true)
const generating = ref(false)
const providerLabel = ref('')
const conversation = ref<HTMLElement | null>(null)
const saveDialogVisible = ref(false)
const saveTarget = ref<Message | null>(null)
const savingToInterview = ref(false)
const saveForm = reactive({ kind: 'KNOWLEDGE' as 'KNOWLEDGE' | 'QUESTION_ASK' | 'ROLE_POINT', title: 'Agent 面试准备' })
// 对话栏折叠状态。窄屏自动收起，用户手动点开的意愿优先保留（只有跨断点时才会被改写）。
// 这里没有用 useMediaQuery：在 Nuxt SSR 下它的返回值不会随客户端窗口更新（实测恒为 false）。
// 手写版本行为明确，也更容易排查。
// 关键：初始值必须两边一致（都是 false）。服务端渲染时拿不到窗口宽度，若在 setup 阶段就把
// collapsed 改成 true，客户端 class 会和服务端 HTML 对不上，Vue 判定 hydration mismatch 后
// 不回写 class——而这个值之后又不再变化，窄屏下就永远收不起来。所以真正的判断放在 onMounted。
const collapsed = ref(false)
const narrowViewport = ref(false)
// mounted 只用来给移动端样式加一道"已就绪"闸门：服务端渲染出来的侧栏在窄屏是覆盖层形态，
// 若不加闸门，手机首屏会先闪一下盖住整页的侧栏，等 hydration 跑完才收起。
const mounted = ref(false)
let viewportQuery: MediaQueryList | null = null
function syncNarrowViewport() { narrowViewport.value = viewportQuery?.matches ?? false }
onMounted(() => {
  viewportQuery = window.matchMedia('(max-width: 1400px)')
  syncNarrowViewport()
  collapsed.value = narrowViewport.value
  mounted.value = true
  viewportQuery.addEventListener('change', () => { syncNarrowViewport(); collapsed.value = narrowViewport.value })
})
let controller: AbortController | null = null
let scrollFrame: number | null = null

const selectedApplication = computed(() => applications.value.find(item => item.id === applicationId.value))
const selectedVersion = computed(() => resume.value?.versions.find(item => item.id === resumeVersionId.value))
const contextReady = computed(() => Boolean(selectedApplication.value || selectedVersion.value))
const contextLocked = computed(() => Boolean(conversationId.value && messages.value.length))
const quickPrompts = [
  { mode: 'evaluate', label: '分析岗位', text: '请分析这个岗位与我的匹配度，说明优势、差距、风险和是否值得优先投递。' },
  { mode: 'optimize', label: '优化简历', text: '请根据这个岗位的 JD，指出当前简历最应该调整的内容，并给出可以直接替换的表达。不要编造经历。' },
  { mode: 'interview', label: '面试准备', text: '请根据这个岗位和简历，生成一份完整的面试准备，包括自我介绍、项目追问、知识点、高频问题和反问建议。' },
  { mode: 'greeting', label: '打招呼话术', text: '请根据这个岗位和简历，生成简短版、标准版和技术亮点版三种打招呼话术。' },
]

const optionLabel = (item: Application) => `${item.job.company.name} · ${item.job.title}`
const versionLabel = (item: ResumeVersion) => item.name || `${item.type === 'BASE' ? '基础版' : '定制版'} · ${new Date(item.createdAt).toLocaleDateString('zh-CN')}`
const conversationLabel = (item: Conversation) => `${item.title}${item.application ? ` · ${item.application.job.company.name}` : ''}`
// 历史对话行的副信息：公司 · 消息数 · 日期。数据列表接口已经返回，不需要额外请求。
const conversationMeta = (item: Conversation) => [
  item.application?.job.company.name,
  item._count?.messages ? `${item._count.messages} 条` : '',
  new Date(item.updatedAt).toLocaleDateString('zh-CN'),
].filter(Boolean).join(' · ')
const queryValue = (key: string) => typeof route.query[key] === 'string' ? String(route.query[key]) : ''

async function loadConversations() {
  const response = await $fetch<{ data: Conversation[] }>('/api/v1/career-agent/conversations')
  conversations.value = response.data
}

async function openConversation(id: string) {
  if (!id) return startNewConversation()
  loading.value = true
  try {
    const response = await $fetch<{ data: Conversation }>(`/api/v1/career-agent/conversations/${id}`)
    const detail = response.data
    conversationId.value = detail.id
    applicationId.value = detail.applicationId ?? ''
    resumeVersionId.value = detail.resumeVersionId ?? ''
    messages.value = (detail.messages ?? []).map(item => ({ id: item.id, persistedId: item.id, role: item.role, content: item.content, error: item.error, provider: item.provider ?? undefined, model: item.model ?? undefined }))
    await navigateTo({ path: '/agent', query: { conversationId: detail.id } }, { replace: true })
    await scrollToBottom(false)
  }
  catch { ElMessage.error('对话读取失败，请重新选择。') }
  finally { loading.value = false }
}

function startNewConversation(keepContext = true) {
  conversationId.value = ''
  messages.value = []
  if (!keepContext) {
    applicationId.value = ''
    resumeVersionId.value = (resume.value?.versions.find(item => item.type === 'TARGETED') ?? resume.value?.versions[0])?.id ?? ''
  }
  void navigateTo({ path: '/agent', query: {} }, { replace: true })
}

async function removeConversation() {
  if (!conversationId.value || generating.value) return
  try { await ElMessageBox.confirm('删除后这段对话无法恢复，但已保存到面试准备的内容不受影响。', '删除对话', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }) }
  catch { return }
  await $fetch(`/api/v1/career-agent/conversations/${conversationId.value}`, { method: 'DELETE' })
  await loadConversations()
  if (conversations.value[0]) await openConversation(conversations.value[0].id)
  else startNewConversation(false)
  ElMessage.success('对话已删除。')
}

async function load() {
  loading.value = true
  try {
    const [applicationResponse, resumeResponse, settingResponse] = await Promise.all([
      $fetch<{ data: { items: Application[] } }>('/api/v1/applications', { query: { pageSize: 100 } }),
      $fetch<{ data: Resume | null }>('/api/v1/resumes'),
      $fetch<{ data: { provider: string; model: string } }>('/api/v1/ai-settings'),
      loadConversations(),
    ])
    applications.value = applicationResponse.data.items.filter(item => item.job.description?.trim())
    resume.value = resumeResponse.data
    providerLabel.value = `${settingResponse.data.provider} / ${settingResponse.data.model}`
    const requestedConversation = queryValue('conversationId')
    const requestedApplication = queryValue('applicationId')
    const requestedVersion = queryValue('resumeVersionId')
    const requestedMode = queryValue('mode')
    if (requestedConversation && conversations.value.some(item => item.id === requestedConversation)) await openConversation(requestedConversation)
    else if (!requestedApplication && !requestedVersion && !requestedMode && conversations.value[0]) await openConversation(conversations.value[0].id)
    else {
      applicationId.value = applications.value.some(item => item.id === requestedApplication) ? requestedApplication : ''
      resumeVersionId.value = resume.value?.versions.some(item => item.id === requestedVersion) ? requestedVersion : (resume.value?.versions.find(item => item.type === 'TARGETED') ?? resume.value?.versions[0])?.id ?? ''
      const prompt = quickPrompts.find(item => item.mode === requestedMode)
      if (prompt) input.value = prompt.text
    }
  }
  catch { ElMessage.error('Agent 上下文读取失败，请刷新页面。') }
  finally { loading.value = false }
}

function applyPrompt(text: string) { input.value = text }
async function scrollToBottom(smooth = true) { await nextTick(); conversation.value?.scrollTo({ top: conversation.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }) }

function scheduleScrollToBottom() {
  if (scrollFrame !== null) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null
    const element = conversation.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function enqueueTypewriter(state: TypewriterState, text: string) {
  if (!text) return
  state.buffer += text
  state.wake?.()
  state.wake = null
}

function finishTypewriter(state: TypewriterState) {
  state.ended = true
  state.wake?.()
  state.wake = null
}

async function runTypewriter(message: Message, state: TypewriterState) {
  while (!state.ended || state.buffer) {
    if (!state.buffer) {
      await new Promise<void>((resolve) => { state.wake = resolve })
      continue
    }
    const take = Math.min(160, Math.max(6, Math.ceil(state.buffer.length / 4)))
    message.content += state.buffer.slice(0, take)
    state.buffer = state.buffer.slice(take)
    scheduleScrollToBottom()
    await waitForNextFrame()
  }
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    const frame = requestAnimationFrame(() => resolve())
    // rAF may be throttled or paused in background or occluded tabs; timeout fallback keeps the typewriter progressing
    setTimeout(() => { cancelAnimationFrame(frame); resolve() }, 80)
  })
}

async function ensureConversation() {
  if (conversationId.value) return conversationId.value
  const response = await $fetch<{ data: Conversation }>('/api/v1/career-agent/conversations', { method: 'POST', body: { applicationId: applicationId.value || null, resumeVersionId: resumeVersionId.value || null } })
  conversationId.value = response.data.id
  await navigateTo({ path: '/agent', query: { conversationId: response.data.id } }, { replace: true })
  return response.data.id
}

async function persistMessage(id: string, message: Message) {
  const response = await $fetch<{ data: StoredMessage }>(`/api/v1/career-agent/conversations/${id}/messages`, { method: 'POST', body: { role: message.role, content: message.content, error: message.error ?? false, provider: message.provider ?? null, model: message.model ?? null } })
  message.persistedId = response.data.id
}

async function send() {
  const content = input.value.trim()
  if (!content || generating.value) return
  generating.value = true
  controller = new AbortController()
  let assistant: Message | null = null
  let typewriterState: TypewriterState | null = null
  let typewriterTask: Promise<void> | null = null
  try {
    const activeId = await ensureConversation()
    const history = messages.value.filter(item => item.content.trim() && !item.error).slice(-20).map(({ role, content: value }) => ({ role, content: value }))
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content }
    await persistMessage(activeId, userMessage)
    assistant = reactive<Message>({ id: crypto.randomUUID(), role: 'assistant', content: '' })
    typewriterState = { buffer: '', ended: false, wake: null }
    typewriterTask = runTypewriter(assistant, typewriterState)
    messages.value.push(userMessage, assistant)
    input.value = ''
    await scrollToBottom()
    const response = await fetch('/api/v1/career-agent/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ applicationId: applicationId.value || null, resumeVersionId: resumeVersionId.value || null, messages: [...history, { role: 'user', content }] }), signal: controller.signal })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message || `请求失败（HTTP ${response.status}）`)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('浏览器没有收到可读取的流式响应。')
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      buffer += value ? decoder.decode(value, { stream: !done }) : decoder.decode()
      const rows = buffer.split('\n')
      buffer = done ? '' : (rows.pop() ?? '')
      for (const row of rows) {
        if (!row.trim()) continue
        const event = JSON.parse(row) as StreamEvent
        if (event.type === 'delta' && typewriterState) enqueueTypewriter(typewriterState, event.text)
        if (event.type === 'error' && assistant && typewriterState) { assistant.error = true; enqueueTypewriter(typewriterState, `${assistant.content || typewriterState.buffer ? '\n\n' : ''}> ${event.message}`) }
        if (event.type === 'done' && assistant) { providerLabel.value = `${event.provider} / ${event.model}`; assistant.provider = event.provider; assistant.model = event.model }
      }
      if (done) break
    }
  }
  catch (error) {
    if (!assistant) ElMessage.error(error instanceof Error ? error.message : '发送失败，请重试。')
    else if (typewriterState && controller?.signal.aborted) enqueueTypewriter(typewriterState, `${assistant.content || typewriterState.buffer ? '\n\n' : ''}> 已停止生成。`)
    else if (typewriterState) { assistant.error = true; enqueueTypewriter(typewriterState, `${assistant.content || typewriterState.buffer ? '\n\n' : ''}> ${error instanceof Error ? error.message : '生成失败，请重试。'}`) }
  }
  finally {
    if (typewriterState) finishTypewriter(typewriterState)
    if (typewriterTask) await typewriterTask
    if (assistant?.content.trim() && conversationId.value) {
      try { await persistMessage(conversationId.value, assistant) }
      catch { ElMessage.warning('回答已显示，但保存失败，请先复制保留。') }
    }
    generating.value = false
    controller = null
    await loadConversations().catch(() => undefined)
    await scrollToBottom()
  }
}

function stop() { controller?.abort() }
async function copyMessage(content: string) { await navigator.clipboard.writeText(content); ElMessage.success('回答已复制。') }
function openSaveDialog(message: Message) {
  if (!selectedApplication.value) return ElMessage.warning('当前对话没有绑定岗位，无法保存到面试准备。')
  saveTarget.value = message
  saveForm.kind = 'KNOWLEDGE'
  saveForm.title = 'Agent 面试准备'
  saveDialogVisible.value = true
}
async function confirmSaveToInterview() {
  if (!saveTarget.value?.persistedId || !saveForm.title.trim()) return
  savingToInterview.value = true
  try {
    const response = await $fetch<{ data: { recordId: string } }>(`/api/v1/career-agent/messages/${saveTarget.value.persistedId}/save-to-interview`, { method: 'POST', body: { kind: saveForm.kind, title: saveForm.title.trim() } })
    saveTarget.value.savedToInterview = true
    saveDialogVisible.value = false
    ElMessage.success('已保存到面试准备。')
    await navigateTo({ path: '/interview-prep', query: { id: response.data.recordId } })
  }
  catch { ElMessage.error('保存到面试准备失败，请重试。') }
  finally { savingToInterview.value = false }
}

onMounted(() => void load())
onBeforeUnmount(() => { controller?.abort(); if (scrollFrame !== null) cancelAnimationFrame(scrollFrame) })
</script>

<template>
  <section v-loading="loading" class="agent-page">
    <!-- 移动端专用：对话栏作为覆盖层打开时，点遮罩关闭。桌面端这段样式被置为 display:none -->
    <div class="agent-page__scrim" :class="{ 'agent-page__scrim--visible': mounted && !collapsed }" @click="collapsed = true" />

    <!-- 左侧对话栏：新建对话 / 岗位与简历上下文 / 历史对话 / 当前对话操作 -->
    <aside class="agent-rail material-surface" :class="{ 'agent-rail--collapsed': collapsed, 'agent-rail--ready': mounted }">
      <header class="agent-rail__head">
        <button v-if="!collapsed" type="button" class="agent-rail__new" :disabled="generating" @click="startNewConversation(true)">＋ 新建对话</button>
        <button v-else type="button" class="agent-rail__icon" title="新建对话" :disabled="generating" @click="startNewConversation(true)">＋</button>
        <button type="button" class="agent-rail__toggle" :title="collapsed ? '展开对话栏' : '收起对话栏'" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
          <el-icon><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
        </button>
      </header>

      <template v-if="!collapsed">
        <label class="agent-rail__field"><span>当前岗位</span><el-select v-model="applicationId" clearable filterable placeholder="选择含 JD 的岗位" :disabled="generating || contextLocked"><el-option v-for="item in applications" :key="item.id" :label="optionLabel(item)" :value="item.id" /></el-select></label>
        <label class="agent-rail__field"><span>当前简历</span><el-select v-model="resumeVersionId" clearable filterable placeholder="选择简历版本" :disabled="generating || contextLocked"><el-option v-for="item in resume?.versions || []" :key="item.id" :label="versionLabel(item)" :value="item.id" /></el-select></label>

        <div class="agent-rail__section"><span>历史对话</span><small>{{ conversations.length }}</small></div>
        <nav class="agent-rail__history" aria-label="历史对话">
          <button v-for="item in conversations" :key="item.id" type="button" class="agent-rail__item" :class="{ 'agent-rail__item--active': item.id === conversationId }" :disabled="generating" @click="openConversation(item.id)">
            <strong>{{ item.title }}</strong>
            <small>{{ conversationMeta(item) }}</small>
          </button>
          <p v-if="!conversations.length" class="agent-rail__empty">还没有历史对话，直接提问就会自动建立。</p>
        </nav>

        <footer class="agent-rail__foot">
          <span class="agent-rail__status"><i :class="{ active: generating }" />{{ generating ? '正在生成' : providerLabel || '模型待连接' }}</span>
          <el-button type="danger" plain size="small" :disabled="!conversationId || generating" @click="removeConversation">删除当前对话</el-button>
        </footer>
      </template>

      <nav v-else class="agent-rail__history agent-rail__history--rail" aria-label="历史对话">
        <button v-for="item in conversations" :key="item.id" type="button" class="agent-rail__item agent-rail__item--rail" :class="{ 'agent-rail__item--active': item.id === conversationId }" :title="conversationLabel(item)" :disabled="generating" @click="openConversation(item.id)">{{ item.title.slice(0, 1) }}</button>
      </nav>
    </aside>

    <!-- 对话区：空态是一张居中卡片，发出第一条消息后撑满可用高度 -->
    <div class="agent-chat" :class="{ 'agent-chat--empty': !messages.length }">
      <button type="button" class="agent-chat__rail-trigger" @click="collapsed = false">对话</button>

      <div ref="conversation" class="agent-chat__stream" aria-live="polite">
        <div v-if="!messages.length" class="agent-chat__empty">
          <span class="agent-chat__mark">求</span>
          <h2>{{ contextReady ? '上下文已就绪，可以直接提问' : '先选岗位或简历，也可以直接提问' }}</h2>
          <p>例如：这个岗位最看重什么？我的简历哪里最需要调整？</p>
        </div>
        <article v-for="message in messages" :key="message.id" class="message" :class="[`message--${message.role}`, { 'message--error': message.error }]">
          <div class="message-body"><header><strong>{{ message.role === 'user' ? '我的问题' : '求职 Agent' }}</strong><div v-if="message.role === 'assistant' && message.content" class="message-actions"><button v-if="message.persistedId" type="button" :disabled="message.savedToInterview" @click="openSaveDialog(message)">{{ message.savedToInterview ? '已存入面试准备' : '存入面试准备' }}</button><button type="button" @click="copyMessage(message.content)">复制</button></div></header><AgentMarkdown v-if="message.content" :content="message.content" /><p v-else class="message-thinking"><i /><i /><i /> 正在组织回答</p></div>
        </article>
      </div>

      <footer class="agent-chat__composer">
        <div class="agent-chat__prompts" aria-label="快捷提问"><button v-for="item in quickPrompts" :key="item.mode" type="button" class="agent-chat__prompt" :disabled="generating" @click="applyPrompt(item.text)">{{ item.label }}</button></div>
        <div class="agent-chat__field">
          <el-input v-model="input" type="textarea" :rows="3" resize="none" maxlength="50000" placeholder="继续追问，Shift + Enter 换行" :disabled="generating" @keydown.enter.exact.prevent="send" />
          <div class="agent-chat__actions"><el-button v-if="generating" type="danger" plain @click="stop">停止生成</el-button><el-button v-else type="primary" :disabled="!input.trim()" @click="send">发送问题</el-button></div>
        </div>
      </footer>
    </div>

    <el-dialog v-model="saveDialogVisible" title="保存到面试准备" width="440px">
      <el-form label-position="top">
        <el-form-item label="归入哪一类"><el-select v-model="saveForm.kind" class="w-full"><el-option label="知识点复习" value="KNOWLEDGE" /><el-option label="反问面试官" value="QUESTION_ASK" /><el-option label="岗位针对性准备" value="ROLE_POINT" /></el-select></el-form-item>
        <el-form-item label="标题"><el-input v-model="saveForm.title" maxlength="120" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="saveDialogVisible = false">取消</el-button><el-button type="primary" :loading="savingToInterview" @click="confirmSaveToInterview">保存并打开面试准备</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
/* ---- 页面骨架 ----------------------------------------------------------
   高度必须写成确定的算式，不能用 height:100%。
   原因：.workbench-main（el-main）是 flex-basis:auto 的列项，而外层 .workbench-shell
   只有 min-height、没有确定高度。用百分比时"父级高度取决于内容、内容又取决于父级高度"
   形成循环，浏览器按 auto 处理，页面就被消息撑到几千像素，输入框被顶出视口。
   --agent-chrome 是页面上方固定占位的高度合计，实测：
     20(外壳上内边距) + 60(顶栏) + 10(顶栏下外边距) + 20(外壳下内边距) + 40(主区内边距) = 150
   顶栏是 60px 而非 h-14 的 56px——Element Plus 的 --el-header-height 赢了。
   若顶栏高度或外壳内边距以后有改动，这里要跟着改。 */
.agent-page{--agent-chrome:150px;display:flex;gap:var(--space-6);height:calc(100dvh - var(--agent-chrome));min-height:0;overflow:hidden;position:relative}
.agent-page__scrim{display:none}

/* ---- 左侧对话栏 ---- */
.agent-rail.material-surface{padding:var(--space-4)}
.agent-rail{display:flex;min-height:0;flex:none;flex-direction:column;gap:var(--space-4);width:260px;overflow:hidden;transition:width 180ms ease}
.agent-rail--collapsed{width:56px;padding:var(--space-3) var(--space-2);gap:var(--space-2)}
.agent-rail__head{display:flex;align-items:center;gap:var(--space-2)}
.agent-rail--collapsed .agent-rail__head{flex-direction:column}
/* 新建对话是描边按钮而非实心绿：本视图唯一的主按钮留给「发送问题」。 */
.agent-rail__new{flex:1;min-height:40px;border:1px solid var(--workbench-border);border-radius:var(--radius-control);background:var(--workbench-control);color:var(--workbench-subtle);font-size:13px;font-weight:600;cursor:pointer;transition:border-color 180ms ease,color 180ms ease}
.agent-rail__new:hover:not(:disabled){border-color:var(--workbench-blue);color:var(--workbench-blue-deep)}
.agent-rail__new:disabled{cursor:not-allowed;opacity:.5}
.agent-rail__icon,.agent-rail__toggle{display:grid;flex:none;place-items:center;width:32px;height:32px;padding:0;border:1px solid var(--workbench-border);border-radius:var(--radius-control);background:var(--workbench-control);color:var(--workbench-subtle);font-size:14px;cursor:pointer;transition:border-color 180ms ease,color 180ms ease}
.agent-rail__toggle{background:transparent}
.agent-rail__icon:hover:not(:disabled),.agent-rail__toggle:hover{border-color:var(--workbench-blue);color:var(--workbench-blue-deep)}
.agent-rail__icon:disabled{cursor:not-allowed;opacity:.5}
.agent-rail__field{display:grid;gap:var(--space-2)}
.agent-rail__field>span{color:var(--workbench-subtle);font-size:13px;font-weight:600}
.agent-rail__section{display:flex;align-items:center;justify-content:space-between;padding-top:var(--space-3);border-top:1px solid rgba(190,204,195,.7);color:var(--workbench-subtle);font-size:13px;font-weight:600}
.agent-rail__section small{color:var(--workbench-slate);font-size:12px;font-weight:400}
.agent-rail__history{display:grid;min-height:0;flex:1;align-content:start;gap:var(--space-1);overflow-y:auto}
.agent-rail__history--rail{justify-items:center;gap:var(--space-2)}
.agent-rail__item{display:grid;gap:var(--space-1);padding:var(--space-2) var(--space-3);border:1px solid transparent;border-radius:var(--radius-control);background:transparent;text-align:left;cursor:pointer;transition:background-color 180ms ease,border-color 180ms ease}
.agent-rail__item strong{overflow:hidden;color:var(--workbench-ink);font-size:13px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.agent-rail__item small{overflow:hidden;color:var(--workbench-slate);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.agent-rail__item:hover:not(:disabled){border-color:var(--workbench-border);background:rgba(255,255,255,.5)}
/* 激活态只用边框+底色区分，沿用 .application-records__view-toggle 的既有做法。 */
.agent-rail__item--active,.agent-rail__item--active:hover:not(:disabled){border-color:var(--workbench-blue);background:rgba(228,239,232,.78)}
.agent-rail__item--active strong{color:#3e6853}
.agent-rail__item:disabled{cursor:not-allowed;opacity:.5}
.agent-rail__item--rail{display:grid;place-items:center;width:32px;height:32px;padding:0;font-size:12px;color:var(--workbench-subtle)}
.agent-rail__empty{margin:0;padding:var(--space-4) 0;color:var(--workbench-slate);font-size:12px;line-height:1.6;text-align:center}
.agent-rail__foot{display:grid;flex:none;gap:var(--space-2);margin-top:auto;padding-top:var(--space-3);border-top:1px solid rgba(190,204,195,.7)}
.agent-rail__status{display:inline-flex;align-items:center;gap:var(--space-2);color:var(--workbench-slate);font-size:12px}
.agent-rail__status i{width:8px;height:8px;flex:none;border-radius:999px;background:var(--workbench-green)}
.agent-rail__status i.active{animation:agent-pulse 1.2s ease-in-out infinite}

/* ---- 对话区 ---- */
.agent-chat{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:hidden}
/* 空态：内容整体垂直居中；发出第一条消息后 messages 非空，这两个类自动失效。 */
.agent-chat--empty{justify-content:center}
.agent-chat__rail-trigger{display:none}
.agent-chat--empty .agent-chat__stream{flex:0 1 auto;padding:var(--space-6);border:1px solid rgba(255,255,255,.78);border-bottom:0;border-radius:var(--radius-surface) var(--radius-surface) 0 0;background:rgba(255,254,250,.7);backdrop-filter:blur(13px) saturate(108%)}
.agent-chat--empty .agent-chat__composer{padding:var(--space-4) var(--space-6) var(--space-6);border:1px solid rgba(255,255,255,.78);border-top:0;border-radius:0 0 var(--radius-surface) var(--radius-surface);background:rgba(255,254,250,.7);backdrop-filter:blur(13px) saturate(108%)}
/* min-height:0 不能省：flex 子项默认 min-height:auto 等于内容高，消息一长会把 composer 顶出屏幕。 */
.agent-chat__stream{width:min(100%,800px);min-height:0;flex:1;margin-inline:auto;padding:var(--space-6) var(--space-4);overflow-y:auto}
.agent-chat__empty{display:grid;justify-items:center;gap:var(--space-3);color:var(--workbench-slate);text-align:center}
.agent-chat__mark{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--radius-surface);background:linear-gradient(145deg,#a6bce6,#7898d0);color:#fff;font-family:"Noto Serif SC","Songti SC",serif;font-size:20px}
.agent-chat__empty h2{margin:0;color:var(--workbench-ink);font-size:16px}
.agent-chat__empty p{margin:0;font-size:13px}

/* ---- 消息 ---- */
.message{display:flex;margin-bottom:var(--space-6)}
.message:last-child{margin-bottom:0}
.message--user{justify-content:flex-end}
.message-body{min-width:0;max-width:100%;padding:var(--space-3) var(--space-4);border:1px solid var(--workbench-border);border-radius:var(--radius-surface);background:var(--workbench-solid);box-shadow:0 10px 23px rgba(89,96,98,.07)}
.message--user .message-body{max-width:82%;border-color:rgba(122,150,137,.32);background:rgba(228,239,232,.72)}
.message--error .message-body{border-color:rgba(190,100,92,.5);background:rgba(248,230,229,.6)}
.message-body>header{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-1)}
.message-body>header strong{color:var(--workbench-subtle);font-size:13px;font-weight:600}
.message-actions{display:flex;gap:var(--space-3)}
.message-actions button{border:0;background:transparent;color:var(--workbench-blue-deep);font-size:12px;cursor:pointer}
.message-actions button:disabled{color:var(--workbench-slate);cursor:default}
.message-thinking{display:flex;align-items:center;gap:var(--space-1);margin:var(--space-3) 0;color:var(--workbench-slate);font-size:12px}
.message-thinking i{width:4px;height:4px;border-radius:999px;background:var(--workbench-blue);animation:agent-dots 1s ease-in-out infinite}
.message-thinking i:nth-child(2){animation-delay:.15s}
.message-thinking i:nth-child(3){animation-delay:.3s}

/* ---- 输入区 ---- */
.agent-chat__composer{display:grid;width:min(100%,800px);flex:none;gap:var(--space-3);margin-inline:auto;padding:var(--space-3) var(--space-4) var(--space-4);border-top:1px solid var(--workbench-border);background:rgba(247,249,247,.72);backdrop-filter:blur(12px)}
.agent-chat__prompts{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.agent-chat__prompt{display:inline-flex;align-items:center;min-height:32px;padding-inline:var(--space-3);border:1px solid var(--workbench-border);border-radius:var(--radius-control);background:var(--workbench-control);color:var(--workbench-subtle);font-size:13px;cursor:pointer;transition:border-color 180ms ease,color 180ms ease}
.agent-chat__prompt:hover:not(:disabled){border-color:var(--workbench-blue);color:var(--workbench-blue-deep)}
.agent-chat__prompt:disabled{cursor:not-allowed;opacity:.5}
.agent-chat__field{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:var(--space-3)}
.agent-chat__actions{display:flex;align-items:center;gap:var(--space-2)}

@keyframes agent-pulse{50%{box-shadow:0 0 0 6px rgba(143,186,158,.16)}}
@keyframes agent-dots{50%{transform:translateY(-3px);opacity:.5}}

/* ---- 移动端：全局导航变横向滚动条、顶栏改为 static，页面高度不再固定 ----
   此处放弃撑满高度，改用 sticky composer 保证输入框始终可达。 */
@media(max-width:767px){
  .agent-page{display:block;height:auto;min-height:0;overflow:visible}
  /* overflow:hidden 会让 sticky 失效，必须放开 */
  .agent-chat{overflow:visible}
  .agent-chat__rail-trigger{display:inline-flex;align-items:center;min-height:32px;margin-bottom:var(--space-3);padding-inline:var(--space-3);border:1px solid var(--workbench-border);border-radius:var(--radius-control);background:var(--workbench-control);color:var(--workbench-subtle);font-size:13px;cursor:pointer}
  .agent-chat__stream,.agent-chat__composer{width:100%}
  .agent-chat__stream{padding:var(--space-4) 0}
  .agent-chat__composer{position:sticky;bottom:0;padding:var(--space-3) 0 var(--space-4)}
  .message--user .message-body{max-width:92%}
  /* 遮罩只在侧栏真的打开时才出现，否则窄屏下会一直盖着一层灰挡住点击 */
  .agent-page__scrim--visible{display:block;position:fixed;inset:0;z-index:15;background:rgba(61,70,75,.28)}
  .agent-rail{display:none}
  /* --ready 由 onMounted 挂上，用来挡住 hydration 之前那一帧：服务端渲染的侧栏在窄屏是覆盖层
     形态，没有这道闸门的话手机首屏会先闪一下盖住整页的侧栏。 */
  .agent-rail--ready:not(.agent-rail--collapsed){position:fixed;inset:0 auto 0 0;z-index:16;display:flex;width:min(260px,84vw);height:100dvh;padding:var(--space-4);border-radius:0 var(--radius-surface) var(--radius-surface) 0;background:rgba(255,254,251,.97)}
}
</style>
