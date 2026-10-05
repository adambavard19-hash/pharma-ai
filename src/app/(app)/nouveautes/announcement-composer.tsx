"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Info, Loader2, Send } from "lucide-react";
import { previewAnnouncementAction, sendAnnouncementAction, sendAnnouncementTestAction } from "@/server/actions/patient-news";
import { NEWS_LIMITS, type AnnouncementInput } from "@/core/patient-news";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { DataItem } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { EMPTY_DRAFT, PREVIEW_DELAY_MS, afterSendNote, checkDraft, rangeOptions, sendBlocker, sendLabel, subscribersLabel, type Draft } from "./news-rules";

type Preview = { key: string; outcome: { ok: true; subject: string; html: string } | { ok: false; error: string } };

/**
 * Écrire une annonce, la voir telle que le patient la recevra, se l'envoyer, puis
 * l'envoyer aux abonnés après confirmation.
 *
 * Les règles de contenu sont celles du serveur (`validateAnnouncement`) : l'écran
 * ne fait que les dire plus tôt. Un bouton grisé dit toujours pourquoi, et
 * l'envoi aux abonnés passe par une confirmation qui rappelle le nombre de
 * destinataires, ce qui part et quand le prochain envoi sera possible.
 */
export function AnnouncementComposer({
  pharmacyName,
  userEmail,
  enabled,
  activeCount,
  nextAllowedAt,
  messagingLive,
  rangeSuggestions,
}: {
  pharmacyName: string;
  userEmail: string;
  enabled: boolean;
  activeCount: number;
  nextAllowedAt: string | null;
  messagingLive: boolean;
  rangeSuggestions: { laboratory: string; rangeName: string | null }[];
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState<{ at: Date } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const [sending, startSend] = useTransition();
  const { push } = useToast();

  const check = useMemo(() => checkDraft(draft), [draft]);
  const options = useMemo(() => rangeOptions(rangeSuggestions), [rangeSuggestions]);
  const blocker = sendBlocker({ enabled, activeCount, nextAllowedAt });
  const value = check.value;
  const key = useMemo(() => (value ? JSON.stringify(value) : null), [value]);

  const edit = (field: keyof Draft, text: string) => {
    setSendError(null);
    setDraft((current) => ({ ...current, [field]: text }));
  };

  // L'aperçu est demandé au serveur quand la saisie s'arrête : c'est le même
  // gabarit que l'envoi, pas une imitation côté navigateur. La réponse d'une
  // saisie dépassée est ignorée.
  useEffect(() => {
    if (!value || !key) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await previewAnnouncementAction(value);
      if (stale) return;
      setPreview({ key, outcome: result.ok ? { ok: true, subject: result.data.subject, html: result.data.html } : { ok: false, error: result.error } });
    }, PREVIEW_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value, key]);

  const sendTest = () => {
    if (!value) return;
    startTest(async () => {
      const result = await sendAnnouncementTestAction(value);
      if (!result.ok) return push({ tone: "error", title: result.error });
      push({ tone: result.data.status === "SIMULATED" ? "warning" : "success", title: result.message ?? "Test envoyé" });
    });
  };

  const send = () => {
    if (!value) return;
    startSend(async () => {
      // Le nombre confirmé est celui que le titulaire a sous les yeux : le serveur le recalcule et refuse s'il a changé.
      const result = await sendAnnouncementAction({ ...value, confirmedRecipientCount: activeCount });
      setConfirming(null);
      if (!result.ok) {
        setSendError(result.error);
        return push({ tone: "error", title: result.error });
      }
      setSendError(null);
      push({ tone: result.data.simulated || !result.data.complete ? "warning" : "success", title: result.message ?? "Annonce envoyée" });
      // Un envoi simulé n'a rien contacté : le texte reste, pour être repris ou envoyé pour de bon.
      if (!result.data.simulated) setDraft(EMPTY_DRAFT);
    });
  };

  // Une erreur de champ est dite sous le champ ; ce qui manque encore (un champ vide) est dit près des boutons.
  const draftReason = check.problem && Object.keys(check.fieldErrors).length === 0 ? check.problem : null;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <Card>
        <CardHeader title="Écrire une annonce" description={`Le même message part à tous vos abonnés, au nom de ${pharmacyName}. Au plus une annonce par semaine.`} />
        <CardContent className="space-y-5">
          <TextField id="news-title" label="Objet" count={draft.title.length} limit={NEWS_LIMITS.title} error={check.fieldErrors.title} hint="L'objet de l'e-mail : ce que le patient lit en premier dans sa messagerie.">
            <Input id="news-title" value={draft.title} onChange={(event) => edit("title", event.target.value)} placeholder="Une nouvelle gamme est arrivée" aria-invalid={Boolean(check.fieldErrors.title)} aria-describedby="news-title-help" />
          </TextField>

          <TextField
            id="news-range"
            label="Gamme ou marque (facultatif)"
            count={draft.rangeLabel.length}
            limit={NEWS_LIMITS.range}
            error={check.fieldErrors.rangeLabel}
            hint={options.length > 0 ? "Suggestions : vos gammes privilégiées. Vous pouvez écrire un autre nom." : "Aucune gamme privilégiée n'est renseignée : écrivez le nom librement."}
          >
            <Input id="news-range" list="news-range-options" value={draft.rangeLabel} onChange={(event) => edit("rangeLabel", event.target.value)} aria-invalid={Boolean(check.fieldErrors.rangeLabel)} aria-describedby="news-range-help" />
            <datalist id="news-range-options">
              {options.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </TextField>

          <TextField id="news-message" label="Message" count={draft.message.length} limit={NEWS_LIMITS.message} error={check.fieldErrors.message} hint="Quelques phrases simples. Une ligne vide sépare deux paragraphes.">
            <Textarea id="news-message" rows={7} value={draft.message} onChange={(event) => edit("message", event.target.value)} aria-invalid={Boolean(check.fieldErrors.message)} aria-describedby="news-message-help" />
          </TextField>

          <div className="rounded-lg bg-surface-sunken/70 px-3.5 py-3">
            <p className="text-[12.5px] font-semibold text-text-primary">Ce qu&apos;une annonce ne peut pas contenir</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12.5px] leading-5 text-text-secondary">
              <li>Aucun médicament sur ordonnance : une annonce présente une gamme.</li>
              <li>Aucune promesse de soin ni de guérison.</li>
              <li>Aucun lien, aucune adresse e-mail : le message est le même pour tous.</li>
              <li>Aucune donnée de santé : le patient ne doit y reconnaître ni son plan ni son traitement.</li>
            </ul>
          </div>

          {sendError && <Alert tone="danger" title="L'annonce n'est pas partie">{sendError}</Alert>}

          <div className="space-y-3 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="outline" disabled={!value || sending} loading={testing} onClick={sendTest} leadingIcon={<Send className="size-4" />}>
                M&apos;envoyer un test
              </Button>
              <Button disabled={!value || blocker !== null || testing} onClick={() => setConfirming({ at: new Date() })}>
                {sendLabel(activeCount)}
              </Button>
            </div>
            <p className="text-[12px] leading-4 text-text-tertiary">
              Le test part à {userEmail}, et à cette adresse seule. Il porte la mention « test » et n&apos;est pas compté dans la limite d&apos;une annonce par semaine.
            </p>
            {(draftReason || blocker) && (
              <ul className="space-y-1.5" aria-label="Pourquoi un bouton est grisé">
                {draftReason && <Reason>{draftReason}</Reason>}
                {blocker && <Reason>{blocker}</Reason>}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <PreviewPanel valid={value !== null} blank={!draft.title.trim() && !draft.message.trim()} preview={preview} previewKey={key} />

      <Modal
        open={confirming !== null}
        onClose={() => (sending ? undefined : setConfirming(null))}
        size="lg"
        title={`Envoyer l'annonce à ${subscribersLabel(activeCount)} ?`}
        description="Relisez ce qui va partir : un message envoyé ne peut pas être rappelé."
        footer={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setConfirming(null)}>
              Annuler
            </Button>
            <Button loading={sending} onClick={send} leadingIcon={<Send className="size-4" />}>
              {sendLabel(activeCount)}
            </Button>
          </>
        }
      >
        {value && confirming && <ConfirmationBody value={value} activeCount={activeCount} pharmacyName={pharmacyName} messagingLive={messagingLive} at={confirming.at} />}
      </Modal>
    </div>
  );
}

