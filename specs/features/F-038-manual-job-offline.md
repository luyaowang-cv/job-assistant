# F-038: 岗位手动下线

> **已废止（2026-10-16）**：手动「下线」改成了按用户的「不合适」标记——写 `JobDecision` 而不是
> `Job.manualOfflineAt`，入口从独立按钮改成操作列的「标记为…」下拉框，开关文案改为「显示已隐藏」。
> 废止原因：`manualOfflineAt` 写在共享的 `Job` 上，一个用户标了下线，其他账号登录也看不见这条岗位，
> 而岗位是飞书同步来的公共数据、判断是个人数据。
>
> 现行规则见 `specs/contracts/domain-model.md`（`ApplicationStatus` 一节与 F-020）与
> `specs/contracts/api-conventions.md`（F-020 API）；界面行为见 `F-035`。
> `Job.manualOfflineAt` 字段与索引保留仅为回滚，新代码不得读写。
> 以下内容是当时的设计，保留作历史记录。

## Goal

允许用户把不合适的岗位手动放到下线区，默认岗位库隐藏这些岗位，勾选“显示已下线”后仍可查看，同时让操作列中的下线和加入面板按钮保持一致对齐。

## User scenarios

- 用户判断岗位不合适后点击“下线”，确认后该岗位从默认列表消失。
- 用户勾选“显示已下线”后，可以看到来源下线和手动下线的岗位及下线时间。
- 用户点击岗位所在行打开详情，操作列仅用于下线或加入面板。
- 后续再次同步飞书来源时，手动下线状态不会被同步覆盖。

## In scope

- Job 增加独立的手动下线时间，和来源同步产生的 `offlineAt` 分开保存。
- 新增经 Job ID Schema 校验的手动下线 API，并记录审计事件。
- 默认岗位查询同时排除来源下线与手动下线；`includeOffline=true` 返回两类记录。
- 岗位库操作列依次显示同规格的下线、加入面板按钮，不设置查看按钮。

## Out of scope

- 本次不提供恢复上线按钮。
- 不改变飞书同步判断来源岗位下线/恢复的规则。
- 不改变工作地点的包含筛选；选择“北京”继续匹配地点文本中包含“北京”的全部岗位。

## Acceptance criteria

- 默认查询不返回 `offlineAt` 或 `manualOfflineAt` 非空的岗位。
- `includeOffline=true` 可返回手动下线岗位，页面显示“已下线”和对应时间。
- 手动下线通过事务同时更新 Job 和写入 `JOB_MANUALLY_OFFLINED` 审计事件。
- 同步逻辑只维护来源 `offlineAt`，不会清空 `manualOfflineAt`。
- 操作列依次为下线、加入面板，两个按钮使用相同的小号高度和固定间距；宽度按按钮文案自适应并保持单行，不得裁切或溢出；点击按钮不会触发行点击。
- 地点筛选继续使用不区分大小写的包含匹配。
- Prisma 校验、岗位测试、typecheck、lint 和 build 通过。

## Affected contracts

- `specs/contracts/api-conventions.md`：增加岗位手动下线端点和 `manualOfflineAt` 返回字段语义。
- Prisma `Job` 增加 `manualOfflineAt`；`DocumentMutationType` 增加 `JOB_MANUALLY_OFFLINED`。

## Risks and open questions

- 手动下线与来源下线可能同时存在；展示时间优先使用手动下线时间，数据层保留两者。
- 当前不提供恢复操作，避免误恢复已经被来源同步判定为下线的岗位。
