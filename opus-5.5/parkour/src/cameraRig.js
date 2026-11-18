// ---------------------------------------------------------------------------
// Camera rig: interpolated eye position, head bob tied to footsteps, FOV by
// speed, tilt into wall-runs, landing dip spring, roll rotation, trauma shake.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { PHYS, MOVE, CAM } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.eye = PHYS.eyeStand;
    this.dip = 0; this.dipVel = 0;
    this.roll = 0;
    this.pitchOff = 0;
    this.trauma = 0;
    this.fov = CAM.fovBase;
    this.t = 0;
    this.rollSpin = 0;
    this.speedFx = 0;
    camera.rotation.order = 'YXZ';
  }

  onEvent(e) {
    switch (e.type) {
      case 'land': this.dipVel -= clamp(e.v * 0.12, 0.2, 1.6) * (e.soft ? 0.4 : 1); break;
      case 'stumble': this.dipVel -= 2.4; this.trauma = Math.min(1, this.trauma + 0.75); break;
      case 'roll': this.dipVel -= 1.0; break;
      case 'bump': this.trauma = Math.min(1, this.trauma + clamp(e.v / 18, 0.1, 0.5)); break;
      case 'jump': this.dipVel += 0.25; break;
      case 'walljump': this.dipVel += 0.5; break;
      case 'mantle': this.dipVel -= 0.3; break;
      case 'death': this.trauma = 0.6; break;
      default: break;
    }
  }

  update(dt, p, alpha) {
    this.t += dt;
    const st = p.st, pr = p.prev;
    const x = pr.x + (st.x - pr.x) * alpha;
    const y = pr.y + (st.y - pr.y) * alpha;
    const z = pr.z + (st.z - pr.z) * alpha;
    const sp = p.hspeed;
    const mode = p.mode;

    // eye height (crouch / slide / roll)
    const low = mode === 'slide' || mode === 'roll' || (mode === 'ground' && p.crouched) || mode === 'mantle';
    const targetEye = low ? (mode === 'mantle' ? 1.1 : PHYS.eyeCrouch) : PHYS.eyeStand;
    this.eye = damp(this.eye, targetEye, mode === 'slide' ? 16 : 11, dt);

    // landing dip spring
    const k = 140, c = 15;
    this.dipVel += (-k * this.dip - c * this.dipVel) * dt;
    this.dip += this.dipVel * dt;
    this.dip = clamp(this.dip, -0.55, 0.3);

    // head bob from the step phase
    let bobY = 0, bobX = 0;
    if (mode === 'ground' && sp > 0.5) {
      const a = CAM.bobAmp * clamp(sp / 9, 0.25, 1.25) * (p.crouched ? 0.5 : 1);
      const ph = p.stepPhase * Math.PI * 2;
      bobY = -Math.abs(Math.sin(ph)) * a * 1.4 + a * 0.7;
      bobX = Math.cos(ph) * a * 0.55;
    } else if (mode === 'wallrun') {
      const ph = p.stepPhase * Math.PI * 2;
      bobY = -Math.abs(Math.sin(ph)) * 0.03;
    }

    // roll (tilt)
    let targetRoll = 0;
    if (mode === 'wallrun') targetRoll = p.wallSide * CAM.wallTilt;
    else if (mode === 'slide') targetRoll = 0.06;
    else if (mode === 'zip') targetRoll = Math.sin(this.t * 2.3) * 0.03;
    targetRoll += (p.lastStrafe || 0) * -0.015;
    this.roll = damp(this.roll, targetRoll, 7, dt);

    // pitch offsets: roll spin, mantle, slide
    let targetPitch = 0;
    if (mode === 'mantle' && p.anim) targetPitch = -0.12 * Math.sin(Math.min(1, p.anim.t) * Math.PI);
    if (mode === 'vault' && p.anim) targetPitch = -0.08 * Math.sin(Math.min(1, p.anim.t) * Math.PI);
    if (mode === 'slide') targetPitch = 0.04;
    this.pitchOff = damp(this.pitchOff, targetPitch, 10, dt);
    if (mode === 'roll') {
      const t = clamp(p.rollT / MOVE.rollTime, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.rollSpin = -e * Math.PI * 2;
    } else this.rollSpin = 0;

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const sx = (noise(this.t * 31) * 0.05) * sh, sy = (noise(this.t * 29 + 7) * 0.05) * sh, sr = noise(this.t * 23 + 3) * 0.04 * sh;

    // FOV with speed
    const zipBoost = mode === 'zip' ? 4 : 0;
    const ft = clamp((sp - CAM.fovSpeedMin) / (CAM.fovSpeedMax - CAM.fovSpeedMin), 0, 1);
    const targetFov = CAM.fovBase + (CAM.fovMax - CAM.fovBase) * ft * ft * (3 - 2 * ft) + zipBoost;
    this.fov = damp(this.fov, targetFov, 4, dt);
    this.speedFx = damp(this.speedFx, clamp((sp - 9.5) / 5, 0, 1), 5, dt);

    const cam = this.camera;
    // lateral bob in view space
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    cam.position.set(x, y + this.eye + this.dip * 0.35 + bobY + sy, z);
    cam.position.addScaledVector(right, bobX + sx);
    cam.rotation.set(clamp(p.pitch + this.pitchOff, -1.5, 1.5) + this.rollSpin, p.yaw, this.roll + sr);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
}

function noise(t) {
  return Math.sin(t) * 0.6 + Math.sin(t * 2.17 + 1.3) * 0.3 + Math.sin(t * 5.3 + 2.1) * 0.1;
}
