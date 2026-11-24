'use strict';
/* ==========================================================
   雾海方舟
   资源即费用 / 拖拽或点选落地 / 白红预览 / 黎明抽牌与祝福
========================================================== */
const TAU=Math.PI*2,TW=64,TH=32,GRID=40,CEN=GRID/2,NN=GRID*GRID;
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const irand=(a,b)=>Math.floor(rand(a,b+1));
const dist=(ax,ay,bx,by)=>Math.hypot(bx-ax,by-ay);
const proj=(x,y)=>[(x-y)*TW/2,(x+y)*TH/2];
const unproj=(sx,sy)=>[(sx/(TW/2)+sy/(TH/2))/2,(sy/(TH/2)-sx/(TW/2))/2];
const $=id=>document.getElementById(id);
const isTouch=matchMedia('(pointer:coarse)').matches||('ontouchstart' in window);
const reduceMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
if(isTouch)document.body.classList.add('touch');
let codexOpen=false,codexReturn='menu';

/* ---------------- 存档 ---------------- */
const SAVE_KEY='arkmist_v3';
let save={embers:0,bless:{blade:0,iron:0,stock:0},best:{nights:0,kills:0,wins:0},
  seen:{foe:{},build:{},card:{},play:{}},diff:'std',muted:false};
function persist(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));return true;}
  catch(e){
    if(!persist._warned){
      persist._warned=true;
      if(typeof console!=='undefined'&&console.warn)console.warn('存档写入失败',e);
      if(typeof toast==='function')toast('存档写入失败 · 进度可能未保存','warn');
    }
    return false;
  }
}
function bumpSeen(k,id){if(!save.seen[k])save.seen[k]={};save.seen[k][id]=(save.seen[k][id]||0)+1;}
const DIFFS={
  calm:{name:'平缓',sub:'温柔',hp:.8,dmg:.75,count:.8,ember:.8},
  std:{name:'标准',sub:'试炼',hp:1,dmg:1,count:1,ember:1},
  wild:{name:'狂澜',sub:'怒涛',hp:1.25,dmg:1.3,count:1.25,ember:1.5}
};
const BLESS={
  blade:{name:'锋刃',desc:'每级 +8% 伤害',max:5,costs:[4,7,10,14,18],icon:'sword',color:'#ffb454'},
  iron:{name:'坚韧',desc:'每级 +15 生命',max:5,costs:[4,7,10,14,18],icon:'heart',color:'#ff8a3d'},
  stock:{name:'仓廪',desc:'每级 +20 初始木石',max:3,costs:[5,9,14],icon:'box',color:'#8fe3d0'}
};
// 存档加载必须在 DIFFS / BLESS 定义之后：按白名单逐项校验，非法值回退默认
function loadSave(){
  const s=localStorage.getItem(SAVE_KEY)||localStorage.getItem('arkmist_v2')||localStorage.getItem('arkmist_v1');
  if(!s)return;
  let p;
  try{p=JSON.parse(s);}catch(e){return;}
  if(!p||typeof p!=='object'||Array.isArray(p))return;
  if(Number.isFinite(p.embers)&&p.embers>=0)save.embers=Math.floor(p.embers);
  if(typeof p.muted==='boolean')save.muted=p.muted;
  if(typeof p.diff==='string'&&DIFFS[p.diff])save.diff=p.diff;
  if(p.bless&&typeof p.bless==='object')for(const k in BLESS){
    const v=p.bless[k];
    if(Number.isInteger(v)&&v>=0&&v<=BLESS[k].max)save.bless[k]=v;
  }
  if(p.best&&typeof p.best==='object')for(const k of ['nights','kills','wins']){
    const v=p.best[k];
    if(Number.isInteger(v)&&v>=0)save.best[k]=v;
  }
  if(p.seen&&typeof p.seen==='object')for(const k of ['foe','build','card','play']){
    const src=p.seen[k];if(!src||typeof src!=='object')continue;
    const dst={};
    for(const id in src){const v=src[id];if(Number.isFinite(v)&&v>=0)dst[id]=v;}
    save.seen[k]=dst;
  }
}
loadSave();
const ICONS={
sword:'<path d="M4 20L18 6M18 6l2-2-4 0-2 2M14 4l6 6M6 16l2 2"/>',
heart:'<path d="M12 21C5 15 2 11 2 7.5A4.5 4.5 0 0112 5a4.5 4.5 0 0110 2.5c0 3.5-3 7.5-10 13.5z"/>',
box:'<path d="M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/>',
wind:'<path d="M3 8h11a3 3 0 10-3-3M3 12h15a3 3 0 11-3 3M3 16h8a2.5 2.5 0 11-2.5 2.5"/>',
bolt:'<path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"/>',
reach:'<path d="M4 20L20 4M20 4h-6M20 4v6M8 16l-4 4"/>',
burst:'<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19"/>',
leech:'<path d="M12 3c3 4 6 7 6 11a6 6 0 01-12 0c0-4 3-7 6-11z"/><path d="M9 14a3 3 0 003 3"/>',
shadow:'<path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" opacity=".4"/><path d="M17 5l-7 9h5l-1 5 7-9h-5l1-5z"/>',
thorn:'<path d="M12 22V8M12 8L7 3M12 8l5-5M12 14l-6-3M12 14l6-3M12 19l-5-2M12 19l5-2"/>',
crit:'<path d="M12 2l2.4 6.6L21 9l-5 4.4L17.5 21 12 17l-5.5 4L8 13.4 3 9l6.6-.4L12 2z"/>',
wave:'<path d="M2 12c3-5 6-5 9 0s6 5 9 0M2 17c3-5 6-5 9 0s6 5 9 0"/>',
magnet:'<path d="M6 3v8a6 6 0 0012 0V3M6 3h4v5H6zM14 3h4v5h-4z"/>',
leaf:'<path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16zM4 20C8 14 12 10 18 6"/>',
beacon:'<path d="M12 2v3M9 5h6l1 6H8l1-6zM8 11l-2 10h12l-2-10M5 8L2 6M19 8l3-2M12 14v3"/>',
wick:'<path d="M12 2c1 4-4 6-4 11a4 4 0 008 0c0-2-1-3-1-5 2 1 4 3 4 6a7 7 0 01-14 0C5 8 11 6 12 2z"/>',
wall:'<path d="M3 10l9-5 9 5v6l-9 5-9-5v-6z"/><path d="M7 8v8M12 5.5V21M17 8v8" opacity=".6"/>',
tower:'<path d="M8 21V9l4-6 4 6v12M6 21h12M8 12h8"/><path d="M10 16h4v5h-4z"/>',
totem:'<path d="M12 21v-9M8 21h8M12 12c-3 0-4-3-4-5 2 0 3 1 4 2 1-1 2-2 4-2 0 2-1 5-4 5z"/><circle cx="12" cy="5" r="1.5"/>',
cannon:'<circle cx="12" cy="14" r="5"/><path d="M12 9V3M9 4l3-1 3 1M7 21h10M12 14l4-4"/>',
wood:'<path d="M4 14l8-9 8 9M7 14h10v6H7zM12 5v4"/>',
stone:'<path d="M7 4h8l5 6-3 10H7L4 10l3-6zM7 4l3 6h7M4 10h6l-3 10"/>',
crys:'<path d="M12 2l5 7-5 13-5-13 5-7zM7 9h10M12 2v20"/>',
rain:'<path d="M5 4h14M7 8l-2 6M12 8l-2 8M17 8l-2 6M4 20h16"/>',
mine:'<circle cx="12" cy="14" r="6"/><path d="M12 8V3M9 4l3-1 3 1M12 14l3-3"/>',
heal:'<path d="M12 21C6 16 3 12 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.5C21 12 18 16 12 21z"/><path d="M12 9v6M9 12h6"/>',
mend:'<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.7 2.7-3-3 2.7-2.7z"/>',
ward:'<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/>',
tactic:'<rect x="3" y="5" width="10" height="14" rx="2"/><path d="M8 9h13v10H8"/><path d="M13 3l3 2-3 2"/>',
surge:'<path d="M13 2L5 13h6l-2 9 10-12h-6l2-8z"/>',
expand:'<rect x="3" y="6" width="12" height="13" rx="2"/><path d="M17 8h4v11h-4M18 3v4M16 5h4"/>',
salvage:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
spkOn:'<path d="M4 9v6h4l6 5V4L8 9H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
spkOff:'<path d="M4 9v6h4l6 5V4L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
moon:'<path d="M20 14A8.5 8.5 0 019.5 3.5 8.5 8.5 0 1020 14z"/>',
lantern:'<path d="M9 3h6M12 3v2M7 7h10l1 9a6 6 0 01-12 0l1-9zM12 10v5M9 21h6"/>',
crawler:'<ellipse cx="12" cy="14" rx="7" ry="5.5"/><path d="M5 18l-2 3M19 18l2 3M8 19l-1 3M16 19l1 3"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
spitter:'<circle cx="12" cy="9" r="5"/><circle cx="12" cy="9" r="1.6"/><path d="M8 14c0 3-1 4-2 6M12 14v6M16 14c0 3 1 4 2 6"/>',
brute:'<path d="M5 21c-1-8 1-12 7-12s8 4 7 12z"/><path d="M8 9L5 3l5 4M16 9l3-6-5 4"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
boss:'<path d="M3 21c-1-10 2-15 9-15s10 5 9 15z"/><path d="M6 7L5 2l3 4M12 6V1M18 7l1-5-3 4"/><circle cx="8" cy="12" r="1.2"/><circle cx="12" cy="14" r="1.2"/><circle cx="16" cy="12" r="1.2"/>',
core:'<path d="M12 2v4M9 6h6l1 5H8l1-5zM8 11l-3 10h14l-3-10M4 21h16"/><circle cx="12" cy="8.5" r="1.4"/>',
ember:'<path d="M12 2c1 4-4 6-4 11a4 4 0 008 0c0-2-1-3-1-5 2 1 4 3 4 6a7 7 0 01-14 0C5 8 11 6 12 2z"/>',
fog:'<path d="M3 9h12M6 13h15M4 17h11M9 5h9"/>',
book:'<path d="M4 4.5A2.5 2.5 0 016.5 2H20v16H6.5A2.5 2.5 0 004 20.5V4.5zM9 7h7M9 11h5"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
skull:'<path d="M5 11a7 7 0 1114 0v4l-2 1v3H7v-3l-2-1v-4z"/><circle cx="9.5" cy="11" r="1.4"/><circle cx="14.5" cy="11" r="1.4"/>',
shield:'<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"/>',
map:'<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15"/>',
cards:'<rect x="3" y="6" width="11" height="14" rx="2"/><path d="M8 4h11v14"/>'
};
const svg=(n,sz=24,col='currentColor')=>`<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||''}</svg>`;

