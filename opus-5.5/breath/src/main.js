import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Physiology, SCENARIOS } from './physiology.js';
import { Anatomy } from './anatomy.js';
import { Airways } from './airways.js';
import { AlveolusScene } from './alveolus.js';
import { UI } from './ui.js';
import { BreathAudio } from './audio.js';
import { breatheLungJS } from './breathing.js';

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.0005, 40);
const BODY_POSE = { pos: new THREE.Vector3(0.34, 0.03, 1.0), target: new THREE.Vector3(0.0, -0.045, 0) };
const START_POSE = { pos: new THREE.Vector3(0.9, 0.35, 2.4), target: new THREE.Vector3(0, 0.0, 0) };
camera.position.copy(START_POSE.pos);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.copy(START_POSE.target);
controls.minDistance = 0.12; controls.maxDistance = 2.6;
controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.8; controls.panSpeed = 0.6;

function backdrop(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 230, 20, 256, 256, 380);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const bodyScene = new THREE.Scene();
bodyScene.background = backdrop('#152031', '#03050a');
const key = new THREE.DirectionalLight(0xfff0e6, 1.9); key.position.set(0.8, 1.2, 1.6);
const rim = new THREE.DirectionalLight(0x7fb0ff, 2.2); rim.position.set(-1.2, 0.6, -1.4);
const fill = new THREE.HemisphereLight(0xdfe8ff, 0x20141a, 0.35);
bodyScene.add(key, rim, fill);

