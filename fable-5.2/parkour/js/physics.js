// ============================================================================
// physics.js — static collision world.
// Colliders are axis-aligned boxes (optionally with a sloped top = ramp),
// stored in a uniform XZ grid. The player is a vertical cylinder.
// Pure JS (no three.js) so it can also run headless in Node for testing.
// ============================================================================
const CELL = 8;
const key = (ix, iz) => (ix + 512) * 2048 + (iz + 1024);

export class World {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this._stamp = 1;
    this._out = [];
  }

  /** box: {x0,x1,y0,y1,z0,z1, surf, ramp?:{axis:'x'|'z', a, b}} — ramp top goes a (at min) -> b (at max) */
  add(b) {
    b.id = this.boxes.length;
    b._s = 0;
    if (b.ramp) b.y1 = Math.max(b.ramp.a, b.ramp.b);
    this.boxes.push(b);
    const ix0 = Math.floor(b.x0 / CELL), ix1 = Math.floor(b.x1 / CELL);
    const iz0 = Math.floor(b.z0 / CELL), iz1 = Math.floor(b.z1 / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = key(ix, iz);
      let c = this.grid.get(k);
      if (!c) this.grid.set(k, c = []);
      c.push(b);
    }
    return b;
  }

  /** top surface height of a box at (x,z) */
  topAt(b, x, z) {
    if (!b.ramp) return b.y1;
    const r = b.ramp;
    const t = r.axis === 'z' ? (z - b.z0) / (b.z1 - b.z0) : (x - b.x0) / (b.x1 - b.x0);
    return r.a + (r.b - r.a) * Math.min(1, Math.max(0, t));
  }

  /** all boxes whose XZ footprint touches the rect; returned array is reused */
  query(x0, z0, x1, z1) {
    const out = this._out; out.length = 0;
    const s = ++this._stamp;
    const ix0 = Math.floor(x0 / CELL), ix1 = Math.floor(x1 / CELL);
    const iz0 = Math.floor(z0 / CELL), iz1 = Math.floor(z1 / CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const c = this.grid.get(key(ix, iz));
      if (!c) continue;
      for (let i = 0; i < c.length; i++) {
        const b = c[i];
        if (b._s === s) continue;
        b._s = s;
        if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
        out.push(b);
      }
    }
    return out;
  }

  /** is a cylinder (feet at y, height h, radius r) free of all colliders? */
  cylinderFree(x, y, z, r, h) {
    const bs = this.query(x - r, z - r, x + r, z + r);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const cx = Math.min(b.x1, Math.max(b.x0, x)), cz = Math.min(b.z1, Math.max(b.z0, z));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz >= r * r) continue;
      const top = this.topAt(b, cx, cz);
      if (y >= top - 1e-4 || y + h <= b.y0) continue;
      return false;
    }
    return true;
  }

  /** highest surface at or below y (within maxDrop) under a disc of radius r. Returns box or null; height in this.groundY */
  groundBelow(x, y, z, r, maxDrop) {
    const bs = this.query(x - r, z - r, x + r, z + r);
    let best = null, bestY = -Infinity;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const cx = Math.min(b.x1, Math.max(b.x0, x)), cz = Math.min(b.z1, Math.max(b.z0, z));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz >= r * r) continue;
      const top = this.topAt(b, cx, cz);
      if (top > y + 0.02 || top < y - maxDrop) continue;
      if (top > bestY) { bestY = top; best = b; }
    }
    this.groundY = bestY;
    return best;
  }
}
