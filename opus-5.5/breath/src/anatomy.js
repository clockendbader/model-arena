// Loads the BodyParts3D-derived models, builds materials and animates the
// mechanics of breathing (diaphragm, ribs, sternum, heart beat).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { U, patchMaterial, TISSUE_OUTPUT } from './breathing.js';

const loader = new GLTFLoader();
const loadGLB = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

function tissueMaterial(params, { kind = null, sss = 0xff3b4a, sssStrength = 0.35, key }) {
  const mat = new THREE.MeshPhysicalMaterial(params);
  const extra = {
    uSSS: { value: new THREE.Color(sss) },
    uSSSStrength: { value: sssStrength },
    uTar: { value: 0 },
    uXray: { value: 0 },
    uFade: { value: 1 },
    uBase: { value: new THREE.Color(params.color) },
  };
  patchMaterial(mat, {
    kind, extra, key,
    fragment: {
      color: /* glsl */`
        {
          // smoker: tar deposits (anthracosis) as dark mottling over the pleura
          float n = fbm(vObjPos * 70.0);
          float spots = smoothstep(0.48, 0.72, n) * uTar;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.50, 0.50), uTar * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.06, 0.065), spots * 0.85);
          // fine lobular texture on healthy tissue
          float lob = fbm(vObjPos * 260.0);
          diffuseColor.rgb *= 0.9 + 0.16 * lob;
        }`,
      output: TISSUE_OUTPUT,
    },
  });
  return mat;
}

export class Anatomy {
  constructor() {
    this.group = new THREE.Group();
    this.parts = {};      // name -> mesh
    this.ribs = [];       // {pivot, mesh, cart, axis, base}
    this.pickables = [];
    this.fade = { lungs: 1, bones: 1, torso: 1, heart: 1, diaphragm: 1, airway: 1, vessels: 1 };
    this.fadeTarget = { ...this.fade };
    this.xray = 0; this.xrayTarget = 0;
    this.materials = {};
  }

