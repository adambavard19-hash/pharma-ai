"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Mail, Save } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_MAX_RECIPIENTS, type AudienceKey } from "@/core/admin/campaigns";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { previewAudienceAction, previewCampaignEmailAction, saveCampaignAction, sendCampaignTestAction } from "@/server/actions/admin-campaigns";
import { PreviewPane, type PreviewResult } from "./preview-pane";
import { SendCampaignDialog } from "./send-dialog";
import { AudienceStep, MessageStep, OfferStep, RecapFacts, StepTitle, TypeStep, type ActiveOffer, type AudienceView } from "./wizard-steps";
import {
  STEP_LABELS,
  amountProblem,
  audienceVerdict,
  canOpenStep,
  checkDraft,
  fingerprint,
  initialState,
  nextStep,
  previewBlockedReason,
  previousStep,
  selectAudience,
  selectKind,
  sideOf,
  stepProblems,
  stepsFor,
  todayKey,
  toPayload,
  type WizardState,
  type WizardStep,
} from "./wizard-logic";

export type WizardCampaign = { id: string; status: "DRAFT" | "SCHEDULED"; /** « AAAA-MM-JJ » du jour programmé, ou null. */ scheduledOn: string | null; state: WizardState };

type Saved = { id: string | null; fingerprint: string | null; error: string | null };
type Persisted = { ok: true; id: string; message?: string } | { ok: false; error: string };

/**
 * L'assistant de création et de modification d'une campagne : une étape à la
 * fois (type, destinataires, message, offre, envoi). Ce que l'écran affiche
 * vient du serveur : le nombre de destinataires (`previewAudienceAction`), le
 * message (`previewCampaignEmailAction`). Rien ne part sans la confirmation de
 * la dernière étape, et le brouillon, lui, ne contacte personne.
 */
