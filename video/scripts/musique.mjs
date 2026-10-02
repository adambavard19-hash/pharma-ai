// Les musiques des films, synthétisées par code : aucun service, aucun droit à
// gérer, calées à l'image près sur le montage. Une piste par film, décrite
// mesure par mesure (couches, accords, montées, impacts).
//
//   node scripts/musique.mjs            → toutes les pistes dans public/music/
//   node scripts/musique.mjs pourquoi   → une seule
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 48000;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const ramp = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

const C = { bass: 36, notes: [52, 55, 59, 62] };  // Cmaj9
const Am = { bass: 33, notes: [52, 55, 59, 60] }; // Am9
const F = { bass: 29, notes: [53, 57, 60, 64] };  // Fmaj7
const G = { bass: 31, notes: [50, 55, 60, 64] };  // G6sus
const Dm = { bass: 38, notes: [53, 57, 60, 64] }; // Dm9
const Em = { bass: 28, notes: [52, 55, 59, 62] }; // Em7
const MAJOR = [C, Am, F, G];
const MINOR = [Am, F, Dm, Em];

// Intensité des couches, de 0 à 1.
const L = (o) => ({ pad: 1, arp: 0, bass: 0, kick: 0, snare: 0, hat: 0, hat16: 0, bright: 0.5, ...o });
const QUIET = L({ bright: 0.25 });
const LIGHT = L({ arp: 0.55, hat: 0.4, bright: 0.5 });
const DRIVE = L({ arp: 1, bass: 1, kick: 1, hat: 1, bright: 0.75 });
const PEAK = L({ arp: 1, bass: 1, kick: 1, snare: 0.8, hat: 1, hat16: 0.6, bright: 1 });
const BREATH = L({ arp: 0.35, bass: 0.3, hat: 0.3, bright: 0.5 });
const END = L({ arp: 0.4, bass: 0.6, bright: 0.8 });

