# F-005 Browser Extension Contract

## Permissions and activation

- The Chromium extension uses only `activeTab`, `scripting`, `clipboardWrite`, and the local workbench host permission `http://127.0.0.1:3000/*`.
- No recruitment-site host permission, content script, background polling, cookie access, or history access is allowed.
- Page reading, workbench writes, greeting generation, and clipboard copies are each initiated by an explicit user click.

## Current-job capture and greeting

- The extension reads text nodes from the current tab only after a click. It excludes `input`, `textarea`, `select`, `option`, `button`, `script`, and `style`, so existing form values are neither read nor sent.
- Capture must select a bounded job-detail section using site-specific detail selectors first and visible semantic anchors (such as `职位描述` / `职位要求`) second. It must never use all visible page text as the JD fallback. JD extraction ends before a subsequent section such as `招聘者`、活跃状态、App/沟通引导、`工作地址`、推荐岗位或页脚。
- `companyName`、`jobTitle` and `location` may be prefilled only from a direct detail selector or one unambiguous nearby label/value pair. On BOSS detail pages, the visible identity line immediately after the recruiter status (`在线`、`刚刚活跃`、`今日活跃` 或明确的“多久前活跃”) has the form `公司 · 招聘岗位`; only its left side is an allowed company candidate. `工作地址` 的首条内容 is an allowed location candidate. Ambiguous candidates, including search-result cards and navigation text, must leave the field blank for manual entry.
- `salaryMin` and `salaryMax` use the existing Application API's integer yuan-per-month fields. They may be prefilled only from an unambiguous salary range such as `20-30K`; obfuscated icon-font text, annual packages and unclear units remain blank and editable.
- JD whitespace normalization is deterministic: it may collapse text-node whitespace and join whitespace that splits adjacent Chinese characters or Chinese punctuation, but must not paraphrase, infer, add or remove JD facts.
- Before it calls `POST /api/v1/applications`, it displays editable `companyName`, `jobTitle`, `location`, `salaryMin`, `salaryMax`, `jobUrl`, and `description`. Only the explicit save click creates an Application through the existing Zod-validated API and its normal event record.
- A greeting preview calls the existing `POST /api/v1/applications/:id/materials/preview` only for an Application saved by the current popup session. `resumeText` exists only in popup memory and the one preview request; it is not sent to a persistence API or extension storage.
- The extension never automatically fills, clicks, sends, submits, or saves anything on a recruitment page.

## Failure behavior

- Capture failure leaves the editable fields available for manual entry and does not retry automatically.
- API failures are shown in the popup with a recoverable message; no hidden fallback request is made.

## F-005B local application-form rules

- The local rule module is a pure, deterministic function. It receives only a field descriptor (`id`, visible label, `name`, `placeholder`, input `type`, option labels and a boolean `hasValue`) plus the user-selected ApplicationProfile. It must not receive, retain or report the existing field value.
- For F-007, the page-side scan derives `visible label` in this order: explicitly associated or wrapping `label`; `aria-labelledby`/`aria-label`; a short label element in the nearest supported form-item container (`.el-form-item`, `.ant-form-item`, `.form-item`, `.form-group` or table row); then a short, visible adjacent label-like element. It removes decorative required markers and trailing colons. Arbitrary long container text, page text and input values are never label sources. A missing or ambiguous label remains unnamed and is never made eligible for automatic filling.
- Each field is classified as `basic`, `education`, `work`, `project`, `skill`, `language`, `certificate`, `campus`, `award`, `date`, `sensitive` or `unknown`. A plan entry is exactly one of `filled`, `skipped_existing`, `skipped_sensitive` or `needs_manual`, with a human-readable reason.
- Only a single, unambiguous, high-confidence basic mapping is eligible for the later fill step: full name, mobile phone, email, residence city, country/region, gender, WeChat ID, political status, document type or age. Age is calculated only from a valid full `YYYY-MM-DD` birth date in the selected profile, using the local current date. A basic mapping may fill a blank text-like control, or a native non-multiple `select` only when exactly one option's visible text equals the value after whitespace/punctuation normalization. Radio/checkbox controls, custom dropdowns, multi-selects, fuzzy option matches, expected-work-location selectors, education blocks, date controls and any duplicate target mapping remain `needs_manual`.
- Password, verification code/CAPTCHA, bank/payment, privacy or legal declaration/consent, upload/file and any password/file input are excluded when indicated by the field's own label, name or placeholder. In the local personal-use mode, identity and emergency-contact facts are candidate-profile data: explicit labels use a local rule first, then AI may use the saved value if still unresolved. Existing values are always `skipped_existing` before a fill value is considered.
- The report contains field metadata, status and reason. It never contains pre-existing form values, does not persist page fields, and does not trigger any DOM mutation; T-005 alone may apply `filled` plan entries after the user clicks Start.

## F-005B profile selection and controlled fill

