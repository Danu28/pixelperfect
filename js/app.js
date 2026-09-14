import { produceHighQuality } from './production-engine.js';
import { optimizeToCanvas } from './optimizer.js';

const PRESETS = {
  instagram: [
    { id: 'post', label: 'Post', sub: 'Square feed', dims: '1080×1080 · 1:1', w:1080, h:1080, hint:'Perfect for feed. Center-cropped to square, no distortion.' },
    { id: 'portrait', label: 'Portrait Post', sub: '4:5 — best reach', dims: '1080×1350 · 4:5', w:1080, h:1350, hint:'Largest feed size. Instagram shows more of this in feed — recommended.' },
    { id: 'story', label: 'Story', sub: 'Full screen', dims: '1080×1920 · 9:16', w:1080, h:1920, hint:'Full-screen vertical. Fill with blurred background if photo is square.' },
    { id: 'reelcover', label: 'Reel Cover', sub: '9:16', dims: '1080×1920 · 9:16', w:1080, h:1920, hint:'Same as Story — optimized for Reel thumbnail.' },
  ],
  whatsapp: [
    { id: 'status', label: 'Status', sub: '9:16', dims: '1080×1920 · 9:16', w:1080, h:1920, hint:'Will be displayed full-screen. High quality, no WhatsApp blur.' },
    { id: 'square', label: 'Square Share', sub: '1:1', dims: '1080×1080 · 1:1', w:1080, h:1080, hint:'For sharing in chats — sharp square.' },
    { id: 'profile', label: 'Profile Photo', sub: 'Circle safe', dims: '640×640 · 1:1', w:640, h:640, hint:'Keep face centered — WhatsApp crops to circle.' },
  ]
};

const els = {
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  browseBtn: document.getElementById('browseBtn'),
  dropContent: document.getElementById('dropContent'),
  filePreview: document.getElementById('filePreview'),
  thumb: document.getElementById('thumb'),
  fileName: document.getElementById('fileName'),
  fileInfo: document.getElementById('fileInfo'),
  removeFile: document.getElementById('removeFile'),
  platforms: [...document.querySelectorAll('.platform-card')],
  formatGrid: document.getElementById('formatGrid'),
  formatHint: document.getElementById('formatHint'),
  quality: document.getElementById('quality'),
  qualityVal: document.getElementById('qualityVal'),
  qualityRow: document.getElementById('qualityRow'),
  sharpen: document.getElementById('sharpen'),
  fmtBtns: [...document.querySelectorAll('.seg-btn')],
  optimizeBtn: document.getElementById('optimizeBtn'),
  errorMsg: document.getElementById('errorMsg'),
  dimBadge: document.getElementById('dimBadge'),
  emptyState: document.getElementById('emptyState'),
  previewWrap: document.getElementById('previewWrap'),
  origImg: document.getElementById('origImg'),
  outImg: document.getElementById('outImg'),
  origMeta: document.getElementById('origMeta'),
  outMeta: document.getElementById('outMeta'),
  downloadBtn: document.getElementById('downloadBtn'),
  newBtn: document.getElementById('newBtn'),
  workCanvas: document.getElementById('workCanvas'),
  pipelineStats: document.getElementById('pipelineStats'),
  statSkin: document.getElementById('statSkin'),
  statSky: document.getElementById('statSky'),
  statTime: document.getElementById('statTime'),
  statMode: document.getElementById('statMode'),
  autoEnhance: document.getElementById('autoEnhance'),
  bright: document.getElementById('bright'),
  contrast: document.getElementById('contrast'),
  highlights: document.getElementById('highlights'),
  shadows: document.getElementById('shadows'),
  warmth: document.getElementById('warmth'),
  vibrance: document.getElementById('vibrance'),
  valBright: document.getElementById('valBright'),
  valContrast: document.getElementById('valContrast'),
  valHighlights: document.getElementById('valHighlights'),
  valShadows: document.getElementById('valShadows'),
  valWarmth: document.getElementById('valWarmth'),
  valVibrance: document.getElementById('valVibrance'),
  resetEnhance: document.getElementById('resetEnhance'),
};

let state = {
  file: null,
  img: null,
  naturalW: 0, naturalH: 0,
  platform: 'instagram',
  formatId: 'post',
  outFmt: 'jpeg',
  quality: 0.92,
  objectUrl: null,
  outBlob: null,
  enhance: { brightness:0, contrast:0, highlights:0, shadows:0, warmth:0, vibrance:0, saturation:0 },
  autoEnhance:false,
};

