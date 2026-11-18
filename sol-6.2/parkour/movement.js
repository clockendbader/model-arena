import {Vector3, MathUtils} from 'three';
import {checkpoints, cables} from './level.js';

const { clamp } = MathUtils;
const radius=.31, upright=1.68, crouched=.67;
const gravity=22;
const unitY=new Vector3(0,1,0);
const forward=new Vector3(), strafe=new Vector3(), wish=new Vector3();
const face=new Vector3(), scratch=new Vector3();
const touches=(x,z,b,pad=0)=>x>b.x1-pad && x<b.x2+pad && z>b.z1-pad && z<b.z2+pad;
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);

export class Player {
  constructor(level, sound, particles, death) {
    Object.assign(this,{level,sound,particles,death});
    this.position=new Vector3();
    this.velocity=new Vector3();
    this.normal=new Vector3();
    this.reset(0);
  }

  reset(checkpoint) {
    this.position.copy(checkpoints[checkpoint].position);
    this.velocity.set(0,0,0);
    this.yaw=0;
    this.pitch=0;
    this.mode='ground';
    this.height=upright;
    this.grounded=true;
    this.surface='concrete';
    this.lastFloor=this.position.y;
    this.coyote=.12;
    this.buffer=0;
    this.rollBuffer=0;
    this.wallLock=0;
    this.zipLock=0;
    this.slideTime=0;
    this.stumble=0;
    this.roll=0;
    this.impact=0;
    this.bob=0;
    this.stride=0;
    this.armKick=0;
    this.action=null;
    this.zip=null;
  }

  get speed(){return Math.hypot(this.velocity.x,this.velocity.z)}

  findZip() {
    if(this.zipLock>0 || this.mode==='zip') return null;
    const p=this.position;
    return cables.find(c=>p.distanceTo(scratch.copy(c.start).addScaledVector(unitY,-1.9))<3.5) ?? null;
  }

  ceilingFree(height) {
    const p=this.position;
    return !this.level.blocks.some(b=>touches(p.x,p.z,b,radius*.96) &&
      p.y+.08<b.y2 && p.y+height>b.y1+.012);
  }

  floor(x,z,previous,maxHeight) {
    let result=null;
    for(const b of this.level.blocks) {
      if(b.y2>maxHeight || (this.grounded&&!b.step&&b.y2>previous+.135) || b.y2<previous-9 || (result && b.y2<=result.y) || !touches(x,z,b,.11)) continue;
      result={y:b.y2,kind:b.kind};
    }
    for(const s of this.level.slopes) {
      if(!touches(x,z,s,.13)) continue;
      const y=mix(s.h1,s.h2,clamp((z-s.z1)/(s.z2-s.z1),0,1));
      if(y<=Math.min(maxHeight,previous+.135) && (!result || y>result.y)) result={y,kind:s.kind,slope:(s.h2-s.h1)/(s.z2-s.z1)};
    }
    return result;
  }

  startAction(type,obstacle,axis,sign) {
    const p=this.position;
    const isVault=type==='vault';
    const end=p.clone();
    if(isVault) {
      end[axis]=sign>0?obstacle[axis+'2']+.63:obstacle[axis+'1']-.63;
      end.y=p.y;
    } else {
      end[axis]=sign>0?obstacle[axis+'1']+.71:obstacle[axis+'2']-.71;
      end.y=obstacle.y2+.01;
    }
    const finishFloor=this.floor(end.x,end.z,end.y,end.y+.15);
    if(!finishFloor || finishFloor.y<end.y-1) return false;
    const clear=!this.level.blocks.some(b=>end.y+.07<b.y2&&end.y+upright>b.y1&&touches(end.x,end.z,b,radius));
    if(!clear) return false;
    this.action={type,start:p.clone(),end,time:0,length:isVault?.33:.62};
    this.mode=type;
    this.grounded=false;
    this.buffer=0;
    this.coyote=0;
    this.armKick=1;
    this.sound.hit(isVault?'vault':'climb');
    return true;
  }

