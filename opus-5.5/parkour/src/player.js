// ---------------------------------------------------------------------------
// Player controller: momentum running, variable jump, coyote/buffer, wall-run,
// wall-climb, ledge grab + mantle, vault, slide, roll, stumble, zipline.
// Physics runs at a fixed 120 Hz; the camera interpolates between steps.
// ---------------------------------------------------------------------------

import { PHYS, MOVE } from './config.js';

const R = PHYS.radius;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) * (1 - t);

export const MODE_CODES = { ground: 0, air: 1, wallrun: 2, climb: 3, mantle: 4, vault: 5, slide: 6, roll: 7, zip: 8, dead: 9, finished: 10 };

export class Player {
  constructor(world, ziplines) {
    this.world = world;
    this.ziplines = ziplines;
    this.st = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true };
    this.prev = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.mode = 'ground';
    this.height = PHYS.standHeight;
    this.crouched = false;
    this.events = [];
    this.groundSurface = 'concrete';
    this.reset(0, 0, 0, 0);
  }

  reset(x, y, z, yaw) {
    Object.assign(this.st, { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true });
    Object.assign(this.prev, { x, y, z });
    this.yaw = yaw; this.pitch = 0;
    this.mode = 'ground';
    this.height = PHYS.standHeight;
    this.crouched = false;
    this.coyote = 0; this.jumpBuffer = 0; this.jumpHold = 0; this.jumped = false;
    this.crouchBuffer = 0; this.grabBuffer = 0;
    this.stumble = 0; this.airTime = 0;
    this.wallT = 0; this.wallN = [0, 0]; this.wallDir = [0, 0]; this.wallSpeed = 0; this.wallSide = 0;
    this.wallCooldown = 0; this.lastWallBox = null;
    this.climbT = 0; this.climbN = [0, 0]; this.climbAvailable = true;
    this.anim = null;     // mantle / vault animation data
    this.slideT = 0; this.rollT = 0;
    this.zip = null; this.zipS = 0; this.zipSpeed = 0; this.zipOff = [0, 0, 0];
    this.stepPhase = 0; this.lastStepSide = 0;
    this.lastHSpeed = 0;
    this.fallStartY = y;
  }

  get hspeed() { return Math.hypot(this.st.vx, this.st.vz); }

  // Called once per rendered frame with the edge-triggered input.
  handlePresses(input) {
    if (input.hit('Space')) this.jumpBuffer = MOVE.jumpBuffer;
    if (input.hit('KeyC', 'ControlLeft', 'ControlRight')) this.crouchBuffer = MOVE.rollWindow;
    if (input.hit('KeyE')) this.grabBuffer = 0.18;
  }

  emit(type, data = {}) { data.type = type; this.events.push(data); }

  lookDir() { return [-Math.sin(this.yaw), -Math.cos(this.yaw)]; }

  wishDir(inp) {
    const f = this.lookDir();
    const r = [-f[1], f[0]];
    let x = f[0] * inp.fwd + r[0] * inp.strafe;
    let z = f[1] * inp.fwd + r[1] * inp.strafe;
    const l = Math.hypot(x, z);
    if (l < 1e-4) return [0, 0, 0];
    return [x / l, z / l, 1];
  }

  // ------------------------------------------------------------------ step
  step(dt, inp) {
    const st = this.st;
    this.prev.x = st.x; this.prev.y = st.y; this.prev.z = st.z;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.crouchBuffer = Math.max(0, this.crouchBuffer - dt);
    this.grabBuffer = Math.max(0, this.grabBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.stumble = Math.max(0, this.stumble - dt);

    switch (this.mode) {
      case 'ground': case 'slide': case 'roll': this.updateGround(dt, inp); break;
      case 'air': this.updateAir(dt, inp); break;
      case 'wallrun': this.updateWallrun(dt, inp); break;
      case 'climb': this.updateClimb(dt, inp); break;
      case 'mantle': this.updateMantle(dt); break;
      case 'vault': this.updateVault(dt); break;
      case 'zip': this.updateZip(dt, inp); break;
      default: break;
    }
    this.lastHSpeed = this.hspeed;

    if (this.mode !== 'dead' && this.mode !== 'finished' && st.y < 18) this.die('fall');
  }

  // ------------------------------------------------------------------ ground
  updateGround(dt, inp) {
    const st = this.st;
    const wish = this.wishDir(inp);
    let sp = this.hspeed;
    let dx = sp > 1e-3 ? st.vx / sp : wish[0];
    let dz = sp > 1e-3 ? st.vz / sp : wish[1];

    // --- transitions
    if (this.grabBuffer > 0 && this.mode !== 'roll' && this.tryZip()) return;
    if (this.mode === 'ground' && this.crouchBuffer > 0 && sp >= MOVE.slideMinSpeed) {
      this.startSlide(); this.crouchBuffer = 0;
    }
    if (this.jumpBuffer > 0) {
      const canJump = this.mode !== 'roll' || this.rollT > 0.3;
      if (canJump && this.world.capsuleFree(st.x, st.y + 0.02, st.z, R, PHYS.standHeight)) {
        if (inp.fwd > 0 && this.tryClimbStart()) return;
        this.jump();
        this.updateAir(dt, inp);
        return;
      }
    }

    if (this.mode === 'slide') {
      this.slideT += dt;
      // slope acceleration
      const gb = this.groundBox;
      if (gb && gb.ramp) {
        const r = gb.ramp;
        const len = r.axis === 'z' ? r.maxZ - r.minZ : r.maxX - r.minX;
        const slope = (r.h1 - r.h0) / len;          // rise per metre along +axis
        const sin = Math.abs(slope) / Math.hypot(1, slope);
        const dirSign = slope > 0 ? -1 : 1;          // downhill
        const a = PHYS.gravity * sin * MOVE.slideSlopeAccel;
        if (r.axis === 'z') st.vz += dirSign * a * dt; else st.vx += dirSign * a * dt;
        sp = this.hspeed; dx = st.vx / sp; dz = st.vz / sp;
      } else {
        sp = Math.max(0, sp - MOVE.slideFriction * dt);
      }
      if (wish[2]) [dx, dz] = rotateToward(dx, dz, wish[0], wish[1], 1.3 * dt);
      sp = Math.min(sp, 22);
      const canStand = this.world.capsuleFree(st.x, st.y + 0.02, st.z, R, PHYS.standHeight);
      if ((sp < 3.2 && this.slideT > 0.3) || (!inp.crouch && this.slideT > 0.45 && canStand)) {
        this.mode = 'ground';
        this.emit('slideEnd');
      }
    } else if (this.mode === 'roll') {
      this.rollT += dt;
      if (wish[2]) [dx, dz] = rotateToward(dx, dz, wish[0], wish[1], 2.0 * dt);
      sp = Math.max(sp - 1.0 * dt, Math.min(sp, 2.5));
      if (this.rollT >= MOVE.rollTime) { this.mode = 'ground'; }
    } else {
      // regular running
      const wantCrouch = inp.crouch;
      const canStand = this.world.capsuleFree(st.x, st.y + 0.02, st.z, R, PHYS.standHeight);
      this.crouched = wantCrouch || !canStand;
      let target = inp.sprint ? MOVE.topSpeed : MOVE.walkSpeed;
      if (this.crouched) target = MOVE.crouchSpeed;
      if (this.stumble > 0) target = Math.min(target, 3.2);
      if (wish[2]) {
        const cosA = dx * wish[0] + dz * wish[1];
        if (sp > 0.6 && cosA < -0.5) {
          sp = Math.max(0, sp - MOVE.groundFriction * 1.2 * dt);   // hard reverse: brake
        } else {
          if (sp < 0.6) { dx = wish[0]; dz = wish[1]; }
          else [dx, dz] = rotateToward(dx, dz, wish[0], wish[1], MOVE.turnRate * dt);
          // strafing only (no forward) caps to walk speed
          if (inp.fwd <= 0) target = Math.min(target, MOVE.walkSpeed * 0.9);
          if (sp < target) {
            const a = sp < MOVE.walkSpeed ? MOVE.accelLow : sp < MOVE.sprintSpeed ? MOVE.accelHigh : MOVE.accelTop;
            sp = Math.min(target, sp + a * dt);
          } else if (sp > target) {
            // momentum: decay slowly when above target
            const decay = sp > MOVE.topSpeed ? 2.2 : target >= MOVE.sprintSpeed ? 1.0 : 9;
            sp = Math.max(target, sp - decay * dt);
          }
        }
      } else {
        sp = Math.max(0, sp - MOVE.groundFriction * dt);
      }
      this.height = this.crouched ? PHYS.crouchHeight : PHYS.standHeight;
      // vault
      if (sp >= MOVE.vaultMinSpeed && inp.fwd > 0 && !this.crouched && this.tryVault(dx, dz, sp)) return;
    }
    if (this.mode === 'slide' || this.mode === 'roll') this.height = PHYS.crouchHeight;

    st.vx = dx * sp; st.vz = dz * sp; st.vy = Math.min(st.vy, 0);
    const info = this.world.move(st, dt, R, this.height, PHYS);
    this.groundBox = info.groundBox || this.groundBox;
    if (info.groundBox) this.groundSurface = info.groundBox.surface;

    if (info.wallImpact > MOVE.wallImpactLoss) {
      // ran into something: keep only the tangential part (already applied), shake
      this.emit('bump', { v: info.wallImpact });
      if (this.mode === 'slide') this.mode = 'ground';
    }

    // footsteps
    if (this.mode === 'ground' && sp > 0.8) {
      const stride = 1.15 + sp * 0.075;
      const prevPhase = this.stepPhase;
      this.stepPhase += (sp * dt) / stride;
      if (Math.floor(prevPhase * 2) !== Math.floor(this.stepPhase * 2)) {
        this.emit('step', { speed: sp, surface: this.groundSurface, crouch: this.crouched });
      }
    }

    if (!st.grounded) {
      this.mode = this.mode === 'slide' ? 'air' : 'air';
      this.coyote = MOVE.coyoteTime;
      this.jumped = false;
      this.airTime = 0;
      this.climbAvailable = true;
      this.fallStartY = st.y;
      this.lastWallBox = null;
    }
  }

  jump() {
    const st = this.st;
    st.vy = MOVE.jumpVel;
    st.grounded = false;
    if (this.mode === 'slide') this.emit('slideEnd');
    this.mode = 'air';
    this.height = PHYS.standHeight;
    this.jumpHold = MOVE.jumpHoldTime;
    this.jumped = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.airTime = 0;
    this.climbAvailable = true;
    this.fallStartY = st.y;
    this.lastWallBox = null;
    this.emit('jump', { speed: this.hspeed });
  }

  // ------------------------------------------------------------------ air
  updateAir(dt, inp) {
    const st = this.st;
    this.airTime += dt;

    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.jumped) {
      this.jump();
    }

    // gravity with variable jump height
    let g = PHYS.gravity;
    if (st.vy > 0 && this.jumped) {
      if (inp.jump && this.jumpHold > 0) { g *= MOVE.jumpHoldGravity; this.jumpHold -= dt; }
      else if (!inp.jump) { g *= MOVE.jumpCutGravity; this.jumpHold = 0; }
    }
    st.vy = Math.max(st.vy - g * dt, -55);

    // air control
    const wish = this.wishDir(inp);
    let sp = this.hspeed;
    if (wish[2]) {
      const maxSp = Math.max(sp, MOVE.walkSpeed);
      st.vx += wish[0] * MOVE.airAccel * dt;
      st.vz += wish[1] * MOVE.airAccel * dt;
      const ns = this.hspeed;
      if (ns > maxSp) { st.vx *= maxSp / ns; st.vz *= maxSp / ns; }
      if (inp.fwd > 0 && sp > 1) {
        const [dx, dz] = rotateToward(st.vx / this.hspeed, st.vz / this.hspeed, wish[0], wish[1], MOVE.airTurnRate * dt);
        const s2 = this.hspeed; st.vx = dx * s2; st.vz = dz * s2;
      }
    }
    if (this.height < PHYS.standHeight && this.world.capsuleFree(st.x, st.y, st.z, R, PHYS.standHeight)) {
      this.height = PHYS.standHeight;
    }

    // --- moves available in the air
    if (this.grabBuffer > 0 && this.tryZip()) return;
    if (inp.fwd > 0 && st.vy < 4.5) {
      const f = this.lookDir();
      const ledge = this.findLedge(f[0], f[1]);
      if (ledge) { this.startMantle(ledge, false); return; }
    }
    if (this.tryWallrun(inp)) return;

    const info = this.world.move(st, dt, R, this.height, PHYS);
    if (info.groundBox) { this.groundBox = info.groundBox; this.groundSurface = info.groundBox.surface; }

    // head-on wall contact while pushing forward -> wall climb
    if (info.wallHit && inp.fwd > 0 && this.climbAvailable && st.vy > -5 && this.airTime > 0.04) {
      const f = this.lookDir();
      const facing = -(f[0] * info.wallNx + f[1] * info.wallNz);
      if (facing > 0.72 && this.wallIsTall(info.wallNx, info.wallNz)) {
        this.startClimb(info.wallNx, info.wallNz);
        return;
      }
    }
    if (info.wallImpact > 6) this.emit('bump', { v: info.wallImpact });

    if (info.landed) this.handleLanding(info.landVel, inp);
  }

  handleLanding(v, inp) {
    const st = this.st;
    this.jumped = false;
    this.climbAvailable = true;
    this.lastWallBox = null;
    if (v >= MOVE.fatalLandVel) { this.die('impact'); return; }
    const rollReq = this.crouchBuffer > 0 || inp.crouch;
    if (v >= MOVE.hardLandVel) {
      if (rollReq) {
        this.startRoll();
      } else {
        st.vx *= 0.28; st.vz *= 0.28;
        this.stumble = MOVE.stumbleTime;
        this.mode = 'ground';
        this.emit('stumble', { v });
      }
      return;
    }
    if (v > 8.5) { st.vx *= 0.94; st.vz *= 0.94; }
    if (inp.crouch && this.hspeed >= MOVE.slideMinSpeed) {
      this.mode = 'ground';
      this.startSlide();
      this.emit('land', { v, surface: this.groundSurface });
      return;
    }
    this.mode = 'ground';
    this.emit('land', { v, surface: this.groundSurface });
  }

  // ------------------------------------------------------------------ wall-run
  wallIsTall(nx, nz) {
    const st = this.st;
    const hit = this.world.raycast(st.x, st.y + 1.75, st.z, -nx, 0, -nz, R + 0.7);
    return !!hit && Math.abs(hit.ny) < 0.1;
  }

  tryWallrun(inp) {
    const st = this.st;
    if (this.wallCooldown > 0 || this.airTime < 0.05 || inp.fwd <= 0) return false;
    const sp = this.hspeed;
    if (sp < MOVE.wallRunMinSpeed || st.vy < -7.5) return false;
    const dx = st.vx / sp, dz = st.vz / sp;
    const sides = [[-dz, dx], [dz, -dx]];
    for (let i = 0; i < 2; i++) {
      const [sx, sz] = sides[i];
      const hit = this.world.raycast(st.x, st.y + 1.0, st.z, sx, 0, sz, R + 2.3);
      if (!hit || Math.abs(hit.ny) > 0.1) continue;
      if (hit.box === this.lastWallBox) continue;
      const nx = hit.nx, nz = hit.nz;
      if (hit.t > R + MOVE.wallRunReach) {
        // wall-run assist: looking toward a nearby tall wall drifts you onto it
        const lx = -Math.sin(this.yaw), lz = -Math.cos(this.yaw);
        const toward = -(st.vx * nx + st.vz * nz);
        if (lx * -nx + lz * -nz > 0.1 && toward < 3.4 &&
            this.world.raycast(st.x, st.y + 1.9, st.z, sx, 0, sz, R + 2.5)) {
          st.vx -= nx * 10 * PHYS.fixedDt; st.vz -= nz * 10 * PHYS.fixedDt;
        }
        continue;
      }
      const vn = st.vx * nx + st.vz * nz;
      const ax = st.vx - nx * vn, az = st.vz - nz * vn;
      const along = Math.hypot(ax, az);
      if (along < 4.2) continue;
      // wall must be taller than the player
      const hi = this.world.raycast(st.x, st.y + 1.9, st.z, sx, 0, sz, R + MOVE.wallRunReach + 0.2);
      if (!hi) continue;
      // need some air below so we do not wall-run along curbs
      const below = this.world.groundHeight(st.x, st.z, R, st.y - 0.7, st.y + 0.1);
      if (below) continue;
      this.mode = 'wallrun';
      this.wallT = 0;
      this.wallN = [nx, nz];
      this.wallDir = [ax / along, az / along];
      this.wallSpeed = clamp(Math.max(along, 7.2), 0, MOVE.topSpeed + 1);
      this.wallSide = i === 0 ? 1 : -1;     // 1 = wall on the right
      this.wallBox = hit.box;
      st.vy = clamp(st.vy, 2.0, MOVE.wallRunStartUp + 0.4);
      this.emit('wallrunStart', { side: this.wallSide });
      return true;
    }
    return false;
  }

  updateWallrun(dt, inp) {
    const st = this.st;
    this.wallT += dt;
    const k = this.wallT / MOVE.wallRunTime;
    st.vy = Math.max(st.vy - (3.5 + 15 * k * k) * dt, -7);
    this.wallSpeed = Math.max(5.5, this.wallSpeed - 0.35 * dt);
    const [nx, nz] = this.wallN;
    const [dx, dz] = this.wallDir;

    if (this.jumpBuffer > 0 && this.wallT > 0.06) {
      this.jumpBuffer = 0;
      const sp = this.wallSpeed;
      st.vx = dx * sp * 0.96 + nx * MOVE.wallRunKickOut;
      st.vz = dz * sp * 0.96 + nz * MOVE.wallRunKickOut;
      st.vy = MOVE.wallRunKickUp;
      this.mode = 'air';
      this.jumped = true; this.jumpHold = 0.08;
      this.airTime = 0.1;
      this.lastWallBox = this.wallBox;
      this.wallCooldown = 0.2;
      this.climbAvailable = true;
      this.emit('walljump', { side: this.wallSide });
      return;
    }

    // footsteps on the wall
    const prevPhase = this.stepPhase;
    this.stepPhase += (this.wallSpeed * dt) / 1.5;
    if (Math.floor(prevPhase * 2) !== Math.floor(this.stepPhase * 2)) this.emit('step', { speed: this.wallSpeed, surface: 'concrete', wall: true });

    const still = this.world.raycast(st.x, st.y + 1.0, st.z, -nx, 0, -nz, R + 0.45);
    const end = !still || this.wallT > MOVE.wallRunTime || inp.fwd < 0;
    st.vx = dx * this.wallSpeed - nx * 0.6;
    st.vz = dz * this.wallSpeed - nz * 0.6;
    if (end) {
      st.vx += nx * 1.6; st.vz += nz * 1.6;
      this.mode = 'air';
      this.lastWallBox = this.wallBox;
      this.wallCooldown = 0.15;
      this.emit('wallrunEnd');
    }
    const info = this.world.move(st, dt, R, this.height, PHYS);
    if (this.mode === 'wallrun' && info.wallImpact > 3) {
      // something ahead along the wall: dot of wall-contact normal with run dir
      if (info.wallNx * dx + info.wallNz * dz < -0.6) {
        this.mode = 'air'; this.lastWallBox = this.wallBox; this.emit('wallrunEnd'); this.emit('bump', { v: info.wallImpact });
      }
    }
    if (info.landed) { this.emit('wallrunEnd'); this.handleLanding(info.landVel, inp); }
  }

  // ------------------------------------------------------------------ climb
  tryClimbStart() {
    const st = this.st;
    const [fx, fz] = this.lookDir();
    const hit = this.world.raycast(st.x, st.y + 1.0, st.z, fx, 0, fz, R + MOVE.climbReach);
    if (!hit || Math.abs(hit.ny) > 0.1) return false;
    if (-(fx * hit.nx + fz * hit.nz) < 0.72) return false;
    // low obstacles are vaulted / jumped instead
    const top = hit.box.ramp ? 0 : hit.box.maxY;
    if (top - st.y < 1.35) return false;
    if (!this.wallIsTall(hit.nx, hit.nz)) return false;
    st.grounded = false;
    this.startClimb(hit.nx, hit.nz);
    this.jumpBuffer = 0;
    return true;
  }

  startClimb(nx, nz) {
    const st = this.st;
    this.mode = 'climb';
    this.climbT = 0;
    this.climbN = [nx, nz];
    this.climbAvailable = false;
    this.jumped = false;
    st.vy = Math.max(st.vy, 0) * 0.3 + MOVE.climbVel;
    st.vx = -nx * 0.5; st.vz = -nz * 0.5;
    this.height = PHYS.standHeight;
    this.emit('climb');
  }

  updateClimb(dt, inp) {
    const st = this.st;
    this.climbT += dt;
    const [nx, nz] = this.climbN;
    st.vy -= MOVE.climbGravity * dt;
    st.vx = -nx * 0.6; st.vz = -nz * 0.6;

    const prevPhase = this.stepPhase;
    this.stepPhase += dt * 3.2;
    if (Math.floor(prevPhase * 2) !== Math.floor(this.stepPhase * 2) && st.vy > 0) this.emit('step', { speed: 5, surface: 'concrete', wall: true });

    // ledge?
    const ledge = this.findLedge(-nx, -nz);
    if (ledge) { this.startMantle(ledge, true); return; }

    if (this.jumpBuffer > 0 && this.climbT > 0.08) {
      // kick off backwards
      this.jumpBuffer = 0;
      st.vx = nx * 6.2; st.vz = nz * 6.2; st.vy = 5.6;
      this.mode = 'air'; this.jumped = true; this.jumpHold = 0.05; this.airTime = 0.1;
      this.emit('walljump', { side: 0 });
      return;
    }
    const wall = this.world.raycast(st.x, st.y + 1.0, st.z, -nx, 0, -nz, R + 0.5);
    if (!wall || this.climbT > MOVE.climbTime || st.vy < -1.5 || inp.fwd <= 0) {
      this.mode = 'air';
      st.vx = nx * 0.8; st.vz = nz * 0.8;
      this.airTime = 0.1;
      return;
    }
    const info = this.world.move(st, dt, R, this.height, PHYS);
    if (info.landed) this.handleLanding(info.landVel, inp);
  }

  // ------------------------------------------------------------------ ledge
  findLedge(fx, fz) {
    const st = this.st, w = this.world;
    let hit = w.raycast(st.x, st.y + 1.15, st.z, fx, 0, fz, R + 0.55);
    if (!hit) hit = w.raycast(st.x, st.y + 0.55, st.z, fx, 0, fz, R + 0.55);
    if (!hit || Math.abs(hit.ny) > 0.1) return null;
    const nx = hit.nx, nz = hit.nz;
    if (fx * nx + fz * nz > -0.55) return null;
    const px = hit.x - nx * 0.32, pz = hit.z - nz * 0.32;
    const top0 = st.y + MOVE.ledgeReachMax + 0.25;
    const down = w.raycast(px, top0, pz, 0, -1, 0, top0 - (st.y + MOVE.ledgeReachMin));
    if (!down || down.ny < 0.5) return null;
    const top = down.y;
    const rise = top - st.y;
    if (rise < MOVE.ledgeReachMin || rise > MOVE.ledgeReachMax) return null;
    const tx = hit.x - nx * (R + 0.1), tz = hit.z - nz * (R + 0.1);
    if (!w.capsuleFree(tx, top + 0.02, tz, R, PHYS.crouchHeight)) return null;
    // room to pull the body up along the wall face
    if (!w.capsuleFree(st.x, top + 0.02, st.z, R * 0.9, PHYS.crouchHeight)) return null;
    return { x: tx, y: top, z: tz, nx, nz, rise };
  }

  startMantle(l, fromClimb) {
    const st = this.st;
    const inSpeed = this.hspeed;
    this.mode = 'mantle';
    this.anim = {
      t: 0,
      dur: clamp(0.24 + l.rise * 0.13, 0.28, 0.55),
      sx: st.x, sy: st.y, sz: st.z,
      ex: l.x, ey: l.y, ez: l.z,
      dir: [-l.nx, -l.nz],
      exit: clamp(Math.max(inSpeed, fromClimb ? 0 : 0) * 0.55, 2.4, 6.5),
      rise: l.rise,
    };
    st.vx = st.vy = st.vz = 0;
    this.height = PHYS.crouchHeight;
    this.emit('mantle', { rise: l.rise });
  }

  updateMantle(dt) {
    const a = this.anim, st = this.st;
    a.t += dt / a.dur;
    const t = Math.min(1, a.t);
    const yk = easeOut(clamp(t / 0.72, 0, 1));
    const xk = smooth((t - 0.55) / 0.45);
    st.x = a.sx + (a.ex - a.sx) * xk;
    st.z = a.sz + (a.ez - a.sz) * xk;
    st.y = a.sy + (a.ey + 0.06 - a.sy) * yk;
    if (t >= 1) {
      st.y = a.ey;
      st.vx = a.dir[0] * a.exit; st.vz = a.dir[1] * a.exit; st.vy = 0;
      st.grounded = true;
      this.mode = 'ground';
      this.height = this.world.capsuleFree(st.x, st.y + 0.02, st.z, R, PHYS.standHeight) ? PHYS.standHeight : PHYS.crouchHeight;
      this.jumped = false;
      this.emit('land', { v: 3, surface: 'concrete', soft: true });
    }
  }

  // ------------------------------------------------------------------ vault
  tryVault(dx, dz, sp) {
    const st = this.st, w = this.world;
    const reach = R + 0.18 + sp * 0.085;
    const hit = w.raycast(st.x, st.y + 0.5, st.z, dx, 0, dz, reach);
    if (!hit || Math.abs(hit.ny) > 0.1 || hit.box.ramp) return false;
    if (-(dx * hit.nx + dz * hit.nz) < 0.6) return false;
    const b = hit.box;
    const top = b.maxY;
    const h = top - st.y;
    if (h < MOVE.vaultMinH || h > MOVE.vaultMaxH) return false;
    // check there's nothing stacked on top
    if (!w.capsuleFree(hit.x - hit.nx * 0.3, top + 0.02, hit.z - hit.nz * 0.3, R * 0.8, PHYS.crouchHeight)) return false;
    // depth of the obstacle along the run direction
    let tExit = Infinity;
    if (dx > 1e-4) tExit = Math.min(tExit, (b.maxX - hit.x) / dx);
    if (dx < -1e-4) tExit = Math.min(tExit, (b.minX - hit.x) / dx);
    if (dz > 1e-4) tExit = Math.min(tExit, (b.maxZ - hit.z) / dz);
    if (dz < -1e-4) tExit = Math.min(tExit, (b.minZ - hit.z) / dz);
    const depth = tExit;
    const toHit = hit.t;

    if (depth <= MOVE.vaultMaxDepth) {
      const ex = hit.x + dx * (depth + R + 0.3), ez = hit.z + dz * (depth + R + 0.3);
      const g = w.groundHeight(ex, ez, R, top - 3.2, top + 0.05);
      if (!g) return false;             // would vault off a building: don't
      if (!w.capsuleFree(ex, g.y + 0.02, ez, R, PHYS.crouchHeight)) return false;
      const total = toHit + depth + R + 0.3;
      this.mode = 'vault';
      this.anim = {
        t: 0, sx: st.x, sy: st.y, sz: st.z, ex, ey: g.y, ez,
        peak: top + 0.14, dur: clamp(total / Math.max(sp * 0.92, 5.2), 0.22, 0.5),
        speed: sp * 0.98, dir: [dx, dz], hand: Math.random() < 0.5 ? -1 : 1,
      };
      this.emit('vault', { h });
      return true;
    }
    // deep obstacle: quick step-up mantle, keep momentum
    const tx = hit.x + dx * (R + 0.12), tz = hit.z + dz * (R + 0.12);
    if (!w.capsuleFree(tx, top + 0.02, tz, R, PHYS.crouchHeight)) return false;
    this.startMantle({ x: tx, y: top, z: tz, nx: hit.nx, nz: hit.nz, rise: h }, false);
    this.anim.dur = 0.22 + h * 0.08;
    this.anim.exit = sp * 0.85;
    return true;
  }

  updateVault(dt) {
    const a = this.anim, st = this.st;
    a.t += dt / a.dur;
    const t = Math.min(1, a.t);
    st.x = a.sx + (a.ex - a.sx) * t;
    st.z = a.sz + (a.ez - a.sz) * t;
    if (t < 0.38) st.y = a.sy + (a.peak - a.sy) * easeOut(t / 0.38);
    else if (t < 0.68) st.y = a.peak;
    else { const k = (t - 0.68) / 0.32; st.y = a.peak + (a.ey - a.peak) * (k * k); }
    st.vx = a.dir[0] * a.speed; st.vz = a.dir[1] * a.speed; st.vy = 0;
    if (t >= 1) {
      st.y = a.ey; st.grounded = true;
      this.mode = 'ground';
      this.emit('land', { v: 4, surface: this.groundSurface, soft: true });
    }
  }

  // ------------------------------------------------------------------ slide / roll
  startSlide() {
    const st = this.st;
    this.mode = 'slide';
    this.slideT = 0;
    this.height = PHYS.crouchHeight;
    const sp = this.hspeed;
    if (sp > 0.1) { const k = (sp + MOVE.slideBoost) / sp; st.vx *= k; st.vz *= k; }
    this.emit('slideStart');
  }

  startRoll() {
    const st = this.st;
    this.mode = 'roll';
    this.rollT = 0;
    this.height = PHYS.crouchHeight;
    let sp = this.hspeed;
    if (sp < 3) {
      const f = this.lookDir(); st.vx = f[0] * 4; st.vz = f[1] * 4;
    } else { st.vx *= 0.96; st.vz *= 0.96; }
    this.crouchBuffer = 0;
    this.emit('roll');
  }

  // ------------------------------------------------------------------ zipline
  tryZip() {
    const st = this.st;
    const hx = st.x, hy = st.y + MOVE.zipHang, hz = st.z;
    for (const z of this.ziplines) {
      const ax = z.a[0], ay = z.a[1], az = z.a[2];
      const [dx, dy, dz] = z.dir;
      let s = (hx - ax) * dx + (hy - ay) * dy + (hz - az) * dz;
      if (s < -1.8 || s > z.len - 2) continue;
      s = Math.max(s, 0.3);
      const px = ax + dx * s, py = ay + dy * s, pz = az + dz * s;
      const d = Math.hypot(px - hx, py - hy, pz - hz);
      if (d > MOVE.zipGrabDist) continue;
      this.mode = 'zip';
      this.zip = z;
      this.zipS = s;
      this.zipSpeed = Math.max(3.5, st.vx * dx + st.vy * dy + st.vz * dz);
      this.zipOff = [hx - px, hy - py, hz - pz];
      this.grabBuffer = 0;
      this.height = PHYS.standHeight;
      this.emit('zipStart');
      return true;
    }
    return false;
  }

  updateZip(dt, inp) {
    const st = this.st, z = this.zip;
    const [dx, dy, dz] = z.dir;
    const slopeSin = -dy;
    this.zipSpeed += (PHYS.gravity * slopeSin * 0.85 - 0.006 * this.zipSpeed * this.zipSpeed) * dt;
    this.zipSpeed = clamp(this.zipSpeed, 2, MOVE.zipMaxSpeed);
    // brake near the end so the dismount is controllable
    const remain = z.len - this.zipS;
    if (remain < 10) this.zipSpeed = Math.min(this.zipSpeed, 8.5 + remain * 1.05);
    this.zipS += this.zipSpeed * dt;
    const k = Math.exp(-dt * 10);
    this.zipOff[0] *= k; this.zipOff[1] *= k; this.zipOff[2] *= k;
    const px = z.a[0] + dx * this.zipS + this.zipOff[0];
    const py = z.a[1] + dy * this.zipS + this.zipOff[1];
    const pz = z.a[2] + dz * this.zipS + this.zipOff[2];
    st.x = px; st.y = py - MOVE.zipHang; st.z = pz;
    st.vx = dx * this.zipSpeed; st.vy = dy * this.zipSpeed; st.vz = dz * this.zipSpeed;
    st.grounded = false;
    const atEnd = this.zipS >= z.len - 0.7;
    if (atEnd || this.jumpBuffer > 0 || inp.crouch) {
      if (this.jumpBuffer > 0) { st.vy = Math.max(st.vy, 0) + 4.6; this.jumped = true; this.jumpHold = 0.1; }
      this.jumpBuffer = 0;
      this.mode = 'air';
      this.airTime = 0.1;
      this.zip = null;
      this.fallStartY = st.y;
      this.climbAvailable = true;
      this.emit('zipEnd');
    }
  }

  // ------------------------------------------------------------------ death
  die(reason) {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.emit('death', { reason });
  }
}

function rotateToward(ax, az, bx, bz, maxAngle) {
  const cross = ax * bz - az * bx;
  const dot = ax * bx + az * bz;
  const ang = Math.atan2(cross, dot);
  const a = clamp(ang, -maxAngle, maxAngle);
  const c = Math.cos(a), s = Math.sin(a);
  return [ax * c - az * s, ax * s + az * c];
}
