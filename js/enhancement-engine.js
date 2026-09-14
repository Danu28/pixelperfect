/**
 * PixelPerfect Enhancement Engine — single consolidated engine
 * Merges: hq-resize + enhance + segment + optimizer + production
 * Raw → HQ pipeline: pyramid (gamma-correct) + segment + per-segment color/sharpen
 */

// ── PRESETS ──
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

// ── HQ RESIZE (gamma + denoise + cover crop) ──
export function computeCoverCrop(sw, sh, TW, TH){
  const scale=Math.max(TW/sw, TH/sh);
  let srcW=TW/scale, srcH=TH/scale;
  let sx=(sw-srcW)/2, sy=(sh-srcH)/2;
  sx=Math.max(0,Math.min(sw-srcW,sx)); sy=Math.max(0,Math.min(sh-srcH,sy));
  srcW=Math.min(sw-sx,srcW); srcH=Math.min(sh-sy,srcH);
  return {sx,sy,srcW,srcH,scale};
}
function toLinear(c){ c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); }
function toSrgb(l){ return l<=0.0031308?12.92*l:1.055*Math.pow(l,1/2.4)-0.055; }
export function gammaToLinear(ctx,w,h){
  const d=ctx.getImageData(0,0,w,h);
  for(let i=0;i<d.data.length;i+=4){ d.data[i]=toLinear(d.data[i])*255; d.data[i+1]=toLinear(d.data[i+1])*255; d.data[i+2]=toLinear(d.data[i+2])*255; }
  ctx.putImageData(d,0,0);
}
export function linearToGamma(ctx,w,h){
  const d=ctx.getImageData(0,0,w,h);
  for(let i=0;i<d.data.length;i+=4){ d.data[i]=toSrgb(d.data[i]/255)*255; d.data[i+1]=toSrgb(d.data[i+1]/255)*255; d.data[i+2]=toSrgb(d.data[i+2]/255)*255; }
  ctx.putImageData(d,0,0);
}
export function rawDenoise(ctx,w,h,strength=0.35){
  if(strength<=0) return;
  const img=ctx.getImageData(0,0,w,h); const d=img.data; const copy=new Uint8ClampedArray(d);
  const mix=strength;
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const i=(y*w+x)*4;
    const lum=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114);
    let sumL=0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const j=((y+dy)*w+(x+dx))*4; sumL+=copy[j]*0.299+copy[j+1]*0.587+copy[j+2]*0.114; }
    const avgL=sumL/9; const newL=lum*(1-mix*0.6)+avgL*(mix*0.6); const ratio=newL/(lum||1);
    for(let c=0;c<3;c++){ const v=d[i+c]*ratio; d[i+c]=v<0?0:v>255?255:v; }
  }
  ctx.putImageData(img,0,0);
}
export function hqResize(srcCanvas,TW,TH,outCanvas,isRaw=false){
  let curCanvas=srcCanvas, curW=curCanvas.width, curH=curCanvas.height;
  let curCtx=curCanvas.getContext('2d',{willReadFrequently:true});
  if(isRaw && (curW>2000||curH>2000)){
    // Skip denoise for chart-like high-contrast B/W (would erase 1px checker)
    let isChart=false;
    try{
      const s=curCtx.getImageData(0,0,Math.min(200,curW),Math.min(200,curH)).data;
      let bw=0; for(let i=0;i<s.length;i+=4) if((s[i]===0&&s[i+1]===0&&s[i+2]===0)||(s[i]===255&&s[i+1]===255&&s[i+2]===255)) bw++;
      isChart=(bw/(s.length/4)>0.10);
    }catch(e){}
    if(!isChart){ gammaToLinear(curCtx,curW,curH); rawDenoise(curCtx,curW,curH,0.18); linearToGamma(curCtx,curW,curH); }
    else { rawDenoise(curCtx,curW,curH,0.06); }
  }
  const thresh=isRaw?1.45:2.6;
  while(curW>TW*thresh||curH>TH*thresh){
    const nextW=Math.max(TW,Math.round(curW*0.5)), nextH=Math.max(TH,Math.round(curH*0.5));
    if(nextW<TW||nextH<TH) break;
    const tmp=document.createElement('canvas'); tmp.width=nextW; tmp.height=nextH;
    const tctx=tmp.getContext('2d',{willReadFrequently:true}); tctx.imageSmoothingEnabled=true; tctx.imageSmoothingQuality='high';
    tctx.drawImage(curCanvas,0,0,curW,curH,0,0,nextW,nextH);
    curCanvas=tmp; curCtx=tctx; curW=nextW; curH=nextH;
    if(curW<=TW&&curH<=TH) break;
  }
  if((TW/curW>3||TH/curH>3)&&(curW*2<TW||curH*2<TH)){
    let steps=Math.ceil(Math.log2(Math.max(TW/curW,TH/curH))); steps=Math.min(steps,3);
    for(let i=0;i<steps;i++){
      const isLast=i===steps-1;
      const interW=isLast?TW:Math.round(curW*Math.pow(TW/curW,(i+1)/steps));
      const interH=isLast?TH:Math.round(curH*Math.pow(TH/curH,(i+1)/steps));
      if(interW===curW&&interH===curH) continue;
      const tmp=document.createElement('canvas'); tmp.width=interW; tmp.height=interH;
      const tctx=tmp.getContext('2d',{willReadFrequently:true}); tctx.imageSmoothingEnabled=true; tctx.imageSmoothingQuality='high';
      tctx.drawImage(curCanvas,0,0,curW,curH,0,0,interW,interH);
      curCanvas=tmp; curCtx=tctx; curW=interW; curH=interH;
    }
  }
  outCanvas.width=TW; outCanvas.height=TH;
  const outCtx=outCanvas.getContext('2d',{willReadFrequently:true});
  outCtx.imageSmoothingEnabled=true; outCtx.imageSmoothingQuality='high';
  outCtx.fillStyle='#ffffff'; outCtx.fillRect(0,0,TW,TH);
  if(isRaw&&(curW/TW>1.3||curH/TH>1.3)){
    const tmpL=document.createElement('canvas'); tmpL.width=curW; tmpL.height=curH;
    const tL=tmpL.getContext('2d',{willReadFrequently:true}); tL.drawImage(curCanvas,0,0);
    gammaToLinear(tL,curW,curH);
    outCtx.drawImage(tmpL,0,0,curW,curH,0,0,TW,TH);
    linearToGamma(outCtx,TW,TH);
  } else outCtx.drawImage(curCanvas,0,0,curW,curH,0,0,TW,TH);
  return outCanvas;
}

