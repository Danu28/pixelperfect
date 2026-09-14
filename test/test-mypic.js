import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';

global.document = { createElement: (tag) => tag==='canvas'?createCanvas(1,1):{} };
global.window = global;
const { optimizeToCanvas } = await import('../js/optimizer.js');

function oldOptimize(img, TW, TH, canvas){
  const sw=img.width, sh=img.height;
  const scale=Math.max(TW/sw, TH/sh);
  const srcW=TW/scale, srcH=TH/scale;
  const sx=(sw-srcW)/2, sy=(sh-srcH)/2;
  canvas.width=TW; canvas.height=TH;
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,TW,TH);
  ctx.drawImage(img,sx,sy,srcW,srcH,0,0,TW,TH);
  const d=ctx.getImageData(0,0,TW,TH); const out=new Uint8ClampedArray(d.data);
  const idx=(x,y)=>(y*TW+x)*4;
  for(let y=1;y<TH-1;y++) for(let x=1;x<TW-1;x++) for(let c=0;c<3;c++){ const i=idx(x,y)+c; const v=d.data[i]*5-d.data[idx(x-1,y)+c]-d.data[idx(x+1,y)+c]-d.data[idx(x,y-1)+c]-d.data[idx(x,y+1)+c]; out[i]=Math.round(d.data[i]*0.55+Math.max(0,Math.min(255,v))*0.45);}
  for(let i=0;i<d.data.length;i++) d.data[i]=out[i];
  ctx.putImageData(d,0,0);
  return canvas;
}
function variance(canvas){
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
  const d=ctx.getImageData(0,0,w,h).data;
  let s=0,s2=0,n=0;
  const g=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=(y*w+x)*4; const v=g(i)*4-g(i-4)-g(i+4)-g(i-w*4)-g(i+w*4); s+=v; s2+=v*v; n++; }
  return s2/n - (s/n)*(s/n);
}
function sharp(canvas){
  const w=canvas.width,h=canvas.height,d=canvas.getContext('2d').getImageData(0,0,w,h).data;
  let a=0,c=0; for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++){ const i=(y*w+x)*4; a+=Math.abs(d[i]-d[i+4])+Math.abs(d[i]-d[i+w*4]); c++; } return a/c;
}
function psnr(aCanvas,bCanvas){
  const w=aCanvas.width,h=aCanvas.height;
  const da=aCanvas.getContext('2d').getImageData(0,0,w,h).data;
  const db=bCanvas.getContext('2d').getImageData(0,0,w,h).data;
  let mse=0; for(let i=0;i<da.length;i+=4){ for(let c=0;c<3;c++){ const d=da[i+c]-db[i+c]; mse+=d*d; } }
  mse/= (w*h*3);
  if(mse===0) return Infinity;
  return 10*Math.log10(255*255/mse);
}

const raw=await loadImage('My-Pic.jpg');
const src=createCanvas(raw.width,raw.height);
src.getContext('2d').drawImage(raw,0,0);
src.naturalWidth=raw.width; src.naturalHeight=raw.height;
console.log(`My-Pic source ${raw.width}x${raw.height}`);

const cases=[
  ['MyPic → Insta Post 1080x1080',1080,1080],
  ['MyPic → Portrait 1080x1350',1080,1350],
  ['MyPic → Story 1080x1920',1080,1920],
  ['MyPic → WhatsApp 640',640,640],
];

let allPass=true;
for(const [name,TW,TH] of cases){
  const cOld=createCanvas(TW,TH);
  const cNew=createCanvas(TW,TH);
  oldOptimize(src,TW,TH,cOld);
  optimizeToCanvas(src,TW,TH,cNew,{sharpen:true});
  const vO=variance(cOld), vN=variance(cNew);
  const sO=sharp(cOld), sN=sharp(cNew);
  const p=psnr(cOld,cNew);
  // For MyPic we expect: new should be sharper but not over-sharpened, variance should be similar or slightly higher (better detail)
  // Story crops more, so lower variance is ok
  // My-Pic absolute quality gates (realistic for natural skin/fabric, not over-sharpen halo)
  const minSharp = TH===1350 ? 13.5 : TH===1080 ? 13.5 : TH===1920 ? 8.5 : 18;
  const minVar = TH===640 ? 2000 : TH===1920 ? 350 : 1200;
  const sharpOk = sN >= minSharp;
  const varOk = vN >= minVar;
  const haloOk = sN < 35; // prevent over-sharpen halo (old is 27-40, halo)
  const notBlur = sN > sO * 0.50; // allow 50% lower than halo (natural vs aggressive)
  const pass = sharpOk && varOk && haloOk && notBlur;
  allPass=allPass&&pass;
  console.log(`\n[${pass?'PASS':'FAIL'}] ${name}`);
  console.log(`  Old var ${vO.toFixed(1)} sharp ${sO.toFixed(2)} | New var ${vN.toFixed(1)} sharp ${sN.toFixed(2)} | PSNR old↔new ${p.toFixed(1)}dB`);
  console.log(`  sharpOk:${sharpOk} varOk:${varOk} haloOk:${haloOk}`);
  if(!pass) console.log('  → tune needed');
  // save side-by-side for visual
  fs.mkdirSync('test/output/mypic-compare',{recursive:true});
  fs.writeFileSync(`test/output/mypic-compare/old-${TW}x${TH}.jpg`, await cOld.encode('jpeg',92));
  fs.writeFileSync(`test/output/mypic-compare/new-${TW}x${TH}.jpg`, await cNew.encode('jpeg',92));
}
console.log('\n'+(allPass?'✅ My-Pic all presets PASS':'❌ My-Pic needs tuning'));
if(!allPass) process.exit(1);
