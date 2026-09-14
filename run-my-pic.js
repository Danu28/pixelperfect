import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

// mock DOM for optimizer.js
global.document = {
  createElement: (tag) => tag === 'canvas' ? createCanvas(1,1) : {}
};
global.window = global;

const { optimizeToCanvas } = await import('./js/optimizer.js');

const presets = {
  'instagram-post-1080x1080': { w:1080, h:1080 },
  'instagram-portrait-1080x1350': { w:1080, h:1350 },
  'instagram-story-1080x1920': { w:1080, h:1920 },
  'whatsapp-status-1080x1920': { w:1080, h:1920 },
  'whatsapp-square-1080x1080': { w:1080, h:1080 },
  'whatsapp-profile-640x640': { w:640, h:640 },
};

const srcPath = 'My-Pic.jpg';
const raw = await loadImage(srcPath);
console.log(`Loaded My-Pic.jpg: ${raw.width}x${raw.height}`);
// Wrap Image into a canvas source that optimizer can read naturalWidth/width from
const srcCanvas = createCanvas(raw.width, raw.height);
const sctx = srcCanvas.getContext('2d');
sctx.drawImage(raw, 0, 0);
srcCanvas.naturalWidth = raw.width;
srcCanvas.naturalHeight = raw.height;
const img = srcCanvas;

fs.mkdirSync('output', { recursive: true });

// also create test/output for app preview
fs.mkdirSync('test/output', { recursive: true });

for (const [name, {w, h}] of Object.entries(presets)) {
  const canvas = createCanvas(w, h);
  optimizeToCanvas(img, w, h, canvas, { sharpen: true });
  const buf = await canvas.encode('jpeg', 92);
  const out = `output/My-Pic-${name}.jpg`;
  fs.writeFileSync(out, buf);
  // also write webp for quality compare
  // measure laplacian variance for report
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0,0,w,h).data;
  let sum=0,sum2=0,n=0;
  const gray=i=>0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const i=(y*w+x)*4;
    const v = gray(i)*4 - gray(i-4)-gray(i+4)-gray(i-w*4)-gray(i+w*4);
    sum+=v; sum2+=v*v; n++;
  }
  const variance = sum2/n - (sum/n)*(sum/n);
  const kb = (buf.length/1024).toFixed(1);
  console.log(`✓ ${name}: ${w}x${h} | ${kb} KB | variance ${variance.toFixed(1)} -> ${out}`);
}

console.log('\nAll My-Pic outputs generated in output/');
// copy one as preview for web
const portrait = 'output/My-Pic-instagram-portrait-1080x1350.jpg';
if (fs.existsSync(portrait)) {
  fs.copyFileSync(portrait, 'test/output/My-Pic-preview.jpg');
  console.log('Preview copied to test/output/My-Pic-preview.jpg');
}
