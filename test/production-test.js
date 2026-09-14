import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';

global.document={createElement:(t)=>t==='canvas'?createCanvas(1,1):{}};
global.window=global;

const { produceHighQuality } = await import('../js/production-engine.js');

const raw=await loadImage('My-Pic.jpg');
const src=createCanvas(raw.width,raw.height);
src.getContext('2d').drawImage(raw,0,0);
src.naturalWidth=raw.width; src.naturalHeight=raw.height;
console.log(`My-Pic ${raw.width}x${raw.height} — testing production engine per-segment`);

const presets=[
  ['portrait 1080x1350',1080,1350],
  ['post 1080x1080',1080,1080],
  ['story 1080x1920',1080,1920],
  ['profile 640x640',640,640],
];

function measure(c){
  const w=c.width,h=c.height,ctx=c.getContext('2d');
  const d=ctx.getImageData(0,0,w,h).data;
  let s=0,s2=0,n=0, sumL=0;
  const g=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=(y*w+x)*4; const v=g(i)*4 - g(i-4)-g(i+4)-g(i-w*4)-g(i+w*4); s+=v; s2+=v*v; n++; }
  for(let i=0;i<d.length;i+=4) sumL+=g(i);
  const variance=s2/n - (s/n)*(s/n);
  let acc=0,cnt=0; for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++){ const i=(y*w+x)*4; acc+=Math.abs(d[i]-d[i+4])+Math.abs(d[i]-d[i+w*4]); cnt++; }
  return { variance, sharp:acc/cnt, avgL: sumL/(w*h) };
}

for(const [name,W,H] of presets){
  const c1=createCanvas(W,H);
  const c2=createCanvas(W,H);
  // without segment
  // mock production without segment via optimizer path
  const { optimizeToCanvas } = await import('../js/optimizer.js');
  const { autoEnhanceParams, applyEnhance } = await import('../js/enhance.js');
  global.window.PixelPerfectEnhance={applyEnhance, autoEnhanceParams};
  optimizeToCanvas(src,W,H,c1,{sharpen:true, autoEnhance:true});
  const m1=measure(c1);
  // with segment
  const res=produceHighQuality(src,W,H,c2,{sharpen:true, autoEnhance:true, segment:true});
  const m2=measure(c2);
  const seg=res.stats;
  console.log(`\n${name} ${W}x${H} skin ${seg.skinPct}% sky ${seg.skyPct}%`);
  console.log(`  No-segment: var ${m1.variance.toFixed(1)} sharp ${m1.sharp.toFixed(2)} avgL ${m1.avgL.toFixed(1)}`);
  console.log(`  Segment:    var ${m2.variance.toFixed(1)} sharp ${m2.sharp.toFixed(2)} avgL ${m2.avgL.toFixed(1)} → ${m2.variance>m1.variance?'↑more detail':''} ${m2.sharp>m1.sharp?'↑sharper':''}`);
  fs.mkdirSync('test/output/production',{recursive:true});
  fs.writeFileSync(`test/output/production/mypic-${W}x${H}-noseg.jpg`, await c1.encode('jpeg',92));
  fs.writeFileSync(`test/output/production/mypic-${W}x${H}-seg.jpg`, await c2.encode('jpeg',92));
  // also save final production for output
  fs.mkdirSync('output',{recursive:true});
  fs.writeFileSync(`output/My-Pic-${name.replace(' ','-')}-production.jpg`, await c2.encode('jpeg',92));
}
console.log('\nProduction test done — check test/output/production/ and output/*-production.jpg');
console.log('Expect: skin segments smoother (var slightly lower on skin but overall var higher due to fabric boost), sky denoised, fabric sharper');
