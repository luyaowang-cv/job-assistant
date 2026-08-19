# F-011 Implementation Plan

## Architecture approach

以 `PersonalProfile` 作为唯一的候选人事实来源，以 `ApplicationProfile` 表达投递策略，以 `ResumeVersion` 表达对外展示内容。服务端提供一个仅供扩展填写使用的完整已解析视图。扩展先执行本地语义规则，再把未解决的空字段和完整候选人资料交给现有 AI preview API。

## Contract changes

- 扩充个人主档案 schema/API，增加人口信息、证件和紧急联系字段，并定义教育主记录的推导字段。
- 收敛网申档案 schema/API：投递偏好、申请回答和 `resumeVersionId` 替代重复的个人固定资料。
- 新增已解析网申档案读取 DTO，包含完整主档案、投递策略和默认简历版本；页面既有值、DOM、Cookie 和浏览器状态不得包含其中。
- 更新扩展填写契约：本地规则优先填写明确字段；AI 可使用完整主档案处理未解决字段。

## Implementation sequence

1. 定义字段归属及 Zod 契约，补充迁移兼容策略。
2. 迁移 Prisma schema 和服务层，提供已解析候选人资料 DTO 与归属校验。
3. 调整工作台导航、个人主档案和网申档案页面；将网申档案中的固定资料改为只读继承提示。
4. 更新扩展的本地自动填写、AI 字段裁剪和结果报告。
5. 添加 fixture、服务层与 schema 测试，执行真实官网人工验收。

## Risks and mitigations

- 资料误迁移：采用新增字段、兼容读取、用户显式保存确认的策略；不批量删除旧 JSON 数据。
- 非预期页面信息传递：服务端只生成用户主档案、网申档案、简历版本和无值字段 descriptors；测试断言页面既有值、DOM、Cookie 和浏览器状态不出现在请求体。
- 简历版本未建立：允许网申档案暂不关联版本，但填写报告提示“未关联默认简历版本”，不阻断主档案填充。

## Verification strategy

- 单元测试：解析继承、教育推导、ResumeVersion 归属、AI context 脱敏和本地敏感字段映射。
- API/schema 测试：拒绝未知字段、跨用户 resumeVersionId 和页面表单值。
- 迁移测试：预置旧 ApplicationProfile 后执行迁移，确认记录数量和现有字段不减少。
- 扩展 fixture：验证姓名/教育/内推码/身份证/紧急联系人自动填写，并验证 AI 请求不含页面既有值、DOM、Cookie 或浏览器状态。
