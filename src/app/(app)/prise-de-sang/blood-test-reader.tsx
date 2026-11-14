"use client";

import { useRef, useState, useTransition } from "react";
import { Droplet, FileUp, RotateCcw, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { readBloodTestAction } from "@/server/actions/blood-test";
import type { BloodProposal } from "@/core/blood-test/propose";

const euros = (cents: number) => (cents > 0 ? `${(cents / 100).toFixed(2).replace(".", ",")} €` : null);

function valueLine(finding: BloodProposal["finding"]): string {
  const value = finding.value !== null ? `${String(finding.value).replace(".", ",")}${finding.unit ? ` ${finding.unit}` : ""}` : "valeur signalée";
  const range = finding.refLow !== null || finding.refHigh !== null ? ` · normes ${finding.refLow ?? "…"} – ${finding.refHigh ?? "…"}` : "";
  return `${value}${range}`.replace(/\./g, ",");
}

export function BloodTestReader({ available }: { available: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<BloodProposal[] | null>(null);

  function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProposals(null);
    const data = new FormData();
    data.set("fichier", file);
    start(async () => {
      const result = await readBloodTestAction(data);
      if (input.current) input.current.value = "";
      if (!result.ok) setError(result.error);
      else setProposals(result.data.proposals);
    });
  }

  if (!available) {
    return <Alert tone="warning" title="Lecture automatique non activée">La lecture des documents n&apos;est pas activée pour cette pharmacie.</Alert>;
  }

  const advice = proposals?.filter((p) => p.kind === "ADVICE") ?? [];
  const doctor = proposals?.filter((p) => p.kind === "DOCTOR") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Droplet className="size-6" aria-hidden />
          </span>
          <p className="max-w-md text-[14px] leading-6 text-text-secondary">
            Photographiez la prise de sang du patient, ou déposez le PDF du laboratoire. PharmaBoost repère les valeurs que le laboratoire a signalées hors normes et propose les compléments sans ordonnance de votre stock.
          </p>
          <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" id="prise-de-sang-fichier" onChange={(event) => read(event.target.files?.[0])} />
          <Button loading={pending} leadingIcon={<FileUp className="size-4" aria-hidden />} onClick={() => input.current?.click()}>
            {pending ? "Lecture en cours…" : proposals ? "Lire une autre prise de sang" : "Ajouter la prise de sang"}
          </Button>
          <p className="text-[12.5px] text-text-tertiary">Rien n&apos;est enregistré : le document est lu puis oublié.</p>
        </CardContent>
      </Card>

      {error && <Alert tone="danger" title="Lecture impossible">{error}</Alert>}

      {proposals && proposals.length === 0 && (
        <Alert tone="success" title="Aucune valeur hors normes">Le laboratoire ne signale aucune valeur en dehors de ses normes sur ce document.</Alert>
      )}

      {advice.map((proposal) => (
        <Card key={proposal.rule?.key ?? proposal.finding.label}>
          <CardContent className="space-y-3 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15.5px] font-semibold text-text-primary">{proposal.finding.label}</h2>
              <Badge tone="warning">Basse</Badge>
              <span className="text-[13px] text-text-tertiary">{valueLine(proposal.finding)}</span>
            </div>
            <p className="text-[14px] leading-6 text-text-secondary">{proposal.rule?.pharmacistSentence}</p>
            {proposal.products.length > 0 ? (
              <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                {proposal.products.map((product) => (
                  <li key={product.id} className="flex items-center gap-3 px-3 py-2.5">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-10 rounded-lg object-contain" /> : <span className="size-10 rounded-lg bg-surface-sunken" />}
                    <span className="flex-1 text-[14px] font-medium text-text-primary">{product.name}</span>
                    {euros(product.salePriceCents) && <span className="text-[13px] text-text-secondary">{euros(product.salePriceCents)}</span>}
                    <Badge tone="success">En stock</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-surface-sunken px-3 py-2.5 text-[13.5px] text-text-secondary">Aucune référence de votre stock ne correspond pour l&apos;instant.</p>
            )}
            <ul className="space-y-1 text-[13px] leading-5 text-text-secondary">
              {proposal.rule?.cautions.map((caution) => (
                <li key={caution}>• {caution}</li>
              ))}
            </ul>
            <p className="text-[13px] font-medium text-brand-700 dark:text-brand-400">À voir avec le médecin du patient.</p>
          </CardContent>
        </Card>
      ))}

      {doctor.length > 0 && (
        <Card>
          <CardContent className="space-y-2 py-5">
            <h2 className="flex items-center gap-2 text-[15.5px] font-semibold text-text-primary">
              <Stethoscope className="size-4" aria-hidden /> À montrer au médecin
            </h2>
            <ul className="space-y-2">
              {doctor.map((proposal) => (
                <li key={`${proposal.finding.label}-${proposal.finding.direction}`} className="text-[14px] leading-6 text-text-secondary">
                  <span className="font-medium text-text-primary">{proposal.finding.label}</span> ({proposal.finding.direction === "LOW" ? "basse" : "élevée"}, {valueLine(proposal.finding)}) — {proposal.reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {proposals && (
        <button type="button" onClick={() => setProposals(null)} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-text-secondary hover:text-text-primary">
          <RotateCcw className="size-3.5" aria-hidden /> Effacer de l&apos;écran
        </button>
      )}
    </div>
  );
}
