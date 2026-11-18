// ---------------------------------------------------------------------------
// Renderer: WebGL setup, HDRI sky + image based lighting, golden-hour sun with
// following shadow frustum, custom atmospheric fog (distance + height haze +
// sun glow), post chain (scene, first-person arms overlay, bloom, tone map,
// final FX: speed blur & lines, grade, vignette, fades).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Sun in the HDRI sits at azimuth 37.6 deg (three's equirect convention).
const HDRI_SUN_AZ = THREE.MathUtils.degToRad(37.6);
const SUN_AZ = THREE.MathUtils.degToRad(-42);      // where we want it: ahead-right of the run
const SUN_ELEV_LIGHT = THREE.MathUtils.degToRad(15); // raised a bit for readable gameplay shadows
const SUN_ELEV_SKY = THREE.MathUtils.degToRad(2.1);

export const SUN_DIR = new THREE.Vector3(Math.cos(SUN_AZ) * Math.cos(SUN_ELEV_LIGHT), Math.sin(SUN_ELEV_LIGHT), Math.sin(SUN_AZ) * Math.cos(SUN_ELEV_LIGHT)).normalize();
const SKY_SUN_DIR = new THREE.Vector3(Math.cos(SUN_AZ) * Math.cos(SUN_ELEV_SKY), Math.sin(SUN_ELEV_SKY), Math.sin(SUN_AZ) * Math.cos(SUN_ELEV_SKY)).normalize();

// ---- custom fog chunks (installed before any material compiles) -------------
function installFog() {
  const v = (x) => x.toFixed(4);
  THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  #ifdef USE_INSTANCING
    vFogWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  {
    vec3 fdv = vFogWorld - cameraPosition;
    float fdist = length(fdv);
    vec3 fdir = fdv / max(fdist, 1e-4);
    #ifdef FOG_EXP2
      float dens = fogDensity;
    #else
      float dens = 0.0012;
    #endif
    // height haze: density a*exp(-b*y), integrated along the view ray
    const float hb = 0.042;
    const float ha = 0.02;
    float dy = fdv.y;
    float hterm = abs(dy) > 0.05 ? (1.0 - exp(-hb * dy)) / (hb * dy) : 1.0;
    float hfog = ha * exp(-hb * cameraPosition.y) * fdist * hterm;
    float fogAmt = 1.0 - exp(-(dens * fdist + hfog));
    fogAmt = clamp(fogAmt, 0.0, 1.0);
    const vec3 sunDir = vec3(${v(SKY_SUN_DIR.x)}, ${v(SKY_SUN_DIR.y)}, ${v(SKY_SUN_DIR.z)});
    float sunAmt = max(dot(fdir, sunDir), 0.0);
    vec3 fc = fogColor;
    fc = mix(fc, vec3(2.4, 1.25, 0.55), pow(sunAmt, 5.0) * 0.85);
    fc = mix(fc, vec3(7.0, 3.2, 1.1), pow(sunAmt, 40.0) * 0.6);
    // cooler haze low down
    fc = mix(fc, fc * vec3(0.78, 0.84, 1.0), clamp(-fdir.y * 2.0, 0.0, 1.0) * 0.5);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, fogAmt);
  }
