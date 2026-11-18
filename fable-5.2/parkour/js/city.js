// ============================================================================
// city.js — buildings. One shared routine dresses any block (facade, roof,
// coping, cornice); the generator fills the district around the course with
// a dense skyline, rooftop clutter, a far ring of towers and the street.
// ============================================================================
import * as THREE from 'three';
import { TILE } from './materials.js';
import { rng } from './geo.js';
import { SUN_DIR } from './renderer.js';

const FACADE_KEYS = ['Facade018A', 'Facade019A', 'Facade020A', 'Facade006', 'Facade001', 'Facade005', 'Facade012', 'Facade009'];
const ROOF_KEYS = ['concrete_floor_02', 'gravel_concrete_03', 'bitumen', 'concrete_floor_worn_001', 'asphalt_02'];

/** facade wall quad with window bays snapped to the wall width */
function facadeWall(g, f, face, x0, x1, y0, y1, z0, z1, col) {
  const [tw, th] = f.tile, bay = tw / f.cols;
  const w = (face === 'x' || face === 'X') ? z1 - z0 : x1 - x0;
  const u1 = Math.max(1, Math.round(w / bay)) / f.cols;
  const v0 = (y0 - y1) / th, uv = [0, v0, u1, v0, u1, 0, 0, 0];
  if (face === 'X') g.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uv, col);
  else if (face === 'x') g.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uv, col);
  else if (face === 'Z') g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv, col);
  else g.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uv, col);
}

/**
 * Dress a block as a building.
 * b: {x0,x1,z0,z1,y0,y1, facade, roofTex}; o: {parapet, tint, cornice, coping}
 */
export function addBuilding(batch, assets, b, o = {}) {
  const { x0, x1, z0, z1, y1 } = b, y0 = b.y0 ?? 0;
  const tint = o.tint || [1, 1, 1];
  const f = assets.facades[b.facade];
  if (f) {
    const g = batch.g(b.facade);
    for (const face of 'xXzZ') facadeWall(g, f, face, x0, x1, y0, y1, z0, z1, tint);
  } else {
    const key = b.facade === 'brick' ? 'red_brick_03' : b.facade === 'plaster' ? 'painted_plaster_wall' : 'concrete_wall_008';
    batch.g(key).box(x0, x1, y0, y1, z0, z1, { tile: TILE[key], col: tint, faces: 'xXzZ' });
    if (b.construction || b.tier) {            // floor slab lines on bare concrete
      const gs = batch.g('concrete_floor_02');
      for (let y = y1 - 0.4; y > y0 + 1; y -= 4) gs.box(x0 - 0.12, x1 + 0.12, y - 0.28, y, z0 - 0.12, z1 + 0.12, { tile: 3, col: [0.72, 0.7, 0.68], faces: 'xXzZyY' });
    }
  }
  const roofKey = b.roofTex || 'concrete_floor_02';
  const rt = o.roofTint || [1, 1, 1];
  batch.g(roofKey).box(x0, x1, y1 - 0.1, y1, z0, z1, { tile: TILE[roofKey], col: rt, faces: 'Y' });

  const gc = batch.g('concrete_wall_008');
  const ph = o.parapet || 0;
  if (ph > 0) {
    // parapet ring
    const t = 0.35, c = [0.82, 0.8, 0.78];
    gc.box(x0, x1, y1, y1 + ph, z0, z0 + t, { tile: 3, col: c });
    gc.box(x0, x1, y1, y1 + ph, z1 - t, z1, { tile: 3, col: c });
    gc.box(x0, x0 + t, y1, y1 + ph, z0 + t, z1 - t, { tile: 3, col: c, faces: 'xXY' });
    gc.box(x1 - t, x1, y1, y1 + ph, z0 + t, z1 - t, { tile: 3, col: c, faces: 'xXY' });
  } else if (o.coping !== false) {
    // flush coping with a small overhang: reads as a clean grabbable edge
    const w = 0.42, e = 0.1, c = [0.62, 0.61, 0.6], ya = y1 - 0.3, yb = y1 + 0.025;
    gc.box(x0 - e, x1 + e, ya, yb, z0 - e, z0 + w, { tile: 3, col: c });
    gc.box(x0 - e, x1 + e, ya, yb, z1 - w, z1 + e, { tile: 3, col: c });
    gc.box(x0 - e, x0 + w, ya, yb, z0 + w, z1 - w, { tile: 3, col: c, faces: 'xXYy' });
    gc.box(x1 - w, x1 + e, ya, yb, z0 + w, z1 - w, { tile: 3, col: c, faces: 'xXYy' });
  }
  if (o.cornice) {
    const e = 0.22, c = [0.7, 0.69, 0.67];
    for (const yy of o.cornice) gc.box(x0 - e, x1 + e, yy - 0.45, yy, z0 - e, z1 + e, { tile: 3, col: c, faces: 'xXzZyY' });
  }
}

