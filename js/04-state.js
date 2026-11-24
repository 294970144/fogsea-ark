'use strict';
/* ---------------- 状态 ---------------- */
const P={},res={wood:0,stone:0,crys:0};
const DECK={draw:[],hand:[],discard:[],max:5,recycle:0,uid:1};
const S={mode:'menu',phase:'day',day:1,timeLeft:70,toSpawn:0,nightTotal:0,nightKilled:0,spawnT:0,
  speed:1,hitstop:0,launchT:0,overT:0,win:false,nightAmt:0,stats:null,hints:{},elapsed:0,
  aimUid:null,dragUid:null,dragMoved:false,dragStart:[0,0],dragPointerId:null,
  endless:false,endlessBase:null,settled:null,handDirty:true,dawnStep:0,dawnCards:[],dawnBless:[],
  pendingSalvage:null,bonusDrawPending:0};
const DAY_LEN=70,MAX_NIGHT=7,HAND_CAP=10,REC_CAP=80,FOE_CAP=44;
/* 个人测试作弊码（仅个人测试用，不在页面呈现任何入口或文案）
   暂停时键入 l3131 切换：雾爆伤害 ×10（提升至 1000%）、范围 ×10（提升 1000%）。 */
const CHEAT={code:'l3131',buf:'',on:false,dmg:10,rad:10};
const novaDmgValue=()=>30*P.novaMult*(CHEAT.on?CHEAT.dmg:1);
const novaRadius=()=>3.1*(1+.12*(P.stacks.nova||0))*(CHEAT.on?CHEAT.rad:1);
// 无尽段难度渐近封顶；day<=MAX_NIGHT 时必须与原公式逐值恒等
const effDay=day=>day<=MAX_NIGHT?day:MAX_NIGHT+5*(1-Math.exp(-(day-MAX_NIGHT)/14));
const dayScale=day=>1+.13*(effDay(day)-1);

function resetPlayer(){
  const b=save.bless;
  Object.assign(P,{x:CEN+2.2,y:CEN+.5,hp:100+15*b.iron,maxHp:100+15*b.iron,en:100,maxEn:100,
    lvl:1,xp:0,next:24,dmg:12*(1+.08*b.blade),atkCd:0,atkSpd:1,range:1.75,spd:4.3,face:0,moving:false,
    dashT:0,dashCd:0,dashCdMax:1.6,dashDx:0,dashDy:0,ifr:0,downed:false,respT:0,
    crit:0,ls:0,thorns:0,wave:0,magnet:2.3,gather:1,towerMult:1,novaMult:1,regen:1,bonusDraw:0,
    stacks:{},anim:0,hurtT:0,swingT:0});
}
function initRun(){
  genWorld();
  builds=[];foes=[];shots=[];picks=[];parts=[];floats=[];slashes=[];ghosts=[];warns=[];
  core.hp=core.max=600;core.flash=0;core.beam=0;
  resetPlayer();
  res.wood=24+20*save.bless.stock;res.stone=14+20*save.bless.stock;res.crys=4;
  Object.assign(S,{phase:'day',day:1,timeLeft:DAY_LEN,toSpawn:0,nightTotal:0,nightKilled:0,spawnT:0,
    hitstop:0,launchT:0,overT:0,win:false,nightAmt:0,elapsed:0,hints:{},aimUid:null,dragUid:null,
    dragMoved:false,dragStart:[0,0],dragPointerId:null,endless:false,endlessBase:null,settled:null,
    handDirty:true,dawnStep:0,pendingSalvage:null,
    stats:{kills:0,gathered:0,dmg:0,nights:0,level:1,played:0}});
  DECK.draw=[];DECK.hand=[];DECK.discard=[];DECK.max=5;DECK.recycle=0;DECK.uid=1;
  const starter=['wall','wall','wall','tower','tower','totem','rain','spring','tactic'];
  starter.forEach(id=>DECK.draw.push(mkCard(id)));
  shuffle(DECK.draw);
  // 开局保底：手中必有木墙与箭塔
  const take=id=>{const i=DECK.draw.findIndex(c=>c.id===id);if(i>=0)DECK.hand.push(DECK.draw.splice(i,1)[0]);};
  take('wall');take('tower');
  while(DECK.hand.length<DECK.max&&DECK.draw.length)DECK.hand.push(DECK.draw.pop());
  cam.x=P.x;cam.y=P.y;cam.shake=0;
  UI.toasts.innerHTML='';
  auPhase(false);refreshRes();renderHand();
  rebuildSolids();rebuildTileCost();fieldDirty=true;
}
function mkCard(id){return {uid:DECK.uid++,id};}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=irand(0,i);const t=a[i];a[i]=a[j];a[j]=t;}}
function drawOne(cap){
  if(DECK.hand.length>=(cap===undefined?DECK.max:cap))return false;
  if(!DECK.draw.length){
    if(!DECK.discard.length)return false;
    DECK.draw=DECK.discard;DECK.discard=[];shuffle(DECK.draw);
  }
  DECK.hand.push(DECK.draw.pop());S.handDirty=true;return true;
}
function drawToFull(){let n=0;while(DECK.hand.length<DECK.max&&drawOne())n++;if(n)sfx('draw');return n;}
function drawN(n,cap){let c=0;for(let i=0;i<n;i++){if(drawOne(cap))c++;else break;}if(c)sfx('draw');return c;}
function afford(def){for(const k in def.cost)if(res[k]<def.cost[k])return false;return true;}
function payCost(def){for(const k in def.cost)res[k]-=def.cost[k];refreshRes();}
function cardTotal(id){
  let n=0;
  for(const p of [DECK.draw,DECK.hand,DECK.discard])for(const c of p)if(c.id===id)n++;
  return n;
}
function purgeCard(id){
  for(const p of [DECK.draw,DECK.hand,DECK.discard])
    for(let i=p.length-1;i>=0;i--)if(p[i].id===id)p.splice(i,1);
  if(S.aimUid&&!DECK.hand.some(c=>c.uid===S.aimUid))S.aimUid=null;
  S.handDirty=true;
}
function poolIds(){
  return CIDS.filter(id=>{
    if(id==='expand'&&DECK.max>=HAND_CAP)return false;
    if(CDEFS[id].tier&&DECK.recycle>=REC_CAP)return false;
    return true;
  });
}
function rollRewards(n){
  const ids=poolIds(),bag=[];
  ids.forEach(id=>{
    let w=CDEFS[id].w;
    if(S.day>=3&&(id==='cannon'||id==='mine'))w+=6;
    if(S.day>=4&&id==='salvage20')w+=3;
    for(let i=0;i<w;i++)bag.push(id);
  });
  const out=[];let guard=0;
  while(out.length<Math.min(n,ids.length)&&bag.length&&guard++<500){
    const id=bag[irand(0,bag.length-1)];
    if(!out.includes(id))out.push(id);
  }
  return out;
}

