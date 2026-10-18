"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { refreshAffiliateContractAction, saveCountersignerAction, sendAffiliateContractAction } from "@/server/actions/admin-contracts";

/** Le signataire PharmaBoost des prochains contrats : une adresse, un nom facultatif. */
export function CountersignerForm({ initial, source }: { initial: { name: string; email: string }; source: "CONSOLE" | "ENV" | "DEFAULT" }) {
  const [email, setEmail] = useState(initial.email);
  const [name, setName] = useState(initial.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  const origin = source === "CONSOLE" ? "réglée ici" : source === "ENV" ? "lue dans la configuration du serveur" : "par défaut";

  return (
    <form
      noValidate
      className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveCountersignerAction({ email, name });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setError(null);
          push({ tone: "success", title: result.message ?? "Signataire enregistré." });
          router.refresh();
        });
      }}
    >
      <Field label="E-mail du signataire PharmaBoost" htmlFor="cs-email" hint={`Adresse ${origin}. Elle reçoit de DocuSeal chaque contrat à contresigner.`} error={error}>
        <Input id="cs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={Boolean(error)} />
      </Field>
      <Field label="Nom imprimé au contrat" htmlFor="cs-name" hint="Facultatif : par défaut, le représentant de la fiche Société.">
        <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <Button type="submit" size="sm" loading={pending}>
        Enregistrer
      </Button>
    </form>
  );
}

/** Envoyer le contrat d'affiliation à un affilié actif qui n'en a pas (ou dont le dernier est clos). */
export function SendAffiliateContractForm({ affiliates, signatureLive }: { affiliates: { id: string; name: string; email: string; hasDraft: boolean }[]; signatureLive: boolean }) {
  const [salesRepId, setSalesRepId] = useState(affiliates[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (affiliates.length === 0) return <p className="text-[13px] text-text-tertiary">Tous les affiliés actifs ont un contrat en cours ou signé.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Affilié" htmlFor="aff-rep" className="min-w-0 flex-1">
          <Select id="aff-rep" value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.email}
                {a.hasDraft ? " (brouillon prêt)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          size="sm"
          leadingIcon={<Send className="size-4" />}
          loading={pending}
          disabled={!salesRepId}
          onClick={() =>
            startTransition(async () => {
              const result = await sendAffiliateContractAction({ salesRepId });
              setMessage(result.ok ? { tone: result.message?.startsWith("Contrat généré (brouillon)") ? "info" : "success", text: result.message ?? "Fait." } : { tone: "danger", text: result.error });
              router.refresh();
            })
          }
        >
          {signatureLive ? "Envoyer le contrat d'affiliation" : "Générer le contrat (brouillon)"}
        </Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}

/** Relire chez le prestataire l'état d'un contrat d'affiliation. */
export function RefreshAffiliateButton({ contractId }: { contractId: string }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      leadingIcon={<RefreshCw className="size-4" />}
      loading={pending}
      title="Relire l'état chez le prestataire de signature"
      onClick={() =>
        startTransition(async () => {
          const result = await refreshAffiliateContractAction({ contractId });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Statut relu.") : result.error });
          router.refresh();
        })
      }
    >
      Actualiser
    </Button>
  );
}
