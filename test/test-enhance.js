import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';

global.document={createElement:(t)=>t==='canvas'?createCanvas(1,1):{}};
global.window=global;
const { optimizeToCanvas } = await import('../js/optimizer.js');
const { applyEnhance, autoEnhanceParams, analyzeImage } = await import('../js/enhance.js');

const raw=await loadImage('My-Pic.jpg');
const src=createCanvas(raw.width,raw.height);
src.getContext('2d').drawImage(raw,0,0);
src.naturalWidth=raw.width; src.naturalHeight=raw.height;
console.log(`My-Pic ${raw.width}x${raw.height}`);

// analyze
const tmp=createCanvas(100,100);
tmp.getContext('2d').drawImage(src,0,0,100,100);
const info=analyzeImage(tmp.getContext('2d'),100,100);
console.log(`Analyze avgL ${info.avgL.toFixed(1)} castR ${info.castR.toFixed(1)} castB ${info.castB.toFixed(1)} clipHi ${(info.clipHiRatio*100).toFixed(1)}% clipLo ${(info.clipLoRatio*100).toFixed(1)}%`);

const presets=[
  ['auto', {autoEnhance:true}],
  ['manual bright+10 contrast+8 highlights-20 shadows+15 warmth+5 vibrance+15', {enhance:{brightness:10, contrast:8, highlights:-20, shadows:15, warmth:5, vibrance:15}}],
  ['no enhance', {}],
];

for(const [name, opts] of presets){
  const c=createCanvas(1080,1350);
  optimizeToCanvas(src,1080,1350,c,{sharpen:true, ...opts});
  const buf=await c.encode('jpeg',92);
  fs.mkdirSync('test/output/enhance',{recursive:true});
  const out=`test/output/enhance/mypic-${name.replace(/[^a-z0-9]+/gi,'-')}.jpg`;
  fs.writeFileSync(out, buf);
  console.log(`✓ ${name} -> ${out} ${(buf.length/1024).toFixed(1)}KB`);
  // quick hist check after enhance
  const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let sum=0; for(let i=0;i<d.length;i+=4) sum+=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  console.log(`  avgL after ${(sum/(c.width*c.height)).toFixed(1)}`);
}

console.log('\nEnhance test done — check test/output/enhance/');
