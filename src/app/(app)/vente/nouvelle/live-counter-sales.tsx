"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Barcode } from "lucide-react";
import { formatTime } from "@/lib/format";

export type LiveSale = {
  id: string;
  reference: string;
  status: string;
  post: string | null;
  updatedAt: string;
  lines: { drugName: string; quantity: number }[];
  recommendations: number;
};

/**
 * Les délivrances qui arrivent de la douchette du LGO, en direct.
 *
 * L'écran d'accueil est le second écran du comptoir : il interroge le serveur
 * toutes les deux secondes et affiche la vente en cours dès le premier bip.
 * Une vente qui vient de recevoir un bip s'ouvre d'elle-même, pour que le
 * conseil soit visible sans clic.
 */
export function LiveCounterSales({ initial }: { initial: LiveSale[] }) {
  const [sales, setSales] = useState(initial);
  const openedRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/comptoir/en-cours", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { sales: LiveSale[] };
        if (active) setSales(body.sales);
      } catch {
        // Une interruption réseau n'a rien à afficher : la prochaine lecture reprendra.
      }
    };
    const id = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Un bip reçu il y a moins de dix secondes sur une vente à confirmer :
  // on l'ouvre. Une seule fois par vente, pour ne pas voler l'écran.
  useEffect(() => {
    const fresh = sales.find((sale) => sale.status === "NEEDS_VERIFICATION" && Date.now() - new Date(sale.updatedAt).getTime() < 10_000);
    if (fresh && fresh.id !== openedRef.current) {
      openedRef.current = fresh.id;
      router.push(`/vente/${fresh.id}`);
    }
  }, [sales, router]);

  if (sales.length === 0) return null;
  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/20">
      <div className="flex items-center gap-2 px-5 py-3">
        <Barcode className="size-4 text-brand-700 dark:text-brand-300" />
        <h2 className="text-[14px] font-semibold text-text-primary">Douchette : ventes en cours</h2>
        <span className="ml-auto text-[12px] text-text-tertiary">mise à jour automatique</span>
      </div>
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {sales.map((sale) => (
          <li key={sale.id}>
            <Link href={`/vente/${sale.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-card">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-text-primary">
                  {sale.lines.map((line) => `${line.quantity > 1 ? `${line.quantity} × ` : ""}${line.drugName}`).join(" · ")}
                </span>
                <span className="block text-[12.5px] text-text-secondary">
                  {sale.post ? `Poste ${sale.post} · ` : ""}{formatTime(sale.updatedAt)} · {sale.status === "NEEDS_VERIFICATION" ? "à confirmer" : sale.status === "ANALYZED" ? `${sale.recommendations} conseil${sale.recommendations > 1 ? "s" : ""}` : "analyse en cours"} · {sale.reference}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
