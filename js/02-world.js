'use strict';
/* ---------------- 画布 ---------------- */
const cv=$('cv');let ctx=cv.getContext('2d');
const mm=$('mm'),mctx=mm.getContext('2d');
let W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,2),seaGrad=null,vigGrad=null;
function makeGlow(col){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const rg=g.createRadialGradient(64,64,1,64,64,64);
  rg.addColorStop(0,`rgba(${col},1)`);rg.addColorStop(.42,`rgba(${col},.34)`);rg.addColorStop(1,`rgba(${col},0)`);
  g.fillStyle=rg;g.fillRect(0,0,128,128);return c;
}
const GLOW={amber:makeGlow('255,170,80'),lantern:makeGlow('255,190,110'),mint:makeGlow('143,227,208'),
  cyan:makeGlow('87,230,255'),leaf:makeGlow('111,224,138'),violet:makeGlow('160,107,255'),fog:makeGlow('159,216,207'),white:makeGlow('255,255,255'),
  fire:makeGlow('255,122,69'),frost:makeGlow('111,216,255'),arcane:makeGlow('180,140,255')};
function resize(){
  W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio||1,2);
  cv.width=Math.floor(W*DPR);cv.height=Math.floor(H*DPR);
  mm.width=Math.floor(124*DPR);mm.height=Math.floor(124*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  seaGrad=ctx.createRadialGradient(W/2,H*.4,80,W/2,H/2,Math.max(W,H)*.8);
  seaGrad.addColorStop(0,'#123448');seaGrad.addColorStop(.55,'#0c2231');seaGrad.addColorStop(1,'#050d14');
  vigGrad=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75);
  vigGrad.addColorStop(0,'rgba(3,6,12,0)');vigGrad.addColorStop(1,'rgba(3,6,12,.55)');
  layoutHand();
  if(codexOpen)sizeCodexCv();
  if($('dragBuildCv')){sizeDragCv();drawDragBuild();}
}
addEventListener('resize',resize);

