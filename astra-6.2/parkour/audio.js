// Continuous filtered wind and sub-bass share the same master bus as the foley.
export class Soundscape {
  constructor() {
    this.enabled = true;
    this.active = false;
    this.beat = 0;
    this.next = 0;
  }
  start() {
    if (!this.ctx) {
      const c = (this.ctx = new AudioContext());
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      this.buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      let data = this.buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const wind = c.createBufferSource();
      wind.buffer = this.buf;
      wind.loop = true;
      this.filter = c.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 360;
      this.wind = c.createGain();
      this.wind.gain.value = 0.018;
      wind.connect(this.filter).connect(this.wind).connect(this.master);
      wind.start();
      for (let hz of [48.99, 73.42, 98.2]) {
        let osc = c.createOscillator(),
          g = c.createGain();
        osc.type = "sine";
        osc.frequency.value = hz;
        g.gain.value = 0.012;
        osc.connect(g).connect(this.master);
        osc.start();
      }
    }
    this.ctx.resume();
    this.active = true;
    this.volume();
  }
  volume() {
    if (this.ctx)
      this.master.gain.setTargetAtTime(
        this.active && this.enabled ? 0.65 : 0,
        this.ctx.currentTime,
        0.05,
      );
  }
  tone(hz, dur, vol, type = "sine", delay = 0, end = hz) {
    const c = this.ctx,
      t = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain();
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(end, t + dur);
    o.type = type;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.01);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  noise(freq, dur, vol, type = "lowpass") {
    let c = this.ctx,
      s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = this.buf;
    f.type = type;
    f.frequency.value = freq;
    let t = c.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur);
    s.onended = () => {
      s.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }
  event(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case "metal":
      case "wallstep":
        this.tone(525, 0.1, 0.07, "triangle", 0, 230);
        this.noise(1800, 0.08, 0.14);
        break;
      case "step":
        this.tone(110, 0.095, 0.13, "sine", 0, 48);
        this.noise(950, 0.09, 0.17);
        break;
      case "jump":
      case "vault":
        this.noise(1500, 0.15, 0.17, "bandpass");
        break;
      case "slide":
      case "roll":
        this.noise(1400, 0.57, 0.23, "bandpass");
        break;
      case "zip":
        this.tone(155, 0.35, 0.06, "sawtooth", 0, 470);
        break;
      case "wall":
        this.noise(1100, 0.18, 0.2);
        break;
      case "checkpoint":
      case "finish":
        [392, 494, 659].forEach((n, i) =>
          this.tone(n, 0.32, 0.065, "triangle", i * 0.085),
        );
        break;
      default:
        this.tone(95, 0.22, 0.2, "sine", 0, 35);
        this.noise(670, 0.16, 0.23);
    }
  }
  update(speed, stage, zip) {
    if (!this.ctx) return;
    let c = this.ctx,
      t = c.currentTime;
    this.wind.gain.setTargetAtTime(
      0.012 + speed * 0.008 + (zip ? 0.07 : 0),
      t,
      0.2,
    );
    this.filter.frequency.setTargetAtTime(
      zip ? 2900 : 320 + speed * 95,
      t,
      0.2,
    );
    if (t >= this.next) {
      let roots = [98, 98, 116.54, 87.31];
      let n = roots[Math.floor(this.beat / 8) % 4];
      if (this.beat % 4 === 0) this.tone(n, 1.2, 0.032, "triangle");
      if (stage >= 5 || this.beat % 2 === 0)
        this.tone(n * [2, 3, 4, 2.5][this.beat % 4], 0.24, 0.013, "sine");
      this.next = t + (stage >= 6 ? 0.27 : 0.36);
      this.beat++;
    }
  }
}