- The popup fetches `GET /api/v1/application-profiles` only to populate the user-visible profile selector. It keeps the list in popup memory, does not use extension storage, and does not request a profile until the user explicitly clicks “识别并填写当前页面”.
- That profile response is data-minimized: it includes only the selected-profile identifier, name, tags and structured fill fields, never an internal user identifier or audit timestamps.
- For F-006, those structured basics and educations are already resolved by the workbench's common-profile inheritance service. The extension never reads the PersonalProfile endpoint directly and continues to use only its safe local filling whitelist.
- On that click, `chrome.scripting.executeScript` runs in the active tab under `activeTab`. It enumerates visible `input`, `textarea` and `select` controls and returns only safe descriptors; it never returns input values. No persistent content script or recruitment-site host permission is introduced.
- The popup computes the plan locally, then injects a second explicit script call with only `filled` field ids and selected-profile values. Immediately before setting a value, the page-side script rechecks that the field is still empty. For an eligible native `select`, it rechecks one exact option match, sets only that option and dispatches `input` and `change` events. It never clicks controls, scrolls, submits, performs a fuzzy selection, uploads a file or advances a page.
- The popup reconciles the page-side outcome with the plan and renders the four report states. A field that became non-empty between scan and fill is reported as `skipped_existing`; a disappeared field is `needs_manual`. Neither result exposes the old page value.
- The fixture used for manual verification contains blank high-confidence F-006 common-data fields, an already-filled field, sensitive controls, date/select controls and an unknown field. Its expected outcome is recorded beside the fixture; it is not a live recruitment website.

## F-010 one-click AI fill

- Clicking “填写” may submit the selected profile id and safe, empty visible field descriptors to the local workbench AI mapping API. It never submits pre-existing field values, HTML, cookies, Key material or browser history.
- The AI may suggest ordinary text, textarea, date and native single-select values. Before mutation, the page side rechecks the element is still blank. Existing and hard-excluded controls (password, verification, payment, files, privacy/legal consent, checkbox and radio) are neither sent to AI nor changed.
- Applied fields receive a transient inline light-green background. Eligible fields with no AI suggestion or no applicable option receive light-red background. Existing and excluded fields receive no color mutation. The extension never submits, navigates, uploads or sends a message.

## F-011 resolved candidate data and local complete fill

- 用户选择“网申档案”并点击填写后，扩展只能读取服务端返回的已解析 `localFacts` 与 `aiContext`；不得自行拼接个人主档案、缓存敏感资料或将资料写入 extension storage。
- 对姓名、教育、联系方式、人口信息、证件号码和紧急联系人等具有明确标签的空字段，扩展先用 `localFacts` 的确定性语义映射填写；报告只显示“已本地填写”，不回显其值。
- 未被本地规则解决的空字段可提交给 AI，且请求使用完整 `aiContext` 与安全 descriptors。请求始终不含页面已有值、DOM/HTML、Cookie 或浏览器状态。
- 仍禁止自动提交、点击同意/声明、支付、上传文件、发送消息与页面跳转。

## F-012 Formily fields

- 对 Formily 表单，扫描器以最近 `.ud-formily-item`（以及通用 `*-formily-item` 变体）作为局部范围，只从其标签容器中的 `label`、`.ud-formily-item-label-content` 或 `.ud-formily-item-label` 获取短字段标签；不得用整个表单或页面文字猜测。
- 对每一条写入建议，页面侧必须在派发 `InputEvent`、`change` 和 `blur` 后验证控件当前值。值未保留的字段不得报告为已填写，须标记为不可应用并高亮为红色。

## F-013 personal-document paired controls

- 当同一“个人证件”或等价共享标签关联一个原生单选 `select` 和一个文本输入框时，扩展仅将 `documentType` 映射到 `select`，并仅将 `documentNumber` 映射到文本输入框；不得把证件类型文字写入号码输入框。
- 原生 `select` 仍须满足唯一精确选项匹配；号码缺失、控件非原生或标签无法明确关联时，保持 AI/人工处理而不猜测。

## F-014 choice controls

- 扩展可将同一可见 radio group 作为一个字段扫描，描述符只包含外围字段标签、可见选项文字与是否已有已选项。对明确的“性别”字段，仅当保存的性别与一个唯一可见选项精确匹配时，才可点击该选项；点击后必须确认对应原生 radio 已选中。
- 对明确的“期望工作地点”或等价标签，扩展可将个人档案 `targetCities` 的第一个值作为有序首选项。原生 `select` 或已支持的 Element 风格单选下拉框只能选择一个唯一精确可见选项；后者必须在显式填写操作中打开、等待选项面板、点击选项并确认控件显示所选值。
- 选择控件写入失败、没有唯一精确选项、已有选择、multi-select/cascader 或非支持组件均须报告为未填/已有内容，不得猜测、提交、导航或点击协议、上传、支付与验证码控件。

## F-015 ATSX / Universe Design Formily controls

- 对最近 `.ud-formily-item`（及其通用 `*-formily-item` 变体），扫描器可在其局部范围内将非空 `data-form-field-i18n-name`、随后 `data-form-field-name` 作为字段标签；这些属性仅用于本地语义匹配，不得回传页面已有值或任意 HTML。

## F-023 resolved composed-profile context

- 扩展仍只调用用户明确选择的 ApplicationProfile fill-context。服务端优先从 current ApplicationProfileVersion 的 resolved view 生成 localFacts/aiContext；无新版本时允许 legacy adapter 回退。
- 扩展不得直接调用素材库、variant、迁移 preview、影响分析、同步、事件或历史版本 API，不得把 resolved 内容写入 extension storage 或日志。
- F-023 不新增浏览器权限、后台轮询、招聘站点 host permission 或自动提交能力。现有只填空字段、写前复检与禁止提交规则保持不变。
- `.ud__select`、`input[role="combobox"][readonly]`、multi-select、异步搜索、级联与日期选择器一律不得由扩展点击或填写；它们保持人工处理。扩展也不得点击 selector 的清除按钮。