/**
 * Ce que le titulaire relit avant de confirmer : à qui l'annonce part (le nombre,
 * jamais les adresses), ce qui part, et ce qui change ensuite.
 */
export function ConfirmationBody({ value, activeCount, pharmacyName, messagingLive, at }: { value: AnnouncementInput; activeCount: number; pharmacyName: string; messagingLive: boolean; at: Date }) {
  return (
    <div className="space-y-4">
      {!messagingLive && (
        <Alert tone="warning" title="Envoi simulé">
          La messagerie n&apos;est pas configurée : aucun message ne partira. L&apos;annonce sera notée « simulée » dans l&apos;historique.
        </Alert>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        <DataItem label="Destinataires">
          {subscribersLabel(activeCount)}
          <span className="block text-[12.5px] text-text-tertiary">Leurs adresses ne vous sont jamais montrées.</span>
        </DataItem>
        <DataItem label="Expéditeur">{pharmacyName}</DataItem>
        <DataItem label="Objet" className="sm:col-span-2">
          <span className="break-words">{value.title}</span>
        </DataItem>
        {value.rangeLabel && (
          <DataItem label="Gamme" className="sm:col-span-2">
            <span className="break-words">{value.rangeLabel}</span>
          </DataItem>
        )}
        <DataItem label="Message" className="sm:col-span-2">
          <span className="block max-h-48 overflow-y-auto rounded-lg bg-surface-sunken/70 px-3 py-2 text-[13px] leading-5 break-words whitespace-pre-wrap">{value.message}</span>
        </DataItem>
      </dl>
      <p className="text-[13px] leading-5 text-text-secondary">Chaque message comporte le lien pour se désinscrire et rappelle qu&apos;aucun médicament sur ordonnance n&apos;y est présenté.</p>
      <p className="text-[13px] leading-5 font-medium text-text-primary">{afterSendNote(messagingLive, at)}</p>
    </div>
  );
}

/** Un champ avec son compteur : il passe au rouge au-delà de la limite, comme le refus du serveur. */
function TextField({ id, label, count, limit, error, hint, children }: { id: string; label: string; count: number; limit: number; error?: string; hint: string; children: ReactNode }) {
  const over = count > limit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className={cn("text-[12px] tabular", over ? "font-medium text-danger-600" : "text-text-tertiary")}>
          {count} / {limit}
        </span>
      </div>
      {children}
      <p id={`${id}-help`} className={cn("text-[12.5px]", error ? "text-danger-600" : "text-text-tertiary")}>
        {error ?? hint}
      </p>
    </div>
  );
}

function Reason({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-5 text-text-secondary">
      <Info className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/**
 * L'aperçu : l'e-mail réel rendu par le serveur, dans un cadre isolé
 * (`sandbox` sans permission : aucun script, aucun lien ne s'ouvre). Tant que le
 * texte est refusé ou vide, il dit pourquoi il n'y a rien à montrer ; pendant une
 * nouvelle saisie, le dernier aperçu reste affiché, estompé, plutôt que de
 * clignoter.
 */
function PreviewPanel({ valid, blank, preview, previewKey }: { valid: boolean; blank: boolean; preview: Preview | null; previewKey: string | null }) {
  const refreshing = preview !== null && preview.key !== previewKey;

  return (
    <Card>
      <CardHeader title="Aperçu de l'e-mail" description="Tel que vos abonnés le recevront. Le lien « Se désinscrire » de l'aperçu est un exemple : chaque abonné reçoit le sien." />
      <CardContent className="space-y-3" aria-live="polite">
        {!valid ? (
          <Placeholder>{blank ? "L'aperçu apparaît dès que vous avez écrit un objet et un message." : "Corrigez le texte pour voir l'aperçu."}</Placeholder>
        ) : !preview || (!preview.outcome.ok && refreshing) ? (
          <Placeholder>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Préparation de l&apos;aperçu…
          </Placeholder>
        ) : !preview.outcome.ok ? (
          <Alert tone="danger" title="Aperçu indisponible">
            {preview.outcome.error}
          </Alert>
        ) : (
          <>
            <p className="flex items-start justify-between gap-3 text-[13px] text-text-primary">
              <span className="min-w-0 break-words">
                <span className="text-text-tertiary">Objet : </span>
                {preview.outcome.subject}
              </span>
              {refreshing && (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-text-tertiary">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Mise à jour
                </span>
              )}
            </p>
            <iframe title="Aperçu de l'e-mail" sandbox="" srcDoc={preview.outcome.html} className={cn("h-[34rem] w-full rounded-lg border border-border-subtle bg-white transition-opacity", refreshing && "opacity-60")} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <div className="flex min-h-64 items-center justify-center gap-2 rounded-lg border border-dashed border-border-default px-6 text-center text-[13px] leading-5 text-text-tertiary">{children}</div>;
}
