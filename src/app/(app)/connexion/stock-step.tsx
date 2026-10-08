import Link from "next/link";
import { Boxes, Upload } from "lucide-react";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { BIG_BUTTON, SetupCard } from "./setup-card";

/**
 * Étape 2 — « Envoyer mon stock » : un gros bouton, l'état du dernier import, un petit guide LGPI.
 *
 * Le bouton ouvre le parcours « Mettre à jour mon stock » (choisir le fichier, vérifier, confirmer) : un seul chemin
 * pour toute l'application, avec ses contrôles (fichier incomplet, produits qui passeraient à 0). Cet écran ne lit
 * aucun fichier lui-même.
 */

type Stock = OverviewSnapshot["overview"]["stock"];

export function StockStep({ stock }: { stock: Stock }) {
  return (
    <SetupCard icon={Boxes} title="2. Envoyer mon stock" badge={stock.state === "FRESH" ? <Badge tone="success">À jour</Badge> : undefined}>
      <StockSendBody stock={stock} />
    </SetupCard>
  );
}

/** Le contenu de l'étape, sans son cadre : il sert aussi à l'accueil d'une nouvelle officine. */
export function StockSendBody({ stock }: { stock: Stock }) {
  const aged = stock.state === "OLD";
  return (
    <>
      <p className="text-[15px] leading-6 text-text-secondary">Choisissez le fichier exporté de votre logiciel de pharmacie. PharmaBoost le vérifie avec vous avant de mettre votre stock à jour.</p>

      {stock.state !== "NONE" && stock.productCount !== null && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-subtle bg-surface-sunken/60 px-4 py-3">
          <span className="min-w-0 flex-1 basis-40">
            <span className="block text-[16px] leading-6 font-medium text-text-primary">
              {formatNumber(stock.productCount)} produit{stock.productCount > 1 ? "s" : ""}
            </span>
            <span className="block text-[12.5px] leading-5 text-text-secondary">
              Dernier import : {stock.receivedLabel}
              {stock.ignored !== null && stock.ignored > 0 && <> · {formatNumber(stock.ignored)} ligne{stock.ignored > 1 ? "s" : ""} illisible{stock.ignored > 1 ? "s" : ""} ignorée{stock.ignored > 1 ? "s" : ""}</>}
            </span>
          </span>
          <Badge tone={aged ? "warning" : "success"}>{aged ? `Ancien · ${stock.ageDays ?? 0} jour${(stock.ageDays ?? 0) > 1 ? "s" : ""}` : "À jour"}</Badge>
        </div>
      )}

      {stock.problem && (
        <Alert tone="warning" title="Dernier fichier non appliqué">
          {stock.problem}
        </Alert>
      )}

      <Button asChild size="xl" variant="outline" className={BIG_BUTTON} leadingIcon={<Upload className="size-5" />}>
        <Link href="/stock/mise-a-jour">Envoyer mon stock</Link>
      </Button>

      <Link href="/connexion/guide?logiciel=lgpi" className="inline-block text-[13.5px] font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-400">
        Comment récupérer mon stock dans LGPI ?
      </Link>
    </>
  );
}
