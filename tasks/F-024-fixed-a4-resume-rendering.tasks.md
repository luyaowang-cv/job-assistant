# F-024 Tasks

- [x] **T-001 — 固化规格与契约**：定义固定模板、照片、AI preview/confirm、PDF 与不可变边界。
- [x] **T-002 — 扩展照片持久化与迁移**：增加可空 mime/bytes/updatedAt，迁移不改写既有 JSON。
- [x] **T-003 — 实现照片 API**：上传、读取、删除及格式/大小校验。
- [x] **T-004 — 实现共享 A4 renderer**：固定尺寸/边距、紧凑卡片、照片、整卡分页、最多三页。
- [x] **T-005 — 实现草稿预览**：校验 composition 并返回 HTML/布局诊断，零写入。
- [x] **T-006 — 实现 PDF Provider/API**：仅导出已保存版本，等待分页，拒绝溢出，零写入。
- [x] **T-007 — 实现本地 grounded variant preview**：只读取授权 variant 与 JD，完整原句重排，不外发、不新增事实。
- [x] **T-008 — 实现签名 confirm**：短期 token、选择校验、幂等创建 variants/events。
- [x] **T-009 — 重塑简历工作台**：A4、照片、岗位适配 diff、保存版本和 PDF。
- [x] **T-010 — 自动化与视觉验证**：迁移、测试、静态检查、A4/PDF 验证并回填。

- [x] **T-011 — 修复 Nuxt 开发态依赖互操作回归**：将 Element Plus 要求预构建的 CommonJS/共享依赖声明为直接依赖，清理旧 Vite 缓存并验证简历页。
- [x] **T-012 — 收紧抬头、教育与类型化经历版式**：抬头按 A4 对称居中且照片固定右侧；教育多记录单标题并增加顶部主蓝线；实习/工作独立标题；经历卡保持原白底，按参考布局渲染角色、组织、时间、技术栈和加粗成果前缀。

## Verification record

| Date | Task | Command/scenario | Result | Notes |
|---|---|---|---|---|
| 2026-08-16 | T-001 | Spec and affected contracts | Pass | F-024 feature, plan and tasks created. |
| 2026-08-16 | T-002/T-003 | `prisma migrate deploy/status` and photo signature tests | Pass | Migration 13/13 applied; JPEG/PNG/WebP sniff and 5MiB limit covered. |
| 2026-08-16 | T-004–T-008 | `pnpm test:resume-a4`, real preview/PDF API | Pass | 3 tests pass; pageCount 1, overflow false; PDF HTTP 200. |
| 2026-08-16 | T-009/T-010 | typecheck, lint, F-023 regressions, Nuxt build | Pass | Build exited 0; A4/PDF routes present in Nitro output. |
| 2026-08-16 | T-010 | PDF/HTML render inspection | Pass | MediaBox 594.96×841.92 pt, one page, ToUnicode fonts; screenshot in artifacts. |
| 2026-08-16 | T-011 | Nuxt dev dependency interoperability regression | Pass | Declared `dayjs@1.11.13` and `lodash-unified@1.0.3` directly; `/resumes` HTTP 200; Vite optimized Day.js with CommonJS interop; typecheck, lint and resume tests pass. |
| 2026-08-16 | T-012 | Tailored A4 header, education and material-card renderer | Pass | Two educations render one heading; centered identity/photo grid, blue education divider, internship/work labels, structured meta/stack and bold bullet-prefix assertions pass; production build and local HTTP checks pass. |
| 2026-08-17 | T-012 | Restore original resume-card background | Pass | Removed the borrowed light-blue gradient while preserving the approved information layout; renderer test asserts transparent background and no gradient; typecheck and lint pass. |
