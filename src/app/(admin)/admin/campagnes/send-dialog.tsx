"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Send } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import type { ButtonProps } from "@/components/ui/button";
import { CAMPAIGN_CONFIRMATION_WORD, CAMPAIGN_MAX_RECIPIENTS, type AudienceKey, type CampaignKindKey } from "@/core/admin/campaigns";
import { previewAudienceAction, scheduleCampaignAction, startCampaignAction } from "@/server/actions/admin-campaigns";
import { CampaignDialog } from "./campaign-dialog";
import { submitCampaign } from "./send-request";
import { audienceVerdict, describeExcluded, scheduleBounds, scheduleDayProblem, scheduleSentence } from "./wizard-logic";
import { offerHeadline, offerSendLines } from "./view";

type Recount = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; count: number; excluded: { optedOut: number; noEmail: number; duplicates: number } };

/**
 * Le nombre de destinataires, relu au moment où la fenêtre s'ouvre : c'est lui
 * (et non celui d'une page chargée plus tôt) que l'on confirme, et le serveur
 * le recalcule encore avant d'écrire à qui que ce soit. Monté seulement quand
 * la fenêtre est ouverte.
 */
function RecountOnOpen({ audience, audienceParams, onResult }: { audience: AudienceKey; audienceParams: { pharmacyIds?: string[]; partnerIds?: string[] }; onResult: (recount: Recount) => void }) {
  const paramsKey = JSON.stringify(audienceParams);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await previewAudienceAction({ audience, audienceParams: JSON.parse(paramsKey) });
      if (cancelled) return;
      onResult(result.ok ? { status: "ok", count: result.data.count, excluded: result.data.excluded } : { status: "error", message: result.error });
    })().catch(() => {
      if (!cancelled) onResult({ status: "error", message: "Le nombre de destinataires n'a pas pu être calculé : réessayez." });
    });
    return () => {
      cancelled = true;
    };
  }, [audience, paramsKey, onResult]);
  return null;
}

/**
 * « Envoyer maintenant » et « Programmer » : la même confirmation. Le nombre
 * de destinataires et le montant sont affichés en gros, le mot ENVOYER est
 * retapé, et le serveur compare le nombre confirmé à celui qu'il recalcule.
 * Depuis l'assistant, le brouillon est d'abord enregistré (`ensureSaved`).
 */
