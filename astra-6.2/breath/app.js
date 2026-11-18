import { createScene } from "./scene.js";
import { icon, t } from "./ui.js";
const $ = (s) => document.querySelector(s),
  state = {
    ar: false,
    scenario: "rest",
    rate: 14,
    depth: 500,
    paused: false,
    sound: false,
    view: "body",
  };
const presets = {
  rest: [14, 500, 98, 2.4, 0.39],
  exercise: [28, 1400, 97, 2.45, 0.43],
  altitude: [21, 620, 91, 2.45, 0.4],
  asthma: [22, 420, 94, 3.0, 0.29],
  smoker: [20, 460, 93, 3.25, 0.34],
};
let scene,
  selected = null,
  phase = 0.12,
  elapsed = 0,
  gain,
  filter,
  ctx,
  lastTime,
  history = [],
  nextSample = 0;
const tr = (k) => t(k, state.ar);
const num = (n, d = 0) =>
  Number(n).toLocaleString(state.ar ? "ar" : "en", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
    useGrouping: false,
  });
function render() {
  document.documentElement.lang = state.ar ? "ar" : "en";
  document.documentElement.dir = state.ar ? "rtl" : "ltr";
  document
    .querySelectorAll("[data-t]")
    .forEach((el) => (el.textContent = tr(el.dataset.t)));
  document
    .querySelectorAll("[data-icon]")
    .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  $("#lang span").textContent = state.ar ? "English" : "العربية";
  $("#pause").innerHTML =
    icon(state.paused ? "play" : "pause") +
    "<span>" +
    tr(state.paused ? "play" : "pause") +
    "</span>";
  $("#pause").setAttribute("aria-pressed", state.paused);
  $("#sound").innerHTML =
    icon(state.sound ? "sound" : "mute") +
    "<span>" +
    tr(state.sound ? "sound" : "muted") +
    "</span>";
  $("#sound").setAttribute("aria-pressed", state.sound);
  for (const k of ["expand", "reset", "close"])
    $("#" + k).setAttribute("aria-label", tr(k));
  $("#scenarioList").replaceChildren(
    ...Object.keys(presets).map((k) =>
      button(k, k, state.scenario === k, () => scenario(k), "scenario"),
    ),
  );
  $("#tabs").replaceChildren(
    ...["body", "airways", "alveolus"].map((k) =>
      button(k, k === "body" ? "lungs" : k, state.view === k, () => {
        if (!scene) return;
        state.view = k;
        selected = null;
        $("#info").hidden = true;
        scene.go(k);
        render();
      }),
    ),
  );
  $("#description").textContent = tr(state.scenario + "D");
  $("#status").textContent = tr(state.paused ? "paused" : "live");
  $("#metrics").innerHTML = [
    ["rate", "bpm", "pulse", "#8fe1c9"],
    ["tidal", "ml", "lungs", "#f1adab"],
    ["minute", "lpm", "asthma", "#a1bbf6"],
    ["sat", "%", "drop", "#c4a2e4"],
  ]
    .map(
      ([id, unit, ic, c]) =>
        '<div class="metric" style="--accent:' +
        c +
        '"><span class="mname">' +
        tr(id) +
        '</span><strong id="m' +
        id +
        '"></strong><span class="unit">' +
        (unit === "%" ? "%" : tr(unit)) +
        "</span><i>" +
        icon(ic) +
        "</i></div>",
    )
    .join("");
  numbers();
  scene?.makeLabels();
  if (selected) inspect(selected);
  graph();
}
function button(k, ic, active, onClick, cls = "") {
  const b = document.createElement("button");
  b.className = cls + (active ? " active" : "");
  b.setAttribute("aria-pressed", active);
  b.innerHTML = icon(ic) + "<span>" + tr(k) + "</span>";
  b.onclick = onClick;
  return b;
}
function numbers() {
  $("#mrate").textContent = num(state.rate);
  $("#mtidal").textContent = num(state.depth);
  $("#mminute").textContent = num((state.rate * state.depth) / 1000, 1);
  $("#msat").textContent = num(presets[state.scenario][2]);
  $("#rateOut").textContent = num(state.rate) + " " + tr("bpm");
  $("#depthOut").textContent = num(state.depth) + " " + tr("ml");
  for (const k of ["rate", "depth"]) {
    let el = $("#" + k);
    el.value = state[k];
    el.style.setProperty(
      "--pct",
      ((el.value - el.min) / (el.max - el.min)) * 100 + "%",
    );
  }
}
function scenario(k) {
  state.scenario = k;
  [state.rate, state.depth] = presets[k];
  render();
}
function inspect(k) {
  selected = k;
  $("#info").hidden = false;
  $("#info strong").textContent = tr(k);
  $("#info p").textContent = tr(
    (k === "oxy" || k === "co2" ? "alveolus" : k) + "D",
  );
}
$("#close").onclick = () => {
  selected = null;
  $("#info").hidden = true;
};
$("#lang").onclick = () => {
  state.ar = !state.ar;
  render();
};
$("#pause").onclick = () => {
  state.paused = !state.paused;
  render();
};
$("#expand").onclick = async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if ($("#stage").requestFullscreen)
    await $("#stage")
      .requestFullscreen()
      .catch(() => $("#stage").classList.toggle("expanded"));
  else $("#stage").classList.toggle("expanded");
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#stage").classList.remove("expanded");
    $("#close").click();
  }
});
$("#reset").onclick = () => scenario(state.scenario);
for (const k of ["rate", "depth"])
  $("#" + k).oninput = (e) => {
    state[k] = Number(e.target.value);
    numbers();
  };
