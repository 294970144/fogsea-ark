# 07 · 数据模型

核心文件：`js/03-data.js`（506 行）。这是整个项目的「数值与定义中心」，逻辑、图鉴、测试三方都从这里读。

## 单一数据源契约

项目最重要的一条工程约束：**同一份数值只登记一次，其余地方派生**。它由回归测试 `R14_single_source_contract` 强制执行（`tests/regression.js:335-421`）。

具体表现：

- 敌人数值只在 `FOES` 写一次，刷怪、图鉴、测试都按 id 读；
- 刻印文案由 `sigilDesc(id)` 从 `SIGILS` 生成，不在卡面上手写；
- 卡牌标签由 `cardTags(d)` 从卡面字段派生，图鉴只渲染结果；
- 图鉴的敌人条目完全由 `FOES` 派生，不另建表。

违反契约的典型征兆：某处写死 `if (id === 'crawler') 26`，或者图鉴文案与逻辑数值对不上。

场地相关数值另一处登记在 `js/00-core.js:6` 的 `FIELD`：基准陆地半径、沙滩宽度、噪声、边缘出生点、节点密度、每 14 天 +2、上限 100、分块大小、节点上限与演出时长。派生函数 `maxLevel/levelForDay/radiusForLevel/gridFor/offFor` 只能从它计算，不在逻辑里写死阈值。新增半径相关行为时先问「能否由 FIELD 推导」，而不是在 `genWorld()` 里再加一个数字。

## `TUNE`：数值总表

`js/03-data.js:5-23`。全局平衡参数的唯一入口，按子系统分组：

| 组 | 关键项 |
| --- | --- |
| `core` | 核心耐久 600、修复消耗、黎明自愈 |
| `node` | 采集次数、产出区间、掉落上限 |
| `player` | 基础伤害 12、基础射程 1.75 |
| `dmgMul` | `melee` / `spell` 两条伤害倍率（默认 1） |
| `dash` / `nova` / `down` | 冲刺、雾爆、灯芯熄灭 |
| `spell` | 施法距离、每层延展 |
| `reaction` | 反应窗口 2 秒、冷却 1.5 秒 |
| `fireSpread` | 火焰蔓延半径与树的燃烧节奏 |
| `ember` | 火种结算公式参数 |
| `fusion` | 熔铸手续费 5 雾晶 |
| `weapon` | 补发间隔、原生散布 ±2° |
| `deck` | 并回弃牌堆的阈值 8 |
| `statusNames` | 状态显示名（灼烧/冰缓/冻结/奥术标记/感电） |

新增机制时**先在这里登记**，再让逻辑与图鉴按字段引用。

## `BUILDS`：五种建筑

`03-data:25-31`。字段：`name/hp/r`，箭塔与炮还有 `range/dmg/rate`，图腾 `heal`，法力之井 `regen`。

## `FOES`：四种敌人

`03-data:34-50`。共用字段：`name/icon/color/spriteScale/desc/rel/hp/spd/dmg/r/xp/coreDmg/firstNight/crysDrop`。特化字段：

- `spitter`：`fireInterval/fireRange/keepAway/closeIn`
- `boss`：`summonFirst/summonInterval/summonCount/stompFirst/stompInterval/stompDmg/stompRange`

`firstNight` 与 `crysDrop` 同时被刷怪逻辑和图鉴读取，这就是单一数据源的实例。

## `CDEFS`：卡牌定义

`03-data:86-191`，按 id 索引。核心字段：

| 字段 | 含义 |
| --- | --- |
| `kind` | `build` 构筑 / `instant` 瞬发 / `utility` 功能 / `class` 职业 |
| `build` | 对应 `BUILDS` 的键（构筑牌） |
| `cost` | `{wood, stone, crys}` 资源费用 |
| `mana` | 雾能/法力费用（法术） |
| `target` | `point` 指定地面 / `self` 自身 / `pick` 选目标 |
| `shape` | `point/single/multi/global/self/consume`，决定命中范围与图鉴标签 |
| `elem` / `elem2` | 主元素 / 第二元素 |
| `status` / `status2` | 附加状态 `{kind, n}` |
| `radius` / `dmg` / `knock` | 范围与伤害 |
| `heal` / `coreHeal` / `buildHeal` | 治疗类 |
| `draw` / `ifr` / `refill` / `dashReset` | 抽牌 / 无敌 / 回蓝 / 冲刺重置 |
| `sigil` / `sigilOnly` | 可装槽 / 仅可装槽 |
| `proj` / `shotSpeed` | 投掷物与弹速 |
| `q` | 品质 1/2/3 |
| `fuseOut` | 熔铸产物（不进奖励池、不可再熔） |
| `w` / `wNonMage` | 奖励权重（法师/非法师） |
| `cls` | `'mage'` 仅法师 / `'class'` 职业牌 |
| `core` | 核心法术（不进普通池） |
| `tier` | 拆解档位 5/10/20 |
| `salvage` | 拆解牌标记 |

