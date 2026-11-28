'use strict';
/* ---------------- 战斗 ---------------- */
function weaponAttackRange(w=weaponDef(P.weapon)){
  return w.attack==='spell'?TUNE.spell.range*(P.range/TUNE.player.baseRange):P.range;
}
function cardCastDelay(def){ return ((def&&def.castDelay)||0)/P.atkSpd; }
function weaponShowDefs(w=weaponDef(P.weapon)){
  if(w.attack!=='spell')return [];
  return P.weapon===w.id?weaponSpells(w):(w.startSigils||[]).map(id=>CDEFS[id]).filter(Boolean);
}
function roundCastDelay(w=weaponDef(P.weapon)){
  let s=0;for(const d of weaponShowDefs(w))s+=cardCastDelay(d);return s;
}
function weaponCastDelay(w=weaponDef(P.weapon)){
  const defs=weaponShowDefs(w);return defs.length?roundCastDelay(w)/defs.length:0;
}
/* 迅捷只压充能：整轮缩短 1/spd，缺口从 recharge 扣，不动施放延迟。 */
function weaponRechargeTime(w=weaponDef(P.weapon),casts=1){
  const rc=(w.recharge||0)/P.atkSpd;
  const spd=sigilMods().spd;
  if(!(spd>1)||rc<=0)return rc;
  const cycle=rc+roundCastDelay(w);
  return Math.max(0,rc-cycle*(1-1/spd));
}
function weaponCastCost(w,cast){
  return cardCastDelay(cast.def)+(cast.last?weaponRechargeTime(w,cast.n):0);
}
/* 原生散布：每次施放在瞄准角上抖动 ±TUNE.weapon.spread 度，避免连发弹道完全重合。
   走独立随机流，不消耗 Math.random——否则会连带位移刷怪与掉落的随机序列。 */
let spreadSeed=0x2f6e2b1;
function weaponSpreadOffset(){
  spreadSeed^=spreadSeed<<13;spreadSeed>>>=0;
  spreadSeed^=spreadSeed>>>17;
  spreadSeed^=spreadSeed<<5;spreadSeed>>>=0;
  return (spreadSeed/4294967296*2-1)*TUNE.weapon.spread*Math.PI/180;
}
/* 雾能开销：基础攻击法术（sig_flame 等）不计费，槽内每一张刻印按 SIGILS.mana 累加，
   每次施放扣一次。剑没有槽内序列，但装在剑上的刻印同样计费。 */
function weaponManaCost(){
  let n=0;
  for(const c of P.sigils||[]){const s=c&&SIGILS[c.id];if(s)n+=s.mana||0;}
  return n;
}
function payWeaponMana(){
  const cost=weaponManaCost();
  if(!(cost>0))return true;
  if(P.en<cost)return false;
  P.en-=cost;return true;
}
/* 记冷却并标记本段是轮内施放延迟还是整轮充能，HUD 进度条只读这两个值。 */
function setWeaponCd(w,cast){
  P.atkCd=weaponCastCost(w,cast);
  P.atkCdMax=Math.max(.001,P.atkCd);
  P.reload=!!cast.last;
}
/* 平均每发时间：调参与回归读数用，图鉴展示走 weaponTimingStats。 */
function weaponAttackInterval(w=weaponDef(P.weapon)){
  if(w.attack!=='spell')return weaponRechargeTime(w,1);
  const n=Math.max(1,weaponSpells(w).length);
  return (roundCastDelay(w)+weaponRechargeTime(w,n))/n;
}
function weaponTimingStats(w=weaponDef(P.weapon)){
  const mana=P.weapon===w.id?weaponManaCost():0;
  let rows;
  if(w.attack!=='spell')rows=[['攻击间隔',weaponRechargeTime(w,1).toFixed(2)+' 秒']];
  else{
    const defs=weaponShowDefs(w),n=Math.max(1,defs.length),sum=roundCastDelay(w);
    rows=[['施放延迟',(sum/n).toFixed(2)+' 秒'],
      ['充能',((w.recharge||0)/P.atkSpd).toFixed(2)+' 秒'],
      ['平均每发',((sum+weaponRechargeTime(w,n))/n).toFixed(2)+' 秒']];
  }
  if(mana>0)rows.push(['每发雾能',mana+' 点']);
  return rows;
}
function sigilMods(){
  const m={dmg:1,spd:1,echo:0};
  for(const c of P.sigils||[]){
    const s=SIGILS[c&&c.id];if(!s)continue;
    if(s.dmg!=null)m.dmg*=1+s.dmg;
    if(s.spd!=null)m.spd*=1+s.spd;
    if(s.echo!=null)m.echo=Math.min(.75,m.echo+s.echo);
  }
  return m;
}
/* 功能类刻印只作用于它左边最近的那一张法术：从 slot+1 向右扫，空槽跳过、
   纯数值刻印跳过，遇到法术即停。扫到的刻印按先后收集成链，逐个作用到同一个
   法术上——后一张在前一张算完的结果上继续算，不是各算一遍再合并。 */
function sigilChain(slot){
  const out=[],g=P.sigils||[];
  for(let i=(slot|0)+1;i<g.length;i++){
    const c=g[i];if(!c)continue;
    const s=SIGILS[c.id];
    if(s){if(s.op)out.push(s);continue;}  // 真刻印：有 op 入链，数值刻印跳过但不截断
    const sop=SPELL_SIGIL_OPS[c.id];
    if(sop){out.push({op:sop,id:c.id});continue;} // 可当刻印的法术（如余烬爆发）：入链
    break;                             // 普通法术：链到此为止
  }
  return out;
}
/* 功能刻印算子：吃当前弹道组，就地改完返回。
   新增一种功能刻印 = SIGILS 加一行带 op 的数据 + 这里加一个同名算子，别处不用改。 */
const SIGIL_OPS={
  /* 分裂：当前每一发都绕自己的方向摊成 n 发（整段张开 spread 度），
     这一步的总伤害 = 原来的 (1+(n-1)·dmgB) 倍，平均分给分裂后的每一发。 */
  fan:(st,s)=>{
    const n=Math.max(1,s.copies|0),k=s.dmgB==null?1:s.dmgB;
    const gap=(s.spread||0)*Math.PI/180,mid=(n-1)/2,gain=(1+(n-1)*k)/n;
    const out=[];
    for(const p of st.shots)
      for(let i=0;i<n;i++)out.push({off:p.off+(i-mid)*gap,mul:p.mul*gain});
    st.shots=out;
    return st;
  },
  /* 补发：同一发沿时间轴再打 n-1 次，每次 ×dmgB。 */
  repeat:(st,s)=>{
    const n=Math.max(1,s.copies|0),k=s.dmgB==null?1:s.dmgB;
    st.rep.n+=n-1;st.rep.mul*=k;
    return st;
  },
  /* 余烬爆发：给左侧法术的每一次命中附加范围火伤+灼烧，数值走 CDEFS.sp_emberburst。 */
  ember:(st)=>{st.ember=true;return st;},
  /* 汲能刻印：给左侧法术的每一次施放附加回能，数值走 CDEFS.siphon。纯修饰，不产生弹道。
     可叠装：多枚刻印沿链累加，施放一次合并回一次。 */
  siphon:(st,s)=>{
    const d=CDEFS[s.id];st.manaGain=(st.manaGain||0)+(d&&d.sigilGain||0);
    return st;
  }
};
/* 把一串功能刻印从左到右折进初始状态：
   shots = 每发的偏角与伤害系数；rep = 错峰补发次数与系数。 */