/* ---------------- 世界 ---------------- */
let tiles=[],mmMask=null,edgeSpawns=[];
const groundChunks=new Map(); // 地面分块缓存：只烘焙视口内块，避免大半径时生成巨幅画布
let fieldReveal=null; // 扩图演出状态：只活在内存里，不进存档
// 世界坐标 ↔ 数组下标的唯一转换口：实体始终用世界坐标，只有访问网格时才加 OFF
const toCell=(x,y)=>[(x+OFF)|0,(y+OFF)|0];
const cellCenterWorld=(ix,iy)=>[ix-OFF+.5,iy-OFF+.5];
const tileIndex=(x,y)=>{
  const ix=(x+OFF)|0,iy=(y+OFF)|0;
  return ix<0||iy<0||ix>=GRID||iy>=GRID?-1:iy*GRID+ix;
};
const walk=(x,y)=>{const i=tileIndex(x,y);return i>=0&&tiles[i].land;};
const tileAt=(x,y)=>{const i=tileIndex(x,y);return i<0?null:tiles[i];};
let nodes=[],builds=[],foes=[],shots=[],picks=[],parts=[],floats=[],slashes=[],ghosts=[],warns=[],fogBlobs=[];
let core={x:CEN+.5,y:CEN+.5,r:1.15,hp:600,max:600,flash:0,beam:0};
let cam={x:CEN,y:CEN,z:1.35,tz:1.35,shake:0,sx:0,sy:0};
let seed=1;
function hash(x,y){let h=(x*374761393+y*668265263+seed*974711)|0;h=(h^(h>>13))*1274126177;return((h^(h>>16))>>>0)/4294967295;}
function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return lerp(lerp(hash(xi,yi),hash(xi+1,yi),u),lerp(hash(xi,yi+1),hash(xi+1,yi+1),u),v);
}
// forcedSeed 仅供读档重建；默认路径必须保持 (Math.random()*1e9)|0，以免改变启动期 RNG 序列
// 契约：hash/vnoise 与下方 tile 生成不得引入随机，否则 seed-only 地形恢复会失效
const scoreAt=(wx,wy,ix,iy)=>dist(wx,wy,CEN,CEN)+vnoise(ix*FIELD.noiseScale,iy*FIELD.noiseScale)*FIELD.noiseAmp;
// 网格扩容：坐标中心 CEN 固定，GRID 只向两侧扩，OFF 把世界坐标映射到新数组
function reallocWorld(r){
  GRID=gridFor(r);NN=GRID*GRID;OFF=offFor(r);
  CW=Math.ceil(GRID/CELL);CN=CW*CW;
  tiles=new Array(NN);
  solidGrid=new Array(CN);foeGrid=new Array(CN);
  for(let i=0;i<CN;i++){solidGrid[i]=[];foeGrid[i]=[];}
  tileCost=new Float32Array(NN);coreField=new Float32Array(NN);plyField=new Float32Array(NN);
  heapI=new Int32Array(NN*6);heapC=new Float32Array(NN*6);heapN=0;
  fieldDirty=true;plyTile=-1;plyFieldT=0;
  groundChunks.clear();
}
function fillTerrain(r){
  for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){
    const c=cellCenterWorld(ix,iy),land=scoreAt(c[0],c[1],ix,iy)<r||dist(c[0],c[1],CEN,CEN)<FIELD.coreSafe;
    tiles[iy*GRID+ix]={land,sand:false,v:hash(ix*3,iy*7)};
  }
  const seen=new Uint8Array(NN),stack=[(CEN+OFF|0)*GRID+(CEN+OFF|0)];seen[stack[0]]=1;
  while(stack.length){
    const i=stack.pop(),x=i%GRID,y=(i/GRID)|0;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=GRID||ny>=GRID)continue;
      const j=ny*GRID+nx;if(!seen[j]&&tiles[j].land){seen[j]=1;stack.push(j);}
    }
  }
  for(let i=0;i<NN;i++)if(!seen[i])tiles[i].land=false;
  for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){
    const t=tiles[iy*GRID+ix],c=cellCenterWorld(ix,iy);
    if(t.land)t.sand=scoreAt(c[0],c[1],ix,iy)>r-FIELD.sandWidth;
  }
}
function rebuildEdgeSpawns(r){
  edgeSpawns=[];
  const add=dMin=>{
    for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){
      if(!tiles[iy*GRID+ix].land)continue;
      const c=cellCenterWorld(ix,iy);
      if(dist(c[0],c[1],CEN,CEN)>dMin)edgeSpawns.push(c);
    }
  };
  add(r-FIELD.edgeInset);
  if(edgeSpawns.length<FIELD.minEdgeSpawns)add(r-FIELD.edgeFallbackInset);
}
// forcedSeed 仅供读档重建；默认路径必须保持 (Math.random()*1e9)|0，以免改变启动期 RNG 序列
// 契约：hash/vnoise 与地形生成不得引入随机，否则 seed-only 地形恢复会失效
function genWorld(forcedSeed,lvl=0){
  seed=forcedSeed===undefined?(Math.random()*1e9)|0:forcedSeed;
  const r=radiusForLevel(lvl);
  reallocWorld(r);fillTerrain(r);rebuildEdgeSpawns(r);
  bakeGround();bakeMask();
  nodes=[];
  // 基础节点永远在原 40×40 域内掷点：RNG 次数不随半径变化，保护前 7 夜基线与读档一致性
  const place=(type,count,minD)=>{
    let tries=0;
    while(count>0&&tries++<FIELD.nodeTries){
      const x=rand(3,BASE_GRID-3),y=rand(3,BASE_GRID-3),t=tileAt(x,y);
      if(!t||!t.land||t.sand)continue;
      if(dist(x,y,CEN,CEN)<minD)continue;
      if(nodes.some(n=>dist(n.x,n.y,x,y)<FIELD.nodeSpacing))continue;
      const hp=TUNE.node.hits[type];
      nodes.push({type,x,y,hp,max:hp,alive:true,shake:0,sway:rand(TAU),s:rand(.85,1.2)});count--;
    }
  };
  place('tree',FIELD.nodeCounts.tree,FIELD.nodeMinD.tree);
  place('rock',FIELD.nodeCounts.rock,FIELD.nodeMinD.rock);
  place('crys',FIELD.nodeCounts.crys,FIELD.nodeMinD.crys);
  fogBlobs=[];
  for(let i=0;i<9;i++)fogBlobs.push({x:rand(-400,400),y:rand(-300,300),s:rand(180,420),vx:rand(4,12)*(Math.random()<.5?-1:1),a:rand(.05,.12),ph:rand(TAU)});
  rebuildSolids();rebuildTileCost();fieldDirty=true;
}
/* 地面分块烘焙：每块 CSS 像素独立，坐标只依赖世界坐标与 OFF，不依赖整图尺寸 */
const CHUNK_PAD=40;
function bakeChunk(cx,cy){
  const S=FIELD.chunk,ox=cx*S-OFF,oy=cy*S-OFF,op=proj(ox,oy);
  const Lx=CHUNK_PAD+S*TW/2,Ly=CHUNK_PAD+10;
  const canvas=document.createElement('canvas');
  canvas.width=S*TW+CHUNK_PAD*2;canvas.height=S*TH+CHUNK_PAD*2+10;
  canvas.OX=op[0]-Lx;canvas.OY=op[1]-Ly;
  const g=canvas.getContext('2d');
  const px=(x,y)=>{const p=proj(x,y);return[p[0]-op[0]+Lx,p[1]-op[1]+Ly];};
  const from=Math.max(0,cx*S),to=Math.min(GRID,(cx+1)*S),fromY=Math.max(0,cy*S),toY=Math.min(GRID,(cy+1)*S);
  for(let iy=fromY;iy<toY;iy++)for(let ix=from;ix<to;ix++){
    const wx=ix-OFF+.5,wy=iy-OFF+.5,t=tileAt(wx,wy);if(t.land)continue;
    const near=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const n=tileAt(wx+dx,wy+dy);return n&&n.land;});
    if(!near)continue;
    const c=px(wx,wy);
    g.fillStyle='rgba(87,200,190,.10)';
    g.beginPath();g.moveTo(c[0],c[1]-TH/2);g.lineTo(c[0]+TW/2,c[1]);g.lineTo(c[0],c[1]+TH/2);g.lineTo(c[0]-TW/2,c[1]);g.closePath();g.fill();
  }
  for(let iy=fromY;iy<toY;iy++)for(let ix=from;ix<to;ix++){
    const wx=ix-OFF+.5,wy=iy-OFF+.5,t=tileAt(wx,wy);if(!t.land)continue;
    const c=px(wx,wy);
    const dia=()=>{g.beginPath();g.moveTo(c[0],c[1]-TH/2);g.lineTo(c[0]+TW/2,c[1]);g.lineTo(c[0],c[1]+TH/2);g.lineTo(c[0]-TW/2,c[1]);g.closePath();};
    if(t.sand)g.fillStyle=t.v>.5?'#c4b28c':'#b8a67e';
    else g.fillStyle=t.v<.33?'#173f3c':t.v<.66?'#1a453f':'#1d4a42';
    dia();g.fill();g.strokeStyle='rgba(8,18,24,.25)';g.lineWidth=1;dia();g.stroke();
    const CH=17,rN=tileAt(wx+1,wy),lN=tileAt(wx,wy+1);
    if(!rN||!rN.land){
      g.fillStyle='#0d2830';g.beginPath();g.moveTo(c[0]+TW/2,c[1]);g.lineTo(c[0],c[1]+TH/2);g.lineTo(c[0],c[1]+TH/2+CH);g.lineTo(c[0]+TW/2,c[1]+CH);g.closePath();g.fill();
      g.strokeStyle='rgba(143,227,208,.35)';g.beginPath();g.moveTo(c[0]+TW/2,c[1]+2);g.lineTo(c[0],c[1]+TH/2+2);g.stroke();
    }
    if(!lN||!lN.land){
      g.fillStyle='#0a2029';g.beginPath();g.moveTo(c[0]-TW/2,c[1]);g.lineTo(c[0],c[1]+TH/2);g.lineTo(c[0],c[1]+TH/2+CH);g.lineTo(c[0]-TW/2,c[1]+CH);g.closePath();g.fill();
      g.strokeStyle='rgba(143,227,208,.28)';g.beginPath();g.moveTo(c[0]-TW/2,c[1]+2);g.lineTo(c[0],c[1]+TH/2+2);g.stroke();
    }
    if(!t.sand){
      if(t.v>.82){g.strokeStyle='rgba(111,224,138,.4)';g.lineWidth=1.2;
        for(let i=0;i<3;i++){const ox=c[0]+(hash(ix*9+i,iy)-.5)*30,oy=c[1]+(hash(ix,iy*9+i)-.5)*12;
          g.beginPath();g.moveTo(ox,oy);g.lineTo(ox+2,oy-5);g.stroke();}}
      else if(t.v<.1){g.fillStyle='rgba(87,230,255,.35)';g.beginPath();g.arc(c[0]+(t.v-.05)*180,c[1],1.5,0,TAU);g.fill();}
      else if(t.v>.45&&t.v<.5){g.fillStyle='rgba(120,140,145,.5)';g.beginPath();g.ellipse(c[0]-8,c[1]+3,3.5,2,0,0,TAU);g.fill();}
    }
  }
  groundChunks.set(cx+','+cy,canvas);
}
function bakeGround(){groundChunks.clear();}
function drawGround(){
  const S=FIELD.chunk,cp=proj(cam.x,cam.y);
  const toWorld=(sx,sy)=>unproj((sx-W/2-cam.sx)/cam.z+cp[0],(sy-H/2-cam.sy)/cam.z+cp[1]);
  let ax=Infinity,bx=-Infinity,ay=Infinity,by=-Infinity;
  for(const[sx,sy]of[[0,0],[W,0],[0,H],[W,H]]){
    const p=toWorld(sx,sy);ax=Math.min(ax,p[0]);bx=Math.max(bx,p[0]);ay=Math.min(ay,p[1]);by=Math.max(by,p[1]);
  }
  const c0=toCell(ax,ay),c1=toCell(bx,by);
  const x0=Math.floor(c0[0]/S)-1,x1=Math.floor(c1[0]/S)+1,y0=Math.floor(c0[1]/S)-1,y1=Math.floor(c1[1]/S)+1;
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){
    const key=cx+','+cy;let cv=groundChunks.get(key);
    if(!cv){bakeChunk(cx,cy);cv=groundChunks.get(key);}
    if(cv)ctx.drawImage(cv,cv.OX,cv.OY);
  }
}
function bakeMask(){
  mmMask=document.createElement('canvas');mmMask.width=124;mmMask.height=124;
  const g=mmMask.getContext('2d'),k=124/GRID;
  g.fillStyle='rgba(10,26,36,.9)';g.fillRect(0,0,124,124);
  for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){
    const t=tiles[iy*GRID+ix];if(!t.land)continue;
    g.fillStyle=t.sand?'#8a7d5e':'#2a5a50';g.fillRect(ix*k,iy*k,k+.5,k+.5);
  }
}

