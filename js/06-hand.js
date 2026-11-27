'use strict';
/* ---------------- 手牌 UI ---------------- */
const HAND_KEYS='1234567890-=';
function cardInner(def,hot){
  const cost=def.cls==='class'?'<b style="color:#b48cff">职业</b>':costHtml(def,true);
  const q=CARD_Q[def.q||1];
  const badge=(def.q||1)>=2?`<i class="hcQ" style="background:linear-gradient(135deg,${q.c1},${q.c2});color:${q.fg}">${q.name}</i>`:'';
  return `<span class="hcHot kb-hint">${hot||''}</span>
    <div class="hcCost">${cost}${badge}</div>
    <div class="hcMain">
      <div class="hcArt" style="color:${def.color}">${svg(def.icon,22)}</div>
      <div class="hcName">${def.name}</div>
    </div>
    <div class="hcDesc">${def.brief||def.desc}</div>`;
}
function renderHand(){
  const row=$('handRow');row.innerHTML='';
  DECK.hand.forEach((c,i)=>{
    const def=CDEFS[c.id];
    const el=document.createElement('div');
    el.className='hcard';el.dataset.uid=c.uid;
    const q=def.q||1;if(q>1)el.dataset.q=q;
    el.innerHTML=cardInner(def,HAND_KEYS[i]||'');
    el.addEventListener('pointerdown',e=>{
      if(S.mode!=='play')return;
      if(e.button!==0){e.preventDefault();if(e.button===2)clearAim();return;}
      e.preventDefault();auInit();
      const pid=e.pointerId,uid=c.uid;
      S.dragUid=uid;S.dragMoved=false;S.dragStart=[e.clientX,e.clientY];S.dragPointerId=pid;
      mouseX=e.clientX;mouseY=e.clientY;mouseActive=true;
      clearHold();
      holdTimer=setTimeout(()=>{
        holdTimer=null;
        if(S.dragUid!==uid||S.dragPointerId!==pid||S.dragMoved||S.mode!=='play')return;
        S.dragMoved=true;showDragCard(uid);moveDragCard(mouseX,mouseY);sfx('card');
      },HOLD_MS);
    });
    row.appendChild(el);
  });
  layoutHand();S.handDirty=false;syncHand(true);
}
function layoutHand(){
  const row=$('handRow');const cards=[...row.children];if(!cards.length)return;
  const avail=row.clientWidth||600,cw=cards[0].offsetWidth||104,n=cards.length;
  const spacing=n>1?Math.min(cw+10,(avail-cw)/(n-1)):0;
  const total=cw+spacing*(n-1),start=(avail-total)/2;
  cards.forEach((el,i)=>{
    const off=i-(n-1)/2;
    el.style.left=(start+i*spacing)+'px';
    el.style.setProperty('--rot',(off*2.6).toFixed(2)+'deg');
    el.style.setProperty('--ty',(Math.abs(off)*Math.abs(off)*1.9).toFixed(1)+'px');
    el.style.setProperty('--z',String(10+i));
  });
}
function handCard(uid){return DECK.hand.find(c=>c.uid===uid);}
let dragBuildType=null;
function showDragCard(uid){
  const c=handCard(uid);if(!c)return;
  const def=CDEFS[c.id],el=$('dragCard');
  dragBuildType=def.kind==='build'?def.build:null;
  el.classList.remove('build','sigil');
  if(dragBuildType){
    el.classList.add('build');
    el.innerHTML='<canvas id="dragBuildCv"></canvas>';
    sizeDragCv();drawDragBuild();
  }else if(def.sigil){
    // 刻印牌拖出只显示图标，与建筑拖出只显示模型一致
    el.classList.add('sigil');
    const m=sigilMeta(c.id);
    el.innerHTML=`<div class="dragSigil" style="color:${m?m.color:def.color}">${svg(m?m.icon:def.icon,54)}<b>${m?m.short:def.name}</b></div>`;
  }else{
    el.innerHTML=`<div class="hcard" style="position:relative;left:0;transform:none;width:100%;height:100%">${cardInner(def,'')}</div>`;
  }
  el.style.display='block';
  const h=document.querySelector(`.hcard[data-uid="${uid}"]`);if(h)h.classList.add('drag');
  markFuseTargets(uid);
}
/* 槽位拖出：与手牌拖拽共用 #dragCard，独立状态不入存档 */
let slotDrag=null;
function showSlotDrag(i){
  const c=(P.sigils||[])[i],m=c&&sigilMeta(c.id);if(!m)return;
  const el=$('dragCard');
  el.classList.remove('build');el.classList.add('sigil');
  el.innerHTML=`<div class="dragSigil" style="color:${m.color}">${svg(m.icon,54)}<b>${m.short}</b></div>`;
  el.style.display='block';
  const h=UI.weaponSlotsRow&&UI.weaponSlotsRow.querySelector(`.wslot[data-slot="${i}"]`);
  if(h)h.classList.add('dragging');
}
function endSlotDrag(){
  if(slotDrag){
    const h=UI.weaponSlotsRow&&UI.weaponSlotsRow.querySelector(`.wslot[data-slot="${slotDrag.i}"]`);
    if(h)h.classList.remove('dragging');
  }
  slotDrag=null;
  $('dragCard').style.display='none';
}
function sizeDragCv(){
  const cv=$('dragBuildCv');if(!cv)return;
  cv.width=Math.floor(122*DPR);cv.height=Math.floor(122*DPR);
}
function drawDragBuild(){
  const cv=$('dragBuildCv');if(!cv||!dragBuildType)return;
  const main=ctx;
  try{
    ctx=cv.getContext('2d');ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,122,122);
    const bg=ctx.createRadialGradient(61,86,4,61,86,68);
    bg.addColorStop(0,'rgba(20,58,78,.85)');bg.addColorStop(1,'rgba(7,19,28,0)');
    ctx.fillStyle=bg;ctx.fillRect(0,0,122,122);
    ctx.save();ctx.translate(61,96);ctx.scale(1.25,1.25);
    drawBuild({type:dragBuildType,x:0,y:0,hp:1,max:1,r:.42,flash:0,pulse:S.elapsed,ang:Math.sin(S.elapsed*.6)*.9});
    ctx.restore();
  }catch(err){}finally{ctx=main;}
}
function moveDragCard(x,y){const el=$('dragCard');el.style.left=x+'px';el.style.top=y+'px';}
function endDrag(){
  clearHold();
  const uid=S.dragUid;
  S.dragUid=null;S.dragMoved=false;S.dragStart=[0,0];S.dragPointerId=null;dragBuildType=null;
  $('dragCard').style.display='none';
  if(uid){const h=document.querySelector(`.hcard[data-uid="${uid}"]`);if(h)h.classList.remove('drag');}
  if(typeof clearFuseMarks==='function')clearFuseMarks();
}
function selectCard(uid){
  const c=handCard(uid);if(!c)return;
  S.aimUid=uid;sfx('card');syncHand(true);
}
function clearAim(){S.aimUid=null;syncHand(true);}
function syncHand(force){
  const night=S.phase==='night';
  document.querySelectorAll('#handRow .hcard').forEach(el=>{
    const uid=+el.dataset.uid,c=handCard(uid);if(!c)return;
    const def=CDEFS[c.id];
    const off=!afford(def);
    const nn=night&&def.kind==='build';
    if(force||el._off!==off){el._off=off;el.classList.toggle('off',off&&!nn);}
    if(force||el._nn!==nn){el._nn=nn;el.classList.toggle('noNight',nn);}
    const sel=S.aimUid===uid;
    if(force||el._sel!==sel){el._sel=sel;el.classList.toggle('sel',sel);}
    el.querySelectorAll('.hcCost b[data-k]').forEach(b=>{
      const no=res[b.dataset.k]<def.cost[b.dataset.k];
      if(b._no!==no){b._no=no;b.classList.toggle('no',no);}
    });
    el.querySelectorAll('.hcCost b[data-mana]').forEach(b=>{
      const no=P.en<effManaCost(def);
      if(b._no!==no){b._no=no;b.classList.toggle('no',no);}
    });
  });
  setTxt(UI.drawN,DECK.draw.length);setTxt(UI.discN,DECK.discard.length);
  setTxt(UI.handN,DECK.hand.length+'/'+DECK.max);setTxt(UI.recN,DECK.recycle+'%');
  const over=DECK.hand.length>DECK.max;
  const chip=UI.handN.parentNode;
  if(chip._over!==over){chip._over=over;chip.classList.toggle('over',over);}
}

