// ---------------------------------------------------------------------------
// Audio: everything synthesized with Web Audio (no external samples).
// Footsteps (concrete / metal), wind tied to speed, jump/land/roll/slide,
// wall-run scuffs, zipline whine + sparks crackle, checkpoint chime, city hum
// and a generative music bed whose intensity rises toward the finish.
// ---------------------------------------------------------------------------

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.volume = 0.8;
    this.intensity = 0;
  }

  start() {
    if (this.started) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.5; this.ambBus.connect(this.master);

    // shared noise buffers
    this.noise = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(4, 'brown');

    // a short reverb for space
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeImpulse(1.6, 2.5);
    const vg = ctx.createGain(); vg.gain.value = 0.22;
    this.verb.connect(vg).connect(this.master);

    this.setupWind();
    this.setupHum();
    this.setupLoops();
    this.setupMusic();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  makeNoise(seconds, type) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseSource(buf = this.noise, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop;
    return s;
  }

  // ---------------------------------------------------------------- loops
  setupWind() {
    const ctx = this.ctx;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0.0;
    src.connect(bp).connect(lp).connect(g).connect(this.sfx);
    src.start();
    // gusting base wind always present (rooftops are windy)
    const src2 = this.noiseSource(this.brown);
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 500;
    const g2 = ctx.createGain(); g2.gain.value = 0.05;
    src2.connect(lp2).connect(g2).connect(this.ambBus);
    src2.start();
    this.wind = { bp, lp, g, g2 };
  }

  setupHum() {
    const ctx = this.ctx;
    const src = this.noiseSource(this.brown);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain(); g.gain.value = 0.35;
    src.connect(lp).connect(g).connect(this.ambBus);
    src.start();
    for (const f of [55, 82.4, 110.3]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.018;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.1;
      const lg = ctx.createGain(); lg.gain.value = 0.01;
      lfo.connect(lg).connect(og.gain);
      o.connect(og).connect(this.ambBus);
      o.start(); lfo.start();
    }
    // occasional distant horns / sirens
    this.nextHorn = 6;
  }

  setupLoops() {
    const ctx = this.ctx;
    // slide: filtered noise
    {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp).connect(g).connect(this.sfx); src.start();
      this.slide = { bp, g };
    }
    // zipline: metallic whine + grit
    {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 600;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 903;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 4;
      const src = this.noiseSource();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const gn = ctx.createGain(); gn.gain.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0;
      const og = ctx.createGain(); og.gain.value = 0.12;
      o.connect(og); o2.connect(og); og.connect(bp);
      src.connect(hp).connect(gn).connect(bp);
      bp.connect(g).connect(this.sfx);
      o.start(); o2.start(); src.start();
      this.zip = { o, o2, bp, g };
    }
  }

  // ---------------------------------------------------------------- music
  setupMusic() {
    this.bpm = 96;
    this.beat = 60 / this.bpm;
    this.nextNoteTime = this.ctx.currentTime + 0.2;
    this.step16 = 0;
    // A minor-ish progression: Am - F - C - G (with suspended colours)
    this.chords = [
      [57, 60, 64, 71], [53, 57, 60, 67], [48, 55, 60, 64], [55, 59, 62, 69],
    ];
    this.musicOn = false;
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 900; this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.musicBus);
    this.padFilter.connect(this.verb);
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  scheduleMusic() {
    if (!this.musicOn) return;
    const ctx = this.ctx;
    const ahead = 0.25;
    const s16 = this.beat / 4;
    while (this.nextNoteTime < ctx.currentTime + ahead) {
      const t = this.nextNoteTime;
      const step = this.step16 % 16;
      const bar = Math.floor(this.step16 / 16);
      const chord = this.chords[bar % 4];
      const I = this.intensity;
      if (step === 0) this.pad(chord, t, this.beat * 4);
      // bass
      if (step % 4 === 0 || (I > 0.5 && step % 4 === 3)) this.bass(chord[0] - 12, t, s16 * (step % 4 === 0 ? 3 : 1));
      // kick
      if (I > 0.15 && step % 4 === 0) this.kick(t, 0.55 + I * 0.4);
      // hats
      if (I > 0.3 && step % 2 === 1) this.hat(t, 0.08 + 0.1 * I);
      if (I > 0.65 && step % 4 === 2) this.hat(t, 0.05);
      // snare/clap on 2 and 4
      if (I > 0.45 && (step === 4 || step === 12)) this.clap(t, 0.3 + 0.3 * I);
      // arpeggio
      if (I > 0.25 && step % 2 === 0) {
        const n = chord[(step / 2) % 4] + 12 + (I > 0.75 && step % 8 === 6 ? 12 : 0);
        this.pluck(n, t, 0.06 + 0.06 * I);
      }
      this.nextNoteTime += s16;
      this.step16++;
    }
  }

  pad(chord, t, dur) {
    const ctx = this.ctx;
    for (const n of chord) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = this.midi(n); o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.022, t + 0.8);
        g.gain.setValueAtTime(0.022, t + dur - 0.6);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.4);
        o.connect(g).connect(this.padFilter);
        o.start(t); o.stop(t + dur + 0.5);
      }
    }
  }

  bass(n, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = this.midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  kick(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.32);
  }

  hat(t, v) {
    const ctx = this.ctx;
    const s = this.noiseSource(this.noise, false);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(hp).connect(g).connect(this.musicBus);
    s.start(t, Math.random()); s.stop(t + 0.06);
  }

  clap(t, v) {
    const ctx = this.ctx;
    const s = this.noiseSource(this.noise, false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    s.connect(bp).connect(g); g.connect(this.musicBus); g.connect(this.verb);
    s.start(t, Math.random()); s.stop(t + 0.2);
  }

  pluck(n, t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = this.midi(n);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(lp).connect(g); g.connect(this.musicBus); g.connect(this.verb);
    o.start(t); o.stop(t + 0.27);
  }

  // ---------------------------------------------------------------- one-shots
  thump(freq, dur, v, t = this.ctx.currentTime) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  burst(type, freq, q, dur, v, t = this.ctx.currentTime, toVerb = false) {
    const ctx = this.ctx;
    const s = this.noiseSource(this.noise, false);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    if (toVerb) g.connect(this.verb);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    return f;
  }

  ring(freqs, dur, v, t = this.ctx.currentTime) {
    const ctx = this.ctx;
    for (const fq of freqs) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fq * (0.98 + Math.random() * 0.04);
      const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g).connect(this.sfx);
      o.start(t); o.stop(t + dur + 0.02);
    }
  }

  footstep(speed, surface, wall) {
    if (!this.started) return;
    const v = Math.min(1, 0.35 + speed / 14) * (wall ? 0.8 : 1);
    const pitch = 0.85 + Math.random() * 0.3;
    if (surface === 'metal') {
      this.burst('bandpass', 2600 * pitch, 6, 0.09, v * 0.5);
      this.ring([410 * pitch, 1130 * pitch, 2210 * pitch], 0.22, v * 0.05);
      this.thump(70, 0.08, v * 0.45);
    } else {
      this.burst('lowpass', 900 * pitch, 0.7, 0.07, v * 0.55);
      this.burst('bandpass', 3200 * pitch, 1.5, 0.035, v * 0.18);   // shoe grit
      this.thump(62 * pitch, 0.09, v * 0.55);
    }
  }

  onEvent(e) {
    if (!this.started) return;
    switch (e.type) {
      case 'step': this.footstep(e.speed, e.surface, e.wall); break;
      case 'jump': this.burst('highpass', 900, 0.7, 0.18, 0.18); this.thump(80, 0.08, 0.4); break;
      case 'walljump': this.burst('bandpass', 1800, 1, 0.2, 0.3); this.thump(90, 0.1, 0.5); break;
      case 'land': {
        const v = Math.min(1, (e.v || 4) / 12);
        this.thump(55, 0.18, 0.4 + v * 0.6);
        this.burst('lowpass', 600, 0.7, 0.15 + v * 0.1, 0.2 + v * 0.5);
        if (e.surface === 'metal') this.ring([320, 870, 1730], 0.5, 0.04 + v * 0.06);
        break;
      }
      case 'stumble': this.thump(45, 0.3, 1.0); this.burst('lowpass', 400, 0.7, 0.35, 0.8); break;
      case 'roll': this.burst('bandpass', 700, 0.6, 0.5, 0.5); this.thump(60, 0.15, 0.6); break;
      case 'vault': this.burst('bandpass', 1200, 0.8, 0.2, 0.35); this.thump(100, 0.06, 0.35); break;
      case 'mantle': this.burst('bandpass', 1000, 0.8, 0.25, 0.3); this.thump(80, 0.1, 0.4); break;
      case 'climb': this.thump(85, 0.08, 0.4); break;
      case 'bump': this.thump(50, 0.2, Math.min(1, e.v / 10)); this.burst('lowpass', 500, 0.7, 0.15, 0.4); break;
      case 'wallrunStart': this.burst('bandpass', 1500, 1.2, 0.25, 0.3); break;
      case 'zipStart': this.ring([1800, 2700], 0.3, 0.08); this.burst('highpass', 3000, 1, 0.2, 0.4); break;
      case 'zipEnd': this.thump(70, 0.12, 0.4); break;
      case 'checkpoint': {
        const t = this.ctx.currentTime;
        [72, 76, 79, 84].forEach((n, i) => this.ring([this.midi(n), this.midi(n) * 2.01], 0.9, 0.07, t + i * 0.07));
        break;
      }
      case 'death': this.burst('lowpass', 300, 0.5, 0.7, 0.6, undefined, true); break;
      case 'finish': {
        const t = this.ctx.currentTime;
        [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.ring([this.midi(n), this.midi(n) * 1.5], 2.0, 0.06, t + i * 0.09));
        break;
      }
      default: break;
    }
  }

  /** Per-frame continuous parameters. */
  update(dt, p, intensity, playing) {
    if (!this.started) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const sp = Math.hypot(p.st.vx, p.st.vy * 0.6, p.st.vz);
    const w = Math.min(1, Math.max(0, (sp - 2) / 16));
    this.wind.g.gain.setTargetAtTime(playing ? w * w * 0.55 : 0, now, 0.15);
    this.wind.bp.frequency.setTargetAtTime(300 + w * 1600, now, 0.2);
    this.wind.g2.gain.setTargetAtTime(0.04 + 0.03 * Math.sin(now * 0.4) ** 2, now, 0.5);

    const sliding = playing && p.mode === 'slide';
    this.slide.g.gain.setTargetAtTime(sliding ? Math.min(0.35, p.hspeed / 30) : 0, now, 0.05);
    this.slide.bp.frequency.setTargetAtTime(500 + p.hspeed * 60, now, 0.1);

    const zipping = playing && p.mode === 'zip';
    this.zip.g.gain.setTargetAtTime(zipping ? 0.05 + p.zipSpeed / 80 : 0, now, 0.05);
    if (zipping) {
      this.zip.o.frequency.setTargetAtTime(380 + p.zipSpeed * 40, now, 0.1);
      this.zip.o2.frequency.setTargetAtTime(560 + p.zipSpeed * 58, now, 0.1);
      this.zip.bp.frequency.setTargetAtTime(1500 + p.zipSpeed * 120, now, 0.1);
    }

    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 0.8);
    this.padFilter.frequency.setTargetAtTime(700 + this.intensity * 2400, now, 0.5);
    this.musicBus.gain.setTargetAtTime(0.26 + this.intensity * 0.14, now, 0.5);
    this.scheduleMusic();

    this.nextHorn -= dt;
    if (this.nextHorn <= 0) {
      this.nextHorn = 9 + Math.random() * 14;
      const t = now;
      const f = 300 + Math.random() * 150;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.26;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.05);
      g.gain.setValueAtTime(0.012, t + 0.35); g.gain.linearRampToValueAtTime(0, t + 0.5);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.ambBus); g.connect(this.verb);
      o.start(t); o2.start(t); o.stop(t + 0.55); o2.stop(t + 0.55);
    }
  }
}
