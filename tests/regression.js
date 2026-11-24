'use strict';
/* 雾海方舟 · 隔离回归脚本（仅 Node 内置模块）
   用法：node tests/regression.js
   采集改动前黄金值：CAPTURE=1 node tests/regression.js
   设计确认：第七夜清场判胜是设计行为，不是缺陷；本脚本 R1 锁定该结果。 */

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ORDER = ['00-core', '01-audio', '02-world', '03-data', '04-state', '05-input',
  '06-hand', '07-combat', '08-progress', '09-render', '10-ui', '11-main'];
const SRC = ORDER.map(n => fs.readFileSync(path.join(ROOT, 'js', n + '.js'), 'utf8')).join('\n;\n');

const noop = () => {};
const makeGradient = () => ({ addColorStop: noop });
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p === 'createRadialGradient' || p === 'createLinearGradient' || p === 'createPattern') return makeGradient;
      if (p === 'measureText') return () => ({ width: 0 });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p === 'canvas') return { width: 128, height: 128 };
      if (p in t) return t[p];
      return noop;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeEl(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    _listeners: listeners,
    classList: (() => {
      const cs = new Set();
      return {
        add(c) { cs.add(c); }, remove(c) { cs.delete(c); },
        toggle(c, on) { if (on === undefined) { cs.has(c) ? cs.delete(c) : cs.add(c); } else if (on) cs.add(c); else cs.delete(c); },
        contains(c) { return cs.has(c); }
      };
    })(),
    style: new Proxy({}, {
      get(t, p) {
        if (p === 'setProperty' || p === 'removeProperty') return noop;
        return t[p] === undefined ? '' : t[p];
      },
      set(t, p, v) { t[p] = v; return true; }
    }),
    dataset: {}, textContent: '', value: '',
    children: [], width: 128, height: 128,
    offsetWidth: 104, offsetHeight: 150, clientWidth: 600, clientHeight: 150, scrollHeight: 300,
    addEventListener(type, cb) { (listeners[type] || (listeners[type] = [])).push(cb); },
    removeEventListener: noop,
    appendChild(c) { el.children.push(c); if (c && typeof c === 'object') c.parentNode = el; return c; },
    insertBefore(c) { return el.appendChild(c); },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    remove() { if (el.parentNode) el.parentNode.removeChild(el); },
    querySelector() { return makeEl('div'); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 128, bottom: 128, width: 128, height: 128 }; },
    getContext() { return makeCtx(); },
    focus: noop, blur: noop, setPointerCapture: noop, releasePointerCapture: noop,
    scrollIntoView: noop, contains: () => false
  };
  Object.defineProperty(el, 'firstElementChild', { get() { return el.children[0] || (el.children[0] = makeEl('div')); } });
  Object.defineProperty(el, 'parentNode', {
    get() { return el._parent || (el._parent = makeEl('div')); },
    set(v) { el._parent = v; }
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html || ''; },
    set(v) { el._html = String(v); el.children.length = 0; }
  });
  return el;
}
function makeEnv(opts = {}) {
  const ids = new Map(), docL = {}, winL = {};
  const store = new Map(opts.storage || []), setCalls = [];
  const timers = { next: 1, timeouts: new Set(), intervals: new Set(), cleared: new Set() };
  let rafCb = null;
  const cv = makeEl('canvas'), body = makeEl('body');
  const document = {
    body, hidden: false, activeElement: null,
    getElementById(id) { if (!ids.has(id)) ids.set(id, makeEl('div')); return ids.get(id); },
    querySelector() { return makeEl('div'); },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    elementFromPoint() { return cv; },
    addEventListener(t, cb) { (docL[t] || (docL[t] = [])).push(cb); },
    removeEventListener: noop
  };
  ids.set('cv', cv);
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { setCalls.push([k, String(v)]); store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); }
  };
  let seed = 987654321;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = {
    console, document, localStorage,
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    performance: { now: () => 0 },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    // The VM has no layout engine. Give the menu a computed height cap for startup.
    getComputedStyle: () => ({ maxHeight: '750px' }),
    addEventListener(t, cb) { (winL[t] || (winL[t] = [])).push(cb); },
    removeEventListener: noop,
    setTimeout(fn, ms) { const id = timers.next++; timers.timeouts.add(id); return id; },
    clearTimeout(id) { timers.cleared.add(id); timers.timeouts.delete(id); },
    setInterval(fn, ms) { const id = timers.next++; timers.intervals.add(id); return id; },
    clearInterval(id) { timers.cleared.add(id); timers.intervals.delete(id); },
    requestAnimationFrame(cb) { rafCb = cb; return 1; }
  };
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = rng;
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SRC, ctx, { filename: 'bundle.js' });
  return {
    ctx, ids, docL, winL, store, setCalls, timers, cv,
    getRaf: () => rafCb,
    run: code => vm.runInContext(code, ctx)
  };
}
const j = env => s => JSON.parse(env.run(s));