/* ---------------- 出牌 ---------------- */
function aimDef(){
  const uid=S.dragUid||S.aimUid;if(!uid)return null;
  const c=handCard(uid);return c?{card:c,def:CDEFS[c.id]}:null;
}
function ghostTile(){
  if(!mouseActive&&isTouch){
    const a=P.face;return[Math.floor(P.x+Math.cos(a)*1.7)+.5,Math.floor(P.y+Math.sin(a)*1.7)+.5];
  }
  return[Math.floor(mouseWorld[0])+.5,Math.floor(mouseWorld[1])+.5];
}
function placeCheck(def,tx,ty){
  if(S.phase==='night'&&def.kind==='build')return{ok:false,msg:'夜晚仅可使用瞬发牌'};
  if(def.elem&&P.spellCd>0)return{ok:false,msg:'施法冷却中'};
  if(!afford(def))return{ok:false,msg:def.mana?(isMage()?'法力不足':'雾能不足'):'资源不足'};
  if(def.kind==='build'){
    if(def.build==='manawell'&&builds.filter(b=>b.type==='manawell').length>=3)
      return{ok:false,msg:'法力之井已达上限'};
    if(!walk(tx,ty))return{ok:false,msg:'不可建于此处'};
    if(dist(tx,ty,P.x,P.y)>5.5)return{ok:false,msg:'超出建造范围'};
    if(dist(tx,ty,core.x,core.y)<core.r+.8)return{ok:false,msg:'核心区域'};
    if(dist(tx,ty,P.x,P.y)<.8)return{ok:false,msg:'脚下无法建造'};
    if(builds.some(b=>dist(b.x,b.y,tx,ty)<.9))return{ok:false,msg:'已有建筑'};
    if(nodes.some(n=>n.alive&&dist(n.x,n.y,tx,ty)<.85))return{ok:false,msg:'被资源占据'};
    let blocked=false;forFoes(tx,ty,1.2,f=>{if(!f.dead&&dist(f.x,f.y,tx,ty)<.75)blocked=true;});
    if(blocked)return{ok:false,msg:'雾裔占据此处'};
  }else if(def.target==='point'){
    if(!walk(tx,ty))return{ok:false,msg:'目标不在陆地'};
    if(dist(tx,ty,P.x,P.y)>spellCastRange())return{ok:false,msg:'超出施法距离'};
  }
  return{ok:true,msg:''};
}
/* 卡是实体，槽位是它的另一个位置：装槽=手牌→槽位，卸下=槽位→手牌，牌库总量不变。 */
function engraveCard(uid,targetSlot){
  const idx=DECK.hand.findIndex(c=>c.uid===uid);if(idx<0)return false;
  const card=DECK.hand[idx],def=CDEFS[card.id];
  if(!def||!def.sigil){toast('此卡没有刻印标签','warn');sfx('deny');return false;}
  const w=weaponDef(P.weapon),cap=w.slots||0;
  if(w.attack!=='spell'&&!def.sigilOnly){toast('法术刻印只能装入法杖','warn');sfx('deny');return false;}
  const list=P.sigils||[];
  let slot=Number.isInteger(targetSlot)&&targetSlot>=0&&targetSlot<cap?targetSlot:list.length;
  if(slot>list.length)slot=list.length;
  DECK.hand.splice(idx,1);
  const displaced=slot<list.length?list[slot]:null;
  if(displaced)list[slot]=card;else list.push(card);
  if(displaced)DECK.hand.splice(idx,0,displaced);
  if(S.aimUid===uid)S.aimUid=null;
  S.handDirty=true;
  if(def.sigilOnly)bumpSeen('sigil',card.id);else bumpSeen('play',card.id);
  toast(displaced?'替换 '+def.name:'已刻印 '+def.name,'good');sfx('level');
  return true;
}
function unfillSlot(i){
  if(!Number.isInteger(i)||i<0||i>=(P.sigils||[]).length)return false;
  const card=P.sigils.splice(i,1)[0],def=CDEFS[card.id];
  DECK.hand.push(card);
  S.handDirty=true;sfx('ui');
  toast('卸下 '+def.name+' 到手牌','good');
  return true;
}
function tryPlayAt(uid,wx,wy){
  const c=handCard(uid);if(!c)return false;
  const def=CDEFS[c.id];if(!def||def.weaponAttack)return false;
  if(def.sigilOnly){toast('数值刻印只能装入武器槽位','warn');sfx('deny');return false;}
  if(def.target==='self'||def.target==='pick')return playCard(uid,wx,wy);
  const tx=def.kind==='build'?Math.floor(wx)+.5:wx;
  const ty=def.kind==='build'?Math.floor(wy)+.5:wy;
  return playCard(uid,tx,ty);
}
function playCard(uid,tx,ty){
  const idx=DECK.hand.findIndex(c=>c.uid===uid);if(idx<0)return false;
  const card=DECK.hand[idx],def=CDEFS[card.id];
  if(!def||def.weaponAttack||def.sigilOnly)return false;
  if(def.target==='pick'){beginSalvage(card);return false;}
  const chk=placeCheck(def,tx,ty);
  if(!chk.ok){toast(chk.msg,'warn');sfx('deny');return false;}
  const overflow=!!def.elem&&manaOverflow();
  payCost(def);
  DECK.hand.splice(idx,1);
  S.aimUid=null;
  S.stats.played++;bumpSeen('play',def.id);
  if(def.kind==='build'){
    const b=BUILDS[def.build];
    builds.push({type:def.build,x:tx,y:ty,hp:b.hp,max:b.hp,r:b.r,cd:rand(.2,.8),ang:0,flash:0,pulse:0});
    bumpSeen('build',def.build);
    rebuildSolids();rebuildTileCost();fieldDirty=true;
    FX.cast(def.build,tx,ty);
    sfx('build');
    DECK.discard.push(card);
  }else{
    applyInstant(def,tx,ty,overflow);
    DECK.discard.push(card);
  }
  if(def.id==='expand'){
    DECK.max=Math.min(handCap(),DECK.max+1);
    floater(P.x,P.y,'手牌上限 '+DECK.max,'#ffb454',true);
    FX.cast('expand',P.x,P.y);
    if(DECK.max>=handCap()){purgeCard('expand');toast('手牌已达上限 '+handCap()+' · 扩容牌退场','good');}
    drawN(def.draw);
  }
  S.handDirty=true;
  return true;
}
function applyInstant(def,tx,ty,overflow){
  if(def.elem)return castSpell(def,tx,ty,overflow);
  if(def.fuseOut)return applyFuse(def,tx,ty);
  if(def.kind==='class')return;
  if(def.id==='rain'||def.id==='mine'){
    const R=def.radius;
    FX.cast(def.id,tx,ty,{radius:R});
    for(const f of foes){
      if(f.dead)continue;
      if(dist(tx,ty,f.x,f.y)<R+f.r){
        const a=Math.atan2(f.y-ty,f.x-tx);
        if(def.knock){f.kx+=Math.cos(a)*7;f.ky+=Math.sin(a)*7;}
        damageFoe(f,def.dmg*(1+(P.towerMult-1)*.5),a,false);
      }
    }
    if(def.id==='mine')for(const n of nodes)if(n.alive&&dist(tx,ty,n.x,n.y)<R)hitNode(n);
    sfx(def.id==='rain'?'arrow':'boom');shake(def.id==='mine'?7:3);
  }else if(def.id==='spring'){
    healPlayer(def.heal);
    FX.cast('spring',P.x,P.y);
    sfx('heal');
  }else if(def.id==='mend'){
    core.hp=Math.min(core.max,core.hp+def.coreHeal);
    builds.forEach(b=>{b.hp=Math.min(b.max,b.hp+def.buildHeal);});
    rebuildTileCost();fieldDirty=true;
    floater(core.x,core.y,'+'+def.coreHeal,'#ffb454',true);
    FX.cast('mend',core.x,core.y);
    sfx('repair');
  }else if(def.id==='ward'){
    P.ifr=Math.max(P.ifr,def.ifr);
    FX.cast('ward',P.x,P.y);
    floater(P.x,P.y,'无敌 '+def.ifr+'s','#8fe3d0',true);sfx('heal');
  }else if(def.id==='tactic'){
    const n=drawN(def.draw);floater(P.x,P.y,'抽 '+n+' 张','#c9a8ff',true);
    FX.cast('tactic',P.x,P.y);
    if(n<def.draw&&DECK.hand.length>=DECK.max&&DECK.draw.length+DECK.discard.length>0)
      offerSwap(Math.min(def.draw-n,DECK.hand.length),'战术重整 · 手牌已满');
  }else if(def.id==='surge'){
    gainMana(P.maxEn-P.en);P.dashCd=0;
    FX.cast('surge',P.x,P.y);
    sfx('nova');
  }
}
/* ---------------- 熔铸 ----------------
   把一张手牌拖到另一张手牌上：两张源牌永久离场，产物直接进当前手牌。
   代价 = 两张源牌 + TUNE.fusion.crys 雾晶；手牌净减 1 张，牌库净减 1 张。
   产物带 fuseOut 标记：不进奖励池，也不能再次作为熔铸源（见 fusionOf）。 */
