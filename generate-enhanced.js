import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';

// mock DOM for optimizer + enhance
global.document = { createElement: (tag) => tag==='canvas'?createCanvas(1,1):{} };
global.window = global;

const { optimizeToCanvas } = await import('./js/optimizer.js');
const { autoEnhanceParams, applyEnhance } = await import('./js/enhance.js');

const raw = await loadImage('My-Pic.jpg');
const src = createCanvas(raw.width, raw.height);
src.getContext('2d').drawImage(raw,0,0);
src.naturalWidth = raw.width;
src.naturalHeight = raw.height;
console.log(`Source My-Pic.jpg ${raw.width}x${raw.height}`);

// presets including all social
const presets = {
  'instagram-post-1080x1080': { w:1080, h:1080, desc: 'Feed square' },
  'instagram-portrait-1080x1350': { w:1080, h:1350, desc: 'Feed portrait 4:5 — best for My-Pic' },
  'instagram-story-1080x1920': { w:1080, h:1920, desc: 'Story / Reel cover' },
  'whatsapp-status-1080x1920': { w:1080, h:1920, desc: 'WhatsApp Status' },
  'whatsapp-square-1080x1080': { w:1080, h:1080, desc: 'WhatsApp Square' },
  'whatsapp-profile-640x640': { w:640, h:640, desc: 'WhatsApp Profile circle-safe' },
};

// also create auto-enhanced variants
const variants = [
  { suffix: '', opts: {} , label: 'Pyramid HQ only (no enhance)' },
  { suffix: '-auto', opts: { autoEnhance: true }, label: 'Pyramid HQ + Auto Enhance (recommended)' },
  { suffix: '-vivid', opts: { enhance: { brightness: 6, contrast: 8, highlights: -18, shadows: 18, warmth: 4, vibrance: 18 } }, label: 'Pyramid HQ + Vivid (manual)' },
];

fs.mkdirSync('output', { recursive: true });

let count=0;
for(const [pname, {w,h,desc}] of Object.entries(presets)){
  for(const v of variants){
    const canvas = createCanvas(w,h);
    // Use enhance via optimizer's pipeline (if enhance opts passed, optimizer will apply)
    // For auto, we need to ensure window.PixelPerfectEnhance is available — it is via import side-effect
    // Manually set window for optimizer to find
    global.window.PixelPerfectEnhance = { applyEnhance, autoEnhanceParams };

    optimizeToCanvas(src, w, h, canvas, { sharpen: true, ...v.opts });

    const buf = await canvas.encode('jpeg', 92);
    const out = `output/My-Pic-${pname}${v.suffix}.jpg`;
    fs.writeFileSync(out, buf);
    count++;
    const kb = (buf.length/1024).toFixed(1);
    // measure variance/sharp for log
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0,0,w,h).data;
    let s=0,s2=0,n=0;
    const g=i=>0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=(y*w+x)*4; const v=g(i)*4 - g(i-4)-g(i+4)-g(i-w*4)-g(i+w*4); s+=v; s2+=v*v; n++; }
    const variance = s2/n - (s/n)*(s/n);
    console.log(`✓ ${pname}${v.suffix} ${w}x${h} | ${kb}KB | var ${variance.toFixed(1)} | ${v.label} | ${desc}`);
  }
}

console.log(`\nGenerated ${count} files in output/ with FULL pyramid + enhancements`);
console.log('Preview: output/My-Pic-instagram-portrait-1080x1350-auto.jpg is the recommended for Instagram');

// also generate compare.html fresh
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>My-Pic — Full Pipeline Compare</title><style>*{box-sizing:border-box}body{font-family:Inter,system-ui;background:#0b0c10;color:#f5f7fb;margin:0;padding:24px}h1{font-size:20px;margin:0 0 6px}p{color:#9aa3b2;margin:0 0 14px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}.card{background:#13151a;border:1px solid #242833;border-radius:14px;padding:10px}.card h3{font-size:11px;color:#cbd5e1;margin:0 0 8px;text-transform:uppercase;letter-spacing:.06em}.card img{width:100%;border-radius:10px;border:1px solid #242833}.label{font-size:10px;color:#9aa3b2;text-align:center;margin-top:6px}.badge{font-size:11px;border:1px solid #242833;background:#1a1d24;padding:4px 8px;border-radius:99px;margin-right:6px}</style></head><body>
<h1>My-Pic — Full Pipeline (Pyramid + Enhancements)</h1>
<p>Left: HQ only · Middle: <b>Auto Enhance (recommended)</b> · Right: Vivid. Source 1639×2048. Open 100% to see highlight recovery & shadow lift.</p>
<div style="margin-bottom:12px"><span class="badge">Pyramid halving anti-pixelation</span><span class="badge">Adaptive sharpen</span><span class="badge">Auto color correction</span><span class="badge">Brightness/Contrast</span><span class="badge">Highlights/Shadows</span></div>
${Object.entries(presets).map(([name,{w,h,desc}])=>`
<div class="card" style="margin-bottom:14px"><h3>${name} — ${w}×${h} · ${desc}</h3><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
<div><img src="output/My-Pic-${name}.jpg"><div class="label">HQ only</div></div>
<div><img src="output/My-Pic-${name}-auto.jpg"><div class="label">Auto Enhance ★</div></div>
<div><img src="output/My-Pic-${name}-vivid.jpg"><div class="label">Vivid</div></div>
</div></div>`).join('')}
<p style="margin-top:14px">All 18 files in <code>output/</code>. Recommended: <code>My-Pic-instagram-portrait-1080x1350-auto.jpg</code> for feed.</p>
</body></html>`;
fs.writeFileSync('compare.html', html);
console.log('Generated compare.html with 3-way comparison');
