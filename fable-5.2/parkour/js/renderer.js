// ============================================================================
// renderer.js — WebGL renderer, golden-hour sky, sun + shadows, atmospheric
// fog (distance + height haze, tinted toward the sun) and post-processing
// (bloom, speed blur / speed lines, grade, vignette, ACES tone mapping).
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---- art direction constants (linear HDR values) ---------------------------
export const SUN_DIR = new THREE.Vector3(-0.62, 0.235, -0.74).normalize();   // toward the sun
const SUN_COLOR = new THREE.Color(1.0, 0.62, 0.34);
const FOG_BASE = new THREE.Color(0.42, 0.50, 0.66);     // cool, away from the sun
const FOG_SUN = new THREE.Color(1.35, 0.78, 0.42);      // warm glow toward the sun
const FOG_LOW = new THREE.Color(0.62, 0.50, 0.50);      // street haze
const FOG_DENSITY = 0.0021;
const HAZE = { h0: 18, s: 12, k: 0.012 };
const HDR_SUN_ANGLE = 0.704;                             // azimuth of the sun in the HDRI (atan2(z,x))

const v3 = (c) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
const d3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

/** GLSL shared by scene fog and the sky dome so the horizon matches exactly */
const FOG_GLSL = /* glsl */`
  vec3 atmosphereColor(vec3 dir, vec3 base) {
    float sunAmt = pow(max(dot(dir, ${d3(SUN_DIR)}), 0.0), 5.0);
    float wide = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-5), normalize(vec3(${SUN_DIR.x.toFixed(5)}, 0.0, ${SUN_DIR.z.toFixed(5)}))), 0.0), 2.0);
    return mix(mix(base, ${v3(FOG_SUN)} * 0.62, wide * 0.55), ${v3(FOG_SUN)}, sunAmt);
  }
`;

/** Replace three's fog chunks with distance + analytic height fog. Must run before materials compile. */
function installFog() {
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
    #ifdef USE_FOG
      varying float vFogDepth;
      varying vec3 vFogWorld;
    #endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */`
    #ifdef USE_FOG
      vFogDepth = - mvPosition.z;
      vFogWorld = transpose(mat3(viewMatrix)) * mvPosition.xyz + cameraPosition;
    #endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
    #ifdef USE_FOG
      uniform vec3 fogColor;
      varying float vFogDepth;
      varying vec3 vFogWorld;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear;
        uniform float fogFar;
      #endif
      ${FOG_GLSL}
    #endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */`
    #ifdef USE_FOG
      vec3 fogV = vFogWorld - cameraPosition;
      float fogD = length(fogV);
      vec3 fogDir = fogV / max(fogD, 1e-4);
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(- fogDensity * fogDensity * fogD * fogD);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, fogD);
      #endif
      // exponential height haze, integrated along the view ray
      float fy0 = cameraPosition.y, fy1 = vFogWorld.y, fdy = fy1 - fy0;
      float fe0 = exp(-(fy0 - ${HAZE.h0.toFixed(1)}) / ${HAZE.s.toFixed(1)});
      float fe1 = exp(-(fy1 - ${HAZE.h0.toFixed(1)}) / ${HAZE.s.toFixed(1)});
      float fod = ${HAZE.k.toFixed(4)} * fogD * (abs(fdy) > 0.05 ? (fe0 - fe1) * ${HAZE.s.toFixed(1)} / fdy : fe0);
      fogFactor = 1.0 - (1.0 - fogFactor) * exp(-max(fod, 0.0));
      vec3 fogC = atmosphereColor(fogDir, fogColor);
      fogC = mix(fogC, ${v3(FOG_LOW)}, clamp((${(HAZE.h0 + 14).toFixed(1)} - fy1) / 50.0, 0.0, 1.0) * 0.55);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, clamp(fogFactor, 0.0, 1.0));
    #endif`;
}

