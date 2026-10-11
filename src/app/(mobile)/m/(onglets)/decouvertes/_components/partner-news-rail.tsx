import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { PartnerNewsItem } from "@/server/services/mobile/discover-home";
import { QuietState, SectionTitle } from "../../../_components/ui";
import { CommercialBadge, Rail } from "./cards";
import { SponsoredImpression } from "./sponsored-tracker";

/**
 * « Nouveautés partenaires » de l'accueil : campagnes (« Sponsorisé », comptées) puis nouveautés des marques
 * (« Partenaire »). Vide : un état calme, jamais de carte factice.
 */
export function PartnerNewsRail({ items }: { items: PartnerNewsItem[] }) {
  return (
    <>
      <SectionTitle title="Nouveautés partenaires" action={items.length > 0 ? { href: "/m/decouvertes", label: "Découvrir" } : undefined} />
      {items.length > 0 ? (
        <Rail label="Nouveautés partenaires">
          {items.map((item) => {
            const card = (
              <Link
                href={item.href}
                className="block h-full overflow-hidden rounded-[20px] border border-white/70 bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.985]"
              >
                <span className="relative block aspect-[16/10] overflow-hidden bg-[linear-gradient(135deg,var(--color-brand-100),var(--color-brand-50))]">
                  {item.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- visuel fourni par le partenaire, domaine non connu à l'avance
                    <img src={item.posterUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-brand-600/60" aria-hidden="true">
                      <Sparkles className="size-8" />
                    </span>
                  )}
                  <span className="absolute top-3 left-3">
                    <CommercialBadge kind={item.label} onImage />
                  </span>
                </span>
                <span className="block space-y-1 px-4 pt-3 pb-4">
                  <span className="block truncate text-[12px] font-semibold text-brand-700">{item.brandName}</span>
                  <span className="line-clamp-2 block text-[15px] leading-snug font-semibold text-ink-900">{item.title}</span>
                </span>
              </Link>
            );
            return (
              <div key={item.key} role="listitem" className="w-[78%] max-w-[300px] shrink-0 snap-start">
                {item.sponsored ? (
                  <SponsoredImpression campaignId={item.sponsored.campaignId} placement={item.sponsored.placement} className="h-full">
                    {card}
                  </SponsoredImpression>
                ) : (
                  card
                )}
              </div>
            );
          })}
        </Rail>
      ) : (
        <QuietState
          compact
          icon={<Sparkles className="size-6" aria-hidden="true" />}
          title="Rien de neuf pour l'instant"
          body="Les lancements et les informations des laboratoires partenaires, vérifiés avant publication, s'afficheront ici."
        />
      )}
    </>
  );
}
