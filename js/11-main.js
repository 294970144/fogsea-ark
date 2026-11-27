'use strict';
/* ---------------- 流程 ---------------- */
let weaponPicker=null;
const OVERLAYS=['menu','codexOv','endOv','pauseOv','dawnOv','removeOv','swapOv','slotOv','confirmOv'];
function showOv(id,on){$(id).classList.toggle('show',on);}
function closeOverlays(except){
  OVERLAYS.forEach(id=>{if(id!==except)showOv(id,false);});
  if(weaponPicker){weaponPicker=null;$('weaponDrop').classList.remove('show');$('prepWeaponBtn').setAttribute('aria-expanded','false');}
}
function blurFocus(){const el=document.activeElement;if(el&&el.blur)el.blur();}
function menuViewHeight(el){
  const pos=el.style.position,min=el.style.minHeight;
  el.style.position='static';el.style.minHeight='0';
  const h=Math.max(el.scrollHeight,Math.ceil(el.getBoundingClientRect().height));
  el.style.position=pos;el.style.minHeight=min;
  return h;
}
function setMenuView(view,focus=true){
  const panel=$('menuPanel');
  panel.dataset.view=view;
  const el=panel.querySelector(`.menuView[data-view="${view}"]`);
  // 面板为 border-box：测量值只含内容，需补回边框与内边距，否则子视图少几像素而出现滚动条
  const frame=Math.max(0,panel.offsetHeight-panel.clientHeight);
  const naturalHeight=menuViewHeight(el)+frame;
  // CSS owns the cap; read the computed pixel value so layout and scroll logic stay aligned.
  const maxHeight=parseFloat(getComputedStyle(panel).maxHeight);
  // Only enable scrolling when the content cannot fit after the height transition.
  el.classList.toggle('needs-scroll',naturalHeight>maxHeight);
  panel.style.height=Math.min(naturalHeight,maxHeight)+'px';
  if(focus)$(view==='prep'?'launchBtn':view==='load'?'btnLoadBack':'startBtn').focus({preventScroll:true});
}
function openPrep(){
  const needsFreshRun=S.mode!=='menu'&&S.mode!=='prep';
  if(needsFreshRun)initRun();
  clearInterval(emberTimer);codexOpen=false;blurFocus();closeOverlays('menu');showOv('menu',true);
  S.mode='prep';
  UI.hud.classList.add('hidden');refreshPrep();setMenuView('prep');sfx('ui');
}
function openLoadView(){
  blurFocus();codexOpen=false;S.mode='menu';
  resetLoadUi();renderLoadList(true);sfx('ui');
}
function renderLoadList(focus=true){
  const row=$('menuSlotList');row.innerHTML='';
  slots.slots.forEach((s,i)=>{
    const open=loadExpanded===i&&!!s;
    const el=document.createElement('div');
    el.className='slotCard'+(s?'':' empty')+(slots.active===i?' active':'')+(open?' open':'');
    const mage=s&&s.snap&&s.snap.P&&s.snap.P.cls==='mage'?' · 法师':'';
    el.innerHTML=`<span class="si">${i+1}</span><span class="sb"><b>${s?`第 ${s.day} 日 · ${s.phase==='night'?'雾潮':'白昼'}${mage}`:'空'}</b>${s?`<span class="slotMeta">夜 ${s.summary.nights} · 击杀 ${s.summary.kills} · 核心 ${s.summary.core}<br>${new Date(s.ts).toLocaleString('zh-CN')}</span>`:''}</span>`;
    el.addEventListener('click',()=>{
      if(!s){toast('该存档位为空','warn');return;}
      loadExpanded=open?null:i;loadDeleteArm=false;renderLoadList(false);sfx('ui');
    });
    if(open){
      const acts=document.createElement('div');acts.className='slotActions';
      const bLoad=document.createElement('button');
      bLoad.className='slotAct load';bLoad.textContent='载入';
      bLoad.addEventListener('click',e=>{e.stopPropagation();requestLoadSlot(i);resetLoadUi();});
      const bDel=document.createElement('button');
      bDel.className='slotAct del'+(loadDeleteArm?' arm':'');
      bDel.textContent=loadDeleteArm?'确认删除':'删除';
      bDel.addEventListener('click',e=>{
        e.stopPropagation();
        if(!loadDeleteArm){
          loadDeleteArm=true;bDel.textContent='确认删除';bDel.classList.add('arm');
          toast('再点一次确认删除','warn');return;
        }
        if(deleteSlot(i)){
          toast('已删除存档 '+(i+1),'good');resetLoadUi();refreshContinue();renderLoadList(false);sfx('ui');
        }else toast('删除失败','warn');
      });
      acts.appendChild(bLoad);acts.appendChild(bDel);el.appendChild(acts);
    }
    row.appendChild(el);
  });
  setMenuView('load',focus!==false);
}
function startRun(){
  if(weaponPicker)return;
  blurFocus();auInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  clearInterval(emberTimer);codexOpen=false;closeOverlays();
  initRun();S.mode='play';
  UI.hud.classList.remove('hidden');refreshStacks();autoSave();
  banner('第 1 日','拖动卡牌到地面筑防','');sfx('dawn');
  requestAnimationFrame(layoutHand);
}
/* 暂停面板翻页：main / slots / confirm，尺寸固定 */
let pausePage='main',pauseBack='main',pauseCfm=null,pauseSlotOpen=null;
function pauseGo(pg){
  pausePage=pg;
  const i=['main','slots','confirm'].indexOf(pg);
  $('pausePages').style.transform=`translateX(-${i*100/3}%)`;
}
function pauseConfirm(title,sub,onYes,danger){
  pauseCfm=onYes;pauseBack=pausePage;
  $('pauseCfmTitle').textContent=title;$('pauseCfmSub').textContent=sub;
  const yes=$('pauseCfmYes');yes.className='mBtn primary'+(danger?' danger':'');
  $('pauseCfmTitle').classList.toggle('danger',!!danger);
  pauseGo('confirm');sfx('ui');
}
function closePauseConfirm(accept){
  const f=pauseCfm;pauseCfm=null;pauseGo(pauseBack);
  if(accept&&f)f();
}
function renderPauseSlots(){
  const row=$('pauseSlotList');row.innerHTML='';
  slots.slots.forEach((s,i)=>{
    const el=document.createElement('div');
    el.className='slotCard pauseSlot'+(s?'':' empty')+(pauseSlotOpen===i?' open':'')+(slots.active===i?' active':'');
    const mage=s&&s.snap&&s.snap.P&&s.snap.P.cls==='mage'?' · 法师':'';
    const main=s?`第 ${s.day} 日 · ${s.phase==='night'?'雾潮':'白昼'}${mage}`:'空';
    const meta=s?`<span class="slotMeta">夜 ${s.summary.nights} · 击杀 ${s.summary.kills} · 核心 ${s.summary.core}<br>${new Date(s.ts).toLocaleString('zh-CN')}</span>`:'';
    el.innerHTML=`<span class="si">${i+1}</span><span class="sb"><b>${main}</b>${meta}</span>`;
    if(s){
      const mask=document.createElement('div');mask.className='smask';
      const b1=document.createElement('button');b1.textContent='覆盖';
      b1.addEventListener('click',e=>{e.stopPropagation();pauseConfirm('覆盖存档 '+(i+1)+'？','当前槽位的存档将被覆盖。',()=>{
        if(doSaveSlot(i)){refreshContinue();pauseSlotOpen=null;renderPauseSlots();}
      },true);});
      const b2=document.createElement('button');b2.className='del';b2.textContent='删除';
      b2.addEventListener('click',e=>{e.stopPropagation();pauseConfirm('删除存档 '+(i+1)+'？','该槽位的存档将被永久删除。',()=>{
        if(deleteSlot(i)){toast('已删除存档 '+(i+1),'good');refreshContinue();pauseSlotOpen=null;renderPauseSlots();}
      },true);});
      mask.appendChild(b1);mask.appendChild(b2);el.appendChild(mask);
      el.addEventListener('click',()=>{pauseSlotOpen=pauseSlotOpen===i?null:i;renderPauseSlots();sfx('ui');});
    }else{
      el.addEventListener('click',()=>{if(doSaveSlot(i)){refreshContinue();renderPauseSlots();}});
    }
    row.appendChild(el);
  });
}
function pauseQuickSave(){
  let i=slots.active;
  if(i===null||!slots.slots[i])i=slots.slots.findIndex(s=>!s);
  if(i<0){toast('三个存档位已满 · 点卡片覆盖','warn');return;}
  if(doSaveSlot(i)){refreshContinue();renderPauseSlots();}
}
function pauseGame(){
  if(S.mode!=='play'||codexOpen)return;
  S.mode='pause';endDrag();persist();pauseSlotOpen=null;pauseGo('main');showOv('pauseOv',true);sfx('ui');
}
function resumeGame(){if(S.mode!=='pause')return;S.mode='play';showOv('pauseOv',false);sfx('ui');}
function skipToNight(){
  if(S.mode!=='play'||S.phase!=='day')return;
  S.timeLeft=0;startNight();
}
function toTitle(){
  // 返回标题会重建单局状态，先把当前进度落盘，避免丢掉上次检查点之后的推进
  if(['play','pause','slots'].includes(S.mode))autoSave();
  stopEmberTimer();const fromPrep=S.mode==='prep',elapsed=S.elapsed;
  S.mode='menu';codexOpen=false;blurFocus();closeOverlays();
  UI.hud.classList.add('hidden');
  if(!fromPrep){initRun();S.elapsed=elapsed;}
  S.nightAmt=.55;refreshPrep();showOv('menu',true);setMenuView('title');refreshContinue();auPhase(false);
}
function refreshPrep(){
  refreshPrepWeapon();
  $('prepMageNote').textContent=weaponDef(save.weapon).attack==='spell'
    ? '法术武器无需转职：自动开启元素反应，以雾能施放高级法术。'
    : '第 2 日黎明可转职「法师」：生命上限降低，以法力施法，手牌上限提高。';
  $('emberNum').textContent=save.embers;
  $('bestChip').textContent=save.best.nights>0?`${save.best.nights} 夜 · ${save.best.kills} 击杀`:'尚无记录';
  const dr=$('diffRow');
  if(!dr.children.length){
    dr.innerHTML=Object.entries(DIFFS).map(([k,d])=>`<button class="diffBtn" data-d="${k}">${d.name}<small>${d.sub}</small></button>`).join('');
    dr.querySelectorAll('.diffBtn').forEach(el=>el.addEventListener('click',()=>{
      save.diff=el.dataset.d;persist();refreshPrep();sfx('ui');}));
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
    save.embers-=b.costs[lv];save.bless[k]++;persist();sfx('level');refreshPrep();
  }));
}
function refreshPrepWeapon(){
  const w=weaponDef(save.weapon);
  $('prepWeaponIcon').innerHTML=svg(w.icon,22,w.color);
  $('prepWeaponIcon').style.color=w.color;
  $('prepWeaponName').textContent=w.name;
}
function renderWeaponPicker(){
  const row=$('weaponGrid');row.innerHTML='';
  WEAPON_IDS.forEach((id,i)=>{
    const w=WEAPONS[id],sel=weaponPicker.draft===id;
    const el=document.createElement('button');
    el.classList.add('weaponCard');if(sel)el.classList.add('sel');
    el.dataset.weapon=id;
    el.style.setProperty('--weapon-color',w.color);
    el.innerHTML=`<span class="weaponHotkey kb kb-hint">${i+1}</span>
      <span class="weaponIcon"><img src="${w.art}" alt=""></span>
      <span class="weaponCardBody"><b>${w.name}</b><p>${w.desc}</p></span>`;
    el.addEventListener('click',()=>chooseWeapon(id));
    row.appendChild(el);
  });
}
function positionWeaponDrop(){
  if(!weaponPicker)return;
  const prep=document.querySelector('.menuView[data-view="prep"]'),btn=$('prepWeaponBtn'),drop=$('weaponDrop');
  const pr=prep.getBoundingClientRect(),br=btn.getBoundingClientRect(),cs=getComputedStyle(prep);
  drop.style.top=(br.bottom-pr.top+8)+'px';
  drop.style.left=(br.left-pr.left)+'px';
  drop.style.width=br.width+'px';
  drop.style.bottom=Math.max(0,parseFloat(cs.paddingBottom)-2)+'px';
}
function openWeaponPicker(){
  if(S.mode!=='prep')return;
  if(weaponPicker){cancelWeaponPicker();return;}
  weaponPicker={draft:normalizeWeaponId(save.weapon),opener:document.activeElement};
  renderWeaponPicker();$('weaponDrop').classList.add('show');
  $('prepWeaponBtn').setAttribute('aria-expanded','true');$('prepWeaponBtn').querySelector('em').textContent='收起';
  setMenuView('prep',false);positionWeaponDrop();
  $('weaponGrid').querySelector('.weaponCard.sel')?.focus({preventScroll:true});sfx('ui');
}
function selectWeaponDraft(id,focus=true){
  if(!weaponPicker)return;
  weaponPicker.draft=normalizeWeaponId(id);renderWeaponPicker();sfx('ui');
  if(focus)$('weaponGrid').querySelector('.weaponCard.sel')?.focus({preventScroll:true});
}
function closeWeaponPicker(restoreFocus=false){
  if(!weaponPicker)return;
  const opener=weaponPicker.opener;weaponPicker=null;$('weaponDrop').classList.remove('show');
  $('prepWeaponBtn').setAttribute('aria-expanded','false');$('prepWeaponBtn').querySelector('em').textContent='更换';
  setMenuView('prep',false);
  if(restoreFocus&&opener&&opener.focus)opener.focus({preventScroll:true});
}
function chooseWeapon(id){
  if(!weaponPicker)return;
  save.weapon=normalizeWeaponId(id);persist();
  refreshPrep();closeWeaponPicker(true);sfx('card');
}
function cancelWeaponPicker(){closeWeaponPicker(true);sfx('ui');}
function trapWeaponFocus(e){
  const items=[...$('weaponDrop').querySelectorAll('button:not(:disabled)')];
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}

