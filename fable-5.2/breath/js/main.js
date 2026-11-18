// Breath — an interactive journey into the human lungs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Physiology } from './physiology.js';
import { shared, deformPoint, W_LUNG } from './deform.js';
import { Anatomy } from './anatomy.js';
import { Airways } from './airways.js';
import { Alveoli, MICRO_SCALE } from './alveoli.js';
import { BreathAudio } from './audio.js';
import { UI } from './ui.js';
import { setLang } from './i18n.js';

const canvas = document.getElementById('scene');
const phys = new Physiology();
const audio = new BreathAudio();
const smooth = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
const easeIO = (t) => t * t * t * (t * (6 * t - 15) + 10);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------- renderer + post
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 400);
camera.position.set(1.6, 0.9, 15);

const target = new THREE.WebGLRenderTarget(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.75, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// backdrop: a soft studio gradient that warms up as we enter the tissue
const bgMat = new THREE.ShaderMaterial({
  uniforms: { uMicro: { value: 0 }, uAspect: { value: 1 } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }',
  fragmentShader: /* glsl */`
    varying vec2 vUv; uniform float uMicro, uAspect;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 p = vUv; p.x *= uAspect; float d = length(p - vec2(0.0, 0.12));
      vec3 a = mix(vec3(0.050, 0.075, 0.115), vec3(0.115, 0.036, 0.046), uMicro);
      vec3 b = mix(vec3(0.006, 0.008, 0.013), vec3(0.020, 0.006, 0.010), uMicro);
      vec3 c = mix(a, b, smoothstep(0.0, 1.35, d));
      c += (h(gl_FragCoord.xy) - 0.5) / 255.0 * 1.5;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const bg = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), bgMat);
bg.frustumCulled = false; bg.renderOrder = -1000; scene.add(bg);

// studio lighting (plus the Poly Haven HDRI as image-based light)
const key = new THREE.DirectionalLight(0xfff0e4, 1.9); key.position.set(3.5, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb6ff, 1.7); rim.position.set(-5, 2.5, -5.5); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffd6ca, 0.55); fill.position.set(-4, -1.5, 4); scene.add(fill);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a1512, 0.35));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.75; controls.zoomSpeed = 0.9; controls.panSpeed = 0.8;
controls.target.set(0, -0.3, 0); controls.enabled = false; camera.lookAt(controls.target);

// ---------------------------------------------------------------- state
let anatomy, airways, alveoli, ui, track = null;
const state = { level: 0, levelF: 0, flight: null, started: false, hover: null, microFade: 0 };
const POSES = [];           // per level: { u, dir, dist, min, max }
const heroInfo = { tip: new THREE.Vector3(), entry: new THREE.Vector3(), centre: new THREE.Vector3(), prevCentre: new THREE.Vector3() };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function trackPoint(u, out) {
  track.getPointAt(clamp(u, 0, 1), out);
  // the first stretch (chest centre -> larynx) is outside the lungs and must not bob with them
  const w = smooth(u, track.uTop * 0.6, track.uTop);
  if (w > 0) { deformPoint(out, W_LUNG, tmp2); out.lerp(tmp2, w); }
  if (u > track.uTip) out.lerp(heroInfo.centre, smooth(u, track.uTip, 1));
  return out;
}

function buildTrack() {
  const hero = airways.chooseHeroTip(); const nodes = airways.pathTo(hero);
  const tip = airways.pos(hero), back = airways.pos(nodes[Math.max(0, nodes.length - 4)]);
  heroInfo.tip0 = tip.clone(); heroInfo.entry.copy(back).sub(tip).normalize();
  const pts = [new THREE.Vector3(0, -0.35, 0.1), new THREE.Vector3(0, 1.3, 0.25)];
  for (let k = 0; k < nodes.length - 2; k += 3) pts.push(airways.pos(nodes[k]));
  pts.push(tip.clone());
  pts.push(tip.clone().addScaledVector(heroInfo.entry, -15.2 * MICRO_SCALE));
  track = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); track.arcLengthDivisions = 1200; track.updateArcLengths();
  const nearestU = (p) => { let bu = 0, bd = Infinity; for (let i = 0; i <= 800; i++) { const d = track.getPointAt(i / 800, tmp).distanceToSquared(p); if (d < bd) { bd = d; bu = i / 800; } } return bu; };
  track.uTop = nearestU(airways.pos(nodes[0])); track.uTip = nearestU(tip);
  // level 1 looks at a mid-size bronchus on the hero path
  let mid = nodes[Math.floor(nodes.length * 0.5)];
  for (const n of nodes) if (airways.r[n] < 0.05 && airways.gen[n] >= 2) { mid = n; break; }
  const u1 = nearestU(airways.pos(mid));
  const T = track.getTangentAt(u1, new THREE.Vector3());
  const aspectBoost = camera.aspect < 1.25 ? 1.25 / camera.aspect : 1;
  POSES[0] = { u: 0, dir: new THREE.Vector3(0.12, 0.05, 1).normalize(), dist: 10.6 * aspectBoost, min: 2.5, max: 18 };
  POSES[1] = { u: u1, dir: new THREE.Vector3(-0.2, 0.1, 1).normalize(), dist: 5.0 * aspectBoost, min: 0.16, max: 8 };
  const d2 = new THREE.Vector3(0.2, 0.22, 1); d2.addScaledVector(heroInfo.entry, -d2.dot(heroInfo.entry) * 0.7).normalize();
  POSES[2] = { u: 1, dir: d2, dist: 0.031, min: 0.0045, max: 0.075 };
  heroInfo.nodes = nodes; heroInfo.mid = mid; heroInfo.hero = hero;
}

function updateAnchor() {
  deformPoint(heroInfo.tip0, W_LUNG, heroInfo.tip);
  alveoli.setAnchor(heroInfo.tip, heroInfo.entry);
  heroInfo.prevCentre.copy(heroInfo.centre);
  heroInfo.centre.copy(alveoli.group.position).addScaledVector(heroInfo.entry, -2.2 * MICRO_SCALE);
}

// ---------------------------------------------------------------- camera flights
function goLevel(level, duration) {
  if (!track || (state.flight && state.flight.to === level)) return;
  if (!state.flight && level === state.level && duration === undefined) { /* re-centre on the current level */ }
  const from = state.flight ? state.flight.to : state.level;
  const fromF = state.levelF;
  const startTarget = controls.target.clone();
  const dir0 = camera.position.clone().sub(startTarget); const dist0 = dir0.length(); dir0.normalize();
  const uStart = state.flight ? state.flight.uNow : POSES[from].u;
  const offset = startTarget.clone().sub(trackPoint(uStart, new THREE.Vector3()));
  const span = Math.abs(level - fromF);
  state.flight = {
    from, to: level, fromF, t: 0, dur: duration ?? (span > 1.5 ? 8.5 : span > 0.2 ? 5.2 : 1.6),
    uA: uStart, uB: POSES[level].u, uNow: uStart, dir0, dist0, offset,
  };
  controls.enabled = false; state.level = level;
  ui.setLevel(level, true); ui.hideInfo();
}

function updateFlight(dt) {
  const f = state.flight; if (!f) return;
  f.t = Math.min(1, f.t + dt / f.dur);
  const e = easeIO(f.t); const pose = POSES[f.to];
  f.uNow = lerp(f.uA, f.uB, e);
  trackPoint(f.uNow, tmp).addScaledVector(f.offset, 1 - smooth(f.t, 0, 0.45));
  const dir = tmp2.copy(f.dir0).lerp(pose.dir, e).normalize();
  // zoom in log-space so the dive feels uniform across a 300x change of scale
  const dist = Math.exp(lerp(Math.log(f.dist0), Math.log(pose.dist), e));
  controls.target.copy(tmp);
  camera.position.copy(tmp).addScaledVector(dir, dist);
  camera.lookAt(tmp);
  state.levelF = lerp(f.fromF, f.to, e);
  if (f.t >= 1) {
    state.flight = null; state.levelF = f.to;
    controls.minDistance = pose.min; controls.maxDistance = pose.max; controls.enabled = true; controls.update();
    ui.setLevel(f.to, false);
  }
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
const PRIORITY = { airway: 3, pulm: 2, heart: 2, great: 2, diaphragm: 1, lungs: 1, bones: 1, spine: 1, skin: 0 };

function airwayPart(hit) {
  const g = hit.object.geometry; const r = g.attributes._radius.getX(hit.face.a); const x = g.attributes._centre.getX(hit.face.a);
  if (hit.object.name === 'trachea') return 'trachea';
  if (hit.object.name === 'bronchi') return r > 0.052 ? (x < 0 ? 'main_r' : 'main_l') : (r > 0.034 ? 'lobar' : 'segmental');
  return r > 0.011 ? 'segmental' : 'bronchioles';
}

function pick(clientX, clientY) {
  if (!anatomy || state.flight) return null;
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (state.microFade > 0.5) {
    const hits = raycaster.intersectObjects(alveoli.pickables, false); if (!hits.length) return null;
    // translucent walls should not hide the capillaries / cells just behind them
    let hit = hits[0];
    if (hit.object.userData.part === 'alveolus') { const better = hits.find((h) => h.object.userData.part !== 'alveolus' && h.distance - hit.distance < 0.00025); if (better) hit = better; }
    const local = alveoli.group.worldToLocal(hit.point.clone());
    return { part: hit.object.userData.part, object: hit.object, anchor: (out) => alveoli.localToWorld(local, out) };
  }
  const list = anatomy.pickables.filter((m) => m.visible && m.material.userData.u.uFade.value > 0.12);
  const hits = raycaster.intersectObjects(list, false); if (!hits.length) return null;
  let best = null, bp = -1;
  const deep = state.levelF > 0.5;
  for (const h of hits) {
    let p = PRIORITY[h.object.userData.group] ?? 1;
    if (!deep) p = h.object.userData.group === 'skin' ? 0 : 1;
    if (p > bp) { bp = p; best = h; }
  }
  const partKey = best.object.userData.part === 'airway' ? airwayPart(best) : best.object.userData.part;
  return { part: partKey, object: best.object, anchor: best.point.clone() };
}

let down = null, lastMove = 0;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !ui) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); const quick = performance.now() - down.t < 450; down = null;
  if (moved > 5 || !quick) return;
  const hit = pick(e.clientX, e.clientY);
  if (hit) ui.showInfo(hit.part, hit.anchor); else ui.hideInfo();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || !anatomy) return;
  const now = performance.now(); if (now - lastMove < 70) return; lastMove = now;
  const hit = state.started ? pick(e.clientX, e.clientY) : null;
  state.hover = hit && hit.object.material.userData.u ? hit.object.material : null;
  canvas.style.cursor = hit ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerleave', () => { state.hover = null; });

// ---------------------------------------------------------------- labels
function surfacePoint(mesh, x, y) {
  raycaster.set(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
  const hit = raycaster.intersectObject(mesh, false)[0];
  return hit ? hit.point.clone() : new THREE.Vector3(x, y, 0.5);
}
function buildLabels() {
  const P = anatomy.parts; const bb = (n) => anatomy.geo[n].boundingBox;
  const fixed = (p, w) => (out) => deformPoint(p, w, out);
  const node = (i) => (out) => airways.nodeWorld(i, out);
  const centre = (n, fx = 0.5, fy = 0.5) => { const b = bb(n); return surfacePoint(P[n].mesh, lerp(b.min.x, b.max.x, fx), lerp(b.min.y, b.max.y, fy)); };
  const ch = airways.children; const mains = ch[airways.carina].slice();
  const walk = (i, n) => { for (let k = 0; k < n && ch[i].length; k++) i = ch[i].reduce((a, b) => (airways.r[b] > airways.r[a] ? b : a)); return i; };
  const mainR = mains.find((i) => airways.px[walk(i, 6)] < airways.px[airways.carina]) ?? mains[0];
  const mainL = mains.find((i) => i !== mainR) ?? mains[0];
  const hn = heroInfo.nodes; const micro = (v) => (out) => alveoli.localToWorld(v, out);
  // micro labels sit on the alveoli that face the default camera
  const view = POSES[2].dir.clone().applyQuaternion(alveoli.group.quaternion.clone().invert());
  const facing = alveoli.alv.filter((o) => !o.bad).sort((p, q) => q.c.dot(view) - p.c.dot(view));
  const a = facing[0], a2 = facing.find((o) => o.sac !== a.sac) || facing[1];
  const side = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
  const vessel = (oxy, f) => { const p = alveoli.vesselPaths.find((v) => v.oxy === oxy); return p.pts[Math.floor(p.pts.length * f)].clone(); };
  ui.setLabels([
    { part: 'trachea', level: 0, side: 'right', pos: node(Math.floor(airways.carina * 0.45)) },
    { part: 'lung_r', level: 0, side: 'left', pos: fixed(centre('lobe_rul', 0.35, 0.42), W_LUNG), info: 'lobe_rul' },
    { part: 'lung_l', level: 0, side: 'right', pos: fixed(centre('lobe_lul', 0.7, 0.62), W_LUNG), info: 'lobe_lul' },
    { part: 'heart', level: 0, side: 'right', pos: fixed(centre('heart', 0.62, 0.42), [0.72, 0, 0, 0]) },
    { part: 'diaphragm', level: 0, side: 'right', pos: fixed(centre('diaphragm', 0.8, 0.62), W_LUNG) },
    { part: 'ribcage', level: 0, side: 'left', pos: fixed(surfacePoint(P.ribs.mesh, -1.02, -1.02), [0, 1, 1, 0]), info: 'ribs' },
    { part: 'trachea', level: 1, side: 'right', pos: node(Math.floor(airways.carina * 0.6)) },
    { part: 'main_r', level: 1, side: 'left', pos: node(walk(mainR, 5)) },
    { part: 'main_l', level: 1, side: 'right', pos: node(walk(mainL, 8)) },
    { part: 'lobar', level: 1, side: 'left', pos: node(heroInfo.mid) },
    { part: 'segmental', level: 1, side: 'left', pos: node(hn.find((n) => airways.r[n] < 0.024 && airways.gen[n] >= 4) ?? hn[Math.floor(hn.length * 0.6)]) },
    { part: 'bronchioles', level: 1, side: 'right', pos: node(hn[Math.floor(hn.length * 0.9)]) },
    { part: 'alveolus', level: 2, side: 'left', pos: micro(a.c.clone().addScaledVector(view, a.R * 0.85).addScaledVector(side, -a.R * 0.5)) },
    { part: 'capillary', level: 2, side: 'right', pos: micro(a2.c.clone().addScaledVector(view, (a2.R + 0.05) * 0.8).addScaledVector(side, (a2.R + 0.05) * 0.6)) },
    { part: 'duct', level: 2, side: 'right', pos: micro(new THREE.Vector3(0, 5.6, 0).addScaledVector(view, 1.0)) },
    { part: 'arteriole', level: 2, side: 'right', pos: micro(vessel(0, 0.25)) },
    { part: 'venule', level: 2, side: 'left', pos: micro(vessel(1, 0.6)) },
  ]);
}

// ---------------------------------------------------------------- boot
// a dropped connection on a busy static server should not end the visit
async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 300 * (i + 1))); }
  }
}

async function boot() {
  ui = new UI(phys, {
    onLevel: (l) => goLevel(l),
    onLayer: (name, on) => anatomy && anatomy.setLayer(name, on),
    onSound: (on) => audio.setMuted(!on),
    onBegin: () => { state.started = true; audio.start(); goLevel(0, 3.2); },
  });
  // browsers keep audio suspended until a real gesture; wake it on the first one (matters for ?autostart)
  window.addEventListener('pointerdown', () => { if (state.started && audio.ctx && audio.ctx.state === 'suspended' && !audio.muted) audio.ctx.resume(); });
  ui.setScenario('rest');
  ui.setProgress(0.04, 'loadingModels');
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(frame);

  const hdr = await retry(() => new RGBELoader().loadAsync('assets/studio_small_08_1k.hdr'));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(hdr).texture; scene.environmentIntensity = 0.5;
  hdr.dispose(); pmrem.dispose();
  ui.setProgress(0.12);

  anatomy = new Anatomy();
  await retry(() => anatomy.load('assets/thorax.glb', (f) => ui.setProgress(0.12 + 0.55 * f)));
  ui.setProgress(0.7, 'loadingGrow'); await nextFrame();

  const data = await retry(async () => { const r = await fetch('assets/airways.json'); if (!r.ok) throw new Error('airways.json -> HTTP ' + r.status); return r.json(); });
  airways = new Airways(data, anatomy);
  scene.add(anatomy.group, airways.group);
  ui.generations = airways.maxGen;
  ui.setProgress(0.84, 'loadingMicro'); await nextFrame();

  alveoli = new Alveoli(); scene.add(alveoli.group);
  buildTrack(); updateAnchor(); alveoli.group.updateMatrixWorld(true);
  buildLabels();
  ui.setProgress(0.95); await nextFrame();

  // compile every program up-front so the first flight does not hitch
  alveoli.group.visible = true; alveoli.u.uMicro.value = 1;
  try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
  alveoli.group.visible = false; alveoli.u.uMicro.value = 0;
  ui.setProgress(1); await nextFrame();
  ui.ready();
  window.__breath = { phys, state, goLevel, airways, alveoli, anatomy, camera, controls, ui, renderer, POSES };
  // kiosk helpers: ?autostart skips the title card, &level=0..2 and &scenario=... pick the opening view
  const q = new URLSearchParams(location.search);
  if (q.has('autostart')) {
    document.getElementById('btn-begin').click();
    if (q.get('scenario') && q.get('scenario') in { rest: 1, exercise: 1, altitude: 1, asthma: 1, smoker: 1 }) ui.setScenario(q.get('scenario'));
    const lv = +q.get('level'); if (lv === 1 || lv === 2) setTimeout(() => goLevel(lv, 4), 600);
  }
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h); composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- frame
const clock = new THREE.Clock(); let slow = 0, time = 0;
function frame() {
  const raw = clock.getDelta(); const dt = Math.min(raw, 0.05); time += dt;
  phys.update(dt);
  shared.uBreath.value = phys.effective; shared.uConstrict.value = phys.p.constrict; shared.uTime.value = time;
  const w = window.innerWidth, h = window.innerHeight; const fov = THREE.MathUtils.degToRad(camera.fov);

  if (anatomy && airways && alveoli && track) {
    updateAnchor();
    if (state.flight) updateFlight(dt);
    else {
      if (state.level === 2) { tmp.copy(heroInfo.centre).sub(heroInfo.prevCentre); camera.position.add(tmp); controls.target.add(tmp); }
      if (controls.enabled) controls.update();
    }
    const dist = camera.position.distanceTo(controls.target);
    camera.near = clamp(dist * 0.04, 0.0003, 0.08); camera.far = dist * 90 + 2; camera.updateProjectionMatrix();

    state.microFade = smooth(state.levelF, 1.3, 1.86);
    anatomy.update(dt, state.levelF, phys);
    for (const name in anatomy.parts) {
      const p = anatomy.parts[name]; const mats = [p.mat, ...p.extra.map((m) => m.material)];
      for (const m of mats) { const u = m.userData.u.uHover; u.value += ((state.hover === m ? 1 : 0) - u.value) * Math.min(1, dt * 10); }
    }
    airways.updateParticles(dt, phys, state.levelF, h * pixelRatio, fov);
    alveoli.update(dt, phys, state.microFade, dist, h * pixelRatio, fov);
    bgMat.uniforms.uMicro.value = state.microFade; bgMat.uniforms.uAspect.value = camera.aspect;
    bloom.strength = lerp(0.3, 0.42, state.microFade);
    ui.update(dt, phys);
    ui.updateLabels(camera, w, h, state.levelF, !!state.flight || !state.started);
    audio.update(phys, time);
  }
  composer.render(dt);

  // gentle dynamic resolution for slower GPUs
  if (state.started) {
    slow = raw > 0.03 ? slow + raw : Math.max(0, slow - raw * 0.5);
    if (slow > 2.5 && pixelRatio > 0.8) { pixelRatio = Math.max(0.8, pixelRatio * 0.8); slow = 0; onResize(); }
  }
}

setLang(new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en');
boot().catch((err) => { console.error(err); document.getElementById('fatal').hidden = false; document.getElementById('fatal').textContent = 'Could not start: ' + (err && err.message ? err.message : err); });
