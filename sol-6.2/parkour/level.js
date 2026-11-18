import * as T from 'three';

const v = (x,y,z) => new T.Vector3(x,y,z);
const worldUp = v(0,1,0);
const roofData = [
  [-12,12,58,-28,16], [-10,10,59,-151,-34], [-10,11,59,-214,-168],
  [-10,11,62.25,-283,-214], [-10,12,68.5,-327,-304],
  [-1,19,60,-433,-398], [-1,19,55,-491,-452], [-1,19,50.7,-584,-501],
  [-1,19,50.7,-637,-602], [-1,19,54,-711,-637], [9,40,45,-804,-776],
  [13,36,47,-899,-812], [11,39,47.4,-972,-905],
  [12,39,55,-1060,-996], [13,38,56.7,-1125,-1067]
];
export const checkpoints = [
  [0,58,8,'Run & jump','Hold SHIFT for speed · Hold SPACE across the gap'],
  [0,59,-49,'Vault','Sprint straight through the low barrier'],
  [0,59,-91,'Slide','Sprint, then tap C before the low duct'],
  [.8,59,-138,'Wall-run','Follow the red lane · Jump beside the wall · SPACE to kick off'],
  [0,59,-195,'Wall-climb & mantle','Sprint and jump straight into the red ledge'],
  [0,62.25,-252,'The ascent','Follow the route up to the crane deck'],
  [0,68.5,-313,'Zipline','Press E at the cable handle'],
  [9,60,-414,'Slide & roll','Tap C under the gate · Tap C again just before the big landing'],
  [9,50.7,-517,'Final chain','Vault · Slide · Wall-run · Mantle · Zipline'],
  [24,47,-831,'Crown approach','Follow the arrows around the utility banks'],
  [25,55,-1009,'Tower edge','Sprint over the barrier · Jump from the red lip'],
  [25,56.7,-1111,'Finish','Reach the finish beacon']
].map(([x,y,z,name,tip])=>({position:v(x,y,z),name,tip}));
export const cables = [
  {start:v(0,70.8,-324),end:v(9,62,-403)},
  {start:v(9,56.3,-707),end:v(24,47,-781)}
];
export const TOTAL = checkpoints.length - 1;

const assetRoot = './assets/';
const color = x => new T.Color(x);
const standard = (c,roughness=.78,metalness=0)=>new T.MeshStandardMaterial({color:c,roughness,metalness});
const luminous = (c,strength)=>new T.MeshBasicMaterial({color:color(c).multiplyScalar(strength)});
let seed = 795;
function random() {
  seed = (Math.imul(1664525,seed)+1013904223) >>> 0;
  return seed / 4294967296;
}

async function materials() {
  const loader = new T.TextureLoader();
  async function maps(folder, tint, meters, roughness, metalness, glass=false) {
    const keys = ['color','normal',glass?'rough':'arm'];
    const [map,normalMap,arm] = await Promise.all(keys.map(async key=>{
      const texture = await loader.loadAsync(assetRoot+'materials/'+folder+'/'+key+'.jpg');
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.anisotropy = 4;
      if(key==='color') texture.colorSpace = T.SRGBColorSpace;
      return texture;
    }));
    const mat = new T.MeshStandardMaterial({color:tint,map,normalMap,roughnessMap:arm,roughness,metalness});
    mat.normalScale.setScalar(glass?.24:.60);
    if(!glass) mat.aoMap=arm;
    if(folder==='metal_plate') mat.metalnessMap=arm;
    mat.userData.meters = meters;
    return mat;
  }
  const [concrete,brick,steel,asphalt,glass] = await Promise.all([
    maps('concrete_floor_worn_02',0xaaa4a2,5.3,.96,.04),
    maps('factory_brick',0x9a7f78,5.6,.9,0),
    maps('metal_plate',0xa59d98,3.2,.76,.56),
    maps('asphalt_02',0x939193,10,1,0),
    maps('facade',0x9baabf,11,1,.28,true)
  ]);
  return {concrete,brick,steel,asphalt,glass};
}

