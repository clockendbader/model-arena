import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildLevel, stages } from "./level.js";
import { Runner } from "./player.js";
import { Soundscape } from "./audio.js";
import { createArms, ghostActor, particles } from "./actors.js";

const $ = (id) => document.getElementById(id),
  canvas = $("world"),
  audio = new Soundscape();
const controls = [
  ["WASD", "Move"],
  ["Mouse", "Look"],
  ["Shift", "Sprint"],
  ["Space", "Jump"],
  ["C / Ctrl", "Slide"],
  ["E", "Zipline"],
  ["R", "Reset"],
];
$("keylist").innerHTML = controls
  .map(
    ([key, name]) =>
      '<span class="key"><kbd>' + key + "</kbd>" + name + "</span>",
  )
  .join("");
const storage = "duskrunner.apex.v1";
function read(k, d) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
}
function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
const settings = read(storage + ".settings", {
  sensitivity: 1,
  vision: true,
  sound: true,
});
let best = read(storage, null);
function format(sec) {
  return (
    Math.floor(sec / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (sec % 60).toFixed(2).padStart(5, "0")
  );
}
function showBest() {
  $("best").textContent = best ? format(best.time) : "––:––.––";
}
showBest();
audio.enabled = settings.sound;
$("sound").classList.toggle("muted", !settings.sound);
let state = "home",
  scene,
  cam,
  renderer,
  composer,
  level,
  runner,
  arms,
  ghost,
  dust,
  ready,
  respawning = false,
  respawnToken = 0;
let elapsed = 0,
  stage = 0,
  splits = [],
  falls = 0,
  frames = [],
  sample = 0,
  notice = "",
  noticeUntil = 0,
  last = 0,
  acc = 0,
  drawUI = 0,
  drag = false;
function initialize() {
  renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  scene = new T.Scene();
  cam = new T.PerspectiveCamera(78, 1, 0.055, 1550);
  scene.add(cam);
  level = buildLevel(scene);
  level.vision(settings.vision);
  runner = new Runner(level, onMove);
  arms = createArms(cam);
  dust = particles(scene);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  composer.addPass(
    new UnrealBloomPass(new T.Vector2(512, 256), 0.28, 0.48, 1.2),
  );
  composer.addPass(new OutputPass());
  resize();
  return Promise.all([level.ready, ghostActor(scene).then((g) => (ghost = g))]);
}
function resize() {
  if (!renderer) return;
  let w = innerWidth,
    h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4, 1600 / w));
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
function message(text, duration = 2) {
  notice = text;
  noticeUntil = elapsed + duration;
}
function onMove(e) {
  if (e === "death") {
    respawn(true);
    return;
  }
  audio.event(e);
  if (["land", "roll", "stumble", "slide"].includes(e))
    dust.burst(runner.pos, false, e === "stumble" ? 20 : 10);
}
function respawn(count) {
  if (respawning || state !== "play") return;
  respawning = true;
  const token = ++respawnToken;
  if (count) falls++;
  $("fade").style.opacity = 1;
  setTimeout(() => {
    if (token !== respawnToken) return;
    runner.reset(stage ? level.gates[stage - 1] : new T.Vector3(0, 0, 5));
    $("fade").style.opacity = 0;
    respawning = false;
    message(stage ? "Checkpoint restored" : "Back on the launch deck");
  }, 160);
}
function pause() {
  if (state !== "play") return;
  state = "pause";
  runner.keys.clear();
  audio.active = false;
  audio.volume();
  if (document.pointerLockElement) document.exitPointerLock();
  options(true);
}
function panel(title, body, buttons) {
  $("panelTitle").textContent = title;
  $("panelBody").innerHTML = body;
  $("actions").replaceChildren();
  for (const [name, fn, primary] of buttons) {
    let b = document.createElement("button");
    b.className = primary ? "primary" : "secondary";
    b.textContent = name;
    b.onclick = fn;
    $("actions").append(b);
  }
  if (!$("panel").open) $("panel").showModal();
}
function options(paused) {
  panel(
    paused ? "RUN PAUSED" : "SETTINGS",
    '<label class="setting">Mouse sensitivity <input id="sense" type="range" min=".3" max="2.5" step=".1"></label><label class="setting">Runner’s vision <input id="vision" type="checkbox"></label><label class="setting">Sound <input id="soundCheck" type="checkbox"></label><p class="hint">V toggles vision · Esc pauses · R resets to checkpoint</p>',
    paused
      ? [
          ["RESUME", resume, true],
          ["Restart run", start],
          ["Title screen", home],
        ]
      : [["DONE", () => $("panel").close(), true]],
  );
  $("sense").value = settings.sensitivity;
  $("vision").checked = settings.vision;
  $("soundCheck").checked = settings.sound;
  $("sense").oninput = (e) => {
    settings.sensitivity = +e.target.value;
    save(storage + ".settings", settings);
  };
  $("vision").onchange = toggleVision;
  $("soundCheck").onchange = toggleSound;
}
function toggleSound() {
  settings.sound = audio.enabled = !settings.sound;
  audio.volume();
  $("sound").classList.toggle("muted", !settings.sound);
  $("sound").setAttribute("aria-pressed", String(settings.sound));
  save(storage + ".settings", settings);
}
function toggleVision() {
  settings.vision = !settings.vision;
  level?.vision(settings.vision);
  save(storage + ".settings", settings);
}
function lock() {
  try {
    const p = canvas.requestPointerLock?.();
    p?.catch(() => message("Drag to look · Arrow keys also turn", 4));
  } catch {
    message("Drag to look · Arrow keys also turn", 4);
  }
}
function resume() {
  if ($("panel").open) $("panel").close();
  state = "play";
  last = performance.now();
  acc = 0;
  audio.start();
  lock();
}
async function start() {
  if (state === "loading") return;
  if ($("panel").open) $("panel").close();
  state = "loading";
  $("play").disabled = true;
  $("play").innerText = "LOADING COURSE…";
  audio.start();
  lock();
  try {
    ready ??= initialize();
    await ready;
  } catch (err) {
    console.error(err);
    state = "home";
    if (document.pointerLockElement) document.exitPointerLock();
    panel("LOAD ERROR", "The course needs WebGL 2 and a local HTTP server.", [
      ["Close", () => $("panel").close(), true],
    ]);
    $("play").disabled = false;
    return;
  }
  ++respawnToken;
  respawning = false;
  $("fade").style.opacity = 0;
  elapsed = stage = falls = sample = acc = 0;
  splits = [];
  frames = [];
  notice = "";
  noticeUntil = 0;
  ghost.reset();
  runner.reset(new T.Vector3(0, 0, 5));
  state = "play";
  last = performance.now();
  document.body.classList.add("ingame");
  $("hud").hidden = false;
  $("split").textContent = "";
  $("play").disabled = false;
  $("play").innerHTML =
    '<span class="triangle"></span> CLICK TO PLAY <span class="arrow">↗</span>';
  hud();
}
function home() {
  state = "home";
  ++respawnToken;
  respawning = false;
  $("fade").style.opacity = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  $("panel").close();
  document.body.classList.remove("ingame");
  $("hud").hidden = true;
  audio.active = false;
  audio.volume();
  showBest();
}
function checkpoint() {
  const g = level.gates[stage];
  if (
    !g ||
    Math.abs(runner.pos.z - g.z) > 1.3 ||
    Math.abs(runner.pos.x - g.x) > 2.85 ||
    Math.abs(runner.pos.y - g.y) > 3.8
  )
    return;
  splits.push(elapsed);
  let d = best ? elapsed - best.splits[stage] : null;
  $("split").className = d > 0 ? "bad" : "good";
  $("split").textContent =
    d == null
      ? "FIRST SPLIT"
      : (d > 0 ? "+" : "−") + Math.abs(d).toFixed(2) + " s";
  stage++;
  audio.event(stage === 8 ? "finish" : "checkpoint");
  message("Checkpoint 0" + stage + " saved", 1.5);
  if (stage === 8) finish();
}
function finish() {
  state = "finish";
  sampleGhost();
  let previous = best,
    newBest = !best || elapsed < best.time,
    stored = true;
  if (newBest) {
    best = { time: elapsed, splits: [...splits], frames };
    stored = save(storage, best);
  }
  if (document.pointerLockElement) document.exitPointerLock();
  audio.active = false;
  audio.volume();
  const rows = splits
    .map((t, i) => {
      let d = previous ? t - previous.splits[i] : 0;
      return (
        '<div class="resultrow"><span>0' +
        (i + 1) +
        " / " +
        stages[i][0] +
        "</span><span>" +
        format(t) +
        (previous
          ? ' <small class="' +
            (d > 0 ? "bad" : "good") +
            '">' +
            (d > 0 ? "+" : "") +
            d.toFixed(2) +
            "</small>"
          : "") +
        "</span></div>"
      );
    })
    .join("");
  panel(
    "RUN COMPLETE",
    '<div class="setting">FINISH TIME <b>' +
      format(elapsed) +
      '</b></div><div class="setting">PERSONAL BEST <b class="good">' +
      format(best.time) +
      '</b></div><div class="setting">FALLS <b>' +
      falls +
      '</b></div><div class="results">' +
      rows +
      "</div>" +
      (stored
        ? ""
        : "<p>Storage is full. This ghost is available for this session.</p>"),
    [
      ["RACE AGAIN", start, true],
      ["Title screen", home],
    ],
  );
}
function sampleGhost() {
  frames.push([
    +elapsed.toFixed(3),
    ...runner.pos.toArray().map((n) => +n.toFixed(2)),
    +runner.yaw.toFixed(3),
    runner.mode,
  ]);
}
function hud() {
  const speed = runner.zip ? 13 : runner.speed;
  $("clock").textContent = format(elapsed);
  $("cp").textContent = String(stage).padStart(2, "0") + " / 08";
  $("velocity").innerHTML = "<b>" + Math.round(speed * 3.6) + "</b> KM/H";
  $("streak").style.opacity = Math.max(0, (speed - 7) * 0.045);
  let g = level.gates[stage];
  $("prompt").textContent =
    elapsed < noticeUntil
      ? notice
      : g && runner.pos.z < g.z - 2
        ? "Return to checkpoint 0" + (stage + 1)
        : stages[Math.min(stage, 7)][1];
}
$("play").onclick = start;
$("settings").onclick = () => options(false);
$("sound").onclick = toggleSound;
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && state === "play") pause();
});
canvas.onmousedown = () => {
  if (state === "play") {
    drag = true;
    if (!document.pointerLockElement) lock();
  }
};
window.onmouseup = () => (drag = false);
window.onmousemove = (e) => {
  if (state !== "play" || (!document.pointerLockElement && !drag)) return;
  runner.yaw -= e.movementX * 0.002 * settings.sensitivity;
  runner.pitch = T.MathUtils.clamp(
    runner.pitch - e.movementY * 0.002 * settings.sensitivity,
    -1.28,
    1.28,
  );
};
window.addEventListener("keydown", (e) => {
  if (state !== "play") return;
  e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Escape") pause();
  else if (e.code === "KeyR") respawn(false);
  else if (e.code === "KeyV") toggleVision();
  else runner.press(e.code);
});
window.addEventListener("keyup", (e) => runner?.keys.delete(e.code));
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
$("panel").addEventListener("cancel", (e) => {
  e.preventDefault();
  if (state === "pause") resume();
  else if (state === "finish") home();
  else $("panel").close();
});
function frame(now) {
  requestAnimationFrame(frame);
  if (state !== "play") return;
  const realDelta = Math.max(0, (now - last) / 1000),
    dt = Math.min(realDelta, 0.18);
  last = now;
  elapsed += realDelta;
  acc += dt;
  while (acc >= 1 / 120 && state === "play") {
    if (!respawning) {
      runner.yaw +=
        ((Number(runner.keys.has("ArrowLeft")) -
          Number(runner.keys.has("ArrowRight"))) *
          1.65) /
        120;
      runner.tick(1 / 120);
      checkpoint();
    }
    acc -= 1 / 120;
  }
  if (state !== "play") return;
  runner.camera(cam, dt);
  arms(runner, dt);
  level.update(runner.pos);
  dust.update(dt);
  ghost.update(best?.frames, elapsed, dt, runner.pos);
  if (runner.zip || runner.slide > 0) {
    if (Math.random() < dt * 20)
      dust.burst(
        runner.pos.clone().add(new T.Vector3(0, runner.zip ? 1.8 : 0.08, 0)),
        !!runner.zip,
        2,
      );
  }
  audio.update(runner.speed, stage, !!runner.zip);
  if (elapsed >= sample) {
    sampleGhost();
    sample = elapsed + 0.1;
  }
  if (now - drawUI > 65) {
    hud();
    drawUI = now;
  }
  composer.render();
}
requestAnimationFrame(frame);
