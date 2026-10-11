import type { FilmSpec } from "../FilmShell";
import { AlertePlan, ConseilsPlan, MailPlan, QuestionPlan, SCAN_SCANS, ScanPlan } from "../scenes/comptoir";
import { Bilan, Examples, stepCard } from "../scenes/site";
import { C } from "../theme";
import { words } from "../ui/kinetic";
import { EndCard } from "../ui/common";
import { PLANS } from "../ui/panels";

/**
 * « Comment ça marche » : les trois étapes du site, mêmes titres
 * (src/app/(public)/decouvrir/page.tsx, STEPS), annoncées une à une.
 * 01 Vous scannez les boîtes (la bannière attend, puis « Scan détecté ! »)
 * → 02 La bannière propose (« 2 conseils disponibles », Vendu / Non vendu ; la
 * question avant le produit ; la mise en garde « 3 g de paracétamol » ; les
 * exemples du site) → 03 Le patient repart avec ses conseils (son bilan par
 * e-mail, avec son accord ; puis, depuis l'écran de vente, le plan conseil
 * complet de la MÊME ordonnance — la bannière n'envoie jamais de posologie).
 * 136 BPM, 25 mesures : 44 s.
 */
function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Du scan au conseil,"), words("*en trois étapes.*", C.brand300)]} />;
}

function ExamplesShort({ intro }: { intro: number }) {
  return <Examples intro={intro} len={126} />;
}
/** Le plan de l'ordonnance que la bannière vient de clore (AMOXICILLINE 1 g + VALACICLOVIR 500 mg). */
function PlanShort({ intro }: { intro: number }) {
  return <Bilan intro={intro} len={180} plan={PLANS.ordonnance} />;
}

const SCAN = 90;

export const COMMENT: FilmSpec = {
  scenes: [
    { C: stepCard("01", "Vous scannez les boîtes", 90, "Comment ça marche"), at: 0 },
    { C: ScanPlan, at: SCAN },
    { C: stepCard("02", "La bannière propose", 90), at: 270 },
    { C: ConseilsPlan, at: 360 },
    { C: QuestionPlan, at: 648 },
    { C: AlertePlan, at: 864 },
    { C: ExamplesShort, at: 1008 },
    { C: stepCard("03", "Le patient repart avec ses conseils", 90), at: 1134 },
    { C: MailPlan, at: 1224 },
    { C: PlanShort, at: 1404 },
    { C: End, at: 1584 },
  ],
  end: 1800,
  overlap: 18,
  speed: 1.36,
  music: "music/comment.wav",
  duck: SCAN_SCANS.map((s) => SCAN + s),
  cues: [
    { at: 630, name: "whoosh", volume: 0.5 },
    { at: 846, name: "whoosh", volume: 0.5 },
    { at: 1386, name: "whoosh", volume: 0.5 },
  ],
};
