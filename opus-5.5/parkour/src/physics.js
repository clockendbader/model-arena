// ---------------------------------------------------------------------------
// Collision world: axis-aligned boxes + single-axis ramps, a uniform grid
// broadphase, capsule (vertical cylinder) resolution and ray casts.
// ---------------------------------------------------------------------------

const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.ramps = [];
    this.grid = new Map();
    this.stamp = 0;
    this._result = [];
  }

  /** Add a solid box. surface: 'concrete' | 'metal' */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, surface = 'concrete', tag = null) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, surface, tag, _s: 0, ramp: null };
    this.boxes.push(b);
    this._insert(b);
    return b;
  }

  /**
   * Ramp: walkable slope along one axis. h0 is the surface height at the min
   * end of `axis`, h1 at the max end. A solid box fills below min(h0,h1).
   */
  addRamp(minX, maxX, minZ, maxZ, axis, h0, h1, baseY, surface = 'concrete') {
    const r = { minX, maxX, minZ, maxZ, axis, h0, h1, surface };
    this.ramps.push(r);
    // ramp proxy box for broadphase; its "top" is computed per query
    const b = {
      minX, minY: baseY, minZ, maxX, maxY: Math.max(h0, h1), maxZ, surface, tag: 'ramp', _s: 0, ramp: r,
    };
    this.boxes.push(b);
    this._insert(b);
    return r;
  }

  rampHeight(r, x, z) {
    let t = r.axis === 'z' ? (z - r.minZ) / (r.maxZ - r.minZ) : (x - r.minX) / (r.maxX - r.minX);
    t = Math.min(1, Math.max(0, t));
    return r.h0 + (r.h1 - r.h0) * t;
  }

  /** Top surface height of box b at x,z (handles ramps). */
  topAt(b, x, z) {
    return b.ramp ? this.rampHeight(b.ramp, x, z) : b.maxY;
  }

  _insert(b) {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let i = x0; i <= x1; i++) {
      for (let k = z0; k <= z1; k++) {
        const key = i * 73856093 ^ k * 19349663;
        let arr = this.grid.get(key);
        if (!arr) { arr = []; this.grid.set(key, arr); }
        arr.push(b);
      }
    }
  }

  /** Boxes whose XZ footprint might overlap the given rectangle. */
  query(minX, minZ, maxX, maxZ) {
    const out = this._result; out.length = 0;
    const s = ++this.stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let i = x0; i <= x1; i++) {
      for (let k = z0; k <= z1; k++) {
        const arr = this.grid.get(i * 73856093 ^ k * 19349663);
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const b = arr[n];
          if (b._s === s) continue;
          b._s = s;
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Is a capsule (cylinder) of radius r and height h standing at feet (x,y,z) free?
   */
  capsuleFree(x, y, z, r, h, margin = 0.01) {
    const list = this.query(x - r, z - r, x + r, z + r);
    for (const b of list) {
      const top = this.topAt(b, x, z);
      if (top <= y + margin || b.minY >= y + h - margin) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < (r - margin) * (r - margin)) return false;
    }
    return true;
  }

  /** Highest walkable surface under the footprint between yMin and yMax. */
  groundHeight(x, z, r, yMin, yMax) {
    const rr = r * 0.85;
    const list = this.query(x - rr, z - rr, x + rr, z + rr);
    let best = -Infinity, bestBox = null;
    for (const b of list) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz > rr * rr) continue;
      // for ramps evaluate the height at the clamped point (closest on ramp)
      const top = b.ramp ? this.rampHeight(b.ramp, cx, cz) : b.maxY;
      if (top < yMin || top > yMax) continue;
      if (top > best) { best = top; bestBox = b; }
    }
    return bestBox ? { y: best, box: bestBox } : null;
  }

  /**
   * Ray cast against all boxes (ramps treated as their proxy box top-sloped
   * only for downward rays). Returns { t, x, y, z, nx, ny, nz, box } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    let bestT = maxT, hit = null;
    for (const b of list) {
      let tmin = 0, tmax = bestT, nAxis = -1, nSign = 0;
      const maxY = b.ramp ? Math.max(b.ramp.h0, b.ramp.h1) : b.maxY;
      const mins = [b.minX, b.minY, b.minZ], maxs = [b.maxX, maxY, b.maxZ];
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < mins[a] || o[a] > maxs[a]) { ok = false; break; }
        } else {
          let t1 = (mins[a] - o[a]) / d[a], t2 = (maxs[a] - o[a]) / d[a];
          let s = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
          if (t1 > tmin) { tmin = t1; nAxis = a; nSign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (!ok || nAxis < 0) continue;
      let t = tmin;
      let nx = 0, ny = 0, nz = 0;
      if (nAxis === 0) nx = nSign; else if (nAxis === 1) ny = nSign; else nz = nSign;
      if (b.ramp && nAxis === 1 && ny > 0) {
        // refine against sloped surface by marching (ramps are gentle)
        const px = ox + dx * t, pz = oz + dz * t;
        const h = this.rampHeight(b.ramp, px, pz);
        if (dy < 0) { t = (h - oy) / dy; if (t < 0 || t > bestT) continue; }
      }
      if (t < bestT) {
        bestT = t;
        hit = { t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, nx, ny, nz, box: b };
      }
    }
    return hit;
  }

  /**
   * Move a cylinder through the world. state = { x,y,z, vx,vy,vz, grounded }
   * Mutates state. Returns contact info.
   */
  move(st, dt, r, h, opts) {
    const info = this._info || (this._info = {
      landed: false, landVel: 0, wallHit: false, wallNx: 0, wallNz: 0, wallImpact: 0,
      ceiling: false, groundBox: null,
    });
    info.landed = false; info.landVel = 0; info.wallHit = false; info.wallImpact = 0;
    info.ceiling = false; info.groundBox = null;

    const speed = Math.hypot(st.vx, st.vy, st.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.14));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) this._step(st, sdt, r, h, opts, info);
    return info;
  }

  _step(st, dt, r, h, opts, info) {
    const stepAllow = st.grounded ? opts.stepUp : opts.airStepUp;

    // ---- horizontal ----
    st.x += st.vx * dt;
    st.z += st.vz * dt;
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      const list = this.query(st.x - r, st.z - r, st.x + r, st.z + r);
      for (const b of list) {
        const cx = Math.max(b.minX, Math.min(st.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(st.z, b.maxZ));
        const top = b.ramp ? this.rampHeight(b.ramp, cx, cz) : b.maxY;
        if (top <= st.y + stepAllow || b.minY >= st.y + h) continue;
        if (b.ramp && top <= st.y + 0.6) continue; // ramps: walk on, not into
        let dx = st.x - cx, dz = st.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx, nz, pen;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; pen = r - d;
        } else {
          // centre inside the box footprint: push out along the shallowest axis
          const pxn = st.x - b.minX, pxp = b.maxX - st.x, pzn = st.z - b.minZ, pzp = b.maxZ - st.z;
          const m = Math.min(pxn, pxp, pzn, pzp);
          if (m === pxn) { nx = -1; nz = 0; pen = pxn + r; }
          else if (m === pxp) { nx = 1; nz = 0; pen = pxp + r; }
          else if (m === pzn) { nx = 0; nz = -1; pen = pzn + r; }
          else { nx = 0; nz = 1; pen = pzp + r; }
        }
        st.x += nx * pen;
        st.z += nz * pen;
        const vn = st.vx * nx + st.vz * nz;
        if (vn < 0) {
          st.vx -= nx * vn; st.vz -= nz * vn;
          if (-vn > info.wallImpact) {
            info.wallImpact = -vn; info.wallNx = nx; info.wallNz = nz;
          }
        }
        info.wallHit = true;
        if (info.wallImpact === 0) { info.wallNx = nx; info.wallNz = nz; }
        pushed = true;
      }
      if (!pushed) break;
    }

    // ---- vertical ----
    const prevY = st.y;
    st.y += st.vy * dt;
    if (st.vy <= 0) {
      const g = this.groundHeight(st.x, st.z, r, st.y - (st.grounded ? opts.groundSnap : 0.0), prevY + stepAllow);
      if (g) {
        if (!st.grounded) { info.landed = true; info.landVel = -st.vy; }
        st.y = g.y;
        st.vy = 0;
        st.grounded = true;
        info.groundBox = g.box;
      } else {
        st.grounded = false;
      }
    } else {
      st.grounded = false;
      // ceiling
      const list = this.query(st.x - r * 0.8, st.z - r * 0.8, st.x + r * 0.8, st.z + r * 0.8);
      for (const b of list) {
        if (b.minY < prevY + h - 0.02 || b.minY > st.y + h) continue;
        const cx = Math.max(b.minX, Math.min(st.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(st.z, b.maxZ));
        const dx = st.x - cx, dz = st.z - cz;
        if (dx * dx + dz * dz > r * r * 0.64) continue;
        st.y = b.minY - h;
        st.vy = 0;
        info.ceiling = true;
      }
    }
  }
}
