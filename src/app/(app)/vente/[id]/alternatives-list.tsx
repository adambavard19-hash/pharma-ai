"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { chooseAdviceAlternativeAction } from "@/server/actions/recommendations";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductVisual, StockBadge } from "./advice-zone";
import type { AdviceAlternativeView } from "./types";

/**
 * Ce que le pharmacien lit après avoir choisi une autre référence : le message
 * de l'action telle quelle, jamais une confirmation inventée.
 */
export async function chooseAlternative(
  recommendationId: string,
  productId: string,
): Promise<{ tone: "success" | "error"; title: string }> {
  const result = await chooseAdviceAlternativeAction({ recommendationId, productId });
  return result.ok
    ? { tone: "success", title: result.message ?? "Conseil remplacé" }
    : { tone: "error", title: result.error };
}

/**
 * « Autres références possibles » : les autres produits du stock, adaptés au
 * même besoin que le conseil ci-dessus.
 *
 * Le moteur les a déjà passés au même crible que le conseil retenu (sécurité,
 * contre-indications déclarées, vigilances, stock) ; ici on ne les classe ni
 * ne les filtre. Elles n'ont ni score ni marge : le choix se fait sur le produit,
 * son prix et son stock. Choisir une référence la met à la place du conseil ; la
 * délivrance, elle, reste le geste de la carte principale.
 *
 * Sur un écran étroit, seule la première référence se lit d'emblée, les autres
 * se déplient ; sur grand écran, toutes sont visibles.
 */
export function AlternativesList({
  recommendationId,
  alternatives,
}: {
  recommendationId: string;
  alternatives: AdviceAlternativeView[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  if (alternatives.length === 0) {
    return <p className="px-1 text-[12.5px] leading-5 text-text-tertiary">Aucune autre référence adaptée en stock.</p>;
  }

  const choose = (productId: string) => {
    setChosen(productId);
    startTransition(async () => {
      push(await chooseAlternative(recommendationId, productId));
      router.refresh();
    });
  };

  const others = alternatives.length - 1;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Autres références possibles</p>
        <p className="text-[12.5px] leading-5 text-text-tertiary">Choisir une référence la met à la place du conseil ci-dessus, sans l&apos;ajouter à la délivrance.</p>
      </div>

      <ul className="space-y-1.5">
        {alternatives.map((alternative, index) => (
          <li
            key={alternative.productId}
            className={cn(
              "flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-subtle bg-surface-card px-3 py-2.5",
              index === 0 || expanded ? "flex" : "hidden sm:flex",
            )}
          >
            <ProductVisual product={alternative} size={44} />
            <div className="min-w-0 flex-1 basis-44">
              <p className="text-[14px] leading-5 font-medium text-text-primary">{alternative.name}</p>
              {(alternative.brand || alternative.shortReason) && (
                <p className="line-clamp-2 text-[12.5px] leading-4 text-text-secondary">
                  {[alternative.brand, alternative.shortReason].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              {alternative.salePriceCents > 0 ? (
                <span className="text-[15px] font-semibold tabular text-text-primary">{formatCents(alternative.salePriceCents)}</span>
              ) : (
                <span className="text-[12.5px] font-medium text-warning-700 dark:text-warning-400">Prix à renseigner</span>
              )}
              <StockBadge quantity={alternative.quantity} low={false} />
            </span>
            <Button
              size="sm"
              variant="outline"
              loading={pending && chosen === alternative.productId}
              disabled={pending}
              onClick={() => choose(alternative.productId)}
              aria-label={`Choisir celle-ci : ${alternative.name}`}
            >
              Choisir celle-ci
            </Button>
          </li>
        ))}
      </ul>

      {others > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex items-center gap-1 px-1 text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary sm:hidden"
        >
          {expanded ? "Replier" : `Voir ${others} autre${others > 1 ? "s" : ""} référence${others > 1 ? "s" : ""}`}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
