# 08 · 存档系统

核心文件：`js/00-core.js`（局外元数据 + 存档槽读写）、`js/04-state.js`（快照捕获/恢复）、`js/11-main.js`（槽位 UI 与自动存档时机）、`js/08-progress.js`（结算写档）。

## 两个完全隔离的存储键

| 键 | 内容 | 生命周期 |
| --- | --- | --- |
| `arkmist_v3` | 局外元数据：火种、传承、最佳记录、图鉴 `seen`、难度、静音、当前武器 | 跨局永久 |
| `arkmist_slots_v1` | 最多 3 个单局存档槽 | 一局一份，结算后清空 |

外加 `arkmist_slots_bad_v1`：存档损坏时的原始串备份，**只写一次，不覆盖**。

两者互不引用。清单局槽不影响火种与传承；重置局外数据也不碰存档槽。

## 局外元数据 `arkmist_v3`

### 结构（`00-core:23-24`）

```js
save = {
  embers: 0,
  bless: { blade: 0, iron: 0, stock: 0 },
  best: { nights: 0, kills: 0, wins: 0 },
  seen: { foe: {}, build: {}, card: {}, play: {}, sigil: {} },
  diff: 'std', muted: false, weapon: 'sword'
};
```

### 白名单校验

`loadSave()`（`00-core:48-87`）不信任任何输入：

- 先判断整份 JSON 是否「至少有一个字段合法」，不是的话整份丢弃；
- 再逐字段校验：`embers` 非负有限数、`diff` 必须命中 `DIFFS` 的键、`bless` 每项 `0..max`、`best` 三项非负整数；
- `seen` 按 `SEEN_KEYS = ['foe','build','card','play','sigil']` 逐类校验，值必须是有限非负数。

`SEEN_KEYS` 是**新增统计类的唯一登记点**：初始化、校验、拷贝三处共用（`00-core:21-22` 的注释明确说明）。

### 写入失败

`persist()`（`00-core:25-35`）捕获配额异常：

- 只警告一次（`persist._warned`）；
- 尽力弹一次 toast「存档写入失败 · 进度可能未保存」；
- 返回 `false`，调用方据此回滚（见结算部分）。

## 单局存档槽 `arkmist_slots_v1`

### 结构

```js
slots = {
  v: 2,                         // SLOT_VER
  active: null | 0|1|2,
  slots: [null, null, null],
  corrupt: false                // 运行时标记，不落盘
};
```

单个槽：

```js
{ v, ts, day, phase: 'day'|'night',
  summary: { nights, kills, core: '600/600' },
  snap: { seed, nodes, fogBlobs, S, P, res, DECK, core, builds, foes, warns, shots } }
```

`summary` 单独存在，是为了**列表渲染不必解包整个快照**；但它必须和 `snap` 一起通过校验，否则残缺档会在渲染时抛错白屏（`00-core:101-102` 注释）。

### `validateSlot` 逐项校验（`00-core:108-128`）

- `v === 2`（v1 不迁移，直接判格式不符）；
- `ts` 有限、`day` 在 `1..1e7`、`phase` 二选一；
- `summary` 三项合法，`core` 匹配 `^\d+/\d+$`；
- `snap.seed` 整数、`S/P/res` 及嵌套对象存在；
- 关键数值有限（`hp/maxHp/en/maxEn/timeLeft/day`）；
- `DECK.draw/hand/discard` 都是数组，每张卡 `{uid: int, id: string}`；
- `P.sigils` 长度不超过武器槽位数，元素为 `null` 或合法卡；
- 数组上限：`foes ≤ 44`、`shots ≤ 240`、`warns ≤ 80`、`nodes ≤ 240`。

这些上限同时也是 `captureSnapshot` 的截断上限（`04-state:180-188`），两边必须一致，否则会「存得进去、读不回来」。

### 坏档处理

`loadSlots()`（`00-core:130-148`）：

- 解析失败或版本不符 → `slots.corrupt = true`、`corruptReason='format'`、备份原始串；
- 单槽校验失败 → 跳过该槽、`corruptReason='slot'`、同样备份；
- **只读不删**。玩家确认后才 `ackCorrupt()` 清掉备份（`00-core:168-171`）。

