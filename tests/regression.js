'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ORDER = ['00-core', '01-audio', '02-world', '03-data', '04-state', '05-input',
  '06-hand', '07-combat', '07b-spells', '08-progress', '09-render', '10-ui', '11-main'];
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
    focus: noop, blur: noop, setAttribute: noop, setPointerCapture: noop, releasePointerCapture: noop,
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
  const store = new Map(opts.storage || []);
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
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); }
  };
  let seed = 987654321;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const FXStub = { on: false, calls: [], clear: noop, frame: noop, cast: noop, spell: noop,
    detonate: noop, reaction: noop, storm: noop, becomeMage: noop, sword: noop, swordHit: noop,
    waveShot: noop, slash: noop, activeCount: () => 0 };
  const sandbox = {
    console, document, localStorage, FX: FXStub,
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    performance: { now: () => 0 },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    getComputedStyle: () => ({ maxHeight: '750px' }),
    addEventListener(t, cb) { (winL[t] || (winL[t] = [])).push(cb); },
    removeEventListener: noop,
    setTimeout(fn) { const id = timers.next++; timers.timeouts.add(id); return id; },
    clearTimeout(id) { timers.cleared.add(id); timers.timeouts.delete(id); },
    setInterval(fn) { const id = timers.next++; timers.intervals.add(id); return id; },
    clearInterval(id) { timers.cleared.add(id); timers.intervals.delete(id); },
    requestAnimationFrame(cb) { rafCb = cb; return 1; }
  };
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = rng;
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SRC, ctx, { filename: 'bundle.js' });
  return { ctx, ids, docL, winL, store, timers, cv, run: code => vm.runInContext(code, ctx) };
}

const j = env => code => JSON.parse(env.run(code));
function seedFoe(env, dx = 1, dy = 0, hp = 10000) {
  env.run(`foes.length=0;foes.push({type:'crawler',x:P.x+${dx},y:P.y+${dy},hp:${hp},max:${hp},spd:0,dmg:6,r:.32,xp:5,coreDmg:6,
    atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
    fireCd:99,spawnCd:99,stompCd:99,px:P.x+${dx},py:P.y+${dy},stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1});rebuildFoeGrid();`);
}

function captureBaseline(env) {
  return j(env)(`(()=>{
    const out={nightTotal:{},bossNight:{},hp:{},weights:{}};
    for(let d=1;d<=7;d++){
      S.day=d;S.phase='night';S.toSpawn=0;S.nightKilled=0;warns.length=0;foes.length=0;
      startNight();out.nightTotal[d]=[S.nightTotal,S.toSpawn];out.bossNight[d]=warns.some(w=>w.boss);warns.length=0;
    }
    for(let d=1;d<=7;d++){
      S.day=d;out.hp[d]={};
      for(const t of ['crawler','spitter','brute','boss']){
        foes.length=0;spawnFoe(t,20,20,false);out.hp[d][t]=foes[0].max;
        foes.length=0;spawnFoe(t,20,20,true);out.hp[d][t+'Elite']=foes[0].max;foes.length=0;
      }
      let c=0,s=0,b=0;
      for(let k=0;k<200;k++){const t=pickFoeType();if(t==='crawler')c++;else if(t==='spitter')s++;else b++;}
      out.weights[d]=[c,s,b];
    }
    return JSON.stringify(out);
  })()`);
}

function captureSaves() {
  const base = { embers: 41, bless: { blade: 2, iron: 1, stock: 0 }, best: { nights: 5, kills: 33, wins: 1 },
    seen: { foe: { crawler: 7 }, build: { tower: 2 }, card: { blade: 1 }, play: { rain: 3 } },
    diff: 'wild', muted: true };
  const env = makeEnv({ storage: [['arkmist_v3', JSON.stringify(base)]] });
  return j(env)(`JSON.stringify({embers:save.embers,diff:save.diff,muted:save.muted,bless:save.bless,best:save.best,seen:save.seen})`);
}

const SAVE_G = { "embers": 41, "diff": "wild", "muted": true, "bless": { "blade": 2, "iron": 1, "stock": 0 }, "best": { "nights": 5, "kills": 33, "wins": 1 }, "seen": { "foe": { "crawler": 7 }, "build": { "tower": 2 }, "card": { "blade": 1 }, "play": { "rain": 3 }, "sigil": {} } };
const GOLDEN = {
  r0: {"nightTotal":{"1":[10,10],"2":[14,14],"3":[19,19],"4":[23,23],"5":[27,27],"6":[31,31],"7":[26,25]},"bossNight":{"1":false,"2":false,"3":false,"4":false,"5":false,"6":false,"7":true},"hp":{"1":{"crawler":26,"crawlerElite":41.6,"spitter":22,"spitterElite":35.2,"brute":95,"bruteElite":152,"boss":900,"bossElite":1440},"2":{"crawler":29.379999999999995,"crawlerElite":47.007999999999996,"spitter":24.86,"spitterElite":39.775999999999996,"brute":107.35,"bruteElite":171.76,"boss":1016.9999999999999,"bossElite":1627.1999999999998},"3":{"crawler":32.76,"crawlerElite":52.416,"spitter":27.72,"spitterElite":44.352,"brute":119.7,"bruteElite":191.52,"boss":1134,"bossElite":1814.4},"4":{"crawler":36.14,"crawlerElite":57.824,"spitter":30.580000000000002,"spitterElite":48.928,"brute":132.05,"bruteElite":211.28,"boss":1251,"bossElite":2001.6},"5":{"crawler":39.52,"crawlerElite":63.232,"spitter":33.44,"spitterElite":53.504,"brute":144.4,"bruteElite":231.04,"boss":1368,"bossElite":2188.8},"6":{"crawler":42.9,"crawlerElite":68.64,"spitter":36.3,"spitterElite":58.08,"brute":156.75,"bruteElite":250.8,"boss":1485,"bossElite":2376},"7":{"crawler":46.28,"crawlerElite":74.048,"spitter":39.160000000000004,"spitterElite":62.656,"brute":169.1,"bruteElite":270.56,"boss":1602,"bossElite":2563.2}},"weights":{"1":[200,0,0],"2":[140,60,0],"3":[103,55,42],"4":[98,71,31],"5":[97,67,36],"6":[81,69,50],"7":[79,65,56]}},
  saves: SAVE_G
};

const cases = [];
function testCase(name, fn) { cases.push([name, fn]); }

testCase('R0_seven_nights_and_save_baseline', () => {
  const normalize = value => JSON.parse(JSON.stringify(value, (_, n) => typeof n === 'number' ? Math.round(n * 1e9) / 1e9 : n));
  assert.deepEqual(normalize(captureBaseline(makeEnv())), normalize(GOLDEN.r0));
  assert.deepEqual(captureSaves(), GOLDEN.saves);
});

