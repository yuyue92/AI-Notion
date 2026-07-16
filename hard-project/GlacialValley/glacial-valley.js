import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/*
 * GlacialValley
 * A deterministic, texture-free alpine landscape synthesized at runtime.
 * Every visible feature is generated from noise, analytic curves, instancing,
 * framebuffer feedback or procedural shaders. No image/model assets are used.
 */

const APP = document.querySelector('#app');
const LOADER = document.querySelector('#loader');
const BAR = document.querySelector('#barFill');
const STATUS = document.querySelector('#status');
const FPS = document.querySelector('#fps');
const HINT = document.querySelector('#hint');
const QUALITY_BUTTON = document.querySelector('#quality');
const ERROR = document.querySelector('#error');

const WORLD = Object.freeze({
  seed: 0x7f4a2d19,
  width: 560,
  depth: 740,
  terrainX: 260,
  terrainZ: 340,
  waterLevel: 8.7,
  cameraNear: 0.15,
  cameraFar: 1600,
  grassCount: 85000,
  flowerCount: 2400,
  pollenCount: 1800,
  insectCount: 160,
  birdCount: 24,
  sunDirection: new THREE.Vector3(-0.46, 0.38, -0.80).normalize(),
  sunColor: new THREE.Color(1.0, 0.65, 0.36),
  skyZenith: new THREE.Color(0.12, 0.28, 0.44),
  skyHorizon: new THREE.Color(0.93, 0.58, 0.36),
});

const QUALITY_PRESETS = Object.freeze({
  ULTRA: {
    pixelRatio: 1.45,
    shadowRays: 2,
    shadowSteps: 38,
    terrainX: 220,
    terrainZ: 280,
    grassCount: 85000,
    refractionScale: 0.82,
    bloom: true,
    postSamples: 1,
  },
  HIGH: {
    pixelRatio: 1.15,
    shadowRays: 1,
    shadowSteps: 32,
    terrainX: 180,
    terrainZ: 230,
    grassCount: 65000,
    refractionScale: 0.68,
    bloom: true,
    postSamples: 1,
  },
  PERFORMANCE: {
    pixelRatio: 0.9,
    shadowRays: 1,
    shadowSteps: 24,
    terrainX: 140,
    terrainZ: 180,
    grassCount: 42000,
    refractionScale: 0.52,
    bloom: false,
    postSamples: 1,
  },
});

let activeQualityName = 'ULTRA';
let quality = QUALITY_PRESETS[activeQualityName];

