import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const v=(x,y,z)=>new T.Vector3(x,y,z);

export function createRenderer(container) {
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFShadowMap;
  container.appendChild(renderer.domElement);
  const scene=new T.Scene();
  scene.background=new T.Color(0x8c6e69);
  scene.fog=new T.FogExp2(0xb08776,.00335);
  const camera=new T.PerspectiveCamera(75,1,.055,1550);
  camera.rotation.order='YXZ';
  scene.add(camera);
  scene.add(new T.HemisphereLight(0xa8c5f6,0x766069,1.45));
  const sunDir=v(.595,.302,-.745).normalize();
  const sun=new T.DirectionalLight(0xffc089,3.6);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1536,1536);
  const shadowCam=sun.shadow.camera;
  Object.assign(shadowCam,{left:-50,right:50,top:48,bottom:-48,near:22,far:215});
  sun.shadow.normalBias=.065;
  sun.shadow.bias=-.00055;
  sun.shadow.radius=2;
  scene.add(sun,sun.target);
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new T.Vector2(1,1),.22,.63,1.01);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const draco=new DRACOLoader().setDecoderPath('./assets/three/examples/jsm/libs/draco/gltf/');
  const loader=new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  const skyPromise=new HDRLoader().loadAsync('./assets/sky.hdr').then(hdr=>{
    hdr.mapping=T.EquirectangularReflectionMapping;
    scene.environment=hdr;
    scene.environmentIntensity=.88;
    scene.environmentRotation.y=1.45;
    const sky=new T.Mesh(new T.SphereGeometry(1,40,24),new T.ShaderMaterial({
      side:T.BackSide,depthWrite:false,depthTest:false,
      uniforms:{sky:{value:hdr},sunDir:{value:sunDir}},
      vertexShader:`
        varying vec3 ray;
        void main(){
          ray=position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
        }`,
      fragmentShader:`
        uniform sampler2D sky;
        uniform vec3 sunDir;
        varying vec3 ray;
        void main(){
          vec3 d=normalize(ray);
          float u=atan(d.z,d.x)*.15915494+.5;
          float h=asin(clamp(d.y,-1.,1.))*.31830989+.5;
          vec3 photo=texture2D(sky,vec2(fract(u+.23),h)).rgb;
          float high=smoothstep(-.03,.68,d.y);
          float low=smoothstep(-.10,.28,d.y);
          vec3 dusk=mix(vec3(.68,.32,.19),vec3(.30,.27,.33),low);
          dusk=mix(dusk,vec3(.115,.20,.35),high);
          float luminance=dot(photo,vec3(.2126,.7152,.0722));
          vec3 clouds=photo/(1.+luminance*1.05);
          clouds=mix(clouds*vec3(1.15,.77,.62),clouds*vec3(.82,.94,1.14),high);
          vec3 air=clouds*.59+dusk*.72;
          float towards=max(dot(d,sunDir),0.);
          air+=vec3(.46,.135,.040)*pow(towards,11.);
          air+=vec3(.94,.29,.07)*pow(towards,55.);
          air+=vec3(2.7,.88,.16)*pow(towards,369.);
          air+=vec3(24.,9.,2.)*smoothstep(.99983,.99992,towards);
          gl_FragColor=vec4(air,1.);
        }`
    }));
    sky.scale.setScalar(1410);
    sky.frustumCulled=false;
    sky.renderOrder=-100;
    scene.add(sky);
    return sky;
  });

  function resize(){
    const width=innerWidth,height=innerHeight;
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height);
    composer.setSize(width,height);
  }
  window.addEventListener('resize',resize);
  resize();

  const anchor=v(NaN,NaN,NaN);
  function render(sky) {
    if(sky) sky.position.copy(camera.position);
    if(!Number.isFinite(anchor.x)||anchor.distanceToSquared(camera.position)>3.5){
      anchor.copy(camera.position);
      sun.target.position.copy(anchor);
      sun.position.copy(anchor).addScaledVector(sunDir,122);
    }
    composer.render();
  }
  return {renderer, scene, camera, loader, skyPromise, render};
}

