# F-004 Implementation Plan

## Architecture approach

`/resumes` 是本地单用户的简历资产页。服务端保证每位用户只有一个 `Resume`，其基础内容位于首个 BASE `ResumeVersion`。后续针对岗位的版本使用 TARGETED 类型、关联 Application、记录 AI 初稿和用户确认内容；不更新历史版本。

```text
Resume center → save base version
Resume center + selected Application/JD + optional evaluation
  → Mock resume optimization preview (no write)
  → user edits → explicit Create ResumeVersion
  → version history / copy / derive again
```

## Contract changes

- Prisma `Resume`、`ResumeVersion`、`ResumeVersionType` 与 Application 可选关联。
- Zod 基础简历、预览、版本保存和版本响应 schemas。
- API：读/建基础简历、版本历史、定制预览、保存派生版本。
- `ResumeOptimizationProvider` Mock Adapter 与 LangGraph 受控节点。

## Implementation sequence

1. 数据模型、迁移与 local-user 基础简历空状态。
2. Zod/服务层，确保一个基础简历、版本不可覆盖、归属与岗位 JD 校验。
3. Mock 优化 Provider：抽取 JD、保留基础简历事实、生成完整草稿与修改摘要。
4. Resume API 与预览/保存分离。
5. 增加简历优化页面与导航入口。
6. 验证版本链、隐私提示、Mock 边界、lint/typecheck/build。

## Risks and mitigations

- 误覆盖：版本更新 API 不存在；编辑历史只能“另存为新版本”。
- 多基础版本：服务端以 userId 唯一约束 Resume，BASE 只允许创建一次。
- 虚构内容：Provider 输出必须同时带事实依据；Mock 只组合已有文本和 JD。
- 全文数据风险：保存仅在明确操作时进行，页面显示本地持久化提示。

## Verification strategy

- migration deploy、重复 seed、唯一基础简历约束。
- API：空基础简历、无 JD/越权岗位、preview 无版本写入、保存创建派生版本、历史倒序、不可覆盖。
- Mock：provider/model 固定、无网络、草稿含内容/摘要/依据。
- UI：基础简历保存、岗位选择、预览编辑、另存版本、复制与历史查看。