function setProgress(value, text) {
  BAR.style.width = `${Math.max(0, Math.min(100, value))}%`;
  STATUS.textContent = text;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function smootherstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function remap(x, a, b, c, d) {
  return c + ((x - a) / (b - a)) * (d - c);
}

function hash11(n) {
  return (Math.sin(n * 127.1 + 311.7) * 43758.5453123) % 1;
}

function hash21(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

class XorShift32 {
  constructor(seed = WORLD.seed) {
    this.state = seed >>> 0 || 1;
  }

  nextUint() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  float() {
    return this.nextUint() / 4294967296;
  }

  signed() {
    return this.float() * 2 - 1;
  }

  range(min, max) {
    return min + (max - min) * this.float();
  }

  int(min, maxExclusive) {
    return Math.floor(this.range(min, maxExclusive));
  }
}

class ValueNoise2D {
  constructor(seed = WORLD.seed) {
    this.seed = seed;
  }

  hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h ^ this.seed, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  sample(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = this.hash(ix, iy);
    const b = this.hash(ix + 1, iy);
    const c = this.hash(ix, iy + 1);
    const d = this.hash(ix + 1, iy + 1);
    const ab = a + (b - a) * ux;
    const cd = c + (d - c) * ux;
    return (ab + (cd - ab) * uy) * 2 - 1;
  }

  fbm(x, y, octaves = 6, lacunarity = 2.03, gain = 0.5) {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    let normalization = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += this.sample(x * frequency, y * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
      x += 13.57;
      y -= 7.91;
    }
    return sum / normalization;
  }

  ridged(x, y, octaves = 6, lacunarity = 2.07, gain = 0.54) {
    let amplitude = 0.54;
    let frequency = 1;
    let sum = 0;
    let weight = 1;
    let normalization = 0;
    for (let i = 0; i < octaves; i += 1) {
      let signal = 1 - Math.abs(this.sample(x * frequency, y * frequency));
      signal *= signal;
      signal *= weight;
      weight = clamp01(signal * 2.15);
      sum += signal * amplitude;
      normalization += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
      x -= 3.2;
      y += 5.4;
    }
    return sum / normalization;
  }

  domainWarp(x, y) {
    const qx = this.fbm(x + 0.0, y + 0.0, 4, 2.02, 0.52);
    const qy = this.fbm(x + 5.2, y + 1.3, 4, 2.02, 0.52);
    const rx = this.fbm(x + 4.0 * qx + 1.7, y + 4.0 * qy + 9.2, 4, 2.04, 0.5);
    const ry = this.fbm(x + 4.0 * qx + 8.3, y + 4.0 * qy + 2.8, 4, 2.04, 0.5);
    return { x: x + rx * 1.25, y: y + ry * 1.25, qx, qy, rx, ry };
  }
}

class HeightField {
  constructor(noise, segmentsX, segmentsZ) {
    this.noise = noise;
    this.segmentsX = segmentsX;
    this.segmentsZ = segmentsZ;
    this.cols = segmentsX + 1;
    this.rows = segmentsZ + 1;
    this.heights = new Float32Array(this.cols * this.rows);
    this.shadows = new Float32Array(this.cols * this.rows);
    this.moisture = new Float32Array(this.cols * this.rows);
    this.snow = new Float32Array(this.cols * this.rows);
    this.rock = new Float32Array(this.cols * this.rows);
  }

  index(ix, iz) {
    return iz * this.cols + ix;
  }

  worldX(ix) {
    return (ix / this.segmentsX - 0.5) * WORLD.width;
  }

  worldZ(iz) {
    return (iz / this.segmentsZ - 0.5) * WORLD.depth;
  }

  gridX(x) {
    return ((x / WORLD.width) + 0.5) * this.segmentsX;
  }

  gridZ(z) {
    return ((z / WORLD.depth) + 0.5) * this.segmentsZ;
  }

  valleyAxis(z) {
    const t = z / WORLD.depth;
    return Math.sin(t * 7.4 + 0.6) * 15 + Math.sin(t * 17.2) * 4.2 - 5;
  }

  riverWidth(z) {
    const t = z / WORLD.depth + 0.5;
    return 10 + 7.5 * smoothstep(0.1, 0.95, t) + Math.sin(z * 0.027) * 1.7;
  }

  braidedCenter(z, branch = 0) {
    const axis = this.valleyAxis(z);
    const phase = branch * 2.11;
    const spread = branch === 0 ? 0 : (branch % 2 ? 1 : -1) * (7 + branch * 2.1);
    return axis + spread + Math.sin(z * (0.020 + branch * 0.0018) + phase) * (2.7 + branch * 0.65);
  }

  terrainHeight(x, z) {
    const nx = x / WORLD.width;
    const nz = z / WORLD.depth;
    const warp = this.noise.domainWarp(nx * 2.3 + 9.4, nz * 2.3 - 3.1);
    const wx = warp.x;
    const wz = warp.y;

    const axis = this.valleyAxis(z);
    const lateral = Math.abs(x - axis) / (WORLD.width * 0.5);
    const valleyWall = Math.pow(clamp01(lateral), 1.62);
    const glacialU = Math.pow(clamp01(lateral), 3.25);

    const macroRidges = this.noise.ridged(wx * 1.12, wz * 1.22, 7, 2.07, 0.54);
    const secondaryRidges = this.noise.ridged(wx * 2.8 + 11.0, wz * 2.65 - 7.0, 5, 2.1, 0.5);
    const erosionFlow = this.noise.fbm(wx * 3.4 + warp.qx * 1.3, wz * 3.0 + warp.qy, 6, 2.05, 0.51);
    const erosionMask = Math.pow(clamp01(0.58 + erosionFlow * 0.42), 1.5);
    const alpine = Math.pow(macroRidges, 1.35) * erosionMask;

    const frontToBack = smoothstep(-0.48, 0.30, nz);
    const farMass = smoothstep(-0.18, 0.48, nz);
    const sideMass = valleyWall * (60 + farMass * 145);
    const peaks = Math.pow(alpine, 1.22) * (36 + farMass * 155) * smoothstep(0.08, 0.46, lateral);
    const brokenFaces = secondaryRidges * (10 + farMass * 35) * valleyWall;
    const floorUndulation = this.noise.fbm(nx * 4.4 + 13.0, nz * 4.0, 5, 2.02, 0.5) * (3.5 + lateral * 5.0);

    const moraine = this.noise.ridged(nx * 8.5 + 3.0, nz * 7.0, 4, 2.1, 0.52) * 4.5;
    const riverDistance = Math.abs(x - this.braidedCenter(z, 0));
    const riverCut = Math.exp(-Math.pow(riverDistance / this.riverWidth(z), 2.0));
    const riverBed = -riverCut * (7.4 + 2.2 * Math.sin(z * 0.021));
    const terrace = Math.sin((lateral * 28 + erosionFlow * 1.9)) * 1.1 * valleyWall;

    let h = 6.0 + sideMass + peaks + brokenFaces + floorUndulation + moraine * (0.3 + lateral) + terrace + riverBed;
    h += glacialU * 31;
    h -= (1 - frontToBack) * valleyWall * 18;

    const leftShoulder = Math.exp(-Math.pow((x + 166 + Math.sin(z * 0.012) * 20) / 70, 2));
    const rightShoulder = Math.exp(-Math.pow((x - 172 + Math.cos(z * 0.010) * 24) / 68, 2));
    h += (leftShoulder + rightShoulder) * farMass * 35;

    return Math.max(-4, h);
  }

  async generate(onProgress) {
    for (let iz = 0; iz <= this.segmentsZ; iz += 1) {
      const z = this.worldZ(iz);
      for (let ix = 0; ix <= this.segmentsX; ix += 1) {
        const x = this.worldX(ix);
        const i = this.index(ix, iz);
        const h = this.terrainHeight(x, z);
        this.heights[i] = h;
        const valleyMoist = Math.exp(-Math.pow((x - this.valleyAxis(z)) / 65, 2));
        this.moisture[i] = clamp01(0.16 + valleyMoist * 0.72 + this.noise.fbm(x * 0.018, z * 0.017, 4) * 0.16);
      }
      if (iz % 14 === 0) {
        onProgress?.(iz / this.segmentsZ);
        await nextFrame();
      }
    }
    this.computeDerivedMaps();
  }

  computeDerivedMaps() {
    for (let iz = 0; iz <= this.segmentsZ; iz += 1) {
      for (let ix = 0; ix <= this.segmentsX; ix += 1) {
        const i = this.index(ix, iz);
        const l = this.heights[this.index(Math.max(0, ix - 1), iz)];
        const r = this.heights[this.index(Math.min(this.segmentsX, ix + 1), iz)];
        const d = this.heights[this.index(ix, Math.max(0, iz - 1))];
        const u = this.heights[this.index(ix, Math.min(this.segmentsZ, iz + 1))];
        const dx = (r - l) / (WORLD.width / this.segmentsX * 2);
        const dz = (u - d) / (WORLD.depth / this.segmentsZ * 2);
        const slope = Math.sqrt(dx * dx + dz * dz);
        const h = this.heights[i];
        const thermal = smoothstep(92, 180, h) * smoothstep(0.1, 1.15, 1.15 - slope);
        const leeward = clamp01(0.5 + (dx * WORLD.sunDirection.x + dz * WORLD.sunDirection.z) * 0.12);
        this.snow[i] = clamp01(thermal * (0.72 + 0.28 * leeward) + smoothstep(160, 230, h) * 0.35);
        this.rock[i] = clamp01(smoothstep(0.65, 2.9, slope) * (1 - this.snow[i] * 0.5));
      }
    }
  }

  sampleArray(array, x, z) {
    const gx = Math.max(0, Math.min(this.segmentsX - 0.001, this.gridX(x)));
    const gz = Math.max(0, Math.min(this.segmentsZ - 0.001, this.gridZ(z)));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(this.segmentsX, x0 + 1);
    const z1 = Math.min(this.segmentsZ, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const a = array[this.index(x0, z0)];
    const b = array[this.index(x1, z0)];
    const c = array[this.index(x0, z1)];
    const d = array[this.index(x1, z1)];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), tz);
  }

  heightAt(x, z) {
    return this.sampleArray(this.heights, x, z);
  }

  shadowAt(x, z) {
    return this.sampleArray(this.shadows, x, z);
  }

  normalAt(x, z, target = new THREE.Vector3()) {
    const e = 1.2;
    const hL = this.heightAt(x - e, z);
    const hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e);
    const hU = this.heightAt(x, z + e);
    return target.set(hL - hR, e * 2, hD - hU).normalize();
  }

  async bakeSunShadows(onProgress, rays = 3, maxSteps = 44) {
    const sun = WORLD.sunDirection.clone();
    const horizontalLength = Math.sqrt(sun.x * sun.x + sun.z * sun.z);
    const horizontal = new THREE.Vector2(sun.x / horizontalLength, sun.z / horizontalLength);
    const verticalSlope = sun.y / horizontalLength;
    const stepLength = 7.2;
    const jitterAngles = [-0.012, 0, 0.014, -0.025, 0.026];

    for (let iz = 0; iz <= this.segmentsZ; iz += 1) {
      for (let ix = 0; ix <= this.segmentsX; ix += 1) {
        const i = this.index(ix, iz);
        const x = this.worldX(ix);
        const z = this.worldZ(iz);
        const baseHeight = this.heights[i] + 0.7;
        let visibility = 0;

        for (let ray = 0; ray < rays; ray += 1) {
          const angle = jitterAngles[ray % jitterAngles.length];
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const hx = horizontal.x * c - horizontal.y * s;
          const hz = horizontal.x * s + horizontal.y * c;
          let blocked = 0;
          let softness = 1;

          for (let step = 1; step <= maxSteps; step += 1) {
            const distance = step * stepLength * (1 + step * 0.012);
            const sx = x + hx * distance;
            const sz = z + hz * distance;
            if (Math.abs(sx) > WORLD.width * 0.5 || Math.abs(sz) > WORLD.depth * 0.5) break;
            const rayHeight = baseHeight + distance * verticalSlope;
            const terrainHeight = this.heightAt(sx, sz);
            const clearance = rayHeight - terrainHeight;
            if (clearance < 0) {
              blocked = 1;
              break;
            }
            softness = Math.min(softness, clamp01(clearance / (4.5 + distance * 0.022)));
          }
          visibility += blocked ? 0.06 : 0.58 + softness * 0.42;
        }
        this.shadows[i] = visibility / rays;
      }
      if (iz % 9 === 0) {
        onProgress?.(iz / this.segmentsZ);
        await nextFrame();
      }
    }
  }
}

class ProceduralSky {
  constructor(scene) {
    this.geometry = new THREE.SphereGeometry(900, 48, 24);
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: WORLD.sunDirection.clone() },
        uZenith: { value: WORLD.skyZenith.clone() },
        uHorizon: { value: WORLD.skyHorizon.clone() },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldDir;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(world.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vWorldDir;
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform float uTime;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
                     mix(hash21(i + vec2(0,1)), hash21(i + vec2(1)), f.x), f.y);
        }

        void main() {
          vec3 d = normalize(vWorldDir);
          float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          float horizonBand = exp(-abs(d.y) * 4.6);
          vec3 sky = mix(uHorizon, uZenith, pow(h, 0.48));
          sky += vec3(0.34, 0.14, 0.055) * horizonBand * 0.48;

          float mu = max(dot(d, uSunDir), 0.0);
          float sunDisc = smoothstep(0.99974, 0.99993, mu);
          float sunGlow = pow(mu, 280.0) * 2.2 + pow(mu, 18.0) * 0.25;
          sky += vec3(5.2, 2.25, 0.72) * sunDisc;
          sky += vec3(1.4, 0.44, 0.12) * sunGlow;

          vec2 cloudUv = vec2(atan(d.z, d.x) * 1.8, d.y * 7.0);
          float clouds = noise(cloudUv * 1.7 + vec2(uTime * 0.002, 0.0));
          clouds += noise(cloudUv * 3.8 - vec2(uTime * 0.003, 0.0)) * 0.45;
          clouds = smoothstep(0.86, 1.18, clouds) * smoothstep(-0.05, 0.36, d.y) * (1.0 - smoothstep(0.52, 0.9, d.y));
          sky = mix(sky, sky + vec3(0.35, 0.21, 0.16), clouds * 0.38);

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  update(time, camera) {
    this.material.uniforms.uTime.value = time;
    this.mesh.position.copy(camera.position);
  }
}

