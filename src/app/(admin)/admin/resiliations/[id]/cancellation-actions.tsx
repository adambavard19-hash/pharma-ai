"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarX2, CheckCheck, MessageSquarePlus, PhoneCall, PlayCircle, Undo2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { addCancellationNoteAction, logCancellationContactAction, moveCancellationAction, scheduleCancellationStripeEndAction } from "@/server/actions/admin-billing";
import { CANCELLATION_CHANNELS } from "@/core/admin/statuses";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

function todayInParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Les gestes d'une demande de résiliation, proposés selon son statut :
 * traiter, confirmer (avec la date de fin), annuler (motif), terminer (mot à
 * retaper), programmer la fin chez Stripe. Aucun ne coupe l'accès ni ne
 * supprime quoi que ce soit.
 */
export function CancellationStatusActions({
  requestId,
  status,
  plannedEndAt,
  suggestedEndAt,
  stripeScheduled,
  stripeConfigured,
  stripeLinked,
  periodEndLabel,
}: {
  requestId: string;
  status: string;
  /** « AAAA-MM-JJ » ou nul. */
  plannedEndAt: string | null;
  suggestedEndAt: string | null;
  stripeScheduled: boolean;
  stripeConfigured: boolean;
  stripeLinked: boolean;
  periodEndLabel: string | null;
}) {
  const [endAt, setEndAt] = useState(plannedEndAt ?? suggestedEndAt ?? "");
  const open = status === "RECEIVED" || status === "IN_PROGRESS" || status === "CONFIRMED";

  if (!open) {
    return <p className="text-[13px] leading-5 text-text-secondary">Cette demande est close ({status === "COMPLETED" ? "terminée" : "annulée"}) : elle ne rouvre pas. Une nouvelle demande peut être enregistrée si le titulaire revient vers vous.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {status === "RECEIVED" && (
        <ConfirmAction
          label="Passer en traitement"
          icon={<PlayCircle className="size-4" />}
          variant="outline"
          title="Passer la demande en traitement"
          consequences={["La demande passe à « En traitement ».", "Rien n'est modifié chez Stripe ni sur l'accès de l'officine."]}
          confirmLabel="Passer en traitement"
          onConfirm={() => moveCancellationAction({ requestId, to: "IN_PROGRESS" })}
        />
      )}

      {(status === "RECEIVED" || status === "IN_PROGRESS") && (
        <ConfirmAction
          label="Confirmer la résiliation"
          icon={<CalendarCheck2 className="size-4" />}
          variant="primary"
          title="Confirmer la résiliation"
          description="La résiliation est actée avec le titulaire. La date de fin figure dans l'historique et dans l'e-mail de confirmation."
          consequences={["La demande passe à « Confirmée ».", "Rien n'est coupé : l'abonnement Stripe et l'accès continuent tant que vous ne programmez pas la fin.", "Pensez ensuite à envoyer la confirmation au titulaire."]}
          confirmLabel="Confirmer"
          onConfirm={() => (endAt ? moveCancellationAction({ requestId, to: "CONFIRMED", plannedEndAt: endAt }) : Promise.resolve({ ok: false as const, error: "Indiquez la date de fin prévue." }))}
        >
          <Field label="Date de fin prévue" htmlFor="confirm-end" hint={suggestedEndAt ? "Suggérée : fin de la période en cours de l'abonnement." : undefined}>
            <Input id="confirm-end" type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </Field>
        </ConfirmAction>
      )}

      {status === "CONFIRMED" && (
        <ConfirmAction
          label="Terminer"
          icon={<CheckCheck className="size-4" />}
          variant="outline"
          title="Terminer la résiliation"
          description="À faire une fois la fin effective (abonnement arrêté, dernier échange clos)."
          consequences={["La demande passe à « Terminée » et ne rouvre plus.", "Rien n'est coupé ni supprimé automatiquement : l'accès et l'abonnement se gèrent depuis la fiche abonnement.", "Les données de l'officine sont conservées."]}
          typedConfirmation="TERMINER"
          confirmLabel="Terminer la demande"
          onConfirm={() => moveCancellationAction({ requestId, to: "COMPLETED" })}
        />
      )}

      {!stripeScheduled && (
        <div className="space-y-1">
          <ConfirmAction
            label="Programmer la fin chez Stripe"
            icon={<CalendarX2 className="size-4" />}
            variant="outline"
            tone="danger"
            title="Programmer la fin chez Stripe"
            description="L'abonnement Stripe s'arrêtera à la fin de la période en cours."
            consequences={[periodEndLabel ? `Dernier jour facturé : ${periodEndLabel}. Aucun prélèvement ensuite.` : "Aucun prélèvement après la fin de la période en cours.", "L'accès reste ouvert jusque-là ; aucune donnée n'est supprimée.", "Annulable depuis la fiche abonnement tant que la date n'est pas passée."]}
            typedConfirmation="RÉSILIER"
            confirmLabel="Programmer la fin"
            disabled={!stripeConfigured || !stripeLinked}
            onConfirm={() => scheduleCancellationStripeEndAction({ requestId })}
          />
          {!stripeConfigured ? (
            <p className="text-[12px] text-warning-700 dark:text-warning-500">À faire chez Stripe : Stripe n&apos;est pas configuré sur ce serveur.</p>
          ) : !stripeLinked ? (
            <p className="text-[12px] text-text-tertiary">Aucun abonnement Stripe rattaché : rien à programmer.</p>
          ) : null}
        </div>
      )}

      <ConfirmAction
        label="Annuler la demande"
        icon={<Undo2 className="size-4" />}
        variant="ghost"
        title="Annuler la demande de résiliation"
        description="Le titulaire a changé d'avis : l'abonnement continue."
        consequences={["La demande passe à « Annulée par le client » et ne rouvre plus.", stripeScheduled ? "La fin reste programmée chez Stripe : annulez-la ensuite depuis la fiche abonnement." : "Rien n'avait été programmé chez Stripe."]}
        reason={{ label: "Pourquoi la demande est-elle annulée ?", placeholder: "Le titulaire reste après l'appel du…" }}
        confirmLabel="Annuler la demande"
        onConfirm={(reason) => moveCancellationAction({ requestId, to: "CANCELED", note: reason ?? null })}
      />
    </div>
  );
}

