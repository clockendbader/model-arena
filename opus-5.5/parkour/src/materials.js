// ---------------------------------------------------------------------------
// Materials: PBR texture sets (Poly Haven), facade shader with procedural
// windows (reflective glass + some lit interiors), emissive sign textures and
// the runner's-vision highlight variants.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const TEX_DIR = 'assets/textures/';

export class MaterialLibrary {
  constructor(renderer, manager) {
    this.loader = new THREE.TextureLoader(manager);
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.sets = {};
    this.m = {};
    this.rvPairs = [];      // [mesh, normalMat, highlightMat]
    this.rvMats = new Map();
  }

  loadSet(name) {
    if (this.sets[name]) return this.sets[name];
    const mk = (file, srgb) => {
      const t = this.loader.load(`${TEX_DIR}${name}/${file}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.maxAniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const set = { diff: mk('diff', true), nor: mk('nor', false), arm: mk('arm', false) };
    this.sets[name] = set;
    return set;
  }

  /** PBR material from a texture set; `size` = metres covered by one tile. */
  pbr(setName, { size = 2, color = 0xffffff, rough = 1, metal = 1, normalScale = 1, aoIntensity = 1, envIntensity = 1 } = {}) {
    const s = this.loadSet(setName);
    const clone = (t) => { const c = t.clone(); c.repeat.set(1 / size, 1 / size); c.needsUpdate = true; return c; };
    const mat = new THREE.MeshStandardMaterial({
      map: clone(s.diff), normalMap: clone(s.nor), aoMap: clone(s.arm), roughnessMap: clone(s.arm), metalnessMap: clone(s.arm),
      color, roughness: rough, metalness: metal, aoMapIntensity: aoIntensity, envMapIntensity: envIntensity,
    });
    mat.normalScale.set(normalScale, normalScale);
    return mat;
  }

  build() {
    const m = this.m;
    m.roof = this.pbr('concrete_floor_worn_001', { size: 3.5, color: 0xd8d0c8 });
    m.roofTar = this.pbr('asphalt_02', { size: 4, color: 0x9a9590 });
    m.concrete = this.pbr('concrete_wall_003', { size: 3, color: 0xe0d8d0 });
    m.plaster = this.pbr('plaster_grey_04', { size: 3, color: 0xe8e0d6 });
    m.brick = this.pbr('red_brick_03', { size: 2.2 });
    m.metal = this.pbr('metal_plate', { size: 2, color: 0xb8bcc0, envIntensity: 1.2 });
    m.metalDark = this.pbr('metal_plate', { size: 2, color: 0x4a4e54, envIntensity: 1.1 });
    m.rust = this.pbr('rusty_metal_02', { size: 2.5 });
    m.corrugated = this.pbr('corrugated_iron', { size: 2, color: 0xc8ccd0 });
    m.panel = this.pbr('blue_metal_plate', { size: 2.5, color: 0xb0b8c4 });
    m.asphalt = this.pbr('asphalt_02', { size: 6, color: 0x80807e });
    m.paintYellow = this.pbr('metal_plate', { size: 2, color: 0xe0a020, metal: 0.4, rough: 0.8 });
    m.paintRed = this.pbr('metal_plate', { size: 2, color: 0xb83a22, metal: 0.4, rough: 0.8 });
    m.cable = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.55, metalness: 0.6 });
    m.steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.9 });
    m.darkGlass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.08, metalness: 0.9 });

    // facades
    m.facadeBrick = this.facade('red_brick_03', { size: 2.2, bay: 3.0, floor: 3.4, rect: [0.2, 0.28, 0.8, 0.86], glass: 0x5a6c7c });
    m.facadeConcrete = this.facade('concrete_wall_003', { size: 3, bay: 2.6, floor: 3.4, rect: [0.14, 0.3, 0.86, 0.88], glass: 0x607888, color: 0xd9d2c8 });
    m.facadePlaster = this.facade('plaster_grey_04', { size: 3, bay: 3.2, floor: 3.4, rect: [0.22, 0.26, 0.78, 0.84], glass: 0x506274, color: 0xe6d8c6 });
    m.facadeTower = this.facade('blue_metal_plate', { size: 2.5, bay: 1.6, floor: 3.6, rect: [0.06, 0.1, 0.94, 0.95], glass: 0x8aa0b4, color: 0x9aa4b0, lit: 0.1 });
    m.facadeTowerWarm = this.facade('concrete_wall_003', { size: 3, bay: 2.0, floor: 3.6, rect: [0.1, 0.16, 0.9, 0.94], glass: 0xa89888, color: 0xc8beb0, lit: 0.12 });
    m.facadeList = [m.facadeBrick, m.facadeConcrete, m.facadePlaster, m.facadeTower, m.facadeTowerWarm];

    // runner's vision: warm red highlight
    m.rvEdge = new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xff2a10, emissiveIntensity: 2.2, roughness: 0.6 });
    return m;
  }

  /** Facade material: base PBR + procedural windows driven by uv (metres) and aWin attribute. */
  facade(setName, { size, bay, floor, rect, glass, color = 0xffffff, lit = 0.1 }) {
    const mat = this.pbr(setName, { size, color });
    mat.userData.facade = true;
    const uniforms = {
      uWinSize: { value: new THREE.Vector2(bay, floor) },
      uWinRect: { value: new THREE.Vector4(...rect) },
      uGlass: { value: new THREE.Color(glass) },
      uLit: { value: lit },
    };
    mat.userData.winUniforms = uniforms;
    mat.customProgramCacheKey = () => 'facade';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aWin;\nvarying vec2 vWin;\nvarying vec2 vWinUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWin = aWin;\nvWinUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vWin;
varying vec2 vWinUv;
uniform vec2 uWinSize;
uniform vec4 uWinRect;
uniform vec3 uGlass;
uniform float uLit;
float winHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float winMask = 0.0; float winH = 0.0; float winH2 = 0.0; float winFrame = 0.0;
if (vWin.x > 0.5) {
  vec2 cell = vWinUv / uWinSize;
  vec2 wid = floor(cell);
  vec2 f = fract(cell);
  float inX = step(uWinRect.x, f.x) * step(f.x, uWinRect.z);
  float inY = step(uWinRect.y, f.y) * step(f.y, uWinRect.w);
  winMask = inX * inY;
  float fx = step(uWinRect.x - 0.035, f.x) * step(f.x, uWinRect.z + 0.035);
  float fy = step(uWinRect.y - 0.06, f.y) * step(f.y, uWinRect.w + 0.03);
  winFrame = fx * fy - winMask;
  winH = winHash(wid + vWin.y * 13.17);
  winH2 = winHash(wid * 1.7 + vWin.y * 3.1 + 7.0);
  // sill shadow just under the window and a ledge band every floor
  float sill = step(uWinRect.y - 0.12, f.y) * step(f.y, uWinRect.y - 0.06) * fx;
  diffuseColor.rgb *= 1.0 - 0.45 * sill;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.32, winFrame);
  float band = step(0.0, f.y) * step(f.y, 0.035);
  diffuseColor.rgb *= 1.0 - 0.35 * band;
  vec3 g = uGlass * (0.4 + 0.4 * winH);
  // blinds: some windows have pale blinds pulled partly down
  float blind = step(0.72, winH2) * step(1.0 - (f.y - uWinRect.y) / (uWinRect.w - uWinRect.y), 0.45 + 0.4 * winH);
  g = mix(g, vec3(0.42, 0.38, 0.33), blind * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, g, winMask);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.04 + 0.12 * winH, winMask);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.92, winMask);`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
vec3 winGeoNormal = normal;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, winGeoNormal, winMask));`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (winMask > 0.5) {
  float on = step(1.0 - uLit, winH2);
  vec3 warm = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.85, 0.6), winH);
  totalEmissiveRadiance += on * warm * (0.35 + 0.7 * winH);
}`);
    };
    return mat;
  }

  /** Register a mesh for runner's vision (swaps to a red-glowing variant). */
  markRunnerVision(mesh) {
    const base = mesh.material;
    let hi = this.rvMats.get(base);
    if (!hi) {
      hi = base.clone();
      hi.color = base.color.clone().lerp(new THREE.Color(0xff4a2a), 0.55);
      hi.emissive = new THREE.Color(0xff2e12);
      hi.emissiveIntensity = 0.32;
      hi.emissiveMap = null;
      if (base.onBeforeCompile && base.userData.facade) { hi.onBeforeCompile = base.onBeforeCompile; hi.customProgramCacheKey = base.customProgramCacheKey; }
      this.rvMats.set(base, hi);
    }
    this.rvPairs.push([mesh, base, hi]);
  }

  setRunnerVision(on) {
    for (const [mesh, base, hi] of this.rvPairs) mesh.material = on ? hi : base;
  }
}

