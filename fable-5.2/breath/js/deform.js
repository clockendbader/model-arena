// One continuous displacement field for the whole thorax, evaluated identically in GLSL (vertex
// shaders) and in JS (camera targets, labels, anchors). Units: 1 = 100 mm, +X body-left, +Y up, +Z anterior.
//
//  * diaphragm: the dome descends and flattens, dragging the lung bases (and the heart) down
//  * rib cage : "bucket handle" (lateral) and "pump handle" (antero-posterior + upward) expansion
//  * abdomen  : the belly wall moves outwards as the viscera are pushed down
import * as THREE from 'three';

export const shared = {
  uBreath: { value: 0 },      // effective litres above FRC
  uConstrict: { value: 0 },   // bronchoconstriction 0..1
  uTime: { value: 0 },
};

export const FIELD_GLSL = /* glsl */`
uniform float uBreath;
uniform vec4 uW;      // x diaphragm descent, y horizontal expansion, z rib lift, w belly
uniform vec4 uRigid;  // xyz reference point, w = 1 -> the object translates rigidly with that point
vec3 breathDisp(vec3 p0) {
  vec3 p = mix(p0, uRigid.xyz, uRigid.w);
  float b = uBreath;
  float wd = smoothstep(-1.8, -0.55, p.y) * (1.0 - smoothstep(-0.45, 1.3, p.y));
  float dy = -0.35 * wd * uW.x * b;
  float band = (1.0 - smoothstep(0.4, 1.5, p.y)) * smoothstep(-3.3, -2.3, p.y);
  float lower = mix(1.0, 0.65, smoothstep(-1.2, 0.9, p.y));
  float ant = clamp((p.z + 0.55) / 1.3, 0.0, 1.0);
  float lat = clamp(abs(p.x) / 1.3, 0.0, 1.0);
  float dx = clamp(p.x, -1.5, 1.5) * 0.05 * band * lower * uW.y * b;
  float dz = max(p.z + 0.55, 0.0) * 0.07 * band * uW.y * b;
  dy += (0.10 * ant + 0.05 * lat) * band * uW.z * b;
  float belly = smoothstep(-3.4, -2.4, p.y) * (1.0 - smoothstep(-1.6, -0.9, p.y)) * smoothstep(0.0, 0.6, p.z) * (1.0 - smoothstep(0.6, 1.5, abs(p.x)));
  dz += 0.09 * belly * uW.w * b;
  return vec3(dx, dy, dz);
}
`;

// airway constriction towards the centreline (asthma): small airways narrow most, the trachea barely at all
export const CONSTRICT_GLSL = /* glsl */`
attribute vec3 _centre;
attribute float _radius;
uniform float uConstrict;
float constrictScale(float r) { return 1.0 - uConstrict * 0.5 * (1.0 - smoothstep(0.022, 0.08, r)); }
`;

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const constrictScale = (r, c) => 1 - c * 0.5 * (1 - ss(0.022, 0.08, r));

/** JS mirror of breathDisp. w = [diaphragm, expansion, ribLift, belly]. Writes the displaced point to out. */
export function deformPoint(p, w, out = new THREE.Vector3(), b = shared.uBreath.value) {
  const wd = ss(-1.8, -0.55, p.y) * (1 - ss(-0.45, 1.3, p.y));
  let dy = -0.35 * wd * w[0] * b;
  const band = (1 - ss(0.4, 1.5, p.y)) * ss(-3.3, -2.3, p.y);
  const lower = 1 + (0.65 - 1) * ss(-1.2, 0.9, p.y);
  const ant = Math.min(1, Math.max(0, (p.z + 0.55) / 1.3));
  const lat = Math.min(1, Math.abs(p.x) / 1.3);
  const dx = Math.min(1.5, Math.max(-1.5, p.x)) * 0.05 * band * lower * w[1] * b;
  let dz = Math.max(p.z + 0.55, 0) * 0.07 * band * w[1] * b;
  dy += (0.10 * ant + 0.05 * lat) * band * w[2] * b;
  const belly = ss(-3.4, -2.4, p.y) * (1 - ss(-1.6, -0.9, p.y)) * ss(0, 0.6, p.z) * (1 - ss(0.6, 1.5, Math.abs(p.x)));
  dz += 0.09 * belly * w[3] * b;
  return out.set(p.x + dx, p.y + dy, p.z + dz);
}

export const W_LUNG = [1, 1, 0, 0];

let keyCounter = 0;

/**
 * Patch a built-in three.js material with the breathing field plus a few shared fragment features:
 *   uFade    overall opacity multiplier (level / layer fades)
 *   uAlpha   (base, rim, power)  alpha = base + rim * fresnel^power
 *   uGlow    rgb + strength of a soft fresnel "sub-surface" glow
 *   uHover   highlight amount
 * opts: { w, rigid, constrict, vertexExtra, fragPars, fragColor, fragEnd, uniforms, alpha, glow }
 */
export function patchMaterial(mat, opts = {}) {
  const u = {
    uW: { value: new THREE.Vector4(...(opts.w || [0, 0, 0, 0])) },
    uRigid: { value: opts.rigid ? new THREE.Vector4(opts.rigid.x, opts.rigid.y, opts.rigid.z, 1) : new THREE.Vector4(0, 0, 0, 0) },
    uFade: { value: 1 },
    uAlpha: { value: new THREE.Vector3(...(opts.alpha || [1, 0, 1])) },
    uGlow: { value: new THREE.Vector4(...(opts.glow || [0, 0, 0, 0])) },
    uHover: { value: 0 },
    ...(opts.uniforms || {}),
  };
  mat.userData.u = u;
  const key = 'breath' + (keyCounter++);
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FIELD_GLSL}\n${opts.constrict ? CONSTRICT_GLSL : ''}\nvarying vec3 vObjPos;\n${opts.vertexPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = transformed;
        ${opts.constrict ? 'transformed = _centre + (transformed - _centre) * constrictScale(_radius);' : ''}
        ${opts.vertexExtra || ''}
        transformed += breathDisp(transformed);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uFade; uniform vec3 uAlpha; uniform vec4 uGlow; uniform float uHover; uniform float uTime;
        varying vec3 vObjPos;
        ${NOISE_GLSL}
        ${opts.fragPars || ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${opts.fragColor || ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float bFres = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        totalEmissiveRadiance += uGlow.rgb * uGlow.a * (0.18 + 0.82 * pow(bFres, 1.6));
        totalEmissiveRadiance += vec3(0.55, 0.85, 1.0) * uHover * (0.10 + 0.55 * pow(bFres, 1.5));`)
      .replace('#include <opaque_fragment>', `
        diffuseColor.a *= clamp(uAlpha.x + uAlpha.y * pow(bFres, uAlpha.z), 0.0, 1.0);
        ${opts.fragEnd || ''}
        diffuseColor.a *= uFade;
        #include <opaque_fragment>`);
  };
  return mat;
}

export const NOISE_GLSL = /* glsl */`
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float bFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * bNoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// cellular pattern (distance to nearest feature point) for the lobular mosaic on the pleura
float bCell(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d = 1.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(bHash(i + g), bHash(i + g + 13.7), bHash(i + g + 31.3));
    d = min(d, length(g + o - f));
  }
  return d;
}
`;
