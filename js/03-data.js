'use strict';
/* ---------------- 建筑 & 敌人定义 ---------------- */
const BUILDS={
  wall:{name:'木墙',hp:130,r:.46},
  tower:{name:'箭塔',hp:95,r:.42,range:5.6,dmg:9,rate:.85},
  totem:{name:'愈灵图腾',hp:75,r:.36,range:3.2},
  cannon:{name:'雾晶炮',hp:115,r:.46,range:6.6,dmg:26,rate:2.4}
};
const FOES={
  crawler:{hp:26,spd:2.3,dmg:6,r:.32,xp:5,coreDmg:6},
  spitter:{hp:22,spd:1.8,dmg:8,r:.3,xp:7,coreDmg:8},
  brute:{hp:95,spd:1.25,dmg:16,r:.5,xp:12,coreDmg:18},
  boss:{hp:900,spd:1.05,dmg:26,r:.85,xp:60,coreDmg:40}
};

/* ---------------- 卡牌定义 ---------------- */
const KINDNAME={build:'构筑',instant:'瞬发',utility:'功能'};
const CDEFS={
  wall:{id:'wall',kind:'build',build:'wall',name:'木墙',icon:'wall',color:'#e0b070',cost:{wood:8},
    desc:'筑起木墙阻挡雾裔。打出后卡牌回到弃牌堆，可再次抽到。',w:26},
  tower:{id:'tower',kind:'build',build:'tower',name:'箭塔',icon:'tower',color:'#8fe3d0',cost:{wood:12,stone:6},
    desc:'自动射击 5.6 格内最近雾裔，每 0.85 秒 9 点伤害。',w:24},
  totem:{id:'totem',kind:'build',build:'totem',name:'愈灵图腾',icon:'totem',color:'#6fe08a',cost:{wood:10,crys:4},
    desc:'每秒为 3.2 格内的守灯人恢复 4 点生命。',w:16},
  cannon:{id:'cannon',kind:'build',build:'cannon',name:'雾晶炮',icon:'cannon',color:'#57e6ff',cost:{stone:10,crys:10},
    desc:'重炮溅射 1.5 格，26 点伤害，专治成群爬行者。',w:14},
  rain:{id:'rain',kind:'instant',target:'point',name:'箭雨',icon:'rain',color:'#ffd166',cost:{wood:6,stone:4},
    radius:2.2,dmg:45,desc:'指定区域落下箭雨，2.2 格内 45 点伤害。夜晚可用。',w:15},
  mine:{id:'mine',kind:'instant',target:'point',name:'雾晶雷',icon:'mine',color:'#57e6ff',cost:{crys:6},
    radius:2.6,dmg:70,desc:'指定区域引爆雾晶，70 点伤害并强力击退。夜晚可用。',w:13},
  spring:{id:'spring',kind:'instant',target:'self',name:'愈灵之泉',icon:'heal',color:'#6fe08a',cost:{wood:6,crys:2},
    desc:'立刻恢复 45 点生命。夜晚可用。',w:15},
  mend:{id:'mend',kind:'instant',target:'self',name:'修补术',icon:'mend',color:'#ffb454',cost:{wood:8,stone:5},
    desc:'方舟核心 +90，全部建筑 +40 耐久。夜晚可用。',w:13},
  ward:{id:'ward',kind:'instant',target:'self',name:'灯焰护盾',icon:'ward',color:'#8fe3d0',cost:{crys:5},
    desc:'获得 4 秒无敌，穿过雾弹与包围。夜晚可用。',w:11},
  tactic:{id:'tactic',kind:'instant',target:'self',name:'战术重整',icon:'tactic',color:'#c9a8ff',cost:{wood:4},
    desc:'立刻抽 2 张牌。循环牌库的关键。',w:14},
  surge:{id:'surge',kind:'instant',target:'self',name:'雾能充盈',icon:'surge',color:'#57e6ff',cost:{crys:3},
    desc:'雾能立即回满，冲刺冷却清零。',w:9},
  expand:{id:'expand',kind:'utility',target:'self',name:'扩容',icon:'expand',color:'#ffb454',cost:{wood:10,stone:6},
    desc:'手牌上限 +1（最高 10），并立即抽 1 张。满上限后不再出现。',w:11},
  salvage5:{id:'salvage5',kind:'utility',target:'pick',name:'拆解·微光',icon:'salvage',color:'#6fe08a',cost:{},tier:5,
    desc:'回收率 +5%，移除一张牌并按回收率返还其造价（取整）。',w:11},
  salvage10:{id:'salvage10',kind:'utility',target:'pick',name:'拆解·熔解',icon:'salvage',color:'#8fe3d0',cost:{},tier:10,
    desc:'回收率 +10%，移除一张牌并按回收率返还其造价（取整）。',w:8},
  salvage20:{id:'salvage20',kind:'utility',target:'pick',name:'拆解·归墟',icon:'salvage',color:'#57e6ff',cost:{},tier:20,
    desc:'回收率 +20%，移除一张牌并按回收率返还其造价（取整）。',w:5}
};
const CIDS=Object.keys(CDEFS);
const RESNAME={wood:'木',stone:'石',crys:'晶'};
const RESCOL={wood:'#e0b070',stone:'#b9c4c9',crys:'#57e6ff'};
const costStr=c=>{const k=Object.keys(c);return k.length?k.map(r=>c[r]+RESNAME[r]).join(' '):'免费';};

