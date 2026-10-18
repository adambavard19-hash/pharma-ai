import Link from "next/link";
import { CheckCircle2, Info } from "lucide-react";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import { LGPI_FILE_CONTENTS, OTHER_LGO_FILE_CONTENTS } from "./view";

/**
 * Ce que doit contenir le fichier de stock, selon le logiciel de gestion choisi par le titulaire à la configuration de son espace
 * (fondateur, 18 oct. 2026 : « pour l'instant on ne connaît que LGPI » — la procédure LGPI seulement à ceux qui ont LGPI ; aux
 * autres, leur logiciel, sans étapes inventées ; sans logiciel choisi, le lien pour le choisir).
 */
export function StockFileGuide({ lgo }: { lgo: string | null }) {
  const known = LGO_DEFINITIONS.find((definition) => definition.id === lgo) ?? null;
  if (!known) {
    return (
      <section data-stock-guide="aucun" className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5">
        <Info className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="text-[14px] leading-5 text-text-secondary">
          Indiquez d&apos;abord votre logiciel de gestion : PharmaBoost vous dira comment en sortir votre stock.{" "}
          <Link href="/bienvenue?etape=1" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Choisir mon logiciel</Link>
        </p>
      </section>
    );
  }
  const lgpi = known.id === "lgpi";
  const content = lgpi ? LGPI_FILE_CONTENTS : OTHER_LGO_FILE_CONTENTS(known.id === "autre" ? "votre logiciel" : known.label);
  return (
    <section aria-labelledby="contenu-fichier" data-stock-guide={known.id} className="rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5">
      <h2 id="contenu-fichier" className="text-[17px] leading-6 font-semibold text-text-primary">{content.title}</h2>
      <ul className="mt-3 space-y-2">
        {content.items.map((item) => (
          <li key={item} className="flex gap-2.5 text-[14px] leading-5 text-text-secondary">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-[13.5px] leading-5 text-text-primary">{content.how}</p>
      <p className="mt-2 text-[12.5px] text-text-tertiary">
        Pas le bon logiciel ? <Link href="/bienvenue?etape=1" className="underline underline-offset-2">Le changer</Link>
      </p>
    </section>
  );
}
