# PixelPerfect — Social Media Image Optimizer

> Upload your photo → pick Instagram / WhatsApp → choose Post / Story / Status → get a **high-quality, pixel-perfect** image. 100% in-browser, no upload to servers.

![license](https://img.shields.io/badge/license-MIT-blue) ![client-side](https://img.shields.io/badge/privacy-100%25%20client--side-brightgreen) ![no-build](https://img.shields.io/badge/no--build-static-lightgrey)

### ✨ Features

- **Upload** via drag & drop, browse, or paste (Ctrl+V)
- **Platforms:** Instagram, WhatsApp
- **Formats:**
  - Instagram: Post `1080×1080` (1:1), Portrait `1080×1350` (4:5), Story `1080×1920` (9:16), Reel Cover `1080×1920`
  - WhatsApp: Status `1080×1920`, Square `1080×1080`, Profile `640×640`
- **High-quality engine:** Canvas `imageSmoothingQuality: high`, cover-crop center (no distortion), white matte for JPEG, subtle sharpen convolution, export `JPEG 60-100% / PNG / WebP`
- **Before / After** preview + file info + one-click download with smart filename `myphoto-instagram-portrait-1080x1350.jpg`
- Fully **responsive**, keyboard & screen-reader friendly
- **Zero backend** — deploy to GitHub Pages / Netlify / Vercel static

### 🚀 Quick start

```bash
# clone and serve (any static server)
npx serve .
# or
python -m http.server 8000
# open http://localhost:8000
```

No install, no build. Just open `index.html`.

### 📐 How optimization works

1. Loads image via `createObjectURL` + `Image`
2. Calculates `scale = max(TW/srcW, TH/srcH)` and center-crops `srcW = TW/scale`, `sx = (srcW - srcW)/2`
3. Draws to target canvas at exact social dimensions with `imageSmoothingQuality='high'`
4. Optional subtle sharpen (3×3 kernel mixed at 45%)
5. Exports via `canvas.toBlob(mime, quality)` — JPEG default `92%`

This avoids platform recompression blur by matching native resolutions.

### 🌐 Deploy to GitHub Pages

1. Push to public repo (this project).
2. GitHub → Settings → Pages → Source: `Deploy from branch` → `main` / `root`.
3. Done — your site is live.

### 🛠️ Customize

- Edit `js/app.js` → `PRESETS` to add platforms/dimensions.
- Colors/spacing in `css/style.css` (`:root` variables).
- Default quality in `js/app.js` (`quality: 0.92`) and range input.

### 🔒 Privacy

All processing stays in `canvas` on the user's device. No fetch, no analytics, no cookies.

### 📄 License

MIT — free for personal & commercial use.

### 🙏 Contributing

PRs welcome! Keep it static & dependency-free if possible.

---

**Made for creators** — if it helps, star the repo ★
