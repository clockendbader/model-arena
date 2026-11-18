// Loads the BodyParts3D thorax and dresses every part in its material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { patchMaterial } from './deform.js';

const lerp = (a, b, t) => a + (b - a) * t;

// group -> opacity multiplier at [body, airways, alveolus] zoom levels
const LEVEL_FADE = {
  skin: [1, 0.14, 0], bones: [1, 0.08, 0], spine: [1, 0.16, 0], diaphragm: [1, 0.20, 0], heart: [1, 0.22, 0],
  great: [1, 0.16, 0], pulm: [1, 0.24, 0], airway: [1, 1, 0], lungs: [1, 1, 0],
};
const LAYER_OF = { skin: 'skin', bones: 'bones', spine: 'bones', great: 'vessels', pulm: 'vessels' };

export class Anatomy {
  constructor() {
    this.group = new THREE.Group();
    this.parts = {};        // name -> { mesh, group, mat }
    this.pickables = [];
    this.layers = { skin: 1, bones: 1, vessels: 1 };
    this.layerTarget = { skin: 1, bones: 1, vessels: 1 };
    this.lungMats = [];
    this.airwayShells = [];
    this.airwayInner = [];
  }

  async load(url, onProgress) {
    const gltf = await new GLTFLoader().loadAsync(url, (e) => onProgress && e.total && onProgress(e.loaded / e.total));
    const geo = {};
    gltf.scene.traverse((o) => { if (o.isMesh) geo[o.name] = o.geometry; });
    this.geo = geo;
    for (const g of Object.values(geo)) { g.computeBoundingBox(); g.computeBoundingSphere(); }
    this._build();
    return this;
  }

