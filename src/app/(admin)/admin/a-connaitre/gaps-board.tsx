"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { answerDrugGapAction, answerProductGapAction, dismissGapAction } from "@/server/actions/admin-gaps";
import type { GapView } from "@/server/services/knowledge-gaps";
import { GAP_REASON_LABELS } from "@/core/knowledge/gaps";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { TagPicker } from "../conseils/advice-control";

export type GapCard = Omit<GapView, "answeredAt" | "createdAt"> & { answeredAt: string | null; createdAt: string };

type Guess = { category?: string; tags?: string[]; confidence?: number; substance?: string | null; atcCode?: string | null; therapeuticClass?: string | null };

/**
 * « Produits à connaître » : les produits et médicaments que PharmaBoost n'a pas su ranger. La pharmacienne répond ; la réponse est
 * apprise pour toutes les pharmacies, présentes et à venir.
 */
export function GapsBoard({ open, recent, categories, tags }: { open: GapCard[]; recent: GapCard[]; categories: { code: string; label: string }[]; tags: string[] }) {
  const [tab, setTab] = useState<"PRODUCT" | "MEDICINE">(open.some((gap) => gap.kind === "MEDICINE") && !open.some((gap) => gap.kind === "PRODUCT") ? "MEDICINE" : "PRODUCT");
  const products = open.filter((gap) => gap.kind === "PRODUCT");
  const medicines = open.filter((gap) => gap.kind === "MEDICINE");
  const shown = tab === "PRODUCT" ? products : medicines;

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Comment ça marche">
        Chaque nouveau stock est lu en arrière-plan, sans que le titulaire le sache. Un produit ou un médicament que le logiciel ne sait pas ranger — ou dont le modèle doute — apparaît ici. Vous dites ce que c&apos;est ;
        la réponse passe avant le dictionnaire et le modèle, vaut pour toutes les pharmacies et ce produit ne revient plus.
      </Alert>

      <div role="tablist" aria-label="Type de sujet" className="inline-flex gap-0.5 rounded-xl bg-surface-sunken p-1">
        {(
          [
            ["PRODUCT", "Produits", products.length],
            ["MEDICINE", "Médicaments", medicines.length],
          ] as const
        ).map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${tab === key ? "bg-surface-card text-text-primary shadow-xs" : "text-text-secondary hover:text-text-primary"}`}>
            {label}
            {count > 0 && <span className="rounded-full bg-warning-500 px-1.5 py-0.5 text-[10.5px] leading-none font-semibold text-ink-950 tabular-nums">{count}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Rien à apprendre ici" description={tab === "PRODUCT" ? "Tous les produits des pharmacies sont rangés." : "Tous les médicaments des pharmacies sont classés."} />
      ) : (
        <ul className="space-y-3">
          {shown.map((gap) => (
            <li key={gap.id}>{gap.kind === "PRODUCT" ? <ProductGap gap={gap} categories={categories} tags={tags} /> : <MedicineGap gap={gap} />}</li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <details className="rounded-xl border border-border-subtle bg-surface-card p-4">
          <summary className="cursor-pointer text-[14px] font-semibold text-text-primary">Déjà tranchés ({recent.length})</summary>
          <ul className="mt-3 space-y-1.5 text-[13px] text-text-secondary">
            {recent.map((gap) => (
              <li key={gap.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={gap.status === "ANSWERED" ? "success" : "neutral"}>{gap.status === "ANSWERED" ? "Appris" : "Écarté"}</Badge>
                <span className="text-text-primary">{gap.label}</span>
                {gap.answeredByName && <span className="text-text-tertiary">· {gap.answeredByName}, {formatDate(gap.answeredAt)}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Header({ gap }: { gap: GapCard }) {
  return (
    <div className="space-y-1">
      <h3 className="text-[15px] font-semibold text-text-primary">{gap.label}</h3>
      <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
        <Badge tone="warning">{GAP_REASON_LABELS[gap.reason]}</Badge>
        <span>
          {gap.pharmacies.join(", ")}
          {gap.occurrences > gap.pharmacies.length ? ` et ${gap.occurrences - gap.pharmacies.length} autre${gap.occurrences - gap.pharmacies.length > 1 ? "s" : ""}` : ""}
        </span>
      </p>
    </div>
  );
}

function useAnswer() {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Appris") : (result.error ?? "Erreur") });
    });
  return { pending, run };
}

function ProductGap({ gap, categories, tags }: { gap: GapCard; categories: { code: string; label: string }[]; tags: string[] }) {
  const guess = (gap.guess ?? {}) as Guess;
  const [category, setCategory] = useState(guess.category ?? "");
  const [picked, setPicked] = useState<string[]>(guess.tags ?? []);
  const { pending, run } = useAnswer();
  const id = `gap-${gap.id}`;
  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <Header gap={gap} />
        {guess.category && (
          <p className="text-[12.5px] text-text-tertiary">
            Ce que le modèle avance : {categories.find((c) => c.code === guess.category)?.label ?? guess.category}
            {guess.tags && guess.tags.length > 0 ? ` (${guess.tags.join(", ")})` : ""}
            {typeof guess.confidence === "number" ? ` — sûr à ${Math.round(guess.confidence * 100)} %` : ""}.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <Field label="À quelle catégorie appartient-il ?" htmlFor={`${id}-cat`}>
            <Select id={`${id}-cat`} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Choisir…</option>
              {categories.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-text-primary">À quoi sert-il ? (étiquettes que les règles connaissent)</p>
            <TagPicker tags={tags} picked={picked} onChange={setPicked} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="success" size="sm" disabled={pending || !category} onClick={() => run(() => answerProductGapAction({ id: gap.id, category, tags: picked }))}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            Enregistrer pour toutes les pharmacies
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => answerProductGapAction({ id: gap.id, category: "AUTRE", tags: [] }))}>
            Pas un produit de conseil
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => dismissGapAction({ id: gap.id }))}>
            <X className="size-3.5" aria-hidden />
            Je ne sais pas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MedicineGap({ gap }: { gap: GapCard }) {
  const guess = (gap.guess ?? {}) as Guess;
  const [substance, setSubstance] = useState(guess.substance ?? "");
  const [atc, setAtc] = useState(guess.atcCode ?? "");
  const [therapeuticClass, setTherapeuticClass] = useState(guess.therapeuticClass ?? "");
  const { pending, run } = useAnswer();
  const id = `gap-${gap.id}`;
  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <Header gap={gap} />
        {(guess.substance || guess.atcCode || guess.therapeuticClass) && (
          <p className="text-[12.5px] text-text-tertiary">
            Ce que le modèle avance : {[guess.substance, guess.atcCode, guess.therapeuticClass].filter(Boolean).join(" · ")}
            {typeof guess.confidence === "number" ? ` — sûr à ${Math.round(guess.confidence * 100)} %` : ""}.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Substance active" htmlFor={`${id}-sub`}>
            <Input id={`${id}-sub`} value={substance} onChange={(event) => setSubstance(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Code ATC" htmlFor={`${id}-atc`} hint="Ex. J01CA04, ou un début : J01">
            <Input id={`${id}-atc`} value={atc} onChange={(event) => setAtc(event.target.value)} maxLength={10} className="uppercase" />
          </Field>
          <Field label="Famille thérapeutique" htmlFor={`${id}-class`} hint="Ex. Pénicillines, antiépileptique">
            <Input id={`${id}-class`} value={therapeuticClass} onChange={(event) => setTherapeuticClass(event.target.value)} maxLength={120} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="success" size="sm" disabled={pending || (!atc.trim() && !therapeuticClass.trim())} onClick={() => run(() => answerDrugGapAction({ id: gap.id, substance, atcCode: atc, therapeuticClass }))}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            Enregistrer pour toutes les pharmacies
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => dismissGapAction({ id: gap.id }))}>
            <X className="size-3.5" aria-hidden />
            Je ne sais pas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
