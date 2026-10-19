"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { saveCounterPitchAction } from "@/server/actions/admin-counter-pitches";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type Answer = { ask: 0 | 1; label: string; say: string; ean: string | null; productName: string | null };
export type PitchRow = {
  key: string;
  ruleTitle: string;
  productLabel: string;
  ask: string[];
  pitch: string;
  answers: Answer[];
  manual: boolean;
  outdated: boolean;
  updatedByName: string | null;
  updatedAt: string;
};

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * Les questions du comptoir (19 oct. 2026) : ce que la bannière du poste montre dans le menu d'un conseil — deux questions à poser au
 * patient, ses réponses à toucher (qui peuvent proposer un produit plus précis) et le conseil à dire. Écrits par l'IA, corrigés ici.
 */
export function CounterPitches({ rows }: { rows: PitchRow[] }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"tous" | "ia" | "corriges">("tous");
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter((row) => (only === "tous" || (only === "ia") === !row.manual) && (!q || fold(`${row.productLabel} ${row.ruleTitle} ${row.ask.join(" ")}`).includes(q)));
  }, [rows, query, only]);

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-card p-5" aria-labelledby="questions-comptoir" data-questions-comptoir="">
      <h2 id="questions-comptoir" className="text-[16px] font-semibold text-text-primary">Questions du comptoir</h2>
      <p className="mt-1 max-w-3xl text-[13px] leading-5 text-text-secondary">
        Au poste, chaque conseil de la bannière se déroule au survol : deux questions à poser au patient, ses réponses à toucher, et le conseil à dire. L&apos;IA les écrit une première fois ; corrigez-les ici. Une correction vaut aussitôt pour toutes les pharmacies, et l&apos;IA n&apos;y touche plus.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
          <Input aria-label="Chercher un produit ou une question" placeholder="Chercher un produit, une question…" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 80))} />
        </div>
        {(["tous", "ia", "corriges"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setOnly(value)} aria-pressed={only === value} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${only === value ? "border-brand-700 bg-brand-700 text-white" : "border-border-subtle text-text-secondary hover:bg-surface-sunken"}`}>
            {value === "tous" ? `Tous (${rows.length})` : value === "ia" ? `Écrits par l'IA (${rows.filter((row) => !row.manual).length})` : `Corrigés (${rows.filter((row) => row.manual).length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 text-[13px] text-text-tertiary">{rows.length === 0 ? "Aucun conseil prêt à dire pour l'instant : l'IA les écrit à la première vente qui les propose." : "Aucun résultat."}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {shown.slice(0, 200).map((row) => (
            <PitchItem key={row.key} row={row} />
          ))}
        </ul>
      )}
      {shown.length > 200 && <p className="mt-2 text-[12.5px] text-text-tertiary">Les 200 premiers sont affichés : précisez la recherche.</p>}
    </section>
  );
}

function PitchItem({ row }: { row: PitchRow }) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const blank = (ask: 0 | 1): Answer => ({ ask, label: "", say: "", ean: null, productName: null });
  const initial = () => ({
    ask: [row.ask[0] ?? "", row.ask[1] ?? ""] as [string, string],
    pitch: row.pitch,
    answers: ([0, 1] as const).flatMap((n) => {
      const mine = row.answers.filter((a) => a.ask === n);
      return [...mine, ...Array.from({ length: Math.max(0, 3 - mine.length) }, () => blank(n))];
    }),
  });
  const [draft, setDraft] = useState(initial);

  const send = (payload: unknown) =>
    start(async () => {
      const result = await saveCounterPitchAction(payload);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
      if (result.ok) setOpen(false);
    });
  const setAnswer = (index: number, patch: Partial<Answer>) => setDraft({ ...draft, answers: draft.answers.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

  return (
    <li className="rounded-lg border border-border-subtle" data-question-conseil={row.key}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-sunken">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-text-primary">{row.productLabel}</span>
          <span className="block text-[12.5px] text-text-tertiary">{row.ruleTitle}</span>
          {!open && <span className="mt-1 block truncate text-[13px] text-text-secondary">1. {row.ask[0]} · 2. {row.ask[1]}</span>}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${row.manual ? "bg-brand-50 text-brand-800" : row.outdated ? "bg-warning-50 text-warning-800" : "bg-surface-sunken text-text-secondary"}`}>
          {row.manual ? `Corrigé${row.updatedByName ? ` par ${row.updatedByName}` : ""} · ${date(row.updatedAt)}` : row.outdated ? "IA · réécriture en attente" : "Écrit par l'IA"}
        </span>
      </button>
      {open && (
        <form
          className="space-y-4 border-t border-border-subtle px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            send({ kind: "save", key: row.key, ask: draft.ask, pitch: draft.pitch, answers: draft.answers.map(({ ask, label, say, ean }) => ({ ask, label, say, ean: ean || null })) });
          }}
        >
          {([0, 1] as const).map((n) => (
            <fieldset key={n} className="space-y-2">
              <legend className="text-[12.5px] font-semibold tracking-wide text-text-tertiary uppercase">Question {n + 1}</legend>
              <Input aria-label={`Question ${n + 1}`} value={draft.ask[n]} onChange={(event) => setDraft({ ...draft, ask: (n === 0 ? [event.target.value, draft.ask[1]] : [draft.ask[0], event.target.value]) as [string, string] })} />
              <div className="space-y-1.5 pl-3">
                {draft.answers.map((a, index) =>
                  a.ask !== n ? null : (
                    <div key={index} className="grid gap-1.5 sm:grid-cols-[230px_1fr_190px]">
                      <Input aria-label={`Réponse du patient, question ${n + 1}`} placeholder="Réponse du patient" value={a.label} onChange={(event) => setAnswer(index, { label: event.target.value })} />
                      <Input aria-label={`Ce que fait le pharmacien, question ${n + 1}`} placeholder="Ce que fait ou dit le pharmacien" value={a.say} onChange={(event) => setAnswer(index, { say: event.target.value })} />
                      <Input aria-label={`Produit à proposer plutôt, question ${n + 1}`} placeholder="Plutôt : code-barres" inputMode="numeric" title={a.productName ?? undefined} value={a.ean ?? ""} onChange={(event) => setAnswer(index, { ean: event.target.value.replace(/\D/g, "").slice(0, 14), productName: null })} />
                      {a.productName && <span className="text-[12px] text-text-tertiary sm:col-start-3">{a.productName}</span>}
                    </div>
                  ),
                )}
              </div>
            </fieldset>
          ))}
          <div className="space-y-1.5">
            <label className="text-[12.5px] font-semibold tracking-wide text-text-tertiary uppercase" htmlFor={`conseil-${row.key}`}>Le conseil</label>
            <Textarea id={`conseil-${row.key}`} rows={3} value={draft.pitch} onChange={(event) => setDraft({ ...draft, pitch: event.target.value })} />
          </div>
          <p className="text-[12.5px] text-text-tertiary">Une réponse laissée vide est retirée. Le produit « proposer plutôt » n&apos;apparaît au comptoir que si la pharmacie l&apos;a en stock.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Enregistrer pour toutes les pharmacies
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { setDraft(initial()); setOpen(false); }}>
              Annuler
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} className="ml-auto" onClick={() => send({ kind: "reset", key: row.key })}>
              Laisser l&apos;IA réécrire
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
