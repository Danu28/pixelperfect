import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';

global.document={createElement:(t)=>t==='canvas'?createCanvas(1,1):{}};
global.window=global;

const { produceHighQuality } = await import('./js/production-engine.js');
const { applyEnhance, autoEnhanceParams } = await import('./js/enhance.js');
global.window.PixelPerfectEnhance={applyEnhance, autoEnhanceParams};

const raw=await loadImage('raw.jpg');
const src=createCanvas(raw.width, raw.height);
src.getContext('2d').drawImage(raw,0,0);
src.naturalWidth=raw.width; src.naturalHeight=raw.height;
console.log(`Source raw.jpg ${raw.width}x${raw.height} — raw → HQ production`);

const presets={
  'instagram-post-1080x1080':{w:1080,h:1080,desc:'Feed square'},
  'instagram-portrait-1080x1350':{w:1080,h:1350,desc:'Feed portrait 4:5 — best'},
  'instagram-story-1080x1920':{w:1080,h:1920,desc:'Story / Reel cover'},
  'whatsapp-status-1080x1920':{w:1080,h:1920,desc:'WhatsApp Status'},
  'whatsapp-square-1080x1080':{w:1080,h:1080,desc:'WhatsApp Square'},
  'whatsapp-profile-640x640':{w:640,h:640,desc:'WhatsApp Profile'},
};

const variants=[
  { suffix:'', opts:{}, label:'HQ only' },
  { suffix:'-auto', opts:{autoEnhance:true}, label:'Auto Enhance ★' },
  { suffix:'-vivid', opts:{enhance:{brightness:6,contrast:10,highlights:-22,shadows:20,warmth:3,vibrance:22}}, label:'Vivid' },
];

function measure(c){
  const w=c.width,h=c.height,ctx=c.getContext('2d');
  const d=ctx.getImageData(0,0,w,h).data;
  let s=0,s2=0,n=0;
  const g=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=(y*w+x)*4; const v=g(i)*4 - g(i-4)-g(i+4)-g(i-w*4)-g(i+w*4); s+=v; s2+=v*v; n++; }
  const variance=s2/n - (s/n)*(s/n);
  let acc=0,cnt=0; for(let i=0;i<d.length;i+=4) acc+=Math.abs(d[i]-d[(i+4)%d.length]); // approx
  return variance;
}

fs.mkdirSync('output',{recursive:true});
let count=0;
for(const [pname,{w,h,desc}] of Object.entries(presets)){
  for(const v of variants){
    const canvas=createCanvas(w,h);
    const res=produceHighQuality(src,w,h,canvas,{sharpen:true, segment:true, ...v.opts});
    const buf=await canvas.encode('jpeg',92);
    const out=`output/raw-${pname}${v.suffix}.jpg`;
    fs.writeFileSync(out, buf);
    count++;
    const kb=(buf.length/1024).toFixed(1);
    const stats=res.stats?` skin ${res.stats.skinPct}% sky ${res.stats.skyPct}%`:'';
    console.log(`✓ ${pname}${v.suffix} ${w}x${h} ${kb}KB${stats} | ${v.label} | ${desc}`);
  }
}
console.log(`\nGenerated ${count} files in output/ from raw.jpg`);

// compare.html
let html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>raw.jpg — Production Engine</title><style>*{box-sizing:border-box}body{font-family:Inter,system-ui;background:#0b0c10;color:#f5f7fb;margin:0;padding:24px}h1{font-size:20px;margin:0 0 6px}p{color:#9aa3b2;margin:0 0 14px}.grid{display:grid;grid-template-columns:1fr;gap:14px}.card{background:#13151a;border:1px solid #242833;border-radius:14px;padding:10px}.card h3{font-size:11px;color:#cbd5e1;margin:0 0 8px;text-transform:uppercase;letter-spacing:.06em}.row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.row img{width:100%;border-radius:10px;border:1px solid #242833}.label{font-size:10px;color:#9aa3b2;text-align:center;margin-top:6px}.badge{font-size:11px;border:1px solid #242833;background:#1a1d24;padding:4px 8px;border-radius:99px;margin-right:6px}</style></head><body>
<h1>raw.jpg 3072×4096 → High Quality Production</h1>
<p>Left: HQ only · Middle: <b>Auto Enhance (segment-aware)</b> · Right: Vivid. Per-segment: skin 0.45× sharpen, fabric 1.35×, sky denoise.</p>
<div class="grid">`;
for(const [name,{w,h,desc}] of Object.entries(presets)){
  html+=`<div class="card"><h3>${name} — ${w}×${h} · ${desc}</h3><div class="row">
<div><img src="output/raw-${name}.jpg"><div class="label">HQ only</div></div>
<div><img src="output/raw-${name}-auto.jpg"><div class="label">Auto ★</div></div>
<div><img src="output/raw-${name}-vivid.jpg"><div class="label">Vivid</div></div>
</div></div>`;
}
html+=`</div><p style="margin-top:14px">All 18 files in <code>output/</code>. Recommended: <code>raw-instagram-portrait-1080x1350-auto.jpg</code></p></body></html>`;
fs.writeFileSync('compare.html', html);
console.log('Generated compare.html');
