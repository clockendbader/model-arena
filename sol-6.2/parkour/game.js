import * as T from 'three';
import {buildLevel,checkpoints,TOTAL} from './level.js';
import {Player} from './movement.js';
import {CityAudio} from './audio.js';
import {createRenderer,makeParticles,makeArms,makeGhost} from './visuals.js';

const get=id=>document.getElementById(id);
const ui=Object.fromEntries([
  'world','start','pause','results','hud','play','load-label','start-error','resume','restart','again','menu',
  'sensitivity','sensitivity-value','vision','fade','clock','delta','speed','gauge-fill','move-name','move-tip',
  'checkpoint-toast','progress-count','segments','waypoint','waypoint-distance','speedfx','record-label',
  'results-stats','split-list','menu-best'
].map(id=>[id,get(id)]));

const storageKey='afterheight.highline.v1';
const settingsKey='afterheight.settings.v1';
function read(key,fallback) {
  try{return JSON.parse(localStorage.getItem(key))??fallback}
  catch{return fallback}
}
function write(key,value) {
  try{localStorage.setItem(key,JSON.stringify(value));return true}
  catch{return false}
}
const format=seconds=>{
  if(!Number.isFinite(seconds)) return '—';
  const ms=Math.round(seconds*1000);
  const s=ms%60000;
  return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(s/1000)).padStart(2,'0')+'.'+String(s%1000).padStart(3,'0');
};
const splitDelta=d=>(d<=0?'−':'+')+Math.abs(d).toFixed(3)+'s';
const displayCount=n=>String(n).padStart(2,'0');
const lapCount=displayCount(TOTAL);
for(let i=0;i<TOTAL;i++) ui.segments.append(document.createElement('i'));