const FUSE_SEL='fuseOK';
/* 拖起某张牌时，把能与它熔铸的手牌标亮 */
function markFuseTargets(uid){
  const src=handCard(uid);if(!src)return;
  document.querySelectorAll('#handRow .hcard').forEach(el=>{
    const t=+el.dataset.uid;
    if(!t||t===uid)return;
    const other=handCard(t);
    el.classList.toggle(FUSE_SEL,!!(other&&fusionOf(src.id,other.id)));
  });
}
function clearFuseMarks(){
  document.querySelectorAll('#handRow .hcard.'+FUSE_SEL).forEach(el=>el.classList.remove(FUSE_SEL));
}
/* 拖放落点判定：两张手牌合法则熔铸，否则回退到原逻辑（出牌/选中） */
function tryFuse(uidA,uidB){
  const a=handCard(uidA),b=handCard(uidB);
  if(!a||!b||uidA===uidB)return false;
  const out=fusionOf(a.id,b.id);
  if(!out){sfx('deny');toast('这两张牌无法熔铸','warn');return false;}
  const def=CDEFS[out],fee=TUNE.fusion.crys;
  if(res.crys<fee){sfx('deny');toast('雾晶不足 · 熔铸需 '+fee+' 晶','warn');return false;}
  /* 先取产物卡再动手：mkCard 失败时不能留下「源牌已删、产物没进」的中间态 */
  const card=mkCard(out);
  if(!card)return false;
  res.crys-=fee;
  /* 按 uid 精确移除两张源牌：只消耗手上这两张，不触碰同名牌的其他副本 */
  for(let i=DECK.hand.length-1;i>=0;i--){
    const u=DECK.hand[i].uid;
    if(u===uidA||u===uidB)DECK.hand.splice(i,1);
  }
  DECK.hand.push(card);
  if(S.aimUid===uidA||S.aimUid===uidB)S.aimUid=card.uid;
  S.handDirty=true;
  const q=CARD_Q[def.q||1];
  floater(P.x,P.y,'熔铸 · '+def.name,q.c1,true);
  puff(P.x,P.y,26,q.c1,3,.75,3.6);
  ring(P.x,P.y,q.c2,.2,2.2,.5);
  shake(2);sfx('card');
  refreshRes('crys');syncHand(true);
  return true;
}
/* 熔铸产物（非元素牌）的声明式执行器：只读卡面字段，不按 id 硬编码。
   元素产物走 castSpell（elem/elem2/status/status2），不到这里。 */
