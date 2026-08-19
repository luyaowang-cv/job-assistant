# F-005：浏览器插件 MVP

## Goal

让用户在招聘网站当前岗位页主动点击插件，将已可见的岗位信息保存到工作台，或基于当前页 JD 复用 F-003 生成可复制的打招呼话术。

## User scenarios

1. 用户在招聘岗位详情页主动打开插件。
2. 插件展示从当前页面提取的公司、岗位、地点、月薪范围和 JD 文本，用户可编辑并确认保存到工作台。
3. 用户可在插件中粘贴简历文本，点击生成短版、标准版和技术亮点版打招呼话术，并复制到剪贴板。
4. 用户手动将话术粘贴到招聘平台；插件不自动填写或发送。

## In scope

- 使用 WXT 构建 Chromium 浏览器插件，包含 popup、content script 和与本地工作台 API 的通信。
- 仅在用户主动打开 popup 并点击操作后读取当前活动页的可见 DOM 文本；优先定位岗位详情主体，而非拼接整个页面。
- 支持用户确认/编辑后调用现有 Application 创建 API 保存岗位。
- 支持可编辑的月薪下限/上限（元/月）；仅在页面薪资文本可无歧义解析时预填，否则留空。
- 支持用户确认/编辑 JD、临时粘贴简历后调用 F-003 preview API，展示并复制三版打招呼话术。
- 记录来源 URL 为当前页面 URL；使用 `MANUAL`/对应渠道作为保守来源标识。
- 页面不匹配或提取失败时，提供手动粘贴表单，不反复自动尝试。

## Out of scope

- 自动滚动、后台批量抓取、岗位搜索、绕过验证码、模拟人类行为或登录自动化。
- 自动创建投递、自动填写或发送打招呼话术、自动修改任何招聘平台页面。
- 上传完整简历文件、保存完整临时简历、真实 LLM 或外部 API。
- Firefox/Safari、插件商店发布、多账号认证。

## Acceptance criteria

1. 插件仅在用户主动点击后读取当前 tab；没有后台轮询或批量采集。
2. 用户可在 popup 中检查并编辑提取字段，再明确点击保存岗位。
3. 保存成功后，工作台出现对应 Application，包含来源 URL；失败显示可恢复错误。
4. 用户可在 popup 粘贴简历并获取 F-003 三版打招呼话术，且可一键复制。
5. 插件不会自动填写、发送消息、点击招聘页面控件或创建投递。
6. 当前页提取失败时，用户仍可手动粘贴公司、岗位和 JD；不触发重复请求。
7. 临时 resumeText 不进入插件存储、工作台持久化或 API 保存请求。
8. 插件最小权限化：仅 activeTab、scripting、clipboardWrite 和本地工作台 host permission。
9. 岗位 JD 仅取自可识别的“职位描述/职位要求”详情区间，不得混入站点导航、搜索结果、推荐岗位、页脚或其他无关页面文本；公司、岗位和地点缺少唯一证据时保持为空，交由用户填写。
10. JD 必须在招聘者身份、活跃状态、App 引导或沟通入口之前结束；薪资范围可编辑，且仅保存可被用户确认的元/月数值。
11. 对 BOSS 职位详情页，`在线`、`刚刚活跃`、`今日活跃` 或明确的“多久前活跃”状态之后的 `公司 · 招聘岗位` 身份行应仅取圆点左侧作为公司名称；`工作地址` 后的首条地址内容应作为地点，二者均不得从职位搜索卡片推断。
12. 页面将同一中文词或标点拆分为多个文本节点时，JD 展示应合并其中的人工换行和多余空白；该规范化不得改写、补充或删除实际 JD 内容。

## Confirmed decisions

- MVP 只包含“保存岗位到工作台”和“为当前岗位生成打招呼话术”。
- 所有读取、保存、生成和复制均由用户主动触发。
- 生成复用 F-003 API 与 Provider，不创建第二套 Agent 逻辑。
- 不做爬虫与自动投递。

## Affected contracts

- `specs/contracts/api-conventions.md`：补充插件调用现有 API 的跨源/来源字段约束。
- `specs/contracts/agent-tools.md`：明确插件只能触发既有受控 preview，不具备外部副作用。

## Risks and open questions

- 招聘网站 DOM 变化频繁，提取器必须按站点适配且始终提供手工表单回退。
- 本地工作台未运行、CORS 或端口变化需提供清晰连接状态。
- 真实招聘站点使用应遵循其规则；不实现规避反爬或自动化动作。

