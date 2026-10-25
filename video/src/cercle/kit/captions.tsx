import { prog, SNAP, POP, EXIT } from "../../presentation/motion/kit/ease";
import { JAKARTA, N, PB, rgba } from "./brand";
import { L } from "./layout";
import { tabAt } from "../timeline";
import MOTS from "../mots.json";

/* ==========================================================================
 * LE GRAND TEXTE DU HAUT ET LA BARRE D'ONGLETS — la signature du style de la vidéo de référence, posée par le film
 * AU-DESSUS des scènes (les scènes laissent libre la bande L.textTop → L.textBottom, 250 → 560 px).
 *
 *  - la phrase dite s'écrit mot à mot, au moment où chaque mot est dit (src/cercle/mots.json) ; elle reste jusqu'à la
 *    suivante (ou 0,5 s après la fin de la voix) ;
 *  - les mots entre *astérisques* du script sont SURLIGNÉS : une boîte citron se remplit derrière eux, texte vert profond ;
 *  - les répliques (« Il vous fallait autre chose ? », « Non merci. ») sont en italique, grises : on est à côté ;
 *  - la barre d'onglets LE COMPTOIR · LE PATIENT · L'APPLI · LE CERCLE (l'onglet en cours en citron) de 9,3 à 35,35 s.
 * ======================================================================== */

type Line = { at: number; end: number; caption: string; words: { w: string; at: number; end: number }[] };
const LINES = Object.entries(MOTS as Record<string, Line>).map(([id, l]) => ({ id, ...l })).sort((a, b) => a.at - b.at);

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
  const shown = captionTokens(line.caption).map((raw) => ({ w: raw.replace(/\*/g, ""), accent: raw.includes("*") }));
  const spoken = line.words;
  return shown.map((tok, i) => ({ ...tok, at: shown.length === spoken.length ? spoken[i].at : line.at + (i / shown.length) * (line.end - line.at) }));
}

const TABS = ["Le comptoir", "Le patient", "L'appli", "Le cercle"];

export function TopText({ t }: { t: number }) {
  const idx = LINES.findIndex((l, i) => t >= l.at - 0.1 && t < (LINES[i + 1]?.at ?? Infinity) - 0.1 && t <= l.end + 0.55);
  const line = idx >= 0 ? LINES[idx] : null;
  const tab = tabAt(t);
  const showTabs = t >= 9.3 && t < 35.35;
  const tabsK = prog(t, 9.3, 0.4, SNAP) * (1 - prog(t, 35.0, 0.35, EXIT));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: L.textTop, height: L.textBottom - L.textTop, pointerEvents: "none" }}>
      {showTabs && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, display: "flex", justifyContent: "center", gap: 34, opacity: tabsK, transform: `translateY(${(1 - tabsK) * -12}px)` }}>
          {TABS.map((name, i) => {
            const on = tab === i;
            return (
              <span key={name} style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 23, letterSpacing: "0.16em", textTransform: "uppercase", color: on ? PB.citron : rgba(N.white, 0.38), textShadow: on ? `0 0 18px ${rgba(PB.citron, 0.55)}` : "none" }}>
                {name}
              </span>
            );
          })}
        </div>
      )}
      {line && <Sentence t={t} line={line} italic={line.id.startsWith("D")} />}
    </div>
  );
}

function Sentence({ t, line, italic }: { t: number; line: Line; italic: boolean }) {
  const toks = tokens(line);
  const out = prog(t, line.end + 0.35, 0.2, EXIT);
  // Trois lignes au plus dans la bande du texte : les longues phrases s'écrivent plus petit.
  const len = line.caption.replace(/\*/g, "").length;
  const size = len > 64 ? 58 : len > 44 ? 64 : 74;
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top: 62, display: "flex", flexWrap: "wrap", justifyContent: "center", alignContent: "flex-start", rowGap: 6, columnGap: 0, opacity: 1 - out }}>
      {toks.map((tok, i) => {
        const k = prog(t, tok.at - 0.03, 0.18, POP);
        const box = prog(t, tok.at - 0.02, 0.16, SNAP);
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", margin: "0 0.12em", padding: tok.accent ? "0 0.14em" : 0, fontFamily: JAKARTA, fontWeight: 800, fontSize: size, lineHeight: 1.12, letterSpacing: "-0.035em", fontStyle: italic ? "italic" : "normal", color: tok.accent ? PB.ink : italic ? rgba(N.white, 0.72) : N.white, opacity: Math.min(1, k * 1.4), transform: `translateY(${(1 - k) * 22}px) scale(${0.86 + 0.14 * k})`, textShadow: tok.accent ? "none" : `0 4px 24px ${rgba("#000000", 0.6)}` }}>
            {tok.accent && <span style={{ position: "absolute", inset: "6% 0 4% 0", borderRadius: 12, background: PB.citron, transformOrigin: "left center", transform: `scaleX(${box})`, boxShadow: `0 0 30px ${rgba(PB.citron, 0.35)}`, zIndex: -1 }} />}
            {tok.w}
          </span>
        );
      })}
    </div>
  );
}
