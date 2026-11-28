# 01 · 项目概览

## 一句话定位

**纯前端、零依赖、零构建**的网页生存射击 + 卡牌构筑游戏。Canvas 2D 做等距世界渲染，WebGPU/WebGL 可选做粒子特效，WebAudio 实时合成音效，`localStorage` 存档。没有任何后端、没有 `package.json`、没有打包步骤——`index.html` 双击就能玩。

## 技术栈速览

| 层 | 选型 | 代码位置 |
| --- | --- | --- |
| 页面与 DOM | 原生 HTML/CSS，无框架 | `index.html`、`css/style.css`（775 行） |
| 世界渲染 | Canvas 2D，等距投影，画家算法 | `js/02-world.js`、`js/09-render.js` |
| 粒子/特效 | WebGPU 原生 WGSL 优先，three.js WebGL 回退 | `js/09b-fx.js`（1,424 行） |
| 音频 | WebAudio 振荡器 + 噪声 + 生成式和弦 | `js/01-audio.js` |
| 状态 | 全局单例对象（`P` / `S` / `DECK` / `res` / `save` / `slots`） | `js/04-state.js`、`js/00-core.js` |
| 存档 | `localStorage` 两个键，白名单逐项校验 | `js/00-core.js`、`js/04-state.js` |
| 测试 | Node 内置 `vm` 沙箱 + DOM/Canvas 桩 | `tests/regression.js`（2,009 行） |

## 一局是怎么走的

`S.mode` 驱动整个游戏的状态机；一局的正常路径是：

```
menu（标题）
  └→ prep（出航准备：选武器、难度、买传承）
       └→ play（可玩状态，内部再分 phase）
            ├ day（白昼 70 秒）：采集、拖卡构筑、修核心；按 N 提前入夜
            └ night（夜晚）：雾潮分批从岛缘刷新，构筑牌封存，只能打瞬发牌
                 └ 打光本夜全部敌人 → dawn（黎明，两步 3 选 1）→ 下一天
                      └ 第 7 夜击溃雾潮之主 → launch → end（结算）
                           └ 胜利后可选 continueEndless 进入无尽
            └ 核心耐久归零 → over → end（失败）
```

关键常量在 `js/04-state.js:10`：`DAY_LEN=70`、`MAX_NIGHT=7`、`HAND_CAP=10`、`REC_CAP=50`、`FOE_CAP=44`。

## 三种核心资源

| 资源 | 来源 | 用途 |
| --- | --- | --- |
| 木 `wood` | 砍树 | 多数构筑牌与部分瞬发牌的费用 |
| 石 `stone` | 敲岩石 | 箭塔、雾晶炮、修补术 |
| 雾晶 `crys` | 矿脉、击杀雾裔 | 高阶卡、熔铸手续费、雾晶炮 |

设计原则：**费用即资源，不引入第二种货币**。法术改用「雾能/法力」，是同一套资源模型的特例（`mana` 字段，见 [05 法术与元素](05-spells-and-elements.md)）。

## 四条武器路线

在「出航准备」页四选一，本局固定（`js/03-data.js:280-290`）：

| 武器 | 路线 | 槽位 | 攻击方式 |
| --- | --- | --- | --- |
| 剑 `sword` | 近战 | 3 | 范围挥砍 + 剑气，最高爆发 |
| 火焰法杖 `flame` | 火焰 | 6 | 范围灼烧，火势蔓延到相邻敌人与树 |
| 冰法杖 `frost` | 冰霜 | 6 | 范围冰缓，叠减速控场 |
| 奥术法杖 `arcane` | 奥术 | 6 | 高频单体，叠奥术标记 |

法杖开局预装一枚对应法术刻印（`startSigils`），牌库不再生成同款；剑不能装法术刻印。

## 难度

三档，在准备页随时切换、立即生效（`js/00-core.js:37-41`）：

| 难度 | 敌人生命 | 敌人伤害 | 敌人数量 | 火种收益 |
| --- | --- | --- | --- | --- |
| 平缓 `calm` | ×0.8 | ×0.75 | ×0.8 | ×0.8 |
| 标准 `std` | ×1 | ×1 | ×1 | ×1 |
| 狂澜 `wild` | ×1.25 | ×1.3 | ×1.25 | ×1.5 |

## 目录结构

```
index.html            入口，按序加载 15 个脚本（含 vendor/three.min.js）
css/style.css         全部样式（含 HUD、菜单、图鉴、移动端适配）
assets/weapons/*.svg  四种原创武器插画
assets/favicon.svg    站点图标
js/00-core.js         常量、难度、传承、存档读写、图标字典
js/01-audio.js        WebAudio 合成音效与氛围
js/02-world.js        画布、等距投影、地图生成、空间网格、流场寻路
js/03-data.js         数值总表、建筑/敌人/卡牌/武器/刻印/祝福数据
js/04-state.js        运行状态、牌堆、难度曲线、单局快照
js/05-input.js        键鼠与触摸输入、拖拽落点判定
js/06-hand.js         手牌 DOM、拖拽、出牌、熔铸、拆解、回收
js/07-combat.js       战斗循环、敌人 AI、弹体、波次、玩家动作
js/07b-spells.js      法师、法力、元素状态与法术执行
js/08-progress.js     黎明选择、胜负结算、无尽
js/09-render.js       世界与实体绘制、昼夜光照、小地图
js/vendor/three.min.js three.js r158（WebGL 回退）
js/09b-fx.js          WebGPU/WGSL 优先、WebGL 回退的特效层
js/10-ui.js           HUD、图鉴
js/11-main.js         流程、主循环、菜单视图、存档槽 UI
tests/regression.js   隔离回归脚本（Node 运行）
docs/wiki/            本 Wiki
docs/                 设计文档、卡牌流程、UX 审计
```

## 怎么运行

```bash
# 方式一：直接双击 index.html（file:// 也能跑，存储按 origin 隔离）
# 方式二：起本地服务
python -m http.server 8000
# 打开 http://localhost:8000
```

无需安装依赖。标题字体走 Google Fonts，离线退化为系统字体，不影响游玩。

## 下一步

先读 [02 整体架构](02-architecture.md) 搞清楚脚本之间怎么协作，再按你的目标挑专题页。