export async function buildLevel(scene, loader) {
  const names = ['exterior_aircon_unit','plastic_crate_02','small_lpg_tank','modular_airduct_circular_01','portable_generator','overhead_crane','modular_pipes'];
  const [m,models] = await Promise.all([materials(),Promise.all(names.map(n=>loader.loadAsync(assetRoot+'models/'+n+'.glb')))]);
  const templates = Object.fromEntries(names.map((name,i)=>[name,models[i].scene]));
  const blocks=[], slopes=[], vision=[], markers=[];
  const boxes=new Map();
  const boxUnit=new T.BoxGeometry();
  const pipeUnit=new T.CylinderGeometry(1,1,1,8);
  const fittings=new Map();
  const glazing=new Map();
  const paneUnit=new T.PlaneGeometry();
  const trim=standard(0x55505a,.76,.29);
  const dark=standard(0x252b34,.72,.38);
  const rusty=standard(0x835745,.66,.37);
  const divider=standard(0x79716d);
  const safety=standard(0xddac6b,.7,.22);
  const ice=luminous(0x9cdfff,2.0);
  const orange=luminous(0xff7950,2.5);
  const warm=luminous(0xffb580,1.65);
  const signal=standard(0xe26848,.69,.10);
  signal.emissive.setHex(0xdd3118);
  signal.emissiveIntensity=.75;
  const stroke=luminous(0xff714b,1.7);
  const facadeGlints = [
    standard(0x414757,.42,.55),standard(0x5e5962,.47,.30),standard(0x353e4c,.37,.55),
    standard(0x827270,.58,.34),luminous(0xc18e69,.74)
  ];
  const distantWalls = [0x746d72,0x615c66,0x66636a,0x575968,0x796762,0x65636f].map(c=>standard(c,.91,.14));
  const cityTops=[0x6d6a6c,0x6c5960,0x6a6b73].map(c=>standard(c));
  const transform=new T.Matrix4();
  const quaternion=new T.Quaternion();
  const scale=v(1,1,1);
  const rotation=new T.Euler();
  const lineDirection=v(0,0,0);
  const middle=v(0,0,0);
  const sourceBounds=new Map();

  function addBlock(x1,x2,y1,y2,z1,z2,kind='concrete',features={}) {
    const b={x1,x2,y1,y2,z1,z2,kind,...features};
    blocks.push(b);
    return b;
  }

  function stamp(collection,material,matrix,shadow) {
    const elements=matrix.elements;
    const cell=Math.floor(elements[12]/110)+':'+Math.floor(elements[14]/110);
    const key=material.uuid+(shadow?'s':'n')+cell;
    if(!collection.has(key)) collection.set(key,{material,shadow,matrices:[]});
    collection.get(key).matrices.push(matrix.clone());
  }

  function cub(x,y,z,w,h,d,material,shadow=true,ry=0) {
    rotation.set(0,ry,0);
    quaternion.setFromEuler(rotation);
    transform.compose(v(x,y,z),quaternion,scale.set(w,h,d));
    stamp(boxes,material,transform,shadow);
  }

  function pane(x,y,z,w,h,mat,ry) {
    rotation.set(0,ry,0);
    quaternion.setFromEuler(rotation);
    transform.compose(v(x,y,z),quaternion,scale.set(w,h,1));
    stamp(glazing,mat,transform,false);
  }

  function pipe(a,b,r,mat=trim,shadow=true) {
    lineDirection.subVectors(b,a);
    const length=lineDirection.length();
    quaternion.setFromUnitVectors(worldUp,lineDirection.normalize());
    transform.compose(middle.copy(a).lerp(b,.5),quaternion,scale.set(r,length,r));
    stamp(fittings,mat,transform,shadow);
  }

  function mesh(g,mat,x,y,z,casts=true) {
    const o=new T.Mesh(g,mat);
    o.position.set(x,y,z);
    o.castShadow=casts;
    o.receiveShadow=true;
    scene.add(o);
    return o;
  }

  function texturedBox(x,y,z,w,h,d,mat,shadow=true) {
    const g = new T.BoxGeometry(w,h,d);
    const uv=g.attributes.uv;
    const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
    for(let i=0;i<24;i++){
      const [u,vv]=dims[Math.floor(i/4)];
      uv.setXY(i,uv.getX(i)*u/mat.userData.meters,uv.getY(i)*vv/mat.userData.meters);
    }
    return mesh(g,mat,x,y,z,shadow);
  }

  function routeMark(g,mat,x,y,z,rx=0) {
    const o=mesh(g,mat,x,y,z,false);
    o.rotation.x=rx;
    vision.push(o);
    return o;
  }

  function routeTile(x,y,z,w,d) {
    return routeMark(new T.BoxGeometry(w,.025,d),signal,x,y+.025,z);
  }

  function lane(x,y,z1,z2,wide=false) {
    for(let z=z1;z>z2;z-=wide?3.4:6.8) {
      const shape=new T.Shape();
      shape.moveTo(-.45,-.32);
      shape.lineTo(0,.04);
      shape.lineTo(.45,-.32);
      shape.lineTo(.45,-.04);
      shape.lineTo(0,.33);
      shape.lineTo(-.45,-.04);
      shape.closePath();
      routeMark(new T.ShapeGeometry(shape),stroke,x,y+.04,z,-Math.PI/2);
    }
  }

  function facade(x,z,w,d,bottom,top,detail,type) {
    const edge=detail?.65:.16;
    const cap=detail?.30:.12;
    cub(x,top+cap*.5,z,w+.42,cap,d+.42,detail?trim:cityTops[type%3],detail);
    if(detail) cub(x,top-.85,z,w+.2,.14,d+.2,divider);
    for(let face=0;face<4;face++) {
      const inward=face<2;
      const side=face%2===0?1:-1;
      const span=inward?w:d;
      const div=detail?(type%2?2.55:2.8):(type%2?3.4:4.1);
      const cols=Math.max(2,Math.floor((span-edge*2)/div));
      const step=(span-edge*2)/cols;
      const ystep=type%3===0?3.65:3.08;
      const windowHeight=ystep*(type%3===0?.77:.61);
      const offset=(inward?d:w)/2+.03;
      for(let iy=top-2;iy>bottom+3;iy-=ystep) {
        if(detail && iy<top-32) break;
        if(!detail && iy<top-47) break;
        for(let ix=0;ix<cols;ix++) {
          const shift=-span/2+edge+step*(ix+.5);
          const wt=step*(type%3===0?.91:.71);
          const mat=facadeGlints[random()<.07?4:Math.floor(random()*4)];
          if(inward) pane(x+shift,iy,z+side*offset,wt,windowHeight,mat,side===1?0:Math.PI);
          else pane(x+side*offset,iy,z+shift,wt,windowHeight,mat,side*Math.PI/2);
        }
        if(detail) {
          if(inward) cub(x,iy-windowHeight*.66,z+side*(offset+.03),span,.10,.15,trim);
          else cub(x+side*(offset+.03),iy-windowHeight*.66,z,.15,.10,span,trim);
        }
      }
      if(detail && type%3===0) {
        for(let ix=0;ix<=cols;ix++) {
          const shift=-span/2+edge+step*ix;
          if(inward) cub(x+shift,top-13,z+side*(offset+.027),.13,25,.2,trim);
          else cub(x+side*(offset+.027),top-13,z+shift,.2,25,.13,trim);
        }
      }
    }
  }

  for(const [i,[x1,x2,y,z1,z2]] of roofData.entries()) {
    const x=(x1+x2)/2,z=(z1+z2)/2,w=x2-x1,d=z2-z1;
    const wall=i%3===1?m.brick:i%3===2?m.glass:m.concrete;
    texturedBox(x,y/2-3,z,w,y+6,d,wall);
    facade(x,z,w,d,0,y-.44,true,i);
    texturedBox(x,y-.19,z,w+.10,.38,d+.10,i===4||i===9?m.steel:m.concrete);
    addBlock(x1,x2,-6,y,z1,z2,i===4||i===9?'metal':'concrete');
    if(d>28) {
      for(const side of [-1,1]){
        const sx=x+(w/2-.15)*side;
        cub(sx,y+.19,z,.24,.38,d-2,trim);
        cub(sx,y+.39,z,.34,.085,d-2,divider);
      }
      for(let zz=z1+1.5;zz<z2-1;zz+=4) {
        cub(x-w/2+.52,y+.012,zz,.10,.024,2.2,safety,false);
        cub(x+w/2-.52,y+.012,zz,.10,.024,2.2,safety,false);
      }
    }
  }

  function ramp(x1,x2,z1,z2,h1,h2) {
    const x=(x1+x2)/2,w=x2-x1;
    const t1=v(x1,h1,z1),t2=v(x2,h1,z1),t3=v(x1,h2,z2),t4=v(x2,h2,z2);
    const geom=new T.BufferGeometry().setFromPoints([t1,t2,t3,t2,t4,t3]);
    geom.setAttribute('uv',new T.Float32BufferAttribute([0,0,w/3,0,0,7,w/3,0,w/3,7,0,7],2));
    geom.computeVertexNormals();
    mesh(geom,m.steel,0,0,0);
    slopes.push({x1,x2,z1:z2,z2:z1,h1:h2,h2:h1,kind:'metal'});
    for(const side of [-1,1]){
      const sx=x+side*(w/2-.11);
      pipe(v(sx,h1+.12,z1),v(sx,h2+.12,z2),.14,safety);
      pipe(v(sx,h1-.45,z1),v(sx,h2-.45,z2),.21,trim);
    }
    for(let z=z1-2;z>z2;z-=3){
      const y=h1+(h2-h1)*((z-z1)/(z2-z1));
      cub(x,y-.7,z,w-.20,.20,.25,trim);
      cub(x-w/2,y-3,z,.24,6,.24,trim);
      cub(x+w/2,y-3,z,.24,6,.24,trim);
    }
  }

  ramp(-3.8,3.8,-283,-304,62.25,68.5);
  ramp(5,13,-433,-452,60,55);
  ramp(20,30,-972,-996,47.4,55);
  for(const [x,z1,z2,h1,h2] of [[0,-283,-304,62.25,68.5],[9,-433,-452,60,55],[25,-972,-996,47.4,55]]) {
    for(let z=z1-2;z>z2;z-=3.8) {
      const y=h1+(h2-h1)*(z-z1)/(z2-z1);
      const strip=routeTile(x,y+.028,z,1.26,.18);
      strip.rotation.x=Math.atan2(h1-h2,z1-z2)*-1;
    }
  }

  function place(asset,x,y,z,width,rz=0,child,casts=true) {
    const template=templates[asset];
    const source=child?template.getObjectByName(child):template;
    if(!source) return;
    const key=asset+':'+(child??'scene');
    if(!sourceBounds.has(key)){
      const sample=source.clone(true);
      sample.position.set(0,0,0);
      const aabb=new T.Box3().setFromObject(sample);
      sourceBounds.set(key,{center:aabb.getCenter(v(0,0,0)),size:aabb.getSize(v(0,0,0)),bottom:aabb.min.y});
    }
    const data=sourceBounds.get(key);
    const o=source.clone(true);
    const s=width/Math.max(data.size.x,data.size.z,asset==='modular_pipes'?data.size.y:0);
    o.position.set(-data.center.x*s,-data.bottom*s,-data.center.z*s);
    o.scale.multiplyScalar(s);
    const group=new T.Group();
    group.position.set(x,y,z);
    group.rotation.y=rz;
    group.add(o);
    o.traverse(node=>{
      if(node.isMesh){node.castShadow=casts;node.receiveShadow=true}
    });
    scene.add(group);
    if(asset!=='exterior_aircon_unit' && asset!=='overhead_crane'){
      const bounds=new T.Box3().setFromObject(group);
      const lo=bounds.min,hi=bounds.max;
      addBlock(lo.x,hi.x,lo.y,hi.y,lo.z,hi.z,'metal');
    }
    return group;
  }

  function ac(x,y,z,angle=0,width=1.70,rough=false) {
    place('exterior_aircon_unit',x,y,z,width,angle,rough?'exterior_aircon_unit_rusted':'exterior_aircon_unit');
    const h=.95*width;
    addBlock(x-width*.43,x+width*.43,y,y+h*.75,z-width*.34,z+width*.34,'metal');
    cub(x,y+.055,z,width+.1,.11,width*.62,trim);
    for(const side of [-1,1]){
      const offset=side*width*.33;
      cub(x+offset,y+width*.185,z,.079,width*.37,.13,trim,true,angle);
    }
  }

  function tank(x,y,z,r) {
    const bottom=y+1.5;
    mesh(new T.CylinderGeometry(r,r,2.7,24),m.steel,x,bottom+1.35,z);
    mesh(new T.ConeGeometry(r*1.04,.71,24),rusty,x,bottom+3.05,z);
    for(let a=0;a<4;a++){
      const ang=(a+.5)*Math.PI/2, nx=x+Math.cos(ang)*r, nz=z+Math.sin(ang)*r;
      pipe(v(nx,y,nz),v(nx,bottom+.30,nz),.10,trim);
      pipe(v(nx,bottom+.2,nz),v(x+Math.cos(ang+1.57)*r,y,z+Math.sin(ang+1.57)*r),.059,rusty);
    }
    for(const off of [.16,1.61,2.52]){
      const ring=mesh(new T.TorusGeometry(r+.02,.033,6,28),trim,x,bottom+off,z);
      ring.rotation.x=Math.PI/2;
    }
    for(let h=.25;h<4.2;h+=.31) pipe(v(x-.19,y+h,z+r+.08),v(x+.19,y+h,z+r+.08),.028,safety);
    pipe(v(x-.19,y,z+r+.08),v(x-.19,y+4.4,z+r+.08),.042,trim);
    pipe(v(x+.19,y,z+r+.08),v(x+.19,y+4.4,z+r+.08),.042,trim);
    addBlock(x-.85*r,x+.85*r,y,y+4.45,z-.83*r,z+.83*r,'metal');
  }

  function antenna(x,y,z,h=8,casts=true){
    pipe(v(x,y,z),v(x,y+h,z),.055,trim,casts);
    for(let a=0;a<3;a++){
      const angle=a*2*Math.PI/3,ox=x+Math.cos(angle)*1.9,oz=z+Math.sin(angle)*1.9;
      pipe(v(ox,y,oz),v(x,y+h*.7,z),.018,trim,casts);
      cub(ox,y+.06,oz,.21,.12,.21,dark,casts);
    }
    for(let i=0;i<4;i++) pipe(v(x-.6-i*.12,y+h-i*.45,z),v(x+.6+i*.12,y+h-i*.45,z),.031,divider,casts);
    cub(x,y+h+.04,z,.16,.16,.16,orange,false);
  }

  function fence(x,y,z,length,alongZ=false){
    const axis=(s,h)=>alongZ?v(x,y+h,z+s):v(x+s,y+h,z);
    const height=1.65;
    for(let i=0;i<=Math.ceil(length/1.8);i++){
      const s=-length*.5+length*i/Math.ceil(length/1.8);
      pipe(axis(s,0),axis(s,height),.042,trim);
    }
    for(const h of [.06,height]) pipe(axis(-length/2,h),axis(length/2,h),.035,trim);
    for(let s=-length/2;s<length/2;s+=.29){
      for(const d of [-1,1]){
        const end=T.MathUtils.clamp(s+d*1.20,-length/2,length/2);
        pipe(axis(s,0),axis(end,height*Math.abs(end-s)/1.20),.009,divider,false);
      }
    }
    if(alongZ) addBlock(x-.05,x+.05,y,y+height,z-length/2,z+length/2,'metal');
    else addBlock(x-length/2,x+length/2,y,y+height,z-.05,z+.05,'metal');
  }

  function billboard(x,y,z,w,h,style=0){
    const c=document.createElement('canvas');
    c.width=768;c.height=384;
    const ctx=c.getContext('2d');
    const grd=ctx.createLinearGradient(0,384,768,0);
    if(style===0){grd.addColorStop(0,'#3b202a');grd.addColorStop(1,'#8a3e31')}
    else {grd.addColorStop(0,'#151a2b');grd.addColorStop(1,'#364358')}
    ctx.fillStyle=grd;ctx.fillRect(0,0,768,384);
    ctx.strokeStyle=style?'#92c9e0':'#ffd0a5';ctx.lineWidth=2;ctx.strokeRect(16,16,736,352);
    ctx.lineWidth=1;
    for(let xx=32;xx<768;xx+=32){
      ctx.globalAlpha=.13;ctx.beginPath();ctx.moveTo(xx,18);ctx.lineTo(xx,366);ctx.stroke();
    }
    for(let yy=32;yy<384;yy+=32){
      ctx.beginPath();ctx.moveTo(18,yy);ctx.lineTo(750,yy);ctx.stroke();
    }
    ctx.globalAlpha=1;ctx.fillStyle=style?'#b3d7e7':'#ffb592';
    ctx.font='22px monospace';
    ctx.fillText(style?'AIR STUDIES  /  28':'NORTHLINE  /  07',38,57);
    ctx.fillText(style?'ELEVATION SYSTEMS':'DISTRICT 07',38,344);
    ctx.lineWidth=13;
    if(style===0){
      for(let i=0;i<3;i++){
        const j=i*87;
        ctx.beginPath();ctx.moveTo(209+j,274);ctx.lineTo(319+j,109);ctx.lineTo(366+j,109);ctx.lineTo(256+j,274);ctx.closePath();ctx.fill();
      }
    } else {
      for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(391,191,155+i*18,19+i*25,-.29,0,Math.PI*2);ctx.stroke()}
    }
    const map=new T.CanvasTexture(c);
    map.colorSpace=T.SRGBColorSpace;
    const mat=new T.MeshBasicMaterial({map,color:color(0xffffff).multiplyScalar(1.35),side:T.DoubleSide});
    cub(x,y,z,w+.26,h+.28,.34,dark);
    mesh(new T.PlaneGeometry(w,h),mat,x,y,z+.183,false);
    for(const side of [-1,1]) {
      cub(x+side*w*.34,y-h*.55,z-.30,.18,h*1.5,.25,trim);
      pipe(v(x+side*w*.34,y-h*1.2,z-.8),v(x+side*w*.34,y+h*.45,z-.18),.08,trim);
    }
    pipe(v(x-w/2,y-h*.48,z+.22),v(x+w/2,y-h*.48,z+.22),.019,style?ice:orange,false);
  }

  function scaffold(x,y,z,h,w=4){
    const sides=[[-1,-1],[-1,1],[1,1],[1,-1]];
    for(const [u,s] of sides) pipe(v(x+u*w/2,y,z+s*w/2),v(x+u*w/2,y+h,z+s*w/2),.061,safety);
    for(let j=0;j<h;j+=2.4){
      for(let i=0;i<4;i++){
        const [a,b]=sides[i], [c,d]=sides[(i+1)%4];
        pipe(v(x+a*w/2,y+j,z+b*w/2),v(x+c*w/2,y+j,z+d*w/2),.048,trim);
        pipe(v(x+a*w/2,y+j,z+b*w/2),v(x+c*w/2,y+Math.min(h,j+2.4),z+d*w/2),.033,rusty);
      }
      if(j>1) cub(x,y+j,z,w,.08,w,trim);
    }
  }

  function towerCrane(x,y,z,h,reach) {
    scaffold(x,y,z,h,1.5);
    const gy=y+h;
    for(const s of [-1,1]) {
      pipe(v(x-reach*.27,gy+.10,z+s*.56),v(x+reach,gy+.10,z+s*.56),.078,safety);
      pipe(v(x-reach*.27,gy+.94,z+s*.56),v(x+reach,gy+.94,z+s*.56),.071,safety);
      for(let i=-reach*.26;i<reach-1.4;i+=1.4)
        pipe(v(x+i,gy+.10,z+s*.56),v(x+i+1.4,gy+.94,z+s*.56),.048,rusty);
    }
    pipe(v(x,gy,z),v(x,gy+3.8,z),.12,trim);
    pipe(v(x,gy+3.8,z),v(x+reach*.86,gy+.94,z),.028,trim);
    pipe(v(x,gy+3.8,z),v(x-reach*.25,gy+.94,z),.028,trim);
    pipe(v(x+reach*.68,gy,z),v(x+reach*.68,gy-8,z),.023,dark);
    cub(x+reach*.68,gy-8,z,.38,.25,.19,safety);
    cub(x,gy+3.9,z,.18,.20,.18,orange,false);
  }

  function propRoof(x,y,z,i){
    for(const s of [-1,1]){
      const xx=x+s*(5.4+random()*1.05);
      ac(xx,y,z+s,0,1.38+random()*.52,i%2===0);
      if(i%3===0) place('plastic_crate_02',xx+s*.24,y,z+2.7,.77,i*.46);
      if(i%2===0) place('modular_airduct_circular_01',xx,y,z-3.1,1.34,-1.57,'modular_airduct_circular_fan');
      else place('small_lpg_tank',xx,y,z-2.3,.69,0);
    }
    if(i%3===1) antenna(x-7,y,z-5,5.5);
  }

  ac(-5.4,58,2.9,-.12,2.15);
  ac(-8.3,58,-2.5,.08,1.85,true);
  ac(6.2,58,-7.5,0,2.35,true);
  ac(6.2,58,-11,0,1.8);
  place('portable_generator',4.1,58,4,1.47,-.42,'portable_generator');
  place('plastic_crate_02',4.9,58,2.5,.76,.24);
  place('plastic_crate_02',5.42,58,3.07,.72,-.23);
  place('modular_airduct_circular_01',-5.9,58,-10.2,2.35,.45,'modular_airduct_circular_double');
  place('modular_pipes',-8.9,58,-11,2.3,1.57,'pipe_200cm_metal');
  tank(9.0,58,-20,1.65);
  antenna(-8,58,-23,8);
  fence(-9,58,7,12,true);
  fence(10.9,58,4,17,true);
  for(const [x,y,z,i] of [
    [0,59,-43,1],[0,59,-79,2],[0,59,-104,3],[0,59,-132,4],[0,59,-187,5],
    [0,62.25,-234,6],[0,62.25,-266,7],[0,68.5,-309,8],[9,60,-416,9],[9,55,-468,10],
    [9,50.7,-518,11],[9,50.7,-571,12],[9,50.7,-620,13],[9,54,-676,14],[24,45,-790,15],[24,47,-820,16],
    [24,47,-883,17],[24,47.4,-919,18],[25,47.4,-953,19],
    [25,55,-1019,20],[25,55,-1044,21],[25,56.7,-1081,22],[25,56.7,-1102,23]
  ]) propRoof(x,y,z,i);
  tank(-7.5,59,-82,1.45);
  tank(8.5,62.25,-275,1.5);
  tank(16.3,55,-477,1.5);
  tank(2,50.7,-578,1.3);
  place('overhead_crane',7.9,68.5,-317,6.1,.17,'overhead_crane');
  towerCrane(16,32,-81,43,27);
  towerCrane(-25,28,-227,47,34);
  towerCrane(29,45,-787,28,18);

  function vault(x,y,z,w){
    texturedBox(x,y+.47,z,w,.94,.76,m.concrete);
    cub(x,y+.11,z,w+.1,.12,.83,trim);
    routeTile(x,y+.94,z,w+.07,.83);
    routeMark(new T.BoxGeometry(w,.09,.028),stroke,x,y+.69,z+.394);
    addBlock(x-w/2,x+w/2,y,y+.94,z-.38,z+.38,'metal',{vault:true});
    for(let j=-w/2+.20;j<w/2;j+=.41) cub(x+j,y+.39,z+.39,.078,.29,.023,safety,false,-.04);
  }

  function gate(x,y,z,w,depth){
    const bottom=y+.88,top=y+2.39;
    texturedBox(x,(bottom+top)/2,z,w,top-bottom,depth,m.steel);
    routeMark(new T.BoxGeometry(w,.17,.045),signal,x,bottom+.13,z+depth/2+.026);
    for(const s of [-1,1]){
      const bank=10-w/2;
      const bankX=x+s*(w/2+bank/2);
      cub(x+s*(w/2+.13),y+1.14,z,.26,2.27,depth+.16,trim);
      cub(bankX,y+1.32,z,bank,2.64,depth+.18,dark);
      texturedBox(bankX,y+2.66,z,bank+.04,.10,depth+.22,m.steel);
      cub(bankX,y+.35,z+depth/2+.093,bank,.22,.06,trim);
      for(let i=-bank/2+.3;i<bank/2;i+=.54) cub(bankX+i,y+1.90,z+depth/2+.10,.08,.48,.06,divider);
      addBlock(bankX-bank/2,bankX+bank/2,y,y+2.64,z-depth/2,z+depth/2,'metal');
      pipe(v(x+s*w*.40,y+2.56,z-depth/2-.20),v(x+s*w*.40,y+2.56,z+depth/2+.20),.17,rusty);
    }
    cub(x,top+.05,z,w+.4,.12,depth+.18,trim);
    addBlock(x-w/2,x+w/2,bottom,top,z-depth/2,z+depth/2,'metal');
  }

  function wallBridge(x,y,zNear,zFar) {
    const length=zNear-zFar,z=(zNear+zFar)/2;
    texturedBox(x+.43,y-3,z,.86,11,length,m.concrete);
    routeMark(new T.BoxGeometry(.025,2.77,length-.08),signal,x-.014,y+1.02,z);
    routeMark(new T.BoxGeometry(.029,.065,length-.06),stroke,x-.027,y+1.39,z);
    for(let zz=zNear-1;zz>zFar;zz-=2.4) {
      cub(x+.02,y+.90,zz,.09,.055,.83,trim);
      cub(x+.43,y+2.58,zz,.87,.14,.13,trim);
    }
    addBlock(x,x+.86,y-8.5,y+2.5,zFar,zNear,'concrete',{wall:true});
    // Catwalk below the wall lets missed takeoffs recover at the far ledge.
    texturedBox(x-1.19,y-2.65,z,2.25,.28,length,m.steel);
    addBlock(x-2.315,x-.065,y-2.79,y-2.51,zFar,zNear,'metal');
    for(let zz=zNear-2;zz>zFar;zz-=3) pipe(v(x+.44,y-5,zz),v(x-2.17,y-2.78,zz),.064,trim);
    for(let i=0;i<5;i++){
      const near=zFar+(5-i)*.59;
      const h=(i+1)*.47;
      cub(x-1.20,y-2.51+h/2,near-.31,2.17,h,.63,trim);
      addBlock(x-2.29,x-.11,y-2.51,y-2.51+h,near-.63,near,'metal',{step:true});
    }
  }

  function ledge(x,y,z,w) {
    routeMark(new T.BoxGeometry(w,.29,.035),signal,x,y-.20,z+.062);
    routeMark(new T.BoxGeometry(w,.044,.037),stroke,x,y-.05,z+.066);
    for(let u=-w/2+.27;u<w/2;u+=.6) cub(x+u,y-.48,z+.075,.16,.11,.035,safety,false);
  }

  lane(0,58,4,-28);
  lane(0,59,-36,-127);
  lane(.97,59,-130,-150,true);
  routeTile(0,58,-27,6.7,.66);
  routeTile(0,59,-34.55,6.5,.7);
  vault(0,59,-65,4.7);
  gate(0,59,-114,4.3,3.5);
  routeTile(.95,59,-150.4,2,.76);
  wallBridge(1.88,59,-149.0,-168.6);
  lane(0,59,-171,-213);
  ledge(0,62.25,-214,7);
  lane(0,62.25,-219,-283);
  lane(0,68.5,-304,-327,true);
  lane(9,60,-404,-433);
  gate(9,55,-453.9,4.6,3.25);
  lane(9,55,-457,-491);
  routeTile(9,55,-490.45,6.4,.65);
  routeTile(9,50.7,-501.5,7,.8);
  lane(9,50.7,-506,-554);
  vault(9,50.7,-535,5.0);
  gate(9,50.7,-555,4.75,3.35);
  lane(9.95,50.7,-560,-583,true);
  routeTile(9.95,50.7,-583.45,2.0,.79);
  wallBridge(10.88,50.7,-581.7,-602.6);
  lane(9,50.7,-605,-637,true);
  ledge(9,54,-637,7.4);
  lane(9,54,-641,-710);
  lane(24,45,-783,-804,true);
  routeTile(24,45,-803.35,5.6,.78);
  routeTile(24,47,-812.6,6.3,.76);
  lane(24,47,-815,-840,true);

  function utilityBank(x,y,z,w,d) {
    texturedBox(x,y+1.52,z,w,3.04,d,m.concrete);
    texturedBox(x,y+3.10,z,w+.27,.13,d+.27,m.steel);
    addBlock(x-w/2,x+w/2,y,y+3.16,z-d/2,z+d/2,'metal');
    for(let i=-w/2+.56;i<w/2;i+=1.35){
      cub(x+i,y+1.63,z+d/2+.06,.82,1.06,.12,dark);
      for(let j=0;j<5;j++) cub(x+i,y+1.24+j*.17,z+d/2+.142,.76,.047,.04,trim);
    }
    place('exterior_aircon_unit',x+w/4,y+3.16,z,1.59,0,'exterior_aircon_unit_rusted');
    antenna(x-w*.25,y+3.17,z+1,4.6);
  }
  utilityBank(27.8,47,-851,14.0,8);
  utilityBank(19.6,47,-869,13.2,8);
  lane(18,47,-839,-859,true);
  lane(29,47,-863,-877,true);
  lane(25,47,-880,-899,true);
  routeTile(25,47,-898.40,6.1,.76);
  routeTile(25,47.4,-905.6,6.1,.76);
  lane(25,47.4,-908,-926,true);
  vault(25,47.4,-932,5.0);
  lane(25,47.4,-933,-972);
  lane(25,55,-998,-1034);
  vault(25,55,-1036,5.2);
  lane(25,55,-1037,-1060,true);
  routeTile(25,55,-1059.35,6.5,.75);
  ledge(25,56.7,-1067,7.1);
  lane(25,56.7,-1069,-1111,true);
  tank(34.5,47.4,-950,1.64);
  tank(35,55,-1047,1.48);
  antenna(14.9,56.7,-1104,9.2);
  antenna(35.9,56.7,-1093,12);
  fence(36.3,56.7,-1106,19,true);
  for(const side of [-1,1]){
    const x=25+side*3.6;
    cub(x,56.85,-1111,1.2,.30,5.1,trim);
    cub(x,57.03,-1111,.86,.08,4.6,warm,false);
    scaffold(25+side*8.4,56.7,-1119,8.1,3);
  }

  for(const c of cables){
    const {start,end}=c;
    pipe(start,end,.033,safety);
    pipe(start.clone().add(v(.16,.10,0)),end.clone().add(v(.16,.10,0)),.018,dark);
    for(const [p,h] of [[start,2.3],[end,2.1]]) {
      for(const side of [-1,1]) {
        pipe(v(p.x+side*1.4,p.y-h,p.z),v(p.x+side*1.4,p.y+.27,p.z),.095,trim);
        cub(p.x+side*1.4,p.y-h+.06,p.z,.48,.12,.5,m.steel);
      }
      pipe(v(p.x-1.45,p.y+.23,p.z),v(p.x+1.45,p.y+.23,p.z),.093,safety);
      routeMark(new T.BoxGeometry(.38,.20,.25),orange,p.x,p.y-.25,p.z);
      routeTile(p.x,p.y-h,p.z,3,.46);
    }
  }

  for(let i=1;i<checkpoints.length;i++){
    const p=checkpoints[i].position;
    const final=i===TOTAL;
    const size=final?1.82:1.16;
    const base=mesh(new T.CylinderGeometry(size+.18,size+.22,.09,final?10:8),dark,p.x,p.y+.044,p.z);
    const groundRing=mesh(new T.TorusGeometry(size,.041,8,44),orange,p.x,p.y+.108,p.z,false);
    groundRing.rotation.x=-Math.PI/2;
    const vertical=mesh(new T.TorusGeometry(final?1.77:.57,final?.064:.033,8,44),final?orange:ice,p.x,p.y+(final?2.35:1.32),p.z,false);
    const geometry=new T.OctahedronGeometry(final?.56:.20);
    const crystal=mesh(geometry,final?warm:orange,p.x,vertical.position.y,p.z,false);
    const beam=final?mesh(new T.CylinderGeometry(.045,.14,17,9),luminous(0xff946b,1.7),p.x,p.y+10,p.z,false):null;
    markers.push({base,groundRing,vertical,crystal,beam,material: final?orange:ice,id:i,height:vertical.position.y});
  }

  // Close silhouettes shape the playable views. Far windows and roof trim share instanced draw calls.
  const heroTowers=[
    [-40,-46,23,24,90,1],[26,-39,18,23,52,2],[47,-60,24,26,72,0],
    [-23,-76,14,23,40,2],[-62,-85,26,27,76,0],[28,-109,25,25,64,1],
    [62,-132,27,23,108,2],[-34,-128,22,22,71,0],[-61,-148,26,20,102,2],
    [24,-168,18,24,67,0],[-30,-180,18,20,49,1],[51,-210,22,27,88,2],
    [-59,-217,29,29,88,0],[-24,-245,15,26,40,1],[30,-254,23,23,78,0],
    [-35,-300,23,28,82,2],[41,-317,27,30,76,1],[-18,-362,21,29,53,0],
    [34,-367,25,26,73,2],[-23,-416,21,35,66,0],[36,-440,23,25,75,1],
    [-21,-520,21,25,71,0],[34,-540,23,26,62,2],[-34,-603,24,25,82,1],
    [44,-619,26,25,81,0],[-20,-680,18,20,60,2],[35,-699,21,25,66,0],
    [-11,-746,24,29,56,1],[53,-752,22,26,71,2],[50,-832,21,30,57,0],
    [-17,-859,27,25,77,1],[55,-895,23,28,77,2],[.1,-923,16,30,64,0],
    [52,-954,23,22,58,1],[-22,-977,25,33,71,2],[51,-1034,21,29,86,2],
    [-13,-1025,32,30,65,0],[-13,-1085,33,26,69,1],[51,-1091,24,26,63,0]
  ];
  for(const [i,[x,z,w,d,h,type]] of heroTowers.entries()){
    texturedBox(x,h/2-2,z,w,h+4,d,type===1?m.brick:type===2?m.glass:m.concrete);
    facade(x,z,w,d,0,h,true,(i+type)%5);
    addBlock(x-w/2,x+w/2,-4,h+.3,z-d/2,z+d/2);
    addBlock(x-w*.365,x-w*.035,h,h+2.4,z-d*.025,z+d*.305);
    texturedBox(x-w*.20,h+1.2,z+d*.14,w*.33,2.4,d*.33,m.concrete);
    antenna(x-w*.22,h+2.4,z+d*.14,4+random()*6,false);
    if(i%2===0) ac(x+w*.19,h+.28,z-d*.18,0,1.9,i%3===0);
  }
  billboard(26,57.2,-28.2,10.5,5.25);
  billboard(-30,72.4,-33.8,9.2,4.6,1);
  billboard(29,70,-98.1,9,4.5,1);
  billboard(-32,77,-118,10,5);
  billboard(25,71.8,-156.0,8.5,4.25,1);
  billboard(39,82,-305,10,5);
  billboard(35,81,-428,10,5,1);
  billboard(-14,64.5,-520,9.2,4.6);
  billboard(36,70.5,-687,8.5,4.25,1);
  billboard(53,83,-882,9.2,4.6,1);
  billboard(52,92,-1020,10,5);
  towerCrane(52,58,-949,31,17);
  for(const [x,y,z] of [[-9,58,-7],[7,59,-78],[-8,59,-124],[7,62.25,-245],[15,50.7,-518]]){
    for(let i=0;i<3;i++) {
      pipe(v(x-.22*i,y-.45,z-5),v(x-.22*i,y-.45,z+4),.065,rusty);
      pipe(v(x-.22*i,y-.45,z-5),v(x-.22*i,y+.75,z-5),.065,rusty);
      for(let zz=z-4;zz<z+4;zz+=1.6) cub(x-.22*i,y-.45,zz,.13,.17,.08,trim);
    }
  }

  for(let row=0;row<32;row++) {
    const z=54-row*44;
    for(let col=-10;col<=10;col++){
      const x=col*42+(row%2?9:0)+(random()-.5)*11;
      if(Math.abs(x)<58 || heroTowers.some(([xx,zz])=>Math.abs(xx-x)<34&&Math.abs(zz-z)<32)) continue;
      const width=12+random()*22,depth=13+random()*21,zz=z+(random()-.5)*19;
      const height=13+random()*63+(random()<.13?29:0);
      const type=Math.floor(random()*6);
      cub(x,height/2-2,zz,width,height+4,depth,distantWalls[type],false);
      facade(x,zz,width,depth,0,height,false,type);
      if(random()<.72){
        cub(x+width*.07,height+1.33,zz-depth*.14,width*.42,2.66,depth*.35,distantWalls[(type+1)%6],false);
        cub(x+width*.07,height+2.7,zz-depth*.14,width*.46,.16,depth*.39,cityTops[type%3],false);
      }
      if(random()<.16) antenna(x,height+.3,zz,3+random()*6,false);
    }
  }
  texturedBox(0,-.65,-530,920,1,1410,m.asphalt,false);
  for(let j=0;j<31;j++){
    const z=67-j*42;
    for(const x of [-54,-24,30,57]){
      cub(x,.05,z,17,.10,26,cityTops[j%3],false);
      for(let n=0;n<3;n++) cub(x-9,.06,z-8+n*7,.11,.02,2.3,safety,false);
    }
  }
  function hanging(a,b,sag) {
    let prev=a;
    for(let n=1;n<=20;n++){
      const t=n/20,next=a.clone().lerp(b,t);
      next.y-=Math.sin(Math.PI*t)*sag;
      pipe(prev,next,.023,dark);
      prev=next;
    }
  }
  hanging(v(-39,88,-38),v(-10,63,-26),4);
  hanging(v(34,54,-26),v(51,73,-47),3);
  hanging(v(8,61,-25),v(28,52,-31),2.5);
  hanging(v(-8,64,-102),v(-29,74,-127),4);
  hanging(v(10,65,-182),v(22,73,-170),2);
  hanging(v(17,54,-597),v(40,81,-611),4);
  hanging(v(36,49,-932),v(48,59,-945),2.2);
  hanging(v(36,61,-1092),v(51,68,-1086),2);

  for(const [collection,g] of [[boxes,boxUnit],[fittings,pipeUnit],[glazing,paneUnit]]){
    for(const {material,shadow,matrices} of collection.values()){
      const mesh=new T.InstancedMesh(g,material,matrices.length);
      mesh.castShadow=shadow;
      mesh.receiveShadow=true;
      for(let i=0;i<matrices.length;i++) mesh.setMatrixAt(i,matrices[i]);
      scene.add(mesh);
    }
  }

  return {
    blocks,slopes,markers,
    setVision(enabled){for(const o of vision) o.visible=enabled},
    update(time,checkpoint){
      for(const marker of markers){
        const target=marker.id===checkpoint+1;
        const visited=marker.id<=checkpoint;
        marker.vertical.visible=marker.crystal.visible=!visited;
        marker.groundRing.scale.setScalar(target?1+.07*Math.sin(time*3.4):.96);
        marker.groundRing.material=target?orange:visited?warm:marker.material;
        marker.vertical.rotation.y=time*.8;
        marker.crystal.rotation.y=time*1.65;
        marker.crystal.rotation.x=time*.65;
        marker.crystal.position.y=marker.height+.13*Math.sin(time*2.2);
      }
    }
  };
}
