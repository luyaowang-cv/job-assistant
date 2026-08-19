# F-005 Implementation Plan

## Architecture approach

F-005A 用 WXT 构建最小 Chromium 插件：popup 由用户触发，content script 一次性读取当前可见页面中的岗位详情主体，调用工作台已有 API。提取器先使用受限的岗位详情选择器，再以“职位描述/职位要求”到“招聘者/活跃状态/App 引导/工作地址/推荐岗位/页脚”的语义边界回退；公司、职位、地点与薪资仅在局部证据唯一时预填。BOSS 的公司采用 `在线`、`刚刚活跃`、`今日活跃` 或明确的“多久前活跃”状态后的 `公司 · 招聘岗位` 身份行左侧，地点采用“工作地址”后的首条内容。JD 在写入 popup 前执行确定性的文本节点空白规范化，合并拆开的中文词和标点而不改变内容。薪资范围统一转换为元/月；无法可靠解析的图标字体或模糊单位不填。

F-005B 新增工作台结构化 `ApplicationProfile`，由用户主动编辑保存。插件不发送完整简历，只将所选 profile 的必要字段经 `chrome.scripting` 传给当前 tab 的本地规则填写器。填写器按 label/name/placeholder/type 规则评分，只填空的、高置信非敏感字段；所有其他字段生成报告。

```text
User opens popup → select profile → explicit Start
  → content script observes current visible fields once
  → local match rules → fill safe empty fields
  → report filled/skipped/manual items
```

## Contract changes

- T-004 rule contract: a pure field-descriptor-to-fill-plan module; it emits only `filled`, `skipped_existing`, `skipped_sensitive` or `needs_manual`, keeps existing values out of its input/report, and permits only unique high-confidence basic fields.
- T-005 execution contract: popup reads the selected profile only on Start, dynamically injects scan/apply calls under `activeTab`, rechecks emptiness before write, and reconciles a value-free outcome report.
- T-006 privacy contract: profile list and mutation responses are projected to user-facing profile fields only; internal ownership and audit metadata never cross the API boundary to the extension.
- Prisma: ApplicationProfile 一对多归属当前 User；每份有唯一名称与方向标签，基本信息、教育、工作、项目与其他类别使用经 Zod 校验的 JSON 子结构保存。
- API: profile 读写；插件调用 API 的来源/权限约束。
- Extension: 最小 permissions `activeTab`, `scripting`, `clipboardWrite`, localhost host permission；无 background scraping。

## Implementation sequence

1. 先完成 F-005A：WXT scaffold、popup、当前页岗位手工确认保存、F-003 打招呼预览/复制。
2. 增加结构化网申资料档案与编辑 UI/API：支持多份命名档案，用户在工作台显式保存，随后在 popup 明确选择一份读取。
3. 编写可单测的字段分类、敏感字段阻断、规则匹配和填写报告模块。
4. 接入 content script 与 popup，按用户操作在当前 tab 执行。
5. 用本地静态企业表单 fixture 验证；不把真实招聘站点自动化作为测试前提。

## Risks and mitigations

- 网申表单差异：T-004 先产出纯函数填写计划；仅姓名、手机、邮箱、城市四种唯一高置信字段可进入待填写集合。重复区块、日期和下拉选项均以“需手动处理”报告，待 T-005 连接 DOM 时仍不扩大此范围。
- DOM 多样性：规则匹配采用保守阈值，失败即人工处理；不得把整页文本作为 JD 回退，避免导航、搜索结果和页脚污染。
- 误填：仅填写空字段、仅明确字段、敏感 blocklist 优先；不覆盖、提交或点击。
- 隐私：不读 Cookie/历史/已有内容，不持久化页面字段；profile 只在本地数据库。
- 本地服务不可用：popup 显示连接状态与可恢复提示。

## Verification strategy

- A local fixture exercises safe fields, existing values, sensitive controls, date/select controls and unknown fields; expected report counts and no-submit behaviour are checked manually after the extension build.
- profile CRUD 与单用户隔离。
- 规则单测覆盖中文/英文字段、日期、已有值、敏感字段、未知字段与重复区块。
- fixture E2E 验证填写报告和零自动提交。
- 插件构建、权限审计、手工 Chrome 加载验证。
