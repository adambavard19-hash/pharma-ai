import { AbsoluteFill } from "remotion";
import { F, clamp01 } from "./ease";
import { JAKARTA } from "./fonts";

/* ==========================================================================
 * MENTION « Illustration · exemples » — posée PAR L'ORCHESTRATEUR, de P7.start − 0,3 à P14.end + 0,3, fondus de
 * 8 images (prix, stocks et challenges des écrans sont des exemples).
 *
 * Coin HAUT DROIT (droite 56, haut 40) — c'est la consigne donnée aux développeurs de scènes ; la direction écrivait
 * « bas gauche », trop près de la bande des sous-titres. Pour la déplacer : MENTION_POS ci-dessous, rien d'autre.
 *   <Mention t from to />      Jakarta 600, 22 px, blanc à 55 %
 * Les scènes S6 à S10 gardent libre le rectangle x > 1600, y < 90.
 * ======================================================================== */

export const MENTION_POS = { right: 56, top: 40 } as const;
export const MENTION_TEXT = "Illustration · exemples";

export function Mention({ t, from, to }: { t: number; from: number; to: number }) {
  const fade = 8 * F;
  const o = Math.min(clamp01((t - from) / fade), clamp01((to - t) / fade));
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", ...MENTION_POS, fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: "rgba(255,255,255,.55)", opacity: o, letterSpacing: "0.01em", textShadow: "0 1px 6px rgba(0,0,0,.45)" }}>{MENTION_TEXT}</div>
    </AbsoluteFill>
  );
}
