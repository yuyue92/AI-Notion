# GlacialValley

A fully procedural alpine-glacier sunrise rendered in the browser with Three.js. The project uses no image textures, model files or game engine. Terrain, shadows, rivers, grass, flowers, atmospheric particles, birds and water effects are synthesized at load time.

## Run

Because the project uses ES modules, serve the directory through a local HTTP server instead of opening `index.html` via `file://`.

### Windows

Double-click `start.bat`, or run:

```powershell
py -m http.server 8080
```

Then open `http://localhost:8080`.

### Node.js alternative

```bash
npx serve .
```

## Controls

- Drag: look around the valley
- Mouse wheel: dolly in/out
- Double-click: restore the opening camera
- Bottom-right button: switch Ultra / High / Performance rendering scale

## Procedural systems

- Erosion-weighted fBm, ridged multifractals and domain-warped height field
- U-shaped glacial valley, analytic river-bed cutting and braided river curves
- CPU ray-marched soft shadow bake over the terrain height field
- Runtime-generated HDR environment map for MeshStandardMaterial
- 85,000 instanced grass blades with independent phase, bend and gust response
- Two-stage screen-space refraction, Beer-Lambert absorption and rock-flour scattering
- Depth-faded caustics, whitewater, shoreline foam and sun glints
- Wildflowers, pollen, dew, insects, birds, fish ripples and splash droplets
- Half-float linear-HDR pipeline, adaptive exposure, ACES, bloom, vignette and film grain

## Network policy

The only external requests are the Three.js core module and official Three.js addons loaded from jsDelivr CDN. All landscape content is generated locally by JavaScript and GLSL.

## Verification note

The source and shaders were parsed and bundled against Three.js 0.180.0. The packaging environment has no working EGL/WebGL backend, so final visual validation should be performed in desktop Firefox or Chrome.
