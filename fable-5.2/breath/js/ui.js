// DOM side of the exhibit: readouts, graph, scenario + slider controls, labels, info card, language.
import * as THREE from 'three';
import { STR, t, part, setLang, getLang, onLang } from './i18n.js';
import { FRC, SCENARIOS } from './physiology.js';

const $ = (id) => document.getElementById(id);
const v3 = new THREE.Vector3();

export class UI {
  constructor(phys, handlers) {
    this.phys = phys; this.h = handlers;
    this.level = 0; this.labelsOn = true; this.tags = []; this.info = null; this.factIndex = 0; this.factTimer = 0; this.readTimer = 0;
    this.samples = []; this.graphT = 0; this.yMax = FRC + 0.9; this.yMin = FRC - 0.25; this.wasInhaling = null;
    this._bind();
    onLang(() => this._relabel());
    this._relabel();
  }

  _bind() {
    const h = this.h;
    // scenarios
    document.querySelectorAll('.scn').forEach((b) => b.addEventListener('click', () => this.setScenario(b.dataset.scn)));
    // sliders
    this.sRate = $('s-rate'); this.sDepth = $('s-depth');
    this.sRate.addEventListener('input', () => { this.phys.rrTarget = +this.sRate.value; this._sliders(); });
    this.sDepth.addEventListener('input', () => { this.phys.tvTarget = +this.sDepth.value / 1000; this._sliders(); });
    // tools
    $('btn-lang').addEventListener('click', () => setLang(getLang() === 'en' ? 'ar' : 'en'));
    $('intro-lang').addEventListener('click', () => setLang(getLang() === 'en' ? 'ar' : 'en'));
    $('btn-sound').addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); h.onSound(on); });
    $('btn-labels').addEventListener('click', (e) => { this.labelsOn = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', this.labelsOn); });
    const pop = $('layers-pop'), lb = $('btn-layers');
    lb.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; lb.setAttribute('aria-expanded', !pop.hidden); });
    pop.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { pop.hidden = true; lb.setAttribute('aria-expanded', false); });
    pop.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => h.onLayer(i.dataset.layer, i.checked)));
    // levels
    document.querySelectorAll('.lvl').forEach((b) => b.addEventListener('click', () => h.onLevel(+b.dataset.level)));
    // facts
    $('fact-next').addEventListener('click', () => this._fact(this.factIndex + 1));
    // info card
    $('info-close').addEventListener('click', () => this.hideInfo());
    $('btn-begin').addEventListener('click', () => { $('intro').classList.add('is-gone'); $('ui').classList.remove('is-hidden'); h.onBegin(); });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') this.hideInfo();
      if (e.key === '1' || e.key === '2' || e.key === '3') h.onLevel(+e.key - 1);
      if (e.key === 'm' || e.key === 'M') $('btn-sound').click();
      if (e.key === 'l' || e.key === 'L') $('btn-lang').click();
    });
    this.graph = $('graph'); this.gctx = this.graph.getContext('2d');
  }

  setProgress(f, key) { $('load-bar').style.width = Math.round(f * 100) + '%'; if (key) { $('load-text').dataset.i18n = key; $('load-text').textContent = t(key); } }
  ready() { $('intro-load').hidden = true; $('intro-go').hidden = false; }
  fatal(msg) { const f = $('fatal'); f.hidden = false; f.textContent = msg; }

  setScenario(id) {
    this.phys.setScenario(id);
    document.querySelectorAll('.scn').forEach((b) => { const on = b.dataset.scn === id; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
    this.sRate.value = SCENARIOS[id].rr; this.sDepth.value = SCENARIOS[id].tv * 1000;
    this._sliders(); $('scn-desc').textContent = t('d_' + id);
    this.h.onScenario && this.h.onScenario(id);
  }

  _sliders() {
    for (const s of [this.sRate, this.sDepth]) s.style.setProperty('--p', ((s.value - s.min) / (s.max - s.min)) * 100 + '%');
    $('o-rate').textContent = this.sRate.value; $('o-depth').textContent = `${this.sDepth.value} ${t('tvUnit')}`;
  }

  setLevel(level, flying) {
    this.level = level;
    document.querySelectorAll('.lvl').forEach((b) => b.classList.toggle('is-active', +b.dataset.level === level));
    $('levels').classList.toggle('is-flying', !!flying);
    this._caption();
  }

  _caption() {
    const key = ['cap_body', 'cap_airways', 'cap_alveolus'][this.level];
    $('caption-text').textContent = t(key);
    const L = $('legend'); L.textContent = '';
    const item = (cls, colour, label, partKey) => {
      const el = document.createElement(partKey ? 'button' : 'span');
      const dot = document.createElement('i'); if (cls) dot.className = cls; if (colour) dot.style.setProperty('--c', colour);
      el.append(dot, document.createTextNode(label));
      if (partKey) el.addEventListener('click', (e) => { e.stopPropagation(); this.showInfo(partKey, null); });
      L.append(el);
    };
    item('', 'var(--o2)', t('legend_o2'), 'o2'); item('', 'var(--co2)', t('legend_co2'), 'co2');
    if (this.level === 2) item('grad', null, t('legend_rbc'), 'rbc'); else item('', '#93a6b8', t('legend_n2'), null);
    if (this.level === 1 && this.generations) { const s = document.createElement('span'); s.textContent = `${this.generations} ${t('generations')}`; L.append(s); }
  }

  _relabel() {
    this._sliders(); this._caption(); this._fact(this.factIndex, true);
    $('scn-desc').textContent = t('d_' + this.phys.scenario);
    for (const tag of this.tags) tag.text.textContent = part(tag.part)[0];
    if (this.info) this.showInfo(this.info.key, this.info.anchor);
    $('phase-text').textContent = t(this.phys.inhaling ? 'inhale' : 'exhale');
    document.title = getLang() === 'ar' ? 'نَفَس — رحلة تفاعلية داخل رئتي الإنسان' : 'Breath — an interactive journey into the human lungs';
  }

  _fact(i, instant) {
    const list = STR[getLang()].facts_list; this.factIndex = ((i % list.length) + list.length) % list.length; this.factTimer = 0;
    const el = $('fact'); const apply = () => {
      $('fact-num').textContent = list[this.factIndex][0]; $('fact-text').textContent = list[this.factIndex][1];
      const dots = $('fact-dots'); dots.textContent = ''; list.forEach((_, k) => { const d = document.createElement('i'); if (k === this.factIndex) d.className = 'on'; dots.append(d); });
      el.classList.remove('is-swapping');
    };
    if (instant) apply(); else { el.classList.add('is-swapping'); setTimeout(apply, 350); }
  }

  // ------------------------------------------------------------ 3D labels
  /** defs: [{ part, level, pos: (out) => Vector3, side: 'left' | 'right' }] */
  setLabels(defs) {
    const root = $('labels'); root.textContent = '';
    this.tags = defs.map((d) => {
      const el = document.createElement('div'); el.className = 'tag' + (d.side === 'left' ? ' is-left' : '');
      const dot = document.createElement('i'); dot.className = 'tag__dot'; const line = document.createElement('i'); line.className = 'tag__line';
      const text = document.createElement('span'); text.className = 'tag__text'; text.textContent = part(d.part)[0];
      el.append(dot, line, text); el.style.opacity = 0;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.showInfo(d.info || d.part, d.pos); });
      root.append(el);
      return { ...d, el, text, shown: 0 };
    });
  }

  _project(pos, camera, w, h) {
    v3.copy(pos).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h, ok: v3.z > -1 && v3.z < 1 };
  }

  updateLabels(camera, w, h, levelF, flying) {
    const p = new THREE.Vector3();
    if (!this.safeT || performance.now() - this.safeT > 500) {
      this.safeT = performance.now(); const dirRtl = document.documentElement.dir === 'rtl';
      const vw = $('vitals').getBoundingClientRect(), cw = $('controls').getBoundingClientRect();
      const lft = dirRtl ? cw : vw, rgt = dirRtl ? vw : cw; this.safeL = lft.right + 8; this.safeR = w - rgt.left + 8;
    }
    for (const tag of this.tags) {
      const near = Math.abs(levelF - tag.level) < 0.22 && !flying && this.labelsOn;
      let alpha = 0, s = null;
      if (near) {
        tag.pos(p); s = this._project(p, camera, w, h);
        // keep the label (and its text) clear of the side panels and the bottom bar
        const wide = w > 820; const x0 = wide ? this.safeL : 12, x1 = wide ? w - this.safeR : w - 12;
        const tw = tag.el.offsetWidth || 170; const a = tag.side === 'left' ? s.x - tw : s.x, b = tag.side === 'left' ? s.x : s.x + tw;
        if (s.ok && a > x0 && b < x1 && s.y > 74 && s.y < h - 150) alpha = 1;
        // step aside for the open info card
        const c = this.cardBox; if (alpha && c && b > c.x - 6 && a < c.x + c.w + 6 && s.y > c.y - 18 && s.y < c.y + c.h + 18) alpha = 0;
      }
      if (alpha !== tag.shown) { tag.el.style.opacity = alpha; tag.el.style.pointerEvents = alpha ? 'auto' : 'none'; tag.shown = alpha; }
      if (s && alpha) tag.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(${tag.side === 'left' ? '-100%' : '0'}, -50%)`;
    }
    if (this.info) {
      const card = $('info'), pin = $('info-pin');
      if (this.info.anchor) {
        this.info.anchor(p); const s = this._project(p, camera, w, h);
        const cw = card.offsetWidth, ch = card.offsetHeight;
        const wide = w > 820; const x0 = wide ? this.safeL : 12, x1 = wide ? w - this.safeR : w - 12;   // stay between the side panels
        let x = s.x + 22, y = s.y - ch - 14; if (x + cw > x1) x = s.x - cw - 22; x = Math.max(x0, Math.min(x1 - cw, x)); y = Math.max(72, Math.min(h - ch - 130, y));
        card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; this.cardBox = { x, y, w: cw, h: ch };
        pin.hidden = !s.ok; pin.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      } else {
        pin.hidden = true; const x = (w - card.offsetWidth) / 2, y = h - card.offsetHeight - 190;
        card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; this.cardBox = { x, y, w: card.offsetWidth, h: card.offsetHeight };
      }
    } else this.cardBox = null;
  }

  /** anchor: (out) => world position, or a fixed Vector3, or null */
  showInfo(key, anchor) {
    const fixed = anchor && anchor.isVector3 ? anchor.clone() : null;
    this.info = { key, anchor: fixed ? (out) => out.copy(fixed) : anchor };
    const lang = getLang(), other = lang === 'en' ? 'ar' : 'en';
    $('info-name').textContent = part(key)[0]; $('info-desc').textContent = part(key)[1];
    const alt = $('info-alt'); alt.textContent = part(key, other)[0]; alt.dir = other === 'ar' ? 'rtl' : 'ltr'; alt.lang = other;
    const card = $('info'); card.hidden = false; card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  }
  hideInfo() { this.info = null; $('info').hidden = true; $('info-pin').hidden = true; }

  // ------------------------------------------------------------ per-frame
  update(dt, phys) {
    // phase chip
    if (phys.inhaling !== this.wasInhaling) {
      this.wasInhaling = phys.inhaling; $('phase').classList.toggle('is-in', phys.inhaling); $('phase-text').textContent = t(phys.inhaling ? 'inhale' : 'exhale');
    }
    $('phase').style.setProperty('--s', (0.7 + 0.7 * phys.wave).toFixed(3));
    this.readTimer += dt;
    if (this.readTimer > 0.12) {
      this.readTimer = 0;
      $('v-rr').textContent = Math.round(phys.rr);
      $('v-tv').textContent = Math.round(phys.tv * 100) * 10;
      $('v-mv').textContent = phys.minuteVentilation.toFixed(1);
      const s = Math.round(phys.spo2); $('v-spo2').textContent = s;
      const st = $('stat-spo2'); st.classList.toggle('is-warn', s < 95 && s >= 90); st.classList.toggle('is-low', s < 90);
      $('spo2-bar').style.width = THREE.MathUtils.clamp(((phys.spo2 - 70) / 30) * 100, 4, 100) + '%';
      $('v-vol').textContent = phys.lungVolume.toFixed(2);
      $('v-hr').textContent = Math.round(phys.p.hr); $('v-pio2').textContent = Math.round(phys.gas.pio2); $('v-pao2').textContent = Math.round(phys.gas.pAo2);
    }
    this.factTimer += dt; if (this.factTimer > 11) this._fact(this.factIndex + 1);
    this._graph(dt, phys);
  }

  _graph(dt, phys) {
    const WINDOW = 16; this.graphT += dt;
    const last = this.samples[this.samples.length - 1];
    if (!last || this.graphT - last[0] > 1 / 40) this.samples.push([this.graphT, phys.lungVolume, phys.inhaling]);
    while (this.samples.length && this.samples[0][0] < this.graphT - WINDOW - 0.5) this.samples.shift();
    const c = this.graph, g = this.gctx; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight; if (!W) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    let mx = FRC + 0.7, mn = FRC - 0.2; for (const s of this.samples) { if (s[1] > mx) mx = s[1]; if (s[1] < mn) mn = s[1]; }
    this.yMax += (mx + 0.25 - this.yMax) * Math.min(1, dt * 2.5); this.yMin += (mn - 0.2 - this.yMin) * Math.min(1, dt * 2.5);
    const padL = 30, padR = 6, padT = 8, padB = 8;
    const X = (time) => padL + (1 - (this.graphT - time) / WINDOW) * (W - padL - padR);
    const Y = (vol) => padT + (1 - (vol - this.yMin) / (this.yMax - this.yMin)) * (H - padT - padB);
    // grid + axis labels (litres)
    g.font = '10px "Plex Mono", monospace'; g.textBaseline = 'middle'; g.textAlign = 'right';
    const step = this.yMax - this.yMin > 2.4 ? 1 : 0.5;
    for (let v = Math.ceil(this.yMin / step) * step; v < this.yMax; v += step) {
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - padR, Y(v)); g.stroke();
      g.fillStyle = 'rgba(143,156,174,0.9)'; g.fillText(v.toFixed(1), padL - 6, Y(v));
    }
    // resting level (FRC)
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(126,224,194,0.5)'; g.beginPath(); g.moveTo(padL, Y(FRC)); g.lineTo(W - padR, Y(FRC)); g.stroke(); g.setLineDash([]);
    if (this.samples.length < 2) return;
    g.save(); g.beginPath(); g.rect(padL, 0, W - padL - padR, H); g.clip();
    const grad = g.createLinearGradient(0, padT, 0, H); grad.addColorStop(0, 'rgba(255,176,164,0.30)'); grad.addColorStop(1, 'rgba(255,176,164,0)');
    g.beginPath(); this.samples.forEach((s, i) => (i ? g.lineTo(X(s[0]), Y(s[1])) : g.moveTo(X(s[0]), Y(s[1]))));
    g.lineTo(X(this.graphT), H); g.lineTo(X(this.samples[0][0]), H); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); this.samples.forEach((s, i) => (i ? g.lineTo(X(s[0]), Y(s[1])) : g.moveTo(X(s[0]), Y(s[1]))));
    g.strokeStyle = '#ffb0a4'; g.lineWidth = 1.8; g.lineJoin = 'round'; g.stroke();
    g.restore();
    const ls = this.samples[this.samples.length - 1];
    g.beginPath(); g.arc(X(ls[0]) - 1, Y(ls[1]), 3.2, 0, 6.3); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(X(ls[0]) - 1, Y(ls[1]), 7, 0, 6.3); g.fillStyle = 'rgba(255,176,164,0.25)'; g.fill();
  }
}
