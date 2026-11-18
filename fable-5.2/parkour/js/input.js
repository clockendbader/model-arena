// ============================================================================
// input.js — keyboard + pointer-lock mouse. Produces a per-step input object
// for the player; "pressed" edges are delivered exactly once.
// ============================================================================
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0; this.sensitivity = 1;
    this.locked = false;
    this.edges = { jump: false, crouch: false, use: false };
    this.onKey = () => {};          // (code) for UI level shortcuts
    this.onLockChange = () => {};

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (GAME_KEYS.has(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      if (e.code === 'Space') this.edges.jump = true;
      if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') this.edges.crouch = true;
      if (e.code === 'KeyE') this.edges.use = true;
      if (GAME_KEYS.has(e.code) && this.locked) e.preventDefault();
      this.onKey(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const k = 0.0021 * this.sensitivity;
      // ignore the occasional huge spurious delta some browsers report under pointer lock
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.yaw -= e.movementX * k;
      this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch - e.movementY * k));
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
      this.onLockChange(this.locked);
    });
  }

  lock() { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(...codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }

  /** build the input for one physics step; edges only on the first step of a frame */
  sample(first) {
    const e = this.edges;
    const out = {
      mx: (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0),
      mz: (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0),
      sprint: this.down('ShiftLeft', 'ShiftRight'),
      jump: this.down('Space'),
      crouch: this.down('KeyC', 'ControlLeft', 'ControlRight'),
      jumpPressed: first && e.jump, crouchPressed: first && e.crouch, usePressed: first && e.use,
      yaw: this.yaw, pitch: this.pitch,
    };
    if (first) { e.jump = e.crouch = e.use = false; }
    return out;
  }
  clearEdges() { this.edges.jump = this.edges.crouch = this.edges.use = false; }
}
const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyR', 'KeyV', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
