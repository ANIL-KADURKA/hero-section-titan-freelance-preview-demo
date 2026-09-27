# Titan Freelance — 3D scroll landing page

```bash
npm install
npm run dev
```

## Where things live

- `components/TitanScrollScene.jsx` — the whole page: copy, 3D scene and scroll animation.
  - `STEPS` — the four "How it works" steps on the blueprint.
  - `FEATURES` — the cards in the horizontal-scroll "Titan method" section. Add, remove or
    rename cards here; the section's scroll length adjusts automatically.
  - `FLIGHT` — the logo's position/rotation for each section. Each entry is reached as its
    `at` section scrolls from the bottom of the screen to the top. Rotations are in turns
    (1 = 360°); keep resting `y` values near whole or half turns, since `.25`/`.75` is edge-on.
- `app/globals.css` — all styles. Class names are global on purpose: GSAP targets them by selector.

## 3D logo sizing

The Titan `.obj` has its origin at a corner (x 0→60, y 0→55), so rotating it swung the logo
around that corner and pushed it off-screen. `normalizeGeometry()` centers the geometry and
scales it so its largest side is `LOGO_SIZE` world units. On narrow screens the whole stage is
scaled down, and in portrait the logo is parked in the lower half so it doesn't cover text.

## Background images (optional)

The page uses gradient backgrounds by default. To use images instead, drop them in `public/bgs/`:

- `background-reduced-black2.jpg` (sky/ground section)
- `clouds3.png`
- `sunset-reduced1.jpg` (finale)
