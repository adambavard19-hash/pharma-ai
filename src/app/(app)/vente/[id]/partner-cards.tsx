import Link from "next/link";
import { ArrowRight, Handshake } from "lucide-react";
import { universeLabel } from "@/config/universes";
import type { PartnerCardView } from "./types";

/**
 * « Gamme partenaire » : une petite carte à part, sous les conseils.
 *
 * Elle n'est PAS un conseil : le moteur ne l'a ni choisie ni classée, elle ne
 * s'ajoute pas à la délivrance et ne remplace aucune proposition. Elle signale
 * seulement qu'un laboratoire partenaire de PharmaBoost a une gamme dans
 * l'univers d'un besoin déjà retenu. Le pharmacien ouvre, ou pas.
 */
export function PartnerCards({ cards }: { cards: PartnerCardView[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="gammes-partenaires" className="space-y-2">
      <h3 id="gammes-partenaires" className="flex items-center gap-1.5 px-1 text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
        <Handshake className="size-3.5" />
        À découvrir · gamme partenaire
      </h3>
      <ul className="space-y-2">
        {cards.map((card) => (
          <li key={card.brandId} className="flex flex-col gap-3 rounded-xl border border-dashed border-border-default bg-surface-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {card.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo saisi par URL dans la console, domaine non connu à l'avance
                <img src={card.logoUrl} alt="" className="size-9 shrink-0 rounded-lg border border-border-subtle bg-white object-contain p-1" />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-[13px] font-semibold text-text-secondary">
                  {card.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-text-primary">
                  {card.name}
                  <span className="font-normal text-text-tertiary"> · {card.partnerName}</span>
                </p>
                <p className="text-[12.5px] leading-5 text-text-secondary">Une alternative existe dans cet univers : {universeLabel(card.universe).toLowerCase()}.</p>
              </div>
            </div>
            <Link
              href={`/partenaires/${card.slug}?from=comptoir&univers=${encodeURIComponent(card.universe)}`}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border-default px-3 py-1.5 text-[13px] font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-sunken sm:self-auto"
            >
              Voir la gamme
              <ArrowRight className="size-3.5" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[11.5px] leading-4 text-text-tertiary">
        Proposée par un laboratoire partenaire de PharmaBoost. Elle n&apos;entre jamais dans le choix des conseils ci-dessus.
      </p>
    </section>
  );
}