testCase('R1_settlement_and_endless', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();S.day=7;S.mode='play';S.phase='night';S.stats.nights=7;S.stats.kills=40;
    S.toSpawn=0;warns.length=0;foes.length=0;dawn();
    const win={mode:S.mode,embers:save.embers,wins:save.best.wins};settle(true);settle(false);
    const duplicate={embers:save.embers,wins:save.best.wins};continueEndless();
    const resumed={day:S.day,mode:S.mode,endless:S.endless};
    S.stats.nights=10;S.stats.kills=80;S.mode='play';core.hp=1;damageCore(10);
    const endless={embers:save.embers,wins:save.best.wins,incremental:S.settled.incremental};
    initRun();S.day=3;S.mode='play';core.hp=2;damageCore(40);
    return JSON.stringify({win,duplicate,resumed,endless,loss:{mode:S.mode,win:S.settled.win,hp:core.hp}});
  })()`);
  assert.equal(out.win.mode, 'launch');
  assert.equal(out.win.embers, 38);
  assert.deepEqual(out.duplicate, { embers: out.win.embers, wins: out.win.wins });
  assert.deepEqual(out.resumed, { day: 8, mode: 'dawn', endless: true });
  assert.equal(out.endless.embers - out.win.embers, 14);
  assert.equal(out.endless.wins, out.win.wins);
  assert.equal(out.endless.incremental, true);
  assert.deepEqual(out.loss, { mode: 'over', win: false, hp: 0 });
});

testCase('R2_save_validation', () => {
  const bad = { diff: 'bogus', embers: -5, bless: { blade: 99 }, best: { nights: -1 }, seen: null, muted: 'x' };
  const env = makeEnv({ storage: [['arkmist_v3', JSON.stringify(bad)]] });
  assert.equal(env.run('save.diff'), 'std');
  assert.equal(env.run('save.embers'), 0);
  for (const raw of ['{bad', '{}', JSON.stringify({ embers: -1 })]) {
    const invalid = makeEnv({ storage: [['arkmist_v3', raw]] });
    assert.equal(invalid.run('save.embers'), 0);
  }
  const proto = makeEnv({ storage: [['arkmist_v3', JSON.stringify({ diff: 'constructor' })]] });
  proto.run('S.day=1;S.toSpawn=0;warns.length=0;startNight()');
  assert.ok(Number.isFinite(proto.run('S.nightTotal')));
  const blocked = makeEnv();
  blocked.run(`localStorage.getItem=()=>{throw new Error('blocked')};loadSave()`);
  assert.equal(blocked.run('save.embers'), 0);
  const quota = makeEnv();
  quota.run(`localStorage.setItem=()=>{throw new Error('quota')}`);
  const warn = console.warn;console.warn = noop;
  try { assert.equal(quota.run('persist()'), false); } finally { console.warn = warn; }
});

testCase('R3_deck_and_card_text', () => {
  const env = makeEnv();
  const swap = j(env)(`(()=>{
    initRun();DECK.max=9;DECK.hand=[];DECK.draw=[];DECK.discard=[];
    for(let i=0;i<11;i++)DECK.draw.push(mkCard('wall'));
    while(DECK.hand.length<10&&DECK.draw.length)DECK.hand.push(DECK.draw.pop());
    doSwap(DECK.hand[0].uid);
    return JSON.stringify({hand:DECK.hand.length,draw:DECK.draw.length,left:S.swapLeft,mode:S.mode});
  })()`);
  assert.deepEqual(swap, { hand: 10, draw: 0, left: 0, mode: 'play' });
  env.run('initRun()');
  const costs = env.run(`Object.fromEntries(CARD_IDS.map(id=>[id,costStr(CDEFS[id])]))`);
  for (const [id, text] of Object.entries(costs)) assert.ok(!/undefined|\[object Object\]|NaN/.test(text), id);
  assert.equal(costs.wall, '8木');
  assert.equal(costs.tower, '12木 6石');
  assert.equal(costs.sp_emberburst, '30雾');
  const handTower = env.run(`cardInner(CDEFS.tower,1)`);
  assert.ok(handTower.includes('title="12木材"') && handTower.includes('title="6石料"'));
  assert.ok(!handTower.includes('>12木<') && !handTower.includes('hcKind'));
  assert.ok(handTower.includes('自动射击附近雾裔。'));
  const handSpell = env.run(`P.cls='mage';cardInner(CDEFS.sp_emberburst,'')`);
  assert.ok(handSpell.includes('title="30法力"'));
  // 图鉴费用称呼随职业切换：非法师应显示「雾能」，而非写死的「法力」
  const codexMana = j(env)(`(()=>{
    const c=CODEX.find(x=>x.id==='c_sp_emberburst');
    const manaKey=s=>s.find(x=>x[0]==='法力'||x[0]==='雾能');
    P.cls=null;const non=manaKey(c.stats())[0];
    P.cls='mage';const mage=manaKey(c.stats())[0];
    P.cls=null;return JSON.stringify({non,mage});
  })()`);
  assert.deepEqual(codexMana, { non: '雾能', mage: '法力' });
  // 数值单一来源：改字段后 desc/brief 文案同步
  const derived = j(env)(`(()=>{
    CDEFS.spring.heal=61;CDEFS.ward.ifr=7;BUILDS.totem.heal=9;syncCardText();
    const out={spring:CDEFS.spring.desc,ward:CDEFS.ward.brief,totem:CDEFS.totem.desc,totemBrief:CARD_BRIEF.totem};
    CDEFS.spring.heal=45;CDEFS.ward.ifr=4;BUILDS.totem.heal=4;syncCardText();
    return JSON.stringify(out);
  })()`);
  assert.ok(derived.spring.includes('61'));
  assert.ok(derived.ward.includes('7 秒'));
  assert.ok(derived.totem.includes('9 点'));
  assert.ok(derived.totemBrief.includes('9 点'));
  env.run(`DECK.hand=[mkCard('wall'),mkCard('tower')];DECK.draw=[];DECK.discard=[];renderSwap()`);
  assert.ok(!/undefined|\[object Object\]|NaN/.test(env.ids.get('swapList').children.map(e => e.innerHTML).join('')));
  env.run(`const sc=mkCard('salvage5');DECK.hand=[sc,mkCard('wall')];DECK.draw=[];DECK.discard=[];beginSalvage(sc)`);
  assert.ok(!/undefined|\[object Object\]|NaN/.test(env.ids.get('rmList').children.map(e => e.innerHTML).join('')));
  const expand = j(env)(`(()=>{
    initRun();P.cls='mage';DECK.max=11;DECK.hand=[mkCard('expand'),mkCard('wall'),mkCard('wall')];DECK.draw=[mkCard('wall')];DECK.discard=[];
    res.wood=99;res.stone=99;playCard(DECK.hand[0].uid,0,0);
    return JSON.stringify({max:DECK.max,total:cardTotal('expand'),hand:DECK.hand.length});
  })()`);
  assert.deepEqual(expand, { max: 12, total: 0, hand: 3 });
});

testCase('R4_mage_transform_and_pool', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();const ids=poolIds();
    const nonMage={maxEn:P.maxEn,regen:P.enRegenFlat,cap:handCap(),basics:['sp_emberburst'].every(id=>ids.includes(id)),
      oldBasics:['sp_fireball','sp_frostbolt','sp_arcbolt'].some(id=>ids.includes(id)),
      mageOnly:ids.some(id=>CDEFS[id].cls==='mage'&&!CDEFS[id].basic),core:ids.some(id=>CDEFS[id].core),cls:ids.includes('class_mage')};
    S.day=2;S.dawnCards=['wall','rain','spring'];injectClassCard(S.dawnCards);const day2=S.dawnCards.slice();
    S.day=5;const before=S.dawnCards.slice();injectClassCard(S.dawnCards);const day5=S.dawnCards.slice();
    S.day=2;S.mode='dawn';S.dawnStep=0;S.dawnCards=['wall','class_mage','rain'];P.hp=P.maxHp;const old=P.maxHp;pickDawn(1);
    return JSON.stringify({nonMage,day2,day5,before,old,cls:P.cls,maxHp:P.maxHp,maxEn:P.maxEn,regen:P.enRegenFlat,
      deckMax:DECK.max,cap:handCap(),classCards:cardTotal('class_mage'),well:cardTotal('manawell'),burst:cardTotal('sp_emberburst'),
      oldBasicsInDeck:['sp_fireball','sp_frostbolt','sp_arcbolt'].some(id=>cardTotal(id)>0),
      aff:[P.aff.fire,P.aff.frost,P.aff.arcane],seen:save.seen.play.class_mage,played:S.stats.played,
      mageBless:BLESSINGS.filter(b=>b.cls==='mage').length});
  })()`);
  assert.deepEqual(out.nonMage, { maxEn: 100, regen: 14, cap: 10, basics: true, oldBasics: false, mageOnly: false, core: false, cls: false });
  assert.equal(out.day2[1], 'class_mage');
  assert.deepEqual(out.day5, out.before);
  assert.equal(out.cls, 'mage');
  assert.equal(out.maxHp, Math.round(out.old * .6));
  assert.deepEqual([out.maxEn, out.regen, out.deckMax, out.cap], [200, 19, 7, 12]);
  assert.equal(out.classCards, 0);
  assert.equal(out.well, 1);
  assert.equal(out.burst, 1);
  assert.equal(out.oldBasicsInDeck, false);
  assert.deepEqual(out.aff, [2, 1, 1]);
  assert.equal(out.seen, 1);
  assert.equal(out.played, 1);
  assert.equal(out.mageBless, 25);
});

testCase('R5_full_cast_chain', () => {
  const env = makeEnv();
  env.run(`initRun();P.cls='mage';P.maxEn=200;P.en=200;P.crit=0;P.stacks={t_manadmg:1};S.mode='play';S.phase='day'`);
  seedFoe(env);
  env.run(`DECK.hand=[mkCard('sp_flameimpact')];DECK.draw=[];DECK.discard=[]`);
  const hit = j(env)(`(()=>{const ok=playCard(DECK.hand[0].uid,P.x+1,P.y);return JSON.stringify({ok,en:P.en,dmg:10000-foes[0].hp,
    discard:DECK.discard.length,played:S.stats.played,cd:P.spellCd})})()`);
  assert.equal(hit.ok, true);
  assert.equal(hit.en, 155);
  assert.ok(Math.abs(hit.dmg - 63.25) < .01);
  assert.deepEqual([hit.discard, hit.played], [1, 1]);
  assert.ok(hit.cd > 0);
  const empty = j(env)(`(()=>{
    P.en=200;P.spellCd=0;foes.length=0;DECK.hand=[mkCard('sp_blizzard')];DECK.discard=[];DECK.draw=[];
    playCard(DECK.hand[0].uid,P.x,P.y);
    return JSON.stringify({en:P.en,discard:DECK.discard.length,played:S.stats.played,cd:P.spellCd});
  })()`);
  assert.equal(empty.en, 155);
  assert.deepEqual([empty.discard, empty.played], [1, 2]);
  assert.ok(empty.cd > 0);
});

testCase('R6_talent_rules', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();P.cls='mage';P.maxEn=200;P.en=200;P.stacks={};
    const fireCard=CDEFS.sp_kindling,arcaneCard=CDEFS.sp_arcaneneedle;
    P.resoElem=null;P.resoN=0;spellCastSideEffects('fire',fireCard);spellCastSideEffects('fire',fireCard);
    const noTalent={n:P.resoN,elem:P.resoElem,mult:spellMult('fire',null,false)};
    P.stacks={t_resonance:1};P.resoElem=null;P.resoN=0;spellCastSideEffects('fire',fireCard);spellCastSideEffects('fire',fireCard);
    const resonance={n:P.resoN,mult:spellMult('fire',null,false)};
    P.stacks={t_hastecharge:1};P.charge=6;spellCastSideEffects('fire',CDEFS.sp_flameimpact);const haste=P.charge;
    P.stacks={t_arccharge:1};P.arcCharge=0;P.arcDiscount=false;
    spellCastSideEffects('arcane',arcaneCard);spellCastSideEffects('arcane',arcaneCard);spellCastSideEffects('arcane',arcaneCard);
    const arccharge={charge:P.arcCharge,discount:P.arcDiscount};
    P.stacks={t_arcsave:1};const arcane=effManaCost(arcaneCard);P.arcDiscount=true;const discounted=effManaCost(arcaneCard);
    P.arcDiscount=false;P.stacks={t_econ:2};const fire=effManaCost(fireCard);
    return JSON.stringify({noTalent,resonance,haste,arccharge,arcane,discounted,fire});
  })()`);
  assert.deepEqual(out.noTalent, { n: 0, elem: null, mult: 1 });
  assert.deepEqual(out.resonance, { n: 1, mult: 1.05 });
  assert.equal(out.haste, 6);
  assert.deepEqual(out.arccharge, { charge: 0, discount: true });
  assert.deepEqual([out.arcane, out.discounted, out.fire], [1, 1, 12]);
});

testCase('R7_status_and_reactions', () => {
  const env = makeEnv();
  env.run(`initRun();P.cls='mage';P.maxEn=200;P.en=200;P.crit=0;P.stacks={t_fusion:1}`);
  seedFoe(env);
  const status = j(env)(`(()=>{
    const f=foes[0];f.burnStacks=3;f.burnT=4;f.burnTick=.5;updateFoeStatus(f,1);
    const burn={dmg:10000-f.hp,kx:f.kx,ky:f.ky};f.hp=10000;f.lastElem=null;f.reactCd=0;
    applyElement(f,'fire',2);applyElement(f,'frost',1);
    return JSON.stringify({burn,steam:10000-f.hp,cd:f.reactCd,kx:f.kx,ky:f.ky});
  })()`);
  assert.ok(Math.abs(status.burn.dmg - 9) < .01);
  assert.deepEqual([status.burn.kx, status.burn.ky], [0, 0]);
  assert.ok(Math.abs(status.steam - 39) < .01);
  assert.equal(status.cd, 1.5);
  assert.ok(Math.abs(status.kx - 4) < 1e-9);
  assert.equal(status.ky, 0);
  const detonate = j(env)(`(()=>{
    const f=foes[0];f.hp=f.max=26;f.dead=false;f.burnStacks=5;f.burnT=4;f.lastElem='frost';f.lastElemT=S.combatT;f.reactCd=0;
    const near={...f,x:P.x+2,hp:10000,max:10000,dead:false,burnStacks:0,lastElem:null};foes.push(near);rebuildFoeGrid();
    castSpell(CDEFS.sp_flamedetonate,f.x,f.y);
    return JSON.stringify({dead:f.dead,react:f.reactCd,splash:10000-near.hp,burn:f.burnStacks});
  })()`);
  assert.deepEqual(detonate, { dead: true, react: 1.5, splash: 19.5, burn: 0 });
  seedFoe(env);
  const targets = j(env)(`(()=>{
    const one=spellTargets(CDEFS.sp_magicmissile,P.x,P.y).length;foes[0].x=P.x+20;rebuildFoeGrid();
    return JSON.stringify({one,far:spellTargets(CDEFS.sp_magicmissile,P.x,P.y).length});
  })()`);
  assert.deepEqual(targets, { one: 1, far: 0 });
});

testCase('R8_shields_surge_and_audio', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();P.cls='mage';P.maxEn=200;P.en=100;P.shield=0;P.dashCd=1;P.stacks={t_regenshield:1};S.mode='play';
    DECK.hand=[mkCard('surge')];DECK.draw=[];DECK.discard=[];playCard(DECK.hand[0].uid,P.x,P.y);
    const surge={en:P.en,shield:P.shield,dash:P.dashCd};
    P.hp=P.maxHp=100;P.hp=100;P.ifr=0;damagePlayer(20);const absorb={hp:P.hp,shield:P.shield};
    P.shield=0;P.stacks={t_manashield:1};P.en=39;P.hp=10;P.ifr=0;damagePlayer(100);const low=P.downed;
    P.downed=false;P.en=200;P.hp=10;P.ifr=0;damagePlayer(100);const guard={hp:P.hp,en:P.en,downed:P.downed};
    return JSON.stringify({surge,absorb,low,guard});
  })()`);
  assert.deepEqual(out.surge, { en: 200, shield: 30, dash: 0 });
  assert.deepEqual(out.absorb, { hp: 100, shield: 10 });
  assert.equal(out.low, true);
  assert.deepEqual(out.guard, { hp: 10, en: 0, downed: false });
  assert.ok(fs.readFileSync(path.join(ROOT, 'js', '01-audio.js'), 'utf8').includes("case 'ward':"));
});

