# F-034: 上下文感知的完整网申填写

## Goal

让插件在字节招聘等 Formily/Universe Design 网申页面中正确识别重复经历字段、操作自定义下拉，并充分使用工作台已有档案与基础简历。

## User scenarios

- 同一页面有多组“公司名称 / 起止时间 / 描述”时，AI 根据页面顺序、相邻标签和档案经历顺序逐组填写。
- 字节招聘的 Universe Design 下拉框可选择学历、学校、期望地点、信息来源等已有选项。
- 网申档案未显式绑定简历版本时，插件仍可使用当前用户的基础简历作为补充事实来源。
- 选择控件解锁后续输入框时，插件先应用选择，再填写文本。

## In scope

- 扫描结果保持 DOM 顺序，并为 descriptor 添加页面序号、同名序号与相邻字段上下文。
- 去除 `.ud__select` 的硬编码不可编辑限制，支持打开和精确匹配其选项。
- AI 填写阶段不预先丢弃暂时 disabled 的字段，并按“选择控件优先、文本控件随后”应用。
- 服务端将 resolved profile 压缩为面向填写的 basics、educations、strategy、experiences、sections、resumeContent 上下文。
- ApplicationProfile 未绑定 ResumeVersion 时回退读取当前用户 BASE ResumeVersion；显式绑定仍优先。

## Out of scope

- 不创建招聘页面尚未渲染的经历卡片行。
- 不自动勾选“无实习经历”或隐私协议。
- 不对不存在于工作台事实中的内推码、竞赛、证书或自我评价进行编造。
- 自定义下拉仅做唯一精确文本匹配，不做模糊点击。

## Acceptance criteria

- 扫描 descriptor 的返回顺序与 DOM 控件顺序一致；重复标签包含 `同名字段 n/m` 和相邻字段提示。
- `.ud__select` descriptor 在未禁用时 `isEditable=true`，应用器可点击 UD 容器并匹配可见 option。
- AI 选择结果先于文本结果应用；初始 disabled 文本字段也可获得 AI 建议，并在解锁后填写。
- 题述档案上下文包含 2 条教育、2 条实习、2 个项目，并在无显式 resumeVersionId 时包含 BASE 简历正文。
- 代表性学院、导师、项目名称和项目描述请求产生非空 fills；空白自我评价仅在简历确有相关事实时填写，否则 unresolved。
- 插件测试、服务端测试、类型检查和两端构建通过。

## Affected contracts

- `specs/contracts/browser-extension.md`
- `specs/contracts/api-conventions.md`
- `specs/contracts/domain-model.md`

## Risks and open questions

- 招聘站点组件类名可能变化；实现同时支持 `.ud__select`、`.el-select`、ARIA combobox/option，并对未唯一匹配的选项保持不操作。
- 基础简历回退属于当前用户已保存资料，且只在用户明确点击 AI 填写后作为 preview 输入；不新增持久化或外部自动提交。
