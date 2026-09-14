# PixelPerfect — Raw → High Quality Production Engine

> **Raw upload → Instagram / WhatsApp perfect.** Per-segment AI-ish pipeline: skin stays smooth, fabric pops, sky clean. 100% in browser, zero upload.

![license](https://img.shields.io/badge/license-MIT-blue) ![client-side](https://img.shields.io/badge/privacy-100%25%20client--side-brightgreen) ![pipeline](https://img.shields.io/badge/pipeline-pyramid%2Bsegment-purple) ![high-quality](https://img.shields.io/badge/quality-production-green)

**Live:** Open `index.html` — no build. Or `npx serve .` → http://localhost:3000

---

### ✨ Features

**Input:** Raw JPEG/PNG/WebP (phone, DSLR, screenshot, `raw.jpg` 3072×4096 tested) up to 20MB, drag-drop/paste

**Platforms & Formats:**
- Instagram: Post `1080×1080`, Portrait `1080×1350` (4:5 best), Story/Reel `1080×1920`
- WhatsApp: Status `1080×1920`, Square `1080×1080`, Profile `640×640`

**Production Engine (raw → HQ):**
1. **Pyramid Resize** — halving pyramid (1.8×) + bicubic → anti-pixelation on 3× downscale
2. **Segmentation** — 6 heuristic masks (YCbCr skin, HSV sky, Sobel texture, luminance shadow/highlight, foliage) feathered 3×3, <15ms
3. **Per-Segment Color** — skin desat -12% + warm, sky dehaze, foliage +18% vibrance, shadow lift +22%, highlight recover -18%
4. **Per-Segment Sharpen** — skin 0.45×, fabric 1.35×, sky 0.25× + denoise 0.55, adaptive edge-aware 1.85×
5. **Export** — JPEG 60-100% / PNG / WebP, 92% default, smart filename

**Enhance Studio (Step 5):**
- **Auto** — analyzes avgL, clipping, cast → brightness/contrast/highlights/shadows/warmth/vibrance (tuned to vivid: My-Pic auto now 4/8/-18/18/2/18)
- Manual: 6 sliders (Brightness, Contrast, Highlights, Shadows, Warmth, Vibrance) + live re-optimize
- **Pipeline bar** shows skin% sky% ms mode after each optimize

**Privacy:** All Canvas — no fetch, no cookies, no server. Works offline.

### 🚀 Quick Start

```bash
git clone <repo>
npx serve .
# open http://localhost:3000
# or python -m http.server 8000
```

No install, no build. Single `output/` folder with 18 production variants per raw (HQ/Auto/Vivid × 6 presets).

### 📐 Data Pipeline

```
User Raw (e.g. raw.jpg 3072×4096)
  ↓ validate (image/*, <20MB)
  ↓ createObjectURL + Image load
  ↓ Pyramid: cover-crop center → halve until <1.8× target → bicubic to TW×TH (white matte)
  ↓ Segment: YCbCr skin, B-dominant sky, G-dominant foliage, L shadow/highlight, Sobel texture → 6 masks (Uint8, feathered)
  ↓ Color: per-segment LUT (skin warm, sky dehaze, foliage pop)
  ↓ Sky denoise: 3×3 mean where sky>0.25
  ↓ Sharpen: per-pixel strength = base(0.62 for 1.5×) × skin 0.45 × sky 0.25 × texture 1.48 × edge 0.35+0.65
  ↓ Enhance: global brightness/contrast/highlights/shadows/warmth/vibrance (if Auto/Manual) → before sharpen
  ↓ Export: canvas.toBlob(mime, quality) → download + preview + stats
```

**Error handling:** invalid type/size → inline error, image load fail → retry, export fail → PNG fallback, large image → pyramid prevents OOM.

### 🌐 Deploy

**GitHub Pages:** Push → Settings → Pages → Branch `main` / root → live in 30s.

**Netlify/Vercel:** Drag folder or `git push`, no build command.

### 🧪 Tested

- Synthetic: 6 cases (4K photo/chart, upscale, 12MP) — all PASS var/sharp
- Real: `raw.jpg` 3072×4096 + `My-Pic.jpg` 1639×2048 — portrait var 2218 sharp 16.5, story 644/10.61, profile 3363/21.16 — segment skin 63% correctly detected
- Self-improving loop: targets var>2150/sharp>17, auto-tuned sharpen 0.52→0.62 in 4 iterations

### 🛠️ Customize

- `js/production-engine.js` — pipeline orchestrator
- `js/segment-engine.js` — masks & per-segment ops
- `js/enhance.js` — `autoEnhanceParams`, `applyEnhance`
- `js/optimizer.js` — fallback
- `css/style.css` `:root` — colors, `--accent`, `--radius`

### 📄 License

MIT — free for personal & commercial.

---

**Made for creators** — raw → high quality, every segment perfect. Star ★ if it helps!