testCase('R9_codex_progress', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();const bad=[];
    for(const e of CODEX)try{const s=e.stats?e.stats():[];if(!Array.isArray(s))bad.push(e.id);}catch(err){bad.push(e.id)}
    for(const id of Object.keys(FOES))save.seen.foe[id]=1;
    for(const b of BLESSINGS)save.seen.card[b.id]=1;
    for(const id of CARD_IDS)save.seen.play[id]=1;
    for(const id of SIGIL_IDS)save.seen.sigil[id]=1;
    save.seen.play.unknown=1;const full=cxSeenCount();cxRenderList();const label=document.getElementById('cxCount').textContent;
    save.seen.play={};S.day=2;S.mode='dawn';S.dawnStep=0;S.dawnCards=['wall','class_mage','rain'];pickDawn(1);
    return JSON.stringify({bad,full,label,classSeen:save.seen.play.class_mage,played:S.stats.played,track:Object.keys(FOES).length+BLESSINGS.length+CARD_IDS.length+SIGIL_IDS.length});
  })()`);
  assert.deepEqual(out.bad, []);
  assert.equal(out.full, out.track);
  assert.ok(out.label.includes(`${out.track}/${out.track}`));
  assert.equal(out.classSeen, 1);
  assert.equal(out.played, 1);
});

testCase('R10_hand_keys_and_hud', () => {
  const env = makeEnv();
  env.run(`initRun();S.mode='play';DECK.hand=[];for(let i=0;i<12;i++)DECK.hand.push(mkCard('wall'));renderHand()`);
  const press = key => env.winL.keydown[0]({ key, preventDefault() {}, repeat: false, target: {} });
  press('-');
  assert.equal(env.run('S.aimUid'), env.run('DECK.hand[10].uid'));
  press('=');
  assert.equal(env.run('S.aimUid'), env.run('DECK.hand[11].uid'));
  const out = j(env)(`(()=>{
    S.mode='play';P.cls=null;P.en=100;syncHUD();const non={label:UI.enLabel.textContent,text:UI.enTxt.textContent};
    P.cls='mage';P.maxEn=200;P.en=200;P.maxHp=60;P.hp=60;P.shield=20;syncHUD();
    return JSON.stringify({non,label:UI.enLabel.textContent,text:UI.enTxt.textContent,name:UI.ppName.textContent,
      shield:UI.shieldBar.style.display,shieldTxt:UI.shieldTxt.textContent,keys:HAND_KEYS});
  })()`);
  assert.deepEqual(out.non, { label: '雾能', text: '100' });
  assert.deepEqual([out.label, out.text], ['法力', '200/200']);
  assert.ok(out.name.includes('法师'));
  assert.notEqual(out.shield, 'none');
  assert.equal(String(out.shieldTxt), '20');
  assert.equal(out.keys, '1234567890-=');
});

testCase('R11_non_mage_burst_and_manawell', () => {
  const env = makeEnv();
  env.run(`initRun();S.mode='play';S.phase='day';P.en=100;P.crit=0;P.stacks={};`);
  seedFoe(env);
  const spell = j(env)(`(()=>{
    DECK.hand=[mkCard('sp_emberburst')];DECK.draw=[];DECK.discard=[];
    playCard(DECK.hand[0].uid,P.x+1,P.y);
    return JSON.stringify({en:P.en,dmg:10000-foes[0].hp,burn:foes[0].burnStacks,react:foes[0].reactCd||0});
  })()`);
  assert.deepEqual(spell, { en: 70, dmg: 30, burn: 2, react: 0 });
  const well = j(env)(`(()=>{
    initRun();P.cls='mage';P.maxEn=200;P.en=0;P.regen=1;P.stacks={};builds.length=0;res.wood=99;res.stone=99;res.crys=99;
    for(let i=0;i<3;i++)builds.push({type:'manawell',x:P.x+i*.6,y:P.y,hp:80,max:80,r:.4,cd:0,pulse:0,flash:0});
    const cap=placeCheck(CDEFS.manawell,P.x+1,P.y).msg;const pool=!poolIds().includes('manawell');
    builds.length=0;builds.push({type:'manawell',x:P.x,y:P.y,hp:80,max:80,r:.4,cd:0,pulse:0,flash:0});updateBuilds(1);
    S.phase='night';return JSON.stringify({cap,pool,en:P.en,night:placeCheck(CDEFS.manawell,P.x+1,P.y).msg});
  })()`);
  assert.deepEqual(well, { cap: '法力之井已达上限', pool: true, en: 3, night: '夜晚仅可使用瞬发牌' });
});

testCase('R12_combat_targeting', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    initRun();S.mode='play';S.phase='night';P.x=10;P.y=10;P.ifr=0;P.hp=100;core.x=20;core.y=20;core.hp=600;
    foes.length=0;foes.push({type:'spitter',x:21.5,y:20,hp:100,max:100,spd:1.8,dmg:8,r:.3,xp:7,coreDmg:8,
      atkCd:0,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      fireCd:99,spawnCd:99,stompCd:99,px:21.5,py:20,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1});rebuildFoeGrid();
    const hp0=P.hp,core0=core.hp;updateFoes(.016);const ranged={hp:P.hp,core:core.hp};
    foes.length=0;
    return JSON.stringify({hp0,core0,ranged});
  })()`);
  assert.equal(out.ranged.hp, out.hp0);
  assert.ok(out.ranged.core < out.core0);
  seedFoe(env, .5, .5);
  env.run(`shots.length=0;shots.push({x:P.x-.8,y:P.y+.5,vx:24,vy:0,type:'arrow',dmg:9,life:1,z:22})`);
  const hp0 = env.run('foes[0].hp');
  env.run('updateShots(1/15)');
  assert.ok(env.run('foes[0].hp') < hp0);
});

