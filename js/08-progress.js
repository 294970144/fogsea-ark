'use strict';
/* ---------------- 黎明选择 ---------------- */
function openDawn(){
  S.mode='dawn';S.dawnStep=0;
  S.dawnCards=rollRewards(3);
  const pool=BLESSINGS.filter(b=>!b.max||(P.stacks[b.id]||0)<b.max);
  const weights={c:60,r:30,e:12},bag=[];
  pool.forEach(b=>{for(let i=0;i<weights[b.rar];i++)bag.push(b);});
  S.dawnBless=[];let guard=0;
  while(S.dawnBless.length<Math.min(3,pool.length)&&bag.length&&guard++<400){
    const b=bag[irand(0,bag.length-1)];if(!S.dawnBless.includes(b))S.dawnBless.push(b);
  }
  renderDawn();showOv('dawnOv',true);
}
function renderDawn(){
  const row=$('dawnRow');row.innerHTML='';
  const t=$('dawnTitle'),sub=$('dawnSub');
  if(S.dawnStep===0){
    $('dawnStep').textContent='1 / 2 · 拾获卡牌';
    t.className='dawnTitle';t.textContent=`第 ${S.day} 日 · 黎明`;
    sub.innerHTML=`选择一张加入牌库 <span class="kb-hint">（1 / 2 / 3）</span> · 手牌 ${DECK.hand.length}/${DECK.max}`;
    S.dawnCards.forEach((id,i)=>{
      const d=CDEFS[id],own=cardTotal(id);
      const el=document.createElement('button');
      el.className='pcard';el.style.borderColor=d.color+'88';
      const ck=Object.keys(d.cost);
      const cost=ck.length?ck.map(k=>`<b style="color:${RESCOL[k]}">${d.cost[k]}${RESNAME[k]}</b>`).join(''):'<b style="color:#6fe08a">免费</b>';
      el.innerHTML=`<span class="pcHk kb kb-hint">${i+1}</span>${own?`<span class="pcOwn">已有 ×${own}</span>`:''}
        <div class="pcArt" style="color:${d.color}">${svg(d.icon,34)}</div>
        <b>${d.name}</b><div class="pcKind" style="color:${d.color}">${KINDNAME[d.kind]}</div>
        <p>${d.desc}</p><div class="pcCost">${cost}</div>`;
      el.addEventListener('click',()=>pickDawn(i));
      row.appendChild(el);
    });
    $('dawnSkip').textContent='跳过 · 保持精简';
  }else{
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
    DECK.discard.push(mkCard(id));
    toast('获得 '+CDEFS[id].name,'good');sfx('card');
    S.dawnStep=1;renderDawn();
  }else{
    const b=S.dawnBless[i];if(!b)return;
    b.f();P.stacks[b.id]=(P.stacks[b.id]||0)+1;
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
  const n=drawToFull()+drawN(P.bonusDraw);
  S.handDirty=true;
  banner(`第 ${S.day} 日`,'黎明 · 抽 '+n+' 张','');
  if(n)toast('抽入 '+n+' 张牌','good');
}
$('dawnSkip').addEventListener('click',skipDawn);

/* ---------------- 胜负 ---------------- */
function awardEmbers(win){
  const st=S.stats;
  let e=st.nights*3+Math.floor(st.kills/8)+(win?12:0);
  e=Math.round(e*DIFFS[save.diff].ember);
  save.embers+=e;
  save.best.nights=Math.max(save.best.nights,st.nights);
  save.best.kills=Math.max(save.best.kills,st.kills);
  if(win)save.best.wins++;
  persist();return e;
}
function winRun(){S.mode='launch';S.launchT=0;S.win=true;banner('方舟启航','','');sfx('victory');}
function loseRun(){
  S.mode='over';S.overT=1.3;S.win=false;
  puff(core.x,core.y,60,'#ff8a3d',5,1.2,5);ring(core.x,core.y,'rgba(255,77,109,.9)',.5,6,1);
  shake(14);sfx('defeat');
}
let emberTimer=null;
function showEnd(win){
  S.mode='end';const e=awardEmbers(win);
  $('endTitle').textContent=win?'方舟启航':'灯熄雾海';
  $('endTitle').className=win?'win':'lose';
  $('endSub').textContent=win?'七夜已过':'核心陷落';
  const st=S.stats;
  const cells=[[st.nights+' / 7','夜晚'],[st.kills,'击杀'],[st.gathered,'采集'],
    ['Lv.'+st.level,'等级'],[st.played,'出牌'],[DECK.recycle+'%','回收率']];
  $('statsGrid').innerHTML=cells.map(c=>`<div class="statCell"><b>${c[0]}</b><span>${c[1]}</span></div>`).join('');
  $('emberTotal').textContent=`（库存 ${save.embers}）`;
  showOv('endOv',true);
  let cur=0;clearInterval(emberTimer);
  emberTimer=setInterval(()=>{
    cur=Math.min(e,cur+Math.max(1,Math.ceil(e/30)));
    $('emberGain').textContent='+'+cur;
    if(cur>=e)clearInterval(emberTimer);
  },40);
}

