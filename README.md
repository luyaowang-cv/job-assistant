# Offer来（Job Assistant）

> 一个面向个人秋招的求职管理系统：用 Web 工作台沉淀机会、投递、材料与复盘，用 Chrome 插件降低岗位录入成本，并用受控的 AI 工作流（LangGraph.js）辅助准备简历与面试。

## ✨ 核心功能

### 1. 投递管理 —— 清楚每一个机会的进展

- **投递看板**：按阶段（待投递 / 已投递 / 笔试 / 面试 / Offer 等）看板式管理，拖拽流转状态，一眼看清"投了哪些、卡在哪一步"
- **岗位库**：通过 Excel 或飞书文档同步岗位，集中查看公司、岗位、地点、行业、公告、投递入口与更新时间
- **岗位详情与投递衔接**：在详情弹窗中查看内推码、投递注意事项和公司介绍，并一键加入投递面板
- **浏览器插件**：浏览招聘网站时一键采集岗位与 JD，省去逐条手抄的录入成本
- **岗位评估**：AI 结合你的个人画像，评估岗位匹配度，辅助"要不要投"的决策

### 2. 材料准备 —— 一份事实，多处复用

- **个人画像**：教育、实习、项目、技能等基础信息集中维护一次，自动继承到简历、网申、面试材料里，避免重复填写
- **简历中心**：HTML 简历 + A4 固定排版渲染，支持多版本管理与版本删除
- **素材库 & 组合文档**：把经历拆成"素材卡片"，按目标岗位自由组合成文档，一份素材应对多个岗位

### 3. AI 辅助 —— 受控地帮你填表、优化

- **一键表单填充**：先用本地规则从选中的网申档案直接填写，覆盖基础信息、教育、实习/工作、项目、技能、校园、奖项、证书、语言九个板块；未命中的字段再按板块与记录**分批**交给 AI，逐批写入并回读校验，某批失败不会牵连已经填好的内容。支持 Ant Design / Element / Formily 等组件库的下拉与日期控件、开放 Shadow DOM，以及同源与已授权 ATS 域名的 iframe
- **开放性问题回答**：遇到「职业规划」「为什么选择我们公司」这类开放题，基于选中的网申档案生成可直接复制的回答，支持连续追问；档案里没有的信息会留 `【】` 占位，不替你编造
- **简历优化**：基于你的真实经历优化表达，坚持"不虚构经历、技能或数据"
- **BYOK AI 配置**：在设置页配置自己的 API Key（服务端加密存储），兼容 OpenAI 等接口，AI 全程经 Zod 校验的工具读写数据

> 填表的边界：只填空白字段、**不覆盖已有内容**；密码、验证码、银行卡、隐私授权勾选等敏感字段**一律跳过**；**永不自动提交**，提交前由你逐项核对。

### 4. 面试准备 & 复盘

- **面试准备**：基于岗位 JD + 你的简历 / 项目 / 实习事实，生成结构化复习资料
- **面试复盘**：结构化记录每场面试的问题与表现，沉淀成可追溯、可复习的知识库

## 🤖 Agent 工作流

岗位评估、简历优化和面试准备共享岗位 JD、个人偏好、简历素材与投递状态等上下文。岗位评估通过 LangGraph.js 编排 `JD 解析 → 偏好匹配 → 简历证据映射 → 差距识别 → 优先级评估 → 建议生成`，输出经 Zod 校验；自由对话采用流式响应，重要内容遵循预览、确认与版本留痕。

> 设计原则：**不做自动投递、不做批量爬取**。AI 只帮你推进真实的下一步，不虚构经历或数据（详见[产品宪章](specs/product/product-constitution.md)）。

## 🖥 界面预览

### 工作台

| 首页看板 | 投递看板 |
| :---: | :---: |
| ![首页看板](docs/images/home1.png) | ![投递看板](docs/images/投递看板.png) |

| 岗位库 | 网申档案 |
| :---: | :---: |
| ![岗位库](docs/images/岗位库.png) | ![网申档案](docs/images/网申档案.png) |

| 素材库 | 简历版本 |
| :---: | :---: |
| ![素材库](docs/images/素材库.png) | ![简历版本](docs/images/简历版本.png) |

| 面试准备 | 首页 |
| :---: | :---: |
| ![面试准备](docs/images/面试准备.png) | ![首页](docs/images/home2.png) |

### 浏览器插件

| 岗位采集 | 一键填表 |
| :---: | :---: |
| ![岗位采集](docs/images/插件岗位.png) | ![一键填表](docs/images/插件填写.png) |

