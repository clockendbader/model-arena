// The microscopic end of the journey: an acinus (alveolar ducts + sacs) wrapped in capillaries,
// with gas exchange and red blood cells. Built in "micro units": 1 mu = 100 micrometres, and the whole
// group is scaled by 0.001 so it sits at TRUE scale on the tip of a bronchiole (1 scene unit = 100 mm).
import * as THREE from 'three';
import { NOISE_GLSL } from './deform.js';
import { mulberry32 } from './airways.js';

export const MICRO_SCALE = 0.001;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (t) => t * t * (3 - 2 * t);

const MICRO_LIGHT = /* glsl */`
vec3 microLight(vec3 base, vec3 n, vec3 v, float gloss) {
  vec3 l1 = normalize(vec3(0.45, 0.75, 0.55)), l2 = normalize(vec3(-0.7, 0.15, -0.45));
  float d1 = max(dot(n, l1), 0.0) * 0.55 + 0.45; d1 *= d1;
  float d2 = max(dot(n, l2), 0.0);
  float spec = pow(max(dot(n, normalize(l1 + v + 1e-4)), 0.0), 48.0) * gloss;
  float fres = pow(clamp(1.0 - max(dot(n, v), 0.0), 0.0, 1.0), 2.4);
  return base * (0.30 + 0.80 * d1) + base * vec3(0.55, 0.7, 1.0) * d2 * 0.3 + vec3(1.0, 0.95, 0.9) * spec + base * fres * 0.55;
}`;

const VERT = /* glsl */`
attribute vec3 aCenter; attribute float aData; attribute float aDamage;
uniform float uInflate, uSmoke, uDuct;
varying vec3 vN, vV, vLocal; varying float vData, vDamage, vDist;
void main() {
  vec3 p = position; vec3 nrm = normal;
  #if defined(KIND_WALL) || defined(KIND_BLOOD)
    p = aCenter + (position - aCenter) * uInflate * (1.0 + 0.24 * aDamage * uSmoke);
  #elif defined(KIND_DUCT)
    p = aCenter + (position - aCenter) * mix(1.0, uDuct, aData);
  #endif
  vLocal = position;
  #ifdef USE_INSTANCING
    vLocal = (instanceMatrix * vec4(position, 1.0)).xyz;
    p = (instanceMatrix * vec4(p, 1.0)).xyz; nrm = mat3(instanceMatrix) * nrm;
  #endif
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * nrm); vV = -mv.xyz; vDist = length(mv.xyz);
  vData = aData; vDamage = aDamage;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform float uMicro, uSmoke, uSat, uSide, uConstrictM, uTime;
uniform vec2 uFog; uniform vec3 uFogColor;
varying vec3 vN, vV, vLocal; varying float vData, vDamage, vDist;
${NOISE_GLSL}
${MICRO_LIGHT}
void main() {
  vec3 n = normalize(vN + 1e-6) * (gl_FrontFacing ? 1.0 : -1.0); vec3 v = normalize(vV);
  float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 1.7);
  float dmg = vDamage * uSmoke; vec3 col; float a;
  #if defined(KIND_WALL)
    float nz = bFbm(vLocal * 2.2 + vData * 9.0);
    vec3 base = mix(vec3(1.0, 0.74, 0.70), vec3(0.34, 0.28, 0.26), dmg) * (0.82 + 0.34 * nz);
    float soot = smoothstep(0.52, 0.68, bFbm(vLocal * 5.5 + 4.0)) * uSmoke;
    base = mix(base, vec3(0.04, 0.035, 0.04), soot * (0.3 + 0.6 * vDamage));
    col = microLight(base, n, v, 0.30);
    a = uSide > 0.5 ? (0.04 + 0.46 * fres) : (0.15 + 0.25 * fres);
    a *= mix(1.0, smoothstep(0.36, 0.56, nz), dmg * 0.9);      // emphysema: the walls break down
  #elif defined(KIND_BLOOD)
    float sat = smoothstep(0.14, 0.46, vData) * (1.0 - dmg) * uSat;
    vec3 base = mix(vec3(0.17, 0.13, 0.50), vec3(0.60, 0.07, 0.065), sat);
    base = mix(base, vec3(0.22, 0.17, 0.2), dmg * 0.8);
    col = microLight(base, n, v, 0.5);
    a = (0.5 + 0.42 * fres) * (1.0 - 0.72 * dmg);
  #elif defined(KIND_DUCT)
    vec3 base = mix(vec3(0.86, 0.62, 0.58), vec3(0.9, 0.36, 0.32), uConstrictM * vData * 0.8);
    base = mix(base, base * vec3(0.45, 0.4, 0.4), uSmoke * 0.6);
    col = microLight(base, n, v, 0.4);
    a = uSide > 0.5 ? (0.10 + 0.6 * fres) : 0.26;
  #else
    vec3 base = vec3(0.36, 0.15, 0.16) * (0.8 + 0.3 * bNoise(vLocal * 0.6));
    base = mix(base, vec3(0.3, 0.26, 0.26), uSmoke * 0.7);
    col = microLight(base, n, v, 0.03) * 0.7;
    a = (0.2 + 0.42 * fres) * smoothstep(uFog.x * 0.80, uFog.x * 1.18, vDist);   // nothing may block the camera
  #endif
  float fog = smoothstep(uFog.x, uFog.y, vDist);
  col = mix(col, uFogColor, fog);
  #ifdef KIND_BG
    a *= 1.0 - fog * 0.9;
  #endif
  gl_FragColor = vec4(max(col, vec3(0.0)), clamp(a * uMicro, 0.0, 1.0));
}`;