class TerrainSystem {
  constructor(scene, heightField) {
    this.scene = scene;
    this.heightField = heightField;
    this.geometry = null;
    this.mesh = null;
  }

  build() {
    const hf = this.heightField;
    const geometry = new THREE.PlaneGeometry(WORLD.width, WORLD.depth, hf.segmentsX, hf.segmentsZ);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const ao = new Float32Array(position.count);
    const tempNormal = new THREE.Vector3();
    const grass = new THREE.Color(0.21, 0.31, 0.19);
    const moss = new THREE.Color(0.12, 0.22, 0.16);
    const rock = new THREE.Color(0.25, 0.25, 0.22);
    const warmRock = new THREE.Color(0.40, 0.30, 0.22);
    const snow = new THREE.Color(0.74, 0.82, 0.84);
    const glacier = new THREE.Color(0.43, 0.67, 0.69);
    const color = new THREE.Color();

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const h = hf.heightAt(x, z);
      position.setY(i, h);
      const moisture = hf.sampleArray(hf.moisture, x, z);
      const snowMask = hf.sampleArray(hf.snow, x, z);
      const rockMask = hf.sampleArray(hf.rock, x, z);
      const shadow = hf.shadowAt(x, z);
      hf.normalAt(x, z, tempNormal);

      color.copy(grass).lerp(moss, moisture * 0.72);
      color.lerp(warmRock, rockMask * 0.42);
      color.lerp(rock, rockMask * 0.68);
      color.lerp(glacier, smoothstep(122, 178, h) * (1 - rockMask) * 0.24);
      color.lerp(snow, snowMask);
      const sunrise = clamp01(tempNormal.dot(WORLD.sunDirection) * 0.5 + 0.5);
      color.multiplyScalar(0.44 + shadow * 0.56);
      color.r += sunrise * shadow * 0.075;
      color.g += sunrise * shadow * 0.028;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      ao[i] = clamp01(0.45 + shadow * 0.55 - moisture * 0.08);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aTerrainAO', new THREE.BufferAttribute(ao, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.44,
      fog: true,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTerrainAO;\nvarying float vTerrainAO;\nvarying vec3 vTerrainWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTerrainAO = aTerrainAO;\nvTerrainWorld = worldPosition.xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTerrainAO;\nvarying vec3 vTerrainWorld;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float micro = sin(vTerrainWorld.x * 1.71 + sin(vTerrainWorld.z * 0.43)) *
                        sin(vTerrainWorld.z * 1.33 + cos(vTerrainWorld.x * 0.37));
          diffuseColor.rgb *= 0.965 + micro * 0.025;
          diffuseColor.rgb *= vTerrainAO;
        `);
      material.userData.shader = shader;
    };

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'ProceduralTerrain';
    this.geometry = geometry;
    this.mesh = mesh;
    this.scene.add(mesh);
    return mesh;
  }
}

class GrassSystem {
  constructor(scene, heightField, noise, count) {
    this.scene = scene;
    this.heightField = heightField;
    this.noise = noise;
    this.count = count;
    this.material = null;
    this.mesh = null;
    this.visible = true;
  }

  async build(onProgress) {
    const hf = this.heightField;
    const rng = new XorShift32(WORLD.seed ^ 0x6c8e9cf5);
    const offsets = new Float32Array(this.count * 3);
    const scales = new Float32Array(this.count * 2);
    const phases = new Float32Array(this.count);
    const bends = new Float32Array(this.count * 2);
    const colors = new Float32Array(this.count * 3);
    const rotations = new Float32Array(this.count);
    const normal = new THREE.Vector3();
    const cA = new THREE.Color(0.17, 0.30, 0.13);
    const cB = new THREE.Color(0.31, 0.39, 0.17);
    const cC = new THREE.Color(0.12, 0.24, 0.17);
    const color = new THREE.Color();

    let accepted = 0;
    let attempts = 0;
    while (accepted < this.count && attempts < this.count * 8) {
      attempts += 1;
      const zBias = Math.pow(rng.float(), 0.72);
      const z = THREE.MathUtils.lerp(-WORLD.depth * 0.48, WORLD.depth * 0.28, zBias);
      const valleyHalf = 80 + smoothstep(-WORLD.depth * 0.45, WORLD.depth * 0.25, z) * 70;
      const axis = hf.valleyAxis(z);
      const x = axis + rng.signed() * valleyHalf;
      if (Math.abs(x) > WORLD.width * 0.46) continue;
      const h = hf.heightAt(x, z);
      if (h < WORLD.waterLevel + 0.6 || h > 103) continue;
      const riverDistance = Math.abs(x - hf.braidedCenter(z, 0));
      if (riverDistance < hf.riverWidth(z) * 1.15) continue;
      hf.normalAt(x, z, normal);
      if (normal.y < 0.72) continue;
      const snow = hf.sampleArray(hf.snow, x, z);
      const rock = hf.sampleArray(hf.rock, x, z);
      if (snow > 0.13 || rock > 0.72) continue;
      const density = 0.54 + hf.sampleArray(hf.moisture, x, z) * 0.46;
      if (rng.float() > density) continue;

      const i3 = accepted * 3;
      const i2 = accepted * 2;
      offsets[i3] = x;
      offsets[i3 + 1] = h - 0.05;
      offsets[i3 + 2] = z;
      const height = rng.range(0.48, 1.58) * (0.78 + density * 0.36);
      scales[i2] = rng.range(0.035, 0.095) * (0.8 + height * 0.2);
      scales[i2 + 1] = height;
      phases[accepted] = rng.range(0, Math.PI * 2);
      bends[i2] = rng.signed() * 0.22;
      bends[i2 + 1] = rng.signed() * 0.22;
      rotations[accepted] = rng.range(0, Math.PI * 2);

      const moisture = hf.sampleArray(hf.moisture, x, z);
      color.copy(cA).lerp(cB, rng.float() * 0.55).lerp(cC, moisture * 0.48);
      color.multiplyScalar(0.82 + hf.shadowAt(x, z) * 0.28);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
      accepted += 1;

      if (accepted % 6000 === 0) {
        onProgress?.(accepted / this.count);
        await nextFrame();
      }
    }

    this.count = accepted;
    const base = new THREE.BufferGeometry();
    // Five-segment tapered blade: enough vertices for smooth GPU bending.
    const bladeVertices = [];
    const bladeUvs = [];
    const bladeIndices = [];
    const segments = 5;
    for (let row = 0; row <= segments; row += 1) {
      const y = row / segments;
      const width = (1 - y) * (0.9 - y * 0.18);
      bladeVertices.push(-width, y, 0, width, y, 0);
      bladeUvs.push(0, y, 1, y);
      if (row < segments) {
        const a = row * 2;
        bladeIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    base.setAttribute('position', new THREE.Float32BufferAttribute(bladeVertices, 3));
    base.setAttribute('uv', new THREE.Float32BufferAttribute(bladeUvs, 2));
    base.setIndex(bladeIndices);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.attributes.position);
    geometry.setAttribute('uv', base.attributes.uv);
    geometry.setAttribute('iOffset', new THREE.InstancedBufferAttribute(offsets.subarray(0, accepted * 3), 3));
    geometry.setAttribute('iScale', new THREE.InstancedBufferAttribute(scales.subarray(0, accepted * 2), 2));
    geometry.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phases.subarray(0, accepted), 1));
    geometry.setAttribute('iBend', new THREE.InstancedBufferAttribute(bends.subarray(0, accepted * 2), 2));
    geometry.setAttribute('iColor', new THREE.InstancedBufferAttribute(colors.subarray(0, accepted * 3), 3));
    geometry.setAttribute('iRotation', new THREE.InstancedBufferAttribute(rotations.subarray(0, accepted), 1));
    geometry.instanceCount = accepted;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 35, -30), 460);

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: WORLD.sunDirection.clone() },
        uSunColor: { value: WORLD.sunColor.clone() },
        uWind: { value: new THREE.Vector2(0.76, 0.24) },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */`
        precision highp float;
        attribute vec3 iOffset;
        attribute vec2 iScale;
        attribute float iPhase;
        attribute vec2 iBend;
        attribute vec3 iColor;
        attribute float iRotation;
        uniform float uTime;
        uniform vec2 uWind;
        varying vec3 vColor;
        varying float vHeight;
        varying float vDiffuse;
        varying vec3 vWorldPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
                     mix(hash21(i + vec2(0,1)), hash21(i + vec2(1)), f.x), f.y);
        }

        void main() {
          float c = cos(iRotation);
          float s = sin(iRotation);
          vec3 p = position;
          p.x *= iScale.x;
          p.y *= iScale.y;
          float yN = uv.y;

          float broadWind = sin(uTime * 0.82 + dot(iOffset.xz, vec2(0.019, 0.013)) + iPhase);
          float gustField = noise(iOffset.xz * 0.009 + uWind * uTime * 0.045);
          float gustPulse = smoothstep(0.56, 0.92, gustField) * sin(uTime * 3.1 + iPhase * 1.7);
          float tinyTremor = sin(uTime * 8.4 + iPhase * 5.0 + iOffset.x * 0.1) * 0.06;
          float bendAmount = (0.24 + broadWind * 0.11 + gustPulse * 0.25 + tinyTremor) * yN * yN;
          p.x += (iBend.x + uWind.x * bendAmount) * yN;
          p.z += (iBend.y + uWind.y * bendAmount) * yN;
          p.y -= abs(bendAmount) * yN * 0.09;

          float rx = p.x * c - p.z * s;
          float rz = p.x * s + p.z * c;
          p.x = rx;
          p.z = rz;
          vec4 world = modelMatrix * vec4(p + iOffset, 1.0);
          vWorldPos = world.xyz;
          vColor = iColor;
          vHeight = yN;
          vec3 pseudoNormal = normalize(vec3(-uWind.x * bendAmount * 0.8, 1.0, -uWind.y * bendAmount * 0.8));
          vDiffuse = 0.38 + max(dot(pseudoNormal, normalize(vec3(-0.46, 0.38, -0.80))), 0.0) * 0.72;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec3 uSunColor;
        uniform vec3 uCameraPos;
        varying vec3 vColor;
        varying float vHeight;
        varying float vDiffuse;
        varying vec3 vWorldPos;
        void main() {
          float edge = smoothstep(0.0, 0.12, vHeight) * (1.0 - smoothstep(0.93, 1.0, vHeight));
          if (edge < 0.03) discard;
          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          float rim = pow(1.0 - abs(viewDir.y), 3.0) * 0.08;
          vec3 color = vColor * vDiffuse;
          color += uSunColor * pow(vHeight, 5.0) * 0.055;
          color += rim * vec3(0.16, 0.25, 0.12);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.material = material;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = true;
    this.mesh.name = 'Grass_85000';
    this.scene.add(this.mesh);
    return this.mesh;
  }

  update(time, camera) {
    if (!this.material) return;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPos.value.copy(camera.position);
  }
}

