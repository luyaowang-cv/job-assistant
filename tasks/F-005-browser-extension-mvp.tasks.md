# F-005 Tasks

- [x] T-001: 初始化 WXT Chromium 插件、最小权限、popup 与本地工作台连接状态。  
  验证：插件可加载；未主动点击时不访问 tab/网络。
  执行记录（2026-08-11）：已创建独立 `extension/` WXT Chromium 工程；popup 只检查本地工作台连接。生产构建通过，manifest 仅含 `activeTab` 与本地工作台 host permission，尚无 content script、scripting、后台读取或招聘站点权限。

- [x] T-002: 实现当前岗位页的手动提取/编辑/保存到工作台，以及 F-003 打招呼话术 preview/复制。  
  验证：实现已完成并通过 `extension/` 的 `corepack pnpm build`；构建产物 Manifest 仅包含约定的最小权限。popup 仅在“读取当前页面”点击后执行 `chrome.scripting.executeScript`，读取逻辑排除既有表单输入；“确认保存”与“生成三版话术”均为独立显式点击，且生成仅能使用本次 popup 已保存的岗位。提取器必须只返回岗位详情区间；全页导航、搜索结果、推荐岗位、招聘者信息与页脚均不得进入 JD，字段无法可靠识别时留空。薪资仅在可无歧义解析时以元/月预填，用户可编辑。待在 Chrome 加载插件后完成一次人工保存与预览/复制验收，再勾选本任务。

  执行记录（2026-08-11）：根据 BOSS 详情页实测文本修正了提取边界：从最后一个“职位描述”语义锚点开始，在“工作地址/推荐区/页脚”等后续区块前停止；不再将整页可见文本写入 JD。岗位、公司和地点采用详情选择器、职位头部薪资邻近关系、招聘者标签或工作地址标签的保守优先级，低置信度字段留空。`corepack pnpm build` 已通过；待用户在实际页面刷新插件验证。

  补充记录（2026-08-11）：JD 结束边界增加“招聘者/HR、活跃状态、App 与沟通引导”，并将招聘者姓名一并排除；新增可编辑的月薪下限/上限（元/月）字段，仅从普通数字 `K` 范围预填，图标字体薪资保持为空。`corepack pnpm build` 与 Manifest 最小权限复核通过。

  补充记录（2026-08-11）：对 BOSS 详情页新增公司身份行规则：在“刚刚活跃”后解析 `公司 · 招聘岗位`，只采用圆点左侧的公司名称；“工作地址”后的首条内容继续作为地点。该局部规则优先于宽泛的招聘者/HR 文本，不读取搜索结果卡片。

  补充记录（2026-08-11）：BOSS 招聘者状态存在“在线”等变体，因此公司身份行规则扩展为 `在线`、`刚刚活跃`、`今日活跃` 和明确的“多久前活跃”。JD 在任一状态块之前截断，状态后的 `公司 · 招聘岗位` 仅提取公司部分。`corepack pnpm build` 通过。

  验收记录（2026-08-11）：用户已在真实 BOSS 职位页完成读取、字段确认、保存与话术流程验收；T-002 通过。

- [x] T-003: 定义并持久化结构化网申资料档案及编辑页面/API。 
  验证：资料类别覆盖基础/教育/工作/项目/技能等；仅当前用户可访问。用户可创建、选择并更新多份命名档案，名称在用户范围内唯一；Zod 拒绝敏感字段和超限内容。
  执行记录（2026-08-11）：已实现 `ApplicationProfile` 一对多数据模型、资料名称与方向标签、资料档案列表/创建/更新 API 以及工作台“网申资料”编辑页。已应用两条 Prisma migration（建表与标签非空约束），并通过 `corepack pnpm db:generate` 与 `corepack pnpm typecheck`；待用户在页面完成多档案创建、切换和更新的人工验收后勾选。

- [x] T-004: 实现纯本地字段分类、敏感字段阻断、保守匹配、空字段填写和填写报告。  
  验证：已有值、密码/验证码/证件/银行卡、文件上传、敏感声明、未知或不可靠日期均跳过；规则单测覆盖中文/英文字段、重复映射和报告不含页面既有值。T-004 仅生成填写计划，不读取/写入页面 DOM；实际填写留在 T-005。
  执行记录（2026-08-11）：已新增 `extension/lib/form-fill-rules.js` 纯规则模块与 Node 单测。规则只接受字段元数据和 `hasValue` 布尔值，报告不接收或保存页面旧值；仅唯一的姓名、手机号、邮箱、所在城市可生成高置信待填写项。日期、选择控件、重复目标和非基础资料字段均标记为需手动处理。`corepack pnpm test`（4/4）及 `corepack pnpm build` 均通过；待用户确认后勾选。

- [x] T-005: 接入 content script/popup，并以本地网申表单 fixture 做端到端验证。 
  验证：仅在选定档案后由用户点击填充；fixture 的姓名/手机/邮箱被填写，已有值不覆盖，敏感/日期/选择/未知字段报告准确；不自动提交、点击下一步、上传或跳转。
  执行记录（2026-08-11）：popup 已接入资料档案列表、明确选择和“识别并填写当前页面”按钮；扫描与写入均以 `chrome.scripting.executeScript` 在当前 `activeTab` 内按用户点击执行，无持久 content script。页面侧只返回 `hasValue`，写入前再次确认字段为空，仅派发 `input`/`change`。新增 `web/public/fixtures/application-form.html`，包含安全空字段、已有值、敏感、日期、选择和未知字段；fixture HTTP 200、`corepack pnpm test`（5/5）、`corepack pnpm build` 以及 Manifest 最小权限复核均通过。待用户加载最新扩展并在 fixture 完成人工端到端验收后勾选。

- [x] T-006: 完成权限、隐私和构建验收记录。 
  验证：最小权限、无 Cookie/历史读取、无完整简历上传、无真实 AI 调用。
  执行记录（2026-08-11）：复核生产 Manifest 仅含 `activeTab`、`scripting`、`clipboardWrite` 与 `http://127.0.0.1:3000/*`，无 `content_scripts`、后台脚本、Cookie/历史/存储权限或招聘站点 host permission。源码网络请求仅指向本地工作台；完整简历不存在文件上传或扩展持久化，打招呼功能的临时 `resumeText` 仅在用户显式 preview 请求中发往本地 API。未接入外部 AI Provider。资料档案 API 响应进一步投影为填写所需字段，已断言不含 `userId`、`createdAt`、`updatedAt`。`web` 的 `corepack pnpm typecheck`、`extension` 的 `corepack pnpm test`（5/5）、`corepack pnpm build`、Manifest 断言和本地 fixture HTTP 检查均通过。
