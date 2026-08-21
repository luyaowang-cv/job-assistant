# F-032 Tasks

- [x] T-001: 更新 F-032 规格与受影响契约。Verify: 规格含范围、排除项与可测试验收标准。
- [x] T-002: 调整投递列表的公司/岗位排版、渠道与投递列。Verify: 模板为 Job.url 有值时的新标签链接、无值时占位符，链接阻止行点击冒泡。
- [x] T-003: 完善网申档案 fill-context 和 AI 字段边界。Verify: `pnpm test:form-fill` 3/3 通过，覆盖经历长文本、日期和单选字段。
- [x] T-004: 将插件话术输入改为工作台简历版本选择。Verify: popup 不存在简历 textarea，构建产物从 `/api/v1/resumes` 选择并提交 ResumeVersion.content。
- [x] T-005: 让插件将完整空白可编辑表单字段交给 AI 并应用文本/选项结果。Verify: `pnpm test` 15/15 通过，经历、自我评价和日期字段进入 AI fallback，radio-group 可应用。
- [x] T-006: 完成 Web/extension 构建和静态界面验收并记录结果。Verify: `pnpm typecheck`、Web `pnpm build`、extension `pnpm build`、定向 ESLint 与 `git diff --check` 通过；按用户要求未使用浏览器自动化。

## Verification results

- Web: `pnpm typecheck` passed; `pnpm test:form-fill` passed (3 tests); `pnpm build` passed. Nuxt emitted only existing Browserslist age, Nitro virtual storage resolution and Node deprecation warnings.
- Extension: `pnpm test` passed (15 tests); `pnpm build` passed; generated Chrome MV3 manifest version is `0.2.0`.
- Static quality: changed Web TypeScript/Vue files passed targeted ESLint; `git diff --check` passed (Git only reported expected LF-to-CRLF working-copy notices).
- Visual automation: not run because the user explicitly requested not to use agent-browser.