function buildRiverRibbon(heightField, branch, segmentCount = 520) {
  const positions = [];
  const uvs = [];
  const bankData = [];
  const indices = [];
  const zStart = -WORLD.depth * 0.52;
  const zEnd = WORLD.depth * 0.52;
  const branchScale = branch === 0 ? 1 : 0.34 + branch * 0.055;

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const z = THREE.MathUtils.lerp(zStart, zEnd, t);
    const center = heightField.braidedCenter(z, branch);
    const zE = 0.5;
    const nextCenter = heightField.braidedCenter(z + zE, branch);
    const tangent = new THREE.Vector2(nextCenter - center, zE).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const width = heightField.riverWidth(z) * branchScale * (0.84 + Math.sin(z * 0.039 + branch) * 0.11);
    const baseY = WORLD.waterLevel + (zEnd - z) * 0.0024 - branch * 0.08;
    for (let side = -1; side <= 1; side += 2) {
      positions.push(center + normal.x * width * side, baseY, z + normal.y * width * side);
      uvs.push(side < 0 ? 0 : 1, t * 18 + branch * 3.1);
      bankData.push(side, width, branch);
    }
    if (i < segmentCount) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aBank', new THREE.Float32BufferAttribute(bankData, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

class WaterSystem {
  constructor(scene, heightField, renderer) {
    this.scene = scene;
    this.heightField = heightField;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'BraidedGlacialRiver';
    this.material = null;
    this.foamMaterial = null;
    this.prepassTarget = null;
    this.depthTexture = null;
    this.meshes = [];
    this.foamMeshes = [];
    this.ripples = [];
    this.splashPoints = [];
    this.waterVisible = true;
    scene.add(this.group);
  }

  build(width, height) {
    this.createTargets(width, height);
    this.material = this.createWaterMaterial();
    this.foamMaterial = this.createFoamMaterial();

    for (let branch = 0; branch < 5; branch += 1) {
      const geometry = buildRiverRibbon(this.heightField, branch, branch === 0 ? 540 : 380);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.renderOrder = 20;
      mesh.frustumCulled = true;
      this.group.add(mesh);
      this.meshes.push(mesh);

      const foam = new THREE.Mesh(geometry.clone(), this.foamMaterial);
      foam.position.y += 0.025 + branch * 0.003;
      foam.renderOrder = 21;
      this.group.add(foam);
      this.foamMeshes.push(foam);
    }

    return this.group;
  }

  createTargets(width, height) {
    this.prepassTarget?.dispose();
    const w = Math.max(320, Math.floor(width * quality.refractionScale));
    const h = Math.max(180, Math.floor(height * quality.refractionScale));
    this.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.depthTexture.format = THREE.DepthFormat;
    this.prepassTarget = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthTexture: this.depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.prepassTarget.texture.name = 'GlacialRefractionScene';
    if (this.material) {
      this.material.uniforms.tScene.value = this.prepassTarget.texture;
      this.material.uniforms.tSceneDepth.value = this.depthTexture;
      this.material.uniforms.uResolution.value.set(w, h);
    }
  }

  createWaterMaterial() {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        tScene: { value: this.prepassTarget.texture },
        tSceneDepth: { value: this.depthTexture },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(this.prepassTarget.width, this.prepassTarget.height) },
        uCameraNear: { value: WORLD.cameraNear },
        uCameraFar: { value: WORLD.cameraFar },
        uSunDir: { value: WORLD.sunDirection.clone() },
        uSunColor: { value: WORLD.sunColor.clone() },
        uCameraPos: { value: new THREE.Vector3() },
        uExposure: { value: 1 },
      },
      vertexShader: /* glsl */`
        precision highp float;
        attribute vec3 aBank;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec4 vClipPos;
        varying float vEdge;
        varying float vBranch;
        void main() {
          vUv = uv;
          vEdge = abs(aBank.x);
          vBranch = aBank.z;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          vClipPos = projectionMatrix * viewMatrix * world;
          gl_Position = vClipPos;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tScene;
        uniform sampler2D tSceneDepth;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uCameraNear;
        uniform float uCameraFar;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uCameraPos;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec4 vClipPos;
        varying float vEdge;
        varying float vBranch;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x),
                     mix(hash21(i+vec2(0,1)), hash21(i+vec2(1)), f.x), f.y);
        }

        float fbm(vec2 p) {
          float f = 0.0;
          float a = 0.5;
          mat2 m = mat2(1.6, -1.2, 1.2, 1.6);
          for (int i = 0; i < 5; i++) {
            f += valueNoise(p) * a;
            p = m * p + 2.17;
            a *= 0.5;
          }
          return f;
        }

        float linearizeDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear));
        }

        vec3 waterNormal(vec2 uv) {
          vec2 p1 = uv * vec2(7.0, 16.0) + vec2(uTime * 0.16, -uTime * 0.92);
          vec2 p2 = uv * vec2(13.0, 28.0) + vec2(-uTime * 0.21, -uTime * 1.31);
          float h = fbm(p1) * 0.67 + fbm(p2) * 0.33;
          float hx = fbm(p1 + vec2(0.018, 0.0)) * 0.67 + fbm(p2 + vec2(0.018, 0.0)) * 0.33;
          float hy = fbm(p1 + vec2(0.0, 0.018)) * 0.67 + fbm(p2 + vec2(0.0, 0.018)) * 0.33;
          return normalize(vec3((h - hx) * 5.2, 1.0, (h - hy) * 4.1));
        }

        void main() {
          vec2 screenUv = vClipPos.xy / vClipPos.w * 0.5 + 0.5;
          vec3 N = waterNormal(vUv);
          vec3 V = normalize(uCameraPos - vWorldPos);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.2);

          // Two-stage screen-space refraction: broad low-frequency bend then finer turbulent offset.
          vec2 broadOffset = N.xz * vec2(0.010, 0.006) * (0.35 + 0.65 * (1.0 - fresnel));
          vec2 fineWave = vec2(
            sin(vUv.y * 52.0 - uTime * 5.2 + vUv.x * 9.0),
            cos(vUv.y * 71.0 - uTime * 7.0 - vUv.x * 12.0)
          ) * 0.0018;
          vec2 uvStage1 = clamp(screenUv + broadOffset, 0.002, 0.998);
          vec3 refractedStage1 = texture2D(tScene, uvStage1).rgb;
          vec2 chroma = fineWave + N.xz * 0.0017;
          vec3 refractedStage2;
          refractedStage2.r = texture2D(tScene, clamp(uvStage1 + chroma * 1.16, 0.002, 0.998)).r;
          refractedStage2.g = texture2D(tScene, clamp(uvStage1 + chroma, 0.002, 0.998)).g;
          refractedStage2.b = texture2D(tScene, clamp(uvStage1 + chroma * 0.82, 0.002, 0.998)).b;
          vec3 refracted = mix(refractedStage1, refractedStage2, 0.64);

          float sceneDepth = linearizeDepth(texture2D(tSceneDepth, uvStage1).r);
          float waterDepth = linearizeDepth(gl_FragCoord.z);
          float thickness = clamp(sceneDepth - waterDepth, 0.0, 38.0);

          // Beer-Lambert absorption and suspended glacial-rock-flour scattering.
          vec3 absorptionCoeff = vec3(0.080, 0.031, 0.022);
          vec3 transmittance = exp(-absorptionCoeff * thickness);
          vec3 rockFlour = vec3(0.025, 0.48, 0.52);
          float suspendedSediment = 0.30 + fbm(vUv * vec2(2.5, 12.0) - vec2(0.0, uTime * 0.22)) * 0.48;
          vec3 scattering = rockFlour * (1.0 - transmittance) * suspendedSediment;
          vec3 color = refracted * transmittance + scattering;

          float flowNoise = fbm(vUv * vec2(4.0, 42.0) - vec2(0.0, uTime * 1.25));
          float rapid = smoothstep(0.68, 0.91, flowNoise + sin(vUv.y * 33.0 - uTime * 7.0) * 0.17);
          rapid *= 0.45 + 0.55 * smoothstep(0.0, 2.0, vBranch);
          color += vec3(0.74, 0.92, 0.90) * rapid * 0.44;

          // Depth-faded caustics projected into the water volume.
          float causticA = sin((vWorldPos.x + N.x * 4.0) * 1.1 + uTime * 1.8);
          float causticB = sin((vWorldPos.z - N.z * 3.0) * 1.43 - uTime * 2.1);
          float caustics = pow(max(causticA * causticB, 0.0), 4.0);
          caustics *= exp(-thickness * 0.18) * (1.0 - fresnel);
          color += vec3(0.40, 0.95, 0.88) * caustics * 0.26;

          vec3 H = normalize(V + uSunDir);
          float sunGlint = pow(max(dot(N, H), 0.0), 420.0);
          float glintBands = smoothstep(0.32, 0.9, sin(vUv.y * 190.0 - uTime * 11.0) * 0.5 + 0.5);
          color += uSunColor * sunGlint * (1.6 + glintBands * 3.4);

          vec3 reflectionTint = mix(vec3(0.07, 0.21, 0.25), vec3(0.46, 0.29, 0.18), pow(max(dot(reflect(-V, N), uSunDir), 0.0), 5.0));
          color = mix(color, reflectionTint, fresnel * 0.72);
          float alpha = clamp(0.58 + thickness * 0.025 + fresnel * 0.26, 0.55, 0.96);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    return material;
  }

  createFoamMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec3 aBank;
        varying vec2 vUv;
        varying float vBank;
        varying float vBranch;
        void main() {
          vUv = uv;
          vBank = abs(aBank.x);
          vBranch = aBank.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime;
        varying vec2 vUv;
        varying float vBank;
        varying float vBranch;
        float hash21(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),f.x),f.y);
        }
        void main() {
          float edgeCoord = abs(vUv.x - 0.5) * 2.0;
          float shore = smoothstep(0.68, 0.98, edgeCoord);
          float drift = noise(vec2(vUv.y * 6.0 - uTime * 1.7, edgeCoord * 4.0 + vBranch));
          float broken = smoothstep(0.42, 0.82, drift + sin(vUv.y * 80.0 - uTime * 6.0) * 0.15);
          float centralRapids = smoothstep(0.73, 0.94, noise(vec2(vUv.y * 17.0 - uTime * 3.0, vBranch * 2.4))) * (1.0 - shore) * smoothstep(0.5, 3.0, vBranch);
          float alpha = (shore * broken * 0.42 + centralRapids * 0.18) * (0.55 + 0.45 * sin(vUv.y * 11.0 + uTime));
          gl_FragColor = vec4(vec3(0.72, 0.96, 0.93), alpha);
        }
      `,
    });
  }

  hideForPrepass() {
    this.waterVisible = this.group.visible;
    this.group.visible = false;
  }

  restoreAfterPrepass() {
    this.group.visible = this.waterVisible;
  }

  update(time, camera) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPos.value.copy(camera.position);
    this.foamMaterial.uniforms.uTime.value = time;
  }

  resize(width, height) {
    this.createTargets(width, height);
  }
}

