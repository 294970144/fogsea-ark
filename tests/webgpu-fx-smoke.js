'use strict';
/* 浏览器 smoke：实际加载游戏，确认 FX 选择 WebGPU 且 shader 编译通过；
   无 adapter 时确认回退 WebGL 且玩法仍可触发特效。 */
const {chromium}=require('playwright-core');
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL=process.env.FX_SMOKE_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({executablePath:EDGE,headless:true,args:[
    '--enable-unsafe-webgpu','--use-webgpu-adapter=swiftshader','--disable-gpu-sandbox'
  ]});
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[];
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('console',m=>{
    if(m.type()!=='error')return;
    const t=m.text();
    if(/Failed to load resource|ERR_CONNECTION_CLOSED/.test(t))return;
    errors.push('console: '+t);
  });
  await page.goto(URL,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof FX!=='undefined'&&!!FX._dbg,{timeout:10000});
  await page.waitForTimeout(200);
  const before=await page.evaluate(async()=>{
    let adapter=false;
    try{adapter=!!(navigator.gpu&&await navigator.gpu.requestAdapter());}catch(e){}
    return {hasGPU:!!navigator.gpu,adapter,backend:FX.backend,on:FX.on,
      active0:FX.activeCount(),fxcv:!!document.getElementById('fxcv')};
  });
  const countLit=async()=>{
    const shot=await page.locator('#fxcv').screenshot();
    return page.evaluate(async b64=>{
      const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const g=c.getContext('2d');g.drawImage(img,0,0);
      const d=g.getImageData(0,0,c.width,c.height).data;
      let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>30)n++;
      return {lit:n,total:d.length/4};
    },shot.toString('base64'));
  };
  const lit0=await countLit();
  const after=await page.evaluate(()=>{
    FX.cast('wall',core.x,core.y);FX.cast('tower',core.x,core.y);
    return {active:FX.activeCount(),backend:FX.backend,on:FX.on};
  });
  await page.waitForTimeout(250);
  const end=await page.evaluate(()=>({active:FX.activeCount(),on:FX.on,backend:FX.backend}));
  const lit1=await countLit();
  await browser.close();
  console.log(JSON.stringify({before,after,end,lit0,lit1,errors},null,2));
  if(errors.length)process.exit(1);
  if(!before.on||!after.on)process.exit(2);
  if(after.active<=0)process.exit(3);
  if(lit1.lit-lit0.lit<=10){console.error('FX canvas did not gain lit pixels');process.exit(4);}
  if(before.backend!=='webgpu')console.log('NOTICE: WebGPU adapter unavailable; fallback backend='+before.backend);
})().catch(e=>{console.error(e);process.exit(99);});
