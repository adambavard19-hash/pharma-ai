"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { createCancellationAction } from "@/server/actions/admin-billing";
import { CANCELLATION_CHANNELS, CANCELLATION_REASONS } from "@/core/admin/statuses";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

export type CancellationPharmacyOption = { id: string; name: string; city: string | null; hasOpenRequest: boolean; hasSubscription: boolean; suggestedEndAt: string | null };

function todayInParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * « Enregistrer une demande de résiliation » : l'officine (choisie, ou fixée
 * depuis sa fiche), le motif, le canal, la date de la demande et la fin
 * prévue (suggérée : fin de la période en cours). Enregistrer ne coupe rien.
 */
export function CreateCancellationButton({
  pharmacies,
  fixedPharmacy,
  label = "Enregistrer une demande de résiliation",
  variant = "outline",
  size = "sm",
}: {
  /** La liste à proposer (création depuis la liste des résiliations). */
  pharmacies?: CancellationPharmacyOption[];
  /** L'officine imposée (création depuis sa fiche abonnement). */
  fixedPharmacy?: CancellationPharmacyOption;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [pharmacyId, setPharmacyId] = useState(fixedPharmacy?.id ?? "");
  const [reason, setReason] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [channel, setChannel] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const options = fixedPharmacy ? [fixedPharmacy] : (pharmacies ?? []);
  const selected = options.find((p) => p.id === pharmacyId) ?? null;
  const blocked = selected?.hasOpenRequest ?? false;

  const openModal = () => {
    setRequestedAt(todayInParis());
    setPlannedEndAt(fixedPharmacy?.suggestedEndAt ?? "");
    setError(null);
    setFieldErrors({});
    setOpen(true);
  };

  const choose = (id: string) => {
    setPharmacyId(id);
    const next = options.find((p) => p.id === id);
    setPlannedEndAt(next?.suggestedEndAt ?? "");
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await createCancellationAction({ pharmacyId, reason, reasonDetail: reasonDetail || null, channel, requestedAt, plannedEndAt: plannedEndAt || null });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Demande enregistrée." });
      setOpen(false);
      router.push(`/admin/resiliations/${result.data.id}`);
    });

  return (
    <>
      <Button size={size} variant={variant} leadingIcon={<FilePlus2 className="size-4" />} onClick={openModal} disabled={fixedPharmacy?.hasOpenRequest}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        size="lg"
        title="Enregistrer une demande de résiliation"
        description="Enregistrer ne coupe rien : l'abonnement et l'accès continuent. Traitement, confirmation et fin chez Stripe sont des gestes séparés, confirmés un par un."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button loading={pending} disabled={!pharmacyId || !reason || !channel || !requestedAt || blocked} onClick={submit}>
              Enregistrer la demande
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {fixedPharmacy ? (
            <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[13.5px] text-text-primary">
              Officine : <strong className="font-semibold">{fixedPharmacy.name}</strong>
              {fixedPharmacy.city ? ` — ${fixedPharmacy.city}` : ""}
            </p>
          ) : (
            <Field label="Officine" htmlFor="cr-pharmacy" required error={fieldErrors.pharmacyId ?? (blocked ? "Une demande est déjà ouverte pour cette officine." : null)}>
              <Select id="cr-pharmacy" value={pharmacyId} onChange={(e) => choose(e.target.value)}>
                <option value="">Choisir une officine…</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.hasOpenRequest}>
                    {p.name}
                    {p.city ? ` — ${p.city}` : ""}
                    {p.hasOpenRequest ? " (demande déjà ouverte)" : !p.hasSubscription ? " (sans abonnement)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Motif" htmlFor="cr-reason" required error={fieldErrors.reason}>
              <Select id="cr-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choisir…</option>
                {Object.entries(CANCELLATION_REASONS).map(([code, text]) => (
                  <option key={code} value={code}>
                    {text}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reçue par" htmlFor="cr-channel" required error={fieldErrors.channel}>
              <Select id="cr-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">Choisir…</option>
                {Object.entries(CANCELLATION_CHANNELS).map(([code, text]) => (
                  <option key={code} value={code}>
                    {text}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date de la demande" htmlFor="cr-requested" required error={fieldErrors.requestedAt}>
              <Input id="cr-requested" type="date" value={requestedAt} max={todayInParis()} onChange={(e) => setRequestedAt(e.target.value)} />
            </Field>
            <Field label="Fin prévue" htmlFor="cr-end" error={fieldErrors.plannedEndAt} hint={selected?.suggestedEndAt ? "Suggérée : fin de la période en cours de l'abonnement." : "Facultative ; se précise à la confirmation."}>
              <Input id="cr-end" type="date" value={plannedEndAt} min={requestedAt || undefined} onChange={(e) => setPlannedEndAt(e.target.value)} />
            </Field>
          </div>
          <Field label="Précisions" htmlFor="cr-detail" hint="Ce que le titulaire a dit, dans ses mots. Interne : jamais visible de l'officine.">
            <Textarea id="cr-detail" rows={3} maxLength={1000} value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
