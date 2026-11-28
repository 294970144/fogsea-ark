# 06 · 渲染与特效

两条独立的渲染管线并行工作：

- **世界层**：Canvas 2D，`js/02-world.js` + `js/09-render.js`；
- **特效层**：独立画布 `#fxcv`，WebGPU 优先 / three.js WebGL 回退，`js/09b-fx.js`。

两者叠在一起，特效层在上（`#fxcv` 在 `#cv` 之后）。

## 等距投影

世界坐标 `(x, y)` 是俯视网格，屏幕坐标由 `proj` 转：

```js
const TW = 64, TH = 32;                       // 瓦片宽高，2:1
proj  = (x,y) => [(x-y)*TW/2, (x+y)*TH/2];
unproj= (sx,sy) => [(sx/(TW/2)+sy/(TH/2))/2, (sy/(TH/2)-sx/(TW/2))/2];
```

`unproj` 用于把鼠标屏幕坐标反算回世界坐标（`updateMouseWorld`，`05-input:168`），出牌落点靠它。

地图是 40×40 网格（`GRID=40`），中心为方舟核心。

## 地面烘焙

地形不会每帧重画。`genWorld()` 结束时调 `bakeGround()`（`02-world:89`），把整块地面画进一张离屏 canvas（`GRID*TW × GRID*TH+70`），之后每帧只 `drawImage` 一次。

烘焙内容包括：每块陆地的菱形填充与描边、水岸立面、草地/碎石/晶点的随机装饰。判定全部用 `hash(x,y)` 决定，**不使用 `Math.random`**，保证同一 seed 得到同一张地面图。

`bakeMask()` 另外烘一张 124×124 的小地图底图。

## 画家算法与深度排序

等距场景必须按「离镜头远近」排序，否则遮挡会错。项目用最经典的做法：**按 `x+y` 从大到小排序**（`09-render:388-398`）。

```js
dlPush(x+y, kind, obj);   // 推入显示列表
dlActive.sort((a,b) => a.d - b.d);   // 远的先画
```

`kind` 只用于选择绘制函数：0 资源节点、1 建筑、2 核心、3 敌人、4 拾取物、5 玩家、6 残影、7 预警圈。

排序稳定性依赖 `x+y` 唯一性；同值时会按推入顺序画。项目通过给每类物体固定的推入顺序（节点→建筑→核心→敌人→拾取→玩家）来避免同值时的视觉抖动。

> 背景知识：等距图层的深度排序本质是对「屏幕 y 越靠下越近」的近似。工业界的完整做法是按包围盒两两求依赖再拓扑排序，但本项目的物体都是单点实体，`x+y` 已经足够。

## 夜晚光照

白昼直接画；夜晚分两步（`09-render:455-486`）：

1. 全屏铺一层 `rgba(5,9,22,0.52*night)` 压暗；
2. 切 `globalCompositeOperation='lighter'`，在核心、玩家、建筑、雾晶、弹体位置叠加预生成的径向光晕 `GLOW[...]`。

光晕是启动时用 `makeGlow()` 预渲染的 128×128 径向渐变贴图（`02-world:6-14`），避免每帧建渐变。`night` 值由 `S.nightAmt` 在昼夜切换时线性过渡。

额外氛围：9 团 `fogBlobs` 缓慢漂移的雾、全屏暗角 `vigGrad`、胜利起飞的中央光柱。

## 实体绘制

每个实体一个函数，纯 Canvas 路径绘制，不使用 sprite 图集：

| 函数 | 对象 |
| --- | --- |
| `drawTree` / `drawRock` / `drawCrys` | 资源节点，带摇摆/抖动 |
| `drawCore` | 方舟核心，带呼吸光与受损闪烁 |
| `drawBuild` | 五种建筑，按 `pulse` 做动画 |
| `drawPlayer` | 守灯人，含武器挥砍朝向 |
| `drawFoe` | 四种敌人，含精英/受击闪白 |
| `drawPickup` | 掉落物 |

卡牌图鉴的「实景模型」预览就是复用这些函数画到一个离屏 canvas 上（`10-ui:475-514`，临时把全局 `ctx` 指向图鉴 canvas，画完 `finally` 还原）。

## 小地图

`renderMinimap()`（`09-render:497`）画在右上角 124×124 的画布：底图 + 建筑点 + 敌人点 + 核心 + 玩家朝向。预警圈闪烁（每 1/6 秒交替）。绘制用独立 `mctx`，不影响主画布变换。

## 特效层：双后端

`js/09b-fx.js` 是一个自包含的 GPU 粒子系统，入口对象 `FX`。

### 降级链

```
FX.init()                          // 09b-fx:1379
  if (navigator.gpu)
      try initGPU()  → backend='webgpu'
      catch → 换一张新画布（webgpu 上下文已占用，WebGL 无法复用同节点）
  if (!ready)
      try new THREE.WebGLRenderer() → backend='webgl'
      catch → FX.on=false（静默关闭）
```

三条兜底原则：

1. **WebGPU 优先**：能力检测通过才用，失败换节点再退 WebGL；
2. **WebGL 再退**：three.js r158 的 `WebGLRenderer`，监听 `webglcontextlost` 直接关层；
3. **都不行就静默跳过**：**不回退 Canvas 2D**（`09b-fx:1420`）。Canvas 2D 粒子在高密度下代价太高，宁可不放特效也不拖垮主循环。

`device.lost` 也会触发 `gpuDegrade()`（`09b-fx:406`），把层关掉而不是崩溃。

### 两套粒子池

| 池 | 数量 | 混合 | 用途 |
| --- | --- | --- | --- |
| `pools.add` | 6144 | 加色 | 火光、火花、光带 |
| `pools.alpha` | 2048 | 普通 alpha | 烟、雾、暗色碎片 |

粒子位置在 **shader 内积分**（顶点着色器按 `aVel/aPhys/aTime` 算位置），CPU 只上传初始参数，所以上万粒子也不需要每帧回写。

`FX.q` 是质量系数，`prefers-reduced-motion` 时降为 0.4（`09b-fx:1410`），粒子数量按比例缩减。

### 二次元（quad）特效

除了粒子，还有 16 个 quad 槽位，用于环形冲击波、屏闪、地面贴花、符文、光柱、光束、护罩、斩击弧。统一接口 `quad(mode, o)`，mode 0~7 对应不同片元着色器分支。

### 入口保护

`cast/spell/reaction/storm/detonate/...` 在文件末尾被统一包了一层（`09b-fx:1421-1423`）：`FX.on` 为假时直接 return。所以业务代码可以无条件调用特效，不需要判断后端。

## 性能约定

- `DPR = min(devicePixelRatio, 2)`，4K 屏也不追满像素比；
- 地面只烘焙一次，小地图底图同理；
- 粒子在 GPU 内积分，CPU 只做参数上传；
- 空间网格（`CELL=2`）把索敌/碰撞从 O(n²) 降到近似 O(n)；
- 一帧只有一个 `requestAnimationFrame`，没有并行的渲染循环。

## 下一步

- 数据驱动的绘制参数：[07 数据模型](07-data-model.md)
- 前端风格规范：以 `css/style.css` 现有实现为准（原 UX 审计记录已清理）