const PRESETS = {
  // Le film de lancement (50 s) : 120 BPM, 25 mesures.
  film: {
    bpm: 120, bars: 25,
    layers: (b) => (b < 2 ? QUIET : b < 4 ? L({ arp: 0.55, bright: 0.5 }) : b < 6 ? L({ arp: 0.55, bass: 0.5, hat: 0.5, bright: 0.5 }) : b === 15 ? BREATH : b < 21 ? (b >= 17 ? L({ ...DRIVE, bright: 1 }) : DRIVE) : END),
    chord: (b) => (b >= 23 ? C : b === 22 ? G : b === 21 ? F : MAJOR[b % 4]),
    impacts: [{ at: 0.5, gain: 0.55 }, { at: 21, gain: 1 }],
    risers: [[5, 6], [20, 21]],
    holdFrom: 21,
  },
  // Comment ça marche (35 s) : 136 BPM, 20 mesures.
  // Comment ça marche (39 s) : 136 BPM, 22 mesures ; trois étapes, chacune relancée par un impact.
  comment: {
    bpm: 136, bars: 22,
    layers: (b) => (b < 1 ? QUIET : b < 5 ? L({ arp: 0.7, bass: 0.6, hat: 0.6, bright: 0.55 }) : b < 7 ? BREATH : b < 12 ? DRIVE : b < 14 ? PEAK : b < 16 ? BREATH : b < 19 ? L({ arp: 0.7, bass: 0.6, hat: 0.6, bright: 0.6 }) : END),
    chord: (b) => (b >= 21 ? C : b === 20 ? G : b === 19 ? F : MAJOR[b % 4]),
    impacts: [{ at: 0, gain: 0.6 }, { at: 5.5, gain: 0.5 }, { at: 14.5, gain: 0.5 }, { at: 19, gain: 1 }],
    risers: [[4.5, 5.5], [13.5, 14.5], [18, 19]],
    holdFrom: 19,
  },
  // La présentation du site (42 s) : 120 BPM, 21 mesures.
  presentation: {
    bpm: 120, bars: 21,
    layers: (b) => (b < 3 ? (b < 1 ? QUIET : L({ arp: 0.45, bright: 0.45 })) : b < 7 ? L({ arp: 0.6, bass: 0.5, hat: 0.5, bright: 0.5 }) : b < 12 ? DRIVE : b < 15 ? L({ arp: 0.6, bass: 0.6, hat: 0.6, bright: 0.6 }) : b < 18 ? PEAK : END),
    chord: (b) => (b >= 20 ? C : b === 19 ? G : b === 18 ? F : MAJOR[b % 4]),
    impacts: [{ at: 0.1, gain: 0.6 }, { at: 1.5, gain: 0.45 }, { at: 15, gain: 0.6 }, { at: 18, gain: 1 }],
    risers: [[2, 3], [14, 15], [17, 18]],
    holdFrom: 18,
  },
  // Pourquoi (34 s) : 120 BPM, 17 mesures ; mineur pour les problèmes, majeur pour les réponses.
  pourquoi: {
    bpm: 120, bars: 17,
    layers: (b) => (b < 2 ? L({ bright: 0.35, arp: 0.3 }) : b < 5 ? L({ arp: 0.5, bass: 0.5, hat: 0.3, bright: 0.4 }) : b < 8 ? DRIVE : b < 11 ? L({ arp: 0.5, bass: 0.5, hat: 0.3, bright: 0.4 }) : b < 14 ? PEAK : END),
    chord: (b) => (b >= 16 ? C : b === 15 ? G : b === 14 ? F : b < 5 || (b >= 8 && b < 11) ? MINOR[b % 4] : MAJOR[b % 4]),
    impacts: [{ at: 0.25, gain: 0.7 }, { at: 5, gain: 0.55 }, { at: 11, gain: 0.55 }, { at: 14, gain: 1 }],
    risers: [[4, 5], [10, 11], [13, 14]],
    holdFrom: 14,
  },
  // Les avantages (34 s) : 128 BPM, 18 mesures ; énergie continue.
  avantages: {
    bpm: 128, bars: 18,
    layers: (b) => (b < 1 ? L({ bright: 0.4, arp: 0.5 }) : b < 15 ? (b % 4 === 0 ? PEAK : L({ ...PEAK, snare: 0.6, hat16: 0.4 })) : END),
    chord: (b) => (b >= 17 ? C : b === 16 ? G : b === 15 ? F : MAJOR[b % 4]),
    impacts: [{ at: 1, gain: 0.7 }, { at: 15, gain: 1 }],
    risers: [[0, 1], [14, 15]],
    holdFrom: 15,
  },
  // Sans ordonnance (25 s) : 124 BPM, 13 mesures ; tension sur le signal d'alerte.
  "sans-ordonnance": {
    bpm: 124, bars: 13,
    layers: (b) => (b < 2 ? L({ bright: 0.35, arp: 0.3 }) : b < 5 ? LIGHT : b < 8 ? DRIVE : b < 10 ? L({ arp: 0.4, bass: 0.7, kick: 0.6, hat: 0.5, bright: 0.35 }) : END),
    chord: (b) => (b >= 12 ? C : b === 11 ? G : b === 10 ? F : b >= 8 ? MINOR[b % 4] : MAJOR[b % 4]),
    impacts: [{ at: 0.25, gain: 0.7 }, { at: 8, gain: 0.5 }, { at: 10, gain: 1 }],
    risers: [[4, 5], [9, 10]],
    holdFrom: 10,
  },
};