export function SendCampaignDialog({
  mode,
  campaignId,
  ensureSaved,
  audience,
  audienceParams,
  offer,
  messagingLive,
  nowIso,
  initialDay,
  label,
  variant,
  size,
  triggerDisabled,
  onDone,
}: {
  mode: "send" | "schedule";
  /** La campagne enregistrée ; `null` depuis l'assistant, qui l'enregistre d'abord par `ensureSaved`. */
  campaignId: string | null;
  ensureSaved?: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  audience: AudienceKey;
  audienceParams: { pharmacyIds?: string[]; partnerIds?: string[] };
  /** L'offre portée par la campagne : son type, son montant en centimes, et si elle a une date de fin. */
  offer: { kind: CampaignKindKey; amountCents: number | null; hasEnd: boolean };
  messagingLive: boolean;
  /** L'instant du rendu serveur : le même texte et les mêmes bornes de date côté serveur et côté navigateur. */
  nowIso: string;
  initialDay?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  triggerDisabled?: boolean;
  onDone: (campaignId: string) => void;
}) {
  const now = new Date(nowIso);
  const bounds = scheduleBounds(now);
  const [recount, setRecount] = useState<Recount>({ status: "loading" });
  const [day, setDay] = useState(initialDay ?? "");
  const savedId = useRef<string | null>(campaignId);

  const verdict = recount.status === "ok" ? audienceVerdict(recount.count) : null;
  const dayProblem = mode === "schedule" ? scheduleDayProblem(day, now) : null;
  const headline = offerHeadline(offer.kind, offer.amountCents);
  const sentence = mode === "schedule" ? scheduleSentence(day, now) : null;

  const consequences = [
    ...(mode === "send"
      ? ["Les messages partent tout de suite, un par destinataire. Un destinataire désinscrit des offres n'en reçoit jamais."]
      : ["Le message part au passage quotidien du matin du jour choisi, pas à une heure précise.", "Le nombre de destinataires est confirmé maintenant ; le serveur le recalcule au moment de l'envoi. Tant que rien n'est parti, la programmation se retire ou se change."]),
    ...offerSendLines(offer.kind, offer.amountCents, offer.hasEnd, mode),
    ...(messagingLive ? [] : ["La messagerie n'est pas configurée : l'envoi sera simulé. Aucun e-mail ne partira, et les destinataires seront marqués « simulé », jamais « envoyé »."]),
    "Tout est tracé : historique des communications et journal d'audit.",
  ];

  const run = async (typed: string) => {
    const outcome = await submitCampaign({ mode, campaignId, ensureSaved, count: recount.status === "ok" ? recount.count : null, day, typed }, { start: startCampaignAction, schedule: scheduleCampaignAction });
    savedId.current = outcome.id;
    return outcome.result;
  };

  return (
    <CampaignDialog
      label={label ?? (mode === "send" ? "Envoyer maintenant" : "Programmer l'envoi")}
      icon={mode === "send" ? <Send className="size-4" /> : <CalendarClock className="size-4" />}
      variant={variant ?? (mode === "send" ? "primary" : "secondary")}
      size={size}
      triggerDisabled={triggerDisabled}
      title={mode === "send" ? "Envoyer la campagne maintenant ?" : "Programmer l'envoi de la campagne ?"}
      description={mode === "send" ? "C'est le dernier geste : après confirmation, les messages partent." : "Rien ne part aujourd'hui : l'envoi est confirmé maintenant pour le jour choisi."}
      consequences={consequences}
      confirmLabel={mode === "send" ? "Envoyer" : "Programmer"}
      typedWord={CAMPAIGN_CONFIRMATION_WORD}
      canConfirm={verdict === "ok" && !dayProblem}
      pendingNote={mode === "send" ? "Envoi en cours : cela peut durer jusqu'à une minute. Ne fermez pas la page." : undefined}
      interruptedNote="Le serveur n'a pas répondu à temps : l'envoi a peut-être démarré. Ouvrez la campagne et regardez ses destinataires avant de recommencer."
      run={run}
      onSuccess={() => onDone(savedId.current ?? "")}
      onClose={() => setRecount({ status: "loading" })}
    >
      <RecountOnOpen audience={audience} audienceParams={audienceParams} onResult={setRecount} />
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border-subtle p-3.5">
            <p className="text-[12px] font-medium text-text-tertiary">Destinataires</p>
            <p className="mt-1 text-[34px] leading-10 font-semibold tracking-[-0.02em] text-text-primary tabular-nums" aria-live="polite">
              {recount.status === "ok" ? recount.count.toLocaleString("fr-FR") : "—"}
            </p>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              {recount.status === "loading" && "Recalcul en cours…"}
              {recount.status === "ok" && (describeExcluded(recount.excluded) ? `Écartés : ${describeExcluded(recount.excluded)}.` : "Aucun destinataire écarté.")}
            </p>
          </div>
          {headline && (
            <div className="rounded-xl border border-border-subtle p-3.5">
              <p className="text-[12px] font-medium text-text-tertiary">Montant de l&apos;offre</p>
              <p className="mt-1 text-[24px] leading-10 font-semibold tracking-[-0.02em] text-text-primary">{headline}</p>
            </div>
          )}
        </div>
        {recount.status === "error" && <Alert tone="danger" title="Nombre de destinataires indisponible">{recount.message}</Alert>}
        {verdict === "empty" && <Alert tone="danger" title="Aucun destinataire">Le public choisi est vide, ou tous ses membres se sont désinscrits : rien ne peut partir.</Alert>}
        {verdict === "too_many" && recount.status === "ok" && (
          <Alert tone="danger" title="Trop de destinataires">
            {recount.count.toLocaleString("fr-FR")} destinataires : une campagne en compte au plus {CAMPAIGN_MAX_RECIPIENTS.toLocaleString("fr-FR")}. Choisissez un public plus étroit.
          </Alert>
        )}
        {mode === "schedule" && (
          <div className="space-y-1.5">
            <label htmlFor="jour-envoi" className="block text-[13px] font-medium text-text-primary">
              Jour d&apos;envoi
            </label>
            <input id="jour-envoi" type="date" value={day} min={bounds.min} max={bounds.max} onChange={(e) => setDay(e.target.value)} className="h-10 w-full rounded-lg border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none sm:w-60" />
            {day && dayProblem ? <p className="text-[12.5px] text-danger-600" role="alert">{dayProblem}</p> : sentence ? <p className="text-[12.5px] text-text-secondary">{sentence}</p> : <p className="text-[12.5px] text-text-tertiary">De demain à 90 jours.</p>}
          </div>
        )}
      </div>
    </CampaignDialog>
  );
}