// ---------------------------------------------------------------------------
// rooftop kit for background buildings (cheap, merged or instanced)
// ---------------------------------------------------------------------------
class RoofKit {
  constructor(batch, parent, mats) {
    this.batch = batch; this.parent = parent; this.mats = mats;
    this.tanks = []; this.antennas = []; this.lights = [];
  }
  bulkhead(x, y, z, w, d, h, r) {
    const key = r() < 0.5 ? 'red_brick_03' : 'concrete_wall_008';
    this.batch.g(key).box(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, { tile: TILE[key], col: [0.8, 0.78, 0.76] });
    this.batch.g('metal_plate_02').box(x - w / 2 - 0.12, x + w / 2 + 0.12, y + h, y + h + 0.14, z - d / 2 - 0.12, z + d / 2 + 0.12, { tile: 2 });
  }
  acBox(x, y, z, w, d, h, r) {
    const key = r() < 0.5 ? 'metal_plate_02' : 'blue_metal_plate';
    const c = r() < 0.5 ? [0.85, 0.86, 0.88] : [0.6, 0.62, 0.66];
    this.batch.g(key).box(x - w / 2, x + w / 2, y + 0.18, y + h, z - d / 2, z + d / 2, { tile: 2, col: c });
    this.batch.g('metal_plate_02').box(x - w / 2 + 0.1, x + w / 2 - 0.1, y, y + 0.18, z - d / 2 + 0.1, z + d / 2 - 0.1, { tile: 2, col: [0.3, 0.3, 0.3], faces: 'xXzZ' });
  }
  tank(x, y, z, s) { this.tanks.push([x, y, z, s]); }
  antenna(x, y, z, h) { this.antennas.push([x, y, z, h]); this.lights.push(x, y + h, z); }

