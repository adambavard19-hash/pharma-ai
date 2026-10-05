"use client";

import { useRef, useState, type ReactNode } from "react";
import { Gift, Handshake, Megaphone, Search, Users, X } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { FactList } from "@/components/admin/page-header";
import {
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_BUTTON_TARGETS,
  CAMPAIGN_KIND_KEYS,
  CAMPAIGN_KINDS,
  CAMPAIGN_MAX_RECIPIENTS,
  campaignVariablesFor,
  type AudienceKey,
  type CampaignKindKey,
} from "@/core/admin/campaigns";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { isCalendarDay } from "@/core/challenges/dates";
import { cn } from "@/lib/utils";
import { PreviewPane, type PreviewResult } from "./preview-pane";
import { audienceVerdict, audiencesFor, buttonTargetsFor, describeExcluded, filterOptions, insertAtCursor, parseEuros, sideOf, todayKey, type WizardState } from "./wizard-logic";
import { offerHeadline } from "./view";

const CONTROL = "w-full rounded-md border border-border-default bg-surface-card px-3 py-2 text-sm text-text-primary shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

/** Une question à la fois : le titre de l'étape, et la phrase qui dit ce qu'on décide ici. */
export function StepTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="text-[17px] leading-6 font-semibold text-text-primary">{title}</h2>
      {children && <p className="max-w-2xl text-[13.5px] leading-5 text-text-secondary">{children}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 1. Type

const KIND_ICONS: Record<CampaignKindKey, typeof Gift> = { BONUS_OFFER: Gift, REFERRAL_OFFER: Users, PARTNER_INVITATION: Handshake, ANNOUNCEMENT: Megaphone };

const SIDE_TEXT = { PHARMACY: "aux officines", PARTNER: "aux partenaires" } as const;

export function TypeStep({ state, onSelectKind, onName }: { state: WizardState; onSelectKind: (kind: CampaignKindKey) => void; onName: (name: string) => void }) {
  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="sr-only">Type de campagne</legend>
        <StepTitle title="Quelle campagne voulez-vous envoyer ?">Le type fixe ce que le message peut promettre, à qui il s&apos;adresse et s&apos;il porte un montant.</StepTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPAIGN_KIND_KEYS.map((key) => {
            const definition = CAMPAIGN_KINDS[key];
            const Icon = KIND_ICONS[key];
            return (
              <label key={key} className="relative block cursor-pointer">
                <input type="radio" name="campaign-kind" value={key} checked={state.kind === key} onChange={() => onSelectKind(key)} className="peer sr-only" />
                <span className="flex h-full gap-3.5 rounded-xl border border-border-default bg-surface-card p-4 transition-colors hover:border-brand-300 peer-checked:border-brand-600 peer-checked:bg-brand-50/60 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 dark:peer-checked:bg-brand-950/30">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-text-secondary" aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 space-y-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] leading-5 font-semibold text-text-primary">{definition.label}</span>
                      {definition.needsAmount && <Badge tone="brand">Avec un montant</Badge>}
                    </span>
                    <span className="block text-[13px] leading-5 text-text-secondary">{definition.description}</span>
                    <span className="block text-[12px] text-text-tertiary">S&apos;adresse {definition.side.map((side) => SIDE_TEXT[side]).join(" ou ")}.</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {state.kind && (
        <Field label="Nom de la campagne" htmlFor="campagne-nom" hint="Un nom pour vous retrouver dans la liste : les destinataires ne le voient pas.">
          <Input id="campagne-nom" value={state.name} maxLength={120} onChange={(e) => onName(e.target.value)} autoComplete="off" />
        </Field>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 2. Destinataires

export type AudienceView =
  | { status: "idle"; reason: string }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; count: number; excluded: { optedOut: number; noEmail: number; duplicates: number }; sample: { name: string; emailMasked: string }[] };

type Option = { id: string; name: string; city?: string | null };

/** Choisir à la main : une recherche par nom dans une liste bornée, et ce qui est déjà choisi, retirable. */
function SelectionPicker({ noun, options, selected, truncated, onChange }: { noun: "officines" | "partenaires"; options: Option[]; selected: string[]; truncated: boolean; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const { shown, total } = filterOptions(options, query, 50);
  const names = new Map(options.map((option) => [option.id, option.name]));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Rechercher parmi les ${noun} par nom`} aria-label={`Rechercher parmi les ${noun}`} className={cn(CONTROL, "pl-9")} />
      </div>
      {options.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">Aucune {noun === "officines" ? "officine" : "partenaire"} à proposer pour l&apos;instant.</p>
      ) : (
        <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border-subtle" aria-label={`Choix des ${noun}`}>
          {shown.length === 0 && <li className="px-3 py-3 text-[13px] text-text-tertiary">Aucun résultat pour « {query} ».</li>}
          {shown.map((option) => (
            <li key={option.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-sunken">
                <input type="checkbox" checked={selected.includes(option.id)} onChange={() => toggle(option.id)} className="size-4 shrink-0 rounded border-border-strong text-brand-600 focus:ring-2 focus:ring-brand-500/25" />
                <span className="min-w-0 text-[13.5px] text-text-primary">
                  {option.name}
                  {option.city && <span className="text-text-tertiary"> · {option.city}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {total > shown.length && (
        <p className="text-[12px] text-text-tertiary">
          {shown.length} résultats affichés sur {total} : affinez la recherche pour voir les autres.
        </p>
      )}
      {truncated && <p className="text-[12px] text-text-tertiary">La liste est limitée aux 500 premières par ordre alphabétique ; recherchez par nom pour en retrouver une autre.</p>}
      <div className="space-y-1.5">
        <p className="text-[12.5px] font-medium text-text-secondary" aria-live="polite">
          {selected.length === 0 ? `Aucune ${noun === "officines" ? "officine" : "partenaire"} choisie.` : `${selected.length} choisi${selected.length > 1 ? "s" : ""} :`}
        </p>
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((id) => (
              <li key={id} className="inline-flex items-center gap-1 rounded-full border border-border-default bg-surface-sunken py-0.5 pr-1 pl-2.5 text-[12.5px] text-text-primary">
                {names.get(id) ?? "Introuvable"}
                <button type="button" onClick={() => toggle(id)} aria-label={`Retirer ${names.get(id) ?? "cet élément"}`} className="rounded-full p-1 text-text-tertiary hover:bg-surface-card hover:text-text-primary">
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AudienceSummary({ view }: { view: AudienceView }) {
  if (view.status === "idle") return <p className="rounded-xl bg-surface-sunken px-4 py-3 text-[13px] text-text-tertiary">{view.reason}</p>;
  if (view.status === "loading")
    return (
      <p className="rounded-xl bg-surface-sunken px-4 py-3 text-[13px] text-text-tertiary" role="status">
        Calcul du nombre de destinataires…
      </p>
    );
  if (view.status === "error") return <Alert tone="danger" title="Nombre de destinataires indisponible">{view.message}</Alert>;
  const verdict = audienceVerdict(view.count);
  const excluded = describeExcluded(view.excluded);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border-subtle p-4">
        <p className="text-[12px] font-medium text-text-tertiary">Destinataires</p>
        <p className="mt-1 text-[34px] leading-10 font-semibold tracking-[-0.02em] text-text-primary tabular-nums" aria-live="polite">
          {view.count.toLocaleString("fr-FR")}
        </p>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">{excluded ? `Écartés : ${excluded}.` : "Aucun destinataire écarté."}</p>
      </div>
      {verdict === "empty" && <Alert tone="warning" title="Aucun destinataire">Ce public est vide, ou tous ses membres se sont désinscrits : la campagne ne pourrait pas partir.</Alert>}
      {verdict === "too_many" && (
        <Alert tone="danger" title="Trop de destinataires : l'envoi sera refusé">
          Une campagne compte au plus {CAMPAIGN_MAX_RECIPIENTS.toLocaleString("fr-FR")} destinataires. Choisissez un public plus étroit, ou sélectionnez les destinataires un à un.
        </Alert>
      )}
      {view.sample.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12.5px] font-medium text-text-secondary">Échantillon (adresses masquées)</p>
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {view.sample.map((row) => (
              <li key={`${row.name}-${row.emailMasked}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-text-primary">{row.name || "Sans nom"}</span>
                <span className="font-mono text-[12.5px] text-text-tertiary">{row.emailMasked}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AudienceStep({
  state,
  view,
  pharmacies,
  partners,
  truncated,
  onSelectAudience,
  onSelection,
}: {
  state: WizardState;
  view: AudienceView;
  pharmacies: Option[];
  partners: Option[];
  truncated: { pharmacies: boolean; partners: boolean };
  onSelectAudience: (audience: AudienceKey) => void;
  onSelection: (side: "PHARMACY" | "PARTNER", ids: string[]) => void;
}) {
  const audiences = audiencesFor(state.kind);
  const chosen = state.audience ? CAMPAIGN_AUDIENCES[state.audience] : null;
  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="sr-only">Destinataires</legend>
        <StepTitle title="À qui écrire ?">Le nombre exact de destinataires est calculé à chaque changement : les adresses désinscrites des offres, sans adresse ou en double sont écartées.</StepTitle>
        <div className="grid gap-2.5">
          {audiences.map((key) => {
            const audience = CAMPAIGN_AUDIENCES[key];
            return (
              <label key={key} className="relative block cursor-pointer">
                <input type="radio" name="campaign-audience" value={key} checked={state.audience === key} onChange={() => onSelectAudience(key)} className="peer sr-only" />
                <span className="block rounded-xl border border-border-default bg-surface-card px-4 py-3 transition-colors hover:border-brand-300 peer-checked:border-brand-600 peer-checked:bg-brand-50/60 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 dark:peer-checked:bg-brand-950/30">
                  <span className="block text-[14px] leading-5 font-semibold text-text-primary">{audience.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-text-secondary">{audience.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {chosen?.needsSelection && (chosen.side === "PHARMACY" ? <SelectionPicker noun="officines" options={pharmacies} selected={state.pharmacyIds} truncated={truncated.pharmacies} onChange={(ids) => onSelection("PHARMACY", ids)} /> : <SelectionPicker noun="partenaires" options={partners} selected={state.partnerIds} truncated={truncated.partners} onChange={(ids) => onSelection("PARTNER", ids)} />)}

      {state.audience && <AudienceSummary view={view} />}
    </div>
  );
}

// ---------------------------------------------------------------- 3. Message

type TextField = "subject" | "title" | "body";

export function MessageStep({ state, onChange, blockedReason, preview }: { state: WizardState; onChange: (patch: Partial<WizardState>) => void; blockedReason: string | null; preview: PreviewResult | null }) {
  const side = sideOf(state);
  const variables = state.kind && side ? campaignVariablesFor(state.kind, side) : [];
  const targets = buttonTargetsFor(side);
  const [active, setActive] = useState<TextField>("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /** Insère `{{variable}}` à la position du curseur du champ où l'on écrivait, sans perdre la sélection. */
  const insert = (key: string) => {
    const element = (active === "subject" ? subjectRef : active === "title" ? titleRef : bodyRef).current;
    if (!element) return;
    const inserted = insertAtCursor(state[active], element.selectionStart ?? state[active].length, element.selectionEnd ?? state[active].length, `{{${key}}}`);
    onChange({ [active]: inserted.value } as Partial<WizardState>);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(inserted.caret, inserted.caret);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <StepTitle title="Que dit le message ?">Écrivez en phrases courtes. Les variables entre doubles accolades sont remplacées pour chaque destinataire.</StepTitle>
        <Field label="Objet" htmlFor="campagne-objet" hint="Ce qui s'affiche dans la boîte de réception.">
          <Input id="campagne-objet" ref={subjectRef} value={state.subject} maxLength={160} onFocus={() => setActive("subject")} onChange={(e) => onChange({ subject: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Titre" htmlFor="campagne-titre" hint="Le titre en haut du message.">
          <Input id="campagne-titre" ref={titleRef} value={state.title} maxLength={120} onFocus={() => setActive("title")} onChange={(e) => onChange({ title: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Texte" htmlFor="campagne-texte" hint="Séparez les paragraphes par une ligne vide.">
          <textarea id="campagne-texte" ref={bodyRef} value={state.body} rows={12} maxLength={5000} onFocus={() => setActive("body")} onChange={(e) => onChange({ body: e.target.value })} className={cn(CONTROL, "min-h-20 resize-y font-mono text-[13px] leading-5")} />
        </Field>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-text-primary">Variables disponibles</p>
          <p className="text-[12.5px] text-text-tertiary">Cliquez pour insérer à l&apos;endroit du curseur, dans le champ où vous écriviez (objet, titre ou texte).</p>
          <ul className="flex flex-wrap gap-1.5">
            {variables.map((variable) => (
              <li key={variable.key}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(variable.key)} title={`${variable.label}. Exemple : ${variable.sample}`} className="rounded-md border border-border-default bg-surface-card px-2 py-1 font-mono text-[12px] text-text-primary transition-colors hover:border-brand-300 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                  {`{{${variable.key}}}`}
                </button>
              </li>
            ))}
          </ul>
          <dl className="grid gap-x-4 gap-y-1 text-[12px] text-text-tertiary sm:grid-cols-2">
            {variables.map((variable) => (
              <div key={variable.key} className="flex gap-1.5">
                <dt className="font-mono text-text-secondary">{variable.key}</dt>
                <dd className="min-w-0 truncate">{variable.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Texte du bouton" htmlFor="campagne-bouton" hint="Laissez vide pour un message sans bouton.">
            <Input id="campagne-bouton" value={state.buttonLabel} maxLength={60} onChange={(e) => onChange({ buttonLabel: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Où mène le bouton" htmlFor="campagne-bouton-cible" hint="Une destination de PharmaBoost, jamais une adresse saisie.">
            <Select id="campagne-bouton-cible" value={state.buttonTarget} onChange={(e) => onChange({ buttonTarget: e.target.value as WizardState["buttonTarget"] })}>
              <option value="">Aucun bouton</option>
              {targets.map((target) => (
                <option key={target.key} value={target.key}>
                  {target.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {side === "PHARMACY" && (
          <Checkbox
            id="campagne-appli"
            checked={state.alsoInApp}
            onChange={(e) => onChange({ alsoInApp: e.target.checked })}
            label="Aussi dans l'application"
            description="Une notification apparaît dans l'espace de chaque officine destinataire. Elle n'est créée que pour un message réellement parti, jamais pour un envoi simulé."
          />
        )}
      </div>
      <PreviewPane blockedReason={blockedReason} result={preview} />
    </div>
  );
}

// ---------------------------------------------------------------- 4. Offre

export type ActiveOffer = { label: string; amountCents: number; endsAt: string | null };

export function OfferStep({
  state,
  amountError,
  endsError,
  warnings,
  activeOffer,
  blockedReason,
  preview,
  nowIso,
  onChange,
}: {
  state: WizardState;
  amountError: string | null;
  endsError: string | null;
  warnings: string[];
  activeOffer: ActiveOffer | null;
  blockedReason: string | null;
  preview: PreviewResult | null;
  nowIso: string;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const definition = state.kind ? CAMPAIGN_KINDS[state.kind] : null;
  const bounds = definition?.amountBoundsCents;
  const isReferral = state.kind === "REFERRAL_OFFER";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <StepTitle title="Quelle est l'offre ?">Le montant écrit dans le message est celui-ci, et pas un autre : écrivez {"{{montant_offre}}"} dans le texte plutôt qu&apos;un chiffre.</StepTitle>

        {isReferral ? (
          <Alert tone="info" title="Ce montant est réellement appliqué">
            Chaque officine qui s&apos;inscrit comme filleule pendant l&apos;offre apporte ce montant par mois à son parrain, figé sur sa fiche. Les filleuls déjà inscrits gardent leur montant.
          </Alert>
        ) : (
          <Alert tone="warning" title="Application manuelle par l'équipe">
            Le bonus est annoncé dans le message, mais aucun crédit automatique n&apos;existe : après l&apos;envoi, l&apos;équipe l&apos;applique à la main, officine par officine. La fiche de la campagne en dresse la liste.
          </Alert>
        )}

        {isReferral && activeOffer && (
          <Alert tone="warning" title="Une offre de parrainage est déjà en cours">
            « {activeOffer.label} » : {formatEuros(activeOffer.amountCents)} par filleul et par mois{activeOffer.endsAt ? `, jusqu'au ${formatFrenchDate(new Date(activeOffer.endsAt))}` : ", sans date de fin"}. À l&apos;envoi, cette campagne devient l&apos;offre en cours pour les nouvelles inscriptions (la plus récente l&apos;emporte) ; si elle est annulée, l&apos;offre précédente, si elle court encore, redevient celle qui s&apos;applique.
          </Alert>
        )}

        <Field label={definition?.amountLabel ?? "Montant"} htmlFor="campagne-montant" error={amountError} hint={bounds ? `En euros, entre ${formatEuros(bounds.min)} et ${formatEuros(bounds.max)}.` : undefined} required>
          <div className="flex items-center gap-2">
            <Input id="campagne-montant" inputMode="decimal" value={state.amount} onChange={(e) => onChange({ amount: e.target.value })} aria-invalid={amountError ? true : undefined} autoComplete="off" className="max-w-40" />
            <span className="text-[13.5px] text-text-secondary" aria-hidden="true">
              €
            </span>
          </div>
        </Field>

        <Field label="Dernier jour de l'offre" htmlFor="campagne-fin" error={endsError} hint={isReferral ? "Facultatif. Sans date, l'offre court jusqu'à son arrêt. L'offre couvre tout ce jour-là, jusqu'à minuit (heure de Paris)." : "Facultatif. Écrivez {{date_fin_offre}} dans le texte pour le dire aux destinataires."}>
          <input id="campagne-fin" type="date" value={state.endsOn} min={todayKey(new Date(nowIso))} onChange={(e) => onChange({ endsOn: e.target.value })} className={cn(CONTROL, "h-10 max-w-52")} />
        </Field>

        <Field label="Conditions" htmlFor="campagne-conditions" hint="Facultatif, sur une ligne, 500 caractères au plus. Écrivez {{conditions_offre}} dans le texte pour les dire.">
          <Textarea id="campagne-conditions" value={state.conditions} rows={3} maxLength={500} onChange={(e) => onChange({ conditions: e.target.value })} />
        </Field>

        {warnings.length > 0 && (
          <Alert tone="warning" title="À vérifier">
            <ul className="list-disc space-y-1 pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        )}
      </div>
      <PreviewPane blockedReason={blockedReason} result={preview} />
    </div>
  );
}

// ---------------------------------------------------------------- 5. Récapitulatif

export function RecapFacts({ state, count }: { state: WizardState; count: number | null }) {
  const definition = state.kind ? CAMPAIGN_KINDS[state.kind] : null;
  const audience = state.audience ? CAMPAIGN_AUDIENCES[state.audience] : null;
  const target = state.buttonTarget ? CAMPAIGN_BUTTON_TARGETS[state.buttonTarget].label : null;
  const parsed = definition?.needsAmount ? parseEuros(state.amount) : null;
  const cents = parsed?.ok ? parsed.cents : null;
  return (
    <FactList
      items={[
        { label: "Type", value: definition?.label },
        { label: "Nom interne", value: state.name.trim() },
        { label: "Public", value: audience?.label, hint: count === null ? undefined : `${count.toLocaleString("fr-FR")} destinataire${count > 1 ? "s" : ""} aujourd'hui` },
        { label: "Objet", value: state.subject.trim() },
        { label: "Bouton", value: state.buttonLabel.trim() && target ? `« ${state.buttonLabel.trim()} » (mène à : ${target})` : "Aucun" },
        ...(definition?.needsAmount ? [{ label: "Offre", value: state.kind ? offerHeadline(state.kind, cents) : null, hint: isCalendarDay(state.endsOn) ? `jusqu'au ${formatFrenchDate(new Date(`${state.endsOn}T12:00:00Z`))}` : "sans date de fin" }] : []),
        ...(sideOf(state) === "PHARMACY" ? [{ label: "Notification dans l'application", value: state.alsoInApp ? "Oui" : "Non" }] : []),
      ]}
    />
  );
}