class WildflowerSystem {
  constructor(scene, heightField, count = WORLD.flowerCount) {
    this.scene = scene;
    this.heightField = heightField;
    this.count = count;
    this.group = new THREE.Group();
    this.material = null;
    scene.add(this.group);
  }

  build() {
    const rng = new XorShift32(WORLD.seed ^ 0xac49d11f);
    const stemGeometry = new THREE.CylinderGeometry(0.016, 0.026, 0.72, 3, 1);
    stemGeometry.translate(0, 0.36, 0);
    const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x264425, roughness: 0.95 });
    const stemMesh = new THREE.InstancedMesh(stemGeometry, stemMaterial, this.count);
    stemMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const petalGeometry = new THREE.CircleGeometry(0.10, 5);
    const petalMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.68,
      emissive: 0x180909,
      emissiveIntensity: 0.14,
    });
    const flowerMesh = new THREE.InstancedMesh(petalGeometry, petalMaterial, this.count);
    flowerMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const dummy = new THREE.Object3D();
    const flowerColor = new THREE.Color();
    const palettes = [
      new THREE.Color(0.58, 0.16, 0.18),
      new THREE.Color(0.80, 0.53, 0.20),
      new THREE.Color(0.45, 0.38, 0.70),
      new THREE.Color(0.80, 0.74, 0.55),
      new THREE.Color(0.72, 0.32, 0.46),
    ];
    let accepted = 0;
    while (accepted < this.count) {
      const z = rng.range(-WORLD.depth * 0.46, WORLD.depth * 0.12);
      const axis = this.heightField.valleyAxis(z);
      const x = axis + rng.signed() * rng.range(25, 115);
      const h = this.heightField.heightAt(x, z);
      if (h < WORLD.waterLevel + 1 || h > 76) continue;
      const riverD = Math.abs(x - this.heightField.braidedCenter(z, 0));
      if (riverD < this.heightField.riverWidth(z) * 1.3) continue;
      const scale = rng.range(0.55, 1.35);
      dummy.position.set(x, h, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(rng.signed() * 0.05, rng.range(0, Math.PI * 2), rng.signed() * 0.05);
      dummy.updateMatrix();
      stemMesh.setMatrixAt(accepted, dummy.matrix);

      dummy.position.y = h + 0.70 * scale;
      dummy.rotation.set(-Math.PI / 2 + rng.signed() * 0.24, rng.range(0, Math.PI * 2), rng.signed() * 0.20);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      flowerMesh.setMatrixAt(accepted, dummy.matrix);
      flowerColor.copy(palettes[rng.int(0, palettes.length)]).multiplyScalar(rng.range(0.75, 1.2));
      flowerMesh.setColorAt(accepted, flowerColor);
      accepted += 1;
    }
    stemMesh.computeBoundingSphere();
    flowerMesh.computeBoundingSphere();
    this.group.add(stemMesh, flowerMesh);
    this.stemMesh = stemMesh;
    this.flowerMesh = flowerMesh;
    return this.group;
  }
}