// ------------------------------------------------------------------ geometry helpers
function fibonacci(n, rng) {
  const out = []; const off = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n; const r = Math.sqrt(1 - y * y); const t = i * 2.399963 + off; out.push(V(Math.cos(t) * r, y, Math.sin(t) * r)); }
  return out;
}

class Builder {
  constructor() { this.pos = []; this.nor = []; this.cen = []; this.dat = []; this.dmg = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(p, n, c, data, damage) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.cen.push(c.x, c.y, c.z); this.dat.push(data); this.dmg.push(damage); return this.count - 1; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aCenter', new THREE.Float32BufferAttribute(this.cen, 3));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(this.dat, 1));
    g.setAttribute('aDamage', new THREE.Float32BufferAttribute(this.dmg, 1));
    g.setIndex(this.idx); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  /** sweep a tube along a list of points. centreMode: 'self' keeps vertices still under inflation. */
  tube(points, radius, radial, data, damage, centre = null, closed = false) {
    const n = points.length; const T = V(), N = V(0, 1, 0), B = V(), d = V();
    T.subVectors(points[1], points[0]).normalize(); if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
    N.addScaledVector(T, -N.dot(T)).normalize();
    const base = this.count;
    for (let k = 0; k < n; k++) {
      T.subVectors(points[Math.min(n - 1, k + 1)], points[Math.max(0, k - 1)]).normalize();
      N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N);
      const r = typeof radius === 'function' ? radius(k / (n - 1)) : radius;
      const dd = typeof data === 'function' ? data(k / (n - 1)) : data;
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2; d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        const p = V().copy(points[k]).addScaledVector(d, r);
        this.vert(p, d, centre === 'self' ? p : (centre === 'axis' ? points[k] : centre), dd, damage);
      }
      if (k) for (let j = 0; j < radial; j++) {
        const a0 = base + (k - 1) * radial + j, a1 = base + (k - 1) * radial + (j + 1) % radial;
        this.idx.push(a0, a1, a0 + radial, a1, a1 + radial, a0 + radial);
      }
    }
  }
}

function curvePoints(pts, n) { return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(n); }

// dual graph of an icosphere: a honeycomb net (hexagons + 12 pentagons), like a capillary mesh
function honeycomb(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position; const nf = p.count / 3;
  const key = (i) => `${Math.round(p.getX(i) * 1e4)}_${Math.round(p.getY(i) * 1e4)}_${Math.round(p.getZ(i) * 1e4)}`;
  const verts = [], edgeMap = new Map(), edges = [];
  for (let f = 0; f < nf; f++) {
    const c = V(); for (let k = 0; k < 3; k++) c.add(V(p.getX(f * 3 + k), p.getY(f * 3 + k), p.getZ(f * 3 + k)));
    verts.push(c.normalize());
    for (let k = 0; k < 3; k++) {
      const a = key(f * 3 + k), b = key(f * 3 + (k + 1) % 3); const e = a < b ? a + '|' + b : b + '|' + a;
      if (edgeMap.has(e)) edges.push([edgeMap.get(e), f]); else edgeMap.set(e, f);
    }
  }
  g.dispose();
  return { verts, edges };
}

