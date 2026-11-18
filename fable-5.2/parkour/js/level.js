// ============================================================================
// level.js — turns the course data (leveldata.js) into meshes: course
// buildings, obstacles, props, ziplines, checkpoints, the finish beacon,
// runner's-vision markers, cranes, scaffolding and strung cables.
// ============================================================================
import * as THREE from 'three';
import { TILE } from './materials.js';
import { addBuilding, billboardMaterial } from './city.js';
import { rng } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3();

/** matrix for a unit box/cylinder (along Y, length 1) stretched between two points */
function between(p, q, thick, out = new THREE.Matrix4()) {
  _a.set(p[0], p[1], p[2]); _b.set(q[0], q[1], q[2]);
  const len = _a.distanceTo(_b);
  _s.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(UP, _s);
  return out.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, new THREE.Vector3(thick, len, thick));
}

export function buildLevelVisuals({ batch, assets, mats, scene, level, props, kit }) {
  const r = rng(4242);
  const tube = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const pipe = (key, p, q, d, col) => batch.g(key).mesh(tube, between(p, q, d), col);
  const strut = (key, p, q, d, col) => batch.g(key).mesh(unitBox, between(p, q, d), col);
  const dyn = [];                               // things that animate

  // ---------------------------------------------------------------- solids
  for (const s of level.solids) {
    const { x0, x1, y0, y1, z0, z1 } = s, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    switch (s.vis) {
      case 'building': {
        const sh = 0.86 + r() * 0.2;
        addBuilding(batch, assets, s, {
          tint: [sh, sh, sh], parapet: s.wall ? 0.9 : 0,
          cornice: s.tier ? null : s.wall ? [y1 - 0.02] : null,
        });
        if (s.construction) {
          // rebar + formwork on the unfinished core
          for (let i = 0; i < 26; i++) { const px = x0 + 1 + r() * (x1 - x0 - 2), pz = z0 + 1 + r() * (z1 - z0 - 2); pipe('rusty_metal_02', [px, y1, pz], [px, y1 + 1 + r() * 1.6, pz], 0.05, [0.8, 0.5, 0.4]); }
          for (const [px, pz] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2], [cx, cz]]) batch.g('concrete_wall_008').box(px - 0.5, px + 0.5, y1, y1 + 3.4, pz - 0.5, pz + 0.5, { tile: 3 });
        }
        break;
      }
      case 'box': {
        const key = s.mat || 'concrete_wall_008';
        batch.g(key).box(x0, x1, y0, y1, z0, z1, { tile: TILE[key] || 2 });
        if (s.cap) batch.g('concrete_wall_008@rv').box(x0 - 0.04, x1 + 0.04, y1 - 0.1, y1 + 0.03, z0 - 0.04, z1 + 0.04, { tile: 3 });
        break;
      }
      case 'duct': {
        // real duct segments tiled along X, resting on stands
        const P = props.piece('ductSeg'), len = x1 - x0, stand = s.big ? 0.12 : 0.26;
        const sz = (z1 - z0) / P.size.x, sy = (y1 - y0 - stand) / P.size.y;
        const n = Math.max(1, Math.round(len / (P.size.z * sz))), sl = len / (n * P.size.z);
        for (let i = 0; i < n; i++) {
          const px = x0 + (i + 0.5) * len / n;
          props.add('ductSeg', _m.compose(new THREE.Vector3(px, y0 + stand, cz), _q.setFromAxisAngle(UP, Math.PI / 2), new THREE.Vector3(sz, sy, sl)), s.rv ? 'rv' : '');
          batch.g('metal_plate_02').box(px - 0.12, px + 0.12, y0 - (s.big ? 0 : 0), y0 + stand, z0 + 0.08, z1 - 0.08, { tile: 2, col: [0.4, 0.4, 0.42] });
          if (s.big) batch.g('metal_plate_02').box(px - len / n / 2 - 0.05, px - len / n / 2 + 0.05, y0 - 0.02, y1 + 0.05, z0 - 0.05, z1 + 0.05, { tile: 2, col: [0.5, 0.5, 0.52] });
        }
        break;
      }
      case 'piperack': {
        const n = 4, d = 0.42;
        for (let i = 0; i < n; i++) {
          const pz = z0 + 0.4 + i * (z1 - z0 - 0.8) / (n - 1);
          pipe(i % 2 ? 'rusty_metal_02@rv' : 'blue_metal_plate@rv', [x0, y0 + 0.36, pz], [x1, y0 + 0.36, pz], d);
          for (let px = x0 + 1; px < x1; px += 3) pipe('metal_plate_02', [px, y0 + 0.36, pz], [px + 0.14, y0 + 0.36, pz], d + 0.12, [0.5, 0.5, 0.5]);
        }
        for (let px = x0 + 0.6; px < x1; px += 3.7) batch.g('metal_plate_02').box(px - 0.08, px + 0.08, y0, y0 + 0.12, z0, z1, { tile: 2, col: [0.45, 0.45, 0.46] });
        break;
      }
      case 'crates': {
        const P = props.piece('crate'), sc = (y1 - y0) / P.size.y, len = x1 - x0;
        const n = Math.max(1, Math.round(len / (P.size.z * sc))), sl = len / (n * P.size.z);
        for (let i = 0; i < n; i++) props.add('crate', _m.compose(new THREE.Vector3(x0 + (i + 0.5) * len / n, y0, cz), _q.setFromAxisAngle(UP, Math.PI / 2 + (i % 2 ? Math.PI : 0)), new THREE.Vector3((z1 - z0) / P.size.x, sc, sl * 0.985)), s.rv ? 'rv' : '');
        break;
      }
      case 'billboard': {
        const len = z1 - z0, h = y1 - y0 - 0.5;
        batch.g('metal_plate_02').box(x0, x1, y0, y1, z0, z1, { tile: 2, col: [0.42, 0.43, 0.46] });
        const art = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.5, h - 0.3), billboardMaterial(7 + (s.art || 0), (len - 0.5) / (h - 0.3)));
        art.position.set(s.face > 0 ? x1 + 0.03 : x0 - 0.03, (y0 + y1) / 2 + 0.2, cz); art.rotation.y = s.face > 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(art);
        for (let pz = z0 + 0.6; pz < z1; pz += (len - 1.2) / 4) {
          const bx = s.face > 0 ? x0 - 0.5 : x1 + 0.5;
          strut('metal_plate_02', [bx, y0 - 0.2, pz], [bx, y1, pz], 0.2, [0.3, 0.3, 0.32]);
          strut('metal_plate_02', [bx, y1 - 0.5, pz], [(x0 + x1) / 2, y1 - 0.5, pz], 0.12, [0.3, 0.3, 0.32]);
          strut('metal_plate_02', [bx - (s.face > 0 ? 1.4 : -1.4), y0 - 0.2, pz], [bx, y0 + 3.4, pz], 0.12, [0.3, 0.3, 0.32]);
        }
        break;
      }
      case 'ramp': {
        const a = s.ramp.a, b = s.ramp.b, key = 'corrugated_iron_02', t = 1 / TILE[key];
        const sl = Math.hypot(z1 - z0, b - a);
        batch.g(key).quad([x0, b, z1], [x1, b, z1], [x1, a, z0], [x0, a, z0], [x0 * t, 0, x1 * t, 0, x1 * t, sl * t, x0 * t, sl * t], [0.95, 0.9, 0.86]);
        // walls under the slope
        const f = assets.facades.Facade020A, g = batch.g('Facade020A'), th = f.tile[1], u1 = Math.round((z1 - z0) / (f.tile[0] / f.cols)) / f.cols;
        g.quad([x0, 0, z0], [x0, 0, z1], [x0, b, z1], [x0, a, z0], [0, -b / th, u1, -b / th, u1, 0, 0, (a - b) / th]);
        g.quad([x1, 0, z1], [x1, 0, z0], [x1, a, z0], [x1, b, z1], [0, -b / th, u1, -b / th, u1, (a - b) / th, 0, 0]);
        const u2 = Math.round((x1 - x0) / (f.tile[0] / f.cols)) / f.cols;
        g.quad([x1, 0, z0], [x0, 0, z0], [x0, a, z0], [x1, a, z0], [0, -a / th, u2, -a / th, u2, 0, 0, 0]);
        // lip + guide stripes for runner's vision
        batch.g('concrete_wall_008@rv').box(x0, x1, a - 0.2, a + 0.04, z0 - 0.06, z0 + 0.5, { tile: 3 });
        for (const px of [x0 + 0.15, x1 - 0.45]) {
          const y = (z) => a + (b - a) * (z - z0) / (z1 - z0) + 0.03;
          batch.g('concrete_wall_008@rv').quad([px, y(z1), z1], [px + 0.3, y(z1), z1], [px + 0.3, y(z0), z0], [px, y(z0), z0], [0, 0, 0.1, 0, 0.1, 4, 0, 4]);
        }
        break;
      }
      case 'plank': {
        batch.g('weathered_brown_planks@rv').box(x0, x1, y0, y1, z0, z1, { tile: 2 });
        // scaffold frame down the wall + guard rail on the open side
        const c = [0.62, 0.63, 0.66];
        for (const pz of [z0 + 0.15, cz, z1 - 0.15]) {
          pipe('metal_plate_02', [x0 + 0.1, y0 - 14, pz], [x0 + 0.1, y1 + 1.1, pz], 0.07, c);
          pipe('metal_plate_02', [x1 - 0.1, y0 - 14, pz], [x1 - 0.1, y1 + 2.2, pz], 0.07, c);
          pipe('metal_plate_02', [x0 + 0.1, y0 - 0.1, pz], [x1 - 0.1, y0 - 0.1, pz], 0.07, c);
        }
        pipe('metal_plate_02', [x0 + 0.1, y1 + 1.05, z0 + 0.15], [x0 + 0.1, y1 + 1.05, z1 - 0.15], 0.06, c);
        pipe('metal_plate_02', [x0 + 0.1, y1 + 0.55, z0 + 0.15], [x0 + 0.1, y1 + 0.55, z1 - 0.15], 0.06, c);
        pipe('metal_plate_02', [x0 + 0.1, y0 - 6, z0 + 0.15], [x0 + 0.1, y0 - 0.2, z1 - 0.15], 0.05, c);
        pipe('metal_plate_02', [x1 - 0.1, y0 - 6, z1 - 0.15], [x1 - 0.1, y0 - 0.2, z0 + 0.15], 0.05, c);
        break;
      }
      case 'beam': {
        batch.g('rusty_metal_02#yellow@rv').box(x0, x1, y0, y1, z0, z1, { tile: 2 });
        const c = [1, 1, 1], yb = y0 - 1.5;
        for (const px of [x0 + 0.08, x1 - 0.08]) strut('rusty_metal_02#yellow', [px, yb, z0], [px, yb, z1], 0.12, c);
        for (let z = z0, i = 0; z < z1 - 0.1; z += 2.1, i++) {
          const zn = Math.min(z1, z + 2.1);
          for (const px of [x0 + 0.08, x1 - 0.08]) { strut('rusty_metal_02#yellow', [px, yb, i % 2 ? z : zn], [px, y0, i % 2 ? zn : z], 0.07, c); strut('rusty_metal_02#yellow', [px, yb, z], [px, y0, z], 0.07, c); }
          strut('rusty_metal_02#yellow', [x0, yb, z], [x1, yb, z], 0.07, c);
        }
        break;
      }
      case 'prop': {
        const key = s.model === 'aircon' && r() < 0.4 ? 'airconRusted' : s.model;
        props.place(key, s.px, s.py, s.pz, s.rot * Math.PI / 2 + (r() < 0.5 ? Math.PI : 0), s.scale);
        break;
      }
      case 'tank': kit.tank(cx, y0, cz, (y1 - y0) / 5.8); break;
      case 'bulkhead': {
        batch.g('red_brick_03').box(x0, x1, y0, y1, z0, z1, { tile: TILE.red_brick_03, col: [0.9, 0.86, 0.84] });
        batch.g('metal_plate_02').box(x0 - 0.15, x1 + 0.15, y1, y1 + 0.16, z0 - 0.15, z1 + 0.15, { tile: 2 });
        batch.g('blue_metal_plate').box(cx - 0.55, cx + 0.55, y0, y0 + 2.1, z0 - 0.05, z0 + 0.02, { tile: 2, col: [0.5, 0.55, 0.6] });
        break;
      }
      case 'acplant': {
        batch.g('blue_metal_plate').box(x0, x1, y0 + 0.15, y1, z0, z1, { tile: 2, col: [0.78, 0.8, 0.84] });
        batch.g('metal_plate_02').box(x0 + 0.12, x1 - 0.12, y0, y0 + 0.15, z0 + 0.12, z1 - 0.12, { tile: 2, col: [0.3, 0.3, 0.3], faces: 'xXzZ' });
        const fan = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
        for (let pz = z0 + 0.7; pz < z1 - 0.3; pz += 1.25) batch.g('metal_plate_02').mesh(fan, _m.compose(new THREE.Vector3(cx, y1 + 0.05, pz), _q.identity(), new THREE.Vector3(Math.min(1, (x1 - x0) / 1.3), 1, 1)), [0.16, 0.16, 0.17]);
        break;
      }
      case 'vent': {
        pipe('metal_plate_02', [cx, y0, cz], [cx, y1 - 0.2, cz], 0.5, [0.75, 0.76, 0.78]);
        batch.g('metal_plate_02').mesh(new THREE.ConeGeometry(0.42, 0.28, 12), _m.makeTranslation(cx, y1 - 0.06, cz), [0.7, 0.71, 0.73]);
        break;
      }
      case 'zipmast': {
        const [ax, ay, az] = s.anchor, c = [0.5, 0.5, 0.53];
        batch.g('metal_plate_02').box(x0, x1, y0, y1, z0, z1, { tile: 2, col: c });
        strut('metal_plate_02', [cx, y1 - 0.25, cz], [ax, ay + 0.12, az], 0.14, c);
        strut('metal_plate_02', [cx, y0 + 1.2, cz], [ax + (cx - ax) * 0.3, ay + 0.1, az], 0.08, c);
        batch.g('concrete_wall_008@rv').box(x0 - 0.06, x1 + 0.06, y0, y0 + 0.5, z0 - 0.06, z1 + 0.06, { tile: 3 });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- runner's vision markers
  for (const p of level.rvPanels) {
    const g = batch.g('painted_plaster_wall@rv'), x = p.at + p.n * 0.035;
    g.box(Math.min(p.at, x), Math.max(p.at, x), p.y0, p.y1, p.a, p.b, { tile: 3 });
  }
  for (const e of level.rvEdges) {
    const g = batch.g('concrete_wall_008@rv'), d = e.thin ? 0.12 : 0.34;
    g.box(e.a, e.b, e.y - d, e.y + 0.035, e.at - 0.3, e.at + 0.05, { tile: 3 });
  }

  // ---------------------------------------------------------------- loose decor
  for (const d of level.decor) if (d.type === 'antenna') kit.antenna(d.x, d.y, d.z, d.h);

  // ---------------------------------------------------------------- ziplines
  for (const z of level.zips) {
    const cable = new THREE.Mesh(tube, mats.registerRV(mats.plain('flat#0x26282c').clone(), 1.1));
    cable.applyMatrix4(between(z.a, z.b, 0.07));
    cable.castShadow = true;
    scene.add(cable);
  }

  // ---------------------------------------------------------------- cables strung between roofs
  const cableMat = mats.plain('flat#0x16171a');
  const sag = (p, q, drop) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector3(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - Math.sin(Math.PI * t) * drop, p[2] + (q[2] - p[2]) * t)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.028, 5), cableMat);
    m.castShadow = true; scene.add(m);
  };
  const cr = level.roofs.filter(b => !b.noBody && !b.wall && !b.tier);
  for (let i = 0; i + 1 < cr.length; i++) {
    const a = cr[i], b = cr[i + 1], side = i % 2 ? 1 : -1;
    const ax = side > 0 ? a.x1 - 0.5 : a.x0 + 0.5, bx = side > 0 ? b.x1 - 0.5 : b.x0 + 0.5;
    if (Math.abs(a.z0 - b.z1) > 30) continue;
    strut('metal_plate_02', [ax, a.y1, a.z0 + 0.6], [ax, a.y1 + 3.2, a.z0 + 0.6], 0.12, [0.35, 0.35, 0.37]);
    strut('metal_plate_02', [bx, b.y1, b.z1 - 0.6], [bx, b.y1 + 3.2, b.z1 - 0.6], 0.12, [0.35, 0.35, 0.37]);
    sag([ax, a.y1 + 3.1, a.z0 + 0.6], [bx, b.y1 + 3.1, b.z1 - 0.6], 1.2);
    sag([ax, a.y1 + 2.7, a.z0 + 0.6], [bx, b.y1 + 2.7, b.z1 - 0.6], 1.7);
  }
  sag([-24, 77, -170], [-60, 58, -120], 5); sag([30, 79, -205], [70, 96, -240], 6); sag([24, 75, -244], [58, 60, -300], 5);
  sag([36, 73, -480], [84, 60, -470], 6); sag([-14, 50, -590], [-70, 44, -560], 5);

  // ---------------------------------------------------------------- fire escapes + drain pipes on the big walls
  const fe = assets.models.modular_fire_escape.scene;
  const escapes = [[-7.2, 67.4, -161.95, 0], [17, 68, -193.95, 0], [-11, 66.5, -227.95, 0], [27, 55, -469.95, 0], [-24.05, 68, -172, -Math.PI / 2]];
  for (const [x, y, z, rot] of escapes) {
    const o = fe.clone(true);
    o.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; } });
    o.position.set(x, y, z); o.rotation.y = rot; o.scale.setScalar(1.15);
    scene.add(o);
  }
  const PS = props.piece('pipeStraight');
  for (const b of level.roofs.filter(q => q.wall)) {
    for (const px of [b.x0 + 1.2, b.x1 - 1.4]) for (let y = 30; y < b.y1 - 2; y += PS.size.y * 2.2) props.place('pipeStraight', px, y, b.z1 + 0.16, 0, 2.2);
  }

  // ---------------------------------------------------------------- tower cranes (instanced lattice)
  const crane = [];
  const bar = (p, q, t) => crane.push(between(p, q, t));
  const buildCrane = (bx, by, bz, H, jib, ang) => {
    const w = 1.0, seg = 3;
    for (let y = 0; y < H; y += seg) {
      const y1 = by + y, y2 = by + y + seg;
      for (const [sx, sz] of [[-w, -w], [w, -w], [w, w], [-w, w]]) bar([bx + sx, y1, bz + sz], [bx + sx, y2, bz + sz], 0.16);
      const c = [[-w, -w], [w, -w], [w, w], [-w, w]];
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; bar([bx + a[0], y2, bz + a[1]], [bx + b[0], y2, bz + b[1]], 0.09); bar([bx + a[0], y1, bz + a[1]], [bx + b[0], y2, bz + b[1]], 0.08); }
    }
    const top = by + H, dx = Math.cos(ang), dz = Math.sin(ang), nx = -dz, nz = dx;
    const P = (t, side, up) => [bx + dx * t + nx * side, top + up, bz + dz * t + nz * side];
    for (let t = -14; t < jib; t += 3) {
      const t2 = Math.min(jib, t + 3);
      bar(P(t, -0.7, 0), P(t2, -0.7, 0), 0.14); bar(P(t, 0.7, 0), P(t2, 0.7, 0), 0.14); bar(P(t, 0, 1.5), P(t2, 0, 1.5), 0.14);
      bar(P(t, -0.7, 0), P(t2, 0, 1.5), 0.07); bar(P(t, 0.7, 0), P(t2, 0, 1.5), 0.07); bar(P(t, -0.7, 0), P(t, 0.7, 0), 0.07); bar(P(t, 0, 1.5), P(t2, -0.7, 0), 0.06);
    }
    bar(P(0, 0, 1.5), P(0, 0, 8), 0.22); bar(P(0, 0, 8), P(jib * 0.72, 0, 1.5), 0.05); bar(P(0, 0, 8), P(-13, 0, 1.5), 0.05);
    batch.g('concrete_wall_008').mesh(unitBox, _m.compose(new THREE.Vector3(...P(-11.5, 0, -0.9)), _q.setFromAxisAngle(UP, -ang), new THREE.Vector3(4, 1.8, 1.8)), [0.6, 0.6, 0.6]);
    batch.g('blue_metal_plate').mesh(unitBox, _m.compose(new THREE.Vector3(...P(1.6, 1.3, -1.1)), _q.setFromAxisAngle(UP, -ang), new THREE.Vector3(2, 2, 1.6)), [0.9, 0.9, 0.9]);
    const hk = P(jib * 0.6, 0, 0);
    bar(hk, [hk[0], hk[1] - 16, hk[2]], 0.03);
    batch.g('rusty_metal_02#yellow').mesh(unitBox, _m.makeTranslation(hk[0], hk[1] - 16.4, hk[2]).scale(new THREE.Vector3(0.5, 0.8, 0.5)));
  };
  buildCrane(21, 62, -531, 30, 46, 2.2);
  buildCrane(-78, 44, -330, 46, 52, 0.5);
  buildCrane(96, 38, -90, 60, 56, 2.9);
  const cm = new THREE.InstancedMesh(unitBox, mats.plain('rusty_metal_02#yellow'), crane.length);
  crane.forEach((m, i) => cm.setMatrixAt(i, m));
  cm.castShadow = true; cm.receiveShadow = true; cm.computeBoundingSphere(); scene.add(cm);

  // ---------------------------------------------------------------- checkpoints + finish beacon
  const beamMat = (color, power) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: power } },
    // vNear fades the beam out as the camera walks into it, so it never washes out the view
    vertexShader: `varying vec2 vUv; varying float vNear;
      void main(){ vUv = uv; vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vNear = smoothstep(2.2, 9.0, length(cameraPosition.xz - c.xz));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uPower; varying vec2 vUv; varying float vNear;
      void main(){ float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6); a *= 0.55 + 0.45 * sin(vUv.y * 26.0 - uTime * 5.0); gl_FragColor = vec4(uColor * uPower, a * 0.5 * vNear); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  });
  const cps = level.cps.map((c) => {
    const g = new THREE.Group(); g.position.set(c.x, c.y, c.z);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x0a1a1c, emissive: new THREE.Color(0.1, 0.95, 1.0), emissiveIntensity: 3.2, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.045, 8, 48), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.03, 8, 40), ringMat); ring2.position.y = 1.3;
    const bm = beamMat(0x35e6ff, 2.2);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 9, 24, 1, true), bm); beam.position.y = 4.5;
    g.add(ring, ring2, beam);
    if (c.index === 0) g.visible = false;
    scene.add(g);
    return { g, ring, ring2, beam, ringMat, bm, reached: c.index === 0, pulse: 0, s2: c.index === 0 ? 0 : 1 };
  });
  const f = level.finish;
  const fin = new THREE.Group(); fin.position.set(f.x, f.y, f.z);
  const finMat = beamMat(0xffd27a, 3.4);
  const finBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 120, 28, 1, true), finMat); finBeam.position.y = 60;
  const finRingMat = new THREE.MeshStandardMaterial({ color: 0x201608, emissive: new THREE.Color(1.0, 0.72, 0.3), emissiveIntensity: 4, roughness: 0.3 });
  const finRings = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.TorusGeometry(1.5 - i * 0.28, 0.05, 8, 48), finRingMat); m.position.y = 1.2 + i * 0.5; fin.add(m); return m; });
  // beacon mast behind the pad
  batch.g('metal_plate_02').box(f.x - 0.2, f.x + 0.2, f.y, f.y + 9, -608.6, -608.2, { tile: 2 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), finRingMat); lamp.position.set(0, 9.3, -608.4 - f.z); fin.add(lamp);
  fin.add(finBeam); scene.add(fin);

  return {
    cps,
    setReached(i) { const c = cps[i]; if (!c || c.reached) return; c.reached = true; c.pulse = 1; },
    resetCheckpoints() { cps.forEach((c, i) => { c.reached = i === 0; c.pulse = 0; c.s2 = i === 0 ? 0 : 1; }); },
    update(dt, time) {
      for (const c of cps) {
        c.pulse = Math.max(0, c.pulse - dt * 1.4);
        c.ring2.rotation.y = time * 1.4; c.ring2.rotation.x = Math.sin(time * 0.9) * 0.5;
        c.ring2.position.y = 1.3 + Math.sin(time * 2) * 0.12;
        const k = c.reached ? 0.14 + c.pulse * 3 : 1;
        c.ringMat.emissiveIntensity = 3.2 * k; c.bm.uniforms.uPower.value = 2.2 * k; c.bm.uniforms.uTime.value = time;
        c.ring.scale.setScalar(1 + c.pulse * 0.8);
        // the floating inner ring is collected: it shrinks away once the checkpoint is taken
        c.s2 += ((c.reached ? 0 : 1) - c.s2) * Math.min(1, dt * 7);
        c.ring2.visible = c.s2 > 0.02; c.ring2.scale.setScalar(Math.max(0.02, c.s2));
      }
      finMat.uniforms.uTime.value = time;
      finRings.forEach((m, i) => { m.rotation.x = time * (0.7 + i * 0.4); m.rotation.z = time * (0.5 + i * 0.3); });
      if (kit.beacons) kit.beacons.material.opacity = 0.55 + 0.45 * Math.sin(time * 3.2);
    },
  };
}