function getEnhanceOpts(){
  if(state.autoEnhance) return { autoEnhance:true };
  const e=state.enhance;
  const has = Object.values(e).some(v=>v!==0);
  return has ? { enhance: {...e} } : {};
}

function currentPreset(){
  return PRESETS[state.platform].find(p=>p.id===state.formatId) || PRESETS[state.platform][0];
}

function renderFormats(){
  const list = PRESETS[state.platform];
  if(!els.formatGrid) return;
  els.formatGrid.innerHTML = list.map(p=>`
    <button class="format-btn ${p.id===state.formatId?'active':''}" data-id="${p.id}">
      <strong>${p.label}</strong>
      <span>${p.dims}</span><br><em>${p.sub}</em>
    </button>
  `).join('');
  const cur = currentPreset();
  if(els.formatHint) els.formatHint.textContent = cur.hint;
  if(els.dimBadge) els.dimBadge.textContent = `${cur.w} × ${cur.h}`;
  els.formatGrid.querySelectorAll('.format-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.formatId = b.dataset.id;
      renderFormats();
      updateOptimizeState();
    });
  });
}

function updateQualityUI(){
  if(!els.quality) return;
  const v = parseInt(els.quality.value,10);
  state.quality = v/100;
  if(els.qualityVal) els.qualityVal.textContent = v+'%';
}
function updateFmtUI(){
  if(!els.qualityRow) return;
  const show = state.outFmt !== 'png';
  els.qualityRow.style.opacity = show ? '1' : '.4';
  els.qualityRow.style.pointerEvents = show ? 'auto' : 'none';
}

function setError(msg){
  if(!els.errorMsg) return;
  if(!msg){ els.errorMsg.classList.add('hidden'); els.errorMsg.textContent=''; return;}
  els.errorMsg.textContent = msg;
  els.errorMsg.classList.remove('hidden');
}

function updateOptimizeState(){
  if(!els.optimizeBtn) return;
  const ready = !!state.file && !!state.img;
  els.optimizeBtn.disabled = !ready;
  if(ready){
    const p = currentPreset();
    els.optimizeBtn.textContent = `◎ Optimize for ${p.label} (${p.w}×${p.h})`;
  } else {
    els.optimizeBtn.textContent = '◎ Optimize & Download';
  }
}

function handleFile(file){
  setError('');
  if(!file || !file.type.startsWith('image/')){
    setError('Please select an image file (JPG, PNG, WebP).');
    return;
  }
  if(file.size > 20*1024*1024){
    setError('File too large. Max 20MB.');
    return;
  }
  state.file = file;
  const url = URL.createObjectURL(file);
  if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = url;
  if(els.thumb) els.thumb.src = url;
  if(els.fileName) els.fileName.textContent = file.name;
  if(els.fileInfo) els.fileInfo.textContent = `${(file.size/1024).toFixed(0)} KB · ${file.type}`;
  if(els.dropContent) els.dropContent.classList.add('hidden');
  if(els.filePreview) els.filePreview.classList.remove('hidden');

  const img = new Image();
  img.onload = ()=>{
    state.img = img;
    state.naturalW = img.naturalWidth;
    state.naturalH = img.naturalHeight;
    if(els.origImg) els.origImg.src = url;
    if(els.origMeta) els.origMeta.textContent = `Original · ${state.naturalW}×${state.naturalH}`;
    updateOptimizeState();
  };
  img.onerror = ()=> setError('Could not load image. Try another file.');
  img.src = url;
}

function clearFile(){
  state.file = null; state.img=null;
  if(els.fileInput) els.fileInput.value='';
  if(els.dropContent) els.dropContent.classList.remove('hidden');
  if(els.filePreview) els.filePreview.classList.add('hidden');
  if(els.emptyState) els.emptyState.classList.remove('hidden');
  if(els.previewWrap) els.previewWrap.classList.add('hidden');
  setError('');
  updateOptimizeState();
}

