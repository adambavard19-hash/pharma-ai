"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { saveAdvicePrioritiesAction } from "@/server/actions/admin-central-advice";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Rule = { key: string; title: string; kind: string; ranked: boolean };
type Family = { code: string; label: string; rules: Rule[]; customized: boolean; defaultOrder: string[] };

const KIND_LABELS: Record<string, string> = { SAFETY: "Sécurité", TOLERANCE: "Tolérance", COMFORT: "Confort", PREVENTION: "Prévention" };

/**
 * Le classement des conseils par famille de médicaments (fondateur, 26 oct. 2026) : on choisit la famille, on range les conseils
 * — règle 1, règle 2, règle 3 — avec les flèches, on enregistre. Vaut pour toutes les pharmacies dès la vente suivante.
 */
export function PriorityBoard({ families }: { families: Family[] }) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(families[0]?.code ?? "");
  const family = families.find((item) => item.code === code) ?? families[0];
  const [orders, setOrders] = useState<Record<string, string[]>>(() => Object.fromEntries(families.map((item) => [item.code, item.rules.map((rule) => rule.key)])));
  const order = useMemo(() => (family ? (orders[family.code] ?? family.rules.map((rule) => rule.key)) : []), [family, orders]);
  if (!family) return <p className="text-sm text-text-secondary">Aucune famille de médicaments n&apos;a de conseil pour l&apos;instant.</p>;

  const byKey = new Map(family.rules.map((rule) => [rule.key, rule]));
  const initial = family.rules.map((rule) => rule.key);
  const changed = order.join("|") !== initial.join("|");

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrders((current) => ({ ...current, [family.code]: next }));
  };

  const save = (ruleKeys: string[]) =>
    start(async () => {
      const result = await saveAdvicePrioritiesAction({ code: family.code, ruleKeys });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
      // Retour à l'ordre de PharmaBoost : la liste le montre aussitôt.
      if (result.ok && ruleKeys.length === 0) setOrders((current) => ({ ...current, [family.code]: family.defaultOrder }));
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <nav aria-label="Familles de médicaments" className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-surface-card p-2 lg:max-h-[70vh] lg:overflow-y-auto">
        {families.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => setCode(item.code)}
            aria-current={item.code === family.code ? "true" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors",
              item.code === family.code ? "bg-brand-50 font-semibold text-text-primary" : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
            )}
          >
            <span>{item.label}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-text-tertiary tabular-nums">
              {item.customized && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">Votre ordre</span>}
              {item.rules.length}
            </span>
          </button>
        ))}
      </nav>

      <section className="rounded-xl border border-border-subtle bg-surface-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold text-text-primary">{family.label}</h2>
            <p className="text-[13px] text-text-secondary">
              {family.customized ? "Ordre choisi par vous." : "Ordre de PharmaBoost, tant que vous n'en choisissez pas un autre."} La règle 1 passe en premier au comptoir.
            </p>
          </div>
          <div className="flex gap-2">
            {family.customized && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => save([])} leadingIcon={<RotateCcw className="size-3.5" />}>
                Ordre de PharmaBoost
              </Button>
            )}
            <Button size="sm" disabled={pending || (!changed && family.customized)} onClick={() => save(order)}>
              Enregistrer cet ordre
            </Button>
          </div>
        </div>

        <div className="mb-2 rounded-lg border border-dashed border-warning-300 bg-warning-50 px-3 py-2 text-[12.5px] text-text-secondary">
          Une campagne de surstock lancée par une pharmacie passe toujours devant ces règles, dans cette pharmacie.
        </div>

        <ol className="flex flex-col gap-1.5">
          {order.map((key, index) => {
            const rule = byKey.get(key);
            if (!rule) return null;
            return (
              <li key={key} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-page px-3 py-2">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums", index === 0 ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-primary")}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-text-primary">Règle {index + 1} · {rule.title}</p>
                  <p className="text-[11.5px] text-text-tertiary">{KIND_LABELS[rule.kind] ?? rule.kind}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" aria-label={`Monter « ${rule.title} »`} disabled={pending || index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" aria-label={`Descendre « ${rule.title} »`} disabled={pending || index === order.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