class AtmosphereParticles {
  constructor(scene, heightField) {
    this.scene = scene;
    this.heightField = heightField;
    this.pollen = null;
    this.insects = null;
    this.dew = null;
    this.materials = [];
  }

  createPointCloud(count, positions, sizes, colors, vertexShaderExtra = '') {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(devicePixelRatio, quality.pixelRatio) },
      },
      vertexShader: /* glsl */`
        attribute float aSize;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uPixelRatio;
        ${vertexShaderExtra}
        void main() {
          vec3 p = position;
          float phase = position.x * 0.17 + position.z * 0.11;
          p.x += sin(uTime * 0.31 + phase) * 0.38;
          p.y += sin(uTime * 0.47 + phase * 1.8) * 0.22;
          p.z += cos(uTime * 0.24 + phase) * 0.30;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (115.0 / max(8.0, -mv.z));
          vColor = color;
          vAlpha = smoothstep(420.0, 40.0, -mv.z);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q);
          float alpha = smoothstep(0.5, 0.05, d) * vAlpha;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = true;
    this.materials.push(material);
    this.scene.add(points);
    return points;
  }

  build() {
    const rng = new XorShift32(WORLD.seed ^ 0x44ec3a11);
    const pollenPositions = [];
    const pollenSizes = [];
    const pollenColors = [];
    for (let i = 0; i < WORLD.pollenCount; i += 1) {
      const z = rng.range(-WORLD.depth * 0.45, WORLD.depth * 0.2);
      const x = this.heightField.valleyAxis(z) + rng.signed() * 145;
      const ground = this.heightField.heightAt(x, z);
      pollenPositions.push(x, ground + rng.range(1.2, 14.0), z);
      pollenSizes.push(rng.range(0.7, 2.2));
      const warm = rng.float();
      pollenColors.push(0.45 + warm * 0.45, 0.42 + warm * 0.34, 0.18 + warm * 0.18);
    }
    this.pollen = this.createPointCloud(WORLD.pollenCount, pollenPositions, pollenSizes, pollenColors);

    const insectPositions = [];
    const insectSizes = [];
    const insectColors = [];
    for (let i = 0; i < WORLD.insectCount; i += 1) {
      const z = rng.range(-WORLD.depth * 0.40, WORLD.depth * 0.08);
      const x = this.heightField.valleyAxis(z) + rng.signed() * 90;
      const ground = this.heightField.heightAt(x, z);
      insectPositions.push(x, ground + rng.range(1.0, 8.0), z);
      insectSizes.push(rng.range(1.4, 3.4));
      insectColors.push(0.36, 0.30, 0.16);
    }
    this.insects = this.createPointCloud(WORLD.insectCount, insectPositions, insectSizes, insectColors);

    const dewCount = 3600;
    const dewPositions = [];
    const dewSizes = [];
    const dewColors = [];
    for (let i = 0; i < dewCount; i += 1) {
      const z = rng.range(-WORLD.depth * 0.45, -WORLD.depth * 0.02);
      const x = this.heightField.valleyAxis(z) + rng.signed() * 120;
      const ground = this.heightField.heightAt(x, z);
      if (ground > 62 || ground < WORLD.waterLevel + 0.8) {
        i -= 1;
        continue;
      }
      dewPositions.push(x, ground + rng.range(0.18, 0.95), z);
      dewSizes.push(rng.range(0.4, 1.55));
      dewColors.push(0.55, 0.88, 0.91);
    }
    this.dew = this.createPointCloud(dewCount, dewPositions, dewSizes, dewColors);
    return { pollen: this.pollen, insects: this.insects, dew: this.dew };
  }

  update(time) {
    for (const material of this.materials) material.uniforms.uTime.value = time;
  }

  resize() {
    for (const material of this.materials) material.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, quality.pixelRatio);
  }
}

class BirdSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.birds = [];
    scene.add(this.group);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      -1.2, 0.12, 0,
      -0.22, -0.04, 0.05,
      0, 0, 0,
      1.2, 0.12, 0,
      0.22, -0.04, 0.05,
    ], 3));
    const material = new THREE.MeshBasicMaterial({ color: 0x161a18, side: THREE.DoubleSide, fog: true });
    const rng = new XorShift32(WORLD.seed ^ 0x51d5a24b);
    for (let i = 0; i < WORLD.birdCount; i += 1) {
      const bird = new THREE.Mesh(geometry, material);
      bird.userData.radius = rng.range(35, 118);
      bird.userData.altitude = rng.range(84, 186);
      bird.userData.speed = rng.range(0.045, 0.11);
      bird.userData.phase = rng.range(0, Math.PI * 2);
      bird.userData.centerX = rng.range(-40, 55);
      bird.userData.centerZ = rng.range(60, 250);
      bird.userData.scale = rng.range(0.32, 1.05);
      bird.scale.setScalar(bird.userData.scale);
      this.group.add(bird);
      this.birds.push(bird);
    }
    return this.group;
  }

  update(time) {
    for (let i = 0; i < this.birds.length; i += 1) {
      const bird = this.birds[i];
      const d = bird.userData;
      const angle = time * d.speed + d.phase;
      const x = d.centerX + Math.cos(angle) * d.radius;
      const z = d.centerZ + Math.sin(angle * 0.86) * d.radius * 0.56;
      const y = d.altitude + Math.sin(angle * 2.4) * 5;
      bird.position.set(x, y, z);
      bird.rotation.y = -angle + Math.PI * 0.5;
      bird.rotation.z = Math.sin(time * 0.65 + d.phase) * 0.12;
      const flap = Math.sin(time * 7.4 + d.phase * 3.0);
      const pos = bird.geometry.attributes.position;
      pos.setY(1, 0.12 + flap * 0.32);
      pos.setY(4, 0.12 + flap * 0.32);
      pos.needsUpdate = true;
    }
  }
}

class FishAndRippleSystem {
  constructor(scene, heightField) {
    this.scene = scene;
    this.heightField = heightField;
    this.group = new THREE.Group();
    this.ripples = [];
    this.droplets = [];
    this.nextJump = 2.0;
    this.rng = new XorShift32(WORLD.seed ^ 0x29a9f33d);
    scene.add(this.group);
  }

  build() {
    const ringGeometry = new THREE.RingGeometry(0.92, 1.0, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xb8fffa,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 12; i += 1) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.userData.birth = -100;
      ring.userData.duration = 2.4;
      this.group.add(ring);
      this.ripples.push(ring);
    }

    const dropGeometry = new THREE.SphereGeometry(0.055, 5, 4);
    const dropMaterial = new THREE.MeshBasicMaterial({ color: 0xc4ffff, transparent: true, opacity: 0.78 });
    for (let i = 0; i < 48; i += 1) {
      const drop = new THREE.Mesh(dropGeometry, dropMaterial);
      drop.visible = false;
      drop.userData.velocity = new THREE.Vector3();
      this.group.add(drop);
      this.droplets.push(drop);
    }
    return this.group;
  }

  triggerJump(time) {
    const z = this.rng.range(-WORLD.depth * 0.32, WORLD.depth * 0.02);
    const x = this.heightField.braidedCenter(z, this.rng.int(0, 3));
    const y = WORLD.waterLevel + (WORLD.depth * 0.52 - z) * 0.0024 + 0.08;
    for (let r = 0; r < 3; r += 1) {
      const ring = this.ripples.find((item) => !item.visible) || this.ripples[r];
      ring.position.set(x, y + r * 0.012, z);
      ring.scale.setScalar(0.2);
      ring.material.opacity = 0.7 / (r + 1);
      ring.userData.birth = time + r * 0.18;
      ring.userData.duration = 2.0 + r * 0.35;
      ring.visible = true;
    }

    for (let i = 0; i < 16; i += 1) {
      const drop = this.droplets.find((item) => !item.visible);
      if (!drop) break;
      drop.visible = true;
      drop.position.set(x, y + 0.2, z);
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(0.7, 2.6);
      drop.userData.velocity.set(Math.cos(a) * speed, this.rng.range(2.0, 4.8), Math.sin(a) * speed);
      drop.userData.birth = time;
    }
    this.nextJump = time + this.rng.range(3.5, 8.5);
  }

  update(time, dt) {
    if (time > this.nextJump) this.triggerJump(time);
    for (const ring of this.ripples) {
      if (!ring.visible) continue;
      const age = time - ring.userData.birth;
      if (age < 0) {
        ring.visible = false;
        continue;
      }
      const t = age / ring.userData.duration;
      if (t >= 1) {
        ring.visible = false;
        continue;
      }
      const scale = 0.3 + t * 8.0;
      ring.scale.setScalar(scale);
      ring.material.opacity = (1 - t) * (1 - t) * 0.42;
    }
    for (const drop of this.droplets) {
      if (!drop.visible) continue;
      drop.userData.velocity.y -= 8.5 * dt;
      drop.position.addScaledVector(drop.userData.velocity, dt);
      if (drop.position.y <= WORLD.waterLevel || time - drop.userData.birth > 2.0) drop.visible = false;
    }
  }
}

class MistSystem {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
  }

  build() {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float uTime;
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),f.x),f.y);
        }
        void main() {
          vec2 p = vUv - 0.5;
          float radial = smoothstep(0.52, 0.08, length(p * vec2(1.0, 1.8)));
          float wisps = noise(vUv * vec2(5.0, 2.0) + vec2(uTime * 0.015, 0.0));
          float alpha = radial * smoothstep(0.25, 0.78, wisps) * 0.12;
          gl_FragColor = vec4(vec3(0.58, 0.77, 0.78), alpha);
        }
      `,
    });
    for (let i = 0; i < 12; i += 1) {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.position.set((i % 3 - 1) * 80, 14 + (i % 4) * 5, -120 + i * 42);
      mesh.scale.set(170 + (i % 3) * 35, 36 + (i % 4) * 8, 1);
      mesh.rotation.y = i * 0.37;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    return this.meshes;
  }

  update(time, camera) {
    for (let i = 0; i < this.meshes.length; i += 1) {
      const mesh = this.meshes[i];
      mesh.material.uniforms.uTime.value = time + i * 4.1;
      mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);
      mesh.position.x += Math.sin(time * 0.018 + i) * 0.008;
    }
  }
}

const GlacialPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uBloomStrength: { value: 0.24 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.46 },
    uSunScreen: { value: new THREE.Vector2(-10, -10) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uExposure;
    uniform float uBloomStrength;
    uniform float uGrain;
    uniform float uVignette;
    uniform vec2 uSunScreen;
    varying vec2 vUv;

    float hash13(vec3 p3) {
      p3 = fract(p3 * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec3 acesFilm(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float glacialLuminance(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    vec3 sampleBloom(vec2 uv) {
      vec2 px = 1.0 / uResolution;
      vec3 sum = vec3(0.0);
      float total = 0.0;
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          vec2 o = vec2(float(x), float(y)) * px * 3.0;
          vec3 c = texture2D(tDiffuse, uv + o).rgb;
          float bright = smoothstep(0.82, 2.8, glacialLuminance(c));
          float weight = 1.0 / (1.0 + length(vec2(float(x), float(y))));
          sum += c * bright * weight;
          total += weight;
        }
      }
      return sum / max(total, 0.001);
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float chromatic = length(fromCenter) * 0.0011;
      vec3 hdr;
      hdr.r = texture2D(tDiffuse, uv + fromCenter * chromatic).r;
      hdr.g = texture2D(tDiffuse, uv).g;
      hdr.b = texture2D(tDiffuse, uv - fromCenter * chromatic).b;
      hdr += sampleBloom(uv) * uBloomStrength;

      float sunDist = length(uv - uSunScreen);
      float sunVeil = exp(-sunDist * 6.5) * smoothstep(0.78, 0.0, sunDist);
      hdr += vec3(1.25, 0.42, 0.10) * sunVeil * 0.13;

      hdr *= uExposure;
      vec3 color = acesFilm(hdr);
      color = pow(color, vec3(1.0 / 2.2));

      float vignette = 1.0 - dot(fromCenter, fromCenter) * uVignette;
      vignette *= smoothstep(1.0, 0.28, length(fromCenter));
      color *= mix(0.72, 1.0, clamp(vignette, 0.0, 1.0));

      float grain = hash13(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
      grain *= uGrain * (0.45 + 0.55 * (1.0 - glacialLuminance(color)));
      color += grain;

      // Very subtle warm/cool split for dawn-grade film response.
      color.r += smoothstep(0.5, 1.0, color.r) * 0.012;
      color.b += smoothstep(0.0, 0.34, 1.0 - color.b) * 0.005;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

class CinematicPost {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const target = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.postPass = new ShaderPass(GlacialPostShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.postPass);
    this.exposure = 1.0;
    this.targetExposure = 1.0;
  }

  resize(width, height) {
    this.composer.setSize(width, height);
    this.postPass.uniforms.uResolution.value.set(
      width * Math.min(devicePixelRatio, quality.pixelRatio),
      height * Math.min(devicePixelRatio, quality.pixelRatio),
    );
  }

  update(time, dt, sunScreen, cameraForward) {
    const lookingAtSun = clamp01(cameraForward.dot(WORLD.sunDirection));
    const horizonAdaptation = clamp01(0.82 + cameraForward.y * 0.22);
    this.targetExposure = THREE.MathUtils.lerp(1.16, 0.78, lookingAtSun) * horizonAdaptation;
    this.exposure = THREE.MathUtils.damp(this.exposure, this.targetExposure, 1.45, dt);
    this.postPass.uniforms.uTime.value = time;
    this.postPass.uniforms.uExposure.value = this.exposure;
    this.postPass.uniforms.uBloomStrength.value = quality.bloom ? 0.26 : 0.08;
    this.postPass.uniforms.uSunScreen.value.copy(sunScreen);
  }

  render() {
    this.composer.render();
  }
}

class ValleyCameraController {
  constructor(camera, domElement, heightField) {
    this.camera = camera;
    this.domElement = domElement;
    this.heightField = heightField;
    this.target = new THREE.Vector3(-2, 26, 80);
    this.targetTarget = this.target.clone();
    this.yaw = 0.03;
    this.pitch = -0.09;
    this.radius = 165;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.targetRadius = this.radius;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.pointerId = null;
    this.idleTime = 0;
    this.camera.position.set(10, 48, -80);
    this.bind();
  }

  bind() {
    this.domElement.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.domElement.setPointerCapture(event.pointerId);
      HINT.style.opacity = '0.15';
    });
    this.domElement.addEventListener('pointermove', (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.targetYaw -= dx * 0.0032;
      this.targetPitch -= dy * 0.0025;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.42, 0.42);
      this.idleTime = 0;
    });
    const end = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.domElement.releasePointerCapture?.(event.pointerId);
      this.pointerId = null;
    };
    this.domElement.addEventListener('pointerup', end);
    this.domElement.addEventListener('pointercancel', end);
    this.domElement.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.targetRadius *= Math.exp(event.deltaY * 0.0008);
      this.targetRadius = THREE.MathUtils.clamp(this.targetRadius, 70, 300);
      this.idleTime = 0;
    }, { passive: false });
    this.domElement.addEventListener('dblclick', () => this.reset());
  }

  reset() {
    this.targetTarget.set(-2, 26, 80);
    this.targetYaw = 0.03;
    this.targetPitch = -0.09;
    this.targetRadius = 165;
  }

  update(dt) {
    this.idleTime += dt;
    if (!this.dragging && this.idleTime > 7) {
      this.targetYaw += dt * 0.006;
      this.targetTarget.x = Math.sin(this.idleTime * 0.035) * 7;
    }
    this.yaw = THREE.MathUtils.damp(this.yaw, this.targetYaw, 5.2, dt);
    this.pitch = THREE.MathUtils.damp(this.pitch, this.targetPitch, 5.2, dt);
    this.radius = THREE.MathUtils.damp(this.radius, this.targetRadius, 4.8, dt);
    this.target.lerp(this.targetTarget, 1 - Math.exp(-dt * 2.2));

    const cp = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * cp * this.radius,
      this.target.y + Math.sin(this.pitch) * this.radius + 30,
      this.target.z - Math.cos(this.yaw) * cp * this.radius,
    );
    const terrainY = this.heightField.heightAt(desired.x, desired.z);
    desired.y = Math.max(desired.y, terrainY + 5.0);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 4.5));
    this.camera.lookAt(this.target);
  }
}