function applyFuse(def,tx,ty){
  const q=CARD_Q[def.q||1];
  if(def.dmg>0&&def.radius>0){
    const R=def.radius;
    if(def.fx)FX.cast(def.fx,tx,ty,{radius:R});
    ring(tx,ty,q.c1,.2,R,.45);
    puff(tx,ty,24,q.c2,4,.65,3.4);
    for(const f of foes){
      if(f.dead)continue;
      if(dist(tx,ty,f.x,f.y)<R+f.r){
        const a=Math.atan2(f.y-ty,f.x-tx);
        if(def.knock){f.kx+=Math.cos(a)*7*def.knock;f.ky+=Math.sin(a)*7*def.knock;}
        damageFoe(f,def.dmg*(1+(P.towerMult-1)*.5),a,false);
      }
    }
    shake(6);sfx('boom');
  }
  if(def.ifr){
    P.ifr=Math.max(P.ifr,def.ifr);
    ring(P.x,P.y,q.c1,.2,1.8,.5);puff(P.x,P.y,18,q.c2,2,.7,3);
    floater(P.x,P.y,'无敌 '+def.ifr+'s',q.c1,true);sfx('heal');
  }
  if(def.draw>0){
    const n=drawN(def.draw);
    floater(P.x,P.y,'抽 '+n+' 张',q.c1,true);
    if(n<def.draw&&DECK.hand.length>=DECK.max&&DECK.draw.length+DECK.discard.length>0)
      offerSwap(Math.min(def.draw-n,DECK.hand.length),'熔铸 · 手牌已满');
  }
  if(def.heal){
    healPlayer(def.heal);
    if(def.fx)FX.cast(def.fx,P.x,P.y);
  }
  if(def.coreHeal||def.buildHeal){
    if(def.coreHeal){
      core.hp=Math.min(core.max,core.hp+def.coreHeal);
      floater(core.x,core.y,'+'+def.coreHeal,q.c1,true);
    }
    if(def.buildHeal)builds.forEach(b=>{b.hp=Math.min(b.max,b.hp+def.buildHeal);});
    rebuildTileCost();fieldDirty=true;
    FX.cast('mend',core.x,core.y);
    sfx('repair');
  }
}
/* 拆解 */
function beginSalvage(card){
  S.pendingSalvage=card;S.mode='remove';
  const def=CDEFS[card.id];
  const rate=Math.min(REC_CAP,DECK.recycle+def.tier);
  $('rmTitle').textContent='拆解 · 回收率 '+rate+'%';
  $('rmSub').textContent=`选择一张牌永久移除，按 ${rate}% 返还其造价（取整）`;
  const list=$('rmList');list.innerHTML='';
  const all=[...DECK.hand,...DECK.draw,...DECK.discard].filter(c=>c.uid!==card.uid);
  const uniq={};all.forEach(c=>{if(!uniq[c.id])uniq[c.id]={id:c.id,n:0};uniq[c.id].n++;});
  const ids=Object.keys(uniq);
  if(!ids.length){list.innerHTML='<div class="cxEmpty">牌库已空，无可拆解</div>';}
  ids.forEach(id=>{
    const d=CDEFS[id],u=uniq[id];
    const back=Object.keys(d.cost).map(k=>Math.floor(d.cost[k]*rate/100)).filter(v=>v>0);
    const backTxt=back.length?Object.keys(d.cost).map((k,i)=>{
      const v=Math.floor(d.cost[k]*rate/100);return v>0?`+${v}${RESNAME[k]}`:'';
    }).filter(Boolean).join(' '):'无返还';
    const el=document.createElement('button');
    el.className='rmItem';
    el.innerHTML=`<span class="ri" style="color:${d.color}">${svg(d.icon,17)}</span>
      <span class="rt"><b>${d.name}</b><span>${costStr(d)} · 共 ${u.n} 张</span></span>
      <span class="rf">${backTxt}</span>`;
    el.addEventListener('click',()=>confirmSalvage(id,rate));
    list.appendChild(el);
  });
  showOv('removeOv',true);sfx('page');
}
function confirmSalvage(id,rate){
  const sc=S.pendingSalvage;if(!sc)return;
  const hi=DECK.hand.findIndex(c=>c.uid===sc.uid);
  if(hi>=0)DECK.hand.splice(hi,1);
  let target=null;
  for(const p of [DECK.hand,DECK.draw,DECK.discard]){
    const i=p.findIndex(c=>c.id===id);
    if(i>=0){target=p.splice(i,1)[0];break;}
  }
  if(target){
    const d=CDEFS[id];
    for(const k in d.cost){
      const v=Math.floor(d.cost[k]*rate/100);
      if(v>0){res[k]+=v;floater(P.x,P.y,'+'+v+RESNAME[k],RESCOL[k]);}
    }
    refreshRes();
  }
  DECK.recycle=rate;
  if(DECK.recycle>=REC_CAP){
    ['salvage5','salvage10','salvage20'].forEach(purgeCard);
    toast('回收率已达 80% · 拆解牌退场','good');
  }
  S.stats.played++;bumpSeen('play',sc.id);
  S.pendingSalvage=null;S.mode='play';S.handDirty=true;S.aimUid=null;
  showOv('removeOv',false);
  FX.cast('salvage',P.x,P.y,{tier:CDEFS[sc.id].tier||5});
  sfx('salvage');
}
function cancelSalvage(){S.pendingSalvage=null;S.mode='play';showOv('removeOv',false);}
$('rmCancel').addEventListener('click',cancelSalvage);

