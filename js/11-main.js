'use strict';
/* ---------------- 流程 ---------------- */
function showOv(id,on){$(id).classList.toggle('show',on);}
function startRun(){
  auInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  clearInterval(emberTimer);codexOpen=false;
  ['codexOv','menu','endOv','pauseOv','dawnOv','removeOv'].forEach(id=>showOv(id,false));
  initRun();S.mode='play';
  UI.hud.classList.remove('hidden');refreshStacks();
  banner('第 1 日','拖动卡牌到地面筑防','');sfx('dawn');
  requestAnimationFrame(layoutHand);
}
function pauseGame(){
  if(S.mode!=='play'||codexOpen)return;
  S.mode='pause';endDrag(true);persist();showOv('pauseOv',true);sfx('ui');
}
function resumeGame(){if(S.mode!=='pause')return;S.mode='play';showOv('pauseOv',false);sfx('ui');}
function skipToNight(){
  if(S.mode!=='play'||S.phase!=='day')return;
  S.timeLeft=0;startNight();
}
function toTitle(){
  S.mode='menu';codexOpen=false;
  ['pauseOv','endOv','dawnOv','removeOv','codexOv'].forEach(id=>showOv(id,false));
  UI.hud.classList.add('hidden');initRun();S.nightAmt=.55;refreshMenu();showOv('menu',true);auPhase(false);
}
function refreshMenu(){
  $('emberNum').textContent=save.embers;
  $('bestChip').textContent=save.best.nights>0?`${save.best.nights} 夜 · ${save.best.kills} 击杀`:'尚无记录';
  const dr=$('diffRow');
  if(!dr.children.length){
    dr.innerHTML=Object.entries(DIFFS).map(([k,d])=>`<button class="diffBtn" data-d="${k}">${d.name}<small>${d.sub}</small></button>`).join('');
    dr.querySelectorAll('.diffBtn').forEach(el=>el.addEventListener('click',()=>{
      save.diff=el.dataset.d;persist();refreshMenu();sfx('ui');}));
  }
  dr.querySelectorAll('.diffBtn').forEach(el=>el.classList.toggle('sel',el.dataset.d===save.diff));
  const bl=$('blessList');
  bl.innerHTML=Object.entries(BLESS).map(([k,b])=>{
    const lv=save.bless[k],maxed=lv>=b.max,cost=maxed?0:b.costs[lv];
    const pips=Array.from({length:b.max},(_,i)=>`<span class="pip${i<lv?' on':''}"></span>`).join('');
    return `<div class="blessRow">${svg(b.icon,21,b.color)}
      <div class="blessInfo"><b>${b.name} <span style="color:${b.color};font-size:11px">Lv.${lv}</span></b>
      <span>${b.desc}</span><div class="pips">${pips}</div></div>
      <button class="buyBtn" data-k="${k}" ${maxed||save.embers<cost?'disabled':''}>${maxed?'满':cost}</button></div>`;
  }).join('');
  bl.querySelectorAll('.buyBtn').forEach(el=>el.addEventListener('click',()=>{
    const k=el.dataset.k,b=BLESS[k],lv=save.bless[k];
    if(lv>=b.max||save.embers<b.costs[lv])return;
    save.embers-=b.costs[lv];save.bless[k]++;persist();sfx('level');refreshMenu();
  }));
}

/* ---------------- 主循环 ---------------- */
let lastT=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-lastT)/1000,1/30);lastT=now;
  if(codexOpen){S.elapsed+=dt*.35;render();cxDrawPreview(dt);return;}
  if(S.mode==='menu'){
    S.elapsed+=dt;
    const a=S.elapsed*.12;
    cam.x=CEN+Math.cos(a)*5;cam.y=CEN+Math.sin(a)*5;cam.z=lerp(cam.z,1.15,dt*2);
    P.x=CEN+2.2;P.y=CEN+.5;P.face=a+Math.PI;
    updateParts(dt);
    if(Math.random()<dt*3)puff(CEN+rand(-6,6),CEN+rand(-6,6),1,'#ffd9a0',.3,1.6,1.8,-20);
    core.beam=.6;
  }else if(S.mode==='play'){
    updateMouseWorld();
    let wdt=dt*S.speed;
    if(S.hitstop>0){S.hitstop-=dt;wdt=0;}
    if(wdt>0)update(wdt);
    if(S.handDirty)renderHand();
  }else if(S.mode==='launch'){
    S.launchT+=dt;S.elapsed+=dt;updateParts(dt);
    core.beam=1;cam.shake=Math.max(0,cam.shake-dt*30);
    cam.sx=rand(-1,1)*cam.shake;cam.sy=rand(-1,1)*cam.shake;
    cam.x=lerp(cam.x,core.x,dt*1.5);cam.y=lerp(cam.y,core.y,dt*1.5);
    if(Math.random()<dt*30)puff(core.x+rand(-1,1),core.y+rand(-1,1),1,'#ffe0a8',1,1.4,2.5,-60);
    if(S.launchT>=2.8)showEnd(true);
  }else if(S.mode==='over'){
    S.elapsed+=dt;updateParts(dt);
    cam.shake=Math.max(0,cam.shake-dt*30);
    cam.sx=rand(-1,1)*cam.shake;cam.sy=rand(-1,1)*cam.shake;
    S.overT-=dt;if(S.overT<=0)showEnd(false);
  }else{
    S.elapsed+=dt*.3;updateParts(dt*.3);
    if(S.handDirty)renderHand();
  }
  if(S.dragUid&&dragBuildType)drawDragBuild();
  render();syncHUD();
}

/* ---------------- 启动 ---------------- */
cacheUI();resize();setMuted(save.muted);
$('btnSpeed').textContent='1×';
$('btnNight').addEventListener('click',()=>{auInit();skipToNight();});
$('btnPause').addEventListener('click',()=>{auInit();S.mode==='play'?pauseGame():(S.mode==='pause'&&!codexOpen&&resumeGame());});
$('btnMute').addEventListener('click',()=>{auInit();setMuted(!save.muted);sfx('ui');});
$('btnSpeed').addEventListener('click',()=>{
  auInit();S.speed=S.speed===1?2:1;
  $('btnSpeed').textContent=S.speed+'×';$('btnSpeed').classList.toggle('warnState',S.speed===2);sfx('ui');});
$('btnResume').addEventListener('click',resumeGame);
$('btnRestart').addEventListener('click',()=>{showOv('pauseOv',false);startRun();});
$('btnToTitle').addEventListener('click',toTitle);
$('btnAgain').addEventListener('click',()=>{clearInterval(emberTimer);startRun();});
$('btnTitle2').addEventListener('click',()=>{clearInterval(emberTimer);toTitle();});
$('startBtn').addEventListener('click',startRun);
$('repairBtn').addEventListener('click',tryRepair);
initRun();S.nightAmt=.55;refreshMenu();refreshStacks();
requestAnimationFrame(loop);
