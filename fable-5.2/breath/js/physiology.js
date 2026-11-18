// Breathing mechanics + gas exchange model.
// Volumes in litres, pressures in mmHg, time in seconds.

export const FRC = 2.4; // functional residual capacity of a healthy adult (L)

/**
 * Scenario presets. Every number is a typical textbook value:
 *  rr      breaths per minute            tv    tidal volume (L)
 *  ie      expiration : inspiration time shape exponent of the passive exhale (lower = faster early emptying)
 *  vco2    CO2 production (mL/min)       rq    respiratory quotient
 *  pb      barometric pressure           aa    alveolar–arterial O2 gradient
 *  ds      physiological dead space (L)  hr    heart rate (beats/min)
 *  hyper   air trapped above normal FRC (L)
 *  constrict  bronchoconstriction 0..1   smoke  tissue damage 0..1
 */
export const SCENARIOS = {
  rest:     { rr: 14, tv: 0.50, ie: 1.6, shape: 0.62, vco2: 225,  rq: 0.80, pb: 760, aa: 8,  ds: 0.15, hr: 68,  hyper: 0.0,  constrict: 0, smoke: 0, perfusion: 1.0, o2: 1.0 },
  exercise: { rr: 28, tv: 2.00, ie: 1.1, shape: 0.95, vco2: 2100, rq: 0.95, pb: 760, aa: 14, ds: 0.20, hr: 150, hyper: 0.0,  constrict: 0, smoke: 0, perfusion: 3.2, o2: 1.0 },
  altitude: { rr: 17, tv: 0.55, ie: 1.5, shape: 0.65, vco2: 225,  rq: 0.80, pb: 493, aa: 5,  ds: 0.15, hr: 88,  hyper: 0.0,  constrict: 0, smoke: 0, perfusion: 1.3, o2: 0.65 },
  asthma:   { rr: 24, tv: 0.42, ie: 3.0, shape: 1.00, vco2: 250,  rq: 0.80, pb: 760, aa: 38, ds: 0.15, hr: 104, hyper: 0.75, constrict: 1, smoke: 0, perfusion: 1.4, o2: 1.0 },
  smoker:   { rr: 18, tv: 0.48, ie: 2.2, shape: 0.80, vco2: 225,  rq: 0.80, pb: 760, aa: 32, ds: 0.22, hr: 82,  hyper: 0.55, constrict: 0.15, smoke: 1, perfusion: 1.1, o2: 1.0 },
};

const SMOOTHED = ['ie', 'shape', 'vco2', 'rq', 'pb', 'aa', 'ds', 'hr', 'hyper', 'constrict', 'smoke', 'perfusion', 'o2'];

/** Severinghaus (1979) oxyhaemoglobin dissociation curve: PO2 (mmHg) -> saturation 0..1 */
export function saturation(po2) {
  const p = Math.max(po2, 1);
  return 1 / (1 + 23400 / (p * p * p + 150 * p));
}

/** Normalised lung volume (0 = end of exhale, 1 = end of inhale) for a cycle phase in [0,1). */
export function breathWave(phase, ie, shape) {
  const ti = 1 / (1 + ie);
  if (phase < ti) return 0.5 - 0.5 * Math.cos(Math.PI * (phase / ti));
  const u = (phase - ti) / (1 - ti);
  return 0.5 + 0.5 * Math.cos(Math.PI * Math.pow(u, shape));
}

/** Chest-wall excursion saturates at large volumes: litres above FRC -> "effective" litres. */
export function effectiveVolume(v) { return 1.6 * (1 - Math.exp(-v / 1.6)); }

export class Physiology {
  constructor() {
    this.scenario = 'rest';
    const s = SCENARIOS.rest;
    this.rrTarget = s.rr; this.tvTarget = s.tv;      // slider values
    this.rr = s.rr; this.tv = s.tv;                  // smoothed values actually driving the model
    this.p = {}; for (const k of SMOOTHED) this.p[k] = s[k];
    this.phase = 0;
    this.wave = 0;          // 0..1
    this.volume = 0;        // litres above normal FRC (trapped air + tidal)
    this.flow = 0;          // L/s, + = inhaling
    this.inhaling = true;
    this.heartPhase = 0;
    this.gas = {};
    this.spo2 = 97;
    this._computeGas();
    this.spo2 = this.gas.spo2Target;
  }

  setScenario(id) {
    this.scenario = id;
    this.rrTarget = SCENARIOS[id].rr;
    this.tvTarget = SCENARIOS[id].tv;
  }

  _computeGas() {
    const p = this.p;
    const va = Math.max(0.25, (this.tv - p.ds) * this.rr);                // alveolar ventilation, L/min
    const paco2 = Math.min(95, Math.max(14, (p.vco2 * 0.863) / va));      // arterial PCO2
    const pio2 = 0.2093 * (p.pb - 47);                                    // humidified inspired PO2
    const pAo2 = Math.max(22, pio2 - paco2 / p.rq);                       // alveolar gas equation
    const pao2 = Math.max(20, pAo2 - p.aa);                               // arterial PO2
    this.gas = { va, paco2, pio2, pAo2, pao2, spo2Target: 100 * saturation(pao2) };
  }

  update(dt) {
    const s = SCENARIOS[this.scenario];
    const k = 1 - Math.exp(-dt / 0.9);
    for (const key of SMOOTHED) this.p[key] += (s[key] - this.p[key]) * k;
    // same time constant as the scenario parameters, so ventilation and metabolic demand change together
    // (otherwise leaving Exercise would briefly pair resting ventilation with exercise CO2 output)
    this.rr += (this.rrTarget - this.rr) * k;
    this.tv += (this.tvTarget - this.tv) * k;

    const dPhase = dt * this.rr / 60;
    this.phase = (this.phase + dPhase) % 1;
    const w0 = this.wave;
    this.wave = breathWave(this.phase, this.p.ie, this.p.shape);
    const vol = this.p.hyper + this.tv * this.wave;
    if (dt > 1e-5) {
      const f = (vol - this.volume) / dt;
      this.flow += (f - this.flow) * Math.min(1, dt / 0.04);
    }
    this.volume = vol;
    this.inhaling = this.phase < 1 / (1 + this.p.ie);
    this.heartPhase = (this.heartPhase + dt * this.p.hr / 60) % 1;

    this._computeGas();
    // blood takes a few seconds to re-equilibrate after a change in ventilation
    this.spo2 += (this.gas.spo2Target - this.spo2) * (1 - Math.exp(-dt / 2.5));
    return w0;
  }

  get minuteVentilation() { return this.rr * this.tv; }          // L/min
  get lungVolume() { return FRC + this.volume; }                 // absolute litres
  get effective() { return effectiveVolume(this.volume); }       // drives the chest-wall deformation
  /** cardiac cycle pulse 0..1 (sharp systole, slow relaxation) */
  get heartPulse() { const t = this.heartPhase; return t < 0.12 ? Math.sin((t / 0.12) * Math.PI * 0.5) : Math.exp(-(t - 0.12) * 6.5); }
}
