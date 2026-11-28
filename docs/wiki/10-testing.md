# 10 · 测试体系

核心文件：`tests/regression.js`（2,009 行）。无第三方依赖，只用 `node:fs` / `node:vm` / `node:assert` / `node:path`。

## 运行

```bash
node tests/regression.js              # 全套回归，提交前跑
node tests/regression.js --new-card   # 只跑 C0 新牌接线体检
```

退出码 0 表示全过；失败会打印 `FAIL 用例名: 原因`。

## 为什么用 `vm` 沙箱

游戏代码是 15 个无模块脚本，共享全局作用域，还依赖 `document` / `canvas` / `localStorage`。要测它，最直接的办法是**造一个假浏览器，把整份源码灌进去执行**。

`makeEnv()`（`regression.js:78`）做了三件事：

1. 用桩对象拼一个 `sandbox`（`document`、`window`、`localStorage`、`performance`、`requestAnimationFrame`）；
2. `vm.createContext(sandbox)` + `vm.runInContext(SRC, ctx)` 执行**拼接后的整份源码**；
3. 把 `spellFxTime` 替换成 `() => 0`，去掉施法延时，让命中在同帧结算、结果确定。

```js
const ORDER = ['00-core','01-audio','02-world','03-data','04-state','05-input',
  '06-hand','07-combat','07b-spells','08-progress','09-render','10-ui','11-main'];
const SRC = ORDER.map(n => fs.readFileSync(...)).join('\n;\n');
```

**`09b-fx` 和 `three.min.js` 不在 `ORDER` 里**：特效层被排除，`FX` 用空实现顶上。C0 会另外读 `09b-fx.js` 的源码做静态扫描（见下）。

每个 `testCase` 都新建一个 `makeEnv()`，用例之间不共享状态。

## 桩替身

### DOM 元素 `makeEl`

- `style` 用 `Proxy` 吞掉任意属性读写；
- `classList` 有 `add/remove/toggle/contains`；
- `children` 数组；`appendChild` 会回填 `parentNode`；
- `innerHTML` 的 get/set 走 `_html`；
- **没有 `parentElement`**——这是有意的坑位：业务代码若依赖它，测试会直接失败（`Cannot set properties of undefined`）。

### Canvas 上下文 `makeCtx`

用 `Proxy` 让任何未定义的方法调用都变成 `noop`，`createRadialGradient` 等返回带 `addColorStop` 的假渐变。这样绘制代码不需要在测试里真的画。

### 存储与计时

- `localStorage` 用 `Map` 模拟，可预置初始数据；
- `performance.now`、`requestAnimationFrame` 由用例手动推进；
- `setTimeout` / `setInterval` 记录在 `timers` 里，可断言或清理。

## 用例清单

| 用例 | 覆盖 |
| --- | --- |
| `R0_seven_nights_and_save_baseline` | 前 7 夜模拟结果与存档快照必须逐值等于 `GOLDEN.r0` |
| `R1_settlement` | 结算、重复结算幂等、无尽增量、失败路径 |
| `R3_deck` | 牌库循环、洗牌、抽牌上限 |
| `R5_full` | 完整流程冒烟 |
| `R9_codex` | 所有图鉴条目 `stats()` 不抛错且返回数组；满图鉴进度 `n/n` |
| `R15_weapon` | 武器节奏与索敌 |
| `R19_fx` | 特效层入口保护 |
| `R22_weapon` | 施放链折叠、散布、刻印计费 |
| `R25_card` | 卡牌数值黄金值（品质/状态/熔铸行） |
| `R26_projectile` | 投掷物弹道与飞行时间 |
| `R27_overflow` | 手牌超限与回收闸门 |
| `R30_weapon` | 法杖轮发与充能 |
| `R33_starter` | 起始牌库构成 |
| `R35_cast` | 施法链与刻印组合 |
| `C0_new_card_wiring` | 新牌接线体检（源码级） |

### 基线用例的特殊性

`R0` 依赖 `GOLDEN` 黄金值。任何改动只要影响了**前 7 夜的随机序列**（刷怪类型、掉落、牌序），都会让 R0 失败。这是项目要求「牌库洗牌用独立随机流」「`genWorld` 不引随机」的根本原因。

改数值时如果 R0 失败，先判断是「预期内的平衡调整」还是「无意中动了随机序列」，再决定更新基线还是修代码。

### C0 的静态扫描

`C0_new_card_wiring` 不执行游戏，而是读源码做正则检查：

- 所有 `sfx('x')` 的字面量，必须在 `01-audio.js` 的 `case 'x':` 里登记；
- 所有 `FX.cast('x')` 的 id，必须在 `09b-fx.js` 的 `id==='x'` 分支或 `BUILD_THEME` 里出现；
- 卡牌字段、图标、来源、奖励池排除项。

这相当于一个轻量的「接线完整性」类型检查，专门防止新增内容时漏登记。

## 断言风格

```js
assert.equal(actual, expected);            // 严格相等
assert.deepEqual(actual, expected);        // 深比较
assert.ok(condition, '失败时的人类可读原因');
```

复杂用例通过 `env.run('...')` 在沙箱内执行一段表达式，返回 JSON 再断言——避免把游戏内部对象直接带出沙箱。

## 新增测试时

1. 在 `testCase` 列表里加一个新名字（`R36_xxx`）；
2. 用例内 `const env = makeEnv()`，用 `env.run(...)` 驱动；
3. 尽量断言**稳定的量**（数量、布尔、结构），避免依赖帧序或浮点尾数；
4. 若确实要固定数值，先在沙箱里跑出当前值，确认符合设计后再写死；
5. 跑 `node tests/regression.js`，确认新用例与既有 14 个都过。

## 下一步

- 新牌的完整接线步骤：[11 开发指南](11-development-guide.md)
- 基线为何如此敏感：[02 架构](02-architecture.md) 的三条隐含契约