// ── ENHANCE ──
export function analyzeImage(ctx,w,h){
  const d=ctx.getImageData(0,0,w,h).data;
  let sumL=0,rSum=0,gSum=0,bSum=0,clipHi=0,clipLo=0; const total=w*h;
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2]; const L=0.299*r+0.587*g+0.114*b;
    sumL+=L; rSum+=r; gSum+=g; bSum+=b;
    if(L>245) clipHi++; if(L<15) clipLo++;
  }
  const avgL=sumL/total, avgR=rSum/total, avgG=gSum/total, avgB=bSum/total;
  return {avgL,avgR,avgG,avgB,castR:avgR-avgG,castB:avgB-avgG,clipHiRatio:clipHi/total,clipLoRatio:clipLo/total};
}
export function autoEnhanceParams(ctx,w,h){
  const a=analyzeImage(ctx,w,h); const p={};
  const target=148; const bDiff=target-a.avgL;
  p.brightness=Math.max(-8,Math.min(10,Math.round(bDiff*0.30+2)));
  p.contrast=8;
  p.highlights=a.clipHiRatio>0.01?-18:(a.clipHiRatio>0.005?-12:-6);
  p.shadows=a.clipLoRatio>0.015?18:(a.clipLoRatio>0.008?14:10);
  const rawWarm=(-a.castR*0.08+a.castB*0.06);
  p.warmth=Math.max(-4,Math.min(8,Math.round(rawWarm+4)));
  p.vibrance=18; p.saturation=0; return p;
}
export function applyEnhance(ctx,w,h,opts={}){
  const {brightness=0,contrast=0,highlights=0,shadows=0,warmth=0,vibrance=0,saturation=0}=opts;
  if(!brightness&&!contrast&&!highlights&&!shadows&&!warmth&&!vibrance&&!saturation) return;
  const imgData=ctx.getImageData(0,0,w,h); const d=imgData.data;
  const contrastFactor=1+contrast/100; const bAdd=brightness*1.1;
  const hl=highlights/100, sh=shadows/100, warmR=warmth*1.1, warmB=-warmth*0.9, vib=vibrance/100, sat=saturation/100;
  for(let i=0;i<d.length;i+=4){
    let r=d[i],g=d[i+1],b=d[i+2];
    r+=bAdd; g+=bAdd; b+=bAdd;
    r=128+(r-128)*contrastFactor; g=128+(g-128)*contrastFactor; b=128+(b-128)*contrastFactor;
    const L=0.299*r+0.587*g+0.114*b;
    if(hl!==0&&L>140){ const t=Math.min(1,(L-140)/115); const f=hl<0?(1+hl*t*0.55):(1+hl*t*0.35); r*=f; g*=f; b*=f; }
    if(sh!==0&&L<90){ const t=Math.min(1,(90-L)/90); const f=sh>0?(1+sh*t*0.65):(1+sh*t*0.45); r*=f; g*=f; b*=f; }
    r+=warmR*(1-Math.abs(r-128)/128*0.3); b+=warmB*(1-Math.abs(b-128)/128*0.3);
    if(vib!==0||sat!==0){
      const avg=(r+g+b)/3, max=Math.max(r,g,b), min=Math.min(r,g,b);
      const satNorm=max===0?0:(max-min)/max; const vibAmt=vib*(1-satNorm)*0.9; const totalSat=sat+vibAmt;
      if(totalSat!==0){ const sF=1+totalSat; r=avg+(r-avg)*sF; g=avg+(g-avg)*sF; b=avg+(b-avg)*sF; }
    }
    d[i]=r<0?0:r>255?255:r; d[i+1]=g<0?0:g>255?255:g; d[i+2]=b<0?0:b>255?255:b;
  }
  ctx.putImageData(imgData,0,0);
}

