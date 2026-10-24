# 给一家新网站做适配

目标：**30 分钟内让一家新站点的关键字段填对，并且以后改规则不会悄悄把它弄坏。**

适配不是"写一套该站点的映射"，而是三件事：拿到页面的真实结构 → 用通用规则跑一遍 → 把这家站点**必须成立**的几条结论固化成夹具。

## 步骤

### 1. 导出结构（2 分钟）

在目标网申页面点插件页脚的「导出当前页字段结构」，把复制到的 JSON 存成：

```
docs/diagnosis-scripts/dumps/<站点>.json
```

命名用「平台-租户」，例如 `dayee-gszq.json`、`beisen-zhiye-camzhaopin.json`。同一平台的另一家公司是**另一份**文件——字段名与区块结构由客户配置，不通用。

### 2. 手写期望（10 分钟）

新建 `<站点>.expect.json`：

```json
{
  "site": "大易 · gszq.hotjob.cn",
  "dump": "dayee-gszq.json",
  "profile": "example-profile.json",
  "expect": [
    { "id": "0::form-field-1", "key": "basics.targetCity", "value": "北京市" },
    { "id": "0::form-field-46", "status": "needs_manual", "why": "现月薪没有可填的档案值" }
  ]
}
```

挑 5–10 条，覆盖三类：

- **必须填对的**（姓名、学校、公司、起止时间）
- **必须不填的**（他人字段、敏感字段、档案里没有的事实）
- **容易认错的**（同名重复字段、区块标题缺失的那一块）

**期望必须手写，不能从当前输出倒推。** 倒推出来的夹具只能证明"今天的行为等于今天的行为"，改坏了它也会一起改。

### 3. 跑（1 分钟）

```bash
node --test extension/lib/site-fixtures.test.js
```

失败信息会直接说哪一条不对、实际是什么、原因是什么。

### 4. 修（10 分钟）

按失败原因分三种：

| 现象 | 改哪里 |
|---|---|
| 字段名认不出（「企业名称」当不成公司） | 规则别名表 `RULES[].aliases` |
| 整块认错段落（教育块被当成证书） | `SECTION_HINTS` |
| 认出来了但选不中选项 | `OPTION_ALIASES` |
| 同名字段串位 | 先看 `ANCHOR_KEYS` 有没有覆盖这个区块的锚点字段 |

**改别名与标记词，不改判定逻辑。** 逻辑一动，所有站点一起受影响；夹具只能证明这几家没坏。

### 5. 全量回归（2 分钟）

```bash
cd extension && node --test lib/*.test.js
node docs/diagnosis-scripts/replay-dump.mjs docs/diagnosis-scripts/dumps/beisen-zhiye-camzhaopin.json docs/diagnosis-scripts/dumps/example-profile.json
```

`filled` 计数不得低于改动前。

## 什么时候该改代码

- 同一个现象在**三家以上**站点重复出现 → 是通用规则缺了一个维度（F-048 的归属层就是这么来的）。
- 只有一家 → 加别名，别动逻辑。

## 现在覆盖的站点

| 站点 | 夹具 | 状态 |
|---|---|---|
| 北森 · camzhaopin.zhiye.com | `beisen-zhiye-camzhaopin` | ✅ 7 条期望 |
| 北森 · jlcehr.zhiye.com（社会招聘，无区块标题） | `beisen-jlcehr` | ✅ 7 条期望 |
| 大易 · gszq.hotjob.cn | 待补 | 结构已导出，期望未写 |