function captureR0(env) {
  return j(env)(`(()=>{
    const out={nightTotal:{},bossNight:{},hp:{},weights:{}};
    for(let d=1;d<=7;d++){
      S.day=d;S.phase='night';S.toSpawn=0;S.nightKilled=0;warns.length=0;foes.length=0;
      startNight();
      out.nightTotal[d]=[S.nightTotal,S.toSpawn];
      out.bossNight[d]=warns.some(w=>w.boss);
      warns.length=0;
    }
    for(let d=1;d<=7;d++){
      S.day=d;out.hp[d]={};
      for(const t of ['crawler','spitter','brute','boss']){
        foes.length=0;spawnFoe(t,20,20,false);out.hp[d][t]=foes[foes.length-1].max;
        foes.length=0;spawnFoe(t,20,20,true);out.hp[d][t+'Elite']=foes[foes.length-1].max;
      }
      let c=0,s=0,b=0;foes.length=0;
      for(let k=0;k<200;k++){const t=pickFoeType();if(t==='crawler')c++;else if(t==='spitter')s++;else b++;}
      out.weights[d]=[c,s,b];foes.length=0;
    }
    return JSON.stringify(out);
  })()`);
}
function captureSaves() {
  const mk = (key, obj) => [[key, JSON.stringify(obj)]];
  const base = { embers: 41, bless: { blade: 2, iron: 1, stock: 0 }, best: { nights: 5, kills: 33, wins: 1 },
    seen: { foe: { crawler: 7 }, build: { tower: 2 }, card: { blade: 1 }, play: { rain: 3 } },
    diff: 'wild', muted: true };
  const out = {};
  for (const key of ['arkmist_v3', 'arkmist_v2', 'arkmist_v1']) {
    const env = makeEnv({ storage: mk(key, base) });
    out[key] = j(env)(`JSON.stringify({embers:save.embers,diff:save.diff,muted:save.muted,bless:save.bless,best:save.best,seen:save.seen})`);
  }
  return out;
}

