# 12 · 术语表

项目里中英混用、玩法名与代码名并存。这张表把三者对齐。

## 玩法术语

| 中文 | 英文 / 代码 | 含义 |
| --- | --- | --- |
| 雾海方舟 | Fogsea Ark / `arkmist` | 项目名；存档键前缀 |
| 守灯人 | Keeper / `keeper` | 玩家角色 |
| 雾裔 | Fogspawn / `foe` | 敌人统称 |
| 雾潮 | Fog Tide / `tide` | 夜晚的敌潮 |
| 方舟核心 | Core / `core` | 需要守护的家园核心，耐久归零即失败 |
| 白昼 | Day / `phase:'day'` | 70 秒的构筑阶段 |
| 夜晚 | Night / `phase:'night'` | 敌潮阶段，构筑牌封存 |
| 黎明 | Dawn / `dawn` | 天亮后的两步 3 选 1 |
| 七夜 | Seven Nights / `MAX_NIGHT=7` | 一局的标准长度 |
| 无尽 | Endless / `S.endless` | 胜利后继续守护的模式 |
| 火种 | Ember / `save.embers` | 局外货币，买传承 |
| 传承 | Legacy / `BLESS` | 局外永久升级（锋刃/坚韧/仓廪） |
| 祝福 | Blessing / `BLESSINGS` | 局内永久被动，黎明三选一 |
| 法师天赋 | Mage Talent / `cls:'mage'` 的祝福 | 转职后解锁的祝福池 |
| 武器 | Weapon / `WEAPONS` | 剑 / 火焰法杖 / 冰法杖 / 奥术法杖 |
| 刻印 | Sigil / `SIGILS`、`sigil:true` | 装进武器槽的卡，改变武器行为 |
| 数值刻印 | Stat sigil | 锋锐/迅捷/回响，作用整把武器 |
| 功能刻印 | Functional sigil | 二重/二叉/三叉，修饰左侧相邻法术 |
| 法术刻印 | Spell sigil | 带元素的法术牌，可装槽也可拖地 |
| 槽位 | Slot / `P.sigils[]` | 武器上的定长稀疏数组 |
| 施放链 | Cast chain / `sigilChain`、`foldCast` | 多个功能刻印折叠成的一次施放 |
| 充能 | Recharge / `recharge` | 一轮法术打完后回到第一槽的冷却 |
| 熔铸 | Fusion / `tryFuse`、`FUSION_RECIPES` | 两张手牌合成一张高级牌 |
| 拆解 | Salvage / `salvage`、`trySalvageFuse` | 拆解牌拖到手牌上换材料、提升回收率 |
| 回收 | Recycle / `recycleHandCard` | 手牌超限时放回弃牌堆并按回收率返还 |
| 回收率 | Recycle rate / `DECK.recycle` | 返还比例，0~50% |
| 牌库 | Deck / `DECK` | 抽牌堆 + 手牌 + 弃牌堆 |
| 手牌上限 | Hand cap / `DECK.max`、`HAND_CAP` | 软上限 5，硬上限 10/12 |
| 品质 | Rarity / `q` | 普通 / 稀有 / 史诗 |
| 雾能 | Mist energy / `P.en` | 非法师的施法资源 |
| 法力 | Mana / `P.en`（法师） | 法师的施法资源 |
| 元素状态 | Elemental status / `ST_DEF` | 灼烧/冰缓/冻结/奥术标记 |
| 元素反应 | Elemental reaction / `RX_DEF` | 火+冰=蒸汽爆炸，奥术+任意=共鸣扩散 |
| 雾爆 | Nova / `castNova` | Q 键的自身范围新星 |
| 灯芯熄灭 | Downed / `P.downed` | 玩家死亡后的重生倒计时 |
| 预警圈 | Warn / `warns` | 敌人落地前的紫色提示 |
| 精英 | Elite / `f.elite` | 第 5 夜起 12% 概率强化敌人 |
| 图鉴 | Codex / `CODEX`、`cx*` | 条目收集册 |

## 代码符号

| 符号 | 位置 | 说明 |
| --- | --- | --- |
| `P` | `04-state:3` | 玩家状态对象 |
| `S` | `04-state:5` | 局面状态对象 |
| `DECK` | `04-state:4` | 牌堆 |
| `res` | `04-state:3` | 三种资源 |
| `save` | `00-core:23` | 局外存档 |
| `slots` | `00-core:93` | 单局存档槽 |
| `TUNE` | `03-data:5` | 数值总表 |
| `BUILDS` | `03-data:25` | 建筑定义 |
| `FOES` | `03-data:34` | 敌人定义 |
| `CDEFS` | `03-data:86` | 卡牌定义 |
| `WEAPONS` | `03-data:280` | 武器定义 |
| `SIGILS` | `03-data:295` | 刻印定义 |
| `BLESSINGS` | `03-data:462` | 祝福定义 |
| `TALENT_TUNE` | `03-data:434` | 天赋数值表 |
| `RX_DEF` | `03-data:65` | 元素反应规则 |
| `ST_DEF` | `03-data:58` | 元素状态定义 |
| `CX_TAGS` | `03-data:352` | 图鉴标签字典 |
| `CODEX` | `10-ui:190` | 图鉴条目（派生态） |
| `FX` | `09b-fx:6` | 特效层入口 |
| `AU` | `01-audio:3` | 音频上下文 |
| `cam` | `02-world:34` | 相机 |
| `GLOW` | `02-world:12` | 预渲染光晕贴图 |
| `proj` / `unproj` | `00-core:11-12` | 等距投影 / 反投影 |
| `moveCircle` | `02-world:250` | 圆形实体移动与滑移 |
| `computeField` | `02-world:190` | Dijkstra 流场 |
| `fieldDir` | `02-world:212` | 取流场下降方向 |
| `autoAttack` | `07-combat:174` | 武器自动攻击入口 |
| `castSpell` | `07b-spells:289` | 法术施放入口 |
| `damageFoe` / `damagePlayer` / `damageCore` / `damageBuild` | `07-combat` | 四条伤害管线 |
| `captureSnapshot` / `restoreSnapshot` | `04-state:169/193` | 单局快照 |
| `settle` / `finishSettle` | `08-progress:147/131` | 结算与写入 |
| `loop` | `11-main:428` | 唯一主循环 |
| `SEEN_KEYS` | `00-core:22` | 图鉴统计类白名单 |
| `GOLDEN` | `tests/regression.js` | 基线黄金值 |

## 命名习惯

- **敌人**：`crawler` 爬行者、`spitter` 掷雾者、`brute` 雾兽、`boss` 雾潮之主；
- **建筑**：`wall` 木墙、`tower` 箭塔、`totem` 愈灵图腾、`cannon` 雾晶炮、`manawell` 法力之井；
- **法术**：`sp_` 前缀（`sp_fireball`），刻印法术 `sig_` 前缀；
- **熔铸产物**：`fuse_` 前缀；
- **图鉴 id**：卡牌 `c_` + id，祝福 `b_` + id，刻印 `s_` + id，传承 `l_` + id，武器 `w_` + id；
- **天赋**：`t_` 前缀。

## 下一步

- 回到 [Wiki 首页](README.md)
- 需要动手改代码：[11 开发指南](11-development-guide.md)
