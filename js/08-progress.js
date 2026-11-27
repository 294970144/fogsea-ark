'use strict';
/* ---------------- 黎明选择 ---------------- */
function rollDawnBless(){
  const pool=BLESSINGS.filter(b=>{
    if(b.cls==='mage'&&!isMage())return false;
    if(b.weapon&&b.weapon!==P.weapon)return false;
    if(b.id==='t_nirvana'&&P.nirvanaUsed)return false;
    return (P.stacks[b.id]||0)<(b.max||(S.endless?8:Infinity));
  });
  const weights={c:60,r:30,e:12},bag=[];
  pool.forEach(b=>{for(let i=0;i<weights[b.rar];i++)bag.push(b);});
  S.dawnBless=[];let guard=0;
  while(S.dawnBless.length<Math.min(3,pool.length)&&bag.length&&guard++<400){
    const b=bag[irand(0,bag.length-1)];if(!S.dawnBless.includes(b))S.dawnBless.push(b);
  }
}
/* 刻印已改为卡牌，走牌库抽牌；黎明不再赠送，保留空数组兼容存档形状。 */
function rollDawnSigils(){S.dawnSigils=[];}
function openDawn(){
  S.mode='dawn';S.dawnStep=0;
  S.dawnCards=rollRewards(3);
  injectClassCard(S.dawnCards);
  injectCoreCards(S.dawnCards);
  rollDawnBless();
  rollDawnSigils();
  renderDawn();showOv('dawnOv',true);
}
function renderDawn(){
  const row=$('dawnRow');row.innerHTML='';
  const t=$('dawnTitle'),sub=$('dawnSub');
  if(S.dawnStep===0){
    $('dawnStep').textContent='1 / 2 · 拾获卡牌';
    t.className='dawnTitle';t.textContent=`第 ${S.day} 日 · 黎明`;
    const fullHand=DECK.hand.length>=DECK.max;
    sub.innerHTML=`选择一张加入牌库 <span class="kb-hint">（1 / 2 / 3）</span> · 手牌 ${DECK.hand.length}/${DECK.max}`+
      (fullHand?' <i style="color:var(--danger);font-style:normal">手牌已满 · 新牌直接入手，超限后需回收</i>':'');
    S.dawnCards.forEach((id,i)=>{
      const d=CDEFS[id],own=cardTotal(id);
      const el=document.createElement('button');
      el.className='pcard';el.style.borderColor=d.color+'88';
      const cost=d.cls==='class'?'<b style="color:#b48cff">职业</b>':costHtml(d);
      el.innerHTML=`<span class="pcHk kb kb-hint">${i+1}</span>${own?`<span class="pcOwn">已有 ×${own}</span>`:''}
        <div class="pcArt" style="color:${d.color}">${svg(d.icon,34)}</div>
        <b>${d.name}</b><div class="pcKind" style="color:${d.color}">${d.cls==='class'?'职业':KINDNAME[d.kind]+(d.elem?' · '+ELEMNAME[d.elem]:'')}</div>
        <p>${d.desc}</p><div class="pcCost">${cost}</div>`;
      el.addEventListener('click',()=>pickDawn(i));
      row.appendChild(el);
    });
    $('dawnSkip').textContent='跳过 · 保持精简';
  }else if(S.dawnStep===1){
    $('dawnStep').textContent='2 / 2 · 灯芯祝福';
    t.className='dawnTitle vio';t.textContent='灯芯升华';
    sub.innerHTML=`选择一项永久祝福 <span class="kb-hint">（1 / 2 / 3）</span> · 当前 Lv.${P.lvl}`;
    S.dawnBless.forEach((b,i)=>{
      const st=P.stacks[b.id]||0;
      const el=document.createElement('button');
      el.className='pcard';el.style.borderColor=RARCOL[b.rar]+'99';
      el.innerHTML=`<span class="pcHk kb kb-hint">${i+1}</span>${st?`<span class="pcOwn">×${st}</span>`:''}
        <div class="pcArt" style="color:${RARCOL[b.rar]}">${svg(b.icon,34)}</div>
        <b>${b.n}</b><div class="pcKind" style="color:${RARCOL[b.rar]}">${RARNAME[b.rar]}祝福</div>
        <p>${b.d}</p><div class="pcCost"><b style="color:${RARCOL[b.rar]}">被动生效</b></div>`;
      el.addEventListener('click',()=>pickDawn(i));
      row.appendChild(el);
    });
    $('dawnSkip').textContent='跳过祝福';
  }
}
function pickDawn(i){
  if(S.mode!=='dawn')return;
  if(S.dawnStep===0){
    const id=S.dawnCards[i];if(!id)return;
    if(id==='class_mage'){
      S.stats.played++;bumpSeen('play','class_mage');
      becomeMage();
      rollDawnBless();
      S.dawnStep=1;renderDawn();sfx('card');
      return;
    }
    // 黎明选牌直接入手：手牌已满时故意造成临时超限，交给右下角回收区处理，不再静默塞进弃牌堆。
    const picked=mkCard(id);
    if(picked)DECK.hand.push(picked);
    if(CDEFS[id].elem)P.aff[CDEFS[id].elem]++;
    S.handDirty=true;syncHand(true);
    toast('获得 '+CDEFS[id].name+(DECK.hand.length>DECK.max?' · 手牌超限，记得回收':''),'good');sfx('card');
    S.dawnStep=1;renderDawn();
  }else if(S.dawnStep===1){
    const b=S.dawnBless[i];if(!b)return;
    if(b.f)b.f();P.stacks[b.id]=(P.stacks[b.id]||0)+1;
    bumpSeen('card',b.id);refreshStacks();
    toast('祝福 '+b.n,'good');sfx('level');
    finishDawn();
  }
}
function skipDawn(){
  if(S.mode!=='dawn')return;
  if(S.dawnStep===0){S.dawnStep=1;renderDawn();sfx('ui');}
  else finishDawn();
}
function finishDawn(){
  showOv('dawnOv',false);S.mode='play';
  const before=DECK.hand.length;
  const full=drawToFull();
  const cap=Math.min(handCap(),DECK.max+P.bonusDraw);
  const extra=drawN(P.bonusDraw,cap);
  const n=full+extra;
  S.handDirty=true;
  banner(`第 ${S.day} 日`,'黎明 · 抽 '+n+' 张','');
  if(n)toast('抽入 '+n+' 张牌','good');
  autoSave(); // 黎明选择已落地，此处是干净的第 N 日检查点
}
$('dawnSkip').addEventListener('click',skipDawn);

