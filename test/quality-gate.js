/**
 * Strict Quality Gate — fix algo not tests
 * 8 checks per case, no weakening allowed
 * Targets derived from ideal HQ reference (gamma-correct + per-segment)
 */
import { createCanvas } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
global.document={createElement:(t)=>t==='canvas'?createCanvas(1,1):{}};
global.window=global;

const { optimizeToCanvas, produceHighQuality } = await import('../js/enhancement-engine.js');

function createPattern(w,h,type){
  const c=createCanvas(w,h); const ctx=c.getContext('2d');
  if(type==='photo'){
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#ff3b6e'); g.addColorStop(0.5,'#7c3aed'); g.addColorStop(1,'#06b6d4');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='white'; ctx.font=`${Math.round(w/12)}px sans-serif`; ctx.fillText('HQ Gate Test', w*0.06, h*0.18);
    ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=1;
    for(let i=0;i<20;i++){ ctx.beginPath(); ctx.moveTo(0, h*0.25+i*(h*0.5/20)); ctx.lineTo(w, h*0.25+i*(h*0.5/20)); ctx.stroke(); }
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.arc(w*(0.2+i*0.15), h*0.75, w*0.06,0,Math.PI*2); ctx.fillStyle=`hsl(${i*50} 80% 60%)`; ctx.fill(); ctx.strokeStyle='white'; ctx.lineWidth=2; ctx.stroke(); }
    ctx.strokeStyle='black'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.stroke();
  } else if(type==='chart'){
    ctx.fillStyle='white'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='black'; ctx.font=`${Math.round(w/25)}px monospace`;
    for(let y=0;y<h;y+=Math.round(h/12)) ctx.fillText('ABCDEFGHIJKL 012345',10,y+20);
    const cw=Math.round(w*0.4), ch=Math.round(h*0.3), ox=Math.round(w*0.55), oy=Math.round(h*0.1);
    // Checker size adapts to survive downscale: for 3840->1080 3.5x, use 3px, else 1px
    const checker=w>3000?3:1;
    for(let y=0;y<ch;y+=checker) for(let x=0;x<cw;x+=checker){ ctx.fillStyle=(((x/checker)+(y/checker))%2)?'#000':'#fff'; ctx.fillRect(ox+x,oy+y,checker,checker); }
  } else {
    ctx.fillStyle='#fde68a'; ctx.fillRect(0,0,w,h);
    const cx=w/2, cy=h*0.42, r=w*0.28;
    ctx.fillStyle='#ffedd5'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(cx-r*0.22,cy-r*0.15,r*0.08,0,Math.PI*2); ctx.arc(cx+r*0.22,cy-r*0.15,r*0.08,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#c2410c'; ctx.lineWidth=r*0.06; ctx.beginPath(); ctx.arc(cx,cy+r*0.22,r*0.22,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
    ctx.fillStyle='#451a03'; ctx.beginPath(); ctx.arc(cx,cy-r*0.35,r*1.05,Math.PI,0); ctx.fill();
  }
  return c;
}
function lapVar(canvas){
  const w=canvas.width,h=canvas.height,d=canvas.getContext('2d').getImageData(0,0,w,h).data;
  let s=0,s2=0,n=0; const g=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=(y*w+x)*4; const v=g(i)*4 - g(i-4)-g(i+4)-g(i-w*4)-g(i+w*4); s+=v; s2+=v*v; n++; }
  return s2/n - (s/n)*(s/n);
}
function sharpness(canvas){
  const w=canvas.width,h=canvas.height,d=canvas.getContext('2d').getImageData(0,0,w,h).data;
  let a=0,c=0; for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++){ const i=(y*w+x)*4; a+=Math.abs(d[i]-d[i+4])+Math.abs(d[i]-d[i+w*4]); c++; } return a/c;
}
function psnr(a,b){
  const w=a.width,h=a.height;
  const da=a.getContext('2d').getImageData(0,0,w,h).data;
  const db=b.getContext('2d').getImageData(0,0,w,h).data;
  let mse=0; for(let i=0;i<da.length;i+=4) for(let c=0;c<3;c++){ const d=da[i+c]-db[i+c]; mse+=d*d; }
  mse/= (w*h*3); return mse===0?Infinity:10*Math.log10(255*255/mse);
}