// ── SEGMENT ──
export function createMasks(ctx,w,h){
  const img=ctx.getImageData(0,0,w,h); const d=img.data; const N=w*h;
  const skin=new Uint8Array(N), sky=new Uint8Array(N), foliage=new Uint8Array(N), shadow=new Uint8Array(N), highlight=new Uint8Array(N), texture=new Uint8Array(N);
  const lum=new Uint8Array(N);
  for(let i=0,p=0;i<d.length;i+=4,p++){
    const r=d[i],g=d[i+1],b=d[i+2]; lum[p]=(0.299*r+0.587*g+0.114*b)|0;
    const Cb=(-0.1687*r-0.3313*g+0.5*b+128), Cr=(0.5*r-0.4187*g-0.0813*b+128);
    const isSkin=(r>85&&g>35&&b>20&&(Math.max(r,g,b)-Math.min(r,g,b))>12&&r>g&&r>b&&Cb>77&&Cb<127&&Cr>133&&Cr<173);
    skin[p]=isSkin?255:0;
    const isSky=(b>r+18&&b>g+8&&b>90&&lum[p]>110&&r<180); sky[p]=isSky?220:0;
    const isFoliage=(g>r+10&&g>b+8&&g>50&&lum[p]>40&&lum[p]<190); foliage[p]=isFoliage?180:0;
    if(lum[p]<62) shadow[p]=255-lum[p]*2;
    if(lum[p]>208) highlight[p]=Math.min(255,(lum[p]-208)*4);
  }
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const idx=y*w+x;
    const tl=lum[(y-1)*w+(x-1)], t=lum[(y-1)*w+x], tr=lum[(y-1)*w+(x+1)], l=lum[y*w+(x-1)], r=lum[y*w+(x+1)], bl=lum[(y+1)*w+(x-1)], b=lum[(y+1)*w+x], br=lum[(y+1)*w+(x+1)];
    const gx=-tl-2*l-bl+tr+2*r+br, gy=-tl-2*t-tr+bl+2*b+br; const mag=Math.abs(gx)+Math.abs(gy); let v=Math.min(255,mag*1.8);
    if(skin[idx]>128) v=v*0.35|0; if(sky[idx]>100) v=v*0.25|0; texture[idx]=v>28?Math.min(255,v):0;
  }
  function feather(m){ const out=new Uint8Array(N); for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; out[i]=(m[i-1]+m[i+1]+m[i-w]+m[i+w]+m[i]*4)/8|0; } return out; }
  return {skin:feather(skin), sky:feather(sky), foliage:feather(foliage), shadow:feather(shadow), highlight:feather(highlight), texture:feather(texture), lum};
}
export function applyPerSegmentColor(ctx,w,h,masks){
  const img=ctx.getImageData(0,0,w,h); const d=img.data; const {skin,sky,foliage,shadow,highlight}=masks;
  for(let i=0,p=0;i<d.length;i+=4,p++){
    let r=d[i],g=d[i+1],b=d[i+2];
    const sk=skin[p]/255, skyW=sky[p]/255, fol=foliage[p]/255, shW=shadow[p]/255, hiW=highlight[p]/255;
    if(sk>0.18){ const avg=(r+g+b)/3; const desat=0.12*sk; r=avg*desat+r*(1-desat); g=avg*desat+g*(1-desat); b=avg*desat+b*(1-desat); r+=2.2*sk; g+=0.6*sk; b-=1.0*sk; }
    if(skyW>0.18){ const dehaze=0.08*skyW; r=128+(r-128)*(1+dehaze*0.6); g=128+(g-128)*(1+dehaze*0.6); b=128+(b-128)*(1+dehaze*0.35)+3*skyW; }
    if(fol>0.18){ const vib=0.18*fol; const avg=(r+g+b)/3; g=avg+(g-avg)*(1+vib); r=avg+(r-avg)*(1+vib*0.5); b=avg+(b-avg)*(1+vib*0.5); }
    if(shW>0.15){ const lift=0.22*shW; const L=0.299*r+0.587*g+0.114*b; const t=Math.min(1,(70-L)/70); const f=1+lift*t; r*=f; g*=f; b*=f; }
    if(hiW>0.15){ const rec=0.18*hiW; const L=0.299*r+0.587*g+0.114*b; const t=Math.min(1,(L-195)/60); const f=1-rec*t; r*=f; g*=f; b*=f; }
    d[i]=r<0?0:r>255?255:r; d[i+1]=g<0?0:g>255?255:g; d[i+2]=b<0?0:b>255?255:b;
  }
  ctx.putImageData(img,0,0);
}
export function applyPerSegmentSharpen(ctx,w,h,masks,baseStrength=0.52){
  const img=ctx.getImageData(0,0,w,h); const d=new Uint8Array(img.data); const blurred=new Uint8ClampedArray(img.data);
  for(let y=0;y<h;y++) for(let x=1;x<w-1;x++){ const i=(y*w+x)*4; for(let c=0;c<3;c++) blurred[i+c]=(d[i-4+c]+d[i+c]*2+d[i+4+c])/4; }
  const blurred2=new Uint8ClampedArray(blurred);
  for(let y=1;y<h-1;y++) for(let x=0;x<w;x++){ const i=(y*w+x)*4; for(let c=0;c<3;c++) blurred2[i+c]=(blurred[i-w*4+c]+blurred[i+c]*2+blurred[i+w*4+c])/4; }
  const out=img.data; const {skin,sky,texture,shadow,highlight}=masks;
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const p=y*w+x,i=p*4;
    const sk=skin[p]/255, skyW=sky[p]/255, tex=texture[p]/255, shW=shadow[p]/255, hiW=highlight[p]/255;
    let s=baseStrength; s*=(1-0.55*sk); s*=(1-0.75*skyW); s*=(1+0.48*tex); s*=(1-0.25*shW-0.18*hiW);
    if(s<0.06) continue;
    const diff=Math.abs(d[i]-blurred2[i])+Math.abs(d[i+1]-blurred2[i+1])+Math.abs(d[i+2]-blurred2[i+2]); const edge=Math.min(1,diff/55); const se=s*(0.4+0.6*edge);
    for(let c=0;c<3;c++){ const v=d[i+c]+(d[i+c]-blurred2[i+c])*se*1.85; out[i+c]=v<0?0:v>255?255:v; }
  }
  ctx.putImageData(img,0,0);
}
export function applySkyDenoise(ctx,w,h,masks){
  const sky=masks.sky; const img=ctx.getImageData(0,0,w,h); const d=img.data; const copy=new Uint8ClampedArray(d);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const p=y*w+x, skyW=sky[p]/255; if(skyW<0.25) continue;
    const i=p*4; let r=0,g=0,b=0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const j=((y+dy)*w+(x+dx))*4; r+=copy[j]; g+=copy[j+1]; b+=copy[j+2]; }
    r/=9; g/=9; b/=9; const mix=0.55*skyW; d[i]=d[i]*(1-mix)+r*mix; d[i+1]=d[i+1]*(1-mix)+g*mix; d[i+2]=d[i+2]*(1-mix)+b*mix;
  }
  ctx.putImageData(img,0,0);
}

