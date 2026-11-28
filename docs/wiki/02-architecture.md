# 02 · 整体架构

## 没有模块系统，只有加载顺序

项目不用 `import`/`export`，也不用打包器。15 个 `<script>` 按固定顺序加载，全部运行在同一个全局作用域。**文件之间的依赖关系完全由加载顺序决定**：后加载的文件可以调用先加载文件的顶层函数和常量，反之则报 `undefined`。

`index.html:269-283` 的顺序：

```
00-core → 01-audio → 02-world → 03-data → 04-state → 05-input
→ 06-hand → 07-combat → 07b-spells → 08-progress
→ 09-render → vendor/three.min.js → 09b-fx → 10-ui → 11-main
```

### 分层视图

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 基础 | `00-core` | 数学工具、`$`、`isTouch`、`save`/`slots` 读写、`BLESS`、`ICONS` |
| 基础 | `01-audio` | WebAudio 上下文、`sfx()`、`auPhase()` |
| 基础 | `02-world` | 画布、`proj`/`unproj`、`genWorld`、空间网格、流场 |
| 数据 | `03-data` | `TUNE`、`BUILDS`、`FOES`、`CDEFS`、`WEAPONS`、`SIGILS`、`BLESSINGS` |
| 状态 | `04-state` | `P`、`DECK`、`S`、`res`、`initRun`、`mkCard`、快照 |
| 系统 | `05-input` | 键鼠/触摸事件、拖拽落点 |
| 系统 | `06-hand` | 手牌 DOM、出牌、熔铸、拆解、回收 |
| 系统 | `07-combat` | 武器、敌人、弹体、波次、`update(dt)` |
| 系统 | `07b-spells` | 法力、施法链执行、元素状态与反应 |
| 系统 | `08-progress` | 黎明、结算、无尽 |
| 表现 | `09-render` | 世界绘制、光照、小地图 |
| 表现 | `vendor/three` + `09b-fx` | 特效双后端 |
| 表现 | `10-ui` | HUD、图鉴 |
| 流程 | `11-main` | 主循环、菜单视图、存档槽 UI、启动 |

### 三条容易踩的加载顺序约束

1. **`03-data` 必须在 `04-state` 之前**：`resetPlayer()` 一开头就读 `TUNE.player.baseDmg` 和 `weaponDef(save.weapon)`（`js/04-state.js:21-24`）。
2. **`loadSlots()` 被刻意挪到 `11-main.js:521`**：`validateSlot` 依赖 `weaponDef`，而它定义在 `03-data.js`。`00-core.js:179` 留了注释说明这一点。
3. **`09b-fx.js` 排在 `three.min.js` 之后**：`FX.init()` 里直接 `new THREE.Scene()`，`THREE` 未定义时整个特效层静默关闭（`js/09b-fx.js:1380`）。

## 全局状态一览

所有跨模块状态都是模块级 `const` 对象，靠**原地修改**传递，**禁止重新赋值**。

| 符号 | 定义处 | 内容 |
| --- | --- | --- |
| `P` | `04-state:3` | 玩家：位置、生命、雾能/法力、武器、刻印槽、天赋层数 `stacks` |
| `res` | `04-state:3` | `{wood, stone, crys}` 当前资源 |
| `DECK` | `04-state:4` | `{draw, hand, discard, max, recycle, uid}` 牌堆 |
| `S` | `04-state:5-9` | 局面：`mode/phase/day/timeLeft/speed/stats/...` |
| `save` | `00-core:23` | 局外元数据：火种、传承、最佳记录、图鉴 `seen`、难度、静音、武器 |
| `slots` | `00-core:93` | 三个单局存档槽 |
| `cam` | `02-world:34` | 相机：世界坐标、缩放 `z`、抖动 |
| `core` | `02-world:33` | 方舟核心：坐标、耐久 |
| `nodes/builds/foes/shots/...` | `02-world:32` | 世界实体数组 |

这条约束在 `js/04-state.js:161-162` 写死：「const 对象只能原地恢复，禁止对 S/P/DECK/res 重新赋值」。读档之所以能在不重建引用的前提下恢复，全靠 `_putObj` / `_putArr`（`04-state:191-192`）。

## 主循环

只有一个 `requestAnimationFrame` 循环：`loop(now)`（`js/11-main.js:428-467`）。

```js
const dt = min((now - lastT)/1000, 1/30);   // 帧间隔封顶，防止切标签页后大跳
if (codexOpen) { ...render + 图鉴预览; return; }   // 图鉴打开：只渲染，不推进逻辑

switch (S.mode) {
  case 'menu' / 'prep': 菜单相机环绕 + 粒子
  case 'play':  按 S.speed 与 hitstop 拆子步跑 update(dt)
  case 'launch': 胜利起飞动画，2.8 秒后 showEnd
  case 'over':   失败倒计时后 showEnd
  default:       其它遮罩状态，世界慢速呼吸
}
render(); syncHUD();
```

### 倍速与顿帧

- **倍速**：`S.speed` 为 1 或 2。`update` 被拆成 `steps = min(4, ceil(speed))` 个子步，每步 `dt*speed/steps`（`11-main:445-447`）。拆分保证 2× 时碰撞不会因步长翻倍而穿透。
- **顿帧**：`S.hitstop > 0` 时 `wdt = 0`，只扣减 hitstop 本身，画面继续渲染。打击感的来源之一。

### `update(dt)` 的系统顺序

`js/07-combat.js:791` 起，固定按此顺序推进：