  tickAction(dt) {
    const a=this.action, t=clamp((a.time+=dt)/a.length,0,1);
    if(a.type==='vault') {
      this.position.lerpVectors(a.start,a.end,t);
      this.position.y+=Math.sin(Math.PI*t)**.80*1.13;
    } else {
      this.position.lerpVectors(a.start,a.end,smooth(clamp((t-.27)/.73,0,1)));
      this.position.y=mix(a.start.y,a.end.y,smooth(t));
    }
    if(t===1) {
      this.action=null;
      this.mode='ground';
      this.grounded=true;
      this.lastFloor=this.position.y;
      this.velocity.y=0;
      this.height=upright;
      this.wallLock=.25;
    }
  }

  enterZip(c) {
    this.zip={...c,time:0,length:c.start.distanceTo(c.end)};
    this.position.copy(c.start).addScaledVector(unitY,-2.02);
    this.velocity.set(0,0,0);
    this.grounded=false;
    this.coyote=0;
    this.buffer=0;
    this.mode='zip';
    this.sound.hit('zip');
  }

  tickZip(dt, input) {
    const z=this.zip;
    z.time+=dt;
    const speed=12+Math.min(12,z.time*5);
    z.progress=(z.progress??0)+dt*speed/z.length;
    const t=clamp(z.progress,0,1);
    this.position.lerpVectors(z.start,z.end,t).addScaledVector(unitY,-2.02);
    this.velocity.subVectors(z.end,z.start).normalize().multiplyScalar(speed);
    if(t>=1 || (input.jump>.001 && z.time>.23)){
      this.zip=null;
      this.mode='air';
      this.velocity.multiplyScalar(t>=1?.46:.72);
      this.velocity.y=t>=1?-.9:3.6;
      this.zipLock=1.1;
      this.lastFloor=this.position.y;
      this.buffer=0;
    }
  }

  hitWall(b,axis,sign,sprinting) {
    const p=this.position;
    const levelDifference=b.y2-p.y;
    const speed=this.speed;
    const forwardMotion=face[axis]*sign;
    if(b.vault && this.grounded && sprinting && speed>4.7 && !this.slideTime && this.startAction('vault',b,axis,sign)) return;
    if(!this.grounded && this.height>1.3 && levelDifference>.13 && levelDifference<1.60 &&
      this.velocity.y>-8 && forwardMotion>.31 && this.startAction('mantle',b,axis,sign)) return;
    if(!this.grounded && this.height>1.3 && this.mode!=='wall' && levelDifference>=1.6 &&
      levelDifference<5.7 && speed>4.6 && forwardMotion>.66 && !this.wallLock && this.velocity.y>-.7) {
      if(this.mode!=='climb'){
        this.mode='climb';
        this.climbTime=.37;
        this.velocity.y=5.2;
        this.armKick=1;
        this.sound.hit('climb');
      }
    }
    if(this.mode==='climb') this.velocity[axis]=sign*2.05;
    else this.velocity[axis]=0;
    if(speed>7 && this.grounded){this.impact=Math.max(this.impact,.13);this.stumble=Math.max(this.stumble,.14)}
  }

  moveAxis(axis,amount,sprinting) {
    if(Math.abs(amount)<1e-8) return;
    const p=this.position;
    const sign=Math.sign(amount);
    const old=p[axis];
    const next=old+amount;
    const side=axis==='x'?'z':'x';
    let limit=next, barrier=null;
    for(const b of this.level.blocks) {
      if(p.y+this.height<=b.y1+.008 || p.y>=b.y2-.016) continue;
      if(this.grounded && b.y2-p.y<(b.step?.49:.14) && !b.vault) continue;
      if(p[side]<=b[side+'1']-radius || p[side]>=b[side+'2']+radius) continue;
      const min=b[axis+'1']-radius,max=b[axis+'2']+radius;
      if(next<=min || next>=max) continue;
      // A floor's side should not expel a player standing at the seam between two roofs.
      if(old>min+.075 && old<max-.075) continue;
      const edge=sign>0?min:max;
      if((sign>0&&edge<=limit)||(sign<0&&edge>=limit)){
        limit=edge;
        barrier=b;
      }
    }
    p[axis]=limit;
    if(barrier) this.hitWall(barrier,axis,sign,sprinting);
  }

