import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simulate DOM for optimizer.js before import
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') {
      const c = createCanvas(1, 1);
      return c;
    }
    return {};
  }
};
global.window = global;

const { optimizeToCanvas } = await import('../js/optimizer.js');

function oldOptimize(img, TW, TH, canvas) {
  const sw = img.width, sh = img.height;
  const scale = Math.max(TW/sw, TH/sh);
  const srcW = TW/scale, srcH = TH/scale;
  const sx = (sw - srcW)/2, sy=(sh-srcH)/2;
  canvas.width=TW; canvas.height=TH;
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,TW,TH);
  ctx.drawImage(img, sx,sy,srcW,srcH,0,0,TW,TH);
  const d=ctx.getImageData(0,0,TW,TH); const out=new Uint8ClampedArray(d.data);
  const idx=(x,y)=>(y*TW+x)*4;
  for(let y=1;y<TH-1;y++) for(let x=1;x<TW-1;x++) for(let c=0;c<3;c++){ const i=idx(x,y)+c; const v=d.data[i]*5-d.data[idx(x-1,y)+c]-d.data[idx(x+1,y)+c]-d.data[idx(x,y-1)+c]-d.data[idx(x,y+1)+c]; out[i]=Math.round(d.data[i]*0.55+Math.max(0,Math.min(255,v))*0.45);}
  for(let i=0;i<d.data.length;i++) d.data[i]=out[i];
  ctx.putImageData(d,0,0);
  return canvas;
}

function createTestPattern(w,h, type){
  const c=createCanvas(w,h); const ctx=c.getContext('2d');
  if(type==='photo'){
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#ff3b6e'); g.addColorStop(0.5,'#7c3aed'); g.addColorStop(1,'#06b6d4');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='white'; ctx.font=`${Math.round(w/12)}px sans-serif`; ctx.fillText('PixelPerfect Hd Test', w*0.06, h*0.18);
    ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=1;
    for(let i=0;i<20;i++){ ctx.beginPath(); ctx.moveTo(0, h*0.25 + i* (h*0.5/20)); ctx.lineTo(w, h*0.25 + i*(h*0.5/20)); ctx.stroke(); }
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.arc(w*(0.2+i*0.15), h*0.75, w*0.06, 0, Math.PI*2); ctx.fillStyle=`hsl(${i*50} 80% 60%)`; ctx.fill(); ctx.strokeStyle='white'; ctx.lineWidth=3; ctx.stroke(); }
    ctx.strokeStyle='black'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.stroke();
  } else if(type==='chart'){
    ctx.fillStyle='white'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='black'; ctx.font=`${Math.round(w/25)}px monospace`;
    for(let y=0;y<h;y+=Math.round(h/12)) { ctx.fillText('ABCDEFGHIJKL 0123456789 !@#$%^&*', 10, y+20); }
    const cw= Math.round(w*0.4), ch=Math.round(h*0.3); const ox=Math.round(w*0.55), oy=Math.round(h*0.1);
    for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){ ctx.fillStyle=((x+y)%2)?'#000':'#fff'; ctx.fillRect(ox+x, oy+y,1,1); }
    ctx.strokeStyle='red'; ctx.strokeRect(ox,oy,cw,ch);
  } else if(type==='portrait'){
    ctx.fillStyle='#fde68a'; ctx.fillRect(0,0,w,h);
    const cx=w/2, cy=h*0.42, r=w*0.28;
    ctx.fillStyle='#ffedd5'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(cx-r*0.22,cy-r*0.15,r*0.08,0,Math.PI*2); ctx.arc(cx+r*0.22,cy-r*0.15,r*0.08,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#c2410c'; ctx.lineWidth= r*0.06; ctx.beginPath(); ctx.arc(cx,cy+r*0.22,r*0.22,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
    ctx.fillStyle='#451a03'; ctx.beginPath(); ctx.arc(cx,cy-r*0.35,r*1.05,Math.PI,0); ctx.fill();
  }
  return c;
}

