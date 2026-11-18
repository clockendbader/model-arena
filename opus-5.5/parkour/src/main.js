// ---------------------------------------------------------------------------
// HIGHLINE — entry point: boot, loading, main loop, menus & pointer lock.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { PHYS } from './config.js';
import { Renderer, SUN_DIR } from './renderer.js';
import { Input } from './input.js';
import { CollisionWorld } from './physics.js';
import { MaterialLibrary } from './materials.js';
import { StaticBatch } from './geometry.js';
import { PropLibrary } from './props.js';
import { buildLevel } from './level.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { CameraRig } from './cameraRig.js';
import { Arms } from './arms.js';
import { Particles } from './particles.js';
import { GhostRunner } from './ghost.js';
import { AudioEngine } from './audio.js';
import { Markers } from './markers.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const ui = new UI();
const canvas = document.getElementById('game');

async function boot() {
  const R = new Renderer(canvas);
  const input = new Input(canvas);

  // ---- loading -----------------------------------------------------------
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => ui.loading(loaded / Math.max(1, total), `Loading ${url.split('/').pop()}`);
  const draco = new DRACOLoader(manager).setDecoderPath('vendor/three/addons/libs/draco/gltf/');
  const gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco);

  const matLib = new MaterialLibrary(R.renderer, manager);
  const mats = matLib.build();
  const props = new PropLibrary(gltfLoader);
  const ghost = new GhostRunner(R.scene);
  await Promise.all([
    R.loadSky('assets/hdri/belfast_sunset_puresky_2k.hdr', manager),
    props.load(),
    ghost.load(gltfLoader),
  ]);

  // ---- world -------------------------------------------------------------
  const world = new CollisionWorld();
  const batch = new StaticBatch();
  const ctx = { scene: R.scene, mats, world, batch, props, matLib };
  const level = buildLevel(ctx);
  const city = buildCity(ctx, level);
  batch.build(R.scene);
  props.build(R.scene);
  matLib.setRunnerVision(true);

  const markers = new Markers(R.scene, level.checkpoints, level.finish);
  const particles = new Particles(R.scene);
  const audio = new AudioEngine();
  const player = new Player(world, level.ziplines);
  const rig = new CameraRig(R.camera);
  const arms = new Arms(R.armsScene, R.armsCamera);
  const game = new Game({ player, level, ui, markers, ghost, audio, rig, renderer: R });

  // ---- settings ------------------------------------------------------------
  const sens = document.getElementById('sens'), vol = document.getElementById('vol');
  const tglRV = document.getElementById('tglRV'), tglGhost = document.getElementById('tglGhost');
  const applySettings = () => {
    sens.value = game.save.sens; document.getElementById('sensv').textContent = Number(game.save.sens).toFixed(2);
    vol.value = game.save.vol; document.getElementById('volv').textContent = Math.round(game.save.vol * 100);
    tglRV.classList.toggle('on', game.save.rv);
    tglGhost.classList.toggle('on', game.save.ghostOn);
    level.rvGroup.visible = game.save.rv;
    matLib.setRunnerVision(game.save.rv);
    ghost.enabled = game.save.ghostOn;
    audio.setVolume(game.save.vol);
  };
  applySettings();
  sens.addEventListener('input', () => { game.save.sens = Number(sens.value); applySettings(); game.persist(); });
  vol.addEventListener('input', () => { game.save.vol = Number(vol.value); applySettings(); game.persist(); });
  tglRV.addEventListener('click', () => { game.save.rv = !game.save.rv; applySettings(); game.persist(); });
  tglGhost.addEventListener('click', () => { game.save.ghostOn = !game.save.ghostOn; applySettings(); game.persist(); });

  // compile shaders up-front to avoid hitches on first view
  R.camera.position.set(0, 52, 6);
  R.renderer.compile(R.scene, R.camera);
  ui.ready(game.save.best);

  // ---- state / menus --------------------------------------------------------
  let state = 'menu';
  const setState = (s) => {
    state = s;
    game.state = s;
    if (s === 'menu') ui.show('start');
    else if (s === 'playing') { ui.show('hud'); ui.setLockMsg(false); }
    else if (s === 'paused') ui.show('pause');
    else if (s === 'results') ui.show('results');
  };
  setState('menu');

  const play = () => { audio.start(); audio.musicOn = true; input.lock(); };
  document.getElementById('start').addEventListener('click', () => { if (state === 'menu') { game.resetRun(); play(); } });
  document.getElementById('btnResume').addEventListener('click', () => play());
  document.getElementById('btnCheckpoint').addEventListener('click', () => { game.respawnAtCheckpoint(); play(); });
  document.getElementById('btnRestart').addEventListener('click', () => { game.resetRun(); play(); });
  document.getElementById('btnAgain').addEventListener('click', () => { game.resetRun(); play(); });
  document.getElementById('btnMenu').addEventListener('click', () => { game.resetRun(); ui.ready(game.save.best); setState('menu'); });
  canvas.addEventListener('click', () => { if (state === 'playing' && !input.locked) input.lock(); });

  input.onLockChange = (locked, error) => {
    if (error) { ui.setLockMsg(true); return; }
    if (locked) {
      if (state !== 'results' || game.finished === false) setState('playing');
    } else if (state === 'playing') {
      setState(game.finished ? 'results' : 'paused');
    }
  };

  // ---- loop -----------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let resultsTimer = 0;
  let sparkAcc = 0, dustAcc = 0;
  const focus = new THREE.Vector3();
  const fwdV = new THREE.Vector3();

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;

    const playing = state === 'playing';
    // mouse look
    const [mdx, mdy] = input.consumeMouse();
    if (playing && player.mode !== 'dead') {
      const k = 0.0021 * game.save.sens;
      player.yaw -= mdx * k;
      player.pitch = Math.max(-1.52, Math.min(1.52, player.pitch - mdy * k));
    }

    const inp = {
      fwd: playing ? input.forward : 0, strafe: playing ? input.strafe : 0,
      jump: playing && input.jumpHeld, sprint: playing && input.sprintHeld, crouch: playing && input.crouchHeld,
    };
    player.lastStrafe = inp.strafe;

    let alpha = 1;
    if (playing) {
      player.handlePresses(input);
      if (input.hit('KeyR')) game.requestRespawn();
      acc += dt;
      let steps = 0;
      while (acc >= PHYS.fixedDt && steps < 12) {
        player.step(PHYS.fixedDt, inp);
        acc -= PHYS.fixedDt;
        steps++;
      }
      alpha = acc / PHYS.fixedDt;
      game.update(dt, inp);

      // events
      for (const e of player.events) {
        rig.onEvent(e); audio.onEvent(e); game.onEvent(e);
        const st = player.st;
        if (e.type === 'land' && e.v > 6) particles.dustBurst(st.x, st.y, st.z, Math.min(28, Math.floor(e.v * 1.6)), 0.6 + e.v * 0.05);
        if (e.type === 'stumble' || e.type === 'roll') particles.dustBurst(st.x, st.y, st.z, 26, 1.1, st.vx, st.vz);
        if (e.type === 'slideStart' || e.type === 'vault') particles.dustBurst(st.x, st.y, st.z, 10, 0.6, st.vx, st.vz);
        if (e.type === 'zipStart') particles.sparkBurst(st.x, st.y + 2.1, st.z, 30, st.vx, st.vy, st.vz);
      }
      player.events.length = 0;

      // continuous particles
      const st = player.st;
      if (player.mode === 'zip') {
        sparkAcc += dt * (20 + player.zipSpeed * 5);
        const z = player.zip;
        while (sparkAcc > 1) { sparkAcc -= 1; particles.sparkBurst(st.x + z.dir[0] * 0.3, st.y + 2.12, st.z + z.dir[2] * 0.3, 1, st.vx, st.vy, st.vz); }
      }
      if (player.mode === 'slide') {
        dustAcc += dt * (10 + player.hspeed * 2);
        while (dustAcc > 1) { dustAcc -= 1; particles.dustBurst(st.x, st.y, st.z, 1, 0.5, st.vx * 0.3, st.vz * 0.3); }
      }

      if (game.finished) {
        resultsTimer += dt;
        if (resultsTimer > 2.2) {
          resultsTimer = 0;
          ui.results(game.resultsData);
          setState('results');
          input.unlock();
        }
      }
    } else {
      // keep stale presses from leaking into the next frame of play
      player.events.length = 0;
    }
    input.endFrame();

    // camera, arms, effects
    rig.update(dt, player, alpha);
    arms.update(dt, player, R.camera);
    arms.setVisible(player.mode !== 'dead');
    focus.copy(R.camera.position);
    fwdV.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    focus.addScaledVector(fwdV, 18);
    R.updateSun(focus);

    // dim arms when the player stands in shadow
    const eye = R.camera.position;
    const shadowHit = world.raycast(eye.x, eye.y, eye.z, SUN_DIR.x, SUN_DIR.y, SUN_DIR.z, 120);
    const targetSun = shadowHit ? 0.35 : 3.2;
    R.armsSun.intensity += (targetSun - R.armsSun.intensity) * Math.min(1, dt * 6);

    particles.update(dt);
    markers.update(dt);
    ghost.update(playing ? dt : 0, game.timing ? game.time : 0, player.st);
    audio.update(dt, player, game.intensity, playing);
    ui.update(dt);

    // aviation lights blink
    city.aviMat.color.setRGB(Math.sin(now * 0.003) > 0.2 ? 6 : 0.3, 0.3, 0.15);

    // post fx uniforms
    const f = R.final.uniforms;
    f.uSpeed.value = rig.speedFx;
    f.uLines.value = rig.speedFx;
    f.uFade.value = game.fade;
    f.uFlash.value = Math.max(0, rig.trauma - 0.3);

    R.render(dt);
  }
  R.resize();
  requestAnimationFrame(frame);

  // debug handle for automated testing
  window.__game = { game, player, world, level, R, setState: (s) => setState(s) };
}

boot().catch((e) => {
  console.error(e);
  ui.loading(0, `Failed to start: ${e.message}`);
});