**卡面行为由字段驱动，不按 id 硬编码**。`applyFuse` 是这条原则的样板：它只读 `dmg/radius/knock/ifr/draw/refill/heal/coreHeal/buildHeal`，任何新卡只要填对字段就自动生效。

## `WEAPONS`：四种武器

`03-data:280-290`。字段：`attack`（`melee`/`spell`）、`slots`（槽位数）、`castDelay/recharge`（节奏）、`spell`（法杖的攻击模板 id）、`startSigils`（开局预装）、`art`（SVG 插画路径）。

`normalizeWeaponId(id)` 把非法 id 回退成 `sword`；`weaponDef(id)` 是唯一取武器定义的入口。

## `SIGILS`：六种武器刻印

`03-data:295-303`。数值刻印 `dmg/spd/echo`，功能刻印 `op/copies/spread/dmgB`，另加 `mana`（每发雾能开销）。文案由 `sigilDesc()` 生成。

## `SIGIL_SPELLS`：三种法术刻印

`03-data:194-208`。它们不单独写数值，而是 `from` 指向武器攻击模板（`sp_fireball` 等），从源模板派生 `dmg/radius/status`。这是「同一份数值不写两处」的又一实例。

## 静态派生函数

| 函数 | 作用 |
| --- | --- |
| `sigilDesc(id)` | 刻印效果文案 |
| `sigilMeta(id)` | 槽位条目的统一元信息（数值刻印与法术刻印共用接口） |
| `cardTags(d)` | 卡牌的能力标签（火/冰/范围/治疗/抽牌…） |
| `weaponTags(w)` | 武器标签 |
| `sigilTags(s)` | 刻印标签 |
| `costStr(def)` / `costHtml(def)` | 费用文本 / HTML |
| `fusionOf(a,b)` / `fusionSideName` / `fusionRecipesOf` | 熔铸配方正查与反查 |
| `rxName(...keys)` | 反应显示名，避免图鉴与数据表分叉 |

## `CX_TAGS`：图鉴标签字典

`03-data:352-372`，18 个标签分四组：归属（武器/刻印）、输出（火/冰/奥术/近战/法术）、形态（范围/单体/留场）、功能（治疗/抽牌/防御/控制/持续伤害/增伤/攻速/追加攻击）。

标签只做**展示**，不参与筛选——分类与搜索仍是唯二过滤条件（`tests/regression.js:1216-1221` 有断言）。

## `BLESSINGS` 与 `TALENT_TUNE`

- `BLESSINGS`（`03-data:462-503`）描述「是什么」：`id/n/rar/icon/d/f`。`f` 是立即生效的副作用（仅基础祝福有），法师天赋靠 `TALENT_TUNE` 查表。
- `TALENT_TUNE`（`03-data:434-460`）是天赋的数值表。
- `rar`：`c` 普通 / `r` 稀有 / `e` 传说。

## 品质与熔铸表

- `CARD_Q`（`03-data:230-235`）：三档两色。
- `FUSION_RECIPES`（`03-data:240-247`）：6 组配方，`a/b` 固定牌、`ea/eb` 元素组。

## 新增数据时的登记顺序

1. 数值进 `TUNE` 对应组；
2. 实体进 `BUILDS` / `FOES` / `CDEFS`；
3. 文案能派生就不手写；
4. 图鉴条目尽量由数据 map 出来，不新建表；
5. 跑 `node tests/regression.js` 看单一数据源契约是否仍然成立。

## 下一步

- 卡牌的实际使用流程：[04 卡牌与牌库](04-cards-deck-sigils-fusion.md)
- 新增一张牌的接线清单：[11 开发指南](11-development-guide.md)