testCase('R13_save_slots_roundtrip', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    const metaBefore=localStorage.getItem('arkmist_v3');
    save.weapon='frost';initRun();S.mode='play';S.day=4;S.phase='night';S.timeLeft=12;
    P.cls='mage';P.maxEn=200;P.en=137;P.aff.fire=3;P.aff.frost=1;
    P.stacks={t_fusion:1,t_resonance:2};P.resoElem='fire';P.resoN=1;
    res.wood=12;DECK.max=8;DECK.uid=99;
    S.dawnBless=[BLESSINGS.find(b=>b.id==='t_fusion')];
    const seed0=seed,node0=JSON.stringify(nodes[0]);
    if(!doSaveSlot(0))return JSON.stringify({error:'save failed'});
    const metaAfter=localStorage.getItem('arkmist_v3');
    const raw=localStorage.getItem(SLOT_KEY)||'';
    save.weapon='arcane';initRun();
    restoreSnapshot(JSON.parse(JSON.stringify(slots.slots[0].snap)));
    return JSON.stringify({
      metaSame:metaBefore===metaAfter,rawHasSnap:raw.indexOf('"snap"')>=0,rawHasBless:raw.indexOf('t_fusion')>=0,
      active:slots.active,cls:P.cls,weapon:P.weapon,en:P.en,aff:P.aff,stacks:P.stacks,reso:P.resoElem,
      day:S.day,phase:S.phase,timeLeft:S.timeLeft,wood:res.wood,deckMax:DECK.max,deckUid:DECK.uid,
      blessOk:S.dawnBless.length===1&&S.dawnBless[0]===BLESSINGS.find(b=>b.id==='t_fusion')&&typeof S.dawnBless[0].f==='function',
      seedSame:seed===seed0,nodeSame:JSON.stringify(nodes[0])===node0,
      transient:{drag:S.dragUid,hit:S.hitstop,aim:S.aimUid,pending:S.pendingSalvage}
    });
  })()`);
  assert.equal(out.error, undefined);
  assert.equal(out.metaSame, true);
  assert.equal(out.rawHasSnap, true);
  assert.equal(out.rawHasBless, true);
  assert.equal(out.active, 0);
  assert.deepEqual([out.cls, out.weapon, out.en, out.day, out.phase, out.timeLeft, out.wood, out.deckMax, out.deckUid],
    ['mage', 'frost', 137, 4, 'night', 12, 12, 8, 99]);
  assert.deepEqual(out.aff, { fire: 3, frost: 1, arcane: 0, lightning: 0 });
  assert.deepEqual(out.stacks, { t_fusion: 1, t_resonance: 2 });
  assert.equal(out.reso, 'fire');
  assert.equal(out.blessOk, true);
  assert.equal(out.seedSame, true);
  assert.equal(out.nodeSame, true);
  assert.deepEqual(out.transient, { drag: null, hit: 0, aim: null, pending: null });

  const bad = makeEnv({ storage: [['arkmist_slots_v1', '{bad']] });
  assert.equal(bad.run('slots.corrupt'), true);
  assert.deepEqual(JSON.parse(bad.run('JSON.stringify(slots.slots)')), [null, null, null]);
  const ver = makeEnv({ storage: [['arkmist_slots_v1', JSON.stringify({ v: 99, active: 0, slots: [{}, null, null] })]] });
  assert.equal(ver.run('slots.active'), null);
  assert.equal(ver.run('slots.corrupt'), true);

  const quota = makeEnv();
  quota.run('localStorage.setItem=()=>{throw new Error("quota")}');
  const warn = console.warn; console.warn = noop;
  try { assert.equal(quota.run('persistSlots()'), false); } finally { console.warn = warn; }

  const clr = makeEnv();
  clr.run('initRun();S.mode="play";doSaveSlot(1);S.day=7;S.stats.nights=7;settle(true)');
  assert.equal(clr.run('slots.slots[1]'), null);
  assert.equal(clr.run('slots.active'), null);

  // 摘要字段必须与 snap 一同校验：残缺档不再通过 validateSlot（否则列表渲染抛错）
  const sumBad = makeEnv();
  const sumOK = j(sumBad)(`(()=>{
    initRun();S.mode='play';const good=makeSlot();
    const noSummary=JSON.parse(JSON.stringify(good));delete noSummary.summary;
    const badCore=JSON.parse(JSON.stringify(good));badCore.summary.core='oops';
    const badNights=JSON.parse(JSON.stringify(good));badNights.summary.nights='7';
    return JSON.stringify({good:validateSlot(good),noSummary:validateSlot(noSummary),
      badCore:validateSlot(badCore),badNights:validateSlot(badNights)});
  })()`);
  assert.deepEqual(sumOK, {good:true,noSummary:false,badCore:false,badNights:false});

  // 损坏原串单列备份，写回干净数据不抹证据；玩家确认后才清除
  const backup = makeEnv({ storage: [['arkmist_slots_v1', '{"v":1,"slots":[{"broken":true}]}']] });
  assert.equal(backup.run('slots.corrupt'), true);
  assert.equal(backup.run('localStorage.getItem(SLOT_BAD_KEY)'), '{"v":1,"slots":[{"broken":true}]}');
  backup.run('initRun();S.mode="play";doSaveSlot(0)');
  assert.equal(backup.run('slots.corrupt'), true, '写回干净数据不应清除损坏标志');
  assert.ok(backup.run('localStorage.getItem(SLOT_BAD_KEY)'), '备份串不应被写回抹掉');
  backup.run('ackCorrupt()');
  assert.equal(backup.run('slots.corrupt'), false);
  assert.equal(backup.run('localStorage.getItem(SLOT_BAD_KEY)'), null);

  // 三槽全满且无活跃槽时，autoSave 拒绝覆盖旧档
  const full = makeEnv();
  // 沙箱 firstChild 缺陷会让第三条 toast 空转，存档前清容器（真实 DOM 无此问题）
  full.run(`initRun();S.mode='play'`);
  for (const slot of [0, 1, 2]) {
    full.run('UI.toasts.innerHTML=""');
    full.run(`doSaveSlot(${slot})`);
  }
  full.run(`slots.active=null;S.day=2;S.stats.nights=1`);
  assert.equal(full.run('slots.slots.every(Boolean)'), true, '前置条件：三槽全满');
  const before = full.run('localStorage.getItem(SLOT_KEY)');
  // autoSave 会弹一条 toast，先清容器规避测试桩 firstChild 空转
  full.run('UI.toasts.innerHTML=""');
  assert.equal(full.run('autoSave()'), false);
  assert.equal(full.run('localStorage.getItem(SLOT_KEY)'), before, '满槽自动存档不得改写任何旧档');

  // 墓碑槽：奖励已落盘但清槽失败的极端路径，读档直接进入结算，不重复发奖
  const tomb = makeEnv();
  const tombOut = j(tomb)(`(()=>{
    initRun();S.mode='play';doSaveSlot(0);S.day=7;S.stats.nights=7;S.stats.kills=40;
    const emBefore=save.embers;
    const settled={win:true,embers:12,nights0:7,kills0:40,incremental:false};
    writeTombstone(settled);
    doLoadSlot(0);
    return JSON.stringify({mode:S.mode,settled:!!S.settled,embers:save.embers,emBefore});
  })()`);
  assert.equal(tombOut.mode, 'end');
  assert.equal(tombOut.settled, true);
  assert.equal(tombOut.embers, tombOut.emBefore, '读墓碑槽不得再次发放火种');
});

testCase('R14_single_source_contract', () => {
  const env = makeEnv();
  // 1) 图鉴敌人条目完全由 FOES 派生：新增敌人只需在源码登记一次
  const grown = j(env)(`(()=>{
    const ids=Object.keys(FOES);
    const entries=CODEX.filter(x=>x.cat==='foe');
    const metaOk=ids.every(id=>{
      const e=CODEX.find(x=>x.id===id),d=FOES[id];
      return e&&e.name===d.name&&e.desc===d.desc&&e.icon===d.icon&&
        JSON.stringify(e.rel)===JSON.stringify(d.rel);
    });
    const statsOk=ids.every(id=>{
      const s=CODEX.find(x=>x.id===id).stats();
      return s.some(x=>x[0]==='基础生命')&&s.some(x=>x[0]==='首次出现')&&
        s.some(x=>x[1]===FOES[id].coreDmg);
    });
    save.seen.foe[ids[0]]=1;
    for(const id of ids)save.seen.foe[id]=1;
    for(const b of BLESSINGS)save.seen.card[b.id]=1;
    for(const id of CARD_IDS)save.seen.play[id]=1;
    for(const id of SIGIL_IDS)save.seen.sigil[id]=1;
    cxRenderList();
    const track=ids.length+BLESSINGS.length+CARD_IDS.length+SIGIL_IDS.length;
    return JSON.stringify({ids,count:entries.length,metaOk,statsOk,track,
      label:document.getElementById('cxCount').textContent});
  })()`);
  assert.equal(grown.count, grown.ids.length);
  assert.equal(grown.metaOk, true);
  assert.equal(grown.statsOk, true);
  assert.ok(grown.label.includes(`${grown.track}/${grown.track}`));
  // 2) 图鉴数值来自 TUNE：改总表后文案即时同步
  const live = j(env)(`(()=>{
    const before=CODEX.find(x=>x.id==='core').stats().find(x=>x[0]==='单次修复')[1];
    TUNE.core.repair.heal=123;
    const after=CODEX.find(x=>x.id==='core').stats().find(x=>x[0]==='单次修复')[1];
    TUNE.core.repair.heal=70;
    const novaBefore=CODEX.find(x=>x.id==='nova').stats().find(x=>x[0].includes('消耗'))[1];
    TUNE.nova.cost=77;
    const novaAfter=CODEX.find(x=>x.id==='nova').stats().find(x=>x[0].includes('消耗'))[1];
    TUNE.nova.cost=60;
    return JSON.stringify({before,after,novaBefore,novaAfter});
  })()`);
  assert.deepEqual(live, { before: '+70', after: '+123', novaBefore: '60', novaAfter: '77' });
  // 3) 施法距离唯一来源：放置校验与法术索敌共用同一函数
  const ranged = j(env)(`(()=>{
    initRun();P.stacks={t_reach:1};
    const out=spellCastRange();
    const far=placeCheck(CDEFS.sp_emberburst,P.x+out+.5,P.y).msg;
    const near=placeCheck(CDEFS.sp_emberburst,P.x+out-.5,P.y).ok;
    return JSON.stringify({out,far,near});
  })()`);
  assert.ok(Math.abs(ranged.out - 9) < 1e-9);
  assert.equal(ranged.far, '超出施法距离');
  assert.equal(ranged.near, true);
  // 4) 伤害倍率：默认 1 不改平衡；改表后近战与法术伤害同源缩放
  const mul = j(env)(`(()=>JSON.stringify({melee:TUNE.dmgMul.melee,spell:TUNE.dmgMul.spell}))()`);
  assert.deepEqual(mul, { melee: 1, spell: 1 });
  const scaled = j(env)(`(()=>{
    initRun();P.cls='mage';P.crit=0;foes.length=0;
    const f={type:'crawler',x:P.x+1,y:P.y,hp:10000,max:10000,spd:0,dmg:6,r:.32,xp:5,coreDmg:6,
      atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      burnStacks:0,burnT:0,burnTick:0,chillStacks:0,chillT:0,freezeT:0,markT:0,shockT:0,lastElem:null,lastElemT:-99,reactCd:0};
    foes.push(f);rebuildFoeGrid();
    TUNE.dmgMul.spell=2;castSpell(CDEFS.sp_emberburst,f.x,f.y);const spell=10000-f.hp;
    const base=spell/2;TUNE.dmgMul.spell=1;
    foes.length=0;P.cls=null;P.weapon='sword';P.dmg=12;
    foes.push({...f,hp:10000,max:10000,dead:false});rebuildFoeGrid();
    TUNE.dmgMul.melee=2;swing(0);const melee=10000-foes[0].hp;TUNE.dmgMul.melee=1;
    return JSON.stringify({base,spell,melee});
  })()`);
  assert.ok(scaled.base > 0 && Math.abs(scaled.spell - scaled.base * 2) < 1e-6);
  assert.ok(Math.abs(scaled.melee - 24) < 1e-6);
  // 5) 图鉴文案单一数据源：状态名取 TUNE.statusNames，反应名取 RX_DEF
  const codexNames = j(env)(`(()=>{
    const card=CODEX.find(x=>x.id==='c_sp_kindling');
    const st=()=>card.stats().find(x=>x[0]==='附加状态')[1];
    const s1=st();
    TUNE.statusNames.burn='燃烧测试';
    const s2=st();
    TUNE.statusNames.burn='灼烧';
    const rxRow=()=>CODEX.find(x=>x.id==='reaction').stats().find(x=>x[0]==='火+冰')[1];
    const r1=rxRow();
    RX_DEF['fire|frost'].name='改名测试';
    const r2=rxRow();
    RX_DEF['fire|frost'].name='蒸汽爆炸';
    return JSON.stringify({s1,s2,r1,r2});
  })()`);
  assert.deepEqual(codexNames, { s1: '灼烧 ×1', s2: '燃烧测试 ×1', r1: '蒸汽爆炸', r2: '改名测试' });
});

testCase('R15_weapon_data_pool_and_save', () => {
  const env = makeEnv({ storage: [['arkmist_v3', JSON.stringify({ weapon: 'frost' })]] });
  const out = j(env)(`(()=>{
    initRun();
    return JSON.stringify({
      ids:WEAPON_IDS,arts:WEAPON_IDS.map(id=>WEAPONS[id].art),save:save.weapon,player:P.weapon,
      mapped:WEAPON_IDS.every(id=>!WEAPONS[id].spell||CDEFS[WEAPONS[id].spell]),
      oldInPool:poolIds().some(id=>CDEFS[id].weaponAttack),
      burstInPool:poolIds().includes('sp_emberburst'),
      oldCard:mkCard('sp_fireball'),unknownCard:mkCard('unknown'),
      fallback:[normalizeWeaponId('constructor'),normalizeWeaponId(undefined),normalizeWeaponId('arcane')]
    });
  })()`);
  assert.deepEqual(out.ids, ['sword', 'flame', 'frost', 'arcane']);
  assert.equal(out.save, 'frost');
  assert.equal(out.player, 'frost');
  assert.equal(out.mapped, true);
  assert.equal(out.oldInPool, false);
  assert.equal(out.burstInPool, true);
  assert.equal(out.oldCard, null);
  assert.equal(out.unknownCard, null);
  assert.deepEqual(out.fallback, ['sword', 'sword', 'arcane']);
  for (const art of out.arts) assert.ok(fs.existsSync(path.join(ROOT, art)), art);

  const bad = makeEnv({ storage: [['arkmist_v3', JSON.stringify({ weapon: 'constructor' })]] });
  assert.equal(bad.run('save.weapon'), 'sword');
  assert.equal(bad.run('P.weapon'), 'sword');
});

testCase('R16_weapon_auto_attacks', () => {
  const env = makeEnv();
  const expected = { sword: [12, 12, .42], flame: [20, 20, .60], frost: [11, 11, .50], arcane: [10, 0, .26] };
  const weaponIds = env.run('WEAPON_IDS');
  for (const id of weaponIds) {
    env.run(`initRun();S.mode='play';P.weapon='${id}';
      P.sigils=[...(weaponDef(P.weapon).startSigils||[])].map(mkCard);P.sigCast=0;
      P.dmg=TUNE.player.baseDmg;P.range=TUNE.player.baseRange;
      P.crit=0;P.atkCd=0;P.wave=0;P.cls='mage';P.maxEn=200;P.en=137;P.spellCd=.4;
      P.stacks={t_resonance:1,t_arccharge:1,t_storm:1};P.resoElem='fire';P.resoN=2;P.arcCharge=3;P.stormCount=4;P.charge=5;P.shield=6;
      res.wood=31;res.stone=17;res.crys=9;DECK.hand=[mkCard('wall')];DECK.draw=[mkCard('tower')];DECK.discard=[mkCard('rain')];
      S.stats.played=3;nodes.length=0;foes.length=0;shots.length=0;`);
    const d = id === 'sword' ? 1.1 : 3;
    seedFoe(env, d, 0);
    env.run(`foes.push({...foes[0],x:P.x+${d + .3},y:P.y,hp:10000,max:10000,dead:false});rebuildFoeGrid();`);
    const got = j(env)(`(()=>{
      const before=JSON.stringify({en:P.en,res,hand:DECK.hand.length,draw:DECK.draw.length,discard:DECK.discard.length,
        played:S.stats.played,spellCd:P.spellCd,reso:P.resoN,arc:P.arcCharge,storm:P.stormCount,charge:P.charge,shield:P.shield});
      autoAttack();
      const after=JSON.stringify({en:P.en,res,hand:DECK.hand.length,draw:DECK.draw.length,discard:DECK.discard.length,
        played:S.stats.played,spellCd:P.spellCd,reso:P.resoN,arc:P.arcCharge,storm:P.stormCount,charge:P.charge,shield:P.shield});
      const first=foes[0];
      return JSON.stringify({dmg:[10000-first.hp,10000-foes[1].hp],cd:P.atkCd,economy:before===after,
        status:{burn:first.burnStacks||0,chill:first.chillStacks||0,mark:first.markT||0}});
    })()`);
    const [first,second,interval] = expected[id];
    assert.deepEqual(got.dmg, [first,second], id);
    assert.equal(got.cd, interval, id);
    assert.equal(got.economy, true, id);
    if (id === 'flame') assert.equal(got.status.burn, 2);
    if (id === 'frost') {
      assert.equal(got.status.chill, 2);
      assert.equal(env.run('foeSlowMult(foes[0])'), .76);
    }
    if (id === 'arcane') assert.equal(got.status.mark, 4);

    const gathering = j(env)(`(()=>{
      // The node is closer, in range and behind the player; an in-range foe wins.
      const n={type:'rock',x:P.x-.8,y:P.y,hp:4,alive:true,shake:0};
      nodes.push(n);P.atkCd=0;autoAttack();const withFoe=n.hp;
      foes.forEach(f=>{f.x=P.x+20;});rebuildFoeGrid();P.atkCd=0;autoAttack();
      const cd=P.atkCd;autoAttack();const after=n.hp;
      n.x=P.x+20;P.atkCd=0;autoAttack();
      return JSON.stringify({withFoe,after,cd,noTarget:P.atkCd});
    })()`);
    assert.deepEqual(gathering, {withFoe:4,after:3,cd:interval,noTarget:0}, id);
  }

  env.run(`initRun();P.weapon='sword';P.atkCd=0;P.wave=1;foes.length=0;nodes.length=0;shots.length=0;`);
  seedFoe(env, .8, 0);
  env.run('autoAttack()');
  assert.ok(env.run(`shots.some(s=>s.type==='wave')`));

  env.run(`initRun();P.weapon='flame';P.sigils=[mkCard('sig_flame')];P.atkCd=0;P.range=TUNE.player.baseRange*1.18;foes.length=0;nodes.length=0;`);
  seedFoe(env, 8, 0);
  env.run('autoAttack()');
  assert.ok(env.run('10000-foes[0].hp') > 0);

  // 法杖空槽停火：无法术刻印时不造成伤害也不进入冷却
  env.run(`initRun();S.mode='play';P.weapon='flame';P.sigils=[];P.atkCd=0;foes.length=0;nodes.length=0;`);
  seedFoe(env, 1, 0);
  assert.equal(j(env)(`(()=>{const hp=foes[0].hp;autoAttack();return foes[0].hp===hp&&P.atkCd===0;})()`), true);
});

testCase('R17_weapon_snapshot_picker_and_hud', () => {
  const env = makeEnv();
  const roundtrip = j(env)(`(()=>{
    const ids=WEAPON_IDS.map(id=>{save.weapon=id;initRun();S.mode='play';const snap=captureSnapshot();
      save.weapon='sword';initRun();restoreSnapshot(snap);return P.weapon;});
    save.weapon='arcane';initRun();const snap=captureSnapshot();delete snap.P.weapon;initRun();restoreSnapshot(snap);
    return JSON.stringify({ids,missing:P.weapon});
  })()`);
  assert.deepEqual(roundtrip.ids, ['sword', 'flame', 'frost', 'arcane']);
  assert.equal(roundtrip.missing, 'sword');

  env.run(`save.weapon='sword';initRun();openPrep();`);
  const before = env.run('localStorage.getItem(SAVE_KEY)');
  env.run('openWeaponPicker()');
  assert.equal(env.run('S.mode'), 'prep');
  assert.equal(env.run("$('weaponDrop').classList.contains('show')"), true);
  env.run("selectWeaponDraft('frost')");
  assert.equal(env.run('localStorage.getItem(SAVE_KEY)'), before);
  assert.equal(env.run('save.weapon'), 'sword');
  env.run('openWeaponPicker()'); // 再点「收起」取消，不落定
  assert.equal(env.run('weaponPicker'), null);
  assert.equal(env.run('save.weapon'), 'sword');

  // 点击武器卡直接落定：写档、刷新准备页、收起面板
  env.run('openWeaponPicker()');
  let cards = env.ids.get('weaponGrid').children;
  cards[1]._listeners.click[0]();
  assert.equal(env.run('save.weapon'), 'flame');
  assert.equal(JSON.parse(env.run('localStorage.getItem(SAVE_KEY)')).weapon, 'flame');
  assert.equal(env.ids.get('prepWeaponName').textContent, '火焰法杖');
  assert.equal(env.run('weaponPicker'), null);
  assert.equal(env.run("$('weaponDrop').classList.contains('show')"), false);

  env.run('openWeaponPicker()');
  const press = (key, shiftKey = false) => {
    let prevented = false;
    env.winL.keydown[0]({ key, shiftKey, preventDefault() { prevented = true; } });
    return prevented;
  };
  assert.equal(press('1'), true);
  assert.equal(env.run('save.weapon'), 'sword'); // 数字键与点击一致，直接落定
  assert.equal(env.run('weaponPicker'), null);

  env.run('openWeaponPicker()');
  assert.equal(press('ArrowRight'), true);
  assert.equal(env.run('weaponPicker.draft'), 'flame');
  assert.equal(env.run('save.weapon'), 'sword'); // 方向键只预览，Enter/点击才落定

  const document = env.ctx.document;
  cards = env.ids.get('weaponGrid').children; // 预览后卡片已重建
  env.ids.get('weaponDrop').querySelectorAll = () => cards;
  cards.forEach(c => { c.focus = () => { document.activeElement = c; }; });
  document.activeElement = cards[1];
  assert.equal(press('Tab'), false);
  assert.equal(press('Tab', true), false);
  document.activeElement = cards[0];
  assert.equal(press('Tab', true), true);
  assert.equal(document.activeElement, cards[3]);
  assert.equal(press('Tab'), true);
  assert.equal(document.activeElement, cards[0]);

  assert.equal(press('3'), true);
  assert.equal(env.run('save.weapon'), 'frost');
  assert.equal(env.run('weaponPicker'), null);
  env.run('openWeaponPicker()');
  assert.equal(press('Escape'), true);
  assert.equal(env.run('weaponPicker'), null);
  assert.equal(env.run('S.mode'), 'prep');
  env.run('openWeaponPicker();beginRun();');
  assert.equal(env.run('S.mode'), 'prep');
  env.run('cancelWeaponPicker()');

  const hud = j(env)(`(()=>{
    S.mode='play';const names=[];
    for(const id of WEAPON_IDS){P.weapon=id;syncHUD();names.push(UI.weaponName.textContent);}
    return JSON.stringify(names);
  })()`);
  assert.deepEqual(hud, ['剑', '火焰法杖', '冰法杖', '奥术法杖']);
});

testCase('R18_spell_weapons_skip_mage_transform', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    const rows=[];
    for(const id of ['flame','frost','arcane']){
      save.weapon=id;initRun();S.day=2;
      const cards=['wall','rain','spring'];injectClassCard(cards);
      const before={cls:P.cls,mage:isMage(),maxHp:P.maxHp,hp:P.hp,maxEn:P.maxEn,en:P.en,regen:P.enRegenFlat,deckMax:DECK.max,cap:handCap()};
      const transformed=becomeMage();
      const rnd=Math.random;Math.random=()=>0;P.aff.fire=20;
      const coreCards=['wall','rain','spring'];injectCoreCards(coreCards);Math.random=rnd;
      rollDawnBless();const pool=poolIds();
      rows.push({id,cards,transformed,before,after:{cls:P.cls,mage:isMage(),maxHp:P.maxHp,hp:P.hp,maxEn:P.maxEn,en:P.en,
        regen:P.enRegenFlat,deckMax:DECK.max,cap:handCap()},core:coreCards.some(x=>CDEFS[x]&&CDEFS[x].core),
        classInPool:pool.includes('class_mage'),wellInPool:pool.includes('manawell'),mageBless:S.dawnBless.some(b=>b.cls==='mage')});
    }
    save.weapon='sword';initRun();refreshPrep();const swordNote=$('prepMageNote').textContent;
    save.weapon='flame';refreshPrep();const spellNote=$('prepMageNote').textContent;
    const reaction=id=>{
      save.weapon=id;initRun();foes.length=0;
      const f={x:P.x,y:P.y,r:.3,hp:10000,max:10000,dead:false,flash:0,kx:0,ky:0,burnStacks:0,burnT:0,burnTick:0,
        chillStacks:0,chillT:0,freezeT:0,markT:0,shockT:0,lastElem:'frost',lastElemT:S.combatT,reactCd:0};
      foes.push(f);rebuildFoeGrid();applyElement(f,'fire',2);return f.reactCd||0;
    };
    return JSON.stringify({rows,swordNote,spellNote,staffReaction:reaction('flame'),swordReaction:reaction('sword')});
  })()`);
  for (const row of out.rows) {
    assert.deepEqual(row.cards, ['wall', 'rain', 'spring'], row.id);
    assert.equal(row.transformed, false, row.id);
    assert.deepEqual(row.after, row.before, row.id);
    assert.equal(row.before.mage, false, row.id);
    assert.deepEqual([row.before.maxEn, row.before.regen, row.before.deckMax, row.before.cap], [100, 14, 5, 10], row.id);
    assert.equal(row.core, true, row.id);
    assert.equal(row.classInPool, false, row.id);
    assert.equal(row.wellInPool, false, row.id);
    assert.equal(row.mageBless, false, row.id);
  }
  assert.match(out.swordNote, /转职/);
  assert.match(out.spellNote, /无需转职/);
  assert.notEqual(out.swordNote, out.spellNote);
  assert.equal(out.staffReaction, 1.5);
  assert.equal(out.swordReaction, 0);

  const waveOffers = j(env)(`(()=>{
    const offered=()=>{rollDawnBless();return S.dawnBless.some(b=>b.id==='wave');};
    const fillOtherBlessings=()=>{
      S.endless=true;
      P.stacks=Object.fromEntries(BLESSINGS.filter(b=>b.id!=='wave').map(b=>[b.id,b.max||8]));
    };
    const byWeapon=Object.fromEntries(WEAPON_IDS.map(id=>{
      save.weapon=id;initRun();fillOtherBlessings();return [id,offered()];
    }));
    save.weapon='sword';initRun();becomeMage();fillOtherBlessings();
    const asMage=offered();P.stacks.wave=2;
    return JSON.stringify({byWeapon,asMage,atCap:offered()});
  })()`);
  assert.deepEqual(waveOffers, {
    byWeapon: { sword: true, flame: false, frost: false, arcane: false }, asMage: true, atCap: false
  });
});

