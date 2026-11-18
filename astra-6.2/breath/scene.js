import * as T from "three";
import { OrbitControls } from "./assets/three/OrbitControls.js";
import { GLTFLoader } from "./assets/three/GLTFLoader.js";
import { mergeGeometries } from "./assets/utils/BufferGeometryUtils.js";
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const lerp = T.MathUtils.lerp,
  clamp = T.MathUtils.clamp;
const keys = ["ru", "rm", "rl", "lu", "ll"];
export async function createScene(state, inspect, label) {
  const host = document.querySelector("#world"),
    layer = document.querySelector("#labels");
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setClearColor(0, 0);
  host.append(renderer.domElement);
  const scene = new T.Scene(),
    cam = new T.PerspectiveCamera(33, 1, 0.001, 90),
    controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.001;
  controls.maxDistance = 17;
  const body = new T.Group(),
    lungGroup = new T.Group(),
    micro = new T.Group();
  scene.add(body, micro);
  body.add(lungGroup);
  scene.add(new T.HemisphereLight(0xffeee8, 0x4c7d94, 1.6));
  for (const [x, y, z, c, p] of [
    [-4, 5, 5, 0xffddce, 2.4],
    [3, 2, -3, 0x7cd9f1, 2.8],
    [3, 0, 4, 0xe5a7ba, 0.85],
  ]) {
    const l = new T.DirectionalLight(c, p);
    l.position.set(x, y, z);
    scene.add(l);
  }
  const model = (await new GLTFLoader().loadAsync("./assets/thorax.glb")).scene;
  const by = {},
    pickables = [];
  let seed = 10841;
  const rand = () =>
    (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
  function register(m, key) {
    m.userData.part = key;
    pickables.push(m);
    return m;
  }
  function mat(col, opacity = 1) {
    return new T.MeshStandardMaterial({
      color: col,
      roughness: 0.58,
      metalness: 0.03,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
  }
  // Angle-dependent opacity keeps the tissue contours legible through neighbouring layers.
  function shell(col, type) {
    const m = mat(col, 0.65);
    m.onBeforeCompile = (s) => {
      s.vertexShader =
        "varying vec3 vLocal;\n" +
        s.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvLocal=position;",
        );
      s.fragmentShader =
        `varying vec3 vLocal;
 float hash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
 float tissueNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
 ` +
        s.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
 float rim=1.-abs(dot(normalize(vNormal),normalize(vViewPosition)));
 float grain=fract(sin(dot(floor(vLocal*260.),vec3(17.13,51.77,9.18)))*4243.134);
 float fleck=sin(vLocal.x*84.+sin(vLocal.y*38.))*sin(vLocal.z*126.+sin(vLocal.x*56.));
 ${type === "tissue" ? "float mottling=tissueNoise(vLocal*25.); float vessel=1.-smoothstep(.006,.029,abs(tissueNoise(vLocal*15.+.39*tissueNoise(vLocal*65.))-.5)); diffuseColor.rgb*=.77+.3*mottling+.14*grain;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.28,.048,.087),vessel*.28);diffuseColor.a*=.70+.30*rim;" : type === "skin" ? "diffuseColor.a*= (.018+.62*pow(rim,3.5))*smoothstep(-2.05,-1.45,vLocal.y)*(1.-smoothstep(1.51,1.96,vLocal.y));" : "diffuseColor.a*=.32+.68*rim;"}`,
        );
    };
    m.customProgramCacheKey = () => type;
    return m;
  }
  const cols = {
    ru: 0xe6939b,
    rm: 0xd48188,
    rl: 0xc47c91,
    lu: 0xe7909d,
    ll: 0xce8497,
  };
  const materials = {
    skin: shell(0x72a8b3, "skin"),
    ribs: shell(0x9db5ba, "bone"),
    spine: mat(0x91a2a6, 0.23),
    heart: mat(0x893f51),
    coronary: mat(0xd68575),
    diaphragm: mat(0xa96381, 0.42),
    trachea: mat(0xe8bbb0, 0.94),
    bronchi: mat(0xedd0b3, 0.85),
    airways: mat(0xf1bfad, 0.82),
  };
  for (const k of keys) materials[k] = shell(cols[k], "tissue");
  for (const m of [...model.children]) {
    const k = m.name;
    by[k] = m;
    m.geometry.computeVertexNormals();
    m.material = materials[k];
    (keys.includes(k) || k === "airways" ? lungGroup : body).add(m);
    m.renderOrder = keys.includes(k)
      ? 4
      : k === "ribs"
        ? 5
        : k === "skin"
          ? 6
          : 1;
    register(m, k === "coronary" ? "heart" : k);
  }
  const carina = V(0, 0.5, -0.2),
    top = V(0, 1.5, -0.037),
    chunks = [],
    smallChunks = [],
    paths = [],
    lobarTargets = {
      ru: V(-0.39, 0.51, -0.21),
      rm: V(-0.5, 0.08, 0.04),
      rl: V(-0.49, -0.14, -0.29),
      lu: V(0.48, 0.34, -0.08),
      ll: V(0.52, -0.13, -0.29),
    };
  let flightLeaf, followPath;
  function tube(a, b, r1, r2, out) {
    const v = b.clone().sub(a),
      mid = a.clone().lerp(b, 0.49);
    mid.z += v.length() * 0.055;
    const c = new T.QuadraticBezierCurve3(a, mid, b),
      g = new T.TubeGeometry(c, 4, r1, 7, false),
      pos = g.attributes.position,
      tmp = V();
    for (let s = 0; s <= 4; s++) {
      const center = c.getPointAt(s / 4);
      for (let j = 0; j <= 7; j++) {
        const i = s * 8 + j;
        tmp
          .fromBufferAttribute(pos, i)
          .sub(center)
          .multiplyScalar(lerp(1, r2 / r1, s / 4))
          .add(center);
        pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
    }
    out.push(g);
    return c;
  }
  for (const key of keys) {
    const side = key[0] === "r" ? -1 : 1;
    const hilum = V(side * (side < 0 ? 0.28 : 0.38), 0.3, -0.23),
      root = lobarTargets[key],
      g = by[key].geometry.attributes.position;
    const points = [];
    for (let i = 0; i < 128; i++) {
      let p = V().fromBufferAttribute(g, Math.floor(rand() * g.count));
      points.push(p.lerp(root, 0.07 + rand() * 0.16));
    }
    const trunk = [
      new T.LineCurve3(top, carina),
      new T.LineCurve3(carina, hilum),
      tube(hilum, root, 0.05, 0.037, chunks),
    ];
    function split(a, set, d, history) {
      const b = new T.Box3().setFromPoints(set),
        size = b.getSize(V());
      let axis = size.x > size.y ? "x" : "y";
      if (size.z > size[axis]) axis = "z";
      set.sort((p, q) => p[axis] - q[axis]);
      let half = set.length / 2;
      for (const arr of [set.slice(0, half), set.slice(half)]) {
        const centroid = arr
            .reduce((v, p) => v.add(p), V())
            .multiplyScalar(1 / arr.length),
          end = a.clone().lerp(centroid, d === 6 ? 1 : 0.48 + d * 0.055);
        const rad = 0.032 * Math.pow(0.73, d);
        const c = tube(a, end, rad, rad * 0.72, smallChunks),
          path = history.concat(c);
        if (d < 6) split(end, arr, d + 1, path);
        else {
          const p = new T.CurvePath();
          p.curves = path;
          paths.push(p);
          if (!flightLeaf && key === "rm") {
            flightLeaf = end.clone();
            followPath = p;
          }
        }
      }
    }
    split(root, points, 0, trunk);
  }
  function merged(gs, material) {
    const geo = mergeGeometries(gs);
    gs.forEach((g) => g.dispose());
    const mesh = new T.Mesh(geo, material);
    lungGroup.add(register(mesh, "airways"));
    return mesh;
  }
  const branches = merged(chunks, mat(0xefbfaa)),
    fine = merged(smallChunks, mat(0xf6c0ac));
  // Radial contraction in the vertex shader preserves branch centre lines.
  for (const m of [fine, branches]) {
    const p = m.geometry.attributes.position,
      n = m.geometry.attributes.normal;
    const radius = new Float32Array(p.count);
    for (let i = 0; i < p.count; i += 40) {
      const v = V().fromBufferAttribute(p, i),
        w = V().fromBufferAttribute(p, i + 3);
      let r = v.distanceTo(w) / 1.95;
      for (let j = 0; j < 40; j++)
        radius[i + j] = r * (1 - (0.28 * Math.floor(j / 8)) / 4);
    }
    m.geometry.setAttribute("radius", new T.BufferAttribute(radius, 1));
    m.material.onBeforeCompile = (s) => {
      s.uniforms.constrict = narrow;
      s.vertexShader =
        "attribute float radius;uniform float constrict;\n" +
        s.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed-=normal*radius*constrict;",
        );
    };
  }
  const narrow = { value: 0 };
  // Small translucent cartilage ridges trace the real tracheal mesh.
  const rings = [];
  for (let i = 0; i < 16; i++) {
    let u = i / 16;
    const y = 0.55 + u * 0.94,
      z = -0.17 + u * 0.19;
    const g = new T.TorusGeometry(0.091, 0.008, 6, 32, Math.PI * 1.68);
    g.rotateX(Math.PI / 2);
    g.rotateY(-0.92);
    g.translate(-0.005, y, z);
    rings.push(g);
  }
  const cartilage = new T.Mesh(mergeGeometries(rings), mat(0xf2cac2, 0.65));
  body.add(register(cartilage, "trachea"));
  rings.forEach((g) => g.dispose());
  const particleCount = 150,
    coords = new Float32Array(particleCount * 3),
    pg = new T.BufferGeometry();
  pg.setAttribute("position", new T.BufferAttribute(coords, 3));
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  const cx = sprite.getContext("2d"),
    gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "white");
  gr.addColorStop(0.22, "#edfffb");
  gr.addColorStop(0.45, "#98dcd1c0");
  gr.addColorStop(1, "#83c6d100");
  cx.fillStyle = gr;
  cx.fillRect(0, 0, 32, 32);
  const stream = new T.Points(
    pg,
    new T.PointsMaterial({
      size: 0.038,
      color: 0xa5ffdd,
      map: new T.CanvasTexture(sprite),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  stream.frustumCulled = false;
  stream.renderOrder = 7;
  lungGroup.add(stream);
  const routes = Array.from({ length: particleCount }, () => ({
    curve: paths[Math.floor(rand() * paths.length)],
    offset: rand(),
    speed: 0.8 + 0.4 * rand(),
  }));
  const microScale = 0.0013;
  micro.position.copy(flightLeaf);
  micro.scale.setScalar(microScale);
  const sacs = [],
    capillaries = [],
    cells = [],
    gases = [];
  function blob(parent, geo, material, p, key) {
    const m = new T.Mesh(geo, material);
    m.position.copy(p);
    parent.add(register(m, key));
    return m;
  }
  const sacGeo = new T.IcosahedronGeometry(0.43, 3),
    cellGeo = new T.SphereGeometry(1, 16, 12),
    gasGeo = new T.SphereGeometry(0.025, 8, 8);
  // Depress both faces of the circulating erythrocyte disk.
  for (let i = 0; i < cellGeo.attributes.position.count; i++) {
    let p = V().fromBufferAttribute(cellGeo.attributes.position, i);
    p.z *= 0.32 + 0.54 * Math.min(1, p.x * p.x + p.y * p.y);
    cellGeo.attributes.position.setXYZ(i, p.x, p.y, p.z);
  }
  cellGeo.computeVertexNormals();
  // A distal duct joins the air sacs at their openings behind the anterior cutaway.
  const ductMat = mat(0xdd9e98, 0.6);
  const duct = new T.CatmullRomCurve3([
    V(-0.16, 1.36, -0.31),
    V(-0.16, 0.86, -0.37),
    V(-0.05, 0.46, -0.4),
    V(0.04, -0.21, -0.34),
  ]);
  blob(
    micro,
    new T.TubeGeometry(duct, 28, 0.115, 18, false),
    ductMat,
    V(),
    "airways",
  );
  const cluster = [
    [-0.4, 0.35, -0.05],
    [0.31, 0.3, -0.12],
    [-0.66, -0.15, 0.1],
    [0.02, -0.11, 0.29],
    [0.66, -0.18, 0.08],
    [-0.32, -0.63, 0.01],
    [0.34, -0.59, 0.02],
    [0, 0, -0.45],
  ];
  cluster.forEach(([x, y, z], i) => {
    const group = new T.Group();
    group.position.set(x, y, z);
    micro.add(group);
    sacs.push(group);
    const wall = shell(0xf0adb8, "tissue");
    wall.opacity = 0.6;
    wall.roughness = 0.34;
    const sac = blob(group, sacGeo, wall, V(), "alveolus");
    sac.renderOrder = 2;
    let pts = [];
    for (let j = 0; j < 65; j++) {
      let a = (Math.PI * 2 * j) / 64,
        lat = 0.42 * Math.sin(a * 3 + i);
      pts.push(
        V(
          0.453 * Math.cos(a) * Math.cos(lat),
          0.453 * Math.sin(a) * Math.cos(lat),
          0.453 * Math.sin(lat),
        ),
      );
    }
    const curve = new T.CatmullRomCurve3(pts.slice(0, -1), true);
    const vessel = blob(
      group,
      new T.TubeGeometry(curve, 80, 0.045, 8, true),
      mat(0xca7189, 0.43),
      V(),
      "cap",
    );
    vessel.renderOrder = 4;
    // Interconnecting capillary loops wrap over the face and back of the sac.
    const loop = curve.clone();
    loop.points = curve.points.map((p) => V(p.z, p.y, p.x));
    blob(
      group,
      new T.TubeGeometry(loop, 70, 0.017, 7, true),
      mat(0xd37d91, 0.75),
      V(),
      "cap",
    );
    capillaries.push(curve);
    for (let v = 0; v < 4; v++) {
      const angle = (v * Math.PI) / 2 + i * 0.21,
        points = [];
      for (let j = 0; j <= 20; j++) {
        const a = -1.06 + (2.12 * j) / 20,
          w = angle + 0.13 * Math.sin(3 * a + i);
        points.push(
          V(
            0.444 * Math.cos(a) * Math.cos(w),
            0.444 * Math.sin(a),
            0.444 * Math.cos(a) * Math.sin(w),
          ),
        );
      }
      const bridge = new T.CatmullRomCurve3(points);
      blob(
        group,
        new T.TubeGeometry(bridge, 20, 0.01, 5, false),
        mat(0xce7681, 0.7),
        V(),
        "cap",
      );
    }
    for (let j = 0; j < 7; j++) {
      let m = blob(group, cellGeo, mat(0x791d36), V(), "cell");
      m.scale.set(0.043, 0.032, 0.023);
      cells.push({ m, curve, offset: j / 7 + i * 0.087 });
    }
    for (let j = 0; j < 6; j++) {
      let oxy = j % 2 === 0;
      let m = blob(
        group,
        gasGeo,
        mat(oxy ? 0xff4d4b : 0x469ce8),
        V(),
        oxy ? "oxy" : "co2",
      );
      m.material.emissive.set(oxy ? 0x681311 : 0x0c365e);
      m.renderOrder = 5;
      const boundary = loop.getPointAt((j + 0.31) / 6);
      gases.push({ m, oxy, i, offset: rand(), boundary });
    }
  });
  let selected = "body",
    flight = null,
    moved = false,
    prevWidth = 0,
    prevHeight = 0;
  function bodyDist() {
    return Math.max(
      7.05,
      4.05 / (Math.tan(T.MathUtils.degToRad(16.5)) * cam.aspect * 2),
    );
  }
  function viewParams(k) {
    if (k === "alveolus")
      return [
        flightLeaf.clone().add(V(0, -0.00015, 0)),
        V(0.38, 0.12, 1).normalize(),
        0.0062,
      ];
    if (k === "airways")
      return [V(-0.42, 0.19, -0.04), V(0.28, 0.15, 1).normalize(), 3.9];
    return [V(0, -0.24, 0), V(0.075, 0.025, 1).normalize(), bodyDist()];
  }
  function go(k, instant = false) {
    selected = k;
    moved = false;
    const [target, dir, dist] = viewParams(k);
    const oldDir = cam.position.clone().sub(controls.target);
    flight = {
      from: controls.target.clone(),
      to: target,
      startDir: oldDir.clone().normalize(),
      dir,
      d0: oldDir.length() || dist,
      dist,
      time: 0,
      follow: k === "alveolus" && oldDir.length() > 0.1,
    };
    if (instant) {
      cam.position.copy(target).addScaledVector(dir, dist);
      controls.target.copy(target);
      controls.update();
      flight = null;
    }
    controls.minDistance =
      k === "alveolus" ? 0.0022 : k === "airways" ? 0.5 : 2.2;
    controls.maxDistance = k === "alveolus" ? 0.017 : 16;
    controls.enabled = true;
    makeLabels();
  }
  controls.addEventListener("start", () => {
    flight = null;
    moved = true;
  });
  const anchors = {
    trachea: [V(-0.01, 1.09, 0.02), 1],
    right: [V(-0.84, 0.03, 0.46), -1],
    left: [V(0.85, 0.16, 0.33), 1],
    diaphragm: [V(-0.53, -1.12, 0.24), -1],
    bronchi: [V(0.24, 0.34, -0.17), 1],
    airways: [V(-0.66, 0.03, 0.1), -1],
    oxy: [V(-0.55, 0.24, 0.2), -1],
    co2: [V(0.62, -0.21, 0.2), 1],
  };
  let labels = [];
  function makeLabels() {
    layer.replaceChildren();
    labels = [];
    for (const key of selected === "body"
      ? ["trachea", "right", "left", "diaphragm"]
      : selected === "airways"
        ? ["bronchi", "airways"]
        : ["oxy", "co2"]) {
      const el = document.createElement("button");
      el.className = "callout" + (anchors[key][1] > 0 ? " right" : "");
      el.textContent = label(key);
      el.onclick = () => inspect(key);
      layer.append(el);
      labels.push([key, el]);
    }
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (w === prevWidth && h === prevHeight) return;
    prevWidth = w;
    prevHeight = h;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (selected === "body" && !moved && !flight) go("body", true);
  }
  resize();
  go("body", true);
  let down = null;
  renderer.domElement.onpointerdown = (e) => (down = [e.clientX, e.clientY]);
  renderer.domElement.onpointerup = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5)
      return;
    const rect = host.getBoundingClientRect(),
      ray = new T.Raycaster();
    ray.setFromCamera(
      {
        x: (2 * (e.clientX - rect.left)) / rect.width - 1,
        y: 1 - (2 * (e.clientY - rect.top)) / rect.height,
      },
      cam,
    );
    const hits = ray.intersectObjects(
      pickables.filter((m) => {
        let o = m;
        while (o) {
          if (!o.visible) return false;
          o = o.parent;
        }
        return true;
      }),
      false,
    );
    const hit =
      hits.find(
        (h) =>
          h.object.userData.part !== "skin" &&
          (h.object.userData.part !== "ribs" || Math.abs(h.point.x) > 1.03),
      ) ||
      hits.find((h) => h.object.userData.part !== "skin") ||
      hits[0];
    if (hit) inspect(hit.object.userData.part);
  };
  let airTime = 0;
  const bright = new T.Color(0xf34947),
    dark = new T.Color(0x6b1533),
    goalColor = new T.Color();
  const world = V();
  function update(dt, inflate, flow, clock) {
    resize();
    if (flight) {
      let f = flight;
      f.time += dt;
      const t = Math.min(f.time / 1.45, 1),
        u = t * t * (3 - 2 * t);
      controls.target.lerpVectors(f.from, f.to, u);
      if (f.follow) {
        const along = followPath.getPointAt(0.48 + 0.52 * u);
        controls.target.lerp(along, Math.sin(Math.PI * u));
      }
      cam.position
        .copy(controls.target)
        .addScaledVector(
          f.startDir.clone().lerp(f.dir, u).normalize(),
          Math.exp(lerp(Math.log(f.d0), Math.log(f.dist), u)),
        );
      if (t === 1) flight = null;
    }
    if (!flight) controls.update();
    else cam.lookAt(controls.target);
    const d = cam.position.distanceTo(controls.target);
    cam.near = Math.max(0.000012, d * 0.0015);
    cam.updateProjectionMatrix();
    const microOn = (selected === "alveolus" && d < 0.45) || d < 0.1;
    micro.visible = microOn;
    body.visible = !microOn || d > 0.09;
    const tree = selected === "airways" || selected === "alveolus";
    const blend = 1 - Math.exp(-dt * 5);
    const amp = state.depth / 500,
      amount = inflate * amp;
    lungGroup.scale.set(
      1 + 0.022 * amount,
      1 + 0.031 * amount,
      1 + 0.033 * amount,
    );
    lungGroup.position.y = -0.033 * amount;
    by.diaphragm.scale.y = 1 - 0.085 * amount;
    by.diaphragm.position.y = -0.16 * amount;
    by.ribs.scale.set(1 + 0.011 * amount, 1, 1 + 0.017 * amount);
    by.ribs.position.y = 0.024 * amount;
    for (const k of keys) {
      by[k].material.opacity = lerp(
        by[k].material.opacity,
        tree ? 0.065 : 0.86,
        blend,
      );
      goalColor.set(cols[k]);
      if (state.scenario === "smoker") goalColor.multiplyScalar(0.33);
      by[k].material.color.lerp(goalColor, blend);
    }
    for (const [k, normal, dim] of [
      ["skin", 0.57, 0.035],
      ["ribs", 0.14, 0.015],
      ["spine", 0.22, 0.04],
      ["diaphragm", 0.37, 0.045],
      ["trachea", 0.88, 0.59],
      ["bronchi", 0.86, 0.64],
    ])
      by[k].material.opacity = lerp(
        by[k].material.opacity,
        tree ? dim : normal,
        blend,
      );
    for (const k of ["heart", "coronary"]) {
      const m = by[k].material;
      m.transparent = true;
      m.opacity = lerp(m.opacity, tree ? 0.035 : 1, blend);
      m.depthWrite = !tree;
    }
    narrow.value = lerp(
      narrow.value,
      state.scenario === "asthma" ? 0.55 : 0,
      blend,
    );
    if (body.visible) {
      airTime += flow * dt * (state.rate / 14) * 0.81;
      for (let i = 0; i < particleCount; i++) {
        const r = routes[i],
          u = T.MathUtils.euclideanModulo(airTime * r.speed + r.offset, 1);
        r.curve.getPoint(u, world);
        coords.set([world.x, world.y, world.z], i * 3);
      }
      pg.attributes.position.needsUpdate = true;
    }
    if (micro.visible) {
      for (let i = 0; i < sacs.length; i++) {
        sacs[i].visible = state.scenario !== "smoker" || i % 3 !== 0;
        sacs[i].scale.setScalar(1 + 0.037 * amount);
      }
      for (const c of cells) {
        const u = (clock * 0.14 + c.offset) % 1;
        c.m.position.copy(c.curve.getPointAt(u));
        c.m.quaternion.setFromUnitVectors(V(1, 0, 0), c.curve.getTangentAt(u));
        c.m.material.color.lerpColors(
          dark,
          bright,
          Math.min(u * 1.55, state.scenario === "altitude" ? 0.67 : 1),
        );
      }
      for (const g of gases) {
        g.m.visible = !g.oxy || state.scenario !== "altitude" || g.i % 2 === 0;
        let u = (clock * 0.43 + g.offset) % 1;
        if (!g.oxy) u = 1 - u;
        g.m.position.copy(g.boundary).multiplyScalar(0.46 + 0.54 * u);
        g.m.scale.setScalar(0.35 + 0.65 * Math.sin(Math.PI * u));
      }
    }
    renderer.render(scene, cam);
    for (const [k, el] of labels) {
      let [p, side] = anchors[k];
      world.copy(p);
      if (selected === "alveolus") micro.localToWorld(world);
      world.project(cam);
      const w = host.clientWidth,
        h = host.clientHeight,
        lead = clamp(w * 0.065, 15, 65);
      let x =
          (world.x + 1) * 0.5 * w +
          (lead + 3) * side -
          (side < 0 ? el.offsetWidth : 0),
        y = (1 - world.y) * 0.5 * h;
      el.style.setProperty("--lead", lead + "px");
      el.style.left = clamp(x, 7, w - el.offsetWidth - 7) + "px";
      el.style.top = y + "px";
      el.style.visibility =
        flight ||
        world.z < 0 ||
        world.z > 1 ||
        y < 45 ||
        y > h - 86 ||
        Math.abs(world.x) > 0.94
          ? "hidden"
          : "visible";
    }
    document.querySelector("#orient").textContent = label(
      selected === "body"
        ? moved
          ? "orbit"
          : "anterior"
        : selected === "airways"
          ? "tree"
          : "micro",
    );
  }
  return { update, go, makeLabels };
}
