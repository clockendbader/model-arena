import { createAnatomy } from './anatomy.js';
import { text, parts, paintIcon } from './content.js';

const $ = id => document.getElementById(id);
const buttons = (selector) => [...document.querySelectorAll(selector)];
const bound = (value, low, high) => Math.max(low,Math.min(high,value));
const mix = (from,to,weight) => from+(to-from)*weight;
const presets = {
  rest:     { rate:14, depth:500,  spo:98, base:2.50, ratio:.42, recoil:2.50, narrow:0,   oxygen:1,   perfusion:1,    damage:false },
  exercise: { rate:26, depth:1150, spo:98, base:2.43, ratio:.45, recoil:2.20, narrow:0,   oxygen:1,   perfusion:1.77, damage:false },
  altitude: { rate:21, depth:690,  spo:90, base:2.50, ratio:.43, recoil:2.50, narrow:0,   oxygen:.69, perfusion:1.18, damage:false },
  asthma:   { rate:19, depth:380,  spo:95, base:2.78, ratio:.29, recoil:1.40, narrow:.95, oxygen:1,   perfusion:1.09, damage:false },
  smoke:    { rate:18, depth:430,  spo:93, base:3.02, ratio:.34, recoil:1.70, narrow:.32, oxygen:1,   perfusion:1.02, damage:true  },
};

const state = { time:0, phase:.15, amount:0, flow:0, rate:14, depth:500, base:2.5, ratio:.42, recoil:2.5, saturation:98 };
const rateControl = $('rate');
const depthControl = $('depth');
const scenarioButtons = buttons('[data-scenario]');
const viewButtons = buttons('[data-view]');
let scenario = 'rest';
let view = 'body';
let language = 0;
let paused = false;
let labels = true;
let sound = false;
let selected;
let anatomy;
let phaseKey = 'inhale';
let audio;
const pins = new Map();

const translate = key => text[key][language];
function setText(node,key) {
  node.dataset.t = key;
  node.textContent = translate(key);
}

function updateSelection() {
  $('selection').hidden = !selected;
  for (const [key,pin] of pins) pin.button.classList.toggle('active',key === selected);
  if (!selected) return;
  const [name,detail] = parts[selected];
  $('detail-name').textContent = name[language];
  $('detail-text').textContent = detail[language];
}
function selectPart(key) {
  selected = key;
  updateSelection();
}
function updateLegend() {
  $('legend').replaceChildren();
  const entries = view === 'alveolus' ? [['red','oxygen'],['blue','carbon']] : [['','airflow']];
  for (const [tone,key] of entries) {
    const dot = document.createElement('i');
    dot.className = tone;
    const label = document.createElement('span');
    setText(label,key);
    $('legend').append(dot,label);
  }
}

function updateLanguage() {
  document.documentElement.lang = language ? 'ar' : 'en';
  document.documentElement.dir = language ? 'rtl' : 'ltr';
  document.title = language ? 'نَفَس — كيف يتنفس الجسم' : 'Breath — The breathing body';
  for (const node of buttons('[data-t]')) setText(node,node.dataset.t);
  for (const node of buttons('[data-label]')) {
    const label = translate(node.dataset.label);
    node.setAttribute('aria-label',label);
    if (node.hasAttribute('title')) node.title = label;
  }
  document.querySelector('.oxygen abbr').title = translate('saturation');
  const target = $('language').lastElementChild;
  target.lang = language ? 'en' : 'ar';
  target.textContent = language ? 'English' : 'العربية';
  $('language').setAttribute('aria-label',target.textContent);
  for (const [key,pin] of pins) {
    pin.button.dir = language ? 'rtl' : 'ltr';
    pin.button.textContent = parts[key][0][language];
  }
  updateSelection();
}
for (const item of buttons('[data-icon]')) paintIcon(item,item.dataset.icon);
if (matchMedia('(pointer: coarse)').matches) {
  setText(document.querySelector('.drag-help span[data-t]'),'touch');
}
$('language').addEventListener('click',() => { language = 1-language; updateLanguage(); });
$('open-credits').addEventListener('click',() => $('credits-dialog').showModal());
$('close-detail').addEventListener('click',() => selectPart());
document.addEventListener('keydown',event => {
  if (event.key === 'Escape') selectPart();
});

function rangeOutput(control,output,unit) {
  const percent = (control.value-control.min)/(control.max-control.min)*100;
  control.style.setProperty('--value',percent+'%');
  output.firstChild.nodeValue = control.value+' ';
  control.setAttribute('aria-valuetext',control.value+' '+unit);
}

