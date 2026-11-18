// ---------------------------------------------------------------------------
// Checkpoint markers and the finish beacon: additive light columns, floor
// rings and floating crystals. Colour shows state (next / pending / reached).
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const beamVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const beamFrag = `
uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
varying vec2 vUv;
void main(){
  float fall = pow(1.0 - vUv.y, 2.2);
  float stripes = 0.75 + 0.25 * sin(vUv.y * 60.0 - uTime * 4.0);
  float edge = 0.55 + 0.45 * pow(abs(sin(vUv.x * 3.14159 * 2.0)), 0.5);
  gl_FragColor = vec4(uColor * fall * stripes * edge * uAlpha, 1.0);
}`;

const COLORS = {
  next: new THREE.Color(3.2, 1.5, 0.45),
  pending: new THREE.Color(1.6, 0.75, 0.25),
  reached: new THREE.Color(0.25, 1.6, 1.3),
  finish: new THREE.Color(4.0, 3.0, 1.4),
};

function makeMarker(x, y, z, height, radius) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const uniforms = { uColor: { value: COLORS.pending.clone() }, uTime: { value: 0 }, uAlpha: { value: 0.6 } };
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 28, 1, true),
    new THREE.ShaderMaterial({ uniforms, vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = height / 2;
  beam.renderOrder = 10;
  g.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.pending.clone(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.25, radius * 1.55, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: COLORS.pending.clone(), emissiveIntensity: 1.6, roughness: 0.2 });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.38, 0), gemMat);
  gem.position.y = 1.5;
  g.add(gem);
  return { group: g, uniforms, ringMat, gemMat, gem, ring, state: 'pending' };
}

export class Markers {
  constructor(scene, checkpoints, finish) {
    this.items = checkpoints.map((c) => {
      const m = makeMarker(c.x, c.y, c.z, 9, 0.75);
      scene.add(m.group);
      return m;
    });
    this.finish = makeMarker(finish.x, finish.y, finish.z, 160, 1.6);
    this.finish.uniforms.uColor.value.copy(COLORS.finish);
    this.finish.ringMat.color.copy(COLORS.finish);
    this.finish.gemMat.emissive.copy(COLORS.finish);
    this.finish.gem.scale.setScalar(2);
    this.finish.uniforms.uAlpha.value = 0.9;
    scene.add(this.finish.group);
    this.t = 0;
  }

  setStates(reachedIndex) {
    this.items.forEach((m, i) => {
      const s = i <= reachedIndex ? 'reached' : i === reachedIndex + 1 ? 'next' : 'pending';
      if (m.state === s) return;
      m.state = s;
      const c = COLORS[s];
      m.uniforms.uColor.value.copy(c);
      m.ringMat.color.copy(c);
      m.gemMat.emissive.copy(c);
      m.uniforms.uAlpha.value = s === 'reached' ? 0.25 : s === 'next' ? 0.85 : 0.45;
    });
  }

  update(dt) {
    this.t += dt;
    for (const m of [...this.items, this.finish]) {
      m.uniforms.uTime.value = this.t;
      m.gem.rotation.y += dt * 1.6;
      m.gem.position.y = (m === this.finish ? 2.6 : 1.5) + Math.sin(this.t * 2 + m.group.position.z) * 0.12;
      const pulse = m.state === 'next' ? 1 + Math.sin(this.t * 5) * 0.12 : 1;
      m.ring.scale.setScalar(pulse);
    }
  }
}
