"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Layers, Pencil, Plus, RotateCcw, Save, Star, Users } from "lucide-react";
import { savePlanAction, setPlanActiveAction } from "@/server/actions/platform-billing";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatEuros } from "@/core/billing/subscription";
import { parseAmountToCents } from "@/lib/format";
import type { ActionResult } from "@/server/actions/types";

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  setupFeeCents: number | null;
  annualSetupFeeCents: number | null;
  foundingPriceCents: number | null;
  discountPercent: number | null;
  discountLabel: string | null;
  features: string[];
  options: string[];
  maxUsers: number | null;
  sortOrder: number;
  trialDays: number;
  isActive: boolean;
  isDefault: boolean;
  stripePriceId: string | null;
  /** Abonnements en cours rattachés à l'offre. */
  ongoing: number;
  /** Parmi eux, ceux dont le tarif contractuel diffère du catalogue. */
  differing: number;
  contracts: number;
};

const centsToField = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, ""));
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Le catalogue, modifiable sur place. L'éditeur s'ouvre dans la page (pas de
 * fenêtre empilée) : quand le prix d'une offre existante change, la
 * confirmation rappelle que les abonnements en cours ne bougent pas.
 */
export function PlansManager({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = (plan: PlanRow) => {
    setBusyId(plan.id);
    start(async () => {
      const result = await setPlanActiveAction({ planId: plan.id, isActive: !plan.isActive });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "C'est fait.") : result.error });
      setBusyId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          {plural(plans.filter((p) => p.isActive).length, "offre active", "offres actives")}
          {plans.some((p) => !p.isActive) ? ` · ${plural(plans.filter((p) => !p.isActive).length, "archivée", "archivées")}` : ""}
        </p>
        {editing !== "new" && (
          <Button size="sm" leadingIcon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Nouvelle offre
          </Button>
        )}
      </div>

      {editing === "new" && <PlanEditor plan={null} onDone={() => setEditing(null)} />}

      {plans.length === 0 && editing !== "new" ? (
        <div className="rounded-2xl border border-dashed border-border-default bg-surface-card">
          <EmptyState icon={<Layers className="size-6" />} title="Aucune offre pour l'instant" description="Créez l'offre PharmaBoost avec son prix mensuel et son mois offert : elle sera proposée à la préparation des contrats." action={<Button size="sm" leadingIcon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Créer une offre</Button>} />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plans.map((plan) =>
            editing !== "new" && editing?.id === plan.id ? (
              <li key={plan.id} className="lg:col-span-2">
                <PlanEditor plan={plan} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={plan.id}>
                <PlanCard plan={plan} onEdit={() => setEditing(plan)} onToggle={() => toggle(plan)} busy={pending && busyId === plan.id} />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function PlanCard({ plan, onEdit, onToggle, busy }: { plan: PlanRow; onEdit: () => void; onToggle: () => void; busy: boolean }) {
  return (
    <article className={`flex h-full flex-col rounded-2xl border bg-surface-card p-5 transition-shadow hover:shadow-sm ${plan.isDefault ? "border-brand-300 dark:border-brand-800" : "border-border-subtle"} ${plan.isActive ? "" : "opacity-75"}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold text-text-primary">{plan.name}</h2>
            <span className="font-mono text-[11.5px] text-text-tertiary">{plan.code}</span>
          </div>
          {plan.description && <p className="mt-0.5 text-[13px] leading-5 text-text-secondary">{plan.description}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {plan.isDefault && <Badge tone="brand" icon={<Star className="size-3" />}>Par défaut</Badge>}
          <Badge tone={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Active" : "Archivée"}</Badge>
          <Badge tone={plan.stripePriceId ? "success" : "warning"}>{plan.stripePriceId ? "Prix Stripe créé" : "Prix Stripe à créer"}</Badge>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <p>
          <span className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-text-primary tabular-nums">{formatEuros(plan.monthlyPriceCents)}</span>
          <span className="ml-1 text-[13px] text-text-tertiary">HT / mois</span>
        </p>
        <p className="text-[13px] text-text-secondary">{plan.trialDays > 0 ? `${plan.trialDays} jours offerts` : "Sans essai"}</p>
        {plan.annualPriceCents !== null && <p className="text-[13px] text-text-secondary">{formatEuros(plan.annualPriceCents)} HT / an <span className="text-text-tertiary">(affiché)</span></p>}
        {(plan.setupFeeCents !== null || plan.annualSetupFeeCents !== null) && (
          <p className="text-[13px] text-text-secondary">
            Mise en service : {plan.setupFeeCents !== null ? `${formatEuros(plan.setupFeeCents)} HT` : "—"} (mensuelle) · {plan.annualSetupFeeCents === null ? "—" : plan.annualSetupFeeCents === 0 ? "offerte" : `${formatEuros(plan.annualSetupFeeCents)} HT`} (annuelle)
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {plan.foundingPriceCents !== null && <Badge tone="accent">Tarif fondateur : {formatEuros(plan.foundingPriceCents)}</Badge>}
        {plan.discountPercent !== null && <Badge tone="info">{plan.discountLabel ?? "Remise"} : −{plan.discountPercent} %</Badge>}
        {plan.maxUsers !== null && <Badge tone="neutral" icon={<Users className="size-3" />}>{plural(plan.maxUsers, "utilisateur inclus", "utilisateurs inclus")}</Badge>}
      </div>

      {(plan.features.length > 0 || plan.options.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {plan.features.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">Comprend</p>
              <ul className="space-y-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-1.5 text-[13px] leading-5 text-text-primary">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.options.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">Options</p>
              <ul className="space-y-1">
                {plan.options.map((o) => (
                  <li key={o} className="flex gap-1.5 text-[13px] leading-5 text-text-secondary">
                    <Plus className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface-sunken px-3 py-2 text-[12.5px] text-text-secondary">
          <span>
            <strong className="font-semibold text-text-primary tabular-nums">{plan.ongoing}</strong> abonnement{plan.ongoing > 1 ? "s" : ""} en cours
          </span>
          <span>
            <strong className={`font-semibold tabular-nums ${plan.differing > 0 ? "text-info-700 dark:text-info-500" : "text-text-primary"}`}>{plan.differing}</strong> à un tarif contractuel différent
          </span>
          <span>
            <strong className="font-semibold text-text-primary tabular-nums">{plan.contracts}</strong> contrat{plan.contracts > 1 ? "s" : ""}
          </span>
          <span className="text-text-tertiary">Ordre : {plan.sortOrder}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={onEdit}>
            Modifier
          </Button>
          <Button size="sm" variant="ghost" loading={busy} leadingIcon={plan.isActive ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={onToggle}>
            {plan.isActive ? "Archiver" : "Réactiver"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function PlanEditor({ plan, onDone }: { plan: PlanRow | null; onDone: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(plan?.name ?? "");
  const [code, setCode] = useState(plan?.code ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(centsToField(plan?.monthlyPriceCents ?? null));
  const [annual, setAnnual] = useState(centsToField(plan?.annualPriceCents ?? null));
  const [setupFee, setSetupFee] = useState(centsToField(plan?.setupFeeCents ?? null));
  const [annualSetupFee, setAnnualSetupFee] = useState(plan?.annualSetupFeeCents === 0 ? "0" : centsToField(plan?.annualSetupFeeCents ?? null));
  const [founding, setFounding] = useState(centsToField(plan?.foundingPriceCents ?? null));
  const [discountPercent, setDiscountPercent] = useState(plan?.discountPercent !== null && plan?.discountPercent !== undefined ? String(plan.discountPercent) : "");
  const [discountLabel, setDiscountLabel] = useState(plan?.discountLabel ?? "");
  const [trialDays, setTrialDays] = useState(String(plan?.trialDays ?? 30));
  const [features, setFeatures] = useState((plan?.features ?? []).join("\n"));
  const [options, setOptions] = useState((plan?.options ?? []).join("\n"));
  const [maxUsers, setMaxUsers] = useState(plan?.maxUsers !== null && plan?.maxUsers !== undefined ? String(plan.maxUsers) : "");
  const [sortOrder, setSortOrder] = useState(String(plan?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [isDefault, setIsDefault] = useState(plan?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const cents = price.trim() ? parseAmountToCents(price) : null;
  const optionalCents = (value: string) => (value.trim() ? parseAmountToCents(value) : null);
  // Une mise en service vide est « non renseignée » ; 0 est « offerte ».
  const optionalFee = (value: string) => (value.trim() ? parseAmountToCents(value) : null);
  const priceChanged = plan !== null && cents !== null && cents !== plan.monthlyPriceCents;
  const ready = name.trim().length >= 2 && code.trim().length >= 2 && cents !== null && cents >= 100;

  const save = async (): Promise<ActionResult<{ planId: string; stripe: string }>> => {
    setError(null);
    const result = await savePlanAction({
      planId: plan?.id ?? null,
      name,
      code,
      description,
      monthlyPriceCents: cents ?? 0,
      annualPriceCents: optionalCents(annual),
      setupFeeCents: optionalFee(setupFee),
      annualSetupFeeCents: optionalFee(annualSetupFee),
      foundingPriceCents: optionalCents(founding),
      discountPercent: discountPercent.trim() ? Number(discountPercent) : null,
      discountLabel: discountLabel.trim() || null,
      trialDays: Number(trialDays),
      features,
      options,
      maxUsers: maxUsers.trim() ? Number(maxUsers) : null,
      sortOrder: Number(sortOrder) || 0,
      isActive,
      isDefault,
    });
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return result;
    }
    onDone();
    return result;
  };

  const plainSave = () =>
    start(async () => {
      const result = await save();
      if (result.ok) {
        push({ tone: "success", title: result.message ?? "Offre enregistrée." });
        router.refresh();
      }
    });

  return (
    <section className="rounded-2xl border border-brand-200 bg-surface-card shadow-sm dark:border-brand-800/60" aria-label={plan ? `Modifier ${plan.name}` : "Nouvelle offre"}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">{plan ? `Modifier « ${plan.name} »` : "Nouvelle offre"}</h2>
          <p className="text-[13px] text-text-secondary">Prix hors taxes. Le premier mois offert se règle avec 30 jours d&apos;essai.</p>
        </div>
        {plan && plan.ongoing > 0 && <Badge tone="info">{plural(plan.ongoing, "abonnement en cours", "abonnements en cours")} : inchangés</Badge>}
      </header>

      <div className="space-y-5 px-5 py-5">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nom" htmlFor="pl-name" required error={fieldErrors.name}>
            <Input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="PharmaBoost Officine" />
          </Field>
          <Field label="Code" htmlFor="pl-code" required error={fieldErrors.code} hint="Clé stable, en majuscules.">
            <Input id="pl-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PHARMABOOST" />
          </Field>
          <Field label="Ordre d'affichage" htmlFor="pl-order" error={fieldErrors.sortOrder} hint="Du plus petit au plus grand.">
            <Input id="pl-order" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
        </div>
        <Field label="Description" htmlFor="pl-desc" hint="Facultative ; reprise sur le produit Stripe.">
          <Textarea id="pl-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={400} />
        </Field>

        <fieldset className="space-y-3">
          <legend className="text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">Prix</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Prix mensuel HT (€)" htmlFor="pl-price" required error={fieldErrors.monthlyPriceCents} hint={priceChanged ? `Actuel : ${formatEuros(plan.monthlyPriceCents)}. Nouveaux abonnements seulement.` : undefined}>
              <Input id="pl-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex. 149" />
            </Field>
            <Field label="Prix annuel affiché HT (€)" htmlFor="pl-annual" error={fieldErrors.annualPriceCents} hint="Affichage seulement : la facturation annuelle n'est pas branchée.">
              <Input id="pl-annual" inputMode="decimal" value={annual} onChange={(e) => setAnnual(e.target.value)} placeholder="facultatif" />
            </Field>
            <Field label="Tarif fondateur HT (€)" htmlFor="pl-founding" error={fieldErrors.foundingPriceCents} hint="Proposé aux premières officines ; jamais appliqué d'office.">
              <Input id="pl-founding" inputMode="decimal" value={founding} onChange={(e) => setFounding(e.target.value)} placeholder="facultatif" />
            </Field>
            <Field label="Jours d'essai offerts" htmlFor="pl-trial" error={fieldErrors.trialDays} hint="30 = premier mois offert. 0 = aucun essai.">
              <Input id="pl-trial" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mise en service mensuelle HT (€)" htmlFor="pl-setup" error={fieldErrors.setupFeeCents} hint="Facturée une seule fois, formule mensuelle. 0 = offerte.">
              <Input id="pl-setup" inputMode="decimal" value={setupFee} onChange={(e) => setSetupFee(e.target.value)} placeholder="ex. 390" />
            </Field>
            <Field label="Mise en service annuelle HT (€)" htmlFor="pl-setup-annual" error={fieldErrors.annualSetupFeeCents} hint="Formule annuelle. 0 = offerte.">
              <Input id="pl-setup-annual" inputMode="decimal" value={annualSetupFee} onChange={(e) => setAnnualSetupFee(e.target.value)} placeholder="0 = offerte" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Remise (%)" htmlFor="pl-discount" error={fieldErrors.discountPercent} hint="Proposée à la préparation d'un contrat.">
              <Input id="pl-discount" inputMode="numeric" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="facultatif" />
            </Field>
            <Field label="Libellé de la remise" htmlFor="pl-discount-label" error={fieldErrors.discountLabel} className="sm:col-span-1 lg:col-span-2">
              <Input id="pl-discount-label" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} placeholder="Remise de lancement" maxLength={80} />
            </Field>
            <Field label="Utilisateurs inclus" htmlFor="pl-users" error={fieldErrors.maxUsers} hint="Vide : sans limite affichée.">
              <Input id="pl-users" inputMode="numeric" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="facultatif" />
            </Field>
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Fonctionnalités" htmlFor="pl-features" hint="Une ligne par élément." error={fieldErrors.features}>
            <Textarea id="pl-features" value={features} onChange={(e) => setFeatures(e.target.value)} rows={5} placeholder={"Analyse des ordonnances\nConseil associé\nTableau de bord"} />
          </Field>
          <Field label="Options" htmlFor="pl-options" hint="Une ligne par élément." error={fieldErrors.options}>
            <Textarea id="pl-options" value={options} onChange={(e) => setOptions(e.target.value)} rows={5} placeholder={"Poste de comptoir supplémentaire"} />
          </Field>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <Checkbox id="pl-active" checked={isActive} onChange={(e) => { setIsActive(e.target.checked); if (!e.target.checked) setIsDefault(false); }} label="Offre active" description="Proposée aux nouveaux contrats." />
          <Checkbox id="pl-default" checked={isDefault} disabled={!isActive} onChange={(e) => setIsDefault(e.target.checked)} label="Offre par défaut" description="Présélectionnée à la préparation d'un contrat." />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-surface-sunken/40 px-5 py-3.5">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
        {priceChanged ? (
          <ConfirmAction
            label="Enregistrer"
            icon={<Save className="size-4" />}
            variant="primary"
            size="md"
            disabled={!ready}
            title="Modifier le prix catalogue"
            description={`${formatEuros(plan.monthlyPriceCents)} → ${formatEuros(cents ?? 0)} HT par mois pour l'offre « ${plan.name} ».`}
            consequences={[
              "Le nouveau prix s'applique uniquement aux nouveaux abonnements.",
              plan.ongoing > 0 ? `Les ${plural(plan.ongoing, "abonnement en cours garde", "abonnements en cours gardent")} leur tarif contractuel : aucun n'est modifié.` : "Aucun abonnement en cours n'est rattaché à cette offre.",
              "Chez Stripe, un nouveau prix est créé pour l'offre ; l'ancien reste attaché aux abonnements existants.",
              "Pour changer le tarif d'une officine, passez par sa fiche abonnement.",
            ]}
            confirmLabel="Enregistrer le nouveau prix"
            onConfirm={save}
          />
        ) : (
          <Button loading={pending} leadingIcon={<Save className="size-4" />} disabled={!ready} onClick={plainSave}>
            Enregistrer
          </Button>
        )}
      </footer>
    </section>
  );
}