$("#sound").onclick = async () => {
  if (!ctx) {
    ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < data.length; i++) {
      prev = 0.88 * prev + 0.12 * (Math.random() * 2 - 1);
      data[i] = prev;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.75;
    gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }
  await ctx.resume();
  state.sound = !state.sound;
  render();
};
function breath(p) {
  const cut = presets[state.scenario][4];
  if (p < cut) {
    const u = p / cut;
    return [(1 - Math.cos(u * Math.PI)) / 2, Math.sin(u * Math.PI), true];
  }
  const u = (p - cut) / (1 - cut),
    k = state.scenario === "asthma" ? 1.7 : 2.5;
  const v = (Math.exp(-k * u) - Math.exp(-k)) / (1 - Math.exp(-k));
  return [
    v,
    (-Math.exp(-k * u) * k * cut) /
      ((1 - cut) * (1 - Math.exp(-k)) * Math.PI * 0.5),
    false,
  ];
}
function vol(p) {
  return presets[state.scenario][3] + (state.depth / 1000) * breath(p)[0];
}
for (let j = -150; j <= 0; j++)
  history.push([
    j / 10,
    vol((((phase + ((j / 10) * state.rate) / 60) % 1) + 1) % 1),
  ]);
function graph() {
  const canvas = $("#plot"),
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (!w || !h) return;
  const ratio = Math.min(devicePixelRatio, 2);
  if (
    canvas.width !== Math.round(w * ratio) ||
    canvas.height !== Math.round(h * ratio)
  ) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  const c = canvas.getContext("2d");
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  c.clearRect(0, 0, w, h);
  const baseline = presets[state.scenario][3];
  const lo =
      Math.floor(Math.min(baseline, ...history.map((v) => v[1])) * 10 - 0.2) /
      10,
    hi =
      Math.ceil(
        Math.max(baseline + state.depth / 1000, ...history.map((v) => v[1])) *
          10 +
          0.2,
      ) / 10;
  [hi, (hi + lo) / 2, lo].forEach(
    (v, i) =>
      ($(["#topTick", "#midTick", "#bottomTick"][i]).textContent =
        num(v, 1) + " L"),
  );
  c.lineWidth = 1;
  c.strokeStyle = "#2c393f";
  c.setLineDash([2, 4]);
  for (let j = 0; j < 4; j++) {
    c.beginPath();
    c.moveTo(0, 1 + (j * (h - 2)) / 3);
    c.lineTo(w, 1 + (j * (h - 2)) / 3);
    c.stroke();
  }
  c.setLineDash([]);
  c.beginPath();
  let last;
  for (const [tm, v] of history) {
    const x = ((tm - elapsed + 15) * w) / 15,
      y = (1 - (v - lo) / (hi - lo)) * (h - 4) + 2;
    if (last) c.lineTo(x, y);
    else c.moveTo(x, y);
    last = [x, y];
  }
  c.strokeStyle = "#74dec7";
  c.lineWidth = 1.8;
  c.stroke();
  if (last) {
    c.lineTo(last[0], h);
    c.lineTo(0, h);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#57d4ae32");
    g.addColorStop(1, "#57d4ae01");
    c.fillStyle = g;
    c.fill();
    c.fillStyle = "#a4f7db";
    c.beginPath();
    c.arc(...last, 2.5, 0, Math.PI * 2);
    c.fill();
  }
}
document.addEventListener("visibilitychange", () => {
  lastTime = undefined;
});
render();
try {
  scene = await createScene(state, inspect, tr);
  function frame(time) {
    const dt =
      lastTime === undefined ? 0 : Math.min(1, (time - lastTime) / 1000);
    lastTime = time;
    if (!state.paused) {
      elapsed += dt;
      phase = (phase + (dt * state.rate) / 60) % 1;
    }
    const [inflation, flow, inhale] = breath(phase);
    if (elapsed >= nextSample) {
      history.push([elapsed, vol(phase)]);
      history = history.filter((p) => p[0] >= elapsed - 15.12);
      nextSample = elapsed + 0.075;
      graph();
    }
    $("#phase").textContent = tr(
      state.paused ? "paused" : inhale ? "inhale" : "exhale",
    );
    if (ctx) {
      gain.gain.setTargetAtTime(
        state.sound && !state.paused ? 0.3 * Math.abs(flow) : 0,
        ctx.currentTime,
        0.06,
      );
      filter.frequency.setTargetAtTime(
        inhale ? 840 : 540,
        ctx.currentTime,
        0.15,
      );
    }
    scene.update(dt, inflation, state.paused ? 0 : flow, elapsed);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (err) {
  console.error(err);
  $("#world").innerText = state.ar
    ? "تعذر تحميل المشهد ثلاثي الأبعاد."
    : "The 3D view could not load. Open this exhibit on a local HTTP server with WebGL enabled.";
}