#endif`;
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
    uLines: { value: 0 },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uAspect: { value: 1 },
    uVignette: { value: 0.32 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uSpeed, uLines, uTime, uFade, uFlash, uAspect, uVignette;
varying vec2 vUv;
float h11(float p){ return fract(sin(p * 127.1) * 43758.5453); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 c = vUv - 0.5;
  vec2 ca = vec2(c.x * uAspect, c.y);
  float r = length(ca);
  // radial blur (only away from the centre)
  vec3 col = vec3(0.0);
  float blur = uSpeed * 0.045 * smoothstep(0.12, 0.7, r);
  float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = float(i) / 7.0;
    float w = 1.0 - t * 0.6;
    vec2 off = c * blur * t;
    // tiny chromatic split at the edges when fast
    vec3 s;
    s.r = texture2D(tDiffuse, vUv - off * 1.06).r;
    s.g = texture2D(tDiffuse, vUv - off).g;
    s.b = texture2D(tDiffuse, vUv - off * 0.94).b;
    col += s * w; wsum += w;
  }
  col /= wsum;
  // speed lines
  if (uLines > 0.001) {
    float ang = atan(ca.y, ca.x);
    float bins = 90.0;
    float id = floor((ang + 3.14159) / 6.28318 * bins);
    float seed = h11(id + floor(uTime * 14.0) * 13.0);
    float local = fract((ang + 3.14159) / 6.28318 * bins);
    float thin = smoothstep(0.5, 0.0, abs(local - 0.5)) ;
    float on = step(0.86, seed);
    float radial = smoothstep(0.32, 0.75, r) * (0.6 + 0.4 * h11(id * 3.7));
    col += vec3(1.0, 0.96, 0.9) * on * thin * radial * uLines * 0.22;
  }
  // grade: cool shadows, warm highlights, gentle saturation
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += vec3(-0.012, 0.0, 0.028) * (1.0 - smoothstep(0.0, 0.5, l));
  col *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.35, 1.0, l));
  col = mix(vec3(l), col, 1.1);
  // vignette
  col *= 1.0 - uVignette * smoothstep(0.35, 0.95, r) - uSpeed * 0.12 * smoothstep(0.3, 0.9, r);
  // impact flash (red-ish) and fades
  col = mix(col, col * vec3(1.0, 0.75, 0.7), uFlash * 0.5);
  col += (h21(vUv * 800.0 + uTime) - 0.5) * 0.012;
  col = mix(col, vec3(0.0), uFade);
  gl_FragColor = vec4(col, 1.0);
}`,
};

export class Renderer {
  constructor(canvas) {
    installFog();
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.6;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(new THREE.Color(0.30, 0.34, 0.46), 0.0009);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 2600);

    // first-person arms render in their own scene on top (depth cleared)
    this.armsScene = new THREE.Scene();
    this.armsCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 10);

    this.setupLights();
    this.setupComposer();
    addEventListener('resize', () => this.resize());
  }

  setupLights() {
    const s = this.scene;
    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.56, 0.3), 5.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 420;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.045;
    s.add(sun); s.add(sun.target);
    this.sun = sun;

    // cool sky fill so shadows read blue against the orange light
    const hemi = new THREE.HemisphereLight(new THREE.Color(0.32, 0.48, 0.9), new THREE.Color(0.38, 0.26, 0.2), 0.75);
    s.add(hemi);

    // arms lighting
    const aSun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.68, 0.42), 3.2);
    this.armsScene.add(aSun); this.armsScene.add(aSun.target);
    this.armsSun = aSun;
    this.armsScene.add(new THREE.HemisphereLight(new THREE.Color(0.5, 0.62, 0.9), new THREE.Color(0.35, 0.25, 0.2), 0.8));
  }

  async loadSky(url, manager) {
    const hdr = await new RGBELoader(manager).loadAsync(url);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const rotY = HDRI_SUN_AZ - SUN_AZ;
    const s = this.scene;
    s.background = hdr;
    s.backgroundRotation.set(0, rotY, 0);
    s.backgroundIntensity = 0.85;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromEquirectangular(hdr).texture;
    s.environment = env;
    s.environmentRotation.set(0, rotY, 0);
    s.environmentIntensity = 0.5;
    this.armsScene.environment = env;
    this.armsScene.environmentRotation.set(0, rotY, 0);
    this.armsScene.environmentIntensity = 0.8;
    pmrem.dispose();
  }

  setupComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const armsPass = new RenderPass(this.armsScene, this.armsCamera);
    armsPass.clear = false;
    armsPass.clearDepth = true;
    composer.addPass(armsPass);
    // clamp HDR outliers (the HDRI sun overflows half floats) and kill NaNs before bloom
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(40.0, 20.0, 8.0);
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 48.0), 1.0); }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.55, 1.6);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    composer.addPass(this.final);
    this.composer = composer;
  }

  resize() {
    const r = this.renderer;
    r.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.armsCamera.aspect = this.camera.aspect;
    this.armsCamera.updateProjectionMatrix();
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(innerWidth, innerHeight);
    this.final.uniforms.uAspect.value = size.x / size.y;
  }

  /** Keep the shadow frustum centred ahead of the player, snapped to texels. */
  updateSun(focus) {
    const sun = this.sun;
    const texel = (46 * 2) / 2048;
    // snap in light space
    const lightRot = new THREE.Matrix4().lookAt(new THREE.Vector3(), SUN_DIR.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lightRot.clone().invert();
    const p = focus.clone().applyMatrix4(inv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(lightRot);
    sun.target.position.copy(p);
    sun.position.copy(p).addScaledVector(SUN_DIR, 200);
    sun.target.updateMatrixWorld();
    this.armsSun.position.copy(SUN_DIR).multiplyScalar(10);
  }

  render(dt) {
    this.final.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
