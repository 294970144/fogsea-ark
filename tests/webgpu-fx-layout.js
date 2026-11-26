'use strict';
/* WebGPU FX 静态契约：WGSL 结构与 JS 打包步长必须一致。
   Node 回归沙箱不加载 FX，这里单独读源码守住布局，防止回到错位版本。 */
const fs=require('fs'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'..','js','09b-fx.js'),'utf8');

function one(re,label){const m=src.match(re);assert.ok(m,label+' not found');return m[0];}

let pass=0;
function check(name,fn){fn();pass++;console.log('  PASS  '+name);}

check('WGSL/JS Particle stride = 96 bytes',()=>{
  assert.ok(/const PART_STRIDE\s*=\s*96\s*,/.test(src),'PART_STRIDE must be 96');
  const struct=one(/struct Particle \{[\s\S]*?\n\};/,'Particle struct');
  assert.ok(struct.indexOf('world: vec2f')<struct.indexOf('vel: vec2f'));
  assert.ok(struct.indexOf('vel: vec2f')<struct.indexOf('phys: vec4f'));
  assert.ok(struct.indexOf('phys: vec4f')<struct.indexOf('born: vec2f'));
  assert.ok(struct.indexOf('born: vec2f')<struct.indexOf('padA: vec2f'));
  assert.ok(struct.indexOf('padA: vec2f')<struct.indexOf('look: vec4f'));
  assert.ok(struct.indexOf('look: vec4f')<struct.indexOf('col: vec3f'));
  assert.ok(struct.indexOf('col: vec3f')<struct.indexOf('flags: f32'));
  assert.ok(struct.indexOf('flags: f32')<struct.indexOf('padB: vec3f'));
  assert.ok(struct.indexOf('padB: vec3f')<struct.indexOf('padC: f32'));
});

check('JS particle pack writes aligned look/col/flags offsets',()=>{
  assert.ok(/d\[o\+12\]=\(p\.size\|\|5\)/.test(src),'look must start at float 12');
  assert.ok(/d\[o\+16\]=c\[0\];d\[o\+17\]=c\[1\];d\[o\+18\]=c\[2\];d\[o\+19\]=flags/.test(src),'col/flags offsets wrong');
  assert.ok(!/d\[o\+10\]=\(p\.size\|\|5\)/.test(src),'old misaligned look write still present');
});

check('WGSL/JS quad uniform stride = 112 bytes',()=>{
  assert.ok(/QUAD_STRIDE\s*=\s*112\s*;/.test(src),'QUAD_STRIDE must be 112');
  const structs=src.match(/struct Uniforms \{[\s\S]*?\n\};/g)||[];
  assert.ok(structs.length>=2,'vertex and fragment Uniforms structs required');
  for(const s of structs){
    assert.ok(s.indexOf('p1: vec4f')<s.indexOf('rect: vec4f'),'p1 must precede rect');
    assert.ok(s.indexOf('rect: vec4f')<s.indexOf('rot: f32'),'rect must precede rot');
  }
});

check('JS quad pack writes p1/rect/rot at aligned offsets',()=>{
  assert.ok(/d\[16\]=o\.p1===undefined\?\.14:o\.p1/.test(src),'p1 must be at float 16');
  assert.ok(/d\[20\]=m\.position\.x;d\[21\]=m\.position\.y;/.test(src),'rect xy must be at float 20');
  assert.ok(/d\[22\]=m\.scale\.x;d\[23\]=m\.scale\.y;/.test(src),'rect zw must be at float 22');
  assert.ok(/d\[24\]=m\.rotation\.z/.test(src),'rot must be at float 24');
});

check('GPU context uses premultiplied alpha and shader compile check',()=>{
  assert.ok(/alphaMode:'premultiplied'/.test(src),'overlay must use premultiplied alpha');
  assert.ok(/getCompilationInfo/.test(src),'shader compilation errors must be checked');
});

check('no duplicate decalW definition',()=>{
  const n=(src.match(/function decalW\(/g)||[]).length;
  assert.equal(n,1,'decalW defined '+n+' times');
});

check('WebGL fallback retained',()=>{
  assert.ok(/new THREE\.WebGLRenderer\(/.test(src),'WebGL fallback missing');
  assert.ok(/FX\.backend='webgpu'/.test(src)&&/FX\.backend='webgl'/.test(src),'backend labels missing');
});

console.log('\n'+pass+' passed, 0 failed');
