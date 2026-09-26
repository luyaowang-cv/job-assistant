# F-034 Implementation Plan

## Architecture approach

在页面桥接层生成稳定且按 DOM 排序的字段描述，使用邻域标签消除重复字段歧义。服务端将复杂 resolved document 转为紧凑候选人证据视图。应用阶段先处理自定义选择与单选，再处理普通输入，使依赖字段有机会解锁。

## Contract changes

- descriptor.context 明确可包含页面位置、同名序号和相邻字段标签。
- fill-context 在档案无显式简历时使用当前 BASE ResumeVersion 作为补充，只读且不回写 profile.resumeVersionId。
- Universe Design 自定义单选下拉进入支持范围。

## Implementation sequence

1. 更新规格和契约。
2. 重构字段扫描顺序与邻域上下文。
3. 扩展 UD 下拉应用并调整选择/文本执行顺序。
4. 压缩 AI profile prompt，加入 BASE 简历回退。
5. 补测试、构建插件和 Web，重启后台服务并做 API 回归。

## Risks and mitigations

- 点击错误选项：只接受唯一精确归一化文本匹配。
- 动态表单 ID 变化：仍以同一次扫描的 DOM index 为主；先选后填不主动创建新行。
- prompt 过长：只传填写所需事实字段，移除 composition 审计元数据。

## Verification strategy

- 扩展纯函数测试验证分类；增加扫描/应用代码静态断言测试。
- 服务端测试验证 BASE 回退所需 schema/service 类型。
- 用实际本地 fill-context 和代表性 descriptors 调用 preview，确认学院/项目等返回 fills。
- 运行 typecheck、ESLint、Web build、extension build 和 `git diff --check`。
