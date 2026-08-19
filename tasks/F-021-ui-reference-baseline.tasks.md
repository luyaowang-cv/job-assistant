# F-021 Tasks

- [x] T-001: 核对当前 UI 样式的构建入口与旧文件引用。  
  Verify: Nuxt 仅引入 `assets/scss/index.scss`，旧 `ui-system.scss` 和 `ui/` 目录无引用。
- [x] T-002: 建立唯一 UI 开发基准文档。  
  Verify: 文档包含 token、尺寸、结构和操作层级。
- [x] T-003: 移除未接入构建的旧 UI 样式文件。  
  Verify: Sass 编译通过，仓库不再存在旧入口。