const micro = new AlveolusScene();
micro.scene.background = backdrop('#2a1520', '#07040a');

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
composer.setPixelRatio(pixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
const renderPass = new RenderPass(bodyScene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ state
const phys = new Physiology();
const anatomy = new Anatomy();
const airways = new Airways();
const audio = new BreathAudio();
let mode = 'body';        // body | airways | alveolus
let activeScene = bodyScene;
let busy = true;
let flight = null;        // queue of flight segments
let ride = 0, rideTarget = 0;
const lastOffset = new THREE.Vector3();
let flightPath = null;
const fadeEl = document.getElementById('fade');
let fadeValue = 0;

const ui = new UI({
  level: l => goTo(l),
  scenario: s => setScenario(s),
  rate: v => phys.setRate(v),
  depth: v => phys.setDepth(v),
  sound: on => audio.setEnabled(on),
  xray: on => anatomy.setXray(on),
  pickLabel: id => ui.showInfo(id),
});

function setScenario(name) {
  phys.setScenario(name);
  ui.setScenario(name);
  ui.setSliders(SCENARIOS[name].rr, SCENARIOS[name].vt);
}

// ------------------------------------------------------------------ flights
// A flight is a list of segments; each returns an *undeformed* camera pose for t∈[0,1].
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

function currentPose() {
  return { pos: camera.position.clone().sub(lastOffset), target: controls.target.clone().sub(lastOffset) };
}
function blendSegment(from, to, dur, extra = {}) {
  return { dur, pose: t => { const e = ease(t); return { pos: from.pos.clone().lerp(to.pos, e), target: from.target.clone().lerp(to.target, e) }; }, ...extra };
}

function runFlight(segments, done) {
  busy = true; ui.setBusy(true);
  controls.enabled = false;
  flight = { segments, i: 0, t: 0, done };
  segments[0].onStart?.();
}

function stepFlight(dt) {
  if (!flight) return;
  const seg = flight.segments[flight.i];
  flight.t += dt / seg.dur;
  const t = Math.min(1, flight.t);
  const p = seg.pose(t);
  camera.position.copy(p.pos);
  controls.target.copy(p.target);
  seg.onUpdate?.(t);
  if (flight.t >= 1) {
    seg.onEnd?.();
    flight.i++; flight.t = 0;
    if (flight.i >= flight.segments.length) {
      const done = flight.done; flight = null;
      controls.enabled = true; busy = false; ui.setBusy(false);
      done?.();
      if (!busy && pendingLevel) { const l = pendingLevel; pendingLevel = null; goTo(l); }
    } else flight.segments[flight.i].onStart?.();
  }
}

// airway path helpers (undeformed scene coordinates)
let pathCurve, pathRadius, pathLen;
let currentRouteGen = 0;
function preparePath() {
  flightPath = airways.route;
  pathCurve = new THREE.CatmullRomCurve3(flightPath.pts, false, 'centripetal', 0.5);
  pathLen = pathCurve.getLength();
  const radii = [airways.rad[0], ...flightPath.chain.map(i => airways.rad[i])];
  const gens = [0, ...flightPath.chain.map(i => airways.gen[i])];
  // The curve is parameterised by control point (one unit per branch), so every
  // generation gets equal flight time: fast down the trachea, slow in the bronchioles.
  const nSeg = flightPath.pts.length - 1;
  pathRadius = u => {
    const k = Math.min(nSeg, Math.max(0, Math.round(u * nSeg)));
    return { r: radii[Math.min(k, radii.length - 1)], gen: gens[Math.min(k, gens.length - 1)] };
  };
  const endIdx = gens.findIndex(g => g >= 11);
  AIRWAY_END_U = (endIdx > 0 ? endIdx : nSeg - 3) / nSeg;
}
let AIRWAY_END_U = 0.8;
function pathPose(u, smooth = false) {
  u = Math.min(0.999, Math.max(0, u));
  const c = pathCurve.getPoint(u);
  const ahead = pathCurve.getPoint(Math.min(1, u + 0.25 / (flightPath.pts.length - 1)));
  const tan = pathCurve.getTangent(u).normalize();
  // continuous radius along the path (interpolated between branches)
  const nSeg = flightPath.pts.length - 1, kf = u * nSeg, k0 = Math.floor(kf);
  const r0 = pathRadius(k0 / nSeg).r, r1 = pathRadius(Math.min(nSeg, k0 + 1) / nSeg).r;
  const s = Math.max(r0 + (r1 - r0) * (kf - k0), 0.00028);
  const lift = new THREE.Vector3(0.25, 0.35, 1).normalize();
  lift.addScaledVector(tan, -lift.dot(tan)).normalize();
  const pos = c.clone().addScaledVector(tan, -12 * s - 0.0008).addScaledVector(lift, 5.5 * s + 0.0005);
  return { pos, target: ahead.lerp(c, 0.5) };
}

function setControlsFor(m) {
  if (m === 'body') { controls.minDistance = 0.12; controls.maxDistance = 2.6; }
  if (m === 'airways') { controls.minDistance = 0.0015; controls.maxDistance = 0.7; }
  if (m === 'alveolus') { controls.minDistance = 1.2; controls.maxDistance = 30; }
}

function setMode(m) {
  mode = m;
  ui.setMode(m);
  setControlsFor(m);
  if (m === 'alveolus') { activeScene = micro.scene; renderPass.scene = micro.scene; rideTarget = 0; ride = 0; lastOffset.set(0, 0, 0); }
  else { activeScene = bodyScene; renderPass.scene = bodyScene; anatomy.setMode(m); rideTarget = m === 'airways' ? 1 : 0; }
  ui.setAirwayGeneration(null);
}

function fadeSegment(dur, from, to) {
  return { dur, onUpdate: t => setFade(from + (to - from) * t) };
}
function setFade(v) { fadeValue = v; fadeEl.style.opacity = v.toFixed(3); }

const MICRO_ENTRY = { pos: new THREE.Vector3(-8.5, 1.6, 2.2), target: new THREE.Vector3(-3.5, 0.4, 0) };
const MICRO_POSE = { pos: new THREE.Vector3(5.6, 3.9, 12.4), target: new THREE.Vector3(0.6, 0.0, 0) };

function intoAirwaysSegments() {
  const startPose = currentPose();
  const p0 = pathPose(0.015);
  return [
    { ...blendSegment(startPose, p0, 2.2), onStart: () => anatomy.setMode('airways') },
    { dur: 8.0, pose: t => pathPose(0.015 + (AIRWAY_END_U - 0.015) * ease(t)), onStart: () => { mode = 'airways'; ui.setMode('airways'); rideTarget = 1; }, onUpdate: t => { currentRouteGen = pathRadius(0.015 + (AIRWAY_END_U - 0.015) * ease(t)).gen; ui.setAirwayGeneration(currentRouteGen); } },
  ];
}

function toAlveolusSegments() {
  const start = currentPose();
  const pEnd = pathPose(AIRWAY_END_U);
  const segs = [];
  if (start.pos.distanceTo(pEnd.pos) > 0.002) segs.push(blendSegment(start, pEnd, 1.4));
  segs.push({
    dur: 2.0, pose: t => pathPose(AIRWAY_END_U + (0.999 - AIRWAY_END_U) * t),
    onUpdate: t => { setFade(Math.max(0, (t - 0.45) / 0.55)); currentRouteGen = pathRadius(AIRWAY_END_U + (0.999 - AIRWAY_END_U) * t).gen; },
    onEnd: () => { setMode('alveolus'); camera.position.copy(MICRO_ENTRY.pos); controls.target.copy(MICRO_ENTRY.target); },
  });
  segs.push({ ...blendSegment(MICRO_ENTRY, MICRO_POSE, 3.2), onUpdate: t => setFade(1 - easeOut(Math.min(1, t * 1.6))) });
  return segs;
}

let pendingLevel = null;
function goTo(level) {
  if (busy) { pendingLevel = level; return; } // queued until the current flight lands
  if (level === mode) return;
  audio.start();
  if (mode === 'body' && level === 'airways') runFlight(intoAirwaysSegments(), () => setMode('airways'));
  else if (mode === 'body' && level === 'alveolus') {
    const a = intoAirwaysSegments();
    runFlight(a, () => { setMode('airways'); runFlight(toAlveolusSegments()); });
  } else if (mode === 'airways' && level === 'alveolus') runFlight(toAlveolusSegments());
  else if (mode === 'airways' && level === 'body') {
    const start = currentPose();
    runFlight([{ ...blendSegment(start, BODY_POSE, 3.0), onStart: () => { anatomy.setMode('body'); rideTarget = 0; } }], () => setMode('body'));
  } else if (mode === 'alveolus') {
    const back = pathPose(AIRWAY_END_U);
    const segs = [
      { ...fadeSegment(0.7, 0, 1), pose: () => currentPose() },
      { dur: 0.01, pose: () => back, onStart: () => { setMode('airways'); ride = 1; currentRouteGen = pathRadius(AIRWAY_END_U).gen; airways.keepGen.value = currentRouteGen - 2.5; } },
      { ...blendSegment(pathPose(0.97), back, 1.6), onUpdate: t => setFade(1 - t) },
    ];
    if (level === 'body') segs.push({ ...blendSegment(back, BODY_POSE, 3.0), onStart: () => { anatomy.setMode('body'); rideTarget = 0; } });
    runFlight(segs, () => setMode(level));
  }
}

// ------------------------------------------------------------------ picking
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; audio.start(); });
canvas.addEventListener('pointerup', e => {
  if (!downAt || busy) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 5) return;
  pointer.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  let targets;
  if (mode === 'alveolus') targets = micro.pickables.filter(o => o.visible);
  else if (mode === 'airways') targets = [airways.mesh, anatomy.parts.trachea, anatomy.parts.bronchus_right, anatomy.parts.bronchus_left];
  else targets = [...anatomy.pickables.filter(o => o.name !== 'torso_skin' && o.material.visible !== false), airways.mesh];
  const hits = raycaster.intersectObjects(targets, false);
  let hit = hits[0];
  if (!hit && mode === 'body') hit = raycaster.intersectObject(anatomy.parts.torso_skin, false)[0];
  if (!hit) { ui.hideInfo(); return; }
  const o = hit.object;
  let id = o.userData.partId;
  const extra = {};
  if (o === airways.mesh) extra.gen = Math.round(airways.genAtFace(hit.faceIndex));
  if (id === 'alveolus') {
    const al = micro.alveoli[o.userData.index];
    if (al && al.damage > 0.5) id = 'alveolus_damaged';
  }
  ui.showInfo(id, extra);
  marker.position.copy(hit.point);
  marker.userData.life = 1;
  marker.scale.setScalar(mode === 'alveolus' ? 0.25 : hit.distance * 0.02);
  (mode === 'alveolus' ? micro.scene : bodyScene).add(marker);
});

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.7, 1, 48),
  new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
);
marker.renderOrder = 100;
marker.userData.life = 0;