/* ---------------- 场地扩张 / 收缩 ---------------- */
const tileState=t=>!t||!t.land?'water':(t.sand?'sand':'land');
// 潮线延迟：按新旧半径的归一化距离排波，方向只决定「内圈先出」还是「外圈先退」
const revealDelay=(wx,wy,ix,iy,oldR,r)=>{
  const lo=Math.min(oldR,r)-FIELD.sandWidth,hi=Math.max(oldR,r);
  const u=clamp((dist(wx,wy,CEN,CEN)-lo)/Math.max(.001,hi-lo),0,1);
  return (r>=oldR?u:1-u)*.9+hash(ix*17+3,iy*23+7)*.1;
};
function expandField(){
  if(!S.endless)return null;
  const lv=levelForDay(S.day);
  if(lv<=S.fieldLevel)return null;
  return resizeField(lv);
}
function shrinkField(opts){return resizeField(Math.max(0,S.fieldLevel-1),opts);}
function resizeField(targetLv,opts={}){
  if(!Number.isInteger(targetLv)||targetLv<0||targetLv>maxLevel()||targetLv===S.fieldLevel)return null;
  const oldR=radiusForLevel(S.fieldLevel),r=radiusForLevel(targetLv),dir=Math.sign(r-oldR),oldOff=OFF;
  const prevTiles=new Map();
  for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){
    prevTiles.set((ix-OFF)+','+(iy-OFF),{state:tileState(tiles[iy*GRID+ix]),ix,iy});
  }
  reallocWorld(r);fillTerrain(r);rebuildEdgeSpawns(r);
  const cells=[],revealGhosts=[];
  const record=(c,prev)=>{
    const from=prev?prev.state:'water',to=tileState(tiles[c.iy*GRID+c.ix]);
    if(from===to)return;
    cells.push({wx:c.wx,wy:c.wy,ix:c.ix,iy:c.iy,oldIx:prev?prev.ix:c.ix+OFF-oldOff,
      oldIy:prev?prev.iy:c.iy+OFF-oldOff,from,to,delay:revealDelay(c.wx,c.wy,c.ix,c.iy,oldR,r),
      noise:hash(c.ix*7+1,c.iy*13+3)});
  };
  for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){
    const c=cellCenterWorld(ix,iy);
    record({wx:c[0],wy:c[1],ix,iy},prevTiles.get((ix-OFF)+','+(iy-OFF)));
  }
  if(dir<0)for(const[key,prev]of prevTiles){
    const ix=prev.ix+OFF-oldOff,iy=prev.iy+OFF-oldOff;
    if(ix>=0&&iy>=0&&ix<GRID&&iy<GRID)continue;
    const wx=prev.ix+.5,wy=prev.iy+.5,to='water';
    if(prev.state===to)continue;
    cells.push({wx,wy,ix,iy,oldIx:prev.ix,oldIy:prev.iy,from:prev.state,to,
      delay:revealDelay(wx,wy,ix,iy,oldR,r),noise:hash(ix*7+1,iy*13+3)});
  }
  // 缩小前先给被裁掉的节点留一份纯渲染快照，节点沉没由演出层负责
  const keep=typeof opts.keep==='function'?opts.keep:()=>false;
  const outside=o=>{
    if(keep(o))return false;
    // 环带补放的对象带来源标记，收缩时一律回退；其余对象按新地形判定
    if(dir<0&&o.spawnDelay!==undefined)return true;
    const i=tileIndex(o.x,o.y);return i<0||!tiles[i].land;
  };
  if(dir<0)for(const n of nodes)if(outside(n))
    revealGhosts.push({...n,despawnDelay:revealDelay(n.x,n.y,n.x|0,n.y|0,oldR,r)});
  for(const arr of [nodes,builds,foes,picks,parts,floats,slashes,ghosts,warns,shots])
    for(let i=arr.length-1;i>=0;i--)if(outside(arr[i]))arr.splice(i,1);
  if(dir>0)appendRingNodes(oldR,r,targetLv);
  bakeGround();bakeMask();
  rebuildSolids();rebuildTileCost();rebuildFoeGrid();
  fieldDirty=true;plyTile=-1;plyFieldT=0;
  S.fieldLevel=targetLv;
  return {oldR,r,dir,viewR:Math.max(oldR,r),cells,ghosts:revealGhosts};
}
function appendRingNodes(oldR,r,lv){
  const area=Math.PI*FIELD.baseLand*FIELD.baseLand,density={};
  for(const t in FIELD.nodeCounts)
    density[t]=FIELD.nodeCounts[t]/Math.max(1,area-Math.PI*FIELD.nodeMinD[t]*FIELD.nodeMinD[t]);
  if(nodes.length>=FIELD.maxNodes)return;
  for(let iy=0;iy<GRID;iy++)for(let ix=0;ix<GRID;ix++){
    const t=tiles[iy*GRID+ix];if(!t.land||t.sand)continue;
    const c=cellCenterWorld(ix,iy);
    if(dist(c[0],c[1],CEN,CEN)<oldR-FIELD.sandWidth)continue;
    if(nodes.some(n=>dist(n.x,n.y,c[0],c[1])<FIELD.nodeSpacing))continue;
    if(builds.some(b=>dist(b.x,b.y,c[0],c[1])<.9))continue;
    for(const type in FIELD.nodeCounts){
      if(hash(ix+lv*101,iy-lv*37)>=density[type])continue;
      const hp=TUNE.node.hits[type];
      nodes.push({type,x:c[0],y:c[1],hp,max:hp,alive:true,shake:0,
        sway:hash(ix+lv*11,iy+lv*7)*TAU,s:.85+hash(ix-lv*5,iy+lv*3)*.35,
        spawnDelay:revealDelay(c[0],c[1],ix,iy,oldR,r)});
      break;
    }
    if(nodes.length>=FIELD.maxNodes)return;
  }
}
function startReveal(info,onDone){
  const reduced=reduceMotion||(typeof reducedMotion==='function'&&reducedMotion());
  if(reduced||!info)return false;
  const old=document.createElement('canvas');old.width=124;old.height=124;
  old.getContext('2d').drawImage(mmMask,0,0);
  fieldReveal={t:0,dur:FIELD.revealTime,cells:info.cells,ghosts:info.ghosts||[],dir:info.dir||1,
    oldR:info.oldR,r:info.r,viewR:info.viewR||Math.max(info.oldR,info.r),oldGrid:gridFor(info.oldR),done:onDone,oldMask:old,tzPrev:cam.tz};
  // 镜头退到能看见整条海岸的距离，演出结束后由主循环拉回
  cam.tz=clamp(Math.min(W/(2*fieldReveal.viewR*TW*1.05),H/(2*fieldReveal.viewR*TH*1.15)),.45,1.05);
  return true;
}
function advanceReveal(dt){
  if(!fieldReveal)return;
  fieldReveal.t+=dt;
  cam.x=lerp(cam.x,CEN+.5,Math.min(1,dt*3));cam.y=lerp(cam.y,CEN+.5,Math.min(1,dt*3));
  cam.z=lerp(cam.z,cam.tz,Math.min(1,dt*3));
  if(fieldReveal.t>=fieldReveal.dur)finishReveal();
}
function finishReveal(){
  if(!fieldReveal)return;
  const done=fieldReveal.done;cam.tz=fieldReveal.tzPrev;fieldReveal=null;
  if(done)done();
}

