// ============================================================================
// player.js — first-person parkour character controller.
// Fixed-timestep, momentum based. Pure JS (no rendering) so it can be tested
// headless. Emits gameplay events through `emit(type, data)` for audio,
// particles, camera and HUD.
//
// Modes: ground | air | slide | wallrun | climb | mantle | vault | zip | dead
// ============================================================================
import { C } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);

export class Player {
  constructor(world, level, emit) {
    this.world = world;
    this.level = level;
    this.emit = emit || (() => {});
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this._wl = [];
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }

  reset(sp) {
    Object.assign(this.pos, { x: sp.x, y: sp.y, z: sp.z });
    Object.assign(this.prev, this.pos);
    Object.assign(this.vel, { x: 0, y: 0, z: 0 });
    this.yaw = sp.yaw || 0; this.pitch = 0;
    this.mode = 'ground'; this.grounded = true; this.groundBox = null;
    this.height = C.height; this.crouched = false;
    this.flow = 0; this.coyote = 0; this.jumpBuf = 0; this.rollBuf = 0;
    this.jumping = false; this.airTime = 0; this.climbAvail = true; this.lastWallKey = null;
    this.wr = null; this.cl = null; this.mt = null; this.vt = null; this.zip = null;
    this.slideT = 0; this.rollT = 0; this.stumbleT = 0; this.noFwdT = 0;
    this.stepDist = 0; this.stepSide = 1; this.stepUp = 0; this.groundVy = 0;
    this.killY = sp.killY ?? -1e9;
    this.deathReason = null; this.time = 0; this.zipNear = null;
  }

  get speedH() { return Math.hypot(this.vel.x, this.vel.z); }
  get topSpeed() { return C.sprintSpeed + this.flow; }

  // --------------------------------------------------------------------------
  // main step
  // --------------------------------------------------------------------------
  step(dt, inp) {
    const p = this.pos;
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z;
    this.time += dt;
    this.yaw = inp.yaw; this.pitch = inp.pitch;
    this.jumpBuf = inp.jumpPressed ? C.jumpBuffer : this.jumpBuf - dt;
    this.rollBuf = inp.crouchPressed ? C.rollWindow : this.rollBuf - dt;
    if (this.stumbleT > 0) this.stumbleT -= dt;
    this.fx = -Math.sin(this.yaw); this.fz = -Math.cos(this.yaw);   // look forward (horizontal)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = this.fx * inp.mz + rx * inp.mx, wz = this.fz * inp.mz + rz * inp.mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-3) { wx /= wl; wz /= wl; }
    this.wx = wx; this.wz = wz; this.hasWish = wl > 1e-3;
    this.inp = inp;

    if (this.mode === 'dead') return;

    // zipline grab (E) works from any free-moving mode
    this.zipNear = this._findZip();
    if (inp.usePressed && this.zipNear && (this.mode === 'ground' || this.mode === 'air' || this.mode === 'slide' || this.mode === 'wallrun' || this.mode === 'climb')) {
      this._startZip(this.zipNear);
    }

    switch (this.mode) {
      case 'ground': case 'slide': this._stepGround(dt); break;
      case 'air': this._stepAir(dt); break;
      case 'wallrun': this._stepWallrun(dt); break;
      case 'climb': this._stepClimb(dt); break;
      case 'mantle': this._stepMantle(dt); break;
      case 'vault': this._stepVault(dt); break;
      case 'zip': this._stepZip(dt); break;
    }
    if (this.mode !== 'dead' && p.y < this.killY) this._die('fall');
  }

