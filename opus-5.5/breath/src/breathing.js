// Shared breathing deformation: the same function runs in GLSL (meshes) and JS
// (particles, labels, camera riding along with the tissue) so everything stays aligned.
import * as THREE from 'three';

export const U = {
  uBreath: { value: 0 },   // 0 = end of exhalation, 1 = end of inhalation
  uDia: { value: 0.016 },  // diaphragm descent at full inhalation (m)
  uLat: { value: 0.012 },  // lateral expansion fraction
  uAP: { value: 0.016 },   // antero-posterior expansion fraction
  uTime: { value: 0 },
};

export const BREATHE_GLSL = /* glsl */`
uniform float uBreath;
uniform float uDia;
uniform float uLat;
uniform float uAP;
uniform float uTime;
vec3 breatheLung(vec3 p) {
  float w = 1.0 - smoothstep(-0.07, 0.175, p.y);          // base moves, apex stays
  float wl = 0.55 + 0.45 * smoothstep(0.17, -0.06, p.y);  // lower chest widens more (bucket handle)
  vec3 q = p;
  q.y -= uDia * uBreath * w;
  q.x += p.x * uLat * uBreath * wl;
  q.z += (p.z + 0.03) * uAP * uBreath * (0.6 + 0.4 * wl);
  return q;
}
vec3 breatheDiaphragm(vec3 p) {
  float f = smoothstep(-0.135, -0.035, p.y);  // dome descends and flattens, rim stays on the ribs
  vec3 q = p;
  q.y -= uDia * uBreath * f;
  q.x += p.x * uLat * uBreath * 0.8;
  q.z += (p.z + 0.03) * uAP * uBreath * 0.6;
  return q;
}
vec3 breatheTorso(vec3 p) {
  vec3 q = p;
  float chest = smoothstep(-0.12, 0.10, p.y) * (1.0 - smoothstep(0.12, 0.22, p.y));
  q.x += p.x * uLat * uBreath * 0.8 * chest;
  q.z += max(p.z + 0.03, 0.0) * uAP * uBreath * chest;
  // belly moves out as the diaphragm pushes the abdominal organs down
  float belly = smoothstep(-0.04, -0.20, p.y) * smoothstep(-0.02, 0.06, p.z);
  q.z += uDia * 0.55 * uBreath * belly;
  return q;
}
`;

const _v = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function breatheLungJS(p, out = new THREE.Vector3()) {
  const b = U.uBreath.value;
  const w = 1 - smooth(-0.07, 0.175, p.y);
  const wl = 0.55 + 0.45 * smooth(0.17, -0.06, p.y);
  out.set(
    p.x + p.x * U.uLat.value * b * wl,
    p.y - U.uDia.value * b * w,
    p.z + (p.z + 0.03) * U.uAP.value * b * (0.6 + 0.4 * wl),
  );
  return out;
}

// Inject breathing + optional tissue shading into a built-in material.
// kind: 'lung' | 'diaphragm' | 'torso' | null
export function patchMaterial(mat, opts = {}) {
  const { kind = null, extra = {}, fragment = null, vertexPre = '', key = '' } = opts;
  mat.userData.uniforms = extra;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, extra);
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\n${BREATHE_GLSL}\nvarying vec3 vObjPos;\n${vertexPre}`);
    let deform = '';
    if (kind === 'lung') deform = 'transformed = breatheLung(transformed);';
    else if (kind === 'diaphragm') deform = 'transformed = breatheDiaphragm(transformed);';
    else if (kind === 'torso') deform = 'transformed = breatheTorso(transformed);';
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\nvObjPos = position;\n${opts.preDeform || ''}\n${deform}`);
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    const uniDecl = Object.keys(extra).map(k => {
      const v = extra[k].value;
      const t = typeof v === 'number' ? 'float' : v.isColor ? 'vec3' : v.isVector4 ? 'vec4' : v.isVector3 ? 'vec3' : v.isVector2 ? 'vec2' : 'float';
      return `uniform ${t} ${k};`;
    }).join('\n');
    fs = fs.replace('#include <common>', `#include <common>\nvarying vec3 vObjPos;\nuniform float uTime;\n${uniDecl}\n${NOISE_GLSL}`);
    if (fragment) {
      if (fragment.color) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${fragment.color}`);
      if (fragment.output) fs = fs.replace('#include <opaque_fragment>', `${fragment.output}\n#include <opaque_fragment>`);
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `${kind}|${key}`;
  return mat;
}

export const NOISE_GLSL = /* glsl */`
float hash31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

// Soft "subsurface" look for living tissue: wrap light, translucent rim, mottling.
export const TISSUE_OUTPUT = /* glsl */`
{
  vec3 vd = normalize(vViewPosition);
  float ndv = abs(dot(normalize(normal), vd));
  float fres = pow(1.0 - ndv, 2.2);
  outgoingLight += uSSS * (0.10 + 0.55 * fres) * uSSSStrength;
  outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.55, 0.5, 0.5), uTar * 0.25);
  diffuseColor.a *= mix(1.0, 0.25 + 0.75 * pow(1.0 - ndv, 1.4), uXray);
  diffuseColor.a *= uFade;
}
`;
