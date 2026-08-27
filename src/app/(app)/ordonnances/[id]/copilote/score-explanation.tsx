import { Progress } from "@/components/ui/feedback";
import type { ScoreContribution } from "@/core/ai/types";

/**
 * « Pourquoi Pharma.ai me propose ce produit ? »
 *
 * Le score n'est pas une boîte noire : chaque dimension est affichée avec sa
 * valeur, son poids et le détail qui l'a produite. Le poids indique aussi
 * l'ordre de priorité — la dimension commerciale est la plus faible du modèle.
 */
export function ScoreExplanation({
  contributions,
  justification,
}: {
  contributions: ScoreContribution[];
  justification: string;
}) {
  if (contributions.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 px-3.5 py-3">
        <p className="text-[12.5px] leading-5 text-text-secondary">{justification}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-surface-sunken/50 px-3.5 py-3.5">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">
          Pourquoi ce produit
        </p>
        <p className="text-[12.5px] leading-5 text-text-secondary">{justification}</p>
      </div>

      <ul className="space-y-2.5">
        {contributions.map((contribution) => (
          <li key={contribution.dimension} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-medium text-text-primary">
                {contribution.label}
              </span>
              <span className="shrink-0 text-[11.5px] text-text-tertiary tabular">
                {Math.round(contribution.value * 100)} % · poids{" "}
                {Math.round(contribution.weight * 100)} %
              </span>
            </div>
            <Progress
              value={contribution.value}
              tone={
                contribution.dimension === "commercial"
                  ? "accent"
                  : contribution.dimension === "safety"
                    ? "success"
                    : "brand"
              }
              label={contribution.label}
            />
            <p className="text-[11.5px] leading-4 text-text-tertiary">{contribution.detail}</p>
          </li>
        ))}
      </ul>

      <p className="border-t border-border-subtle pt-2.5 text-[11.5px] leading-4 text-text-tertiary">
        La sécurité et la pertinence dominent le classement. La dimension commerciale, plafonnée
        à 2 % du score, ne sert qu&apos;à départager deux références cliniquement équivalentes —
        jamais à faire remonter une proposition moins appropriée.
      </p>
    </div>
  );
}