// 改动前黄金值（首次采集后固化；任何源码改动前 R0 必须先绿）
const SAVE_G = { "embers": 41, "diff": "wild", "muted": true, "bless": { "blade": 2, "iron": 1, "stock": 0 }, "best": { "nights": 5, "kills": 33, "wins": 1 }, "seen": { "foe": { "crawler": 7 }, "build": { "tower": 2 }, "card": { "blade": 1 }, "play": { "rain": 3 } } };
const GOLDEN = {
  r0: {"nightTotal":{"1":[10,10],"2":[14,14],"3":[19,19],"4":[23,23],"5":[27,27],"6":[31,31],"7":[26,25]},"bossNight":{"1":false,"2":false,"3":false,"4":false,"5":false,"6":false,"7":true},"hp":{"1":{"crawler":26,"crawlerElite":41.6,"spitter":22,"spitterElite":35.2,"brute":95,"bruteElite":152,"boss":900,"bossElite":1440},"2":{"crawler":29.379999999999995,"crawlerElite":47.007999999999996,"spitter":24.86,"spitterElite":39.775999999999996,"brute":107.35,"bruteElite":171.76,"boss":1016.9999999999999,"bossElite":1627.1999999999998},"3":{"crawler":32.76,"crawlerElite":52.416,"spitter":27.72,"spitterElite":44.352000000000004,"brute":119.7,"bruteElite":191.52,"boss":1134,"bossElite":1814.4},"4":{"crawler":36.14,"crawlerElite":57.824000000000005,"spitter":30.580000000000002,"spitterElite":48.928000000000004,"brute":132.05,"bruteElite":211.28000000000003,"boss":1251,"bossElite":2001.6000000000001},"5":{"crawler":39.52,"crawlerElite":63.23200000000001,"spitter":33.44,"spitterElite":53.504000000000005,"brute":144.4,"bruteElite":231.04000000000005,"boss":1368,"bossElite":2188.8},"6":{"crawler":42.9,"crawlerElite":68.64,"spitter":36.3,"spitterElite":58.080000000000005,"brute":156.75,"bruteElite":250.8,"boss":1485,"bossElite":2376},"7":{"crawler":46.28,"crawlerElite":74.048,"spitter":39.160000000000004,"spitterElite":62.656000000000006,"brute":169.1,"bruteElite":270.56,"boss":1602,"bossElite":2563.2000000000003}},"weights":{"1":[200,0,0],"2":[140,60,0],"3":[103,55,42],"4":[98,71,31],"5":[97,67,36],"6":[81,69,50],"7":[79,65,56]}},
  saves: { arkmist_v3: SAVE_G, arkmist_v2: SAVE_G, arkmist_v1: SAVE_G }
};

const cases = [];
function testCase(name, fn) { cases.push([name, fn]); }
function reset(env, day = 1, mode = 'play') {
  env.run(`S.day=${day};S.mode='${mode}';S.phase='day';S.toSpawn=0;S.nightKilled=0;S.nightTotal=0;
    S.warns=[];warns.length=0;foes.length=0;shots.length=0;picks.length=0;
    S.endless=false;S.settled=null;S.launchT=0;S.overT=0;core.hp=core.max;`);
}

testCase('R0_baseline_seven_nights', () => {
  assert.ok(GOLDEN, '请先运行 CAPTURE=1 node tests/regression.js 固化黄金值');
  const env = makeEnv();
  assert.deepEqual(captureR0(env), GOLDEN.r0, '前 7 夜数值/流程发生变化');
  const saves = captureSaves();
  assert.deepEqual(saves, GOLDEN.saves, 'v3/v2/v1 存档加载结果发生变化');
});

testCase('R1_win_design_kept', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    S.day=7;S.mode='play';S.phase='night';S.stats.nights=7;
    S.toSpawn=0;warns.length=0;foes.length=0;
    dawn();
    return JSON.stringify({mode:S.mode,win:S.settled&&S.settled.win});
  })()`);
  assert.equal(out.mode, 'launch', '第七夜清场必须判胜（设计行为）');
  assert.equal(out.win, true);
});

testCase('R2_core_loss_early', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    S.day=3;S.mode='play';S.phase='night';S.stats.nights=3;
    S.toSpawn=0;warns.length=0;foes.length=0;core.hp=2;
    damageCore(40);
    const first={mode:S.mode,hp:core.hp,win:S.settled&&S.settled.win};
    damageCore(40);
    return JSON.stringify({first,hp2:core.hp,mode2:S.mode});
  })()`);
  assert.equal(out.first.mode, 'over', '第 1-6 夜核心归零必须判负');
  assert.equal(out.first.hp, 0, '耐久不得为负');
  assert.equal(out.first.win, false);
  assert.equal(out.hp2, 0, '判负后不再扣耐久');
  assert.equal(out.mode2, 'over');
  const dawnOut = j(env)(`(()=>{
    initRun();S.mode='play';S.day=3;core.hp=0;S.toSpawn=0;warns.length=0;foes.length=0;
    dawn();
    return JSON.stringify({mode:S.mode,day:S.day});
  })()`);
  assert.notEqual(dawnOut.mode, 'dawn', '零耐久不得进入黎明选择');
  assert.equal(dawnOut.day, 3, '零耐久不得被黎明 +40 复活');
});