/* ---------------- 胜负 ---------------- */
function stopEmberTimer(){clearInterval(emberTimer);emberTimer=null;}
function awardEmbers(win){
  const st=S.stats;
  const em=TUNE.ember;
  let e=st.nights*em.perNight+Math.floor(st.kills/em.killsDiv)+(win?em.winBonus:0);
  return Math.round(e*DIFFS[save.diff].ember);
}
// 写失败时回滚奖励且闸门不闭合可重试；清槽失败写墓碑槽，读档直接进结算防重复发奖
function writeTombstone(settled){
  if(slots.active===null||!slots.slots[slots.active])return false;
  const snap=captureSnapshot();
  snap.S.settled=settled;
  const arr=slots.slots.slice();
  arr[slots.active]={v:SLOT_VER,ts:Date.now(),day:S.day,phase:S.phase,
    summary:{nights:S.stats.nights,kills:S.stats.kills,core:Math.ceil(core.hp)+'/'+core.max},snap};
  return persistSlots({v:SLOT_VER,active:slots.active,slots:arr});
}
function finishSettle(prev,settled){
  S.settled=settled;
  if(!persist()){
    save.embers=prev.embers;save.best.nights=prev.nights;save.best.kills=prev.kills;
    if('wins' in prev)save.best.wins=prev.wins;
    S.settled=null;
    toast('结算写入失败 · 进度已保留，稍后重试','warn');
    return null;
  }
  if(!clearActiveSlot()){
    if(writeTombstone(settled))toast('存档位清理失败 · 已标记本局结束','warn');
    else toast('结算异常 · 请检查浏览器存储','warn');
  }
  return S.settled;
}
// 胜负一旦确定即结算并写档；S.settled 同时是幂等闸门与展示快照
function settle(win){
  if(S.settled)return S.settled;
  const st=S.stats;
  if(S.endless&&S.endlessBase){
    // 无尽阶段只补发胜利基线之后的增量：不重复 +12、不重复 wins++、DIFFS 只施加一次
    const b=S.endlessBase;
    const em=TUNE.ember;
    const delta=em.perNight*(st.nights-b.nights0)+Math.floor(st.kills/em.killsDiv)-Math.floor(b.kills0/em.killsDiv);
    const e=Math.round(delta*DIFFS[save.diff].ember);
    const prev={embers:save.embers,nights:save.best.nights,kills:save.best.kills};
    save.embers+=e;
    save.best.nights=Math.max(save.best.nights,st.nights);
    save.best.kills=Math.max(save.best.kills,st.kills);
    return finishSettle(prev,{win,embers:e,nights0:b.nights0,kills0:b.kills0,incremental:true});
  }
  const e=awardEmbers(win);
  const prev={embers:save.embers,nights:save.best.nights,kills:save.best.kills,wins:save.best.wins};
  save.embers+=e;
  save.best.nights=Math.max(save.best.nights,st.nights);
  save.best.kills=Math.max(save.best.kills,st.kills);
  if(win)save.best.wins++;
  return finishSettle(prev,{win,embers:e,nights0:st.nights,kills0:st.kills});
}
function freezeBattle(){
  shots.length=0;warns.length=0;
  core.hp=clamp(core.hp,0,core.max);
  stopEmberTimer();
}
function winRun(){S.mode='launch';S.launchT=0;S.win=true;freezeBattle();settle(true);banner('方舟启航','','');sfx('victory');}
function loseRun(){
  S.mode='over';S.overT=1.3;S.win=false;freezeBattle();settle(false);
  puff(core.x,core.y,60,'#ff8a3d',5,1.2,5);ring(core.x,core.y,'rgba(255,77,109,.9)',.5,6,1);
  shake(14);sfx('defeat');
}
function continueEndless(){
  if(!S.settled||!S.settled.win)return;
  S.endlessBase={nights0:S.settled.nights0,kills0:S.settled.kills0};
  S.settled=null;S.endless=true;
  showOv('endOv',false);stopEmberTimer();blurFocus();
  S.launchT=0;S.overT=0;S.win=false;
  S.aimUid=null;S.dragUid=null;S.dragPointerId=null;S.dragStart=[0,0];
  dragBuildType=null;$('dragCard').style.display='none';
  enterNextDay();
}
let emberTimer=null;
function showEnd(win){
  S.mode='end';
  if(!S.settled)settle(win); // 兜底：正常路径在判胜/判负瞬间已结算
  if(!S.settled){
    $('endTitle').textContent='结算未完成';
    $('endTitle').className='lose';
    $('endSub').textContent='浏览器存储写入失败，本次火种未发放。请返回标题后重试。';
    $('statsGrid').innerHTML='';
    $('emberGain').textContent='+0';$('emberTotal').textContent=`（库存 ${save.embers}）`;
    $('btnEndless').style.display='none';
    showOv('endOv',true);return;
  }
  const e=S.settled.embers,realWin=S.settled.win,st=S.stats;
  $('endTitle').textContent=realWin?'方舟启航':'灯熄雾海';
  $('endTitle').className=realWin?'win':'lose';
  $('endSub').textContent=realWin?(S.endless?'远航已完成 · 守护继续':'七夜已过'):(S.endless?'无尽守护结束':'核心陷落');
  const cells=[[st.nights+(S.endless?' / ∞':' / 7'),'夜晚'],[st.kills,'击杀'],[st.gathered,'采集'],
    ['Lv.'+st.level,'等级'],[st.played,'出牌'],[DECK.recycle+'%','回收率']];
  $('statsGrid').innerHTML=cells.map(c=>`<div class="statCell"><b>${c[0]}</b><span>${c[1]}</span></div>`).join('');
  $('emberTotal').textContent=`（库存 ${save.embers}）`;
  $('btnEndless').style.display=(realWin&&!S.endless)?'':'none';
  showOv('endOv',true);
  let cur=0;stopEmberTimer();
  emberTimer=setInterval(()=>{
    cur=Math.min(e,cur+Math.max(1,Math.ceil(e/30)));
    $('emberGain').textContent='+'+cur;
    if(cur>=e)clearInterval(emberTimer);
  },40);
}