  _add(name, group, geometry, material, { order = 0, part = name, pick = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.renderOrder = order; mesh.frustumCulled = false;
    mesh.userData.part = part; mesh.userData.group = group;
    this.group.add(mesh);
    if (!this.parts[name]) this.parts[name] = { mesh, group, mat: material, extra: [] };
    else this.parts[name].extra.push(mesh);
    if (pick) this.pickables.push(mesh);
    return mesh;
  }

  _build() {
    const g = this.geo;

    // ---- bones: ghosted ivory so the lungs stay the hero
    const bone = (color, alpha) => patchMaterial(new THREE.MeshPhysicalMaterial({
      color, roughness: 0.55, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5, transparent: true, envMapIntensity: 0.6,
    }), { w: [0, 1, 1, 0], alpha, glow: [0.75, 0.82, 1.0, 0.05] });
    this._add('ribs', 'bones', g.ribs, bone(0xddd6c8, [0.2, 0.6, 1.7]), { order: 5 });
    this._add('sternum', 'bones', g.sternum, bone(0xddd6c8, [0.16, 0.6, 1.7]), { order: 5 });
    this._add('cartilage', 'bones', g.cartilage, bone(0xb9c8d6, [0.13, 0.55, 1.7]), { order: 5 });
    const clav = bone(0xddd6c8, [0.2, 0.6, 1.7]); clav.userData.u.uW.value.set(0, 0.5, 0.6, 0);
    this._add('clavicles', 'bones', g.clavicles, clav, { order: 5 });
    const spineMat = bone(0xe4dccb, [0.85, 0.15, 1.0]); spineMat.userData.u.uW.value.set(0, 0, 0, 0);
    this._add('spine', 'spine', g.spine, spineMat, { order: 2.7 });
    const discMat = bone(0xb9c9d6, [0.85, 0.15, 1.0]); discMat.userData.u.uW.value.set(0, 0, 0, 0);
    this._add('discs', 'spine', g.discs, discMat, { order: 2.7 });
    const larMat = bone(0xc4ccd2, [0.2, 0.6, 1.6]); larMat.userData.u.uW.value.set(0, 0, 0, 0);
    this._add('larynx', 'bones', g.larynx, larMat, { order: 5 });

    // ---- heart + great vessels
    const hc = g.heart.boundingBox.getCenter(new THREE.Vector3());
    this.heartCentre = hc;
    this.uBeat = { value: 0 };
    const heartMat = patchMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x9a2623, roughness: 0.45, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35, transparent: true, envMapIntensity: 0.9,
    }), {
      w: [0.72, 0, 0, 0], rigid: hc, glow: [1.0, 0.25, 0.2, 0.16], uniforms: { uBeat: this.uBeat, uHeartC: { value: hc } },
      vertexPars: 'uniform float uBeat; uniform vec3 uHeartC;',
      vertexExtra: 'transformed = uHeartC + (transformed - uHeartC) * (1.0 - 0.04 * uBeat);',
      fragColor: 'diffuseColor.rgb *= 0.82 + 0.3 * bFbm(vObjPos * 6.0);',
    });
    this._add('heart', 'heart', g.heart, heartMat, { order: 2.6 });
    const vessel = (color, w, glow) => patchMaterial(new THREE.MeshPhysicalMaterial({
      color, roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.4, transparent: true, envMapIntensity: 0.8,
    }), { w, glow });
    this._add('aorta', 'great', g.aorta, vessel(0xc23a30, [0.3, 0.3, 0, 0], [1, 0.3, 0.2, 0.12]), { order: 2.6 });
    this._add('vena_cava', 'great', g.vena_cava, vessel(0x3f62b8, [0.3, 0.3, 0, 0], [0.3, 0.5, 1, 0.14]), { order: 2.6 });
    this._add('pulm_arteries', 'pulm', g.pulm_arteries, vessel(0x4a6fcf, [1, 1, 0, 0], [0.3, 0.5, 1, 0.16]), { order: 2.5 });
    this._add('pulm_veins', 'pulm', g.pulm_veins, vessel(0xd24a40, [1, 1, 0, 0], [1, 0.3, 0.2, 0.14]), { order: 2.5 });

    // ---- diaphragm: muscular rim, pale central tendon
    const diaMat = patchMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x9c3f36, roughness: 0.6, metalness: 0, sheen: 0.3, sheenColor: new THREE.Color(0xffb7a8), sheenRoughness: 0.5,
      transparent: true, side: THREE.DoubleSide, envMapIntensity: 0.7,
    }), {
      w: [1, 1, 0, 0], glow: [1.0, 0.4, 0.3, 0.06],
      fragColor: `
        float tendon = smoothstep(-1.0, -0.5, vObjPos.y) * (1.0 - smoothstep(0.55, 1.05, length(vObjPos.xz - vec2(0.0, 0.1))));
        float fibre = 0.9 + 0.2 * bNoise(vec3(atan(vObjPos.z, vObjPos.x) * 46.0, vObjPos.y * 1.5, 2.0));
        diffuseColor.rgb = mix(diffuseColor.rgb * fibre, vec3(0.86, 0.72, 0.66), tendon * 0.7);`,
    });
    this._add('diaphragm', 'diaphragm', g.diaphragm, diaMat, { order: 4 });

    // ---- lungs: five lobes, each its own mesh
    const tint = { lobe_rul: [0.0, 0.02, 0.0], lobe_rml: [0.012, 0.05, 0.02], lobe_rll: [-0.008, -0.02, -0.02], lobe_lul: [0.004, 0.03, 0.01], lobe_lll: [-0.006, -0.01, -0.015] };
    this.uSmoke = { value: 0 }; this.uDusk = { value: 0 };
    for (const name of Object.keys(tint)) {
      const col = new THREE.Color(0xd9746f).offsetHSL(...tint[name]);
      const mat = patchMaterial(new THREE.MeshPhysicalMaterial({
        color: col, roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4,
        sheen: 0.35, sheenColor: new THREE.Color(0xff9d94), sheenRoughness: 0.5, transparent: true, envMapIntensity: 0.45,
      }), {
        w: [1, 1, 0, 0], alpha: [0.95, 0.05, 1], glow: [1.0, 0.30, 0.26, 0.13],
        uniforms: { uSmoke: this.uSmoke, uDusk: this.uDusk },
        fragPars: 'uniform float uSmoke; uniform float uDusk;',
        fragColor: `
          float mott = bFbm(vObjPos * 3.4);
          float cell = bCell(vObjPos * 10.0);
          vec3 tissue = diffuseColor.rgb * (0.84 + 0.24 * mott) * (0.9 + 0.16 * cell);
          tissue = mix(tissue, tissue * vec3(0.80, 0.78, 1.02), uDusk);
          // smoker: grey-brown staining with black anthracotic deposits
          float tar = smoothstep(0.50, 0.68, bFbm(vObjPos * 5.6 + 3.0)) * (0.6 + 0.4 * smoothstep(0.25, 0.6, cell));
          vec3 smoked = mix(tissue * vec3(0.50, 0.43, 0.43), vec3(0.055, 0.05, 0.055), tar * 0.9);
          diffuseColor.rgb = mix(tissue, smoked, uSmoke);`,
      });
      this.lungMats.push(mat);
      this._add(name, 'lungs', g[name], mat, { order: 3 });
    }

    // ---- real trachea + bronchi: dark mucosa inside, pearly translucent wall outside
    const made = this.makeAirwayMaterials(true);
    this._add('trachea', 'airway', g.trachea, made.inner, { order: 0, pick: false });
    this._add('trachea', 'airway', g.trachea, made.shell, { order: 2, part: 'airway' });
    const made2 = this.makeAirwayMaterials(false);
    this._add('bronchi', 'airway', g.bronchi, made2.inner, { order: 0, pick: false });
    this._add('bronchi', 'airway', g.bronchi, made2.shell, { order: 2, part: 'airway' });

    // ---- glass torso
    const skinMat = patchMaterial(new THREE.MeshPhysicalMaterial({
      color: 0xa9cbea, roughness: 0.16, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.25,
    }), {
      w: [0, 1, 0.6, 1], alpha: [0.012, 0.34, 2.7], glow: [0.45, 0.7, 1.0, 0.07],
      fragEnd: `
        float armMask = smoothstep(1.50, 1.66, abs(vObjPos.x));
        float cut = smoothstep(-3.45, -2.45, vObjPos.y) * mix(1.0, smoothstep(-1.2, 0.2, vObjPos.y), armMask);
        float specL = dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.3333));
        diffuseColor.a = clamp(diffuseColor.a + min(specL * 0.28, 0.3), 0.0, 1.0) * cut;`,
    });
    this._add('skin', 'skin', g.skin, skinMat, { order: 9 });
  }

  /** Paired materials for any tube with _centre/_radius attributes. */
  makeAirwayMaterials(rings) {
    const pars = 'varying float vRad;';
    const inner = patchMaterial(new THREE.MeshStandardMaterial({
      color: 0x5e2630, roughness: 0.85, metalness: 0, side: THREE.BackSide, transparent: true, envMapIntensity: 0.4,
    }), { w: [1, 1, 0, 0], constrict: true, vertexPars: pars, vertexExtra: 'vRad = _radius;', fragPars: pars });
    const shell = patchMaterial(new THREE.MeshPhysicalMaterial({
      color: 0xe3cfc1, roughness: 0.36, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3,
      transparent: true, depthWrite: false, envMapIntensity: 0.7,
    }), {
      w: [1, 1, 0, 0], constrict: true, alpha: [0.32, 0.6, 1.5], glow: [0.75, 0.9, 1.0, 0.05],
      vertexPars: pars, vertexExtra: 'vRad = _radius;',
      fragPars: pars + 'uniform float uConstrict; uniform float uRings;',
      uniforms: { uRings: { value: rings ? 1 : 0 } },
      fragColor: `
        float ring = smoothstep(0.25, 0.5, abs(fract(vObjPos.y * 5.4) - 0.5) * 2.0);
        diffuseColor.rgb *= mix(1.0, 0.8 + 0.2 * ring, uRings);
        float small = 1.0 - smoothstep(0.022, 0.08, vRad);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.47, 0.42), uConstrict * small * 0.75);`,
    });
    this.airwayInner.push(inner); this.airwayShells.push(shell);
    return { inner, shell };
  }

  setLayer(name, on) { this.layerTarget[name] = on ? 1 : 0; }

  /** levelF: 0 body .. 1 airways .. 2 alveolus */
  update(dt, levelF, phys) {
    for (const k in this.layers) this.layers[k] += (this.layerTarget[k] - this.layers[k]) * Math.min(1, dt * 6);
    const i = Math.min(1, Math.floor(levelF)), f = levelF - i;
    for (const name in this.parts) {
      const p = this.parts[name];
      const tab = LEVEL_FADE[p.group];
      let fade = lerp(tab[i], tab[i + 1], f);
      const layer = LAYER_OF[p.group]; if (layer) fade *= this.layers[layer];
      if (p.group === 'lungs' || p.group === 'airway') fade = 1 - THREE.MathUtils.smoothstep(levelF, 1.45, 1.92);
      const vis = fade > 0.004;
      p.mesh.visible = vis; p.mesh.material.userData.u.uFade.value = fade;
      for (const m of p.extra) { m.visible = vis; m.material.userData.u.uFade.value = fade; }
    }
    // lungs turn into a ghost shell when we dive into the airways
    const ghost = THREE.MathUtils.smoothstep(levelF, 0.12, 0.8);
    for (const m of this.lungMats) {
      m.userData.u.uAlpha.value.set(lerp(0.95, 0.045, ghost), lerp(0.05, 0.36, ghost), lerp(1, 2.1, ghost));
      m.userData.u.uGlow.value.w = lerp(0.13, 0.34, ghost); m.clearcoat = lerp(0.35, 0.02, ghost);
    }
    this.uBeat.value = phys.heartPulse;
    this.uSmoke.value = phys.p.smoke;
    this.uDusk.value = THREE.MathUtils.clamp((95 - phys.spo2) / 14, 0, 1) * 0.7;
  }
}