// ── OPTIMIZER (pyramid wrapper) ──
export function optimizeToCanvas(img,TW,TH,outCanvas,opts={}){
  const {sharpen=true,sharpenStrength=null,enhance=null,autoEnhance=false}=opts;
  const sw=img.naturalWidth||img.width, sh=img.naturalHeight||img.height;
  const isRaw=(sw*sh>15000000)||Math.max(sw,sh)>3800; // only true 15MP+ or 4K+ to avoid synthetic 12MP denoise
  const crop=computeCoverCrop(sw,sh,TW,TH);
  let srcW=crop.srcW, srcH=crop.srcH, sx=crop.sx, sy=crop.sy;
  let curCanvas=document.createElement('canvas'); let curCtx=curCanvas.getContext('2d',{willReadFrequently:true});
  curCanvas.width=Math.round(srcW); curCanvas.height=Math.round(srcH);
  curCtx.imageSmoothingEnabled=true; curCtx.imageSmoothingQuality='high';
  curCtx.drawImage(img,sx,sy,srcW,srcH,0,0,curCanvas.width,curCanvas.height);
  const tmpOut=document.createElement('canvas');
  hqResize(curCanvas,TW,TH,tmpOut,isRaw);
  outCanvas.width=TW; outCanvas.height=TH;
  const outCtx=outCanvas.getContext('2d',{willReadFrequently:true});
  outCtx.drawImage(tmpOut,0,0);
  if(enhance||autoEnhance){
    let enh=enhance;
    if(autoEnhance&&!enh) enh=autoEnhanceParams(outCtx,TW,TH);
    if(enh) applyEnhance(outCtx,TW,TH,enh);
  }
  if(sharpen){
    const downscale=Math.min(srcW/TW,srcH/TH); let strength;
    if(sharpenStrength!==null) strength=sharpenStrength;
    else { if(downscale>3) strength=0.33; else if(downscale>2) strength=0.42; else if(downscale>1.3) strength=0.48; else strength=0.28; }
    if(strength>0.05){
      const imgData=outCtx.getImageData(0,0,TW,TH); const d=new Uint8Array(imgData.data);
      const blurred=new Uint8ClampedArray(imgData.data);
      for(let y=0;y<TH;y++) for(let x=1;x<TW-1;x++){ const i=(y*TW+x)*4; for(let c=0;c<3;c++) blurred[i+c]=(d[i-4+c]+d[i+c]*2+d[i+4+c])/4; }
      const blurred2=new Uint8ClampedArray(blurred);
      for(let y=1;y<TH-1;y++) for(let x=0;x<TW;x++){ const i=(y*TW+x)*4; for(let c=0;c<3;c++) blurred2[i+c]=(blurred[i-TW*4+c]+blurred[i+c]*2+blurred[i+TW*4+c])/4; }
      const out=imgData.data;
      for(let i=0;i<out.length;i+=4){
        const diff=Math.abs(d[i]-blurred2[i])+Math.abs(d[i+1]-blurred2[i+1])+Math.abs(d[i+2]-blurred2[i+2]); const edge=Math.min(1,diff/55); const s=strength*(0.4+0.6*edge);
        for(let c=0;c<3;c++){ const v=d[i+c]+(d[i+c]-blurred2[i+c])*s*1.85; out[i+c]=v<0?0:v>255?255:v; }
      }
      outCtx.putImageData(imgData,0,0);
    }
  }
  return outCanvas;
}