function compose(name, p) {
  const beat = 60 / p.bpm, bar = 4 * beat;
  const seconds = p.bars * bar;
  const N = Math.round(seconds * SR);
  let seed = 20261001;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };
  const Lc = new Float32Array(N), Rc = new Float32Array(N);
  const phases = new Map();
  const osc = (key, f) => {
    let ph = phases.get(key) ?? rand() * 0.5 + 0.5;
    ph = (ph + f / SR) % 1; phases.set(key, ph);
    return 2 * ph - 1;
  };
  let lpL = 0, lpR = 0, lpB = 0, hpPrev = 0, hpOut = 0, kickPhase = 0, svLow = 0, svBand = 0, snLow = 0, snBand = 0;
  const impacts = p.impacts.map((i) => ({ at: i.at * bar, gain: i.gain }));
  const risers = p.risers.map(([a, b]) => ({ from: a * bar, to: b * bar }));

  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const b = Math.min(p.bars - 1, Math.floor(t / bar));
    const c = p.chord(b);
    const ly = p.layers(b);
    const tb = t % bar;
    const hold = b >= p.holdFrom;
    const xfade = hold ? 1 : Math.min(ramp(tb / 0.2), ramp((bar - tb) / 0.2));
    const tk = t % beat;
    const pump = ly.kick ? 1 - 0.3 * ly.kick * Math.exp(-tk / 0.14) : 1;
    const n = rand();

    // 1. nappe : dents de scie désaccordées, passe-bas qui s'ouvre avec l'intensité
    let padL = 0, padR = 0;
    c.notes.forEach((m, k) => {
      const f = midi(m);
      padL += osc(`a${k}${m}`, f * 0.997) * 0.5 + osc(`b${k}${m}`, f * 1.004) * 0.5;
      padR += osc(`c${k}${m}`, f * 1.003) * 0.5 + osc(`d${k}${m}`, f * 0.996) * 0.5;
    });
    const cutoff = 420 + 1600 * ly.bright + 260 * Math.sin(2 * Math.PI * t / (2 * bar));
    const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
    lpL += a * (padL - lpL); lpR += a * (padR - lpR);
    const pad = 0.085 * ly.pad * xfade * pump;

    // 2. basse sur les temps 1 et 3
    const tBeat = tb % (2 * beat);
    const fb = midi(c.bass);
    const bassEnv = hold ? Math.exp(-tb / 2.2) : Math.exp(-tBeat / 0.5) * Math.min(1, tBeat / 0.01, (2 * beat - tBeat) / 0.04);
    lpB += 0.05 * (Math.sin(2 * Math.PI * fb * t) + 0.25 * Math.sin(4 * Math.PI * fb * t) - lpB);
    const bass = 0.3 * ly.bass * bassEnv * lpB;

    // 3. arpège en croches
    const eighth = beat / 2;
    const step = Math.floor(tb / eighth);
    const tn = tb % eighth;
    const order = [0, 1, 2, 3, 2, 1, 2, 3];
    const fa = midi(c.notes[order[step % 8]] + (ly.bright >= 1 && step % 4 === 3 ? 24 : 12));
    const pl = Math.exp(-tn / 0.15) * Math.min(1, tn / 0.004, (eighth - tn) / 0.012);
    const arp = 0.075 * ly.arp * pl * (Math.sin(2 * Math.PI * fa * t) + 0.3 * Math.sin(4 * Math.PI * fa * t));
    const arpPan = 0.5 + 0.35 * Math.sin(step * 1.3);

    // 4. charleston : contretemps, et doubles croches quand ça monte
    hpOut = 0.92 * (hpOut + n - hpPrev); hpPrev = n;
    const sixteenth = beat / 4;
    const t16 = tb % sixteenth;
    const s16 = Math.floor(tb / sixteenth);
    let hat = step % 2 === 1 ? 0.032 * ly.hat * Math.exp(-tn / 0.025) * hpOut : 0;
    if (ly.hat16 && s16 % 2 === 1) hat += 0.018 * ly.hat16 * Math.exp(-t16 / 0.015) * hpOut;

    // 5. grosse caisse sur chaque temps
    const kf = 48 + 85 * Math.exp(-tk / 0.026);
    kickPhase = (kickPhase + kf / SR) % 1;
    const kick = 0.44 * ly.kick * Math.exp(-tk / 0.19) * Math.min(1, tk / 0.002) * Math.sin(2 * Math.PI * kickPhase);

    // 6. caisse claire sur les temps 2 et 4
    const beatIdx = Math.floor(tb / beat);
    let snare = 0;
    if (ly.snare && beatIdx % 2 === 1) {
      const f1 = 2 * Math.sin(Math.PI * 1900 / SR);
      snLow += f1 * snBand; const hi = n - snLow - 0.9 * snBand; snBand += f1 * hi;
      snare = ly.snare * (0.11 * snBand * Math.exp(-tk / 0.11) + 0.08 * Math.sin(2 * Math.PI * 190 * tk) * Math.exp(-tk / 0.05)) * Math.min(1, tk / 0.001);
    }

    // 7. montées de bruit filtré
    let riser = 0;
    for (const r of risers) {
      if (t >= r.from && t < r.to) {
        const x = (t - r.from) / (r.to - r.from);
        const fc = 300 + 5500 * x * x;
        const f1 = 2 * Math.sin(Math.PI * fc / SR);
        svLow += f1 * svBand; const high = n - svLow - 0.6 * svBand; svBand += f1 * high;
        riser += 0.16 * x * x * svBand;
      }
    }

    // 8. impacts : grave qui descend + souffle
    let impact = 0;
    for (const im of impacts) {
      const ti = t - im.at;
      if (ti >= 0 && ti < 3) {
        const f = 38 + 50 * Math.exp(-ti / 0.08);
        impact += im.gain * 0.5 * Math.exp(-ti / 0.9) * Math.sin(2 * Math.PI * f * ti);
        impact += im.gain * 0.06 * Math.exp(-ti / 0.25) * n;
      }
    }

    Lc[i] = pad * lpL + bass + arp * (1 - arpPan) + hat * 0.8 + kick + snare + riser + impact;
    Rc[i] = pad * lpR + bass + arp * arpPan + hat * 1.0 + kick + snare * 0.9 + riser * 0.9 + impact;
  }

  // Réverbération de Schroeder (4 peignes + 2 passe-tout)
  const reverb = (x, offset) => {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ d: d + offset, b: new Float32Array(d + offset), i: 0 }));
    const aps = [225, 556].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
    const y = new Float32Array(x.length);
    for (let k = 0; k < x.length; k++) {
      let s = 0;
      for (const c of combs) { const o = c.b[c.i]; c.b[c.i] = x[k] + o * 0.86; c.i = (c.i + 1) % c.d; s += o; }
      s /= combs.length;
      for (const ap of aps) { const o = ap.b[ap.i]; const v = s + o * 0.5; ap.b[ap.i] = v; ap.i = (ap.i + 1) % ap.d; s = o - v * 0.5; }
      y[k] = s;
    }
    return y;
  };
  const rL = reverb(Lc, 0), rR = reverb(Rc, 23);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const wet = t >= p.holdFrom * bar ? 0.32 : 0.2;
    const fade = Math.min(1, t / 0.4, (seconds - t) / 2);
    Lc[i] = (Lc[i] * (1 - wet) + rL[i] * wet * 3) * Math.max(0, fade);
    Rc[i] = (Rc[i] * (1 - wet) + rR[i] * wet * 3) * Math.max(0, fade);
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(Lc[i]), Math.abs(Rc[i]));
  const g = 10 ** (-3 / 20) / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lc[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rc[i] * g)) * 32767), 46 + i * 4);
  }
  mkdirSync("public/music", { recursive: true });
  writeFileSync(`public/music/${name}.wav`, buf);
  console.log(`public/music/${name}.wav  ${seconds.toFixed(2)} s  ${p.bpm} BPM`);
}

const only = process.argv[2];
for (const [name, preset] of Object.entries(PRESETS)) if (!only || only === name) compose(name, preset);
