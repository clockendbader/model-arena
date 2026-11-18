// ============================================================================
// leveldata.js — the handcrafted course, as pure data.
// Produces colliders (with visual descriptors that level.js turns into meshes),
// checkpoints, ziplines, tutorial hints, runner's-vision markers and the
// reference route used by the test bot.  Forward is -Z, up is +Y, metres.
// ============================================================================

// collision size of downloaded prop models at scale 1: [x, y, z]
export const PROPS = {
  aircon: { size: [0.8, 0.9, 0.4], scale: 1.5, surf: 'metal' },
  utility1: { size: [0.55, 1.1, 0.4], scale: 1.35, surf: 'metal' },
  utility2: { size: [0.9, 1.1, 0.4], scale: 1.35, surf: 'metal' },
  crate: { size: [0.5, 0.5, 1.2], scale: 2.0, surf: 'wood' },
  barrel: { size: [0.6, 0.9, 0.6], scale: 1.1, surf: 'metal' },
  barrelBlue: { size: [0.6, 0.9, 0.6], scale: 1.1, surf: 'metal' },
  propane: { size: [0.32, 0.6, 0.32], scale: 1.4, surf: 'metal' },
  generator: { size: [0.8, 0.62, 0.6], scale: 1.5, surf: 'metal' },
  cement: { size: [0.5, 0.2, 0.7], scale: 1.2, surf: 'concrete' },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function buildLevel() {
  const L = {
    solids: [], roofs: [], zips: [], cps: [], hints: [], rvPanels: [], rvEdges: [], decor: [], route: [],
    spawn: null, finish: null,
  };
  const rand = rng(20240611);

  const add = (o) => { L.solids.push(o); return o; };
  /** course building: full-height block from the street up to `top` */
  const roof = (name, x0, x1, z0, z1, top, o = {}) => {
    const b = add({ name, x0, x1, z0, z1, y0: o.y0 ?? 0, y1: top, vis: 'building', surf: 'concrete', course: true, ...o });
    L.roofs.push(b); return b;
  };
  const box = (x0, x1, y0, y1, z0, z1, o = {}) => add({ x0, x1, y0, y1, z0, z1, vis: 'box', surf: 'concrete', ...o });
  /** model prop with an automatic collider; rot is 0 or 1 (quarter turns) for the collider */
  const prop = (model, x, y, z, rot = 0, extra = {}) => {
    const P = PROPS[model], s = (extra.scale ?? P.scale);
    const sx = P.size[rot % 2 ? 2 : 0] * s, sz = P.size[rot % 2 ? 0 : 2] * s, sy = P.size[1] * s;
    return add({ x0: x - sx / 2, x1: x + sx / 2, y0: y, y1: y + sy, z0: z - sz / 2, z1: z + sz / 2, vis: 'prop', model, rot, scale: s, px: x, py: y, pz: z, surf: P.surf, noWall: true, ...extra });
  };
  const cp = (x, y, z, killY, name) => { L.cps.push({ x, y, z, yaw: 0, killY, name, index: L.cps.length }); };
  const hint = (x0, x1, z0, z1, text) => L.hints.push({ x0, x1, z0, z1, text });
  const zip = (a, b) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d); L.zips.push({ a, b, d: d.map(v => v / len), len }); };
  const wp = (x, z, o = {}) => L.route.push({ x, z, ...o });

  // ==========================================================================
  // 0. START — run and jump
  // ==========================================================================
  const R0 = roof('R0', -11, 11, -15, 15, 70, { facade: 'Facade018A', roofTex: 'concrete_floor_worn_001', lane: [-4, 4] });
  L.spawn = { x: 0, y: 70, z: 9, yaw: 0 };
  cp(0, 70, 9, 57, 'Start');
  add({ x0: -3, x1: 3, y0: 70, y1: 73.2, z0: 11.5, z1: 15, vis: 'bulkhead', surf: 'concrete', door: '-z' });
  add({ x0: 6.2, x1: 9.8, y0: 70, y1: 75.4, z0: 9.5, z1: 13.1, vis: 'tank', surf: 'metal', noGrab: true });
  hint(-11, 11, 2, 15, 'WASD to move  ·  MOUSE to look  ·  hold SHIFT to sprint');
  hint(-11, 11, -15, 2, 'SPACE to jump  —  hold it for a higher jump');
  wp(0, -14.2, { act: 'jump' });

  const R1 = roof('R1', -8, 8, -40, -18, 69.5, { facade: 'Facade020A', roofTex: 'gravel_concrete_03', lane: [-3.5, 3.5] });
  wp(0, -39.2, { act: 'jump' });

  const R2 = roof('R2', -6, 10, -64.5, -44.5, 68.5, { facade: 'Facade019A', roofTex: 'concrete_floor_02', lane: [-2, 6] });
  cp(2, 68.5, -48, 56, 'First gaps');
  wp(2, -50);
  wp(2, -63.8, { act: 'jump' });
  hint(-6, 10, -64.5, -52, 'Sprint for the long gaps');

  // ==========================================================================
  // 1. VAULT
  // ==========================================================================
  const R3 = roof('R3', -9, 9, -100, -70, 66.5, { facade: 'Facade018A', roofTex: 'concrete_floor_worn_001', lane: [-9, 9] });
  cp(0, 66.5, -72.5, 50, 'Vault');
  hint(-9, 9, -78, -70, 'Sprint into low obstacles to VAULT over them');
  box(-8.6, 9, 66.5, 67.4, -78.4, -77.6, { vis: 'duct', surf: 'metal', rv: true });
  add({ x0: -8.6, x1: 9, y0: 66.5, y1: 67.5, z0: -84.5, z1: -83.5, vis: 'crates', surf: 'wood', rv: true });
  box(-8.6, 9, 66.5, 67.4, -90.25, -89.75, { mat: 'concrete_wall_008', rv: true, cap: true });
  // shortcut A: wall-run the billboard to skip all three obstacles
  add({ x0: -9.3, x1: -8.75, y0: 66.6, y1: 72.6, z0: -93.5, z1: -75.5, vis: 'billboard', surf: 'metal', art: 0, face: 1, noGrab: true });
  L.rvPanels.push({ axis: 'x', at: -8.75, n: 1, a: -93, b: -76, y0: 67.3, y1: 69.3, shortcut: true });
  wp(0, -73);
  wp(0, -99.2, { act: 'jump' });

  // ==========================================================================
  // 2. SLIDE
  // ==========================================================================
  const R4 = roof('R4', -8, 8, -128, -104, 66, { facade: 'Facade020A', roofTex: 'bitumen', lane: [-8, 8] });
  cp(0, 66, -106, 50, 'Slide');
  hint(-8, 8, -111, -104, 'Press C or CTRL while sprinting to SLIDE under');
  box(-8, 8, 67.1, 68.7, -113, -111, { vis: 'duct', surf: 'metal', rv: true, big: true });
  box(-8, -7.4, 66, 67.1, -113, -111, { mat: 'metal_plate_02', surf: 'metal' });
  box(7.4, 8, 66, 67.1, -113, -111, { mat: 'metal_plate_02', surf: 'metal' });
  box(-8, 8, 67.1, 67.9, -123, -120, { vis: 'piperack', surf: 'metal', rv: true });
  box(-8, -7.5, 66, 67.1, -123, -120, { mat: 'metal_plate_02', surf: 'metal' });
  box(7.5, 8, 66, 67.1, -123, -120, { mat: 'metal_plate_02', surf: 'metal' });
  // sloped roof: slide downhill to gain speed
  add({ x0: -8, x1: 8, y0: 40, y1: 66, z0: -140, z1: -128, ramp: { axis: 'z', a: 62, b: 66 }, vis: 'ramp', surf: 'metal', rv: true, course: true });
  L.roofs.push({ x0: -8, x1: 8, z0: -140, z1: -128, y1: 62, name: 'R4ramp', noBody: true });
  hint(-8, 8, -128, -118, 'Slide DOWNHILL to gain speed  ·  jump at the lip');
  wp(0, -106);
  wp(0, -109.3, { act: 'slide' });
  wp(0, -114.6);
  wp(0, -118.4, { act: 'slide' });
  wp(0, -124.6);
  wp(0, -129.2, { act: 'slide' });
  wp(0, -139.2, { act: 'jump' });

  // ==========================================================================
  // 3. WALL-RUN
  // ==========================================================================
  const R5 = roof('R5', -10, 10, -168, -143.2, 59.5, { facade: 'Facade019A', roofTex: 'concrete_floor_02', lane: [-4, 6] });
  cp(-2, 59.5, -152, 49, 'Wall-run');
  hint(-10, 10, -168, -150, 'Jump at a wall at an ANGLE to wall-run  ·  SPACE kicks off');
  roof('BW1', -24, -4, -186, -162, 77, { facade: 'Facade006', roofTex: 'gravel_concrete_03', wall: true });
  L.rvPanels.push({ axis: 'x', at: -4, n: 1, a: -183.5, b: -164.5, y0: 60.3, y1: 62.6 });
  wp(-2.4, -152);
  wp(-2.9, -166.6, { act: 'jump' });
  wp(-4.3, -180.5, { r: 1.6 });

  const R6 = roof('R6', -4, 12, -200, -179, 59.5, { facade: 'Facade018A', roofTex: 'gravel_concrete_03', lane: [-4, 12] });
  roof('BW2', 12, 30, -218, -194, 79, { facade: 'Facade001', roofTex: 'bitumen', wall: true });
  L.rvPanels.push({ axis: 'x', at: 12, n: -1, a: -215.5, b: -196.5, y0: 60.3, y1: 62.6 });
  wp(5, -190);
  wp(10.9, -198.7, { act: 'jump' });
  wp(12.3, -212.5, { r: 1.6 });

  const R7 = roof('R7', -6, 12, -232, -211, 59.5, { facade: 'Facade020A', roofTex: 'concrete_floor_worn_001', lane: [-6, 12] });
  cp(4, 59.5, -219, 49, 'Wall to wall');
  hint(-6, 12, -232, -214, 'Chain wall-runs: kick off and LOOK at the next wall');
  roof('BL', -21, -1, -242, -228, 75, { facade: 'Facade019A', roofTex: 'bitumen', wall: true });
  roof('BR', 3, 24, -252, -237, 75, { facade: 'Facade005', roofTex: 'bitumen', wall: true });
  L.rvPanels.push({ axis: 'x', at: -1, n: 1, a: -241, b: -230, y0: 60.3, y1: 62.8 });
  L.rvPanels.push({ axis: 'x', at: 3, n: -1, a: -251, b: -239, y0: 60.3, y1: 62.8 });
  wp(4, -220);
  wp(0.1, -231, { act: 'jump' });
  wp(-1.3, -238.2, { r: 1.3, act: 'kick' });
  wp(3.4, -246.5, { r: 1.6 });

  // ==========================================================================
  // 4. WALL-CLIMB + LEDGE GRAB
  // ==========================================================================
  const R8 = roof('R8', -8, 10, -270, -249, 59.5, { facade: 'Facade018A', roofTex: 'concrete_floor_02', lane: [-3, 5] });
  cp(1, 59.5, -256, 49, 'Climb');
  hint(-8, 10, -270, -252, 'Run STRAIGHT at a wall to climb it  ·  you grab the ledge automatically');
  const R9 = roof('R9', -8, 10, -290, -270, 63.7, { facade: 'Facade020A', roofTex: 'gravel_concrete_03', lane: [-3, 5] });
  L.rvEdges.push({ axis: 'z', at: -270, n: 1, a: -3, b: 5, y: 63.7 });
  hint(-8, 10, -290, -272, 'Jump at ledges out of reach  —  you catch the edge and pull up');
  const R10 = roof('R10', -7, 9, -312, -294.5, 65.9, { facade: 'Facade019A', roofTex: 'concrete_floor_worn_001', lane: [-3, 5] });
  L.rvEdges.push({ axis: 'z', at: -294.5, n: 1, a: -3, b: 5, y: 65.9 });
  const R11 = roof('R11', -9, 9, -336, -312, 68.9, { facade: 'Facade018A', roofTex: 'concrete_floor_02', lane: [-3, 5] });
  L.rvEdges.push({ axis: 'z', at: -312, n: 1, a: -3, b: 5, y: 68.9 });
  cp(1.5, 68.9, -318, 42, 'Zipline');
  wp(1, -256);
  wp(1, -269.2);
  wp(1, -289.3, { act: 'jump' });
  wp(1, -311.2);
  wp(1.5, -320);

  // ==========================================================================
  // 5. ZIPLINE
  // ==========================================================================
  hint(-9, 9, -336, -316, 'Press E near a cable to ZIPLINE  ·  SPACE drops off');
  zip([2, 71.3, -332], [8, 54.9, -392]);
  add({ x0: 2.9, x1: 3.3, y0: 68.9, y1: 71.9, z0: -332.2, z1: -331.8, vis: 'zipmast', surf: 'metal', noGrab: true, noWall: true, anchor: [2, 71.3, -332] });
  wp(2, -330.3, { act: 'use' });
  wp(8, -394, { r: 3, wait: 'zip' });

  // ==========================================================================
  // 6. ROLL
  // ==========================================================================
  const R12 = roof('R12', -6, 18, -421, -388, 52, { facade: 'Facade006', roofTex: 'concrete_floor_worn_001', lane: [3, 17.5] });
  add({ x0: 8.9, x1: 9.3, y0: 52, y1: 55.5, z0: -392.6, z1: -392.2, vis: 'zipmast', surf: 'metal', noGrab: true, noWall: true, anchor: [8, 54.9, -392], end: true });
  cp(8, 52, -402, 36, 'Roll');
  hint(-6, 18, -421, -404, 'Big drop: press C just BEFORE you land to ROLL and keep your speed');
  wp(8, -405);
  wp(8, -420.7, { roll: true });

  // shortcut B: the crane beam skips the slide/vault warm-up — narrow, and ends in a 7.5 m drop
  box(15.6, 16.4, 51.5, 52, -463, -421, { vis: 'beam', surf: 'metal', rv: true, shortcut: true, noGrab: true });

  // ==========================================================================
  // 7. FINALE — chain everything
  // ==========================================================================
  const R13 = roof('R13', -4, 20, -455, -425, 45, { facade: 'Facade020A', roofTex: 'bitumen', lane: [-4, 20] });
  cp(8, 45, -434, 34, 'The chain');
  hint(-4, 20, -440, -428, 'Now chain it all together  —  the beacon is close');
  box(-4, 20, 46.1, 47.7, -442, -440, { vis: 'duct', surf: 'metal', rv: true, big: true });
  box(-4, -3.4, 45, 46.1, -442, -440, { mat: 'metal_plate_02', surf: 'metal' });
  box(19.4, 20, 45, 46.1, -442, -440, { mat: 'metal_plate_02', surf: 'metal' });
  box(-4, 20, 45, 45.9, -447, -446.5, { mat: 'concrete_wall_008', rv: true, cap: true });
  wp(8, -434);
  wp(8, -438.3, { act: 'slide' });
  wp(8, -443.6);
  wp(8, -454.2, { act: 'jump' });

  const R14 = roof('R14', 0, 18, -475, -460, 44.5, { facade: 'Facade019A', roofTex: 'concrete_floor_02', lane: [0, 18] });
  roof('BW3', 18, 36, -498, -470, 73, { facade: 'Facade001', roofTex: 'bitumen', wall: true });
  L.rvPanels.push({ axis: 'x', at: 18, n: -1, a: -495.5, b: -472.5, y0: 45.6, y1: 47.9 });
  wp(14, -466);
  wp(16.9, -473.8, { act: 'jump' });
  wp(18.3, -488.5, { r: 1.6 });

  const R15 = roof('R15', 2, 18, -501, -487, 45, { facade: 'Facade018A', roofTex: 'gravel_concrete_03', lane: [2, 18] });
  const R16 = roof('R16', 0, 18, -516, -501, 49, { facade: 'Facade020A', roofTex: 'concrete_floor_worn_001', lane: [3, 11] });
  L.rvEdges.push({ axis: 'z', at: -501, n: 1, a: 6, b: 14, y: 49 });
  wp(10, -494);
  wp(10, -500.2);

  // scaffold steps up the side of the construction tower
  roof('BC', 10, 30, -544, -516, 62, { facade: 'concrete', roofTex: 'concrete_floor_02', wall: true, construction: true });
  for (let i = 0; i < 3; i++) {
    const z1 = -518.5 - i * 8, top = 51.4 + i * 2.4;
    add({ x0: 4, x1: 10, y0: top - 0.25, y1: top, z0: z1 - 5.5, z1, vis: 'plank', surf: 'wood', rv: true, course: true });
    L.rvEdges.push({ axis: 'z', at: z1, n: 1, a: 4.4, b: 9.6, y: top, thin: true });
  }
  wp(7, -515.3, { act: 'jump' });
  wp(7, -523.3, { act: 'jump' });
  wp(7, -531.3, { act: 'jump' });

  zip([7, 58.7, -539], [-1, 52.7, -583]);
  add({ x0: 7.9, x1: 8.3, y0: 56.2, y1: 59.3, z0: -539.2, z1: -538.8, vis: 'zipmast', surf: 'metal', noGrab: true, noWall: true, anchor: [7, 58.7, -539] });
  wp(7, -537.4, { act: 'use' });
  wp(-1, -585, { r: 3, wait: 'zip' });

  // finish tower: terrace + three stepped tiers
  const T1 = roof('T1', -14, 6, -609, -579, 50, { facade: 'Facade005', roofTex: 'concrete_floor_worn_001', lane: [-9, 2], tower: true });
  add({ x0: -0.1, x1: 0.3, y0: 50, y1: 53.3, z0: -583.6, z1: -583.2, vis: 'zipmast', surf: 'metal', noGrab: true, noWall: true, anchor: [-1, 52.7, -583], end: true });
  cp(-2, 50, -587, 40, 'The tower');
  roof('T2', -12, 4, -609, -593, 54, { y0: 50, facade: 'concrete', roofTex: 'concrete_floor_02', tier: true, lane: [-12, 4] });
  roof('T3', -10, 2, -609, -600, 58, { y0: 54, facade: 'concrete', roofTex: 'concrete_floor_02', tier: true, lane: [-10, 2] });
  roof('T4', -8, 0, -609, -604.5, 61.5, { y0: 58, facade: 'concrete', roofTex: 'concrete_floor_worn_001', tier: true, lane: [-8, 0] });
  L.rvEdges.push({ axis: 'z', at: -593, n: 1, a: -8, b: 0, y: 54 });
  L.rvEdges.push({ axis: 'z', at: -600, n: 1, a: -8, b: 0, y: 58 });
  L.rvEdges.push({ axis: 'z', at: -604.5, n: 1, a: -7.5, b: -0.5, y: 61.5 });
  L.finish = { x: -4, y: 61.5, z: -606.9, r: 2.1 };
  wp(-2, -588);
  wp(-4, -592.2);
  wp(-4, -599.2);
  wp(-4, -603.7);
  wp(-4, -606.9, { r: 0.8 });

  // ==========================================================================
  // route <-> checkpoint links (so the bot can resume after a respawn)
  // ==========================================================================
  for (const c of L.cps) {
    let best = 0, bd = 1e9;
    L.route.forEach((w, i) => { const d = Math.hypot(w.x - c.x, w.z - c.z); if (d < bd) { bd = d; best = i; } });
    c.routeIndex = best;
  }

  // ==========================================================================
  // rooftop clutter on course roofs (kept out of each roof's running lane)
  // ==========================================================================
  const blocked = (x0, x1, z0, z1, y) => {
    for (const s of L.solids) if (s.y1 > y + 0.05 && s.y0 < y + 4 && s.x1 > x0 - 0.5 && s.x0 < x1 + 0.5 && s.z1 > z0 - 0.5 && s.z0 < z1 + 0.5) return true;
    for (const c of L.cps) if (c.x > x0 - 2 && c.x < x1 + 2 && c.z > z0 - 2 && c.z < z1 + 2) return true;
    return false;
  };
  const tryProp = (model, x, y, z, rot) => {
    const P = PROPS[model], s = P.scale, sx = P.size[rot % 2 ? 2 : 0] * s / 2, sz = P.size[rot % 2 ? 0 : 2] * s / 2;
    if (blocked(x - sx, x + sx, z - sz, z + sz, y)) return false;
    prop(model, x, y, z, rot); return true;
  };
  const tryAdd = (o) => { if (blocked(o.x0, o.x1, o.z0, o.z1, o.y0)) return false; add(o); return true; };
  for (const r of L.roofs) {
    if (r.noBody || r.wall || r.tier) continue;
    const lane = r.lane || [(r.x0 + r.x1) / 2 - 3.5, (r.x0 + r.x1) / 2 + 3.5];
    const y = r.y1;
    for (const side of [0, 1]) {
      const sx0 = side ? lane[1] + 0.9 : r.x0 + 0.5, sx1 = side ? r.x1 - 0.5 : lane[0] - 0.9;
      if (sx1 - sx0 < 1.3) continue;
      let z = r.z1 - 2.6;
      const zEnd = r.z0 + 2.6;
      const edgeX = side ? sx1 : sx0, inX = side ? -1 : 1;       // hug the outer edge
      const fits = (w) => sx1 - sx0 >= w;
      while (z > zEnd) {
        const t = rand();
        let step = 2.2;
        if (t < 0.28) {                                         // row of 2-3 condenser units
          const n = 2 + (rand() * 2 | 0);
          for (let i = 0; i < n && z - i * 1.5 > zEnd; i++) tryProp('aircon', edgeX + inX * 0.5, y, z - i * 1.5, 1);
          step = n * 1.5 + 1.2;
        } else if (t < 0.42) { tryProp(rand() < 0.5 ? 'utility1' : 'utility2', edgeX + inX * 0.45, y, z, 1); step = 2.4; }
        else if (t < 0.54 && fits(2.4)) { const xa = edgeX + inX * 0.3; tryAdd({ x0: side ? xa - 2 : xa, x1: side ? xa : xa + 2, y0: y, y1: y + 1.5, z0: z - 2.6, z1: z, vis: 'acplant', surf: 'metal' }); step = 4.2; }
        else if (t < 0.64) { const n = 1 + (rand() * 3 | 0); for (let i = 0; i < n; i++) tryProp(rand() < 0.5 ? 'barrel' : 'barrelBlue', edgeX + inX * (0.5 + (i % 2) * 0.75), y, z - (i >> 1) * 0.8, 0); step = 2.2; }
        else if (t < 0.74) { const xa = edgeX + inX * 0.55; tryAdd({ x0: xa - 0.35, x1: xa + 0.35, y0: y, y1: y + 0.95, z0: z - 0.7, z1: z, vis: 'vent', surf: 'metal', noWall: true }); step = 2.0; }
        else if (t < 0.82) { if (tryProp('crate', edgeX + inX * 0.7, y, z - 1.2, 0) && rand() < 0.5) prop('cement', edgeX + inX * 0.7, y + 1.0, z - 1.0, 1); step = 3.6; }
        else if (t < 0.88) { tryProp('generator', edgeX + inX * 0.8, y, z - 0.5, 1); tryProp('propane', edgeX + inX * 0.5, y, z - 1.7, 0); step = 3.2; }
        else if (t < 0.94 && fits(3.2) && !r.tower) { const xa = edgeX + inX * 0.3; tryAdd({ x0: side ? xa - 2.8 : xa, x1: side ? xa : xa + 2.8, y0: y, y1: y + 4.6, z0: z - 2.8, z1: z, vis: 'tank', surf: 'metal', noGrab: true }); step = 4.6; }
        else { L.decor.push({ type: 'antenna', x: edgeX + inX * 0.5, y, z, h: 5 + rand() * 6 }); step = 1.8; }
        z -= step + rand() * 2.2;
      }
    }
  }

  // precomputed helper: approximate course height along z (for the surrounding city)
  L.profile = (z) => {
    let best = 60, bd = 1e9;
    for (const r of L.roofs) {
      if (r.wall) continue;
      const d = z > r.z1 ? z - r.z1 : z < r.z0 ? r.z0 - z : 0;
      if (d < bd) { bd = d; best = r.y1; }
    }
    return best;
  };
  L.solids = L.solids.filter(s => s.x1 > s.x0 && s.z1 > s.z0);
  return L;
}