## F-005B：网申填写助手（确认纳入 F-005）

### Goal

用户在企业网申页面主动打开插件并选择资料档案后，插件仅用本地规则识别安全字段并填写空白输入框；无法可靠识别的字段留给人工处理，绝不自动提交表单。

### In scope

- 工作台新增用户确认的结构化网申资料档案：基本信息、教育、工作经历、项目、技能/语言/证书、校园经历/获奖和常见日期范围。
- 插件 popup 让用户选择资料档案与填写范围，并在主动点击“开始识别”后读取当前页面可见表单字段。
- content script 只用本地字段名称、label、placeholder、input type、select option 等规则匹配字段；默认只填空字段，跳过已有内容。
- 填写后在 popup 展示已填、跳过、无法确认、敏感字段等报告，供用户逐项检查。
- 日期控件、重复经历区块或字段归属不能可靠确定时不填写，标记人工处理。

### Additional exclusions

- 不自动提交、点击下一步、填写密码/验证码/银行卡/证件号码、敏感声明、文件上传或隐私授权。
- 不读取 Cookie、浏览历史、表单中已有的用户输入，也不上传完整简历正文用于匹配。
- MVP 不使用 AI 处理未知字段；未知项全部留给用户。真实 Provider 以后仅可给出建议，不可直接填写。

### Additional acceptance criteria

9. 用户可在工作台维护结构化资料档案，并显式选择其用于当前一次网申填写。
10. 插件仅填充明确匹配且当前为空的非敏感字段；已有值、敏感字段、未知字段和不可靠日期控件必须跳过。
11. 用户可看到每个字段的“已填/跳过/需手动处理”结果及原因；插件不会自动提交或点击网申页面控件。
12. 字段匹配、填写和报告在当前 tab 内、用户主动触发后进行；插件不保存页面表单内容或完整简历文本。

13. 本地规则必须将输入字段分类并输出“已填/因已有内容跳过/因敏感字段跳过/需手动处理”之一；规则报告不得包含页面原有输入值。
14. 密码、验证码、证件号、银行卡/支付、隐私或法律声明/同意、文件上传及密码/文件类型控件一律跳过；重复经历、日期、选项不明确或映射重复的字段一律留给人工处理。
15. MVP 只允许对姓名、手机号、邮箱、所在城市等唯一且高置信的基础字段产生待填写建议；规则模块自身不得读取 DOM、写入 DOM、发送网络请求或保存浏览器存储。
16. popup 打开后可仅读取资料档案列表以供用户选择；在用户明确选择档案并点击“识别并填写当前页面”前，扩展不得读取任何表单控件、传递档案字段或写入页面。填写前必须再次确认字段仍为空，且只能派发 `input`/`change` 事件。
17. 本地 fixture 必须验证：安全空字段被填写、已有值不被覆盖、敏感/日期/选择/未知字段被跳过或标记人工处理；过程中没有表单提交、按钮点击、上传或页面跳转。

### Confirmed web-application field categories

- 基本信息：姓名、手机号、邮箱、所在城市。
- 教育：学校、专业、学历、在校时间。
- 工作：公司、岗位、工作时间、经历描述。
- 项目：名称、角色、时间、描述。
- 其他：技能、语言、证书/资格、校园经历、获奖、常见日期及日期范围。

### F-005B data-profile decision

- MVP 支持当前用户维护多份命名的结构化网申资料档案，例如“前端开发·大厂版”“AI 前端·国央企版”；用户在插件中明确选择本次使用的档案。
- 每份档案可带方向/场景标签，但不自动从完整简历导入、同步或覆盖；档案仅在用户于工作台明确点击保存时持久化，插件在后续填写任务中按需读取本次选中的档案字段，不存储页面内容。

## Verification record

- 2026-08-11: User manually accepted current-job extraction, multi-profile creation/switching and the local application-form fixture fill flow.
- 2026-08-11: `web/corepack pnpm typecheck` passed; `extension/corepack pnpm test` passed 5/5; `extension/corepack pnpm build` passed.
- 2026-08-11: Production manifest assertion confirmed only `activeTab`, `scripting`, `clipboardWrite` and the localhost workbench host permission. No persistent content script, background execution, Cookie/history/storage permission or recruitment-site host permission is present.
- 2026-08-11: The profile API response minimization assertion confirmed that `userId`, `createdAt` and `updatedAt` are not returned to the extension.
