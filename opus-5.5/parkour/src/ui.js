// ---------------------------------------------------------------------------
// UI: DOM HUD (timer, splits, hints, speed), start screen, pause menu and
// results screen.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

export function fmtTime(t, short = false) {
  if (t === null || t === undefined || !isFinite(t)) return '--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = Math.floor(s).toString().padStart(2, '0');
  const cs = Math.floor((s - Math.floor(s)) * 100).toString().padStart(2, '0');
  return short ? `${m}:${ss}` : `${m}:${ss}.${cs}`;
}
export function fmtDelta(d) {
  const sign = d < 0 ? '-' : '+';
  return sign + Math.abs(d).toFixed(2);
}

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), timer: $('timer'), cpinfo: $('cpinfo'), split: $('split'), hint: $('hint'),
      speed: $('speed').firstElementChild, speedv: $('speedv'), falls: $('falls'), ghostinfo: $('ghostinfo'), toast: $('toast'),
      start: $('start'), cta: $('cta'), startbest: $('startbest'), loadbar: $('loadbar').firstElementChild, loadtxt: $('loadtxt'),
      pause: $('pause'), results: $('results'), lockmsg: $('lockmsg'),
    };
    this.splitTimer = 0;
    this.toastTimer = 0;
    this.lastHint = '';
    this.lastTimerText = '';
  }

  loading(frac, text) {
    this.el.loadbar.style.width = `${Math.round(frac * 100)}%`;
    this.el.loadtxt.textContent = text || '';
  }
  ready(best) {
    this.el.cta.innerHTML = 'Click to play';
    this.el.loadtxt.textContent = '';
    document.getElementById('loadbar').classList.add('hidden');
    this.el.startbest.textContent = best ? `Best ${fmtTime(best)}` : 'No best time yet: set one.';
  }

  show(name) {
    for (const k of ['start', 'pause', 'results']) this.el[k].classList.toggle('hidden', k !== name);
    this.el.hud.classList.toggle('hidden', name !== 'hud' && name !== 'pause');
    if (name === 'hud') this.el.hud.classList.remove('hidden');
  }

  setLockMsg(v) { this.el.lockmsg.classList.toggle('hidden', !v); }

  timer(t) {
    const s = fmtTime(t);
    if (s === this.lastTimerText) return;
    this.lastTimerText = s;
    const [a, b] = s.split('.');
    this.el.timer.innerHTML = `${a}<small>.${b}</small>`;
  }

  cp(i, n) { this.el.cpinfo.textContent = `Checkpoint ${i} / ${n}`; }
  falls(n) { this.el.falls.textContent = `Falls ${n}`; }
  ghost(text) { this.el.ghostinfo.textContent = text; }

  split(label, t, delta) {
    const e = this.el.split;
    e.querySelector('.lbl').textContent = label;
    e.querySelector('.t').textContent = fmtTime(t);
    const d = e.querySelector('.d');
    e.classList.remove('good', 'bad');
    if (delta === null || delta === undefined) d.textContent = '';
    else { d.textContent = fmtDelta(delta); e.classList.add(delta <= 0 ? 'good' : 'bad'); }
    e.classList.add('show');
    this.splitTimer = 3;
  }

  toast(text, dur = 1.6) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = dur;
  }

  hint(html) {
    if (html === this.lastHint) return;
    this.lastHint = html;
    if (html) { this.el.hint.innerHTML = html; this.el.hint.classList.add('show'); }
    else this.el.hint.classList.remove('show');
  }

  speed(v) {
    const kmh = v * 3.6;
    this.el.speed.style.width = `${Math.min(100, (v / 14) * 100)}%`;
    this.el.speedv.textContent = `${Math.round(kmh)} km/h`;
  }

  update(dt) {
    if (this.splitTimer > 0) { this.splitTimer -= dt; if (this.splitTimer <= 0) this.el.split.classList.remove('show'); }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.el.toast.classList.remove('show'); }
  }

  results({ time, best, isRecord, falls, topSpeed, splits, bestSplits, labels }) {
    $('resTime').textContent = fmtTime(time);
    $('resBest').textContent = fmtTime(best);
    $('resFalls').textContent = String(falls);
    $('resTop').textContent = `${Math.round(topSpeed * 3.6)} km/h`;
    $('resRecord').classList.toggle('hidden', !isRecord);
    const rows = splits.map((t, i) => {
      const b = bestSplits ? bestSplits[i] : null;
      let dcell = '<td></td>';
      if (t !== null && b !== null && b !== undefined) {
        const d = t - b;
        dcell = `<td class="${d <= 0 ? 'good' : 'bad'}">${fmtDelta(d)}</td>`;
      }
      return `<tr><td>${labels[i]}</td><td>${t === null ? '&mdash;' : fmtTime(t)}</td>${dcell}</tr>`;
    });
    $('resSplits').innerHTML = rows.join('');
  }
}
