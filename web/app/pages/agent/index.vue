<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

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
let controller: AbortController | null = null

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
  try {
    const activeId = await ensureConversation()
    const history = messages.value.filter(item => item.content.trim() && !item.error).slice(-20).map(({ role, content: value }) => ({ role, content: value }))
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content }
    await persistMessage(activeId, userMessage)
    assistant = { id: crypto.randomUUID(), role: 'assistant', content: '' }
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
        if (event.type === 'delta' && assistant) assistant.content += event.text
        if (event.type === 'error' && assistant) { assistant.error = true; assistant.content += `${assistant.content ? '\n\n' : ''}> ${event.message}` }
        if (event.type === 'done' && assistant) { providerLabel.value = `${event.provider} / ${event.model}`; assistant.provider = event.provider; assistant.model = event.model }
      }
      await scrollToBottom()
      if (done) break
    }
  }
  catch (error) {
    if (!assistant) ElMessage.error(error instanceof Error ? error.message : '发送失败，请重试。')
    else if (controller?.signal.aborted) assistant.content += `${assistant.content ? '\n\n' : ''}> 已停止生成。`
    else { assistant.error = true; assistant.content += `${assistant.content ? '\n\n' : ''}> ${error instanceof Error ? error.message : '生成失败，请重试。'}` }
  }
  finally {
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
</script>

<template>
  <section v-loading="loading" class="agent-page">
    <header class="agent-heading">
      <div><span>CAREER AGENT · QUICK DESK</span><h1>带着岗位和简历，直接聊</h1><p>对话自动保存；需要沉淀的回答，再明确加入面试准备。</p></div>
      <div class="agent-status"><i :class="{ active: generating }" /><span>{{ generating ? '正在生成' : providerLabel || '模型待连接' }}</span></div>
    </header>

    <div class="session-strip">
      <label><span>最近对话</span><el-select v-model="conversationId" clearable filterable placeholder="新对话" :disabled="generating" @change="openConversation"><el-option v-for="item in conversations" :key="item.id" :label="conversationLabel(item)" :value="item.id" /></el-select></label>
      <button type="button" :disabled="generating" @click="startNewConversation(true)">＋ 新对话</button>
      <button type="button" class="danger-link" :disabled="!conversationId || generating" @click="removeConversation">删除当前对话</button>
    </div>

    <div class="context-docket">
      <label><span>当前岗位</span><el-select v-model="applicationId" clearable filterable placeholder="选择含 JD 的岗位" :disabled="generating || contextLocked"><el-option v-for="item in applications" :key="item.id" :label="optionLabel(item)" :value="item.id" /></el-select></label>
      <label><span>当前简历</span><el-select v-model="resumeVersionId" clearable filterable placeholder="选择简历版本" :disabled="generating || contextLocked"><el-option v-for="item in resume?.versions || []" :key="item.id" :label="versionLabel(item)" :value="item.id" /></el-select></label>
      <div class="context-summary"><small>本次上下文</small><strong>{{ selectedApplication ? optionLabel(selectedApplication) : '未选择岗位' }}</strong><span>{{ selectedVersion ? versionLabel(selectedVersion) : '未选择简历' }}</span></div>
    </div>

    <div class="prompt-rack" aria-label="快捷提问"><button v-for="item in quickPrompts" :key="item.mode" type="button" :disabled="generating" @click="applyPrompt(item.text)"><span>↗</span>{{ item.label }}</button></div>

    <main class="conversation-shell">
      <div ref="conversation" class="conversation-stream" aria-live="polite">
        <div v-if="!messages.length" class="conversation-empty"><span>求</span><h2>{{ contextReady ? '上下文已就绪' : '先选岗位或简历，也可以直接提问' }}</h2><p>例如：这个岗位最看重什么？我的简历哪里最需要调整？</p></div>
        <article v-for="message in messages" :key="message.id" class="message" :class="[`message--${message.role}`, { 'message--error': message.error }]">
          <div class="message-body"><header><strong>{{ message.role === 'user' ? '我的问题' : '求职 Agent' }}</strong><div v-if="message.role === 'assistant' && message.content" class="message-actions"><button v-if="message.persistedId" type="button" :disabled="message.savedToInterview" @click="openSaveDialog(message)">{{ message.savedToInterview ? '已存入面试准备' : '存入面试准备' }}</button><button type="button" @click="copyMessage(message.content)">复制</button></div></header><AgentMarkdown v-if="message.content" :content="message.content" /><p v-else class="message-thinking"><i /><i /><i /> 正在组织回答</p></div>
        </article>
      </div>
      <footer class="composer"><el-input v-model="input" type="textarea" :rows="3" resize="none" maxlength="50000" placeholder="继续追问，Shift + Enter 换行" :disabled="generating" @keydown.enter.exact.prevent="send" /><div><el-button v-if="generating" type="danger" plain @click="stop">停止生成</el-button><el-button v-else type="primary" :disabled="!input.trim()" @click="send">发送问题</el-button></div></footer>
    </main>

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
.agent-page{width:min(1480px,100%);margin:0 auto}.agent-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:14px}.agent-heading>div:first-child>span,.session-strip label>span{font:600 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em;color:#7288a8}.agent-heading h1{margin:7px 0 5px;color:#26364f;font-family:"Songti SC","STSong",serif;font-size:31px;letter-spacing:.02em}.agent-heading p{margin:0;color:#748195;font-size:13px}.agent-status{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(130,151,179,.25);border-radius:999px;background:rgba(255,255,255,.45);color:#67788d;font-size:12px}.agent-status i{width:7px;height:7px;border-radius:50%;background:#87a696}.agent-status i.active{animation:pulse 1.2s ease-in-out infinite}.session-strip{display:flex;align-items:end;gap:9px;padding:10px 14px;border:1px solid rgba(126,146,174,.2);border-bottom:0;border-radius:16px 16px 0 0;background:rgba(249,251,253,.65)}.session-strip label{display:grid;flex:1;max-width:520px;gap:6px}.session-strip button{height:32px;padding:0 11px;border:1px solid rgba(126,146,174,.25);border-radius:8px;background:transparent;color:#52677f;font-size:12px;cursor:pointer}.session-strip button:disabled{cursor:not-allowed;opacity:.45}.session-strip .danger-link{border-color:transparent;color:#a56666}.context-docket{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr) minmax(260px,1.1fr);gap:12px;padding:15px;border:1px solid rgba(126,146,174,.22);border-radius:0 0 10px 10px;background:linear-gradient(135deg,rgba(250,252,255,.82),rgba(239,245,242,.78));box-shadow:0 12px 30px rgba(73,91,118,.07)}.context-docket label{display:grid;gap:7px}.context-docket label>span,.context-summary small{font:600 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;color:#74869e}.context-summary{display:grid;align-content:center;gap:4px;padding:4px 8px 4px 14px;border-left:1px solid rgba(116,137,164,.24)}.context-summary strong{overflow:hidden;color:#30445d;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.context-summary span{overflow:hidden;color:#718092;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.prompt-rack{display:flex;gap:8px;overflow-x:auto;padding:11px 2px}.prompt-rack button{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;padding:8px 12px;border:1px solid rgba(124,142,166,.25);border-radius:9px;background:rgba(255,255,255,.4);color:#52677f;font-size:12px;cursor:pointer}.prompt-rack button:hover{border-color:#8fa2c0;background:#fff}.prompt-rack button span{color:#7c6f9d}.conversation-shell{overflow:hidden;border:1px solid rgba(126,146,174,.22);border-radius:8px 8px 20px 20px;background:rgba(252,253,254,.82);box-shadow:0 22px 52px rgba(62,80,106,.09)}.conversation-stream{height:clamp(460px,61vh,760px);overflow-y:auto;padding:28px clamp(18px,4vw,58px)}.conversation-empty{display:grid;justify-items:center;align-content:center;height:100%;text-align:center;color:#758296}.conversation-empty>span{display:grid;place-items:center;width:54px;height:54px;margin-bottom:13px;border-radius:18px;background:linear-gradient(145deg,#a7bce2,#7998cf);color:#fff;font-family:"Songti SC",serif;font-size:24px;box-shadow:0 12px 26px rgba(89,120,174,.22)}.conversation-empty h2{margin:0 0 7px;color:#394c65;font-size:17px}.conversation-empty p{margin:0;font-size:13px}.message{display:flex;max-width:900px;margin:0 auto 26px}.message--assistant{justify-content:flex-start}.message--user{justify-content:flex-end}.message-body{width:min(100%,900px);min-width:0;padding:15px 18px;border:1px solid rgba(130,148,173,.18);border-radius:5px 17px 17px;background:#fff;box-shadow:0 8px 20px rgba(56,73,98,.05)}.message--user .message-body{width:min(82%,760px);border-radius:17px 5px 17px 17px;background:#f0f5f1}.message--error .message-body{border-color:#dfb6b1}.message-body>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;color:#5f7086;font-size:12px}.message-actions{display:flex;gap:12px}.message-body>header button{border:0;background:transparent;color:#7c6f9d;font-size:12px;cursor:pointer}.message-body>header button:disabled{color:#8b9b91;cursor:default}.message-thinking{display:flex;align-items:center;gap:4px;margin:10px 0;color:#8290a1;font-size:12px}.message-thinking i{width:5px;height:5px;border-radius:50%;background:#8297b6;animation:dots 1s ease-in-out infinite}.message-thinking i:nth-child(2){animation-delay:.15s}.message-thinking i:nth-child(3){animation-delay:.3s}.composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:end;padding:16px 18px;border-top:1px solid rgba(126,146,174,.17);background:rgba(240,244,248,.78);backdrop-filter:blur(12px)}.composer>div:last-child{display:flex;align-items:center;gap:8px}.prompt-rack button:disabled{cursor:not-allowed;opacity:.5}@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(135,166,150,.14)}}@keyframes dots{50%{transform:translateY(-3px);opacity:.5}}@media(prefers-reduced-motion:reduce){.agent-status i.active,.message-thinking i{animation:none}}@media(max-width:820px){.agent-heading{align-items:flex-start;flex-direction:column}.session-strip{align-items:stretch;flex-wrap:wrap}.session-strip label{flex-basis:100%;max-width:none}.context-docket{grid-template-columns:1fr}.context-summary{padding:8px 0 0;border-top:1px solid rgba(116,137,164,.24);border-left:0}.conversation-stream{height:58vh;padding:20px 14px}.composer{grid-template-columns:1fr}.composer>div:last-child{justify-content:flex-end}.message--user .message-body{width:92%}}
</style>
