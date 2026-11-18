// ============================================================================
// bot.js — a simple route-following autopilot.
// Used for headless validation of the course and for the in-browser demo
// (?bot=1). It only produces the same inputs a human would.
// ============================================================================
export class Bot {
  constructor(level, world) {
    this.level = level; this.world = world; this.route = level.route;
    this.reset(0);
  }

  reset(cpIndex) {
    this.i = this.level.cps[cpIndex].routeIndex;
    this.hold = 0; this.crouch = false; this.pending = null; this.rollArmed = false; this.sawZip = false;
    this.yaw = 0; this.done = false;
  }

  update(pl, dt) {
    const out = { mx: 0, mz: 1, sprint: true, jump: false, jumpPressed: false, crouch: this.crouch, crouchPressed: false, usePressed: false, yaw: this.yaw, pitch: 0 };
    if (this.done) { out.mz = 0; return out; }
    const p = pl.pos;
    if (pl.mode === 'zip') this.sawZip = true;
    let w = this.route[this.i];
    const prev = this.route[this.i - 1] || { x: p.x, z: p.z + 1 };
    const dist = Math.hypot(w.x - p.x, w.z - p.z);
    const passed = (p.x - w.x) * (w.x - prev.x) + (p.z - w.z) * (w.z - prev.z) > 0;
    let arrived = dist < (w.r || 0.9) || (passed && dist < 4);
    if (w.wait === 'zip') arrived = this.sawZip && pl.mode !== 'zip';
    if (pl.mode === 'zip' || pl.mode === 'mantle' || pl.mode === 'vault') arrived = false;
    if (arrived) {
      if (w.act) this.pending = { act: w.act, t: 0.02 };
      if (w.roll) this.rollArmed = true;
      if (w.act !== 'slide') this.crouch = false;
      this.sawZip = false;
      if (this.i < this.route.length - 1) this.i++; else this.done = true;
      w = this.route[this.i];
    }
    this.yaw = Math.atan2(-(w.x - p.x), -(w.z - p.z));
    out.yaw = this.yaw;
    if (this.pending && (this.pending.t -= dt) <= 0) {
      const a = this.pending.act; this.pending = null;
      if (a === 'jump' || a === 'kick') { out.jumpPressed = true; this.hold = 0.5; }
      else if (a === 'slide') { out.crouchPressed = true; this.crouch = true; }
      else if (a === 'use') out.usePressed = true;
    }
    if (this.hold > 0) { this.hold -= dt; out.jump = true; }
    if (this.rollArmed && pl.mode === 'air' && pl.vel.y < -9 && this.world.groundBelow(p.x, p.y, p.z, 0.38, 2.4)) {
      out.crouchPressed = true; this.rollArmed = false;
    }
    out.crouch = this.crouch || out.crouchPressed;
    return out;
  }
}
