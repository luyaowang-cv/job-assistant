# F-024 Implementation Plan

## Scope

在 F-023 composition 上增加个人照片、共享 A4 HTML renderer、预览与 Chromium PDF，以及“JD + 已授权卡片”的 AI variant 预览/确认闭环。数据库只扩展 PersonalProfile 照片字段；版式配置继续存入 composition.config。

## Sequence

1. 固化领域/API/Agent 契约。
2. 扩展照片字段、上传/读取 API 和校验。
3. 建立共享 `A4_DENSE_V1` render model、HTML/CSS、分页和溢出检测。
4. 暴露草稿预览和已保存版本 PDF 导出，检测 Chrome/Edge executable。
5. 接入不外发数据的本地 grounded JD 适配 preview，签名确认后新建 immutable variants/events；外部 Provider 延后到具体目的地知情同意后启用。
6. 重塑 `/resumes`：A4 画布、照片、岗位、AI diff、PDF 导出。
7. 执行迁移、测试、lint/typecheck/build 和 PDF 渲染检查。
8. 收紧 A4 信息层级：抬头对称居中、教育多记录单标题与顶部主蓝线、实习/工作独立区块；经历卡保持原白底，仅采用参考卡的信息布局，标题行读取角色/组织/时间，下一行读取技术栈，成果短前缀确定性加粗。

## Risks and mitigations

- 分页漂移：预览/PDF 共用 HTML/CSS 和浏览器分页脚本，字体就绪后测量。
- Chromium 缺失：检测环境变量、Chrome/Edge 常见路径并返回可操作错误。
- AI 幻觉：prompt 限定 facts、Zod 校验、warnings 与显式确认。
- 图片隐私：5MiB 白名单、文件签名检查、二进制专用 GET，档案 DTO 只返回 metadata。
- 历史污染：variant 和 ResumeVersion 仅新增。

## Verification

执行 Prisma 生成/迁移、照片/渲染/AI 测试、typecheck、lint、build；生成样例 PDF 检查 A4 MediaBox、页数、文本与截图。