/** « Noter un contact » et « Ajouter une note » : deux petits formulaires, tracés dans l'historique de la demande. */
export function CancellationJournalActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"contact" | "note" | null>(null);
  const [channel, setChannel] = useState("PHONE");
  const [at, setAt] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openWith = (next: "contact" | "note") => {
    setMode(next);
    setText("");
    setError(null);
    setAt(todayInParis());
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const result = mode === "contact" ? await logCancellationContactAction({ requestId, channel, summary: text, at }) : await addCancellationNoteAction({ requestId, body: text });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré." });
      setMode(null);
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" leadingIcon={<PhoneCall className="size-4" />} onClick={() => openWith("contact")}>
          Noter un contact
        </Button>
        <Button size="sm" variant="ghost" leadingIcon={<MessageSquarePlus className="size-4" />} onClick={() => openWith("note")}>
          Ajouter une note
        </Button>
      </div>
      <Modal
        open={mode !== null}
        onClose={() => !pending && setMode(null)}
        title={mode === "contact" ? "Noter un contact" : "Ajouter une note"}
        description={mode === "contact" ? "Un échange avec le titulaire : il met à jour la date du dernier contact." : "Une note interne, jamais visible de l'officine."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={pending}>
              Annuler
            </Button>
            <Button loading={pending} disabled={text.trim().length < 3} onClick={submit}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          {mode === "contact" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Canal" htmlFor="ct-channel">
                <Select id="ct-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {Object.entries(CANCELLATION_CHANNELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="ct-at">
                <Input id="ct-at" type="date" value={at} max={todayInParis()} onChange={(e) => setAt(e.target.value)} />
              </Field>
            </div>
          )}
          <Field label={mode === "contact" ? "Ce qui s'est dit" : "Note"} htmlFor="ct-text">
            <Textarea id="ct-text" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
