import { prog, SNAP, EXIT } from "../../presentation/motion/kit/ease";
import { A1, JAKARTA, PB, rgba } from "./brand";
import { L } from "./layout";
import { DROP } from "../timeline";
import MOTS from "../mots.json";

/* ==========================================================================
 * SOUS-TITRES — la vidéo démarre SANS le son sur le site (le navigateur l'impose) : la phrase dite s'affiche en bas,
 * mot à mot, calée sur la voix (horodatage ElevenLabs → src/rembobine/mots.json). Les mots entre astérisques du script
 * prennent l'accent (rouge dans l'acte 1, citron ensuite). Les répliques de la pharmacienne et du patient portent une
 * petite étiquette (« La pharmacienne », « Le patient »).
 * Posés par le film AU-DESSUS des scènes. Les scènes laissent libre la bande sous L.capY (930 px).
 * ======================================================================== */

type Line = { who: "yann" | "clemence" | "eric"; at: number; end: number; caption: string; words: { w: string; at: number; end: number }[] };

/** Les mots affichés : la ponctuation seule colle au mot voisin (même règle que tools/mots.mjs). */
function captionTokens(caption: string) {
  const raw = caption.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let carry = "";
  for (const r of raw) {
    if (/^[«]+$/.test(r)) {
      carry += `${r} `;
      continue;
    }
    if (/^[?!:;…»]+$/.test(r.replace(/\*/g, "")) && out.length) {
      out[out.length - 1] += ` ${r}`;
      continue;
    }
    out.push(carry + r);
    carry = "";
  }
  return out;
}

function tokens(line: Line) {
  const shown: { w: string; accent: boolean }[] = [];
  let on = false;
  for (const raw of captionTokens(line.caption)) {
    let w = "";
    let accent = false;
    for (const ch of raw) {
      if (ch === "*") {
        on = !on;
        continue;
      }
      w += ch;
      if (on) accent = true;
    }
    shown.push({ w, accent });
  }
  const spoken = line.words;
  return shown.map((tok, i) => ({ ...tok, at: shown.length === spoken.length ? spoken[i].at : line.at + (i / shown.length) * (line.end - line.at) }));
}

const WHO = { clemence: "La pharmacienne", eric: "Le patient", yann: "" } as const;

export function Captions({ t }: { t: number }) {
  const line = (Object.values(MOTS) as Line[]).find((l) => t >= l.at - 0.15 && t <= l.end + 0.3);
  if (!line) return null;
  const inK = prog(t, line.at - 0.15, 0.25, SNAP);
  const outK = prog(t, line.end + 0.05, 0.25, EXIT);
  const act1 = t < DROP;
  const accent = act1 ? A1.alarm : PB.citron;
  const dialogue = line.who !== "yann";
  return (
    <div style={{ position: "absolute", left: L.safe.x, right: L.safe.x, top: L.capY + 22, display: "flex", justifyContent: "center", opacity: inK * (1 - outK), transform: `translateY(${(1 - inK) * 18 + outK * 10}px)`, pointerEvents: "none" }}>
      <div style={{ maxWidth: 1560, padding: "11px 26px", borderRadius: 18, background: rgba(act1 ? A1.ink : PB.green, 0.5), backdropFilter: "blur(10px)", textAlign: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 38, lineHeight: 1.18, letterSpacing: "-0.01em", color: "#FFFFFF", textShadow: `0 2px 10px ${rgba("#000000", 0.5)}` }}>
        {dialogue && <span style={{ display: "inline-block", marginRight: 16, padding: "3px 12px", borderRadius: 999, background: rgba("#FFFFFF", 0.14), fontSize: 22, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", verticalAlign: "middle", transform: "translateY(-3px)" }}>{WHO[line.who]}</span>}
        {tokens(line).map((tok, i) => {
          const k = prog(t, tok.at - 0.04, 0.16, SNAP);
          return (
            <span key={i} style={{ display: "inline-block", marginRight: "0.28em", opacity: 0.35 + 0.65 * k, color: tok.accent ? accent : "#FFFFFF", fontStyle: dialogue ? "italic" : "normal", transform: `translateY(${(1 - k) * 6}px)` }}>
              {tok.w}
            </span>
          );
        })}
      </div>
    </div>
  );
}