1. 白昼：倒计时、核心自愈、玩家靠近核心回血；时间到 `startNight()`
2. 夜晚：`nightAmt` 渐变、按 `spawnT` 生成「预警圈」`warns`、预警到期 `spawnFoe`、打空则 `dawn()`
3. 玩家：死亡重生倒计时 / 移动、冲刺、`depenetrate`
4. 武器自动攻击 `autoAttack()`
5. 敌人 `updateFoes(dt)`（流场 + AI + 分离力 + BOSS 技能）
6. 建筑 `updateBuilds(dt)`（箭塔/雾晶炮索敌开火、图腾/井回血回蓝）
7. 弹体、拾取、粒子、法术状态、烘焙脏标记

顺序有实际意义：玩家先动，武器再按新位置索敌，敌人再追。改顺序会影响手感与命中判定。

## 状态机与遮罩

`S.mode` 是唯一的状态源，取值：`menu / prep / play / dawn / pause / slots / launch / over / end`。另有独立布尔 `codexOpen`（图鉴可在菜单、暂停、结算三处打开，故不复用 `S.mode`）。

遮罩层由 `OVERLAYS` 数组统一管理（`js/11-main.js:4`）：`menu / codexOv / endOv / pauseOv / dawnOv / slotOv / confirmOv`。`showOv(id, on)` 切 `.show` 类；`closeOverlays(except)` 一次性关掉其余所有遮罩。

## 事件绑定的分布

没有集中式事件总线，监听器散落在各自模块的顶层：

| 类型 | 位置 |
| --- | --- |
| 键盘 | `05-input:22` `keydown`、`:91` `keyup` |
| 指针 | `05-input:93` `pointermove`、`:112` canvas `pointerdown`、`:122` 全局 `pointerup` |
| 按钮 | `11-main:473-520` 集中绑定菜单/暂停/存档按钮 |
| 图鉴 | `10-ui:531-535` |
| 窗口 | `02-world:28` resize、`05-input:167` visibilitychange |

`keydown` 里用**守卫链**处理上下文：武器选择器 → 确认框 → 图鉴 → 存档槽 → 黎明 → 游戏内。新加按键时必须在正确的守卫分支里写，否则会被更早的分支吞掉。

## 三条不可违反的隐含契约

这些契约没有类型系统兜底，靠注释和测试维持：

1. **启动期随机序列必须稳定**。`genWorld()` 默认走 `(Math.random()*1e9)|0`（`02-world:46`），牌库洗牌另开独立 xorshift 流（`04-state:68-77`），存档槽段「不得调用 rand/irand/Math.random」（`00-core:90`）。原因是前 7 夜基线要求逐值可复现。
2. **`hash/vnoise` 与 tile 生成不得引入随机**（`02-world:44`）。地形恢复只靠 seed，一旦掺随机，读档地形就会变。
3. **`FX.*` 特效入口统一保护**：后端未就绪时静默 return，不回退 Canvas 2D（`09b-fx:1420-1423`）。所以业务代码可以直接 `FX.cast(...)`，不需要判断后端。
4. **世界坐标与数组下标分离**：实体坐标以固定中心 `CEN` 为原点；扩图只增大 `GRID` 并把偏移 `OFF` 推入网格访问口 `tileIndex/toCell`（`02-world`），不在战斗/UI 代码里散落 `OFF`。地面按 `FIELD.chunk` 懒烘焙分块，避免大半径时生成巨幅画布。

## 场地扩张

`FIELD`（`00-core:6`）是半径语义的唯一配置源：陆地、沙滩、出生边缘、节点密度、触发周期、每次增量与上限全部由它推导。`radiusForLevel(level)` 是半径唯一计算路径；`levelForDay(day)` 在第 15、29、43…… 天给出新等级。

- `expandField()` 只在无尽模式执行，用 `reallocWorld → fillTerrain → rebuildEdgeSpawns` 按 `(seed, 世界坐标, 半径)` 纯函数重算地形：旧陆地不变、旧沙变陆、外侧长新沙。
- 新环带的节点用 `hash` 派生，扩张全程不调用 `Math.random`；旧节点原样保留。
- `S.fieldLevel` 是唯一持久化状态（`S_SAVE_FIELDS`），读档时按它重建地形；旧档缺字段按 0 处理。
- 演出状态 `fieldReveal` 只活内存：`enterNextDay` 先冻结玩法并播潮线/噪声侵蚀动画，结束或跳过后才调用 `openDawn()`；`prefers-reduced-motion` 直接跳过。
- 可逆入口 `resizeField(targetLv, opts)` 同时服务扩张与缩小：`expandField()` 是正式流程包装，`shrinkField()` 每次降一级。演出单元用 `{from,to}` 地形状态而不是类型名；潮线延迟按方向归一化，缩小时外圈先退、节点沉没、小地图熄灭。
- 缩小时按**新地形**统一裁剪外侧实体，环带补放对象带来源标记一并回退；被裁节点只留一份渲染快照做沉没动画，不进逻辑数组或存档。`opts.keep` 是通用例外入口（测试场用来保护测试桩），引擎不认识具体实体。
- 测试场 `testbed.html` / `js/testbed.js` 的「扩张 / 缩小」按钮直接调用上述入口，不进黎明流程、不打断每秒兜底；演出推进随 `S.speed`，单帧按钮也能逐帧观察。

## 下一步

- 战斗与 AI：[03 战斗与波次](03-combat-and-waves.md)
- 数据表结构：[07 数据模型](07-data-model.md)
