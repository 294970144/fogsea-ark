# 04 · 卡牌与牌库

核心文件：`js/06-hand.js`（651 行）、`js/04-state.js`（牌堆与抽牌）。

## 牌堆模型

```js
const DECK = { draw: [], hand: [], discard: [], max: 5, recycle: 0, uid: 1 };
```

- `draw` 抽牌堆、`hand` 手牌、`discard` 弃牌堆；
- `max` 当前手牌软上限；`recycle` 当前回收率（0~50）；
- `uid` 全局自增，每张实体卡唯一（`mkCard`，`04-state:62-65`）。**同名卡是多个 uid 的独立实体**，所以「只动手上这两张、不动同名牌的其他副本」是成立的。

牌的总量恒定：出牌进弃牌堆、拆解进弃牌堆、回收也进弃牌堆。只有熔铸产物打出后真正消失（`def.fuseOut`），以及扩容/拆解到顶后整类退场。

### 抽牌与洗牌

- `drawOne(cap)`（`04-state:78`）：手牌未到上限才抽；`draw` 降到 `TUNE.deck.shuffleFloor=8` 就把弃牌堆并回来重洗。
- `shuffle()` 用独立的 **xorshift** 随机流 `deckSeed`（`04-state:68-77`），不碰 `Math.random`。原因写在注释里：牌库张数会随设计调整，若共用全局随机，会连带打乱刷怪/掉落序列，破坏前 7 夜基线。
- 开局保底：`initRun()` 先从牌库捞出木墙与箭塔进手牌（`04-state:53-56`），再补满。

### 起始牌库

`STARTER_DECK`（`03-data:213-222`）是一张 `[卡 id, 张数]` 表，`initRun` 只遍历它。合计 143 张：木墙 30、箭塔 24、图腾 12、四张消耗牌各 10、数值刻印各 6、多重刻印各 4、拆解 4/2/1。

改开局配置只改这张表，不要散落到 `initRun`。

## 出牌

### 两条路径

1. **拖拽**：`pointerdown` 起身 → `pointermove` 超过 7px 生成拖影 → `pointerup` 用 `elementFromPoint` 判定落点（`05-input:139-161`）。
2. **点选**：点击手牌 `selectCard(uid)` 进入瞄准态，再点地面 `tryPlayAt`。

两条路径最终都进 `playCard(uid, tx, ty)`。

### `playCard` 的分派（`06-hand:352-386`）

```
取卡 → 校验（不可武器攻击、不可纯刻印、拆解牌走另一条）
→ placeCheck(def, tx, ty)   // 白/红预览用的同一套判定
→ payCost(def)              // 扣木/石/晶 + 扣雾能
→ 从手牌移除、stats.played++、bumpSeen('play', id)
→ kind==='build' ? 建建筑 + 卡进弃牌堆
                 : applyInstant(def,...) + 卡进弃牌堆（fuseOut 除外）
→ 特殊：expand 立即 +1 上限并抽 1；到顶则 purgeCard('expand') 整类退场
```

### 构筑 vs 瞬发

- **构筑** `kind==='build'`：落地成实体，建筑永久留场，卡回弃牌堆。夜晚不能打（`placeCheck` 会拒绝）。
- **瞬发** `kind==='instant'`：立即结算。带 `elem` 的走 `castSpell`，其余走 `applyFuse`（声明式执行器，只读卡面字段）。
- **功能** `kind==='utility'`：`expand` 扩容、`salvage*` 拆解、刻印牌只能装槽。

`applyInstant`（`06-hand:387-391`）只有两行分派，所有特殊行为都靠卡面字段驱动，不在这里堆 `if (id==='xxx')`。

## 刻印装槽

### 槽位是定长稀疏数组

`P.sigils` 长度等于武器槽位数（剑 3、法杖 6），空位是 `null`（`04-state:29`）。**空槽保留自己的位置**，不会因为卸下而把后面的刻印挤前。

### 三个操作

