// ---------------------------------------------------------------------------
// First-person arms: jacket sleeves + hands built from primitives, posed by a
// two-bone IK per arm. Hand targets come from the movement state: pumping
// while running, reaching for ledges, pushing off walls, gripping ziplines.
// Rendered in a separate overlay scene so they never clip into walls.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Arms {
  constructor(armsScene, armsCamera) {
    this.camera = armsCamera;
    armsScene.add(armsCamera);
    this.root = new THREE.Group();
    armsCamera.add(this.root);

    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.82, metalness: 0.0 });
    const sleeve2 = new THREE.MeshStandardMaterial({ color: 0x1f2227, roughness: 0.85 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0xd2381c, roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc58c6a, roughness: 0.55 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 });

    this.upperLen = 0.3; this.foreLen = 0.29;
    this.arms = [-1, 1].map((side) => {
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, this.upperLen - 0.07, 4, 10), sleeve);
      const fore = new THREE.Group();
      const foreMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, this.foreLen - 0.07, 4, 10), sleeve2);
      fore.add(foreMesh);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.035, 12), cuff);
      band.position.y = this.foreLen * 0.5 - 0.05;
      fore.add(band);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.05, 10), skin);
      wrist.position.y = this.foreLen * 0.5 + 0.0;
      fore.add(wrist);

      // hand: local +Z forward (fingers), +Y back of hand
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.03, 0.09), glove);
      palm.position.set(0, 0, 0.045);
      hand.add(palm);
      const fingers = new THREE.Group();
      fingers.position.set(0, 0, 0.09);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.05, 2, 6), skin);
        f.rotation.x = Math.PI / 2;
        f.position.set(-0.03 + i * 0.02, 0, 0.028 - Math.abs(i - 1.5) * 0.004);
        fingers.add(f);
      }
      hand.add(fingers);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 2, 6), skin);
      thumb.position.set(-side * 0.045, -0.012, 0.035);
      thumb.rotation.set(Math.PI / 2, 0, side * 0.7);
      hand.add(thumb);
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.016, 0.024), glove);
      knuckle.position.set(0, 0.018, 0.075);
      hand.add(knuckle);

      for (const o of [upper, foreMesh, band, wrist, palm, thumb]) o.frustumCulled = false;
      this.root.add(upper, fore, hand);
      return {
        side, upper, fore, hand, fingers,
        shoulder: V(side * 0.21, -0.25, 0.12),
        target: V(side * 0.24, -0.5, -0.25),
        cur: V(side * 0.24, -0.5, -0.25),
        curl: 0.3,
        palmUp: V(0, 1, 0),
      };
    });
    this.t = 0;
    this.swing = 0;
    this.visible = true;
  }

  setVisible(v) { this.root.visible = v; }

  update(dt, p, mainCamera) {
    this.t += dt;
    // follow the main camera
    this.camera.position.copy(mainCamera.position);
    this.camera.quaternion.copy(mainCamera.quaternion);
    this.camera.fov = Math.min(mainCamera.fov, 82) - 4;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    const sp = p.hspeed;
    const mode = p.mode;
    const ph = p.stepPhase * Math.PI * 2;
    const [L, Rr] = this.arms;
    const t = this.t;
    let curl = 0.7;
    const set = (a, x, y, z) => a.target.set(x, y, z);

    switch (mode) {
      case 'ground': {
        if (p.stumble > 0) {
          set(L, -0.2, -0.22, -0.42); set(Rr, 0.2, -0.24, -0.4); curl = 0.2;
        } else if (sp > 1.2) {
          const k = clamp(sp / 10, 0.3, 1.25);
          const s = Math.sin(ph);
          // left forward when s > 0
          set(L, -0.16 - 0.03 * s, -0.33 + 0.1 * Math.max(0, s) * k - 0.04 * Math.max(0, -s), -0.3 - 0.2 * s * k);
          set(Rr, 0.16 - 0.03 * s, -0.33 + 0.1 * Math.max(0, -s) * k - 0.04 * Math.max(0, s), -0.3 + 0.2 * s * k);
          curl = 0.9;
        } else {
          const b = Math.sin(t * 1.6) * 0.008;
          set(L, -0.25, -0.5 + b, -0.25); set(Rr, 0.25, -0.5 + b, -0.25);
          curl = 0.5;
        }
        break;
      }
      case 'air': {
        const up = clamp(p.st.vy / 6, -1, 1);
        set(L, -0.24, -0.24 + up * 0.06, -0.38); set(Rr, 0.24, -0.25 + up * 0.06, -0.36);
        curl = 0.35;
        break;
      }
      case 'wallrun': {
        const ws = p.wallSide; // +1 wall on right
        const wallHand = ws > 0 ? Rr : L, other = ws > 0 ? L : Rr;
        set(wallHand, ws * 0.42, -0.06 + Math.sin(t * 9) * 0.015, -0.34);
        const s = Math.sin(ph);
        set(other, -ws * 0.17, -0.3 + 0.07 * s, -0.32 - 0.15 * s);
        curl = 0.2;
        break;
      }
      case 'climb': {
        const s = Math.sin(t * 12);
        set(L, -0.16, 0.06 + 0.07 * s, -0.36); set(Rr, 0.16, 0.06 - 0.07 * s, -0.36);
        curl = 0.1;
        break;
      }
      case 'mantle': {
        const k = p.anim ? clamp(p.anim.t, 0, 1) : 0;
        const y = 0.02 - 0.42 * k * k;
        set(L, -0.2, y, -0.42 + 0.12 * k); set(Rr, 0.2, y, -0.42 + 0.12 * k);
        curl = 0.05;
        break;
      }
      case 'vault': {
        const k = p.anim ? clamp(p.anim.t, 0, 1) : 0;
        const h = p.anim ? p.anim.hand : 1;
        const plant = h > 0 ? Rr : L, free = h > 0 ? L : Rr;
        set(plant, h * 0.08, -0.32 - 0.1 * k, -0.42 + 0.3 * k);
        set(free, -h * 0.4, -0.18, -0.3);
        curl = 0.05;
        break;
      }
      case 'slide': {
        set(L, -0.32, -0.34, -0.12); set(Rr, 0.24, -0.26, -0.42);
        curl = 0.25;
        break;
      }
      case 'roll': {
        set(L, -0.1, -0.24, -0.3); set(Rr, 0.1, -0.24, -0.3);
        curl = 1;
        break;
      }
      case 'zip': {
        set(L, -0.07, 0.17, -0.36); set(Rr, 0.07, 0.17, -0.3);
        curl = 1;
        break;
      }
      default: {
        set(L, -0.25, -0.6, -0.2); set(Rr, 0.25, -0.6, -0.2);
      }
    }

    const rate = mode === 'ground' ? 22 : 14;
    for (const a of this.arms) {
      a.cur.lerp(a.target, 1 - Math.exp(-rate * dt));
      a.curl += (curl - a.curl) * (1 - Math.exp(-12 * dt));
      this.solve(a, mode);
    }
  }

  solve(a, mode) {
    const S = a.shoulder, T = a.cur;
    const la = this.upperLen, lb = this.foreLen;
    const d0 = T.clone().sub(S);
    let d = d0.length();
    const u = d0.clone().divideScalar(d || 1);
    d = clamp(d, Math.abs(la - lb) + 0.01, la + lb - 0.005);
    const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    // elbow pole: down, outward, slightly back
    const pole = V(a.side * 0.35, -0.45, 0.2);
    let pp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
    if (pp.lengthSq() < 1e-6) pp.set(a.side, 0, 0);
    pp.normalize();
    const E = S.clone().addScaledVector(u, la * cosA).addScaledVector(pp, la * sinA);
    const H = S.clone().addScaledVector(u, d);

    place(a.upper, S, E);
    place(a.fore, E, H);

    // hand basis: forward along forearm, back of hand roughly up/out
    const fwd = H.clone().sub(E).normalize();
    let back = mode === 'mantle' || mode === 'climb' || mode === 'vault'
      ? V(0, 0.2, 1)        // palms facing forward/down onto the ledge
      : mode === 'zip' ? V(0, 0, 1) : V(a.side * 1.0, 0.45, 0.25);
    if (mode === 'wallrun') back = V(-a.side, 0.3, 0.2);
    back.sub(fwd.clone().multiplyScalar(back.dot(fwd))).normalize();
    const side = new THREE.Vector3().crossVectors(back, fwd).normalize();
    const m = new THREE.Matrix4().makeBasis(side, back, fwd);
    a.hand.quaternion.setFromRotationMatrix(m);
    a.hand.position.copy(H);
    a.fingers.rotation.x = a.curl * 2.1;
  }
}

function place(obj, a, b) {
  const dir = b.clone().sub(a);
  obj.position.copy(a).add(b).multiplyScalar(0.5);
  obj.quaternion.setFromUnitVectors(UP, dir.normalize());
}
