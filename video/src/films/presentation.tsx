import type { FilmSpec } from "../FilmShell";
import { COMPTOIR_FRAMES, COMPTOIR_SCANS, Comptoir } from "../scenes/comptoir";
import { Bilan, PROMESSE_FRAMES, Promesse, Security } from "../scenes/site";
import { C } from "../theme";
import { words } from "../ui/kinetic";
import { EndCard } from "../ui/common";
import { PLANS } from "../ui/panels";

/**
 * La présentation du site (haut de l'accueil) : trois questions (« Et si
 * chaque délivrance révélait tout son potentiel de conseil ? »…) et
 * « PharmaBoost, oui. » → au comptoir, on scanne comme d'habitude ; la
 * bannière passe de « En attente de scan… » à « 2 conseils disponibles »,
 * s'ouvre sur les conseils, le pharmacien répond « Vendu » / « Non vendu »,
 * ajoute l'e-mail du patient avec son accord, « Vente terminée ! » → « Ou,
 * depuis l'écran de vente : son plan conseil complet », sur la même ordonnance
 * (la bannière n'envoie que le bilan des produits vendus, jamais la posologie)
 * → la sécurité → « Scan. Conseil. Bilan. ».
 * 120 BPM, 24 mesures : 48 s.
 */
function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Scan. Conseil. *Bilan.*", C.brand300)]} />;
}

/** Le plan de l'ordonnance que la bannière vient de clore (AMOXICILLINE 1 g + VALACICLOVIR 500 mg). */
function Plan({ intro }: { intro: number }) {
  return <Bilan intro={intro} plan={PLANS.ordonnance} />;
}

const COUNTER = PROMESSE_FRAMES;
const BILAN = COUNTER + COMPTOIR_FRAMES;

export const PRESENTATION: FilmSpec = {
  scenes: [
    { C: Promesse, at: 0 },
    { C: Comptoir, at: COUNTER },
    { C: Plan, at: BILAN },
    { C: Security, at: BILAN + 216 },
    { C: End, at: BILAN + 432 },
  ],
  end: BILAN + 648,
  overlap: 18,
  speed: 1.2,
  music: "music/presentation.wav",
  // La musique s'efface un instant sous le son de chaque scan (posé dans la scène).
  duck: COMPTOIR_SCANS.map((s) => COUNTER + s),
  cues: [{ at: BILAN - 16, name: "whoosh", volume: 0.55 }],
};
