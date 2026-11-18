// ============================================================================
// ui.js — DOM HUD and menu screens.
// ============================================================================
const $ = (id) => document.getElementById(id);

export function fmt(t) {
  if (t == null || !isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
export function fmtDelta(d) { return `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`; }

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'timer', 'best', 'split', 'cpN', 'fallsN', 'toast', 'prompt', 'capture', 'hint', 'speedFill', 'speedNum', 'rvtag', 'loading', 'barfill', 'loadtxt',
      'start', 'play', 'startBest', 'pause', 'resume', 'toCp', 'restart', 'sens', 'sensV', 'vol', 'volV', 'rv', 'results', 'resTitle', 'resTime', 'resDelta', 'resBest', 'resFalls', 'resTop', 'resSplits', 'again', 'err']) this.el[id] = $(id);
    this._hint = ''; this._splitT = 0; this._toastT = 0; this._lastTimer = '';
  }
  show(name) { for (const s of ['loading', 'start', 'pause', 'results']) this.el[s].classList.toggle('hidden', s !== name); }
  hud(on) { this.el.hud.classList.toggle('hidden', !on); }
  progress(p, txt) { this.el.barfill.style.width = `${Math.round(p * 100)}%`; if (txt) this.el.loadtxt.textContent = txt; }
  error(msg) { this.el.err.textContent = msg; }

  timer(t) { const s = fmt(t); if (s !== this._lastTimer) { this.el.timer.textContent = s; this._lastTimer = s; } }
  best(t) { this.el.best.textContent = t ? `Best ${fmt(t)}` : ''; this.el.startBest.textContent = t ? `Best run ${fmt(t)} — your ghost is waiting` : 'No best time yet — set one'; }
  checkpoint(i, n) { this.el.cpN.textContent = `${i} / ${n}`; }
  falls(n) { this.el.fallsN.textContent = n; }
  speed(v, top) {
    this.el.speedFill.style.width = `${Math.min(100, v / top * 100).toFixed(1)}%`;
    this.el.speedNum.textContent = `${Math.round(v * 3.6)} KM/H`;
  }
  hint(text) {
    if (text === this._hint) return;
    this._hint = text;
    if (text) this.el.hint.textContent = text;
    this.el.hint.classList.toggle('show', !!text);
  }
  prompt(on) { this.el.prompt.classList.toggle('show', on); }
  rv(on) { this.el.rvtag.classList.toggle('off', !on); this.el.rv.checked = on; }
  split(name, time, delta) {
    const cls = delta == null ? 'neutral' : delta <= 0 ? 'ahead' : 'behind';
    this.el.split.innerHTML = `<span class="name">${name}</span><span class="${cls}">${fmt(time)}${delta == null ? '' : '  ' + fmtDelta(delta)}</span>`;
    this.el.split.classList.add('show'); this._splitT = 3.2;
  }
  toast(text, dur = 1.6) { this.el.toast.textContent = text; this.el.toast.classList.add('show'); this._toastT = dur; }
  update(dt) {
    if (this._splitT > 0 && (this._splitT -= dt) <= 0) this.el.split.classList.remove('show');
    if (this._toastT > 0 && (this._toastT -= dt) <= 0) this.el.toast.classList.remove('show');
  }

  results(r) {
    this.el.resTitle.textContent = r.newBest ? 'NEW BEST' : 'RUN COMPLETE';
    this.el.resTime.textContent = fmt(r.time);
    this.el.resDelta.innerHTML = r.prevBest == null ? 'First completed run' : `<span class="${r.time <= r.prevBest ? 'ahead' : 'behind'}">${fmtDelta(r.time - r.prevBest)} vs previous best</span>`;
    this.el.resBest.textContent = fmt(r.best); this.el.resFalls.textContent = r.falls; this.el.resTop.textContent = `${Math.round(r.topSpeed * 3.6)} km/h`;
    let rows = '';
    r.splits.forEach((s, i) => {
      if (i === 0) return;
      const b = r.prevSplits ? r.prevSplits[i] : null;
      const d = s != null && b != null ? s - b : null;
      rows += `<tr><td>${r.names[i]}</td><td>${s == null ? 'skipped' : fmt(s)}</td><td class="${d == null ? '' : d <= 0 ? 'ahead' : 'behind'}">${d == null ? '' : fmtDelta(d)}</td></tr>`;
    });
    const fd = r.prevBest == null ? null : r.time - r.prevBest;
    rows += `<tr><td>Finish</td><td>${fmt(r.time)}</td><td class="${fd == null ? '' : fd <= 0 ? 'ahead' : 'behind'}">${fd == null ? '' : fmtDelta(fd)}</td></tr>`;
    this.el.resSplits.innerHTML = rows;
  }
}
