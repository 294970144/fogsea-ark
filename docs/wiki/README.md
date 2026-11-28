# 雾海方舟 · 代码 Wiki

> 面向开发者的项目内部文档。描述代码**实际怎么运转**，不是玩法宣传页。
> 玩法层面的完整说明在根目录 `README.md`，本文档树补的是实现细节、数据流与改动约束。

## 这是什么

一个纯前端、零构建、零运行依赖的网页游戏：Canvas 2D 等距渲染的生存射击 + 卡牌构筑。
约 9,900 行 JavaScript，15 个脚本按序加载，共享同一个全局作用域（没有模块系统）。

## 阅读路径

| 你的目标 | 建议顺序 |
| --- | --- |
| 第一次接手，想跑起来并理解全貌 | [01 概览](01-overview.md) → [02 架构](02-architecture.md) → [03 战斗与波次](03-combat-and-waves.md) |
| 要加/改一张卡、一个刻印 | [04 卡牌与牌库](04-cards-deck-sigils-fusion.md) → [07 数据模型](07-data-model.md) → [11 开发指南](11-development-guide.md) |
| 要改渲染、光照、特效 | [06 渲染与特效](06-rendering-and-fx.md) |
| 要改存档、读档、结算 | [08 存档系统](08-save-and-persistence.md) |
| 要改 UI、图鉴、输入 | [09 UI 与输入](09-ui-and-codex.md) |
| 要跑测试、发版 | [10 测试体系](10-testing.md) + [11 开发指南](11-development-guide.md) |
| 看到不认识的术语 | [12 术语表](12-glossary.md) |

## 文档索引

1. [项目概览](01-overview.md) — 定位、一局结构、技术栈、目录
2. [整体架构](02-architecture.md) — 脚本分层、加载顺序、全局状态、主循环、状态机
3. [战斗与波次](03-combat-and-waves.md) — 玩家移动、敌人 AI、流场寻路、刷怪、难度曲线
4. [卡牌与牌库](04-cards-deck-sigils-fusion.md) — 牌库循环、出牌、刻印装槽、熔铸、拆解、回收
5. [法术与元素](05-spells-and-elements.md) — 法力、施法链、元素状态、反应、法师天赋
6. [渲染与特效](06-rendering-and-fx.md) — 等距投影、画家算法、昼夜光照、WebGPU/WebGL 双后端
7. [数据模型](07-data-model.md) — `TUNE` / `CDEFS` / `FOES` / `WEAPONS` / `SIGILS` 与单一数据源契约
8. [存档系统](08-save-and-persistence.md) — 局外元数据、单局存档槽、校验、快照恢复
9. [UI 与输入](09-ui-and-codex.md) — HUD、图鉴、菜单视图、键鼠与触摸
10. [测试体系](10-testing.md) — 回归脚本的沙箱、桩替身与测试分类
11. [开发指南](11-development-guide.md) — 新增卡牌的完整接线、调试入口、发版流程
12. [术语表](12-glossary.md) — 项目专有名词与代码符号对照

## 维护约定

- 本目录只写**实现事实**：函数名、行号、数据结构、调用关系。玩法数值变化时优先改代码注释与 `README.md`，本文档只同步结构性结论。
- 引用行号以 `docs/wiki` 建立时的 `main` 为准；代码移动后行号会漂移，以函数名/符号名为准。
- 新增模块时，在 [02 架构](02-architecture.md) 的加载顺序表和本页索引各补一行。