testCase('R19_fx_degradation_contract', () => {
  const scenario = `(()=>{
    save.weapon='sword';initRun();S.mode='play';S.phase='day';
    P.cls=null;P.crit=0;P.stacks={t_fusion:1};P.en=200;P.maxEn=200;
    res.wood=99;res.stone=99;res.crys=99;foes.length=0;shots.length=0;
    let bx=P.x+1,by=P.y;
    for(let i=0;i<16;i++){const a=i/16*6.283185;const x=P.x+Math.cos(a)*1.6,y=P.y+Math.sin(a)*1.6;
      if(walk(x,y)&&dist(x,y,P.x,P.y)>1&&!nodes.some(n=>n.alive&&dist(n.x,n.y,x,y)<.9)){bx=x;by=y;break;}}
    const play=id=>{DECK.hand=[mkCard(id)];DECK.draw=[];DECK.discard=[];return playCard(DECK.hand[0].uid,id==='wall'?bx:P.x+1,id==='wall'?by:P.y);};
    play('wall');play('expand');play('rain');play('spring');play('mend');play('ward');play('tactic');play('surge');
    const sv=mkCard('salvage5');DECK.hand=[sv];beginSalvage(sv);confirmSalvage('wall');
    becomeMage();
    const mkFoe=()=>({type:'crawler',x:P.x+1,y:P.y,r:.3,hp:10000,max:10000,spd:0,dmg:6,xp:5,coreDmg:6,
      atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      fireCd:99,spawnCd:99,stompCd:99,px:P.x+1,py:P.y,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1,
      burnStacks:0,burnT:0,burnTick:0,chillStacks:0,chillT:0,freezeT:0,markT:0,shockT:0,lastElem:null,lastElemT:-99,reactCd:0});
    foes.push(mkFoe());rebuildFoeGrid();
    castSpell(CDEFS.sp_emberburst,P.x+1,P.y);
    const f=foes[0];f.hp=f.max=26;f.burnStacks=5;f.burnT=4;f.lastElem='frost';f.lastElemT=S.combatT;f.reactCd=0;
    castSpell(CDEFS.sp_flamedetonate,f.x,f.y);
    foes.length=0;foes.push(mkFoe());rebuildFoeGrid();
    triggerElementStorm();
    const g=foes[0];g.lastElem='frost';g.lastElemT=S.combatT;g.reactCd=0;applyElement(g,'fire',2);
    g.lastElem='fire';g.lastElemT=S.combatT;g.reactCd=0;applyElement(g,'arcane',1);
    render();
    return JSON.stringify({
      calls:typeof FX==='undefined'?[]:FX.calls,
      state:{en:P.en,hp:Math.round(P.hp*1000),wood:res.wood,stone:res.stone,crys:res.crys,
        hand:DECK.hand.map(c=>c.id),draw:DECK.draw.length,discard:DECK.discard.map(c=>c.id),
        played:S.stats.played,builds:builds.length,max:DECK.max,dmg:Math.round((10000-foes[0].hp)*1000)}
    });
  })()`;
  const stub = on => `FX={on:${on},calls:[],clear(){this.calls.push('clear')},frame(){this.calls.push('frame')},` +
    `cast(id){this.calls.push('cast:'+id)},spell(){this.calls.push('spell')},detonate(){this.calls.push('detonate')},` +
    `reaction(x,y,k){this.calls.push('reaction:'+k)},storm(){this.calls.push('storm')},becomeMage(){this.calls.push('mage')}}`;
  const run = on => { const env = makeEnv(); if (on !== undefined) env.run(stub(on)); return j(env)(scenario); };
  const none = run(undefined), off = run(false), on = run(true);
  // 特效只走 FX 层：无论后端是否就绪，调用一律发出，由 FX 内部保护决定是否渲染。
  // 旧契约「FX 关闭时不调用、改走 Canvas 2D 回退」已随回退路径一并移除。
  const need = ['clear','cast:wall','cast:expand','cast:rain','cast:spring','cast:mend','cast:ward','cast:tactic',
    'cast:surge','cast:salvage','mage','spell','detonate','storm','reaction:steam','reaction:reso','frame'];
  for (const k of need) {
    assert.ok(off.calls.includes(k), 'off:' + k);
    assert.ok(on.calls.includes(k), 'on:' + k);
  }
  assert.deepEqual(none.state, off.state);
  assert.deepEqual(none.state, on.state);
});

