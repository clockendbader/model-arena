// ---------------------------------------------------------------------------
// Level: the handcrafted course. Teaches moves in order:
//   run & jump -> vault -> roll -> slide (+ slope boost) -> wall-run ->
//   wall-climb -> ledge grab -> zipline -> final chain -> tower beacon.
// Coordinates in metres. The course heads mostly toward -Z.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { boxGeo, prep, tubeBetween } from './geometry.js';
import { waterTank, antenna, vent, shed, scaffold, billboard, cylinderGeo } from './props.js';
import { makeBillboardTexture } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildLevel(ctx) {
  const { scene, mats: m, world, batch, props, matLib } = ctx;
  const rvGroup = new THREE.Group(); rvGroup.name = 'runnerVision';
  scene.add(rvGroup);
  const dynamic = new THREE.Group(); scene.add(dynamic);
  const footprints = [];          // for keeping background buildings away
  const lights = [];              // aviation light positions
  const rvMeshes = [];

  const rvMat = m.rvEdge;

  // ---- helpers -----------------------------------------------------------
  /** Building with facade, cornice, roof cap and optional parapets. */
  function building(name, x0, x1, z0, z1, top, o = {}) {
    const fac = o.facade || m.facadeConcrete;
    const bay = fac.userData.winUniforms ? fac.userData.winUniforms.uWinSize.value.x : 3;
    const seed = o.seed !== undefined ? o.seed : Math.random() * 100;
    const roofMat = o.roof || m.roof;
    // body
    batch.add(boxGeo(x0, 0, z0, x1, top - 0.7, z1, { win: true, seed, bay }), fac);
    // decorative floor bands every few floors
    if (o.bands !== false) {
      for (let y = 10.2; y < top - 4; y += 13.6) {
        batch.box(x0 - 0.12, y, z0 - 0.12, x1 + 0.12, y + 0.3, z1 + 0.12, m.plaster, { cast: false });
      }
    }
    // cornice
    batch.box(x0 - 0.18, top - 0.7, z0 - 0.18, x1 + 0.18, top - 0.25, z1 + 0.18, o.cornice || m.plaster);
    // roof cap
    batch.box(x0, top - 0.25, z0, x1, top, z1, roofMat);
    world.addBox(x0, 0, z0, x1, top, z1, o.surface || 'concrete', name);
    footprints.push({ x0, x1, z0, z1, top });
    // parapets: {n: h, s: h, e: h, w: h}, optional segments [{side, a, b, h}]
    const P = o.parapet || {};
    const t = 0.32;
    const par = (bx0, bz0, bx1, bz1, h) => {
      batch.box(bx0, top, bz0, bx1, top + h, bz1, m.plaster);
      batch.box(bx0 - 0.04, top + h, bz0 - 0.04, bx1 + 0.04, top + h + 0.06, bz1 + 0.04, m.metalDark, { cast: false });
      world.addBox(bx0, top, bz0, bx1, top + h + 0.06, bz1, 'concrete', 'parapet');
    };
    if (P.e) par(x1 - t, z0, x1, z1, P.e);
    if (P.w) par(x0, z0, x0 + t, z1, P.w);
    if (P.n) par(x0, z0, x1, z0 + t, P.n);   // n = -Z side
    if (P.s) par(x0, z1 - t, x1, z1, P.s);   // s = +Z side
    for (const seg of o.segments || []) {
      if (seg.side === 'e') par(x1 - t, seg.a, x1, seg.b, seg.h);
      if (seg.side === 'w') par(x0, seg.a, x0 + t, seg.b, seg.h);
      if (seg.side === 'n') par(seg.a, z0, seg.b, z0 + t, seg.h);
      if (seg.side === 's') par(seg.a, z1 - t, seg.b, z1, seg.h);
    }
    // vertical drain pipes for facade detail
    if (o.pipes !== false) {
      const px = x0 + (x1 - x0) * 0.27;
      batch.add(tubeBetween(V(px, 0, z1 + 0.18), V(px, top - 0.7, z1 + 0.18), 0.09, 8), m.metalDark);
      const pz = z0 + (z1 - z0) * 0.6;
      batch.add(tubeBetween(V(x0 - 0.18, 0, pz), V(x0 - 0.18, top - 0.7, pz), 0.09, 8), m.metalDark);
    }
  }

  /** Glowing edge strip for runner's vision (no collision). */
  function rvStrip(x0, y0, z0, x1, y1, z1) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    const mesh = new THREE.Mesh(g, rvMat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    rvGroup.add(mesh);
  }
  /** Gameplay obstacle: own mesh so runner's vision can tint it. */
  function obstacle(x0, y0, z0, x1, y1, z1, mat, surface = 'concrete') {
    const mesh = new THREE.Mesh(boxGeo(x0, y0, z0, x1, y1, z1), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    dynamic.add(mesh);
    world.addBox(x0, y0, z0, x1, y1, z1, surface, 'obstacle');
    matLib.markRunnerVision(mesh);
    return mesh;
  }
  /** Pipe obstacle running along X with box collider and supports. */
  function pipeX(x0, x1, yBottom, z, r, mat) {
    const mesh = new THREE.Mesh(tubeBetween(V(x0, yBottom + r, z), V(x1, yBottom + r, z), r, 16, 1), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    dynamic.add(mesh);
    matLib.markRunnerVision(mesh);
    world.addBox(x0, yBottom, z - r, x1, yBottom + 2 * r, z + r, 'metal', 'obstacle');
    return mesh;
  }
  /** Sloped roof (ramp) along Z with building under it. */
  function rampBuilding(x0, x1, z0, z1, h0, h1) {
    const lo = Math.min(h0, h1);
    batch.add(boxGeo(x0, 0, z0, x1, lo - 0.5, z1, { win: true, seed: 3, bay: 2.6 }), m.facadeConcrete);
    // wedge (triangular prism) + slab
    const g = new THREE.BufferGeometry();
    const yb = lo - 0.5;
    const p = [
      // top slope quad
      x0, h0, z0, x1, h0, z0, x1, h1, z1, x0, h1, z1,
      // side -X
      x0, yb, z0, x0, h0, z0, x0, h1, z1, x0, yb, z1,
      // side +X
      x1, yb, z1, x1, h1, z1, x1, h0, z0, x1, yb, z0,
      // end faces
      x0, yb, z0, x1, yb, z0, x1, h0, z0, x0, h0, z0,
      x1, yb, z1, x0, yb, z1, x0, h1, z1, x1, h1, z1,
    ];
    const len = Math.hypot(z1 - z0, h1 - h0);
    const uv = [
      x0, 0, x1, 0, x1, len, x0, len,
      z0, yb, z0, h0, z1, h1, z1, yb,
      z1, yb, z1, h1, z0, h0, z0, yb,
      x0, yb, x1, yb, x1, h0, x0, h0,
      x1, yb, x0, yb, x0, h1, x1, h1,
    ];
    const idx = [];
    for (let q = 0; q < 5; q++) { const b = q * 4; idx.push(b, b + 2, b + 1, b, b + 3, b + 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const mesh = new THREE.Mesh(prep(ng), m.roofTar);
    mesh.castShadow = mesh.receiveShadow = true;
    dynamic.add(mesh);
    matLib.markRunnerVision(mesh);
    world.addRamp(x0, x1, z0, z1, 'z', h0, h1, 0, 'concrete');
    footprints.push({ x0, x1, z0, z1, top: Math.max(h0, h1) });
  }

  // =========================================================================
  // COURSE
  // =========================================================================

  // ---- A: start rooftop ----------------------------------------------------
  building('A', -7, 7, -20, 12, 50, { facade: m.facadeBrick, parapet: { e: 1.0, w: 1.0, s: 1.0 }, seed: 1 });
  rvStrip(-7, 50, -20.12, 7, 50.04, -19.88);
  props.place('aircon', 5.6, 50, -1, -Math.PI / 2, 1, world);
  props.place('airconRust', 5.6, 50, -4, -Math.PI / 2, 1, world);
  waterTank(batch, m, -4.2, 50, 6.5, 1.7, 3.4, 2.4, world);
  lights.push(antenna(batch, m, -5.6, 50, -14, 10, 0.6, world));
  props.place('crate', 4.6, 50, 9.2, 0.3, 1, world, 'concrete');
  props.place('crate', 5.4, 50, 7.8, -0.2, 1, world, 'concrete');
  props.place('utility', -6.4, 50, -4, Math.PI / 2, 1, world);
  for (let i = 0; i < 4; i++) props.place('duct', -3.6 + i * 2.52, 50.0, 10.6, Math.PI / 2, 1, world);
  vent(batch, m, 3.5, 50, -14, 0.9, 0.7, 0.9, world);
  props.place('trash', -5.8, 50, 1.5, 0.4, 1, world);

  // ---- B -----------------------------------------------------------------
  building('B', -6, 6, -44, -23, 50, { facade: m.facadePlaster, parapet: { e: 0.9, w: 0.9 }, seed: 2 });
  rvStrip(-6, 50, -23.12, 6, 50.04, -22.88);
  rvStrip(-6, 50, -44.12, 6, 50.04, -43.88);
  props.place('aircon', -5.0, 50, -30, Math.PI / 2, 1, world);
  props.place('aircon', -5.0, 50, -34, Math.PI / 2, 1, world);
  props.place('powerbox', 5.4, 50.6, -38, -Math.PI / 2, 1, null);
  props.place('barrel', 4.6, 50, -27, 0, 1, world);
  props.place('barrel', 4.9, 50, -28.2, 0, 1, world);

  // ---- C: vault lesson -----------------------------------------------------
  building('C', -6.5, 6.5, -74, -47.5, 49.5, {
    facade: m.facadeConcrete, parapet: { w: 1.1 }, seed: 3,
    segments: [{ side: 'e', a: -68, b: -47.5, h: 1.1 }],
  });
  obstacle(-6.2, 49.5, -56.4, 6.2, 50.5, -55.6, m.concrete);
  obstacle(-6.2, 49.5, -64.6, 6.2, 50.6, -63.4, m.metal, 'metal');
  rvStrip(-6.5, 49.5, -74.12, 6.5, 49.54, -73.88);
  props.place('airconRust', -5.5, 50.6, -60, Math.PI / 2, 0.8, null);
  props.place('box', 5.6, 49.5, -51, 0.3, 1, world);
  props.place('box', 5.5, 49.5, -52, -0.5, 1, world);

  // ---- D: roll landing, slide lesson -----------------------------------------
  building('D', -6, 6, -100, -76.5, 45, { facade: m.facadeBrick, parapet: { e: 1.0, w: 1.0 }, seed: 4 });
  pipeX(-6, 6, 46.0, -86.0, 0.28, m.rust);
  for (const x of [-5.4, 5.4]) { batch.box(x - 0.08, 45, -86.1, x + 0.08, 46.0, -85.9, m.metalDark); }
  obstacle(-6, 46.0, -94, 6, 47.3, -92, m.metal, 'metal');
  for (const x of [-5.6, -2, 2, 5.6]) batch.box(x - 0.1, 45, -93.1, x + 0.1, 46.0, -92.9, m.metalDark);
  // slope
  rampBuilding(-6, 6, -112, -100, 42, 45);
  rvStrip(-6, 41.98, -112.12, 6, 42.03, -111.9);

  // shortcut 1: narrow side roof from C's open corner over the slide lane
  building('D2', 7.5, 11, -98, -74, 47, { facade: m.facadePlaster, parapet: { e: 0.8 }, seed: 14, bands: false });
  props.place('aircon', 9.2, 47, -86, 0, 0.55, world);
  rvStrip(7.5, 47, -98.12, 11, 47.04, -97.88);

  // ---- E: wall-run lesson -----------------------------------------------------
  building('E', -5, 4.6, -140, -117, 41, { facade: m.facadeConcrete, parapet: { w: 1.0 }, seed: 5 });
  building('W1', 4.6, 22, -172, -124, 72, { facade: m.facadeTower, seed: 21, pipes: false });
  rvStrip(4.52, 41.6, -158, 4.58, 42.2, -127);
  rvStrip(4.52, 43.3, -150, 4.58, 43.5, -130);
  rvStrip(-5, 41, -140.12, 4.6, 41.04, -139.88);
  props.place('barrel', -4.0, 41, -122, 0, 1, world);
  props.place('barrel', -3.4, 41, -123, 0.5, 1, world);
  props.place('camera', 4.3, 44.2, -126, Math.PI / 2, 1, null);

  // ---- F: climb lesson ---------------------------------------------------------
  building('F', -5, 4.6, -175, -150.5, 40.5, { facade: m.facadePlaster, parapet: { w: 1.0 }, seed: 6 });
  rvStrip(-5, 40.5, -150.62, 4.6, 40.54, -150.38);
  props.place('crate', -4.0, 40.5, -160, 0, 1, world, 'concrete');
  props.place('utility', -4.4, 40.5, -165, Math.PI / 2, 1, world);

  // ---- G: wall climb target, jump-grab to H ---------------------------------------
  building('G', -6, 6, -200, -175, 44, { facade: m.facadeBrick, parapet: { e: 0.8, w: 0.8 }, seed: 7 });
  rvStrip(-6, 43.82, -174.92, 6, 44.02, -174.86);   // ledge lip
  rvStrip(-6, 44, -200.12, 6, 44.04, -199.88);
  props.place('aircon', 5.0, 44, -184, -Math.PI / 2, 1, world);
  props.place('airconRust', 5.0, 44, -188, -Math.PI / 2, 1, world);
  shed(batch, m, -5.6, -198, -2.8, -194, 44, 2.6, world, 'x');

  // ---- H: zipline platform ------------------------------------------------------------
  building('H', -7, 7, -224, -203, 45.5, { facade: m.facadeConcrete, parapet: { e: 1.0, s: 0 }, seed: 8 });
  rvStrip(-7, 45.32, -202.92, 7, 45.52, -202.86);   // ledge lip to grab
  waterTank(batch, m, 4.0, 45.5, -219, 1.6, 3.0, 2.2, world);
  lights.push(antenna(batch, m, 5.6, 45.5, -207, 8, 0.5, world));
  // safety railing along the back of H
  for (let x = -6.5; x <= 6.6; x += 1.6) batch.add(tubeBetween(V(x, 45.5, -223.7), V(x, 46.6, -223.7), 0.03), m.steel);
  batch.add(tubeBetween(V(-6.6, 46.6, -223.7), V(6.6, 46.6, -223.7), 0.035), m.steel);
  world.addBox(-6.8, 45.5, -223.8, 6.8, 46.65, -223.6, 'metal', 'rail');

  // ---- ziplines ---------------------------------------------------------------------------
  const ziplines = [];
  function zipline(a, b, postSide) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length(); dir.normalize();
    ziplines.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], dir: [dir.x, dir.y, dir.z], len });
    const cable = new THREE.Mesh(tubeBetween(a, b, 0.035, 8), m.steel);
    cable.castShadow = true;
    dynamic.add(cable);
    // posts offset sideways with an arm over the cable end
    for (const [p, base] of [[a, postSide.a], [b, postSide.b]]) {
      const px = p.x + postSide.off[0], pz = p.z + postSide.off[1];
      const post = new THREE.Mesh(cylinderGeo(px, base, pz, 0.14, p.y - base + 0.4, 10), m.paintRed);
      post.castShadow = true; dynamic.add(post);
      matLib.markRunnerVision(post);
      batch.add(tubeBetween(V(px, p.y + 0.3, pz), V(p.x, p.y + 0.3, p.z), 0.07, 8), m.paintRed);
      batch.add(tubeBetween(V(p.x, p.y + 0.3, p.z), V(p.x, p.y, p.z), 0.04, 6), m.steel);
      batch.box(px - 0.4, base, pz - 0.4, px + 0.4, base + 0.12, pz + 0.4, m.metalDark);
      world.addBox(px - 0.16, base, pz - 0.16, px + 0.16, p.y + 0.4, pz + 0.16, 'metal', 'post');
    }
  }
  zipline(V(-5.0, 48.4, -214), V(-61.5, 36.3, -214), { a: 45.5, b: 34, off: [0, -1.3] });

  // gap filler under the zipline (lower roofs far below)
  building('Z1', -40, -18, -232, -196, 19, { facade: m.facadeBrick, seed: 30, parapet: { e: 1, w: 1, n: 1, s: 1 } });
  building('Z2', -54, -43, -228, -200, 14, { facade: m.facadePlaster, seed: 31 });
  building('Z3', -16, -9, -230, -199, 24, { facade: m.facadeConcrete, seed: 32 });

  // ---- I: zipline landing --------------------------------------------------------------
  building('I', -78, -58, -226, -202, 34, { facade: m.facadePlaster, parapet: { w: 1.0, s: 1.0 }, seed: 9 });
  shed(batch, m, -77.6, -210, -73.5, -203.4, 34, 2.7, world, 'x');
  props.place('aircon', -60.6, 34, -222, -Math.PI / 2, 1, world);
  // shortcut 2 access: crate stack to the billboard catwalk
  const crateBox = (x0, y0, z0, x1, y1, z1) => {
    batch.box(x0, y0, z0, x1, y1, z1, m.corrugated);
    batch.box(x0 - 0.03, y1 - 0.06, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, m.metalDark, { cast: false });
    world.addBox(x0, y0, z0, x1, y1, z1, 'metal', 'prop');
  };
  crateBox(-64.6, 34, -222.6, -62.2, 35.0, -221.0);   // step 1 (1.0 m)
  crateBox(-64.6, 34, -224.6, -62.0, 35.9, -222.6);   // step 2 (1.9 m)
  props.place('crate', -60.2, 34, -219.5, 0.4, 1, world, 'concrete');
  rvStrip(-78, 34, -226.12, -58, 34.04, -225.88);

  // ---- J: chain section (vault, slide, vault) ---------------------------------------------
  building('J', -77.6, -59, -262, -229.5, 33.5, {
    facade: m.facadeBrick, parapet: { e: 1.0 }, seed: 10,
    segments: [{ side: 'w', a: -256, b: -229.5, h: 1.0 }],
  });
  obstacle(-77.3, 33.5, -236.4, -59.3, 34.5, -235.6, m.concrete);
  pipeX(-77.3, -59.3, 34.5, -244.0, 0.27, m.rust);
  for (const x of [-76.8, -68, -60]) batch.box(x - 0.08, 33.5, -244.1, x + 0.08, 34.5, -243.9, m.metalDark);
  obstacle(-77.3, 33.5, -251.6, -59.3, 34.6, -250.4, m.metal, 'metal');
  rvStrip(-77.6, 33.5, -262.12, -59, 33.54, -261.88);
  // billboard catwalk shortcut (over the J lane)
  {
    const cy = 36.6;
    batch.box(-63.4, cy - 0.12, -258, -61.6, cy, -224.6, m.metal);
    world.addBox(-63.4, cy - 0.12, -258, -61.6, cy, -224.6, 'metal', 'catwalk');
    for (let z = -256; z <= -226; z += 6) {
      const zz = (z > -238 && z < -233) || (z > -246 && z < -242) || (z > -253 && z < -249) ? z + 2.5 : z;
      if (zz > -229.5 && zz < -226) continue;
      batch.box(-62.6, 33.5, zz - 0.1, -62.4, cy - 0.12, zz + 0.1, m.metalDark);
      world.addBox(-62.6, 33.5, zz - 0.1, -62.4, cy - 0.12, zz + 0.1, 'metal', 'post');
    }
    // railing on outer side
    batch.add(tubeBetween(V(-61.65, cy + 1.0, -258), V(-61.65, cy + 1.0, -224.6), 0.03), m.steel);
    world.addBox(-61.7, cy, -258, -61.6, cy + 1.05, -224.6, 'metal', 'rail');
    for (let z = -258; z <= -224.6; z += 2.4) batch.add(tubeBetween(V(-61.65, cy, z), V(-61.65, cy + 1.0, z), 0.025), m.steel);
    const tex = makeBillboardTexture(2);
    dynamic.add(billboard(batch, m, tex, -61.0, cy - 0.12, -243, 14, 6.5, -Math.PI / 2, 0.6));
    rvStrip(-63.4, cy, -258.1, -61.6, cy + 0.04, -257.9);
  }

  // ---- W2: left wall for the second wall-run ---------------------------------------------
  building('W2', -96, -77.6, -300, -256, 76, { facade: m.facadeTowerWarm, seed: 22, pipes: false });
  rvStrip(-77.58, 34.0, -290, -77.52, 34.6, -260);
  rvStrip(-77.58, 35.8, -282, -77.52, 36.0, -263);

  // ---- K ---------------------------------------------------------------------------------
  building('K', -77.6, -62, -292, -274, 33, { facade: m.facadeConcrete, parapet: { e: 1.0 }, seed: 11 });
  rvStrip(-77.6, 33, -274.12, -62, 33.04, -273.88);
  props.place('barrel', -63.4, 33, -280, 0, 1, world);
  props.place('box', -63.2, 33, -284, 0.2, 1, world);

  // ---- L: climb, then zipline 2 -------------------------------------------------------------
  building('L', -77.6, -60, -312, -292, 36.5, { facade: m.facadePlaster, parapet: { e: 0.9 }, seed: 12 });
  rvStrip(-77.6, 36.32, -291.92, -60, 36.52, -291.86);
  props.place('aircon', -76.4, 36.5, -300, Math.PI / 2, 1, world);
  vent(batch, m, -63, 36.5, -305, 1.0, 0.8, 1.0, world);
  zipline(V(-68.0, 39.4, -309), V(-68.0, 36.35, -335), { a: 36.5, b: 34, off: [1.3, 0] });

  // ---- M + tower T: scaffolding climb to the beacon -----------------------------------------
  building('M', -76, -62, -348, -334, 34, { facade: m.facadeBrick, roof: m.metal, surface: 'metal', parapet: { e: 0.8, w: 0.8 }, seed: 13 });
  building('T', -77, -61, -372, -348, 42, { facade: m.facadeTower, parapet: { e: 0.8, w: 0.8, n: 0.8 }, seed: 23 });
  const tiers = [
    [-76, -72, 36],
    [-70, -66, 38],
    [-64, -61.2, 40],
  ];
  for (const [x0, x1, top] of tiers) {
    const z0 = -348, z1 = -345.6;
    batch.box(x0, top - 0.1, z0, x1, top, z1, m.metal);
    scaffold(batch, m, x0, z0 + 0.05, x1, z1, 34, top - 0.1, 2);
    world.addBox(x0, 34, z0, x1, top, z1, 'metal', 'scaffold');
    rvStrip(x0, top - 0.2, z1 - 0.02, x1, top, z1 + 0.04);
    rvStrip(x0 - 0.04, top - 0.2, z0, x0 + 0.02, top, z1);
    rvStrip(x1 - 0.02, top - 0.2, z0, x1 + 0.04, top, z1);
  }
  rvStrip(-64, 41.8, -347.94, -61, 42.0, -347.88);

  // decorative scaffolding on W1 and a crane-adjacent building
  scaffold(batch, m, 12, -124.0, 21, -122.8, 41, 58, 2);

  // ---- checkpoints / finish / hints --------------------------------------------------------
  const spawn = { x: 0, y: 50, z: 6, yaw: 0 };
  const checkpoints = [
    { x: 0, y: 50, z: -33, yaw: 0 },
    { x: 0, y: 49.5, z: -50.5, yaw: 0 },
    { x: 0, y: 45, z: -80.5, yaw: 0 },
    { x: -0.5, y: 41, z: -121, yaw: 0 },
    { x: -0.5, y: 40.5, z: -157, yaw: 0 },
    { x: 0, y: 45.5, z: -207, yaw: Math.PI / 2 },
    { x: -68, y: 34, z: -218, yaw: 0 },
    { x: -70, y: 33, z: -278, yaw: 0 },
    { x: -69, y: 36.5, z: -297, yaw: 0 },
    { x: -69, y: 34, z: -339, yaw: 0 },
  ];
  const finish = { x: -69, y: 42, z: -361 };

  const hints = [
    { box: [-7, -20, 7, 12], text: 'W A S D to run &middot; hold <b>SHIFT</b> to sprint &middot; <b>SPACE</b> to jump (hold for height)' },
    { box: [-6.5, -55, 6.5, -47.5], text: 'Sprint at waist-high obstacles to <b>VAULT</b> over them' },
    { box: [-6.5, -74, 6.5, -65], text: 'Big drop ahead: tap <b>C</b> just before you land to <b>ROLL</b>' },
    { box: [-6, -85, 6, -76.5], text: 'Tap <b>C</b> while running to <b>SLIDE</b> under pipes' },
    { box: [-6, -100, 6, -94.5], text: 'Slide down the slope to build speed &mdash; then jump the gap' },
    { box: [-5, -136, 4.6, -117], text: 'Jump at the wall at an angle to <b>WALL-RUN</b> &middot; <b>SPACE</b> kicks off' },
    { box: [-5, -175, 4.6, -160], text: 'Run straight at the wall and jump to <b>CLIMB</b> &mdash; you grab the ledge' },
    { box: [-6, -200, 6, -188], text: 'Jump for the higher roof &mdash; you\'ll <b>GRAB</b> the ledge and pull up' },
    { box: [-7, -224, 7, -203], text: 'Stand under the cable and press <b>E</b> to ride the <b>ZIPLINE</b>' },
    { box: [-78, -226, -58, -212], text: 'Final run: chain it all. Skilled? Climb the crates to the catwalk.' },
    { box: [-76, -348, -62, -334], text: 'Climb the scaffolding to the beacon' },
  ];

  return { rvGroup, dynamic, footprints, lights, ziplines, spawn, checkpoints, finish, hints };
}