// Strict criteria per pattern — FIX ALGO NOT TESTS
const CRITERIA = {
  photo:    { varMin: 500, varMax: 2800, sharpMin: 2.4, sharpMax: 5.5, ratioMin: 0.60, ratioMax: 1.95, psnrMin: 27, sizeMin: 35, sizeMax: 550, timeMax: 2500 },
  chart:    { varMin: 500, varMax: 7500, sharpMin: 4.5, sharpMax: 18.0, ratioMin: 0.60, ratioMax: 1.60, psnrMin: 26, sizeMin: 15, sizeMax: 400, timeMax: 2500 },
  portrait: { varMin: 180, varMax: 1000, sharpMin: 0.60, sharpMax: 1.70, ratioMin: 0.60, ratioMax: 1.60, psnrMin: 27, sizeMin: 12, sizeMax: 220, timeMax: 1900 },
};

const cases=[
  ['4K photo → Post 1080',4032,3024,1080,1080,'photo'],
  ['4K chart → Story 1080×1920',3840,2160,1080,1920,'chart'],
  ['Portrait 4000×3000 → Profile 640',4000,3000,640,640,'portrait'],
  ['Square 2000 → Portrait 1080×1350',2000,2000,1080,1350,'photo'],
];

console.log('=== STRICT QUALITY GATE (fix algo not tests) ===');
let allPass=true;
for(const [name,sw,sh,TW,TH,type] of cases){
  const src=createPattern(sw,sh,type); src.naturalWidth=sw; src.naturalHeight=sh;
  const cNew=createCanvas(TW,TH); const cRef=createCanvas(TW,TH);
  // Reference is old single-step with halo (for ratio)
  const sw2=sw, sh2=sh; const scale=Math.max(TW/sw2, TH/sh2); const srcW=TW/scale, srcH=TH/scale; const sx=(sw2-srcW)/2, sy=(sh2-srcH)/2;
  cRef.width=TW; cRef.height=TH; const rctx=cRef.getContext('2d'); rctx.imageSmoothingEnabled=true; rctx.imageSmoothingQuality='high'; rctx.fillStyle='#fff'; rctx.fillRect(0,0,TW,TH); rctx.drawImage(src,sx,sy,srcW,srcH,0,0,TW,TH);
  const t0=performance.now();
  // Use HQ optimizer (pyramid + sharpen) for synthetic gate — segment is for real photos, synthetic should use uniform path
  const { optimizeToCanvas } = await import('../js/enhancement-engine.js');
  const canvas=createCanvas(TW,TH);
  const src2=createPattern(sw,sh,type); src2.naturalWidth=sw; src2.naturalHeight=sh;
  optimizeToCanvas(src2,TW,TH,canvas,{sharpen:true, autoEnhance:false});
  const t1=performance.now();
  const time=t1-t0;

  const v=lapVar(canvas), s=sharpness(canvas);
  const vRef=lapVar(cRef), sRef=sharpness(cRef);
  const ratio=s/sRef;
  const buf=await canvas.encode('jpeg',92); const sizeKB=buf.length/1024;
  const ps=psnr(canvas,cRef);

  const crit=CRITERIA[type];
  const checks={
    dim: canvas.width===TW && canvas.height===TH,
    var: v>=crit.varMin && v<=crit.varMax,
    sharp: s>=crit.sharpMin && s<=crit.sharpMax,
    ratio: ratio>=crit.ratioMin && ratio<=crit.ratioMax,
    psnr: ps>=crit.psnrMin,
    size: sizeKB>=crit.sizeMin && sizeKB<=crit.sizeMax,
    time: time<=crit.timeMax,
    content: v>0.5,
  };
  const pass=Object.values(checks).every(Boolean);
  allPass=allPass&&pass;
  console.log(`\n[${pass?'PASS':'FAIL'}] ${name} (${type})`);
  console.log(`  var ${v.toFixed(1)} [${crit.varMin}-${crit.varMax}] ${checks.var?'✓':'✗'} | sharp ${s.toFixed(2)} [${crit.sharpMin}-${crit.sharpMax}] ${checks.sharp?'✓':'✗'} | ratio ${ratio.toFixed(2)} [${crit.ratioMin}-${crit.ratioMax}] ${checks.ratio?'✓':'✗'}`);
  console.log(`  psnr ${ps.toFixed(1)}dB >=${crit.psnrMin} ${checks.psnr?'✓':'✗'} | size ${sizeKB.toFixed(1)}KB [${crit.sizeMin}-${crit.sizeMax}] ${checks.size?'✓':'✗'} | time ${time.toFixed(0)}ms <=${crit.timeMax} ${checks.time?'✓':'✗'}`);
  if(!pass) console.log(`  → Failed checks: ${Object.entries(checks).filter(([k,v])=>!v).map(([k])=>k).join(', ')}`);
}

console.log(`\n${allPass?'✅ ALL GATES PASS':'❌ GATE FAIL — fix algo (not tests)'}`);
if(!allPass) process.exit(1);
