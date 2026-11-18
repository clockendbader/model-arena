// ============================================================================
// audio.js — everything is synthesised with Web Audio (no sample files):
// surface-aware footsteps, wind tied to speed, move sounds, a low city hum
// and a generative music bed whose layers build toward the finish.
// ============================================================================
export class AudioSys {
  constructor() { this.ctx = null; this.volume = 0.8; this.intensity = 0; this.started = false; }

  /** must be called from a user gesture */
  start() {
    if (this.started) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.started = true;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5; this.musicBus.connect(this.master);

    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }

    // ---- continuous layers
    this.wind = this._loop(this.white, 'bandpass', 500, 0.7, 0);
    this.windHi = this._loop(this.white, 'highpass', 2600, 0.3, 0);
    this.slide = this._loop(this.white, 'bandpass', 1300, 1.2, 0);
    this.scrape = this._loop(this.white, 'bandpass', 2400, 2.5, 0);
    this.hum = this._loop(this.brown, 'lowpass', 140, 0.5, 0.5);
    this.traffic = this._loop(this.white, 'bandpass', 420, 0.4, 0.018);
    // zipline whirr
    this.zipOsc = ctx.createOscillator(); this.zipOsc.type = 'sawtooth'; this.zipOsc.frequency.value = 160;
    this.zipGain = ctx.createGain(); this.zipGain.gain.value = 0;
    const zf = ctx.createBiquadFilter(); zf.type = 'bandpass'; zf.frequency.value = 900; zf.Q.value = 1.5;
    this.zipOsc.connect(zf); zf.connect(this.zipGain); this.zipGain.connect(this.sfx); this.zipOsc.start();
    this.zipNoise = this._loop(this.white, 'bandpass', 3200, 3, 0);