/* ---------------- 网格 & 流场 ---------------- */
const CELL=2;let CW=Math.ceil(GRID/CELL),CN=CW*CW;
let solidGrid=new Array(CN),foeGrid=new Array(CN);
for(let i=0;i<CN;i++){solidGrid[i]=[];foeGrid[i]=[];}
let solids=[];
const cellIdx=(x,y)=>clamp((y+OFF)/CELL|0,0,CW-1)*CW+clamp((x+OFF)/CELL|0,0,CW-1);
function rebuildSolids(){
  solids=[{x:core.x,y:core.y,r:core.r,kind:2,obj:core}];
  for(const n of nodes)if(n.alive)solids.push({x:n.x,y:n.y,r:.36,kind:0,obj:n});
  for(const b of builds)solids.push({x:b.x,y:b.y,r:b.r,kind:1,obj:b});
  for(let i=0;i<CN;i++)solidGrid[i].length=0;
  for(const s of solids)solidGrid[cellIdx(s.x,s.y)].push(s);
}
function forSolids(x,y,r,cb){
  const x0=clamp((x-r)/CELL|0,0,CW-1),x1=clamp((x+r)/CELL|0,0,CW-1);
  const y0=clamp((y-r)/CELL|0,0,CW-1),y1=clamp((y+r)/CELL|0,0,CW-1);
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){const a=solidGrid[cy*CW+cx];for(let i=0;i<a.length;i++)cb(a[i]);}
}
function rebuildFoeGrid(){
  for(let i=0;i<CN;i++)foeGrid[i].length=0;
  for(const f of foes)if(!f.dead)foeGrid[cellIdx(f.x,f.y)].push(f);
}
function forFoes(x,y,r,cb){
  const x0=clamp((x-r)/CELL|0,0,CW-1),x1=clamp((x+r)/CELL|0,0,CW-1);
  const y0=clamp((y-r)/CELL|0,0,CW-1),y1=clamp((y+r)/CELL|0,0,CW-1);
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){const a=foeGrid[cy*CW+cx];for(let i=0;i<a.length;i++)cb(a[i]);}
}
let tileCost=new Float32Array(NN),coreField=new Float32Array(NN),plyField=new Float32Array(NN);
let fieldDirty=true,plyFieldT=0,plyTile=-1;
let heapI=new Int32Array(NN*6),heapC=new Float32Array(NN*6),heapN=0;
function hPush(i,c){
  if(heapN>=heapI.length)return;
  let n=heapN++;heapI[n]=i;heapC[n]=c;
  while(n>0){const p=(n-1)>>1;if(heapC[p]<=heapC[n])break;
    const ti=heapI[p],tc=heapC[p];heapI[p]=heapI[n];heapC[p]=heapC[n];heapI[n]=ti;heapC[n]=tc;n=p;}
}
function hPop(){
  const ri=heapI[0],rc=heapC[0];heapN--;
  if(heapN>0){
    heapI[0]=heapI[heapN];heapC[0]=heapC[heapN];let n=0;
    for(;;){const l=n*2+1,r=l+1;let m=n;
      if(l<heapN&&heapC[l]<heapC[m])m=l;if(r<heapN&&heapC[r]<heapC[m])m=r;if(m===n)break;
      const ti=heapI[m],tc=heapC[m];heapI[m]=heapI[n];heapC[m]=heapC[n];heapI[n]=ti;heapC[n]=tc;n=m;}
  }
  return [ri,rc];
}
function rebuildTileCost(){
  for(let i=0;i<NN;i++)tileCost[i]=tiles[i].land?1:Infinity;
  for(const n of nodes)if(n.alive){const i=tileIndex(n.x,n.y);if(i>=0)tileCost[i]=Infinity;}
  for(const b of builds){const i=tileIndex(b.x,b.y);if(i>=0&&tileCost[i]!==Infinity)tileCost[i]=26+b.hp/b.max*10;}
}
const DIRS=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
function computeField(out,gx,gy){
  out.fill(Infinity);const c=toCell(gx,gy);gx=clamp(c[0],0,GRID-1);gy=clamp(c[1],0,GRID-1);
  let gi=gy*GRID+gx;
  if(!isFinite(tileCost[gi])){
    let best=-1,bd=1e9;
    for(let i=0;i<NN;i++)if(isFinite(tileCost[i])){
      const d=Math.abs(i%GRID-gx)+Math.abs((i/GRID|0)-gy);if(d<bd){bd=d;best=i;}}
    if(best<0)return;gi=best;
  }
  heapN=0;out[gi]=0;hPush(gi,0);
  while(heapN>0){
    const[i,c]=hPop();if(c>out[i]+1e-6)continue;
    const x=i%GRID,y=(i/GRID)|0;
    for(let k=0;k<8;k++){
      const dx=DIRS[k][0],dy=DIRS[k][1],sl=DIRS[k][2],nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=GRID||ny>=GRID)continue;
      const j=ny*GRID+nx,tc=tileCost[j];if(!isFinite(tc))continue;
      if(dx&&dy&&(!isFinite(tileCost[y*GRID+nx])||!isFinite(tileCost[ny*GRID+x])))continue;
      const nc=c+sl*tc;if(nc<out[j]-1e-6){out[j]=nc;hPush(j,nc);}
    }
  }
}
function fieldDir(field,x,y,out){
  const c=toCell(x,y),ix=c[0],iy=c[1];if(ix<0||iy<0||ix>=GRID||iy>=GRID)return false;
  const i=iy*GRID+ix,cur=field[i];let bi=-1,bc=cur,bx=0,by=0;
  for(let k=0;k<8;k++){
    const dx=DIRS[k][0],dy=DIRS[k][1],nx=ix+dx,ny=iy+dy;
    if(nx<0||ny<0||nx>=GRID||ny>=GRID)continue;
    const j=ny*GRID+nx;if(field[j]>=bc)continue;
    if(dx&&dy&&(!isFinite(tileCost[iy*GRID+nx])||!isFinite(tileCost[ny*GRID+ix])))continue;
    bc=field[j];bi=j;bx=dx;by=dy;
  }
  if(bi<0)return false;
  const dx=ix-OFF+bx+.5-x,dy=iy-OFF+by+.5-y,m=Math.hypot(dx,dy)||1;
  out[0]=dx/m;out[1]=dy/m;return true;
}