  // --------------------------------------------------------------------------
  // collision
  // --------------------------------------------------------------------------
  _move(dt) {
    const v = this.vel, p = this.pos;
    this._pvx = v.x; this._pvz = v.z;
    this._wall = null; this._ground = null; this._impact = 0;
    const n = Math.max(1, Math.ceil(Math.hypot(v.x, v.y, v.z) * dt / 0.1));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
      this._resolve();
    }
  }

  _resolve() {
    const p = this.pos, v = this.vel, r = C.radius, H = this.height, W = this.world;
    for (let iter = 0; iter < 3; iter++) {
      const bs = W.query(p.x - r, p.z - r, p.x + r, p.z + r);
      let any = false;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const top = W.topAt(b, cx, cz);
        if (p.y >= top || p.y + H <= b.y0) continue;
        const penUp = top - p.y, penDown = p.y + H - b.y0;
        let penXZ, nx = 0, nz = 0;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); penXZ = r - d; nx = dx / d; nz = dz / d; }
        else {
          const l = p.x - b.x0, rr = b.x1 - p.x, bk = p.z - b.z0, f = b.z1 - p.z, m = Math.min(l, rr, bk, f);
          penXZ = m + r;
          if (m === l) nx = -1; else if (m === rr) nx = 1; else if (m === bk) nz = -1; else nz = 1;
        }
        const stepOK = penUp <= C.stepHeight && this.grounded && v.y <= 0.01;
        if (stepOK || (penUp < penXZ && penUp <= penDown && v.y <= 0)) {
          if (stepOK && penUp > 0.08) this.stepUp += penUp;
          p.y = top;
          if (v.y < 0) { this._impact = Math.max(this._impact, -v.y); v.y = 0; }
          this._ground = b;
        } else if (penDown < penXZ && penDown < penUp && v.y > 0) {
          p.y = b.y0 - H; v.y = 0;
        } else {
          p.x += nx * penXZ; p.z += nz * penXZ;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            if (!this._wall || -vn > this._wall.speed) this._wall = { nx, nz, box: b, speed: -vn };
            v.x -= vn * nx; v.z -= vn * nz;
          }
        }
        any = true;
      }
      if (!any) break;
    }
  }

  /** axis-aligned wall faces within maxDist of the body: [{nx,nz,box,dist}] */
  _walls(maxDist) {
    const p = this.pos, r = C.radius, out = this._wl; out.length = 0;
    const R = r + maxDist;
    const bs = this.world.query(p.x - R, p.z - R, p.x + R, p.z + R);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.ramp || b.y1 <= p.y + 0.1 || b.y0 >= p.y + this.height) continue;
      const inX = p.x > b.x0 - 0.05 && p.x < b.x1 + 0.05, inZ = p.z > b.z0 - 0.05 && p.z < b.z1 + 0.05;
      if (inZ) {
        if (p.x <= b.x0) { const d = b.x0 - p.x - r; if (d <= maxDist) out.push({ nx: -1, nz: 0, box: b, dist: d }); }
        else if (p.x >= b.x1) { const d = p.x - b.x1 - r; if (d <= maxDist) out.push({ nx: 1, nz: 0, box: b, dist: d }); }
      }
      if (inX) {
        if (p.z <= b.z0) { const d = b.z0 - p.z - r; if (d <= maxDist) out.push({ nx: 0, nz: -1, box: b, dist: d }); }
        else if (p.z >= b.z1) { const d = p.z - b.z1 - r; if (d <= maxDist) out.push({ nx: 0, nz: 1, box: b, dist: d }); }
      }
    }
    return out;
  }

  _setHeight(h) {
    if (h > this.height && !this.world.cylinderFree(this.pos.x, this.pos.y + 0.02, this.pos.z, C.radius * 0.95, h - 0.02)) return false;
    this.height = h; return true;
  }

  // --------------------------------------------------------------------------
  // ground + slide
  // --------------------------------------------------------------------------
  _stepGround(dt) {
    const v = this.vel, inp = this.inp, p = this.pos;
    let speed = this.speedH;
    const sliding = this.mode === 'slide';

    // ---- jump (or wall-climb if we are jumping straight at a tall wall)
    if (this.jumpBuf > 0 && this.rollT <= 0) {
      if (this._setHeight(C.height)) {
        this.crouched = false;
        if (this._tryClimb(this._walls(0.15), true)) return;
        this.jumpBuf = 0;
        v.y = C.jumpVel; this.jumping = true;
        if (sliding) this.emit('slideEnd');
        this._toAir(false);
        this.emit('jump', { speed });
        this._stepAir(dt);
        return;
      }
    }

    if (sliding) {
      // ---- slide: low friction, gains speed downhill, light steering
      this.slideT += dt;
      let dx = v.x, dz = v.z;
      if (speed > 1e-3) { dx /= speed; dz /= speed; } else { dx = this.fx; dz = this.fz; }
      const gb = this.groundBox;
      let slope = 0;
      if (gb && gb.ramp) {
        const g = (gb.ramp.b - gb.ramp.a) / (gb.ramp.axis === 'z' ? (gb.z1 - gb.z0) : (gb.x1 - gb.x0));
        slope = gb.ramp.axis === 'z' ? g * dz : g * dx;      // dy per metre travelled
      }
      speed += (-slope * C.gravity * 0.9 - C.slideFriction) * dt;
      speed = Math.min(speed, C.slideMax);
      if (this.hasWish) {                                    // steer a little
        const cr = dx * this.wz - dz * this.wx, a = clamp(-cr * 2.2 * dt, -0.05, 0.05);
        const c = Math.cos(a), s = Math.sin(a);
        [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
      }
      v.x = dx * speed; v.z = dz * speed;
      const wantUp = (!inp.crouch && this.slideT > 0.28) || speed < C.slideEndSpeed;
      if (wantUp) {
        this.mode = 'ground'; this.emit('slideEnd');
        if (!this._setHeight(C.height)) this.crouched = true;
      }
    } else {
      // ---- rolling out of a hard landing: committed forward motion
      if (this.rollT > 0) {
        this.rollT -= dt;
        const s = Math.max(speed, 6.5);
        if (speed > 0.5) { v.x *= s / speed; v.z *= s / speed; } else { v.x = this.fx * s; v.z = this.fz * s; }
        if (this.rollT <= 0 && !this._setHeight(C.height)) this.crouched = true;
      } else {
        // ---- crouch / slide start
        if (inp.crouchPressed && speed >= C.slideMinSpeed && !this.crouched) {
          this.mode = 'slide'; this.slideT = 0; this.height = C.crouchHeight;
          const s = Math.min(Math.max(speed + C.slideBoost, speed), C.slideMax - 2);
          v.x *= s / speed; v.z *= s / speed;
          this.flow = Math.min(C.flowMax, this.flow + 0.3);
          this.emit('slideStart');
          this._moveGround(dt);
          return;
        }
        if (inp.crouch && !this.crouched) { this.crouched = true; this.height = C.crouchHeight; }
        else if (!inp.crouch && this.crouched && this._setHeight(C.height)) this.crouched = false;

        // ---- run: steer velocity toward wish direction, then change speed
        const sprint = inp.sprint && inp.mz > 0 && !this.crouched;
        let top = this.crouched ? C.crouchSpeed : sprint ? this.topSpeed : C.runSpeed;
        if (inp.mz < 0) top *= C.backMul;
        if (this.stumbleT > 0) top *= 0.42;
        if (this.hasWish) {
          if (speed > 0.6) {
            let dx = v.x / speed, dz = v.z / speed;
            const dot = dx * this.wx + dz * this.wz, cr = dx * this.wz - dz * this.wx;
            const ang = Math.atan2(cr, dot);
            if (Math.abs(ang) > 2.0) {
              speed = Math.max(0, speed - C.friction * 1.2 * dt);         // reversal: brake
            } else {
              const maxTurn = (14 - 8.5 * clamp(speed / 12, 0, 1)) * dt;
              const a = clamp(ang, -maxTurn, maxTurn);
              const c = Math.cos(a), s = Math.sin(a);
              [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
              speed -= Math.abs(a) * speed * 0.25;                        // sharp turns bleed speed
            }
            v.x = dx * speed; v.z = dz * speed;
          } else { v.x = this.wx * speed; v.z = this.wz * speed; }
          if (speed < top) {
            const k = clamp(speed / top, 0, 1);
            let acc = C.accelLow + (C.accelHigh - C.accelLow) * Math.pow(k, 1.4);
            if (this.stumbleT > 0) acc *= 0.5;
            speed = Math.min(top, speed + acc * dt);
          } else speed = Math.max(top, speed - 3.2 * dt);
          const cur = Math.hypot(v.x, v.z);
          if (cur > 1e-4) { v.x *= speed / cur; v.z *= speed / cur; } else { v.x = this.wx * speed; v.z = this.wz * speed; }
        } else {
          const ns = Math.max(0, speed - C.friction * dt);
          if (speed > 1e-4) { v.x *= ns / speed; v.z *= ns / speed; }
          speed = ns;
        }
        // ---- flow (bonus top speed for uninterrupted sprinting)
        if (sprint && speed > C.sprintSpeed * 0.93) this.flow = Math.min(C.flowMax, this.flow + 0.33 * dt);
        else if (speed < 5) this.flow = Math.max(0, this.flow - 3 * dt);

        // ---- vault low obstacles / hop on to waist-high ledges
        if (sprint && speed >= C.vaultMinSpeed && this._tryVault()) return;
      }
    }
    this._moveGround(dt);
  }

  _moveGround(dt) {
    const v = this.vel, p = this.pos;
    const y0 = p.y, preSpeed = this.speedH;
    v.y = -1.5;                       // light stick-to-ground force
    this._move(dt);
    let g = this._ground;
    if (!g) {
      g = this.world.groundBelow(p.x, p.y, p.z, C.radius, 0.42);
      if (g) p.y = this.world.groundY;
    }
    v.y = 0;
    if (g) {
      this.groundBox = g; this.grounded = true;
      this.groundVy = (p.y - y0) / dt;
      // footsteps
      if (this.mode === 'ground' && this.rollT <= 0) {
        const sp = this.speedH;
        this.stepDist += sp * dt;
        const stride = 0.75 + 0.115 * Math.min(sp, 13);
        if (this.stepDist >= stride) {
          this.stepDist -= stride; this.stepSide = -this.stepSide;
          if (sp > 1) this.emit('step', { surf: g.surf || 'concrete', speed: sp, side: this.stepSide });
        }
      }
      // hitting a wall: lose flow; running straight at one starts a wall-climb
      if (this._wall) {
        if (this._wall.speed > 4) { this.flow = 0; this.emit('bump', { speed: this._wall.speed }); }
        if (this.mode === 'ground' && this.rollT <= 0 && this.inp.mz > 0 && preSpeed >= C.climbMinSpeed && !this.crouched) {
          const ws = this._walls(0.1);
          if (this._tryLedge(ws, 1.3) || this._tryClimb(ws, false)) return;
        }
      }
    } else {
      // walked / slid off an edge: inherit slope velocity
      v.y = clamp(this.groundVy, -8, 0);
      if (this.mode === 'slide') this.emit('slideEnd');
      this._toAir(true);
    }
  }

  _toAir(coyote) {
    this.mode = 'air'; this.grounded = false; this.airTime = 0;
    this.coyote = coyote ? C.coyote : 0;
    if (this.rollT > 0) this.rollT = 0;
    if (!this._setHeight(C.height)) { /* stay low until there is room */ }
    else this.crouched = false;
  }

  // --------------------------------------------------------------------------
  // air
  // --------------------------------------------------------------------------
  _stepAir(dt) {
    const v = this.vel, inp = this.inp;
    this.airTime += dt; this.coyote -= dt;
    if (this.height < C.height) this._setHeight(C.height);

    // coyote jump
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.jumpBuf = 0; this.coyote = 0; v.y = C.jumpVel; this.jumping = true;
      this.emit('jump', { speed: this.speedH });
    }
    // variable jump height
    if (this.jumping && !inp.jump && v.y > C.jumpCut) { v.y = C.jumpCut; this.jumping = false; }
    if (v.y <= 0) this.jumping = false;

    v.y = Math.max(-C.termVel, v.y - C.gravity * dt);

    // air control: steer without gaining speed
    if (this.hasWish) {
      const sp0 = this.speedH;
      v.x += this.wx * C.airAccel * dt; v.z += this.wz * C.airAccel * dt;
      const sp1 = this.speedH, cap = Math.max(sp0, 4.5);
      if (sp1 > cap) { v.x *= cap / sp1; v.z *= cap / sp1; }
    }

    this._move(dt);

    if (this._ground) { this._land(this._impact); return; }
    if (this._wall && this._wall.speed > 5) this.emit('bump', { speed: this._wall.speed });

    // wall interactions
    const ws = this._walls(0.22);
    if (ws.length) {
      if (this._tryLedge(ws, C.ledgeMin)) return;
      if (this._tryWallrun(ws)) return;
      if (this._tryClimb(ws, false)) return;
    }
  }

  _land(impact) {
    const v = this.vel, inp = this.inp;
    this.grounded = true; this.groundBox = this._ground; this.mode = 'ground';
    this.jumping = false; this.climbAvail = true; this.lastWallKey = null;
    this.stepDist = 0;
    const rollOK = this.rollBuf > 0 || inp.crouch;
    const speed = this.speedH;
    const surf = this._ground.surf || 'concrete';
    if (impact >= (rollOK ? C.lethalRoll : C.lethalLand)) { this.emit('land', { impact, kind: 'death', surf }); this._die('impact'); return; }
    if (impact >= C.hardLand) {
      if (rollOK) {
        this.rollT = C.rollTime; this.height = C.crouchHeight; this.rollBuf = 0;
        const s = Math.max(speed, 6.5);
        if (speed > 1) { v.x *= s / speed; v.z *= s / speed; } else { v.x = this.fx * s; v.z = this.fz * s; }
        this.flow = Math.min(C.flowMax, this.flow + 0.4);
        this.emit('land', { impact, kind: 'roll', surf });
      } else {
        v.x *= 0.3; v.z *= 0.3; this.stumbleT = C.stumbleTime; this.flow = 0;
        this.emit('land', { impact, kind: 'stumble', surf });
      }
      return;
    }
    this.emit('land', { impact, kind: 'soft', surf });
    if (inp.crouch && speed >= C.slideMinSpeed) {
      this.mode = 'slide'; this.slideT = 0; this.height = C.crouchHeight; this.emit('slideStart');
    }
  }

  // --------------------------------------------------------------------------
  // wall-run
  // --------------------------------------------------------------------------
  _tryWallrun(ws) {
    const p = this.pos, v = this.vel;
    if (this.inp.mz <= 0 || this.airTime < 0.06 || v.y < -15) return false;
    const pvx = this._pvx, pvz = this._pvz, sp = Math.hypot(pvx, pvz);
    if (sp < C.wallrunMinSpeed) return false;
    for (const w of ws) {
      const b = w.box;
      if (b.noWall || b.y1 < p.y + 1.5 || b.y0 > p.y + 0.3) continue;
      const k = b.id * 4 + (w.nx ? (w.nx > 0 ? 0 : 1) : (w.nz > 0 ? 2 : 3));
      if (k === this.lastWallKey) continue;
      const into = -(pvx * w.nx + pvz * w.nz);
      const ax = pvx + into * w.nx, az = pvz + into * w.nz, along = Math.hypot(ax, az);
      if (along < 4.5 || into < -1 || into > along * 1.6) continue;
      const speed = Math.max(sp * 0.96, 7.5);
      this.wr = { box: b, nx: w.nx, nz: w.nz, dx: ax / along, dz: az / along, t: 0, speed, key: k };
      this.lastWallKey = k;
      v.y = v.y > -4 ? clamp(v.y, C.wallrunVy0, 4.6) : v.y * 0.4;
      this.mode = 'wallrun'; this.jumping = false; this.noFwdT = 0; this.stepDist = 0;
      this.flow = Math.min(C.flowMax, this.flow + 0.3);
      this.emit('wallrunStart', { side: this._wallSide(w) });
      return true;
    }
    return false;
  }

  /** +1 when the wall is on the player's right, -1 when on the left */
  _wallSide(w) { const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); return -(w.nx * rx + w.nz * rz) > 0 ? 1 : -1; }

  _stepWallrun(dt) {
    const wr = this.wr, v = this.vel, p = this.pos, inp = this.inp;
    wr.t += dt;
    // kick off the wall
    if (this.jumpBuf > 0) {
      this.jumpBuf = 0;
      const away = this.fx * wr.nx + this.fz * wr.nz;
      const sp = Math.max(wr.speed, 8.5);
      if (away > 0.25) { v.x = this.fx * sp; v.z = this.fz * sp; }          // aim with the camera
      else { v.x = wr.dx * wr.speed + wr.nx * C.wallKick; v.z = wr.dz * wr.speed + wr.nz * C.wallKick; }
      v.y = C.wallJumpVy;
      this.flow = Math.min(C.flowMax, this.flow + 0.5); this.climbAvail = true;
      this.mode = 'air'; this.airTime = 0.1; this.coyote = 0; this.jumping = true;
      this.emit('wallJump', {}); this.emit('wallrunEnd', {});
      return;
    }
    this.noFwdT = inp.mz > 0 ? 0 : this.noFwdT + dt;
    wr.speed = Math.min(Math.max(wr.speed, this.topSpeed), wr.speed + 2.5 * dt);
    v.y -= C.wallrunGravity * dt;
    v.x = wr.dx * wr.speed - wr.nx * 1.0; v.z = wr.dz * wr.speed - wr.nz * 1.0;
    this._move(dt);
    // footsteps on the wall
    this.stepDist += wr.speed * dt;
    if (this.stepDist > 1.5) { this.stepDist = 0; this.stepSide = -this.stepSide; this.emit('step', { surf: wr.box.surf || 'concrete', speed: wr.speed, side: this.stepSide, wall: true }); }

    let end = false, still = false;
    if (this._ground) { this.emit('wallrunEnd', {}); this._land(this._impact); return; }
    for (const w of this._walls(0.25)) {
      if (w.nx === wr.nx && w.nz === wr.nz && !w.box.noWall && w.box.y1 >= p.y + 1.2 && w.box.y0 <= p.y + 0.5) { still = true; wr.box = w.box; }
      else if (w.nx * wr.dx + w.nz * wr.dz < -0.5 && w.dist < 0.05) end = true;       // ran into a corner
    }
    if (!still || end || wr.t > C.wallrunTime || this.noFwdT > 0.2) {
      v.x = wr.dx * wr.speed + wr.nx * 1.5; v.z = wr.dz * wr.speed + wr.nz * 1.5;
      this.mode = 'air'; this.airTime = 0.1; this.coyote = 0;
      this.emit('wallrunEnd', {});
    }
  }

  // --------------------------------------------------------------------------
  // wall-climb (run up a wall), ledge grab + mantle
  // --------------------------------------------------------------------------
  _tryClimb(ws, fromJump) {
    const p = this.pos, v = this.vel;
    if (!this.climbAvail || this.inp.mz <= 0 || v.y < -11) return false;
    const pvx = fromJump ? v.x : this._pvx, pvz = fromJump ? v.z : this._pvz;
    for (const w of ws) {
      const b = w.box;
      if (b.noWall || b.y1 - p.y <= C.ledgeMax || b.y0 > p.y + 0.5) continue;
      const facing = -(this.fx * w.nx + this.fz * w.nz);
      if (facing < 0.72) continue;
      const into = -(pvx * w.nx + pvz * w.nz), along = Math.hypot(pvx + into * w.nx, pvz + into * w.nz);
      if (!fromJump && !(into >= 2 && into > along * 1.6)) continue;
      if (fromJump && w.dist > 0.15) continue;
      this.cl = { box: b, nx: w.nx, nz: w.nz, t: 0 };
      this.climbAvail = false; this.mode = 'climb'; this.grounded = false; this.jumping = false;
      this.jumpBuf = 0;
      v.x = 0; v.z = 0; v.y = C.climbSpeed;
      this.emit('climbStart', {});
      return true;
    }
    return false;
  }

  _stepClimb(dt) {
    const cl = this.cl, v = this.vel;
    cl.t += dt;
    if (this.jumpBuf > 0) {                       // kick back off the wall
      this.jumpBuf = 0;
      v.x = cl.nx * 6.5; v.z = cl.nz * 6.5; v.y = 7.8;
      this.mode = 'air'; this.airTime = 0.1; this.coyote = 0; this.jumping = true; this.climbAvail = true;
      this.emit('wallJump', {});
      return;
    }
    const k = clamp(1 - cl.t / C.climbTime, 0, 1);
    v.y = C.climbSpeed * Math.sqrt(k);
    v.x = -cl.nx * 1.5; v.z = -cl.nz * 1.5;
    this._move(dt);
    this.stepDist += v.y * dt;
    if (this.stepDist > 0.8) { this.stepDist = 0; this.stepSide = -this.stepSide; this.emit('step', { surf: cl.box.surf || 'concrete', speed: 8, side: this.stepSide, wall: true }); }
    const ws = this._walls(0.25);
    if (this._tryLedge(ws, C.ledgeMin, true)) return;
    if (cl.t >= C.climbTime || this.inp.mz <= 0 || !ws.length) {
      v.x = cl.nx * 0.6; v.z = cl.nz * 0.6; v.y = 0;
      this.mode = 'air'; this.airTime = 0.2; this.coyote = 0;
    }
  }

  _tryLedge(ws, minRel, force) {
    const p = this.pos, r = C.radius, W = this.world;
    if (this.vel.y < -20) return false;
    for (const w of ws) {
      const b = w.box;
      if (b.noGrab || w.dist > 0.3) continue;
      const rel = b.y1 - p.y;
      if (rel < minRel || rel > C.ledgeMax) continue;
      if (!force && -(this.fx * w.nx + this.fz * w.nz) < 0.35) continue;
      if (!force && this.inp.mz < 0) continue;
      // where we will stand: just inside the edge
      let sx = p.x, sz = p.z;
      if (w.nx) { sx = (w.nx > 0 ? b.x1 : b.x0) - w.nx * (r + 0.06); const lo = b.z0 + r * 0.5, hi = b.z1 - r * 0.5; sz = lo < hi ? clamp(p.z, lo, hi) : (b.z0 + b.z1) / 2; }
      else { sz = (w.nz > 0 ? b.z1 : b.z0) - w.nz * (r + 0.06); const lo = b.x0 + r * 0.5, hi = b.x1 - r * 0.5; sx = lo < hi ? clamp(p.x, lo, hi) : (b.x0 + b.x1) / 2; }
      if (!W.cylinderFree(sx, b.y1 + 0.03, sz, r * 0.92, C.height)) continue;
      if (!W.cylinderFree(p.x, p.y + 0.3, p.z, r * 0.8, rel + 0.6)) continue;       // overhang above us
      const pre = Math.hypot(this._pvx || 0, this._pvz || 0);
      this.mt = { x0: p.x, y0: p.y, z0: p.z, x1: sx, y1: b.y1, z1: sz, nx: w.nx, nz: w.nz, t: 0, T: 0.3 + 0.15 * rel, pre, rel };
      this.mode = 'mantle'; this.grounded = false; this.jumping = false;
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.height = C.height; this.crouched = false;
      this.emit('ledge', { rel });
      return true;
    }
    return false;
  }

  _stepMantle(dt) {
    const m = this.mt, p = this.pos;
    m.t += dt;
    const u = clamp(m.t / m.T, 0, 1);
    const a = clamp(u / 0.58, 0, 1), b = clamp((u - 0.45) / 0.55, 0, 1);
    p.y = m.y0 + (m.y1 - m.y0) * (1 - (1 - a) * (1 - a));
    const s = smooth(b);
    p.x = m.x0 + (m.x1 - m.x0) * s; p.z = m.z0 + (m.z1 - m.z0) * s;
    if (u >= 1) {
      p.x = m.x1; p.y = m.y1; p.z = m.z1;
      const sp = this.inp.mz > 0 ? clamp(m.pre * 0.6, 3.6, 6.5) : 0;
      this.vel.x = -m.nx * sp; this.vel.z = -m.nz * sp; this.vel.y = 0;
      this.mode = 'ground'; this.grounded = true; this.climbAvail = true; this.lastWallKey = null;
      this.groundBox = this.world.groundBelow(p.x, p.y, p.z, C.radius, 0.3);
      this.stepDist = 0;
      this.emit('mantleEnd', {});
    }
  }

  // --------------------------------------------------------------------------
  // vault
  // --------------------------------------------------------------------------
  _tryVault() {
    const p = this.pos, v = this.vel, r = C.radius, W = this.world;
    const sp = this.speedH, dx = v.x / sp, dz = v.z / sp;
    const reach = 0.3 + sp * 0.05;
    const ws = this._walls(reach);
    for (const w of ws) {
      const b = w.box;
      const rel = b.y1 - p.y;
      if (b.ramp || rel < C.vaultMin || rel > C.vaultMax || b.y0 > p.y + 0.3) continue;
      const into = -(dx * w.nx + dz * w.nz);
      if (into < 0.55) continue;
      const depth = w.nx ? b.x1 - b.x0 : b.z1 - b.z0;
      const top = b.y1 + 0.1;
      if (depth <= C.vaultMaxDepth) {
        // straight line through the obstacle until we are clear of the far face
        const len = (w.dist + r + depth + r + 0.3) / into;
        if (len > 4.6) continue;
        let free = true;
        for (let i = 1; i <= 4 && free; i++) {
          const t = len * i / 4;
          free = W.cylinderFree(p.x + dx * t, top, p.z + dz * t, r * 0.9, C.crouchHeight);
        }
        if (!free) continue;
        const speed = Math.max(sp, 7);
        this.vt = { x0: p.x, y0: p.y, z0: p.z, dx, dz, len, speed, top, t: 0, T: len / speed, hop: false };
      } else {
        // deep obstacle: hop on top of it, keeping speed
        const len = (w.dist + r + r + 0.25) / into;
        if (!W.cylinderFree(p.x + dx * len, top, p.z + dz * len, r * 0.9, C.height)) continue;
        const speed = Math.max(sp * 0.92, 6);
        this.vt = { x0: p.x, y0: p.y, z0: p.z, dx, dz, len, speed, top: b.y1, t: 0, T: Math.max(0.2, len / speed), hop: true };
      }
      this.mode = 'vault'; this.grounded = false; this.height = C.crouchHeight;
      this.flow = Math.min(C.flowMax, this.flow + 0.5);
      this.emit('vault', { side: this.stepSide, surf: b.surf || 'concrete', hop: this.vt.hop });
      return true;
    }
    return false;
  }

  _stepVault(dt) {
    const m = this.vt, p = this.pos, v = this.vel;
    m.t += dt;
    const u = clamp(m.t / m.T, 0, 1);
    p.x = m.x0 + m.dx * m.len * u; p.z = m.z0 + m.dz * m.len * u;
    p.y = m.y0 + (m.top - m.y0) * smooth(clamp(u / (m.hop ? 0.8 : 0.34), 0, 1));
    if (u >= 1) {
      v.x = m.dx * m.speed; v.z = m.dz * m.speed;
      if (m.hop) {
        v.y = 0; this.mode = 'ground'; this.grounded = true;
        if (!this._setHeight(C.height)) this.crouched = true;
        this.groundBox = this.world.groundBelow(p.x, p.y, p.z, C.radius, 0.3);
      } else {
        v.y = -1.5; this.mode = 'air'; this.airTime = 0; this.coyote = 0; this._setHeight(C.height);
      }
    }
  }

  // --------------------------------------------------------------------------
  // zipline
  // --------------------------------------------------------------------------
  _findZip() {
    const p = this.pos, hx = p.x, hy = p.y + 1.7, hz = p.z;
    let best = null, bd = C.zipGrab;
    for (const z of this.level.zips) {
      const t = clamp(((hx - z.a[0]) * z.d[0] + (hy - z.a[1]) * z.d[1] + (hz - z.a[2]) * z.d[2]), 0, z.len);
      if (t > z.len * 0.8) continue;
      const d = Math.hypot(z.a[0] + z.d[0] * t - hx, z.a[1] + z.d[1] * t - hy, z.a[2] + z.d[2] * t - hz);
      if (d < bd) { bd = d; best = { z, s: t }; }
    }
    return best;
  }

  _startZip(n) {
    const v = this.vel, z = n.z;
    if (this.mode === 'slide') this.emit('slideEnd');
    if (this.mode === 'wallrun') this.emit('wallrunEnd', {});
    const along = v.x * z.d[0] + v.y * z.d[1] + v.z * z.d[2];
    this.zip = { z, s: Math.max(n.s, 0.4), speed: clamp(along, 6, C.zipMax), blend: 0, x0: this.pos.x, y0: this.pos.y, z0: this.pos.z };
    this.mode = 'zip'; this.grounded = false; this.jumping = false; this.height = C.height; this.crouched = false; this.rollT = 0;
    this.emit('zipStart', {});
  }

  _stepZip(dt) {
    const zp = this.zip, z = zp.z, p = this.pos, v = this.vel;
    zp.speed = clamp(zp.speed + (-z.d[1] * C.gravity * 0.9 - 0.5) * dt, 5, C.zipMax);
    zp.s += zp.speed * dt;
    zp.blend = Math.min(1, zp.blend + dt / 0.18);
    const tx = z.a[0] + z.d[0] * zp.s, ty = z.a[1] + z.d[1] * zp.s - C.zipHang, tz = z.a[2] + z.d[2] * zp.s;
    const k = smooth(zp.blend);
    p.x = zp.x0 + (tx - zp.x0) * k; p.y = zp.y0 + (ty - zp.y0) * k; p.z = zp.z0 + (tz - zp.z0) * k;
    zp.x0 += z.d[0] * zp.speed * dt; zp.y0 += z.d[1] * zp.speed * dt; zp.z0 += z.d[2] * zp.speed * dt;
    v.x = z.d[0] * zp.speed; v.y = z.d[1] * zp.speed; v.z = z.d[2] * zp.speed;
    const drop = this.jumpBuf > 0;
    if (zp.s >= z.len - 1.2 || drop) {
      this.jumpBuf = 0;
      v.y = drop ? 4 : v.y * 0.3 + 1.2;
      this.flow = Math.min(C.flowMax, this.flow + 1);
      this.mode = 'air'; this.airTime = 0.2; this.coyote = 0; this.climbAvail = true; this.lastWallKey = null;
      this.emit('zipEnd', {});
    }
  }

  // --------------------------------------------------------------------------
  _die(reason) {
    if (this.mode === 'dead') return;
    if (this.mode === 'slide') this.emit('slideEnd');
    if (this.mode === 'wallrun') this.emit('wallrunEnd', {});
    if (this.mode === 'zip') this.emit('zipEnd', {});
    this.mode = 'dead'; this.deathReason = reason;
    this.emit('death', { reason });
  }
}
