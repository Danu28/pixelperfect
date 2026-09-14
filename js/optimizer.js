/**
 * PixelPerfect HQ Engine v2 — Anti-pixelation algorithm
 * Problem: single drawImage with imageSmoothingQuality='high' still pixelates
 * when scaling >2x (browser does naive single-step filter -> aliasing & blur).
 * Solution: pyramid halving + final bicubic + adaptive sharpen.
 */

export const PRESETS = {
  instagram: [
    { id: 'post', w:1080, h:1080 },
    { id: 'portrait', w:1080, h:1350 },
    { id: 'story', w:1080, h:1920 },
    { id: 'reelcover', w:1080, h:1920 },
  ],
  whatsapp: [
    { id: 'status', w:1080, h:1920 },
    { id: 'square', w:1080, h:1080 },
    { id: 'profile', w:640, h:640 },
  ]
};

/**
 * High-quality cover optimization.
 * @param {CanvasImageSource} img - loaded HTMLImageElement / ImageBitmap / canvas
 * @param {number} TW - target width
 * @param {number} TH - target height
 * @param {HTMLCanvasElement} outCanvas - canvas to render to (will be resized)
 * @param {Object} opts
 * @param {boolean} opts.sharpen - apply sharpen
 * @param {number} opts.sharpenStrength - 0..1 (auto if null)
 */
export function optimizeToCanvas(img, TW, TH, outCanvas, opts = {}) {
  const { sharpen = true, sharpenStrength = null, enhance=null, autoEnhance=false } = opts;
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;

  // 1. Compute cover crop rect (center)
  const scale = Math.max(TW / sw, TH / sh);
  let srcW = TW / scale;
  let srcH = TH / scale;
  let sx = (sw - srcW) / 2;
  let sy = (sh - srcH) / 2;

  // clamp
  sx = Math.max(0, sx); sy = Math.max(0, sy);
  srcW = Math.min(sw - sx, srcW);
  srcH = Math.min(sh - sy, srcH);

  // 2. Extract crop to temp canvas at native crop size first
  // This isolates the region and allows pyramid steps without re-sampling background.
  let curCanvas = document.createElement('canvas');
  let curCtx = curCanvas.getContext('2d', { willReadFrequently: true });
  curCanvas.width = Math.round(srcW);
  curCanvas.height = Math.round(srcH);
  curCtx.imageSmoothingEnabled = true;
  curCtx.imageSmoothingQuality = 'high';
  // draw crop at 1:1
  curCtx.drawImage(img, sx, sy, srcW, srcH, 0, 0, curCanvas.width, curCanvas.height);

  let curW = curCanvas.width;
  let curH = curCanvas.height;

  // 3. Pyramid downscale: halve repeatedly until within 1.8x of target
  // Keep 1.8 for moderate 1.5x (My-Pic) to avoid extra blur from halve+upscale; only aggressive >1.8 triggers pyramid
  while (curW > TW * 1.8 || curH > TH * 1.8) {
    const nextW = Math.max(TW, Math.round(curW * 0.5));
    const nextH = Math.max(TH, Math.round(curH * 0.5));
    // If next step is still > target, halve; otherwise break to final
    if (nextW < TW || nextH < TH) break;
    // Don't overshoot: if halving would go below target by >10%, do direct
    const tmp = document.createElement('canvas');
    tmp.width = nextW; tmp.height = nextH;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
    curCanvas = tmp;
    curCtx = tctx;
    curW = nextW; curH = nextH;
    // safety: prevent infinite
    if (curW <= TW && curH <= TH) break;
  }

  // 4. Handle upscaling smoothly: step progressively if >2x upscale
  // Upscaling: single high-quality step is actually best for sharpness (browser bicubic)
  // Only use stepwise if upscale >3x to avoid blockiness, else do direct final draw
  if ((TW/curW > 3 || TH/curH > 3) && (curW * 2 < TW || curH * 2 < TH)) {
    let steps = Math.ceil(Math.log2(Math.max(TW/curW, TH/curH)));
    steps = Math.min(steps, 3);
    for (let i = 0; i < steps; i++) {
      const isLast = i === steps - 1;
      const interW = isLast ? TW : Math.round(curW * Math.pow(TW/curW, (i+1)/steps));
      const interH = isLast ? TH : Math.round(curH * Math.pow(TH/curH, (i+1)/steps));
      if (interW === curW && interH === curH) continue;
      const tmp = document.createElement('canvas');
      tmp.width = interW; tmp.height = interH;
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, interW, interH);
      curCanvas = tmp; curCtx = tctx;
      curW = interW; curH = interH;
    }
  }

  // 5. Final draw to output canvas at exact dimensions (bicubic)
  outCanvas.width = TW; outCanvas.height = TH;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  // white matte for JPEG (avoid black transparent edges)
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0,0,TW,TH);
  outCtx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, TW, TH);

  // 5.5 Enhance: color correction, brightness, highlights/shadows (before sharpen)
  if(enhance || autoEnhance){
    try{
      let enh = enhance;
      // resolve enhance module (browser: window, node: dynamic import fallback)
      const getEnhance = ()=> (typeof window!=='undefined' && window.PixelPerfectEnhance) ? window.PixelPerfectEnhance : null;
      let mod = getEnhance();
      if(autoEnhance && !enh){
        if(!mod){
          // node fallback: try import
          // will be handled externally, keep mild defaults
          enh = { brightness:4, contrast:6, highlights:-10, shadows:12, warmth:2, vibrance:10 };
        } else {
          enh = mod.autoEnhanceParams(outCtx, TW, TH);
        }
      }
      if(enh && mod){
        mod.applyEnhance(outCtx, TW, TH, enh);
      } else if(enh){
        // fallback inline minimal enhance if module not loaded (brightness/contrast only)
        // handled by enhance.js when loaded, so skip
      }
    }catch(e){ console.warn('enhance failed', e); }
  }

  // 6. Adaptive sharpen: strength depends on scale factor
  if (sharpen) {
    const downscale = Math.min(srcW / TW, srcH / TH); // >1 means we downscaled
    const upscale = Math.max(TW / srcW, TH / srcH); // >1 means upscaled
    let strength;
    if (sharpenStrength !== null) {
      strength = sharpenStrength;
    } else {
      // My-Pic tuned: slightly stronger for 1.5x portrait to preserve hair/fabric
      if (downscale > 3) strength = 0.65;
      else if (downscale > 2) strength = 0.55;
      else if (downscale > 1.3) strength = 0.62;
      else if (upscale > 2) strength = 0.38;
      else strength = 0.35;
    }
    if (strength > 0.05) applyAdaptiveSharpen(outCtx, TW, TH, strength);
  }

  return outCanvas;
}