function foldCast(chain){
  const st={shots:[{off:0,mul:1}],rep:{n:1,mul:1},ember:false,manaGain:0};
  for(const s of chain){const op=SIGIL_OPS[s.op];if(op)op(st,s);}
  st.shots.sort((a,b)=>a.off-b.off);   // 统一按角度从右到左出膛，读数与画面稳定
  return st;
}
/* 法术槽：这一发的法术 + 它右侧的刻印链 */
function castPlan(slot){return foldCast(sigilChain(slot));}
/* 剑没有槽内序列：全部功能刻印按槽位顺序折进同一次挥砍 */
function swordPlan(){
  const ch=[];
  for(const c of P.sigils||[]){const s=SIGILS[c&&c.id];if(s&&s.op)ch.push(s);}
  return foldCast(ch);
}
/* 非乱序法杖严格从左到右施放；空槽与纯数值刻印跳过，槽位变化不会让序列错位。 */
function weaponCastSlots(w=weaponDef(P.weapon)){
  const out=[];
  if(w.attack!=='spell')return out;
  const N=w.slots||0;
  for(let i=0;i<N;i++){
    const d=CDEFS[P.sigils&&P.sigils[i]&&P.sigils[i].id];
    if(!d||!d.sigil||d.sigilOnly||d.weaponAttack)continue;
    // 可当功能刻印的法术（如余烬爆发）装槽时只修饰左侧法术，不自己射击；
    // 它作为主动法术的用法走手牌那条路，与武器槽无关。
    if(SPELL_SIGIL_OPS[d.id])continue;
    out.push(i);
  }
  return out;
}
function weaponSpells(w=weaponDef(P.weapon)){
  return weaponCastSlots(w).map(i=>CDEFS[P.sigils[i].id]);
}
/* 取本轮下一发：游标记绝对槽位下标；last 表示整轮最后一发，打完进入充能。 */
function nextWeaponCast(){
  const w=weaponDef(P.weapon),idx=weaponCastSlots(w);
  if(!idx.length)return null;
  const N=w.slots||0;
  let cur=P.sigCast|0;
  if(!(cur>=0&&cur<N))cur=0;
  let k=idx.find(i=>i>=cur);
  if(k===undefined)k=idx[0];
  P.sigCast=(k+1)%N;
  return {def:CDEFS[P.sigils[k].id],slot:k,last:k===idx[idx.length-1],n:idx.length};
}
function nextWeaponSpell(){
  const c=nextWeaponCast();
  return c?c.def:null;
}
let sigilEchoing=false;
function sigilEcho(w,tgt,cast){
  if(sigilEchoing)return;
  const m=sigilMods();
  if(m.echo<=0||Math.random()>=m.echo)return;
  sigilEchoing=true;
  const echo={def:cast&&cast.def,slot:cast&&cast.slot!=null?cast.slot:-1,last:true,n:1};
  try{
    const near=targetLive(tgt)?tgt:nearestTarget(w);
    if(!near)return;
    if(w.attack==='spell')autoCastWeapon(w,near,echo,{echo:true});
    else swing(Math.atan2(near.y-P.y,near.x-P.x),{echo:true});
  }finally{sigilEchoing=false;}
}
function autoAttack(){
  if(P.downed||P.atkCd>0)return;
  const w=weaponDef(P.weapon),tgt=nearestTarget(w);
  if(!tgt)return;
  const ang=Math.atan2(tgt.y-P.y,tgt.x-P.x);
  if(w.attack==='melee'){swing(ang);return;}
  const prev=P.sigCast,cast=nextWeaponCast();if(!cast)return;
  if(!autoCastWeapon(w,tgt,cast))P.sigCast=prev;   // 雾能不足：游标退回，下帧重试
}
/* 二重补发的错峰队列：瞬态，不入存档；原目标已倒下就换最近的，换不到就丢弃这一发。 */
const weaponRepeats=[];
function updateWeaponRepeats(){
  if(!weaponRepeats.length)return;
  for(let i=weaponRepeats.length-1;i>=0;i--){
    const r=weaponRepeats[i];
    if(r.at>S.combatT)continue;
    weaponRepeats.splice(i,1);
    const tgt=targetLive(r.tgt)?r.tgt:nearestTarget(r.w);
    if(tgt)fireWeaponCast(r.w,tgt,r.cast,r.mul);
  }
}
function autoCastWeapon(w,tgt,cast,opts){
  cast=cast||nextWeaponCast();if(!cast)return false;
  const echo=!!(opts&&opts.echo);
  if(!echo&&!payWeaponMana())return false;   // 雾能不足：这一发不打，冷却也不推进
  P.face=Math.atan2(tgt.y-P.y,tgt.x-P.x);
  const pl=castPlan(cast.slot);
  // 汲能刻印：施放成功即按链回能（含回响这一发），与弹道命中无关。
  // 不进 weaponManaCost，所以自身不耗雾能；二重补发不重复回。
  if(pl.manaGain>0)gainMana(pl.manaGain);
  if(echo){fireWeaponCast(w,tgt,cast,1);return true;}
  setWeaponCd(w,cast);
  fireWeaponCast(w,tgt,cast,1);
  // 二重：只把刚施放的这个法术错峰再打一遍，不跨槽取下一个法术
  const rp=pl.rep;
  if(rp.n>1)for(let i=1;i<rp.n;i++)
    weaponRepeats.push({w,cast,tgt,mul:rp.mul,at:S.combatT+(TUNE.weapon.repeatDelay||0)*i});
  sigilEcho(w,tgt,cast);
  return true;
}
/* ---- 可攻击目标（统一层）----
   敌人、资源节点以及今后任何能被打的东西，都靠下面三个函数接入武器攻击。
   新增目标类型只需登记到 attackables()，自动索敌/索敌落点/弹道碰撞/命中结算全部生效，
   施放链与刻印不必知道目标是什么。alive 用 dead/alive 双语义兼容两类对象。 */
function isNode(t){return t.alive!==undefined;}
function targetLive(t){return !!t&&!t.dead&&t.alive!==false;}
function hitRadius(t){return isNode(t)?.4:(t.r||.3);}
function attackables(){
  const out=[];
  for(const f of foes)if(!f.dead)out.push(f);
  for(const n of nodes)if(n.alive)out.push(n);
  return out;
}
/* 自动索敌：射程内敌人优先，没有敌人才选节点——这是玩法约定，
   与"所有目标共用施放链"无关。两类目标都从这一个函数出去。 */
