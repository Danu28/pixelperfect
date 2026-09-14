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
  els.formatGrid.innerHTML = list.map(p=>`
    <button class="format-btn ${p.id===state.formatId?'active':''}" data-id="${p.id}">
      <strong>${p.label}</strong>
      <span>${p.dims}</span><br><em>${p.sub}</em>
    </button>
  `).join('');
  const cur = currentPreset();
  els.formatHint.textContent = cur.hint;
  els.dimBadge.textContent = `${cur.w} × ${cur.h}`;
  els.formatGrid.querySelectorAll('.format-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.formatId = b.dataset.id;
      renderFormats();
      updateOptimizeState();
    });
  });
}

function updateQualityUI(){
  const v = parseInt(els.quality.value,10);
  state.quality = v/100;
  els.qualityVal.textContent = v+'%';
}
function updateFmtUI(){
  const show = state.outFmt !== 'png';
  els.qualityRow.style.opacity = show ? '1' : '.4';
  els.qualityRow.style.pointerEvents = show ? 'auto' : 'none';
}

function setError(msg){
  if(!msg){ els.errorMsg.classList.add('hidden'); els.errorMsg.textContent=''; return;}
  els.errorMsg.textContent = msg;
  els.errorMsg.classList.remove('hidden');
}

function updateOptimizeState(){
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
  if(!file || !file.type.startsWith('image/')){ setError('Please select an image file (JPG, PNG, WebP).'); return; }
  if(file.size > 20*1024*1024){ setError('File too large. Max 20MB.'); return; }
  state.file = file;
  const url = URL.createObjectURL(file);
  if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = url;
  els.thumb.src = url;
  els.fileName.textContent = file.name;
  els.fileInfo.textContent = `${(file.size/1024).toFixed(0)} KB · ${file.type}`;
  els.dropContent.classList.add('hidden');
  els.filePreview.classList.remove('hidden');

  const img = new Image();
  img.onload = ()=>{
    state.img = img;
    state.naturalW = img.naturalWidth;
    state.naturalH = img.naturalHeight;
    els.origImg.src = url;
    els.origMeta.textContent = `Original · ${state.naturalW}×${state.naturalH}`;
    updateOptimizeState();
  };
  img.onerror = ()=> setError('Could not load image. Try another file.');
  img.src = url;
}

function clearFile(){
  state.file = null; state.img=null;
  els.fileInput.value='';
  els.dropContent.classList.remove('hidden');
  els.filePreview.classList.add('hidden');
  els.emptyState.classList.remove('hidden');
  els.previewWrap.classList.add('hidden');
  setError('');
  updateOptimizeState();
}

// HQ production via per-segment engine (js/production-engine.js) — raw → high quality
function optimize(){
  const p = currentPreset();
  const {w: TW, h: TH} = p;
  const img = state.img;
  const canvas = els.workCanvas;
  const t0=performance.now();
  try {
    const prod = window.PixelPerfectProduction;
    const engine = window.PixelPerfectOptimizer;
    const enhOpts = getEnhanceOpts();
    let segStats=null;
    if(prod && prod.produceHighQuality){
      const res = prod.produceHighQuality(img, TW, TH, canvas, { sharpen: els.sharpen.checked, ...enhOpts, segment: true });
      segStats=res && res.stats;
      if(segStats) console.log('segment stats', segStats);
    } else if(engine && engine.optimizeToCanvas){
      engine.optimizeToCanvas(img, TW, TH, canvas, { sharpen: els.sharpen.checked, ...enhOpts });
    } else {
      // fallback single-step if optimizer not loaded
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      canvas.width=TW; canvas.height=TH;
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      const scale=Math.max(TW/img.naturalWidth, TH/img.naturalHeight);
      const srcW=TW/scale, srcH=TH/scale;
      const sx=(img.naturalWidth-srcW)/2, sy=(img.naturalHeight-srcH)/2;
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,TW,TH);
      ctx.drawImage(img,sx,sy,srcW,srcH,0,0,TW,TH);
    }
  } catch(e){ setError('Optimization error: '+e.message); return; }

  const mime = state.outFmt==='png' ? 'image/png' : state.outFmt==='webp' ? 'image/webp' : 'image/jpeg';
  const quality = state.outFmt==='png' ? undefined : state.quality;

  const elapsed=Math.round(performance.now()-t0);
  canvas.toBlob(blob=>{
    if(!blob){ setError('Export failed. Try PNG or another image.'); return; }
    state.outBlob = blob;
    const url = URL.createObjectURL(blob);
    els.outImg.src = url;
    const segInfo = (typeof segStats!== 'undefined' && segStats) ? ` · Skin ${segStats.skinPct}% Sky ${segStats.skyPct}%` : '';
    els.outMeta.textContent = `Optimized · ${TW}×${TH} · ${(blob.size/1024).toFixed(0)} KB · ${state.outFmt.toUpperCase()} · Pyramid+Segment${segInfo}`;
    // pipeline stats bar
    if(els.pipelineStats){
      els.pipelineStats.classList.remove('hidden');
      if(els.statSkin) els.statSkin.textContent = (typeof segStats!=='undefined' && segStats) ? segStats.skinPct+'%' : '—';
      if(els.statSky) els.statSky.textContent = (typeof segStats!=='undefined' && segStats) ? segStats.skyPct+'%' : '—';
      if(els.statTime) els.statTime.textContent = elapsed+'ms';
      if(els.statMode) els.statMode.textContent = enhOpts.autoEnhance ? 'Auto' : (Object.keys(enhOpts.enhance||{}).length?'Manual':'HQ');
    }
    els.emptyState.classList.add('hidden');
    els.previewWrap.classList.remove('hidden');
    els.previewWrap.scrollIntoView({behavior:'smooth', block:'nearest'});
    const ext = state.outFmt==='jpeg' ? 'jpg' : state.outFmt;
    const base = state.file ? state.file.name.replace(/\.[^.]+$/,'') : 'image';
    els.downloadBtn.href = url;
    els.downloadBtn.download = `${base}-${state.platform}-${state.formatId}-${TW}x${TH}.${ext}`;
  }, mime, quality);
}

