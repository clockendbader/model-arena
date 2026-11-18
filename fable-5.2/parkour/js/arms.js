// ============================================================================
// arms.js — first-person arms taken from the rigged runner model.
// Only the triangles skinned to the arm chain are kept; each arm is then posed
// every frame with a two-bone IK solve toward a hand target that depends on
// what the player is doing (pumping while running, reaching for a ledge,
// trailing a hand on the wall, gripping the zipline…).
// ============================================================================
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const ARM_BONE = /(upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)/;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

export class Arms {
  constructor(assets, camera) {
    this.camera = camera;
    const model = SkeletonUtils.clone(assets.runner.scene);
    this.holder = new THREE.Group(); this.holder.rotation.y = Math.PI; this.holder.add(model);
    camera.add(this.holder);

    const bones = {};
    model.traverse(o => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh) {
        const names = o.skeleton.bones.map(b => b.name);
        if (!names.includes('upperarm_l') || o.geometry.attributes.position.count < 2000) { o.visible = false; return; }
        // keep only arm triangles
        const g = o.geometry.clone(), si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index.array, keep = [];
        const isArm = names.map(n => ARM_BONE.test(n));
        const armW = new Float32Array(si.count);
        for (let i = 0; i < si.count; i++) {
          let w = 0;
          for (let k = 0; k < 4; k++) if (isArm[si.getComponent(i, k)]) w += sw.getComponent(i, k);
          armW[i] = w;
        }
        for (let i = 0; i < idx.length; i += 3) if (armW[idx[i]] > 0.5 && armW[idx[i + 1]] > 0.5 && armW[idx[i + 2]] > 0.5) keep.push(idx[i], idx[i + 1], idx[i + 2]);
        g.setIndex(keep);
        o.geometry = g; o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true;
        o.material = o.material.clone(); o.material.envMapIntensity = 0.8;
        this.mesh = o;
      }
    });
    this.arms = [-1, 1].map(side => {
      const s = side < 0 ? 'l' : 'r';
      const a = { side, U: bones['upperarm_' + s], F: bones['lowerarm_' + s], H: bones['hand_' + s], pos: new THREE.Vector3(side * 0.25, -0.6, -0.2), target: new THREE.Vector3() };
      a.restU = a.U.quaternion.clone(); a.restF = a.F.quaternion.clone(); a.restH = a.H.quaternion.clone();
      a.fingers = [];
      a.H.traverse(b => { if (b !== a.H && b.isBone && !/leaf/.test(b.name)) a.fingers.push({ b, rest: b.quaternion.clone(), thumb: /thumb/.test(b.name) }); });
      return a;
    });
    // put the shoulders just below and behind the eye point
    camera.updateMatrixWorld(true); this.holder.updateMatrixWorld(true);
    const L = this.holder.worldToLocal(this.arms[0].U.getWorldPosition(new THREE.Vector3()));
    const R = this.holder.worldToLocal(this.arms[1].U.getWorldPosition(new THREE.Vector3()));
    const mid = L.add(R).multiplyScalar(0.5);
    const want = new THREE.Vector3(0, -0.27, 0.1);
    this.holder.position.set(want.x + mid.x, want.y - mid.y, want.z + mid.z);
    this.holder.updateMatrixWorld(true);
    for (const a of this.arms) {
      a.l1 = a.U.getWorldPosition(_v1).distanceTo(a.F.getWorldPosition(_v2));
      a.l2 = a.F.getWorldPosition(_v1).distanceTo(a.H.getWorldPosition(_v2));
    }
    this.curl = 0.5; this.t = 0; this.vaultSide = 1;
  }

  setVisible(v) { this.holder.visible = v; }

  /** rotate `bone` so that the direction to `child` matches `dir` (world space) */
  _aim(bone, child, dir) {
    bone.getWorldPosition(_v1); child.getWorldPosition(_v2);
    _v2.sub(_v1).normalize();
    _q1.setFromUnitVectors(_v2, dir);
    bone.getWorldQuaternion(_q2);
    _q1.multiply(_q2);                                   // new world rotation
    bone.parent.getWorldQuaternion(_q3).invert();
    bone.quaternion.copy(_q3.multiply(_q1));
    bone.updateWorldMatrix(false, true);
  }

  update(dt, pl, rig) {
    this.t += dt;
    const mode = pl.mode, speed = pl.speedH, cam = this.camera;
    const ph = rig.bobPhase * Math.PI, sw = Math.sin(ph), amp = Math.min(1, speed / 8.5);
    let curl = 0.55, rate = 16;
    for (const a of this.arms) {
      const s = a.side, T = a.target, o = s * sw;         // opposite arms swing out of phase
      switch (mode) {
        case 'ground':
          if (pl.rollT > 0) { T.set(s * 0.17, -0.34, -0.3); curl = 0.9; }
          else if (pl.crouched) T.set(s * 0.26, -0.36, -0.34);
          else { T.set(s * (0.24 - 0.03 * o * amp), -0.56 + amp * (0.13 + 0.17 * Math.max(-0.35, o)), -0.22 - amp * (0.12 + 0.2 * o)); rate = 24; curl = 0.75; }
          break;
        case 'air': {
          const f = Math.max(0, Math.min(1, -pl.vel.y / 16));
          T.set(s * (0.36 + f * 0.1), -0.34 + f * 0.2 + (pl.vel.y > 2 ? 0.06 : 0), -0.4 + f * 0.05); curl = 0.25; rate = 10; break;
        }
        case 'slide': if (s > 0) T.set(0.4, -0.42, -0.1); else T.set(-0.3, -0.2, -0.46); curl = 0.3; break;
        case 'wallrun': {
          const ws = rig.wallSide;
          if (s === ws) { T.set(s * 0.44, -0.06 + Math.sin(this.t * 9) * 0.03, -0.42); curl = 0.05; }
          else T.set(s * 0.3, -0.36 + 0.1 * o, -0.36 - 0.12 * o);
          break;
        }
        case 'climb': T.set(s * 0.2, 0.1 + 0.2 * Math.sin(this.t * 15 + (s > 0 ? Math.PI : 0)), -0.46); curl = 0.2; rate = 22; break;
        case 'mantle': {
          const u = Math.min(1, pl.mt.t / pl.mt.T);
          T.set(s * (0.25 + 0.04 * u), 0.14 - 0.86 * u * u, -0.44 + 0.2 * u); curl = 0.35; rate = 26; break;
        }
        case 'vault': {
          const u = Math.min(1, pl.vt.t / pl.vt.T);
          if (s === this.vaultSide) T.set(s * 0.15, -0.5 - 0.1 * u, -0.5 + 0.5 * u); else T.set(s * 0.36, -0.2, -0.34);
          curl = 0.15; rate = 24; break;
        }
        case 'zip': T.set(s * 0.1, 0.36, -0.26 + Math.sin(this.t * 2.1) * 0.01); curl = 1; rate = 20; break;
        default: T.set(s * 0.25, -0.7, -0.1);
      }
      a.pos.lerp(T, 1 - Math.exp(-rate * dt));
    }
    this.curl += (curl - this.curl) * Math.min(1, dt * 10);

    // ---- solve
    cam.updateMatrixWorld(true);
    for (const a of this.arms) { a.U.quaternion.copy(a.restU); a.F.quaternion.copy(a.restF); a.H.quaternion.copy(a.restH); }
    this.holder.updateMatrixWorld(true);
    for (const a of this.arms) {
      const S = a.U.getWorldPosition(_v3);
      const Tw = _v4.copy(a.pos).applyMatrix4(cam.matrixWorld);
      const toT = Tw.clone().sub(S); let d = toT.length();
      const max = (a.l1 + a.l2) * 0.995;
      if (d > max) { toT.multiplyScalar(max / d); d = max; }
      const dir = toT.clone().normalize();
      // elbow position from the law of cosines, bent toward the pole (down and outward)
      const x = (a.l1 * a.l1 - a.l2 * a.l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a.l1 * a.l1 - x * x));
      const pole = new THREE.Vector3(a.side * 0.75, -1, 0.35).transformDirection(cam.matrixWorld);
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
      this._aim(a.U, a.F, E.clone().sub(S).normalize());
      const Fw = a.F.getWorldPosition(new THREE.Vector3());
      this._aim(a.F, a.H, S.clone().add(toT).sub(Fw).normalize());
      // fingers: curl around each bone's local X axis
      for (const f of a.fingers) {
        _q1.setFromAxisAngle(X_AXIS, (f.thumb ? 0.35 : 1.0) * this.curl * 0.9);
        f.b.quaternion.copy(f.rest).multiply(_q1);
      }
    }
  }
}
const X_AXIS = new THREE.Vector3(1, 0, 0);
