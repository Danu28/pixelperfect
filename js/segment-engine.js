/**
 * Segment Engine — per-region detection for raw→HQ production
 * Heuristic masks (no ML model) — fast, runs in Canvas
 * Segments: skin/face, hair-fabric-texture, sky, foliage, shadow, highlight
 */

export function createMasks(ctx, w, h){
  const img = ctx.getImageData(0,0,w,h);
  const d = img.data;
  const N = w*h;
  const skin = new Uint8Array(N);
  const sky = new Uint8Array(N);
  const foliage = new Uint8Array(N);
  const shadow = new Uint8Array(N);
  const highlight = new Uint8Array(N);
  const texture = new Uint8Array(N);

  // Precompute luminance for texture variance
  const lum = new Uint8Array(N);
  for(let i=0, p=0;i<d.length;i+=4, p++){
    const r=d[i], g=d[i+1], b=d[i+2];
    lum[p]= (0.299*r+0.587*g+0.114*b)|0;
    // skin YCbCr
    const Cb = (-0.1687*r -0.3313*g +0.5*b +128);
    const Cr = (0.5*r -0.4187*g -0.0813*b +128);
    const isSkin = (r>85 && g>35 && b>20 && (Math.max(r,g,b)-Math.min(r,g,b))>12 && r>g && r>b && Cb>77 && Cb<127 && Cr>133 && Cr<173);
    skin[p]= isSkin ? 255 : 0;

    // sky: blue dominant, bright, low red
    const isSky = (b > r+18 && b > g+8 && b>90 && lum[p]>110 && r<180);
    sky[p]= isSky ? 220 : 0;

    // foliage: green dominant
    const isFoliage = (g > r+10 && g > b+8 && g>50 && lum[p]>40 && lum[p]<190);
    foliage[p]= isFoliage ? 180 : 0;

    // shadow / highlight
    if(lum[p]<62) shadow[p]= 255 - lum[p]*2;
    if(lum[p]>208) highlight[p]= Math.min(255, (lum[p]-208)*4);
  }

  // texture: local variance via 3x3 Sobel magnitude on lum
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const idx=y*w+x;
      // Sobel
      const tl=lum[(y-1)*w+(x-1)], t=lum[(y-1)*w+x], tr=lum[(y-1)*w+(x+1)];
      const l=lum[y*w+(x-1)], r=lum[y*w+(x+1)];
      const bl=lum[(y+1)*w+(x-1)], b=lum[(y+1)*w+x], br=lum[(y+1)*w+(x+1)];
      const gx = -tl -2*l -bl + tr +2*r + br;
      const gy = -tl -2*t -tr + bl +2*b + br;
      const mag = Math.abs(gx)+Math.abs(gy);
      // texture where edges present but not sky
      let v = Math.min(255, mag*1.8);
      // suppress texture on skin slightly (skin should be smooth)
      if(skin[idx]>128) v = v*0.35|0;
      if(sky[idx]>100) v = v*0.25|0;
      texture[idx]= v>28 ? Math.min(255, v) : 0;
    }
  }

  // feather masks with 3x3 blur for seamless blend
  function feather(mask){
    const out=new Uint8Array(N);
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
      const i=y*w+x;
      out[i]= (mask[i-1]+mask[i+1]+mask[i-w]+mask[i+w]+mask[i]*4)/8 |0;
    }
    return out;
  }
  return {
    skin: feather(skin),
    sky: feather(sky),
    foliage: feather(foliage),
    shadow: feather(shadow),
    highlight: feather(highlight),
    texture: feather(texture),
    lum
  };
}