function updateControls() {
  rangeOutput(rateControl,$('rate-out'),'bpm');
  rangeOutput(depthControl,$('depth-out'),'mL');
  const rate = Number(rateControl.value);
  const depth = Number(depthControl.value);
  $('metric-rate').textContent = rate;
  $('metric-tidal').textContent = depth;
  $('metric-minute').textContent = (rate*depth/1000).toFixed(1);
}
rateControl.addEventListener('input',updateControls);
depthControl.addEventListener('input',updateControls);
for (const b of scenarioButtons) {
  b.addEventListener('click',() => {
    scenario = b.dataset.scenario;
    const preset = presets[scenario];
    rateControl.value = preset.rate;
    depthControl.value = preset.depth;
    scenarioButtons.forEach(button => button.setAttribute('aria-pressed',button === b));
    setText($('scenario-note'),scenario+'Note');
    updateControls();
  });
}

function changeView(name) {
  view = name;
  viewButtons.forEach(b => b.setAttribute('aria-pressed',b.dataset.view === view));
  setText($('scale-name'),view+'Scale');
  updateLegend();
  selectPart();
  anatomy?.setView(name);
}
viewButtons.forEach(b => b.addEventListener('click',() => changeView(b.dataset.view)));
$('reset').addEventListener('click',() => { anatomy?.reset(); selectPart(); });
$('toggle-labels').addEventListener('click',event => {
  labels = !labels;
  event.currentTarget.setAttribute('aria-pressed',labels);
  $('pins').hidden = !labels;
});
function updatePins(entries,width,height) {
  if (!labels) return;
  const shown = new Set();
  for (const entry of entries) {
    if (!entry.visible || entry.y > height-104 || entry.y < 107) continue;
    shown.add(entry.key);
    if (!pins.has(entry.key)) {
      const el = document.createElement('div');
      const dot = document.createElement('i');
      const leader = document.createElement('b');
      const button = document.createElement('button');
      button.type = 'button';
      button.dir = language ? 'rtl' : 'ltr';
      button.textContent = parts[entry.key][0][language];
      button.addEventListener('click',() => selectPart(entry.key));
      el.append(dot,leader,button);
      $('pins').append(el);
      pins.set(entry.key,{ el,button });
    }
    const { el,button } = pins.get(entry.key);
    const leader = width < 500 ? 13 : entry.leader;
    el.style.setProperty('--leader',leader+'px');
    el.style.left = entry.x+'px';
    el.style.top = entry.y+'px';
    el.hidden = false;
    const labelWidth = button.offsetWidth+leader+9;
    const left = entry.side === 'left' ? entry.x>labelWidth+7 : entry.x+labelWidth>width-6;
    el.className = 'pin'+(left?' left':'');
  }
  for (const [key,pin] of pins) if (!shown.has(key)) pin.el.hidden = true;
}

function openAudio() {
  const context = new AudioContext();
  const source = context.createBufferSource();
  const buffer = context.createBuffer(1,context.sampleRate*4,context.sampleRate);
  const samples = buffer.getChannelData(0);
  let previous = 0;
  for (let i=0;i<samples.length;i++) {
    previous = previous*.83+(Math.random()*2-1)*.17;
    samples[i] = previous;
  }
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 530;
  filter.Q.value = .63;
  const level = context.createGain();
  level.gain.value = 0;
  source.connect(filter).connect(level).connect(context.destination);
  source.start();
  return { context,filter,level };
}

$('sound').addEventListener('click',async () => {
  const button = $('sound');
  if (!sound) {
    audio ??= openAudio();
    await audio.context.resume();
    sound = true;
  } else {
    sound = false;
    audio.level.gain.setTargetAtTime(0,audio.context.currentTime,.055);
  }
  button.setAttribute('aria-pressed',sound);
  setText(button.lastElementChild,sound?'soundOn':'soundOff');
  paintIcon(button.firstElementChild,sound?'sound':'mute');
});
$('pause').addEventListener('click',() => {
  paused = !paused;
  $('pause').dataset.label = paused?'resume':'pause';
  $('pause').setAttribute('aria-label',translate($('pause').dataset.label));
  paintIcon($('pause'),paused?'play':'pause');
  $('live-status').parentElement.classList.toggle('stopped',paused);
  setText($('live-status'),paused?'paused':'live');
});
function tidalFraction(phase,ratio,recoil) {
  if (phase < ratio) return .5-.5*Math.cos(Math.PI*phase/ratio);
  // Passive emptying decays under elastic recoil, with an onset at peak inflation.
  const elapsed = (phase-ratio)/(1-ratio);
  const remaining = Math.exp(-recoil*elapsed**1.65);
  const end = Math.exp(-recoil);
  return (remaining-end)/(1-end);
}