testCase('R20_fire_spread_and_tree_yield', () => {
  const env = makeEnv();
  env.run(`save.weapon='flame';initRun();S.mode='play';P.crit=0;nodes.length=0;`);
  seedFoe(env, 3, 0);
  const out = j(env)(`(()=>{
    for(const dx of [4.4,5.65,6.9])foes.push({...foes[0],x:P.x+dx});
    rebuildFoeGrid();
    const tree=(dy,type='tree')=>({type,x:P.x+4.4,y:P.y+dy,hp:3,max:3,alive:true,shake:0});
    const near=tree(1.2),next=tree(2.4),rock=tree(1.2,'rock');
    nodes.push(near,next,rock);
    autoAttack();
    const burn=foes.map(f=>f.burnStacks||0),damage=foes.map(f=>10000-f.hp);
    const burning=nodes.map(n=>n.burnHits||0);
    updateBurningTrees(.3);
    P.atkCd=0;autoAttack(); // Renewed attacks cannot reset the existing tree timer.
    updateBurningTrees(.3);const firstTick=near.hp;
    updateBurningTrees(.6);updateBurningTrees(.6);
    const drops=()=>picks.filter(p=>p.type==='wood').reduce((sum,p)=>sum+p.amt,0);
    const wood=drops();updateBurningTrees(2);
    return JSON.stringify({burn,damage,burning,firstTick,alive:near.alive,nextHp:next.hp,rockHp:rock.hp,wood,woodLater:drops()});
  })()`);
  assert.deepEqual(out.burn, [2,2,1,0]);
  assert.deepEqual(out.damage, [20,20,0,0]);
  assert.deepEqual(out.burning, [3,0,0]);
  assert.deepEqual([out.firstTick,out.alive,out.nextHp,out.rockHp], [2,false,3,3]);
  assert.ok(out.wood >= 4 && out.wood <= 6);
  assert.equal(out.woodLater, out.wood);
  env.run(`foes.length=0;rebuildFoeGrid();nodes.length=0;P.atkCd=0;
    nodes.push({type:'tree',x:P.x+2,y:P.y,hp:3,alive:true},{type:'tree',x:P.x+3,y:P.y,hp:3,alive:true});autoAttack();`);
  assert.deepEqual(j(env)('JSON.stringify(nodes.map(n=>[n.hp,n.burnHits]))'), [[2,3],[3,3]]);
});

testCase('R21_basic_element_cards', () => {
  const env = makeEnv();
  const cards = ['sp_kindling','sp_frostpatch','sp_arcaneneedle'];
  const available = j(env)(`JSON.stringify(poolIds().filter(id=>CDEFS[id].basic))`);
  assert.ok(cards.every(id=>available.includes(id)));
  for (const id of cards) {
    env.run(`initRun();S.mode='play';P.crit=0;nodes.length=0;tileAt(P.x+1,P.y).land=true;
      DECK.hand=[mkCard('${id}')];DECK.draw=[];DECK.discard=[];`);
    seedFoe(env, .8, 0);
    const result = j(env)(`(()=>{
      foes.push({...foes[0],x:P.x+1.3});rebuildFoeGrid();
      const tree={type:'tree',x:P.x+1,y:P.y+.9,hp:3,alive:true};nodes.push(tree);
      const played=playCard(DECK.hand[0].uid,P.x+1,P.y);
      return JSON.stringify({played,en:P.en,cd:P.spellCd,discard:DECK.discard[0].id,
        damage:foes.map(f=>10000-f.hp),burn:foes.map(f=>f.burnStacks||0),
        slow:foeSlowMult(foes[0]),mark:foes.map(f=>f.markT||0),tree:tree.burnHits||0});
    })()`);
    assert.deepEqual([result.played,result.en,result.cd,result.discard], [true,85,.55,id]);
    if(id==='sp_kindling'){
      assert.deepEqual(result.damage,[8,8]);
      assert.deepEqual(result.burn,[1,1]);
      assert.equal(result.tree,3);
    }else if(id==='sp_frostpatch'){
      assert.deepEqual(result.damage,[8,8]);
      assert.equal(result.slow,.76);
    }else{
      assert.deepEqual(result.damage,[24,0]);
      assert.deepEqual(result.mark,[4,0]);
    }
  }
});