function applyAdaptiveSharpen(ctx, w, h, strength) {
  // Edge-aware unsharp: blur copy then mix, only where edge present to avoid noise amplification
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  // create blurred version via 3x3 box blur quickly
  const blurred = new Uint8ClampedArray(data);
  // horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        blurred[i + c] = (data[i - 4 + c] + data[i + c] * 2 + data[i + 4 + c]) / 4;
      }
    }
  }
  // vertical pass on blurred
  const blurred2 = new Uint8ClampedArray(blurred);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        blurred2[i + c] = (blurred[i - w * 4 + c] + blurred[i + c] * 2 + blurred[i + w * 4 + c]) / 4;
      }
    }
  }
  // unsharp: original + (original - blurred)*strength, edge mask
  for (let i = 0; i < data.length; i += 4) {
    // edge detection via difference
    const diff = Math.abs(data[i] - blurred2[i]) + Math.abs(data[i+1]-blurred2[i+1]) + Math.abs(data[i+2]-blurred2[i+2]);
    const edge = Math.min(1, diff / 55); // more sensitive for fabric/hair detail
    const s = strength * (0.40 + 0.60 * edge); // stronger on edges, gentler on skin flats
    for (let c = 0; c < 3; c++) {
      const v = data[i+c] + (data[i+c] - blurred2[i+c]) * s * 1.85;
      data[i+c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// Backwards compat helper for non-module usage (window)
if (typeof window !== 'undefined') {
  window.PixelPerfectOptimizer = { optimizeToCanvas };
}
