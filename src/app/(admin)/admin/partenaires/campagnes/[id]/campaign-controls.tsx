"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { setCampaignBillingAction, transitionCampaignAction, validateCampaignAction } from "@/server/actions/platform-sponsoring";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { BILLING_STATUS_LABELS, BILLING_STATUSES, CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/core/sponsoring/campaign";
import { REGULATORY_CATEGORIES, REGULATORY_CATEGORY_LABELS } from "@/core/discover/visibility";

const VERB: Partial<Record<CampaignStatus, string>> = {
  IN_REVIEW: "Envoyer en relecture",
  APPROVED: "Approuver",
  ACTIVE: "Activer (diffuser)",
  PAUSED: "Mettre en pause",
  ENDED: "Terminer",
  REJECTED: "Refuser",
  DRAFT: "Repasser en brouillon",
};

function useRun() {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré." });
      router.refresh();
    });
  };
  return { pending, error, run };
}

export function CampaignWorkflow({ id, next }: { id: string; next: CampaignStatus[] }) {
  const { pending, error, run } = useRun();
  if (next.length === 0) return <p className="text-[13px] text-text-tertiary">Campagne terminée : créez-en une nouvelle pour reprendre.</p>;
  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {next.map((to) => (
          <Button key={to} size="sm" variant={to === "ACTIVE" || to === "APPROVED" ? "primary" : to === "REJECTED" || to === "ENDED" ? "outline" : "secondary"} loading={pending} onClick={() => run(() => transitionCampaignAction({ id, to }))}>
            {VERB[to] ?? CAMPAIGN_STATUS_LABELS[to]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function RegulatoryForm({ id, category, canValidate }: { id: string; category: string | null; canValidate: boolean }) {
  const { pending, error, run } = useRun();
  const [validator, setValidator] = useState("");
  const [notes, setNotes] = useState("");
  const [cat, setCat] = useState(category ?? "");
  if (!canValidate) return <p className="text-[13px] text-text-tertiary">La validation se fait en brouillon ou en relecture.</p>;
  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Validé par (nom et qualité)" htmlFor="reg-validator" required>
          <Input id="reg-validator" value={validator} onChange={(event) => setValidator(event.target.value)} placeholder="Ex. : Dr Donna X, pharmacienne responsable" />
        </Field>
        <Field label="Catégorie réglementaire" htmlFor="reg-category" required>
          <Select id="reg-category" value={cat} onChange={(event) => setCat(event.target.value)}>
            <option value="">Choisir…</option>
            {REGULATORY_CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>
                {REGULATORY_CATEGORY_LABELS[entry]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes de validation" htmlFor="reg-notes" hint="Mentions vérifiées, réserves, références.">
        <Textarea id="reg-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Button size="sm" leadingIcon={<ShieldCheck className="size-4" />} loading={pending} onClick={() => run(() => validateCampaignAction({ id, validator, notes, category: cat }))}>
        Enregistrer la validation (date du jour)
      </Button>
    </div>
  );
}

export function BillingForm({
  id,
  initial,
}: {
  id: string;
  initial: { billingStatus: string; priceNote: string; budget: string; billed: string; billingReference: string; contractReference: string };
}) {
  const { pending, error, run } = useRun();
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Étape" htmlFor="bill-status">
          <Select id="bill-status" value={form.billingStatus} onChange={set("billingStatus")}>
            {BILLING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {BILLING_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Montant du devis (€ HT)" htmlFor="bill-budget" hint="Vide : à définir.">
          <Input id="bill-budget" inputMode="decimal" value={form.budget} onChange={set("budget")} />
        </Field>
        <Field label="Montant facturé (€ HT)" htmlFor="bill-billed">
          <Input id="bill-billed" inputMode="decimal" value={form.billed} onChange={set("billed")} />
        </Field>
        <Field label="Note tarifaire" htmlFor="bill-note" hint="Texte libre (« tarif à définir »).">
          <Input id="bill-note" value={form.priceNote} onChange={set("priceNote")} />
        </Field>
        <Field label="Référence du contrat" htmlFor="bill-contract">
          <Input id="bill-contract" value={form.contractReference} onChange={set("contractReference")} />
        </Field>
        <Field label="Référence de facture" htmlFor="bill-invoice">
          <Input id="bill-invoice" value={form.billingReference} onChange={set("billingReference")} />
        </Field>
      </div>
      <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setCampaignBillingAction({ id, ...form }))}>
        Enregistrer la facturation
      </Button>
    </div>
  );
}
