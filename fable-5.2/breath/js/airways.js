// The bronchial tree: real centrelines (BodyParts3D) for the first generations, then procedural
// growth by space colonisation into each lobe, plus the air-flow particle system.
import * as THREE from 'three';
import { shared, FIELD_GLSL, constrictScale, deformPoint, W_LUNG } from './deform.js';

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const STEP = 0.06, KILL = 0.075, INFLUENCE = 1.3, TIP_R = 0.0062;

export class Airways {
  constructor(data, anatomy) {
    this.rng = mulberry32(7);
    this._load(data);
    this._grow(data.attractors);
    this._finish();
    this.group = new THREE.Group();
    this._buildTubes(anatomy);
    this._buildRoutes();
    this._buildParticles();
  }

  _load(data) {
    const n = data.nodes.length / 5;
    this.px = []; this.py = []; this.pz = []; this.r = []; this.parent = []; this.real = []; this.lobe = [];
    for (let i = 0; i < n; i++) {
      this.px.push(data.nodes[i * 5]); this.py.push(data.nodes[i * 5 + 1]); this.pz.push(data.nodes[i * 5 + 2]);
      this.r.push(data.nodes[i * 5 + 3]); this.parent.push(data.nodes[i * 5 + 4]); this.real.push(true); this.lobe.push(-1);
    }
    this.realCount = n; this.carina = data.carina;
  }

  _children() {
    const ch = this.px.map(() => []);
    for (let i = 0; i < this.px.length; i++) if (this.parent[i] >= 0) ch[this.parent[i]].push(i);
    return ch;
  }

  // ------------------------------------------------------------ space colonisation
  _grow(attr) {
    const { px, py, pz } = this; const rng = this.rng;
    const lobes = Object.keys(attr);
    // flatten attractors
    const ax = [], ay = [], az = [], al = [];
    lobes.forEach((name, li) => { const a = attr[name]; for (let i = 0; i < a.length; i += 3) { ax.push(a[i]); ay.push(a[i + 1]); az.push(a[i + 2]); al.push(li); } });
    const nA = ax.length; const alive = new Uint8Array(nA).fill(1);
    const d2 = (i, x, y, z) => { const dx = px[i] - x, dy = py[i] - y, dz = pz[i] - z; return dx * dx + dy * dy + dz * dz; };

    // real tips: assign each to the lobe of its nearest attractor
    const ch = this._children();
    const tips = [];
    for (let i = 0; i < this.realCount; i++) if (ch[i].length === 0) {
      let best = Infinity, bl = 0;
      for (let a = 0; a < nA; a++) { const d = d2(i, ax[a], ay[a], az[a]); if (d < best) { best = d; bl = al[a]; } }
      this.lobe[i] = bl; tips.push(i);
    }
    // the real tree already supplies its own neighbourhood
    for (let a = 0; a < nA; a++) for (let i = this.carina + 1; i < this.realCount; i++) if (d2(i, ax[a], ay[a], az[a]) < KILL * KILL) { alive[a] = 0; break; }

    // direction of each growable node
    const dir = new Map();
    for (const t of tips) {
      const p = this.parent[t]; const v = new THREE.Vector3(px[t] - px[p], py[t] - py[p], pz[t] - pz[p]).normalize(); dir.set(t, v);
    }
    const nearest = new Int32Array(nA).fill(-1); const nearD = new Float32Array(nA).fill(Infinity);
    let fresh = tips.slice();
    const kids = new Map();
    for (let iter = 0; iter < 90 && fresh.length; iter++) {
      // only the freshly added nodes can become a new nearest neighbour
      for (let a = 0; a < nA; a++) {
        if (!alive[a]) continue;
        for (const i of fresh) {
          if (this.lobe[i] !== al[a]) continue;
          const d = d2(i, ax[a], ay[a], az[a]);
          if (d < nearD[a]) { nearD[a] = d; nearest[a] = i; }
        }
        if (nearD[a] < KILL * KILL) alive[a] = 0;
      }
      const acc = new Map();
      for (let a = 0; a < nA; a++) {
        if (!alive[a] || nearest[a] < 0 || nearD[a] > INFLUENCE * INFLUENCE) continue;
        const i = nearest[a]; const l = Math.sqrt(nearD[a]) || 1;
        let v = acc.get(i); if (!v) { v = new THREE.Vector3(); acc.set(i, v); }
        v.x += (ax[a] - px[i]) / l; v.y += (ay[a] - py[i]) / l; v.z += (az[a] - pz[i]) / l;
      }
      fresh = [];
      for (const [i, v] of acc) {
        v.normalize().addScaledVector(dir.get(i), 0.55).normalize();
        const list = kids.get(i) || [];
        if (list.some((k) => dir.get(k).dot(v) > 0.965)) continue;      // already growing that way
        if (list.length >= 2) continue;                                   // airways divide by dichotomy
        const j = px.length;
        px.push(px[i] + v.x * STEP + (rng() - 0.5) * 0.006); py.push(py[i] + v.y * STEP + (rng() - 0.5) * 0.006); pz.push(pz[i] + v.z * STEP + (rng() - 0.5) * 0.006);
        this.r.push(TIP_R); this.parent.push(i); this.real.push(false); this.lobe.push(this.lobe[i]);
        dir.set(j, v.clone()); list.push(j); kids.set(i, list); fresh.push(j);
      }
    }
  }

