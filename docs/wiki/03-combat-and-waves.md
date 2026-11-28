# 03 · 战斗与波次

核心文件：`js/07-combat.js`（862 行）、`js/02-world.js`（移动与流场）。

## 玩家

### 移动与碰撞

每帧从键盘或触摸摇杆取方向向量，归一化后交给 `moveCircle(P, dx, dy, r, ignoreNodes)`（`02-world:250`）。

`moveCircle` 的做法：

1. 按位移长度切成最多 8 个子步（每步约 0.18 格），避免高速穿墙；
2. 每个子步先试 X 再试 Y（轴分离滑移），撞墙时沿墙滑动而不是卡住；
3. 每步 `depenetrate` 把玩家从实体里推出来；
4. 若最终落点不在陆地上，`2×2` 邻域找最近陆地重生。

`landOK(x,y,r,mx,my)` 额外检查「沿移动方向前探 0.8r 的点」是否可走，防止贴边时半身入水。

### 冲刺与灯芯熄灭

- 冲刺：`tryDash()`（`07-combat:452`），消耗冷却，`dashT` 期间按 `TUNE.dash.mult=3.4` 倍速移动并带无敌帧。
- 死亡：生命归零进入 `downed`，`P.respT` 倒数 `TUNE.down.time=3` 秒后在核心旁重生，恢复 `hpRatio=0.6` 生命、损失 20% 雾晶（`07-combat:820-827`）。重生期间不渲染玩家、玩家不参与索敌。

## 武器自动攻击

玩家的攻击完全自动，玩家只负责走位与出牌。

`autoAttack()`（`07-combat:174`）每帧调用：

1. `nearestTarget(w)` 在当前武器射程内找最近的可攻击目标（敌人 + 资源节点，`attackables()`）；
2. 有敌人 → 攻击敌人；无敌人 → 采集最近的树/岩/矿（`weaponHitAt`）；
3. 节奏由 `castDelay`（同一轮内两次施放间隔）与 `recharge`（一轮打完后的冷却）共同决定，详见 [05 法术与元素](05-spells-and-elements.md) 的施放链部分。

### 剑 vs 法杖

- 剑：`swordPlan()` 生成一次挥砍；`swingArc()` 画扇形判定。天赋「双弦」会给挥砍附穿透剑气。
- 法杖：`weaponCastSlots()` 取槽位里所有法术刻印，`nextWeaponCast()` 从左到右轮发，空槽跳过；一轮打完进入 `recharge`。一个法术刻印都没有时停火。

## 敌人 AI

### 目标选择

每 0.3 秒重选一次目标（`07-combat:593-597`）：

```js
f.target = (f.type==='brute' || f.boss)
  ? (pd < 1.6 ? 'player' : 'core')      // 重甲单位：贴脸才打玩家
  : (pd < 3.4 ? 'player' : 'core');     // 其余：3.4 格内优先打玩家
```

### 寻路：流场 + 局部回避

不做逐个体 A*。用两张**流场**（Dijkstra 距离场）：

- `coreField`：以核心为源，场景变化时重算（`fieldDirty`）；
- `plyField`：以玩家为源，每 0.2 秒或玩家跨格时重算，且只在本夜或有敌人锁定玩家时才算。

`computeField(out, gx, gy)`（`02-world:190`）是带二叉堆的 Dijkstra，8 方向、对角需两侧可通；`tileCost` 里树/岩=∞、建筑=26~36（越硬越贵），所以敌人会绕开建筑而不是硬啃。`fieldDir()` 取邻格中代价最低的方向作为期望速度。

局部层再加三件事：

1. **分离力**：`forFoes` 半径内互相推开，避免叠成一坨（`07-combat:654-660`）；
2. **卡死检测**：每 0.5 秒比对位移，连续卡住就 `detourT=0.75` 侧向绕行；三次仍卡则 `phaseT=1.1` 短暂无视实体（`07-combat:641-653`）；
3. **贴脸直线**：距离 < 2.4 格时放弃流场直接朝目标走，避免流场在近处抖动。

### 攻击行为

