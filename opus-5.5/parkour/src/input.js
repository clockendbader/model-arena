// ---------------------------------------------------------------------------
// Input: keyboard state, edge-triggered presses, pointer-lock mouse look.
// ---------------------------------------------------------------------------

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // pressed since last consume
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.enabled = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // guard against rare huge spikes some browsers emit on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.keys.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch (e) {
      this.canvas.requestPointerLock();
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  get forward() { return (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0); }
  get strafe() { return (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0); }
  get jumpHeld() { return this.down('Space'); }
  get sprintHeld() { return this.down('ShiftLeft', 'ShiftRight'); }
  get crouchHeld() { return this.down('KeyC', 'ControlLeft', 'ControlRight'); }

  consumeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }
  endFrame() { this.pressed.clear(); this.released.clear(); }
}
