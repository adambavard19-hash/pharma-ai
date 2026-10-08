import { SCORE_WEIGHTS, DIMENSION_LABELS } from "@/core/ai/engines/scoring";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/feedback";

/**
 * Comment le moteur décide : l'ordre des étapes et les dimensions du score. Écrit pour la pharmacienne qui relit les conseils,
 * dans la console de PharmaBoost — les titulaires n'ont plus à lire le fonctionnement du moteur.
 */
export function HowItWorks() {
  const dimensions = (Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).sort(
    (a, b) => SCORE_WEIGHTS[b] - SCORE_WEIGHTS[a],
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="L'ordre des étapes"
          description="Chaque étape ne reçoit que la sortie de la précédente : une considération commerciale ne peut donc pas influencer la sécurité."
        />
        <CardContent>
          <ol className="space-y-3">
            {PIPELINE_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[12px] font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[13.5px] font-medium text-text-primary">{step.title}</p>
                  <p className="text-[12.5px] leading-5 text-text-secondary">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Les dimensions du score"
          description="Un score explicable, jamais une boîte noire."
        />
        <CardContent>
          <ul className="space-y-3">
            {dimensions.map((dimension) => (
              <li key={dimension} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-text-primary">
                    {DIMENSION_LABELS[dimension]}
                  </span>
                  <span className="text-[12.5px] tabular text-text-tertiary">
                    poids {Math.round(SCORE_WEIGHTS[dimension] * 100)} %
                  </span>
                </div>
                <Progress
                  value={SCORE_WEIGHTS[dimension]}
                  max={0.4}
                  tone={dimension === "commercial" ? "accent" : "brand"}
                  label={DIMENSION_LABELS[dimension]}
                />
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border-subtle pt-3 text-[12px] leading-5 text-text-secondary">
            La dimension commerciale pèse {Math.round(SCORE_WEIGHTS.commercial * 100)} % du score.
            Elle ne peut départager que deux références déjà jugées cliniquement équivalentes.
            Un produit écarté pour raison de sécurité obtient un score total nul, quel que soit
            le reste.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const PIPELINE_STEPS = [
  {
    title: "Sécurité",
    body: "Contrôle de l'extraction, couverture du référentiel, contre-indications déclarées, interactions documentées. Un signal bloquant écarte définitivement une piste.",
  },
  {
    title: "Compréhension du traitement",
    body: "Reformulation de ce que dit le référentiel médicamenteux — jamais un fait inventé. En l'absence d'information, aucune explication n'est produite.",
  },
  {
    title: "Pertinence",
    body: "Identification des opportunités de conseil, sans aucun accès au catalogue. On détermine d'abord ce qui serait utile, pas ce qui est disponible.",
  },
  {
    title: "Appariement avec le stock",
    body: "Recherche des références de votre officine correspondant à l'opportunité, en excluant celles en rupture et celles écartées pour raison de sécurité.",
  },
  {
    title: "Classement explicable",
    body: "Score multi-dimensionnel : chaque contribution est conservée et restituée au pharmacien.",
  },
  {
    title: "Optimisation commerciale autorisée",
    body: "Dernière étape, périmètre restreint : départager deux références cliniquement équivalentes et limiter le nombre de propositions. Rien d'autre.",
  },
];