  // ------------------------------------------------------------ radii, generations, smoothing
  _finish() {
    const n = this.px.length; const { px, py, pz, r, parent, real } = this;
    let ch = this._children();
    // drop single-node stubs growing off forks
    // smooth procedural chains
    for (let it = 0; it < 2; it++) {
      const nx = px.slice(), ny = py.slice(), nz = pz.slice();
      for (let i = this.realCount; i < n; i++) if (ch[i].length === 1) {
        const a = parent[i], b = ch[i][0];
        nx[i] = 0.25 * px[a] + 0.5 * px[i] + 0.25 * px[b]; ny[i] = 0.25 * py[a] + 0.5 * py[i] + 0.25 * py[b]; nz[i] = 0.25 * pz[a] + 0.5 * pz[i] + 0.25 * pz[b];
      }
      for (let i = this.realCount; i < n; i++) { px[i] = nx[i]; py[i] = ny[i]; pz[i] = nz[i]; }
    }
    // Murray's law: r_parent^3 = sum r_child^3 (processed leaves-first; children always have larger indices)
    for (let i = n - 1; i >= this.realCount; i--) {
      if (ch[i].length) { let s = 0; for (const c of ch[i]) s += r[c] ** 3; r[i] = Math.cbrt(s); }
    }
    // match each procedural subtree to the radius of the real tip it sprouts from
    const scale = new Float32Array(n).fill(1);
    for (let i = this.realCount; i < n; i++) {
      const p = parent[i];
      scale[i] = real[p] ? THREE.MathUtils.clamp((r[p] * 0.92) / r[i], 0.75, 2.2) : scale[p];
    }
    for (let i = this.realCount; i < n; i++) r[i] = Math.max(0.0045, r[i] * scale[i]);
    // never wider than the parent
    for (let i = this.realCount; i < n; i++) r[i] = Math.min(r[i], r[parent[i]]);

    this.children = ch;
    this.gen = new Int32Array(n);
    // breadth-first from the top of the trachea (generation 0); every fork starts a new generation
    const queue = [0];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (const c of ch[i]) { this.gen[c] = this.gen[i] + (ch[i].length > 1 ? 1 : 0); queue.push(c); }
    }
    this.maxGen = 0; for (let i = 0; i < n; i++) if (this.gen[i] > this.maxGen) this.maxGen = this.gen[i];
    this.tips = []; for (let i = 0; i < n; i++) if (ch[i].length === 0) this.tips.push(i);
    this.count = n;
  }

  pos(i, out = new THREE.Vector3()) { return out.set(this.px[i], this.py[i], this.pz[i]); }
  pathTo(i) { const p = []; while (i >= 0) { p.push(i); i = this.parent[i]; } return p.reverse(); }

  // ------------------------------------------------------------ swept tubes for the procedural branches
  _buildTubes(anatomy) {
    const { px, py, pz, r, parent, real, children } = this;
    const pos = [], nor = [], cen = [], rad = [], idx = [];
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Vector3(), tmp = new THREE.Vector3();
    const starts = [];
    for (let i = this.realCount; i < this.count; i++) { const p = parent[i]; if (real[p] || children[p].length > 1) starts.push(i); }
    for (const s of starts) {
      const chain = [parent[s], s];
      let c = s; while (children[c].length === 1) { c = children[c][0]; chain.push(c); }
      const r0 = r[s];
      const seg = r0 > 0.014 ? 10 : (r0 > 0.008 ? 8 : 6);
      // initial frame
      T.set(px[chain[1]] - px[chain[0]], py[chain[1]] - py[chain[0]], pz[chain[1]] - pz[chain[0]]).normalize();
      N.set(0, 1, 0); if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
      N.addScaledVector(T, -N.dot(T)).normalize();
      const base = pos.length / 3;
      for (let k = 0; k < chain.length; k++) {
        const a = chain[Math.max(0, k - 1)], b = chain[Math.min(chain.length - 1, k + 1)];
        Q.set(px[b] - px[a], py[b] - py[a], pz[b] - pz[a]).normalize();
        // parallel transport
        N.addScaledVector(Q, -N.dot(Q)).normalize(); B.crossVectors(Q, N);
        P.set(px[chain[k]], py[chain[k]], pz[chain[k]]);
        let rr = k === 0 ? r0 : r[chain[k]];
        const isTip = k === chain.length - 1 && children[chain[k]].length === 0;
        if (isTip) rr *= 0.45;
        for (let j = 0; j < seg; j++) {
          const a2 = (j / seg) * Math.PI * 2; const cs = Math.cos(a2), sn = Math.sin(a2);
          tmp.set(N.x * cs + B.x * sn, N.y * cs + B.y * sn, N.z * cs + B.z * sn);
          pos.push(P.x + tmp.x * rr, P.y + tmp.y * rr, P.z + tmp.z * rr); nor.push(tmp.x, tmp.y, tmp.z);
          cen.push(P.x, P.y, P.z); rad.push(rr);
        }
        if (k > 0) for (let j = 0; j < seg; j++) {
          const a0 = base + (k - 1) * seg + j, a1 = base + (k - 1) * seg + (j + 1) % seg, b0 = a0 + seg, b1 = a1 + seg;
          idx.push(a0, a1, b0, a1, b1, b0);
        }
        if (isTip) {            // round the end off so the twig is closed
          const k2 = chain.length; const tipR = rr;
          for (let j = 0; j < seg; j++) {
            const a2 = (j / seg) * Math.PI * 2; const cs = Math.cos(a2), sn = Math.sin(a2);
            tmp.set(N.x * cs + B.x * sn, N.y * cs + B.y * sn, N.z * cs + B.z * sn);
            pos.push(P.x + Q.x * tipR * 0.9 + tmp.x * tipR * 0.08, P.y + Q.y * tipR * 0.9 + tmp.y * tipR * 0.08, P.z + Q.z * tipR * 0.9 + tmp.z * tipR * 0.08);
            nor.push(Q.x, Q.y, Q.z); cen.push(P.x, P.y, P.z); rad.push(tipR);
            const a0 = base + (k2 - 1) * seg + j, a1 = base + (k2 - 1) * seg + (j + 1) % seg;
            idx.push(a0, a1, a0 + seg, a1, a1 + seg, a0 + seg);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('_centre', new THREE.Float32BufferAttribute(cen, 3));
    g.setAttribute('_radius', new THREE.Float32BufferAttribute(rad, 1));
    g.setIndex(idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.tubeGeometry = g;
    const { inner, shell } = anatomy.makeAirwayMaterials(false);
    anatomy._add('tree', 'airway', g, inner, { order: 0, pick: false });
    anatomy._add('tree', 'airway', g, shell, { order: 2, part: 'airway' });
  }

  // ------------------------------------------------------------ particle routes (root -> tip polylines)
  _buildRoutes() {
    const rng = this.rng; const tips = this.tips.filter((t) => !this.real[t]);
    const chosen = [];
    const want = Math.min(520, tips.length);
    const stride = tips.length / want;
    for (let k = 0; k < want; k++) chosen.push(tips[Math.min(tips.length - 1, Math.floor(k * stride + rng() * stride))]);
    this.routes = chosen.map((tip) => {
      const nodes = this.pathTo(tip); const n = nodes.length;
      const p = new Float32Array(n * 4); const cum = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const i = nodes[k]; p[k * 4] = this.px[i]; p[k * 4 + 1] = this.py[i]; p[k * 4 + 2] = this.pz[i]; p[k * 4 + 3] = this.r[i];
        if (k) cum[k] = cum[k - 1] + Math.hypot(p[k * 4] - p[k * 4 - 4], p[k * 4 + 1] - p[k * 4 - 3], p[k * 4 + 2] - p[k * 4 - 2]);
      }
      return { p, cum, n, len: cum[n - 1], tip };
    });
    this.meanLen = this.routes.reduce((s, r) => s + r.len, 0) / this.routes.length;
  }

  // ------------------------------------------------------------ air particles
  _buildParticles() {
    const N = 6500; this.N = N; const rng = this.rng;
    this.pRoute = new Uint16Array(N); this.pS = new Float32Array(N); this.pSeg = new Uint16Array(N);
    this.pOff = new Float32Array(N * 3); this.pType = new Uint8Array(N); this.pAge = new Float32Array(N); this.pSpeed = new Float32Array(N);
    const position = new Float32Array(N * 3), color = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.pRoute[i] = Math.floor(rng() * this.routes.length);
      this.pS[i] = rng() * this.routes[this.pRoute[i]].len;
      // random offset inside the unit ball -> fills the lumen
      let x, y, z; do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; } while (x * x + y * y + z * z > 1);
      this.pOff[i * 3] = x; this.pOff[i * 3 + 1] = y; this.pOff[i * 3 + 2] = z;
      this.pSpeed[i] = 0.75 + rng() * 0.5; this.pAge[i] = 1;
      this._assignType(i, true, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.pGeo = g;
    this.pMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uW: { value: new THREE.Vector4(1, 1, 0, 0) }, uRigid: { value: new THREE.Vector4() }, uPx: { value: 800 }, uFade: { value: 1 }, uMaxPx: { value: 9 } },
      vertexShader: /* glsl */`
        ${FIELD_GLSL}
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        uniform float uPx; uniform float uMaxPx; uniform float uFade;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec3 p = position + breathDisp(position);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = aSize * uPx / max(-mv.z, 0.001);
          gl_PointSize = clamp(px, 1.6, uMaxPx);
          vColor = aColor; vAlpha = aAlpha * uFade * clamp(px / 1.6, 0.35, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
          float a = smoothstep(1.0, 0.15, d);
          gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
        }`,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true,
    });
    this.points = new THREE.Points(g, this.pMat);
    this.points.frustumCulled = false; this.points.renderOrder = 1;
    this.group.add(this.points);
    this.density = 1; this.o2Frac = 0.21;
  }

  // gas mix: inhaled air is 21 % O2 / ~0 % CO2; exhaled air ~16 % O2 / ~4.5 % CO2 (rest is nitrogen)
  _assignType(i, inhaled, exchange) {
    const u = this.rng();
    if (inhaled) this.pType[i] = u < 0.21 ? 1 : 0;
    else { const o = 0.21 - 0.05 * exchange; this.pType[i] = u < o ? 1 : (u < o + 0.045 * exchange + 0.005 ? 2 : 0); }
  }

  /**
   * flow: L/s (+ in), tv: current tidal volume (L), density: relative air density (altitude),
   * exchange: how much O2 the lungs manage to swap for CO2 (0..1)
   */
  updateParticles(dt, phys, levelF, viewportH, fovRad) {
    const position = this.pGeo.attributes.position.array, color = this.pGeo.attributes.aColor.array, size = this.pGeo.attributes.aSize.array, alpha = this.pGeo.attributes.aAlpha.array;
    const flow = phys.flow, tv = Math.max(0.2, phys.tv);
    // a full breath carries air a little further than the whole conducting tree (anatomical dead space ~150 mL)
    const K = (this.meanLen * 1.25 / 0.5) * Math.pow(0.5 / tv, 0.45);
    const ds = flow * dt * K;
    const con = shared.uConstrict.value;
    const density = phys.p.o2;              // thinner air at altitude -> fewer molecules per breath
    const exchange = THREE.MathUtils.clamp((phys.spo2 - 60) / 37, 0.3, 1) * (1 - 0.35 * phys.p.smoke);
    const nAlive = Math.floor(this.N * density);
    const zoom = THREE.MathUtils.smoothstep(levelF, 0.1, 1.0);
    const baseSize = THREE.MathUtils.lerp(0.02, 0.0085, zoom);
    const flowGlow = 0.45 + 0.55 * Math.min(1, Math.abs(flow) / (tv * 0.9 + 0.2));
    for (let i = 0; i < this.N; i++) {
      if (i >= nAlive) { alpha[i] = 0; size[i] = 0; continue; }
      let route = this.routes[this.pRoute[i]];
      let s = this.pS[i] + ds * this.pSpeed[i];
      this.pAge[i] = Math.min(1, this.pAge[i] + dt * 2.5);
      if (s > route.len) {            // absorbed into the alveoli -> a new parcel of air enters at the top
        this.pRoute[i] = Math.floor(this.rng() * this.routes.length); route = this.routes[this.pRoute[i]];
        s = (s - route.len) % route.len * 0.2; this.pSeg[i] = 0; this.pAge[i] = 0; this._assignType(i, true, exchange);
      } else if (s < 0) {             // breathed out -> a new parcel leaves the alveoli
        this.pRoute[i] = Math.floor(this.rng() * this.routes.length); route = this.routes[this.pRoute[i]];
        s = route.len + s * 0.2; if (s < 0) s = route.len; this.pSeg[i] = route.n - 2; this.pAge[i] = 0; this._assignType(i, false, exchange);
      }
      this.pS[i] = s;
      let k = Math.min(this.pSeg[i], route.n - 2);
      const cum = route.cum;
      while (k < route.n - 2 && cum[k + 1] < s) k++;
      while (k > 0 && cum[k] > s) k--;
      this.pSeg[i] = k;
      const t = (s - cum[k]) / (cum[k + 1] - cum[k] || 1); const p = route.p; const a = k * 4, b = a + 4;
      const rr = (p[a + 3] + (p[b + 3] - p[a + 3]) * t);
      const lumen = rr * 0.62 * constrictScale(rr, con);
      position[i * 3] = p[a] + (p[b] - p[a]) * t + this.pOff[i * 3] * lumen;
      position[i * 3 + 1] = p[a + 1] + (p[b + 1] - p[a + 1]) * t + this.pOff[i * 3 + 1] * lumen;
      position[i * 3 + 2] = p[a + 2] + (p[b + 2] - p[a + 2]) * t + this.pOff[i * 3 + 2] * lumen;
      const ty = this.pType[i];
      if (ty === 1) { color[i * 3] = 1.0; color[i * 3 + 1] = 0.22; color[i * 3 + 2] = 0.16; size[i] = baseSize * 1.15; }
      else if (ty === 2) { color[i * 3] = 0.18; color[i * 3 + 1] = 0.5; color[i * 3 + 2] = 1.0; size[i] = baseSize * 1.25; }
      else { color[i * 3] = 0.5; color[i * 3 + 1] = 0.62; color[i * 3 + 2] = 0.72; size[i] = baseSize * 0.8; }
      const edge = Math.min(1, s / 0.12) * Math.min(1, (route.len - s) / 0.05 + 0.25);
      alpha[i] = this.pAge[i] * edge * flowGlow * (ty === 0 ? 0.5 : 1.0);
    }
    this.pGeo.attributes.position.needsUpdate = true; this.pGeo.attributes.aColor.needsUpdate = true;
    this.pGeo.attributes.aSize.needsUpdate = true; this.pGeo.attributes.aAlpha.needsUpdate = true;
    this.pMat.uniforms.uPx.value = viewportH / (2 * Math.tan(fovRad / 2));
    this.pMat.uniforms.uMaxPx.value = THREE.MathUtils.lerp(7, 11, zoom) * (window.devicePixelRatio > 1 ? 1.5 : 1);
    const fade = 1 - THREE.MathUtils.smoothstep(levelF, 1.4, 1.9);
    this.pMat.uniforms.uFade.value = fade; this.points.visible = fade > 0.004;
  }

  /** Pick the branch the camera follows: a deep, forward-facing twig in the right lung. */
  chooseHeroTip() {
    let best = -1, bs = -Infinity;
    for (const route of this.routes) {
      const t = route.tip; const x = this.px[t], y = this.py[t], z = this.pz[t];
      if (this.gen[t] < 8) continue;
      // prefer a twig that heads downwards, so its alveoli hang like a bunch of grapes
      const nodes = this.pathTo(t); const up = nodes[Math.max(0, nodes.length - 4)];
      const hang = (this.py[up] - y) / (Math.hypot(this.px[up] - x, this.py[up] - y, this.pz[up] - z) || 1);
      const score = z * 0.9 - Math.abs(y + 0.2) * 0.6 - Math.abs(x + 0.8) * 0.7 + hang * 1.6;
      if (score > bs) { bs = score; best = t; }
    }
    return best >= 0 ? best : this.routes[0].tip;
  }

  /** world-space (breathing) position of a node */
  nodeWorld(i, out = new THREE.Vector3()) { return deformPoint(this.pos(i, out), W_LUNG, out); }
}
