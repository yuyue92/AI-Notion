# Build verification

GlacialValley is intentionally build-free: it is a static `index.html` plus one ES module loaded directly by the browser.

## Passed

- `node --check glacial-valley.js`
- ESM bundle-resolution test against the real `three@0.180.0` npm package and its addons
- 14 custom vertex/fragment shaders parsed as GLSL ES without syntax errors
- Import-map and CDN allow-list audit
- Asset audit: no PNG, JPG, WebP, HDR, EXR, OBJ, GLTF, GLB or other image/model assets
- Archive integrity test

## Environment limitation

A screenshot-level browser render could not be completed inside the build container because its Chromium installation could not initialize an EGL/ANGLE software WebGL backend. This is a container graphics limitation, not a JavaScript parse or module-resolution failure. Run the package in a normal desktop Firefox/Chrome browser for visual validation.