| 类型 | 行为 |
| --- | --- |
| 爬行者 `crawler` | 直扑，接触即打核心/玩家 |
| 掷雾者 `spitter` | 保持 3.6~6.8 格距离环绕，每 `fireInterval` 吐雾弹（弹体可被建筑挡下） |
| 雾兽 `brute` | 优先啃挡路建筑（`s.kind===1`），对核心伤害高 |
| 雾潮之主 `boss` | 定期召唤爬行者、近身践踏（`stompRange`），每 7 夜重现 |

建筑判定在 `forSolids` 里做：若建筑在「朝目标方向」的前方或距离 < 2.4，就转为攻击建筑（`07-combat:602-610`）。

## 刷怪与波次

### 一夜的规模

`startNight()`（`07-combat:536`）：

```js
S.nightTotal = round((6 + 4.2*effDay(day)) * DIFFS[].count);
if (day % 7 === 0) S.nightTotal = round(S.nightTotal*0.7) + 1;  // BOSS 夜总量减三成
```

- 非 BOSS 夜：整夜总量 `toSpawn`，按批次投放；
- BOSS 夜：先在边缘放一个 1.6 秒的 BOSS 预警，其余按普通波次。

### 投放节奏

`update()` 夜晚分支（`07-combat:800-811`）：

```js
spawnT = max(1.6, 3.4 - day*0.22);     // 随天数加快
n = min(toSpawn, irand(2, 2+floor(day/2)), 5);
pts = Math.random()<0.4 ? 2 : 1;        // 40% 概率分两个方向夹击
```

每次投放先压入 `warns`（地面紫色预警圈），0.95 秒后才真正 `spawnFoe`。这给了玩家反应窗口，也是「预警圈」视觉的来源。

同屏上限 `FOE_CAP=44`，`foes.length + warns.length*4` 达上限就暂停投放。

### 难度成长

`dayScale(day) = 1 + 0.13*(effDay(day)-1)`（`04-state:18`），`effDay` 在前 7 夜恒等，第 8 夜起渐近封顶：

```js
effDay = day => day <= 7 ? day : 7 + 5*(1 - exp(-(day-7)/14));
```

所以无尽模式难度会涨，但涨速递减、上限约 `1+0.13*11 ≈ 2.43` 倍。注释明确要求前 7 夜必须与原公式逐值相等，否则会破坏基线测试。

精英：第 5 夜起普通敌人有 12% 概率变精英（生命 ×1.6、经验 ×2，`07-combat:814`）。

## 伤害管线

四个入口，职责分明：

| 函数 | 作用 |
| --- | --- |
| `damageFoe(f, dmg, ang, crit, opts)` | 扣敌人血、飘字、暴击、击杀结算 |
| `damagePlayer(dmg, src)` | 扣玩家血、护盾/无敌帧、受伤特效、触发死亡 |
| `damageCore(dmg)` | 扣核心耐久，归零 `loseRun()` |
| `damageBuild(b, dmg)` | 扣建筑耐久，归零移除并重建网格 |

`killFoe()`（`07-combat:341`）负责：经验、雾晶掉落、`bumpSeen('foe', type)`、击杀统计、灼烧蔓延等死亡触发。

## 元素状态挂在敌人身上

`updateFoeStatus(f, dt)`（`07b-spells:442`）处理灼烧 DoT、冰缓减速、冻结定身、奥术标记的持续时间。状态数值来自 `ST_DEF`（`03-data:58-64`），反应规则见 [05 法术与元素](05-spells-and-elements.md)。

## 波次结束判定

`if (S.toSpawn<=0 && warns.length===0 && foes.length===0) dawn();`（`07-combat:817`）

三个条件同时满足才算本夜清空：没有待投放、没有预警中的、场上没有活着的。判胜/判负/黎明后同帧 `return`，不再推进战斗。

## 下一步

- 卡牌与刻印如何影响武器：[04 卡牌与牌库](04-cards-deck-sigils-fusion.md)
- 法术与反应细节：[05 法术与元素](05-spells-and-elements.md)