export function makeParticles(scene) {
  const capacity=140,pool=[];
  const positions=new Float32Array(capacity*3), colors=new Float32Array(capacity*3);
  const geometry=new T.BufferGeometry();
  const verts=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage);
  const rgb=new T.BufferAttribute(colors,3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position',verts);
  geometry.setAttribute('color',rgb);
  const mapCanvas=document.createElement('canvas');
  mapCanvas.width=mapCanvas.height=32;
  const ctx=mapCanvas.getContext('2d');
  const g=ctx.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(.4,'rgba(255,255,255,.6)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,32,32);
  const map=new T.CanvasTexture(mapCanvas);
  const mat=new T.PointsMaterial({size:.145,map,transparent:true,depthWrite:false,vertexColors:true});
  const points=new T.Points(geometry,mat);
  points.frustumCulled=false;
  scene.add(points);
  let i=0;
  for(;i<capacity;i++) pool.push({p:v(0,0,0),vel:v(0,0,0),life:0,time:0,spark:false});
  i=0;
  return {
    burst(p,count,spark){
      for(let n=0;n<count;n++){
        const item=pool[i++%capacity];
        item.spark=spark;
        item.p.copy(p).add(v((Math.random()-.5)*.65,Math.random()*.12,(Math.random()-.5)*.64));
        item.vel.set((Math.random()-.5)*(spark?7:2.9),Math.random()*(spark?1.1:1.5),(Math.random()-.5)*4);
        item.life=item.time=.23+Math.random()*(spark?.26:.52);
      }
    },
    update(dt){
      let index=0;
      for(const item of pool){
        if(item.time<=0) continue;
        item.time-=dt;
        item.p.addScaledVector(item.vel,dt);
        item.vel.y-=dt*(item.spark?7:.6);
        const alpha=Math.max(0,item.time/item.life);
        positions.set([item.p.x,item.p.y,item.p.z],index*3);
        const color=item.spark?[5.5,2.5,.40]:[.88,.61,.49];
        colors.set(color.map(c=>c*(alpha*.75+.25)),index*3);
        index++;
      }
      geometry.setDrawRange(0,index);
      verts.needsUpdate=rgb.needsUpdate=true;
    }
  };
}

export function makeArms(camera) {
  const fabric=new T.MeshStandardMaterial({color:0x2d333d,roughness:.9});
  const cuff=new T.MeshStandardMaterial({color:0x9d462e,roughness:.76});
  const rubber=new T.MeshStandardMaterial({color:0x46464b,roughness:.87});
  const glove=new T.MeshStandardMaterial({color:0x26313a,roughness:.8});
  const seam=new T.MeshStandardMaterial({color:0x89766e,roughness:.7});
  const arms=[];
  const fingerGeometry=new T.CapsuleGeometry(.013,.037,3,6);
  for(const sign of [-1,1]) {
    const group=new T.Group();
    camera.add(group);
    const sleeve=new T.Mesh(new T.CapsuleGeometry(.077,.33,4,10),fabric);
    sleeve.position.y=-.16;
    group.add(sleeve);
    const wrist=new T.Mesh(new T.CylinderGeometry(.062,.077,.081,12),cuff);
    wrist.position.y=.045;
    group.add(wrist);
    const palm=new T.Mesh(new RoundedBoxGeometry(.103,.127,.054,2,.020),glove);
    palm.position.set(0,.12,0);
    group.add(palm);
    const guard=new T.Mesh(new RoundedBoxGeometry(.073,.051,.012,2,.006),rubber);
    guard.position.set(0,.144,.03);
    group.add(guard);
    for(let j=0;j<4;j++){
      const finger=new T.Mesh(fingerGeometry,j%3===0?rubber:glove);
      finger.position.set(-.038+j*.024,.174- Math.abs(j-1.25)*.007,-.018);
      finger.rotation.x=-.9;
      group.add(finger);
      const stitch=new T.Mesh(new T.BoxGeometry(.014,.006,.006),seam);
      stitch.position.set(finger.position.x,.151,.035);
      group.add(stitch);
    }
    const thumb=new T.Mesh(fingerGeometry,glove);
    thumb.position.set(-sign*.048,.103,-.016);
    thumb.rotation.set(-.52,0,-sign*.56);
    group.add(thumb);
    arms.push({group,sign});
  }
  return {
    visible(show){for(const a of arms) a.group.visible=show},
    update(player,dt) {
      for(const {group,sign} of arms){
        const mode=player.mode;
        const moving=Math.min(1,player.speed/8);
        const pump=Math.sin(player.bob*.53+(sign>0?0:Math.PI))*moving;
        const reach=mode==='mantle'||mode==='climb'||mode==='vault'?1:player.armKick*.56;
        const wall=mode==='wall'&&sign!==Math.sign(player.normal.x);
        const zip=mode==='zip';
        const slide=player.height<1;
        const x=sign*(zip?.17:wall?.42:reach?.238:.30);
        const y=zip?.19:wall?-.16:reach?-.28+reach*.14:slide?-.29:-.55+pump*.082;
        const z=zip?-.57:reach?-.49:-.64-pump*.095;
        const a=1-Math.exp(-dt*15);
        group.position.x=T.MathUtils.lerp(group.position.x,x,a);
        group.position.y=T.MathUtils.lerp(group.position.y,y,a);
        group.position.z=T.MathUtils.lerp(group.position.z,z,a);
        group.rotation.set(zip?-.15:reach?-.82:-.70+pump*.17,sign*.32,sign*(zip?-.10:wall?.70:-.14));
      }
    }
  };
}

export async function makeGhost(loader, scene) {
  const [runner,extra]=await Promise.all([
    loader.loadAsync('./assets/runner.glb'),loader.loadAsync('./assets/climb.glb')
  ]);
  const root=runner.scene;
  const ghostMat=new T.MeshStandardMaterial({
    color:0x68cae4,emissive:0x287a9b,emissiveIntensity:.77,roughness:.34,
    transparent:true,opacity:.45,depthWrite:false
  });
  root.traverse(n=>{
    if(n.isMesh){n.material=ghostMat;n.frustumCulled=false}
  });
  scene.add(root);
  root.visible=false;
  const mixer=new T.AnimationMixer(root);
  const clips=[...runner.animations,...extra.animations];
  const actions=Object.fromEntries([
    'Idle_Loop','Sprint_Loop','Jump_Loop','ClimbUp_1m','Slide_Loop','Roll','NinjaJump_Start'
  ].map(key=>[key,mixer.clipAction(T.AnimationClip.findByName(clips,key))]));
  let current=null, index=0;
  return {
    reset(){index=0;current?.stop();current=null;root.visible=false},
    update(samples,time,dt,show,player){
      if(!show||!samples?.length||time>=samples.at(-1)[0]){
        root.visible=false;return;
      }
      while(index<samples.length-2 && time>samples[index+1][0]) index++;
      const a=samples[index],b=samples[index+1]??a;
      const factor=T.MathUtils.clamp((time-a[0])/Math.max(.01,b[0]-a[0]),0,1);
      const n=(i)=>T.MathUtils.lerp(a[i],b[i],factor);
      if(a[7]!==b[7] && factor<1) root.position.set(a[1],a[2],a[3]);
      else root.position.set(n(1),n(2),n(3));
      const near=root.position.distanceTo(player.position);
      root.visible=near>1.15;
      ghostMat.opacity=T.MathUtils.clamp((near-1.05)*.28,.13,.46);
      const angle=b[4]-a[4];
      root.rotation.y=a[4]+Math.atan2(Math.sin(angle),Math.cos(angle))*factor;
      const state=a[5],speed=a[6];
      const key=state==='climb'||state==='mantle'?'ClimbUp_1m':state==='vault'?'NinjaJump_Start':
        state==='slide'?'Slide_Loop':state==='roll'?'Roll':
        state==='wall'||state==='air'||state==='zip'?'Jump_Loop':speed>1?'Sprint_Loop':'Idle_Loop';
      const action=actions[key];
      if(current!==action){
        current?.fadeOut(.10);
        action.reset().fadeIn(.10).play();
        current=action;
      }
      if(key==='Sprint_Loop') action.timeScale=T.MathUtils.clamp(speed/7.8,.62,1.55);
      mixer.update(dt);
    }
  };
}