const graph = $('graph');
const context = graph.getContext('2d');
const sampleHz = 20;
const history = Array.from({ length:12*sampleHz+1 },(_,i) => {
  const phase = (state.phase+(i/sampleHz-12)*14/60+4)%1;
  return 2.5+.5*tidalFraction(phase,.42,2.5);
});
let sampleTime = 0;
let redrawTime = 1;
function drawGraph() {
  const width = graph.clientWidth;
  const height = graph.clientHeight;
  if (!width || !height) return;
  const scale = Math.min(devicePixelRatio,2);
  if (graph.width !== Math.round(width*scale) || graph.height !== Math.round(height*scale)) {
    graph.width = Math.round(width*scale);
    graph.height = Math.round(height*scale);
  }
  context.setTransform(scale,0,0,scale,0,0);
  context.clearRect(0,0,width,height);
  const high = Math.max(3.2,Math.ceil((Math.max(...history)+.07)*10)/10);
  const low = 2.2;
  $('graph-top').textContent = high.toFixed(1)+' L';
  $('graph-mid').textContent = ((high+low)/2).toFixed(1)+' L';
  $('graph-low').textContent = low.toFixed(1)+' L';
  context.strokeStyle = '#263d525f';
  context.lineWidth = 1;
  context.beginPath();
  for (let i=1;i<8;i++) {
    const x = i*width/8;
    context.moveTo(x,0); context.lineTo(x,height);
  }
  for (let i=1;i<4;i++) {
    const y=i*height/4;
    context.moveTo(0,y); context.lineTo(width,y);
  }
  context.stroke();
  const yAt = value => height-3-(height-6)*bound((value-low)/(high-low),0,1);
  const fill = context.createLinearGradient(0,0,0,height);
  fill.addColorStop(0,'#56d7dd55');
  fill.addColorStop(1,'#56d7dd0a');
  context.beginPath();
  history.forEach((value,i) => context.lineTo(i*(width-3)/(history.length-1),yAt(value)));
  const path = new Path2D();
  history.forEach((value,i) => path.lineTo(i*(width-3)/(history.length-1),yAt(value)));
  context.lineTo(width-3,height);
  context.lineTo(0,height);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = '#79e2ea';
  context.lineWidth = 1.55;
  context.lineJoin = 'round';
  context.stroke(path);
  context.fillStyle = '#c6f8f9';
  context.beginPath();
  context.arc(width-3,yAt(history.at(-1)),2.2,0,Math.PI*2);
  context.fill();
}
new ResizeObserver(drawGraph).observe(graph);
updateControls();
updateLanguage();

let last = performance.now();
let lastSpo = 98;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = bound((now-last)/1000,.001,.15);
  last = now;
  const preset = presets[scenario];
  const transition = 1-Math.exp(-dt*2.4);
  state.rate = mix(state.rate,+rateControl.value,transition);
  state.depth = mix(state.depth,+depthControl.value,transition);
  state.base = mix(state.base,preset.base,transition);
  state.ratio = mix(state.ratio,preset.ratio,transition);
  state.recoil = mix(state.recoil,preset.recoil,transition);
  if (!paused) {
    state.time += dt;
    const previous = tidalFraction(state.phase,state.ratio,state.recoil);
    state.phase = (state.phase+dt*state.rate/60)%1;
    state.amount = tidalFraction(state.phase,state.ratio,state.recoil);
    state.flow = (state.amount-previous)/dt;
    const restingVentilation = preset.rate*(preset.depth-150);
    const adjustedVentilation = state.rate*(state.depth-150);
    const response = bound(Math.log2(adjustedVentilation/restingVentilation),-2,1.5);
    state.saturation = mix(state.saturation,bound(preset.spo+response*(scenario==='altitude'?1.22:.68),84,99),transition*.55);
    const rounded = Math.round(state.saturation);
    if (rounded !== lastSpo) $('metric-spo').textContent = lastSpo = rounded;
    sampleTime += dt;
    while (sampleTime >= 1/sampleHz) {
      history.shift();
      history.push(state.base+state.depth/1000*state.amount);
      sampleTime -= 1/sampleHz;
    }
  } else {
    state.flow = 0;
  }
  const inhaling = state.phase < state.ratio;
  const phase = paused?'paused':inhaling?'inhale':'exhale';
  if (phase !== phaseKey) {
    phaseKey = phase;
    setText($('phase-name'),phase);
    paintIcon($('phase-direction'),paused?'pause':inhaling?'down':'up');
    $('phase-direction').style.color = !paused && !inhaling?'var(--coral)':'var(--cyan)';
    $('phase-bar').style.background = !paused && !inhaling?'var(--coral)':'var(--cyan)';
  }
  $('phase-bar').style.transform = 'scaleX('+state.phase+')';
  if (audio && sound) {
    const flow = Math.abs(state.flow)*state.depth/650;
    const softness = inhaling?.61:.48;
    audio.level.gain.setTargetAtTime(paused?0:bound(flow*.072*softness,0,.12),audio.context.currentTime,.1);
    audio.filter.frequency.setTargetAtTime(inhaling?650:405,audio.context.currentTime,.15);
  }
  if (anatomy) anatomy.update(dt,state,preset,updatePins);
  redrawTime += dt;
  if (redrawTime >= .09) { redrawTime = 0; drawGraph(); }
}
requestAnimationFrame(frame);

createAnatomy($('viewport')).then(result => {
  anatomy = result;
  anatomy.setPick(selectPart);
  anatomy.setView(view);
  $('loading').hidden = true;
}).catch(error => {
  console.error(error);
  setText($('loading'),'loadError');
});
