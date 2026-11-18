// ---------------------------------------------------------------------------
// Game systems: run timer, checkpoints + splits, deaths with fast fade
// respawn, finish & results, best time / splits / ghost persistence.
// ---------------------------------------------------------------------------

import { STORAGE_KEY } from './config.js';
import { GhostRecorder } from './ghost.js';

export class Game {
  constructor({ player, level, ui, markers, ghost, audio, rig, renderer }) {
    Object.assign(this, { player, level, ui, markers, ghost, audio, rig, renderer });
    this.state = 'menu';
    this.recorder = new GhostRecorder();
    this.labels = level.checkpoints.map((_, i) => `CP ${i + 1}`).concat(['FINISH']);
    this.load();
    this.resetRun();
  }

  // ---------------------------------------------------------------- storage
  load() {
    this.save = { best: null, bestSplits: null, ghost: null, sens: 1, vol: 0.8, rv: true, ghostOn: true };
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (s) Object.assign(this.save, s);
    } catch (e) { /* ignore */ }
  }
  persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.save)); } catch (e) {
      // ghost too large for quota: keep times at least
      try { const c = { ...this.save, ghost: null }; localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e2) { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------- run
  resetRun() {
    const s = this.level.spawn;
    this.player.reset(s.x, s.y, s.z, s.yaw);
    this.cpIndex = -1;
    this.time = 0;
    this.timing = false;
    this.falls = 0;
    this.topSpeed = 0;
    this.splits = new Array(this.level.checkpoints.length + 1).fill(null);
    this.fade = 0;
    this.fadePhase = null;
    this.recorder.reset();
    this.markers.setStates(-1);
    this.ghost.setData(this.save.ghost);
    this.ui.cp(0, this.level.checkpoints.length);
    this.ui.falls(0);
    this.ui.timer(0);
    this.ui.ghost(this.save.best ? `Ghost ${formatShort(this.save.best)}` : '');
    this.finished = false;
  }

  respawnAtCheckpoint() {
    const c = this.cpIndex >= 0 ? this.level.checkpoints[this.cpIndex] : this.level.spawn;
    this.player.reset(c.x, c.y, c.z, c.yaw);
  }

  /** R key: quick restart from the last checkpoint (fade). */
  requestRespawn() {
    if (this.fadePhase || this.finished) return;
    this.fadePhase = 'out';
    this.countFall = false;
  }

  onEvent(e) {
    if (e.type === 'death') {
      if (this.fadePhase) return;
      this.fadePhase = 'out';
      this.countFall = true;
    }
  }

  update(dt, input) {
    const p = this.player;
    // timer starts on first movement
    if (!this.timing && !this.finished && (input.fwd || input.strafe || input.jump)) this.timing = true;
    if (this.timing && !this.finished) {
      this.time += dt;
      this.recorder.update(dt, p);
    }
    this.topSpeed = Math.max(this.topSpeed, p.hspeed);

    // checkpoints (any order, only forward progress counts)
    const st = p.st;
    if (p.mode !== 'dead') {
      const cps = this.level.checkpoints;
      for (let i = this.cpIndex + 1; i < cps.length; i++) {
        const c = cps[i];
        const dx = st.x - c.x, dz = st.z - c.z, dy = st.y - c.y;
        if (dx * dx + dz * dz < 2.0 * 2.0 && dy > -1.0 && dy < 3.0) {
          this.reachCheckpoint(i);
          break;
        }
      }
      const f = this.level.finish;
      const dx = st.x - f.x, dz = st.z - f.z, dy = st.y - f.y;
      if (!this.finished && dx * dx + dz * dz < 2.4 * 2.4 && dy > -1 && dy < 4) this.finishRun();
    }

    // death fade: out 0.22 s -> respawn -> in 0.3 s
    if (this.fadePhase === 'out') {
      this.fade = Math.min(1, this.fade + dt / 0.22);
      if (this.fade >= 1) {
        if (this.countFall) { this.falls++; this.ui.falls(this.falls); }
        this.respawnAtCheckpoint();
        this.fadePhase = 'in';
      }
    } else if (this.fadePhase === 'in') {
      this.fade = Math.max(0, this.fade - dt / 0.3);
      if (this.fade <= 0) this.fadePhase = null;
    }

    // hints
    let hint = '';
    if (!this.finished) {
      for (const h of this.level.hints) {
        const [x0, z0, x1, z1] = h.box;
        if (st.x >= x0 && st.x <= x1 && st.z >= z0 && st.z <= z1) { hint = h.text; break; }
      }
    }
    this.ui.hint(hint);
    this.ui.timer(this.time);
    this.ui.speed(p.hspeed);
  }

  reachCheckpoint(i) {
    this.cpIndex = i;
    this.splits[i] = this.time;
    const best = this.save.bestSplits ? this.save.bestSplits[i] : null;
    this.ui.split(this.labels[i], this.time, best !== null && best !== undefined ? this.time - best : null);
    this.ui.cp(i + 1, this.level.checkpoints.length);
    this.markers.setStates(i);
    this.audio.onEvent({ type: 'checkpoint' });
  }

  finishRun() {
    this.finished = true;
    const n = this.level.checkpoints.length;
    this.splits[n] = this.time;
    const prevBest = this.save.best;
    const isRecord = prevBest === null || this.time < prevBest;
    const bestSplitsBefore = this.save.bestSplits;
    if (isRecord) {
      this.save.best = this.time;
      this.save.bestSplits = this.splits.slice();
      this.recorder.update(0.06, this.player);
      this.save.ghost = this.recorder.data;
    }
    this.persist();
    this.audio.onEvent({ type: 'finish' });
    this.ui.split('FINISH', this.time, prevBest !== null ? this.time - prevBest : null);
    this.ui.toast(isRecord ? 'NEW BEST' : 'FINISH', 2.2);
    this.resultsData = {
      time: this.time, best: this.save.best, isRecord, falls: this.falls, topSpeed: this.topSpeed,
      splits: this.splits, bestSplits: bestSplitsBefore, labels: this.labels,
    };
  }

  /** Music intensity grows with progress toward the finish. */
  get intensity() {
    const n = this.level.checkpoints.length;
    const prog = (this.cpIndex + 1) / n;
    return this.finished ? 1 : Math.min(1, 0.08 + prog * 0.92);
  }
}

function formatShort(t) {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}