/* ---------------- 祝福 ---------------- */
const BLESSINGS=[
  {id:'blade',n:'雾刃',rar:'c',icon:'sword',d:'伤害 +25%',f:()=>P.dmg*=1.25},
  {id:'swift',n:'疾风',rar:'c',icon:'wind',d:'移速 +12%',f:()=>P.spd*=1.12},
  {id:'rapid',n:'迅击',rar:'c',icon:'bolt',d:'攻速 +18%',f:()=>P.atkSpd*=1.18},
  {id:'reach',n:'长锋',rar:'c',icon:'reach',d:'攻击范围 +18%',f:()=>P.range*=1.18},
  {id:'heart',n:'灯芯',rar:'c',icon:'heart',d:'生命上限 +25 并回满',f:()=>{P.maxHp+=25;P.hp=P.maxHp;}},
  {id:'magnet',n:'磁石',rar:'c',icon:'magnet',d:'拾取范围 +70%',f:()=>P.magnet*=1.7},
  {id:'harvest',n:'苦修',rar:'c',icon:'leaf',d:'采集 +50%',f:()=>P.gather*=1.5},
  {id:'wick',n:'燃灯',rar:'c',icon:'wick',d:'雾能回复 +50%',f:()=>P.regen*=1.5},
  {id:'leech',n:'回魂',rar:'r',icon:'leech',d:'击杀回 3 生命',f:()=>P.ls+=3},
  {id:'nova',n:'雾爆强化',rar:'r',icon:'burst',d:'雾爆伤害 +40% 半径 +12%',f:()=>P.novaMult*=1.4},
  {id:'shadow',n:'迅影',rar:'r',icon:'shadow',d:'冲刺冷却 −25%',f:()=>P.dashCdMax*=.75},
  {id:'thorn',n:'荆棘',rar:'r',icon:'thorn',d:'受击反伤 8',f:()=>P.thorns+=8},
  {id:'crit',n:'会心',rar:'r',icon:'crit',max:4,d:'15% 双倍伤害',f:()=>P.crit=Math.min(.6,P.crit+.15)},
  {id:'wave',n:'双弦',rar:'e',icon:'wave',max:2,d:'挥刃附带穿透剑气',f:()=>P.wave++},
  {id:'beacon',n:'灯塔共鸣',rar:'e',icon:'beacon',d:'建筑伤害 +25% 并修复 30',f:()=>{P.towerMult*=1.25;builds.forEach(b=>b.hp=Math.min(b.max,b.hp+30));rebuildTileCost();fieldDirty=true;}},
  {id:'draw',n:'晨读',rar:'e',icon:'cards',max:3,d:'每次黎明额外抽 1 张',f:()=>P.bonusDraw++}
];
const RARNAME={c:'普通',r:'稀有',e:'传说'},RARCOL={c:'#57e6ff',r:'#c9a8ff',e:'#ffb454'};