// events
els.browseBtn.addEventListener('click', ()=> els.fileInput.click());
els.fileInput.addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
els.removeFile.addEventListener('click', (e)=>{ e.stopPropagation(); clearFile(); });
els.dropZone.addEventListener('click', (e)=>{
  if(e.target.closest('#removeFile')||e.target.closest('#browseBtn')) return;
  if(!state.file) els.fileInput.click();
});
['dragenter','dragover'].forEach(ev=> els.dropZone.addEventListener(ev, e=>{ e.preventDefault(); els.dropZone.classList.add('drag'); }));
['dragleave','drop'].forEach(ev=> els.dropZone.addEventListener(ev, e=>{ e.preventDefault(); els.dropZone.classList.remove('drag'); }));
els.dropZone.addEventListener('drop', e=>{
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) handleFile(f);
});
els.platforms.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    els.platforms.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.platform = btn.dataset.platform;
    // default format per platform
    state.formatId = PRESETS[state.platform][0].id;
    renderFormats();
    updateOptimizeState();
  });
});
els.fmtBtns.forEach(b=> b.addEventListener('click', ()=>{
  els.fmtBtns.forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  state.outFmt = b.dataset.fmt;
  updateFmtUI();
  // if already optimized, re-run quickly
  if(state.outBlob && state.img) optimize();
}));
els.quality.addEventListener('input', ()=>{
  updateQualityUI();
  if(state.outBlob && state.img && state.outFmt!=='png') optimize();
});
els.optimizeBtn.addEventListener('click', optimize);
els.newBtn.addEventListener('click', clearFile);

// Enhance wiring
function syncEnhanceUI(){
  els.valBright.textContent=state.enhance.brightness;
  els.valContrast.textContent=state.enhance.contrast;
  els.valHighlights.textContent=state.enhance.highlights;
  els.valShadows.textContent=state.enhance.shadows;
  els.valWarmth.textContent=state.enhance.warmth;
  els.valVibrance.textContent=state.enhance.vibrance;
  const disabled = state.autoEnhance;
  [els.bright, els.contrast, els.highlights, els.shadows, els.warmth, els.vibrance].forEach(el=>{ el.disabled=disabled; el.parentElement.style.opacity=disabled?'0.45':'1'; });
}
function onEnhanceChange(){
  state.enhance.brightness=parseInt(els.bright.value,10);
  state.enhance.contrast=parseInt(els.contrast.value,10);
  state.enhance.highlights=parseInt(els.highlights.value,10);
  state.enhance.shadows=parseInt(els.shadows.value,10);
  state.enhance.warmth=parseInt(els.warmth.value,10);
  state.enhance.vibrance=parseInt(els.vibrance.value,10);
  syncEnhanceUI();
  if(state.outBlob && state.img) optimize();
}
[els.bright, els.contrast, els.highlights, els.shadows, els.warmth, els.vibrance].forEach(el=> el && el.addEventListener('input', onEnhanceChange));
if(els.autoEnhance) els.autoEnhance.addEventListener('change', ()=>{ state.autoEnhance=els.autoEnhance.checked; syncEnhanceUI(); if(state.outBlob && state.img) optimize(); });
if(els.resetEnhance) els.resetEnhance.addEventListener('click', ()=>{
  state.enhance={brightness:0,contrast:0,highlights:0,shadows:0,warmth:0,vibrance:0,saturation:0};
  state.autoEnhance=false; if(els.autoEnhance) els.autoEnhance.checked=false;
  els.bright.value=0; els.contrast.value=0; els.highlights.value=0; els.shadows.value=0; els.warmth.value=0; els.vibrance.value=0;
  syncEnhanceUI(); if(state.outBlob && state.img) optimize();
});
syncEnhanceUI();

// paste support
document.addEventListener('paste', e=>{
  const item = [...(e.clipboardData.items||[])].find(i=>i.type.startsWith('image/'));
  if(item){ handleFile(item.getAsFile()); }
});

// init
renderFormats();
updateQualityUI();
updateFmtUI();
updateOptimizeState();
