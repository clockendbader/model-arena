// DOM overlay: language, panels, live readouts, lung-volume graph, labels, info card.
import * as THREE from 'three';
import { STRINGS, fmt } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.lang = 'en';
    try { this.lang = localStorage.getItem('breath.lang') || 'en'; } catch { /* storage unavailable */ }
    this.mode = 'body';
    this.scenario = 'rest';
    this.labelsOn = true;
    this.samples = [];
    this.graphRange = null;
    this.labelEls = [];
    this.bind();
    this.applyLanguage();
  }

  get S() { return STRINGS[this.lang]; }

  num(v, digits = 0) {
    return new Intl.NumberFormat(this.lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  }

  bind() {
    $$('[data-level]').forEach(b => b.addEventListener('click', () => this.h.level(b.dataset.level)));
    $$('[data-scenario]').forEach(b => b.addEventListener('click', () => this.h.scenario(b.dataset.scenario)));
    const rate = $('#rate'), depth = $('#depth');
    rate.addEventListener('input', () => { this.h.rate(+rate.value); this.updateSliderText(); });
    depth.addEventListener('input', () => { this.h.depth(+depth.value); this.updateSliderText(); });
    $('#btn-lang').addEventListener('click', () => { this.lang = this.lang === 'en' ? 'ar' : 'en'; try { localStorage.setItem('breath.lang', this.lang); } catch { /* ignore */ } this.applyLanguage(); });
    $('#btn-sound').addEventListener('click', e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); this.h.sound(on); });
    $('#btn-labels').addEventListener('click', e => { this.labelsOn = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', this.labelsOn); });
    $('#btn-xray').addEventListener('click', e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); this.h.xray(on); });
    $('#btn-facts').addEventListener('click', () => this.toggleFacts(true));
    $('#facts-close').addEventListener('click', () => this.toggleFacts(false));
    $('#info-close').addEventListener('click', () => this.hideInfo());
    $('#panel-toggle')?.addEventListener('click', () => document.body.classList.toggle('panel-open'));
    window.addEventListener('keydown', e => { if (e.key === 'Escape') { this.toggleFacts(false); this.hideInfo(); } });
  }

  toggleFacts(show) {
    const f = $('#facts');
    f.classList.toggle('open', show);
    f.setAttribute('aria-hidden', !show);
  }

  applyLanguage() {
    const S = this.S;
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
    $$('[data-i18n]').forEach(el => {
      const path = el.dataset.i18n.split('.');
      let v = S; for (const k of path) v = v?.[k];
      if (typeof v === 'string') el.textContent = v;
    });
    $('#facts-list').innerHTML = S.facts.map(([n, t]) => `<li><span class="fact-num">${n}</span><span class="fact-text">${t}</span></li>`).join('');
    this.updateSliderText();
    this.setScenario(this.scenario, true);
    if (this.infoKey) this.showInfo(this.infoKey, this.infoExtra);
    this.renderLegend();
    this.labelEls.forEach(l => { l.el.querySelector('span').textContent = this.partName(l.id); });
  }

  partName(id) {
    const p = this.S.parts[id];
    if (p) return p[0];
    if (id === 'cardiac_notch') return this.lang === 'ar' ? 'الثلمة القلبية' : 'Cardiac notch';
    return id;
  }

  updateSliderText() {
    const S = this.S;
    $('#rate-val').textContent = `${this.num(+$('#rate').value)} ${S.perMin}`;
    $('#depth-val').textContent = `${this.num(+$('#depth').value)} ${S.mL}`;
  }

  setSliders(rr, vt) {
    $('#rate').value = rr; $('#depth').value = vt;
    this.updateSliderText();
  }

  setScenario(name, silent = false) {
    this.scenario = name;
    $$('[data-scenario]').forEach(b => b.setAttribute('aria-pressed', b.dataset.scenario === name));
    $('#scenario-note').textContent = this.S.scenarioNotes[name];
    document.body.dataset.scenario = name;
    this.renderLegend();
  }

  setMode(mode) {
    this.mode = mode;
    document.body.dataset.mode = mode;
    $$('[data-level]').forEach(b => b.setAttribute('aria-current', b.dataset.level === mode ? 'step' : 'false'));
    this.renderLegend();
  }

  setBusy(busy) {
    document.body.classList.toggle('flying', busy);
  }

  renderLegend() {
    const S = this.S, L = $('#legend');
    if (this.mode === 'alveolus') {
      L.innerHTML = `
        <div class="lg"><i class="dot o2"></i>${S.legendO2}</div>
        <div class="lg"><i class="dot co2"></i>${S.legendCO2}</div>
        <div class="lg"><i class="bar rbc"></i>${S.legendRBC}</div>
        <p class="lg-note">${S.microNote}</p>`;
    } else {
      L.innerHTML = `
        <div class="lg"><i class="dot air"></i>${S.legendAir}</div>
        <div class="lg"><i class="dot stale"></i>${S.legendStale}</div>
        ${this.scenario === 'smoker' ? `<div class="lg"><i class="dot smoke"></i>${S.legendSmoke}</div>` : ''}
        <p class="lg-note" id="airway-gen"></p>`;
    }
  }

  setAirwayGeneration(g) {
    const el = $('#airway-gen');
    if (!el) return;
    el.textContent = g == null ? '' : fmt(this.S.airwayNote, { g: this.num(g) });
  }

  showInfo(key, extra = {}) {
    this.infoKey = key; this.infoExtra = extra;
    const S = this.S;
    let [title, text] = S.parts[key] || [key, ''];
    if (key === 'bronchial_tree' && extra.gen != null) {
      const g = extra.gen;
      const kind = this.lang === 'ar'
        ? (g <= 2 ? 'قصبة فصّية' : g === 3 ? 'قصبة قطعية' : g < 9 ? 'قصبة صغيرة' : 'قُصَيبة')
        : (g <= 2 ? 'Lobar bronchus' : g === 3 ? 'Segmental bronchus' : g < 9 ? 'Small bronchus' : 'Bronchiole');
      title = `${kind} · ${S.generation} ${this.num(g)}`;
    }
    $('#info-title').textContent = title;
    $('#info-text').textContent = text;
    const card = $('#info');
    card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    card.setAttribute('aria-hidden', 'false');
  }

  hideInfo() {
    this.infoKey = null;
    $('#info').classList.remove('show');
    $('#info').setAttribute('aria-hidden', 'true');
  }

  // ---------------------------------------------------------- readouts
  update(phys, dt) {
    const S = this.S, o = phys.out;
    this._acc = (this._acc || 0) + dt;
    this.samples.push([phys.time, o.volume]);
    while (this.samples.length && phys.time - this.samples[0][0] > 12) this.samples.shift();
    if (this._acc > 0.12) {
      this._acc = 0;
      $('#r-bpm').textContent = this.num(o.rr);
      $('#r-vt').textContent = this.num(Math.round(o.vt / 10) * 10);
      $('#r-ve').textContent = this.num(o.ve, 1);
      const sp = phys.spo2Display;
      $('#r-spo2').textContent = this.num(sp);
      $('#spo2-card').dataset.level = sp >= 95 ? 'ok' : sp >= 90 ? 'warn' : 'low';
      $('#r-pao2').textContent = `${this.num(o.pAO2)} ${S.mmHg}`;
      $('#r-paco2').textContent = `${this.num(o.paco2)} ${S.mmHg}`;
      $('#r-hr').textContent = `${this.num(o.hr)} ${S.bpm}`;
      const extra = [];
      if (phys.p.altitude > 200) extra.push(fmt(S.altitudeLabel, { a: this.num(Math.round(phys.p.altitude / 50) * 50), p: this.num(o.pio2) }));
      if (phys.p.cohb > 3) extra.push(fmt(S.cohbNote, { c: this.num(phys.p.cohb) }));
      $('#scenario-extra').textContent = extra.join(' · ');
    }
    const ph = $('#phase');
    const inh = phys.inhaling;
    if (this._inh !== inh) {
      this._inh = inh;
      ph.textContent = inh ? S.inhale : S.exhale;
      ph.dataset.phase = inh ? 'in' : 'out';
    }
    this.drawGraph(phys);
  }

  drawGraph(phys) {
    const c = $('#graph');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (this.samples.length < 2) return;
    let mn = Infinity, mx = -Infinity;
    for (const [, v] of this.samples) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const want = [Math.floor((mn - 250) / 500) * 500, Math.ceil((mx + 250) / 500) * 500];
    if (!this.graphRange) this.graphRange = want.slice();
    this.graphRange[0] += (want[0] - this.graphRange[0]) * 0.05;
    this.graphRange[1] += (want[1] - this.graphRange[1]) * 0.05;
    const [y0, y1] = this.graphRange;
    const rtl = this.lang === 'ar';
    const padL = rtl ? 6 : 34, padR = rtl ? 34 : 6, padT = 6, padB = 6;
    const X = t => { const u = 1 - (phys.time - t) / 12; const x = padL + u * (w - padL - padR); return rtl ? w - x : x; };
    const Y = v => padT + (1 - (v - y0) / (y1 - y0)) * (h - padT - padB);
    // grid
    g.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    g.fillStyle = 'rgba(200,215,235,0.45)';
    g.strokeStyle = 'rgba(200,215,235,0.10)';
    g.lineWidth = 1;
    g.textAlign = rtl ? 'right' : 'left';
    const step = (y1 - y0) > 3000 ? 1000 : 500;
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      g.beginPath(); g.moveTo(rtl ? 0 : padL, y); g.lineTo(rtl ? w - padR : w, y); g.stroke();
      g.fillText(this.num(v / 1000, 1), rtl ? w - 2 : 2, y + 3);
    }
    // curve
    const grad = g.createLinearGradient(0, padT, 0, h);
    grad.addColorStop(0, 'rgba(120,220,255,0.35)');
    grad.addColorStop(1, 'rgba(120,220,255,0)');
    g.beginPath();
    this.samples.forEach(([t, v], i) => { const x = X(t), y = Y(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    const last = this.samples[this.samples.length - 1];
    g.lineTo(X(last[0]), h); g.lineTo(X(this.samples[0][0]), h); g.closePath();
    g.fillStyle = grad; g.fill();
    g.beginPath();
    this.samples.forEach(([t, v], i) => { const x = X(t), y = Y(v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokeStyle = '#8fe3ff'; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.arc(X(last[0]), Y(last[1]), 3, 0, Math.PI * 2);
    g.fillStyle = phys.inhaling ? '#bff1ff' : '#a99bff'; g.fill();
  }

  // ---------------------------------------------------------- labels
  setLabels(list) {
    const root = $('#labels');
    root.innerHTML = '';
    this.labelEls = list.map(({ id, pos, deform, scene }) => {
      const el = document.createElement('button');
      el.className = 'label';
      el.type = 'button';
      el.innerHTML = `<i></i><span>${this.partName(id)}</span>`;
      el.addEventListener('click', () => this.h.pickLabel(id));
      root.appendChild(el);
      return { id, pos, deform, scene, el, opacity: 0 };
    });
  }

  updateLabels(camera, sceneName, transformFn, busy) {
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const l of this.labelEls) {
      let show = this.labelsOn && !busy && l.scene === sceneName;
      if (show) {
        transformFn(l, v);
        v.project(camera);
        if (v.z > 1 || v.z < -1) show = false;
      }
      const target = show ? 1 : 0;
      l.opacity += (target - l.opacity) * 0.15;
      if (l.opacity < 0.02) { l.el.style.visibility = 'hidden'; continue; }
      l.el.style.visibility = 'visible';
      l.el.style.opacity = l.opacity.toFixed(3);
      if (show) l.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`;
    }
  }

  progress(f) {
    $('#loader-bar').style.transform = `scaleX(${f})`;
  }

  ready() {
    document.body.classList.add('ready');
    setTimeout(() => $('#loader')?.remove(), 1400);
  }

  error(msg) {
    $('#loader-text').textContent = msg;
    document.body.classList.add('load-error');
  }
}