  flush() {
    const dummy = new THREE.Object3D();
    // water tanks: timber drum + conical cap + steel legs
    if (this.tanks.length) {
      const drum = new THREE.CylinderGeometry(1.5, 1.55, 3, 20, 1); drum.translate(0, 3.3, 0);
      const cap = new THREE.ConeGeometry(1.75, 1.0, 20); cap.translate(0, 5.3, 0);
      const legs = [];
      for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = new THREE.BoxGeometry(0.14, 1.8, 0.14); l.translate(lx * 0.95, 0.9, lz * 0.95); legs.push(l); }
      const band = new THREE.CylinderGeometry(1.58, 1.58, 0.08, 20, 1, true);
      const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, this.tanks.length); im.castShadow = im.receiveShadow = true; this.parent.add(im); return im; };
      const uvScale = (g, u, v) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * u, a.getY(i) * v); return g; };
      const a = mk(uvScale(drum, 4, 1.5), this.mats.plain('weathered_brown_planks#tank'));
      const b = mk(cap, this.mats.plain('rusty_metal_02#dark'));
      const meshes = [a, b, ...legs.map(l => mk(l, this.mats.plain('metal_plate_02'))), mk(band.clone().translate(0, 2.5, 0), this.mats.plain('metal_plate_02')), mk(band.clone().translate(0, 4.2, 0), this.mats.plain('metal_plate_02'))];
      this.tanks.forEach(([x, y, z, s], i) => {
        dummy.position.set(x, y, z); dummy.scale.setScalar(s); dummy.rotation.set(0, i * 1.7, 0); dummy.updateMatrix();
        for (const m of meshes) m.setMatrixAt(i, dummy.matrix);
      });
      for (const m of meshes) m.computeBoundingSphere();
    }
    if (this.antennas.length) {
      const geo = new THREE.CylinderGeometry(0.035, 0.07, 1, 6); geo.translate(0, 0.5, 0);
      const cross = new THREE.BoxGeometry(1.2, 0.04, 0.04); cross.translate(0, 0.72, 0);
      const im = new THREE.InstancedMesh(geo, this.mats.plain('flat#0x2a2c30'), this.antennas.length);
      const im2 = new THREE.InstancedMesh(cross, this.mats.plain('flat#0x2a2c30'), this.antennas.length);
      this.antennas.forEach(([x, y, z, h], i) => {
        dummy.position.set(x, y, z); dummy.scale.set(1, h, 1); dummy.rotation.set(0, i, 0); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix); im2.setMatrixAt(i, dummy.matrix);
      });
      im.castShadow = im2.castShadow = true; im.computeBoundingSphere(); im2.computeBoundingSphere();
      this.parent.add(im, im2);
      // red aviation lights
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(this.lights, 3));
      const pm = new THREE.PointsMaterial({ color: new THREE.Color(6, 0.35, 0.2), size: 0.55, sizeAttenuation: true, fog: true, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
      this.beacons = new THREE.Points(pg, pm); this.beacons.frustumCulled = false;
      this.parent.add(this.beacons);
    }
  }
}

// ---------------------------------------------------------------------------
// billboards with glowing abstract art
// ---------------------------------------------------------------------------
const PALETTES = [
  ['#ff3d2e', '#ffb22e', '#fff3d6', '#20c7c9'], ['#16d3c5', '#f9f871', '#ff5e7e', '#fefefe'],
  ['#ff7a18', '#ffd166', '#ef476f', '#fffaf0'], ['#7df9ff', '#ff4fd8', '#ffe66d', '#ffffff'],
  ['#ff5a36', '#ffe8c2', '#36c9c6', '#ffa62b'],
];
export function billboardTexture(seed, aspect = 3) {
  const r = rng(seed * 7919 + 13), H = 256, W = Math.round(H * aspect);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), pal = PALETTES[seed % PALETTES.length];
  c.fillStyle = '#07090d'; c.fillRect(0, 0, W, H);
  const pick = () => pal[(r() * pal.length) | 0];
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    c.fillStyle = c.strokeStyle = pick(); c.globalAlpha = 0.55 + r() * 0.45; c.lineWidth = 6 + r() * 16;
    const x = r() * W, y = r() * H, s = 30 + r() * 110, k = r();
    c.beginPath();
    if (k < 0.3) { c.arc(x, y, s, 0, Math.PI * 2); r() < 0.5 ? c.fill() : c.stroke(); }
    else if (k < 0.5) { c.moveTo(x, y - s); c.lineTo(x + s, y + s * 0.8); c.lineTo(x - s, y + s * 0.8); c.closePath(); r() < 0.5 ? c.fill() : c.stroke(); }
    else if (k < 0.72) { for (let j = 0; j < 5; j++) c.fillRect(x + j * (s * 0.35), 0, s * 0.14, H); }
    else if (k < 0.86) { c.arc(x, y, s * 1.4, r() * 6, r() * 6 + 2.5); c.stroke(); }
    else c.fillRect(x - s, y - s * 0.25, s * 2.4, s * 0.5);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function billboardMaterial(seed, aspect) {
  const t = billboardTexture(seed, aspect);
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 3.2, roughness: 0.4, metalness: 0, color: 0x202020 });
}