  step(dt,inpt) {
    const p=this.position,vel=this.velocity;
    this.buffer=inpt.jump>.001?.12:Math.max(0,this.buffer-dt);
    this.rollBuffer=inpt.crouchPress?.20:Math.max(0,this.rollBuffer-dt);
    this.wallLock=Math.max(0,this.wallLock-dt);
    this.zipLock=Math.max(0,this.zipLock-dt);
    this.stumble=Math.max(0,this.stumble-dt);
    this.roll=Math.max(0,this.roll-dt);
    this.impact=Math.max(0,this.impact-dt*1.48);
    this.armKick=Math.max(0,this.armKick-dt*3.2);
    if(this.action){this.tickAction(dt);return}
    if(this.zip){this.tickZip(dt,inpt);return}
    const cable=inpt.use&&this.findZip();
    if(cable){this.enterZip(cable);return}

    forward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    strafe.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    wish.copy(forward).multiplyScalar(inpt.z).addScaledVector(strafe,inpt.x);
    const moving=wish.lengthSq()>0;
    wish.normalize();
    face.copy(moving?wish:forward);
    let speed=this.speed;

    if(this.grounded && inpt.crouchPress && speed>4.25){
      this.slideTime=.91;
      this.sound.hit('slide');
      this.particles.burst(p,9,false);
    }
    this.slideTime=Math.max(0,this.slideTime-dt);
    const shrinking=this.slideTime>0 || inpt.crouch || this.roll>.31;
    const wanted=shrinking || !this.ceilingFree(upright)?crouched:upright;
    this.height=wanted;
    const sliding=this.grounded && (this.slideTime>0 || (this.height===crouched&&speed>4.6));
    const maxSpeed=(this.stumble>0?3.5:inpt.sprint?10.75:6.1)*(this.height===crouched&&!sliding?.52:1);

    if(this.grounded) {
      this.coyote=.12;
      if(sliding) {
        const drag=2.8-(this.slope??0)*25*Math.sign(-vel.z);
        const next=clamp(speed-drag*dt,2.2,13);
        vel.x*=next/Math.max(speed,.01);
        vel.z*=next/Math.max(speed,.01);
        if(moving) {
          vel.x=mix(vel.x,wish.x*next,dt*1.2);
          vel.z=mix(vel.z,wish.z*next,dt*1.2);
        }
      } else if(moving){
        const hasOverspeed=speed>maxSpeed && this.stumble<=0;
        const target=hasOverspeed?Math.max(maxSpeed,speed-dt*4):maxSpeed;
        const torque=inpt.sprint?26:30;
        const blend=Math.min(1,torque*dt/Math.max(1,Math.hypot(wish.x*target-vel.x,wish.z*target-vel.z)));
        vel.x=mix(vel.x,wish.x*target,blend);
        vel.z=mix(vel.z,wish.z*target,blend);
      } else {
        const factor=Math.max(0,1-dt*10);
        vel.x*=factor;
        vel.z*=factor;
      }
    } else {
      this.coyote=Math.max(0,this.coyote-dt);
      if(moving && this.mode!=='wall' && this.mode!=='climb'){
        const top=Math.max(speed,8.2);
        vel.x=mix(vel.x,wish.x*top,dt*1.22);
        vel.z=mix(vel.z,wish.z*top,dt*1.22);
      }
    }

    if(this.buffer && this.mode==='wall'){
      vel.addScaledVector(this.normal,4.25);
      vel.y=6.85;
      this.wallLock=1.15;
      this.mode='air';
      this.buffer=0;
      this.armKick=1;
      this.sound.hit('jump');
    } else if(this.buffer && this.coyote && this.height===upright) {
      vel.y=8.9;
      this.coyote=0;
      this.buffer=0;
      this.grounded=false;
      this.mode='air';
      this.armKick=.50;
      this.sound.hit('jump');
    }
    if(inpt.jumpRelease && vel.y>3.6 && this.mode==='air') vel.y*=.46;

    speed=this.speed;
    const wall=this.level.blocks.find(b=>
      (b.wall || (p.y>b.y2-6 && b.y2>p.y+1.3)) &&
      p.y+1<b.y2 && p.y+.3>b.y1 && touches(p.x,p.z,b,b.wall?1.17:.69) && 
      (p.x<=b.x1-radius+.12 || p.x>=b.x2+radius-.12 || p.z<=b.z1-radius+.12 || p.z>=b.z2+radius-.12));
    if(!this.grounded && !this.wallLock && this.mode!=='wall' && this.mode!=='climb' && wall && speed>5.65 && vel.y>-6.4) {
      const nx=p.x<wall.x1?-1:p.x>wall.x2?1:0;
      const nz=p.z<wall.z1?-1:p.z>wall.z2?1:0;
      // The longer wall face takes priority at a bridge entrance.
      this.normal.set(wall.wall&&nx?nx:nz?0:nx,0,wall.wall&&nx?0:nz);
      const push=vel.dot(this.normal);
      if((wall.wall || push<-.52) && push<2.65 && Math.sqrt(Math.max(0,speed*speed-push*push))>speed*.52) {
        this.mode='wall';
        this.wallTime=1.5;
        vel.y=Math.max(1.3,vel.y*.35);
        this.sound.hit('wall');
      }
    }

    if(this.mode==='wall') {
      this.wallTime-=dt;
      if(!wall || this.wallTime<0 || wish.dot(this.normal)>.82){
        this.mode='air';
        this.wallLock=.45;
      } else {
        vel.addScaledVector(this.normal,-vel.dot(this.normal)-.86);
        vel.y-=dt*3.9;
      }
    }
    if(this.mode==='climb') {
      this.climbTime-=dt;
      if(this.climbTime<=0){
        this.mode='air';
        this.wallLock=.52;
      } else vel.y-=dt*4;
    }
    if(!this.grounded && this.mode==='air') vel.y-=dt*gravity;

    const before=p.y;
    this.moveAxis('x',vel.x*dt,inpt.sprint);
    if(this.action) return;
    this.moveAxis('z',vel.z*dt,inpt.sprint);
    if(this.action) return;

    const support=this.floor(p.x,p.z,before,this.grounded?before+.49:before+.045);
    const targetY=before+vel.y*dt;
    if(support && vel.y<=0 && (targetY<=support.y || (this.grounded && before-support.y<.14))) {
      const impact=-vel.y;
      if(!this.grounded && impact>4.2){
        const drop=this.lastFloor-support.y;
        if(drop>16 || impact>30){ this.death();return }
        if(impact>12.4&&this.rollBuffer){
          this.roll=.54;
          this.impact=.10;
          this.sound.hit('roll');
          this.particles.burst(p,16,false);
        } else {
          this.impact=impact>12.4?.62:.16+impact*.018;
          if(impact>12.4){
            this.stumble=.46;
            vel.x*=.42;
            vel.z*=.42;
          }
          this.sound.hit('land',support.kind,Math.min(1,impact/17));
          this.particles.burst(p,impact>12?16:8,false);
        }
      }
      p.y=support.y;vel.y=0;
      this.grounded=true;
      this.mode='ground';
      this.surface=support.kind;
      this.slope=support.slope;
      this.lastFloor=p.y;
    } else {
      if(vel.y>0) {
        let ceiling=Infinity;
        for(const b of this.level.blocks) {
          if(b.y1<p.y+this.height-.025 || b.y1>=targetY+this.height || !touches(p.x,p.z,b,radius-.02)) continue;
          ceiling=Math.min(ceiling,b.y1-this.height-.01);
        }
        if(ceiling<Infinity){p.y=ceiling;vel.y=-.2}
        else p.y=targetY;
      } else p.y=targetY;
      this.grounded=false;
      if(this.mode==='ground') this.mode='air';
    }
    if(p.y<Math.max(8,this.lastFloor-19)){this.death();return}

    speed=this.speed;
    if(this.grounded && speed>1.15 && !sliding){
      this.stride+=speed*dt;
      this.bob+=speed*dt*(speed>7?2.5:3.0);
      const length=speed>7?2.72:2.26;
      if(this.stride>length){
        this.stride-=length;
        this.sound.hit('step',this.surface,Math.min(1,speed/10.7));
      }
    }
    if(sliding && Math.random()<dt*20) this.particles.burst(p,1,false);
    if(this.mode==='wall' && Math.random()<dt*5) this.particles.burst(p,1,false);
  }
}