  async load(onProgress) {
    const M = this.materials;
    M.lung = tissueMaterial({
      color: 0xe7a3a6, roughness: 0.62, sheen: 1, sheenColor: new THREE.Color(0xffb3bd), sheenRoughness: 0.45,
      clearcoat: 0.35, clearcoatRoughness: 0.35, transparent: true, opacity: 0.86, side: THREE.FrontSide,
    }, { kind: 'lung', sss: 0xff4d5e, sssStrength: 0.42, key: 'lung' });
    M.heart = tissueMaterial({
      color: 0x8f1d29, roughness: 0.42, sheen: 1, sheenColor: new THREE.Color(0xff6a78), sheenRoughness: 0.4,
      clearcoat: 0.6, clearcoatRoughness: 0.25, transparent: true, opacity: 1,
    }, { sss: 0xff2a3c, sssStrength: 0.3, key: 'heart' });
    M.diaphragm = tissueMaterial({
      color: 0xa9474f, roughness: 0.58, sheen: 0.8, sheenColor: new THREE.Color(0xff8f8f), clearcoat: 0.2,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    }, { kind: 'diaphragm', sss: 0xff4040, sssStrength: 0.25, key: 'dia' });
    M.airway = tissueMaterial({
      color: 0xf0d2c8, roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color(0xffd9d0), clearcoat: 0.35,
      transparent: true, opacity: 1,
    }, { kind: 'lung', sss: 0xff8a8a, sssStrength: 0.25, key: 'airway' });
    M.bone = new THREE.MeshPhysicalMaterial({
      color: 0xcfc4ae, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5, sheen: 0.25, sheenColor: new THREE.Color(0xfff4e0),
      transparent: true, opacity: 0.62, envMapIntensity: 0.7,
    });
    M.cartilage = new THREE.MeshPhysicalMaterial({
      color: 0xc9d8de, roughness: 0.35, clearcoat: 0.6, transmission: 0, transparent: true, opacity: 0.92,
    });
    M.artery = tissueMaterial({ color: 0xb3262f, roughness: 0.4, clearcoat: 0.5, transparent: true, opacity: 1 }, { sss: 0xff3030, sssStrength: 0.2, key: 'art' });
    M.vein_blue = tissueMaterial({ color: 0x3756b5, roughness: 0.4, clearcoat: 0.5, transparent: true, opacity: 1 }, { sss: 0x6080ff, sssStrength: 0.2, key: 'vein' });
    M.esophagus = tissueMaterial({ color: 0xc58a7c, roughness: 0.6, transparent: true, opacity: 0.6 }, { sss: 0xff7060, sssStrength: 0.15, key: 'eso' });
    M.glass = new THREE.MeshPhysicalMaterial({
      color: 0xcfe0ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 1, depthWrite: false,
      envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.FrontSide,
    });
    patchMaterial(M.glass, {
      kind: 'torso', key: 'glass',
      extra: { uFade: { value: 1 }, uRim: { value: new THREE.Color(0x9cc8ff) } },
      fragment: {
        output: /* glsl */`
        {
          vec3 vd = normalize(vViewPosition);
          float ndv = abs(dot(normalize(normal), vd));
          float fres = pow(1.0 - ndv, 3.0);
          outgoingLight = outgoingLight * (0.35 + 0.9 * fres) + uRim * fres * 0.55;
          diffuseColor.a = (0.025 + 0.42 * fres) * uFade;
        }`,
      },
    });

    const files = ['organs', 'skeleton', 'torso'];
    let done = 0;
    const results = await Promise.all(files.map(f => loadGLB(`assets/models/${f}.glb`).then(g => { onProgress?.(++done / files.length); return g; })));
    for (const gltf of results) {
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const matName = o.material?.name || o.name;
        o.material = M[matName] || M.bone;
        o.userData.partId = o.name.replace(/_[A-Z]?\d+$/, '');
        if (o.name.startsWith('sternum')) o.userData.partId = 'sternum';
        if (o.name.startsWith('clavicle')) o.userData.partId = 'clavicle';
        this.parts[o.name] = o;
      });
    }
    for (const g of results) {
      const children = [...g.scene.children];
      for (const c of children) this.group.add(c);
    }

    const P = this.parts;
    P.torso_skin.renderOrder = 20;
    P.torso_skin.userData.partId = 'torso_skin';
    for (const k of Object.keys(P)) if (k.startsWith('lung_')) { P[k].renderOrder = 5; P[k].userData.partId = k; }
    P.diaphragm.renderOrder = 4;

    // ribs rotate about the costovertebral joints (pump-handle above, bucket-handle below)
    for (const k of Object.keys(P)) {
      if (!k.startsWith('rib_')) continue;
      const mesh = P[k], ex = mesh.userData;
      const pivot = new THREE.Group();
      pivot.position.fromArray(ex.pivot);
      this.group.add(pivot);
      pivot.attach(mesh);
      const cart = P[`cartilage_${k.slice(4)}`];
      if (cart) pivot.attach(cart);
      const i = ex.index, sx = ex.side === 'L' ? 1 : -1;
      const alpha = THREE.MathUtils.degToRad(12 + (Math.min(i, 10) - 1) * 5.5);
      const axis = new THREE.Vector3(-Math.cos(alpha), 0, sx * Math.sin(alpha)).normalize();
      // make sure a positive angle lifts the anterior end
      const front = new THREE.Vector3().fromArray(ex.front).sub(pivot.position);
      const test = front.clone().applyAxisAngle(axis, 0.05);
      if (test.y < front.y) axis.negate();
      const weight = i <= 2 ? 0.6 : i >= 11 ? 0.5 : 1.0;
      this.ribs.push({ pivot, mesh, cart, axis, weight, index: i, front });
    }
    this.sternum = ['sternum_manubrium', 'sternum_body', 'sternum_xiphoid'].map(n => P[n]);
    this.sternumBase = this.sternum.map(m => m.position.clone());

    this.heartBase = P.heart.position.clone();
    P.heart.geometry.computeBoundingBox();
    this.heartCenter = P.heart.geometry.boundingBox.getCenter(new THREE.Vector3());
    // scale the heart about its centre
    const hc = this.heartCenter;
    P.heart.geometry.translate(-hc.x, -hc.y, -hc.z);
    P.heart.position.copy(hc);
    this.heartBase = hc.clone();

    for (const m of Object.values(P)) this.pickables.push(m);
    return this;
  }

  setMode(mode) {
    const F = this.fadeTarget;
    if (mode === 'body') Object.assign(F, { lungs: 1, bones: 1, torso: 1, heart: 1, diaphragm: 1, airway: 1, vessels: 1 });
    if (mode === 'airways') Object.assign(F, { lungs: 0.045, bones: 0.08, torso: 0, heart: 0.12, diaphragm: 0.08, airway: 1, vessels: 0.1 });
  }

  setXray(on) { this.xrayTarget = on ? 1 : 0; }

  update(dt, phys) {
    const M = this.materials, P = this.parts;
    const k = 1 - Math.exp(-dt / 0.5);
    for (const key of Object.keys(this.fade)) this.fade[key] += (this.fadeTarget[key] - this.fade[key]) * k;
    this.xray += (this.xrayTarget - this.xray) * k;
    const f = this.fade;

    const lungOpacity = 0.86;
    M.lung.opacity = lungOpacity;
    M.lung.userData.uniforms.uFade.value = f.lungs;
    M.lung.userData.uniforms.uXray.value = Math.max(this.xray, 1 - f.lungs);
    M.lung.depthWrite = f.lungs > 0.6 && this.xray < 0.5;
    M.lung.userData.uniforms.uTar.value = phys.p.tar;
    M.airway.userData.uniforms.uTar.value = phys.p.tar * 0.6;
    M.heart.userData.uniforms.uFade.value = f.heart;
    M.heart.depthWrite = f.heart > 0.6;
    M.diaphragm.userData.uniforms.uFade.value = f.diaphragm * (1 - 0.55 * this.xray);
    M.diaphragm.depthWrite = f.diaphragm > 0.6 && this.xray < 0.5;
    M.bone.opacity = 0.62 * f.bones * (1 - 0.45 * this.xray); M.bone.depthWrite = f.bones > 0.6 && this.xray < 0.5;
    M.cartilage.opacity = 0.55 * f.bones * (1 - 0.45 * this.xray); M.cartilage.depthWrite = f.bones > 0.6;
    M.glass.userData.uniforms.uFade.value = f.torso;
    for (const m of [M.artery, M.vein_blue]) { m.userData.uniforms.uFade.value = f.vessels; m.depthWrite = f.vessels > 0.6; }
    M.esophagus.userData.uniforms.uFade.value = f.vessels * 0.6;
    P.torso_skin.visible = f.torso > 0.01;
    for (const key of ['bone', 'cartilage']) M[key].visible = f.bones > 0.01;

    // breathing mechanics
    const mo = phys.motion();
    U.uBreath.value = phys.v;
    U.uDia.value = mo.dia;
    U.uLat.value = mo.lat;
    U.uAP.value = mo.ap;

    let sx = 0, sy = 0, sz = 0, n = 0;
    const tmp = new THREE.Vector3();
    for (const r of this.ribs) {
      const ang = phys.v * mo.rib * r.weight;
      r.pivot.quaternion.setFromAxisAngle(r.axis, ang);
      if (r.index >= 2 && r.index <= 6) {
        tmp.copy(r.front).applyAxisAngle(r.axis, ang).sub(r.front);
        sx += tmp.x; sy += tmp.y; sz += tmp.z; n++;
      }
    }
    if (n) {
      // sternum rides on the anterior ends of ribs 2–6 (moves up and forward)
      const d = new THREE.Vector3(0, sy / n, sz / n);
      this.sternum.forEach((m, i) => m.position.copy(this.sternumBase[i]).add(d));
    }

    // heart: descends slightly with the diaphragm; beats at the scenario heart rate
    const hp = phys.heartPhase;
    const beat = Math.exp(-Math.pow((hp - 0.12) / 0.06, 2)) * 0.035 + Math.exp(-Math.pow((hp - 0.32) / 0.08, 2)) * 0.018;
    P.heart.scale.setScalar(1 - beat);
    P.heart.position.copy(this.heartBase).add(new THREE.Vector3(0, -mo.dia * 0.45 * phys.v, 0));
  }

  // representative anchor points for on-screen labels (scene coordinates, pre-deformation)
  anchors() {
    const P = this.parts;
    const c = (m, dx = 0, dy = 0, dz = 0) => {
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      const v = b.getCenter(new THREE.Vector3());
      v.z = b.max.z * 0.75 + v.z * 0.25;
      v.x += dx; v.y += dy; v.z += dz;
      return m.localToWorld(v);
    };
    return {
      trachea: c(P.trachea, 0, 0.03, 0),
      lung_right_upper: c(P.lung_right_upper, -0.02, 0.03),
      lung_right_middle: c(P.lung_right_middle, -0.02, 0),
      lung_right_lower: c(P.lung_right_lower, -0.03, -0.03, -0.02),
      lung_left_upper: c(P.lung_left_upper, 0.03, 0.04),
      lung_left_lower: c(P.lung_left_lower, 0.035, -0.03, -0.02),
      heart: c(P.heart, 0.0, 0),
      diaphragm: c(P.diaphragm, 0.07, 0.0),
      rib: new THREE.Vector3(-0.14, -0.05, 0.03),
      cardiac_notch: c(P.heart, 0.06, 0.035, 0.0),
    };
  }
}