export function applyPerSegmentColor(ctx, w, h, masks, baseOpts={}){
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const {skin, sky, foliage, shadow, highlight} = masks;
  for(let i=0,p=0;i<d.length;i+=4,p++){
    let r=d[i], g=d[i+1], b=d[i+2];
    const sk=skin[p]/255, skI=1-sk;
    const skyW=sky[p]/255, fol=foliage[p]/255;
    const shW=shadow[p]/255, hiW=highlight[p]/255;

    // 1. Skin: preserve tone — reduce vibrance, slight warmth, no highlight crush
    // We will handle skin later in vibrance stage, here just subtle
    if(sk>0.18){
      // desaturate skin slightly to avoid orange, add tiny warmth
      // blend towards warm skin tone
      const avg=(r+g+b)/3;
      // reduce saturation for skin by 12% proportional to skin weight
      const desat=0.12*sk;
      r = avg*(desat) + r*(1-desat);
      g = avg*(desat) + g*(1-desat);
      b = avg*(desat) + b*(1-desat);
      r += 2.2*sk; g += 0.6*sk; b -= 1.0*sk;
    }

    // 2. Sky: dehaze + boost blue slightly, reduce warmth
    if(skyW>0.18){
      const dehaze=0.08*skyW; // increase contrast for sky
      r = 128 + (r-128)*(1+dehaze*0.6);
      g = 128 + (g-128)*(1+dehaze*0.6);
      b = 128 + (b-128)*(1+dehaze*0.35) + 3*skyW;
      // slight denoise effect via lerp to local mean is done in separate step
    }

    // 3. Foliage: pop greens
    if(fol>0.18){
      const vib = 0.18*fol;
      const avg=(r+g+b)/3;
      // boost green channel more
      g = avg + (g-avg)*(1+vib);
      // also slight saturation
      r = avg + (r-avg)*(1+vib*0.5);
      b = avg + (b-avg)*(1+vib*0.5);
    }

    // 4. Shadows: lift (already in enhance, but per-segment we do extra)
    if(shW>0.15){
      const lift = 0.22*shW;
      const L=0.299*r+0.587*g+0.114*b;
      const t=Math.min(1,(70-L)/70);
      const f=1+ lift*t;
      r*=f; g*=f; b*=f;
    }
    if(hiW>0.15){
      const rec = 0.18*hiW;
      const L=0.299*r+0.587*g+0.114*b;
      const t=Math.min(1,(L-195)/60);
      const f=1 - rec*t;
      r*=f; g*=f; b*=f;
    }

    d[i]=r<0?0:r>255?255:r;
    d[i+1]=g<0?0:g>255?255:g;
    d[i+2]=b<0?0:b>255?255:b;
  }
  ctx.putImageData(img,0,0);
}

export function applyPerSegmentSharpen(ctx, w, h, masks, baseStrength=0.52){
  // Create blurred version once
  const img=ctx.getImageData(0,0,w,h);
  const d=new Uint8Array(img.data); // copy for blur
  const blurred=new Uint8ClampedArray(img.data);
  for(let y=0;y<h;y++) for(let x=1;x<w-1;x++){
    const i=(y*w+x)*4;
    for(let c=0;c<3;c++) blurred[i+c]=(d[i-4+c]+d[i+c]*2+d[i+4+c])/4;
  }
  const blurred2=new Uint8ClampedArray(blurred);
  for(let y=1;y<h-1;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    for(let c=0;c<3;c++) blurred2[i+c]=(blurred[i-w*4+c]+blurred[i+c]*2+blurred[i+w*4+c])/4;
  }
  const out=img.data;
  const {skin, sky, texture, shadow, highlight}=masks;

  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const p=y*w+x, i=p*4;
    const sk=skin[p]/255, skyW=sky[p]/255, tex=texture[p]/255;
    const shW=shadow[p]/255, hiW=highlight[p]/255;

    // per-pixel sharpen strength modulated by segment (tuned: skin 0.45x not 0.32x to keep My-Pic detail)
    let s=baseStrength;
    // skin: reduce sharpen to preserve smooth skin but keep detail (0.45x)
    s *= (1 - 0.55*sk);
    // sky: low sharpen + denoise (0.25x)
    s *= (1 - 0.75*skyW);
    // texture/hair/fabric: boost 1.35x where texture high
    s *= (1 + 0.48*tex);
    // shadows/highlights: slightly less sharpen to avoid noise amplification
    s *= (1 - 0.25*shW - 0.18*hiW);

    if(s<0.06) continue;
    const diff=Math.abs(d[i]-blurred2[i])+Math.abs(d[i+1]-blurred2[i+1])+Math.abs(d[i+2]-blurred2[i+2]);
    const edge=Math.min(1, diff/55);
    const se = s * (0.35 + 0.65*edge);
    for(let c=0;c<3;c++){
      const v=d[i+c] + (d[i+c]-blurred2[i+c])*se*1.85;
      out[i+c]= v<0?0:v>255?255:v;
    }
  }
  ctx.putImageData(img,0,0);
}

export function applySkyDenoise(ctx, w, h, masks){
  // Light denoise for sky to remove banding — 3x3 mean where sky mask high
  const sky=masks.sky;
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const copy=new Uint8ClampedArray(d);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const p=y*w+x, skyW=sky[p]/255;
    if(skyW<0.25) continue;
    const i=p*4;
    let r=0,g=0,b=0, cnt=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const j=((y+dy)*w+(x+dx))*4;
      r+=copy[j]; g+=copy[j+1]; b+=copy[j+2]; cnt++;
    }
    r/=cnt; g/=cnt; b/=cnt;
    const mix=0.55*skyW;
    d[i]= d[i]*(1-mix)+r*mix;
    d[i+1]= d[i+1]*(1-mix)+g*mix;
    d[i+2]= d[i+2]*(1-mix)+b*mix;
  }
  ctx.putImageData(img,0,0);
}

if(typeof window!=='undefined') window.PixelPerfectSegment={ createMasks, applyPerSegmentColor, applyPerSegmentSharpen, applySkyDenoise };
