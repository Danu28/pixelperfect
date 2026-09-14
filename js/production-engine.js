/**
 * Production Engine — raw → high quality product pipeline
 * Orchestrates: pyramid resize → segmentation → per-segment enhance → per-segment sharpen → sky denoise → export
 * High-quality product for Instagram / WhatsApp with segment-aware processing
 */

import { applyEnhance, autoEnhanceParams } from './enhance.js';
import { createMasks, applyPerSegmentColor, applyPerSegmentSharpen, applySkyDenoise } from './segment-engine.js';
import { computeCoverCrop, hqResize } from './hq-resize.js';

export function produceHighQuality(img, TW, TH, outCanvas, opts={}){
  const {
    sharpen=true,
    enhance=null, // {brightness, contrast, ...} or null
    autoEnhance=false,
    segment=true, // enable per-segment processing
    quality=0.92,
    format='jpeg'
  } = opts;

  // Reuse pyramid logic from optimizer (duplicated for self-contained production)
  const sw=img.naturalWidth||img.width, sh=img.naturalHeight||img.height;
  const isRaw = (sw*sh > 6000000) || Math.max(sw,sh) > 3000; // raw high-res detection
  const crop=computeCoverCrop(sw, sh, TW, TH);
  let srcW=crop.srcW, srcH=crop.srcH, sx=crop.sx, sy=crop.sy;

  let curCanvas=document.createElement('canvas');
  let curCtx=curCanvas.getContext('2d',{willReadFrequently:true});
  curCanvas.width=Math.round(srcW); curCanvas.height=Math.round(srcH);
  curCtx.imageSmoothingEnabled=true; curCtx.imageSmoothingQuality='high';
  curCtx.drawImage(img, sx, sy, srcW, srcH, 0,0,curCanvas.width, curCanvas.height);

  // Use HQ resize with gamma + raw denoise
  const tmpOut=document.createElement('canvas');
  hqResize(curCanvas, TW, TH, tmpOut, isRaw);
  outCanvas.width=TW; outCanvas.height=TH;
  const outCtx=outCanvas.getContext('2d',{willReadFrequently:true});
  outCtx.drawImage(tmpOut,0,0);

  // Global enhance first (auto or manual)
  if(enhance || autoEnhance){
    let enh=enhance;
    if(autoEnhance && !enh){
      try{ enh=autoEnhanceParams(outCtx, TW, TH); }catch(e){ enh={brightness:4,contrast:8,highlights:-18,shadows:18,warmth:2,vibrance:18}; }
    }
    if(enh) applyEnhance(outCtx, TW, TH, enh);
  }

  // Per-segment production
  if(segment){
    const masks=createMasks(outCtx, TW, TH);
    // Debug stats for return
    const skinPx=masks.skin.reduce((a,v)=>a+(v>30),0);
    const skyPx=masks.sky.reduce((a,v)=>a+(v>30),0);
    // 1. per-segment color (skin protect, sky dehaze, foliage pop, shadow lift)
    applyPerSegmentColor(outCtx, TW, TH, masks);
    // 2. sky denoise before sharpen
    applySkyDenoise(outCtx, TW, TH, masks);
    // 3. per-segment sharpen (skin low, texture high)
    if(sharpen){
      const downscale=Math.min(srcW/TW, srcH/TH);
      let base=0.52;
      if(downscale>3) base=0.65;
      else if(downscale>2) base=0.55;
      else if(downscale>1.3) base=0.62; // tuned for My-Pic
      applyPerSegmentSharpen(outCtx, TW, TH, masks, base);
    }
    return { canvas: outCanvas, masks, stats:{ skinPct: (skinPx/(TW*TH)*100).toFixed(1), skyPct:(skyPx/(TW*TH)*100).toFixed(1) } };
  } else {
    // fallback uniform sharpen (old path)
    if(sharpen){
      const downscale=Math.min(srcW/TW, srcH/TH);
      let base=0.62; if(downscale>3) base=0.65; else if(downscale>2) base=0.55;
      // simple uniform (import from optimizer alternative)
      const { applyEnhance: _ } = awaitImportCheck();
      // use segment sharpen with empty masks as uniform = texture only
      const dummy={skin:new Uint8Array(TW*TH), sky:new Uint8Array(TW*TH), texture:new Uint8Array(TW*TH).fill(80), shadow:new Uint8Array(TW*TH), highlight:new Uint8Array(TW*TH)};
      applyPerSegmentSharpen(outCtx, TW, TH, dummy, base);
    }
    return { canvas: outCanvas, masks:null, stats:{} };
  }
}

function awaitImportCheck(){ return {}; }

if(typeof window!=='undefined') window.PixelPerfectProduction={ produceHighQuality };