testCase('R22_weapon_slots_and_sigils', () => {
  const env = makeEnv();
  // 1) 槽位数按武器登记：剑 3 槽，法杖 6 槽
  const slots = j(env)(`JSON.stringify(Object.fromEntries(WEAPON_IDS.map(id=>[id,WEAPONS[id].slots])))`);
  assert.deepEqual(slots, {sword:3,flame:6,frost:6,arcane:6});
  // 2) 刻印表只有三件，且文案由数值派生
  const defs = j(env)(`JSON.stringify(SIGIL_IDS.map(id=>({id,n:SIGILS[id].n,d:sigilDesc(id)})))`);
  assert.equal(defs.length, 3);
  assert.deepEqual(defs.map(x=>x.id), ['keen','swift','echo']);
  const live = j(env)(`(()=>{
    const before=sigilDesc('keen');
    SIGILS.keen.dmg=.5;const after=sigilDesc('keen');
    SIGILS.keen.dmg=.2;
    return JSON.stringify({before,after});
  })()`);
  assert.notEqual(live.before, live.after);
  assert.ok(live.after.includes('50%'));

  // 3) 效果只作用于武器攻击，不影响法术牌
  const combat = j(env)(`(()=>{
    const setup=(w,sigils)=>{
      save.weapon=w;initRun();S.mode='play';
      P.dmg=TUNE.player.baseDmg;P.atkCd=0;P.crit=0;P.wave=0;P.cls='mage';P.maxEn=200;P.en=137;P.spellCd=.4;
      P.stacks={};P.sigils=sigils.map(mkCard);P.sigCast=0;
      foes.length=0;nodes.length=0;shots.length=0;slashes.length=0;
    };
    const foe=()=>{foes.push({type:'crawler',x:P.x+1.1,y:P.y,hp:10000,max:10000,spd:0,dmg:6,r:.32,xp:5,coreDmg:6,
      atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      fireCd:99,spawnCd:99,stompCd:99,px:P.x+1.1,py:P.y,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1});
      rebuildFoeGrid();};
    const r0=Math.random;
    setup('sword',[]);foe();Math.random=()=>0;autoAttack();const swordPlain=10000-foes[0].hp;
    setup('sword',['keen','keen']);foe();Math.random=()=>0;autoAttack();const swordKeen=10000-foes[0].hp;
    setup('flame',['sig_flame']);foe();Math.random=()=>0;autoAttack();const flamePlain=10000-foes[0].hp;
    setup('flame',['sig_flame','keen','keen']);foe();Math.random=()=>0;autoAttack();const flameKeen=10000-foes[0].hp;
    setup('sword',['echo']);foe();Math.random=()=>0;autoAttack();const echoDmg=10000-foes[0].hp;const echoSlashes=slashes.length;
    setup('sword',['swift','swift']);const cdSwift=weaponAttackInterval();
    setup('sword',[]);const cdPlain=weaponAttackInterval();
    Math.random=r0;
    return JSON.stringify({swordPlain,swordKeen,flamePlain,flameKeen,echoDmg,echoSlashes,cdSwift,cdPlain});
  })()`);
  assert.equal(combat.swordPlain, 12);
  assert.ok(Math.abs(combat.swordKeen - 12*1.44) < 1e-6);
  assert.equal(combat.flamePlain, 20);
  assert.ok(Math.abs(combat.flameKeen - 20*1.44) < 1e-6);
  assert.equal(combat.echoDmg, 24);
  assert.equal(combat.echoSlashes, 2);
  assert.ok(Math.abs(combat.cdPlain - .42) < 1e-9);
  assert.ok(combat.cdSwift < combat.cdPlain);

  // 4) 刻印链路：开局实体卡直接入槽且不重复 → 卸下回手牌 → 装槽到指定位 → 牌库守恒 → 轮发
  const cycle = j(env)(`(()=>{
    save.weapon='flame';initRun();S.mode='play';UI.toasts.innerHTML='';
    const start=P.sigils[0]&&P.sigils[0].id==='sig_flame';
    const noDup=!DECK.hand.some(c=>c.id==='sig_flame')&&!DECK.draw.some(c=>c.id==='sig_flame');
    const total=()=>DECK.hand.length+DECK.draw.length+DECK.discard.length+P.sigils.length;
    const before=total();
    const off=unfillSlot(0),back=DECK.hand.some(c=>c.id==='sig_flame');
    const uid=DECK.hand.find(c=>c.id==='sig_flame').uid;
    const on=engraveCard(uid,0);
    const slot=P.sigils.length===1&&P.sigils[0].id==='sig_flame';
    const conserved=total()===before&&!DECK.hand.some(c=>c.id==='sig_flame');
    P.sigils=['keen','sig_flame','sig_frost'].map(mkCard);P.sigCast=0;
    const order=[];for(let i=0;i<3;i++)order.push(nextWeaponSpell().id);
    return JSON.stringify({start,noDup,off,back,on,slot,conserved,order});
  })()`);
  assert.deepEqual(cycle, {start:true,noDup:true,off:true,back:true,on:true,slot:true,conserved:true,
    order:['sig_flame','sig_frost','sig_flame']});

  // 5) 存档往返保留卡对象（uid + id）
  const roundtrip = j(env)(`(()=>{
    save.weapon='flame';initRun();S.mode='play';
    P.sigils=['keen','sig_flame'].map(mkCard);
    const snap=captureSnapshot();
    P.sigils=[];
    restoreSnapshot(JSON.parse(JSON.stringify(snap)));
    return JSON.stringify({sigils:P.sigils.map(c=>c.id),snapIds:snap.P.sigils.map(c=>c.id)});
  })()`);
  assert.deepEqual(roundtrip.sigils, ['keen','sig_flame']);
  assert.deepEqual(roundtrip.snapIds, ['keen','sig_flame']);
});

testCase('R23_codex_sigil_and_seen_source', () => {
  const env = makeEnv();
  // 1) 图鉴刻印条目完全由 SIGILS 派生：新增刻印只需在 03-data.js 登记一次
  const derived = j(env)(`(()=>{
    const ids=SIGIL_IDS;
    const entries=CODEX.filter(x=>x.id.startsWith('s_'));
    const metaOk=ids.every(id=>{
      const e=CODEX.find(x=>x.id==='s_'+id),d=SIGILS[id];
      return e&&e.name===d.n&&e.icon===d.icon&&e.color===d.color;
    });
    const descOk=ids.every(id=>{
      const e=CODEX.find(x=>x.id==='s_'+id);
      return e.stats().some(x=>x[0]==='效果'&&x[1]===sigilDesc(id));
    });
    const before=CODEX.find(x=>x.id==='s_keen').stats().find(x=>x[0]==='效果')[1];
    SIGILS.keen.dmg=.5;
    const after=CODEX.find(x=>x.id==='s_keen').stats().find(x=>x[0]==='效果')[1];
    SIGILS.keen.dmg=.2;
    return JSON.stringify({ids,count:entries.length,metaOk,descOk,before,after,
      catOk:!CX_CATS.some(c=>c.id==='sigil')&&CX_CATS.some(c=>c.id==='role'),
      inRole:entries.every(e=>e.cat==='role')});
  })()`);
  assert.deepEqual(derived.ids, ['keen', 'swift', 'echo']);
  assert.equal(derived.count, 3);
  assert.equal(derived.metaOk, true);
  assert.equal(derived.descOk, true);
  assert.equal(derived.catOk, true);
  assert.equal(derived.inRole, true);
  assert.notEqual(derived.before, derived.after);
  assert.ok(derived.after.includes('50%'));

  // 2) 黎明条目文案与实际流程一致：三步
  const dawn = j(env)(`(()=>{
    const e=CODEX.find(x=>x.id==='dawn');
    return JSON.stringify({desc:e.desc,steps:e.desc.includes('两步'),
      pool:e.stats().find(x=>x[0]==='刻印卡')[1]});
  })()`);
  assert.equal(dawn.steps, true);
  assert.ok(dawn.desc.includes('牌库'));
  assert.equal(dawn.pool, '6 种');

  // 3) 武器条目带槽位
  const wp = j(env)(`(()=>{
    const e=CODEX.find(x=>x.id==='w_sword');
    return JSON.stringify({slot:e.stats().find(x=>x[0]==='刻印槽位')[1]});
  })()`);
  assert.equal(wp.slot, '3 格');

  // 4) seen 白名单单一来源：登记一次，初始化 / 校验 / 拷贝三处共用
  const seen = j(env)(`(()=>{
    const out={keys:SEEN_KEYS,init:Object.keys(save.seen)};
    bumpSeen('sigil','keen');
    out.after=JSON.parse(JSON.stringify(save.seen.sigil));
    out.defaults=SEEN_KEYS.every(k=>save.seen[k]&&typeof save.seen[k]==='object');
    return JSON.stringify(out);
  })()`);
  assert.deepEqual(seen.keys, ['foe', 'build', 'card', 'play', 'sigil']);
  assert.deepEqual(seen.init, ['foe', 'build', 'card', 'play', 'sigil']);
  assert.deepEqual(seen.after, { keen: 1 });
  assert.equal(seen.defaults, true);
});

testCase('R24_codex_tag_derivation_and_display', () => {
  const env = makeEnv();
  const out = j(env)(`(()=>{
    const byId=id=>CODEX.find(e=>e.id===id);
    const cats=CX_CATS.map(c=>c.id),tagIds=CX_TAGS.map(t=>t.id);
    const cover=CARD_IDS.every(id=>Array.isArray(byId('c_'+id).tags));
    const untagged=CARD_IDS.filter(id=>!byId('c_'+id).tags.length);
    const s={kindling:byId('c_sp_kindling').tags,arcneedle:byId('c_sp_arcaneneedle').tags,
      mine:byId('c_mine').tags,tactic:byId('c_tactic').tags,wall:byId('c_wall').tags,
      flame:byId('w_flame').tags,sword:byId('w_sword').tags,keen:byId('s_keen').tags};
    const deadTag=tagIds.filter(t=>!CODEX.some(e=>(e.tags||[]).includes(t)));
    const unknown=[...new Set([].concat(...CODEX.map(e=>(e.tags||[]).filter(t=>!CX_TAG_BY_ID[t]))))];
    const dup=CODEX.filter(e=>new Set(e.tags||[]).size!==(e.tags||[]).length).map(e=>e.id);
    const ownW=CODEX.filter(e=>(e.tags||[]).includes('weapon')).length;
    const ownS=CODEX.filter(e=>(e.tags||[]).includes('sigil')).length;
    const tplInCodex=!!byId('c_sp_fireball');
    cxCat='all';cxQuery='';cxRenderList();
    const all=cxFiltered.length,labelAll=document.getElementById('cxCount').textContent;
    cxCat='card';cxRenderList();const cards=cxFiltered.length;
    cxCat='all';cxQuery='灼烧';cxRenderList();const hit=cxFiltered.length;cxQuery='';cxRenderList();
    cxSelect('w_flame',false);
    const etHtml=document.getElementById('cxEntryTags').innerHTML;
    const titleOn=document.getElementById('cxTagT').style.display;
    cxSelect('crawler',false);
    const etNone=document.getElementById('cxEntryTags').innerHTML;
    const titleOff=document.getElementById('cxTagT').style.display;
    cxSelect('w_flame',false);
    return JSON.stringify({cats,tagIds,cover,untagged,s,deadTag,ownW,ownS,wLen:WEAPON_IDS.length,sLen:SIGIL_IDS.length,
      sigilCards:CARD_IDS.filter(id=>CDEFS[id].sigil).length,
      tplInCodex,unknown,dup,all,cards,cardsLen:CARD_IDS.length,labelAll,hit,etHtml,titleOn,etNone,titleOff,
      badge:typeof byId('s_keen').badge,catOfSigil:byId('s_keen').cat});
  })()`);
  // 1) 分类恢复 8 项，刻印不再单独成类
  assert.deepEqual(out.cats, ['all', 'role', 'res', 'card', 'foe', 'bless', 'legacy', 'term']);
  assert.equal(out.catOfSigil, 'role');
  assert.equal(out.badge, 'function');
  // 2) 18 个标签（16 能力 + 2 归属）、无重复、无死标签
  assert.equal(out.tagIds.length, 18);
  assert.equal(new Set(out.tagIds).size, 18);
  assert.deepEqual(out.deadTag, []);
  // 条目上的标签必须能在字典里查到，且同一标签不重复挂
  assert.deepEqual(out.unknown, []);
  assert.deepEqual(out.dup, []);
  // 归属标签：武器只命中武器；sigil 命中所有可装槽的卡与数值刻印
  assert.equal(out.ownW, out.wLen);
  assert.equal(out.ownS, out.sLen+out.sigilCards);
  // 3) 每张卡牌都挂了 tags；无标签卡牌白名单固化
  assert.equal(out.cover, true);
  assert.deepEqual(out.untagged, ['surge', 'salvage5', 'salvage10', 'salvage20', 'class_mage']);
  // 4) 派生规则：单体优先于范围；元素/法力/范围/状态四条链路
  assert.ok(out.s.arcneedle.includes('single'));
  assert.ok(!out.s.arcneedle.includes('aoe'));
  assert.deepEqual(out.s.kindling, ['fire', 'spell', 'aoe', 'dot', 'sigil']);
  assert.deepEqual(out.s.arcneedle, ['arcane', 'spell', 'single', 'amp', 'sigil']);
  assert.deepEqual(out.s.mine, ['aoe', 'control']);
  assert.deepEqual(out.s.tactic, ['draw']);
  assert.deepEqual(out.s.wall, ['persist', 'guard']);
  // 5) 武器从模板派生并带归属标签、刻印三选一映射 + 归属
  assert.deepEqual(out.s.flame, ['spell', 'fire', 'aoe', 'dot', 'weapon']);
  assert.deepEqual(out.s.sword, ['melee', 'weapon']);
  assert.deepEqual(out.s.keen, ['amp', 'sigil']);
  // 6) 武器攻击模板不进图鉴
  assert.equal(out.tplInCodex, false);
  // 7) 标签只做展示，不再参与筛选：分类与搜索仍是唯二过滤条件
  assert.equal(out.all, 113);
  assert.equal(out.cards, out.cardsLen);
  assert.ok(!out.labelAll.includes('已选'));
  assert.ok(/已记录 \d+\/\d+/.test(out.labelAll));
  assert.ok(out.hit > 0);
  // 8) 详情页标签：有标签才显示小节标题，无标签整块隐藏
  assert.equal((out.etHtml.match(/cxETag/g) || []).length, 5);
  assert.ok(out.etHtml.includes('持续伤害') && out.etHtml.includes('武器'));
  assert.equal(out.titleOn, '');
  assert.equal(out.etNone, '');
  assert.equal(out.titleOff, 'none');
});

