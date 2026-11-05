"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { refreshAffiliateContractAction, saveCompanySignatureAction, saveCountersignerAction, sendAffiliateContractAction } from "@/server/actions/admin-contracts";

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

/**
 * La signature de la société (fondateur, 5 nov. 2026) : une photo de la signature du représentant légal (tampon compris),
 * déposée une fois. PharmaBoost signe alors d'office chaque contrat à l'envoi ; le titulaire signe, le contrat est complet.
 */
export function CompanySignatureForm({ current }: { current: { image: string; uploadedAt: string } | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  const save = (image: string | null) =>
    startTransition(async () => {
      const result = await saveCompanySignatureAction({ image });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setPreview(null);
      push({ tone: "success", title: result.message ?? "Enregistré." });
      router.refresh();
    });
  const shown = preview ?? current?.image ?? null;
  return (
    <div className="space-y-3">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- une data URL déposée par l'admin, jamais une image distante
        <img src={shown} alt="Signature de la société" className="h-24 max-w-xs rounded-lg border border-border-subtle bg-white object-contain p-2" />
      ) : (
        <p className="text-[13px] text-text-secondary">Aucune signature déposée : chaque contrat signé par le titulaire attend votre contresignature (« À contresigner par moi »).</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border-default px-3 text-[13px] font-semibold text-text-primary hover:border-brand-400">
          {current ? "Remplacer l'image" : "Choisir l'image (PNG ou JPEG)"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 600 * 1024) {
                setError("Image trop lourde : 600 Ko au plus.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : null);
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {preview && (
          <Button size="sm" loading={pending} onClick={() => save(preview)}>
            Enregistrer cette signature
          </Button>
        )}
        {current && !preview && (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => save(null)}>
            Retirer
          </Button>
        )}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
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
