'use strict';
/* ---------------- WebGPU 优先 / WebGL 回退特效叠加层 ----------------
   透明画布叠在 2D 战斗画布之上；世界锚定粒子通过仿射 uniform 在
   vertex shader 内投影，相机/震屏零 CPU 跟随。WebGPU 不可用时回退
   原 three.js WebGL 路径。由 render() 尾部 FX.frame() 驱动。 */
const FX={on:false,q:1,time:0,_detN:0,_magePending:false,backend:'none'};

(function(){
const ADD=6144,ALPHA=2048,QUADS=16;
let renderer=null,scene=null,camera=null,atlasTex=null,atlasCanvas=null,veil=null;
let gpu=null;
let pools=null,quads=[],projs=[],events=[];
let lastNow=0,wasActive=false,emaMs=16,slowT=0,deadT=0,veilOff=false;
let vw=0,vh=0,vdpr=1;

const hexCache=Object.create(null);
function rgb(hex){
  let c=hexCache[hex];
  if(c)return c;
  const n=parseInt(hex.slice(1),16);
  c=[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
  hexCache[hex]=c;return c;
}
const R=Math.random,TAU2=Math.PI*2;
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const WHITE=[1,1,1];

/* ---------------- 粒子图集（程序化，零外部资源） ---------------- */
function makeAtlas(){
  const c=document.createElement('canvas');c.width=512;c.height=384;
  const g=c.getContext('2d');
  const cell=(i,fn)=>{g.save();g.translate((i%4)*128,((i/4)|0)*128);fn();g.restore();};
  const radial=(cx,cy,r,stops)=>{const gr=g.createRadialGradient(cx,cy,1,cx,cy,r);
    stops.forEach(s=>gr.addColorStop(s[0],s[1]));g.fillStyle=gr;g.fillRect(cx-r,cy-r,r*2,r*2);};
  cell(0,()=>radial(64,64,60,[[0,'rgba(255,255,255,1)'],[.4,'rgba(255,255,255,.7)'],[1,'rgba(255,255,255,0)']]));
  cell(1,()=>{g.fillStyle='rgba(255,255,255,.95)';
    g.beginPath();g.moveTo(64,6);g.lineTo(74,54);g.lineTo(122,64);g.lineTo(74,74);g.lineTo(64,122);g.lineTo(54,74);g.lineTo(6,64);g.lineTo(54,54);g.closePath();g.fill();
    radial(64,64,20,[[0,'rgba(255,255,255,1)'],[1,'rgba(255,255,255,0)']]);});
  cell(2,()=>{g.fillStyle='rgba(255,255,255,.95)';
    g.beginPath();g.moveTo(64,8);g.lineTo(82,64);g.lineTo(64,120);g.lineTo(46,64);g.closePath();g.fill();
    g.strokeStyle='rgba(255,255,255,.5)';g.lineWidth=3;
    g.beginPath();g.moveTo(30,64);g.lineTo(98,64);g.stroke();});
  cell(3,()=>{g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=5;
    g.beginPath();g.arc(64,64,44,0,TAU2);g.stroke();
    g.lineWidth=3;g.beginPath();g.arc(64,64,30,0,TAU2);g.stroke();
    g.fillStyle='rgba(255,255,255,.95)';
    g.beginPath();g.moveTo(64,34);g.lineTo(90,80);g.lineTo(38,80);g.closePath();g.fill();
    g.beginPath();g.arc(64,64,7,0,TAU2);g.fill();});
  cell(4,()=>{const gr=g.createLinearGradient(0,4,0,124);
    gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.5,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr;g.fillRect(56,4,16,120);
    const gr2=g.createLinearGradient(0,4,0,124);
    gr2.addColorStop(0,'rgba(255,255,255,0)');gr2.addColorStop(.5,'rgba(255,255,255,.45)');gr2.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr2;g.fillRect(44,4,40,120);});
  cell(5,()=>{g.strokeStyle='rgba(255,255,255,.95)';g.lineWidth=5;g.lineCap='round';
    for(let i=0;i<6;i++){const a=i/6*TAU2;
      g.beginPath();g.moveTo(64,64);g.lineTo(64+Math.cos(a)*46,64+Math.sin(a)*46);g.stroke();
      g.beginPath();g.moveTo(64+Math.cos(a)*26,64+Math.sin(a)*26);
      g.lineTo(64+Math.cos(a+.5)*38,64+Math.sin(a+.5)*38);
      g.moveTo(64+Math.cos(a)*26,64+Math.sin(a)*26);
      g.lineTo(64+Math.cos(a-.5)*38,64+Math.sin(a-.5)*38);g.stroke();}
    g.fillStyle='#fff';g.beginPath();g.arc(64,64,8,0,TAU2);g.fill();});
  cell(6,()=>{[[64,64,44],[40,52,26],[88,56,28],[52,86,26],[82,84,24]].forEach(b=>
    radial(b[0],b[1],b[2],[[0,'rgba(255,255,255,.5)'],[1,'rgba(255,255,255,0)']]));});
  cell(7,()=>radial(64,64,62,[[0,'rgba(255,255,255,.9)'],[.25,'rgba(255,255,255,.4)'],[.6,'rgba(255,255,255,.12)'],[1,'rgba(255,255,255,0)']]));
  cell(8,()=>{g.fillStyle='rgba(255,255,255,.95)';
    g.fillRect(62,16,4,76);
    g.beginPath();g.moveTo(64,118);g.lineTo(51,88);g.lineTo(77,88);g.closePath();g.fill();
    g.beginPath();g.moveTo(62,16);g.lineTo(49,8);g.lineTo(49,26);g.lineTo(62,34);g.closePath();g.fill();
    g.beginPath();g.moveTo(66,16);g.lineTo(79,8);g.lineTo(79,26);g.lineTo(66,34);g.closePath();g.fill();});
  atlasCanvas=c;
  const t=new THREE.CanvasTexture(c);t.flipY=false;return t;
}

/* ---------------- WebGPU 后端（主路径） ----------------
   数据布局与 WGSL 严格对齐：
   Particle = 96 字节 / 24 float；Uniforms = 112 字节 / 28 float。 */
const PART_STRIDE=96,QUAD_STRIDE=112;
const COMMON_WGSL=`
struct Globals {
  viewport: vec4f,
  camera: vec4f,
  origin: vec4f,
  time: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};
@group(0) @binding(0) var<uniform> G: Globals;
fn screen(p: vec2f) -> vec2f {
  return vec2f(p.x / G.viewport.x * 2.0 - 1.0, 1.0 - p.y / G.viewport.y * 2.0);
}
fn hash21(p0: vec2f) -> f32 {
  var p = fract(p0 * vec2f(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
fn vnoise(p0: vec2f) -> f32 {
  let i = floor(p0);
  let f = fract(p0);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x),
             mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}
const corners = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
  vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
`;
const SPRITE_VERT_WGSL=COMMON_WGSL+`
struct Particle {
  world: vec2f,
  vel: vec2f,
  phys: vec4f,
  born: vec2f,
  padA: vec2f,
  look: vec4f,
  col: vec3f,
  flags: f32,
  padB: vec3f,
  padC: f32,
};
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) alpha: f32,
  @location(3) shape: f32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let p = particles[ii];
  let age = G.time - p.born.x;
  let k = age / p.born.y;
  var o: Out;
  o.col = p.col;
  o.shape = p.look.y;
  o.alpha = 0.0;
  if (age < 0.0 || k > 1.0 || k < 0.0) {
    o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    o.uv = vec2f(0.0);
    return o;
  }
  let damp = select(age, (1.0 - exp(-p.phys.w * age)) / max(p.phys.w, 0.0001), p.phys.w > 0.0);
  let w = p.world + p.vel * damp;
  let h = p.phys.x + p.phys.y * age - 0.5 * p.phys.z * age * age;
  let isScreen = p.flags % 2.0 > 0.5;
  var scr: vec2f;
  var sz: f32;
  if (isScreen) {
    scr = w;
    sz = p.look.x;
  } else {
    scr = vec2f(dot(w, G.camera.xy) + G.origin.x, dot(w, G.camera.zw) + G.origin.y);
    scr.y -= h * G.origin.z;
    sz = p.look.x * G.origin.z;
  }
  let hold = step(1.5, p.flags);
  let grow = mix(smoothstep(0.0, 0.07, k), smoothstep(0.0, 0.02, k), hold);
  let fade = mix(1.0 - smoothstep(0.5, 1.0, k), 1.0 - smoothstep(0.86, 1.0, k), hold);
  o.alpha = fade * grow;
  let rot = p.look.z * 6.28318 + p.look.w * age;
  let size = max(sz * mix(0.35 + 0.65 * fade, 1.0, hold) * grow, 0.0) * G.origin.w;
  let q = corners[vi] - vec2f(0.5);
  let c = cos(rot);
  let s = sin(rot);
  let r = vec2f(c * q.x - s * q.y, s * q.x + c * q.y);
  o.pos = vec4f(screen(scr + r * size), 0.0, 1.0);
  o.uv = corners[vi];
  return o;
}`;
const SPRITE_FRAG_WGSL=COMMON_WGSL+`
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;
struct Out {
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) alpha: f32,
  @location(3) shape: f32,
};
@fragment fn fs(i: Out) -> @location(0) vec4f {
  if (i.alpha < 0.003) { discard; }
  let id = vec2f(floor(i.shape % 4.0), floor(i.shape / 4.0));
  let uv = (id + i.uv) / vec2f(4.0, 3.0);
  let tx = textureSample(atlas, smp, uv);
  return vec4f(i.col * tx.rgb, tx.a * i.alpha);
}`;
const QUAD_VERT_WGSL=COMMON_WGSL+`
struct Uniforms {
  mode: f32, t: f32, time: f32, shape: f32,
  kind: f32, pad0: f32, pad1: f32, pad2: f32,
  col: vec4f,
  col2: vec4f,
  p1: vec4f,
  rect: vec4f,
  rot: f32,
  pad3: f32,
  pad4: f32,
  pad5: f32,
};
@group(0) @binding(1) var<uniform> U: Uniforms;
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};
@vertex fn vs(@builtin(vertex_index) vi: u32) -> Out {
  let uv = corners[vi];
  let q = (uv - vec2f(0.5)) * U.rect.zw;
  let c = cos(U.rot);
  let s = sin(U.rot);
  let r = vec2f(c * q.x - s * q.y, s * q.x + c * q.y);
  var o: Out;
  o.uv = uv;
  o.pos = vec4f(screen(U.rect.xy + r), 0.0, 1.0);
  return o;
}`;
const QUAD_FRAG_WGSL=COMMON_WGSL+`
struct Uniforms {
  mode: f32, t: f32, time: f32, shape: f32,
  kind: f32, pad0: f32, pad1: f32, pad2: f32,
  col: vec4f,
  col2: vec4f,
  p1: vec4f,
  rect: vec4f,
  rot: f32,
  pad3: f32,
  pad4: f32,
  pad5: f32,
};
@group(0) @binding(1) var<uniform> U: Uniforms;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;
struct Out { @location(0) uv: vec2f };
@fragment fn fs(i: Out) -> @location(0) vec4f {
  let uv = i.uv;
  let p = (uv - vec2f(0.5)) * 2.0;
  let d = length(p);
  let env = smoothstep(0.0, 0.08, U.t) * (1.0 - smoothstep(0.85, 1.0, U.t));
  var col = U.col.rgb;
  var a = 0.0;
  let sh = floor(U.shape + 0.5);
  var ruv = vec2f(uv.x, 1.0 - uv.y) - vec2f(0.5);
  let gc = cos(U.p1.x);
  let gs = sin(U.p1.x);
  ruv = vec2f(gc * ruv.x - gs * ruv.y, gs * ruv.x + gc * ruv.y) + vec2f(0.5);
  let auv = (vec2f(floor(sh % 4.0), floor(sh / 4.0)) + ruv) / vec2f(4.0, 3.0);
  let tx = textureSample(atlas, smp, auv);
  if (U.mode < 0.5) {
    let band = 1.0 - smoothstep(0.0, U.p1.x, abs(d - 0.88));
    a = band * pow(1.0 - U.t, 1.4) + 0.05 * (1.0 - smoothstep(0.0, 0.9, d)) * (1.0 - U.t);
  } else if (U.mode < 1.5) {
    let g = exp(-d * d * 4.2);
    col = mix(U.col.rgb, vec3f(1.0), g * g * 0.8);
    a = g * pow(1.0 - U.t, 1.8);
  } else if (U.mode < 2.5) {
    let edge = pow(sin(uv.y * 3.14159), 1.4);
    let ends = smoothstep(0.0, 0.06, uv.x) * (1.0 - smoothstep(0.94, 1.0, uv.x));
    let pulse = 0.72 + 0.28 * sin(uv.x * 34.0 - U.time * 26.0);
    col = mix(U.col.rgb, vec3f(1.0), edge * 0.35);
    a = edge * ends * pulse * (1.0 - U.t);
  } else if (U.mode < 3.5) {
    let rim = (1.0 - smoothstep(0.82, 0.97, d)) * smoothstep(0.6, 0.86, d);
    let ang = atan2(p.y, p.x);
    let hex = 0.5 + 0.5 * sin(ang * 6.0 + U.time * 1.6) * sin(d * 22.0 - U.time * 2.4);
    a = (rim * 0.9 + 0.05 * (1.0 - d) + hex * 0.1 * (1.0 - smoothstep(0.0, 0.9, d))) * env;
    col = mix(U.col.rgb, vec3f(1.0), rim * 0.4);
  } else if (U.mode < 4.5) {
    if (U.kind < 0.5) {
      let q = uv * vec2f(3.0, 2.0) + vec2f(U.time * 0.5, U.time * 0.22);
      let n = fbm(q * 3.0);
      let body = smoothstep(0.35, 0.75, n) * 0.34;
      let edge = pow(max(abs(p.x), abs(p.y)), 3.0) * 0.3;
      a = (body + edge) * env;
      col = mix(U.col.rgb, U.col2.rgb, n);
    } else if (U.kind < 1.5) {
      let edge = pow(max(abs(p.x), abs(p.y)), 2.6);
      let crystal = fbm(uv * 14.0 + U.time * 0.1);
      a = edge * (0.4 + 0.35 * crystal) * env;
      col = mix(U.col.rgb, vec3f(1.0), crystal * 0.3);
    } else {
      a = (0.5 + 0.5 * (1.0 - d)) * env * U.p1.x;
      col = mix(U.col.rgb, vec3f(1.0), 0.25);
    }
  } else if (U.mode < 5.5) {
    let flick = 0.72 + 0.28 * vnoise(uv * 8.0 + U.time * 2.0);
    a = exp(-d * d * 2.6) * (1.0 - smoothstep(0.7, 1.0, U.t)) * flick * U.p1.x;
  } else if (U.mode < 6.5) {
    a = tx.a * env;
    col = mix(U.col.rgb, vec3f(1.0), tx.a * 0.2);
  } else if (U.mode < 7.5) {
    let hor = pow(1.0 - abs(p.x), 2.0);
    let ver = pow(uv.y, 1.6);
    let flick = 0.8 + 0.2 * sin(U.time * 30.0 + uv.y * 20.0);
    a = hor * ver * flick * env;
    col = mix(U.col.rgb, vec3f(1.0), ver * 0.4);
  } else {
    let ang = atan2(p.y, p.x);
    let rel = atan2(sin(ang - U.p1.x), cos(ang - U.p1.x));
    let hs = U.p1.y;
    let lead = mix(-hs, hs, smoothstep(0.0, 0.35, U.t));
    let inArc = step(-hs, rel) * step(rel, lead);
    let bh = clamp((lead - rel) / (2.0 * hs), 0.0, 1.0);
    let inner = mix(U.p1.z, 0.80, pow(bh, 1.25));
    let band = smoothstep(inner, inner + 0.10, d) * (1.0 - smoothstep(0.965, 1.0, d));
    let head = 1.0 - smoothstep(0.05, 0.16, bh);
    let wisp = vnoise(vec2f(rel * 4.0 + U.time * 0.6, d * 9.0));
    let tailFade = 1.0 - smoothstep(0.7, 1.0, bh);
    let body = band * tailFade * mix(1.0, smoothstep(0.25, 0.75, wisp), smoothstep(0.55, 0.85, bh));
    var tex = 0.35;
    if (U.p1.w < 0.5) {
      tex = smoothstep(0.35, 0.8, vnoise(vec2f(rel * 3.0, d * 16.0 - U.time * 6.0)));
    } else if (U.p1.w < 1.5) {
      let n = fbm(p * 5.0 + vec2f(U.time * 0.4, 0.0));
      tex = 1.0 - smoothstep(0.0, 0.06, abs(n - 0.5));
    } else if (U.p1.w < 2.5) {
      let hq = p * 8.0;
      let hr = vec2f(1.0, 1.7320508);
      let ha = hq - hr * floor(hq / hr) - hr * 0.5;
      let hb = (hq - hr * 0.5) - hr * floor((hq - hr * 0.5) / hr) - hr * 0.5;
      let gv = select(hb, ha, dot(ha, ha) < dot(hb, hb));
      let hn = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y));
      tex = smoothstep(0.36, 0.46, hn);
    }
    let rim = smoothstep(0.86, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d));
    let halo = (1.0 - smoothstep(1.0, 1.38, d)) * smoothstep(0.7, 1.0, d);
    let fade = 1.0 - smoothstep(0.7, 1.0, U.t);
    let cBody = mix(U.col.rgb, U.col2.rgb, smoothstep(0.25, 0.9, bh));
    col = mix(cBody, vec3f(1.0), head * 0.9);
    col = mix(col, vec3f(1.0), tex * 0.35 * (1.0 - bh * 0.5) + rim * 0.5 * (1.0 - bh * 0.6));
    col = mix(col, U.col2.rgb, (1.0 - smoothstep(inner, inner + 0.25, d)) * 0.35 * (1.0 - head));
    col = mix(col, U.col.rgb, halo * 0.5);
    a = (body * (0.75 + 0.35 * (1.0 - bh)) + head * band * 0.6 + band * rim * 0.6 * (1.0 - bh) + halo * 0.45 * tailFade) * inArc * fade;
  }
  if (a < 0.004) { discard; }
  return vec4f(col, a);
}`;
async function gpuShader(device,code,label){
  const mod=device.createShaderModule({code});
  if(mod.getCompilationInfo){
    const info=await mod.getCompilationInfo();
    const errs=(info.messages||[]).filter(m=>m.type==='error');
    if(errs.length)throw Error(label+': '+errs.map(m=>m.message).join(' | '));
  }
  return mod;
}
function gpuDegrade(){
  FX.on=false;FX.backend='none';
  const c=$('fxcv');if(c)c.style.display='none';
}
async function initGPU(canvas){
  if(!navigator.gpu)throw Error('WebGPU unavailable');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('No WebGPU adapter');
  const device=await adapter.requestDevice();
  const format=navigator.gpu.getPreferredCanvasFormat();
  const context=canvas.getContext('webgpu');
  if(!context)throw Error('No webgpu context');
  context.configure({device,format,alphaMode:'premultiplied'});
  const globals=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const commonEntries=[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
    {binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
    {binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}
  ];
  const spriteLayout=device.createBindGroupLayout({entries:[
    commonEntries[0],
    {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},
    commonEntries[1],commonEntries[2]]});
  const quadLayout=device.createBindGroupLayout({entries:[
    commonEntries[0],
    {binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
    commonEntries[1],commonEntries[2]]});
  const atlas=device.createTexture({size:[atlasCanvas.width,atlasCanvas.height],format:'rgba8unorm',
    usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  device.queue.writeTexture({texture:atlas},atlasCanvas.getContext('2d').getImageData(0,0,atlasCanvas.width,atlasCanvas.height).data,
    {bytesPerRow:atlasCanvas.width*4,rowsPerImage:atlasCanvas.height},[atlasCanvas.width,atlasCanvas.height,1]);
  const sampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
  const spriteVert=await gpuShader(device,SPRITE_VERT_WGSL,'sprite vertex');
  const spriteFrag=await gpuShader(device,SPRITE_FRAG_WGSL,'sprite fragment');
  const quadVert=await gpuShader(device,QUAD_VERT_WGSL,'quad vertex');
  const quadFrag=await gpuShader(device,QUAD_FRAG_WGSL,'quad fragment');
  const blendAlpha={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},
    alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
  const blendAdd={color:{srcFactor:'src-alpha',dstFactor:'one',operation:'add'},
    alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}};
  const spritePipeline=(blend)=>device.createRenderPipeline({
    layout:device.createPipelineLayout({bindGroupLayouts:[spriteLayout]}),
    vertex:{module:spriteVert,entryPoint:'vs'},
    fragment:{module:spriteFrag,entryPoint:'fs',targets:[{format,blend}]},
    primitive:{topology:'triangle-list'}});
  const quadPipeline=(blend)=>device.createRenderPipeline({
    layout:device.createPipelineLayout({bindGroupLayouts:[quadLayout]}),
    vertex:{module:quadVert,entryPoint:'vs'},
    fragment:{module:quadFrag,entryPoint:'fs',targets:[{format,blend}]},
    primitive:{topology:'triangle-list'}});
  device.lost.then(()=>{if(gpu&&gpu.device===device)gpuDegrade();});
  return {device,context,format,canvas,globals,globalsData:new Float32Array(16),
    spriteLayout,quadLayout,atlasTex:atlas,sampler,
    spriteAdd:spritePipeline(blendAdd),spriteAlpha:spritePipeline(blendAlpha),
    quadAdd:quadPipeline(blendAdd),quadAlpha:quadPipeline(blendAlpha),
    quadBuffers:null,quadBgs:null};
}
function renderGPU(){
  const z=cam.z,cpx=(cam.x-cam.y)*32,cpy=(cam.x+cam.y)*16,g=gpu.globalsData;
  g[0]=vw;g[1]=vh;
  g[4]=32*z;g[5]=-32*z;g[6]=16*z;g[7]=16*z;
  g[8]=W/2+cam.sx-cpx*z;g[9]=H/2+cam.sy-cpy*z;g[10]=z;g[11]=vdpr;
  g[12]=FX.time;
  gpu.device.queue.writeBuffer(gpu.globals,0,g.buffer);
  const encoder=gpu.device.createCommandEncoder();
  const pass=encoder.beginRenderPass({colorAttachments:[{
    view:gpu.context.getCurrentTexture().createView(),
    clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
  for(const [pool,pipeline] of [[pools.add,gpu.spriteAdd],[pools.alpha,gpu.spriteAlpha]]){
    pass.setPipeline(pipeline);pass.setBindGroup(0,pool.bg);pass.draw(6,pool.n);
  }
  if(!gpu.quadBuffers){
    gpu.quadBuffers=Array.from({length:QUADS+1},()=>gpu.device.createBuffer({size:QUAD_STRIDE,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));
    gpu.quadBgs=gpu.quadBuffers.map(buffer=>gpu.device.createBindGroup({layout:gpu.quadLayout,entries:[
      {binding:0,resource:{buffer:gpu.globals}},{binding:1,resource:{buffer}},
      {binding:2,resource:gpu.atlasTex.createView()},{binding:3,resource:gpu.sampler}]}));
  }
  let qi=0;
  const drawQuad=(data,pipeline)=>{
    if(qi>=gpu.quadBuffers.length)return;
    gpu.device.queue.writeBuffer(gpu.quadBuffers[qi],0,data.buffer);
    pass.setPipeline(pipeline);pass.setBindGroup(0,gpu.quadBgs[qi]);pass.draw(6,1);qi++;
  };
  for(const q of quads)if(q.active)drawQuad(q.gpuData,gpu.quadAdd);
  if(veil&&veil.visible)drawQuad(veil.gpuData,gpu.quadAlpha);
  pass.end();gpu.device.queue.submit([encoder.finish()]);
}

/* ---------------- 粒子池 ---------------- */
const VERT=`
uniform float uTime,uZoom,uDPR;
uniform vec3 uM,uN;
attribute vec2 aWorld,aVel;
attribute vec4 aPhys,aLook;
attribute vec2 aTime;
attribute vec3 aCol;
attribute float aFlags;
varying vec3 vCol;varying float vAlpha,vShape,vRot;
void main(){
  float t=uTime-aTime.x,k=t/aTime.y;
  vCol=aCol;vShape=aLook.y;vAlpha=0.0;vRot=0.0;
  if(t<0.0||k>1.0){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;return;}
  float damp=aPhys.w>0.0?(1.0-exp(-aPhys.w*t))/aPhys.w:t;
  vec2 w=aWorld+aVel*damp;
  float h=aPhys.x+aPhys.y*t-0.5*aPhys.z*t*t;
  vec2 scr;float sz;
  if(mod(aFlags,2.0)>0.5){scr=w;sz=aLook.x;}
  else{scr=vec2(dot(w,uM.xy)+uM.z,dot(w,uN.xy)+uN.z);scr.y-=h*uZoom;sz=aLook.x*uZoom;}
  float hold=step(1.5,aFlags);
  float grow=mix(smoothstep(0.0,0.07,k),smoothstep(0.0,0.02,k),hold);
  float fade=mix(1.0-smoothstep(0.5,1.0,k),1.0-smoothstep(0.86,1.0,k),hold);
  vAlpha=fade*grow;
  vRot=aLook.z*6.28318+aLook.w*t;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(scr,0.0,1.0);
  gl_PointSize=max(sz*mix(0.35+0.65*fade,1.0,hold)*grow,0.0)*uDPR;
}`;
const FRAG=`
uniform sampler2D uAtlas;
varying vec3 vCol;varying float vAlpha,vShape,vRot;
void main(){
  if(vAlpha<0.003)discard;
  vec2 uv=gl_PointCoord-0.5;
  float c=cos(vRot),s=sin(vRot);
  uv=mat2(c,-s,s,c)*uv+0.5;
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)discard;
  float sh=floor(vShape+0.5);
  vec2 auv=(vec2(mod(sh,4.0),floor(sh/4.0))+uv)/vec2(4.0,3.0);
  vec4 tx=texture2D(uAtlas,auv);
  gl_FragColor=vec4(vCol*tx.rgb,tx.a*vAlpha);
}`;
const ATTRS=[['aWorld',2],['aVel',2],['aPhys',4],['aTime',2],['aLook',4],['aCol',3],['aFlags',1]];
function makePool(n,blending,order){
  if(gpu){
    const data=new Float32Array(n*(PART_STRIDE/4));
    const buffer=gpu.device.createBuffer({size:n*PART_STRIDE,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    const bg=gpu.device.createBindGroup({layout:gpu.spriteLayout,entries:[
      {binding:0,resource:{buffer:gpu.globals}},
      {binding:1,resource:{buffer}},
      {binding:2,resource:gpu.atlasTex.createView()},
      {binding:3,resource:gpu.sampler}]});
    return {n,cursor:0,data,buffer,bg,lo:n,hi:-1,wrap:false,liveUntil:0};
  }
  const geo=new THREE.BufferGeometry(),arr={};
  // three 以 position.count 决定 draw count；粒子位置在 shader 内积分，此处仅占位
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  for(const[name,size]of ATTRS){
    arr[name]=new Float32Array(n*size);
    const a=new THREE.BufferAttribute(arr[name],size);a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name,a);
  }
  for(let i=0;i<n;i++){arr.aTime[i*2]=-1e9;arr.aTime[i*2+1]=1;}
  const mat=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uZoom:{value:1},uDPR:{value:1},
      uM:{value:new THREE.Vector3()},uN:{value:new THREE.Vector3()},uAtlas:{value:atlasTex}},
    vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthTest:false,depthWrite:false,blending});
  const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;pts.renderOrder=order;
  scene.add(pts);
  return {n,cursor:0,arr,geo,mat,lo:n,hi:-1,wrap:false,liveUntil:0};
}
function spawn(pool,p){
  const i=pool.cursor;pool.cursor=(pool.cursor+1)%pool.n;
  if(pool.cursor<=i&&pool.hi>=pool.lo)pool.wrap=true;
  const birth=p.birth===undefined?FX.time:p.birth;
  const c=p.col||WHITE,flags=(p.screen?1:0)+(p.hold?2:0),life=p.life||.5;
  const a=gpu?null:pool.arr;
  if(!gpu){
    a.aWorld[i*2]=p.x;a.aWorld[i*2+1]=p.y;
    a.aVel[i*2]=p.vx||0;a.aVel[i*2+1]=p.vy||0;
    a.aPhys[i*4]=p.z0||0;a.aPhys[i*4+1]=p.vz||0;a.aPhys[i*4+2]=p.grav||0;a.aPhys[i*4+3]=p.drag||0;
    a.aTime[i*2]=birth;a.aTime[i*2+1]=life;
    a.aLook[i*4]=(p.size||5)*(p.screen?1:1.3);a.aLook[i*4+1]=p.shape||0;a.aLook[i*4+2]=p.seed===undefined?R():p.seed;a.aLook[i*4+3]=p.spin||0;
  }
  if(gpu){
    const d=pool.data,o=i*(PART_STRIDE/4);
    d[o]=p.x;d[o+1]=p.y;d[o+2]=p.vx||0;d[o+3]=p.vy||0;
    d[o+4]=p.z0||0;d[o+5]=p.vz||0;d[o+6]=p.grav||0;d[o+7]=p.drag||0;
    d[o+8]=birth;d[o+9]=life;d[o+10]=0;d[o+11]=0;
    d[o+12]=(p.size||5)*(p.screen?1:1.3);d[o+13]=p.shape||0;
    d[o+14]=p.seed===undefined?R():p.seed;d[o+15]=p.spin||0;
    d[o+16]=c[0];d[o+17]=c[1];d[o+18]=c[2];d[o+19]=flags;
  }else{
    a.aCol[i*3]=c[0];a.aCol[i*3+1]=c[1];a.aCol[i*3+2]=c[2];
    a.aFlags[i]=flags;
  }
  if(i<pool.lo)pool.lo=i;if(i>pool.hi)pool.hi=i;
  const end=birth+life;if(end>pool.liveUntil)pool.liveUntil=end;
}
function upload(pool){
  if(pool.hi<pool.lo)return;
  if(gpu){
    const floats=PART_STRIDE/4,count=pool.hi-pool.lo+1;
    if(pool.wrap)gpu.device.queue.writeBuffer(pool.buffer,0,pool.data);
    else gpu.device.queue.writeBuffer(pool.buffer,pool.lo*PART_STRIDE,pool.data,pool.lo*floats,count*floats);
    pool.lo=pool.n;pool.hi=-1;pool.wrap=false;
    return;
  }
  for(const[name,size]of ATTRS){
    const at=pool.geo.attributes[name];
    if(pool.wrap){at.updateRange.offset=0;at.updateRange.count=-1;}
    else{at.updateRange.offset=pool.lo*size;at.updateRange.count=(pool.hi-pool.lo+1)*size;}
    at.needsUpdate=true;
  }
  pool.lo=pool.n;pool.hi=-1;pool.wrap=false;
}
const nq=n=>Math.max(1,Math.round(n*FX.q));

/* 通用世界爆发 */
function burstW(x,y,o){
  const pool=o.alpha?pools.alpha:pools.add;
  const n=nq(o.n||20),col=rgb(o.col||'#ffffff'),col2=o.col2?rgb(o.col2):null;
  for(let i=0;i<n;i++){
    const a=o.dir!==undefined?o.dir+(R()-.5)*(o.spread||1):R()*TAU2;
    const v=(o.spd||3)*(.35+R()*.85);
    spawn(pool,{x:x+(R()-.5)*(o.jitter||.2),y:y+(R()-.5)*(o.jitter||.2),
      vx:Math.cos(a)*v,vy:Math.sin(a)*v,
      z0:(o.z0===undefined?6:o.z0)+R()*4,vz:(o.vz===undefined?26:o.vz)*(.5+R()),
      grav:o.grav===undefined?60:o.grav,drag:o.drag===undefined?1.6:o.drag,
      life:(o.life||.6)*(.6+R()*.7),size:(o.size||5)*(.6+R()*.8),
      shape:o.shape2!==undefined&&R()<.4?o.shape2:(o.shape||0),
      col:col2&&R()<.5?col2:col,spin:(R()-.5)*(o.spin||4)});
  }
}
/* 上升光尘（治疗/建造余韵） */
function riseW(x,y,o){
  const n=nq(o.n||30),col=rgb(o.col),col2=o.col2?rgb(o.col2):null;
  for(let i=0;i<n;i++){
    const a=R()*TAU2,r=(o.r||.8)*Math.sqrt(R());
    spawn(pools.add,{x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,
      vx:Math.cos(a+1.5)*(o.swirl||.8),vy:Math.sin(a+1.5)*(o.swirl||.8),
      z0:2+R()*8,vz:(o.vz||46)*(.6+R()*.8),grav:o.grav===undefined?-14:o.grav,drag:.4,
      birth:FX.time+R()*(o.stagger||.4),life:(o.life||1)*(.7+R()*.6),
      size:(o.size||4)*(.6+R()*.9),shape:o.shape===undefined?0:o.shape,
      col:col2&&R()<.5?col2:col,spin:(R()-.5)*2});
  }
}
/* 内吸漩涡（surge/法力井） */
function vortexW(x,y,o){
  const n=nq(o.n||50),col=rgb(o.col),col2=o.col2?rgb(o.col2):null;
  for(let i=0;i<n;i++){
    const a=R()*TAU2,r=(o.r||1.6)*(.6+R()*.6);
    const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
    const life=(o.life||.5)*(.7+R()*.5);
    spawn(pools.add,{x:px,y:py,vx:(x-px)/life,vy:(y-py)/life,
      z0:4+R()*20,vz:-8,grav:0,drag:0,life,
      size:(o.size||4.5)*(.6+R()*.8),shape:o.shape===undefined?0:o.shape,
      col:col2&&R()<.5?col2:col});
  }
}

/* 插地残留（箭/晶屑/火星）：hold 粒子恒形态直到末段淡出 */
function stuckW(x,y,o){
  const n=nq(o.n||8),col=rgb(o.col),col2=o.col2?rgb(o.col2):null;
  for(let i=0;i<n;i++){
    const a=R()*TAU2,r=(o.r||1.2)*Math.sqrt(R());
    spawn(pools.add,{x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,z0:o.z0===undefined?6:o.z0,
      life:(o.life||1.4)*(.8+R()*.4),size:(o.size||9)*(.7+R()*.6),shape:o.shape===undefined?2:o.shape,
      hold:true,col:col2&&R()<.5?col2:col,seed:(R()-.5)*(o.tilt===undefined?.2:o.tilt)});
  }
}
function mistW(x,y,o){
  const n=nq(o.n||8),col=rgb(o.col||'#bfe8f5');
  for(let i=0;i<n;i++)
    spawn(pools.alpha,{x:x+(R()-.5)*(o.spread||2),y:y+(R()-.5)*(o.spread||2),z0:4,
      vz:o.vz||14,grav:-6,drag:.6,birth:FX.time+R()*(o.stagger||.8),
      life:o.life||1.3,size:o.size||12,shape:6,col,hold:true});
}

/* ---------------- Quad 系统 ---------------- */
const QUAD_VERT=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const QUAD_FRAG=`
uniform float uMode,uT,uTime,uShape,uKind;
uniform vec3 uCol,uCol2;
uniform vec4 uP1;
uniform sampler2D uAtlas;
varying vec2 vUv;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*vnoise(p);p*=2.1;a*=0.5;}return v;}
void main(){
  vec2 p=(vUv-0.5)*2.0;
  float d=length(p);
  float env=smoothstep(0.0,0.08,uT)*(1.0-smoothstep(0.85,1.0,uT));
  vec3 col=uCol;float a=0.0;
  if(uMode<0.5){
    float band=1.0-smoothstep(0.0,uP1.x,abs(d-0.88));
    a=band*pow(1.0-uT,1.4)+0.05*(1.0-smoothstep(0.0,0.9,d))*(1.0-uT);
  }else if(uMode<1.5){
    float g=exp(-d*d*4.2);
    col=mix(uCol,vec3(1.0),g*g*0.8);
    a=g*pow(1.0-uT,1.8);
  }else if(uMode<2.5){
    float edge=pow(sin(vUv.y*3.14159),1.4);
    float ends=smoothstep(0.0,0.06,vUv.x)*(1.0-smoothstep(0.94,1.0,vUv.x));
    float pulse=0.72+0.28*sin(vUv.x*34.0-uTime*26.0);
    col=mix(uCol,vec3(1.0),edge*0.35);
    a=edge*ends*pulse*(1.0-uT);
  }else if(uMode<3.5){
    float rim=(1.0-smoothstep(0.82,0.97,d))*smoothstep(0.6,0.86,d);
    float ang=atan(p.y,p.x);
    float hex=0.5+0.5*sin(ang*6.0+uTime*1.6)*sin(d*22.0-uTime*2.4);
    a=(rim*0.9+0.05*(1.0-d)+hex*0.1*(1.0-smoothstep(0.0,0.9,d)))*env;
    col=mix(uCol,vec3(1.0),rim*0.4);
  }else if(uMode<4.5){
    if(uKind<0.5){
      vec2 q=vUv*vec2(3.0,2.0)+vec2(uTime*0.5,uTime*0.22);
      float n=fbm(q*3.0);
      float body=smoothstep(0.35,0.75,n)*0.34;
      float edge=pow(max(abs(p.x),abs(p.y)),3.0)*0.3;
      a=(body+edge)*env;col=mix(uCol,uCol2,n);
    }else if(uKind<1.5){
      float edge=pow(max(abs(p.x),abs(p.y)),2.6);
      float crystal=fbm(vUv*14.0+uTime*0.1);
      a=edge*(0.4+0.35*crystal)*env;col=mix(uCol,vec3(1.0),crystal*0.3);
    }else{
      a=(0.5+0.5*(1.0-d))*env*uP1.x;col=mix(uCol,vec3(1.0),0.25);
    }
  }else if(uMode<5.5){
    float flick=0.72+0.28*vnoise(vUv*8.0+uTime*2.0);
    a=exp(-d*d*2.6)*(1.0-smoothstep(0.7,1.0,uT))*flick*uP1.x;
  }else if(uMode<6.5){
    vec2 uv=vec2(vUv.x,1.0-vUv.y)-0.5;
    float c=cos(uP1.x),s=sin(uP1.x);
    uv=mat2(c,-s,s,c)*uv+0.5;
    float sh=floor(uShape+0.5);
    vec2 auv=(vec2(mod(sh,4.0),floor(sh/4.0))+uv)/vec2(4.0,3.0);
    vec4 tx=texture2D(uAtlas,auv);
    a=tx.a*env;col=mix(uCol,vec3(1.0),tx.a*0.2);
  }else if(uMode<7.5){
    float hor=pow(1.0-abs(p.x),2.0);
    float ver=pow(vUv.y,1.6);
    float flick=0.8+0.2*sin(uTime*30.0+vUv.y*20.0);
    a=hor*ver*flick*env;col=mix(uCol,vec3(1.0),ver*0.4);
  }else{
    float ang=atan(p.y,p.x);
    float rel=atan(sin(ang-uP1.x),cos(ang-uP1.x));
    float hs=uP1.y;
    float lead=mix(-hs,hs,smoothstep(0.0,0.35,uT));
    float inArc=step(-hs,rel)*step(rel,lead);
    float bh=clamp((lead-rel)/(2.0*hs),0.0,1.0);
    float inner=mix(uP1.z,0.80,pow(bh,1.25));
    float band=smoothstep(inner,inner+0.10,d)*(1.0-smoothstep(0.965,1.0,d));
    float head=1.0-smoothstep(0.05,0.16,bh);
    float wisp=vnoise(vec2(rel*4.0+uTime*0.6,d*9.0));
    float tailFade=1.0-smoothstep(0.7,1.0,bh);
    float body=band*tailFade*mix(1.0,smoothstep(0.25,0.75,wisp),smoothstep(0.55,0.85,bh));
    float tex=0.35;
    if(uP1.w<0.5){tex=smoothstep(0.35,0.8,vnoise(vec2(rel*3.0,d*16.0-uTime*6.0)));}
    else if(uP1.w<1.5){float n=fbm(p*5.0+vec2(uTime*0.4,0.0));tex=1.0-smoothstep(0.0,0.06,abs(n-0.5));}
    else if(uP1.w<2.5){
      vec2 hq=p*8.0;vec2 hr=vec2(1.0,1.7320508);
      vec2 ha=mod(hq,hr)-hr*0.5;vec2 hb=mod(hq-hr*0.5,hr)-hr*0.5;
      vec2 gv=dot(ha,ha)<dot(hb,hb)?ha:hb;
      float hn=max(abs(gv.x)*0.8660254+abs(gv.y)*0.5,abs(gv.y));
      tex=smoothstep(0.36,0.46,hn);
    }
    float rim=smoothstep(0.86,0.97,d)*(1.0-smoothstep(0.97,1.0,d));
    float halo=(1.0-smoothstep(1.0,1.38,d))*smoothstep(0.7,1.0,d);
    float fade=1.0-smoothstep(0.7,1.0,uT);
    vec3 cBody=mix(uCol,uCol2,smoothstep(0.25,0.9,bh));
    col=mix(cBody,vec3(1.0),head*0.9);
    col=mix(col,vec3(1.0),tex*0.35*(1.0-bh*0.5)+rim*0.5*(1.0-bh*0.6));
    col=mix(col,uCol2,(1.0-smoothstep(inner,inner+0.25,d))*0.35*(1.0-head));
    col=mix(col,uCol,halo*0.5);
    a=(body*(0.75+0.35*(1.0-bh))+head*band*0.6+band*rim*0.6*(1.0-bh)+halo*0.45*tailFade)*inArc*fade;
  }
  if(a<0.004)discard;
  gl_FragColor=vec4(col,a);
}`;
let quadGeo=null;
function makeQuadMesh(order,blending){
  const mat=new THREE.ShaderMaterial({
    uniforms:{uMode:{value:0},uT:{value:0},uTime:{value:0},uShape:{value:0},uKind:{value:0},
      uCol:{value:new THREE.Vector3(1,1,1)},uCol2:{value:new THREE.Vector3(1,1,1)},
      uP1:{value:new THREE.Vector4()},uAtlas:{value:atlasTex}},
    vertexShader:QUAD_VERT,fragmentShader:QUAD_FRAG,transparent:true,
    depthTest:false,depthWrite:false,blending:blending||THREE.AdditiveBlending,side:THREE.DoubleSide});
  const m=new THREE.Mesh(quadGeo,mat);m.frustumCulled=false;m.visible=false;m.renderOrder=order;
  scene.add(m);return m;
}
function quad(mode,o){
  let q=null;
  for(const it of quads)if(!it.active){q=it;break;}
  if(!q){q=quads[0];for(const it of quads)if(it.birth<q.birth)q=it;}
  q.active=true;q.birth=FX.time;q.dur=o.life||.4;q.mode=mode;
  q.wx=o.x;q.wy=o.y;q.follow=o.follow||null;q.rot=o.rot||0;
  q.r0=o.r0;q.r1=o.r1;
  q.sx=o.sx;q.sy=o.sy;q.sw=o.sw;q.sh=o.sh;
  q.x0=o.x0;q.y0=o.y0;q.x1=o.x1;q.y1=o.y1;
  const u=q.mesh.material.uniforms;
  u.uMode.value=mode;u.uT.value=0;u.uKind.value=o.kind||0;u.uShape.value=o.shape||0;
  const c=rgb(o.col||'#ffffff');u.uCol.value.set(c[0],c[1],c[2]);
  const c2=rgb(o.col2||o.col||'#ffffff');u.uCol2.value.set(c2[0],c2[1],c2[2]);
  u.uP1.value.set(o.p1===undefined?.14:o.p1,o.p2||0,o.p3||0,o.p4||0);
  if(gpu){
    const d=q.gpuData;
    d[0]=mode;d[2]=FX.time;d[3]=o.shape||0;d[4]=o.kind||0;
    d[8]=c[0];d[9]=c[1];d[10]=c[2];d[11]=1;
    d[12]=c2[0];d[13]=c2[1];d[14]=c2[2];d[15]=1;
    d[16]=o.p1===undefined?.14:o.p1;d[17]=o.p2||0;d[18]=o.p3||0;d[19]=o.p4||0;
  }
  q.mesh.visible=true;
  return q;
}
const ringW=(x,y,o)=>quad(0,{x,y,life:o.life||.45,col:o.col,p1:o.width||.14,r0:o.r0,r1:o.r1});
function flashW(x,y,o){return quad(1,{x,y,life:o.life||.25,col:o.col||'#ffffff',sw:(o.size||60)*2,sh:(o.size||60)*2});}
function decalW(x,y,o){return quad(5,{x,y,life:o.life||1,col:o.col,p1:o.a===undefined?.5:o.a,sw:(o.r||1.5)*64,sh:(o.r||1.5)*32});}
function glyphW(x,y,o){return quad(6,{x,y,life:o.life||.6,col:o.col,shape:o.shape||3,rot:o.rot||0,p1:o.rot||0,sw:o.size||44,sh:o.size||44});}
function pillarW(x,y,o){const h=o.h||150,w=o.w||26;return quad(7,{x,y,life:o.life||.5,col:o.col,sw:w,sh:h});}
function beamW(x0,y0,x1,y1,o){return quad(2,{x0,y0,x1,y1,life:o.life||.15,col:o.col,sw:0,sh:o.width||7});}
function bubbleW(o){return quad(3,{follow:'player',life:o.dur||4,col:o.col||'#8fe3d0',sw:74,sh:74});}
/* 弧月刀光：p1=屏幕空间中心角(世界角+π/4)，p2=半扫角，p3=头部内缘，p4=纹理种类 */
function slashW(x,y,ang,r,o){return quad(8,{x,y,life:o.life||.3,col:o.col||'#ffb454',col2:o.col2||o.col||'#ffb454',
  p1:ang+Math.PI/4,p2:o.half===undefined?1.5:o.half,p3:o.inner===undefined?.3:o.inner,p4:o.tex||0,r0:r});}

function w2s(x,y){
  const z=cam.z,cpx=(cam.x-cam.y)*32,cpy=(cam.x+cam.y)*16;
  return [(x-y)*32*z-cpx*z+W/2+cam.sx,(x+y)*16*z-cpy*z+H/2+cam.sy];
}
function gpuQuadTransform(q){
  const d=q.gpuData,m=q.mesh;
  d[1]=(FX.time-q.birth)/q.dur;d[2]=FX.time;
  d[20]=m.position.x;d[21]=m.position.y;
  d[22]=m.scale.x;d[23]=m.scale.y;
  d[24]=m.rotation.z;
}
function updateQuad(q){
  const t=(FX.time-q.birth)/q.dur;
  if(t>=1){q.active=false;q.mesh.visible=false;return;}
  const u=q.mesh.material.uniforms;u.uT.value=t;u.uTime.value=FX.time;
  const m=q.mesh;
  if(q.mode===2){
    const a=w2s(q.x0,q.y0),b=w2s(q.x1,q.y1);
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
    m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2-14*cam.z,1);
    m.scale.set(len,q.sh*cam.z,1);m.rotation.z=Math.atan2(dy,dx);
    if(gpu)gpuQuadTransform(q);
    return;
  }
  let sx,sy;
  if(q.follow==='player'){const s=w2s(P.x,P.y);sx=s[0];sy=s[1]-16*cam.z;}
  else if(q.sx!==undefined){sx=q.sx;sy=q.sy;}
  else{const s=w2s(q.wx,q.wy);sx=s[0];sy=s[1];}
  if(q.mode===0){
    const r=q.r0+(q.r1-q.r0)*(1-Math.pow(1-t,2));
    m.scale.set(r*64*cam.z,r*32*cam.z,1);
    m.position.set(sx,sy,1);
  }else if(q.mode===8){
    const r=q.r0*(1+t*.05)*1.35;
    m.scale.set(r*64*cam.z,r*32*cam.z,1);
    m.position.set(sx,sy-10*cam.z,1);
  }else if(q.mode===7){
    m.position.set(sx,sy-q.sh*cam.z/2,1);m.scale.set(q.sw*cam.z,q.sh*cam.z,1);
  }else if(q.mode===3){
    const pulse=1+Math.sin(FX.time*5)*.03;
    m.position.set(sx,sy,1);m.scale.set(q.sw*cam.z*pulse,q.sh*cam.z*pulse,1);
  }else{
    m.position.set(sx,sy-(q.mode===6?22*cam.z:0),1);
    m.scale.set(q.sw*(q.mode===5||q.mode===6?cam.z:1),q.sh*(q.mode===5||q.mode===6?cam.z:1),1);
    if(q.mode===6)m.rotation.z=q.rot;
  }
  if(gpu)gpuQuadTransform(q);
}

/* ---------------- 弹道 ---------------- */
function projectile(o){
  if(projs.length>=16)projs.shift();
  projs.push({x0:o.from[0],y0:o.from[1],z0:o.from[2]||14,
    x1:o.to[0],y1:o.to[1],z1:o.to[2]||8,target:o.target||null,
    birth:FX.time+(o.delay||0),dur:o.dur||.2,arc:o.arc||0,
    col:o.col||'#ffffff',trail:o.trail||'fire',onArrive:o.onArrive||null,done:false});
}
const TRAILS={
  fire:{shape:0,shape2:1,col:'#ff7a45',col2:'#ffd166',size:7,life:.32},
  frost:{shape:4,shape2:2,col:'#6fd8ff',col2:'#dffaff',size:6,life:.3},
  arcane:{shape:0,shape2:3,col:'#b48cff',col2:'#e0ccff',size:6,life:.3},
  meteor:{shape:0,shape2:1,col:'#ff7a45',col2:'#ffb454',size:10,life:.4},
  crystal:{shape:2,col:'#57e6ff',col2:'#dffaff',size:6,life:.3},
  sword:{shape:2,shape2:1,col:'#8fe3d0',col2:'#dffaff',size:6,life:.26}
};
function updateProj(pr){
  if(FX.time<pr.birth)return;
  const k=(FX.time-pr.birth)/pr.dur;
  if(pr.target&&!pr.target.dead){pr.x1=pr.target.x;pr.y1=pr.target.y;}
  if(k>=1){pr.done=true;if(pr.onArrive)pr.onArrive(pr.x1,pr.y1);return;}
  const x=pr.x0+(pr.x1-pr.x0)*k,y=pr.y0+(pr.y1-pr.y0)*k;
  const h=pr.z0+(pr.z1-pr.z0)*k+pr.arc*Math.sin(Math.PI*k);
  const tr=TRAILS[pr.trail]||TRAILS.fire,col=rgb(pr.col||tr.col);
  for(let i=0;i<2;i++){
    spawn(pools.add,{x:x+(R()-.5)*.12,y:y+(R()-.5)*.12,
      vx:(R()-.5)*.8,vy:(R()-.5)*.8,z0:h+(R()-.5)*5,vz:(R()-.5)*14,grav:20,drag:2,
      life:tr.life*(.7+R()*.6),size:tr.size*(.5+R()*.7),
      shape:tr.shape2!==undefined&&R()<.4?tr.shape2:tr.shape,
      col:tr.col2&&R()<.5?rgb(tr.col2):col,
      seed:R(),spin:(R()-.5)*5});
  }
  if(pr.trail==='meteor'&&R()<.7)
    spawn(pools.alpha,{x,y,z0:h,vz:8,grav:-6,drag:1,life:.7,size:13,shape:6,col:rgb('#7d8f96')});
  if(pr.trail==='sword'){
    const dx=pr.x1-pr.x0,dy=pr.y1-pr.y0;
    const sa=Math.atan2((dx+dy)*16,(dx-dy)*32);
    spawn(pools.add,{x,y,z0:h,life:.12,size:17,shape:4,col:rgb('#dffaff'),seed:-sa/TAU2,spin:0,hold:true});
  }
  spawn(pools.add,{x,y,z0:h,life:.1,size:pr.trail==='meteor'?22:14,shape:7,col});
}

/* ---------------- 事件时钟 ---------------- */
function after(delay,fn){if(events.length<256)events.push({t:FX.time+delay,fn});}
function impact(m,h){
  if(typeof shake==='function')shake(m);
  if(h&&!reduceMotion)S.hitstop=Math.max(S.hitstop,h);
}
function showVeil(kind,dur,col,col2,strength){
  if(veilOff||!veil)return;
  veil.visible=true;veil.birth=FX.time;veil.dur=dur;
  const u=veil.mesh.material.uniforms;
  u.uMode.value=4;u.uKind.value=kind;u.uT.value=0;
  const c=rgb(col||'#dffaff');u.uCol.value.set(c[0],c[1],c[2]);
  const c2=rgb(col2||col||'#ffffff');u.uCol2.value.set(c2[0],c2[1],c2[2]);
  u.uP1.value.set(strength===undefined?1:strength,0,0,0);
  if(gpu){
    const d=veil.gpuData,s=strength===undefined?1:strength;
    d[0]=4;d[1]=0;d[2]=FX.time;d[3]=0;d[4]=kind;
    d[8]=c[0];d[9]=c[1];d[10]=c[2];d[11]=1;
    d[12]=c2[0];d[13]=c2[1];d[14]=c2[2];d[15]=1;
    d[16]=s;d[17]=0;d[18]=0;d[19]=0;
    d[20]=vw/2;d[21]=vh/2;d[22]=vw;d[23]=vh;d[24]=0;
  }
}
function rectOf(sel){
  const el=typeof sel==='string'?document.querySelector(sel):sel;
  if(!el)return null;
  const r=el.getBoundingClientRect();
  if(!r.width&&!r.height)return null;
  return {x:r.left+r.width/2,y:r.top+r.height/2};
}
function flyScreen(x0,y0,x1,y1,o){
  const n=nq(o.n||6),col=rgb(o.col||'#c9a8ff');
  const dur=o.dur||.45,ang=Math.atan2(y1-y0,x1-x0);
  for(let i=0;i<n;i++){
    const life=dur*(.8+R()*.4);
    spawn(pools.add,{x:x0+(R()-.5)*14,y:y0+(R()-.5)*10,screen:true,
      vx:(x1-x0)/life,vy:(y1-y0)/life,life,size:(o.size||12)*(.6+R()*.7),
      shape:4,seed:ang/TAU2,col,birth:FX.time+i*.04});
  }
  after(dur,()=>{if(o.onArrive)o.onArrive();});
}
function screenBurst(sx,sy,o){
  const n=nq(o.n||20),col=rgb(o.col||'#ffffff');
  for(let i=0;i<n;i++){
    const a=R()*TAU2,v=(o.spd||120)*(.3+R());
    spawn(pools.add,{x:sx,y:sy,screen:true,vx:Math.cos(a)*v,vy:Math.sin(a)*v,
      drag:2.2,life:(o.life||.5)*(.6+R()*.7),size:(o.size||5)*(.6+R()),
      shape:o.shape||0,col});
  }
}

/* ---------------- 逐卡编排 ---------------- */
const FIRE='#ff7a45',FIRE2='#ffd166',FROST='#6fd8ff',FROST2='#dffaff',
  ARC='#b48cff',ARC2='#e0ccff',CYAN='#57e6ff',MINT='#8fe3d0',LEAF='#6fe08a',
  AMBER='#ffb454',WOOD='#e0b070',VIOLET='#a06bff',WARN='#ffd166',SWORD2='#ffe9c4';

function explodeFire(x,y,big){
  flashW(x,y,{col:FIRE2,size:big?70:44,life:.22});
  ringW(x,y,{r0:.2,r1:big?2.4:1.6,col:FIRE,life:.4});
  if(big)ringW(x,y,{r0:.1,r1:3.1,col:FIRE2,life:.55,width:.08});
  burstW(x,y,{n:big?150:45,col:FIRE,col2:FIRE2,spd:big?5:3.4,life:.65,size:5.5,shape:1,shape2:0,vz:50,grav:90});
  riseW(x,y,{n:big?24:10,col:FIRE,r:1,life:1.1,vz:34,size:3.5,stagger:.5});
  decalW(x,y,{col:FIRE,r:big?1.8:1.1,life:big?2.4:1,a:big?.55:.45});
  if(big){
    mistW(x,y,{n:10,col:'#7d8f96',spread:1.8,life:1.8,stagger:1,vz:16,size:14});
    stuckW(x,y,{n:12,r:1.5,col:FIRE,col2:FIRE2,shape:1,size:7,life:1.8,z0:2,tilt:1});
  }
}
function explodeFrost(x,y,big){
  flashW(x,y,{col:FROST2,size:big?56:40,life:.2});
  ringW(x,y,{r0:.2,r1:big?2.2:1.5,col:FROST,life:.4});
  burstW(x,y,{n:big?90:40,col:FROST,col2:FROST2,spd:big?4.4:3.2,life:.6,size:5,shape:2,shape2:5,vz:36,grav:80});
  decalW(x,y,{col:FROST,r:big?1.6:1,life:.9,a:.35});
  burstW(x,y,{n:10,col:FROST2,spd:1,life:.9,size:9,shape:6,alpha:true,vz:12,grav:-8,z0:4});
}
function explodeArcane(x,y){
  flashW(x,y,{col:ARC2,size:40,life:.18});
  ringW(x,y,{r0:.15,r1:1.3,col:ARC,life:.35});
  burstW(x,y,{n:40,col:ARC,col2:ARC2,spd:3,life:.55,size:4.5,shape:3,shape2:1,vz:30,grav:50});
}

/* ---------------- 剑近战 ---------------- */
/* 刀光风格预设：数据驱动。后续新武器/元素/刻印只需增补条目或传自定义对象，
   tex: 0=流光纹 1=裂电纹 2=鳞甲纹 3=平滑渐变 */
const SLASH_STYLES={
  sword:{col:'#ffb454',col2:'#8a4a12',tex:0,spark:'#ffe9c4'},
  ember:{col:'#ff7a45',col2:'#8a1e0c',tex:0,spark:'#ffd166'},
  frost:{col:'#6fd8ff',col2:'#123a6b',tex:1,spark:'#dffaff'},
  storm:{col:'#3f8cff',col2:'#0c2a6b',tex:1,spark:'#bfe0ff'},
  steel:{col:'#eef7f2',col2:'#3a4a52',tex:0,spark:'#ffffff'},
  mint:{col:'#3ce8b0',col2:'#0c4a3a',tex:0,spark:'#dffaff'},
  gilded:{col:'#ffd166',col2:'#7a5a10',tex:2,spark:'#ffe9c4'},
  arcane:{col:'#7f6bff',col2:'#241a6b',tex:2,spark:'#e0ccff'}
};
FX.slash=function(x,y,ang,r,style,o){
  o=o||{};
  const st=typeof style==='string'?(SLASH_STYLES[style]||SLASH_STYLES.sword):(style||SLASH_STYLES.sword);
  const col=o.col||st.col,col2=o.col2||st.col2,tex=o.tex===undefined?(st.tex||0):o.tex;
  const half=o.half===undefined?1.5:o.half;
  const q=slashW(x,y,ang,r,{life:o.life||.3,col,col2,tex,half,inner:o.inner});
  const n=nq(o.sparks===undefined?12:o.sparks);
  for(let i=0;i<n;i++){
    const k=R(),a=ang-half+k*2*half,rr=r*(.9+R()*.15);
    spawn(pools.add,{x:x+Math.cos(a)*rr,y:y+Math.sin(a)*rr,z0:8+R()*8,
      vx:Math.cos(a)*(.6+R()),vy:Math.sin(a)*(.6+R()),vz:10+R()*18,grav:60,drag:1.6,
      birth:FX.time+k*.1,life:.22+R()*.16,size:2.5+R()*2.5,shape:1,
      col:rgb(R()<.6?(st.spark||col):col),spin:(R()-.5)*6});
  }
  return q;
};
FX.sword=function(x,y,ang,rad){
  FX.slash(x,y,ang,rad,'sword');
  flashW(x+Math.cos(ang)*rad*.92,y+Math.sin(ang)*rad*.92,{col:SWORD2,size:15,life:.13});
};
FX.swordHit=function(x,y,ang,crit,node){
  const col=node?WOOD:(crit?FIRE2:SWORD2);
  burstW(x,y,{n:crit?20:10,col,col2:node?'#caa060':AMBER,dir:ang,spread:1.4,
    spd:crit?3.4:2.4,life:.34,size:crit?5:4,shape:1,shape2:2,z0:12,vz:30,grav:90});
  flashW(x,y,{col,size:crit?26:15,life:.14});
  if(crit)ringW(x,y,{r0:.12,r1:.8,col:FIRE2,life:.3,width:.08});
};
FX.waveShot=function(x,y,ang){
  projectile({from:[x,y,12],to:[x+Math.cos(ang)*3.4,y+Math.sin(ang)*3.4,12],
    dur:.34,trail:'sword',col:MINT});
};

FX.spell=function(def,tx,ty,elem,targets){
  const w=def.weaponAttack?.6:1;
  const sc=n=>Math.max(1,Math.round(n*w));
  const id=def.fx||def.id;
  if(id==='sp_fireball'){
    burstW(P.x,P.y,{n:sc(8),col:FIRE,col2:FIRE2,spd:1,life:.25,size:4,shape:0,z0:16,vz:10,grav:0});
    projectile({from:[P.x,P.y,18],to:[tx,ty,8],dur:.16,arc:26,trail:'fire',col:FIRE,
      onArrive:(x,y)=>{explodeFire(x,y,false);impact(1.5,0);if(typeof sfx==='function')sfx('boom');}});
  }else if(id==='sp_frostbolt'){
    projectile({from:[P.x,P.y,18],to:[tx,ty,8],dur:.15,arc:12,trail:'frost',col:FROST,
      onArrive:(x,y)=>{explodeFrost(x,y,false);impact(1,0);}});
  }else if(id==='sp_arcbolt'){
    beamW(P.x,P.y,tx,ty,{col:ARC,life:.12,width:6});
    after(.06,()=>{explodeArcane(tx,ty);glyphW(tx,ty,{shape:3,col:ARC,size:36,life:.5});impact(1,0);});
  }else if(id==='sp_emberburst'){
    decalW(tx,ty,{col:FIRE,r:def.radius||2.2,life:2.2,a:.55});
    after(.1,()=>{
      flashW(tx,ty,{col:FIRE2,size:54,life:.22});
      ringW(tx,ty,{r0:.2,r1:(def.radius||2.2)+.4,col:FIRE,life:.45});
      burstW(tx,ty,{n:sc(110),col:FIRE,col2:FIRE2,spd:2.6,life:.7,size:5.5,shape:1,shape2:0,vz:80,grav:110,jitter:.9});
      riseW(tx,ty,{n:sc(26),col:FIRE,col2:FIRE2,r:1.4,life:1.8,vz:40,size:3.5,stagger:1.2});
      stuckW(tx,ty,{n:10,r:1.6,col:FIRE,col2:FIRE2,shape:1,size:7,life:1.7,z0:2,tilt:1});
      impact(3,0);
    });
  }else if(id==='sp_flameimpact'){
    projectile({from:[tx-3.2,ty-1.2,240],to:[tx,ty,6],dur:.2,trail:'meteor',col:FIRE,
      onArrive:(x,y)=>{explodeFire(x,y,true);impact(6,.04);if(typeof sfx==='function')sfx('boom');}});
  }else if(id==='sp_flamedetonate'){
    const n=FX._detN;FX._detN=0;
    after(.07*n+.12,()=>{ringW(tx,ty,{r0:.3,r1:(def.radius||2.6)+.6,col:FIRE2,life:.5,width:.1});});
  }else if(id==='sp_blizzard'){
    ringW(P.x,P.y,{r0:.2,r1:2.2,col:FROST,life:.4});
    glyphW(P.x,P.y,{shape:5,col:FROST2,size:52,life:.5});
    showVeil(0,2.2,FROST,FROST2);
    const n=nq(650);
    for(let i=0;i<n;i++){
      const life=1.4+R()*1.2;
      spawn(pools.alpha,{x:R()*W,y:-20-R()*60,screen:true,
        vx:-30-R()*50,vy:(H+120)/life,life,size:4+R()*5,shape:5,
        col:R()<.8?rgb(FROST2):rgb(FROST),birth:FX.time+R()*1.3,spin:(R()-.5)*3});
    }
    (targets||[]).slice(0,16).forEach(f=>{
      after(R()*.4,()=>{
        burstW(f.x,f.y,{n:24,col:FROST,col2:FROST2,spd:2.6,life:.5,size:4.5,shape:2,shape2:5,vz:26,grav:70});
        ringW(f.x,f.y,{r0:.1,r1:.9,col:FROST,life:.3,width:.1});
      });
    });
    impact(0,.03);
  }else if(id==='sp_frostring'){
    const R2=def.radius||3.2;
    ringW(P.x,P.y,{r0:.2,r1:R2,col:FROST,life:.45,width:.12});
    ringW(P.x,P.y,{r0:.1,r1:R2*.7,col:FROST2,life:.35,width:.07});
    burstW(P.x,P.y,{n:sc(150),col:FROST,col2:FROST2,spd:5.5,life:.6,size:5.5,shape:2,shape2:5,vz:26,grav:70,drag:.8});
    showVeil(1,.6,FROST,FROST2);
    decalW(P.x,P.y,{col:FROST2,r:R2*.8,life:2.2,a:.7});
    stuckW(P.x,P.y,{n:12,r:R2*.8,col:FROST,col2:FROST2,shape:2,size:9,life:1.8,z0:5});
    mistW(P.x,P.y,{n:8,col:'#bfe8f5',spread:3,life:1.6,stagger:.7});
    (targets||[]).forEach(f=>after(.1+R()*.2,()=>glyphW(f.x,f.y,{shape:5,col:FROST2,size:34,life:.7})));
    impact(4,0);
  }else if(id==='sp_magicmissile'){
    ringW(P.x,P.y,{r0:.15,r1:1.2,col:ARC,life:.3});
    const ts=(targets||[]).slice(0,def.missiles||3);
    ts.forEach((f,i)=>{
      after(i*.06,()=>{
        projectile({from:[P.x,P.y,20],to:[f.x,f.y,10],target:f,dur:.28,arc:60,trail:'arcane',col:ARC,
          onArrive:(x,y)=>{explodeArcane(x,y);glyphW(x,y,{shape:3,col:ARC,size:32,life:.5});impact(1.5,0);}});
      });
    });
    if(!ts.length)after(.1,()=>burstW(P.x,P.y,{n:20,col:ARC,spd:2,life:.4,size:4,shape:3}));
  }
};
FX.detonate=function(x,y,stacks){
  if(stacks<=0)return;
  const i=FX._detN++;
  const tier=Math.min(1,stacks/10);
  after(i*.07,()=>{
    flashW(x,y,{col:'#ffffff',size:30+tier*34,life:.2});
    ringW(x,y,{r0:.1,r1:1+tier*1.4,col:FIRE,life:.35});
    burstW(x,y,{n:Math.round((25+tier*45)*FX.q),col:FIRE,col2:'#ffffff',spd:3+tier*2.5,life:.55,size:5,shape:1,shape2:0,vz:55,grav:90});
    decalW(x,y,{col:FIRE,r:1.1,life:1.6,a:.5});
    impact(2+tier*3,.04);
    if(typeof sfx==='function')sfx('boom');
  });
};
FX.reaction=function(x,y,kind){
  if(kind==='steam'){
    flashW(x,y,{col:FROST2,size:50,life:.2});
    ringW(x,y,{r0:.2,r1:2.2,col:FROST2,life:.45});
    burstW(x,y,{n:60,col:FROST2,spd:3.4,life:.6,size:7,shape:0,vz:40,grav:40});
    burstW(x,y,{n:26,col:'#cfe8ef',spd:1.4,life:1.1,size:13,shape:6,alpha:true,vz:30,grav:-16,z0:6});
    showVeil(3,.18,'#ffffff','#ffffff',.35);
  }else{
    ringW(x,y,{r0:.15,r1:2.4,col:ARC,life:.4});
    ringW(x,y,{r0:.1,r1:1.5,col:ARC2,life:.3,width:.08});
    burstW(x,y,{n:50,col:ARC,col2:ARC2,spd:3.6,life:.55,size:4.5,shape:3,shape2:1,vz:26,grav:40});
  }
};
FX.storm=function(x,y){
  ringW(x,y,{r0:.3,r1:5.2,col:ARC,life:.6,width:.12});
  flashW(x,y,{col:ARC2,size:90,life:.3});
  burstW(x,y,{n:80,col:ARC,col2:ARC2,spd:5,life:.75,size:5.5,shape:3,shape2:1,vz:40,grav:50});
  showVeil(2,.25,VIOLET,ARC,.5);
  const live=foes.filter(f=>!f.dead).slice(0,3);
  live.forEach((f,i)=>after(i*.05,()=>beamW(x,y,f.x,f.y,{col:ARC,life:.14,width:5})));
};
FX.becomeMage=function(){FX._magePending=true;};
function playMage(){
  FX._magePending=false;
  const x=P.x,y=P.y;
  for(let i=0;i<3;i++)after(i*.1,()=>ringW(x,y,{r0:.2,r1:2+i*.9,col:i===1?ARC2:ARC,life:.5,width:.1}));
  pillarW(x,y,{col:ARC,h:200,w:34,life:.7});
  flashW(x,y,{col:ARC2,size:80,life:.3});
  burstW(x,y,{n:nq(180),col:ARC,col2:ARC2,spd:4.5,life:.9,size:5.5,shape:3,shape2:1,vz:70,grav:60});
  riseW(x,y,{n:40,col:ARC2,r:1.2,life:1.4,vz:50,size:4,stagger:.8});
  showVeil(2,.3,VIOLET,ARC,.6);
  impact(8,0);
}

const BUILD_THEME={
  wall:{col:WOOD,col2:'#caa060',n:60},
  tower:{col:MINT,col2:'#c8f5e8',n:70},
  totem:{col:LEAF,col2:'#b8f5c8',n:70},
  cannon:{col:CYAN,col2:FROST2,n:80},
  manawell:{col:CYAN,col2:ARC,n:95}
};
FX.cast=function(id,x,y,o){
  o=o||{};
  if(BUILD_THEME[id]){
    const t=BUILD_THEME[id];
    decalW(x,y,{col:t.col,r:1.1,life:.4,a:.6});
    ringW(x,y,{r0:1.1,r1:.2,col:t.col,life:.3,width:.1});
    after(.22,()=>{
      flashW(x,y,{col:t.col2,size:40,life:.2});
      ringW(x,y,{r0:.2,r1:1.2,col:t.col,life:.35});
      if(id==='manawell'){vortexW(x,y,{n:t.n,col:t.col,col2:t.col2,r:1.5,life:.5});pillarW(x,y,{col:t.col,h:90,w:18,life:.5});}
      else if(id==='totem')riseW(x,y,{n:t.n,col:t.col,col2:t.col2,r:.7,life:1.2,vz:44,size:4,swirl:1.6,shape:0,stagger:.5});
      else if(id==='cannon')burstW(x,y,{n:t.n,col:t.col,col2:t.col2,spd:2.4,life:.6,size:4.5,shape:2,shape2:1,vz:40,grav:70});
      else if(id==='tower'){riseW(x,y,{n:t.n,col:t.col,col2:t.col2,r:.5,life:.8,vz:60,size:4,swirl:.6});burstW(x,y,{n:16,col:t.col2,spd:1.6,life:.5,size:3.5,shape:1,z0:30,vz:30,grav:30});}
      else burstW(x,y,{n:t.n,col:t.col,col2:t.col2,spd:2.2,life:.6,size:4.5,shape:0,shape2:2,vz:34,grav:80});
    });
    return;
  }
  if(id==='rain'){
    const R2=o.radius||2.2;
    ringW(x,y,{r0:R2,r1:R2*.85,col:WARN,life:.5,width:.1});
    ringW(x,y,{r0:R2*.5,r1:R2*.4,col:WARN,life:.5,width:.06});
    decalW(x,y,{col:WARN,r:R2,life:1.9,a:.22});
    const per=nq(9);
    for(let w=0;w<3;w++){
      if(w>0)after(.05+w*.45,()=>{if(typeof sfx==='function')sfx('arrow');});
      for(let i=0;i<per;i++){
        const a=R()*TAU2,r=R2*Math.sqrt(R())*.85;
        const gx=x+Math.cos(a)*r,gy=y+Math.sin(a)*r;
        const size=26+R()*8,z0=230+R()*60;
        const fall=Math.sqrt(2*(z0-size/2)/1000);
        const delay=.05+w*.45+i*.03;
        after(delay,()=>{
          spawn(pools.add,{x:gx,y:gy,z0,vz:0,grav:1000,life:fall,size,shape:8,hold:true,
            col:R()<.6?rgb('#e8d9b0'):rgb(WARN),seed:0,spin:0});
        });
        after(delay+fall,()=>{
          burstW(gx,gy,{n:4,col:'#e8d9b0',spd:1.2,life:.3,size:3,shape:0,z0:2,vz:12,grav:60});
          spawn(pools.add,{x:gx,y:gy,z0:11,life:1.1,size:22,shape:8,hold:true,
            col:rgb('#caa060'),seed:(R()-.5)*.12,spin:0});
        });
      }
    }
    after(1.6,()=>ringW(x,y,{r0:.3,r1:R2,col:WARN,life:.4}));
  }else if(id==='mine'){
    burstW(x,y,{n:14,col:CYAN,col2:FROST2,spd:.8,life:.2,size:5,shape:2,z0:4,vz:16,grav:0});
    after(.15,()=>{
      flashW(x,y,{col:'#ffffff',size:80,life:.25});
      ringW(x,y,{r0:.2,r1:2.8,col:CYAN,life:.45,width:.14});
      ringW(x,y,{r0:.1,r1:3.6,col:FROST2,life:.6,width:.07});
      burstW(x,y,{n:nq(130),col:CYAN,col2:FROST2,spd:6,life:.7,size:5.5,shape:2,shape2:1,vz:60,grav:100});
      burstW(x,y,{n:24,col:'#9db8b4',spd:4,life:.6,size:8,shape:6,alpha:true,vz:14,grav:10,z0:2});
      decalW(x,y,{col:CYAN,r:1.8,life:2.2,a:.6});
      stuckW(x,y,{n:8,r:1.6,col:CYAN,col2:FROST2,shape:2,size:9,life:1.8,z0:5});
      mistW(x,y,{n:8,col:'#9fd8e8',spread:2.4,life:1.7,stagger:.8});
      impact(0,.05);
    });
  }else if(id==='spring'){
    ringW(x,y,{r0:.2,r1:1.4,col:LEAF,life:.4});
    riseW(x,y,{n:nq(60),col:LEAF,col2:'#b8f5c8',r:.8,life:1.1,vz:52,size:4.5,swirl:1.8,stagger:.4});
    glyphW(x,y,{shape:0,col:LEAF,size:46,life:.6});
    after(.15,()=>glyphW(x,y,{shape:1,col:'#b8f5c8',size:30,life:.5}));
  }else if(id==='mend'){
    flashW(core.x,core.y,{col:AMBER,size:60,life:.25});
    ringW(core.x,core.y,{r0:.2,r1:1.8,col:AMBER,life:.45});
    burstW(core.x,core.y,{n:30,col:AMBER,col2:'#ffd9a0',spd:2.4,life:.6,size:4.5,shape:1,vz:36,grav:60});
    builds.forEach((b,i)=>{
      after(.08+i*.06,()=>{
        beamW(core.x,core.y,b.x,b.y,{col:AMBER,life:.18,width:5});
        burstW(b.x,b.y,{n:10,col:AMBER,col2:'#ffd9a0',spd:1.8,life:.45,size:3.5,shape:1,z0:14,vz:20,grav:50});
      });
    });
  }else if(id==='ward'){
    ringW(x,y,{r0:.2,r1:1.6,col:MINT,life:.4});
    burstW(x,y,{n:18,col:MINT,col2:'#c8f5e8',spd:2,life:.5,size:4,shape:0,vz:26,grav:30});
    bubbleW({dur:4,col:MINT});
    after(4,()=>burstW(P.x,P.y,{n:22,col:MINT,spd:2.6,life:.45,size:4,shape:2,z0:16,vz:10,grav:40}));
  }else if(id==='tactic'){
    const from=rectOf('.pileChip.draw'),to=rectOf('#handRow');
    if(from&&to){flyScreen(from.x,from.y,to.x,to.y-30,{col:'#c9a8ff',n:7,dur:.4});
      after(.12,()=>flyScreen(from.x,from.y,to.x+40,to.y-30,{col:ARC2,n:7,dur:.4}));}
    burstW(x,y,{n:26,col:'#c9a8ff',col2:ARC2,spd:2,life:.5,size:4,shape:3,vz:24,grav:30});
    ringW(x,y,{r0:.15,r1:1,col:'#c9a8ff',life:.3});
  }else if(id==='surge'){
    vortexW(x,y,{n:nq(70),col:CYAN,col2:FROST2,r:1.8,life:.45,size:4.5});
    after(.4,()=>{ringW(x,y,{r0:.2,r1:1.6,col:CYAN,life:.4});flashW(x,y,{col:FROST2,size:46,life:.2});});
    const pip=rectOf('#dashPip');
    if(pip)after(.45,()=>screenBurst(pip.x,pip.y,{col:CYAN,n:14,spd:90,life:.4,size:4}));
  }else if(id==='expand'){
    const to=rectOf('#handRow');
    if(to)screenBurst(to.x,to.y-40,{col:AMBER,n:26,spd:150,life:.5,size:4.5,shape:1});
    const from=rectOf('.pileChip.draw');
    if(from&&to)flyScreen(from.x,from.y,to.x,to.y-30,{col:AMBER,n:6,dur:.4});
    ringW(x,y,{r0:.15,r1:1,col:AMBER,life:.35});
  }else if(id==='salvage'){
    const tier=o.tier||5,col=tier>=20?CYAN:tier>=10?MINT:LEAF;
    const n=tier>=20?110:tier>=10?80:55;
    burstW(x,y,{n,col,col2:FROST2,spd:2.2,life:.7,size:4.5,shape:2,shape2:0,vz:40,grav:-10});
    riseW(x,y,{n:Math.round(n*.4),col,r:.9,life:1,vz:40,size:3.5,stagger:.4});
    ringW(x,y,{r0:.2,r1:1.3,col,life:.4});
    const to=rectOf('#resRow'),ps=w2s(x,y);
    if(to)after(.15,()=>flyScreen(ps[0],ps[1]-20,to.x,to.y,{col,n:8,dur:.5,size:7}));
  }
};

/* ---------------- 生命周期 ---------------- */
FX.resize=function(){
  vw=innerWidth;vh=innerHeight;vdpr=Math.min(devicePixelRatio||1,2);
  if(gpu){
    gpu.canvas.width=Math.max(1,Math.floor(vw*vdpr));
    gpu.canvas.height=Math.max(1,Math.floor(vh*vdpr));
  }else{
    if(!renderer)return;
    renderer.setPixelRatio(vdpr);renderer.setSize(vw,vh,false);
    camera.right=vw;camera.bottom=vh;camera.updateProjectionMatrix();
    for(const p of [pools.add,pools.alpha])p.mat.uniforms.uDPR.value=vdpr;
  }
  if(veil){
    veil.mesh.scale.set(vw,vh,1);veil.mesh.position.set(vw/2,vh/2,0);
    if(gpu){veil.gpuData[20]=vw/2;veil.gpuData[21]=vh/2;veil.gpuData[22]=vw;veil.gpuData[23]=vh;}
  }
};
FX.clear=function(){
  if(!FX.on)return;
  for(const pool of [pools.add,pools.alpha]){
    if(gpu){
      pool.data.fill(0);
      const f=PART_STRIDE/4;
      for(let i=0;i<pool.n;i++)pool.data[i*f+9]=1;
      gpu.device.queue.writeBuffer(pool.buffer,0,pool.data);
    }else{
      pool.arr.aTime.fill(-1e9);
    }
    pool.cursor=0;pool.lo=0;pool.hi=pool.n-1;pool.wrap=true;pool.liveUntil=0;
  }
  for(const q of quads){q.active=false;q.mesh.visible=false;}
  projs.length=0;events.length=0;FX._detN=0;FX._magePending=false;
  if(veil)veil.visible=false;
  wasActive=true;
};
FX.activeCount=function(){
  if(!FX.on)return 0;
  let n=projs.length+events.length;
  for(const q of quads)if(q.active)n++;
  if(veil&&veil.visible)n++;
  if(pools.add.liveUntil>FX.time)n++;
  if(pools.alpha.liveUntil>FX.time)n++;
  return n;
};
FX.frame=function(){
  if(!FX.on)return;
  const now=performance.now();
  let dt=(now-lastNow)/1000;lastNow=now;
  if(!(dt>0))dt=1/60;
  dt=Math.min(dt,.05);
  emaMs=emaMs*.95+dt*1000*.05;
  if(emaMs>33){deadT+=dt;if(deadT>1){FX.on=false;$('fxcv').style.display='none';return;}}
  else deadT=0;
  if(emaMs>24){slowT+=dt;if(slowT>2){FX.q=reduceMotion?.4:.6;veilOff=true;}}
  else slowT=0;
  let mult=1;
  if(typeof codexOpen!=='undefined'&&codexOpen)mult=0;
  else if(S.mode==='play')mult=S.hitstop>0?.12:Math.min(S.speed,2);
  else if(S.mode==='pause'||S.mode==='dawn'||S.mode==='remove'||S.mode==='swap'||S.mode==='menu'||S.mode==='prep')mult=0;
  FX.time+=dt*mult;
  if(FX._magePending&&S.mode==='play')playMage();
  for(let i=events.length-1;i>=0;i--){
    if(events[i].t<=FX.time){const e=events.splice(i,1)[0];e.fn();}
  }
  for(let i=projs.length-1;i>=0;i--){updateProj(projs[i]);if(projs[i].done)projs.splice(i,1);}
  for(const q of quads)if(q.active)updateQuad(q);
  if(veil&&veil.visible){
    const t=(FX.time-veil.birth)/veil.dur;
    if(t>=1)veil.visible=false;
    else{
      if(gpu)veil.gpuData[1]=t;
      else{veil.mesh.material.uniforms.uT.value=t;veil.mesh.material.uniforms.uTime.value=FX.time;}
    }
  }
  if(!gpu){
    const z=cam.z,cpx=(cam.x-cam.y)*32,cpy=(cam.x+cam.y)*16;
    for(const pool of [pools.add,pools.alpha]){
      const u=pool.mat.uniforms;
      u.uTime.value=FX.time;u.uZoom.value=z;
      u.uM.value.set(32*z,-32*z,W/2+cam.sx-cpx*z);
      u.uN.value.set(16*z,16*z,H/2+cam.sy-cpy*z);
    }
  }
  for(const pool of [pools.add,pools.alpha])upload(pool);
  const active=pools.add.liveUntil>FX.time||pools.alpha.liveUntil>FX.time||
    projs.length>0||events.length>0||quads.some(q=>q.active)||(veil&&veil.visible);
  if(active||wasActive){
    if(gpu)renderGPU();else renderer.render(scene,camera);
    wasActive=active;
  }
};
FX.init=async function(){
  if(typeof THREE==='undefined')return;
  let c=$('fxcv');if(!c)return;
  scene=new THREE.Scene();
  camera=new THREE.OrthographicCamera(0,innerWidth,0,innerHeight,.1,2000);
  camera.position.z=500;
  atlasTex=makeAtlas();
  quadGeo=new THREE.PlaneGeometry(1,1);
  let ready=false;
  if(navigator.gpu){
    try{
      gpu=await initGPU(c);ready=true;FX.backend='webgpu';
    }catch(e){
      gpu=null;console.warn('WebGPU 特效不可用，回退 WebGL:',e);
      // webgpu 上下文已占用画布，WebGL 无法复用同节点：换新画布再回退
      const nc=c.cloneNode(false);c.replaceWith(nc);c=nc;
    }
  }
  if(!ready){
    try{
      renderer=new THREE.WebGLRenderer({canvas:c,alpha:true,antialias:false,powerPreference:'high-performance'});
    }catch(e){FX.on=false;return;}
    renderer.setClearColor(0x000000,0);
    FX.backend='webgl';
    c.addEventListener('webglcontextlost',e=>{e.preventDefault();FX.on=false;c.style.display='none';});
  }
  pools={add:makePool(ADD,THREE.AdditiveBlending,20),alpha:makePool(ALPHA,THREE.NormalBlending,8)};
  for(let i=0;i<QUADS;i++)quads.push({mesh:makeQuadMesh(12),active:false,birth:0,gpuData:new Float32Array(QUAD_STRIDE/4)});
  veil={mesh:makeQuadMesh(4,THREE.NormalBlending),visible:false,birth:0,dur:1,gpuData:new Float32Array(QUAD_STRIDE/4)};
  veil.mesh.visible=false;
  Object.defineProperty(veil,'visible',{get(){return veil.mesh.visible;},set(v){veil.mesh.visible=v;}});
  FX.q=reduceMotion?.4:1;
  addEventListener('resize',()=>FX.resize());
  FX.resize();
  lastNow=performance.now();
  FX.on=true;
  FX._dbg={get backend(){return FX.backend;},get pools(){return pools;},get renderer(){return renderer;},
    get gpu(){return gpu;},get scene(){return scene;},get projs(){return projs;},
    get quads(){return quads;},get events(){return events;},
    slash:(x,y,a,r,h)=>slashW(x,y,a,r,{life:.6,half:h===undefined?1.1:h})};
};
/* 特效入口统一保护：后端未就绪时静默跳过，不再回退 Canvas 2D。 */
for(const k of ['cast','spell','becomeMage','detonate','storm','reaction','sword','swordHit','waveShot']){
  if(typeof FX[k]==='function'){const fn=FX[k];FX[k]=function(...a){if(!FX.on)return;return fn.apply(this,a);};}
}
try{FX.init().catch(e=>{FX.on=false;console.warn('FX 初始化失败:',e);});}catch(e){FX.on=false;console.warn('FX 初始化失败:',e);}
})();