function laplacianVariance(canvas){
  const w=canvas.width,h=canvas.height, ctx=canvas.getContext('2d');
  const d=ctx.getImageData(0,0,w,h).data;
  let sum=0, sum2=0, n=0;
  const gray=(i)=> 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const i=(y*w+x)*4;
    const v = gray(i)*4 - gray(i-4) - gray(i+4) - gray(i-w*4) - gray(i+w*4);
    sum+=v; sum2+=v*v; n++;
  }
  const mean=sum/n; return sum2/n - mean*mean;
}
function edgeSharpness(canvas){
  const w=canvas.width,h=canvas.height, ctx=canvas.getContext('2d');
  const d=ctx.getImageData(0,0,w,h).data;
  let acc=0,cnt=0;
  for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++){
    const i=(y*w+x)*4;
    const gx = Math.abs(d[i]-d[i+4]);
    const gy = Math.abs(d[i]-d[i+w*4]);
    acc+= gx+gy; cnt++;
  }
  return acc/cnt;
}

async function testCase(name, srcW, srcH, TW, TH, pattern){
  const src = createTestPattern(srcW, srcH, pattern);
  const cNew = createCanvas(TW,TH);
  const cOld = createCanvas(TW,TH);
  src.naturalWidth = src.width; src.naturalHeight = src.height;
  optimizeToCanvas(src, TW, TH, cNew, {sharpen:true});
  oldOptimize(src, TW, TH, cOld);
  const varNew = laplacianVariance(cNew);
  const varOld = laplacianVariance(cOld);
  const sharpNew = edgeSharpness(cNew);
  const sharpOld = edgeSharpness(cOld);
  const dimOk = cNew.width===TW && cNew.height===TH;
  const minSharp = pattern==='chart' ? 5 : pattern==='photo' ? 1.8 : 0.2;
  const sharpOk = sharpNew >= minSharp;
  // relative: chart alias case old is 4x higher due to moire, so allow lower
  const relThresh = pattern==='chart' ? 0.18 : 0.55;
  const relativeOk = sharpNew >= sharpOld * relThresh;
  const notPixelated = sharpNew < sharpOld * 2.2;
  const hasContent = varNew > 0.5; // at least some detail
  const pass = dimOk && hasContent && sharpOk && relativeOk && notPixelated;
  console.log(`\n[${pass?'PASS':'FAIL'}] ${name}`);
  console.log(`  src ${srcW}x${srcH} -> ${TW}x${TH} (${pattern})`);
  console.log(`  Old var ${varOld.toFixed(1)} sharp ${sharpOld.toFixed(2)} | New var ${varNew.toFixed(1)} sharp ${sharpNew.toFixed(2)} | ratio ${(sharpNew/sharpOld).toFixed(2)}`);
  console.log(`  dimOk:${dimOk} sharpOk:${sharpOk} relativeOk:${relativeOk} hasContent:${hasContent} notPixelated:${notPixelated}`);
  if(!pass) console.log('  --> Investigate: pixelation or blur');
  return pass;
}

const cases = [
  ['4K photo downscale to Insta Post', 4032,3024,1080,1080,'photo'],
  ['4K chart downscale to Story', 3840,2160,1080,1920,'chart'],
  ['Small 640 upscaled to Story', 640,480,1080,1920,'portrait'],
  ['12MP portrait to WhatsApp profile', 4000,3000,640,640,'portrait'],
  ['Square to portrait', 2000,2000,1080,1350,'photo'],
  ['Tiny thumb upscale to post', 320,320,1080,1080,'chart'],
];

console.log('=== PixelPerfect HQ Engine Test ===');
let allPass=true;
for(const [n,sw,sh,tw,th,pat] of cases){
  const ok = await testCase(n,sw,sh,tw,th,pat);
  allPass = allPass && ok;
}
console.log('\n'+ (allPass ? '✅ ALL TESTS PASS — anti-pixelation verified' : '❌ SOME FAIL — need tuning'));
if(!allPass) process.exit(1);
const sample = createTestPattern(3000,2000,'photo');
const out = createCanvas(1080,1080);
sample.naturalWidth=sample.width; sample.naturalHeight=sample.height;
optimizeToCanvas(sample,1080,1080,out,{sharpen:true});
fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'output/sample-1080.jpg'), await out.encode('jpeg',92));
console.log('Sample saved to test/output/sample-1080.jpg');
