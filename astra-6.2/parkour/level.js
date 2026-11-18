import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export const stages = [
  ["Launch deck", "Hold Shift to sprint. Hold Space for a longer jump."],
  ["Freight exchange", "Sprint into the red freight barriers to vault."],
  ["Steamworks", "Press C at speed to slide under the pipes."],
  ["South viaduct", "Jump along the red wall. Space kicks away."],
  ["Relay station", "Jump toward the high lip to climb and mantle."],
  ["Cable crossing", "Approach the cable and press E to ride."],
  ["Lower exchange", "Tap C just before landing to roll."],
  ["Apex spire", "Chain the obstacles and reach the finish beacon."],
];
const v = (x, y, z) => new T.Vector3(x, y, z);
let seed = 9137;
const rand = () =>
  ((seed = (Math.imul(1664525, seed) + 1013904223) | 0) >>> 0) / 4294967296;
export function buildLevel(scene) {
  const colliders = [],
    roofs = [],
    gates = [],
    lines = [],
    pending = [];
  const buckets = new Map(),
    cube = new T.BoxGeometry(),
    rod = new T.CylinderGeometry(1, 1, 1, 12),
    dummy = new T.Object3D();
  const mat = (color, roughness = 0.65, metalness = 0.18) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const metal = mat(0x44435a, 0.48, 0.6),
    silver = mat(0x9d9294, 0.45, 0.6),
    dark = mat(0x292638),
    rust = mat(0xa8624a),
    glass = mat(0x797894, 0.22, 0.72);
  const red = mat(0xe64557, 0.4),
    neon = new T.MeshStandardMaterial({
      color: 0xff4478,
      emissive: 0xff185c,
      emissiveIntensity: 2.5,
    }),
    lime = new T.MeshBasicMaterial({ color: new T.Color(2.2, 3.2, 0.48) });
  const tl = new T.TextureLoader();
  function pbr(asset, color, rx, ry) {
    let maps = {};
    for (const [type, k] of [
      ["color", "map"],
      ["normal", "normalMap"],
      ["rough", "roughnessMap"],
    ]) {
      const t = tl.load("assets/" + asset + "_" + type + ".jpg");
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = 4;
      if (type === "color") t.colorSpace = T.SRGBColorSpace;
      maps[k] = t;
    }
    return new T.MeshStandardMaterial({
      ...maps,
      color,
      roughness: 0.88,
      normalScale: new T.Vector2(0.55, 0.55),
    });
  }
  const concrete = pbr("concrete_floor_02", 0xb7a4b0, 3, 7),
    brick = pbr("brick_wall_003", 0x947681, 5, 12),
    iron = pbr("corrugated_iron", 0xaea0ad, 2, 1),
    asphalt = pbr("asphalt_02", 0x8b7c8e, 4, 8);
  function emit(geo, m, pos, scale, quat) {
    // Spatial batches retain frustum culling on the long course.
    let id =
      geo.uuid +
      m.uuid +
      Math.floor(pos.z / 95) +
      "," +
      Math.floor(pos.x / 110);
    if (!buckets.has(id)) buckets.set(id, { geo, m, ms: [] });
    dummy.position.copy(pos);
    dummy.scale.copy(scale);
    dummy.quaternion.copy(quat || new T.Quaternion());
    dummy.updateMatrix();
    buckets.get(id).ms.push(dummy.matrix.clone());
  }
  function box(x, y, z, w, h, d, m) {
    emit(cube, m, v(x, y, z), v(w, h, d));
  }
  function beam(a, b, r, m) {
    let delta = b.clone().sub(a);
    emit(
      rod,
      m,
      a.clone().lerp(b, 0.5),
      v(r, delta.length(), r),
      new T.Quaternion().setFromUnitVectors(v(0, 1, 0), delta.normalize()),
    );
  }
  function solid(x, y, z, w, h, d, m, type = "wall") {
    box(x, y, z, w, h, d, m);
    colliders.push({
      x,
      z,
      l: x - w / 2,
      r: x + w / 2,
      b: z - d / 2,
      f: z + d / 2,
      lo: y - h / 2,
      hi: y + h / 2,
      type,
    });
  }
  function facade(theme) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 512;
    let g = c.getContext("2d");
    g.fillStyle = ["#565568", "#716372", "#5b5965", "#83747b"][theme];
    g.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 8; x++) {
        let px = x * 32,
          py = y * 32;
        g.fillStyle = "#443f51";
        g.fillRect(px + 3, py + 4, 26, 22);
        g.fillStyle =
          rand() < 0.21
            ? ["#eeb99a", "#d59c89", "#f7cea0"][Math.floor(rand() * 3)]
            : ["#50516a", "#6c677e", "#45465e", "#777087"][
                Math.floor(rand() * 4)
              ];
        g.fillRect(px + 5, py + 5, 22, 16);
        g.fillStyle = "#2e2d402a";
        g.fillRect(px + 5, py + 5, 22, 5);
        g.fillStyle = "#413d50";
        g.fillRect(px + 15, py + 5, 1, 16);
        g.fillRect(px + 1, py + 27, 31, 2);
        g.fillStyle = "#b3a0a1";
        g.fillRect(px + 2, py + 25, 29, 2);
      }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return new T.MeshStandardMaterial({
      map: t,
      roughness: 0.55,
      metalness: 0.32,
    });
  }
  const facades = [0, 1, 2, 3].map(facade);
  function tower(x, top, z, w, d, h, style, playable = false) {
    box(x, top - h / 2, z, w, h, d, facades[style % 4]);
    box(x, top + 0.05, z, w + 0.4, 0.45, d + 0.4, metal);
    for (let y = top - 8; y > top - h; y -= 10)
      box(x, y, z, w + 0.28, 0.4, d + 0.28, silver);
    if (playable) return;
    colliders.push({
      l: x - w / 2,
      r: x + w / 2,
      b: z - d / 2,
      f: z + d / 2,
      lo: top - h,
      hi: top + 0.27,
      type: "tower",
    });
    // Recessed curtain walls and staggered crowns break up the street silhouette.
    if (style % 3 === 1) {
      box(
        x + w * 0.2,
        top + 2.8,
        z,
        w * 0.65,
        5.6,
        d * 0.82,
        facades[(style + 2) % 4],
      );
      box(x + w * 0.26, top + 6.5, z, w * 0.48, 2.8, d * 0.66, glass);
      box(x + w * 0.26, top + 7.9, z, w * 0.49, 0.16, d * 0.67, neon);
    }
    if (style % 2 === 0) {
      for (let k of [-0.46, 0.46]) {
        box(
          x + k * w,
          top - h * 0.49,
          z + d * 0.503,
          0.34,
          h * 0.98,
          0.32,
          metal,
        );
        box(
          x + w * 0.502,
          top - h * 0.49,
          z + k * d,
          0.32,
          h * 0.98,
          0.34,
          metal,
        );
      }
    }
    if (style % 3 === 2) {
      for (let k = 0; k < 4; k++)
        box(
          x - w * 0.37 + k * w * 0.25,
          top + 0.75,
          z + d * 0.39,
          0.8,
          1.5,
          1.2,
          iron,
        );
    }
    box(x, top + 1.4, z, w * 0.5, 2.7, d * 0.48, iron);
    if (style % 3 === 0) {
      box(x, top + 4, z, w * 0.34, 5, d * 0.32, facades[(style + 1) % 4]);
      beam(v(x, top + 6, z), v(x, top + 14, z), 0.12, metal);
      box(x, top + 14, z, 0.23, 0.3, 0.23, neon);
    }
    if (style % 4 === 1) {
      box(
        x - w * 0.49,
        top - h * 0.3,
        z - d * 0.505,
        0.18,
        h * 0.6,
        0.15,
        neon,
      );
      box(
        x + w * 0.49,
        top - h * 0.3,
        z + d * 0.505,
        0.18,
        h * 0.6,
        0.15,
        neon,
      );
    }
  }
  function crane(x, y, z) {
    const p = (a, b, c) => v(x + a, y + b, z + c);
    for (let j = 0; j < 17; j += 2) {
      beam(p(-0.55, j, 0), p(0.55, j + 2, 0), 0.08, rust);
      beam(p(0.55, j, 0), p(-0.55, j + 2, 0), 0.08, rust);
    }
    for (let i of [-0.55, 0.55]) beam(p(i, 0, 0), p(i, 19, 0), 0.13, rust);
    for (let j = -16; j < 5; j += 2) {
      beam(p(j, 17, 0), p(j + 2, 18, 0), 0.09, rust);
      beam(p(j, 18, 0), p(j + 2, 17, 0), 0.09, rust);
    }
    for (let h of [17, 18]) beam(p(-16, h, 0), p(6, h, 0), 0.11, rust);
    beam(p(0, 21, 0), p(-16, 18, 0), 0.045, metal);
    beam(p(-14, 17, 0), p(-14, 9, 0), 0.045, metal);
    box(x + 4, y + 17, z, 3, 2, 2, iron);
  }
  let next = 8,
    x = 0,
    y = 0;
  const offsets = [
    0, 1, -2, 0, 3, 1, -2, -3, 0, 2, 2, 0, 0, -1, -2, 0, 0, 1, -2, -3, 0, 2, 1,
    0,
  ];
  const heights = [
    0, 0, 0.3, 0.3, 0.3, 0.8, 0.8, 0.3, 0.3, 0.3, 0.3, 1, 1, 3.6, 4, 4, -2, -2,
    -2, -5, -5, -2.4, -4, -1.8,
  ];
  for (let i = 0; i < 24; i++) {
    let length = [31, 26, 29, 28, 32, 26][i % 6],
      width = i % 3 === 0 ? 14 : 12;
    x = offsets[i];
    y = heights[i];
    const f = next,
      b = f - length,
      z = (b + f) / 2,
      roof = { x, y, z, b, f, width };
    roofs.push(roof);
    tower(x, y - 0.5, z, width, length, 60, i, true);
    solid(
      x,
      y - 0.32,
      z,
      width,
      0.64,
      length,
      i % 7 === 6 ? iron : i % 4 === 2 ? asphalt : concrete,
      "roof",
    );
    colliders.at(-1).lo = y - 60;
    colliders.at(-1).metal = i % 7 === 6;
    // The lower fascia is visible across the next gap.
    box(x, y - 2.4, z, width + 0.35, 0.45, length + 0.35, brick);
    const gap = i === 15 || i === 21 ? 16 : i === 9 ? 7 : 2.5 + (i % 3) * 0.65;
    next = b - gap;
    for (let side of [-1, 1]) {
      let edge = x + side * (width / 2 - 0.3);
      for (let k = 0; k < 3; k++) {
        let rz = f - 2 - k * 2;
        beam(v(edge, y, rz), v(edge, y + 1.05, rz), 0.05, silver);
        if (k < 2)
          beam(v(edge, y + 1, rz), v(edge, y + 1, rz - 2), 0.055, metal);
      }
      box(edge, y + 0.025, z, 0.115, 0.05, length - 3, red);
    }
    for (let a = 0; a < 3; a++)
      for (let side of [-1, 1]) {
        const q = new T.Quaternion().setFromAxisAngle(v(0, 1, 0), side * 0.62);
        emit(
          cube,
          red,
          v(x + side * 0.31, y + 0.025, b + 2 + a * 0.8),
          v(0.16, 0.055, 1.08),
          q,
        );
      }
    if ([3, 4, 5, 21, 23].includes(i))
      solid(x, y + 0.49, z, 6, 0.98, 1.1, red, "vault");
    if ([6, 7, 8, 22].includes(i)) {
      solid(x, y + 1.28, z, 7, 0.45, 1.6, iron, "pipe");
      for (let s of [-1, 1])
        solid(x + s * 3.5, y + 0.67, z, 0.18, 1.34, 1.6, silver);
    }
    if (i === 9 || i === 10 || i === 22) {
      let wx = x + 3.2;
      solid(wx, y + 2.4, b + 1.6, 1, 4.8, 20, red, "runwall");
      box(wx - 0.51, y + 1.6, b + 1.6, 0.04, 0.11, 20, neon);
    }
    if (i === 15 || i === 21) {
      let a = v(x, y + 2.5, b + 3),
        end = v(offsets[i + 1], heights[i + 1] + 2, next - 5);
      beam(a, end, 0.065, neon);
      lines.push({ a, end });
      for (let p of [a, end]) {
        box(p.x - 1.5, p.y - 1.2, p.z, 0.18, 2.7, 0.18, metal);
        box(p.x - 0.7, p.y + 0.05, p.z, 1.8, 0.18, 0.18, silver);
      }
    }
    if (i === 18) {
      // Sloped service ramp on approach to the roll drop.
      const angle = 0.16,
        depth = 9,
        drop = Math.tan(angle) * depth;
      emit(
        cube,
        iron,
        v(x, y + drop / 2, z),
        v(5, 0.16, depth / Math.cos(angle)),
        new T.Quaternion().setFromAxisAngle(v(1, 0, 0), -angle),
      );
      colliders.push({
        x,
        z,
        l: x - 2.5,
        r: x + 2.5,
        b: z - depth / 2,
        f: z + depth / 2,
        lo: y - 0.2,
        hi: y + drop + 0.08,
        type: "ramp",
        slope: Math.tan(angle),
        base: y + 0.08,
      });
    }
    if (i === 23) {
      for (let side of [-1, 1]) {
        const bx = x + side * 4.8;
        box(bx, y + 5, b + 5, 0.45, 10, 0.45, metal);
        box(bx, y + 6.5, b + 5.25, 0.18, 6.6, 0.12, lime);
        for (let h of [2, 4, 6, 8])
          box(bx, y + h, b + 5, 0.7, 0.18, 0.7, silver);
      }
    }
    if (i % 3 === 2) {
      let gz = b + 6;
      gates.push(v(x, y, gz));
      for (let side of [-1, 1]) {
        box(x + side * 2.7, y + 1.95, gz, 0.12, 3.9, 0.18, metal);
        box(x + side * 2.7, y + 1.95, gz + 0.11, 0.075, 3.9, 0.055, lime);
      }
      box(x, y + 3.9, gz, 5.52, 0.12, 0.2, lime);
      label(
        x,
        y + 4.55,
        gz,
        i === 23 ? "FINISH" : "CP / 0" + gates.length,
        3.2,
        0.82,
        "#dbff72",
      );
    }
    if (i % 3 === 0) {
      const c = document.createElement("canvas");
      c.width = 1024;
      c.height = 256;
      let g = c.getContext("2d");
      g.fillStyle = "#fff1db";
      g.font = "italic 900 145px Arial";
      g.fillText("0" + (1 + Math.floor(i / 3)), 8, 170);
      g.fillStyle = "#ff517e";
      g.fillRect(232, 42, 8, 134);
      g.fillStyle = "#fff1db";
      g.font = "bold 46px monospace";
      g.fillText(stages[i / 3][0].toUpperCase(), 274, 105);
      g.font = "28px monospace";
      g.fillText("APEX  /  RUN DIVISION", 276, 163);
      const tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      const stamp = new T.Mesh(
        new T.PlaneGeometry(6.1, 1.52),
        new T.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.77,
          depthWrite: false,
        }),
      );
      stamp.rotation.x = -Math.PI / 2;
      stamp.position.set(x, y + 0.018, f - 8.8);
      scene.add(stamp);
    }
    for (let k = 0; k < 6; k++) {
      for (let s of [-1, 1])
        box(
          x + s * (width / 2 - 0.85),
          y + 0.02,
          b + 1 + k * 0.45,
          0.48,
          0.04,
          0.19,
          k % 2 === 0 ? red : silver,
        );
    }
    // Rooftop hardware flanks the racing line.
    if (i % 6 === 0) {
      const xx = x - width / 2 + 0.13,
        zz = z + 3;
      for (let k = 0; k <= 4; k++)
        beam(
          v(xx, y, zz + k * 1.6),
          v(xx, y + 2.12, zz + k * 1.6),
          0.045,
          metal,
        );
      for (let h of [0.08, 2.1])
        beam(v(xx, y + h, zz), v(xx, y + h, zz + 6.4), 0.045, silver);
      for (let k = -2; k <= 6.4; k += 0.26) {
        for (let dir of [-1, 1]) {
          let a = Math.max(0, -k),
            b = Math.min(2, 6.4 - k);
          if (a >= b) continue;
          beam(
            v(xx, y + 0.1 + (dir > 0 ? a : 2 - a), zz + k + a),
            v(xx, y + 0.1 + (dir > 0 ? b : 2 - b), zz + k + b),
            0.011,
            metal,
          );
        }
      }
      colliders.push({
        l: xx - 0.05,
        r: xx + 0.05,
        b: zz,
        f: zz + 6.4,
        lo: y,
        hi: y + 2.12,
        type: "fence",
      });
    }
    if (i === 0 || i === 12 || i === 23) {
      const sx = x + width / 2 - 1.15,
        sz = z - 1.2;
      for (const dx of [-0.95, 0.95])
        box(sx + dx, y + 1.62, sz, 0.1, 3.24, 0.15, metal);
      solid(sx, y + 2.76, sz, 2.45, 1.04, 0.19, dark);
      label(
        sx,
        y + 2.76,
        sz + 0.12,
        i === 23 ? "APEX" : "AX / 0" + (i === 0 ? "1" : "5"),
        2.3,
        0.86,
        "#ff76a1",
      );
    }
    const side = i % 2 === 0 ? -1 : 1,
      px = x + side * (width / 2 - 1.05);
    solid(px, y + 0.62, z + 4, 1.65, 1.24, 2.8, iron);
    for (let j = 0; j < 7; j++)
      box(px, y + 1.27, z + 3 + j * 0.28, 1.4, 0.06, 0.07, metal);
    pending.push(["crate", px, y, z - 4, 1.45], ["duct", px, y, z + 0.5, 1.65]);
    if (i % 2 === 0) pending.push(["tank", px, y, z - 6.5, 1.65]);
    for (const [pz, s] of [
      [z - 4, 1.45],
      [z + 0.5, 1.65],
      ...(i % 2 === 0 ? [[z - 6.5, 1.65]] : []),
    ])
      colliders.push({
        l: px - 0.82,
        r: px + 0.82,
        b: pz - 0.82,
        f: pz + 0.82,
        lo: y,
        hi: y + s,
        type: "prop",
      });
  }
  function label(x, y, z, text, w, h, color) {
    let c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    let g = c.getContext("2d");
    g.fillStyle = "#242031";
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = color;
    g.font = "italic bold 72px sans-serif";
    g.textAlign = "center";
    g.fillText(text, 256, 88);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    const sign = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({ map: tex }),
    );
    sign.position.set(x, y, z + 0.04);
    scene.add(sign);
  }
  for (let row = 0; row < 36; row++)
    for (let side of [-1, 1])
      for (let lane = 0; lane < 2; lane++) {
        const x = side * (22 + lane * 44 + rand() * 15),
          z = 40 - row * 25 + rand() * 10,
          w = 10 + rand() * 13,
          d = 12 + rand() * 14,
          top = -13 + rand() * (lane ? 76 : 37);
        tower(x, top, z, w, d, 70 + top, Math.floor(rand() * 9));
        if (!lane && row % 5 === 3) {
          label(
            x,
            top - 6,
            z + d / 2 + 0.02,
            "◢ ◢ ◢",
            w * 0.83,
            4.5,
            "#ff3a81",
          );
        }
        if (!lane && row % 6 === 2) {
          label(
            x,
            top - 4,
            z + d / 2 + 0.02,
            "AX / 07",
            w * 0.7,
            3.6,
            "#dbfc72",
          );
        }
        if (row % 5 === 0 && !lane) {
          crane(x, top + 3, z);
          label(x, top - 3, z + d / 2, "❯ ❯ ❯", w * 0.8, 3, "#ff4684");
        }
        if (row % 7 === 0 && lane === 1) {
          for (let j = 1; j <= 4; j++)
            box(
              x,
              top + j * 3.4,
              z,
              w * (1 - j * 0.15),
              4,
              d * (1 - j * 0.15),
              facades[j % 4],
            );
          beam(v(x, top + 14, z), v(x, top + 28, z), 0.2, metal);
          box(x, top + 28, z, 0.35, 0.55, 0.35, neon);
        }
        if (row % 4 === 2 && !lane) {
          const fx = x - side * (w / 2 + 0.6);
          for (let j = 0; j < 5; j++) {
            const h = top - j * 2.4;
            box(fx, h, z, 0.95, 0.11, d * 0.8, metal);
            for (let k = 0; k < 4; k++) {
              let zz = z - d * 0.4 + k * d * 0.2;
              beam(v(fx, h, zz), v(fx, h - 2.4, zz + d * 0.2), 0.05, rust);
              beam(v(fx, h, zz), v(fx, h - 2.4, zz), 0.06, silver);
            }
          }
        }
        if (row % 4 === 0 && lane === 0) {
          const tx = x + 3;
          emit(rod, rust, v(tx, top + 5, z), v(1.8, 4, 1.8));
          for (let h of [3.1, 4, 6, 7])
            emit(rod, metal, v(tx, top + h, z), v(1.85, 0.13, 1.85));
          for (let j of [-1, 1])
            box(tx + j, top + 1.8, z, 0.2, 3.6, 0.25, metal);
        }
        if (row % 5 === 1 && !lane) {
          const a = v(x, top + 8, z),
            b = v(x + side * 30, top + 11, z - 18),
            mid = a.clone().lerp(b, 0.5);
          mid.y -= 3;
          beam(a, mid, 0.04, dark);
          beam(mid, b, 0.04, dark);
        }
      }
  for (let i = 0; i < 54; i++) {
    let x = (rand() - 0.5) * 380,
      z = next - 28 - rand() * 105;
    tower(x, 12 + rand() * 75, z, 9 + rand() * 13, 18, 95, i);
  }
  for (let { geo, m, ms } of buckets.values()) {
    const batch = new T.InstancedMesh(geo, m, ms.length);
    ms.forEach((mx, i) => batch.setMatrixAt(i, mx));
    batch.castShadow = batch.receiveShadow = true;
    scene.add(batch);
  }
  const loader = new GLTFLoader();
  const beaconGlass = loader.loadAsync("assets/glass/material.gltf").then(async (gltf) => {
    const material = await gltf.parser.getDependency("material", 0);
    material.color.set(0xdbffb0);
    const finish = gates[gates.length - 1];
    const prism = new T.Mesh(new T.OctahedronGeometry(0.9), material);
    prism.position.copy(finish);
    prism.position.y += 6.35;
    prism.scale.y = 1.55;
    scene.add(prism);
  });
  const models = Promise.all(
    [
      ["crate", "wooden_crate_01"],
      ["duct", "modular_airduct_rectangular_01"],
      ["tank", "propane_tank"],
    ].map(async ([key, asset]) => {
      const gltf = await loader.loadAsync("assets/" + asset + "/model.gltf");
      const model = key === "duct" ? gltf.scene.children[3] : gltf.scene;
      model.position.set(0, 0, 0);
      model.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(model),
        size = bounds.getSize(v()),
        center = bounds.getCenter(v());
      for (const [, x, y, z, s] of pending.filter((p) => p[0] === key)) {
        const copy = model.clone(),
          scale = s / Math.max(size.x, size.y, size.z);
        copy.scale.multiplyScalar(scale);
        copy.position.set(
          x - center.x * scale,
          y - bounds.min.y * scale,
          z - center.z * scale,
        );
        copy.traverse((n) => {
          if (n.isMesh) n.castShadow = n.receiveShadow = true;
        });
        scene.add(copy);
      }
    }),
  );
  const hdr = new RGBELoader().loadAsync("assets/sky.hdr").then((t) => {
    t.mapping = T.EquirectangularReflectionMapping;
    scene.environment = t;
    scene.environmentIntensity = 0.52;
  });
  const cloudTex = tl.load("assets/sky-color.jpg");
  cloudTex.wrapS = T.RepeatWrapping;
  cloudTex.colorSpace = T.SRGBColorSpace;
  const sky = new T.Mesh(
    new T.SphereGeometry(1400, 64, 32),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: { env: { value: cloudTex } },
      vertexShader:
        "varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec3 dir;uniform sampler2D env;void main(){vec3 d=normalize(dir);vec2 uv=vec2(atan(d.z,d.x)/6.283185+.83,asin(d.y)/3.14159+.5);vec3 cloud=texture2D(env,uv).rgb;float a=clamp(d.y*2.,0.,1.);vec3 c=mix(vec3(1.55,.63,.45),vec3(.20,.18,.38),pow(a,.68));c=mix(c,cloud*vec3(2.7,1.20,1.45),.72);float s=length(d-normalize(vec3(.085,.225,-1.)));c+=vec3(1.,.42,.14)*exp(-s*7.)+vec3(4.,2.1,1.)*(1.-smoothstep(.043,.046,s));gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);
  scene.fog = new T.FogExp2(0xbd919e, 0.007);
  const sun = new T.DirectionalLight(0xffbc88, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -29,
    right: 29,
    top: 29,
    bottom: -29,
    near: 0.5,
    far: 160,
  });
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target, new T.HemisphereLight(0xffe3f5, 0x776984, 1.65));
  return {
    colliders,
    roofs,
    lines,
    gates,
    ready: Promise.all([models, hdr, beaconGlass]),
    vision(on) {
      red.color.set(on ? 0xe64557 : 0x86818a);
      neon.emissiveIntensity = on ? 2.5 : 0.2;
    },
    update(p) {
      sky.position.copy(p);
      sun.position.copy(p).add(v(25, 32, -40));
      sun.target.position.copy(p);
    },
  };
}
