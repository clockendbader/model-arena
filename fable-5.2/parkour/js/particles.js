// ============================================================================
// particles.js — one pooled GPU point system for dust puffs and sparks.
// ============================================================================
import * as THREE from 'three';

const MAX = 700;
export class Particles {
  constructor(scene) {
    this.n = 0; this.cursor = 0;
    this.p = new Float32Array(MAX * 3); this.v = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4); this.sz = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.max = new Float32Array(MAX); this.kind = new Uint8Array(MAX); this.grow = new Float32Array(MAX);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.15, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, fog: false,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 10;
    scene.add(this.points);
    this.mat = mat;
  }

  _spawn(x, y, z, vx, vy, vz, r, g, b, a, size, life, kind, grow) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % MAX;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.col.set([r, g, b, a], i * 4);
    this.sz[i] = size; this.life[i] = life; this.max[i] = life; this.kind[i] = kind; this.grow[i] = grow;
  }

  /** soft warm dust at the feet */
  dust(x, y, z, count, spread, dirx = 0, dirz = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, s = Math.random() * spread;
      this._spawn(x + Math.cos(a) * 0.2, y + 0.05 + Math.random() * 0.1, z + Math.sin(a) * 0.2, Math.cos(a) * s + dirx, 0.3 + Math.random() * 0.9, Math.sin(a) * s + dirz,
        1.5, 1.15, 0.85, 0.22 + Math.random() * 0.15, 0.25 + Math.random() * 0.3, 0.6 + Math.random() * 0.7, 0, 1.6);
    }
  }
  /** hot sparks (HDR colour so they bloom) */
  sparks(x, y, z, count, vx, vy, vz) {
    for (let i = 0; i < count; i++) {
      this._spawn(x, y, z, vx + (Math.random() - 0.5) * 5, vy + Math.random() * 2.5 - 0.5, vz + (Math.random() - 0.5) * 5,
        9, 4.2, 1.0, 1, 0.035 + Math.random() * 0.04, 0.25 + Math.random() * 0.45, 1, 0);
    }
  }

  update(dt, viewportH, fovDeg) {
    this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan(fovDeg * Math.PI / 360));
    const { p, v, col, sz, life, max, kind, grow } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { if (col[i * 4 + 3] !== 0) col[i * 4 + 3] = 0; continue; }
      life[i] -= dt;
      const k = life[i] / max[i], j = i * 3;
      if (kind[i] === 1) { v[j + 1] -= 14 * dt; col[i * 4 + 3] = Math.min(1, k * 3); }
      else { v[j] *= 1 - 2.5 * dt; v[j + 2] *= 1 - 2.5 * dt; v[j + 1] *= 1 - 1.5 * dt; sz[i] += grow[i] * dt * 0.5; col[i * 4 + 3] *= 1 - 1.9 * dt; }
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (life[i] <= 0) col[i * 4 + 3] = 0;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
  }
}
