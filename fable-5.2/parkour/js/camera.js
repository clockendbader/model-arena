// ============================================================================
// camera.js — first-person camera rig. Purely cosmetic: interpolates the
// fixed-step player, then layers head bob, landing dip, wall-run tilt, roll,
// vault/mantle motion, shake and speed-driven FOV on top.
// ============================================================================
import { C } from './config.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = t => t * t * (3 - 2 * t);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.eye = C.eye; this.tilt = 0; this.fov = 75; this.pitchAdd = 0;
    this.dip = 0; this.dipV = 0; this.stepOff = 0;
    this.bobPhase = 0; this.bobAmp = 0;
    this.rollT = -1; this.trauma = 0; this.t = 0;
    this.wallSide = 0; this.kick = 0;
    this.pos = { x: 0, y: 0, z: 0 };
  }

  reset() { this.dip = this.dipV = this.stepOff = 0; this.rollT = -1; this.trauma = 0; this.tilt = 0; this.pitchAdd = 0; this.eye = C.eye; this.kick = 0; }

  /** gameplay events that move the camera */
  onEvent(type, d) {
    if (type === 'land') {
      this.dipV -= Math.min(d.impact, 26) * 0.11;
      if (d.kind === 'roll') this.rollT = 0;
      if (d.kind === 'stumble') { this.trauma = Math.min(1, this.trauma + 0.85); this.dipV -= 1.2; }
    } else if (type === 'jump' || type === 'wallJump') this.dipV += 0.5;
    else if (type === 'wallrunStart') this.wallSide = d.side;
    else if (type === 'bump') this.trauma = Math.min(1, this.trauma + Math.min(0.4, d.speed * 0.03));
    else if (type === 'vault') this.kick = 1;
  }

  update(dt, pl, alpha, yaw, pitch) {
    this.t += dt;
    const cam = this.camera;
    const px = pl.prev.x + (pl.pos.x - pl.prev.x) * alpha, py = pl.prev.y + (pl.pos.y - pl.prev.y) * alpha, pz = pl.prev.z + (pl.pos.z - pl.prev.z) * alpha;
    const speed = pl.speedH, mode = pl.mode;

    // eye height
    let eyeT = C.eye;
    if (mode === 'slide') eyeT = C.crouchEye;
    else if (pl.rollT > 0) eyeT = C.crouchEye + 0.1;
    else if (pl.crouched) eyeT = C.crouchEye + 0.18;
    else if (mode === 'vault') eyeT = 1.15;
    this.eye = damp(this.eye, eyeT, mode === 'slide' ? 13 : 10, dt);

    // step-up smoothing (curbs do not pop the camera)
    if (pl.stepUp) { this.stepOff -= pl.stepUp; pl.stepUp = 0; }
    this.stepOff = damp(this.stepOff, 0, 16, dt);

    // landing spring
    this.dipV += (-this.dip * 170 - this.dipV * 19) * dt;
    this.dip += this.dipV * dt;
    this.dip = Math.max(-0.75, Math.min(0.25, this.dip));

    // head bob, locked to the footstep cadence
    const running = mode === 'ground' && pl.rollT <= 0 && speed > 0.8;
    const stride = 0.75 + 0.115 * Math.min(speed, 13);
    if (running) this.bobPhase = (pl.stepSide > 0 ? 0 : 1) + pl.stepDist / stride;
    else if (mode === 'wallrun') this.bobPhase += dt * 6.5;
    this.bobAmp = damp(this.bobAmp, running ? Math.min(1, speed / 7) : mode === 'wallrun' ? 0.7 : 0, 8, dt);
    const ph = this.bobPhase * Math.PI;
    const bobY = -Math.abs(Math.sin(ph)) * 0.05 * this.bobAmp + 0.02 * this.bobAmp;
    const bobX = Math.cos(ph) * 0.028 * this.bobAmp;

    // tilt (roll axis)
    let tiltT = 0, pitchT = 0;
    if (mode === 'wallrun') tiltT = -this.wallSide * 0.21;
    else if (mode === 'slide') tiltT = 0.055;
    else if (mode === 'zip') tiltT = Math.sin(this.t * 2.1) * 0.03;
    else if (mode === 'ground') tiltT = -(pl.inp ? pl.inp.mx : 0) * 0.018 * Math.min(1, speed / 6);
    if (mode === 'mantle') { const u = Math.min(1, pl.mt.t / pl.mt.T); pitchT = -0.3 * Math.sin(Math.PI * u) * (1 - u * 0.4); tiltT = 0.05 * Math.sin(Math.PI * u); }
    if (mode === 'vault') { const u = Math.min(1, pl.vt.t / pl.vt.T); pitchT = -0.16 * Math.sin(Math.PI * u); tiltT = 0.13 * Math.sin(Math.PI * u) * pl.stepSide; }
    if (mode === 'climb') pitchT = 0.16;
    if (mode === 'air' && pl.vel.y < -9) pitchT = Math.max(-0.14, (pl.vel.y + 9) * 0.012);
    this.tilt = damp(this.tilt, tiltT, mode === 'wallrun' ? 9 : 7, dt);
    this.pitchAdd = damp(this.pitchAdd, pitchT, 10, dt);

    // roll: a full forward tumble of the view
    let rollRot = 0;
    if (this.rollT >= 0) {
      this.rollT += dt / C.rollTime;
      if (this.rollT >= 1) this.rollT = -1; else rollRot = -Math.PI * 2 * smooth(this.rollT);
    }

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const sh = this.trauma * this.trauma, t = this.t * 31;
    const shx = Math.sin(t * 1.3) * Math.cos(t * 0.7) * sh, shy = Math.sin(t * 1.7 + 1) * sh, shz = Math.sin(t * 2.3 + 2) * sh;

    // fov
    const k = Math.max(0, Math.min(1, (speed - 4.5) / 8));
    const fovT = 75 + 20 * smooth(k) + (mode === 'zip' ? 4 : 0);
    this.fov = damp(this.fov, fovT, 3.5, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    this.pos.x = px + rx * bobX; this.pos.y = py + this.eye + this.dip + this.stepOff + bobY; this.pos.z = pz + rz * bobX;
    cam.position.set(this.pos.x + shx * 0.05, this.pos.y + shy * 0.06, this.pos.z);
    cam.rotation.set(pitch + this.pitchAdd + rollRot + shy * 0.035, yaw + shx * 0.03, this.tilt + shz * 0.04);
  }
}