testCase('R3_settle_once_idempotent', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    S.day=7;S.mode='play';S.phase='night';S.stats.nights=7;S.stats.kills=16;
    S.toSpawn=0;warns.length=0;foes.length=0;
    const before=save.embers,wins0=save.best.wins;
    dawn();
    const afterWin={embers:save.embers,wins:save.best.wins};
    settle(true);settle(false);
    return JSON.stringify({before,wins0,afterWin,afterDup:{embers:save.embers,wins:save.best.wins}});
  })()`);
  assert.equal(out.afterWin.embers - out.before, 35, '胜利奖励含 +12 且只结算一次');
  assert.equal(out.afterWin.wins, out.wins0 + 1);
  assert.equal(out.afterDup.embers, out.afterWin.embers, '重复 settle 不得二次入账');
  assert.equal(out.afterDup.wins, out.afterWin.wins, '重复 settle 不得二次加胜场');
  env.run('showEnd(true)');
  assert.ok(env.timers.intervals.size > 0, '结算页应启动滚动动画');
  env.run('toTitle()');
  assert.equal(env.timers.intervals.size, 0, '返回标题必须清理 emberTimer');
});

testCase('R4_swap_cap', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();
    DECK.max=9;DECK.hand=[];DECK.draw=[];DECK.discard=[];
    for(let i=0;i<11;i++)DECK.draw.push(mkCard('wall'));
    while(DECK.hand.length<10&&DECK.draw.length)DECK.hand.push(DECK.draw.pop());
    const uid=DECK.hand[0].uid;
    S.swapLeft=1;S.mode='swap';
    doSwap(uid);
    return JSON.stringify({hand:DECK.hand.length,draw:DECK.draw.length,left:S.swapLeft,mode:S.mode});
  })()`);
  assert.equal(out.hand, 10, '超额手牌换牌后应补满到换牌前数量');
  assert.equal(out.draw, 0, '补抽应从牌堆消耗一张');
  assert.equal(out.left, 0, '换牌次数只扣一次');
  assert.equal(out.mode, 'play');
});

testCase('R5_spitter_target', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();
    S.day=2;S.mode='play';S.phase='night';
    foes.length=0;shots.length=0;
    P.x=10;P.y=10;P.ifr=0;P.downed=false;P.hp=100;
    core.x=20;core.y=20;core.hp=600;
    const f={type:'spitter',x:21.5,y:20,hp:100,max:100,spd:1.8,dmg:8,r:.3,xp:7,coreDmg:8,
      atkCd:0,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      fireCd:99,spawnCd:99,stompCd:99,px:21.5,py:20,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1};
    foes.push(f);
    const hp0=P.hp,ch0=core.hp;
    updateFoes(0.016);
    return JSON.stringify({hp0,hp1:P.hp,ch0,ch1:core.hp});
  })()`);
  assert.equal(out.hp1, out.hp0, '目标为核心时不得误伤远处玩家');
  assert.ok(out.ch1 < out.ch0, '目标为核心时应伤害核心');
});

testCase('R6_pointer_id', () => {
  const env = makeEnv();
  env.run(`S.mode='play';initRun();`);
  const card = env.ids.get('handRow').children[0];
  assert.ok(card, '应存在手牌元素');
  card._listeners.pointerdown[0]({ pointerId: 1, clientX: 100, clientY: 100, preventDefault() {} });
  assert.equal(env.run('S.dragPointerId'), 1);
  env.winL.pointermove[0]({ pointerId: 2, clientX: 300, clientY: 300 });
  assert.equal(env.run('S.dragMoved'), false, '非发起指的移动不得推进拖拽');
  env.winL.pointermove[0]({ pointerId: 1, clientX: 200, clientY: 200 });
  assert.equal(env.run('S.dragMoved'), true, '发起指的移动应推进拖拽');
  const played0 = env.run('S.stats.played');
  env.winL.pointerup[0]({ pointerId: 2, clientX: 300, clientY: 300 });
  assert.equal(env.run('S.stats.played'), played0, '非发起指抬起不得提交出牌');
  assert.ok(env.run('S.dragUid!==null'), '非发起指抬起不得结束拖拽');
  env.winL.pointerup[0]({ pointerId: 1, clientX: 200, clientY: 200 });
  assert.equal(env.run('S.dragUid'), null, '发起指抬起应结束拖拽');
});

testCase('R7_endless_no_repeat_win', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();
    S.day=8;S.mode='play';S.phase='night';S.endless=true;S.settled=null;
    S.toSpawn=0;warns.length=0;foes.length=0;S.stats.nights=8;
    dawn();
    return JSON.stringify({mode:S.mode,day:S.day,settled:!!S.settled});
  })()`);
  assert.notEqual(out.mode, 'launch', 'day>=8 不得重复判胜');
  assert.equal(out.mode, 'dawn');
  assert.equal(out.day, 9, '继续后应从第 8 夜推进到第 9 日');
  assert.equal(out.settled, false);
});