## 🧰 技术栈

| 层 | 技术 |
| --- | --- |
| Web 前端 | Nuxt 4 · Vue 3 · TypeScript · Element Plus · UnoCSS · Pinia |
| 服务端 | Nuxt Server Routes（Nitro）· Zod 校验 |
| 数据 | PostgreSQL 16 · Prisma |
| AI | LangChain.js · LangGraph.js（Provider Adapter 接入，兼容 OpenAI 等） |
| 浏览器插件 | Chrome Manifest V3 · WXT · 原生 TypeScript（无 UI 框架） |
| 包管理 | pnpm |

## 🚀 快速开始

> 需要 Node.js ≥ 20、pnpm、Docker（用于本地数据库）。

```bash
# 1. 启动 PostgreSQL
docker compose up -d

# 2. 安装依赖
cd web && pnpm install

# 3. 配置环境变量（复制示例后填你自己的值）
cp .env.example .env

# 4. 初始化数据库
pnpm db:generate
pnpm db:migrate

# 5. 启动开发服务
pnpm dev
```

打开 <http://localhost:3000> 即可看到工作台。

### 浏览器插件

```bash
cd extension
pnpm install
pnpm build
```

然后打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 **`extension/.output/chrome-mv3`**。

> 开发时加载这个目录，之后每次 `pnpm build` 都会重写它，Chrome 会自动重载扩展——**改插件不需要重新加载或部署**。只有改 `web/` 的服务端代码才需要重新部署。

插件通过 `host_permissions` 申请已知 ATS 厂商（北森、Moka、飞书招聘、Workday、Greenhouse 等）的域名：`activeTab` 只能访问顶层页面的 origin，而很多公司的招聘页会把网申表单**嵌在这些厂商的跨域 iframe 里**，没有常驻权限就完全看不到。没有申请 `<all_urls>`。

## 🔬 测试

```bash
cd web
pnpm test:profiles        # 投递画像
pnpm test:resume-a4       # A4 简历渲染
pnpm test:interview-prep  # 面试准备
pnpm test:ai-workflows    # AI 工作流
pnpm test:jobs            # 岗位导入与飞书字段解析
pnpm test:form-fill       # 网申填写（schema + Provider）
pnpm test:open-question   # 开放性问题回答
```

插件侧的匹配规则、分批与跨帧逻辑是纯函数模块，单独跑：

```bash
cd extension
pnpm test                 # node --test lib/*.test.js
```

## 📁 项目结构

```
job-assistant/
├── web/          # Nuxt 工作台（前端 + Server API + Prisma）
├── extension/    # Chrome 浏览器插件（WXT）
├── specs/        # 产品宪章、领域契约、功能规格（F-xxx）
├── docs/         # 设计系统、研发文档、调研
├── commands/     # 研发流程命令（spec/plan/tasks/verify）
└── docker-compose.yml  # 本地 PostgreSQL
```

## 📜 研发流程

每个功能遵循 `Spec → Contracts → Plan → Tasks → Implement → Verify`，没有验收标准、受影响契约和验证方案的需求不落地。

## 🧭 后续规划

当前版本已完成个人求职工作台的核心闭环，项目暂时进入阶段性维护。以下方向会在后续迭代中按实际需求逐步完善，不代表已经实现：

- **数据源管理**：支持在界面中维护多个飞书岗位源、同步记录、失败重试和字段映射预览。
- **岗位去重与合并**：完善跨来源同公司、同岗位识别，提供冲突提示和可控合并能力。
- **投递推进提醒**：围绕下一步日期、笔试和面试安排增加提醒与逾期提示。
- **检索与统计**：补充组合筛选、保存视图以及投递阶段、转化率和来源效果统计。
- **材料联动**：让岗位、简历版本、网申档案和面试准备之间形成更清晰的引用关系。
- **多用户与账号体系**：邮箱登录、数据隔离与公开注册已实现（F-042 / F-043），后续补邮箱验证、找回密码与防滥用。
- **部署与运维**：已公网部署（Caddy 终止 HTTPS、CI 构建镜像、数据库备份），后续补监控告警与回滚流程。
- **体验与工程质量**：继续优化移动端、键盘操作、无障碍、错误恢复、自动化测试和部署文档。

项目仍坚持不做自动投递和批量爬取；涉及外部数据写入、删除或 AI 生成的关键操作都应保持用户可见、可确认、可追溯。

## License

[MIT](LICENSE)