// ---- sky dome ---------------------------------------------------------------
function makeSky(hdr) {
  hdr.wrapS = THREE.RepeatWrapping;
  hdr.minFilter = hdr.magFilter = THREE.LinearFilter;
  hdr.generateMipmaps = false;
  const sunAngle = Math.atan2(SUN_DIR.z, SUN_DIR.x);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tSky: { value: hdr }, uRot: { value: sunAngle - HDR_SUN_ANGLE }, uExposure: { value: 0.42 },
      uSunBoost: { value: 1 }, uFogBase: { value: FOG_BASE },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tSky; uniform float uRot, uExposure, uSunBoost; uniform vec3 uFogBase;
      varying vec3 vDir;
      ${FOG_GLSL}
      void main() {
        vec3 dir = normalize(vDir);
        float a = atan(dir.z, dir.x) - uRot;
        vec2 uv = vec2(a / 6.28318530718 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
        vec3 col = texture2D(tSky, uv).rgb * uExposure;
        col = min(col, vec3(6.0));
        // push the grade toward golden hour: richer blue overhead, warmer low down
        float up = clamp(dir.y, 0.0, 1.0);
        col *= mix(vec3(1.16, 0.98, 0.84), vec3(0.80, 0.90, 1.12), smoothstep(0.02, 0.55, up));
        float sd = max(dot(dir, ${d3(SUN_DIR)}), 0.0);
        col += ${v3(SUN_COLOR)} * uSunBoost * (pow(sd, 2600.0) * 60.0 + pow(sd, 260.0) * 2.4 + pow(sd, 22.0) * 0.5);
        // horizon haze — identical colour model to the scene fog
        vec3 fc = atmosphereColor(dir, uFogBase);
        col = mix(col, fc, smoothstep(0.16, -0.015, dir.y) * 0.96);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -1000;
  return mesh;
}

// ---- final post pass: speed blur, speed lines, grade, vignette, fade --------
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uSpeed: { value: 0 }, uTime: { value: 0 }, uFade: { value: 0 }, uHit: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSpeed, uTime, uFade, uHit, uAspect;
    varying vec2 vUv;
    float hash(float n){ return fract(sin(n) * 43758.5453123); }
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      // radial blur grows toward the edges with speed
      float amt = uSpeed * 0.055 * smoothstep(0.12, 0.85, r);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 8; i++) col += texture2D(tDiffuse, vUv - c * amt * (float(i) / 7.0)).rgb;
      col /= 8.0;
      // speed lines: thin radial streaks flickering at the periphery
      float ang = atan(c.y, c.x);
      float seg = floor(ang * 38.0);
      float h = hash(seg + floor(uTime * 14.0) * 7.13);
      float line = step(0.86, h) * smoothstep(0.5, 0.0, abs(fract(ang * 38.0) - 0.5) * 2.2);
      float band = smoothstep(0.42, 0.78, r + hash(seg) * 0.18);
      col += vec3(1.0, 0.93, 0.82) * line * band * uSpeed * 0.16;
      // split-tone grade: cool shadows, warm highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.90, 0.98, 1.13), (1.0 - smoothstep(0.0, 0.45, l)) * 0.7);
      col = mix(col, col * vec3(1.07, 1.0, 0.90), smoothstep(0.5, 1.8, l) * 0.6);
      col *= 1.0 - 0.42 * smoothstep(0.38, 1.05, r);
      col = mix(col, vec3(0.75, 0.05, 0.02) * (0.4 + l), uHit * smoothstep(0.25, 0.9, r));
      gl_FragColor = vec4(col * (1.0 - uFade), 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    installFog();
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    r.setPixelRatio(this.pixelRatio);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG_BASE, FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 4000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // sun
    const sun = this.sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.70, 0.42), 6.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    this.shadowHalf = 85;
    sc.left = -this.shadowHalf; sc.right = this.shadowHalf; sc.top = this.shadowHalf; sc.bottom = -this.shadowHalf;
    sc.near = 1; sc.far = 900;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
    this.scene.add(sun, sun.target);
    // a little cool fill so shadowed faces keep their shape
    this.scene.add(new THREE.HemisphereLight(new THREE.Color(0.55, 0.68, 1.0), new THREE.Color(0.55, 0.42, 0.36), 0.55));

    // post
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const comp = this.composer = new EffectComposer(r, rt);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size.clone(), 0.30, 0.62, 1.45);
    // a single NaN/Inf texel would be smeared across the screen by the blur chain — drop them at the threshold pass
    const hp = this.bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv ); if ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0, 0.0, 0.0, 1.0 ); texel.rgb = min( texel.rgb, vec3( 48.0 ) );');
    hp.needsUpdate = true;
    comp.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    comp.addPass(this.final);
    comp.addPass(new OutputPass());

    this._lightDir = SUN_DIR.clone();
    this._tmp = new THREE.Vector3();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** build sky dome + image based lighting from the HDRI */
  setSky(hdr) {
    this.sky = makeSky(hdr);
    // image-based lighting from the same dome (sun toned down to avoid fireflies)
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    this.sky.material.uniforms.uSunBoost.value = 0.12;
    s.add(this.sky);
    this.scene.environment = pm.fromScene(s, 0, 1, 100).texture;
    this.scene.environmentIntensity = 0.95;
    this.sky.material.uniforms.uSunBoost.value = 1;
    pm.dispose();
    this.scene.add(this.sky);
  }

  /**
   * Dynamic resolution: if frames stay slow the internal resolution steps down (and back up when
   * there is headroom), so the game keeps its frame rate on weaker GPUs without a settings screen.
   */
  adapt(dt) {
    const q = this._q || (this._q = { avg: 16, slow: 0, fast: 0, level: 0, hold: 3, levels: [1, 0.85, 0.7, 0.58, 0.48].map(k => Math.max(0.5, this.pixelRatio * k)) });
    if (dt > 0.25) return;                                   // tab switch / hitch, not a trend
    q.avg += (dt * 1000 - q.avg) * 0.08;
    if ((q.hold -= dt) > 0) return;
    q.slow = q.avg > 21 ? q.slow + dt : 0;
    q.fast = q.avg < 12.5 ? q.fast + dt : 0;
    let next = q.level;
    if (q.slow > 1.2 && q.level < q.levels.length - 1) next++;
    else if (q.fast > 8 && q.level > 0) next--;
    if (next === q.level) return;
    q.level = next; q.slow = q.fast = 0; q.hold = 2.5;
    this.pixelRatioNow = q.levels[next];
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this.pixelRatioNow || this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.final.uniforms.uAspect.value = w / h;
  }

  /** keep the shadow frustum centred on the player, snapped to texels to avoid shimmer */
  updateSun(focus) {
    const sun = this.sun, texel = (this.shadowHalf * 2) / sun.shadow.mapSize.x;
    if (!this._sr) {
      this._sr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this._lightDir).normalize();
      this._su = new THREE.Vector3().crossVectors(this._lightDir, this._sr).normalize();
    }
    const f = this._tmp.copy(focus);
    const dx = f.dot(this._sr), dy = f.dot(this._su);
    f.addScaledVector(this._sr, Math.round(dx / texel) * texel - dx).addScaledVector(this._su, Math.round(dy / texel) * texel - dy);
    sun.target.position.copy(f);
    sun.position.copy(f).addScaledVector(this._lightDir, 420);
    sun.target.updateMatrixWorld();
  }

  render(dt, fx) {
    const u = this.final.uniforms;
    u.uSpeed.value = fx.speed; u.uTime.value = fx.time; u.uFade.value = fx.fade; u.uHit.value = fx.hit;
    if (this.sky) this.sky.position.copy(this.camera.position);
    this.composer.render(dt);
  }
}
