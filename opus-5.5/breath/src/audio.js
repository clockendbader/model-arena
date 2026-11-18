// Synthesised breathing sound (no samples): filtered noise whose loudness follows
// airflow; inhale is brighter, exhale softer and lower. In asthma a faint
// expiratory wheeze (a musical tone from narrowed airways) is added.
export class BreathAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    // pink-ish noise buffer
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'bandpass'; this.filter.frequency.value = 900; this.filter.Q.value = 0.6;
    this.shelf = ctx.createBiquadFilter(); this.shelf.type = 'lowpass'; this.shelf.frequency.value = 2600;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 1 : 0;
    src.connect(this.filter).connect(this.shelf).connect(this.gain).connect(this.master).connect(ctx.destination);
    src.start();
    // wheeze
    this.osc = ctx.createOscillator(); this.osc.type = 'triangle'; this.osc.frequency.value = 480;
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 9;
    this.lfo.connect(lfoGain).connect(this.osc.frequency);
    this.wheeze = ctx.createGain(); this.wheeze.gain.value = 0;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 520; wf.Q.value = 3;
    this.osc.connect(wf).connect(this.wheeze).connect(this.master);
    this.osc.start(); this.lfo.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.start();
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  update(phys) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const flowMLs = Math.abs(phys.flow) * phys.vt;          // mL/s
    const loud = Math.min(1, flowMLs / 900);
    const inh = phys.flow > 0;
    const level = Math.pow(loud, 0.8) * (inh ? 0.55 : 0.38);
    this.gain.gain.setTargetAtTime(level, t, 0.06);
    this.filter.frequency.setTargetAtTime(inh ? 1150 + loud * 600 : 620 + loud * 300, t, 0.1);
    const wz = phys.p.narrowing * (inh ? 0.0 : 1) * Math.min(1, loud * 3) * 0.05;
    this.wheeze.gain.setTargetAtTime(wz, t, 0.08);
    this.osc.frequency.setTargetAtTime(430 + 140 * (1 - loud), t, 0.2);
  }
}