function nearestTarget(w){
  const range=weaponAttackRange(w);let best=null,bd=1e9;
  for(const f of foes){
    if(f.dead)continue;
    const d=dist(P.x,P.y,f.x,f.y)-hitRadius(f);
    if(d<=range&&d<bd){bd=d;best=f;}
  }
  if(best)return best;
  for(const n of nodes){
    if(!n.alive)continue;
    const d=dist(P.x,P.y,n.x,n.y)-hitRadius(n);
    if(d<=range&&d<bd){bd=d;best=n;}
  }
  return best;
}
/* 落点命中：每发弹道到达时对落点附近的所有目标结算，范围看法术自身的 shape/radius。
   single 只打落点最近的那个，其余按 radius 覆盖全体——这是法术语义，与目标类型无关。 */
/* 余烬爆发附加效果：在命中点按 CDEFS.sp_emberburst 的现卡值造成范围火伤+灼烧。
   独立于本发法术的 k（分叉系数），避免与分裂倍率重复；只作用于敌人，不采集节点。 */
function applyEmberAt(x,y){
  const e=CDEFS.sp_emberburst;
  if(!e)return;
  const R=e.radius||2.2,dmg=(e.dmg||0)*(P.dmg/TUNE.player.baseDmg)*TUNE.dmgMul.spell;
  const foes=attackables().filter(t=>!isNode(t)&&!t.dead&&dist(x,y,t.x,t.y)<=R+hitRadius(t));
  for(const f of foes){
    const crit=Math.random()<P.crit,dd=crit?dmg*2:dmg;
    if(dd>0)damageFoe(f,dd,Math.atan2(f.y-P.y,f.x-P.x),crit,{noKnock:true});
    if(e.status&&!f.dead)applyElement(f,e.elem,e.status.n,e.status.kind);
  }
  FX.spell(e,x,y,e.elem,foes,null);
}
function weaponHitAt(def,x,y,k,node,ember){
  const single=def.shape==='single',R=def.radius||.6,foesHit=[];
  // 敌人按法术形状覆盖（single 只取最近一个），火焰蔓延以命中的敌人为种子
  const targets=attackables().filter(t=>!isNode(t)&&dist(x,y,t.x,t.y)<=R+hitRadius(t));
  if(single&&targets.length){
    let best=targets[0],bd=dist(x,y,best.x,best.y);
    for(const t of targets){const d=dist(x,y,t.x,t.y);if(d<bd){bd=d;best=t;}}
    targets.length=0;targets.push(best);
  }
  for(const t of targets){
    let dmg=(def.dmg||0)*(P.dmg/TUNE.player.baseDmg)*TUNE.dmgMul.spell*sigilMods().dmg*k;
    const crit=Math.random()<P.crit;if(crit)dmg*=2;
    if(dmg>0)damageFoe(t,dmg,Math.atan2(t.y-P.y,t.x-P.x),crit,{noKnock:true});
    if(def.status&&!t.dead)applyElement(t,def.elem,def.status.n,def.status.kind);
    foesHit.push(t);
  }
  // 资源节点只采发射时锁定的那一处；树已倒下即打空，不溅射到邻近节点
  if(node&&node.alive){
    if(def.spreadFire&&node.type==='tree')spreadFire(x,y,def.radius,[]);
    hitNode(node);
  }
  const hits=foesHit.concat(node&&node.alive?[node]:[]);
  if(def.spreadFire&&foesHit.length)spreadFire(x,y,def.radius,foesHit);
  if(ember&&hits.length)applyEmberAt(x,y);   // 余烬爆发刻印：命中后在落点附加范围火伤+灼烧
  if(hits.length)S.hitstop=Math.max(S.hitstop,.02);
  return hits;
}
/* 单次法术出手：按施放链算出的弹道组逐发打出，每发各自走弹道与落点结算。 */
function fireWeaponCast(w,tgt,cast,mul){
  const def=cast.def,pl=castPlan(cast.slot);
  const base=Math.atan2(tgt.y-P.y,tgt.x-P.x);
  const d=Math.max(.6,dist(P.x,P.y,tgt.x,tgt.y));
  const fan=pl.shots.length>1;
  for(const p of pl.shots){
    // 出膛角：分叉偏角决定弹丸朝哪两侧张开；每发各自抖一次，连发不叠成一条线
    const a=base+p.off+weaponSpreadOffset();
    const k=p.mul*(mul==null?1:mul);
    // 分叉：终点恒为瞄准目标，控制点沿出膛角前伸 → 先向两侧张开、再汇聚回目标（不飞过头折返）。
    // 单发：沿用原落点（带散布抖动），保持可被打空/被拦截的手感。
    let tx,ty,path=null,node=null;
    if(fan){
      tx=tgt.x;ty=tgt.y;
      const bow=d*0.62;
      path={cx:P.x+Math.cos(a)*bow,cy:P.y+Math.sin(a)*bow,
        target:tgt&&!tgt.dead?tgt:null};  // 终点跟随活目标
      if(isNode(tgt))node=tgt;         // 汇聚到同一处：瞄准节点则锁定它
    }else{
      tx=P.x+Math.cos(a)*d;ty=P.y+Math.sin(a)*d;
      if(isNode(tgt))node=tgt;
    }
    const ctx={mode:'weapon'};
    if(path)ctx.path=path;
    // 锁定目标同时写进弹道上下文：飞行途中由实体自己撞节点结算，
    // 不能只留在 resolve 闭包里——那样弹丸经过节点时检测不到，落点也不结算。
    if(node)ctx.node=node;
    const shot=queueSpellHit(def,tx,ty,{...ctx,resolve:(dd,x,y)=>weaponHitAt(dd,x,y,k,node,pl.ember)});
    spellFx(def,tx,ty,def.elem,spellTargets(def,tx,ty),shot);
  }
}
/* 剑同样走施放链：全部功能刻印折进这一次挥砍，分裂成带角度的多段，
   二重在同一帧里重打一次（剑没有弹道时间轴）。 */