/* ---------------- 通用确认框 ---------------- */
let confirmAction=null,confirmPrevFocus=null;
function askConfirm(opt){
  if(confirmAction)closeConfirm(false);
  confirmPrevFocus=document.activeElement;
  confirmAction={onYes:opt.onYes||null,onNo:opt.onNo||null};
  $('confirmTitle').textContent=opt.title||'确认';
  $('confirmSub').textContent=opt.sub||'';
  const yes=$('confirmYes'),no=$('confirmNo');
  yes.textContent=opt.yes||'确认';
  no.textContent=opt.no||'取消';
  const box=$('confirmOv').querySelector('.confirmBox');
  box.classList.toggle('danger',!!opt.danger);
  yes.classList.toggle('danger',!!opt.danger);
  showOv('confirmOv',true);
  (opt.danger?no:yes).focus({preventScroll:true});
  sfx('ui');
}
function closeConfirm(accept){
  if(!confirmAction)return;
  const a=confirmAction;confirmAction=null;
  showOv('confirmOv',false);
  if(accept&&a.onYes)a.onYes();
  else if(!accept&&a.onNo)a.onNo();
  if(confirmPrevFocus&&confirmPrevFocus.focus)confirmPrevFocus.focus({preventScroll:true});
  confirmPrevFocus=null;
}