// ── PRODUCTION (segment-aware) ──
export function produceHighQuality(img,TW,TH,outCanvas,opts={}){
  const {sharpen=true,enhance=null,autoEnhance=false,segment=true}=opts;
  const sw=img.naturalWidth||img.width, sh=img.naturalHeight||img.height;
  const isRaw=(sw*sh>15000000)||Math.max(sw,sh)>3800;
  const crop=computeCoverCrop(sw,sh,TW,TH);
  let srcW=crop.srcW, srcH=crop.srcH, sx=crop.sx, sy=crop.sy;
  let curCanvas=document.createElement('canvas'); let curCtx=curCanvas.getContext('2d',{willReadFrequently:true});
  curCanvas.width=Math.round(srcW); curCanvas.height=Math.round(srcH);
  curCtx.imageSmoothingEnabled=true; curCtx.imageSmoothingQuality='high';
  curCtx.drawImage(img,sx,sy,srcW,srcH,0,0,curCanvas.width,curCanvas.height);
  const tmpOut=document.createElement('canvas');
  hqResize(curCanvas,TW,TH,tmpOut,isRaw);
  outCanvas.width=TW; outCanvas.height=TH;
  const outCtx=outCanvas.getContext('2d',{willReadFrequently:true});
  outCtx.drawImage(tmpOut,0,0);
  if(enhance||autoEnhance){
    let enh=enhance; if(autoEnhance&&!enh) enh=autoEnhanceParams(outCtx,TW,TH);
    if(enh) applyEnhance(outCtx,TW,TH,enh);
  }
  if(segment){
    const masks=createMasks(outCtx,TW,TH);
    const skinPx=masks.skin.reduce((a,v)=>a+(v>30),0), skyPx=masks.sky.reduce((a,v)=>a+(v>30),0);
    applyPerSegmentColor(outCtx,TW,TH,masks);
    applySkyDenoise(outCtx,TW,TH,masks);
    if(sharpen){
      const downscale=Math.min(srcW/TW,srcH/TH); let base=0.52; if(downscale>3) base=0.65; else if(downscale>2) base=0.55; else if(downscale>1.3) base=0.62;
      applyPerSegmentSharpen(outCtx,TW,TH,masks,base);
    }
    return {canvas:outCanvas,masks,stats:{skinPct:(skinPx/(TW*TH)*100).toFixed(1),skyPct:(skyPx/(TW*TH)*100).toFixed(1)}};
  } else {
    if(sharpen){
      const downscale=Math.min(srcW/TW,srcH/TH); let base=0.62; if(downscale>3) base=0.65; else if(downscale>2) base=0.55;
      const dummy={skin:new Uint8Array(TW*TH),sky:new Uint8Array(TW*TH),texture:new Uint8Array(TW*TH).fill(80),shadow:new Uint8Array(TW*TH),highlight:new Uint8Array(TW*TH)};
      applyPerSegmentSharpen(outCtx,TW,TH,dummy,base);
    }
    return {canvas:outCanvas,masks:null,stats:{}};
  }
}

if(typeof window!=='undefined'){
  window.PixelPerfectEnhance={applyEnhance,autoEnhanceParams,analyzeImage};
  window.PixelPerfectHQ={computeCoverCrop,hqResize,rawDenoise,gammaToLinear,linearToGamma};
  window.PixelPerfectSegment={createMasks,applyPerSegmentColor,applyPerSegmentSharpen,applySkyDenoise};
  window.PixelPerfectOptimizer={optimizeToCanvas};
  window.PixelPerfectProduction={produceHighQuality};
  window.PixelPerfectEngine={PRESETS,computeCoverCrop,hqResize,analyzeImage,autoEnhanceParams,applyEnhance,createMasks,applyPerSegmentColor,applyPerSegmentSharpen,applySkyDenoise,optimizeToCanvas,produceHighQuality};
}
