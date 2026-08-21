# F-033 Tasks

- [ ] T-001: 更新 F-033 规格和契约。Verify: 明确自然语言与日期均可接受。
- [ ] T-002: 修改 availableDate Zod 校验和页面文案。Verify: 题述 payload 通过 schema。
- [ ] T-003: 补充自然语言、日期、空值和超长边界测试。Verify: `pnpm test:profiles` 通过。
- [ ] T-004: 构建、重启服务并验证实际 API 保存。Verify: PUT/GET 返回“可立即到岗”。