/* 手牌已满：换牌或跳过 */
function offerSwap(n,reason){
  if(n<=0||!DECK.hand.length)return;
  S.swapLeft=n;S.swapReason=reason||'手牌已满';S.mode='swap';renderSwap();showOv('swapOv',true);sfx('page');
}
function renderSwap(){
  $('swapTitle').textContent='手牌已满';
  $('swapSub').textContent=`${S.swapReason} · 选择一张手牌弃置并补抽 1 张，或跳过（剩余 ${S.swapLeft} 次）`;
  const list=$('swapList');list.innerHTML='';
  DECK.hand.forEach(c=>{
    const d=CDEFS[c.id];
    const el=document.createElement('button');
    el.className='rmItem';
    el.innerHTML=`<span class="ri" style="color:${d.color}">${svg(d.icon,17)}</span>
      <span class="rt"><b>${d.name}</b><span>${costStr(d)}</span></span>
      <span class="rf">弃置<br>补抽</span>`;
    el.addEventListener('click',()=>doSwap(c.uid));
    list.appendChild(el);
  });
}
function doSwap(uid){
  const i=DECK.hand.findIndex(c=>c.uid===uid);if(i<0)return;
  const cap=DECK.hand.length; // 换牌前手牌数：晨读超额手牌也能补满到原数量
  if(!DECK.draw.length&&!DECK.discard.length){toast('牌库已空，无法补抽','warn');sfx('deny');return;}
  const old=DECK.hand.splice(i,1)[0];
  DECK.discard.push(old);
  if(!drawOne(cap)){
    DECK.discard.pop();DECK.hand.splice(i,0,old);
    toast('补抽失败 · 已保留原手牌','warn');sfx('deny');return;
  }
  S.swapLeft--;S.handDirty=true;
  puff(P.x,P.y,8,'#57e6ff',1.8,.5,2.5);sfx('swap');
  if(S.swapLeft>0&&DECK.hand.length)renderSwap();
  else closeSwap(true);
}
function closeSwap(playSfx){
  showOv('swapOv',false);S.mode='play';S.swapLeft=0;
  if(playSfx)sfx('ui');
}
$('swapSkip').addEventListener('click',()=>closeSwap(true));

