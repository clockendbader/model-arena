// ---------------------------------------------------------------------------
// Background city: block grid of towers around the course, rooftop clutter,
// cranes, glowing billboards, cables between buildings, the street far below
// and aviation lights. All static geometry goes into the StaticBatch.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { boxGeo, tubeBetween } from './geometry.js';
import { waterTank, antenna, vent, shed, crane, billboard, sagCable, scaffold } from './props.js';
import { makeBillboardTexture } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function buildCity(ctx, level) {
  const { scene, mats: m, world, batch } = ctx;
  const rand = rng(1337);
  const R = (a, b) => a + (b - a) * rand();
  const lights = [...level.lights];
  const panels = [];
  const fps = level.footprints;

  // corridor around the course where background buildings must stay low
  const blocked = (x0, x1, z0, z1, margin) => fps.some((f) => x1 > f.x0 - margin && x0 < f.x1 + margin && z1 > f.z0 - margin && z0 < f.z1 + margin);
  // the route's air space (gaps the player jumps across) also stays clear
  const routeBoxes = [
    [-8, 12, -380, 14], [-80, -2, -232, -196], [-80, -56, -380, -196],
  ];
  const inRoute = (x0, x1, z0, z1) => routeBoxes.some(([a, b, c, d]) => x1 > a && x0 < b && z1 > c && z0 < d);

  const facades = [m.facadeBrick, m.facadeConcrete, m.facadePlaster, m.facadeTower, m.facadeTowerWarm];
  const roofTops = [];

  // ---- grid of blocks ------------------------------------------------------
  const BLOCK = 44, STREET = 14;
  for (let bx = -10; bx <= 8; bx++) {
    for (let bz = -17; bz <= 7; bz++) {
      const X0 = bx * (BLOCK + STREET) + 9, Z0 = bz * (BLOCK + STREET) + 3;
      // subdivide block into 1-4 lots
      const lots = [];
      const split = rand();
      if (split < 0.3) lots.push([X0, X0 + BLOCK, Z0, Z0 + BLOCK]);
      else if (split < 0.65) {
        const s = R(0.35, 0.65) * BLOCK;
        lots.push([X0, X0 + s - 1, Z0, Z0 + BLOCK], [X0 + s + 1, X0 + BLOCK, Z0, Z0 + BLOCK]);
      } else {
        const sx = R(0.35, 0.65) * BLOCK, sz = R(0.35, 0.65) * BLOCK;
        lots.push([X0, X0 + sx - 1, Z0, Z0 + sz - 1], [X0 + sx + 1, X0 + BLOCK, Z0, Z0 + sz - 1],
          [X0, X0 + sx - 1, Z0 + sz + 1, Z0 + BLOCK], [X0 + sx + 1, X0 + BLOCK, Z0 + sz + 1, Z0 + BLOCK]);
      }
      for (const [x0, x1, z0, z1] of lots) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const dist = Math.hypot(cx + 35, cz + 180);
        let near = blocked(x0, x1, z0, z1, 3) || inRoute(x0, x1, z0, z1);
        // skyline: taller towers in a downtown cluster ahead of the run
        const downtown = Math.exp(-((cx + 120) ** 2 + (cz + 520) ** 2) / (2 * 190 * 190));
        const side = Math.exp(-((cx - 160) ** 2 + (cz + 150) ** 2) / (2 * 120 * 120));
        let h = R(22, 55) + downtown * R(60, 150) + side * R(20, 70);
        if (dist > 520) h *= 0.8;
        if (near) h = Math.min(h, R(10, 22));
        if (h < 6) continue;
        const fac = facades[Math.floor(rand() * facades.length)];
        const tall = h > 80;
        const bay = fac.userData.winUniforms.uWinSize.value.x;
        const seed = rand() * 100;
        const facU = tall ? (rand() < 0.6 ? m.facadeTower : m.facadeTowerWarm) : fac;
        const bayU = facU.userData.winUniforms.uWinSize.value.x;
        if (tall && rand() < 0.6) {
          // setback tower
          const ins = R(3, 7);
          const h1 = h * R(0.45, 0.65);
          batch.add(boxGeo(x0, 0, z0, x1, h1, z1, { win: true, seed, bay }), fac);
          batch.box(x0 - 0.2, h1, z0 - 0.2, x1 + 0.2, h1 + 0.6, z1 + 0.2, m.plaster);
          batch.add(boxGeo(x0 + ins, h1 + 0.6, z0 + ins, x1 - ins, h, z1 - ins, { win: true, seed: seed + 1, bay: bayU, baseY: h1 + 0.6 }), facU);
          batch.box(x0 + ins - 0.2, h, z0 + ins - 0.2, x1 - ins + 0.2, h + 1.2, z1 - ins + 0.2, m.metalDark);
          world.addBox(x0, 0, z0, x1, h1 + 0.6, z1);
          world.addBox(x0 + ins, 0, z0 + ins, x1 - ins, h + 1.2, z1 - ins);
          roofTops.push({ x0: x0 + ins, x1: x1 - ins, z0: z0 + ins, z1: z1 - ins, y: h + 1.2, tall: true });
          roofTops.push({ x0, x1, z0, z1: z0 + ins - 0.5, y: h1 + 0.6, ring: true });
        } else {
          batch.add(boxGeo(x0, 0, z0, x1, h, z1, { win: true, seed, bay: tall ? bayU : bay }), tall ? facU : fac);
          batch.box(x0 - 0.18, h, z0 - 0.18, x1 + 0.18, h + 0.5, z1 + 0.18, m.plaster);
          batch.box(x0, h + 0.5, z0, x1, h + 0.62, z1, m.roofTar, { cast: false });
          world.addBox(x0, 0, z0, x1, h + 0.62, z1);
          roofTops.push({ x0, x1, z0, z1, y: h + 0.62, tall });
          // parapet ring for medium buildings
          if (!near && rand() < 0.5) {
            const t = 0.3, ph = 0.9;
            const yy = h + 0.62;
            batch.box(x0, yy, z0, x1, yy + ph, z0 + t, m.plaster);
            batch.box(x0, yy, z1 - t, x1, yy + ph, z1, m.plaster);
            batch.box(x0, yy, z0, x0 + t, yy + ph, z1, m.plaster);
            batch.box(x1 - t, yy, z0, x1, yy + ph, z1, m.plaster);
          }
        }
        // floor bands on mid-rises
        if (!tall && rand() < 0.6) {
          for (let y = 10.2; y < h - 3; y += 13.6) batch.box(x0 - 0.1, y, z0 - 0.1, x1 + 0.1, y + 0.28, z1 + 0.1, m.plaster, { cast: false });
        }
      }
    }
  }

  // ---- rooftop clutter on background buildings -------------------------------
  for (const r of roofTops) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w < 6 || d < 6 || r.ring) continue;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const n = Math.floor(R(1, 5));
    for (let i = 0; i < n; i++) {
      const px = R(r.x0 + 2.5, r.x1 - 2.5), pz = R(r.z0 + 2.5, r.z1 - 2.5);
      const t = rand();
      if (t < 0.22) waterTank(batch, m, px, r.y, pz, R(1.3, 2.0), R(2.6, 3.6), R(1.6, 2.6));
      else if (t < 0.6) vent(batch, m, px, r.y, pz, R(1.2, 3.5), R(0.9, 1.8), R(1.2, 3.5));
      else if (t < 0.78) shed(batch, m, px - 1.5, pz - 1.2, px + 1.5, pz + 1.2, r.y, 2.6);
      else if (t < 0.9 && r.y > 40) lights.push(antenna(batch, m, px, r.y, pz, R(6, 16), 0.6));
      else batch.box(px - 2, r.y, pz - 0.9, px + 2, r.y + 1.4, pz + 0.9, m.corrugated);
    }
    if (r.tall && rand() < 0.7) lights.push(antenna(batch, m, cx, r.y, cz, R(10, 24), 0.9));
  }

  // ---- cranes ------------------------------------------------------------------
  const craneSpots = [
    [48, 0, -150, 104, 38, 2.4],
    [-130, 0, -300, 112, 46, 0.6],
    [60, 0, -330, 120, 52, -2.2],
    [-170, 0, -80, 100, 44, 1.2],
    [-10, 0, -470, 130, 55, -0.9],
  ];
  for (const [x, y, z, h, jib, rot] of craneSpots) lights.push(crane(batch, m, x, y, z, h, jib, rot));

  // ---- billboards on rooftops facing the route -------------------------------------
  const bbSpots = [
    [18, 52, -60, 16, 7, -Math.PI / 2],
    [-24, 46, -140, 14, 6, Math.PI / 2],
    [30, 54, -230, 18, 8, -Math.PI / 2 + 0.3],
    [-100, 40, -200, 16, 7, Math.PI / 2],
    [-40, 48, -300, 14, 6.5, -Math.PI / 2],
    [-110, 52, -360, 18, 8, Math.PI / 2 - 0.2],
    [-60, 60, -430, 22, 9, 0],
  ];
  bbSpots.forEach(([x, y, z, w, h, rot], i) => {
    const tex = makeBillboardTexture(i + 3);
    const panel = billboard(batch, m, tex, x, y, z, w, h, rot);
    scene.add(panel);
    panels.push(panel);
    // a pillar under it so it is never floating
    batch.box(x - 2, 0, z - 2, x + 2, y, z + 2, m.concrete);
    world.addBox(x - 2, 0, z - 2, x + 2, y, z + 2);
  });

  // ---- cables strung between course buildings and neighbours -----------------------
  const cablePairs = [
    [V(7, 50.8, -10), V(14, 44, -30)],
    [V(-7, 50.9, -24), V(-6, 50.9, -42)],
    [V(-6.5, 50.5, -60), V(-20, 40, -66)],
    [V(6, 46, -88), V(18, 52, -100)],
    [V(-5, 41.8, -130), V(-20, 46, -138)],
    [V(-7, 46.2, -210), V(-18, 20, -205)],
    [V(-58, 35, -205), V(-40, 19.6, -210)],
    [V(-59, 34.5, -240), V(-40, 30, -250)],
    [V(-77.6, 40, -268), V(-62, 36, -283)],
    [V(-61, 43, -350), V(-40, 36, -360)],
  ];
  for (const [a, b] of cablePairs) sagCable(batch, m, a, b, a.distanceTo(b) * 0.06);
  // telephone-wire style bundles across streets
  for (let i = 0; i < 26; i++) {
    const a = roofTops[Math.floor(rand() * roofTops.length)], b = roofTops[Math.floor(rand() * roofTops.length)];
    if (!a || !b || a === b) continue;
    const pa = V(a.x1, a.y + 0.6, (a.z0 + a.z1) / 2), pb = V(b.x0, b.y + 0.6, (b.z0 + b.z1) / 2);
    const d = pa.distanceTo(pb);
    if (d < 12 || d > 70) continue;
    sagCable(batch, m, pa, pb, d * 0.07, 0.03);
  }

  // ---- street level --------------------------------------------------------------
  const street = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), m.asphalt);
  street.rotation.x = -Math.PI / 2;
  street.receiveShadow = true;
  const uv = street.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2400, uv.getY(i) * 2400);
  scene.add(street);

  // street lights + car lights as glowing instanced dots far below (read through haze)
  const dotGeo = new THREE.SphereGeometry(0.35, 6, 4);
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.6) });
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.4, 0.2) });
  const dots = [];
  for (let bx = -10; bx <= 9; bx++) {
    const x = bx * (BLOCK + STREET) + 9 - STREET / 2;
    for (let z = -1000; z < 420; z += 22) dots.push([x - 5.5, 6.5, z]);
  }
  for (let bz = -17; bz <= 8; bz++) {
    const z = bz * (BLOCK + STREET) + 3 - STREET / 2;
    for (let x = -600; x < 520; x += 22) dots.push([x, 6.5, z + 5.5]);
  }
  const im = new THREE.InstancedMesh(dotGeo, warm, dots.length);
  const mtx = new THREE.Matrix4();
  dots.forEach((p, i) => { mtx.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, mtx); });
  scene.add(im);

  // aviation lights (blink in update)
  const avi = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), red, lights.length);
  lights.forEach((p, i) => { mtx.makeTranslation(p.x, p.y, p.z); avi.setMatrixAt(i, mtx); });
  scene.add(avi);

  // ---- distant ring of silhouettes for horizon depth -------------------------------
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + R(-0.02, 0.02);
    const rr = R(950, 1250);
    const x = Math.cos(a) * rr - 40, z = Math.sin(a) * rr - 200;
    const w = R(30, 80), h = R(40, 200);
    batch.add(boxGeo(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, { win: true, seed: i, bay: 1.6 }), m.facadeTower, { cast: false });
  }

  return { panels, aviation: avi, aviMat: red };
}
