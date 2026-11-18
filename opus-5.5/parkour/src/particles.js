// ---------------------------------------------------------------------------
// Particles: CPU-simulated point sprites. Dust puffs (landing, sliding,
// rolling) with normal blending and additive sparks (zipline, metal impacts).
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const VERT = `
attribute float aAlpha;
attribute float aSize;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (600.0 / max(0.1, -mv.z));
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor, a);
}`;

class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.geo = g;
    scene.add(this.points);
  }

  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(o);
  }

  update(dt) {
    const list = this.p;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= q.g * dt;
      const drag = Math.exp(-q.drag * dt);
      q.vx *= drag; q.vy *= drag; q.vz *= drag;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.floor !== undefined && q.y < q.floor) { q.y = q.floor; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      const k = q.age / q.life;
      list[n++] = q;
    }
    list.length = n;
    for (let i = 0; i < n; i++) {
      const q = list[i];
      const k = q.age / q.life;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.alpha[i] = q.a * (q.fadeIn ? Math.min(1, k * 6) : 1) * (1 - k) * (1 - k * 0.3);
      this.size[i] = q.s * (1 + k * q.grow);
      this.color[i * 3] = q.r; this.color[i * 3 + 1] = q.gg; this.color[i * 3 + 2] = q.b;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aAlpha', 'aSize', 'aColor']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.dust = new Pool(scene, 600, false);
    this.sparks = new Pool(scene, 500, true);
  }

  dustBurst(x, y, z, count, power, dirX = 0, dirZ = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.6 + Math.random()) * power;
      this.dust.spawn({
        x: x + Math.cos(a) * 0.25, y: y + 0.05 + Math.random() * 0.1, z: z + Math.sin(a) * 0.25,
        vx: Math.cos(a) * s + dirX * 0.4, vy: Math.random() * power * 0.6, vz: Math.sin(a) * s + dirZ * 0.4,
        g: -0.15, drag: 2.6, age: 0, life: 0.9 + Math.random() * 0.8,
        a: 0.32, s: 0.12 + Math.random() * 0.12, grow: 3.5, fadeIn: true,
        r: 0.78, gg: 0.68, b: 0.58,
      });
    }
  }

  sparkBurst(x, y, z, count, vx, vy, vz) {
    for (let i = 0; i < count; i++) {
      this.sparks.spawn({
        x, y, z,
        vx: -vx * 0.3 + (Math.random() - 0.5) * 3, vy: Math.random() * 2.5 - 0.5, vz: -vz * 0.3 + (Math.random() - 0.5) * 3,
        g: 9.8, drag: 0.8, age: 0, life: 0.25 + Math.random() * 0.45,
        a: 1, s: 0.025 + Math.random() * 0.025, grow: -0.5,
        r: 4.0, gg: 2.0 + Math.random(), b: 0.6,
      });
    }
  }

  update(dt) { this.dust.update(dt); this.sparks.update(dt); }
}