// ---------------------------------------------------------------------------
// Billboard art: glowing abstract shapes (original, no text / brands)
// ---------------------------------------------------------------------------
export function makeBillboardTexture(seed, w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const palettes = [
    ['#0b0f2a', '#ff3d7f', '#ffb347', '#40e0ff'],
    ['#100a1c', '#7cff6b', '#00c2ff', '#ffffff'],
    ['#1a0b06', '#ff7a18', '#ffd23f', '#ff2e63'],
    ['#05141a', '#00f5d4', '#9b5de5', '#fee440'],
    ['#140716', '#f15bb5', '#00bbf9', '#fee440'],
  ];
  const p = palettes[seed % palettes.length];
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, p[0]); grad.addColorStop(1, '#000000');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const style = seed % 4;
  for (let i = 0; i < 14; i++) {
    const col = p[1 + Math.floor(rnd() * 3)];
    g.strokeStyle = col; g.fillStyle = col;
    g.globalAlpha = 0.35 + rnd() * 0.5;
    g.shadowColor = col; g.shadowBlur = 24;
    if (style === 0) {
      g.lineWidth = 4 + rnd() * 10;
      g.beginPath(); g.arc(w * (0.2 + rnd() * 0.6), h * (0.2 + rnd() * 0.6), 20 + rnd() * 90, 0, Math.PI * 2); g.stroke();
    } else if (style === 1) {
      const y = rnd() * h; g.fillRect(0, y, w, 4 + rnd() * 18);
    } else if (style === 2) {
      g.lineWidth = 6 + rnd() * 8;
      g.beginPath();
      const x = rnd() * w; g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 300, h); g.stroke();
    } else {
      const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 60;
      g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); g.fill();
    }
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-over';
  // frame glow
  g.strokeStyle = p[3]; g.lineWidth = 6; g.globalAlpha = 0.8; g.strokeRect(6, 6, w - 12, h - 12);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft radial sprite used by particles and glows. */
export function makeGlowTexture(size = 64, hard = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