/* ---------------- 存档位 ---------------- */
let slotUi=null,slotPick=null,slotDeleteArm=false,slotPrevMode='play';
let loadExpanded=null,loadDeleteArm=false;
function resetLoadUi(){loadExpanded=null;loadDeleteArm=false;}

function refreshContinue(){
  $('btnContinue').classList.toggle('noSave',!slots.slots.some(Boolean));
  const warn=$('saveWarn');
  if(!warn)return;
  warn.hidden=!slots.corrupt;
  if(slots.corrupt){
    const reason=slots.corruptReason==='format'?'存档格式无法识别，已忽略。':'部分存档位损坏，已忽略损坏项。';
    $('saveWarnText').textContent=reason+' 原始数据已留存备份，未覆盖。你可以继续游戏，旧档无法恢复。';
  }
}

function makeSlot(){
  const snap=captureSnapshot();
  snap.S.mode='play'; // 手动存档可能来自暂停/存档面板，读档后直接回到可玩状态
  return {v:SLOT_VER,ts:Date.now(),day:S.day,phase:S.phase,
    summary:{nights:S.stats.nights,kills:S.stats.kills,core:Math.ceil(core.hp)+'/'+core.max},
    snap};
}
function putSlot(i,slot){
  const arr=slots.slots.slice();arr[i]=slot;
  return persistSlots({v:SLOT_VER,active:i,slots:arr});
}
// 日初检查点：只写活跃槽或空槽，三槽全满时拒绝覆盖，交由玩家手动选槽
function autoSave(){
  if(!S.stats||['menu','prep','end','launch','over'].includes(S.mode))return false;
  let i=slots.active;
  if(i===null||!slots.slots[i])i=slots.slots.findIndex(s=>!s);
  if(i<0){
    toast('三个存档位已满 · 按 K 手动选择要覆盖的存档位','warn');
    return false;
  }
  return putSlot(i,makeSlot());
}
function doSaveSlot(i){
  if(!Number.isInteger(i)||i<0||i>=SLOT_N)return false;
  if(!putSlot(i,makeSlot())){toast('存档失败 · 请检查浏览器存储','warn');return false;}
  toast('已存档至槽位 '+(i+1),'good');sfx('ui');return true;
}
function deleteSlot(i){
  if(slots.active===i)return clearActiveSlot();
  const arr=slots.slots.slice();arr[i]=null;
  return persistSlots({v:SLOT_VER,active:slots.active,slots:arr});
}
// HUD 用 _t/_v/_n 等脏标记跳过重绘；读档后必须全部清掉
function clearHudCache(){
  for(const k in UI){
    const el=UI[k];
    if(!el||typeof el!=='object'||Array.isArray(el))continue;
    for(const p in el)if(p.charAt(0)==='_')delete el[p];
  }
}
function beginRun(){
  if(weaponPicker)return;
  if(slots.slots.every(Boolean))openSlots('new');else startRun();
}
// 有进行中的局才二次确认，主菜单无活动局时直接载入
function requestLoadSlot(i){
  const rec=slots.slots[i];
  if(!rec){toast('该存档位为空','warn');return false;}
  const live=S.stats&&['play','pause','slots','dawn','remove','swap'].includes(S.mode);
  if(!live){doLoadSlot(i);return true;}
  askConfirm({
    title:'载入存档 '+(i+1)+'？',
    sub:'当前这一局的进度将被覆盖，且无法撤销。若还没存档，先存档再载入更安全。',
    yes:'仍然载入',no:'取消',danger:true,
    onYes:()=>{doLoadSlot(i);}
  });
  return true;
}
function doLoadSlot(i){
  const rec=slots.slots[i];
  if(!rec){toast('该存档位为空','warn');return false;}
  blurFocus();auInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  stopEmberTimer();codexOpen=false;endDrag();
  dragBuildType=null;const dc=$('dragCard');if(dc)dc.style.display='none';
  restoreSnapshot(rec.snap);
  closeOverlays();
  slotUi=null;slotPick=null;slotDeleteArm=false;
  UI.hud.classList.remove('hidden');UI.toasts.innerHTML='';clearHudCache();
  refreshRes();refreshStacks();syncHUD();renderHand();requestAnimationFrame(layoutHand);
  auPhase(S.phase==='night');
  if(S.settled){showEnd(S.settled.win);return true;}
  if(S.mode==='dawn'){renderDawn();showOv('dawnOv',true);}
  banner(`第 ${S.day} 日 · 已读档`,'','');sfx('dawn');
  if(slots.active!==i)setActiveSlot(i);
  return true;
}
function openSlots(mode){
  slotPrevMode=S.mode;slotUi=mode;slotPick=null;slotDeleteArm=false;blurFocus();
  if(S.mode==='play')S.mode='slots'; // 冻结模拟，选槽时敌人不会继续行动
  renderSlots();showOv('slotOv',true);sfx('ui');
}
function closeSlots(){
  showOv('slotOv',false);
  if(S.mode==='slots')S.mode=slotPrevMode;
  slotUi=null;slotPick=null;slotDeleteArm=false;sfx('ui');
}
function renderSlots(){
  $('slotTitle').textContent=slotUi==='load'?'继续':slotUi==='new'?'新局':'存档';
  const row=$('slotList');row.innerHTML='';
  slots.slots.forEach((s,i)=>{
    const el=document.createElement('button');
    el.className='slotCard'+(s?'':' empty')+(slotPick===i?' sel':'')+(slots.active===i?' active':'');
    const mage=s&&s.snap&&s.snap.P&&s.snap.P.cls==='mage'?' · 法师':'';
    const main=s?`第 ${s.day} 日 · ${s.phase==='night'?'雾潮':'白昼'}${mage}`:'空';
    const meta=s?`<span class="slotMeta">夜 ${s.summary.nights} · 击杀 ${s.summary.kills} · 核心 ${s.summary.core}<br>${new Date(s.ts).toLocaleString('zh-CN')}</span>`:'';
    el.innerHTML=`<span class="si">${i+1}</span><span class="sb"><b>${main}</b>${meta}</span>`;
    el.addEventListener('click',()=>onSlotClick(i,!!s));
    row.appendChild(el);
  });
  const canDelete=slotUi==='save'&&slotPick!==null&&slots.slots[slotPick];
  $('slotDelete').style.display=canDelete?'':'none';
  $('slotDelete').textContent=slotDeleteArm?'确认删除':'删除存档';
}
function onSlotClick(i,occupied){
  if(slotUi==='load'){
    if(!occupied){toast('该存档位为空','warn');return;}
    requestLoadSlot(i);return;
  }
  if(!occupied||slotPick===i){
    if(slotUi==='new'){slots.active=i;closeSlots();startRun();return;}
    if(doSaveSlot(i)){refreshContinue();closeSlots();}
    return;
  }
  slotPick=i;slotDeleteArm=false;renderSlots();sfx('ui');
  toast('再点一次覆盖存档 '+(i+1),'warn');
}
function confirmDelete(){
  const i=slotPick;
  if(slotUi!=='save'||i===null||!slots.slots[i])return;
  if(!slotDeleteArm){slotDeleteArm=true;renderSlots();return;}
  if(deleteSlot(i)){toast('已删除存档 '+(i+1),'good');refreshContinue();closeSlots();}
  else toast('删除失败','warn');
}