| 函数 | 语义 |
| --- | --- |
| `engraveCard(uid, slot, rect)` | 手牌 → 槽位。目标槽已被占则交换 |
| `unfillSlot(i, rect)` | 槽位 → 手牌（拖出武器区） |
| `moveSlotCard(from, to, rect)` | 槽位之间移动/交换 |

都在 `06-hand:272-342`。装槽后卡是实体，牌库总量不变。数值刻印只能装槽、不可拖地释放（`tryPlayAt` 里拦下 `sigilOnly`）。

### 刻印的分类

- **数值刻印**（`keen` 锋锐 / `swift` 迅捷 / `echo` 回响）：作用整把武器；
- **功能刻印**（`burst` 二重 / `scatter` 二叉 / `trident` 三叉）：只修饰**左侧最近的那一张法术**，多个按槽位从左到右依次折进同一次施放；
- **法术刻印**（`sig_flame` / `sig_frost` / `sig_arcane` 及带 `sigil` 的瞬发法术牌）：既能装槽自动施放，也能当瞬发牌拖地。

刻印数值与文案的唯一来源是 `SIGILS` + `sigilDesc()`（`03-data:295-323`），卡面 `desc` 在启动时由它注入，避免「改了数值忘了改文案」。

## 熔铸

两张手牌拖到一起 → 产物直接进手牌，源牌回弃牌堆，每次付 5 雾晶（`TUNE.fusion.crys`）。

- 配方表 `FUSION_RECIPES`（`03-data:240-247`）6 组：三组元素组合（火+冰、火+奥、冰+奥）+ 三组固定牌（护盾+战术、箭雨+雾晶雷、泉+修补）。
- `fusionOf(a, b)`（`03-data:254-262`）**对称查找**，顺序无关；产物带 `fuseOut`，不可再作为源。
- `tryFuse`（`06-hand:416-445`）先 `mkCard(out)` 成功才扣费删源，避免「源牌删了、产物没进」的中间态。
- `applyFuse`（`06-hand:448-495`）是声明式执行器：`dmg+radius` 范围伤害、`ifr` 无敌、`draw` 抽牌、`refill` 回蓝、`coreHeal/buildHeal` 修复，全部读卡面字段。元素产物不经过这里，走 `castSpell`。

## 拆解

拆解牌拖到**任意**手牌上（任一方向都成立，`tryFuse` 先检查 `isSalvage`）：

- 两张牌都回弃牌堆；
- 按 `salvageRateOf(src)` 返还目标牌造价：`min(REC_CAP, DECK.recycle + tier)`；
- `DECK.recycle = rate`（档位 5/10/20）；
- 到 50% 后三张拆解牌全部 `purgeCard` 退场。

拆解是唯一真正「消耗卡牌」的路径——但牌本身仍进弃牌堆，消耗的是「可拆解的机会」。

## 回收（超限出口）

`recycleHandCard(uid)`（`06-hand:573-591`）**只在手牌超软上限时成立**（`DECK.hand.length > DECK.max`）。手牌超限时右下角出现回收区，拖进去或选中后点击：

- 卡进弃牌堆（不销毁，牌库总数不变）；
- 按当前回收率返还造价；
- 夜晚/黎明前若仍超限，`overflowBlock` 会拦住进度（`04-state:96-105`），要求先回收。

## 手牌上限

- 初始 5，`expand` 每次 +1，硬上限 `HAND_CAP=10`；
- 法师转职 +2（`MAGE_TUNE.handAdd`），法师硬上限 12；
- 黎明「拾获」可能让手牌临时超过软上限（新牌直接入手），此时靠回收区消化。

## 卡牌品质

`q` 字段：1 普通 / 2 稀有 / 3 史诗（`03-data:211-212`、`230-235`）。每档两色成对，卡面左上角显示档位名，稀有以上加双色描边。熔铸产物固定为稀有或史诗。

## 下一步

- 卡面字段的完整含义：[07 数据模型](07-data-model.md)
- 新增一张牌的接线步骤：[11 开发指南](11-development-guide.md)
