# F-041: 素材文案版本确认覆盖

## Goal

当用户为同一素材卡片保存一个已存在名称的文案版本时，系统不再只提示“版本已存在”。而是明确询问是否覆盖；用户确认后更新该版本正文，取消则不写入任何数据。

## User scenarios

1. 用户在一张素材卡片中输入“网申版”，名称尚不存在时，保存后创建新的文案版本。
2. 用户再次输入已存在的“网申版”并修改文案时，页面提示“该版本已存在，是否覆盖旧版本？”。点击“覆盖”后，原版本保留同一 ID 和名称，正文更新为新内容。
3. 用户在覆盖确认框点击取消时，页面保持正在编辑的名称与文案，不创建或修改任何版本。
4. 已被简历或网申引用的版本在用户明确确认覆盖后，引用仍固定指向同一版本 ID，因此后续读取会显示新的正文；系统不自动创建或同步任何文档版本。

## In scope

- `POST /api/v1/material-cards/:id/variants` 的输入新增 `overwrite` 布尔值，默认 `false`。
- 服务端在同一卡片存在同名 variant 时，仅在 `overwrite=true` 下更新原记录的 `content`；默认继续返回稳定的冲突错误。
- 覆盖写入沿用 `MATERIAL_UPDATED` 审计类型，entity 为 `MaterialCardVariant`，payload 只记录卡片、版本名称与覆盖动作，不记录正文。
- 素材库界面在提交前检测同名版本并显示确认框；确认时提交 `overwrite=true`，取消时不发送请求。

## Out of scope

- 不新增版本删除、重命名、卡片合并或跨卡片覆盖。
- 不覆盖简历、网申档案或其组合版本；它们保留原有引用 ID，仅因该 ID 的正文被用户明确覆盖而在后续读取中显示更新结果。
- 不新增数据库表、自动改写其他同名版本，或使 AI 生成的版本自动覆盖用户版本。

## Acceptance criteria

1. 同一卡片不存在同名版本时，保存行为与现有创建完全一致。
2. 同名版本且未传 `overwrite=true` 时，API 返回 `409 MATERIAL_VARIANT_NAME_EXISTS`，不修改版本内容。
3. 同名版本且 `overwrite=true` 时，服务端验证当前用户和未归档卡片归属后更新同一条 variant 的 `content`，不创建新 variant 或重定向已有引用。
4. 覆盖成功写入一条 `DocumentMutationEvent(type=MATERIAL_UPDATED, entityType=MaterialCardVariant)`，payload 不包含文案正文。
5. 前端只在用户确认“覆盖旧版本”后发送覆盖请求；取消或关闭确认框不写入。
6. `pnpm test:materials`、`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。

## Affected contracts

- `specs/contracts/api-conventions.md`
- `specs/contracts/domain-model.md`

## Risks and open questions

- 覆盖会改变所有指向该 variant ID 的文档在后续读取时的正文。确认框必须明确提醒此影响，覆盖也必须始终是用户显式动作。
- 旧版本的 `createdAt` 保持原值；本次不新增“版本编辑历史”，审计事件是本次覆盖的可追溯记录。

## Verification results

- 2026-08-27：`pnpm test:materials`（6 项）、`pnpm typecheck`、`pnpm lint`、`pnpm build` 全部通过。
- 已重启本地生产服务。对不存在卡片以合法 `{ name, content, overwrite: true }` 请求版本保存接口，返回 `404 MATERIAL_CARD_NOT_FOUND`（而非未知字段校验错误），确认生产路由已接受显式覆盖参数；未修改任何用户素材。
