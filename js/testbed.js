'use strict';
/* ---------------- 测试场 ----------------
   不经过标题/出航/抽卡：加载即进入 play，场上只有玩家与一个静止测试桩。
   左上武器 HUD 保持原样，另加武器切换；右侧卡池可自选任意卡加入手牌。 */
(function(){
  const DUMMY_HP=999999;
  const WEAPON_ORDER=['sword','flame','frost','arcane'];
  const KIND_LABEL={build:'构筑',instant:'瞬发',utility:'功能',class:'职业'};
  const KIND_ORDER=['instant','build','utility','class'];
  let dummy=null,speedVal=1,tbPlacing=null;

  const el=id=>document.getElementById(id);

  /* 测试场不落盘、不暂停：覆盖存档与暂停入口（函数声明绑定可写） */
  try{ autoSave=()=>false; }catch(e){}
  try{ pauseGame=()=>{}; }catch(e){}

  /* 回收区常显且随时可用：引擎默认要「手牌超上限」才允许回收，这里临时放开。
     只改测试场的行为，不复制回收逻辑（返还、飞牌、提示都仍走引擎原函数）。 */
  try{
    const origRecycle=recycleHandCard;
    recycleHandCard=function(uid){
      // 引擎要求「手牌数 > DECK.max」才回收（<= 直接 return），临时压低上限即可借用原逻辑
      const m=DECK.max;DECK.max=Math.min(m,DECK.hand.length-1);
      let r=false;
      try{r=origRecycle(uid);}finally{DECK.max=m;}
      return r;
    };
    recycleSelected=function(){
      if(!S.aimUid){toast('先选中一张手牌，再点回收区','warn');sfx('deny');return;}
      recycleHandCard(S.aimUid);
    };
    markRecycleHover=function(x,y){
      const z=UI.recycleZone;if(!z)return;
      const e=document.elementFromPoint?document.elementFromPoint(x,y):null;
      z.classList.toggle('dragOver',!!(e&&e.closest&&e.closest('#recycleZone')));
    };
    // 引擎在加载时已把「原 recycleSelected」绑到 click 上；捕获阶段拦下并改走测试场版本
    const onZone=e=>{
      const z=el('recycleZone');
      if(!z||!e.target||!e.target.closest||!e.target.closest('#recycleZone'))return;
      e.preventDefault();e.stopPropagation();recycleSelected();
    };
    document.addEventListener('click',onZone,true);
    document.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' ')onZone(e);
    },true);
  }catch(e){}

  function makeDummy(){
    const x=P.x+2.6,y=P.y,def=FOES.brute;   // 名字/体型引用引擎定义，不在此另写一份
    return {type:'brute',x,y,_ax:x,_ay:y,hp:DUMMY_HP,max:DUMMY_HP,spd:0,dmg:0,
      r:def.r*1.4,dead:false,xp:0,coreDmg:0,atkCd:999,retarget:999,target:'core',
      kx:0,ky:0,flash:0,anim:0,elite:false,boss:false,
      fireCd:999,spawnCd:999,stompCd:999,px:x,py:y,
      stuckT:0,stuckN:0,detourT:0,detourSign:1,phaseT:0,strafe:1};
  }

  function resetWorld(){
    initRun();
    // 默认不放资源：树/石/晶全部清掉，需要时再从场景面板生成
    nodes.length=0;
    // 不做抽卡：清空牌库，只留卡池自选
    DECK.draw.length=0;DECK.discard.length=0;DECK.hand.length=0;DECK.max=10;
    // 停在白昼且永不入夜；不刷怪
    S.mode='play';S.phase='day';S.day=1;S.timeLeft=1e9;S.toSpawn=0;S.nightTotal=0;
    S.spawnT=1e9;S.nightAmt=0;S.hitstop=0;S.speed=speedVal;
    foes.length=0;warns.length=0;spellShots.length=0;pendingHits.length=0;
    dummy=makeDummy();foes.push(dummy);
    rebuildFoeGrid();rebuildSolids();
    cam.x=P.x;cam.y=P.y;cam.shake=0;
    const hud=el('hud');if(hud)hud.classList.remove('hidden');
    refreshRes();renderHand();renderWeaponSlots();
    if(typeof syncHUD==='function')syncHUD();
    buildWeaponBar();refreshScene();
  }

  /* ---------- 左上武器切换 ---------- */
  function buildWeaponBar(){
    const bar=el('tbWeapons');if(!bar)return;
    bar.innerHTML='';
    for(const id of WEAPON_ORDER){
      const w=WEAPONS[id];if(!w)continue;
      const b=document.createElement('button');
      b.className='tbWeap'+(P.weapon===id?' on':'');
      b.textContent=w.name;
      b.title=w.route||'';
      b.addEventListener('click',()=>{
        if(P.weapon===id)return;
        save.weapon=id;
        resetWorld();
        buildCardPool();
        toast('武器：'+w.name,'good');
      });
      bar.appendChild(b);
    }
  }

  /* ---------- 顶部条带锚定：武器条贴 HUD 右、速度条贴右上按钮左 ---------- */
  function layoutTop(){
    const tl=el('topLeft'),tr=el('topRight'),w=el('tbWeap'),sp=el('tbSpeed');
    if(tl&&w){const r=tl.getBoundingClientRect();w.style.left=Math.round(r.right+12)+'px';w.style.top=Math.round(r.top)+'px';}
    if(tr&&sp){const r=tr.getBoundingClientRect();sp.style.right=Math.round(innerWidth-r.left+12)+'px';sp.style.top=Math.round(r.top)+'px';}
  }

  /* ---------- 速度 / 单帧 ---------- */
  function applySpeed(v){
    v=Math.max(0,Math.min(1,Math.round((+v||0)*100)/100));
    speedVal=v;S.speed=v;   // 主循环用 dt*S.speed，FX.frame 用 min(S.speed,2)，一处生效
    const r=el('tbSpeedRange'),n=el('tbSpeedNum');
    if(r&&Math.abs(+r.value-v)>1e-6)r.value=v;
    if(n&&Math.abs(+n.value-v)>1e-6)n.value=v;
  }
  function stepOnce(){
    if(S.mode!=='play')return;
    S.hitstop=0;
    updateMouseWorld();
    update(1/60);                    // 逻辑层推进一帧（内部含弹道/敌人/粒子）
    if(S.handDirty)renderHand();
    if(typeof FX!=='undefined'&&FX.time!=null)FX.time+=1/60;  // 视觉层同步一帧
    render();syncHUD();
  }

  /* ---------- 场景对象：默认空场，手动增删；类型/数值全部引用引擎定义 ---------- */
  const NODE_RES={tree:'wood',rock:'stone',crys:'crys'};   // 仅用于显示中文名
  function nodeLabel(t){const k=NODE_RES[t];return (k&&RESNAME[k])||t;}
  function buildSpawnTypes(){
    const res=el('tbResTypes'),foe=el('tbFoeTypes');
    if(res){
      res.innerHTML='';
      // 资源种类与耐久都取自 TUNE.node.hits，新增资源类型时这里自动出现
      for(const t of Object.keys(TUNE.node.hits)){
        const b=document.createElement('button');
        b.className='tbType';b.textContent=nodeLabel(t);b.title=t+' · '+TUNE.node.hits[t]+' 击';
        b.addEventListener('click',()=>beginPlace('node',t,b));
        res.appendChild(b);
      }
    }
    if(foe){
      foe.innerHTML='';
      // 怪物种类取自 FOES，名字/图标沿用引擎定义
      for(const t of Object.keys(FOES)){
        const d=FOES[t],b=document.createElement('button');
        b.className='tbType';b.textContent=d.name||t;b.title=t;
        b.addEventListener('click',()=>beginPlace('foe',t,b));
        foe.appendChild(b);
      }
    }
  }
  function refreshScene(){
    const cnt=el('tbSceneCount'),list=el('tbSceneList');
    const liveFo=foes.filter(f=>f!==dummy&&!f.dead);
    if(cnt)cnt.textContent=(nodes.filter(n=>n.alive!==false).length+liveFo.length)+' 个';
    if(!list)return;
    list.innerHTML='';
    const row=(kind,label,detail,onDel)=>{
      const r=document.createElement('div');r.className='tbObj';
      const s=document.createElement('span');s.textContent=label;
      const m=document.createElement('em');m.textContent=detail||'';
      const x=document.createElement('button');x.textContent='×';x.title='移除';
      x.addEventListener('click',onDel);
      r.appendChild(s);r.appendChild(m);r.appendChild(x);list.appendChild(r);
    };
    nodes.forEach((n,i)=>{
      if(n.alive===false)return;
      row('node',nodeLabel(n.type),n.x.toFixed(1)+', '+n.y.toFixed(1),()=>{
        nodes.splice(i,1);rebuildSolids();fieldDirty=true;refreshScene();
      });
    });
    liveFo.forEach(f=>{
      row('foe',FOES[f.type]?FOES[f.type].name:f.type,f.x.toFixed(1)+', '+f.y.toFixed(1),()=>{
        const i=foes.indexOf(f);if(i>=0)foes.splice(i,1);
        rebuildFoeGrid();refreshScene();
      });
    });
    if(!list.children.length){
      const e=document.createElement('div');e.className='tbEmpty';e.textContent='空场 · 点上方类型后在画面点击放置';
      list.appendChild(e);
    }
  }
  function endPlace(){
    tbPlacing=null;
    document.querySelectorAll('#tbScene .tbType').forEach(b=>b.classList.remove('on'));
    const h=el('tbHint');
    if(h)h.textContent='点击卡牌加入手牌 · 顶部切换武器 · 右上拖速度条 / 下一帧 · 左下回收区随时弃牌';
  }
  function beginPlace(kind,type,btn){
    tbPlacing=tbPlacing&&tbPlacing.kind===kind&&tbPlacing.type===type?null:{kind,type};
    document.querySelectorAll('#tbScene .tbType').forEach(b=>b.classList.remove('on'));
    if(tbPlacing&&btn)btn.classList.add('on');
    const h=el('tbHint');
    if(h)h.textContent=tbPlacing?('在画面上点击放置：'+(kind==='node'?nodeLabel(type):FOES[type].name)+' · 再点一次按钮取消'):
      '点击卡牌加入手牌 · 顶部切换武器 · 右上拖速度条 / 下一帧 · 左下回收区随时弃牌';
  }
  function placeAt(x,y){
    if(!tbPlacing)return;
    if(tbPlacing.kind==='node'){
      const hp=TUNE.node.hits[tbPlacing.type];
      nodes.push({type:tbPlacing.type,x,y,hp,max:hp,alive:true,shake:0,sway:rand(TAU),s:rand(.85,1.2)});
      rebuildSolids();fieldDirty=true;
      toast('放置资源：'+nodeLabel(tbPlacing.type),'good');
    }else{
      const before=foes.length;
      spawnFoe(tbPlacing.type,x,y);       // 走引擎生成器（难度/属性都按引擎口径）
      const f=foes[before];
      if(f){f.x=x;f.y=y;f.px=x;f.py=y;}  // 测试场要落在点击点，不让 freeSpawnNear 挪位
      rebuildFoeGrid();
      toast('放置怪物：'+FOES[tbPlacing.type].name,'good');
    }
    endPlace();refreshScene();
  }

  /* ---------- 卡池 ---------- */
  function poolIds(){
    const out=[];
    for(const id in CDEFS){
      const d=CDEFS[id];
      if(!d||d.weaponAttack)continue;   // 武器攻击模板不发放
      out.push(id);
    }
    return out;
  }

  function cardTitle(d){return d.name||d.n||d.short||d.id;}

  function addCard(id){
    if(DECK.hand.length>=DECK.max){toast('手牌已满（'+DECK.max+'）','warn');sfx('deny');return;}
    const c=mkCard(id);
    if(!c){toast('这张卡不能加入手牌','warn');return;}
    DECK.hand.push(c);S.handDirty=true;renderHand();refreshRes();sfx('draw');
  }

  function buildCardPool(){
    const list=el('tbPoolList');if(!list)return;
    const q=(el('tbSearch')&&el('tbSearch').value||'').trim().toLowerCase();
    const ids=poolIds();
    const groups={};
    for(const id of ids){
      const d=CDEFS[id];
      let g=d.sigil?'刻印 / 法术':(KIND_LABEL[d.kind]||'其它');
      if(q&&!(cardTitle(d)+' '+id).toLowerCase().includes(q))continue;
      (groups[g]||(groups[g]=[])).push(id);
    }
    list.innerHTML='';
    let shown=0;
    const order=['刻印 / 法术'].concat(KIND_ORDER.map(k=>KIND_LABEL[k])).concat(['其它']);
    for(const g of order){
      const arr=groups[g];if(!arr||!arr.length)continue;
      const h=document.createElement('div');h.className='tbGroup';h.textContent=g+' · '+arr.length;
      list.appendChild(h);
      arr.sort((a,b)=>cardTitle(CDEFS[a]).localeCompare(cardTitle(CDEFS[b]),'zh'));
      for(const id of arr){
        const d=CDEFS[id];
        const row=document.createElement('div');
        row.className='tbCard';
        const dot=document.createElement('i');
        dot.style.background=d.color||'#8fe3d0';
        const name=document.createElement('span');
        name.textContent=cardTitle(d);
        const meta=document.createElement('em');
        const mana=d.mana!=null?d.mana:(d.cost&&d.cost.mana);
        meta.textContent=mana!=null?('气 '+mana):(d.sigil?'刻印':(d.kind||''));
        row.appendChild(dot);row.appendChild(name);row.appendChild(meta);
        row.title=(d.desc||d.brief||'').slice(0,120);
        row.addEventListener('click',()=>addCard(id));
        list.appendChild(row);shown++;
      }
    }
    const cnt=el('tbPoolCount');if(cnt)cnt.textContent=shown+' 张';
    if(!shown){
      const h=document.createElement('div');h.className='tbGroup';h.textContent='没有匹配的卡';list.appendChild(h);
    }
  }

  /* ---------- 启动 ---------- */
  function boot(){
    // 测试场默认火焰法杖：打开即可测弹道/刻印；仍可在顶部切换
    save.weapon='flame';
    resetWorld();
    buildCardPool();
    buildSpawnTypes();
    refreshScene();
    layoutTop();
    const search=el('tbSearch');
    if(search)search.addEventListener('input',buildCardPool);
    const reset=el('tbReset');
    if(reset)reset.addEventListener('click',()=>{resetWorld();buildCardPool();endPlace();toast('测试场已重置','good');});
    const clear=el('tbSceneClear');
    if(clear)clear.addEventListener('click',()=>{
      nodes.length=0;
      for(let i=foes.length-1;i>=0;i--)if(foes[i]!==dummy)foes.splice(i,1);
      rebuildSolids();rebuildFoeGrid();fieldDirty=true;endPlace();refreshScene();
      toast('场景对象已清空','good');
    });
    // 速度滑杆 / 数值框 / 单帧
    const rng=el('tbSpeedRange'),num=el('tbSpeedNum'),step=el('tbStep');
    if(rng)rng.addEventListener('input',()=>applySpeed(rng.value));
    if(num){
      const commit=()=>applySpeed(num.value);
      num.addEventListener('change',commit);
      num.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();num.blur();}});
    }
    if(step)step.addEventListener('click',stepOnce);
    applySpeed(1);
    addEventListener('resize',layoutTop);
    // 防止 Escape / P 打开暂停；放置模式下 Escape 先取消放置
    addEventListener('keydown',e=>{
      const k=(e.key||'').toLowerCase();
      if(tbPlacing&&k==='escape'){e.preventDefault();e.stopImmediatePropagation();endPlace();return;}
      if(k==='escape'||k==='p'||k==='k'){e.preventDefault();e.stopImmediatePropagation();}
    },true);
    // 放置模式：捕获阶段先拦下画面点击，避免被当作出牌/选中
    addEventListener('pointerdown',e=>{
      if(!tbPlacing||e.button!==0)return;
      const t=e.target;
      if(t&&t.closest&&t.closest('#tbScene,#tbWeap,#tbSpeed,#tbPool,#tbHint,#weaponHud,#playerPanel,#recycleZone,#topLeft,#topRight,#handArea,#rightBottom'))return;
      e.preventDefault();e.stopImmediatePropagation();
      mouseX=e.clientX;mouseY=e.clientY;updateMouseWorld();
      placeAt(mouseWorld[0],mouseWorld[1]);
    },true);
    // 每秒兜底一次：保持白昼、测试桩不动；同步场景列表（节点可能被采集掉）
    setInterval(()=>{
      if(S.mode!=='play')return;
      S.phase='day';if(S.timeLeft<1000)S.timeLeft=1e9;
      if(dummy&&!dummy.dead){
        if(foes.indexOf(dummy)<0)foes.push(dummy);
        dummy.spd=0;dummy.atkCd=999;dummy.target='core';
        // 击退/蔓延可能推动位置：拉回锚点，保证「不会移动」
        if(dummy._ax!=null){dummy.x=dummy._ax;dummy.y=dummy._ay;dummy.kx=0;dummy.ky=0;}
        if(dummy.hp<dummy.max*.2)dummy.hp=dummy.max;   // 掉到 20% 才回满，平时血条可见
      }
      refreshScene();
    },1000);
  }

  if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot);
  else boot();
})();
