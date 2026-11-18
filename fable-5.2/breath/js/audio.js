// Breathing sound synthesised with the Web Audio API (no samples): filtered noise whose loudness
// follows air flow, brighter on the way in, darker on the way out, plus a wheeze for narrowed airways.
export class BreathAudio {
  constructor() { this.ctx = null; this.muted = false; this.started = false; }

  start() {
    if (this.started) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC(); this.started = true;
    // 4 s of pink-ish noise
    const len = ctx.sampleRate * 4; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;

    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    const band = (freq, q) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; return f; };
    // inhale: airy, higher
    this.inF = band(1250, 0.75); this.inG = ctx.createGain(); this.inG.gain.value = 0;
    const inHP = ctx.createBiquadFilter(); inHP.type = 'highpass'; inHP.frequency.value = 500;
    src.connect(this.inF).connect(inHP).connect(this.inG).connect(this.master);
    // exhale: softer, lower
    this.outF = band(560, 0.6); this.outG = ctx.createGain(); this.outG.gain.value = 0;
    const outLP = ctx.createBiquadFilter(); outLP.type = 'lowpass'; outLP.frequency.value = 1500;
    src.connect(this.outF).connect(outLP).connect(this.outG).connect(this.master);
    // wheeze: a few narrow resonances that drift
    this.wheezeG = ctx.createGain(); this.wheezeG.gain.value = 0; this.wheezeF = [];
    for (const f of [410, 615, 830]) { const b = band(f, 38); const g = ctx.createGain(); g.gain.value = 5; src.connect(b).connect(g).connect(this.wheezeG); this.wheezeF.push([b, f]); }
    this.wheezeG.connect(this.master);
    src.start();
    this._applyMute();
  }

  _applyMute() { if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.08); }
  setMuted(m) { this.muted = m; if (!m && !this.started) this.start(); if (this.ctx && !m) this.ctx.resume(); this._applyMute(); }

  /** flow in L/s (+ = in), tv in L, constrict 0..1, level 0..2 */
  update(phys, time) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime; const flow = phys.flow;
    // loudness grows with flow but compresses, so exercise is louder without clipping
    const loud = (f) => Math.min(0.55, 0.26 * Math.pow(Math.max(0, f), 0.6));
    this.inG.gain.setTargetAtTime(loud(flow), t, 0.05);
    this.outG.gain.setTargetAtTime(loud(-flow) * 0.85, t, 0.05);
    this.inF.frequency.setTargetAtTime(1150 + 500 * Math.min(1, Math.abs(flow) / 2), t, 0.1);
    const wheeze = phys.p.constrict;
    this.wheezeG.gain.setTargetAtTime(wheeze * (loud(-flow) * 0.5 + loud(flow) * 0.12), t, 0.06);
    this.wheezeF.forEach(([b, f], i) => b.frequency.setTargetAtTime(f * (1 + 0.05 * Math.sin(time * (0.7 + i * 0.37)) + 0.1 * Math.min(1, Math.abs(flow))), t, 0.1));
  }
}
