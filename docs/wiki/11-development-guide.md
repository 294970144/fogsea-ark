# 11 · 开发指南

## 环境

- 任意现代浏览器（Chrome / Edge / Safari 最新版）；
- 可选：Node.js（只用于跑回归测试与发版脚本，游戏本身不需要）；
- 本地起服务：`python -m http.server 8000`，或直接双击 `index.html`。

没有 `npm install`，没有构建，改完刷新页面即生效。

## 代码风格

项目有一套相当一致的约定，跟着写能少很多摩擦：

1. **每个文件开头 `'use strict'`**，无模块、无 `import`。
2. **紧凑写法**：短函数常压成一行，`if` 不加大括号的情况很多。目的是让 700 行的文件能一眼扫完。
3. **中文注释解释「为什么」**，不解释「是什么」。例如「牌库洗牌走独立随机流：牌库张数会随设计调整，若共用 Math.random 会连带打乱刷怪序列」。
4. **单一数据源**：数值只在 `03-data.js` 登记一次，其余派生。
5. **声明式优先**：新卡行为尽量用字段（`dmg/radius/status/draw/...`）表达，不在 `applyFuse` 里堆 `if (id===...)`。

## 新增一张卡牌

完整流程见 `docs/做新卡牌流程.md`，这里给代码视角的清单。

### 1. 定义卡面（`03-data.js` 的 `CDEFS`）

```js
mycard: {
  id:'mycard', kind:'instant', target:'point', shape:'point',
  name:'我的牌', icon:'burst', color:'#ffb454',
  cost:{wood:6}, radius:2.0, dmg:40,
  desc:'...', brief:'...', w:12, wNonMage:8
}
```

- `kind`：`build` / `instant` / `utility` / `class`；
- `target`：`point` / `self` / `pick`；
- `shape`：决定命中范围与图鉴标签（`single/multi` 是索敌型，`global` 全屏，`consume` 消耗层数）；
- 没有 `q` 会自动补成 1（普通）。

### 2. 进奖励池

`poolIds()`（`04-state:131-143`）会自动把符合条件的卡纳入奖励池。排除规则：`fuseOut`、`cls==='class'`、`core`、非法师的法师牌、满上限的扩容、到顶的拆解、第 4 座法力之井。**多数卡不需要改这里**，只要 `w > 0`。

### 3. 音效登记

如果卡面写了 `sfx:'xxx'`，必须在 `01-audio.js` 的 `sfx()` switch 里加 `case 'xxx':`。否则 C0 体检会报「音效未登记」。

### 4. 特效登记

- `FX.cast('xxx', ...)` 的 id 必须在 `09b-fx.js` 里有分支，或在 `BUILD_THEME` 里；
- 法术牌的 `fx` 字段走 `FX.spell` 的 id 分派。

C0 会对这两类做源码扫描。

### 5. 起始牌库（可选）

如果开局就要有，加进 `STARTER_DECK`。注意这张表决定 R33 的断言，改了要同步。

### 6. 图鉴

带 `CDEFS` 定义的普通卡会**自动**被 `CODEX` 的 `CARD_IDS.map` 收进图鉴，不用手工加。纯刻印 (`sigilOnly`) 会被排除，走刻印分类。

标签由 `cardTags(d)` 自动派生：填对 `elem/shape/status/heal/draw/knock/sigil` 就有对应标签。

### 7. 跑测试

```bash
node tests/regression.js --new-card   # C0 接线体检
node tests/regression.js              # 全套
```

如果 R0 挂了，先看是不是动到了随机序列（见 [10 测试体系](10-testing.md)）。

## 常见坑

### `parentElement` 在测试里不存在

回归的 DOM 桩只有 `parentNode`，没有 `parentElement`。业务代码里用 `el.parentElement` 会在测试中抛 `Cannot set properties of undefined`。优先用静态 HTML 属性或 `parentNode`。

### 不要在启动期调用 `Math.random`

`00-core` 的存档槽段、`genWorld` 的地形生成、牌库洗牌，都有明确的随机源约束。在这些地方加 `Math.random` 会改变 R0 基线。

### `const` 全局对象不能重新赋值

`P/S/DECK/res` 被无数闭包引用。读档、重置、清场都必须 `Object.assign` / `_putObj` / `_putArr` 原地改，不能 `P = {...}`。

### 拖拽阈值

点击与拖拽靠 7px 位移区分（`05-input:106`）。改这个值时同时检查「点选出牌」是否还灵敏。

### 手牌上限与回收闸门

进入夜晚/黎明前 `overflowBlock` 会拦人。新加「自动收牌」逻辑时要考虑这个闸门，否则玩家会被卡在超限状态。

## 调试入口

| 手段 | 用法 |
| --- | --- |
| 作弊码 | 暂停时依次键入 `l3131`，切换雾爆伤害 ×10、范围 ×10（`04-state:13`、`05-input:11`）。只在控制台与音效上反馈，页面无入口 |
| 特效后端 | `FX._dbg.backend` 查看当前是 `webgpu` / `webgl` / `none`；`FX._dbg.pools` 看粒子池 |
| 存档 | DevTools → Application → Local Storage，直接看 `arkmist_v3` / `arkmist_slots_v1` |
| 清档 | 删掉这两个键并刷新，回到全新状态 |
| 主循环 | 在 `loop(now)` 里打断点会每帧暂停，建议改用条件断点或 `console.count` |

## 发版

项目用 `scripts/release.py`（**未入库**，`.git/info/exclude` 里有 `/scripts/`）。它做这些事：

1. 版本号取 HEAD 的附注 tag，或命令行显式指定；
2. 前置校验：工作区干净、tag = HEAD = main、tag 已推送、Release 不存在；
3. 说明取 tag 正文；
4. 打包 29 个文件（根目录 `index.html`，含 `css/js/assets/docs/README`，排除 `tests` 与开发文件）；
5. 默认跑完整回归；
6. 用 Windows GCM 凭据调 GitHub REST API 创建 Release 并上传 zip，核对摘要。

```bash
python scripts/release.py            # 按 HEAD tag 发版
python scripts/release.py v0.4.1     # 指定版本
python scripts/release.py --dry-run  # 只校验与打包，不发
```

注意：换机器或重新克隆后，脚本与 exclude 规则都要重新放置。

## 提交规范

- 用 Conventional Commits 前缀：`feat/` `fix/` `refactor/` `docs/` `chore/`；
- 标题中文，一行说清做了什么；
- 提交前必须跑全套回归；
- 涉及数值平衡的改动，在提交信息里写清「预期内的基线变化」还是「行为不变」。

示例：

```
fix(codex): 拆分图鉴计数两个分母，标注收集进度口径
refactor(card): 非元素牌并入声明式执行器，新增投石
```

## 下一步

- 术语不熟：[12 术语表](12-glossary.md)
- 想先理解架构：[02 整体架构](02-architecture.md)
