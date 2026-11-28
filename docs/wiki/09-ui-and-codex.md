# 09 · UI 与输入

核心文件：`js/10-ui.js`（536 行，HUD + 图鉴）、`js/11-main.js`（菜单/暂停/存档 UI）、`js/05-input.js`（输入）、`js/06-hand.js`（手牌 DOM）。

## 页面骨架

`index.html` 按层组织：

```
#cv          世界画布（Canvas 2D）
#fxcv        特效画布（WebGPU/WebGL）
#grain 等    噪点、受伤红边、核心受击特效
#hud         游戏内 HUD（默认 hidden）
  #topLeft     阶段/日数/进度条
  #weaponHud   武器卡 + 槽位 + 节奏条
  #topRight    提前入夜/倍速/静音/暂停
  #playerPanel 生命/雾能/护盾/经验/冲刺/雾爆
  #handArea    资源/抽牌堆/弃牌/手牌/回收率/修复
  #rightBottom 核心耐久 + 小地图
.overlay     多个遮罩：#menu #codexOv #dawnOv #pauseOv #slotOv #confirmOv #endOv
```

所有遮罩都是绝对定位的全屏层，`showOv(id, on)` 切 `.show` 类控制显隐。

## HUD 的脏标记

HUD 每秒更新几十次，但多数值不变。`10-ui.js` 用缓存避免无意义的 DOM 写入：

```js
setTxt(el, v)  // el._t === v 就不写
setBar(el, fill, r)  // el._v 相同就不改 transform
```

`UI` 对象在 `cacheUI()` 里一次性缓存所有 DOM 引用（`10-ui:3-24`）。**读档后必须 `clearHudCache()`**（`11-main:328-334`），把所有 `_` 前缀的脏标记删掉，否则 HUD 会保持读档前的旧值不刷新。

## 手牌 DOM

### 渲染流程

```
renderHand() → makeHandCard(c, i) × n → fill(#handRow) → layoutHand()
```

- `cardInner(def, hot)` 生成卡面 HTML：图标、名称、费用、短文案、品质角标；
- `layoutHand()` 计算每张卡的水平位置与旋转，超出手牌区时压缩间距；
- 拖拽：`pointerdown` 后移动超过 7px 才生成拖影 `#dragCard`，避免点击被误判成拖拽。

### 拖放落点判定

`pointerup` 里用 `document.elementFromPoint` 判定落在哪（`05-input:139-161`），优先级：

| 落点 | 行为 |
| --- | --- |
| `#recycleZone` | `recycleHandCard(uid)` 回收 |
| 另一张 `.hcard` | `tryFuse(uid, 目标)` 熔铸或拆解 |
| `#weaponSlots` | `engraveCard(uid, slot)` 装刻印 |
| 世界画布 / 武器 HUD | `tryPlayAt` 出牌 |
| 其它 | `selectCard(uid)` 进入瞄准 |

`slotDrag` 是另一条并行拖拽（槽内刻印拖到另一个槽或拖出卸下），判定逻辑在 `05-input:122-138`。

### 动画

- 出牌拖影、建筑放置预览（白/红半透明）画在独立的 `#dragBuildCv` 上；
- 回收有飞牌动画 + 火花（`flyRecycledCard` / `recycleSparkBurst`），`prefers-reduced-motion` 时跳过；
- 装刻印有飞行动画 `flySigil`。

## 图鉴

图鉴是 `10-ui.js` 里最大的一块（183-535 行），也是「数据驱动 UI」的集中体现。

### 数据来源

`CODEX` 数组（`10-ui:190-388`）不是手写清单，而是从数据表 map 出来：

- 角色：手写 4 条（守灯人、法师、核心、三种资源）+ `WEAPON_IDS.map` 生成武器条目；
- 卡牌：`CARD_IDS.filter(id => !CDEFS[id].sigilOnly).map`；
- 雾裔：`Object.entries(FOES).map`；
- 祝福：`BLESSINGS.map`；
- 刻印：`SIGIL_IDS.map`；
- 传承：`Object.entries(BLESS).map`；
- 术语：手写 13 条（手牌、牌库、回收率、黎明、雾潮、七夜、火种、冲刺、雾爆、法力、法术、元素状态、反应、灯芯熄灭）。

每条：`{id, cat, name, icon, color, sprite?, desc, tags?, badge?, stats: () => [[标签, 值]...], rel?: [id...]}`。

`stats` 是**函数**，每次选中时实时求值——所以详情页能显示当前生命、当前装备等局内状态。

