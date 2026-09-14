/**
 * Production Engine — raw → high quality product pipeline
 * Orchestrates: pyramid resize → segmentation → per-segment enhance → per-segment sharpen → sky denoise → export
 * High-quality product for Instagram / WhatsApp with segment-aware processing
 */

import { applyEnhance, autoEnhanceParams } from './enhance.js';
import { createMasks, applyPerSegmentColor, applyPerSegmentSharpen, applySkyDenoise } from './segment-engine.js';

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
  const scale=Math.max(TW/sw, TH/sh);
  let srcW=TW/scale, srcH=TH/scale;
  let sx=(sw-srcW)/2, sy=(sh-srcH)/2;
  sx=Math.max(0,sx); sy=Math.max(0,sy);
  srcW=Math.min(sw-sx, srcW); srcH=Math.min(sh-sy, srcH);

  let curCanvas=document.createElement('canvas');
  let curCtx=curCanvas.getContext('2d',{willReadFrequently:true});
  curCanvas.width=Math.round(srcW); curCanvas.height=Math.round(srcH);
  curCtx.imageSmoothingEnabled=true; curCtx.imageSmoothingQuality='high';
  curCtx.drawImage(img, sx, sy, srcW, srcH, 0,0,curCanvas.width, curCanvas.height);
  let curW=curCanvas.width, curH=curCanvas.height;

  while(curW > TW*1.8 || curH > TH*1.8){
    const nextW=Math.max(TW, Math.round(curW*0.5));
    const nextH=Math.max(TH, Math.round(curH*0.5));
    if(nextW<TW || nextH<TH) break;
    const tmp=document.createElement('canvas'); tmp.width=nextW; tmp.height=nextH;
    const tctx=tmp.getContext('2d',{willReadFrequently:true});
    tctx.imageSmoothingEnabled=true; tctx.imageSmoothingQuality='high';
    tctx.drawImage(curCanvas,0,0,curW,curH,0,0,nextW,nextH);
    curCanvas=tmp; curCtx=tctx; curW=nextW; curH=nextH;
    if(curW<=TW && curH<=TH) break;
  }
  if((TW/curW>3 || TH/curH>3) && (curW*2<TW || curH*2<TH)){
    let steps=Math.ceil(Math.log2(Math.max(TW/curW, TH/curH))); steps=Math.min(steps,3);
    for(let i=0;i<steps;i++){
      const isLast=i===steps-1;
      const interW=isLast?TW:Math.round(curW*Math.pow(TW/curW,(i+1)/steps));
      const interH=isLast?TH:Math.round(curH*Math.pow(TH/curH,(i+1)/steps));
      if(interW===curW && interH===curH) continue;
      const tmp=document.createElement('canvas'); tmp.width=interW; tmp.height=interH;
      const tctx=tmp.getContext('2d',{willReadFrequently:true});
      tctx.imageSmoothingEnabled=true; tctx.imageSmoothingQuality='high';
      tctx.drawImage(curCanvas,0,0,curW,curH,0,0,interW,interH);
      curCanvas=tmp; curCtx=tctx; curW=interW; curH=interH;
    }
  }

  outCanvas.width=TW; outCanvas.height=TH;
  const outCtx=outCanvas.getContext('2d',{willReadFrequently:true});
  outCtx.imageSmoothingEnabled=true; outCtx.imageSmoothingQuality='high';
  outCtx.fillStyle='#ffffff'; outCtx.fillRect(0,0,TW,TH);
  outCtx.drawImage(curCanvas,0,0,curW,curH,0,0,TW,TH);

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