function swing(ang,opts){
  const echo=!!(opts&&opts.echo);
  if(!echo&&!payWeaponMana())return false;   // 剑上的刻印同样计费，雾能不足就挥不动
  if(!echo)setWeaponCd(WEAPONS.sword,{last:true,n:1});
  const pl=echo?null:swordPlan();
  const shots=pl?pl.shots:[{off:0,mul:1}],rep=pl?pl.rep:{n:1,mul:1};
  P.swingT=.18;P.face=ang;
  let any=false;
  for(const p of shots)
    for(let r=0;r<rep.n;r++)
      if(swingArc(ang+p.off,p.mul*(r===0?1:rep.mul)))any=true;
  if(any)sigilEcho(WEAPONS.sword,{x:P.x+Math.cos(ang)*.6,y:P.y+Math.sin(ang)*.6});
  return true;
}
function swingArc(ang,mult){
  slashes.push({x:P.x,y:P.y,ang,t:0,R:P.range});
  sfx('swing');
  const inArc=(t,extra)=>{
    const d=dist(P.x,P.y,t.x,t.y);
    if(d>P.range+extra)return false;
    if(d<.75)return true;
    const a=Math.atan2(t.y-P.y,t.x-P.x);
    let da=Math.abs(a-ang);da=Math.min(da,TAU-da);
    return da<=1.15;
  };
  let hit=false;const fxHits=[];
  const dm=sigilMods().dmg*mult;
  forFoes(P.x,P.y,P.range+1.2,f=>{
    if(f.dead||!inArc(f,f.r))return;
    let dmg=P.dmg*TUNE.dmgMul.melee*dm;const crit=Math.random()<P.crit;if(crit)dmg*=2;
    damageFoe(f,dmg,ang,crit);hit=true;fxHits.push({x:f.x,y:f.y,crit});
  });
  for(const n of nodes){if(!n.alive||!inArc(n,.4))continue;hitNode(n);hit=true;fxHits.push({x:n.x,y:n.y,node:true});}
  if(P.wave>0){shots.push({x:P.x+Math.cos(ang)*.5,y:P.y+Math.sin(ang)*.5,vx:Math.cos(ang)*10,vy:Math.sin(ang)*10,
    type:'wave',dmg:P.dmg*(.5+.2*P.wave)*TUNE.dmgMul.melee*dm,life:.34,pierce:2,z:12});
    FX.waveShot(P.x+Math.cos(ang)*.5,P.y+Math.sin(ang)*.5,ang);}
  if(hit)S.hitstop=Math.max(S.hitstop,.02);
  FX.sword(P.x,P.y,ang,P.range);for(const h of fxHits)FX.swordHit(h.x,h.y,ang,h.crit,h.node);
  return hit;
}
function damageFoe(f,dmg,ang,crit,opts){
  if(f.dead)return;
  opts=opts||{};
  f.hp-=dmg;f.flash=.13;S.stats.dmg+=dmg;
  if(!opts.noKnock){f.kx+=Math.cos(ang)*3.2;f.ky+=Math.sin(ang)*3.2;}
  if(!opts.dot){
    floater(f.x,f.y,Math.round(dmg),crit?'#ffb454':'#eef7f2',crit);
    puff(f.x,f.y,4,'#c9a8ff',2.4,.4,2.5);sfx('hit');
  }
  if(f.hp<=0)killFoe(f);
}
function killFoe(f){
  if(f.dead)return;f.dead=true;
  S.stats.kills++;if(S.phase==='night')S.nightKilled++;
  bumpSeen('foe',f.type);gainXP(f.xp);
  puff(f.x,f.y,f.boss?36:12,'#a06bff',3,.7,f.boss?6:3.5);
  ring(f.x,f.y,'rgba(160,107,255,.7)',.2,f.boss?3:1.2,.5);
  const crys=FOES[f.type].crysDrop;
  for(let i=0;i<crys;i++)dropPickup(f.x,f.y,'crys',1);
  if(P.ls>0)healPlayer(P.ls);
  if(isMage()&&tLv('t_burnspread')>0&&(f.burnStacks||0)>0){
    const bt=TALENT_TUNE.t_burnspread;
    let n=0;
    forFoes(f.x,f.y,bt.radius,o=>{
      if(n>=bt.count||o===f||o.dead||dist(f.x,f.y,o.x,o.y)>=bt.radius+o.r)return;
      applyStatus(o,'burn',Math.min(bt.maxStacks,f.burnStacks));n++;
    });
  }
  sfx('kill');shake(f.boss?10:2);
  if(f.boss){banner('雾潮之主已溃','','');sfx('boom');S.hitstop=.12;}
}
function hitNode(n){
  n.hp--;n.shake=.2;
  const cols={tree:'#6fe08a',rock:'#b9c4c9',crys:'#57e6ff'};
  puff(n.x,n.y,5,cols[n.type],2,.45,2.5);
  sfx(n.type==='tree'?'chop':n.type==='rock'?'stone':'crystal');
  if(n.hp<=0){
    n.alive=false;n.burnHits=0;n.burnTick=0;
    rebuildSolids();rebuildTileCost();fieldDirty=true;
    const yld=TUNE.node.yield[n.type],amt=Math.round(irand(yld[0],yld[1])*P.gather);
    const type=TUNE.resourceDrop[n.type];
    const drops=Math.min(amt,TUNE.node.dropCap),q=Math.floor(amt/drops),r=amt%drops;
    for(let i=0;i<drops;i++)dropPickup(n.x,n.y,type,q+(i<r?1:0));
    gainXP(3);puff(n.x,n.y,10,cols[n.type],3,.6,3);
  }
}
function dropPickup(x,y,type,amt){
  const a=rand(TAU);
  picks.push({x,y,type,amt,vx:Math.cos(a)*rand(1,3),vy:Math.sin(a)*rand(1,3),life:25,bob:rand(TAU)});
}
function healPlayer(v){
  if(P.downed)return;
  const b=P.hp;P.hp=Math.min(P.maxHp,P.hp+v);
  if(P.hp-b>=1)floater(P.x,P.y,'+'+Math.round(P.hp-b),'#6fe08a');
}
let hurtFxT=null;
function damagePlayer(dmg,src){
  if(P.ifr>0||P.downed)return;
  dmg*=DIFFS[save.diff].dmg;
  const ar=TALENT_TUNE.t_armor;
  if(isMage()&&P.en>=P.maxEn*ar.threshold&&tLv('t_armor')>0)
    dmg=Math.max(1,dmg-ar.flat*tLv('t_armor'));
  if(P.shield>0){
    const absorb=Math.min(P.shield,dmg);
    P.shield-=absorb;dmg-=absorb;
    if(dmg<=0){
      P.ifr=Math.max(P.ifr,.3);P.hurtT=.2;
      floater(P.x,P.y,'护盾','#8fe3d0');sfx('ward');
      return;
    }
  }
  if(dmg>=P.hp&&isMage()){
    if(tLv('t_nirvana')>0&&!P.nirvanaUsed&&P.en>0){
      const nv=TALENT_TUNE.t_nirvana;
      P.nirvanaUsed=true;P.en=0;P.hp=Math.max(1,Math.round(P.maxHp*nv.hpRatio));P.ifr=TUNE.down.iframe;
      delete P.stacks.t_nirvana;refreshStacks();
      const elems=['fire','frost','arcane'],elem=elems[irand(0,elems.length-1)];
      for(const f of foes)if(!f.dead){
        damageFoe(f,TALENT_TUNE.t_nirvana.dmg,0,false,{noKnock:true});
        if(!f.dead)applyElement(f,elem,2);
      }
      ring(P.x,P.y,'rgba(255,180,84,.95)',.3,4.5,.7);
      puff(P.x,P.y,30,'#ffb454',5,.8,4);
      toast('魔能涅槃 · 每局一次','good');sfx('boom');shake(10);
      return;
    }
    if(tLv('t_manashield')>0&&P.en>=P.maxEn*TALENT_TUNE.t_manashield.threshold){
      P.en=0;P.ifr=Math.max(P.ifr,1.2);P.hurtT=.2;
      ring(P.x,P.y,'rgba(143,227,208,.95)',.2,2.2,.5);
      puff(P.x,P.y,20,'#8fe3d0',3,.6,3);
      floater(P.x,P.y,'法力护盾','#8fe3d0',true);sfx('ward');
      return;
    }
  }
  P.hp-=dmg;P.ifr=.6;P.hurtT=.35;
  floater(P.x,P.y,'-'+Math.round(dmg),'#ff4d6d',true);
  puff(P.x,P.y,8,'#ff4d6d',2.5,.5,3);sfx('hurt');shake(5);
  UI.hurt.style.opacity=.9;clearTimeout(hurtFxT);hurtFxT=setTimeout(()=>UI.hurt.style.opacity=0,140);
  if(P.thorns>0&&src&&src.hp!==undefined&&!src.dead){
    src.hp-=P.thorns;src.flash=.1;floater(src.x,src.y,Math.round(P.thorns),'#6fe08a');
    if(src.hp<=0)killFoe(src);
  }
  if(P.hp<=0){
    P.hp=0;P.downed=true;P.respT=TUNE.down.time;
    res.crys=Math.floor(res.crys*TUNE.down.crysKeep);refreshRes();
    puff(P.x,P.y,24,'#ffb454',3,.8,4);toast('灯芯熄灭 · '+TUNE.down.time+' 秒重燃','bad');sfx('defeat');
  }
}
function damageCore(dmg){
  if(S.mode!=='play')return;
  core.hp=Math.max(0,core.hp-dmg*DIFFS[save.diff].dmg);core.flash=.3;sfx('coreHit');shake(3);
  if(core.hp<=0)loseRun();
}
function damageBuild(b,dmg){
  b.hp-=dmg*DIFFS[save.diff].dmg;b.flash=.15;
  puff(b.x,b.y,3,'#e0b070',1.5,.3,2);
  if(b.hp<=0){
    const i=builds.indexOf(b);if(i>=0)builds.splice(i,1);
    rebuildSolids();rebuildTileCost();fieldDirty=true;
    puff(b.x,b.y,14,'#e0b070',2.5,.6,3);floater(b.x,b.y,'建筑被毁','#ff4d6d');sfx('boom');
  }else{rebuildTileCost();fieldDirty=true;}
}
function tryDash(){
  if(S.mode!=='play'||P.dashCd>0||P.downed)return;
  let dx=0,dy=0;
  if(keys['w']||keys['arrowup'])dy-=1;if(keys['s']||keys['arrowdown'])dy+=1;
  if(keys['a']||keys['arrowleft'])dx-=1;if(keys['d']||keys['arrowright'])dx+=1;
  if(isTouch&&(stickVec[0]||stickVec[1])){dx=stickVec[0]+stickVec[1];dy=stickVec[1]-stickVec[0];}
  if(!dx&&!dy){dx=Math.cos(P.face);dy=Math.sin(P.face);}
  const m=Math.hypot(dx,dy)||1;
  P.dashDx=dx/m;P.dashDy=dy/m;P.dashT=TUNE.dash.dur;P.dashCd=P.dashCdMax;P.ifr=Math.max(P.ifr,TUNE.dash.iframe);sfx('dash');
}
function castNova(){
  if(S.mode!=='play'||P.downed||P.en<TUNE.nova.cost)return;
  P.en-=TUNE.nova.cost;
  // 个人测试作弊：暂停时键入 l3131 可整体放大雾爆（不新增任何页面元素）
  const R=novaRadius(),dmg=novaDmgValue();
  ring(P.x,P.y,'rgba(87,230,255,.9)',.3,R,.5);ring(P.x,P.y,'rgba(160,107,255,.7)',.2,R*.7,.4);
  puff(P.x,P.y,26,'#57e6ff',5,.6,3.5);
  for(const f of foes){
    if(f.dead)continue;
    if(dist(P.x,P.y,f.x,f.y)<R+f.r){
      const a=Math.atan2(f.y-P.y,f.x-P.x);let dm=dmg;if(Math.random()<P.crit)dm*=2;
      f.kx+=Math.cos(a)*6;f.ky+=Math.sin(a)*6;damageFoe(f,dm,a,false);
    }
  }
  for(const n of nodes)if(n.alive&&dist(P.x,P.y,n.x,n.y)<R)hitNode(n);
  sfx('nova');shake(8);S.hitstop=Math.max(S.hitstop,.04);
}
function tryRepair(){
  if(S.mode!=='play'||P.downed)return;
  if(dist(P.x,P.y,core.x,core.y)>2.8)return;
  if(core.hp>=core.max){toast('核心完好');return;}
  const rc=TUNE.core.repair;
  if(res.wood<rc.wood||res.stone<rc.stone){toast('资源不足','warn');sfx('deny');return;}
  res.wood-=rc.wood;res.stone-=rc.stone;refreshRes();
  core.hp=Math.min(core.max,core.hp+rc.heal);
  puff(core.x,core.y,16,'#ffb454',2,.7,3);floater(core.x,core.y,'+'+rc.heal,'#ffb454',true);sfx('repair');
}
function gainXP(v){
  P.xp+=v;
  while(P.xp>=P.next){
    P.xp-=P.next;P.lvl++;S.stats.level=P.lvl;P.next=24+(P.lvl-1)*16;
    P.maxHp+=8;healPlayer(20);
    ring(P.x,P.y,'rgba(160,107,255,.8)',.3,2.2,.6);
    puff(P.x,P.y,16,'#d9c4ff',2.5,.7,3);
    floater(P.x,P.y,'Lv.'+P.lvl,'#c9a8ff',true);
    toast('等级 '+P.lvl+' · 黎明可选祝福','good');sfx('level');
  }
}
function refreshStacks(){
  const ks=Object.keys(P.stacks);
  UI.stacks.textContent=ks.length?ks.slice(0,3).map(k=>{
    const c=BLESSINGS.find(x=>x.id===k);return c?c.n+'×'+P.stacks[k]:'';
  }).filter(Boolean).join(' '):'尚无祝福';
}