    this._startMusic();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _loop(buffer, type, freq, q, gain) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start(0, Math.random() * 1.5);
    return { f, g };
  }
  _noise(dur, type, freq, q, gain, when = 0, freqEnd) {
    const ctx = this.ctx, t = ctx.currentTime + when, src = ctx.createBufferSource(); src.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start(t, Math.random() * 1.5, dur + 0.05);
  }
  _tone(type, f0, f1, dur, gain, when = 0, bus) {
    const ctx = this.ctx, t = ctx.currentTime + when, o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g); g.connect(bus || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---- one-shots -------------------------------------------------------------
  step(surf, speed, wall) {
    if (!this.ctx) return;
    const v = Math.min(1, 0.35 + speed / 14), det = 0.9 + Math.random() * 0.22;
    if (surf === 'metal') {
      this._noise(0.09, 'bandpass', 1900 * det, 5, 0.5 * v);
      this._tone('sine', 520 * det, 500 * det, 0.16, 0.10 * v);
      this._tone('sine', 1310 * det, 1290 * det, 0.11, 0.05 * v);
      this._tone('sine', 95, 60, 0.08, 0.3 * v);
    } else if (surf === 'wood') {
      this._noise(0.07, 'bandpass', 420 * det, 2, 0.6 * v);
      this._tone('sine', 150 * det, 90, 0.1, 0.35 * v);
    } else {
      this._noise(0.075, 'lowpass', (wall ? 1500 : 900) * det, 0.8, 0.55 * v);
      this._noise(0.03, 'highpass', 3500, 0.5, 0.10 * v);
      this._tone('sine', 88 * det, 52, 0.09, 0.42 * v);
    }
  }
  jump() { if (!this.ctx) return; this._noise(0.22, 'bandpass', 500, 0.8, 0.22, 0, 1700); this._tone('sine', 120, 70, 0.1, 0.25); }
  land(impact, kind, surf) {
    if (!this.ctx) return;
    const v = Math.min(1, impact / 18);
    this._tone('sine', 85, 34, 0.24, 0.3 + 0.6 * v);
    this._noise(0.16 + v * 0.14, 'lowpass', 700 + v * 500, 0.7, 0.3 + 0.5 * v);
    if (surf === 'metal') this._tone('triangle', 240, 210, 0.3, 0.12 + 0.15 * v);
    if (kind === 'roll') { this._noise(0.5, 'bandpass', 800, 0.8, 0.3, 0.04, 380); this._tone('sine', 70, 45, 0.2, 0.3, 0.22); }
    if (kind === 'stumble') { this._noise(0.35, 'lowpass', 500, 1, 0.5, 0.02); this._tone('sawtooth', 110, 60, 0.3, 0.12); }
  }
  wallrunStart() { if (!this.ctx) return; this._noise(0.14, 'bandpass', 1200, 1.2, 0.3); this._tone('sine', 110, 70, 0.08, 0.3); }
  wallJump() { if (!this.ctx) return; this._noise(0.12, 'lowpass', 1400, 0.8, 0.5); this._tone('sine', 140, 60, 0.12, 0.45); this._noise(0.25, 'bandpass', 600, 0.8, 0.2, 0.02, 2000); }
  vault(surf) { if (!this.ctx) return; this._noise(0.08, 'lowpass', 1100, 0.8, 0.45); this._tone(surf === 'metal' ? 'triangle' : 'sine', surf === 'metal' ? 260 : 130, 80, 0.14, 0.3); this._noise(0.3, 'bandpass', 700, 0.8, 0.16, 0.03, 1900); }
  ledge() { if (!this.ctx) return; this._noise(0.06, 'lowpass', 1300, 0.8, 0.5); this._tone('sine', 150, 80, 0.09, 0.3); this._noise(0.35, 'bandpass', 900, 1, 0.14, 0.08, 500); }
  climb() { if (!this.ctx) return; this._noise(0.1, 'bandpass', 1400, 1, 0.25); }
  bump(speed) { if (!this.ctx) return; const v = Math.min(1, speed / 10); this._tone('sine', 100, 45, 0.16, 0.5 * v); this._noise(0.1, 'lowpass', 600, 0.7, 0.4 * v); }
  zipStart() { if (!this.ctx) return; this._tone('triangle', 700, 420, 0.12, 0.25); this._noise(0.08, 'bandpass', 2600, 4, 0.45); }
  zipEnd() { if (!this.ctx) return; this._tone('triangle', 380, 260, 0.14, 0.22); this._noise(0.07, 'bandpass', 2000, 3, 0.35); }
  checkpoint() {
    if (!this.ctx) return;
    [880, 1318.5, 1760, 2637].forEach((f, i) => { this._tone('sine', f, f, 0.5, 0.16, i * 0.07); this._tone('triangle', f * 2, f * 2, 0.25, 0.03, i * 0.07); });
    this._noise(0.5, 'highpass', 6000, 0.5, 0.05);
  }
  finish() {
    if (!this.ctx) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => { this._tone('sine', f, f, 1.8, 0.14, i * 0.09); this._tone('triangle', f / 2, f / 2, 1.6, 0.08, i * 0.09); });
    this._noise(1.5, 'highpass', 5000, 0.5, 0.07);
  }
  death() { if (!this.ctx) return; this._tone('sawtooth', 220, 40, 0.5, 0.2); this._noise(0.5, 'lowpass', 900, 0.8, 0.35, 0, 120); }
  respawn() { if (!this.ctx) return; this._tone('sine', 300, 600, 0.18, 0.12); }
  ui() { if (!this.ctx) return; this._tone('sine', 660, 660, 0.06, 0.08); }

  // ---- per-frame continuous control --------------------------------------------
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = Math.min(1, s.speed / 18);
    const air = s.mode === 'air' ? Math.min(1, Math.abs(s.vy) / 30) : 0;
    const w = Math.min(1, k * k * 1.5 + air * 0.8);
    this.wind.g.gain.setTargetAtTime(0.04 + w * 0.5, t, 0.12);
    this.wind.f.frequency.setTargetAtTime(280 + w * 900, t, 0.15);
    this.windHi.g.gain.setTargetAtTime(w * w * 0.09, t, 0.15);
    this.slide.g.gain.setTargetAtTime(s.mode === 'slide' ? 0.12 + k * 0.4 : 0, t, 0.04);
    this.slide.f.frequency.setTargetAtTime(700 + k * 1500, t, 0.08);
    this.scrape.g.gain.setTargetAtTime(s.mode === 'wallrun' ? 0.07 : s.mode === 'mantle' ? 0.05 : 0, t, 0.05);
    const zip = s.mode === 'zip';
    this.zipGain.gain.setTargetAtTime(zip ? 0.11 : 0, t, 0.05);
    this.zipOsc.frequency.setTargetAtTime(110 + s.speed * 15, t, 0.08);
    this.zipNoise.g.gain.setTargetAtTime(zip ? 0.14 + k * 0.2 : 0, t, 0.05);
    this.zipNoise.f.frequency.setTargetAtTime(2200 + s.speed * 120, t, 0.1);
    this.traffic.g.gain.setTargetAtTime(0.014 + 0.008 * Math.sin(t * 0.23), t, 0.5);
    this.intensity += (s.intensity - this.intensity) * Math.min(1, dt * 0.8);
  }

  // ---- generative music bed -------------------------------------------------------
  _startMusic() {
    const ctx = this.ctx;
    // gentle feedback delay for space
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.musicBus);
    this.send = ctx.createGain(); this.send.gain.value = 1; this.send.connect(delay); this.send.connect(this.musicBus);
    this.bpm = 104; this.stepLen = 60 / this.bpm / 4; this.nextStep = ctx.currentTime + 0.1; this.stepIdx = 0;
    // A minor: Am  F  C  G   (roots + chord tones, Hz)
    this.chords = [[110, 220, 261.63, 329.63], [87.31, 174.61, 220, 261.63], [130.81, 196, 261.63, 329.63], [98, 196, 246.94, 293.66]];
    this.timer = setInterval(() => this._schedule(), 60);
  }
  _schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    if (this.nextStep < ctx.currentTime - 0.3) this.nextStep = ctx.currentTime + 0.05;
    while (this.nextStep < ctx.currentTime + 0.18) {
      this._musicStep(this.stepIdx, this.nextStep - ctx.currentTime);
      this.nextStep += this.stepLen; this.stepIdx++;
    }
  }
  _musicStep(i, when) {
    const I = this.intensity, bar = Math.floor(i / 16), s = i % 16, ch = this.chords[bar % 4], w = Math.max(0, when);
    // pad: one soft swell per bar
    if (s === 0) for (const f of ch.slice(1)) { this._pad(f, this.stepLen * 16, 0.035 + I * 0.02, w); }
    // bass pulse
    if (s % 4 === 0 || (I > 0.45 && s % 2 === 0)) this._tone('triangle', ch[0], ch[0], 0.22, 0.10 + I * 0.10, w, this.send);
    // arpeggio enters with progress
    if (I > 0.25 && s % 2 === 0) { const n = ch[1 + ((s / 2) % 3)] * (s % 8 === 6 ? 4 : 2); this._tone('sine', n, n, 0.18, 0.025 + (I - 0.25) * 0.05, w, this.send); }
    if (I > 0.6) { const n = ch[1 + ((s * 5) % 3)] * 4; if (s % 4 === 3 || s % 8 === 1) this._tone('triangle', n, n, 0.12, (I - 0.6) * 0.06, w, this.send); }
    // percussion
    if (I > 0.5 && s % 2 === 0) this._hat(0.02 + (I - 0.5) * 0.05, w);
    if (I > 0.7 && s % 8 === 0) this._tone('sine', 120, 42, 0.22, 0.22 + (I - 0.7) * 0.4, w, this.musicBus);
    if (I > 0.85 && s % 8 === 4) this._hat(0.09, w, 0.12);
  }
  _pad(f, dur, gain, when) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 500 + this.intensity * 1300; flt.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.15);
    for (const d of [-6, 5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(flt); o.start(t); o.stop(t + dur * 1.2); }
    flt.connect(g); g.connect(this.send);
  }
  _hat(gain, when, dur = 0.035) {
    const ctx = this.ctx, t = ctx.currentTime + when, src = ctx.createBufferSource(); src.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(this.musicBus); src.start(t, Math.random(), dur + 0.02);
  }
}