// Fixed scope: segStats and elapsed and enhOpts captured correctly for async toBlob
function optimize(){
  const p = currentPreset();
  const {w: TW, h: TH} = p;
  const img = state.img;
  const canvas = els.workCanvas;
  if(!img){
    setError('No image loaded');
    return;
  }
  const t0 = performance.now();
  let segStats = null;
  let enhOpts = getEnhanceOpts();
  let elapsed = 0;

  // UI feedback
  if(els.optimizeBtn){
    els.optimizeBtn.disabled = true;
    els.optimizeBtn.textContent = '⏳ Processing...';
  }
  setError('');

  try {
    // Try production engine first (per-segment)
    if(typeof produceHighQuality === 'function'){
      const res = produceHighQuality(img, TW, TH, canvas, { sharpen: els.sharpen.checked, ...enhOpts, segment: true });
      segStats = res && res.stats ? res.stats : null;
      if(segStats) console.log('segment stats', segStats);
    } else if(typeof optimizeToCanvas === 'function'){
      optimizeToCanvas(img, TW, TH, canvas, { sharpen: els.sharpen.checked, ...enhOpts });
    } else {
      // fallback single-step
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      canvas.width=TW; canvas.height=TH;
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      const scale=Math.max(TW/img.naturalWidth, TH/img.naturalHeight);
      const srcW=TW/scale, srcH=TH/scale;
      const sx=(img.naturalWidth-srcW)/2, sy=(img.naturalHeight-srcH)/2;
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,TW,TH);
      ctx.drawImage(img,sx,sy,srcW,srcH,0,0,TW,TH);
    }
  } catch(e){
    console.error(e);
    setError('Optimization error: '+e.message);
    if(els.optimizeBtn){
      els.optimizeBtn.disabled=false;
      els.optimizeBtn.textContent = `◎ Optimize for ${p.label} (${p.w}×${p.h})`;
    }
    return;
  }

  elapsed = Math.round(performance.now()-t0);
  const mime = state.outFmt==='png' ? 'image/png' : state.outFmt==='webp' ? 'image/webp' : 'image/jpeg';
  const quality = state.outFmt==='png' ? undefined : state.quality;

  canvas.toBlob(blob=>{
    // restore button
    if(els.optimizeBtn){
      els.optimizeBtn.disabled=false;
      els.optimizeBtn.textContent = `◎ Optimize for ${p.label} (${p.w}×${p.h})`;
    }
    if(!blob){
      setError('Export failed. Try PNG or another image.');
      return;
    }
    state.outBlob = blob;
    const url = URL.createObjectURL(blob);
    if(els.outImg) els.outImg.src = url;
    const segInfo = segStats ? ` · Skin ${segStats.skinPct}% Sky ${segStats.skyPct}%` : '';
    if(els.outMeta) els.outMeta.textContent = `Optimized · ${TW}×${TH} · ${(blob.size/1024).toFixed(0)} KB · ${state.outFmt.toUpperCase()} · Pyramid+Segment${segInfo} · ${elapsed}ms`;
    if(els.pipelineStats){
      els.pipelineStats.classList.remove('hidden');
      if(els.statSkin) els.statSkin.textContent = segStats ? segStats.skinPct+'%' : '—';
      if(els.statSky) els.statSky.textContent = segStats ? segStats.skyPct+'%' : '—';
      if(els.statTime) els.statTime.textContent = elapsed+'ms';
      if(els.statMode) els.statMode.textContent = enhOpts.autoEnhance ? 'Auto' : (Object.keys(enhOpts.enhance||{}).length?'Manual':'HQ');
    }
    if(els.emptyState) els.emptyState.classList.add('hidden');
    if(els.previewWrap) els.previewWrap.classList.remove('hidden');
    if(els.previewWrap) els.previewWrap.scrollIntoView({behavior:'smooth', block:'nearest'});
    const ext = state.outFmt==='jpeg' ? 'jpg' : state.outFmt;
    const base = state.file ? state.file.name.replace(/\.[^.]+$/,'') : 'image';
    if(els.downloadBtn){
      els.downloadBtn.href = url;
      els.downloadBtn.download = `${base}-${state.platform}-${state.formatId}-${TW}x${TH}.${ext}`;
    }
  }, mime, quality);
}

