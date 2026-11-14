"use client";

import { useTransition } from "react";
import { decideBloodRuleAction } from "@/server/actions/blood-test";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { BloodRuleView } from "@/server/services/blood-test";

/**
 * Prise de sang → compléments sans ordonnance (14 nov. 2026). Une règle ne propose un produit — au comptoir comme dans
 * l'appli des patients — qu'une fois validée ici par Donna ou Adam. Sans validation, la valeur basse est seulement
 * « à montrer au médecin ».
 */
export function BloodTestRules({ rules }: { rules: BloodRuleView[] }) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const decide = (ruleKey: string, decision: "VALIDATE" | "REMOVE" | "RESTORE") =>
    start(async () => {
      const result = await decideBloodRuleAction({ ruleKey, decision });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : result.error });
    });

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-card p-5" aria-labelledby="prise-de-sang" data-prise-de-sang="">
      <h2 id="prise-de-sang" className="text-[16px] font-semibold text-text-primary">Prise de sang</h2>
      <p className="mt-1 max-w-3xl text-[13px] leading-5 text-text-secondary">
        Quand le laboratoire signale une de ces valeurs basse, PharmaBoost propose un complément sans ordonnance — au comptoir (dans le stock de la pharmacie) et dans l&apos;appli des patients. Seulement après votre validation. Une valeur haute, très basse, ou hors de cette liste n&apos;ouvre jamais de produit : elle est « à montrer au médecin ». Rien n&apos;est enregistré.
      </p>
      <ul className="mt-4 space-y-3">
        {rules.map((rule) => (
          <li key={rule.key} className="rounded-xl border border-border-subtle p-4" data-regle-prise-de-sang={rule.key}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14.5px] font-semibold text-text-primary">{rule.title}</h3>
              {rule.status === "VALIDATED" ? <Badge tone="success">Validée{rule.decidedByName ? ` par ${rule.decidedByName}` : ""}</Badge> : rule.status === "REMOVED" ? <Badge tone="danger">Supprimée</Badge> : <Badge tone="warning">{rule.outdated ? "Modifiée, à relire" : "À relire"}</Badge>}
              <span className="ml-auto flex gap-2">
                {rule.status !== "VALIDATED" && rule.status !== "REMOVED" && <Button size="sm" disabled={pending} onClick={() => decide(rule.key, "VALIDATE")}>Valider</Button>}
                {rule.status !== "REMOVED" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(rule.key, "REMOVE")}>Supprimer</Button>}
                {rule.status !== "ACTIVE" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(rule.key, "RESTORE")}>Remettre à relire</Button>}
              </span>
            </div>
            <p className="mt-2 text-[13.5px] leading-5 text-text-primary"><span className="font-medium">Pharmacien :</span> {rule.pharmacistSentence}</p>
            <p className="mt-1 text-[13.5px] leading-5 text-text-primary"><span className="font-medium">Patient :</span> {rule.patientSentence}</p>
            <ul className="mt-2 space-y-0.5 text-[13px] leading-5 text-text-secondary">
              {rule.cautions.map((caution) => <li key={caution}>• {caution}</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