export function CampaignWizard({
  campaign,
  pharmacies,
  partners,
  truncated,
  messagingLive,
  adminEmail,
  activeOffer,
  nowIso,
}: {
  campaign: WizardCampaign | null;
  pharmacies: { id: string; name: string; city: string | null }[];
  partners: { id: string; name: string }[];
  truncated: { pharmacies: boolean; partners: boolean };
  messagingLive: boolean;
  adminEmail: string;
  activeOffer: ActiveOffer | null;
  nowIso: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [state, setState] = useState<WizardState>(() => campaign?.state ?? initialState());
  const [step, setStep] = useState<WizardStep>("type");
  const [saved, setSaved] = useState<Saved>(() => ({ id: campaign?.id ?? null, fingerprint: campaign ? fingerprint(campaign.state) : null, error: null }));
  const [scheduled, setScheduled] = useState(campaign?.status === "SCHEDULED");
  const [moving, startMoving] = useTransition();
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();
  const [testResult, setTestResult] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const steps = stepsFor(state.kind);
  const stepIndex = steps.indexOf(step);
  const problems = stepProblems(state, step, now);
  const checked = checkDraft(state, now);
  const currentFingerprint = fingerprint(state);
  const isSaved = saved.id !== null && saved.fingerprint === currentFingerprint;
  const side = sideOf(state);
  const payload = toPayload(state);

  const patch = (changes: Partial<WizardState>) => setState((current) => ({ ...current, ...changes }));

  // À chaque changement d'étape, le focus passe au panneau : un lecteur d'écran annonce la nouvelle question.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panelRef.current?.focus();
  }, [step]);

  // ---------------------------------------------------- Destinataires (nombre calculé par le serveur)
  const selection = state.audience && CAMPAIGN_AUDIENCES[state.audience].needsSelection ? (side === "PHARMACY" ? state.pharmacyIds : state.partnerIds) : null;
  const audienceReady = state.audience !== null && (selection === null || selection.length > 0);
  const audienceKey = audienceReady ? JSON.stringify([state.audience, payload.audienceParams]) : null;
  const wantsAudience = step === "audience" || step === "send";
  const [audienceResult, setAudienceResult] = useState<{ key: string; view: AudienceView } | null>(null);

  useEffect(() => {
    if (!audienceKey || !wantsAudience) return;
    let cancelled = false;
    const [audience, audienceParams] = JSON.parse(audienceKey) as [AudienceKey, { pharmacyIds?: string[]; partnerIds?: string[] }];
    // Un court délai : on ne questionne pas le serveur à chaque touche pendant qu'on choisit.
    const timer = setTimeout(() => {
      previewAudienceAction({ audience, audienceParams })
        .then((result): AudienceView => (result.ok ? { status: "ok", count: result.data.count, excluded: result.data.excluded, sample: result.data.sample } : { status: "error", message: result.error }))
        .catch((): AudienceView => ({ status: "error", message: "Le nombre de destinataires n'a pas pu être calculé : réessayez." }))
        .then((view) => {
          if (!cancelled) setAudienceResult({ key: audienceKey, view });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audienceKey, wantsAudience]);

  const audienceView: AudienceView = !state.audience
    ? { status: "idle", reason: "Choisissez un public pour voir combien de personnes recevraient le message." }
    : !audienceReady
      ? { status: "idle", reason: side === "PHARMACY" ? "Choisissez au moins une officine pour voir le nombre de destinataires." : "Choisissez au moins un partenaire pour voir le nombre de destinataires." }
      : audienceResult?.key === audienceKey
        ? audienceResult.view
        : { status: "loading" };
  const verdict = audienceView.status === "ok" ? audienceVerdict(audienceView.count) : null;

  // ---------------------------------------------------- Aperçu du message (rendu par le serveur)
  const wantsPreview = step === "message" || step === "offer" || step === "send";
  const blockedReason = wantsPreview ? previewBlockedReason(state, step, now) : null;
  const [previewResult, setPreviewResult] = useState<{ key: string; result: PreviewResult } | null>(null);

  useEffect(() => {
    if (!wantsPreview || blockedReason) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewCampaignEmailAction(JSON.parse(currentFingerprint))
        .then((result): PreviewResult => (result.ok ? { ok: true, subject: result.data.subject, html: result.data.html } : { ok: false, error: result.error }))
        .catch((): PreviewResult => ({ ok: false, error: "L'aperçu n'a pas pu être préparé : réessayez." }))
        .then((outcome) => {
          if (!cancelled) setPreviewResult({ key: currentFingerprint, result: outcome });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wantsPreview, blockedReason, currentFingerprint]);
  const preview = previewResult?.key === currentFingerprint ? previewResult.result : null;

  // ---------------------------------------------------- Brouillon
  /** Enregistre le brouillon s'il est complet et s'il a changé. Jamais d'envoi : un brouillon ne contacte personne. */
  const persist = async (): Promise<Persisted> => {
    if (!checked.ok) return { ok: false, error: `Le brouillon n'est pas complet : ${checked.error}` };
    if (saved.id && saved.fingerprint === currentFingerprint) return { ok: true, id: saved.id };
    try {
      const result = await saveCampaignAction({ ...payload, ...(saved.id ? { id: saved.id } : {}) });
      if (!result.ok) {
        setSaved((current) => ({ ...current, error: result.error }));
        return { ok: false, error: result.error };
      }
      setSaved({ id: result.data.id, fingerprint: currentFingerprint, error: null });
      setScheduled(false);
      return { ok: true, id: result.data.id, message: result.message };
    } catch {
      // Le serveur n'a pas répondu : rien ne dit que le brouillon est enregistré, et on ne le laisse pas croire.
      const error = "L'enregistrement n'a pas abouti (le serveur n'a pas répondu). Réessayez : le brouillon n'est pas enregistré.";
      setSaved((current) => ({ ...current, error }));
      return { ok: false, error };
    }
  };

  /** Changer d'étape enregistre le brouillon quand il est complet ; un échec d'enregistrement reste affiché, il ne bloque pas la navigation. */
  const goTo = (target: WizardStep) => {
    startMoving(async () => {
      if (checked.ok) await persist();
      setStep(target);
    });
  };

  const saveDraft = () => {
    startSaving(async () => {
      const result = await persist();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Brouillon enregistré. Rien n'est envoyé.") : result.error });
    });
  };

  const sendTest = () => {
    setTestResult(null);
    startTesting(async () => {
      try {
        const result = await sendCampaignTestAction(payload);
        setTestResult(result.ok ? { tone: result.data.status === "SENT" ? "success" : "warning", text: result.message ?? result.data.detail } : { tone: "danger", text: result.error });
      } catch {
        setTestResult({ tone: "danger", text: "Le test n'a pas abouti (le serveur n'a pas répondu). Rien ne dit qu'il est parti : réessayez." });
      }
    });
  };

  const previous = previousStep(state, step);
  const next = nextStep(state, step);
  const amountError = state.kind && state.amount.trim() ? amountProblem(state.kind, state.amount) : null;
  const endsError = state.endsOn && state.endsOn < todayKey(now) ? "La date de fin ne peut pas être passée : l'offre court jusqu'à la fin de ce jour." : null;

  return (
    <div className="space-y-5">
      {scheduled && campaign && (
        <Alert tone="warning" title="Cette campagne est programmée">
          {campaign.scheduledOn ? `Elle partirait le ${formatDate(new Date(`${campaign.scheduledOn}T12:00:00Z`))}. ` : ""}L&apos;enregistrer la ramène au brouillon : il faudra la reprogrammer et confirmer de nouveau. Tant que vous n&apos;enregistrez pas, la programmation reste telle quelle.
        </Alert>
      )}

      <nav aria-label="Étapes de la campagne">
        <ol className="flex flex-wrap gap-2">
          {steps.map((s, index) => {
            const current = s === step;
            const done = index < stepIndex;
            const reachable = canOpenStep(state, s, now);
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => !current && goTo(s)}
                  disabled={(!reachable && !current) || moving}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
                    current ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-secondary hover:border-brand-300 hover:text-text-primary",
                  )}
                >
                  <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums", current ? "bg-white/20" : done ? "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500" : "bg-surface-sunken text-text-tertiary")} aria-hidden="true">
                    {done ? <Check className="size-3" /> : index + 1}
                  </span>
                  {STEP_LABELS[s]}
                  {done && <span className="sr-only"> (étape faite)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div ref={panelRef} tabIndex={-1} role="region" aria-label={`Étape ${stepIndex + 1} sur ${steps.length} : ${STEP_LABELS[step]}`} className="rounded-2xl border border-border-subtle bg-surface-card p-5 focus:outline-none sm:p-6">
        {step === "type" && <TypeStep state={state} onSelectKind={(kind) => setState((current) => selectKind(current, kind, now))} onName={(name) => patch({ name })} />}
        {step === "audience" && (
          <AudienceStep
            state={state}
            view={audienceView}
            pharmacies={pharmacies}
            partners={partners}
            truncated={truncated}
            onSelectAudience={(audience) => setState((current) => selectAudience(current, audience))}
            onSelection={(selectionSide, ids) => patch(selectionSide === "PHARMACY" ? { pharmacyIds: ids } : { partnerIds: ids })}
          />
        )}
        {step === "message" && <MessageStep state={state} onChange={patch} blockedReason={blockedReason} preview={preview} />}
        {step === "offer" && <OfferStep state={state} amountError={amountError} endsError={endsError} warnings={checked.ok ? checked.warnings : []} activeOffer={activeOffer} blockedReason={blockedReason} preview={preview} nowIso={nowIso} onChange={patch} />}
        {step === "send" && (
          <div className="space-y-6">
            <StepTitle title="Tout est prêt ?">Relisez, essayez à vous-même, puis envoyez ou programmez. Enregistrer le brouillon n&apos;envoie rien.</StepTitle>
            {!messagingLive && (
              <Alert tone="warning" title="Messagerie non configurée : l'envoi sera simulé">
                Aucun e-mail ne partira. Les destinataires seront marqués « simulé », jamais « envoyé », et la campagne le dira partout.
              </Alert>
            )}
            {!checked.ok && <Alert tone="danger" title="Le brouillon n'est pas complet">{checked.error}</Alert>}
            {checked.ok && checked.warnings.length > 0 && (
              <Alert tone="warning" title="À vérifier avant d'envoyer">
                <ul className="list-disc space-y-1 pl-4">
                  {checked.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {verdict === "empty" && <Alert tone="danger" title="Aucun destinataire">Le public choisi est vide, ou tous ses membres se sont désinscrits : rien ne peut partir.</Alert>}
            {verdict === "too_many" && audienceView.status === "ok" && (
              <Alert tone="danger" title="Trop de destinataires : l'envoi sera refusé">
                {audienceView.count.toLocaleString("fr-FR")} destinataires : une campagne en compte au plus {CAMPAIGN_MAX_RECIPIENTS.toLocaleString("fr-FR")}. Revenez à l&apos;étape « Destinataires » pour choisir un public plus étroit.
              </Alert>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0 space-y-6">
                <Block title="Récapitulatif">
                  <RecapFacts state={state} count={audienceView.status === "ok" ? audienceView.count : null} />
                </Block>
                <Block title="Essayer d'abord" hint={`Le test part uniquement à votre adresse (${adminEmail}), avec des valeurs d'exemple. Il n'écrit à personne d'autre.`}>
                  <Button type="button" variant="secondary" onClick={sendTest} loading={testing} disabled={!checked.ok} leadingIcon={<Mail className="size-4" />}>
                    M&apos;envoyer un test
                  </Button>
                  {testResult && (
                    <Alert tone={testResult.tone} className="mt-3">
                      {testResult.text}
                    </Alert>
                  )}
                </Block>
                <Block title="Envoyer ou programmer" hint="« Programmer » choisit un jour : l'envoi part au passage quotidien du matin (heure de Paris), pas à une heure précise.">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={saveDraft} loading={saving} disabled={!checked.ok} leadingIcon={<Save className="size-4" />}>
                      Enregistrer le brouillon
                    </Button>
                    {checked.ok && state.audience && (
                      <>
                        <SendCampaignDialog
                          mode="send"
                          campaignId={saved.id}
                          ensureSaved={persist}
                          audience={state.audience}
                          audienceParams={checked.value.audienceParams}
                          offer={{ kind: checked.value.kind, amountCents: checked.value.offerAmountCents, hasEnd: checked.value.offerEndsAt !== null }}
                          messagingLive={messagingLive}
                          nowIso={nowIso}
                          triggerDisabled={verdict === "empty" || verdict === "too_many"}
                          onDone={(id) => router.push(`/admin/campagnes/${id}`)}
                        />
                        <SendCampaignDialog
                          mode="schedule"
                          campaignId={saved.id}
                          ensureSaved={persist}
                          audience={state.audience}
                          audienceParams={checked.value.audienceParams}
                          offer={{ kind: checked.value.kind, amountCents: checked.value.offerAmountCents, hasEnd: checked.value.offerEndsAt !== null }}
                          messagingLive={messagingLive}
                          nowIso={nowIso}
                          initialDay={campaign?.scheduledOn ?? undefined}
                          triggerDisabled={verdict === "empty" || verdict === "too_many"}
                          onDone={(id) => router.push(`/admin/campagnes/${id}`)}
                        />
                      </>
                    )}
                  </div>
                </Block>
              </div>
              <PreviewPane blockedReason={blockedReason} result={preview} />
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <div className="min-w-0 space-y-1">
            {problems.length > 0 && step !== "send" && (
              <p className="text-[12.5px] text-text-tertiary">
                Pour continuer : {problems.join(" ")}
              </p>
            )}
            <p className={cn("text-[12.5px]", saved.error ? "text-danger-600" : "text-text-tertiary")} role={saved.error ? "alert" : "status"}>
              {saved.error ?? (isSaved ? "Brouillon enregistré. Rien n'est envoyé." : saved.id ? "Modifications non enregistrées : elles le seront à la prochaine étape, ou par « Enregistrer le brouillon »." : "Pas encore enregistré : le brouillon s'enregistre dès qu'il est complet, à chaque étape franchie.")}
              {isSaved && saved.id && (
                <>
                  {" "}
                  <Link href={`/admin/campagnes/${saved.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-400">
                    Voir la campagne
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {previous && (
              <Button type="button" variant="ghost" onClick={() => goTo(previous)} disabled={moving} leadingIcon={<ArrowLeft className="size-4" />}>
                Retour
              </Button>
            )}
            {next && (
              <Button type="button" onClick={() => goTo(next)} disabled={problems.length > 0} loading={moving} trailingIcon={<ArrowRight className="size-4" />}>
                Continuer
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-[14px] leading-5 font-semibold text-text-primary">{title}</h3>
        {hint && <p className="mt-0.5 text-[12.5px] leading-5 text-text-tertiary">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