// events — guard for missing elements
if(els.browseBtn) els.browseBtn.addEventListener('click', ()=> els.fileInput && els.fileInput.click());
if(els.fileInput) els.fileInput.addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
if(els.removeFile) els.removeFile.addEventListener('click', (e)=>{ e.stopPropagation(); clearFile(); });
if(els.dropZone){
  els.dropZone.addEventListener('click', (e)=>{
    if(e.target.closest('#removeFile')||e.target.closest('#browseBtn')) return;
    if(!state.file && els.fileInput) els.fileInput.click();
  });
  ['dragenter','dragover'].forEach(ev=> els.dropZone.addEventListener(ev, e=>{ e.preventDefault(); els.dropZone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev=> els.dropZone.addEventListener(ev, e=>{ e.preventDefault(); els.dropZone.classList.remove('drag'); }));
  els.dropZone.addEventListener('drop', e=>{
    e.preventDefault();
    els.dropZone.classList.remove('drag');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) handleFile(f);
  });
}
if(els.platforms) els.platforms.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    els.platforms.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.platform = btn.dataset.platform;
    state.formatId = PRESETS[state.platform][0].id;
    renderFormats();
    updateOptimizeState();
  });
});
if(els.fmtBtns) els.fmtBtns.forEach(b=> b.addEventListener('click', ()=>{
  els.fmtBtns.forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  state.outFmt = b.dataset.fmt;
  updateFmtUI();
  if(state.outBlob && state.img) optimize();
}));
if(els.quality) els.quality.addEventListener('input', ()=>{
  updateQualityUI();
  if(state.outBlob && state.img && state.outFmt!=='png') optimize();
});
if(els.optimizeBtn) els.optimizeBtn.addEventListener('click', optimize);
if(els.newBtn) els.newBtn.addEventListener('click', clearFile);

// Enhance wiring
function syncEnhanceUI(){
  if(!els.valBright) return;
  els.valBright.textContent=state.enhance.brightness;
  els.valContrast.textContent=state.enhance.contrast;
  els.valHighlights.textContent=state.enhance.highlights;
  els.valShadows.textContent=state.enhance.shadows;
  els.valWarmth.textContent=state.enhance.warmth;
  els.valVibrance.textContent=state.enhance.vibrance;
  const disabled = state.autoEnhance;
  [els.bright, els.contrast, els.highlights, els.shadows, els.warmth, els.vibrance].forEach(el=>{
    if(!el) return;
    el.disabled=disabled;
    if(el.parentElement) el.parentElement.style.opacity=disabled?'0.45':'1';
  });
}
function onEnhanceChange(){
  if(!els.bright) return;
  state.enhance.brightness=parseInt(els.bright.value,10)||0;
  state.enhance.contrast=parseInt(els.contrast.value,10)||0;
  state.enhance.highlights=parseInt(els.highlights.value,10)||0;
  state.enhance.shadows=parseInt(els.shadows.value,10)||0;
  state.enhance.warmth=parseInt(els.warmth.value,10)||0;
  state.enhance.vibrance=parseInt(els.vibrance.value,10)||0;
  syncEnhanceUI();
  if(state.outBlob && state.img) optimize();
}
[els.bright, els.contrast, els.highlights, els.shadows, els.warmth, els.vibrance].forEach(el=> el && el.addEventListener('input', onEnhanceChange));
if(els.autoEnhance) els.autoEnhance.addEventListener('change', ()=>{
  state.autoEnhance=els.autoEnhance.checked;
  syncEnhanceUI();
  if(state.outBlob && state.img) optimize();
});
if(els.resetEnhance) els.resetEnhance.addEventListener('click', ()=>{
  state.enhance={brightness:0,contrast:0,highlights:0,shadows:0,warmth:0,vibrance:0,saturation:0};
  state.autoEnhance=false;
  if(els.autoEnhance) els.autoEnhance.checked=false;
  if(els.bright) els.bright.value=0;
  if(els.contrast) els.contrast.value=0;
  if(els.highlights) els.highlights.value=0;
  if(els.shadows) els.shadows.value=0;
  if(els.warmth) els.warmth.value=0;
  if(els.vibrance) els.vibrance.value=0;
  syncEnhanceUI();
  if(state.outBlob && state.img) optimize();
});
syncEnhanceUI();

// paste support
document.addEventListener('paste', e=>{
  const item = [...(e.clipboardData.items||[])].find(i=>i.type.startsWith('image/'));
  if(item){ handleFile(item.getAsFile()); }
});

// init
try{
  renderFormats();
  updateQualityUI();
  updateFmtUI();
  updateOptimizeState();
  console.log('PixelPerfect ready — production engine loaded');
}catch(e){ console.error('init failed', e); }
