// Respiratory physiology model.
// Readouts come from textbook relationships rather than canned numbers:
//   alveolar ventilation  VA = f × (VT − VD)
//   PaCO2 = 0.863 × VCO2 / VA                      (alveolar ventilation equation)
//   PAO2  = FiO2 × (Pb − 47) − PaCO2 / R           (alveolar gas equation, R = 0.8)
//   PaO2  = PAO2 − A–a gradient
//   SaO2  = Severinghaus (1979) fit of the oxyhaemoglobin dissociation curve

export const SCENARIOS = {
  rest: {
    rr: 12, vt: 500, ie: 1.7, vco2: 200, fio2: 0.21, pb: 760, aa: 8, vd: 150, frc: 2400,
    hr: 70, narrowing: 0, tar: 0, damage: 0, expK: 4.2, cohb: 1, altitude: 0,
  },
  exercise: {
    rr: 30, vt: 1900, ie: 1.15, vco2: 2300, fio2: 0.21, pb: 760, aa: 12, vd: 170, frc: 2200,
    hr: 145, narrowing: 0, tar: 0, damage: 0, expK: 5.0, cohb: 1, altitude: 0,
  },
  altitude: {
    rr: 16, vt: 560, ie: 1.6, vco2: 210, fio2: 0.21, pb: 493, aa: 6, vd: 150, frc: 2450,
    hr: 88, narrowing: 0, tar: 0, damage: 0, expK: 4.2, cohb: 1, altitude: 3500,
  },
  asthma: {
    rr: 26, vt: 420, ie: 2.8, vco2: 250, fio2: 0.21, pb: 760, aa: 34, vd: 170, frc: 3100,
    hr: 108, narrowing: 1, tar: 0, damage: 0, expK: 1.9, cohb: 1, altitude: 0,
  },
  smoker: {
    rr: 17, vt: 470, ie: 2.0, vco2: 210, fio2: 0.21, pb: 760, aa: 20, vd: 200, frc: 2900,
    hr: 82, narrowing: 0.25, tar: 1, damage: 1, expK: 3.0, cohb: 6, altitude: 0,
  },
};

const SMOOTHED = ['ie', 'vco2', 'fio2', 'pb', 'aa', 'vd', 'frc', 'hr', 'narrowing', 'tar', 'damage', 'expK', 'cohb', 'altitude'];

export function severinghaus(po2) {
  const p = Math.max(1, po2);
  return 100 / (1 + 23400 / (p * p * p + 150 * p));
}

export class Physiology {
  constructor() {
    this.scenario = 'rest';
    this.target = { ...SCENARIOS.rest };
    this.p = { ...SCENARIOS.rest };
    this.rr = this.target.rr;          // user-controlled (slider), smoothed
    this.vt = this.target.vt;
    this.rrTarget = this.rr;
    this.vtTarget = this.vt;
    this.phase = 0.0;                  // 0..1 position in the breath cycle
    this.v = 0;                        // normalised inflation 0..1
    this.flow = 0;                     // d v / dt (1/s)
    this.inhaling = true;
    this.spo2 = 97;
    this.time = 0;
    this.heartPhase = 0;
    this.breathCount = 0;
    this.compute();
    this.spo2 = this.out.spo2Target;
  }

  setScenario(name) {
    this.scenario = name;
    this.target = { ...SCENARIOS[name] };
    this.rrTarget = this.target.rr;
    this.vtTarget = this.target.vt;
  }

  setRate(rr) { this.rrTarget = rr; }
  setDepth(vt) { this.vtTarget = vt; }

  // breathing waveform: smooth active inhale, exponential passive exhale
  waveform(u, ti, k) {
    if (u < ti) return 0.5 - 0.5 * Math.cos(Math.PI * u / ti);
    const s = (u - ti) / (1 - ti);
    const e = Math.exp(-k);
    return (Math.exp(-k * s) - e) / (1 - e);
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const a = 1 - Math.exp(-dt / 1.4);
    for (const key of SMOOTHED) this.p[key] += (this.target[key] - this.p[key]) * a;
    this.rr += (this.rrTarget - this.rr) * a;
    this.vt += (this.vtTarget - this.vt) * a;

    const T = 60 / this.rr;
    const prevPhase = this.phase;
    this.phase += dt / T;
    if (this.phase >= 1) { this.phase -= 1; this.breathCount++; }
    const ti = 1 / (1 + this.p.ie);
    const prev = this.v;
    this.v = this.waveform(this.phase, ti, this.p.expK);
    this.flow = (this.v - prev) / Math.max(dt, 1e-4);
    if (this.phase < prevPhase) this.flow = (this.v - prev) / Math.max(dt, 1e-4);
    this.inhaling = this.phase < ti;
    this.ti = ti;
    this.period = T;

    this.heartPhase = (this.heartPhase + dt * this.p.hr / 60) % 1;

    this.compute();
    // SpO2 follows blood gases with a lag of several seconds (circulation + oximeter averaging)
    this.spo2 += (this.out.spo2Target - this.spo2) * (1 - Math.exp(-dt / 6));
  }

  compute() {
    const p = this.p;
    const vtL = this.vt / 1000;
    const va = Math.max(0.3, this.rr * Math.max(0.02, vtL - p.vd / 1000)); // L/min
    const paco2 = Math.min(85, Math.max(18, 0.863 * p.vco2 / va));
    const pio2 = p.fio2 * (p.pb - 47);
    const pao2Alv = Math.max(15, pio2 - paco2 / 0.8);
    const pao2 = Math.max(22, pao2Alv - p.aa);
    const sao2 = severinghaus(pao2);
    this.out = {
      rr: this.rr,
      vt: this.vt,
      ve: this.rr * vtL,                    // L/min
      va,
      paco2,
      pio2,
      pAO2: pao2Alv,
      paO2: pao2,
      spo2Target: sao2,
      hr: p.hr,
      volume: p.frc + this.v * this.vt,     // mL in the lungs right now
      frc: p.frc,
    };
  }

  get spo2Display() { return Math.round(this.spo2); }

  // how far the lung base / ribs move for the current tidal volume (metres / radians)
  motion() {
    const d = this.vt / 500;
    return {
      dia: Math.min(0.07, 0.016 * Math.pow(d, 0.85)),     // diaphragm descent: ~1.5 cm quiet, up to 7 cm deep
      lat: Math.min(0.05, 0.012 * Math.pow(d, 0.8)),      // fractional lateral expansion
      ap: Math.min(0.06, 0.016 * Math.pow(d, 0.8)),       // fractional antero-posterior expansion
      rib: Math.min(0.085, 0.022 * Math.pow(d, 0.8)),     // rib elevation (rad)
    };
  }
}
