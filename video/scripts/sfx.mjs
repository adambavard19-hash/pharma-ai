// Génère les effets sonores en WAV PCM 16 bits, 48 kHz, sans dépendance.
// Déterministe (graine fixe) : relancer le script redonne les mêmes octets.
//   node sounds/gen-sfx.mjs [dossier-de-sortie]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SR = 48000;
const outDir = process.argv[2] ?? "public/sfx";
mkdirSync(outDir, { recursive: true });

// --- utilitaires ------------------------------------------------------------
let seed = 0x2f6e2b1;
const rand = () => {
  // xorshift32, bruit blanc reproductible dans [-1, 1]
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return (seed / 0xffffffff) * 2 - 1;
};

/** Courbe en cosinus surélevé : 0 → 1 sans clic. */
const ramp = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/** Enveloppe attaque / maintien / relâche, en secondes. */
const envelope = (t, dur, attack, release) =>
  Math.min(ramp(t / attack), ramp((dur - t) / release));

/** Filtre biquad passe-bande (RBJ), coefficients recalculables à chaque échantillon. */
class Bandpass {
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  process(x, freq, q) {
    const w0 = (2 * Math.PI * freq) / SR;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - alpha) / a0;
    const y = b0 * x + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Normalise au crête visé (dBFS) puis écrit un WAV mono ou stéréo. */
function writeWav(name, channels, peakDb) {
  const n = channels[0].length;
  let peak = 0;
  for (const ch of channels) for (const s of ch) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 10 ** (peakDb / 20) / peak : 1;
  const nch = channels.length;
  const buf = Buffer.alloc(44 + n * nch * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * nch * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(nch, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * nch * 2, 28); buf.writeUInt16LE(nch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * nch * 2, 40);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i] * gain));
      buf.writeInt16LE(Math.round(v * 32767), 44 + (i * nch + c) * 2);
    }
  const path = join(outDir, name);
  writeFileSync(path, buf);
  console.log(`${path}  ${(n / SR * 1000).toFixed(0)} ms  ${nch} canal(aux)  crête ${peakDb} dBFS`);
}

// --- 1. Bip de douchette ----------------------------------------------------
// Buzzer piézo : fondamentale ~2,73 kHz, un peu de 2e et 3e harmonique
// (le timbre « électronique » d'un lecteur code-barres), 90 ms,
// attaque 3 ms et relâche 12 ms pour éviter tout claquement.
{
  const dur = 0.09, f = 2730;
  const out = new Float32Array(Math.round(dur * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const tone =
      Math.sin(2 * Math.PI * f * t) +
      0.18 * Math.sin(2 * Math.PI * 2 * f * t) +
      0.08 * Math.sin(2 * Math.PI * 3 * f * t);
    out[i] = tone * envelope(t, dur, 0.003, 0.012);
  }
  writeWav("bip.wav", [out], -3);
}

// --- 2. Whoosh discret ------------------------------------------------------
// Bruit blanc dans un passe-bande balayé 350 Hz → 3,2 kHz → 900 Hz,
// enveloppe en cloche décalée vers la fin, léger panoramique gauche → droite.
{
  const dur = 0.4;
  const n = Math.round(dur * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bp1 = new Bandpass(), bp2 = new Bandpass();
  for (let i = 0; i < n; i++) {
    const x = i / n;                                  // 0 → 1
    const sweep = x < 0.65 ? x / 0.65 : 1 - (x - 0.65) / 0.35 * 0.55;
    const freq = 350 * Math.pow(3200 / 350, sweep);   // balayage exponentiel
    const noise = rand();
    // deux passes en cascade : pente plus raide, souffle plus « aérien »
    const y = bp2.process(bp1.process(noise, freq, 1.1), freq, 1.1);
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.8)), 2);
    const pan = 0.2 + 0.6 * x;                        // 0 = gauche, 1 = droite
    L[i] = y * env * Math.cos(pan * Math.PI / 2);
    R[i] = y * env * Math.sin(pan * Math.PI / 2);
  }
  writeWav("whoosh.wav", [L, R], -9);
}

// --- 3. Clic d'interface ----------------------------------------------------
// 20 ms : transitoire de bruit (2 ms) + sinus amorti à 1,8 kHz.
{
  const dur = 0.02;
  const out = new Float32Array(Math.round(dur * SR));
  const bp = new Bandpass();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const transient = bp.process(rand(), 4000, 0.8) * Math.exp(-t / 0.0012);
    const body = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t / 0.004);
    out[i] = (0.9 * transient + body) * envelope(t, dur, 0.0004, 0.004);
  }
  writeWav("clic.wav", [out], -6);
}