testCase('R8_endless_resume_state', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();
    S.day=7;S.mode='play';S.phase='night';S.stats.nights=7;S.stats.kills=40;
    S.toSpawn=0;warns.length=0;foes.length=0;
    P.lvl=7;DECK.max=8;res.wood=77;core.hp=321;
    const before={lvl:P.lvl,max:DECK.max,wood:res.wood,hp:core.hp,deck:DECK.hand.length,builds:builds.length};
    dawn();
    const winState={win:S.settled.win,wins:save.best.wins};
    continueEndless();
    return JSON.stringify({before,winState,after:{day:S.day,phase:S.phase,mode:S.mode,endless:S.endless,
      lvl:P.lvl,max:DECK.max,wood:res.wood,hp:core.hp,deck:DECK.hand.length,builds:builds.length}});
  })()`);
  assert.equal(out.winState.win, true);
  assert.equal(out.after.day, 8);
  assert.equal(out.after.phase, 'day');
  assert.equal(out.after.mode, 'dawn', '继续后应进入第 8 日黎明选择');
  assert.equal(out.after.endless, true);
  for (const k of ['lvl', 'max', 'wood', 'deck', 'builds']) {
    assert.equal(out.after[k], out.before[k], `${k} 应在进入无尽时保留`);
  }
  assert.equal(out.after.hp, 361, '核心耐久保留并按黎明惯例 +40');
});

testCase('R9_endless_boss_period', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();S.endless=true;
    const out={};
    for(const d of [7,8,13,14,21]){
      S.day=d;S.mode='play';S.phase='day';S.toSpawn=0;warns.length=0;foes.length=0;
      startNight();
      out[d]={boss:warns.some(w=>w.boss),total:S.nightTotal};
      warns.length=0;
    }
    return JSON.stringify(out);
  })()`);
  assert.equal(out['7'].boss, true);
  assert.equal(out['8'].boss, false);
  assert.equal(out['13'].boss, false);
  assert.equal(out['14'].boss, true, '第 14 夜应复刷 Boss');
  assert.equal(out['21'].boss, true);
});

testCase('R10_endless_capped_curve', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    const out={scale:{},total:{},foeNow:{}};
    for(const d of [1,2,3,4,5,6,7,8,14,21,50,100]){
      out.scale[d]=dayScale(d);
      out.total[d]=Math.round((6+4.2*effDay(d))*DIFFS[save.diff].count);
      S.day=d;out.foeNow[d]=foeNow('crawler');
    }
    return JSON.stringify(out);
  })()`);
  for (let d = 1; d <= 7; d++) {
    assert.equal(out.scale[d], 1 + .13 * (d - 1), `第 ${d} 夜生命倍率必须恒等`);
    assert.equal(out.total[d], Math.round(6 + d * 4.2), `第 ${d} 夜波次必须恒等`);
  }
  assert.ok(out.scale[100] < 2.6, '无尽生命倍率须有上限');
  assert.ok(out.scale[100] > out.scale[14], '无尽段仍应继续增长');
  assert.ok(out.total[100] < 60, '无尽波次须有上限');
  assert.equal(out.foeNow[7], Math.round(26 * out.scale[7]), '图鉴血量须与实战公式同源');
});

testCase('R11_endless_increment', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();
    S.day=7;S.mode='play';S.phase='night';S.stats.nights=7;S.stats.kills=40;
    S.toSpawn=0;warns.length=0;foes.length=0;
    dawn();
    const winState={embers:save.embers,wins:save.best.wins,nights0:S.settled.nights0,kills0:S.settled.kills0};
    continueEndless();
    S.stats.nights=10;S.stats.kills=80;S.mode='play';core.hp=1;
    damageCore(10);
    return JSON.stringify({winState,after:{embers:save.embers,wins:save.best.wins,
      incremental:S.settled.incremental,bestNights:save.best.nights}});
  })()`);
  assert.equal(out.winState.embers, 38, '胜利奖励 7*3+5+12=38');
  assert.equal(out.winState.nights0, 7);
  assert.equal(out.winState.kills0, 40);
  assert.equal(out.after.embers - out.winState.embers, 14, '无尽增量应为 3*3+(10-5)=14');
  assert.equal(out.after.wins, out.winState.wins, '无尽失败不得重复加胜场');
  assert.equal(out.after.incremental, true);
  assert.equal(out.after.bestNights, 10);
});