/* ---------------- 敌人 ---------------- */
function freeSpawnNear(x,y){
  for(let t=0;t<24;t++){
    const nx=x+rand(-1.2,1.2),ny=y+rand(-1.2,1.2);
    if(!walk(nx,ny))continue;
    let ok=true;forSolids(nx,ny,1.2,s=>{if(dist(nx,ny,s.x,s.y)<s.r+.4)ok=false;});
    if(ok)return[nx,ny];
  }
  return[x,y];
}
function spawnFoe(type,x,y,elite){
  const d=FOES[type],mult=DIFFS[save.diff];
  const hpM=mult.hp*dayScale(S.day)*(elite?1.6:1);
  const[fx,fy]=type==='boss'?[x,y]:freeSpawnNear(x,y);
  foes.push({type,x:fx,y:fy,hp:d.hp*hpM,max:d.hp*hpM,spd:d.spd*rand(.9,1.1),dmg:d.dmg,r:d.r,
    xp:elite?d.xp*2:d.xp,coreDmg:d.coreDmg,atkCd:rand(.5,1.2),retarget:0,target:'core',kx:0,ky:0,flash:0,
    anim:rand(TAU),elite,boss:type==='boss',dead:false,fireCd:rand(1,2.5),
    spawnCd:d.summonFirst||5,stompCd:d.stompFirst||3,
    px:fx,py:fy,stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:Math.random()<.5?-1:1});
}
function pickFoeType(){
  const day=S.day,bag=[['crawler',10]];
  if(day>=2)bag.push(['spitter',2+effDay(day)]);
  if(day>=3)bag.push(['brute',1+effDay(day)*.8]);
  let tot=0;bag.forEach(b=>tot+=b[1]);
  let r=rand(tot);
  for(const[t,w]of bag){r-=w;if(r<=0)return t;}
  return 'crawler';
}
function startNight(){
  if(overflowBlock('入夜')){S.timeLeft=0;return;}
  S.phase='night';S.nightKilled=0;S.spawnT=1.4;
  const mult=DIFFS[save.diff],isBossNight=S.day%MAX_NIGHT===0;
  S.nightTotal=Math.round((6+4.2*effDay(S.day))*mult.count);
  if(isBossNight)S.nightTotal=Math.round(S.nightTotal*.7)+1;
  S.toSpawn=S.nightTotal;
  if(isBossNight){
    const p=edgeSpawns[irand(0,edgeSpawns.length-1)];
    warns.push({x:p[0],y:p[1],t:1.6,types:['boss'],boss:true});S.toSpawn--;
    banner(`第 ${S.day} 夜 · 雾潮之主`,'','danger');sfx('boss');
  }else{banner(`第 ${S.day} 夜`,'仅可使用瞬发牌','night');sfx('horn');}
  auPhase(true);S.handDirty=true;
  if(!S.hints.night){S.hints.night=true;toast('夜晚：构筑牌封存，瞬发可用','warn');}
}
function enterNextDay(){
  S.day++;S.phase='day';S.timeLeft=DAY_LEN;
  core.hp=Math.min(core.max,core.hp+TUNE.core.dawnHeal);
  if(!P.downed)healPlayer(P.maxHp*.25);
  let regrew=0;
  nodes.forEach(n=>{
    if(n.alive||Math.random()>=.6)return;
    if(builds.some(b=>dist(b.x,b.y,n.x,n.y)<.9))return;
    if(dist(P.x,P.y,n.x,n.y)<.9)return;
    let busy=false;forFoes(n.x,n.y,1.2,f=>{if(dist(f.x,f.y,n.x,n.y)<.8)busy=true;});
    if(busy)return;
    n.alive=true;n.hp=n.max;regrew++;
  });
  if(regrew){rebuildSolids();rebuildTileCost();fieldDirty=true;}
  auPhase(false);sfx('dawn');
  openDawn();
}
function dawn(){
  if(S.mode!=='play')return;
  if(core.hp<=0){loseRun();return;}
  if(overflowBlock('进入黎明'))return;
  S.stats.nights=S.day;
  if(!S.endless&&S.day>=MAX_NIGHT){winRun();return;}
  enterNextDay();
}
const _dir=[0,0];
function updateFoes(dt){
  rebuildFoeGrid();
  if(fieldDirty){rebuildTileCost();computeField(coreField,core.x,core.y);fieldDirty=false;plyFieldT=0;}
  plyFieldT-=dt;
  const pt=(P.y|0)*GRID+(P.x|0);
  let needPly=false;for(const f of foes)if(f.target==='player'){needPly=true;break;}
  if(!P.downed&&(needPly||S.phase==='night')&&(plyFieldT<=0||pt!==plyTile)){
    computeField(plyField,P.x,P.y);plyTile=pt;plyFieldT=.2;
  }
  for(const f of foes){
    if(f.dead)continue;
    f.anim+=dt*6;f.flash=Math.max(0,f.flash-dt);f.atkCd-=dt;f.retarget-=dt;
    f.detourT=Math.max(0,f.detourT-dt);f.phaseT=Math.max(0,f.phaseT-dt);
    updateFoeStatus(f,dt);
    if(f.dead)continue;
    if((f.freezeT||0)>0)continue;
    if(f.retarget<=0){
      f.retarget=.3;
      const pd=P.downed?99:dist(f.x,f.y,P.x,P.y);
      f.target=(f.type==='brute'||f.boss)?(pd<1.6?'player':'core'):(pd<3.4?'player':'core');
    }
    const tgt=f.target==='player'?P:core,tx=tgt.x,ty=tgt.y;
    const d=dist(f.x,f.y,tx,ty),ga=Math.atan2(ty-f.y,tx-f.x);
    const gx=Math.cos(ga),gy=Math.sin(ga);
    let dx=0,dy=0,wants=false,attacking=false,adjB=null;
    forSolids(f.x,f.y,f.r+1,s=>{
      if(s.kind!==1||adjB)return;
      const dd=dist(f.x,f.y,s.x,s.y);
      if(dd<f.r+s.r+.16){
        const bx=(s.x-f.x)/(dd||1),by=(s.y-f.y)/(dd||1);
        if(bx*gx+by*gy>.1||d<2.4)adjB=s.obj;
      }
    });
    if(adjB){attacking=true;if(f.atkCd<=0){f.atkCd=1.1;damageBuild(adjB,f.dmg);puff(adjB.x,adjB.y,3,'#c9a8ff',1.5,.3,2);}}
    if(!attacking){
      const reach=f.target==='player'?f.r+.42:core.r+f.r+.25;
      if(f.type==='spitter'){
        const sd=FOES.spitter;
        f.fireCd-=dt;
        if(d>sd.keepAway)wants=true;
        else if(d<sd.closeIn){dx=-gx;dy=-gy;wants=true;}
        else{dx=-gy*f.strafe*.55;dy=gx*f.strafe*.55;wants=true;if(Math.random()<dt*.4)f.strafe*=-1;}
        if(f.fireCd<=0&&d<sd.fireRange){
          f.fireCd=sd.fireInterval;
          shots.push({x:f.x,y:f.y,vx:gx*6.5,vy:gy*6.5,type:'fog',dmg:f.dmg,life:2.5,z:12});sfx('warn');
        }
        if(d<=reach&&f.atkCd<=0){
          f.atkCd=1.2;
          if(f.target==='player')damagePlayer(f.dmg,f);
          else{damageCore(f.coreDmg);puff(core.x,core.y,4,'#ff8a3d',1.5,.3,2);}
        }
      }else if(d<=reach){
        if(f.atkCd<=0){
          f.atkCd=f.boss?1.4:1.0;
          if(f.target==='player')damagePlayer(f.dmg,f);
          else{damageCore(f.coreDmg);puff(core.x,core.y,5,'#ff8a3d',2,.4,3);}
        }
      }else wants=true;
      if(wants&&dx===0&&dy===0){
        if(d<2.4){dx=gx;dy=gy;}
        else{const field=f.target==='player'?plyField:coreField;
          if(fieldDir(field,f.x,f.y,_dir)){dx=_dir[0];dy=_dir[1];}else{dx=gx;dy=gy;}}
      }
    }
    f.stuckT+=dt;
    if(f.stuckT>=.5){
      const moved=dist(f.x,f.y,f.px,f.py);
      if(wants&&moved<.12){f.stuckN++;f.detourT=.75;f.detourSign=Math.random()<.5?-1:1;
        if(f.stuckN>=3){f.phaseT=1.1;f.stuckN=0;}}
      else f.stuckN=0;
      f.px=f.x;f.py=f.y;f.stuckT=0;
    }
    if(f.detourT>0&&wants){
      const px=-gy*f.detourSign,py=gx*f.detourSign;
      dx=dx*.25+px*.9;dy=dy*.25+py*.9;
      const m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;
    }
    let sepx=0,sepy=0;
    forFoes(f.x,f.y,f.r+1.2,o=>{
      if(o===f||o.dead)return;
      const dd=dist(f.x,f.y,o.x,o.y),min=f.r+o.r;
      if(dd<min&&dd>.001){const push=(min-dd)/min;sepx+=(f.x-o.x)/dd*push;sepy+=(f.y-o.y)/dd*push;}
    });
    const sm=Math.hypot(sepx,sepy);if(sm>1){sepx/=sm;sepy/=sm;}
    const fs=f.spd*foeSlowMult(f);
    moveCircle(f,(dx*fs+sepx*fs*.9+f.kx)*dt,(dy*fs+sepy*fs*.9+f.ky)*dt,f.r,f.phaseT>0);
    f.kx*=Math.pow(.0015,dt);f.ky*=Math.pow(.0015,dt);
    if(f.boss){
      f.spawnCd-=dt;f.stompCd-=dt;
      const bd=FOES.boss;
      if(f.spawnCd<=0&&foes.length<FOE_CAP){
        f.spawnCd=bd.summonInterval;
        for(let i=0;i<bd.summonCount;i++)spawnFoe('crawler',f.x+rand(-1,1),f.y+rand(-1,1));
        sfx('boss');ring(f.x,f.y,'rgba(160,107,255,.6)',.5,2,.5);
      }
      if(f.stompCd<=0&&!P.downed&&dist(f.x,f.y,P.x,P.y)<bd.stompRange){
        f.stompCd=bd.stompInterval;damagePlayer(bd.stompDmg,f);
        ring(f.x,f.y,'rgba(255,77,109,.8)',.3,2.6,.45);shake(9);sfx('boom');
      }
    }
  }
  for(let i=foes.length-1;i>=0;i--)if(foes[i].dead)foes.splice(i,1);
  rebuildFoeGrid(); // 敌人移动后重建，箭塔索敌与弹体碰撞才不会查到旧坐标
}
function updateBuilds(dt){
  for(const b of builds){
    b.flash=Math.max(0,b.flash-dt);b.pulse+=dt;
    const def=BUILDS[b.type];
    if(b.type==='tower'||b.type==='cannon'){
      b.cd-=dt;let best=null,bd=def.range;
      forFoes(b.x,b.y,def.range,f=>{if(f.dead)return;const d=dist(b.x,b.y,f.x,f.y);if(d<bd){bd=d;best=f;}});
      if(best){
        const ta=Math.atan2(best.y-b.y,best.x-b.x);
        let da=ta-b.ang;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        b.ang+=da*Math.min(1,dt*8);
        if(b.cd<=0){
          b.cd=def.rate;const dmg=def.dmg*P.towerMult;
          if(b.type==='tower'){shots.push({x:b.x,y:b.y,vx:Math.cos(b.ang)*12,vy:Math.sin(b.ang)*12,type:'arrow',dmg,life:1,z:22});sfx('arrow');}
          else{shots.push({x:b.x,y:b.y,vx:Math.cos(b.ang)*8,vy:Math.sin(b.ang)*8,type:'cannon',dmg,life:1.2,z:20});sfx('cannon');}
          b.flash=.08;
        }
      }
    }else if(b.type==='totem'){
      b.cd-=dt;
      if(b.cd<=0){b.cd=1;
        if(!P.downed&&dist(b.x,b.y,P.x,P.y)<def.range&&P.hp<P.maxHp){healPlayer(def.heal);puff(P.x,P.y,3,'#6fe08a',1,.5,2);}
        puff(b.x,b.y,2,'#6fe08a',.8,.7,2);}
    }else if(b.type==='manawell'){
      b.cd-=dt;
      if(b.cd<=0){b.cd=.6;puff(b.x,b.y,1,'#57e6ff',.6,.6,2);}
      if(!P.downed&&dist(b.x,b.y,P.x,P.y)<=def.range)
        gainMana(def.regen*P.regen*(1+TALENT_TUNE.t_spring.regen*tLv('t_spring'))*dt);
    }
  }
}
function shotStepHit(s){
  if(s.type==='arrow'||s.type==='wave'){
    let dead=false;
    forFoes(s.x,s.y,1.2,f=>{
      if(dead||f.dead)return;
      if(dist(s.x,s.y,f.x,f.y)<f.r+.22){
        if(s.type==='wave'){
          if(!s.hitSet)s.hitSet=new Set();
          if(s.hitSet.has(f))return; // 同一目标只结算一次穿透
          s.hitSet.add(f);
        }
        damageFoe(f,s.dmg,Math.atan2(s.vy,s.vx),false);
        if(s.type==='wave')FX.swordHit(f.x,f.y,Math.atan2(s.vy,s.vx),false);
        if(s.type==='wave'){s.pierce--;if(s.pierce<=0)dead=true;}else dead=true;
      }
    });
    return dead;
  }
  if(s.type==='cannon'){
    let boom=false;
    forFoes(s.x,s.y,1.2,f=>{if(boom||f.dead)return;if(dist(s.x,s.y,f.x,f.y)<f.r+.3)boom=true;});
    if(boom){
      ring(s.x,s.y,'rgba(87,230,255,.9)',.2,1.5,.4);puff(s.x,s.y,14,'#57e6ff',3.5,.5,3);
      for(const o of foes){if(o.dead)continue;if(dist(s.x,s.y,o.x,o.y)<1.5+o.r)damageFoe(o,s.dmg,Math.atan2(o.y-s.y,o.x-s.x),false);}
      sfx('boom');shake(3);return true;
    }
    return false;
  }
  if(s.type==='fog'){
    if(!P.downed&&P.ifr<=0&&dist(s.x,s.y,P.x,P.y)<.45){damagePlayer(s.dmg);return true;}
    if(dist(s.x,s.y,core.x,core.y)<core.r+.1){damageCore(8);puff(s.x,s.y,5,'#a06bff',2,.4,2);return true;}
    let hit=false;
    forSolids(s.x,s.y,.9,o=>{if(hit||o.kind!==1)return;if(dist(s.x,s.y,o.x,o.y)<o.r+.15){damageBuild(o.obj,8);hit=true;}});
    return hit;
  }
  return false;
}
function updateShots(dt){
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];
    const steps=Math.min(8,Math.max(1,Math.ceil(Math.hypot(s.vx,s.vy)*dt/.25)));
    const sx=s.vx*dt/steps,sy=s.vy*dt/steps,st=dt/steps;
    let dead=false;
    for(let k=0;k<steps&&!dead;k++){
      s.x+=sx;s.y+=sy;s.life-=st;
      if(s.life<=0||!walk(s.x,s.y)){dead=true;break;}
      dead=shotStepHit(s);
    }
    if(dead){if(s.type==='fog')puff(s.x,s.y,4,'#a06bff',1.5,.3,2);shots.splice(i,1);}
  }
}
function updatePicks(dt){
  for(let i=picks.length-1;i>=0;i--){
    const p=picks[i];p.life-=dt;p.bob+=dt*5;
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.01,dt);p.vy*=Math.pow(.01,dt);
    if(!P.downed){
      const d=dist(p.x,p.y,P.x,P.y);
      if(d<P.magnet){const a=Math.atan2(P.y-p.y,P.x-p.x),pull=lerp(14,4,d/P.magnet);
        p.x+=Math.cos(a)*pull*dt;p.y+=Math.sin(a)*pull*dt;}
      if(d<.55){
        res[p.type]+=p.amt;S.stats.gathered+=p.amt;
        floater(P.x,P.y-.3,`+${p.amt}${RESNAME[p.type]}`,RESCOL[p.type]);
        sfx('pickup');refreshRes(p.type);picks.splice(i,1);continue;
      }
    }
    if(p.life<=0)picks.splice(i,1);
  }
}
function updateParts(dt){
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];p.life-=dt;
    if(p.life<=0){parts.splice(i,1);partPool.push(p);continue;}
    if(!p.ring){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=(p.grav||140)*dt;if(p.z<0){p.z=0;p.vz*=-.4;}}
  }
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.life-=dt;f.y-=dt*.9;if(f.life<=0)floats.splice(i,1);}
  for(let i=slashes.length-1;i>=0;i--){slashes[i].t+=dt;if(slashes[i].t>.18)slashes.splice(i,1);}
  for(let i=ghosts.length-1;i>=0;i--){ghosts[i].t+=dt;if(ghosts[i].t>.3)ghosts.splice(i,1);}
  for(const n of nodes)if(n.shake>0)n.shake=Math.max(0,n.shake-dt);
}
function update(dt){
  S.elapsed+=dt;S.combatT+=dt;rebuildFoeGrid();
  if(S.phase==='day'){
    S.timeLeft-=dt;S.nightAmt=Math.max(0,S.nightAmt-dt*.5);
    if(S.timeLeft<10&&S.timeLeft+dt>=10){toast('夜幕将至 · 构筑即将封存','warn');sfx('warn');}
    if(S.timeLeft<=0)startNight();
    core.hp=Math.min(core.max,core.hp+dt*TUNE.core.regen);
    if(!P.downed&&dist(P.x,P.y,core.x,core.y)<3)healPlayer(dt*2);
  }else{
    S.nightAmt=Math.min(1,S.nightAmt+dt*.4);S.spawnT-=dt;
    if(S.spawnT<=0&&S.toSpawn>0&&foes.length+warns.length*4<FOE_CAP){
      const n=Math.min(S.toSpawn,irand(2,2+Math.floor(S.day/2)),5);
      const pts=Math.random()<.4?2:1;let made=0;
      for(let p=0;p<pts&&made<n;p++){
        const pt=edgeSpawns[irand(0,edgeSpawns.length-1)];
        const types=[],share=Math.ceil((n-made)/(pts-p));
        for(let i=0;i<share&&made+types.length<n;i++)types.push(pickFoeType());
        warns.push({x:pt[0],y:pt[1],t:.95,types});made+=types.length;
      }
      S.toSpawn-=made;S.spawnT=Math.max(1.6,3.4-S.day*.22);
    }
    for(let i=warns.length-1;i>=0;i--){
      const w=warns[i];w.t-=dt;
      if(w.t<=0){w.types.forEach(t=>spawnFoe(t,w.x,w.y,S.day>=5&&t!=='boss'&&Math.random()<.12));
        puff(w.x,w.y,8,'#a06bff',2,.5,3);warns.splice(i,1);}
    }
    if(S.toSpawn<=0&&warns.length===0&&foes.length===0)dawn();
    if(S.mode!=='play')return; // 判胜/判负/黎明确定的同一帧不再推进战斗
  }
  if(P.downed){
    P.respT-=dt;
    if(P.respT<=0){
      P.downed=false;const[rx,ry]=freeSpawnNear(core.x+1.6,core.y);
      P.x=rx;P.y=ry;P.hp=P.maxHp*TUNE.down.hpRatio;P.en=TUNE.down.en;P.ifr=TUNE.down.iframe;
      puff(P.x,P.y,18,'#ffb454',2.5,.7,3);ring(P.x,P.y,'rgba(255,180,84,.8)',.2,1.6,.5);
      sfx('respawn');toast('灯芯重燃','good');
    }
  }else{
    let dx=0,dy=0;
    if(keys['w']||keys['arrowup'])dy-=1;if(keys['s']||keys['arrowdown'])dy+=1;
    if(keys['a']||keys['arrowleft'])dx-=1;if(keys['d']||keys['arrowright'])dx+=1;
    if(isTouch&&(Math.abs(stickVec[0])>.12||Math.abs(stickVec[1])>.12)){dx=stickVec[0]+stickVec[1];dy=stickVec[1]-stickVec[0];}
    const m=Math.hypot(dx,dy);P.moving=m>0;
    if(P.dashT>0){
      P.dashT-=dt;moveCircle(P,P.dashDx*P.spd*moveSpeedMult()*TUNE.dash.mult*dt,P.dashDy*P.spd*moveSpeedMult()*TUNE.dash.mult*dt,.3,false);
      ghosts.push({x:P.x,y:P.y,t:0});
      if(Math.random()<.5)puff(P.x,P.y,1,'#8fe3d0',.5,.3,2);
    }else if(m>0){
      dx/=m;dy/=m;moveCircle(P,dx*P.spd*moveSpeedMult()*dt,dy*P.spd*moveSpeedMult()*dt,.3,false);
      P.face=Math.atan2(dy,dx);P.anim+=dt*10;
    }else depenetrate(P,.3,false);
    P.atkCd-=dt;if(P.atkCd<=0)P.reload=false;P.swingT=Math.max(0,P.swingT-dt);
    P.dashCd=Math.max(0,P.dashCd-dt);P.ifr=Math.max(0,P.ifr-dt);P.hurtT=Math.max(0,P.hurtT-dt);
    gainMana(manaRegenRate()*dt);
    autoAttack();
  }
  updateSpellState(dt);
  updateWeaponRepeats();
  updatePendingHits();
  updateSpellShots(dt);
  updateBurningTrees(dt);
  updateFoes(dt);updateBuilds(dt);updateShots(dt);updatePicks(dt);updateParts(dt);
  core.flash=Math.max(0,core.flash-dt);
  core.beam=lerp(core.beam,S.phase==='night'?1:.25,dt*2);
  let lx=P.x,ly=P.y;
  if(mouseActive&&!isTouch&&!S.dragUid){lx+=(mouseWorld[0]-P.x)*.14;ly+=(mouseWorld[1]-P.y)*.14;}
  cam.x=lerp(cam.x,lx,Math.min(1,dt*6));cam.y=lerp(cam.y,ly,Math.min(1,dt*6));
  cam.z=lerp(cam.z,cam.tz,Math.min(1,dt*8));
  cam.shake=Math.max(0,cam.shake-dt*30);cam.sx=rand(-1,1)*cam.shake;cam.sy=rand(-1,1)*cam.shake;
  if(!S.hints.move&&S.elapsed>1.2){S.hints.move=true;toast(isTouch?'摇杆移动 · 拖卡牌落地':'WASD 移动 · 拖动卡牌到地面打出');}
}