testCase('R25_card_fusion_recipe_and_drag', () => {
  const env = makeEnv();
  // 1) 配方表完整性：产物卡存在、标 fuseOut、不进奖励池、不可再熔、查找对称
  const table = j(env)(`(()=>{
    const outs=FUSION_RECIPES.map(r=>r.out);
    const pairs=FUSION_RECIPES.map(r=>{
      const a=r.a||CARD_IDS.find(i=>CDEFS[i].elem===r.ea&&!CDEFS[i].fuseOut);
      const b=r.b||CARD_IDS.find(i=>CDEFS[i].elem===r.eb&&!CDEFS[i].fuseOut);
      return {a,b,ok:fusionOf(a,b)===r.out,back:fusionOf(b,a)===r.out};
    });
    return JSON.stringify({
      n:FUSION_RECIPES.length,
      missing:outs.filter(o=>!CDEFS[o]),
      notFuseOut:outs.filter(o=>!CDEFS[o].fuseOut),
      inPool:outs.filter(o=>poolIds().includes(o)),
      asym:pairs.filter(p=>!p.ok||!p.back).map(p=>p.a+'|'+p.b),
      chain:outs.filter(o=>CARD_IDS.some(i=>fusionOf(o,i)||fusionOf(i,o))),
      q:outs.map(o=>CDEFS[o].q),
      partner:fusionRecipesOf('ward').map(r=>r.name).sort()
    });
  })()`);
  assert.equal(table.n, 6);
  assert.deepEqual(table.missing, []);
  assert.deepEqual(table.notFuseOut, []);
  assert.deepEqual(table.inPool, []);
  assert.deepEqual(table.asym, []);
  assert.deepEqual(table.chain, []);
  assert.deepEqual(table.q, [2, 2, 2, 2, 3, 3]);
  assert.deepEqual(table.partner, ['凝神']);

  // 2) 熔铸执行：扣雾晶、两张源牌按 uid 永久离场、产物进当前手牌、同名牌其他副本不动
  const exec = j(env)(`(()=>{
    initRun();S.mode='play';
    const a=mkCard('ward'),b=mkCard('tactic'),spare=mkCard('tactic');
    DECK.hand=[a,b,spare];res.crys=TUNE.fusion.crys+2;
    const before=res.crys,draw0=DECK.draw.length,disc0=DECK.discard.length;
    const ok=tryFuse(a.uid,b.uid);
    const fused=DECK.hand.filter(c=>c.id==='fuse_focus');
    return JSON.stringify({ok,fee:before-res.crys,feeDef:TUNE.fusion.crys,
      hand:DECK.hand.map(c=>c.id),spareKept:DECK.hand.some(c=>c.uid===spare.uid),
      srcGone:!DECK.hand.some(c=>c.uid===a.uid||c.uid===b.uid),
      pilesSame:DECK.discard.length===disc0&&DECK.draw.length===draw0,
      q:CDEFS[fused[0].id].q,handDirty:S.handDirty});
  })()`);
  assert.equal(exec.ok, true);
  assert.equal(exec.feeDef, 5);
  assert.equal(exec.fee, 5);
  assert.deepEqual(exec.hand, ['tactic', 'fuse_focus']);
  assert.equal(exec.spareKept, true);
  assert.equal(exec.srcGone, true);
  assert.equal(exec.pilesSame, true);
  assert.equal(exec.q, 2);
  assert.equal(exec.handDirty, true);

  // 3) 失败路径一律不改状态：非法配方 / 雾晶不足 / 拖到自己身上
  const bad = j(env)(`(()=>{
    initRun();S.mode='play';
    const a=mkCard('wall'),b=mkCard('wall');DECK.hand=[a,b];res.crys=99;
    const r1=tryFuse(a.uid,b.uid);
    const after1=[DECK.hand.length,res.crys];
    const c=mkCard('ward'),d=mkCard('tactic');DECK.hand=[c,d];res.crys=1;
    const r2=tryFuse(c.uid,d.uid);
    return JSON.stringify({r1,after1,r2,crys:res.crys,hand:DECK.hand.map(x=>x.id),self:tryFuse(c.uid,c.uid)});
  })()`);
  assert.deepEqual(bad, { r1: false, after1: [2, 99], r2: false, crys: 1, hand: ['ward', 'tactic'], self: false });

  // 4) 元素产物：一次施法同时挂两种元素状态（status2 复用 applyElement）
  const dual = j(env)(`(()=>{
    initRun();P.cls=null;P.weapon='sword';P.aff={fire:0,frost:0,arcane:0,lightning:0};
    foes.length=0;
    const f={type:'crawler',x:P.x+1,y:P.y,hp:10000,max:10000,spd:0,dmg:6,r:.32,xp:5,coreDmg:6,
      atkCd:99,retarget:99,target:'core',kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,dead:false,
      burnStacks:0,burnT:0,burnTick:0,chillStacks:0,chillT:0,freezeT:0,markT:0,shockT:0,
      lastElem:null,lastElemT:-99,reactCd:0};
    foes.push(f);rebuildFoeGrid();
    castSpell(CDEFS.fuse_steam,f.x,f.y);
    return JSON.stringify({dmg:10000-f.hp,burn:f.burnStacks,chill:f.chillStacks});
  })()`);
  assert.ok(dual.dmg > 0);
  assert.equal(dual.burn, 2);
  assert.equal(dual.chill, 2);

  // 5) 图鉴：品质行 / 第二状态行 / 第二元素 / 熔铸来源
  const codex = j(env)(`(()=>{
    const row=(id,k)=>{const r=CODEX.find(x=>x.id===id).stats().find(x=>x[0]===k);return r?r[1]:null;};
    return JSON.stringify({q:row('c_fuse_steam','品质'),q3:row('c_fuse_meteor','品质'),
      plain:row('c_wall','品质'),st2:row('c_fuse_steam','附加状态Ⅱ'),
      elem2:row('c_fuse_steam','第二元素'),src:row('c_fuse_steam','熔铸来源'),
      fee:row('c_fuse_steam','熔铸手续费'),srcFocus:row('c_fuse_focus','熔铸来源'),
      noSrc:row('c_wall','熔铸来源')});
  })()`);
  assert.deepEqual(codex, {
    q: '稀有', q3: '史诗', plain: '普通', st2: '冰缓 ×2', elem2: '冰',
    src: '火元素牌 + 冰元素牌', fee: '雾晶 5', srcFocus: '灯焰护盾 + 战术重整', noSrc: null
  });

  // 6) 存档往返：熔铸产物留在手牌时能原样读回
  const round = j(env)(`(()=>{
    initRun();S.mode='play';
    const a=mkCard('rain'),b=mkCard('mine');
    DECK.hand=[a,b];res.crys=10;
    tryFuse(a.uid,b.uid);
    const snap=JSON.parse(JSON.stringify(captureSnapshot()));
    DECK.hand=[];
    restoreSnapshot(snap);
    return JSON.stringify({hand:DECK.hand.map(c=>c.id),uidNum:typeof DECK.hand[0].uid==='number'});
  })()`);
  assert.deepEqual(round, { hand: ['fuse_meteor'], uidNum: true });

  // 7) 卡面：稀有以上出品质角标（渐变底色），普通卡不出
  const face = j(env)(`JSON.stringify({rare:cardInner(CDEFS.fuse_steam,'1'),common:cardInner(CDEFS.wall,'1')})`);
  assert.ok(face.rare.includes('hcQ') && face.rare.includes('稀有'));
  assert.ok(face.rare.includes('linear-gradient'));
  assert.ok(!face.common.includes('hcQ'));
  assert.ok(face.common.includes('木墙'));

  // 8) 卡面短文案：产物卡必须自带 brief，否则卡面退化成被 2 行截断的 desc
  const brief = j(env)(`JSON.stringify(FUSION_RECIPES.map(r=>{
    const d=CDEFS[r.out];
    return {id:r.out,len:(d.brief||'').length,shorter:(d.brief||'').length<d.desc.length};
  }))`);
  assert.deepEqual(brief.filter(b => !b.len).map(b => b.id), []);
  assert.deepEqual(brief.filter(b => !b.shorter).map(b => b.id), []);
});

function main() {
  if (process.env.CAPTURE) {
    console.log(JSON.stringify({ r0: captureBaseline(makeEnv()), saves: captureSaves() }, null, 2));
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
