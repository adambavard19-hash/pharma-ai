"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Search, Star, X } from "lucide-react";
import { createPharmacyRuleAction, deletePharmacyRuleAction } from "@/server/actions/recommendations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type BrandRow = {
  brand: string;
  references: number;
  inStock: number;
  mode: "none" | "prefer" | "exclude";
  ruleId: string | null;
};

/**
 * La liste des marques, un état par ligne, deux gestes.
 *
 * « Mettre en avant » et « Écarter » écrivent la règle d'officine
 * correspondante ; recliquer la retire. Le titulaire voit d'un coup d'œil ce
 * qu'il a choisi, en tête de liste, et retrouve n'importe quelle marque par
 * la recherche.
 */
export function BrandsManager({ rows }: { rows: BrandRow[] }) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const list = needle ? rows.filter((row) => row.brand.includes(needle)) : rows;
    // Les marques réglées d'abord, puis par nombre de références.
    return [...list].sort((a, b) => Number(b.mode !== "none") - Number(a.mode !== "none") || b.references - a.references);
  }, [rows, query]);

  const setMode = (row: BrandRow, mode: "none" | "prefer" | "exclude") => {
    setBusy(row.brand);
    start(async () => {
      let result: { ok: boolean; error?: string; message?: string } = { ok: true };
      if (row.ruleId) result = await deletePharmacyRuleAction(row.ruleId);
      if (result.ok && mode !== "none") {
        result = await createPharmacyRuleAction({ type: mode === "prefer" ? "PREFER_BRAND" : "EXCLUDE_BRAND", brand: row.brand });
      }
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (mode === "prefer" ? `${row.brand} mis en avant.` : mode === "exclude" ? `${row.brand} écarté.` : `${row.brand} : préférence retirée.`) : (result.error ?? "Erreur"),
      });
      setBusy(null);
      router.refresh();
    });
  };

  const addCustom = () => {
    const brand = custom.trim().toUpperCase();
    if (!brand) return;
    setMode({ brand, references: 0, inStock: 0, mode: "none", ruleId: null }, "prefer");
    setCustom("");
  };

  const preferred = rows.filter((row) => row.mode === "prefer").length;
  const excluded = rows.filter((row) => row.mode === "exclude").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une marque de votre stock…" className="pl-9" aria-label="Rechercher une marque" />
        </div>
        <p className="text-[13px] text-text-secondary">
          {rows.length} marques · <span className="font-medium text-success-800 dark:text-success-300">{preferred} mise{preferred > 1 ? "s" : ""} en avant</span> · <span className="font-medium text-danger-700 dark:text-danger-300">{excluded} écartée{excluded > 1 ? "s" : ""}</span>
        </p>
      </div>

      <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface-card">
        {visible.length === 0 && <li className="px-4 py-6 text-center text-[13.5px] text-text-tertiary">Aucune marque ne correspond.</li>}
        {visible.map((row) => (
          <li key={row.brand} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", row.mode === "prefer" && "bg-success-50/40 dark:bg-success-950/15", row.mode === "exclude" && "bg-danger-50/30 dark:bg-danger-950/15")}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
                {row.mode === "prefer" && <Star className="size-4 text-success-700 dark:text-success-400" />}
                {row.mode === "exclude" && <Ban className="size-4 text-danger-700 dark:text-danger-400" />}
                {row.brand}
              </p>
              <p className="text-[12px] text-text-tertiary">
                {row.references > 0 ? `${row.references} référence${row.references > 1 ? "s" : ""} · ${row.inStock} en rayon` : "plus au stock"}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant={row.mode === "prefer" ? "primary" : "outline"} loading={pending && busy === row.brand} leadingIcon={<Star className="size-3.5" />} onClick={() => setMode(row, row.mode === "prefer" ? "none" : "prefer")}>
                {row.mode === "prefer" ? "Mise en avant" : "Mettre en avant"}
              </Button>
              <Button size="sm" variant={row.mode === "exclude" ? "danger" : "outline"} loading={pending && busy === row.brand} leadingIcon={row.mode === "exclude" ? <X className="size-3.5" /> : <Ban className="size-3.5" />} onClick={() => setMode(row, row.mode === "exclude" ? "none" : "exclude")}>
                {row.mode === "exclude" ? "Écartée" : "Écarter"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border-default px-4 py-3">
        <p className="min-w-0 flex-1 text-[13px] text-text-secondary">Une marque absente de la liste ? Ajoutez-la telle qu&apos;elle apparaît sur vos étiquettes.</p>
        <Input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="LA ROCHE-POSAY" className="w-56" aria-label="Marque à ajouter" onKeyDown={(event) => { if (event.key === "Enter") addCustom(); }} />
        <Button size="sm" variant="outline" leadingIcon={<Star className="size-3.5" />} onClick={addCustom} disabled={!custom.trim()} loading={pending && busy === custom.trim().toUpperCase()}>
          Mettre en avant
        </Button>
      </div>

      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Comment ça pèse : entre deux références jugées cliniquement équivalentes, la marque mise en avant sort en premier et une routine se compose dans sa gamme. Une marque écartée n&apos;est jamais proposée. Rien ne fait passer une référence moins adaptée devant une meilleure.
      </p>
    </div>
  );
}
