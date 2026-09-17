"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus, RotateCcw, Star } from "lucide-react";
import { savePlanAction, setPlanActiveAction } from "@/server/actions/platform-billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";

export type PlanRow = { id: string; code: string; name: string; description: string; monthlyPriceCents: number; trialDays: number; isActive: boolean; isDefault: boolean; stripePriceId: string | null; subscriptions: number; contracts: number };

export function PlansManager({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const toggle = (plan: PlanRow) =>
    start(async () => {
      const result = await setPlanActiveAction({ planId: plan.id, isActive: !plan.isActive });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : result.error });
      router.refresh();
    });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button leadingIcon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Nouvelle offre</Button>
      </div>
      {plans.length === 0 && <p className="text-[13.5px] text-text-secondary">Aucune offre. Créez « PharmaBoost » avec son prix mensuel et son mois offert.</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {plans.map((plan) => (
          <li key={plan.id}>
            <Card>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold text-text-primary">{plan.name}</span>
                  <span className="font-mono text-[11.5px] text-text-tertiary">{plan.code}</span>
                  {plan.isDefault && <Badge tone="brand">Par défaut</Badge>}
                  {!plan.isActive && <Badge tone="neutral">Archivée</Badge>}
                  <Badge tone={plan.stripePriceId ? "success" : "warning"}>{plan.stripePriceId ? "Prix Stripe créé" : "Prix Stripe à créer"}</Badge>
                </div>
                <p className="text-[14px] text-text-primary">{formatCents(plan.monthlyPriceCents)} HT / mois · {plan.trialDays > 0 ? `${plan.trialDays} jours offerts` : "sans essai"}</p>
                {plan.description && <p className="text-[13px] text-text-secondary">{plan.description}</p>}
                <p className="text-[12px] text-text-tertiary">{plan.subscriptions} abonnement{plan.subscriptions > 1 ? "s" : ""} · {plan.contracts} contrat{plan.contracts > 1 ? "s" : ""}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(plan)}>Modifier</Button>
                  <Button size="sm" variant="ghost" loading={pending} leadingIcon={plan.isActive ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={() => toggle(plan)}>{plan.isActive ? "Archiver" : "Réactiver"}</Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {editing && <PlanModal plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanModal({ plan, onClose }: { plan: PlanRow | null; onClose: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(plan?.name ?? "PharmaBoost");
  const [code, setCode] = useState(plan?.code ?? "PHARMABOOST");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(plan ? (plan.monthlyPriceCents / 100).toFixed(2).replace(".", ",") : "");
  const [trialDays, setTrialDays] = useState(String(plan?.trialDays ?? 30));
  const [isDefault, setIsDefault] = useState(plan?.isDefault ?? true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const cents = Math.round(Number(price.replace(/\s/g, "").replace(",", ".")) * 100);
  return (
    <Modal open onClose={onClose} title={plan ? `Modifier « ${plan.name} »` : "Nouvelle offre"} description="Prix mensuel hors taxes. Le premier mois offert se règle avec 30 jours d'essai.">
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom" htmlFor="pl-name" error={fieldErrors.name}><Input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Code" htmlFor="pl-code" error={fieldErrors.code} hint="Clé stable, en majuscules."><Input id="pl-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prix mensuel HT (€)" htmlFor="pl-price" error={fieldErrors.monthlyPriceCents}><Input id="pl-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex. 149,00" /></Field>
          <Field label="Jours d'essai offerts" htmlFor="pl-trial" error={fieldErrors.trialDays} hint="30 = premier mois offert. 0 = aucun essai."><Input id="pl-trial" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} /></Field>
        </div>
        <Field label="Description" htmlFor="pl-desc" hint="Facultative ; reprise sur le produit Stripe."><Textarea id="pl-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
        <label className="flex items-center gap-2 text-[13px] text-text-secondary"><Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Offre proposée par défaut pour les nouveaux contrats</label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button loading={pending} leadingIcon={<Star className="size-4" />} disabled={!name.trim() || !code.trim() || !Number.isFinite(cents) || cents <= 0} onClick={() => start(async () => {
            setError(null);
            const result = await savePlanAction({ planId: plan?.id ?? null, name, code, description, monthlyPriceCents: cents, trialDays: Number(trialDays), isDefault });
            if (!result.ok) { setError(result.error); setFieldErrors(result.fieldErrors ?? {}); return; }
            push({ tone: "success", title: result.message ?? "Offre enregistrée." });
            onClose();
            router.refresh();
          })}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
