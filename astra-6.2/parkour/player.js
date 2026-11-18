import * as T from "three";
const vec = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const clamp = T.MathUtils.clamp;
export class Runner {
  constructor(level, event) {
    this.level = level;
    this.event = event;
    this.pos = vec();
    this.vel = vec();
    this.keys = new Set();
    this.reset(vec(0, 0, 5));
  }
  reset(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.ground = true;
    this.coyote = 0.12;
    this.buffer =
      this.crouchAgo =
      this.slide =
      this.roll =
      this.dip =
      this.stumble =
      this.wallTime =
      this.wallLock =
      this.stride =
      this.phase =
        0;
    this.crouchAgo = 9;
    this.wall = null;
    this.usedWall = null;
    this.mantle = null;
    this.zip = null;
    this.mode = "RUN";
    this.eye = 1.63;
    this.peak = p.y;
    this.floor = null;
    this.lean = 0;
    this.keys.clear();
  }
  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  press(k) {
    this.keys.add(k);
    if (k === "Space") this.buffer = 0.12;
    if (["KeyC", "ControlLeft", "ControlRight"].includes(k)) {
      this.crouchAgo = 0;
      if (this.ground && this.speed > 3) {
        this.slide = 1.05;
        this.event("slide");
      }
    }
    if (k === "KeyE" && !this.zip)
      for (const line of this.level.lines) {
        let nearest = vec();
        const ray = new T.Line3(line.a, line.end);
        ray.closestPointToPoint(
          this.pos.clone().add(vec(0, 1.55)),
          true,
          nearest,
        );
        if (nearest.distanceTo(this.pos.clone().add(vec(0, 1.55))) < 3) {
          this.zip = {
            line,
            t: ray.closestPointToPointParameter(nearest, true),
          };
          this.ground = false;
          this.event("zip");
          break;
        }
      }
  }
  tick(dt) {
    const { keys, pos, vel } = this;
    this.crouchAgo += dt;
    this.roll = Math.max(0, this.roll - dt);
    this.dip *= Math.exp(-9 * dt);
    this.stumble = Math.max(0, this.stumble - dt);
    this.wallLock = Math.max(0, this.wallLock - dt);
    this.slide = Math.max(0, this.slide - dt);
    const crouch =
      keys.has("KeyC") || keys.has("ControlLeft") || keys.has("ControlRight");
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const ceiling = this.level.colliders.some(
      (c) =>
        c.type === "pipe" &&
        this.inside(c) &&
        pos.y < c.lo &&
        pos.y + 1.78 > c.lo,
    );
    const low =
      this.slide > 0 || this.roll > 0 || ceiling || (crouch && this.ground);
    this.eye = T.MathUtils.damp(this.eye, low ? 0.78 : 1.63, 13, dt);
    if (this.mantle) {
      let m = this.mantle;
      m.t = Math.min(1, m.t + dt / m.duration);
      let f = m.t * m.t * (3 - 2 * m.t);
      pos.lerpVectors(m.start, m.end, f);
      pos.y += Math.sin(Math.PI * f) * 0.16;
      this.mode = m.name;
      if (m.t === 1) {
        this.mantle = null;
        this.ground = true;
        this.peak = pos.y;
        vel.y = 0;
      }
      return;
    }
    if (this.zip) {
      let z = this.zip;
      z.t = Math.min(1, z.t + (dt * 13) / z.line.a.distanceTo(z.line.end));
      pos.lerpVectors(z.line.a, z.line.end, z.t);
      pos.y -= 1.55;
      this.mode = "ZIPLINE";
      this.peak = pos.y;
      if (z.t >= 1 || this.buffer > 0) {
        vel.copy(z.line.end).sub(z.line.a).normalize().multiplyScalar(10);
        vel.y = this.buffer > 0 ? 6 : 0;
        this.zip = null;
        this.buffer = 0;
      }
      return;
    }
    let strafe = Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
      forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
    let wish = vec(strafe, 0, -forward)
      .applyAxisAngle(vec(0, 1, 0), this.yaw)
      .normalize();
    let target = this.stumble > 0 ? 2.5 : low ? 3.2 : sprint ? 9.5 : 5.7;
    if (this.slide > 0) {
      let s = this.speed;
      const gain =
        this.floor?.type === "ramp" ? -vel.z * this.floor.slope * 7 : 0;
      vel.x *= Math.exp(-0.45 * dt);
      vel.z *= Math.exp(-0.45 * dt);
      vel.z -= Math.max(0, gain) * dt;
      if (s < 2) this.slide = 0;
    } else {
      let accel = this.ground ? (wish.lengthSq() ? 18 : 26) : 5.5;
      let diff = wish
        .multiplyScalar(target)
        .sub(vec(vel.x, 0, vel.z))
        .clampLength(0, dt * accel);
      if (this.ground || forward || strafe) {
        vel.x += diff.x;
        vel.z += diff.z;
      }
    }
    if (this.ground) {
      this.coyote = 0.12;
      this.peak = pos.y;
      this.usedWall = null;
    } else this.coyote -= dt;
    if (this.buffer > 0 && (this.coyote > 0 || this.wall) && !ceiling) {
      if (this.wall) {
        vel.addScaledVector(this.wall.normal, 6.7);
        this.wallLock = 0.28;
        this.usedWall = this.wall.box;
      }
      vel.y = this.wall ? 8.2 : 8;
      this.buffer = 0;
      this.coyote = 0;
      this.wall = null;
      this.ground = false;
      this.slide = 0;
      this.event("jump");
    }
    this.buffer = Math.max(0, this.buffer - dt);
    const height = low ? 1 : 1.76,
      oldY = pos.y,
      oldGround = this.ground,
      inSpeed = this.speed;
    let contact = null;
    const near = this.level.colliders.filter(
      (c) => Math.abs((c.z ?? (c.b + c.f) / 2) - pos.z) < 40,
    );
    for (const axis of ["x", "z"]) {
      pos[axis] += vel[axis] * dt;
      for (const c of near) {
        if (
          c.type === "ramp" ||
          !this.inside(c) ||
          pos.y >= c.hi - 0.025 ||
          pos.y + height <= c.lo + 0.01
        )
          continue;
        const normal = vec();
        let mid = axis === "x" ? (c.l + c.r) / 2 : (c.b + c.f) / 2;
        normal[axis] = pos[axis] >= mid ? 1 : -1;
        const rise = c.hi - pos.y,
          autoVault =
            c.type === "vault" &&
            oldGround &&
            sprint &&
            inSpeed > 4 &&
            rise < 1.3;
        if (
          autoVault ||
          (!oldGround &&
            rise > 0 &&
            rise < 1.48 &&
            vel.y > -5 &&
            forward > 0 &&
            c.type !== "pipe")
        ) {
          let end = pos.clone().addScaledVector(normal, -0.65);
          end.y = c.hi + 0.01;
          this.mantle = {
            start: pos.clone(),
            end,
            t: 0,
            duration: autoVault ? 0.27 : 0.43,
            name: autoVault ? "VAULT" : "MANTLE",
          };
          this.wall = null;
          this.event("vault");
          return;
        }
        pos[axis] =
          axis === "x"
            ? normal.x > 0
              ? c.r + 0.281
              : c.l - 0.281
            : normal.z > 0
              ? c.f + 0.281
              : c.b - 0.281;
        vel[axis] = 0;
        contact = { box: c, normal };
      }
    }
    if (!contact && this.wall) {
      const w = this.wall;
      const test = pos.clone().addScaledVector(w.normal, -0.12);
      if (this.inside(w.box, test) && pos.y < w.box.hi) contact = w;
    }
    const groundClimb =
      oldGround &&
      sprint &&
      contact &&
      contact.box.hi - pos.y > 1.5 &&
      inSpeed > 4;
    if (groundClimb) {
      this.ground = false;
      this.coyote = 0;
    }
    if (
      (!oldGround || groundClimb) &&
      contact &&
      forward > 0 &&
      this.wallLock === 0 &&
      this.usedWall !== contact.box
    ) {
      if (!this.wall && inSpeed > 3) {
        this.wallTime = 0;
        this.wall = contact;
        this.wallClimb = this.speed < inSpeed * 0.52;
        if (this.wallClimb) vel.y = Math.max(vel.y, 5.8);
        this.event("wall");
      }
      if (this.wall) {
        this.wallTime += dt;
        if (this.wallTime > (this.wallClimb ? 0.52 : 1.5)) {
          this.usedWall = contact.box;
          this.wall = null;
        }
      }
    } else this.wall = null;
    vel.y -=
      dt *
      (this.wall
        ? this.wallClimb
          ? 8
          : 3.2
        : vel.y > 0 && !keys.has("Space")
          ? 35
          : 21);
    pos.y += vel.y * dt;
    this.peak = Math.max(this.peak, pos.y);
    this.ground = false;
    this.floor = null;
    let landing = -Infinity;
    for (const c of near) {
      if (!this.inside(c)) continue;
      const top = c.type === "ramp" ? c.base + (pos.z - c.b) * c.slope : c.hi;
      if (
        vel.y <= 0 &&
        oldY >= top - (oldGround ? 0.18 : 0.04) &&
        pos.y <= top + 0.015 &&
        top > landing
      ) {
        landing = top;
        this.floor = c;
      }
      if (vel.y > 0 && oldY + height <= c.lo + 0.02 && pos.y + height >= c.lo) {
        pos.y = c.lo - height - 0.01;
        vel.y = 0;
      }
    }
    if (this.floor) {
      pos.y = landing;
      if (!oldGround) {
        const fall = this.peak - pos.y;
        if (fall > 11) {
          this.event("death");
          return;
        }
        if (fall > 2.25) {
          if (this.crouchAgo < 0.38) {
            this.roll = 0.53;
            this.event("roll");
          } else {
            this.stumble = 0.56;
            vel.x *= 0.52;
            vel.z *= 0.52;
            this.dip = 0.45;
            this.event("stumble");
          }
        } else {
          this.dip = 0.13;
          this.event("land");
        }
      }
      vel.y = 0;
      this.ground = true;
      this.wall = null;
    }
    if (pos.y < this.peak - 13 || pos.y < -18) {
      this.event("death");
      return;
    }
    this.mode = this.roll
      ? "ROLL"
      : this.slide
        ? "SLIDE"
        : this.wall
          ? this.wallClimb
            ? "CLIMB"
            : "WALL RUN"
          : !this.ground
            ? "AIR"
            : sprint
              ? "SPRINT"
              : "RUN";
    if ((this.ground && !low) || this.wall) {
      this.phase += dt * this.speed * 1.85;
      this.stride += dt * this.speed;
      if (this.stride > 2.05) {
        this.stride = 0;
        this.event(
          this.wall
            ? "wallstep"
            : this.floor?.metal ||
                ["prop", "pipe", "ramp"].includes(this.floor?.type)
              ? "metal"
              : "step",
        );
      }
    }
  }
  inside(c, p = this.pos) {
    return (
      p.x > c.l - 0.28 &&
      p.x < c.r + 0.28 &&
      p.z > c.b - 0.28 &&
      p.z < c.f + 0.28
    );
  }
  camera(cam, dt) {
    const bob = this.ground
      ? Math.sin(this.phase) * Math.min(this.speed * 0.004, 0.035)
      : 0;
    cam.position.copy(this.pos);
    cam.position.y += this.eye + bob - this.dip;
    const tilt = this.wall
      ? -0.12 *
        (this.wall.normal.x * Math.cos(this.yaw) -
          this.wall.normal.z * Math.sin(this.yaw))
      : 0;
    this.lean = T.MathUtils.damp(this.lean, tilt, 8, dt);
    cam.rotation.order = "YXZ";
    cam.rotation.set(
      this.pitch -
        (this.roll ? Math.sin((Math.PI * this.roll) / 0.53) * 0.6 : 0),
      this.yaw,
      this.lean +
        (this.roll ? Math.sin((Math.PI * this.roll) / 0.53) * 0.45 : 0) +
        this.dip * 0.09,
    );
    cam.fov = T.MathUtils.damp(
      cam.fov,
      75 + Math.min(this.zip ? 20 : this.speed * 1.8, 20),
      4,
      dt,
    );
    cam.updateProjectionMatrix();
  }
}