let best=read(storageKey,null);
if(best && (!Number.isFinite(best.time)||!Array.isArray(best.splits)||!Array.isArray(best.ghost))) best=null;
let settings={vision:true,sensitivity:100,...read(settingsKey,{})};
let state='start', pendingLock=false, loaded=false;
const sound=new CityAudio();
const input={jump:0,jumpRelease:false,crouchPress:false,use:false,x:0,z:0,sprint:false,crouch:false};
const keys=new Set();
const recognized=new Set(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','KeyC','ControlLeft','ControlRight','KeyE','KeyR','KeyV']);

function changeState(next){
  state=next;
  for(const id of ['start','pause','results']) ui[id].hidden=id!==next;
  ui.hud.hidden=next!=='run';
  ui.speedfx.style.opacity=0;
}

function menuStats() {
  ui['menu-best'].querySelector('b').textContent=format(best?.time);
  ui.vision.checked=settings.vision;
  ui.sensitivity.value=settings.sensitivity;
  ui['sensitivity-value'].textContent=settings.sensitivity+'%';
}
menuStats();

function showError(message) {
  ui['start-error'].textContent=message;
  ui['load-label'].textContent='COURSE UNAVAILABLE';
}

async function startGame() {
  const view=createRenderer(ui.world);
  const {scene,camera,loader,renderer}=view;
  const canvas=renderer.domElement;
  const [level,sky,ghost]=await Promise.all([buildLevel(scene,loader),view.skyPromise,makeGhost(loader,scene)]);
  const particles=makeParticles(scene),arms=makeArms(camera);
  const p=new Player(level,sound,particles,()=>beginRespawn(true));
  const cursor=new T.Vector3(), cameraDir=new T.Vector3();
  const introCamera=new T.Vector3(-6.3,62.5,12.6);
  const {damp,clamp}=T.MathUtils;
  let checkpoint=0, elapsed=0, falls=0, splits=[], samples=[], raceBest=best;
  let lastSample=-1, toastUntil=0, respawn=0, life=0, accumulator=0;
  let cameraHeight=1.62, cameraRoll=0, last=performance.now(), worldTime=0;
  let currentHint='', finished=false, lastHudUpdate=0;

  function syncProgress() {
    ui['progress-count'].textContent=displayCount(checkpoint)+' / '+lapCount;
    [...ui.segments.children].forEach((el,index)=>el.classList.toggle('done',index<checkpoint));
    if(!checkpoint) ui.delta.textContent='';
  }

  function toast(message,duration=2.15){
    ui['checkpoint-toast'].textContent=message;
    toastUntil=elapsed+duration;
  }

  function clearInput() {
    keys.clear();
    input.jump=0;
    input.jumpRelease=input.crouchPress=input.use=false;
  }

  function resetCamera(){
    cameraHeight=1.63;
    cameraRoll=0;
    camera.fov=75;
    camera.updateProjectionMatrix();
  }

  function resetRun(){
    checkpoint=0;
    elapsed=0;
    falls=0;
    splits=[];
    samples=[];
    lastSample=-1;
    respawn=0;
    life=0;
    raceBest=best;
    finished=false;
    currentHint='';
    ghost.reset();
    resetCamera();
    p.reset(0);
    syncProgress();
    clearInput();
    ui.fade.style.opacity=0;
    ui['checkpoint-toast'].textContent='';
    ui.clock.textContent=format(0);
  }

  function beginRespawn(fell) {
    if(respawn||finished) return;
    respawn=.57;
    if(fell){falls++;sound.hit('fall')}
    clearInput();
    toast(fell?'FALL  /  RETURNING TO CHECKPOINT':'RETURNING TO CHECKPOINT',1.12);
  }

  function setVision(value,announce=false){
    settings.vision=value;
    level.setVision(value);
    ui.vision.checked=value;
    write(settingsKey,settings);
    if(announce) toast(value?'RUNNER’S VISION ON':'RUNNER’S VISION OFF',1.35);
  }
  level.setVision(settings.vision);

  function release() {
    if(document.pointerLockElement===canvas) document.exitPointerLock();
  }

  function showResults(){
    finished=true;
    const old=raceBest;
    const improved=!old||elapsed<old.time;
    if(improved){
      best={time:elapsed,splits:[...splits],ghost:samples};
      write(storageKey,best);
    }
    const stats=[['RUN TIME',format(elapsed)],['PERSONAL BEST',format(best.time)],['FALLS',falls]];
    ui['record-label'].textContent=improved?'NEW PERSONAL BEST':'AFTERHEIGHT / THE HIGHLINE';
    ui['results-stats'].replaceChildren(...stats.map(([label,value])=>{
      const cell=document.createElement('div'), l=document.createElement('span'), s=document.createElement('strong');
      l.textContent=label;s.textContent=value;cell.append(l,s);
      return cell;
    }));
    ui['split-list'].replaceChildren(...splits.map((time,i)=>{
      const row=document.createElement('div');
      row.className='split-row';
      const diff=old&&Number.isFinite(old.splits[i])?time-old.splits[i]:null;
      const cols=[displayCount(i+1)+'  '+checkpoints[i].name,format(time),diff===null?'—':splitDelta(diff)];
      cols.forEach((content,index)=>{
        const span=document.createElement('span');
        span.textContent=content;
        if(index===2&&diff!==null) span.className=diff<=0?'ahead':'behind';
        row.append(span);
      });
      return row;
    }));
    ghost.reset();
    changeState('results');
    menuStats();
    release();
  }

  function poseName() {
    return p.roll>.01?'roll':p.slideTime>0||p.height<1?'slide':p.mode;
  }

  function record(force=false) {
    if(!force && elapsed-lastSample<.095) return;
    const q=n=>Math.round(n*100)/100;
    const {x,y,z}=p.position;
    if(samples.length>=18000) return;
    samples.push([q(elapsed),q(x),q(y),q(z),Math.round((p.yaw+Math.PI)*1000)/1000,poseName(),q(p.speed),life]);
    lastSample=elapsed;
  }

  function touchCheckpoint() {
    const target=checkpoints[checkpoint+1];
    if(!target) return;
    const point=target.position;
    if(Math.hypot(p.position.x-point.x,p.position.z-point.z)>2.7||Math.abs(p.position.y-point.y)>1.95) return;
    checkpoint++;
    splits.push(elapsed);
    syncProgress();
    const previous=raceBest?.splits[checkpoint-1];
    const difference=elapsed-previous;
    ui.delta.textContent=Number.isFinite(previous)?splitDelta(difference):'SPLIT '+format(elapsed);
    ui.delta.className=Number.isFinite(previous)?difference<=0?'ahead':'behind':'';
    sound.hit(checkpoint===TOTAL?'finish':'checkpoint');
    if(checkpoint===TOTAL) {
      record(true);
      showResults();
    } else toast('CHECKPOINT '+displayCount(checkpoint)+' / '+lapCount);
  }

  function wantsLock(){
    if(!loaded||pendingLock) return;
    sound.start();
    pendingLock=true;
    const failed=()=>{
      if(!pendingLock) return;
      pendingLock=false;
      ui['start-error'].textContent='Mouse capture was blocked. Click again to play.';
      ui.resume.textContent='CLICK TO CAPTURE MOUSE';
    };
    try{
      const promise=canvas.requestPointerLock();
      promise?.catch(failed);
    }catch{failed()}
  }

  function pointerChange(){
    if(document.pointerLockElement===canvas){
      pendingLock=false;
      ui['start-error'].textContent='';
      ui.resume.textContent='RESUME RUN ↗';
      accumulator=0;
      changeState('run');
    } else if(state==='run'){
      pendingLock=false;
      clearInput();
      changeState('pause');
    }
  }

  document.addEventListener('pointerlockchange',pointerChange);
  document.addEventListener('pointerlockerror',()=>{
    if(!pendingLock) return;
    pendingLock=false;
    ui['start-error'].textContent='Mouse capture was blocked. Click again to play.';
    ui.resume.textContent='CLICK TO CAPTURE MOUSE';
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();release()}});
  window.addEventListener('blur',()=>{if(state==='run'){clearInput();release()}});
  document.addEventListener('mousemove',e=>{
    if(state!=='run'||document.pointerLockElement!==canvas||respawn>.28) return;
    const scale=.0021*settings.sensitivity/100;
    p.yaw=T.MathUtils.euclideanModulo(p.yaw-e.movementX*scale+Math.PI,Math.PI*2)-Math.PI;
    p.pitch=clamp(p.pitch-e.movementY*scale,-1.54,1.54);
  });

  const isCrouch=code=>code==='KeyC'||code.startsWith('Control');
  document.addEventListener('keydown',e=>{
    if(state!=='run'||!recognized.has(e.code)) return;
    e.preventDefault();
    if(keys.has(e.code)) return;
    keys.add(e.code);
    if(e.code==='Space'){input.jump=.12;input.jumpRelease=false}
    if(isCrouch(e.code)) input.crouchPress=true;
    if(e.code==='KeyE') input.use=true;
    if(e.code==='KeyR') beginRespawn(false);
    if(e.code==='KeyV') setVision(!settings.vision,true);
  });
  document.addEventListener('keyup',e=>{
    keys.delete(e.code);
    if(e.code==='Space'&&state==='run') input.jumpRelease=true;
  });

  ui.play.addEventListener('click',()=>{resetRun();wantsLock()});
  ui.resume.addEventListener('click',wantsLock);
  ui.restart.addEventListener('click',()=>{resetRun();wantsLock()});
  ui.again.addEventListener('click',()=>{resetRun();wantsLock()});
  ui.menu.addEventListener('click',()=>{resetRun();changeState('start')});
  ui.vision.addEventListener('change',()=>setVision(ui.vision.checked));
  ui.sensitivity.addEventListener('input',()=>{
    settings.sensitivity=Number(ui.sensitivity.value);
    ui['sensitivity-value'].textContent=settings.sensitivity+'%';
    write(settingsKey,settings);
  });

  const PHYSICS_STEP=1/120;
  function simulate(dt){
    elapsed+=dt;
    if(respawn){
      const previous=respawn;
      respawn=Math.max(0,respawn-dt);
      if(previous>.30&&respawn<=.30){
        p.reset(checkpoint);
        life++;
        resetCamera();
      }
      ui.fade.style.opacity=clamp(respawn>.30?(.57-respawn)/.19:respawn/.24,0,1);
      record();
      return;
    }
    input.x=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    input.z=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
    input.sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');
    input.crouch=keys.has('KeyC')||keys.has('ControlLeft')||keys.has('ControlRight');
    p.step(dt,input);
    input.jump=0;
    input.jumpRelease=input.crouchPress=input.use=false;
    if(respawn) return;
    if(p.mode==='zip' && Math.random()<dt*33) particles.burst(cursor.copy(p.position).setY(p.position.y+1.90),2,true);
    record();
    touchCheckpoint();
  }

  function updateCamera(dt) {
    if(state==='start') {
      camera.position.copy(introCamera);
      camera.rotation.set(-.11+Math.sin(worldTime*.19)*.012,-.295+Math.sin(worldTime*.15)*.012,0,'YXZ');
      if(camera.fov!==68){camera.fov=68;camera.updateProjectionMatrix()}
      arms.visible(false);
      return;
    }
    cameraHeight=damp(cameraHeight,p.height<1?.71:1.64,15,dt);
    const running=p.grounded&&p.height>1?clamp(p.speed/9,0,1):0;
    const bobX=Math.sin(p.bob*.50)*.042*running;
    const bobY=Math.abs(Math.sin(p.bob*.52))*.041*running;
    const wallRoll=p.mode==='wall'?(p.normal.x||.5)*.137:0;
    const rollArc=p.roll>0?Math.sin(Math.PI*(1-p.roll/.54))*.77:0;
    cameraRoll=damp(cameraRoll,wallRoll+rollArc,12,dt);
    const shake=Math.sin(elapsed*40)*Math.max(0,p.impact-.23)*.073;
    camera.position.copy(p.position);
    camera.position.x+=Math.cos(p.yaw)*bobX;
    camera.position.z-=Math.sin(p.yaw)*bobX;
    camera.position.y+=cameraHeight+bobY-p.impact*.34-Math.abs(rollArc)*.34;
    camera.rotation.set(p.pitch-p.impact*.125-Math.abs(rollArc)*.30,p.yaw,cameraRoll+shake,'YXZ');
    camera.fov=damp(camera.fov,75+20*clamp(p.speed/12.5,0,1),6.8,dt);
    camera.updateProjectionMatrix();
    arms.visible(true);
    arms.update(p,dt);
  }

  function drawHUD() {
    const speed=p.speed;
    if(elapsed-lastHudUpdate>.03||elapsed<lastHudUpdate) {
      ui.clock.textContent=format(elapsed);
      ui.speed.textContent=displayCount(Math.round(speed*3.6));
      ui['gauge-fill'].style.width=clamp(speed/12.5,0,1)*100+'%';
      lastHudUpdate=elapsed;
    }
    ui.speedfx.style.opacity=clamp((speed-8.1)/6,0,.34);
    if(toastUntil<elapsed) ui['checkpoint-toast'].textContent='';
    const current=checkpoints[checkpoint];
    const zipNear=p.findZip();
    const move=zipNear?'Grab zipline':p.mode==='zip'?'Zipline':current.name;
    if(currentHint!==move){
      currentHint=move;
      ui['move-name'].textContent=move;
      ui['move-tip'].textContent=zipNear?'Press E to grab':p.mode==='zip'?'Hold on to the end · SPACE to release':current.tip;
    }
    const target=checkpoints[checkpoint+1]?.position;
    if(!target) return;
    cursor.copy(target).y+=2.28;
    camera.getWorldDirection(cameraDir);
    const inFront=cursor.clone().sub(camera.position).dot(cameraDir)>0;
    cursor.project(camera);
    ui.waypoint.hidden=!settings.vision||!inFront;
    if(inFront){
      ui.waypoint.style.left=clamp((cursor.x*.5+.5)*100,4,96)+'%';
      ui.waypoint.style.top=clamp((-cursor.y*.5+.5)*100,14,79)+'%';
      ui['waypoint-distance'].textContent=(checkpoint===TOTAL-1?'FINISH  ':'')+Math.round(target.distanceTo(p.position))+' M';
    }
  }

  function loop(now){
    const dt=Math.min((now-last)*.001,.09);
    last=now;
    worldTime+=dt;
    if(state==='run'){
      accumulator+=dt;
      while(accumulator>=PHYSICS_STEP&&state==='run'){
        simulate(PHYSICS_STEP);
        accumulator-=PHYSICS_STEP;
      }
      particles.update(dt);
      ghost.update(raceBest?.ghost,elapsed,dt,!finished,p);
    }
    updateCamera(dt);
    camera.updateMatrixWorld();
    if(state==='run') drawHUD();
    level.update(worldTime,checkpoint);
    sound.update(p.speed,poseName(),checkpoint/(TOTAL-1),state==='run');
    view.render(sky);
    requestAnimationFrame(loop);
  }

  resetRun();
  loaded=true;
  ui.play.disabled=false;
  ui['load-label'].textContent='COURSE READY';
  requestAnimationFrame(loop);
}

startGame().catch(error=>{
  console.error(error);
  showError('Could not load the course. Open it from the local HTTP server in a WebGL 2 browser.');
});
