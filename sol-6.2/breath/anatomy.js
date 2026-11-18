import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const v = (x, y, z) => new T.Vector3(x, y, z);
const lerp = T.MathUtils.lerp;
const clamp = T.MathUtils.clamp;
const ease = x => x * x * (3 - 2 * x);
const curve = points => new T.CatmullRomCurve3(points);
const color = value => new T.Color(value);
const TAU = Math.PI * 2;
const Y = v(0, 1, 0);

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const proceduralTissue = `
vec3 hash3(vec3 p) {
  return fract(sin(vec3(dot(p,vec3(91.1,42.8,173.9)),dot(p,vec3(16.1,151.7,48.3)),dot(p,vec3(137.6,28.4,79.9))))*43758.5453);
}
float grain(vec3 p) {
  vec3 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i).x,hash3(i+vec3(1,0,0)).x,f.x),mix(hash3(i+vec3(0,1,0)).x,hash3(i+vec3(1,1,0)).x,f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)).x,hash3(i+vec3(1,0,1)).x,f.x),mix(hash3(i+vec3(0,1,1)).x,hash3(i+vec3(1,1,1)).x,f.x),f.y),f.z);
}
`;

function physical(base, options = {}, kind = '') {
  const material = new T.MeshPhysicalMaterial({
    color: base, roughness: .48, clearcoat: .23, clearcoatRoughness: .42,
    ...options,
  });
  if (!kind) return material;
  const injury = { value: 0 };
  material.userData.injury = injury;
  material.customProgramCacheKey = () => kind;
  material.onBeforeCompile = shader => {
    shader.uniforms.uInjury = injury;
    shader.vertexShader = 'varying vec3 vAnatomy;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvAnatomy=position;');
    shader.fragmentShader = 'varying vec3 vAnatomy;\nuniform float uInjury;\n' + proceduralTissue + shader.fragmentShader;
    let appearance = '';
    if (kind === 'lung') appearance = `
      float m=grain(vAnatomy*8.);
      float f=grain(vAnatomy*78.);
      float marbling=pow(1.-abs(grain(vAnatomy*vec3(15.,10.,13.))*2.-1.),14.);
      diffuseColor.rgb *= mix(.62,1.25,m)*mix(.84,1.15,f);
      diffuseColor.rgb *= mix(1.,.79,marbling);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.105,.074,.083)*(.5+f),uInjury*smoothstep(.30,.74,m*.8+f*.2));
    `;
    if (kind === 'bone') appearance = `
      diffuseColor.a *= mix(1.15,.46,smoothstep(-.40,.76,vAnatomy.z));
      diffuseColor.rgb *= mix(.77,1.10,grain(vAnatomy*52.));
    `;
    if (kind === 'diaphragm') appearance = `
      diffuseColor.a *= smoothstep(-1.88,-1.03,vAnatomy.y);
      diffuseColor.rgb *= mix(.69,1.19,grain(vAnatomy*27.));
    `;
    if (kind === 'sac') appearance = `
      diffuseColor.rgb *= mix(.71,1.21,grain(vAnatomy*10.));
    `;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + appearance);
  };
  return material;
}

function shellMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.FrontSide,
    uniforms: { opacity: { value: 1 } },
    vertexShader: `
      varying vec3 local;
      varying vec3 viewN;
      varying vec3 viewP;
      void main(){
        local=position;
        viewN=normalize(normalMatrix*normal);
        vec4 p=modelViewMatrix*vec4(position,1.);
        viewP=normalize(-p.xyz);
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `
      uniform float opacity;
      varying vec3 local;
      varying vec3 viewN;
      varying vec3 viewP;
      void main(){
        float rim=pow(1.-abs(dot(normalize(viewN),normalize(viewP))),2.35);
        float neck=1.-smoothstep(2.08,2.26,local.y);
        float waist=smoothstep(-2.18,-1.55,local.y);
        float arms=1.-smoothstep(1.79,2.64,abs(local.x));
        float glow=(.038+rim*.56)*neck*waist*arms*opacity;
        if(glow<.008)discard;
        gl_FragColor=vec4(mix(vec3(.21,.42,.56),vec3(.44,.78,.88),rim),glow);
      }`,
  });
}

const lobeColors = {
  rightUpper: '#d87791', rightMiddle: '#bf4d71', rightLower: '#bf627d',
  leftUpper: '#d57e99', leftLower: '#be5c80',
};
const meshKeys = {
  'Superior lobe of right lung': 'rightUpper', 'Middle lobe of right lung': 'rightMiddle',
  'Inferior lobe of right lung': 'rightLower', 'Superior lobe of left lung': 'leftUpper',
  'Inferior lobe of left lung': 'leftLower', Trachea: 'trachea',
  'Left main bronchus': 'leftBronchus', 'Right main bronchus proper': 'rightBronchus',
};

function airwayTree() {
  const rand = randomGenerator(295418);
  const pieces = [];
  const terminals = [];
  let featured;
  function add(points, radius, generation, parent, key = 'bronchiole') {
    const path = curve(points);
    const piece = { path, radius, generation, parent, key, length: path.getLength(), children: [] };
    if (parent) parent.children.push(piece);
    pieces.push(piece);
    return piece;
  }
  const carina = v(.012, .91, -.157);
  const trachea = add([v(0,1.925,.017),v(0,1.55,-.033),v(0,1.24,-.089),carina], .097, 0, null, 'trachea');
  const right = add([carina,v(-.22,.83,-.182),v(-.28,.545,-.215),v(-.46,.07,-.35)], .068, 1, trachea, 'rightBronchus');
  const left = add([carina,v(.32,.85,-.166),v(.45,.54,-.26),v(.68,.21,-.346)], .061, 1, trachea, 'leftBronchus');

  function spread(parent, tip, direction, generation, limit, feature = false) {
    // Alter the bifurcation plane at each generation so the tree fills a volume.
    const orthogonal = new T.Vector3().crossVectors(direction, Y).normalize();
    if (orthogonal.lengthSq() < .01) orthogonal.set(1,0,0);
    const second = new T.Vector3().crossVectors(direction, orthogonal).normalize();
    const angle = rand() * TAU;
    const plane = orthogonal.multiplyScalar(Math.cos(angle)).addScaledVector(second, Math.sin(angle));
    for (const sign of [-1, 1]) {
      const nextDirection = direction.clone().multiplyScalar(.77).addScaledVector(plane, sign * (.61 + rand() * .13)).normalize();
      const length = (.34 * Math.pow(.729, generation - 3)) * (.84 + rand() * .25);
      const endpoint = tip.clone().addScaledVector(nextDirection, length);
      endpoint.clamp(limit.min, limit.max);
      if (endpoint.distanceTo(tip) < .009) endpoint.lerp(limit.getCenter(v()), .12);
      const mid = tip.clone().lerp(endpoint,.47).addScaledVector(direction, length * .10);
      const branch = add([tip,mid,endpoint], parent.radius * (.68 + rand() * .056), generation, parent);
      if (generation < 8) {
        spread(branch, endpoint, nextDirection, generation + 1, limit, feature && sign === 1);
      } else {
        terminals.push(branch);
        if (feature && sign === 1) featured = branch;
      }
    }
  }

  const lobarSites = [
    [right,.27,v(-.53,1.04,-.13),v(-.50,1.23,-.05),v(-.94,.23,-.49),v(-.16,1.48,.57)],
    [right,.66,v(-.65,.19,.00),v(-.81,.09,.22),v(-1.12,-.29,-.14),v(-.30,.47,.77)],
    [right,.99,v(-.64,-.28,-.43),v(-.78,-.48,-.39),v(-1.13,-.79,-.73),v(-.25,.36,.13)],
    [left,.74,v(.67,.69,-.14),v(.72,1.03,-.06),v(.27,.01,-.43),v(1.01,1.48,.70)],
    [left,.99,v(.77,-.18,-.40),v(.84,-.47,-.36),v(.32,-.70,-.77),v(1.14,.41,.25)],
  ];
  lobarSites.forEach(([main, at, bend, tip, min, max], index) => {
    const start = main.path.getPointAt(at);
    const branch = add([start,bend,tip],main.radius * .71,2,main,'lobar');
    spread(branch, tip, tip.clone().sub(bend).normalize(), 3, new T.Box3(min,max), index === 3);
  });
  function itinerary(branch) {
    const route = [];
    for (let piece = branch; piece; piece = piece.parent) {
      let fraction = 1;
      if (route.length && piece.children.length > 2) {
        const junction = route[0].piece.path.getPoint(0);
        let best = Infinity;
        for (let i = 0; i <= 100; i++) {
          const distance = piece.path.getPointAt(i/100).distanceToSquared(junction);
          if (distance < best) {
            best = distance;
            fraction = i / 100;
          }
        }
      }
      route.unshift({ piece, length: piece.length * fraction });
    }
    return { route, length: route.reduce((sum, leg) => sum + leg.length, 0) };
  }
  return { pieces, terminals, featured, featuredRoute: itinerary(featured), itinerary };
}

function routePoint(itinerary, fraction, target) {
  let distance = clamp(fraction,0,1) * itinerary.length;
  for (const leg of itinerary.route) {
    if (distance <= leg.length + 1e-6) return leg.piece.path.getPointAt(clamp(distance / leg.piece.length,0,1),target);
    distance -= leg.length;
  }
  return target.copy(itinerary.route.at(-1).piece.path.getPointAt(1));
}

function tube(path, radius, length = 16, sides = 8) {
  return new T.TubeGeometry(path,length,radius,sides,false);
}

function particleCloud(count, tone, size, overlay = false, additive = true) {
  const positions = new Float32Array(count * 3);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  const material = new T.ShaderMaterial({
    uniforms: { tint: { value: color(tone) }, size: { value: size }, opacity: { value: 1 } },
    vertexShader: 'uniform float size; void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size;}',
    fragmentShader: `uniform vec3 tint; uniform float opacity; void main(){
      float r=length(gl_PointCoord-.5); float core=1.-smoothstep(.07,.36,r);
      float glow=(1.-smoothstep(.13,.51,r))*.40;
      gl_FragColor=vec4(mix(tint,vec3(1.),core*.12),(core+glow)*opacity);
    }`,
    transparent: true, depthWrite: false, depthTest: !overlay, blending: additive ? T.AdditiveBlending : T.NormalBlending,
  });
  const points = new T.Points(geometry,material);
  points.frustumCulled = false;
  points.renderOrder = 9;
  return points;
}

function capillaryCurve(center, radius, plane, turn) {
  const points = [];
  for (let step = 0; step <= 30; step++) {
    const theta = turn + step * TAU / 30;
    const wobble = radius * (.095 * Math.sin(3 * theta + plane));
    const p = v(Math.cos(theta) * radius, wobble, Math.sin(theta) * radius);
    p.applyAxisAngle(v(1,0,0),plane).applyAxisAngle(Y,turn*.4).add(center);
    points.push(p);
  }
  return curve(points);
}

function makeAcinus(parent, register) {
  const micro = new T.Group();
  parent.add(micro);
  const rand = randomGenerator(1740);
  const airwayMat = physical('#da8e9d', { roughness: .42, emissive: '#641b36', emissiveIntensity: .23 });
  const duct = curve([v(-2.55,1.7,-.45),v(-1.85,1.31,-.35),v(-.95,.72,-.24),v(-.39,.21,-.10),v(.13,-.04,0)]);
  register(new T.Mesh(tube(duct,.235,32,16),airwayMat),micro,'duct');
  const sacs = [];
  const capillaries = [];
  const layouts = [
    [-1.18,.55,.28,.56],[-.85,1.2,-.03,.55],[-.27,.98,.55,.60],[.55,.90,.16,.59],
    [1.14,.36,-.30,.62],[1.29,-.34,.36,.59],[.64,-.27,.84,.60],[-.13,-.12,1.00,.58],
    [-.97,-.24,.69,.60],[-.54,-.86,.39,.58],[.26,-1.01,.07,.64],[.81,-.72,-.57,.65],
    [-.12,-.52,-.76,.60],[.37,.35,-.72,.54],
  ];
  const cellGeometry = new T.LatheGeometry([
    new T.Vector2(0,-.018),new T.Vector2(.038,-.022),new T.Vector2(.064,-.033),
    new T.Vector2(.084,-.028),new T.Vector2(.101,-.005),new T.Vector2(.092,.022),
    new T.Vector2(.070,.034),new T.Vector2(.045,.026),new T.Vector2(0,.019),
  ],20);
  const cells = new T.InstancedMesh(cellGeometry,physical('#ffffff',{ roughness:.37, clearcoat:.44 }),92);
  register(cells,micro,'cells');
  cells.frustumCulled = false;

  for (const [x,y,z,r] of layouts) {
    const center = v(x,y,z);
    const sacGroup = new T.Group();
    const geometry = new T.SphereGeometry(r,32,23);
    const positions = geometry.attributes.position;
    const p = v();
    for (let j = 0; j < positions.count; j++) {
      p.fromBufferAttribute(positions,j);
      const n = p.clone().normalize();
      p.multiplyScalar(1+.044*Math.sin(n.x*8+n.y*5)*Math.sin(n.z*6-n.y*4));
      positions.setXYZ(j,p.x,p.y,p.z);
    }
    geometry.computeVertexNormals();
    const membrane = physical('#dc8da8',{
      roughness:.36, emissive:'#78334b', emissiveIntensity:.29, clearcoat:.42,
      transparent:true, opacity:.84, depthWrite:false,
    },'sac');
    const sac = register(new T.Mesh(geometry,membrane),sacGroup,'alveoli');
    sac.position.copy(center);
    sac.renderOrder = 1;
    const root = duct.getPointAt(.69 + rand()*.30);
    const mouth = curve([root,root.clone().lerp(center,.57).add(v(0,0,-.07)),center]);
    register(new T.Mesh(tube(mouth,r*.35,12),airwayMat),sacGroup,'duct');
    for (let j = 0; j < 3; j++) {
      const c = capillaryCurve(center,r*(1.025+j*.034),.28+j*1.0,rand()*TAU);
      const vessel = tube(c,.021+j*.003,42,6);
      const colors = new Float32Array(vessel.attributes.position.count*3);
      const dark = color(j === 0 ? '#865d91' : '#693e6a');
      const light = color(j === 0 ? '#df6f83' : '#b9537b');
      for (let k = 0; k < vessel.attributes.position.count; k++) {
        dark.clone().lerp(light,ease(Math.floor(k/7)/42)).toArray(colors,k*3);
      }
      vessel.setAttribute('color',new T.BufferAttribute(colors,3));
      const m = physical('#ffffff',{ vertexColors:true, roughness:.52, emissive:'#46213c',emissiveIntensity:.22 });
      const cap = register(new T.Mesh(vessel,m),sacGroup,'capillary');
      cap.renderOrder = 2;
      capillaries.push({ path:c, sac:sacs.length });
    }
    sacs.push({ group:sacGroup, center, radius:r, membrane });
    micro.add(sacGroup);
  }

  const oxygen = particleCloud(110,'#ff263e',6.5,true,false);
  const carbon = particleCloud(95,'#2b9dff',6.5,true,false);
  micro.add(oxygen,carbon);
  const offsets = Array.from({ length:110 }, () => [rand(),rand(),rand()]);
  const dummy = new T.Object3D();
  const bloodDark = color('#713145');
  const bloodBright = color('#ff5768');
  const bloodColor = new T.Color();
  const offscreen = v(0,-30,0);
  const motion = v();
  const target = v();

  function update(time, amount, preset, saturation, flow) {
    micro.scale.setScalar(1 + amount*.067);
    sacs.forEach((sac,i) => {
      sac.group.visible = !preset.damage || ![2,5,7,10,12].includes(i);
      sac.membrane.color.set(preset.damage ? '#a47780' : '#dc8da8');
    });
    const speed = preset.perfusion;
    cells.count = preset.damage ? 64 : 92;
    for (let i = 0; i < cells.count; i++) {
      const cap = capillaries[(i*5+Math.floor(i/5))%capillaries.length];
      const t = (time * .227 * speed + offsets[i][0]) % 1;
      cap.path.getPointAt(t,dummy.position);
      const tangent = cap.path.getTangentAt(t);
      dummy.quaternion.setFromUnitVectors(Y,tangent);
      dummy.scale.setScalar(sacs[cap.sac].group.visible ? .65 + offsets[i][1]*.30 : 0);
      dummy.updateMatrix();
      cells.setMatrixAt(i,dummy.matrix);
      const uptake = ease(clamp((t-.05)/.67,0,1)) * clamp((saturation-73)/25,0,1);
      cells.setColorAt(i,bloodColor.copy(bloodDark).lerp(bloodBright,uptake));
    }
    cells.instanceMatrix.needsUpdate = true;
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
    for (const [cloud, outward] of [[oxygen,true],[carbon,false]]) {
      const a = cloud.geometry.attributes.position;
      const visible = Math.floor(a.count * (outward ? preset.oxygen : 1) * (preset.damage ? .70 : 1));
      for (let i = 0; i < a.count; i++) {
        const offset = offsets[i];
        const sacIndex = i % sacs.length;
        const sac = sacs[sacIndex];
        const cap = capillaries[sacIndex*3+i%3];
        const t = (time*(.42 + Math.abs(flow)*.15)*offset[1]/2 + time*.29 + offset[0]) % 1;
        cap.path.getPointAt(offset[2],target);
        const progress = outward ? t : 1-t;
        motion.copy(sac.center).lerp(target,.46+.54 * ease(progress));
        if (i >= visible || !sac.group.visible || t < .045 || t > .95) motion.copy(offscreen);
        a.setXYZ(i,motion.x,motion.y,motion.z);
      }
      a.needsUpdate = true;
    }
  }

  return { micro, update };
}

export async function createAnatomy(viewport) {
  const renderer = new T.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.setClearColor(0,0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;
  renderer.domElement.setAttribute('aria-hidden','true');
  viewport.append(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34,1,.006,55);
  const orbit = new OrbitControls(camera,renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = .085;
  orbit.rotateSpeed = .57;
  orbit.zoomSpeed = .79;
  orbit.panSpeed = .46;
  orbit.maxPolarAngle = Math.PI * .94;
  orbit.minPolarAngle = Math.PI * .06;
  const pmrem = new T.PMREMGenerator(renderer);
  const studio = new RoomEnvironment();
  scene.environment = pmrem.fromScene(studio,.025).texture;
  scene.environmentIntensity = .45;
  studio.dispose();
  pmrem.dispose();
  scene.add(new T.HemisphereLight('#b2cee9','#4a243a',1.23));
  function keyLight(tone, strength, x,y,z) {
    const light = new T.DirectionalLight(tone,strength);
    light.position.set(x,y,z);
    scene.add(light);
  }
  keyLight('#ffe1dc',2.40,-3,5,5);
  keyLight('#8ddfff',1.90,4,2,-4);
  keyLight('#b6c8ff',.52,3,-3,4);

  const anatomy = new T.Group();
  const expanding = new T.Group();
  const cage = new T.Group();
  const pulse = new T.Group();
  scene.add(anatomy);
  anatomy.add(expanding,cage,pulse);
  const clickable = [];
  function register(mesh,parent,key) {
    mesh.userData.part = key;
    parent.add(mesh);
    clickable.push(mesh);
    return mesh;
  }

  const tree = airwayTree();
  const distal = tree.featured.path.getPointAt(1);
  const acinusAnchor = new T.Group();
  acinusAnchor.position.copy(distal);
  acinusAnchor.scale.setScalar(.027);
  scene.add(acinusAnchor);
  const acinus = makeAcinus(acinusAnchor,register);

  const airwayMaterial = physical('#6ebeb9',{
    roughness:.48, emissive:'#226165',emissiveIntensity:.54, transparent:true, opacity:.98,
  });
  const centralMaterial = physical('#a1c9c6',{
    roughness:.47, emissive:'#245865', emissiveIntensity:.39, transparent:true,
  });
  const ribMaterial = physical('#bac6cf',{ transparent:true, opacity:.31, depthWrite:false, roughness:.73 },'bone');
  const spineMaterial = physical('#9aacc6',{ transparent:true, opacity:.62, depthWrite:false, roughness:.60 });
  const muscleMaterial = physical('#9e4266',{ transparent:true, opacity:.72, depthWrite:false, side:T.DoubleSide, emissive:'#491a39', emissiveIntensity:.25 },'diaphragm');
  const heartMaterial = physical('#a74761',{ transparent:true, emissive:'#49162a',emissiveIntensity:.28 });
  const glass = shellMaterial();
  const parenchyma = [];
  const branches = new T.Group();
  expanding.add(branches);
  for (const key of ['lobar','bronchiole']) {
    const pieces = tree.pieces.filter(piece => piece.generation >= 2 && piece.key === key);
    const walls = pieces.map(piece => {
      const wall = tube(piece.path,piece.radius,piece.generation < 5 ? 12 : 6,piece.generation < 5 ? 9 : 6);
      const radii = new Float32Array(wall.attributes.position.count).fill(piece.radius);
      wall.setAttribute('radius',new T.BufferAttribute(radii,1));
      return wall;
    });
    register(new T.Mesh(mergeGeometries(walls),airwayMaterial),branches,key);
    walls.forEach(g => g.dispose());
  }
  // Keep source centerlines for flow and reveal a smooth cutaway of those same pathways in the airway view.
  const innerMain = new T.Group();
  expanding.add(innerMain);
  for (const piece of tree.pieces.slice(0,3)) {
    const wall = new T.Mesh(tube(piece.path,piece.radius*.88,24,16),airwayMaterial);
    register(wall,innerMain,piece.key);
  }
  const cartilage = physical('#91bebd',{ transparent:true, opacity:0, depthWrite:false, roughness:.55 });
  const trachealRings = new T.InstancedMesh(new T.TorusGeometry(.087,.008,7,24,Math.PI*1.68),cartilage,15);
  const ringPose = new T.Object3D();
  const centerline = tree.pieces[0].path;
  for (let i=0;i<trachealRings.count;i++) {
    const at = .051+i*.061;
    centerline.getPointAt(at,ringPose.position);
    ringPose.quaternion.setFromUnitVectors(v(0,0,1),centerline.getTangentAt(at));
    ringPose.rotateZ(Math.PI*.65);
    ringPose.updateMatrix();
    trachealRings.setMatrixAt(i,ringPose.matrix);
  }
  trachealRings.renderOrder = 1;
  register(trachealRings,innerMain,'trachea');
  const trails = particleCloud(310,'#72edff',5,true);
  expanding.add(trails);
  const rand = randomGenerator(8196);
  const routes = Array.from({ length:110 },(_,i) => tree.itinerary(tree.terminals[(i*29)%tree.terminals.length]));
  const air = Array.from({ length:310 },(_,i) => ({ route:routes[i%routes.length], phase:rand(), x:(rand()-.5)*.031, z:(rand()-.5)*.031 }));
  const p = v();

  const loader = new GLTFLoader();
  const models = await Promise.all(['viscera','thorax','diaphragm','skin'].map(name => loader.loadAsync('./assets/'+name+'.glb')));
  function extracted(model, callback) {
    model.scene.updateMatrixWorld(true);
    model.scene.traverse(node => {
      if (!node.isMesh) return;
      const geometry = node.geometry.clone();
      // Quantized glTF attributes must be expanded into floating point before baking transforms.
      for (const key of ['position','normal']) {
        const a = geometry.attributes[key];
        if (!a) continue;
        const values = new Float32Array(a.count*3);
        for (let i=0;i<a.count;i++) p.fromBufferAttribute(a,i).toArray(values,i*3);
        geometry.setAttribute(key,new T.BufferAttribute(values,3));
      }
      geometry.applyMatrix4(node.matrixWorld);
      geometry.translate(0,-1.28,0).scale(10,10,10);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      callback(node.name.replaceAll('_',' '),geometry);
    });
  }

  const sourceAirways = [];
  extracted(models[0], (name,geometry) => {
    const part = meshKeys[name];
    if (Object.hasOwn(lobeColors,part)) {
      const material = physical(lobeColors[part],{
        roughness:.36, clearcoat:.33, clearcoatRoughness:.39, sheen:.34, sheenColor:color('#ffadc6'),
        emissive:'#7e2f50', emissiveIntensity:.24, transparent:true,
      },'lung');
      const mesh = register(new T.Mesh(geometry,material),expanding,part);
      parenchyma.push({ mesh, base:color(lobeColors[part]) });
    } else if (part) {
      sourceAirways.push(register(new T.Mesh(geometry,centralMaterial),part === 'trachea' ? anatomy : expanding,part));
    } else {
      register(new T.Mesh(geometry,heartMaterial),pulse,'heart');
    }
  });
  extracted(models[1], (name,geometry) => {
    const vertebra = name.toLowerCase().includes('vertebra');
    const bone = register(new T.Mesh(geometry,vertebra ? spineMaterial : ribMaterial),vertebra ? anatomy : cage,vertebra ? 'spine' : 'ribs');
    bone.renderOrder = 3;
  });
  let diaphragm, relaxedDiaphragm;
  extracted(models[2], (name,geometry) => {
    diaphragm = register(new T.Mesh(geometry,muscleMaterial),anatomy,'diaphragm');
    relaxedDiaphragm = geometry.attributes.position.array.slice();
    diaphragm.renderOrder = 2;
  });
  extracted(models[3], (name,geometry) => {
    const shell = register(new T.Mesh(geometry,glass),anatomy,'torso');
    shell.renderOrder = 5;
  });

  const view = {
    body: { target:v(0,.10,0), delta:v(.73,.15,8.70), min:2.4, max:14, blend:[1,0,0] },
    airways: { target:v(.04,.56,-.12), delta:v(.71,.32,5.55), min:.45, max:12, blend:[0,1,0] },
    alveolus: { target:distal.clone().add(v(0,.002,0)), delta:v(.024,.025,.220), min:.105, max:.68, blend:[0,0,1] },
  };
  let current = 'body';
  const weights = [1,0,0];
  let flight;
  let width = 0, height = 0;
  const projected = v();
  function desiredPose(name) {
    const pose = view[name];
    const framing = name === 'alveolus' ? 1 + Math.max(0,.89-camera.aspect)*1.75 : 1 + Math.max(0,.85-camera.aspect)*.65;
    return { target:pose.target, position:pose.target.clone().addScaledVector(pose.delta,framing) };
  }
  function reset(immediate = false) {
    const destination = desiredPose(current);
    if (immediate) {
      camera.position.copy(destination.position);
      orbit.target.copy(destination.target);
      orbit.minDistance = view[current].min;
      orbit.maxDistance = view[current].max;
      orbit.update();
      return;
    }
    flight = { elapsed:0, duration:.78, start:camera.position.clone(), target:orbit.target.clone(),
      end:destination.position, endTarget:destination.target, from:current, to:current };
    orbit.enabled = false;
  }
  function resize() {
    const b = viewport.getBoundingClientRect();
    if (!b.width || !b.height) return;
    width = b.width;
    height = b.height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  new ResizeObserver(resize).observe(viewport);
  resize();
  reset(true);
  function setView(name) {
    if (current === name) return;
    const from = current;
    current = name;
    const destination = desiredPose(name);
    flight = { elapsed:0, duration:name === 'alveolus' ? 1.75 : 1.35, start:camera.position.clone(),
      target:orbit.target.clone(), end:destination.position, endTarget:destination.target, from, to:name };
    orbit.enabled = false;
  }

  const pinPoints = {
    body:[
      { key:'trachea',point:v(.075,1.59,.10),side:'right',leader:61 },
      { key:'rightLung',point:v(-.77,.64,.67),side:'left',leader:42 },
      { key:'diaphragm',point:v(.73,-.91,.70),side:'right',leader:39 },
    ],
    airways:[
      { key:'trachea',point:v(.02,1.30,-.02),side:'left',leader:38 },
      { key:'leftBronchus',point:v(.47,.54,-.18),side:'right',leader:45 },
      { key:'bronchiole',point:v(-.93,.12,.15),side:'left',leader:24 },
    ],
    alveolus:[
      { key:'duct',point:v(-1.64,1.18,-.14),side:'left',leader:26 },
      { key:'alveoli',point:v(.95,.60,.55),side:'right',leader:38 },
      { key:'capillary',point:v(.61,-.86,.71),side:'right',leader:28 },
    ],
  };

  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const injuryColor = color('#725463');
  const narrowColor = color('#d287a1');
  const cleanAirway = color('#6ebeb9');
  let airwayNarrowing = 0;
  let lastNarrowing = 0;
  let lastContraction = -1;
  let down;
  function ancestorVisible(obj) {
    for (let node=obj;node;node=node.parent) if (!node.visible) return false;
    return true;
  }
  function setPick(handler) {
    renderer.domElement.addEventListener('pointerdown',e => {
      if (e.button === 0) down = { x:e.clientX,y:e.clientY };
    });
    renderer.domElement.addEventListener('pointerup',e => {
      if (e.button !== 0 || !down || Math.hypot(e.clientX-down.x,e.clientY-down.y)>5 || flight) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      ndc.set((e.clientX-bounds.left)/bounds.width*2-1,1-(e.clientY-bounds.top)/bounds.height*2);
      ray.setFromCamera(ndc,camera);
      const eligible = clickable.filter(mesh => ancestorVisible(mesh) && (
        current === 'alveolus' || current === 'airways' && ['trachea','rightBronchus','leftBronchus','lobar','bronchiole'].includes(mesh.userData.part)
        || current === 'body' && mesh !== trails
      ));
      const hits = ray.intersectObjects(eligible,false);
      // Glass and translucent rib surfaces can be inspected where they do not cover another organ.
      const anatomicalHits = hits.filter(hit => {
        if (hit.object.userData.part !== 'torso') return true;
        return Math.abs(hit.point.x)<2.55 && hit.point.y>-2.11 && hit.point.y<2.25;
      });
      const hit = anatomicalHits.find(h => !['ribs','torso'].includes(h.object.userData.part)) || anatomicalHits[0];
      handler(hit?.object.userData.part);
    });
    renderer.domElement.addEventListener('pointercancel',() => { down = null; });
  }

  function update(dt,state,preset,updatePins) {
    if (flight) {
      flight.elapsed += dt;
      const t = clamp(flight.elapsed/flight.duration,0,1);
      const progress = ease(t);
      camera.position.lerpVectors(flight.start,flight.end,progress);
      orbit.target.lerpVectors(flight.target,flight.endTarget,progress);
      if (flight.to !== 'body' && flight.from !== flight.to) {
        const follow = ease(clamp((t-.05)/.82,0,1));
        const branchPoint = routePoint(tree.featuredRoute,lerp(.04,flight.to === 'alveolus' ? 1 : .63,follow),v());
        orbit.target.lerp(branchPoint,Math.sin(Math.PI*t)*.89);
        const offset = v(.36,.19,lerp(4.9,flight.to === 'alveolus' ? .24 : 4.3,follow));
        camera.position.lerp(branchPoint.add(offset),Math.sin(Math.PI*t)*.66);
      }
      camera.lookAt(orbit.target);
      if (t >= 1) {
        orbit.minDistance = view[current].min;
        orbit.maxDistance = view[current].max;
        orbit.enabled = true;
        flight = null;
      }
    }
    if (!flight) orbit.update();
    const blend = view[current].blend;
    weights.forEach((value,i) => { weights[i]=lerp(value,blend[i],1-Math.exp(-dt*(i===2?5:8))); });
    const [body,airways,micro] = weights;
    const macro = body+airways;
    anatomy.visible = macro>.025 && micro<.85;
    acinusAnchor.visible = micro>.12 && (current === 'alveolus' || macro<.82);
    glass.uniforms.opacity.value = body;
    ribMaterial.opacity = (.34*body + .025*airways)*macro;
    spineMaterial.opacity = (.66*body + .09*airways)*macro;
    muscleMaterial.opacity = .72*body;
    heartMaterial.opacity = .96*body + .035*airways;
    centralMaterial.opacity = .97*body;
    centralMaterial.depthWrite = body > .68;
    for (const airway of sourceAirways) airway.visible = body > .10;
    airwayMaterial.opacity = .02*body + .98*airways;
    cartilage.opacity = .83*airways;
    branches.visible = airways>.04;
    innerMain.visible = airways>.04;
    const pull = state.amount * (state.depth/500) ** .75;
    const expansion = Math.min(pull,2.7);
    expanding.scale.set(1+.044*expansion,1+.072*expansion,1+.054*expansion);
    expanding.position.y = -.0655*expansion;
    cage.scale.set(1+.024*expansion,1,1+.063*expansion);
    cage.position.y = .041*expansion;
    cage.rotation.x = .012*expansion;
    pulse.scale.setScalar(1+.015*Math.sin(state.time*TAU*.98*preset.perfusion));
    airwayNarrowing = lerp(airwayNarrowing,preset.narrow,1-Math.exp(-dt*4.8));
    airwayMaterial.color.copy(cleanAirway).lerp(narrowColor,airwayNarrowing);
    // Rebuild only the radial displacement of the tubular walls as smooth muscle narrows the lumen.
    if (Math.abs(airwayNarrowing-lastNarrowing) > .001) {
      lastNarrowing = airwayNarrowing;
      for (const mesh of branches.children) {
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        geometry.userData.surface ??= positions.array.slice();
        const original = geometry.userData.surface;
        const normals = geometry.attributes.normal;
        const radii = geometry.attributes.radius;
        for (let i=0;i<positions.count;i++) {
          const j=i*3;
          const change = airwayNarrowing * radii.getX(i) * .49;
          positions.setXYZ(i,original[j]-normals.getX(i)*change,
            original[j+1]-normals.getY(i)*change,original[j+2]-normals.getZ(i)*change);
        }
        positions.needsUpdate = true;
      }
    }
    for (const { mesh,base } of parenchyma) {
      mesh.material.opacity = .96*body + .055*airways;
      mesh.material.depthWrite = body > .83;
      const injury = mesh.material.userData.injury;
      injury.value = lerp(injury.value,preset.damage ? .92 : 0,1-Math.exp(-dt*4));
      mesh.material.color.copy(base).lerp(injuryColor,injury.value*.68);
    }
    if (Math.abs(expansion-lastContraction) > .006) {
      lastContraction = expansion;
      const contraction = diaphragm.geometry.attributes.position;
      for (let i=0;i<contraction.count;i++) {
        const j=i*3;
        const height = relaxedDiaphragm[j+1];
        const dome = clamp((height+1.94)/1.85,0,1);
        contraction.setXYZ(i,relaxedDiaphragm[j]*(1+.018*expansion),
          height-(.023+.166*dome*dome)*expansion,relaxedDiaphragm[j+2]*(1+.021*expansion));
      }
      contraction.needsUpdate = true;
      diaphragm.geometry.computeVertexNormals();
    }
    trails.material.uniforms.opacity.value = macro * (.62+.25*airways);
    trails.material.uniforms.size.value = (3.3+2.8*airways)*renderer.getPixelRatio();
    const position = trails.geometry.attributes.position;
    const airflow = clamp(state.flow,-3.8,3.8) * (.63 + .37*airways);
    const count = Math.round((154 + 120*airways) * preset.oxygen * (.75 + .25*Math.min(1.5,state.rate/14)));
    for (let i=0;i<air.length;i++) {
      const particle = air[i];
      particle.phase = (particle.phase + dt*airflow*(.42+ i%7*.016)*(1-(state.flow<0?.40:.17)*airwayNarrowing)+2)%1;
      routePoint(particle.route,particle.phase,p);
      const jitter = clamp((1-particle.phase)*2, .06,1);
      position.setXYZ(i,p.x+particle.x*jitter,p.y,p.z+particle.z*jitter);
    }
    trails.geometry.setDrawRange(0,count);
    position.needsUpdate = true;
    if (acinusAnchor.visible) acinus.update(state.time,state.amount,preset,state.saturation,state.flow);
    renderer.render(scene,camera);
    updatePins(pinPoints[current].map(pin => {
      projected.copy(pin.point);
      if (current === 'alveolus') acinus.micro.localToWorld(projected);
      if (pin.key === 'diaphragm') projected.y -= .10*expansion;
      projected.project(camera);
      return { ...pin,x:(projected.x*.5+.5)*width,y:(.5-projected.y*.5)*height,
        visible:!flight && projected.z < 1 && projected.z > -1 && Math.abs(projected.x)<.92 && Math.abs(projected.y)<.85 };
    }),width,height);
  }

  return { setView, reset, setPick, update };
}
