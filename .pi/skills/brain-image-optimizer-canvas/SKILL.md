---
name: brain-image-optimizer-canvas
description: When building client-side image optimizer/resizer for social platforms
---

# image-optimizer-canvas

1) Use static HTML+Canvas, no backend 2) Define PRESETS map {platform:[{id,w,h}] } 3) Cover-crop: scale=max(TW/sw,TH/sh), sx=(sw-TW/scale)/2 4) Set imageSmoothingQuality=high + white matte 5) Export via canvas.toBlob with quality slider + PNG/WebP toggle