testCase('R12_hardcoded_copy', () => {
  const env = makeEnv();
  const sub = env.run(`(()=>{
    initRun();S.endless=true;S.mode='end';S.settled={win:false,embers:0};showEnd(false);
    return document.getElementById('endSub').textContent;
  })()`);
  assert.ok(sub.includes('无尽'), '无尽失败副标题不得写死七夜');
  const label = env.run(`(()=>{
    S.endless=true;S.stats.nights=12;syncHUD();return document.getElementById('nightLabel').textContent;
  })()`);
  assert.ok(label.includes('∞'), '无尽 HUD 夜数须显示 ∞');
  assert.ok(!label.includes('/7'), '无尽 HUD 不得残留 /7');
});

testCase('R13_codex_return', () => {
  const env = makeEnv();
  env.run(`openCodex('end')`);
  assert.equal(env.run('codexReturn'), 'end');
  assert.equal(env.ids.get('endOv').classList.contains('show'), false);
  assert.equal(env.ids.get('codexOv').classList.contains('show'), true);
  env.run(`closeCodex()`);
  assert.equal(env.ids.get('endOv').classList.contains('show'), true, '关闭图鉴应还原结算页');
  assert.equal(env.ids.get('codexOv').classList.contains('show'), false);
});

testCase('R14_projectile_sweep', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();S.mode='play';S.phase='night';
    foes.length=0;shots.length=0;
    const mk=(x,y)=>({type:'crawler',x,y,hp:1000,max:1000,spd:0,dmg:6,r:.32,xp:5,coreDmg:6,
      atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      fireCd:99,spawnCd:99,stompCd:99,px:x,py:y,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1});
    const f=mk(10.5,10.5);foes.push(f);rebuildFoeGrid();
    shots.push({x:9.7,y:10.5,vx:24,vy:0,type:'arrow',dmg:9,life:1,z:22});
    const hp0=f.hp;
    updateShots(1/15); // 一步 1.6 格，终点已越过目标：只测终点的旧实现会漏判
    const sweepHit=f.hp<hp0;
    foes.length=0;shots.length=0;
    const g=mk(10.5,10.5);foes.push(g);rebuildFoeGrid();
    core.x=20;core.y=20;S.mode='play';
    updateFoes(0.5); // 跨格移动后网格必须同步
    const gridOk=foeGrid[cellIdx(g.x,g.y)].includes(g);
    return JSON.stringify({hp0,hp1:f.hp,sweepHit,gridOk});
  })()`);
  assert.equal(out.sweepHit, true, '大步长下箭矢不得穿过敌人');
  assert.equal(out.gridOk, true, '敌人移动后网格索引必须同步');
});

testCase('R15_preview_transform', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    cam.x=20;cam.y=20;cam.z=1;cam.sx=10;cam.sy=-5;
    mouseX=W/2+10;mouseY=H/2-5;
    updateMouseWorld();
    return JSON.stringify([mouseWorld[0],mouseWorld[1]]);
  })()`);
  assert.ok(Math.abs(out[0] - 20) < 1e-9, '反投影必须抵消震屏偏移');
  assert.ok(Math.abs(out[1] - 20) < 1e-9);
  const src = fs.readFileSync(path.join(ROOT, 'js', '09-render.js'), 'utf8');
  assert.ok(!/\*\.72/.test(src), '预览半径不得再用手写缩放系数');
});

