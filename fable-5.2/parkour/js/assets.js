// ============================================================================
// assets.js — loads every external asset (HDRI, PBR texture sets, facade
// materials, glTF props, the rigged character) and reports progress.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const A = 'assets/';
export const TEXTURE_SETS = ['concrete_floor_worn_001', 'concrete_floor_02', 'gravel_concrete_03', 'asphalt_02', 'bitumen', 'red_brick_03',
  'concrete_wall_008', 'painted_plaster_wall', 'metal_plate_02', 'blue_metal_plate', 'corrugated_iron_02', 'rusty_metal_02', 'weathered_brown_planks'];
// tile = real-world size of one texture repeat (m), cols = window bays per repeat
export const FACADES = {
  Facade001: { tile: [16, 34], cols: 10, maps: ['metalness'] },
  Facade005: { tile: [26, 44], cols: 20, maps: ['metalness'] },
  Facade006: { tile: [22.4, 27.2], cols: 14, maps: ['metalness'] },
  Facade018A: { tile: [16.8, 19.8], cols: 6, maps: ['metalness', 'emission'] },
  Facade019A: { tile: [18, 19.8], cols: 6, maps: ['metalness', 'emission'] },
  Facade020A: { tile: [18, 19.8], cols: 6, maps: ['metalness', 'emission'] },
  Facade012: { tile: [48, 90], cols: 32, maps: ['emission'] },
  Facade009: { tile: [36, 40], cols: 12, maps: ['metalness', 'emission'] },
};
export const MODELS = ['exterior_aircon_unit', 'modular_airduct_rectangular_01', 'modular_chainlink_fence', 'modular_industrial_pipes_01', 'utility_box_01',
  'utility_box_02', 'wooden_crate_02', 'barrel_03', 'Barrel_01', 'propane_tank', 'portable_generator', 'cement_bag', 'modular_fire_escape', 'old_tyre'];

/** run `fn` again a few times before giving up — a cold local server can drop the odd request */
async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await new Promise(r => setTimeout(r, 150 + i * 250)); }
  }
}

export async function loadAssets(renderer, onProgress) {
  const failed = new Set();
  const manager = new THREE.LoadingManager();
  manager.onError = (url) => failed.add(url);
  const texLoader = new THREE.TextureLoader(manager);
  const draco = new DRACOLoader(manager).setDecoderPath('vendor/three/addons/libs/draco/gltf/');
  const gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const out = { tex: {}, facades: {}, models: {}, anims: {} };

  // ---- job queue with limited concurrency and a progress count
  const queue = [];
  let done = 0;
  const job = (fn) => queue.push(fn);
  const tex = (url, srgb, assign) => job(async () => {
    // network through the gated fetch (see boot.js), decode from a local blob URL
    const t = await retry(async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const blobUrl = URL.createObjectURL(await res.blob());
      try { return await texLoader.loadAsync(blobUrl); } finally { URL.revokeObjectURL(blobUrl); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    assign(t);
  });
  /** glTF with external buffers/textures: reload it if any of its files failed */
  const gltf = (url, dir, assign) => job(async () => {
    for (let i = 0; ; i++) {
      for (const u of [...failed]) if (u.includes(dir)) failed.delete(u);
      const g = await retry(() => gltfLoader.loadAsync(url), 2);
      let bad = false;
      for (const u of failed) if (u.includes(dir)) bad = true;
      if (!bad || i >= 3) { assign(g); return; }
      await new Promise(r => setTimeout(r, 300 + i * 300));
    }
  });

  for (const n of TEXTURE_SETS) {
    const set = out.tex[n] = {}, d = `${A}textures/${n}/`;
    tex(d + 'diff.jpg', true, t => { set.map = t; }); tex(d + 'nor.jpg', false, t => { set.normalMap = t; }); tex(d + 'arm.jpg', false, t => { set.arm = t; });
  }
  for (const [n, f] of Object.entries(FACADES)) {
    const d = `${A}facades/${n}/`;
    const fa = out.facades[n] = { ...f, metalnessMap: null, emissiveMap: null };
    tex(d + 'color.jpg', true, t => { fa.map = t; }); tex(d + 'normal.jpg', false, t => { fa.normalMap = t; }); tex(d + 'roughness.jpg', false, t => { fa.roughnessMap = t; });
    if (f.maps.includes('metalness')) tex(d + 'metalness.jpg', false, t => { fa.metalnessMap = t; });
    if (f.maps.includes('emission')) tex(d + 'emission.jpg', true, t => { fa.emissiveMap = t; });
  }
  job(async () => { out.sky = await retry(() => new RGBELoader(manager).loadAsync(`${A}sky/kloppenheim_06_puresky_4k.hdr`)); });
  for (const m of MODELS) gltf(`${A}models/${m}/${m}.gltf`, `models/${m}/`, g => { out.models[m] = g; });
  gltf(`${A}character/runner.glb`, 'character/runner.glb', g => { out.runner = g; });
  for (const i of [1, 2]) gltf(`${A}character/runner_anims_${i}.glb`, `character/runner_anims_${i}`, g => { for (const c of g.animations) out.anims[c.name] = c; });

  const total = queue.length;
  const worker = async () => { while (queue.length) { await queue.shift()(); onProgress(++done / total); } };
  await Promise.all(Array.from({ length: 5 }, worker));
  return out;
}
