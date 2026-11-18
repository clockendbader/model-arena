// Alveolar micro-scene. Units: 1 = 100 µm.
// An alveolar duct ends in a grape-like cluster of alveoli (≈200 µm across),
// each wrapped in pulmonary capillaries running from an arteriole (deoxygenated,
// ~75% saturated) to a venule (oxygenated). O2 (red) diffuses from the air sac
// into the blood; CO2 (blue) diffuses from the blood into the air sac.
import * as THREE from 'three';
import { NOISE_GLSL } from './breathing.js';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export class AlveolusScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.pickables = [];
    this.time = 0;
    this.build();
  }

  build() {
    seed = 7;
    const G = this.group;
    // --- alveolar duct (comes from a respiratory bronchiole on the left)
    const ductCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-9, 1.2, -1.5), new THREE.Vector3(-6, 0.7, -0.8), new THREE.Vector3(-3.2, 0.2, -0.2), new THREE.Vector3(-0.8, 0, 0),
    ]);
    this.ductCurve = ductCurve;
    const memMat = (color, opacity) => {
      const m = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0xffc4cc), sheenRoughness: 0.4,
        transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.3,
      });
      m.userData.u = { uDamage: { value: 0 }, uPulse: { value: 0 } };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, m.userData.u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vOP;\nuniform float uDamage; uniform float uPulse;\n${NOISE_GLSL}`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float n = fbm(vOP * 2.6);
            diffuseColor.rgb *= 0.85 + 0.3 * n;
            vec3 tarCol = mix(vec3(0.32,0.28,0.27), vec3(0.08,0.07,0.07), smoothstep(0.45, 0.75, fbm(vOP * 5.0)));
            diffuseColor.rgb = mix(diffuseColor.rgb, tarCol, uDamage * 0.85);`)
          .replace('#include <opaque_fragment>', `
            float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
            float rim = pow(1.0 - ndv, 2.0);
            outgoingLight += vec3(1.0, 0.45, 0.5) * rim * 0.35 * (1.0 - uDamage);
            diffuseColor.a = diffuseColor.a * (0.35 + 0.95 * rim);
            #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => 'membrane';
      return m;
    };
    const duct = new THREE.Mesh(new THREE.TubeGeometry(ductCurve, 64, 0.85, 24, false), memMat(0xf0a0a8, 0.55));
    duct.userData.partId = 'alveolar_duct';
    G.add(duct); this.pickables.push(duct);
    this.duct = duct;

    // --- alveoli: grape-like cluster around the duct end, plus some lining the duct
    const centers = [];
    const dirs = [];
    const n = 15;
    for (let i = 0; i < n; i++) { // fibonacci directions biased away from the duct
      const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      if (d.x < -0.55) continue;
      dirs.push(d);
    }
    for (const d of dirs) centers.push({ c: d.clone().multiplyScalar(1.75).add(new THREE.Vector3(0.6, 0, 0)), r: 0.95 + rnd() * 0.25 });
    for (let k = 0; k < 4; k++) { // alveoli opening into the duct wall
      const t = 0.45 + k * 0.14, p = ductCurve.getPoint(t);
      const ang = k * 2.2 + 0.6;
      centers.push({ c: p.clone().add(new THREE.Vector3(0, Math.cos(ang) * 1.45, Math.sin(ang) * 1.45)), r: 0.85 + rnd() * 0.15, wall: true });
    }
    this.alveoli = [];
    centers.forEach((a, i) => {
      const geo = new THREE.SphereGeometry(a.r, 48, 32);
      const pa = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let k = 0; k < pa.count; k++) { // gentle irregularity
        v.fromBufferAttribute(pa, k);
        const s = 1 + 0.05 * Math.sin(v.x * 5.1 + i) * Math.sin(v.y * 4.3 + i * 2) + 0.03 * Math.sin(v.z * 7.7);
        v.multiplyScalar(s); pa.setXYZ(k, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const mat = memMat(0xf3aab2, 0.5);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(a.c);
      mesh.userData.partId = 'alveolus';
      mesh.userData.index = i;
      G.add(mesh); this.pickables.push(mesh);
      this.alveoli.push({ mesh, c: a.c.clone(), r: a.r, damage: 0, damageTarget: 0, caps: [], mat });
    });
    // alveoli that become emphysematous in the smoker scenario (~40%)
    this.damagedSet = new Set([1, 4, 6, 9, 12, 15]);

    // --- arteriole (blue, deoxygenated) and venule (red, oxygenated)
    const art = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-8, -2.8, 2.6), new THREE.Vector3(-3, -2.4, 2.4), new THREE.Vector3(0.5, -2.9, 2.6), new THREE.Vector3(3.5, -3.6, 1.8), new THREE.Vector3(6, -4.5, 1.2),
    ]);
    const ven = new THREE.CatmullRomCurve3([
      new THREE.Vector3(6, 4.5, -1.4), new THREE.Vector3(3.6, 3.6, -2.0), new THREE.Vector3(0.5, 3.0, -2.7), new THREE.Vector3(-3, 2.6, -2.6), new THREE.Vector3(-8, 3.0, -2.8),
    ]);
    this.artCurve = art; this.venCurve = ven;
    const vesselMat = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.7, sheen: 0.5, sheenColor: new THREE.Color(c).offsetHSL(0, 0, 0.2), transparent: true, opacity: 0.9 });
    const artMesh = new THREE.Mesh(new THREE.TubeGeometry(art, 80, 0.28, 20, false), vesselMat(0x4a3d9e));
    artMesh.userData.partId = 'arteriole';
    const venMesh = new THREE.Mesh(new THREE.TubeGeometry(ven, 80, 0.3, 20, false), vesselMat(0xc4223a));
    venMesh.userData.partId = 'venule';
    G.add(artMesh, venMesh); this.pickables.push(artMesh, venMesh);

    // --- capillaries: from arteriole, over the surface of each alveolus, to venule
    this.capillaries = [];
    const capMatBase = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const deoxy = new THREE.Color(0x5b3d8f), oxy = new THREE.Color(0xd8263c);
    const closest = (curve, p) => { let best = 0, bd = 1e9; for (let t = 0; t <= 1; t += 0.01) { const d = curve.getPoint(t).distanceToSquared(p); if (d < bd) { bd = d; best = t; } } return best; };
    this.alveoli.forEach((al, ai) => {
      const nCap = al.wall ? 2 : 3;
      for (let k = 0; k < nCap; k++) {
        const start = art.getPoint(Math.min(1, Math.max(0, closest(art, al.c) + (rnd() - 0.5) * 0.12)));
        const end = ven.getPoint(Math.min(1, Math.max(0, closest(ven, al.c) + (rnd() - 0.5) * 0.12)));
        // meander over the sphere surface between the two attachment directions
        const d0 = start.clone().sub(al.c).normalize(), d1 = end.clone().sub(al.c).normalize();
        const side = new THREE.Vector3().crossVectors(d0, d1).normalize();
        const pts = [start];
        const steps = 9;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const dir = d0.clone().lerp(d1, t).normalize();
          dir.addScaledVector(side, Math.sin(t * Math.PI) * (k - (nCap - 1) / 2) * 0.9 + Math.sin(t * 9 + k * 3) * 0.12).normalize();
          pts.push(al.c.clone().addScaledVector(dir, al.r * 1.06 + 0.05));
        }
        pts.push(end);
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const geo = new THREE.TubeGeometry(curve, 90, 0.085, 10, false);
        // colour along the capillary: deoxygenated → oxygenated within the first third
        const cols = [];
        const pa = geo.attributes.position;
        const segs = 90, radial = 10;
        for (let iS = 0; iS <= segs; iS++) {
          const t = iS / segs;
          const c = deoxy.clone().lerp(oxy, 1 - Math.exp(-t / 0.13));
          for (let r = 0; r <= radial; r++) cols.push(c.r, c.g, c.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols.slice(0, pa.count * 3), 3));
        const mat = capMatBase.clone();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.partId = 'capillary';
        G.add(mesh); this.pickables.push(mesh);
        const cap = { curve, mesh, mat, alveolus: ai, len: curve.getLength(), samples: curve.getSpacedPoints(200) };
        this.capillaries.push(cap);
        al.caps.push(cap);
      }
    });

    // --- red blood cells (biconcave discs), instanced
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, r = t * 0.12;
      const h = 0.05 * Math.sqrt(Math.max(0, 1 - t * t)) * (0.45 + 1.1 * t * t);
      prof.push(new THREE.Vector2(r, h));
    }
    for (let i = 16; i >= 0; i--) prof.push(new THREE.Vector2(prof[i].x, -prof[i].y));
    const rbcGeo = new THREE.LatheGeometry(prof, 24);
    rbcGeo.computeVertexNormals();
    const rbcMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, clearcoat: 0.5, sheen: 0.6, sheenColor: new THREE.Color(0xff8090) });
    this.rbcPerCap = 9;
    this.rbcCount = this.capillaries.length * this.rbcPerCap;
    this.rbc = new THREE.InstancedMesh(rbcGeo, rbcMat, this.rbcCount);
    this.rbc.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rbc.userData.partId = 'rbc';
    this.rbcState = [];
    for (let i = 0; i < this.rbcCount; i++) {
      const cap = this.capillaries[Math.floor(i / this.rbcPerCap)];
      this.rbcState.push({ cap, t: (i % this.rbcPerCap) / this.rbcPerCap + rnd() * 0.05, spin: rnd() * 6.28 });
      this.rbc.setColorAt(i, new THREE.Color(0x5a0f1f));
    }
    G.add(this.rbc); this.pickables.push(this.rbc);

    // --- gas molecules
    this.gas = this.makePoints(900);
    this.air = this.makePoints(700);
    G.add(this.gas.points, this.air.points);
    this.o2Col = new THREE.Color(0xff3b4d);
    this.co2Col = new THREE.Color(0x3f7bff);
    this.airO2 = new THREE.Color(0xff8a94);
    this.molecules = [];
    for (let i = 0; i < this.gas.count; i++) this.molecules.push({ alive: false });
    this.airMol = [];
    for (let i = 0; i < this.air.count; i++) this.airMol.push(this.spawnAir({}));

    // --- smoke/tar particles lodged in damaged tissue
    this.tarDots = this.makePoints(300, true);
    G.add(this.tarDots.points);
    for (let i = 0; i < this.tarDots.count; i++) {
      const al = this.alveoli[[...this.damagedSet][i % this.damagedSet.size]];
      const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const p = al.c.clone().addScaledVector(d, al.r * (0.98 + rnd() * 0.06));
      this.tarDots.pos.set([p.x, p.y, p.z], i * 3);
      this.tarDots.col.set([0.06, 0.05, 0.05], i * 3);
      this.tarDots.size[i] = 0.6 + rnd() * 1.4;
    }
    this.tarDots.points.geometry.attributes.position.needsUpdate = true;
    this.tarDots.points.geometry.attributes.color.needsUpdate = true;

    // lighting for the micro world
    const key = new THREE.DirectionalLight(0xfff1ea, 2.2); key.position.set(4, 6, 8);
    const rim = new THREE.DirectionalLight(0x88b4ff, 1.6); rim.position.set(-6, -2, -6);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffe6e8, 0x1a1020, 0.6));
    this.labelAnchors = {
      alveolus: this.alveoli[2].c.clone().add(new THREE.Vector3(0, this.alveoli[2].r, 0)),
      capillary: this.capillaries[5].curve.getPoint(0.5),
      rbc: this.capillaries[8].curve.getPoint(0.3),
      arteriole: art.getPoint(0.2),
      venule: ven.getPoint(0.8),
      alveolar_duct: ductCurve.getPoint(0.3),
    };
  }

  makePoints(count, dark = false) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), alpha = new Float32Array(count), size = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 1 }, uScale: { value: 60 } },
      vertexShader: /* glsl */`
        attribute float alpha; attribute float size; attribute vec3 color; varying float vA; varying vec3 vC;
        uniform float uPx; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(size * uScale * uPx / -mv.z, 0.0, 40.0 * uPx); vA = alpha; vC = color; }`,
      fragmentShader: dark ? /* glsl */`
        varying float vA; varying vec3 vC;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.25, 0.12, d)); }` : /* glsl */`
        varying float vA; varying vec3 vC;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard;
          float core = smoothstep(0.25, 0.0, d); float a = (0.35 * core + 0.65 * exp(-d * 30.0)) * vA;
          gl_FragColor = vec4(vC * (0.6 + 0.9 * exp(-d * 40.0)) * a, a); }`,
      transparent: true, depthWrite: false, blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 40;
    return { points, pos, col, alpha, size, count, mat };
  }

  spawnAir(m) {
    // O2 molecules in the alveolar/duct air (density ∝ alveolar PO2)
    const inDuct = rnd() < 0.3;
    if (inDuct) {
      m.base = this.ductCurve.getPoint(rnd()).add(new THREE.Vector3((rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2));
      m.al = -1;
    } else {
      const ai = Math.floor(rnd() * this.alveoli.length);
      const al = this.alveoli[ai];
      const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      m.base = al.c.clone().addScaledVector(d, al.r * Math.cbrt(rnd()) * 0.85);
      m.al = ai;
    }
    m.ph = rnd() * 6.28; m.k = rnd();
    return m;
  }

  spawnExchange(m, type) {
    const fn = this.alveoli.filter(a => a.damage < 0.5);
    if (!fn.length) return false;
    const al = fn[Math.floor(rnd() * fn.length)];
    if (!al.caps.length) return false;
    const cap = al.caps[Math.floor(rnd() * al.caps.length)];
    const t = 0.08 + rnd() * 0.45;
    const capPt = cap.samples[Math.floor(t * 200)].clone();
    const inside = al.c.clone().lerp(capPt, 0.35 + rnd() * 0.25).add(new THREE.Vector3((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4));
    m.alive = true; m.type = type; m.cap = cap; m.t0 = t; m.age = 0;
    m.dur = 1.6 + rnd() * 0.8;
    if (type === 'o2') { m.from = inside; m.to = capPt; } else { m.from = capPt; m.to = inside; }
    return true;
  }

  setScenario() {}

  update(dt, phys, opts) {
    this.time += dt;
    const p = phys.p;
    // alveoli inflate a little with each breath (alveolar volume change ≈ 10–20%)
    const infl = 1 + 0.045 * phys.v * Math.min(2.2, phys.vt / 500);
    this.alveoli.forEach((al, i) => {
      al.damageTarget = this.damagedSet.has(i) ? p.damage : 0;
      al.damage += (al.damageTarget - al.damage) * (1 - Math.exp(-dt / 0.8));
      // emphysema: damaged sacs merge into larger, floppier, darker spaces
      const s = infl * (1 + al.damage * 0.22);
      al.mesh.scale.setScalar(s);
      al.mat.userData.u.uDamage.value = al.damage;
      al.mat.opacity = 0.5 - al.damage * 0.1;
      for (const cap of al.caps) {
        cap.mat.opacity = 0.55 * (1 - al.damage * 0.9);
        cap.mesh.visible = cap.mat.opacity > 0.02;
      }
    });
    this.duct.scale.setScalar(1);

    // red blood cells: slow-motion transit; speed scales with cardiac output (heart rate)
    const speed = 0.11 * (p.hr / 70);
    const sv = 0.75 - 0.15 * (p.altitude / 3500) - 0.1 * Math.max(0, (p.hr - 70) / 75); // mixed venous saturation
    const sa = phys.spo2 / 100;
    // diffusion: equilibrates in ~1/3 of transit at rest; slower if thickened/diseased or low PAO2
    const tau = 0.13 * (1 + 1.6 * (p.altitude / 3500)) * (1 + 0.8 * p.damage) * (p.hr / 70) * 0.85 + 0.02;
    const dark = new THREE.Color(0x4a0b18), bright = new THREE.Color(0xff2436);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), tan = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (let i = 0; i < this.rbcCount; i++) {
      const r = this.rbcState[i];
      r.t += dt * speed * (0.85 + (i % 7) * 0.04) / (r.cap.len / 6);
      if (r.t > 1) r.t -= 1;
      const al = this.alveoli[r.cap.alveolus];
      const idx = Math.min(199, Math.floor(r.t * 200));
      pos.copy(r.cap.samples[idx]).lerp(r.cap.samples[Math.min(200, idx + 1)], r.t * 200 - idx);
      tan.copy(r.cap.samples[Math.min(200, idx + 1)]).sub(r.cap.samples[idx]).normalize();
      q.setFromUnitVectors(up, tan);
      const hidden = al.damage > 0.6;
      sc.setScalar(hidden ? 0.0001 : 1);
      m4.compose(pos, q, sc);
      this.rbc.setMatrixAt(i, m4);
      const sat = sv + (sa - sv) * (1 - Math.exp(-r.t / tau));
      col.copy(dark).lerp(bright, Math.min(1, Math.max(0, (sat - 0.62) / 0.36)));
      this.rbc.setColorAt(i, col);
    }
    this.rbc.instanceMatrix.needsUpdate = true;
    this.rbc.instanceColor.needsUpdate = true;

    // gas exchange: O2 into blood (rate ∝ alveolar–capillary PO2 gradient),
    // CO2 into the air sac (rate ∝ CO2 production)
    const functional = this.alveoli.filter(a => a.damage < 0.5).length / this.alveoli.length;
    const o2Rate = 70 * Math.max(0.1, (phys.out.pAO2 - 40) / 60) * functional * (p.hr / 70);
    const co2Rate = 52 * Math.min(4, p.vco2 / 200) ** 0.6 * functional;
    this._o2acc = (this._o2acc || 0) + o2Rate * dt;
    this._co2acc = (this._co2acc || 0) + co2Rate * dt;
    for (const m of this.molecules) {
      if (m.alive) continue;
      if (this._o2acc >= 1) { if (this.spawnExchange(m, 'o2')) this._o2acc -= 1; else this._o2acc = 0; }
      else if (this._co2acc >= 1) { if (this.spawnExchange(m, 'co2')) this._co2acc -= 1; else this._co2acc = 0; }
      else break;
    }
    this._o2acc = Math.min(this._o2acc, 5); this._co2acc = Math.min(this._co2acc, 5);
    const G = this.gas, tmp = new THREE.Vector3();
    for (let i = 0; i < G.count; i++) {
      const m = this.molecules[i];
      if (!m.alive) { G.alpha[i] = 0; continue; }
      m.age += dt;
      const u = m.age / m.dur;
      let a = 1;
      if (m.type === 'o2') {
        if (u < 1) { tmp.copy(m.from).lerp(m.to, u * u * (3 - 2 * u)); }
        else { // carried away by the blood, bound to haemoglobin
          const tt = Math.min(1, m.t0 + (u - 1) * 0.35);
          tmp.copy(m.cap.samples[Math.floor(tt * 200)]);
          a = Math.max(0, 1 - (u - 1) / 0.9);
          if (u > 1.9) m.alive = false;
        }
        G.col.set([this.o2Col.r, this.o2Col.g, this.o2Col.b], i * 3);
      } else {
        if (u < 1) tmp.copy(m.from).lerp(m.to, u * u * (3 - 2 * u));
        else { // drifts in the alveolar air, washed out on exhalation
          tmp.copy(m.to).addScaledVector(new THREE.Vector3(-1, 0, 0), (u - 1) * (phys.inhaling ? 0.3 : 1.2));
          a = Math.max(0, 1 - (u - 1) / 1.2);
          if (u > 2.2) m.alive = false;
        }
        G.col.set([this.co2Col.r, this.co2Col.g, this.co2Col.b], i * 3);
      }
      if (u < 0.12) a *= u / 0.12;
      G.pos.set([tmp.x, tmp.y, tmp.z], i * 3);
      G.alpha[i] = a;
      G.size[i] = 3.4;
    }
    G.points.geometry.attributes.position.needsUpdate = true;
    G.points.geometry.attributes.color.needsUpdate = true;
    G.points.geometry.attributes.alpha.needsUpdate = true;
    G.points.geometry.attributes.size.needsUpdate = true;

    // ambient O2 in the air spaces; tidal drift in/out of the duct
    const A = this.air;
    const density = Math.min(1, phys.out.pAO2 / 105);
    const drift = phys.flow * 0.9;
    for (let i = 0; i < A.count; i++) {
      const m = this.airMol[i];
      const visible = m.k < density * 0.95;
      let x = m.base.x + Math.sin(this.time * 0.7 + m.ph) * 0.12;
      const y = m.base.y + Math.cos(this.time * 0.6 + m.ph * 1.3) * 0.12;
      const z = m.base.z + Math.sin(this.time * 0.5 + m.ph * 0.7) * 0.12;
      if (m.al < 0) { m.base.x += drift * dt * 2.5; if (m.base.x > -0.5 || m.base.x < -9) this.spawnAir(m); }
      A.pos.set([x, y, z], i * 3);
      const al = m.al >= 0 ? this.alveoli[m.al] : null;
      const dmg = al ? al.damage : 0;
      A.col.set([this.airO2.r, this.airO2.g, this.airO2.b], i * 3);
      A.alpha[i] = visible ? 0.28 * (1 - dmg * 0.5) : 0;
      A.size[i] = 1.2;
    }
    A.points.geometry.attributes.position.needsUpdate = true;
    A.points.geometry.attributes.color.needsUpdate = true;
    A.points.geometry.attributes.alpha.needsUpdate = true;
    A.points.geometry.attributes.size.needsUpdate = true;

    for (let i = 0; i < this.tarDots.count; i++) this.tarDots.alpha[i] = p.tar * 0.85;
    this.tarDots.points.geometry.attributes.alpha.needsUpdate = true;
    this.tarDots.points.geometry.attributes.size.needsUpdate = true;
    for (const P of [this.gas, this.air, this.tarDots]) P.mat.uniforms.uPx.value = opts.pixelRatio;
  }
}