function createProceduralEnvironment(renderer) {
  const width = 256;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  const sunUv = new THREE.Vector2(0.14, 0.34);
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const skyT = Math.pow(1 - v, 0.64);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const i = (y * width + x) * 4;
      const horizon = 1 - Math.abs(v - 0.55) * 1.8;
      const sunDx = Math.min(Math.abs(u - sunUv.x), 1 - Math.abs(u - sunUv.x));
      const sunDy = v - sunUv.y;
      const sun = Math.exp(-(sunDx * sunDx * 620 + sunDy * sunDy * 900));
      const r = 18 + skyT * 55 + Math.max(0, horizon) * 74 + sun * 118;
      const g = 36 + skyT * 68 + Math.max(0, horizon) * 46 + sun * 68;
      const b = 52 + skyT * 86 + Math.max(0, horizon) * 16 + sun * 18;
      data[i] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }
  const equirect = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(equirect).texture;
  equirect.dispose();
  pmrem.dispose();
  return env;
}

class GlacialValleyApp {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();
    this.noise = new ValueNoise2D(WORLD.seed);
    this.heightField = null;
    this.sky = null;
    this.terrain = null;
    this.grass = null;
    this.water = null;
    this.flowers = null;
    this.particles = null;
    this.birds = null;
    this.fish = null;
    this.mist = null;
    this.controller = null;
    this.post = null;
    this.frameCount = 0;
    this.fpsElapsed = 0;
    this.lastTime = 0;
    this.sunWorld = WORLD.sunDirection.clone().multiplyScalar(650);
    this.sunScreen = new THREE.Vector2(-10, -10);
    this.cameraForward = new THREE.Vector3();
    this.running = false;
  }

  async init() {
    setProgress(2, 'Creating linear-HDR WebGL renderer…');
    this.createRenderer();
    this.createScene();
    await nextFrame();

    setProgress(8, 'Synthesizing erosion-weighted height field…');
    this.heightField = new HeightField(this.noise, quality.terrainX, quality.terrainZ);
    await this.heightField.generate((p) => setProgress(8 + p * 21, `Domain-warping alpine ridges… ${Math.round(p * 100)}%`));

    setProgress(30, 'Ray-marching kilometer-scale terrain shadows…');
    await this.heightField.bakeSunShadows(
      (p) => setProgress(30 + p * 23, `Baking soft mountain shadow field… ${Math.round(p * 100)}%`),
      quality.shadowRays,
      quality.shadowSteps,
    );

    setProgress(54, 'Building terrain material strata…');
    this.terrain = new TerrainSystem(this.scene, this.heightField);
    this.terrain.build();
    await nextFrame();

    setProgress(60, 'Growing 85,000 wind-reactive grass blades…');
    this.grass = new GrassSystem(this.scene, this.heightField, this.noise, quality.grassCount);
    await this.grass.build((p) => setProgress(60 + p * 17, `Growing alpine meadow instances… ${Math.round(p * 100)}%`));

    setProgress(78, 'Carving braided glacial channels…');
    this.water = new WaterSystem(this.scene, this.heightField, this.renderer);
    this.water.build(innerWidth, innerHeight);
    this.flowers = new WildflowerSystem(this.scene, this.heightField);
    this.flowers.build();
    await nextFrame();

    setProgress(85, 'Seeding birds, pollen, dew and insects…');
    this.particles = new AtmosphereParticles(this.scene, this.heightField);
    this.particles.build();
    this.birds = new BirdSystem(this.scene);
    this.birds.build();
    this.fish = new FishAndRippleSystem(this.scene, this.heightField);
    this.fish.build();
    this.mist = new MistSystem(this.scene);
    this.mist.build();
    await nextFrame();

    setProgress(92, 'Compiling ACES, adaptive exposure and film response…');
    this.controller = new ValleyCameraController(this.camera, this.renderer.domElement, this.heightField);
    this.post = new CinematicPost(this.renderer, this.scene, this.camera);
    this.post.resize(innerWidth, innerHeight);
    this.bindUI();
    this.onResize();
    await nextFrame();

    setProgress(100, 'GlacialValley ready. Entering dawn light…');
    await new Promise((resolve) => setTimeout(resolve, 280));
    LOADER.classList.add('hidden');
    this.running = true;
    this.clock.start();
    this.animate();
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = true;
    this.renderer.info.autoReset = true;
    APP.appendChild(this.renderer.domElement);
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1720);
    this.scene.fog = new THREE.FogExp2(0x738588, 0.00175);
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, WORLD.cameraNear, WORLD.cameraFar);
    this.camera.position.set(10, 56, -90);
    this.sky = new ProceduralSky(this.scene);

    const hemi = new THREE.HemisphereLight(0xa6cfda, 0x18251d, 1.45);
    const sun = new THREE.DirectionalLight(WORLD.sunColor, 5.2);
    sun.position.copy(WORLD.sunDirection).multiplyScalar(500);
    sun.target.position.set(0, 30, 100);
    this.scene.add(hemi, sun, sun.target);
    this.scene.environment = createProceduralEnvironment(this.renderer);
  }

  bindUI() {
    addEventListener('resize', () => this.onResize());
    QUALITY_BUTTON.addEventListener('click', () => this.cycleQuality());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clock.stop();
      else {
        this.clock.start();
        this.lastTime = this.clock.getElapsedTime();
      }
    });
  }

  cycleQuality() {
    const names = Object.keys(QUALITY_PRESETS);
    const next = (names.indexOf(activeQualityName) + 1) % names.length;
    activeQualityName = names[next];
    quality = QUALITY_PRESETS[activeQualityName];
    QUALITY_BUTTON.textContent = `QUALITY: ${activeQualityName}`;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
    if (this.grass?.mesh) this.grass.mesh.geometry.instanceCount = Math.min(this.grass.count, quality.grassCount);
    this.onResize();
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const width = innerWidth;
    const height = innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
    this.renderer.setSize(width, height);
    this.water?.resize(width, height);
    this.post?.resize(width, height);
    this.particles?.resize();
  }

  renderWaterPrepass() {
    this.water.hideForPrepass();
    const previousTarget = this.renderer.getRenderTarget();
    const previousToneMapping = this.renderer.toneMapping;
    const previousColorSpace = this.renderer.outputColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setRenderTarget(this.water.prepassTarget);
    this.renderer.setClearColor(0x0b1720, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.toneMapping = previousToneMapping;
    this.renderer.outputColorSpace = previousColorSpace;
    this.water.restoreAfterPrepass();
  }

  updateSunScreen() {
    const sunPoint = this.camera.position.clone().add(this.sunWorld);
    sunPoint.project(this.camera);
    this.sunScreen.set(sunPoint.x * 0.5 + 0.5, sunPoint.y * 0.5 + 0.5);
    if (sunPoint.z > 1) this.sunScreen.set(-10, -10);
  }

  animate = () => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    const time = this.clock.getElapsedTime();
    const dt = Math.min(0.05, Math.max(0.001, time - this.lastTime));
    this.lastTime = time;

    this.controller.update(dt);
    this.sky.update(time, this.camera);
    this.grass.update(time, this.camera);
    this.water.update(time, this.camera);
    this.particles.update(time);
    this.birds.update(time);
    this.fish.update(time, dt);
    this.mist.update(time, this.camera);
    this.camera.getWorldDirection(this.cameraForward);
    this.updateSunScreen();
    this.post.update(time, dt, this.sunScreen, this.cameraForward);

    this.renderWaterPrepass();
    this.renderer.setClearColor(0x0b1720, 1);
    this.post.render();
    this.updateFps(dt);
  };

  updateFps(dt) {
    this.frameCount += 1;
    this.fpsElapsed += dt;
    if (this.fpsElapsed >= 0.5) {
      FPS.textContent = `${Math.round(this.frameCount / this.fpsElapsed)} FPS`;
      this.frameCount = 0;
      this.fpsElapsed = 0;
    }
  }
}

async function boot() {
  try {
    if (!window.WebGLRenderingContext) throw new Error('WebGL is not available in this browser.');
    const app = new GlacialValleyApp();
    await app.init();
    window.glacialValley = app;
  } catch (error) {
    console.error(error);
    ERROR.style.display = 'block';
    ERROR.textContent = `GlacialValley initialization failed\n\n${error?.stack || error}`;
    STATUS.textContent = 'Initialization failed — see diagnostics.';
  }
}

boot();
