# 05 · 法术与元素

核心文件：`js/07b-spells.js`（483 行）、`js/07-combat.js` 的武器部分（1-300 行）。

## 两套施法资源

| 资源 | 谁用 | 字段 |
| --- | --- | --- |
| 雾能 | 未转职的守灯人、法术武器 | `P.en` / `P.maxEn` |
| 法力 | 转职法师 | 同一组字段，显示名随 `isMage()` 切换 |

`manaLabel()`（`03-data:408`）是唯一的显示名来源：法师显示「法力/法」，否则「雾能/雾」。UI 里不要再手写这两个词。

### 费用与回复

- 单位换算：`MANA_UNIT=15`，即 1 费 = 15 点。`effManaCost(def)` 负责折扣（`07b-spells:171`）。
- 回复：`manaRegenRate() = P.enRegenFlat * P.regen * (1 + 0.25*法力涌泉层数)`（`07b-spells:135`）。
- 法杖每次施放扣雾能：数值刻印 3 点、功能刻印 5 点（`SIGILS[].mana`）。不足时停火、节奏条变红。

### 转职

`becomeMage()`（`07b-spells:179`）：

- 法力上限 100 → 200、回复 14 → 19/秒；
- 生命上限 ×0.6；
- 手牌上限 +2；
- 牌库补入法力之井 10 张、余烬爆 5 张（`injectClassCard` / `cardBatch`）。

## 施放链：刻印怎么叠加

这是武器系统最核心的机制。一次法杖施放不是「打一发」，而是把槽位里的刻印**折叠成一条执行链**。

### 数据结构

```
sigilChain(slot)  → 从该槽位向左收集相邻的功能刻印
castPlan(slot)    → foldCast(chain)
```

`SIGIL_OPS`（`07-combat:95`）登记每种功能刻印的算子：

| 刻印 | op | 参数 | 效果 |
| --- | --- | --- | --- |
| 二重法术 `burst` | `repeat` | copies 2, dmgB 0.7 | 错峰补发 1 次，每次 70% 伤害 |
| 二叉 `scatter` | `fan` | copies 2, spread 90, dmgB 0.55 | 分裂 2 发，±45° |
| 三叉 `trident` | `fan` | copies 3, spread 20, dmgB 0.45 | 分裂 3 发，±20° |

`foldCast(chain)` 从链头往后依次作用：**后一张在前一张的结果上继续分裂、继续叠伤害**。所以「二重 + 三叉」不是各打各的，而是先分裂再三叉，最终 3×2 发。

### 施放节奏

```
castDelay = 同一轮内两次施放之间的冷却
recharge  = 一轮内所有法术打完后的冷却，队列回到第一槽
```

剑一轮只有一次挥砍，`castDelay=0`、整段间隔落在 `recharge`。法杖按槽位从左到右轮发，空槽跳过（`nextWeaponCast`）。原生散布：每次施放在瞄准角上随机 ±2°（`TUNE.weapon.spread`）。

## 法术结算

### 延迟命中

法术不是立即生效，而是先入队再结算：

```
castSpell(def, tx, ty, overflow)
  → spellTargets(def, tx, ty)        // 决定命中哪些目标
  → queueSpellHit(def, tx, ty, ctx)  // 压入 pendingHits，带延时
  → updatePendingHits(force)         // 到点或强制时
    → resolveSpellHit(def, tx, ty)   // 真正扣血、上状态、触发反应
```

延时来自 `spellFxTime(def)`（`03-data:81`）：hitscan 与天降类读 `SPELL_FX_TIME`；投掷物（`def.proj`）的飞行时间由距离 / 弹速算出（`spellShotSpeed`），所以火球「飞得远就飞得久」，玩家能看见也能躲。

`force=true` 用于读档/清场时立即结算所有悬挂命中。

### 弹体

`proj: true` 的法术会生成实体弹体 `spellShots`（`07b-spells:16-40`），有真实弹道、可被建筑挡下。`sp_fireball`（13 格/秒）、`sp_frostbolt`（16）、`sp_magicmissile`（20）、`sp_rock`（9）。

天降类（烈焰冲击）落点固定、垂直落下，没有水平弹道可拦，所以**不标 `proj`**——这是刻意区分。

## 元素状态

状态定义在 `ST_DEF`（`03-data:58-64`）：

| 状态 | 上限 | 持续 | 效果 |
| --- | --- | --- | --- |
| 灼烧 `burn` | 10 层 | 4 秒 | 每层每秒 3 点伤害 |
| 冰缓 `chill` | 3 层 | 2.5 秒 | 每层减速 12% |
| 冻结 `freeze` | — | 1 秒（BOSS ×0.35） | 停止行动 |
| 奥术标记 `mark` | — | 4 秒 | 受到法术伤害 +10% |
| 感电 `shock` | — | 2 秒 | `enabled:false`，接口保留未实装 |

`applyStatus(f, kind, n)` 叠层；`updateFoeStatus(f, dt)` 每帧衰减与结算 DoT；`foeSlowMult(f)` 汇总减速。

## 元素反应

`RX_DEF`（`03-data:65-72`）是唯一规则表：

| 组合 | 反应 | 状态 |
| --- | --- | --- |
| 火 + 冰 | 蒸汽爆炸（范围 2.0，30 伤害） | 已实装 |
| 奥术 + 火 | 共鸣扩散（范围 2.5，15 伤害） | 已实装 |
| 奥术 + 冰 | 共鸣扩散 | 已实装 |
| 冰 + 雷 | 范围麻痹 | 未实装 |
| 火 + 雷 | 过载 | 未实装 |
| 奥术 + 雷 | 共鸣扩散 | 未实装 |

触发条件：同一敌人 `TUNE.reaction.window=2` 秒内被两种元素命中；每敌人 `cooldown=1.5` 秒冷却。`triggerElementReaction(f, elem)`（`07b-spells:355`）记录上一元素并比对。

**法术武器自动开启反应**；剑路线需要法师天赋「元素融合」（`t_fusion`）才开启。这是两条路线的关键差异。

## 火焰蔓延

`spreadFire(x, y, radius, targets)`（`07b-spells:408`）：火器命中的敌人和树会把火传给相邻目标，蔓延一跳（`TUNE.fireSpread.radius=1.35`）。烧毁的树正常掉木材。`updateBurningTrees(dt)` 负责燃烧树的持续结算。

## 法师天赋

`BLESSINGS` 里 `cls:'mage'` 的条目只在转职后进入黎明池，共 25 种。效果数值不写在祝福对象上，集中在 `TALENT_TUNE`（`03-data:434-460`），逻辑按 id 查表。新增天赋先在这张表登记数值。

几个常见天赋：

| id | 名称 | 机制 |
| --- | --- | --- |
| `t_fusion` | 元素融合 | 开启反应；反应伤害 +30%、半径 +15% |
| `t_manashield` | 法力护盾 | 致命时清空法力、完全抵挡一次 |
| `t_nirvana` | 魔能涅槃 | 每局一次：致命时回 50% 生命并全屏爆炸 |
| `t_storm` | 元素风暴 | 每 12 次法术，全屏 40 随机元素伤害 |
| `t_manadmg` | 法力溢伤 | 法力 > 80% 时法术 +15% |

## 核心法术

`CORE_CARDS`（`07b-spells:6`）是法师专属的高阶法术池，`injectCoreCards(cards)` 按元素亲和概率注入黎明奖励。它们不进普通奖励池（`poolIds` 用 `d.core` 排除）。

## 下一步

- 数据字段与派生规则：[07 数据模型](07-data-model.md)
- 新增法术牌的完整接线：[11 开发指南](11-development-guide.md)
