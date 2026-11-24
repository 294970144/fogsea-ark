'use strict';
/* ---------------- 绘制 ---------------- */
function drawShadow(x,y,rx,a=.32){ctx.fillStyle=`rgba(4,10,14,${a})`;ctx.beginPath();ctx.ellipse(x,y,rx,rx*.5,0,0,TAU);ctx.fill();}
function drawTree(n){
  const[px,py]=proj(n.x,n.y);
  const sway=Math.sin(S.elapsed*1.2+n.sway)*2+(n.shake>0?rand(-3,3):0);
  drawShadow(px,py+2,16*n.s);
  if(!n.alive){ctx.fillStyle='#3d2f1e';ctx.fillRect(px-4,py-7,8,7);
    ctx.fillStyle='#5a4630';ctx.beginPath();ctx.ellipse(px,py-7,5,2.5,0,0,TAU);ctx.fill();return;}
  const s=n.s;
  ctx.fillStyle='#4a3826';ctx.fillRect(px-3*s,py-20*s,6*s,20*s);
  const L=[[-46,26,'#14524a'],[-34,30,'#1a6355'],[-22,33,'#20705c']];
  for(let i=0;i<3;i++){
    const ly=L[i][0],r=L[i][1];ctx.fillStyle=L[i][2];
    ctx.beginPath();ctx.moveTo(px+sway,py+ly*s-14*s);
    ctx.lineTo(px+r*s+sway*.5,py+ly*s+8*s);ctx.lineTo(px-r*s+sway*.5,py+ly*s+8*s);ctx.closePath();ctx.fill();
  }
  ctx.strokeStyle='rgba(143,227,208,.35)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(px+sway-2,py-58*s);ctx.lineTo(px-14*s+sway*.5,py-30*s);ctx.stroke();
}
function drawRock(n){
  const[px,py]=proj(n.x,n.y),sh=n.shake>0?rand(-2,2):0;
  drawShadow(px,py+2,15*n.s);
  if(!n.alive){ctx.fillStyle='#5c6a70';
    ctx.beginPath();ctx.ellipse(px-4,py-2,5,3,0,0,TAU);ctx.fill();
    ctx.beginPath();ctx.ellipse(px+5,py-1,4,2.5,0,0,TAU);ctx.fill();return;}
  const s=n.s;
  ctx.fillStyle='#66757c';ctx.beginPath();
  ctx.moveTo(px-16*s+sh,py);ctx.lineTo(px-10*s+sh,py-16*s);ctx.lineTo(px+2*s+sh,py-22*s);
  ctx.lineTo(px+15*s+sh,py-10*s);ctx.lineTo(px+16*s+sh,py);ctx.closePath();ctx.fill();
  ctx.fillStyle='#8b9aa1';ctx.beginPath();
  ctx.moveTo(px-10*s+sh,py-16*s);ctx.lineTo(px+2*s+sh,py-22*s);ctx.lineTo(px+6*s+sh,py-12*s);ctx.lineTo(px-6*s+sh,py-9*s);ctx.closePath();ctx.fill();
}
function drawCrys(n){
  const[px,py]=proj(n.x,n.y),sh=n.shake>0?rand(-2,2):0;
  drawShadow(px,py+2,13*n.s,.25);
  if(!n.alive){ctx.fillStyle='rgba(87,230,255,.25)';ctx.beginPath();ctx.ellipse(px,py-1,7,3,0,0,TAU);ctx.fill();return;}
  const s=n.s,pulse=.7+.3*Math.sin(S.elapsed*2.5+n.sway);
  const sh3=[[-8,-20,5],[2,-30,7],[10,-16,4]];
  for(let i=0;i<3;i++){
    const sx=sh3[i][0],sy=sh3[i][1],w=sh3[i][2];
    const g=ctx.createLinearGradient(px,py+sy*s,px,py);
    g.addColorStop(0,'#bff6ff');g.addColorStop(.5,'#57e6ff');g.addColorStop(1,'#1a7f9e');
    ctx.fillStyle=g;ctx.beginPath();
    ctx.moveTo(px+sx*s+sh,py+sy*s);ctx.lineTo(px+(sx+w)*s+sh,py+sy*s*.35);
    ctx.lineTo(px+sx*s+sh,py+2);ctx.lineTo(px+(sx-w)*s+sh,py+sy*s*.35);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle=`rgba(87,230,255,${.18*pulse})`;ctx.beginPath();ctx.ellipse(px,py-12*s,20*s,14*s,0,0,TAU);ctx.fill();
}
function drawCore(c){
  c=c||core;
  const[px,py]=proj(c.x,c.y),pulse=.8+.2*Math.sin(S.elapsed*2);
  drawShadow(px,py+4,42,.4);
  ctx.fillStyle='#2c3e46';ctx.beginPath();ctx.moveTo(px,py-20);ctx.lineTo(px+44,py+2);ctx.lineTo(px,py+24);ctx.lineTo(px-44,py+2);ctx.closePath();ctx.fill();
  ctx.fillStyle='#3a505a';ctx.beginPath();ctx.moveTo(px,py-20);ctx.lineTo(px+44,py+2);ctx.lineTo(px,py+12);ctx.lineTo(px-44,py+2);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,180,84,.4)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(px-30,py+1);ctx.lineTo(px,py-13);ctx.lineTo(px+30,py+1);ctx.stroke();
  ctx.fillStyle='#22333c';ctx.fillRect(px-6,py-72,12,58);
  ctx.fillStyle='#2e444e';ctx.fillRect(px-6,py-72,5,58);
  ctx.strokeStyle='#3a505a';ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(px-22,py-58);ctx.lineTo(px+22,py-58);ctx.stroke();
  const oy=py-84,g=ctx.createRadialGradient(px,oy,2,px,oy,20);
  g.addColorStop(0,'#fff3d6');g.addColorStop(.4,'#ffb454');g.addColorStop(1,'rgba(255,138,61,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,oy,20*pulse,0,TAU);ctx.fill();
  ctx.fillStyle='#ffe0a8';ctx.beginPath();ctx.arc(px,oy,7,0,TAU);ctx.fill();
  ctx.strokeStyle=`rgba(255,180,84,${.5*pulse})`;ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(px,oy,16,6+2*Math.sin(S.elapsed*1.4),S.elapsed*.8,0,TAU);ctx.stroke();
  if(c.flash>0){ctx.fillStyle=`rgba(255,77,109,${c.flash})`;ctx.beginPath();ctx.arc(px,oy,24,0,TAU);ctx.fill();}
  if(c.hp<c.max){
    const w=64,r=clamp(c.hp/c.max,0,1);
    ctx.fillStyle='rgba(7,15,22,.8)';ctx.fillRect(px-w/2,py-112,w,7);
    ctx.fillStyle=r>.35?'#ffb454':'#ff4d6d';ctx.fillRect(px-w/2+1,py-111,(w-2)*r,5);
  }
}
function drawBuild(b){
  const[px,py]=proj(b.x,b.y);drawShadow(px,py+2,20,.3);
  const fl=b.flash>0;
  if(b.type==='wall'){
    ctx.fillStyle=fl?'#ffd9a0':'#6b5334';
    ctx.beginPath();ctx.moveTo(px-24,py-4);ctx.lineTo(px,py-16);ctx.lineTo(px+24,py-4);ctx.lineTo(px+24,py+6);ctx.lineTo(px,py+18);ctx.lineTo(px-24,py+6);ctx.closePath();ctx.fill();
    ctx.fillStyle=fl?'#ffe8c4':'#8a6d44';
    ctx.beginPath();ctx.moveTo(px-24,py-4);ctx.lineTo(px,py-16);ctx.lineTo(px+24,py-4);ctx.lineTo(px,py+8);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(40,28,14,.6)';ctx.lineWidth=1.5;
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(px+i*9,py-10+Math.abs(i)*4);ctx.lineTo(px+i*9,py+12+Math.abs(i)*2);ctx.stroke();}
  }else if(b.type==='tower'){
    ctx.fillStyle='#4a3826';ctx.fillRect(px-4,py-34,8,34);
    ctx.fillStyle=fl?'#ffe8c4':'#6b5334';
    ctx.beginPath();ctx.moveTo(px-16,py-30);ctx.lineTo(px,py-38);ctx.lineTo(px+16,py-30);ctx.lineTo(px,py-22);ctx.closePath();ctx.fill();
    const sp=proj(Math.cos(b.ang),Math.sin(b.ang)),m=Math.hypot(sp[0],sp[1])||1,dx=sp[0]/m,dy=sp[1]/m;
    ctx.strokeStyle='#8fe3d0';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(px-dx*6,py-32-dy*6);ctx.lineTo(px+dx*14,py-32+dy*14);ctx.stroke();
    ctx.strokeStyle='#e0b070';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(px-dy*8,py-32+dx*4);ctx.lineTo(px+dy*8,py-32-dx*4);ctx.stroke();
    if(fl){ctx.fillStyle='rgba(255,240,200,.9)';ctx.beginPath();ctx.arc(px+dx*16,py-32+dy*16,4,0,TAU);ctx.fill();}
  }else if(b.type==='totem'){
    ctx.fillStyle='#3d4a44';ctx.fillRect(px-3,py-26,6,26);
    const p=.7+.3*Math.sin(b.pulse*3),g=ctx.createRadialGradient(px,py-34,1,px,py-34,12);
    g.addColorStop(0,'#d6ffe2');g.addColorStop(.5,'#6fe08a');g.addColorStop(1,'rgba(111,224,138,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py-34,12*p,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(111,224,138,.5)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(px,py-34,9,4,b.pulse,0,TAU);ctx.stroke();
  }else{
    ctx.fillStyle='#2c3e46';
    ctx.beginPath();ctx.moveTo(px-15,py-6);ctx.lineTo(px,py-14);ctx.lineTo(px+15,py-6);ctx.lineTo(px,py+2);ctx.closePath();ctx.fill();
    const sp=proj(Math.cos(b.ang),Math.sin(b.ang)),m=Math.hypot(sp[0],sp[1])||1,dx=sp[0]/m,dy=sp[1]/m;
    ctx.strokeStyle='#57e6ff';ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(px,py-16);ctx.lineTo(px+dx*16,py-16+dy*16);ctx.stroke();
    const p=.7+.3*Math.sin(b.pulse*4);
    ctx.fillStyle=`rgba(87,230,255,${.8*p})`;ctx.beginPath();ctx.arc(px,py-16,5,0,TAU);ctx.fill();
  }
  if(b.hp<b.max&&b.max>1){
    const w=34,r=clamp(b.hp/b.max,0,1);
    ctx.fillStyle='rgba(7,15,22,.8)';ctx.fillRect(px-w/2,py-46,w,5);
    ctx.fillStyle=r>.4?'#8fe3d0':'#ff4d6d';ctx.fillRect(px-w/2+1,py-45,(w-2)*r,3);
  }
}
function drawPlayer(p){
  p=p||P;if(p.downed)return;
  const[px,py]=proj(p.x,p.y),bob=p.moving?Math.sin(p.anim)*2:Math.sin(S.elapsed*2);
  const sp=proj(Math.cos(p.face),Math.sin(p.face)),flip=sp[0]<0?-1:1;
  drawShadow(px,py+2,13,.35);
  const blink=p.ifr>0&&Math.floor(S.elapsed*16)%2===0;
  ctx.save();ctx.translate(px,py+bob);ctx.scale(flip,1);
  if(blink)ctx.globalAlpha=.45;
  const g=ctx.createLinearGradient(0,-30,0,0);
  g.addColorStop(0,'#2a6b5e');g.addColorStop(1,'#173f3c');ctx.fillStyle=g;
  ctx.beginPath();ctx.moveTo(0,-30);ctx.quadraticCurveTo(11,-24,9,-2);ctx.quadraticCurveTo(4,2,0,1);
  ctx.quadraticCurveTo(-6,2,-9,-2);ctx.quadraticCurveTo(-11,-24,0,-30);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,180,84,.7)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-8,-4);ctx.quadraticCurveTo(0,0,8,-4);ctx.stroke();
  ctx.fillStyle='#1e4d46';ctx.beginPath();ctx.arc(0,-30,8,0,TAU);ctx.fill();
  ctx.fillStyle='#0c1f1c';ctx.beginPath();ctx.arc(2,-29,5,0,TAU);ctx.fill();
  ctx.fillStyle='#ffd9a0';ctx.fillRect(2,-31,2.4,2);ctx.fillRect(5.5,-31,2.4,2);
  const lx=-11,ly=-14+Math.sin(S.elapsed*3)*1.5;
  ctx.strokeStyle='#5a4630';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-7,-20);ctx.lineTo(lx,ly-4);ctx.stroke();
  const lg=ctx.createRadialGradient(lx,ly,1,lx,ly,10);
  lg.addColorStop(0,'#fff3d6');lg.addColorStop(.4,'#ffb454');lg.addColorStop(1,'rgba(255,138,61,0)');
  ctx.fillStyle=lg;ctx.beginPath();ctx.arc(lx,ly,10,0,TAU);ctx.fill();
  ctx.fillStyle='#ffe0a8';ctx.fillRect(lx-2.5,ly-3.5,5,7);
  ctx.strokeStyle='#7a5c34';ctx.strokeRect(lx-2.5,ly-3.5,5,7);
  ctx.restore();
  if(p.swingT>0){
    const t=1-p.swingT/.18,a=p.face-1.1+t*2.2;
    const tip=proj(p.x+Math.cos(a)*1.5,p.y+Math.sin(a)*1.5);
    ctx.strokeStyle='rgba(238,247,242,.95)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(px,py-14);ctx.lineTo(tip[0],tip[1]-14);ctx.stroke();
  }
}
function drawFoe(f){
  const[px,py]=proj(f.x,f.y),bob=Math.sin(f.anim)*2,fl=f.flash>0;
  drawShadow(px,py+2,f.r*34,.3);
  ctx.save();ctx.translate(px,py+bob*.4);
  const bc=fl?'#ffffff':f.elite?'#c084ff':'#8b5fd6',dc=fl?'#ffffff':'#5a3a9e';
  if(f.type==='crawler'){
    ctx.fillStyle=dc;
    for(let i=0;i<4;i++){const a=f.anim+i*1.6;ctx.beginPath();ctx.ellipse(Math.cos(a)*10,-2+Math.sin(a)*2,3,4,0,0,TAU);ctx.fill();}
    const g=ctx.createLinearGradient(0,-20,0,0);g.addColorStop(0,bc);g.addColorStop(1,dc);
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,-9+bob*.4,13,10+bob*.3,0,0,TAU);ctx.fill();
    ctx.fillStyle='#ff4d6d';ctx.beginPath();ctx.arc(-4,-11,2.2,0,TAU);ctx.arc(4,-11,2.2,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(255,77,109,.4)';ctx.beginPath();ctx.arc(-4,-11,4,0,TAU);ctx.arc(4,-11,4,0,TAU);ctx.fill();
  }else if(f.type==='spitter'){
    const hv=Math.sin(f.anim*.7)*3;
    ctx.strokeStyle=dc;ctx.lineWidth=2;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo((i-1)*5,-8+hv);
      ctx.quadraticCurveTo((i-1)*8+Math.sin(f.anim+i)*4,2,(i-1)*6,6);ctx.stroke();}
    const g=ctx.createRadialGradient(-3,-16+hv,2,0,-13+hv,12);
    g.addColorStop(0,fl?'#fff':'#c9a8ff');g.addColorStop(1,dc);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,-13+hv,10,0,TAU);ctx.fill();
    ctx.fillStyle='#2c1650';ctx.beginPath();ctx.arc(0,-11+hv,4,0,TAU);ctx.fill();
    ctx.fillStyle='#ff4d6d';ctx.beginPath();ctx.arc(0,-11+hv,2,0,TAU);ctx.fill();
  }else if(f.type==='brute'){
    const g=ctx.createLinearGradient(0,-34,0,0);g.addColorStop(0,bc);g.addColorStop(1,dc);
    ctx.fillStyle=g;ctx.beginPath();
    ctx.moveTo(-18,0);ctx.quadraticCurveTo(-22,-26,-10,-32);ctx.quadraticCurveTo(0,-38,10,-32);
    ctx.quadraticCurveTo(22,-26,18,0);ctx.closePath();ctx.fill();
    ctx.fillStyle=fl?'#fff':'#d9c4ff';
    ctx.beginPath();ctx.moveTo(-10,-30);ctx.lineTo(-16,-42);ctx.lineTo(-6,-33);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(10,-30);ctx.lineTo(16,-42);ctx.lineTo(6,-33);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ff4d6d';ctx.beginPath();ctx.arc(-6,-24,2.8,0,TAU);ctx.arc(6,-24,2.8,0,TAU);ctx.fill();
    ctx.strokeStyle=dc;ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(-18,-14);ctx.lineTo(-24,-2+Math.sin(f.anim)*3);ctx.stroke();
    ctx.beginPath();ctx.moveTo(18,-14);ctx.lineTo(24,-2-Math.sin(f.anim)*3);ctx.stroke();
  }else{
    const p=.85+.15*Math.sin(f.anim*.5);
    ctx.fillStyle='rgba(160,107,255,.15)';ctx.beginPath();ctx.ellipse(0,-20,44*p,30*p,0,0,TAU);ctx.fill();
    const g=ctx.createLinearGradient(0,-64,0,0);g.addColorStop(0,fl?'#fff':'#b06bff');g.addColorStop(1,'#3d2078');
    ctx.fillStyle=g;ctx.beginPath();
    ctx.moveTo(-34,0);ctx.quadraticCurveTo(-42,-46,-20,-58);ctx.quadraticCurveTo(0,-70,20,-58);
    ctx.quadraticCurveTo(42,-46,34,0);ctx.closePath();ctx.fill();
    ctx.fillStyle=fl?'#fff':'#d9c4ff';
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*12-4,-58+Math.abs(i)*4);
      ctx.lineTo(i*12,-74+Math.abs(i)*5);ctx.lineTo(i*12+4,-58+Math.abs(i)*4);ctx.closePath();ctx.fill();}
    for(const[ex,ey]of[[-13,-42],[0,-36],[13,-42]]){
      ctx.fillStyle='rgba(255,77,109,.35)';ctx.beginPath();ctx.arc(ex,ey,7,0,TAU);ctx.fill();
      ctx.fillStyle='#ff4d6d';ctx.beginPath();ctx.arc(ex,ey,3.5,0,TAU);ctx.fill();
    }
  }
  if(f.elite&&!f.boss){ctx.strokeStyle='rgba(255,180,84,.8)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(0,-10,f.r*40,f.r*28,0,0,TAU);ctx.stroke();}
  ctx.restore();
  if(f.hp<f.max&&!f.boss){
    const w=26,r=clamp(f.hp/f.max,0,1);
    ctx.fillStyle='rgba(7,15,22,.75)';ctx.fillRect(px-w/2,py-f.r*52-8,w,4);
    ctx.fillStyle='#c9a8ff';ctx.fillRect(px-w/2+.5,py-f.r*52-7.5,(w-1)*r,3);
  }
  if(f.boss&&f.hp<f.max){
    const w=90,r=clamp(f.hp/f.max,0,1);
    ctx.fillStyle='rgba(7,15,22,.85)';ctx.fillRect(px-w/2,py-92,w,8);
    ctx.fillStyle='#ff4d6d';ctx.fillRect(px-w/2+1,py-91,(w-2)*r,6);
    ctx.strokeStyle='rgba(160,107,255,.6)';ctx.lineWidth=1;ctx.strokeRect(px-w/2,py-92,w,8);
  }
}
function drawPickup(p){
  const[px,py]=proj(p.x,p.y),bob=Math.sin(p.bob)*2;
  ctx.globalAlpha=p.life<3?p.life/3:1;drawShadow(px,py+1,5,.2);
  if(p.type==='wood'){ctx.fillStyle='#8a6d44';ctx.fillRect(px-5,py-8+bob,10,5);
    ctx.fillStyle='#e0b070';ctx.beginPath();ctx.ellipse(px+5,py-5.5+bob,2,2.5,0,0,TAU);ctx.fill();}
  else if(p.type==='stone'){ctx.fillStyle='#b9c4c9';ctx.beginPath();
    ctx.moveTo(px-5,py-3+bob);ctx.lineTo(px-2,py-9+bob);ctx.lineTo(px+4,py-7+bob);ctx.lineTo(px+5,py-3+bob);ctx.closePath();ctx.fill();}
  else{ctx.drawImage(GLOW.cyan,px-8,py-14+bob,16,16);ctx.fillStyle='#57e6ff';
    ctx.beginPath();ctx.moveTo(px,py-12+bob);ctx.lineTo(px+3.5,py-6+bob);ctx.lineTo(px,py-1+bob);ctx.lineTo(px-3.5,py-6+bob);ctx.closePath();ctx.fill();}
  ctx.globalAlpha=1;
}
const dlPool=[],dlActive=[];let dlN=0;
function dlPush(d,k,o){let it=dlPool[dlN];if(!it){it={d:0,k:0,o:null};dlPool[dlN]=it;}it.d=d;it.k=k;it.o=o;dlN++;}
function drawGhost(){
  const a=aimDef();if(!a||S.mode!=='play')return;
  const def=a.def;
  if(def.target==='self'||def.target==='pick')return;
  if(def.kind==='build'){
    const[tx,ty]=ghostTile(),chk=placeCheck(def,tx,ty);
    const pp=proj(P.x,P.y);
    ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(pp[0],pp[1],5.5*TW/2*.72,5.5*TH/2*.72,0,0,TAU);ctx.stroke();
    const c=proj(tx,ty);
    ctx.fillStyle=chk.ok?'rgba(255,255,255,.3)':'rgba(255,77,109,.32)';
    ctx.beginPath();ctx.moveTo(c[0],c[1]-TH/2);ctx.lineTo(c[0]+TW/2,c[1]);ctx.lineTo(c[0],c[1]+TH/2);ctx.lineTo(c[0]-TW/2,c[1]);ctx.closePath();ctx.fill();
    ctx.strokeStyle=chk.ok?'rgba(255,255,255,.95)':'rgba(255,77,109,.95)';ctx.lineWidth=2;ctx.stroke();
    ctx.globalAlpha=.55;
    drawBuild({type:def.build,x:tx,y:ty,hp:1,max:1,flash:0,pulse:S.elapsed,ang:0,r:.4});
    ctx.globalAlpha=1;
    if(!chk.ok){
      ctx.font='700 12px "Noto Sans SC",sans-serif';ctx.textAlign='center';
      ctx.strokeStyle='rgba(5,10,16,.9)';ctx.lineWidth=3;ctx.strokeText(chk.msg,c[0],c[1]-52);
      ctx.fillStyle='#ff8fa3';ctx.fillText(chk.msg,c[0],c[1]-52);
    }
  }else{
    const wx=mouseWorld[0],wy=mouseWorld[1],chk=placeCheck(def,wx,wy);
    const c=proj(wx,wy),R=def.radius;
    ctx.fillStyle=chk.ok?'rgba(255,255,255,.22)':'rgba(255,77,109,.26)';
    ctx.beginPath();ctx.ellipse(c[0],c[1],R*TW/2*.72,R*TH/2*.72,0,0,TAU);ctx.fill();
    ctx.strokeStyle=chk.ok?'rgba(255,255,255,.95)':'rgba(255,77,109,.95)';ctx.lineWidth=2;ctx.stroke();
    ctx.globalAlpha=.5;ctx.drawImage(chk.ok?GLOW.white:GLOW.violet,c[0]-40,c[1]-40,80,80);ctx.globalAlpha=1;
  }
}
function render(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle=seaGrad;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(143,227,208,.06)';ctx.lineWidth=1.5;
  for(let i=0;i<6;i++){
    const y=(i*151+S.elapsed*8)%(H+100)-50;
    ctx.beginPath();for(let x=0;x<=W;x+=48)ctx.lineTo(x,y+Math.sin(x*.02+S.elapsed+i)*6);ctx.stroke();
  }
  const cp=proj(cam.x,cam.y);
  ctx.save();
  ctx.translate(W/2+cam.sx,H/2+cam.sy);ctx.scale(cam.z,cam.z);ctx.translate(-cp[0],-cp[1]);
  ctx.drawImage(groundCv,-groundCv.OX,-groundCv.M);
  dlN=0;
  for(const n of nodes)dlPush(n.x+n.y,0,n);
  for(const b of builds)dlPush(b.x+b.y,1,b);
  dlPush(core.x+core.y,2,null);
  for(const f of foes)if(!f.dead)dlPush(f.x+f.y,3,f);
  for(const p of picks)dlPush(p.x+p.y,4,p);
  if(!P.downed)dlPush(P.x+P.y,5,null);
  for(const g of ghosts)dlPush(g.x+g.y,6,g);
  for(const w of warns)dlPush(w.x+w.y,7,w);
  dlActive.length=dlN;for(let i=0;i<dlN;i++)dlActive[i]=dlPool[i];
  dlActive.sort((a,b)=>a.d-b.d);
  for(let i=0;i<dlN;i++){
    const it=dlActive[i];
    switch(it.k){
      case 0:{const n=it.o;n.type==='tree'?drawTree(n):n.type==='rock'?drawRock(n):drawCrys(n);break;}
      case 1:drawBuild(it.o);break;
      case 2:drawCore();break;
      case 3:drawFoe(it.o);break;
      case 4:drawPickup(it.o);break;
      case 5:drawPlayer();break;
      case 6:{const g=it.o,p=proj(g.x,g.y);ctx.globalAlpha=.3*(1-g.t/.3);ctx.fillStyle='#8fe3d0';
        ctx.beginPath();ctx.ellipse(p[0],p[1]-15,9,16,0,0,TAU);ctx.fill();ctx.globalAlpha=1;break;}
      case 7:{
        const w=it.o,p=proj(w.x,w.y),t=1-w.t/(w.boss?1.6:.95);
        ctx.strokeStyle=w.boss?'rgba(255,77,109,.8)':'rgba(160,107,255,.7)';ctx.lineWidth=2.5;
        for(let i=0;i<3;i++){ctx.beginPath();
          ctx.ellipse(p[0],p[1],(14+i*8)*(1-t*.3),(7+i*4)*(1-t*.3),S.elapsed*3+i*2,0,Math.PI*1.4);ctx.stroke();}
        ctx.fillStyle=`rgba(160,107,255,${.25+.2*Math.sin(S.elapsed*10)})`;
        ctx.beginPath();ctx.ellipse(p[0],p[1],18,9,0,0,TAU);ctx.fill();break;}
    }
  }
  drawGhost();
  for(const s of slashes){
    const t=s.t/.18,c0=proj(s.x,s.y);
    ctx.globalAlpha=(1-t)*.8;
    const g=ctx.createRadialGradient(c0[0],c0[1],4,c0[0],c0[1],Math.max(6,s.R*TW/2));
    g.addColorStop(0,'rgba(255,220,160,0)');g.addColorStop(.7,'rgba(255,200,120,.5)');g.addColorStop(1,'rgba(255,180,84,.9)');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(c0[0],c0[1]-10);
    for(let i=0;i<=10;i++){const a=s.ang-1.1+i/10*2.2,p=proj(s.x+Math.cos(a)*s.R,s.y+Math.sin(a)*s.R);ctx.lineTo(p[0],p[1]-10);}
    ctx.closePath();ctx.fill();ctx.globalAlpha=1;
  }
  for(const s of shots){
    const p=proj(s.x,s.y),px=p[0],py=p[1],z=s.z||10;
    if(s.type==='arrow'){
      const sp=proj(s.vx,s.vy),m=Math.hypot(sp[0],sp[1])||1;
      ctx.strokeStyle='#e8d9b0';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(px-sp[0]/m*7,py-z-sp[1]/m*7);ctx.lineTo(px+sp[0]/m*7,py-z+sp[1]/m*7);ctx.stroke();
    }else if(s.type==='cannon'){ctx.drawImage(GLOW.cyan,px-10,py-z-10,20,20);
      ctx.fillStyle='#dffaff';ctx.beginPath();ctx.arc(px,py-z,3,0,TAU);ctx.fill();}
    else if(s.type==='fog'){ctx.drawImage(GLOW.violet,px-9,py-21,18,18);
      ctx.fillStyle='#e0ccff';ctx.beginPath();ctx.arc(px,py-12,2.6,0,TAU);ctx.fill();}
    else{const sp=proj(s.vx,s.vy),m=Math.hypot(sp[0],sp[1])||1;
      ctx.strokeStyle='rgba(143,227,208,.9)';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(px-sp[1]/m*12,py-12+sp[0]/m*6);ctx.lineTo(px+sp[1]/m*12,py-12-sp[0]/m*6);ctx.stroke();}
  }
  for(const p of parts){
    const pr=proj(p.x,p.y),px=pr[0],py=pr[1],t=p.life/p.max;
    if(p.ring){
      const r=lerp(p.r1,p.r0,t);
      ctx.strokeStyle=p.col;ctx.globalAlpha=t;ctx.lineWidth=3*t+1;
      ctx.beginPath();ctx.ellipse(px,py,r*TW/2*1.2,r*TH/2*1.2,0,0,TAU);ctx.stroke();ctx.globalAlpha=1;
    }else{ctx.globalAlpha=t;ctx.fillStyle=p.col;
      ctx.beginPath();ctx.arc(px,py-p.z,p.size*t+.5,0,TAU);ctx.fill();ctx.globalAlpha=1;}
  }
  ctx.textAlign='center';
  for(const f of floats){
    const p=proj(f.x,f.y),t=f.life/.9;
    ctx.globalAlpha=Math.min(1,t*2);
    ctx.font=(f.big?'900 17px':'700 13px')+' "Noto Sans SC",sans-serif';
    ctx.strokeStyle='rgba(5,10,16,.9)';ctx.lineWidth=3;
    ctx.strokeText(f.txt,p[0],p[1]-34-(1-t)*22);
    ctx.fillStyle=f.col;ctx.fillText(f.txt,p[0],p[1]-34-(1-t)*22);ctx.globalAlpha=1;
  }
  ctx.restore();
  const night=(S.mode==='menu'||S.mode==='prep')?.55:S.nightAmt;
  if(night>0.02){
    ctx.fillStyle=`rgba(5,9,22,${.52*night})`;ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation='lighter';
    const light=(x,y,r,img,a)=>{
      const p=proj(x,y),sx=(p[0]-cp[0])*cam.z+W/2+cam.sx,sy=(p[1]-cp[1])*cam.z+H/2+cam.sy,rr=r*cam.z;
      if(rr<2||sx<-rr||sy<-rr||sx>W+rr||sy>H+rr)return;
      ctx.globalAlpha=clamp(a*night,0,1);ctx.drawImage(img,sx-rr,sy-rr,rr*2,rr*2);
    };
    light(core.x,core.y,260,GLOW.amber,.5);
    if(!P.downed)light(P.x,P.y,160,GLOW.lantern,.45);
    for(const b of builds){
      if(b.type==='tower')light(b.x,b.y,70,GLOW.mint,.3);
      else if(b.type==='cannon')light(b.x,b.y,90,GLOW.cyan,.35);
      else if(b.type==='totem')light(b.x,b.y,90,GLOW.leaf,.3);
    }
    for(const n of nodes)if(n.alive&&n.type==='crys')light(n.x,n.y,60,GLOW.cyan,.3);
    for(const s of shots)if(s.type==='cannon'||s.type==='fog')light(s.x,s.y,40,s.type==='cannon'?GLOW.cyan:GLOW.violet,.35);
    ctx.globalAlpha=1;
    const cpr=proj(core.x,core.y),cpx=(cpr[0]-cp[0])*cam.z+W/2+cam.sx,cpy=(cpr[1]-cp[1])*cam.z+H/2+cam.sy;
    const beamA=(S.mode==='launch'?Math.min(1,S.launchT/1.2):core.beam*.35)*night;
    if(beamA>0.02){
      const bw=(S.mode==='launch'?20+S.launchT*60:12)*cam.z;
      const g=ctx.createLinearGradient(cpx,cpy-90*cam.z,cpx,cpy-90*cam.z-320*cam.z);
      g.addColorStop(0,`rgba(255,200,120,${beamA})`);g.addColorStop(1,'rgba(255,200,120,0)');
      ctx.fillStyle=g;ctx.fillRect(cpx-bw/2,cpy-90*cam.z-320*cam.z,bw,320*cam.z);
    }
    ctx.globalCompositeOperation='source-over';
  }else{ctx.fillStyle='rgba(255,190,120,.05)';ctx.fillRect(0,0,W,H);}
  for(const f of fogBlobs){
    const sx=W/2+f.x-cp[0]*.12,sy=H/2+f.y-cp[1]*.12+Math.sin(S.elapsed*.3+f.ph)*14;
    ctx.globalAlpha=clamp(f.a*(1+night*.8),0,1);ctx.drawImage(GLOW.fog,sx-f.s,sy-f.s,f.s*2,f.s*2);
  }
  ctx.globalAlpha=1;ctx.fillStyle=vigGrad;ctx.fillRect(0,0,W,H);
  if(S.mode==='launch'&&S.launchT>1.6){ctx.fillStyle=`rgba(255,240,214,${Math.min(1,(S.launchT-1.6)/1)})`;ctx.fillRect(0,0,W,H);}
  renderMinimap();
}
function renderMinimap(){
  mctx.setTransform(DPR,0,0,DPR,0,0);mctx.clearRect(0,0,124,124);
  mctx.drawImage(mmMask,0,0,124,124);
  const k=124/GRID;
  const dot=(x,y,r,col)=>{mctx.fillStyle=col;mctx.beginPath();mctx.arc(x*k,y*k,r,0,TAU);mctx.fill();};
  for(const b of builds)dot(b.x,b.y,1.6,'#57e6ff');
  if(Math.floor(S.elapsed*6)%2===0)for(const w of warns)dot(w.x,w.y,2.5,'#a06bff');
  for(const f of foes)if(!f.dead)dot(f.x,f.y,f.boss?3.5:1.6,f.boss?'#ff4d6d':'#ff7a90');
  dot(core.x,core.y,3+Math.sin(S.elapsed*3)*.7,'#ffb454');
  if(!P.downed){
    dot(P.x,P.y,2.4,'#ffffff');
    mctx.strokeStyle='rgba(255,255,255,.6)';mctx.lineWidth=1;
    mctx.beginPath();mctx.moveTo(P.x*k,P.y*k);mctx.lineTo(P.x*k+Math.cos(P.face)*5,P.y*k+Math.sin(P.face)*5);mctx.stroke();
  }
}