// biconcave disc (Evans & Fung profile)
function rbcGeometry() {
  const pts = []; const prof = (rho) => 0.5 * Math.sqrt(Math.max(0, 1 - rho * rho)) * (0.207 + 2.003 * rho * rho - 1.123 * rho ** 4);
  const steps = [0, 0.3, 0.55, 0.78, 0.93, 1.0];
  for (const s of steps) pts.push(new THREE.Vector2(Math.max(s, 0.0001), prof(s) + (s === 1 ? 0 : 0.02)));
  for (let k = steps.length - 2; k >= 0; k--) pts.push(new THREE.Vector2(Math.max(steps[k], 0.0001), -prof(steps[k]) - 0.02));
  const g = new THREE.LatheGeometry(pts, 12); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the acinus
export class Alveoli {
  constructor() {
    this.rng = mulberry32(42);
    this.group = new THREE.Group(); this.group.scale.setScalar(MICRO_SCALE); this.group.visible = false;
    this.u = {
      uMicro: { value: 0 }, uInflate: { value: 1 }, uSmoke: { value: 0 }, uSat: { value: 1 }, uDuct: { value: 1 }, uConstrictM: { value: 0 },
      uFog: { value: new THREE.Vector2(0.04, 0.1) }, uFogColor: { value: new THREE.Color(0x14080c) }, uTime: { value: 0 },
    };
    this.pickables = [];
    this._layout();
    this._walls();
    this._ducts();
    this._blood();
    this._cells();
    this._particles();
    this._background();
  }

  _mat(kind, side, order, extra = {}) {
    const m = new THREE.ShaderMaterial({
      defines: { ['KIND_' + kind]: 1 }, uniforms: { ...this.u, uSide: { value: side === THREE.FrontSide ? 1 : 0 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, side, depthWrite: false, ...extra,
    });
    m.userData.order = order; return m;
  }
  _mesh(geo, mat, part) {
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = mat.userData.order; mesh.frustumCulled = false;
    if (part) { mesh.userData.part = part; this.pickables.push(mesh); }
    this.group.add(mesh); return mesh;
  }

  // ---- where everything sits
  _layout() {
    const rng = this.rng;
    const top = V(0, 13, 0), J0 = V(0, 7.4, 0), J1a = V(-2.9, 4.3, 0.3), J1b = V(2.9, 4.1, -0.3), J2 = V(2.0, 0.5, 1.5);
    const sacs = [
      { c: V(-6.3, 1.5, 2.3), from: J1a, bad: false }, { c: V(-2.3, -2.7, -3.7), from: J1a, bad: true },
      { c: V(3.0, -3.3, 3.9), from: J2, bad: false }, { c: V(6.6, 1.3, -2.2), from: J1b, bad: true },
      { c: V(0.2, -6.6, -0.6), from: J2, bad: false },
    ];
    this.ducts = [
      { pts: [top, V(0.15, 10.2, 0.1), J0], r: (t) => 1.5 - 0.35 * t, level: 1 },
      { pts: [J0, V(-1.3, 6.1, 0.1), J1a], r: () => 0.98, level: 1 }, { pts: [J0, V(1.3, 6.0, -0.1), J1b], r: () => 0.98, level: 1 },
      { pts: [J1b, V(2.7, 2.2, 0.6), J2], r: () => 0.82, level: 0.6 },
    ];
    this.alv = []; this.sacs = sacs;
    for (const s of sacs) {
      s.d = V().subVectors(s.c, s.from).normalize();
      s.neck = V().copy(s.c).addScaledVector(s.d, -1.25);
      const mid = V().lerpVectors(s.from, s.neck, 0.5).add(V((rng() - 0.5) * 0.8, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.8));
      s.duct = { pts: [s.from, mid, s.neck, V().copy(s.c).addScaledVector(s.d, -0.5)], r: (t) => 0.74 + 0.2 * t * t, level: 0.3 };
      this.ducts.push(s.duct);
      for (const dir of fibonacci(12, rng)) {
        if (dir.dot(s.d) < -0.5) continue;                      // leave the entrance free
        const R = 1.0 + rng() * 0.2;
        this.alv.push({ c: V().copy(s.c).addScaledVector(dir, 1.5 + rng() * 0.2), R, m: dir.clone().negate(), bad: s.bad, sac: s });
      }
      // alveoli budding from the wall of the duct itself (respiratory bronchiole)
      const pts = curvePoints(s.duct.pts, 12);
      for (const k of [3, 7]) {
        const T = V().subVectors(pts[k + 1], pts[k - 1]).normalize();
        const side = V(rng() - 0.5, rng() - 0.5, rng() - 0.5); side.addScaledVector(T, -side.dot(T)).normalize();
        const R = 0.88 + rng() * 0.14;
        this.alv.push({ c: V().copy(pts[k]).addScaledVector(side, 0.74 + R * 0.72), R, m: side.clone().negate(), bad: s.bad && rng() < 0.7, sac: s });
      }
    }
    this.alv.forEach((a, i) => { a.id = i; a.seed = rng(); });
    this.hero = this.alv.find((a) => !a.bad && a.c.z > 2 && a.c.x < 0) || this.alv[0];
  }

  // ---- alveolar walls: thin translucent bubbles, open towards the duct
  _walls() {
    const b = new Builder(); const src = new THREE.IcosahedronGeometry(1, 7); const sp = src.attributes.position; const cosMouth = Math.cos(0.7);
    const tmp = [V(), V(), V()];
    for (const a of this.alv) {
      for (let f = 0; f < sp.count; f += 3) {
        let inMouth = 0;
        for (let k = 0; k < 3; k++) { tmp[k].set(sp.getX(f + k), sp.getY(f + k), sp.getZ(f + k)); if (tmp[k].dot(a.m) > cosMouth) inMouth++; }
        if (inMouth === 3) continue;
        for (let k = 0; k < 3; k++) {
          const n = tmp[k]; const wob = 1 + 0.07 * Math.sin(n.x * 5 + a.seed * 30) * Math.cos(n.y * 4 + a.seed * 17) + 0.04 * Math.sin(n.z * 9 + a.seed * 50);
          b.idx.push(b.vert(V().copy(a.c).addScaledVector(n, a.R * wob), n, a.c, a.seed, a.bad ? 1 : 0));
        }
      }
    }
    src.dispose();
    const g = b.build();
    this._mesh(g, this._mat('WALL', THREE.BackSide, 1));
    this.wallFront = this._mesh(g, this._mat('WALL', THREE.FrontSide, 3), 'alveolus');
  }

  // ---- respiratory bronchiole + alveolar ducts
  _ducts() {
    const b = new Builder(); this.ductPaths = [];
    for (const d of this.ducts) {
      const pts = curvePoints(d.pts, 14); d.curve = pts;
      b.tube(pts, d.r, 14, d.level, 0, 'axis');
    }
    const g = b.build();
    this._mesh(g, this._mat('DUCT', THREE.BackSide, 0, { depthWrite: true }));
    this.ductFront = this._mesh(g, this._mat('DUCT', THREE.FrontSide, 3), 'duct');
    // air routes: trunk -> ... -> each sac
    const trunk = this.ducts[0].curve, a = this.ducts[1].curve, bb = this.ducts[2].curve, c = this.ducts[3].curve;
    const chains = [[trunk, a], [trunk, a], [trunk, bb, c], [trunk, bb], [trunk, bb, c]];
    this.sacs.forEach((s, i) => {
      const pts = []; for (const seg of chains[i]) pts.push(...seg.slice(pts.length ? 1 : 0)); pts.push(...s.duct.curve.slice(1)); pts.push(s.c.clone());
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
      this.ductPaths.push({ pts, cum, len: cum[cum.length - 1] });
    });
  }

  // ---- capillary nets + the arteriole that feeds them and the venule that drains them
  _blood() {
    const rng = this.rng; const net = honeycomb(2); const cap = new Builder();
    const cosMouth = Math.cos(0.78); const q = new THREE.Quaternion(); const LIFT = 0.045, CR = 0.054;
    this.capPaths = [];
    for (const a of this.alv) {
      q.setFromEuler(new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28));
      const dirs = net.verts.map((v) => v.clone().applyQuaternion(q).add(V((rng() - 0.5) * 0.09, (rng() - 0.5) * 0.09, (rng() - 0.5) * 0.09)).normalize());
      const keep = dirs.map((d) => {
        if (d.dot(a.m) > cosMouth) return false;
        const p = V().copy(a.c).addScaledVector(d, a.R);
        for (const o of this.alv) if (o !== a && p.distanceTo(o.c) < o.R * 0.94) return false;
        for (const s of this.sacs) if (p.distanceTo(s.c) < 0.9) return false;
        return true;
      });
      const flow = dirs.map((d) => (1 - d.dot(a.m)) / 2);          // 0 at the mouth (arteriolar end) -> 1 at the far pole (venular end)
      const nbr = dirs.map(() => []);
      for (const [i, j] of net.edges) {
        if (!keep[i] || !keep[j]) continue;
        nbr[i].push(j); nbr[j].push(i);
        const A = V().copy(a.c).addScaledVector(dirs[i], a.R + LIFT), B = V().copy(a.c).addScaledVector(dirs[j], a.R + LIFT);
        const M = V().addVectors(dirs[i], dirs[j]).normalize(); const mid = V().copy(a.c).addScaledVector(M, a.R + LIFT);
        const ext = V().subVectors(B, A).normalize().multiplyScalar(CR * 0.6);
        const tA = flow[i], tB = flow[j];
        cap.tube([A.clone().sub(ext), mid, B.clone().add(ext)], CR, 4, (t) => tA + (tB - tA) * t, a.bad ? 1 : 0, a.c);
      }
      // red-cell lanes: walk the net "downstream"
      const starts = dirs.map((d, i) => i).filter((i) => keep[i] && nbr[i].length).sort((i, j) => flow[i] - flow[j]).slice(0, 14);
      for (let k = 0; k < 4 && starts.length; k++) {
        let cur = starts[Math.floor(rng() * starts.length)]; const lane = [cur];
        for (let step = 0; step < 40; step++) {
          const next = nbr[cur].filter((j) => flow[j] > flow[cur] + 0.005); if (!next.length) break;
          cur = next[Math.floor(rng() * next.length)]; lane.push(cur);
        }
        if (lane.length < 5) continue;
        const pts = lane.map((i) => dirs[i]); const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
        this.capPaths.push({ alv: a, pts, cum, len: cum[cum.length - 1] });
      }
    }
    this.capMesh = this._mesh(cap.build(), this._mat('BLOOD', THREE.FrontSide, 2, { depthWrite: true }), 'capillary');

    // arteriole (oxygen-poor, travels with the airway) and venule (oxygen-rich, leaves at the periphery)
    const art = new Builder(), ven = new Builder(); this.vesselPaths = [];
    const off = V(1.75, 0, 0.75);
    const addVessel = (builder, pts, r, oxy) => {
      const c = curvePoints(pts, 22); builder.tube(c, r, 9, oxy, 0, 'self');
      const cum = [0]; for (let k = 1; k < c.length; k++) cum.push(cum[k - 1] + c[k].distanceTo(c[k - 1]));
      this.vesselPaths.push({ pts: c, cum, len: cum[cum.length - 1], oxy });
    };
    const aTop = V(0, 13.5, 0).add(off), aJ0 = V(0, 7.6, 0).add(V(1.45, 0, 0.7));
    addVessel(art, [aTop, V(0.1, 10.5, 0).add(off), aJ0], (t) => 0.46 - 0.08 * t, 0);
    for (const s of this.sacs) {
      const side = V().crossVectors(s.d, V(0.3, 1, 0.2)).normalize();
      const mid = V().lerpVectors(aJ0, s.neck, 0.5).addScaledVector(side, 1.2);
      addVessel(art, [aJ0, mid, V().copy(s.neck).addScaledVector(side, 1.05), V().copy(s.c).addScaledVector(s.d, -0.2).addScaledVector(side, 1.0)], (t) => 0.3 - 0.12 * t, 0);
    }
    const collect = V(1.0, -11.5, 0.5);
    for (const s of this.sacs) {
      const pole = V().copy(s.c).addScaledVector(s.d, 2.75);
      const out = V().copy(s.c).addScaledVector(s.d, 4.6); out.y -= 1.2;
      const mid = V().lerpVectors(out, collect, 0.55); mid.x *= 1.25; mid.z *= 1.25;
      addVessel(ven, [pole, out, mid, collect], (t) => 0.2 + 0.14 * t, 1);
    }
    addVessel(ven, [collect, V(3.0, -14.5, 2.0), V(7.0, -18.5, 4.5)], (t) => 0.44 + 0.06 * t, 1);
    this.artMesh = this._mesh(art.build(), this._mat('BLOOD', THREE.FrontSide, 2, { depthWrite: true }), 'arteriole');
    this.venMesh = this._mesh(ven.build(), this._mat('BLOOD', THREE.FrontSide, 2, { depthWrite: true }), 'venule');
  }

  // ---- red blood cells
  _cells() {
    const rng = this.rng; this.cells = [];
    for (const lane of this.capPaths) { const n = 5; const o = rng(); for (let k = 0; k < n; k++) this.cells.push({ lane, s: ((k + o) / n) * lane.len, wob: rng() * 6.28, cap: true }); }
    for (const path of this.vesselPaths) { const n = Math.max(4, Math.round(path.len / 0.62)); const o = rng(); for (let k = 0; k < n; k++) this.cells.push({ lane: path, s: ((k + o) / n) * path.len, wob: rng() * 6.28, cap: false, off: V(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.22) }); }
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.7 });
    this.rbc = new THREE.InstancedMesh(rbcGeometry(), mat, this.cells.length);
    this.rbc.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.rbc.frustumCulled = false; this.rbc.renderOrder = 0;
    this.rbc.setColorAt(0, new THREE.Color(1, 0, 0)); this.rbc.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.rbc.userData.part = 'rbc'; this.pickables.push(this.rbc);
    this.group.add(this.rbc);
    this.cDark = new THREE.Color(0x3a0610); this.cBright = new THREE.Color(0xff3020);
  }

  // ---- O2 / CO2 molecules + air in the ducts
  _particles() {
    const rng = this.rng; this.gas = [];
    const pick = (a, lo, hi) => { for (let i = 0; i < 40; i++) { const n = V(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(); const d = n.dot(a.m); if (d > lo && d < hi) return n; } return a.m.clone().negate(); };
    for (const a of this.alv) {
      for (let k = 0; k < 9; k++) this.gas.push({ a, kind: 0, u: rng(), dur: 3.0 + rng() * 2.0, n: pick(a, -1, 0.3), j: V(rng() - 0.5, rng() - 0.5, rng() - 0.5), on: 1, gate: rng() });
      for (let k = 0; k < 6; k++) this.gas.push({ a, kind: 1, u: rng(), dur: 3.5 + rng() * 2.0, n: pick(a, -0.65, 0.5), j: V(rng() - 0.5, rng() - 0.5, rng() - 0.5), on: 1, gate: rng() });
    }
    this.air = [];
    this.ductPaths.forEach((path, pi) => { for (let k = 0; k < 46; k++) this.air.push({ path, s: rng() * path.len, type: rng() < 0.21 ? 1 : 0, off: V(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(1.1), age: 1, sp: 0.75 + rng() * 0.5 }); });
    const N = this.gas.length + this.air.length;
    const g = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['aColor', 3], ['aSize', 1], ['aAlpha', 1]]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(N * size), size).setUsage(THREE.DynamicDrawUsage));
    this.gasGeo = g;
    this.gasMat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 800 }, uMicro: this.u.uMicro, uMaxPx: { value: 16 } },
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uPx, uMicro, uMaxPx;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float px = aSize * ${MICRO_SCALE} * uPx / max(-mv.z, 1e-5);
          gl_PointSize = clamp(px, 2.0, uMaxPx); vColor = aColor; vAlpha = aAlpha * uMicro;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(0.50, 0.40, d), halo = smoothstep(1.0, 0.3, d);
          vec2 q = (gl_PointCoord - 0.5) * 4.0; float shade = 0.72 + 0.5 * clamp(1.0 - length(q - vec2(-0.3, -0.35)), 0.0, 1.0);
          vec3 solid = vColor * shade * 1.25 + vec3(1.0) * pow(clamp(1.0 - length(q - vec2(-0.32, -0.36)) * 1.6, 0.0, 1.0), 2.0) * 0.5;
          gl_FragColor = vec4((solid * core + vColor * halo * halo * 0.55) * vAlpha, core * vAlpha);
        }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      transparent: true, depthWrite: false,
    });
    this.gasPoints = new THREE.Points(g, this.gasMat); this.gasPoints.frustumCulled = false; this.gasPoints.renderOrder = 4;
    this.group.add(this.gasPoints);
  }

  // ---- the surrounding parenchyma, far and out of focus
  _background() {
    const rng = this.rng; const n = 520; const geo = new THREE.IcosahedronGeometry(1, 3);
    for (const name of ['aCenter']) geo.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    geo.setAttribute('aData', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    geo.setAttribute('aDamage', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    const mesh = new THREE.InstancedMesh(geo, this._mat('BG', THREE.FrontSide, -1), n);
    const m = new THREE.Matrix4(), p = V(), s = V(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      do { p.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); } while (p.lengthSq() > 1 || p.lengthSq() < 0.02);
      const rad = 15 + Math.pow(rng(), 0.7) * 42; p.normalize().multiplyScalar(rad);
      if (Math.hypot(p.x, p.z) < 5 && p.y > 0) p.x += 9;
      const size = 1.6 + rng() * 2.4 + rad * 0.03; s.setScalar(size);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false; mesh.renderOrder = -1; this.group.add(mesh); this.bg = mesh;
  }

  /** place the acinus on the tip of a bronchiole; entry = unit vector pointing back up the airway */
  setAnchor(tip, entry) {
    this.group.quaternion.setFromUnitVectors(V(0, 1, 0), entry);
    this.group.position.copy(tip).addScaledVector(entry, -13 * MICRO_SCALE);
  }

  localToWorld(v, out = V()) { return out.copy(v).applyMatrix4(this.group.matrixWorld); }

  update(dt, phys, fade, camDist, viewportH, fovRad) {
    const u = this.u;
    u.uMicro.value = fade; this.group.visible = fade > 0.004;
    if (!this.group.visible) return;
    this.group.updateMatrixWorld(true);
    u.uTime.value += dt;
    const smoke = phys.p.smoke, con = phys.p.constrict;
    // alveolar radius follows the cube root of lung volume
    const inflate = Math.cbrt((2.4 + phys.volume) / 2.4);
    u.uInflate.value = inflate; u.uSmoke.value = smoke; u.uConstrictM.value = con; u.uDuct.value = 1 - 0.42 * con;
    u.uSat.value = THREE.MathUtils.clamp((phys.spo2 - 55) / 43, 0.2, 1);
    u.uFog.value.set(camDist * 1.1, camDist * 2.9);
    const sat = u.uSat.value, perf = phys.p.perfusion;

    // ---- red blood cells
    const m = new THREE.Matrix4(), p = V(), t = V(), nrm = V(), q = new THREE.Quaternion(), sc = V(), axis = V(), col = new THREE.Color(), Y = V(0, 1, 0);
    const capSpeed = Math.pow(perf, 0.8) / 3.0;       // fraction of a lane per second (slowed ~4x so the colour change is readable)
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]; const lane = c.lane;
      if (c.cap) {
        const a = lane.alv; const dmg = a.bad ? smoke : 0;
        c.s = (c.s + dt * capSpeed * lane.len * (1 - 0.55 * dmg)) % lane.len;
        let k = 0; while (k < lane.cum.length - 2 && lane.cum[k + 1] < c.s) k++;
        const f = (c.s - lane.cum[k]) / (lane.cum[k + 1] - lane.cum[k] || 1);
        nrm.lerpVectors(lane.pts[k], lane.pts[k + 1], f).normalize(); t.subVectors(lane.pts[k + 1], lane.pts[k]).normalize();
        const R = a.R * inflate * (1 + 0.24 * dmg);
        p.copy(a.c).addScaledVector(nrm, R + 0.05);
        axis.copy(nrm).multiplyScalar(0.8).addScaledVector(t, 0.35 * Math.sin(c.wob + c.s * 9)).normalize();
        const flow = (1 - nrm.dot(a.m)) / 2;
        const o = THREE.MathUtils.smoothstep(flow, 0.16, 0.48) * (1 - dmg) * sat;
        col.lerpColors(this.cDark, this.cBright, o);
        const edge = Math.min(1, c.s / 0.12, (lane.len - c.s) / 0.12);
        sc.setScalar(0.074 * fade * Math.max(0.01, edge) * (1 - 0.5 * dmg));
      } else {
        c.s = (c.s + dt * 0.9 * Math.pow(perf, 0.8)) % lane.len;
        let k = 0; while (k < lane.cum.length - 2 && lane.cum[k + 1] < c.s) k++;
        const f = (c.s - lane.cum[k]) / (lane.cum[k + 1] - lane.cum[k] || 1);
        p.lerpVectors(lane.pts[k], lane.pts[k + 1], f).add(c.off); t.subVectors(lane.pts[k + 1], lane.pts[k]).normalize();
        axis.set(Math.sin(c.wob + c.s * 3), Math.cos(c.wob * 1.7 + c.s * 2), Math.sin(c.wob * 0.6)).addScaledVector(t, 0.4).normalize();
        col.lerpColors(this.cDark, this.cBright, lane.oxy * sat * (1 - 0.3 * smoke));
        const edge = Math.min(1, c.s / 0.5, (lane.len - c.s) / 0.5);
        sc.setScalar(0.085 * fade * Math.max(0.01, edge));
      }
      q.setFromUnitVectors(Y, axis); m.compose(p, q, sc); this.rbc.setMatrixAt(i, m); this.rbc.setColorAt(i, col);
    }
    this.rbc.instanceMatrix.needsUpdate = true; this.rbc.instanceColor.needsUpdate = true;

    // ---- gas molecules
    const P = this.gasGeo.attributes.position.array, C = this.gasGeo.attributes.aColor.array, S = this.gasGeo.attributes.aSize.array, A = this.gasGeo.attributes.aAlpha.array;
    const o2avail = THREE.MathUtils.clamp(phys.gas.pAo2 / 100, 0.25, 1.05);
    const rate = 0.55 + 0.45 * perf;
    const a0 = V(), b0 = V(), n2 = V(); const time = u.uTime.value;
    let i = 0;
    for (const g of this.gas) {
      const a = g.a; const dmg = a.bad ? smoke : 0;
      g.u += (dt / g.dur) * rate;
      if (g.u >= 1) { g.u -= 1; g.gate = this.rng(); }
      const want = g.gate < (g.kind === 0 ? o2avail : 0.95) * (1 - dmg) ? 1 : 0;
      g.on += (want - g.on) * Math.min(1, dt * 3);
      const R = a.R * inflate * (1 + 0.24 * dmg); const uu = g.u; let alpha = Math.min(1, uu / 0.08), size = 0.2;
      if (g.kind === 0) {                     // oxygen: air -> membrane -> blood
        if (uu < 0.5) {
          a0.copy(a.c).addScaledVector(a.m, 0.55 * R).addScaledVector(g.j, 0.5 * R); b0.copy(a.c).addScaledVector(g.n, 0.9 * R);
          p.lerpVectors(a0, b0, ease(uu / 0.5));
          p.x += Math.sin(time * 2.1 + g.gate * 40) * 0.04; p.y += Math.cos(time * 1.7 + g.gate * 70) * 0.04;
        } else if (uu < 0.68) { const e = (uu - 0.5) / 0.18; p.copy(a.c).addScaledVector(g.n, R * (0.9 + 0.1 * e) + 0.05 * e); size = 0.2 + 0.12 * Math.sin(e * Math.PI); }
        else { const e = (uu - 0.68) / 0.32; n2.copy(g.n).addScaledVector(a.m, -0.7 * e).normalize(); p.copy(a.c).addScaledVector(n2, R + 0.05); alpha *= 1 - e; }
        C[i * 3] = 1.0; C[i * 3 + 1] = 0.13; C[i * 3 + 2] = 0.09;
      } else {                                // carbon dioxide: blood -> membrane -> air -> out through the duct
        if (uu < 0.2) { const e = uu / 0.2; n2.copy(g.n).addScaledVector(a.m, 0.4 * (1 - e)).normalize(); p.copy(a.c).addScaledVector(n2, R + 0.05); }
        else if (uu < 0.38) { const e = (uu - 0.2) / 0.18; p.copy(a.c).addScaledVector(g.n, R * (1 - 0.14 * e) + 0.05 * (1 - e)); size = 0.2 + 0.12 * Math.sin(e * Math.PI); }
        else {
          const e = (uu - 0.38) / 0.62; a0.copy(a.c).addScaledVector(g.n, 0.86 * R); b0.copy(a.c).addScaledVector(a.m, 1.0 * R).addScaledVector(g.j, 0.3 * R);
          p.lerpVectors(a0, b0, ease(e)); p.x += Math.sin(time * 1.9 + g.gate * 50) * 0.04; p.z += Math.cos(time * 1.6 + g.gate * 30) * 0.04;
          alpha *= Math.min(1, (1 - e) / 0.18);
        }
        C[i * 3] = 0.1; C[i * 3 + 1] = 0.42; C[i * 3 + 2] = 1.0;
      }
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; S[i] = size; A[i] = alpha * g.on; i++;
    }
    // air moving through the ducts with the breath
    const tv = Math.max(0.2, phys.tv);
    const exch = THREE.MathUtils.clamp((phys.spo2 - 60) / 37, 0.3, 1) * (1 - 0.35 * smoke);
    for (const g of this.air) {
      const path = g.path; const K = (path.len * 1.3 / 0.5) * Math.pow(0.5 / tv, 0.45);
      g.s += phys.flow * dt * K * g.sp; g.age = Math.min(1, g.age + dt * 2);
      if (g.s > path.len) { g.s = 0; g.age = 0; g.type = this.rng() < 0.21 * phys.p.o2 + 0.0 ? 1 : 0; }
      else if (g.s < 0) { g.s = path.len; g.age = 0; const r = this.rng(); g.type = r < 0.16 ? 1 : (r < 0.16 + 0.06 * exch ? 2 : 0); }
      let k = 0; while (k < path.cum.length - 2 && path.cum[k + 1] < g.s) k++;
      const f = (g.s - path.cum[k]) / (path.cum[k + 1] - path.cum[k] || 1);
      const lum = (1 - 0.42 * con * (g.s < path.len * 0.6 ? 1 : 0.4));
      p.lerpVectors(path.pts[k], path.pts[k + 1], f).addScaledVector(g.off, lum);
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      if (g.type === 1) { C[i * 3] = 1.0; C[i * 3 + 1] = 0.2; C[i * 3 + 2] = 0.14; S[i] = 0.17; }
      else if (g.type === 2) { C[i * 3] = 0.2; C[i * 3 + 1] = 0.52; C[i * 3 + 2] = 1.0; S[i] = 0.17; }
      else { C[i * 3] = 0.42; C[i * 3 + 1] = 0.5; C[i * 3 + 2] = 0.58; S[i] = 0.08; }
      A[i] = g.age * Math.min(1, g.s / 0.6, (path.len - g.s) / 0.6) * (g.type === 0 ? 0.55 : 1) * phys.p.o2 ** (g.type === 0 ? 0 : 0);
      i++;
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.gasGeo.attributes[name].needsUpdate = true;
    this.gasMat.uniforms.uPx.value = viewportH / (2 * Math.tan(fovRad / 2));
    this.gasMat.uniforms.uMaxPx.value = 18 * (window.devicePixelRatio > 1 ? 1.5 : 1);
  }
}