testCase('R16_keyboard_scope', () => {
  const env = makeEnv();
  env.run(`initRun();S.mode='play';`);
  let prevented = false;
  env.winL.keydown[0]({ key: 'Tab', preventDefault() { prevented = true; }, repeat: false, target: {} });
  assert.equal(prevented, false, '对局内 Tab 应可用于焦点切换');
  env.run(`DECK.hand=[];for(let i=0;i<10;i++)DECK.hand.push(mkCard('wall'));S.mode='play';`);
  env.winL.keydown[0]({ key: '0', preventDefault() {}, repeat: false, target: {} });
  assert.equal(env.run('S.aimUid'), env.run('DECK.hand[9].uid'), '第 10 张牌应可用 0 选中');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  assert.ok(/\.overlay\{[^}]*visibility:hidden/.test(css), '隐藏弹窗应退出焦点顺序');
});

testCase('R17_save_validation', () => {
  const bad = { diff: 'bogus', embers: -5, bless: { blade: 99 }, best: { nights: -1 }, seen: null, muted: 'x' };
  const env = makeEnv({ storage: [['arkmist_v3', JSON.stringify(bad)]] });
  const out = j(env)(`JSON.stringify({diff:save.diff,embers:save.embers,bless:save.bless,best:save.best,seen:save.seen,muted:save.muted})`);
  assert.equal(out.diff, 'std', '未知难度必须回退');
  assert.equal(out.embers, 0);
  assert.equal(out.bless.blade, 0);
  assert.equal(out.best.nights, 0);
  assert.equal(out.muted, false);
  env.run(`S.day=1;S.toSpawn=0;warns.length=0;startNight();`);
  assert.ok(env.run('S.nightTotal') > 0, '损坏存档不得阻断入夜');
  const env2 = makeEnv();
  env2.run(`localStorage.setItem=()=>{throw new Error('quota')};`);
  assert.equal(env2.run(`persist()`), false, '写入失败必须向上可见');
});

testCase('R18_card_consistency', () => {
  const env = makeEnv();
  const expand = j(env)(`(()=>{
    initRun();
    DECK.max=9;DECK.hand=[];DECK.draw=[];DECK.discard=[];
    DECK.draw.push(mkCard('wall'),mkCard('wall'),mkCard('expand'));
    DECK.hand.push(mkCard('expand'));
    const uid=DECK.hand[0].uid;
    playCard(uid,0,0);
    return JSON.stringify({max:DECK.max,expandTotal:cardTotal('expand'),hand:DECK.hand.length,
      wall:DECK.hand.filter(c=>c.id==='wall').length});
  })()`);
  assert.equal(expand.max, 10);
  assert.equal(expand.expandTotal, 0, '到顶后扩容牌须全部退场');
  assert.equal(expand.wall, 1, '清理扩容后仍应兑现补抽');

  const salvage = j(env)(`(()=>{
    initRun();S.mode='play';S.stats.played=0;
    const sc=mkCard('wall');DECK.hand.push(sc);DECK.draw.push(mkCard('wall'));
    S.aimUid=sc.uid;S.pendingSalvage=sc;S.mode='remove';
    confirmSalvage('wall',10);
    return JSON.stringify({played:S.stats.played,aim:S.aimUid,seen:save.seen.play.wall||0});
  })()`);
  assert.equal(salvage.played, 1, '拆解成功后应记出牌数');
  assert.equal(salvage.seen, 1);
  assert.equal(salvage.aim, null, '拆解成功后不得残留选牌');

  const wave = j(env)(`(()=>{
    initRun();S.mode='play';S.phase='night';foes.length=0;shots.length=0;
    const f={type:'crawler',x:10.5,y:10.5,hp:1000,max:1000,spd:0,dmg:6,r:.32,xp:5,coreDmg:6,
      atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      fireCd:99,spawnCd:99,stompCd:99,px:10.5,py:10.5,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1};
    foes.push(f);rebuildFoeGrid();
    shots.push({x:10.5,y:10.5,vx:0,vy:0,type:'wave',dmg:10,life:1,pierce:2,z:12});
    const hp0=f.hp;
    updateShots(0.1);updateShots(0.1);
    return JSON.stringify({hp0,hp1:f.hp,pierce:shots[0]&&shots[0].pierce});
  })()`);
  assert.equal(wave.hp0 - wave.hp1, 10, '同一敌人只应受一次剑气伤害');
  assert.equal(wave.pierce, 1, '同一敌人只应消耗一次穿透');
});

