import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export function createArms(cam) {
  const material = (c) =>
      new T.MeshStandardMaterial({ color: c, roughness: 0.82 }),
    sleeve = material(0x443848),
    glove = material(0x221e2b),
    trim = material(0xf65c77),
    skin = material(0xbb8168),
    arms = [];
  function mesh(parent, g, m, x, y, z) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }
  for (const s of [-1, 1]) {
    const arm = new T.Group();
    cam.add(arm);
    arms.push(arm);
    mesh(
      arm,
      new T.CylinderGeometry(0.065, 0.094, 0.38, 12),
      sleeve,
      0,
      -0.22,
      0,
    );
    mesh(
      arm,
      new T.CylinderGeometry(0.068, 0.075, 0.052, 12),
      trim,
      0,
      -0.042,
      0,
    );
    const palm = mesh(arm, new T.SphereGeometry(1, 12, 10), glove, 0, 0.035, 0);
    palm.scale.set(0.075, 0.097, 0.053);
    for (let i = 0; i < 4; i++) {
      let x = s * (i - 1.5) * 0.032;
      let tip = mesh(
        arm,
        new T.CapsuleGeometry(0.018, 0.045, 3, 6),
        glove,
        x,
        0.108 - Math.abs(i - 1) * 0.008,
        -0.012,
      );
      tip.rotation.x = -0.64;
      let knuckle = mesh(
        arm,
        new T.SphereGeometry(0.018, 7, 5),
        skin,
        x,
        0.13 - Math.abs(i - 1) * 0.008,
        -0.034,
      );
      knuckle.scale.y = 1.25;
    }
    const thumb = mesh(
      arm,
      new T.CapsuleGeometry(0.024, 0.052, 3, 7),
      glove,
      -s * 0.06,
      0.045,
      -0.023,
    );
    thumb.rotation.z = -s * 0.52;
  }
  return (p, dt) => {
    arms.forEach((arm, i) => {
      let s = i ? 1 : -1,
        osc = Math.sin(p.phase * 0.5 + i * Math.PI) * Math.min(1, p.speed / 7);
      let reach = p.mantle || p.wall || p.zip ? 1 : 0;
      let f = 1 - Math.exp(-dt * 14);
      arm.position.lerp(
        new T.Vector3(
          s * (0.28 + 0.025 * osc),
          -0.36 + osc * 0.045 + reach * 0.13,
          -0.44 - osc * 0.055 - reach * 0.12,
        ),
        f,
      );
      arm.rotation.set(
        -0.78 - reach * 0.26 + osc * 0.18,
        0,
        s * (0.5 + reach * 0.12),
      );
    });
  };
}
export async function ghostActor(scene) {
  const g = await new GLTFLoader().loadAsync(
      "assets/runner/AnimationLibrary_Godot_Standard.gltf",
    ),
    body = g.scene,
    group = new T.Group();
  group.add(body);
  scene.add(group);
  group.visible = false;
  const tint = new T.MeshStandardMaterial({
    color: 0x9bffee,
    emissive: 0x338b96,
    transparent: true,
    opacity: 0.43,
    depthWrite: false,
  });
  body.traverse((n) => {
    if (n.isMesh) {
      n.material = tint;
      n.frustumCulled = false;
    }
  });
  const mixer = new T.AnimationMixer(body),
    actions = new Map(g.animations.map((c) => [c.name, mixer.clipAction(c)]));
  let prev = null,
    idx = 0;
  const climbing = actions.get("Push_Loop").getClip().clone();
  climbing.name = "Climb";
  for (const track of climbing.tracks) {
    if (!/upper_arm[LR]\.quaternion/.test(track.name)) continue;
    const sign = track.name.includes("armL") ? 1 : -1;
    for (let i = 0; i < track.times.length; i++) {
      const q = new T.Quaternion().fromArray(track.values, i * 4);
      q.multiply(
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(1, 0, 0),
          -0.65 +
            sign *
              0.5 *
              Math.sin((track.times[i] / climbing.duration) * Math.PI * 2),
        ),
      );
      q.toArray(track.values, i * 4);
    }
  }
  actions.set("Climb", mixer.clipAction(climbing));
  return {
    reset() {
      idx = 0;
      group.visible = false;
    },
    update(frames, t, dt, playerPos) {
      if (!frames?.length || t > frames.at(-1)[0]) {
        group.visible = false;
        return;
      }
      while (idx < frames.length - 2 && frames[idx + 1][0] <= t) idx++;
      const a = frames[idx],
        b = frames[idx + 1] || a,
        f = T.MathUtils.clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
      group.visible = true;
      let snap = Math.abs(b[3] - a[3]) > 3 || Math.abs(b[2] - a[2]) > 3;
      if (snap && f < 1) group.position.set(a[1], a[2], a[3]);
      else
        group.position.set(
          T.MathUtils.lerp(a[1], b[1], f),
          T.MathUtils.lerp(a[2], b[2], f),
          T.MathUtils.lerp(a[3], b[3], f),
        );
      group.rotation.y = a[4] + Math.PI;
      const distance = group.position.distanceTo(playerPos);
      tint.opacity = 0.45 * T.MathUtils.smoothstep(distance, 0.85, 2.5);
      group.visible = tint.opacity > 0.015;
      let name =
          {
            AIR: "Jump_Loop",
            MANTLE: "Interact",
            CLIMB: "Climb",
            ROLL: "Roll",
            SLIDE: "Crouch_Fwd_Loop",
            ZIPLINE: "Jump_Loop",
            RUN: "Jog_Fwd_Loop",
          }[a[5]] || "Sprint_Loop",
        act = actions.get(name);
      if (act !== prev) {
        act.reset().fadeIn(0.12).play();
        prev?.fadeOut(0.12);
        prev = act;
      }
      mixer.update(dt);
    },
  };
}
export function particles(scene) {
  let pts = [],
    n = 60,
    data = new Float32Array(n * 3),
    colors = new Float32Array(n * 3);
  data.fill(-999);
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(data, 3));
  geo.setAttribute("color", new T.BufferAttribute(colors, 3));
  let cloud = new T.Points(
    geo,
    new T.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  cloud.frustumCulled = false;
  scene.add(cloud);
  let index = 0;
  return {
    burst(p, sparks = false, count = 10) {
      for (let j = 0; j < count; j++) {
        let i = index++ % n;
        pts[i] = {
          p: p.clone(),
          v: new T.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 2,
            (Math.random() - 0.5) * 3,
          ),
          life: 0.25 + Math.random() * 0.3,
        };
        let rgb = sparks ? [3, 1.4, 0.2] : [0.53, 0.42, 0.4];
        colors.set(rgb, i * 3);
      }
      geo.attributes.color.needsUpdate = true;
    },
    update(dt) {
      pts.forEach((o, i) => {
        if (o.life <= 0) return;
        o.life -= dt;
        o.p.addScaledVector(o.v, dt);
        o.v.y -= dt * 4;
        data.set(o.life > 0 ? o.p.toArray() : [-999, -999, -999], i * 3);
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}
