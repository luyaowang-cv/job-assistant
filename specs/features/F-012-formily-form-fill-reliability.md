# F-012: Formily 网申表单识别与写入可靠性

## Goal

让扩展能够可靠识别 Formily 组件库中视觉相邻但未通过原生 `for` 关联的标签与输入框，并在实际写入失败时准确报告原因。

## User scenarios

1. 用户在带有 `.ud-formily-item-label` 标签容器的网申页点击“填写”。
2. 扩展将“姓名”“邮箱”“手机号码”等 Formily 标签正确归属到对应输入框，并用个人档案的本地资料优先填写。
3. 如网站的受控输入框拒绝写入，扩展不会误报成功，而会将该字段标为需手动处理并保留红色提示。

## In scope

- 将 `.ud-formily-item` 及其常见 `*-formily-item` 变体纳入最近表单项识别。
- 仅从该表单项内的 `.ud-formily-item-label label`、`.ud-formily-item-label-content` 等短标签文本提取字段名。
- 增强输入写入：使用原生 value setter、`InputEvent`/`change`/`blur`，并在写入后读取当前控件值确认结果。
- 为 Formily fixture 与本地规则添加姓名、邮箱、手机号、学校等回归测试。

## Out of scope

- 不读取页面已有输入值并发送给 AI。
- 不自动提交、上传、勾选协议、支付或处理验证码/密码。
- 不为网站注入持久内容脚本或新增站点权限。

## Acceptance criteria

1. `.ud-formily-item-label` 内的“姓名”等标签可被扫描并与同一表单项的输入框关联。
2. 个人档案中已有的姓名、邮箱、手机号和教育字段在 Formily fixture 中由本地规则写入，并显示绿色。
3. 写入后控件值不等于预期值时，不计入成功、显示红色并在报告中说明控件未接受写入。
4. 扩展测试与构建、Web typecheck 通过；用户在目标官网确认姓名和邮箱填写成功。

## Affected contracts

- `specs/contracts/browser-extension.md`