/* ---------------- 主循环 ---------------- */
let lastT=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-lastT)/1000,1/30);lastT=now;
  if(codexOpen){S.elapsed+=dt*.35;render();cxDrawPreview(dt);return;}
  if(S.mode==='menu'||S.mode==='prep'){
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
    if(wdt>0){
      const steps=Math.min(4,Math.ceil(S.speed)),step=wdt/steps;
      for(let k=0;k<steps&&S.mode==='play';k++)update(step);
    }
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
save.weapon=normalizeWeaponId(save.weapon);
cacheUI();resize();setMuted(save.muted);
$('btnSpeed').textContent='1×';
$('btnNight').addEventListener('click',()=>{auInit();skipToNight();});
$('weaponHud').addEventListener('click',()=>{if(S.mode==='play')toggleWeaponSlots();});
$('weaponSlots').addEventListener('click',e=>e.stopPropagation());
$('weaponSlots').addEventListener('pointerdown',e=>{
  if(S.mode!=='play'||e.button!==0)return;
  const slot=e.target.closest&&e.target.closest('.wslot.filled');
  if(!slot)return;
  e.stopPropagation();e.preventDefault();
  const i=+slot.dataset.slot;
  slotDrag={i,pid:e.pointerId,start:[e.clientX,e.clientY],moved:false};
  mouseX=e.clientX;mouseY=e.clientY;mouseActive=true;
});
$('btnPause').addEventListener('click',()=>{auInit();S.mode==='play'?pauseGame():(S.mode==='pause'&&!codexOpen&&resumeGame());});
$('btnMute').addEventListener('click',()=>{auInit();setMuted(!save.muted);sfx('ui');});
$('btnSpeed').addEventListener('click',()=>{
  auInit();S.speed=S.speed===1?2:1;
  $('btnSpeed').textContent=S.speed+'×';$('btnSpeed').classList.toggle('warnState',S.speed===2);sfx('ui');});
$('btnResume').addEventListener('click',resumeGame);
$('btnSave').addEventListener('click',()=>{pauseSlotOpen=null;renderPauseSlots();pauseGo('slots');sfx('ui');});
$('btnPauseSlotBack').addEventListener('click',()=>{pauseGo('main');sfx('ui');});
$('pauseCfmYes').addEventListener('click',()=>closePauseConfirm(true));
$('pauseCfmNo').addEventListener('click',()=>closePauseConfirm(false));
// 存档失败（三槽满且无活跃槽）时中止，不让承诺的"先存档"落空
function savedThen(fn){
  if(!autoSave()){
    pauseSlotOpen=null;renderPauseSlots();pauseGo('slots');
    toast('三个存档位已满 · 请先覆盖一个存档位','warn');return;
  }
  fn();
}
$('btnRestart').addEventListener('click',()=>pauseConfirm('重新开始？','先自动存档到当前存档位，再回到出航准备。',()=>savedThen(openPrep),true));
$('btnToTitle').addEventListener('click',()=>pauseConfirm('返回标题？','当前进度会先自动存档到当前存档位。',()=>savedThen(toTitle),false));
$('btnAgain').addEventListener('click',openPrep);
$('btnTitle2').addEventListener('click',toTitle);
$('btnEndless').addEventListener('click',()=>{auInit();continueEndless();});
$('btnContinue').addEventListener('click',openLoadView);
$('startBtn').addEventListener('click',openPrep);
$('launchBtn').addEventListener('click',beginRun);
$('prepWeaponBtn').addEventListener('click',openWeaponPicker);
$('btnPrepBack').addEventListener('click',toTitle);
$('btnLoadBack').addEventListener('click',()=>{resetLoadUi();setMenuView('title');sfx('ui');});
$('slotDelete').addEventListener('click',confirmDelete);
$('slotBack').addEventListener('click',closeSlots);
$('confirmYes').addEventListener('click',()=>closeConfirm(true));
$('confirmNo').addEventListener('click',()=>closeConfirm(false));
$('confirmOv').addEventListener('pointerdown',e=>{if(e.target.classList.contains('scrim'))closeConfirm(false);});
$('saveWarnAck').addEventListener('click',()=>{ackCorrupt();refreshContinue();sfx('ui');});
$('repairBtn').addEventListener('click',tryRepair);
initRun();S.nightAmt=.55;refreshPrep();refreshStacks();setMenuView('title',false);refreshContinue();
const resizeMenu=()=>{setMenuView($('menuPanel').dataset.view||'title',false);positionWeaponDrop();};
addEventListener('resize',resizeMenu);
document.fonts?.addEventListener('loadingdone',resizeMenu);
requestAnimationFrame(loop);
