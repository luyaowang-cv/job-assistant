# F-024 固定 A4 卡片简历与 PDF

## Goal

把 F-023 已确认的个人档案和素材卡版本组合成固定、紧凑、可预览的 A4 简历；支持证件照、基于岗位 JD 的受约束 AI 文案候选，以及只从已保存版本导出的 PDF。

## Decisions

- 只提供 `A4_DENSE_V1`，不建设自由排版或富文本编辑器。
- 页面 210mm × 297mm，页边距 12mm；卡片使用固定视觉语言和可变内容高度。
- 个人信息和照片来自 `PersonalProfile`；正文来自 composition 固定的 `MaterialCardVariant`。
- 抬头采用左右等宽占位的对称三栏：姓名和个人信息按整张 A4 居中，证件照固定右侧。教育背景只显示一个区块标题，包含全部院校记录，并在区块上方使用主蓝分隔线。
- `INTERNSHIP` 与 `WORK` 分别渲染为“实习经历”和“工作经历”；卡片结构化开始/结束时间显示在标题行右侧，标签不渲染。
- 经历卡维持模板原有白色纸张底色，不复制参考图的浅蓝底；仅采用其信息布局：标题在左，角色/组织/时间在右，技术栈独立一行，成果逐点显示并将短“标签：”前缀加粗。同一区块多张卡只显示一次区块标题。
- 按完整卡片分页，最多三页；不能容纳时明确报错，不静默裁切。
- 工作台只暴露 PDF；旧 Markdown API 仅作兼容。
- 首期岗位适配使用本地 grounded 排序器：只重排所选 variant 的完整原句，不外发数据、不新增事实。preview 零写入；确认后只创建新 immutable variant。外部模型适配器必须在用户明确知晓具体目的地和载荷并同意后另行启用。

## Acceptance criteria

- AC-01：固定 A4 边界、12mm 边距和模板标识在桌面/窄屏可辨认。
- AC-02：姓名、联系方式、教育和卡片使用紧凑中文简历层次，无明显无意义大空白。
- AC-03：JPEG/PNG/WebP 照片可预览并进入 PDF；非法、损坏或超过 5MiB 被拒；档案 JSON 不返回照片字节。
- AC-04：分页不裁切卡片；超过三页时保存/导出前显示溢出错误。
- AC-05：PDF 只从当前用户已保存 ResumeVersion 生成，返回 `application/pdf` 且零数据库写入。
- AC-06：无 JD、无 AI Key、Provider 故障和非法输出均不产生 variant。
- AC-07：AI prompt 不包含未授权素材、浏览器状态或照片。
- AC-08：AI preview 返回短期签名 token；confirm 校验 token、归属和选择，为每项创建新 variant/event。
- AC-09：建议不得新增 facts 未提供的量化结果、时间、组织、技术或奖项；返回证据和 warnings。
- AC-10：旧 variant/ResumeVersion 不原地更新；照片更新只影响读取当前 PersonalProfile 的渲染。
- AC-11：PDF 含照片和全部可见卡片，文字可选择，页数与预览一致。
- AC-12：schema、服务、API、渲染、AI 确认和导出有自动化检查，lint/typecheck/build 通过。
- AC-13：两条及以上教育记录共用一个“教育背景”标题；姓名/联系方式按 A4 内容区居中、照片保持右侧；教育区顶部有主蓝线。
- AC-14：素材表单不出现原始 JSON 编辑器，实习/工作分开选择，经历时间可录入并进入预览/PDF；标签用途有可见说明且标签不进入 PDF。

## Non-goals

多模板市场、自由画布、坐标级编辑、DOCX/Markdown UI 导出、OCR 导入、AI 自动确认或编造经历。

## References

- Vibe Resume 固定 HTML/CSS 与 Chromium PDF 思路（MIT）：https://github.com/LiuMengxuan04/vibe-resume
- ASu Skills 高密度简历工作流思路（MIT）：https://github.com/Hisn00w/ASu-skills
- Magic Resume JSON 仅作字段映射参考，不复制其受限许可实现：https://github.com/JOYCEQL/magic-resume
- 用户确认的类型化素材卡视觉参考：`artifacts/素材卡片.png`