/* ---------------- 移动 ---------------- */
function landOK(x,y,r,mx,my){
  if(!walk(x,y))return false;
  const m=Math.hypot(mx,my);
  if(m>1e-6&&!walk(x+mx/m*r*.8,y+my/m*r*.8))return false;
  return true;
}
function depenetrate(e,r,ignoreNodes){
  for(let pass=0;pass<2;pass++){
    let hit=false;
    forSolids(e.x,e.y,r+.8,s=>{
      if(ignoreNodes&&s.kind===0)return;
      const dx=e.x-s.x,dy=e.y-s.y,min=s.r+r;let d=Math.hypot(dx,dy);
      if(d>=min)return;
      let nx,ny;
      if(d<1e-4){const a=rand(TAU);nx=Math.cos(a);ny=Math.sin(a);}else{nx=dx/d;ny=dy/d;}
      const push=min-d+.002,tx=e.x+nx*push,ty=e.y+ny*push;
      if(walk(tx,ty)){e.x=tx;e.y=ty;hit=true;}
      else{const ax=e.x+nx*push;if(walk(ax,e.y))e.x=ax;const ay=e.y+ny*push;if(walk(e.x,ay))e.y=ay;}
    });
    if(!hit)break;
  }
}
function moveCircle(e,dx,dy,r,ignoreNodes){
  const len=Math.hypot(dx,dy);
  if(len<1e-7){depenetrate(e,r,ignoreNodes);return;}
  const steps=Math.min(8,Math.max(1,Math.ceil(len/.18))),sx=dx/steps,sy=dy/steps;
  for(let s=0;s<steps;s++){
    const nx=e.x+sx;if(landOK(nx,e.y,r,sx,0))e.x=nx;
    const ny=e.y+sy;if(landOK(e.x,ny,r,0,sy))e.y=ny;
    depenetrate(e,r,ignoreNodes);
  }
  if(!walk(e.x,e.y)){
    const c=toCell(e.x,e.y),ix=c[0],iy=c[1];let best=null,bd=1e9;
    for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
      const tx=ix+ox,ty=iy+oy;if(tx<0||ty<0||tx>=GRID||ty>=GRID)continue;
      if(!tiles[ty*GRID+tx].land)continue;
      const d=dist(e.x,e.y,tx-OFF+.5,ty-OFF+.5);if(d<bd){bd=d;best=[tx-OFF+.5,ty-OFF+.5];}
    }
    if(best){e.x=best[0];e.y=best[1];depenetrate(e,r,true);}
  }
}

