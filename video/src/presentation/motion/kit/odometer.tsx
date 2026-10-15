import { useId, type CSSProperties } from "react";
import { F, POP, clamp01, prog } from "./ease";
import { MONO } from "./fonts";
import { hash } from "./random";

/* ==========================================================================
 * COMPTEURS À ROULEAUX — JetBrains Mono, chiffres tabulaires, une colonne par chiffre en translateY,
 * flou vertical selon la vitesse (min(6, |vitesse px/s| / 800) px).
 *
 * <Odometer t value={…} digits? decimals? …/>   ODOMÈTRE : un vrai compteur (la retenue fait tourner la colonne de gauche)
 *   value       un nombre, OU une fonction du temps (tt) => nombre — alors la vitesse (et le flou) est calculée seule
 *   digits      chiffres de la partie entière (zéros à gauche) — défaut : selon la valeur
 *   decimals    0 par défaut ; decimalSep "," (français) — mettre "." pour le chrono « 0.00 → 1.00 »
 *   prefix / suffix   « N° », « € »… (texte fixe, même police)
 *   roll        part de chaque pas passée à rouler (0..1, défaut .55) : le reste du temps, le chiffre est lisible
 *   size=64 color="#fff" weight=700 style
 *   Ex. <Odometer t={t} value={(tt) => tween(tt, a, .8, 42, 57, IN_OUT)} digits={3} prefix="N° " size={56} />
 *       <Odometer t={t} value={(tt) => tween(tt, s, 1, 0, 1, LINEAR)} decimals={2} decimalSep="." size={260} />
 *
 * <SlotDigits t at text dur=.7 stagger=.09 spins=3 …/>   MACHINE À SOUS : tous les rouleaux partent à `at`, le k-ième
 *   se bloque à at + dur + k·stagger (gauche → droite, petit rebond POP) — « 8,90 € » : seuls les chiffres tournent.
 *   Avant `at`, les rouleaux sont figés sur des chiffres quelconques : n'afficher le composant qu'à partir de `at`.
 *   Ex. <SlotDigits t={t} at={time.A("P9", 2)} text="8,90 €" size={96} />
 * ======================================================================== */

type Common = { size?: number; color?: string; weight?: 600 | 700; style?: CSSProperties };

/** Une colonne 0..9 (+ un 0 en bas pour boucler), positionnée sur `pos` (continu, 0 → 10). */
function Column({ pos, size, blur, id }: { pos: number; size: number; blur: number; id: string }) {
  const p = ((pos % 10) + 10) % 10;
  const h = size * 1.1;
  const on = blur > 0.3;
  return (
    <span style={{ display: "inline-block", position: "relative", height: h, width: "0.62em", overflow: "hidden", verticalAlign: "top" }}>
      {on && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
          </filter>
        </svg>
      )}
      <span style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${-p * h}px)`, filter: on ? `url(#${id})` : undefined }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          <span key={i} style={{ display: "block", height: h, lineHeight: `${h}px`, textAlign: "center" }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Position continue de chaque colonne d'un odomètre (de la plus faible à la plus forte). */
function odometerPositions(v: number, nCols: number, decimals: number, roll: number) {
  const scaled = Math.max(0, v) * 10 ** decimals;
  const pos: number[] = [];
  // Colonne la plus faible : roule pendant la fin de chaque pas.
  const lowN = Math.floor(scaled);
  const lowR = scaled - lowN;
  const k = clamp01((lowR - (1 - roll)) / roll);
  const lowPos = (lowN % 10) + k;
  pos.push(lowPos);
  // Les suivantes : ne bougent que pendant la retenue (colonne de droite entre 9 et 10).
  let below = lowPos;
  let unit = 10;
  for (let c = 1; c < nCols; c++) {
    const n = Math.floor(scaled / unit) % 10;
    const carry = below > 9 ? below - 9 : 0;
    const p = n + carry;
    pos.push(p);
    below = p;
    unit *= 10;
  }
  return pos;
}

export function Odometer({
  t,
  value,
  digits,
  decimals = 0,
  decimalSep = ",",
  prefix = "",
  suffix = "",
  roll = 0.55,
  size = 64,
  color = "#FFFFFF",
  weight = 700,
  style,
}: Common & { t: number; value: number | ((tt: number) => number); digits?: number; decimals?: number; decimalSep?: string; prefix?: string; suffix?: string; roll?: number }) {
  const uid = `odo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const f = typeof value === "function" ? value : () => value;
  const v = f(t);
  const dv = typeof value === "function" ? (f(t + 0.5 * F) - f(t - 0.5 * F)) / F : 0;
  const intDigits = digits ?? Math.max(1, Math.floor(Math.log10(Math.max(1, Math.abs(v)))) + 1);
  const nCols = intDigits + decimals;
  const pos = odometerPositions(v, nCols, decimals, roll);
  const h = size * 1.1;
  // Vitesse de la colonne la plus faible en px/s.
  const speed = Math.abs(dv) * 10 ** decimals * h;
  const blur = Math.min(6, speed / 800);
  const cols = [];
  for (let c = nCols - 1; c >= 0; c--) {
    cols.push(<Column key={`c${c}`} id={`${uid}c${c}`} pos={pos[c]} size={size} blur={c === 0 ? blur : 0} />);
    if (decimals > 0 && c === decimals) cols.push(<span key="sep" style={{ display: "inline-block", height: h, lineHeight: `${h}px`, verticalAlign: "top" }}>{decimalSep}</span>);
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", fontFamily: MONO, fontWeight: weight, fontSize: size, fontVariantNumeric: "tabular-nums", color, lineHeight: `${h}px`, whiteSpace: "pre", ...style }}>
      {prefix && <span style={{ height: h }}>{prefix}</span>}
      {cols}
      {suffix && <span style={{ height: h }}>{suffix}</span>}
    </span>
  );
}

export function SlotDigits({ t, at, text, dur = 0.7, stagger = 0.09, spins = 3, size = 96, color = "#FFFFFF", weight = 700, style }: Common & { t: number; at: number; text: string; dur?: number; stagger?: number; spins?: number }) {
  const uid = `slot${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const h = size * 1.1;
  let di = 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", fontFamily: MONO, fontWeight: weight, fontSize: size, fontVariantNumeric: "tabular-nums", color, lineHeight: `${h}px`, whiteSpace: "pre", ...style }}>
      {Array.from(text).map((ch, i) => {
        if (!/[0-9]/.test(ch)) return <span key={i} style={{ height: h }}>{ch}</span>;
        const d = Number(ch);
        const k = di++;
        // Tous les rouleaux partent à `at` ; le rouleau k se bloque à at + dur + k·stagger, avec un petit rebond (POP).
        const len = dur + k * stagger;
        const startPos = d - spins * 10 - Math.floor(hash("slot", k) * 10);
        const p = prog(t, at, len, POP);
        const pos = startPos + (d - startPos) * p;
        const u = clamp01((t - at) / len);
        const speed = t >= at && u < 1 ? (1 - u) * 2.2 : 0;
        return <Column key={i} id={`${uid}d${k}`} pos={pos} size={size} blur={Math.min(6, speed * 3)} />;
      })}
    </span>
  );
}