### 渲染函数

| 函数 | 作用 |
| --- | --- |
| `cxBuildCats()` | 渲染 9 个分类按钮与各类条目数 |
| `cxRenderList()` | 按分类 + 搜索词过滤，渲染列表，更新进度 |
| `cxSelect(id, scroll)` | 渲染详情：名称、分类、数值表、相关条目、标签、图标或实景预览 |
| `cxMove(d)` | ↑↓ 在过滤结果中移动 |
| `cxDrawPreview(dt)` | 在 `#cxPreview` 上实时绘制实体（复用世界绘制函数） |
| `openCodex(from)` / `closeCodex()` | 开关、记录来源、恢复焦点 |

### 两个分母（已修正）

标题行的「N 条 · 当前显示 X · 收集 Y/86」有两个不同口径：

- `CODEX.length`：图鉴条目总数，含术语与手写条目；
- `track`：**可收集**条目数 = `FOES + BLESSINGS + CARD_IDS + SIGIL_IDS`，只有这些会累计 `save.seen`。

2026-11-28 的修复把这句文案改成 `113 条 · 当前显示 X · 收集 Y/86`，并在进度条上加了 `title` 解释「击杀、拾获、铭刻过的条目计入手册收集」。改动涉及 `10-ui:435`、`index.html:241`、`tests/regression.js:1220`。

修改这块时注意：**不要在 JS 里用 `el.parentElement` 挂属性**，回归测试的 DOM 桩没有这个字段，会让 R1/R9/R22 报 `Cannot set properties of undefined`。用静态 HTML 属性最稳。

### 实景预览

`cxDrawPreview`（`10-ui:475-514`）的核心技巧：

```js
const main = ctx;
try {
  ctx = cxCtx;                 // 临时把全局 ctx 指向图鉴 canvas
  ...drawPlayer / drawCore / drawFoe...
} finally { ctx = main; }        // 一定还原
```

这样图鉴不用重写一套绘制，直接复用世界渲染函数。

## 菜单视图

`setMenuView(view)`（`11-main:18-31`）在标题/出航准备/载入三个视图间切换，并**测量内容高度**来决定是否启用滚动：

- 先临时把面板设成 `position:static` 量自然高度；
- 加回边框与内边距（border-box 的坑）；
- 超过 CSS 的 `max-height` 才加 `.needs-scroll`；
- 面板高度用 `min(自然高度, 上限)` 做过渡。

武器选择器是下拉式：`#weaponDrop` 位置由 `positionWeaponDrop()` 按按钮矩形动态计算；键盘焦点被 `trapWeaponFocus` 限制在弹层内（Tab 循环）。

## 输入：守卫链

`keydown` 处理器是一串**有序守卫**（`05-input:22-90`），顺序不能乱：

```
1. weaponPicker   → Esc 取消 / 1-4 选武器 / 方向键切换 / Tab 锁焦点
2. confirmAction  → Enter 确认 / Esc 取消
3. codexOpen      → Esc 关闭 / ↑↓ 移动（其余按键吞掉）
4. slotUi         → Esc 关闭 / 1-3 选槽
5. S.mode==='dawn'→ 1-3 选黎明 / Esc 跳过
6. S.mode==='play'→ 1-= 选牌、Q 雾爆、空格冲刺、F 修复、N 入夜、Esc/P 暂停、M 静音、K 存档
7. pause / menu / prep 各自处理
```

新增快捷键时先想清楚它该在哪一层：放在后面的层会被前面的分支吞掉。

`keyup` 只做 `keys[k]=false`；窗口 `blur` 时清空所有按键并结束拖拽，防止切窗口后角色一直走。

## 触摸与无障碍

- `isTouch` 由 `pointer:coarse` 或 `ontouchstart` 判定，给 `body` 加 `.touch`；触摸端出现虚拟摇杆与冲刺/雾爆按钮；
- `reduceMotion` 由 `prefers-reduced-motion` 判定，关闭飞牌动画、降低特效粒子量；
- 遮罩有 `role="dialog"`、`aria-modal`、`aria-label`；武器选择器与确认框做焦点陷阱；
- 已知待改进项（原 UX 审计结论）：viewport 禁缩放、弹窗无完整 focus trap、手牌非语义元素——审计记录已清理，结论保留于此。

## 下一步

- 图鉴条目如何从数据派生：[07 数据模型](07-data-model.md)
- HUD 依赖的局内状态：[02 架构](02-architecture.md)
