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
};

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

// canvas optimize
function optimize(){
  const p = currentPreset();
  const {w: TW, h: TH} = p;
  const img = state.img;
  const canvas = els.workCanvas;
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  canvas.width = TW; canvas.height = TH;

  // high quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // cover crop: calculate src rect
  const scale = Math.max(TW / img.naturalWidth, TH / img.naturalHeight);
  const srcW = TW / scale;
  const srcH = TH / scale;
  const sx = (img.naturalWidth - srcW)/2;
  const sy = (img.naturalHeight - srcH)/2;

  // fill background (avoid transparent edges for jpeg)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,TW,TH);
  ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, TW, TH);

  // subtle sharpen via convolution if enabled
  if(els.sharpen.checked){
    try{ applySharpen(ctx, TW, TH); }catch(e){}
  }

  const mime = state.outFmt==='png' ? 'image/png' : state.outFmt==='webp' ? 'image/webp' : 'image/jpeg';
  const quality = state.outFmt==='png' ? undefined : state.quality;

  canvas.toBlob(blob=>{
    if(!blob){ setError('Export failed. Try PNG or another image.'); return; }
    state.outBlob = blob;
    const url = URL.createObjectURL(blob);
    els.outImg.src = url;
    els.outMeta.textContent = `Optimized · ${TW}×${TH} · ${(blob.size/1024).toFixed(0)} KB · ${state.outFmt.toUpperCase()}`;
    els.emptyState.classList.add('hidden');
    els.previewWrap.classList.remove('hidden');
    els.previewWrap.scrollIntoView({behavior:'smooth', block:'nearest'});

    const ext = state.outFmt==='jpeg' ? 'jpg' : state.outFmt;
    const base = state.file ? state.file.name.replace(/\.[^.]+$/,'') : 'image';
    els.downloadBtn.href = url;
    els.downloadBtn.download = `${base}-${state.platform}-${state.formatId}-${TW}x${TH}.${ext}`;
    // auto trigger download? keep preview; user clicks
  }, mime, quality);
}

function applySharpen(ctx, w, h){
  // 3x3 sharpen kernel: 0 -1 0 / -1 5 -1 / 0 -1 0 with mix 0.35 for subtle
  const imgData = ctx.getImageData(0,0,w,h);
  const d = imgData.data;
  const out = new Uint8ClampedArray(d);
  const mix = 0.45;
  const idx = (x,y)=> (y*w + x)*4;
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      for(let c=0;c<3;c++){
        const i = idx(x,y)+c;
        const v = d[i]*5 - d[idx(x-1,y)+c] - d[idx(x+1,y)+c] - d[idx(x,y-1)+c] - d[idx(x,y+1)+c];
        const clamped = Math.max(0, Math.min(255, v));
        out[i] = Math.round(d[i]*(1-mix) + clamped*mix);
      }
    }
  }
  // copy back except border
  for(let i=0;i<d.length;i++) d[i]=out[i];
  ctx.putImageData(imgData,0,0);
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
