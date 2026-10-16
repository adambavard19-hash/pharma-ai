"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { saveCureDurationAction } from "@/server/actions/admin-cure-durations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type Family = { category: string; label: string; days: number | null };
type ProductRow = { key: string; label: string; days: number };

/**
 * Les durées de cure (17 oct. 2026) : elles décident du jour du rappel envoyé au patient, sept jours avant la fin de sa cure.
 * Pour un produit, dans cet ordre : sa durée réglée ici, sinon le nombre de prises lu sur sa boîte (« 30 gélules » = 30 jours),
 * sinon la durée de sa famille réglée ici. Vaut pour toutes les pharmacies.
 */
export function CureDurations({ families, products }: { families: Family[]; products: ProductRow[] }) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(families.map((family) => [family.category, family.days ? String(family.days) : ""])));
  const [ean, setEan] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("");

  const save = (payload: unknown, after?: () => void) =>
    start(async () => {
      const result = await saveCureDurationAction(payload);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
      if (result.ok) after?.();
    });
  const asDays = (value: string) => (value.trim() === "" ? null : Number(value));

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-card p-5" aria-labelledby="durees-cure" data-durees-cure="">
      <h2 id="durees-cure" className="text-[16px] font-semibold text-text-primary">Durées de cure</h2>
      <p className="mt-1 max-w-3xl text-[13px] leading-5 text-text-secondary">
        Quand un complément en cure est vendu à un patient qui reçoit son bilan par e-mail, PharmaBoost lui envoie un rappel sept jours avant la fin de sa cure. La durée vient d&apos;abord du produit (réglée ci-dessous), sinon de sa boîte (« 30 gélules » = 30 jours, une prise par jour), sinon de sa famille. Une cure de moins de 14 jours n&apos;a pas de rappel.
      </p>

      <h3 className="mt-5 text-[13px] font-semibold tracking-wide text-text-tertiary uppercase">Par famille</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {families.map((family) => (
          <form
            key={family.category}
            className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              save({ kind: "family", category: family.category, days: asDays(draft[family.category] ?? "") });
            }}
          >
            <span className="min-w-0 flex-1 text-[13.5px] text-text-primary">{family.label}</span>
            <Input aria-label={`Durée de cure, ${family.label}`} inputMode="numeric" className="w-20" value={draft[family.category] ?? ""} placeholder="—" onChange={(event) => setDraft({ ...draft, [family.category]: event.target.value.replace(/\D/g, "").slice(0, 3) })} />
            <span className="text-[12.5px] text-text-tertiary">jours</span>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              OK
            </Button>
          </form>
        ))}
      </div>

      <h3 className="mt-6 text-[13px] font-semibold tracking-wide text-text-tertiary uppercase">Pour un produit précis</h3>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save({ kind: "product", ean, label, days: asDays(days) }, () => {
            setEan("");
            setLabel("");
            setDays("");
          });
        }}
      >
        <Input aria-label="Code-barres du produit" placeholder="Code-barres (EAN)" inputMode="numeric" className="w-44" value={ean} onChange={(event) => setEan(event.target.value.replace(/\D/g, "").slice(0, 14))} />
        <Input aria-label="Nom du produit" placeholder="Nom du produit" className="w-72" value={label} onChange={(event) => setLabel(event.target.value.slice(0, 120))} />
        <Input aria-label="Durée de cure en jours" placeholder="Jours (0 = pas de rappel)" inputMode="numeric" className="w-48" value={days} onChange={(event) => setDays(event.target.value.replace(/\D/g, "").slice(0, 3))} />
        <Button type="submit" size="sm" disabled={pending || !ean || days === ""}>
          Enregistrer
        </Button>
      </form>
      {products.length === 0 ? (
        <p className="mt-3 text-[13px] text-text-tertiary">Aucune durée propre à un produit pour l&apos;instant.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {products.map((product) => (
            <li key={product.key} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
              <span className="min-w-0 flex-1 text-text-primary">{product.label}</span>
              <span className="font-mono text-[12px] text-text-tertiary">{product.key.replace("EAN:", "")}</span>
              <span className="w-28 text-right font-semibold text-text-primary tabular-nums">{product.days === 0 ? "pas de rappel" : `${product.days} jours`}</span>
              <button type="button" aria-label={`Retirer la durée de ${product.label}`} className="rounded-md p-1 text-text-tertiary hover:bg-surface-sunken hover:text-danger-600" disabled={pending} onClick={() => save({ kind: "product", ean: product.key.replace("EAN:", ""), label: product.label, days: null })}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