// ------------------------------------------------------------------ load
async function init() {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdrPromise = new RGBELoader().loadAsync('assets/hdri/studio_small_09_1k.hdr').then(tex => {
      const env = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      bodyScene.environment = env; bodyScene.environmentIntensity = 0.75;
      micro.scene.environment = env; micro.scene.environmentIntensity = 0.6;
    });
    let pA = 0, pB = 0, pC = 0;
    const prog = () => ui.progress(0.1 + 0.9 * (pA * 0.6 + pB * 0.3 + pC * 0.1));
    await Promise.all([
      anatomy.load(f => { pA = f; prog(); }),
      airways.load().then(() => { pB = 1; prog(); }),
      hdrPromise.then(() => { pC = 1; prog(); }),
    ]);
    bodyScene.add(anatomy.group, airways.group);
    preparePath();

    const A = anatomy.anchors();
    const labels = Object.entries(A).map(([id, pos]) => ({ id, pos, scene: 'body', deform: id !== 'rib' }));
    for (const [id, pos] of Object.entries(micro.labelAnchors)) labels.push({ id, pos, scene: 'alveolus', deform: false });
    ui.setLabels(labels);

    setScenario('rest');
    setMode('body');
    renderer.compile(bodyScene, camera);
    renderer.compile(micro.scene, camera);
    ui.ready();
    runFlight([{ dur: 3.4, pose: t => { const e = ease(t); return { pos: START_POSE.pos.clone().lerp(BODY_POSE.pos, e), target: START_POSE.target.clone().lerp(BODY_POSE.target, e) }; } }]);
    window.__breath = { phys, anatomy, airways, micro, goTo, setScenario, get mode() { return mode; }, get busy() { return busy; }, renderer };
  } catch (err) {
    console.error(err);
    ui.error('Could not load the 3D assets. Please run a local web server (see README).');
  }
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  phys.update(dt);
  audio.update(phys);

  if (anatomy.parts.heart) {
    anatomy.update(dt, phys);
    airways.update(dt, phys, {
      visibility: mode === 'alveolus' ? 0 : 1,
      pointScale: mode === 'airways' ? 0.075 : 2.4, focus: controls.target,
      pixelRatio,
    });
  }
  if (mode === 'alveolus' || (flight && fadeValue > 0.5)) micro.update(dt, phys, { pixelRatio });

  // camera: remove last tissue offset, apply flight/controls, re-apply offset (ride along with breathing)
  camera.position.sub(lastOffset); controls.target.sub(lastOffset);
  if (flight) stepFlight(dt);
  else controls.update();
  ride += (rideTarget - ride) * (1 - Math.exp(-dt / 0.6));
  if (activeScene === bodyScene && ride > 0.001) {
    breatheLungJS(controls.target, tmpA).sub(controls.target).multiplyScalar(ride);
    lastOffset.copy(tmpA);
  } else lastOffset.set(0, 0, 0);
  camera.position.add(lastOffset); controls.target.add(lastOffset);
  camera.lookAt(controls.target);

  if (marker.userData.life > 0) {
    marker.userData.life -= dt * 0.6;
    marker.material.opacity = Math.max(0, marker.userData.life);
    marker.quaternion.copy(camera.quaternion);
    if (marker.userData.life <= 0) marker.removeFromParent();
  }

  // airway view: route highlight and near-camera dissolve
  const inAir = mode === 'airways' || (flight && rideTarget > 0.5);
  airways.routeGlow.value += ((inAir ? 1 : 0) - airways.routeGlow.value) * (1 - Math.exp(-dt / 0.6));
  airways.routeShare = inAir ? 0.35 : 0;
  // keep only the sub-tree around the current route position
  let keep = -10;
  if (inAir && pathRadius) keep = Math.max(-10, currentRouteGen - 2.5);
  airways.keepGen.value += (keep - airways.keepGen.value) * (1 - Math.exp(-dt / (keep < airways.keepGen.value ? 0.25 : 0.8)));

  ui.update(phys, dt);
  ui.updateLabels(camera, mode === 'alveolus' ? 'alveolus' : mode === 'body' ? 'body' : 'none', (l, out) => {
    if (l.deform) breatheLungJS(l.pos, out); else out.copy(l.pos);
  }, busy);

  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

init();
frame();
