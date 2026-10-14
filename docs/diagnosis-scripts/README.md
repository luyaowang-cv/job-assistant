# 诊断脚本（2026-10-12）

配套 `docs/extension-fill-diagnosis-2026-10-12.md`。三个脚本用的都是仓库里的**真实模块**，没有重写任何逻辑；改完代码后可以重跑它们确认修复。

| 脚本 | 证明什么 | 运行方式 |
| --- | --- | --- |
| `contract-check.mjs` | contenteditable 的 `controlType: "div"` 会打出 400；模型输出越界（多字段 / 值超 4000 字）会让整批作废 | `cd web && npx tsx ../docs/diagnosis-scripts/contract-check.mjs` |
| `form-plan-check.mjs` | 报告里那些怪标签（"女"/"北京市"/"年"…）为什么落到"字段含义无法可靠确认" | `node docs/diagnosis-scripts/form-plan-check.mjs` |
| `date-role-check.mjs` | 日期分片框只有 `name` 里带 role+单位才填得上（`dateUnit` 分支是死代码） | `node docs/diagnosis-scripts/date-role-check.mjs` |
| `replay-dump.mjs` | 把「导出当前页字段结构」的 JSON 喂给真实规则表，看**不调模型**时每个字段会得到什么结论 | `node docs/diagnosis-scripts/replay-dump.mjs <dump.json> [profile.json]` |
| `apply-failure-probe.js` | **不是 Node 脚本**，是粘到网申页 console 的三段探针：定位"AI 已给出建议，但页面控件未能应用"到底是哪一种原因，以及核对"是/否"单选组有没有被静默答错 | 浏览器 F12 → Console，见文件内 STEP 1/2/3 |
| `card-reference-plan-check.mjs` (2026-10-14) | 网申档案里"字段引用素材卡"那条链路的端到端检查：把 composition.references 按 localFacts 的形状喂给真实规则表，看 19 个框（基础/实习/项目/科研/校园/证书）能不能拿到卡片的名称、角色和文案 | `node docs/diagnosis-scripts/card-reference-plan-check.mjs` |

`dumps/` 放各家 ATS 的真实页面结构（只含控件属性，不含已填的值）：

- `beisen-zhiye-camzhaopin.json` — 北森 iTalentX（`camzhaopin.zhiye.com`），2026-10-13，88 个控件里保留仍为空的部分 + 已填的区块锚点与结束时间（"至今"的归属要靠它们）。
- `example-profile.json` — 配合回放用的示例档案，故意在实习 1 与项目 1 上留空结束时间，用来验证「至今」勾选/不勾选两条分支。

`replay-dump.mjs` 会先做一处**重建**：北森把选中的值放进控件自己的 `<label>`，所以旧 dump 里的 label 常常是值而不是名。当 context 以 label 开头并把 label 重复成值时，真名取 context 开头那一段。这只在回放时用来近似"修好后的扫描器"，不是扫描器本身。


`contract-check.mjs` 需要能 `import zod`，所以要在 `web/` 目录下运行；另两个脚本无外部依赖，任意目录都行。

回归基线：`cd extension && node --test lib/*.test.js` → 124 passed（2026-10-14；其中四条是"素材卡引用""招聘来源""科研经历"的回归测试，跟着 `card-reference-plan-check.mjs` 一起加的）。改动规则表/段落表之后，建议再跑一次 `replay-dump.mjs` 对真实北森 dump，确认新段没有抢走原有字段。下面这些问题都是**测试没覆盖到的路径**，不是测试坏了。

页面 DOM 层面的确认（标签具体来自哪个分支、空下拉误判范围）需要真机网申页，用报告附录 A 的 console 脚本。
