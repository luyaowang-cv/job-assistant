# F-032 Implementation Plan

## Architecture approach

保持现有 Job/Application 数据模型不变：投递表直接渲染 `application.job.url`。插件通过现有工作台 API 获取网申档案和简历版本；确定性规则优先填写明确基础字段，其余空白可编辑字段统一交给服务端 AI preview，并由页面桥接层应用结果。

## Contract changes

- 明确 Application 列表中的 Job.url 是投递入口，并保证岗位库与插件共用此字段。
- 扩展 form-fill descriptor 支持日期、单选和普通可填写字段，不再按经历类别或多选标记整体拒绝请求。
- fill-context legacy 回退加入全部保存的经历分类；当前组合版本继续提供 blocks/references。
- 插件话术生成由用户选择 ResumeVersion，调用既有材料 preview API 时提交其 content。

## Implementation sequence

1. 更新规格与契约。
2. 调整投递列表列结构、链接点击行为和公司/岗位排版。
3. 完善 fill-context legacy 数据，并放宽 form-fill Zod 边界与提示词。
4. 更新插件 UI、档案/简历加载、AI 字段选择和结果合并。
5. 补充或更新 schema/rules 测试，运行构建与界面检查。

## Risks and mitigations

- 行点击与链接冲突：链接显式阻止冒泡并保留原生新标签行为。
- AI 输出无事实依据：服务端提示词要求仅使用 profile，Zod 校验 fieldId/value 且过滤未声明字段。
- 招聘站点控件变化：仅操作扫描时存在且填写时仍可见、可编辑的控件，失败项进入报告。
- 弹窗信息密度：保持三个任务卡片，使用明确标签、加载态与结果摘要，不新增装饰性组件。

## Verification strategy

- 运行 Web schema 测试、typecheck 和 build。
- 运行 extension test 和 build。
- 对看板列顺序、链接行为和插件档案/简历选择做本地浏览器验收；检查键盘可达、标签与反馈文案。
