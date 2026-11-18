// ---------------------------------------------------------------------------
// Ghost: records the run at 20 Hz and plays back the best run with the rigged
// Sophia character (GDQuest, CC-BY 4.0) as a translucent runner.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { MODE_CODES } from './player.js';

export const GHOST_DT = 0.05;

export class GhostRecorder {
  constructor() { this.reset(); }
  reset() { this.data = []; this.acc = 0; this.t = 0; }
  update(dt, p) {
    this.t += dt;
    this.acc += dt;
    while (this.acc >= GHOST_DT) {
      this.acc -= GHOST_DT;
      const st = p.st;
      this.data.push(
        Math.round(st.x * 100) / 100, Math.round(st.y * 100) / 100, Math.round(st.z * 100) / 100,
        Math.round(p.yaw * 100) / 100, MODE_CODES[p.mode] ?? 0, p.mode === 'wallrun' ? p.wallSide : 0,
      );
    }
  }
}

const STRIDE = 6;

export class GhostRunner {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.data = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.enabled = true;
    this.trail = [];
  }

  async load(loader) {
    try {
      const gltf = await loader.loadAsync('assets/models/sophia.glb');
      const model = gltf.scene;
      const ghostMat = new THREE.MeshStandardMaterial({
        color: 0x9fe8ff, emissive: 0x2fb8ff, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.1,
        transparent: true, opacity: 0.42, depthWrite: false,
      });
      model.traverse((o) => {
        if (o.isMesh) {
          o.material = ghostMat;
          o.castShadow = false;
          o.frustumCulled = false;
          o.renderOrder = 5;
        }
      });
      model.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(model);
      const h = bb.max.y - bb.min.y;
      const s = 1.72 / (h || 1);
      model.scale.setScalar(s);
      model.position.y = -bb.min.y * s;
      this.inner = new THREE.Group();
      this.inner.add(model);
      this.root.add(this.inner);
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) {
        const a = this.mixer.clipAction(clip);
        this.actions[clip.name] = a;
      }
      for (const n of ['Jump', 'EdgeGrab']) {
        if (this.actions[n]) { this.actions[n].setLoop(THREE.LoopOnce, 1); this.actions[n].clampWhenFinished = true; }
      }
      this.play('Idle');
      this.ready = true;
    } catch (e) {
      console.warn('ghost model failed', e);
      this.ready = false;
    }
  }

  setData(arr) { this.data = arr && arr.length >= STRIDE ? arr : null; }

  play(name, fade = 0.18) {
    const a = this.actions[name];
    if (!a || this.current === a) return;
    a.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  /** t = current run time. */
  update(dt, t, playerPos) {
    if (!this.ready || !this.data || !this.enabled) { this.root.visible = false; return; }
    const n = this.data.length / STRIDE;
    const f = t / GHOST_DT;
    let i = Math.floor(f);
    if (i >= n - 1) { i = n - 2; }
    if (i < 0) i = 0;
    const k = Math.min(1, Math.max(0, f - i));
    const d = this.data;
    const a = i * STRIDE, b = (i + 1) * STRIDE;
    const x = d[a] + (d[b] - d[a]) * k;
    const y = d[a + 1] + (d[b + 1] - d[a + 1]) * k;
    const z = d[a + 2] + (d[b + 2] - d[a + 2]) * k;
    let dyaw = d[b + 3] - d[a + 3];
    if (dyaw > Math.PI) dyaw -= Math.PI * 2; if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const yaw = d[a + 3] + dyaw * k;
    const mode = d[a + 4];
    const side = d[a + 5];
    const vx = (d[b] - d[a]) / GHOST_DT, vy = (d[b + 1] - d[a + 1]) / GHOST_DT, vz = (d[b + 2] - d[a + 2]) / GHOST_DT;
    const hs = Math.hypot(vx, vz);

    this.root.visible = true;
    this.root.position.set(x, y, z);
    // face movement direction when moving, otherwise camera yaw
    let face = yaw;
    if (hs > 1.0) face = Math.atan2(-vx, -vz);
    let cur = this.root.rotation.y;
    let diff = face - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.root.rotation.y = cur + diff * Math.min(1, dt * 12);
    this.inner.rotation.set(0, Math.PI, 0);
    this.inner.rotation.z = 0;

    // fade out when the player is right inside the ghost
    const dist = playerPos ? Math.hypot(playerPos.x - x, playerPos.y - y, playerPos.z - z) : 10;
    const op = Math.min(0.42, Math.max(0.05, (dist - 0.8) * 0.25));
    this.root.traverse((o) => { if (o.isMesh) o.material.opacity = op; });

    let anim = 'Idle', scale = 1;
    switch (mode) {
      case MODE_CODES.ground: anim = hs > 1 ? 'Run' : 'Idle'; scale = hs > 1 ? Math.max(0.6, hs / 7.5) : 1; break;
      case MODE_CODES.air: anim = vy > 0.5 ? 'Jump' : 'Fall'; break;
      case MODE_CODES.wallrun: anim = side > 0 ? 'RunTiltR' : 'RunTiltL'; scale = 1.3; this.inner.rotation.z = side * 0.35; break;
      case MODE_CODES.climb: case MODE_CODES.mantle: anim = 'EdgeGrab'; break;
      case MODE_CODES.vault: case MODE_CODES.roll: anim = 'Jump'; break;
      case MODE_CODES.slide: anim = 'Fall'; this.inner.rotation.x = 0; break;
      case MODE_CODES.zip: anim = 'EdgeGrab'; break;
      default: break;
    }
    if (!this.actions[anim]) anim = this.actions.Run ? 'Run' : Object.keys(this.actions)[0];
    this.play(anim);
    if (this.current) this.current.timeScale = scale;
    this.mixer.update(dt);
  }
}