// ---------------------------------------------------------------------------
// the district
// ---------------------------------------------------------------------------
export function buildCity({ batch, assets, mats, scene, level, world }) {
  const r = rng(77123);
  const kit = new RoofKit(batch, scene, mats);
  const reserved = level.roofs.map(b => ({ x0: b.x0 - 7, x1: b.x1 + 7, z0: b.z0 - 7, z1: b.z1 + 7 }));
  for (const s of level.solids) if (s.vis === 'beam' || s.vis === 'plank') reserved.push({ x0: s.x0 - 6, x1: s.x1 + 6, z0: s.z0 - 6, z1: s.z1 + 6 });
  for (const z of level.zips) reserved.push({ x0: Math.min(z.a[0], z.b[0]) - 7, x1: Math.max(z.a[0], z.b[0]) + 7, z0: Math.min(z.a[2], z.b[2]) - 4, z1: Math.max(z.a[2], z.b[2]) + 4, zip: z });
  const hits = (x0, x1, z0, z1) => reserved.some(q => x1 > q.x0 && x0 < q.x1 && z1 > q.z0 && z0 < q.z1);
  const sunH = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
  const courseDist = (x, z) => {
    let best = 1e9, bx = 0, bz = 0;
    for (const b of level.roofs) {
      const cx = Math.min(b.x1, Math.max(b.x0, x)), cz = Math.min(b.z1, Math.max(b.z0, z));
      const d = Math.hypot(x - cx, z - cz); if (d < best) { best = d; bx = cx; bz = cz; }
    }
    return [best, bx, bz];
  };
  const billboards = [];

  // ---- near/mid field: jittered lots ---------------------------------------
  const PITCH = 46;
  for (let gx = -8; gx <= 8; gx++) for (let gz = -20; gz <= 6; gz++) {
    const cx = gx * PITCH + (r() - 0.5) * 8, cz = gz * PITCH - 20 + (r() - 0.5) * 8;
    let w = 22 + r() * 14, d = 22 + r() * 14;
    let x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (hits(x0, x1, z0, z1)) {
      // try a slimmer building squeezed into the lot before giving up
      w *= 0.55; d *= 0.55; x0 = cx - w / 2; x1 = cx + w / 2; z0 = cz - d / 2; z1 = cz + d / 2;
      if (hits(x0, x1, z0, z1)) continue;
    }
    const [dist, bx, bz] = courseDist(cx, cz);
    const prof = level.profile(cz);
    const toward = ((cx - bx) * sunH.x + (cz - bz) * sunH.y) / Math.max(dist, 1);    // >0: between the course and the sun
    let h;
    const k = r();
    if (dist < 48) {
      // neighbours: clearly lower than the route (below the kill line) or clearly taller walls
      h = (toward > -0.15 || k < 0.62) ? prof - 28 - r() * 20 : prof + 14 + r() * 46;
    } else {
      h = k < 0.36 ? 20 + r() * 26 : k < 0.78 ? 44 + r() * 36 : 84 + r() * 80;
      if (toward > 0.1) h = Math.min(h, prof - 4 + dist * 0.2);      // keep the low sun on the course
    }
    h = Math.max(14, h);
    const facade = FACADE_KEYS[(r() * (h > 80 ? 8 : 6)) | 0];
    const sh = 0.72 + r() * 0.36, tint = [sh * (0.96 + r() * 0.1), sh, sh * (0.94 + r() * 0.1)];
    const roofTex = ROOF_KEYS[(r() * ROOF_KEYS.length) | 0];
    const setback = h > 60 && r() < 0.55;
    const hBase = setback ? h * (0.45 + r() * 0.3) : h;
    addBuilding(batch, assets, { x0, x1, z0, z1, y0: 0, y1: hBase, facade, roofTex }, { parapet: 0.7 + r() * 0.5, tint, cornice: r() < 0.5 ? [hBase - 0.05] : null });
    world.add({ x0, x1, y0: 0, y1: hBase, z0, z1, surf: 'concrete', bg: true });
    let tx0 = x0, tx1 = x1, tz0 = z0, tz1 = z1, top = hBase;
    if (setback) {
      const ix = 2 + r() * 4, iz = 2 + r() * 4;
      tx0 += ix; tx1 -= ix; tz0 += iz; tz1 -= iz; top = h;
      addBuilding(batch, assets, { x0: tx0, x1: tx1, z0: tz0, z1: tz1, y0: hBase, y1: h, facade, roofTex }, { parapet: 0.6, tint });
      world.add({ x0: tx0, x1: tx1, y0: hBase, y1: h, z0: tz0, z1: tz1, surf: 'concrete', bg: true });
    }
    // rooftop clutter
    const rw = tx1 - tx0 - 3, rd = tz1 - tz0 - 3, px = () => tx0 + 1.5 + r() * rw, pz = () => tz0 + 1.5 + r() * rd;
    if (r() < 0.8) kit.bulkhead(px(), top, pz(), 3 + r() * 2, 3 + r() * 2, 2.6 + r(), r);
    const nAc = 1 + (r() * 5 | 0);
    for (let i = 0; i < nAc; i++) kit.acBox(px(), top, pz(), 1.4 + r() * 2.4, 1.2 + r() * 1.6, 1 + r() * 1.2, r);
    if (r() < 0.45) kit.tank(px(), top, pz(), 0.9 + r() * 0.5);
    if (r() < 0.5) kit.antenna(px(), top, pz(), 5 + r() * (h > 80 ? 22 : 9));
    if (dist > 30 && dist < 260 && r() < 0.16 && top < prof + 30) billboards.push({ x: (tx0 + tx1) / 2, y: top, z: (tz0 + tz1) / 2, w: Math.min(tx1 - tx0 - 2, 12 + r() * 6), face: Math.atan2(bx - cx, bz - cz) });
  }

  // ---- far ring: big simple towers fading into the haze ---------------------
  for (let i = 0; i < 300; i++) {
    const ang = r() * Math.PI * 2, rad = 420 + Math.pow(r(), 0.8) * 1000;
    const cx = Math.cos(ang) * rad * 1.0, cz = -300 + Math.sin(ang) * rad;
    if (Math.abs(cx) < 400 && cz > -960 && cz < 270) continue;
    const w = 28 + r() * 40, d = 28 + r() * 40;
    const sunSide = (cx * sunH.x + (cz + 300) * sunH.y) / rad;
    let h = 40 + Math.pow(r(), 1.6) * 230;
    if (sunSide > 0.55) h *= 0.6;
    const sh = 0.6 + r() * 0.4;
    const facade = FACADE_KEYS[(r() * 8) | 0];
    addBuilding(batch, assets, { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: 0, y1: h, facade, roofTex: 'bitumen' }, { coping: false, tint: [sh, sh, sh] });
    if (r() < 0.4) addBuilding(batch, assets, { x0: cx - w / 4, x1: cx + w / 4, z0: cz - d / 4, z1: cz + d / 4, y0: h, y1: h + 20 + r() * 60, facade, roofTex: 'bitumen' }, { coping: false, tint: [sh, sh, sh] });
    if (r() < 0.3) kit.antenna(cx, h, cz, 18 + r() * 30);
  }

  // ---- street level ---------------------------------------------------------
  batch.g('asphalt_02').box(-1800, 1800, -1, 0, -2100, 1500, { tile: 12, col: [0.5, 0.48, 0.47], faces: 'Y' });

  // ---- billboards -----------------------------------------------------------
  billboards.forEach((b, i) => {
    const h = b.w / 3, mat = billboardMaterial(i + 1, 3);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(b.w, h), mat);
    panel.position.set(b.x, b.y + 2.2 + h / 2, b.z); panel.rotation.y = b.face;
    const back = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, h + 0.3, 0.25), mats.plain('metal_plate_02'));
    back.position.set(0, 0, -0.14); back.castShadow = true; panel.add(back);
    for (const sx of [-0.35, 0.35]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.3 + h, 0.22), mats.plain('metal_plate_02'));
      leg.position.set(sx * b.w, -(2.3 + h) / 2 + h / 2, -0.35); leg.castShadow = true; panel.add(leg);
    }
    scene.add(panel);
  });

  return { kit };
}