testCase('R19_gather_sum', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();
    Math.random=()=>0.999;P.gather=1.5;picks.length=0; // 苦修一层：基础 6 → 9
    const n=nodes.find(x=>x.type==='tree');
    n.alive=true;n.hp=1;
    hitNode(n);
    return JSON.stringify({count:picks.length,sum:picks.reduce((a,p)=>a+p.amt,0)});
  })()`);
  assert.equal(out.count, 8);
  assert.equal(out.sum, 9, '掉落总量必须等于应发资源量');
});

testCase('R20_menu_background_stable', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    S.mode='menu';const initialSeed=seed;
    openPrep();const prepSeed=seed;
    toTitle();const titleSeed=seed;
    openPrep();const reopenedSeed=seed;
    startRun();const runSeed=seed;
    return JSON.stringify({initialSeed,prepSeed,titleSeed,reopenedSeed,runSeed,mode:S.mode});
  })()`);
  assert.equal(out.prepSeed, out.initialSeed, '开始进入准备页不应重生成背景地图');
  assert.equal(out.titleSeed, out.initialSeed, '准备页返回标题不应重生成背景地图');
  assert.equal(out.reopenedSeed, out.initialSeed, '再次打开准备页应保留同一背景');
  assert.equal(out.mode, 'play');
  assert.notEqual(out.runSeed, out.initialSeed, '正式启航时才生成新对局地图');
});

testCase('R21_cheat_nova', () => {
  const env = makeEnv();
  env.run(`initRun();S.mode='pause';`);
  const press = k => env.winL.keydown[0]({ key: k, preventDefault() {}, repeat: false, target: {} });
  for (const k of 'l3131') press(k);
  assert.equal(env.run('CHEAT.on'), true, '暂停时输入 l3131 应开启雾爆强化');
  assert.equal(env.run('CHEAT.buf'), '', '输入后应清空缓冲');
  const out = j(env)(`(()=>{
    S.mode='play';S.phase='night';P.en=120;P.novaMult=1;P.stacks={};P.crit=0;
    foes.length=0;shots.length=0;
    const f={type:'crawler',x:P.x+1,y:P.y,hp:100000,max:100000,spd:0,dmg:6,r:.32,xp:5,coreDmg:6,
      atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      fireCd:99,spawnCd:99,stompCd:99,px:P.x+1,py:P.y,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1};
    foes.push(f);rebuildFoeGrid();
    const hp0=f.hp;
    castNova();
    return JSON.stringify({hp0,hp1:f.hp,dmg:hp0-f.hp});
  })()`);
  assert.equal(out.dmg, 300, '伤害应为基础 30 的 10 倍');
  const radius = j(env)(`(()=>{
    const on=CHEAT.on;const R=3.1*(1+.12*(P.stacks.nova||0))*(on?CHEAT.rad:1);
    return JSON.stringify({R,rad:CHEAT.rad});
  })()`);
  assert.equal(radius.R, 31, '范围应为 3.1 格的 10 倍');
  // 再次输入应关闭
  env.run(`S.mode='pause';`);
  for (const k of 'l3131') press(k);
  assert.equal(env.run('CHEAT.on'), false, '再次输入 l3131 应关闭强化');
});

function main() {
  if (process.env.CAPTURE) {
    const env = makeEnv();
    console.log(JSON.stringify({ r0: captureR0(env), saves: captureSaves() }, null, 2));
    return;
  }
  let pass = 0, fail = 0;
  for (const [name, fn] of cases) {
    try { fn(); console.log(`  PASS  ${name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${name}: ${e.message}`); fail++; }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main();