// --- 4. Pop d'apparition ---------------------------------------------------
// Une bulle qui éclot : sinus qui monte de 380 à 900 Hz en 60 ms.
{
  const dur = 0.07;
  const out = new Float32Array(Math.round(dur * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 380 + 520 * Math.pow(t / dur, 0.6);
    ph += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t / 0.03) * envelope(t, dur, 0.002, 0.02);
  }
  writeWav("pop.wav", [out], -6);
}

// --- 5. Tic (mot qui apparaît, compteur) -------------------------------------
{
  const dur = 0.012;
  const out = new Float32Array(Math.round(dur * SR));
  const bp = new Bandpass();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = (bp.process(rand(), 6500, 1.5) * 0.8 + Math.sin(2 * Math.PI * 3200 * t) * 0.5) * Math.exp(-t / 0.0025);
  }
  writeWav("tic.wav", [out], -10);
}

// --- 6. Touche de clavier ----------------------------------------------------
// Trois variantes légèrement différentes, pour une frappe naturelle.
for (const [k, f] of [[1, 2600], [2, 3100], [3, 2300]]) {
  const dur = 0.035;
  const out = new Float32Array(Math.round(dur * SR));
  const bp = new Bandpass();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const click = bp.process(rand(), f, 2.2) * Math.exp(-t / 0.004);
    const thock = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.008) * 0.6;
    out[i] = (click + thock) * envelope(t, dur, 0.0005, 0.01);
  }
  writeWav(`touche${k}.wav`, [out], -12);
}

// --- 7. Notification (rappel d'agenda) ---------------------------------------
// Deux notes cristallines, mi puis si, avec une queue de cloche.
{
  const dur = 0.7;
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  const notes = [{ f: 1318.5, at: 0 }, { f: 1975.5, at: 0.11 }];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const note of notes) {
      const tt = t - note.at;
      if (tt < 0) continue;
      const env = Math.min(1, tt / 0.003) * Math.exp(-tt / 0.22);
      v += env * (Math.sin(2 * Math.PI * note.f * tt) + 0.25 * Math.sin(2 * Math.PI * note.f * 2.76 * tt) * Math.exp(-tt / 0.05));
    }
    out[i] = v * envelope(t, dur, 0.001, 0.08);
  }
  writeWav("notif.wav", [out], -6);
}

// --- 8. Impact (titre qui tombe, logo) ----------------------------------------
// Grave qui descend + souffle court, stéréo légèrement élargie.
{
  const dur = 1.1;
  const n = Math.round(dur * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bpL = new Bandpass(), bpR = new Bandpass();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 42 + 90 * Math.exp(-t / 0.06);
    ph += (2 * Math.PI * f) / SR;
    const sub = Math.sin(ph) * Math.exp(-t / 0.35);
    const air = Math.exp(-t / 0.12);
    const nl = bpL.process(rand(), 1400, 0.6) * air * 0.5;
    const nr = bpR.process(rand(), 1500, 0.6) * air * 0.5;
    const env = envelope(t, dur, 0.002, 0.3);
    L[i] = (sub + nl) * env;
    R[i] = (sub + nr) * env;
  }
  writeWav("impact.wav", [L, R], -2);
}

// --- 9. Montée (avant une révélation) ------------------------------------------
{
  const dur = 1.2;
  const n = Math.round(dur * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bp1 = new Bandpass(), bp2 = new Bandpass();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const freq = 300 * Math.pow(7000 / 300, x * x);
    const a = bp1.process(rand(), freq, 2), b = bp2.process(rand(), freq * 1.05, 2);
    ph += (2 * Math.PI * (200 + 600 * x * x)) / SR;
    const tone = Math.sin(ph) * 0.15 * x;
    const env = Math.pow(x, 2.2) * Math.min(1, (1 - x) / 0.03);
    L[i] = (a + tone) * env;
    R[i] = (b + tone) * env;
  }
  writeWav("montee.wav", [L, R], -6);
}

// --- 10. Swish court (coupe rapide) -------------------------------------------
{
  const dur = 0.22;
  const n = Math.round(dur * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bp1 = new Bandpass(), bp2 = new Bandpass();
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const freq = 900 * Math.pow(6000 / 900, Math.sin(Math.PI * x * 0.5));
    const y = bp2.process(bp1.process(rand(), freq, 1.4), freq, 1.4);
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.6)), 1.5);
    L[i] = y * env * (1 - 0.6 * x);
    R[i] = y * env * (0.4 + 0.6 * x);
  }
  writeWav("swish.wav", [L, R], -8);
}
