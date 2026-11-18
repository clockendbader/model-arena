// ============================================================================
// ghost.js — records a run as compact samples and replays the best one as a
// translucent animated runner (the rigged Quaternius character).
// ============================================================================
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const RATE = 15;
const CODES = { ground: 0, air: 1, slide: 2, wallrun: 3, climb: 4, mantle: 5, vault: 6, zip: 7, dead: 1 };
const FIELDS = 6;                      // x, y, z, yaw, code, speed

export class GhostRecorder {
  constructor() { this.reset(); }
  reset() { this.data = []; this.acc = 0; }
  record(dt, pl) {
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    this.acc -= 1 / RATE;
    let code = CODES[pl.mode] ?? 0;
    if (pl.rollT > 0) code = 8;
    if (pl.mode === 'wallrun' && pl.wr) code = 3 + (pl._wallSide(pl.wr) > 0 ? 6 : 0);     // 3 = wall on the left, 9 = on the right
    const sp = pl.speedH;
    const yaw = sp > 1.5 && pl.mode !== 'climb' && pl.mode !== 'mantle' ? Math.atan2(pl.vel.x, pl.vel.z) : Math.atan2(pl.fx, pl.fz);
    const r = (v) => Math.round(v * 100) / 100;
    this.data.push(r(pl.pos.x), r(pl.pos.y), r(pl.pos.z), r(yaw), code, Math.round(sp * 10) / 10);
  }
}

/** rotation-only clips so bone lengths always come from the character's own rig */
function prepClip(clip) {
  const c = clip.clone();
  c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
  return c;
}

export class Ghost {
  constructor(assets, scene) {
    this.root = new THREE.Group();
    const model = this.model = SkeletonUtils.clone(assets.runner.scene);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b1b22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, roughness: 1, metalness: 0 });
    this.fade = { value: 1 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGhostFade = this.fade;
      sh.fragmentShader = 'uniform float uGhostFade;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float gfr = pow(clamp(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
        gl_FragColor = vec4(vec3(0.35, 0.95, 1.25) * (0.10 + gfr * 1.5) * uGhostFade, 1.0);`);
    };
    model.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; o.castShadow = false; o.renderOrder = 5; } });
    this.root.add(model); this.root.visible = false;
    scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(model);
    const A = assets.anims, act = (n, loop = true) => { const a = this.mixer.clipAction(prepClip(A[n])); if (!loop) { a.setLoop(THREE.LoopRepeat); } a.play(); a.setEffectiveWeight(0); return a; };
    this.actions = {
      idle: act('Idle_Loop'), jog: act('Jog_Fwd_Loop'), sprint: act('Sprint_Loop'), air: act('Jump_Loop'), slide: act('Slide_Loop'),
      climb: act('ClimbUp_1m'), roll: act('Roll'), vault: act('NinjaJump_Idle_Loop'),
    };
    this.actions.sprint.timeScale = 1.25; this.actions.climb.timeScale = 1.4; this.actions.roll.timeScale = 2.2;
    this.weights = {}; for (const k in this.actions) this.weights[k] = 0;
    this.data = null; this.lean = 0;
  }

  setRun(data) { this.data = data && data.length >= FIELDS * 2 ? data : null; this.root.visible = false; }

  update(dt, t, active, camPos) {
    const d = this.data;
    if (!d || !active) { this.root.visible = false; return; }
    const n = d.length / FIELDS, ft = t * RATE, i0 = Math.floor(ft);
    if (i0 >= n - 1 || t < 0) { this.root.visible = false; return; }
    const a = i0 * FIELDS, b = a + FIELDS, k = ft - i0;
    this.root.visible = true;
    this.root.position.set(d[a] + (d[b] - d[a]) * k, d[a + 1] + (d[b + 1] - d[a + 1]) * k, d[a + 2] + (d[b + 2] - d[a + 2]) * k);
    let dy = d[b + 3] - d[a + 3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const code = d[a + 4], speed = d[a + 5];
    let anim = 'idle', lean = 0, yOff = 0;
    if (code === 0) anim = speed > 7 ? 'sprint' : speed > 1 ? 'jog' : 'idle';
    else if (code === 1) anim = 'air';
    else if (code === 2) anim = 'slide';
    else if (code === 3 || code === 9) { anim = 'sprint'; lean = code === 3 ? 0.42 : -0.42; }
    else if (code === 4 || code === 5) anim = 'climb';
    else if (code === 6) anim = 'vault';
    else if (code === 7) { anim = 'air'; yOff = 0.15; }
    else if (code === 8) anim = 'roll';
    for (const key in this.actions) {
      const w = this.weights[key] += ((key === anim ? 1 : 0) - this.weights[key]) * Math.min(1, dt * 12);
      this.actions[key].setEffectiveWeight(w);
    }
    this.lean += (lean - this.lean) * Math.min(1, dt * 8);
    // fade out when the ghost is right on top of the camera (start of a run, or a dead heat)
    if (camPos) {
      const p = this.root.position, dist = Math.hypot(p.x - camPos.x, p.y + 1 - camPos.y, p.z - camPos.z);
      this.fade.value = Math.max(0, Math.min(1, (dist - 1.6) / 3.5));
      if (this.fade.value <= 0.001) { this.root.visible = false; return; }
    }
    this.root.rotation.set(0, d[a + 3] + dy * k, 0);
    this.model.rotation.z = this.lean; this.model.position.y = yOff;
    this.mixer.update(dt);
  }
}
