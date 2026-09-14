/**
 * PixelPerfect Enhance Engine — color correction, brightness, highlights/shadows, warmth, vibrance
 * Works on ImageData in place, called after resize before sharpen.
 */

export function analyzeImage(ctx, w, h){
  const d = ctx.getImageData(0,0,w,h).data;
  let sumL=0, hist=new Array(256).fill(0), rSum=0,gSum=0,bSum=0;
  let clipHi=0, clipLo=0;
  const total=w*h;
  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    const L=0.299*r+0.587*g+0.114*b;
    sumL+=L;
    hist[Math.round(L)]++;
    rSum+=r; gSum+=g; bSum+=b;
    if(L>245) clipHi++;
    if(L<15) clipLo++;
  }
  const avgL=sumL/total;
  const avgR=rSum/total, avgG=gSum/total, avgB=bSum/total;
  // white balance cast
  const castR=avgR-avgG, castB=avgB-avgG;
  return { avgL, avgR, avgG, avgB, castR, castB, clipHiRatio: clipHi/total, clipLoRatio: clipLo/total, hist };
}

export function autoEnhanceParams(ctx,w,h){
  const a=analyzeImage(ctx,w,h);
  const p={};
  // brightness: bring avg to ~125
  const target=118;
  const bDiff=target - a.avgL;
  p.brightness = Math.max(-12, Math.min(12, Math.round(bDiff*0.35)));
  // contrast: slight if low variance
  p.contrast = 6;
  // highlights: recover if clipped
  p.highlights = a.clipHiRatio>0.02 ? -18 : -6;
  // shadows: lift if crushed
  p.shadows = a.clipLoRatio>0.03 ? 18 : 10;
  // warmth: neutralize cast slightly (strength 0.4)
  p.warmth = Math.max(-8, Math.min(8, Math.round((-a.castR*0.18 + a.castB*0.12))));
  // vibrance: subtle boost
  p.vibrance = 12;
  p.saturation = 0;
  return p;
}

/**
 * Apply enhance in place
 * opts: {brightness -30..30, contrast -30..30, highlights -50..50, shadows -50..50, warmth -30..30, vibrance -50..50, saturation -50..50}
 */
export function applyEnhance(ctx, w, h, opts={}){
  const {
    brightness=0, contrast=0,
    highlights=0, shadows=0,
    warmth=0, vibrance=0, saturation=0
  } = opts;

  if(!brightness && !contrast && !highlights && !shadows && !warmth && !vibrance && !saturation) return;

  const imgData=ctx.getImageData(0,0,w,h);
  const d=imgData.data;

  // precompute contrast factor, brightness add
  const cFactor = (259 * (contrast + 259)) / (259 * (259 - contrast)); // classic, contrast -30..30 maps to -30..30
  // Actually our contrast is -30..30, map to -30..30 directly use formula with 259
  // For simplicity: contrast -30..30 => factor 0.7..1.3
  const contrastFactor = 1 + contrast/100; // -0.3..0.3 => 0.7..1.3
  const bAdd = brightness * 1.1; // brightness -30..30 => -33..33

  // highlight/shadow curves: amount -50..50
  // Highlights: negative darkens bright (>180) to recover, positive brightens
  // Shadows: positive lightens dark (<80), negative darkens
  const hl = highlights/100; // -0.5..0.5
  const sh = shadows/100;

  // warmth: -30 cool (add blue), +30 warm (add red)
  const warmR = warmth * 1.1;
  const warmB = -warmth * 0.9;

  const vib = vibrance/100;
  const sat = saturation/100;

  for(let i=0;i<d.length;i+=4){
    let r=d[i], g=d[i+1], b=d[i+2];

    // 1. brightness
    r+=bAdd; g+=bAdd; b+=bAdd;

    // 2. contrast around 128
    r = 128 + (r-128)*contrastFactor;
    g = 128 + (g-128)*contrastFactor;
    b = 128 + (b-128)*contrastFactor;

    // 3. highlights / shadows via luminance masking
    const L = 0.299*r+0.587*g+0.114*b;
    // highlights: affect L > 140
    if(hl!==0 && L>140){
      const t = Math.min(1, (L-140)/115); // 0..1 in highlights
      // hl negative => darken: multiply down
      // hl positive => lighten
      const hlFactor = hl < 0 ? (1 + hl * t * 0.55) : (1 + hl * t * 0.35);
      r *= hlFactor; g *= hlFactor; b *= hlFactor;
    }
    // shadows: affect L < 90
    if(sh!==0 && L<90){
      const t = Math.min(1, (90-L)/90);
      const shFactor = sh > 0 ? (1 + sh * t * 0.65) : (1 + sh * t * 0.45);
      r *= shFactor; g *= shFactor; b *= shFactor;
    }

    // 4. warmth
    r += warmR * (1 - Math.abs(r-128)/128 * 0.3); // slightly less on extremes
    b += warmB * (1 - Math.abs(b-128)/128 * 0.3);

    // 5. vibrance & saturation
    // saturation uniform
    // vibrance: boost muted colors more
    if(vib!==0 || sat!==0){
      const avg = (r+g+b)/3;
      const max = Math.max(r,g,b), min = Math.min(r,g,b);
      const satNorm = max===0?0:(max-min)/max; // 0 grey ...1 saturated
      // vibrance amount inversely proportional to satNorm
      const vibAmt = vib * (1 - satNorm) * 0.9;
      const totalSat = sat + vibAmt;
      // lerp to avg
      if(totalSat!==0){
        const sF = 1 + totalSat;
        r = avg + (r - avg) * sF;
        g = avg + (g - avg) * sF;
        b = avg + (b - avg) * sF;
      }
    }

    d[i]= r<0?0:r>255?255:r;
    d[i+1]= g<0?0:g>255?255:g;
    d[i+2]= b<0?0:b>255?255:b;
  }
  ctx.putImageData(imgData,0,0);
}

if(typeof window!=='undefined'){
  window.PixelPerfectEnhance={ applyEnhance, autoEnhanceParams, analyzeImage };
}