### 先写盘后提交内存

`persistSlots(next)`（`00-core:150-166`）：

1. 先 `JSON.stringify`，失败就返回 `false`；
2. 再 `localStorage.setItem`，失败也只警告、返回 `false`；
3. **两步都成功后才更新内存里的 `slots`**，避免配额失败时内存与磁盘不一致。

## 快照捕获与恢复

### 捕获 `captureSnapshot()`（`04-state:169-190`）

- `S` 只取白名单字段 `S_SAVE_FIELDS`，不存临时拖拽态；
- `S.dawnBless` / `S.dawnSigils` 只存 id——`BLESSINGS` 条目带函数 `f`，不能序列化，恢复时按 id 回绑；
- `P.sigils` 保留空位，映射成 `{uid,id}` 或 `null`，读档后刻印必须回到原槽；
- 牌堆截断上限 400 张，注释说明「构筑物管够，截断要留余量，否则读档少牌」；
- 世界实体按各自上限 `_clone` 深拷贝。

### 恢复 `restoreSnapshot(s)`（`04-state:193-230`）

关键顺序：

1. `genWorld(seed)` 用种子重建地形与资源摆放；
2. 再用快照里的 `nodes` / `fogBlobs` **覆盖**——因为资源摆放含随机，光靠 seed 不够；
3. `_putObj(S, ...)` / `_putArr(foes, ...)` **原地恢复**，不重新赋值引用；
4. `P.sigils` 按当前武器槽位数定长重建，短数组（旧档）补 `null`；
5. 清空粒子/弹体/拖拽临时态，重建空间网格与流场脏标记。

第 3 步是整个设计的关键：全局 `const` 对象被无数闭包与函数引用，一旦重新赋值，所有引用都会指向旧对象。

## 自动存档时机

`autoSave()`（`11-main:307-316`）只在可玩状态下工作，且：

- 优先写**当前活跃槽**；
- 没有活跃槽才找第一个空槽；
- 三槽全满**拒绝覆盖**，提示玩家手动选槽。

调用点：

| 时机 | 位置 |
| --- | --- |
| 开局 | `startRun` → `autoSave()` |
| 每日黎明选择完成 | `finishDawn` → `autoSave()` |
| 暂停 | `pauseGame` → `persist()`（只写局外，不写槽） |
| 返回标题 / 重新开始前 | `btnToTitle` / `btnRestart` → `savedThen(...)` 先存档再动 |
| 手动 | `K` 键 `pauseQuickSave`、暂停面板「存档」 |

## 结算：幂等与失败回滚

结算最容易写出「重复发奖」或「奖发了档没清」的 bug，项目用三道闸：

### 1. `settle()` 幂等（`08-progress:147-169`）

`S.settled` 同时是**幂等闸门**与**展示快照**：一旦有值，后续调用直接返回，不会二次加火种。

### 2. 写入失败回滚

`finishSettle(prev, settled)`（`08-progress:131-145`）：

```js
if (!persist()) {
  save.embers = prev.embers;          // 火种回滚
  save.best.nights = prev.nights;     // 最佳记录回滚
  save.best.kills = prev.kills;
  S.settled = null;                   // 闸门重新打开，允许重试
  toast('结算写入失败 · 进度已保留，稍后重试','warn');
  return null;
}
```

### 3. 清槽失败写墓碑

如果局外数据写成功、但 `clearActiveSlot()` 失败，就把当前槽改写成「已结算」的墓碑快照（`writeTombstone`，`08-progress:122-130`）。下次读这个档会直接进结算页，**不会把同一局的奖励再发一次**。

### 无尽增量

`continueEndless()` 后再次结算时，只补发「胜利基线之后」的增量：

```js
delta = perNight*(nights - nights0) + floor(kills/killsDiv) - floor(kills0/killsDiv);
```

不重复 `+12`、不重复 `wins++`、难度系数只乘一次（`08-progress:150-160`）。

## 下一步

- 存档里图鉴 `seen` 的读写：[09 UI 与输入](09-ui-and-codex.md) 的图鉴部分
- 测试如何覆盖存档路径：[10 测试体系](10-testing.md)
