'use strict';
/* ---------------- 手牌 UI ---------------- */
const HAND_KEYS='1234567890-=';
function cardInner(def,hot){
  const cost=def.cls==='class'?'<b style="color:#b48cff">职业</b>':costHtml(def,true);
  const q=CARD_Q[def.q||1];
  const badge=(def.q||1)>=2?`<i class="hcQ" style="background:linear-gradient(135deg,${q.c1},${q.c2});color:${q.fg}">${q.name}</i>`:'';
  const slot=def.sigil?'<i class="hcSlot" aria-hidden="true"></i>':'';
  return `<span class="hcHot kb-hint">${hot||''}</span>
    <div class="hcCost">${cost}${badge}</div>
    <div class="hcMark" style="color:${def.color}">${svg(def.icon,96)}</div>
    <div class="hcName">${def.name}</div>
    <div class="hcDesc">${def.brief||def.desc}</div>${slot}`;
}
function makeHandCard(c,i){
  const def=CDEFS[c.id];
  const el=document.createElement('div');
  el.className='hcard';el.dataset.uid=c.uid;
  el.style.setProperty('--el',def.color||'#8fa9b8');
  el.style.setProperty('--i',String(i));
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
  return el;
}
function renderHand(){
  const row=$('handRow');row.innerHTML='';
  DECK.hand.forEach((c,i)=>row.appendChild(makeHandCard(c,i)));
  layoutHand();S.handDirty=false;syncHand(true);
}
function handCardEl(uid){return $('handRow').querySelector(`.hcard[data-uid="${uid}"]`);}
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
    el.style.setProperty('--i',String(i));
    const hot=el.querySelector('.hcHot');if(hot)hot.textContent=HAND_KEYS[i]||'';
  });
}
/* 局部增删手牌，避免整手重建导致 handIn 全部重播 */
function removeHandCard(uid){
  const el=handCardEl(uid);if(el)el.remove();
  if(S.aimUid===uid)S.aimUid=null;
  layoutHand();syncHand(true);
}
function addHandCard(card,index,fromRect){
  const row=$('handRow'),i=Math.max(0,Math.min(index,row.children.length));
  const el=makeHandCard(card,i);
  row.insertBefore(el,row.children[i]||null);
  layoutHand();syncHand(true);
  if(fromRect&&!reducedMotion()){
    const to=el.getBoundingClientRect();
    const def=CDEFS[card.id],m=sigilMeta(card.id);
    flySigil(fromRect,to,`<div class="dragSigil" style="color:${m?m.color:def.color}">${svg(m?m.icon:def.icon,36)}</div>`,def.color);
    pulseCard(el);
  }
  return el;
}
/* 从来源矩形飞到目标矩形；只做视觉补间，不改游戏状态 */
function flySigil(from,to,html,color,onDone){
  if(reducedMotion()||!from||!to||typeof Element.prototype.animate!=='function'){if(onDone)onDone();return;}
  const el=document.createElement('div');el.className='sigilFly';
  el.style.cssText=`left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;--el:${color||'#8fa9b8'}`;
  el.innerHTML=html;document.body.appendChild(el);
  const dx=to.left+to.width/2-(from.left+from.width/2);
  const dy=to.top+to.height/2-(from.top+from.height/2);
  const scale=Math.max(.35,Math.min(1.8,to.width/Math.max(1,from.width)));
  const a=el.animate([{transform:'translate(0,0) scale(1)',opacity:1},
    {transform:`translate(${dx}px,${dy}px) scale(${scale})`,opacity:.15}],
    {duration:280,easing:'cubic-bezier(.34,1.56,.64,1)'});
  const fin=()=>{el.remove();if(onDone)onDone();};
  a.onfinish=fin;a.oncancel=fin;
}
function pulseCard(el){
  if(reducedMotion()||!el||typeof el.animate!=='function')return;
  const a=el.animate([{transform:'scale(.88)',opacity:.5},{transform:'scale(1)',opacity:1}],
    {duration:300,easing:'cubic-bezier(.34,1.56,.64,1)'});
  a.onfinish=()=>null;
}
function reducedMotion(){return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;}
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
    el.innerHTML=`<div class="dragSigil" style="color:${m?m.color:def.color}">${svg(m?m.icon:def.icon,36)}</div>`;
  }else{
    el.innerHTML=`<div class="hcard" style="position:relative;left:0;transform:none;width:100%;height:100%;--el:${def.color||'#8fa9b8'}">${cardInner(def,'')}</div>`;
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
  el.innerHTML=`<div class="dragSigil" style="color:${m.color}">${svg(m.icon,36)}</div>`;
  el.style.display='block';
  const h=UI.weaponSlotsRow&&UI.weaponSlotsRow.querySelector(`.wslot[data-slot="${i}"]`);
  if(h)h.classList.add('dragging');
}
function endSlotDrag(){
  if(slotDrag){
    const h=slotEl(slotDrag.i);
    if(h)h.classList.remove('dragging');
  }
  slotDrag=null;clearSlotHover();
  $('dragCard').style.display='none';
}
/* 落点高亮：靠近槽位时吸附放大，离开即还原 */
let slotHoverEl=null;
function slotEl(i){return UI.weaponSlotsRow&&UI.weaponSlotsRow.querySelector(`.wslot[data-slot="${i}"]`);}
function slotBoxRect(i){const el=slotEl(i),b=el&&el.querySelector('.wslotBox');return b&&b.getBoundingClientRect();}
function markSlotHover(x,y){
  const hit=typeof document.elementFromPoint==='function'?document.elementFromPoint(x,y):null;
  const next=hit&&hit.closest?hit.closest('.wslot'):null;
  if(slotHoverEl===next)return;
  if(slotHoverEl)slotHoverEl.classList.remove('dropTarget');
  slotHoverEl=next;
  if(next)next.classList.add('dropTarget');
}
function clearSlotHover(){
  if(slotHoverEl)slotHoverEl.classList.remove('dropTarget');
  slotHoverEl=null;
}
function pulseSlot(i,filled){
  const el=slotEl(i);if(!el||reducedMotion())return;
  const box=el.querySelector('.wslotBox');if(!box||typeof box.animate!=='function')return;
  box.animate(filled?[{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}]
    :[{transform:'scale(1)',opacity:.8},{transform:'scale(.9)',opacity:.45},{transform:'scale(1)',opacity:1}],
    {duration:320,easing:'cubic-bezier(.34,1.56,.64,1)'});
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
  clearHold();clearSlotHover();
  const uid=S.dragUid;
  S.dragUid=null;S.dragMoved=false;S.dragStart=[0,0];S.dragPointerId=null;dragBuildType=null;
  $('dragCard').style.display='none';
  if(UI.recycleZone)UI.recycleZone.classList.remove('dragOver');
  if(uid){const h=document.querySelector(`.hcard[data-uid="${uid}"]`);if(h)h.classList.remove('drag');}
  if(typeof clearFuseMarks==='function')clearFuseMarks();
}
function selectCard(uid){
  const c=handCard(uid);if(!c)return;
  S.aimUid=uid;sfx('card');syncHand(true);
}
function clearAim(){S.aimUid=null;syncHand(true);}
function syncHand(force){
  const night=S.phase==='night',over=DECK.hand.length>DECK.max;
  document.querySelectorAll('#handRow .hcard').forEach(el=>{
    const uid=+el.dataset.uid,c=handCard(uid);if(!c)return;
    const def=CDEFS[c.id];
    const off=!afford(def);
    const nn=night&&def.kind==='build';
    if(force||el._off!==off){el._off=off;el.classList.toggle('off',off&&!nn);}
    if(force||el._nn!==nn){el._nn=nn;el.classList.toggle('noNight',nn);}
    if(force||el._overCap!==over){el._overCap=over;el.classList.toggle('overCap',over);}
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
  setTxt(UI.handWarn,over?' · 手牌已达上限':'');
  if(!over)S.overflowWarned=false;
  const chip=UI.handN.parentNode;
  if(chip._over!==over){chip._over=over;chip.classList.toggle('over',over);}
  if(chip._n!==DECK.hand.length){chip._n=DECK.hand.length;chip.classList.remove('pop');void chip.offsetWidth;chip.classList.add('pop');}
  if(UI.recycleZone){
    if(UI.recycleZone._over!==over){
      UI.recycleZone._over=over;
      UI.recycleZone.classList.toggle('show',over);
      UI.recycleZone.setAttribute('aria-hidden',over?'false':'true');
    }
    setTxt(UI.recycleBack,DECK.recycle+'%');
    const armed=over&&!!S.aimUid;
    if(UI.recycleZone._armed!==armed){UI.recycleZone._armed=armed;UI.recycleZone.classList.toggle('armed',armed);}
  }
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
/* 卡是实体，槽位是它的另一个位置：装槽=手牌→指定槽位，卸下=槽位→手牌，牌库总量不变。
   P.sigils 是定长槽位数组，空位为 null；不能按顺序强塞，也不能覆盖后把后面的卡挤掉。 */
function engraveCard(uid,targetSlot,dragRect){
  const idx=DECK.hand.findIndex(c=>c.uid===uid);if(idx<0)return false;
  const card=DECK.hand[idx],def=CDEFS[card.id];
  if(!def||!def.sigil){toast('此卡没有刻印标签','warn');sfx('deny');return false;}
  const w=weaponDef(P.weapon),cap=w.slots||0;
  if(w.attack!=='spell'&&!def.sigilOnly){toast('法术刻印只能装入法杖','warn');sfx('deny');return false;}
  const list=P.sigils||[];
  let slot=Number.isInteger(targetSlot)&&targetSlot>=0&&targetSlot<cap?targetSlot:list.findIndex(c=>!c);
  if(slot<0)slot=list.findIndex(c=>!c);
  if(slot<0){toast('刻印槽已满','warn');sfx('deny');return false;}
  const el=handCardEl(uid),fromRect=dragRect||(el&&el.getBoundingClientRect()),toRect=slotBoxRect(slot);
  const displaced=list[slot]||null;
  DECK.hand.splice(idx,1);
  list[slot]=card;
  if(displaced)DECK.hand.splice(idx,0,displaced);
  if(S.aimUid===uid)S.aimUid=null;
  if(fromRect&&toRect){
    const m=sigilMeta(card.id);
    const html=dragRect&&m?`<div class="dragSigil" style="color:${m.color}">${svg(m.icon,36)}</div>`:el.outerHTML;
    flySigil(fromRect,toRect,html,def.color);
  }
  removeHandCard(uid);
  if(displaced)addHandCard(displaced,idx,toRect);
  if(typeof syncSlotEls==='function')syncSlotEls();
  pulseSlot(slot,true);
  if(isSigilId(card.id))bumpSeen('sigil',card.id);else bumpSeen('play',card.id);
  toast(displaced?'替换 '+def.name:'已刻印 '+def.name,'good');sfx('level');
  return true;
}
function unfillSlot(i,dragRect){
  const list=P.sigils||[],cap=weaponDef(P.weapon).slots||0;
  if(!Number.isInteger(i)||i<0||i>=cap||!list[i])return false;
  if(DECK.hand.length>=handCap()){toast('手牌已达硬上限 '+handCap()+' · 请先回收','warn');sfx('deny');return false;}
  const card=list[i],def=CDEFS[card.id],fromRect=dragRect||slotBoxRect(i);
  list[i]=null;DECK.hand.push(card);
  addHandCard(card,DECK.hand.length-1,fromRect);
  if(typeof syncSlotEls==='function')syncSlotEls();
  pulseSlot(i,false);sfx('ui');
  toast('卸下 '+def.name+' 到手牌','good');
  return true;
}
/* 槽内刻印可以直接拖到另一个槽：空槽移动，占用槽交换。
   dragRect 是松手瞬间拖影的位置——补间必须从那里出发，否则图标会先跳回源槽再飞，观感割裂。 */
function moveSlotCard(from,to,dragRect){
  const list=P.sigils||[],cap=weaponDef(P.weapon).slots||0;
  if(!Number.isInteger(from)||!Number.isInteger(to)||from===to)return false;
  if(from<0||from>=cap||to<0||to>=cap||!list[from])return false;
  const moving=list[from],displaced=list[to];
  const targetRect=slotBoxRect(to),sourceRect=slotBoxRect(from);
  const mm=moving&&sigilMeta(moving.id),mc=mm?mm.color:'#8fa9b8';
  list[to]=moving;list[from]=displaced;
  if(typeof syncSlotEls==='function')syncSlotEls();
  const tEl=slotEl(to),sEl=slotEl(from);
  if(!reducedMotion()&&targetRect){
    // 飞行期间隐藏落点图标，避免「瞬时出现在新槽 + 飞行残影」两套画面
    if(tEl)tEl.classList.add('landing');
    const start=dragRect||sourceRect;
    if(mm)flySigil(start,targetRect,`<div class="dragSigil" style="color:${mc}">${svg(mm.icon,36)}</div>`,mc,
      ()=>{if(tEl)tEl.classList.remove('landing');pulseSlot(to,true);});
    else if(tEl)tEl.classList.remove('landing');
    if(displaced){
      const dm=sigilMeta(displaced.id);
      if(sEl)sEl.classList.add('landing');
      if(dm&&sourceRect)flySigil(targetRect,sourceRect,`<div class="dragSigil" style="color:${dm.color}">${svg(dm.icon,36)}</div>`,dm.color,
        ()=>{if(sEl)sEl.classList.remove('landing');});
      else if(sEl)sEl.classList.remove('landing');
    }
  }
  sfx('card');
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
  if(def.salvage){toast('拆解牌要拖到要拆的手牌上','warn');sfx('deny');return false;}
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
    /* 熔铸产物打出即消失 */
    if(!def.fuseOut)DECK.discard.push(card);
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
  if(def.kind!=='instant')return;
  if(def.elem)return castSpell(def,tx,ty,overflow);
  return applyFuse(def,tx,ty);
}
/* ---------------- 熔铸 ----------------
   两张源牌回弃牌堆，产物进手牌、打出即消失。
   产物带 fuseOut：不进奖励池，也不能再作为熔铸源。 */
const FUSE_SEL='fuseOK';
/* 拖起某张牌时，把能与之组合的手牌标亮：熔铸走配方表，拆解对任意手牌成立 */
const SALVAGE_SEL='salvageOK';
function markFuseTargets(uid){
  const src=handCard(uid);if(!src)return;
  const srcSalvage=isSalvage(src.id);
  document.querySelectorAll('#handRow .hcard').forEach(el=>{
    const t=+el.dataset.uid;
    if(!t||t===uid)return;
    const other=handCard(t);
    if(!other)return;
    const bySalvage=srcSalvage||isSalvage(other.id);
    el.classList.toggle(FUSE_SEL,!bySalvage&&!!fusionOf(src.id,other.id));
    el.classList.toggle(SALVAGE_SEL,bySalvage);
  });
}
function clearFuseMarks(){
  document.querySelectorAll('#handRow .hcard.'+FUSE_SEL+', #handRow .hcard.'+SALVAGE_SEL)
    .forEach(el=>el.classList.remove(FUSE_SEL,SALVAGE_SEL));
}
/* 拖放落点判定：两张手牌合法则熔铸，否则回退到原逻辑（出牌/选中） */
function tryFuse(uidA,uidB){
  const a=handCard(uidA),b=handCard(uidB);
  if(!a||!b||uidA===uidB)return false;
  // 拆解牌与任意手牌「融合」= 拆解：任一方向拖放都成立
  if(isSalvage(a.id))return trySalvageFuse(a,b);
  if(isSalvage(b.id))return trySalvageFuse(b,a);
  const out=fusionOf(a.id,b.id);
  if(!out){sfx('deny');toast('这两张牌无法熔铸','warn');return false;}
  const def=CDEFS[out],fee=TUNE.fusion.crys;
  if(res.crys<fee){sfx('deny');toast('雾晶不足 · 熔铸需 '+fee+' 晶','warn');return false;}
  /* 先取产物卡再动手：mkCard 失败时不能留下「源牌已删、产物没进」的中间态 */
  const card=mkCard(out);
  if(!card)return false;
  res.crys-=fee;
  /* 只动手上这两张，同名牌的其他副本不动 */
  for(let i=DECK.hand.length-1;i>=0;i--){
    const c=DECK.hand[i],u=c.uid;
    if(u===uidA||u===uidB){DECK.hand.splice(i,1);DECK.discard.push(c);}
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
    if(def.hitNodes)for(const n of nodes)if(n.alive&&dist(tx,ty,n.x,n.y)<R)hitNode(n);
    sfx(def.sfx||'boom');shake(def.shake||6);
  }
  if(def.ifr){
    P.ifr=Math.max(P.ifr,def.ifr);
    if(def.fx)FX.cast(def.fx,P.x,P.y);
    ring(P.x,P.y,q.c1,.2,1.8,.5);puff(P.x,P.y,18,q.c2,2,.7,3);
    floater(P.x,P.y,'无敌 '+def.ifr+'s',q.c1,true);sfx('heal');
  }
  if(def.draw>0){
    const n=drawN(def.draw);
    if(def.fx)FX.cast(def.fx,P.x,P.y);
    floater(P.x,P.y,'抽 '+n+' 张',q.c1,true);
  }
  if(def.refill){gainMana(P.maxEn-P.en);if(def.fx)FX.cast(def.fx,P.x,P.y);}
  // 汲能刻印拖地释放：按卡面 manaGain 回一大管雾能（声明式，不写死卡名）
  if(def.manaGain){
    const got=gainMana(def.manaGain);
    if(def.fx)FX.cast(def.fx,P.x,P.y);
    if(got>0)floater(P.x,P.y,'+'+Math.round(got)+' '+manaLabel(),q.c1,true);
  }
  if(def.dashReset)P.dashCd=0;
  if(def.refill||def.dashReset||def.manaGain)sfx(def.sfx||'nova');
  if(def.heal){
    healPlayer(def.heal);
    if(def.fx)FX.cast(def.fx,P.x,P.y);
    if(def.sfx)sfx(def.sfx);
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
/* ---------------- 拆解 ----------------
   拆解牌拖到任意手牌上：两牌回弃牌堆，按回收率返还造价，回收率 +tier，到 REC_CAP 后退场。 */
function salvageRateOf(card){
  const d=CDEFS[card.id];
  return Math.min(REC_CAP,DECK.recycle+(d&&d.tier||0));
}
function salvageReturnText(cost,rate){
  const parts=Object.keys(cost).map(k=>{
    const v=Math.floor(cost[k]*rate/100);
    return v>0?'+'+v+RESNAME[k]:'';
  }).filter(Boolean);
  return parts.length?parts.join(' '):'无返还';
}
function trySalvageFuse(src,target){
  const def=CDEFS[target.id];
  if(!def){sfx('deny');return false;}
  const rate=salvageRateOf(src);
  const back=salvageReturnText(def.cost,rate);
  for(let i=DECK.hand.length-1;i>=0;i--){
    const c=DECK.hand[i],u=c.uid;
    if(u===src.uid||u===target.uid){DECK.hand.splice(i,1);DECK.discard.push(c);}
  }
  for(const k in def.cost){
    const v=Math.floor(def.cost[k]*rate/100);
    if(v>0){res[k]+=v;floater(P.x,P.y,'+'+v+RESNAME[k],RESCOL[k]);}
  }
  DECK.recycle=rate;
  if(S.aimUid===src.uid||S.aimUid===target.uid)S.aimUid=null;
  S.stats.played++;bumpSeen('play',src.id);
  S.handDirty=true;
  refreshRes();
  FX.cast('salvage',P.x,P.y,{tier:CDEFS[src.id].tier||5});
  sfx('salvage');
  const hit=Object.keys(def.cost).length?' · 返还 '+back:'';
  if(DECK.recycle>=REC_CAP){
    ['salvage5','salvage10','salvage20'].forEach(purgeCard);
    toast('拆解 '+def.name+' · 回收率到顶 · 拆解牌退场','good');
  }else{
    toast('拆解 '+def.name+hit+' · 回收率 '+rate+'%','good');
  }
  syncHand(true);
  return true;
}

/* 超限手牌：永久回收，按当前回收率返还造价。没有弹窗，右下角区域只在超限时出现。 */
function recycleSparkBurst(zone){
  if(!zone||reduceMotion||typeof document.createElement!=='function')return;
  for(let i=0;i<8;i++){
    const s=document.createElement('i');
    s.className='rzSpark';
    s.style.setProperty('--a',(i*45)+'deg');
    s.style.setProperty('--d',(20+(i%3)*10)+'px');
    zone.appendChild(s);
    setTimeout(()=>{if(s.remove)s.remove();},600);
  }
}
function flyRecycledCard(src,zone){
  if(!src||!zone||reduceMotion||typeof src.cloneNode!=='function')return;
  const a=src.getBoundingClientRect(),b=zone.getBoundingClientRect();
  const ghost=src.cloneNode(true);
  ghost.removeAttribute&&ghost.removeAttribute('id');
  ghost.classList.remove('sel','drag','fuseOK','salvageOK','overCap');
  ghost.classList.add('recycleFly');
  ghost.style.left=a.left+'px';ghost.style.top=a.top+'px';
  ghost.style.width=a.width+'px';ghost.style.height=a.height+'px';
  ghost.style.setProperty('--dx',(b.left+b.width/2-a.left-a.width/2)+'px');
  ghost.style.setProperty('--dy',(b.top+b.height/2-a.top-a.height/2)+'px');
  document.body.appendChild(ghost);
  const launch=()=>{ghost.classList.add('go');};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(launch);else launch();
  setTimeout(()=>{
    if(ghost.remove)ghost.remove();
    recycleSparkBurst(zone);
  },460);
}
function deckTotal(){return DECK.hand.length+DECK.draw.length+DECK.discard.length;}
/* 回收（手牌超限的出口）：放回弃牌堆 + 按当前回收率返还材料。 */
function recycleHandCard(uid){
  if(DECK.hand.length<=DECK.max)return false;
  const i=DECK.hand.findIndex(c=>c.uid===uid);if(i<0)return false;
  const card=DECK.hand[i],def=CDEFS[card.id],rate=Math.min(REC_CAP,DECK.recycle);
  const src=document.querySelector?document.querySelector(`.hcard[data-uid="${uid}"]`):null;
  flyRecycledCard(src,UI.recycleZone);
  for(const k in def.cost){
    const v=Math.floor(def.cost[k]*rate/100);
    if(v>0){res[k]+=v;floater(P.x,P.y,'+'+v+RESNAME[k],RESCOL[k]);}
  }
  DECK.hand.splice(i,1);
  DECK.discard.push(card);
  S.aimUid=null;S.handDirty=true;renderHand();
  refreshRes();
  sfx('card');
  const back=salvageReturnText(def.cost,rate);
  toast('已回收 '+def.name+(back==='无返还'?'':' · 返还 '+back),'good');
  return true;
}
function recycleSelected(){
  if(DECK.hand.length<=DECK.max)return;
  if(!S.aimUid){toast('先选中一张手牌，再点回收区','warn');sfx('deny');return;}
  recycleHandCard(S.aimUid);
}
function markRecycleHover(x,y){
  const z=UI.recycleZone;if(!z||!z.classList.contains('show'))return;
  const el=document.elementFromPoint?document.elementFromPoint(x,y):null;
  z.classList.toggle('dragOver',!!(el&&el.closest&&el.closest('#recycleZone')));
}
(function bindRecycleZone(){
  const z=$('recycleZone');if(!z)return;
  z.addEventListener('click',recycleSelected);
  z.addEventListener('keydown',e=>{
    if(S.mode!=='play')return;
    if(e.key==='enter'||e.key===' '){e.preventDefault();if(e.stopPropagation)e.stopPropagation();recycleSelected();}
  });
})();

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