/* ---------------- 粒子 ---------------- */
const partPool=[];
function newPart(){return partPool.pop()||{};}
const fxAtlasCache=Object.create(null);
const FX_SHAPE={soft:0,shard:1,rune:2,spark:3};
function fxAtlas(col){
  if(fxAtlasCache[col])return fxAtlasCache[col];
  const cv=document.createElement('canvas');cv.width=256;cv.height=64;
  const g=cv.getContext('2d');
  let gr=g.createRadialGradient(32,32,1,32,32,30);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.45,'rgba(255,255,255,.75)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.beginPath();g.arc(32,32,30,0,TAU);g.fill();
  g.fillStyle='rgba(255,255,255,.95)';
  g.beginPath();g.moveTo(96,6);g.lineTo(104,32);g.lineTo(96,58);g.lineTo(88,32);g.closePath();g.fill();
  g.strokeStyle='rgba(255,255,255,.6)';g.lineWidth=2;
  g.beginPath();g.moveTo(76,32);g.lineTo(116,32);g.moveTo(96,12);g.lineTo(96,52);g.stroke();
  g.fillStyle='rgba(255,255,255,.95)';
  g.beginPath();g.moveTo(160,4);g.lineTo(166,26);g.lineTo(188,32);g.lineTo(166,38);g.lineTo(160,60);g.lineTo(154,38);g.lineTo(132,32);g.lineTo(154,26);g.closePath();g.fill();
  g.fillStyle='rgba(255,255,255,.5)';g.beginPath();g.arc(160,32,5,0,TAU);g.fill();
  g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=2;
  g.beginPath();g.moveTo(224,10);g.lineTo(224,20);g.moveTo(224,44);g.lineTo(224,54);g.moveTo(202,32);g.lineTo(212,32);g.moveTo(236,32);g.lineTo(246,32);g.stroke();
  g.fillStyle='rgba(255,255,255,1)';g.beginPath();g.arc(224,32,8,0,TAU);g.fill();
  g.globalCompositeOperation='source-in';g.fillStyle=col;g.fillRect(0,0,256,64);g.globalCompositeOperation='source-over';
  fxAtlasCache[col]=cv;return cv;
}
function puff(x,y,n,col,spd=2,life=.5,size=3,grav=0,shape=null){
  for(let i=0;i<n;i++){
    if(parts.length>420)partPool.push(parts.shift());
    const a=rand(TAU),v=rand(.3,1)*spd,p=newPart();
    p.x=x;p.y=y;p.z=rand(2,14);p.vx=Math.cos(a)*v;p.vy=Math.sin(a)*v;p.vz=rand(10,50);
    p.life=life*rand(.6,1.2);p.max=p.life;p.col=col;p.size=size*rand(.6,1.3);p.grav=grav;p.ring=false;p.shape=shape;
    parts.push(p);
  }
}
function ring(x,y,col,r0,r1,life=.4){
  if(parts.length>420)partPool.push(parts.shift());
  const p=newPart();p.x=x;p.y=y;p.z=0;p.ring=true;p.r0=r0;p.r1=r1;p.life=life;p.max=life;p.col=col;parts.push(p);
}
function floater(x,y,txt,col,big){if(floats.length>34)floats.shift();floats.push({x,y,txt,col,life:.9,big});}
function shake(m){if(!reduceMotion)cam.shake=Math.min(14,cam.shake+m);}

