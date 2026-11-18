export class CityAudio {
  start() {
    if(this.ctx){this.ctx.resume();return}
    const Audio=window.AudioContext??window.webkitAudioContext;
    if(!Audio) return;
    const c=this.ctx=new Audio();
    this.master=c.createGain();
    this.master.gain.value=.58;
    this.master.connect(c.destination);
    this.noiseBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
    const data=this.noiseBuffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    this.wind=this.loop('lowpass',340);
    this.wind.gain.gain.value=.018;
    this.hum=this.loop('lowpass',115);
    this.hum.gain.gain.value=.06;
    this.friction=this.loop('bandpass',950);
    this.friction.gain.gain.value=0;
    this.lastBeat=0;
    this.beat=0;
  }

  loop(type,frequency) {
    const c=this.ctx;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.noiseBuffer;source.loop=true;
    filter.type=type;filter.frequency.value=frequency;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    return {gain,filter};
  }

  noise(freq, time, volume, type='lowpass', q=.8) {
    const c=this.ctx;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    const now=c.currentTime;
    source.buffer=this.noiseBuffer;
    filter.type=type;filter.frequency.value=freq;filter.Q.value=q;
    source.connect(filter).connect(gain).connect(this.master);
    gain.gain.setValueAtTime(.001,now);
    gain.gain.linearRampToValueAtTime(volume,now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+time);
    source.start(now,Math.random());
    source.stop(now+time+.01);
  }

  tone(freq,end,duration,volume,type='sine',delay=0,fade=.012) {
    const c=this.ctx;
    const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;
    o.type=type;
    o.frequency.setValueAtTime(freq,t);
    o.frequency.exponentialRampToValueAtTime(end,t+duration);
    g.gain.setValueAtTime(.0001,t);
    g.gain.linearRampToValueAtTime(volume,t+fade);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g).connect(this.master);
    o.start(t);o.stop(t+duration+.01);
  }

  hit(type,surface='concrete',strength=.75) {
    if(!this.ctx) return;
    const metal=surface==='metal';
    switch(type){
      case 'step':
        this.noise(metal?1100:560,.13,.20*strength,'bandpass');
        this.tone(metal?155:107,49,.086,.13*strength,'triangle');
        if(metal) this.tone(391,240,.14,.024*strength);
        break;
      case 'land':
        this.noise(metal?1700:355,.29,.38*strength);
        this.tone(108,34,.25,.31*strength,'triangle');
        break;
      case 'jump': this.noise(920,.18,.083,'bandpass');break;
      case 'vault': this.noise(1100,.24,.11,'bandpass');break;
      case 'climb': this.noise(580,.32,.15,'bandpass');break;
      case 'wall': this.noise(440,.25,.13,'bandpass');break;
      case 'slide': this.noise(890,.38,.11,'bandpass');break;
      case 'roll': this.noise(540,.41,.17);this.tone(94,41,.27,.20);break;
      case 'zip': this.noise(2700,.25,.2,'bandpass',2);this.tone(500,190,.31,.05,'triangle');break;
      case 'fall': this.tone(120,42,.40,.25,'triangle');break;
      case 'checkpoint':
      case 'finish': {
        const notes=type==='finish'?[392,523.25,659.25,783.99]:[523.25,784];
        notes.forEach((note,i)=>this.tone(note,note*.997,.54,.086,'sine',i*.093));
        break;
      }
    }
  }

  update(speed,mode,progress,isRunning) {
    if(!this.ctx) return;
    const t=this.ctx.currentTime;
    const air=isRunning?Math.min(1,speed/19):0;
    this.wind.gain.gain.setTargetAtTime(.014+.16*air,t,.19);
    this.wind.filter.frequency.setTargetAtTime(230+620*air,t,.22);
    const scraping=mode==='zip'?.16:mode==='slide'?.086:mode==='wall'?.050:0;
    this.friction.gain.gain.setTargetAtTime(isRunning?scraping:0,t,.08);
    this.friction.filter.frequency.setTargetAtTime(mode==='zip'?2480:920,t,.12);
    this.hum.gain.gain.setTargetAtTime(isRunning?.09:.03,t,.3);
    const late=progress;
    if(!isRunning || t-this.lastBeat<.49-late*.18) return;
    this.lastBeat=t;
    const n=this.beat++;
    const root=[55,55,65.406,49][Math.floor(n/8)%4];
    if(n%2===0) this.tone(root,root*.985,.53,.041+late*.039,'triangle',0,.045);
    const melody=[2,3,4,3,2,4,3,1.5];
    this.tone(root*melody[n%8]*2,root*melody[n%8]*1.997,.82,.019+late*.023,'sine',0,.08);
    if(late>.64) this.noise(n%2?1870:140,.12,.038*late,'bandpass');
  }
}
