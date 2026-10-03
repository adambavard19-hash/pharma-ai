"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Mail, Plus } from "lucide-react";
import {
  createClientPharmacyAction,
  updateClientPharmacyAction,
} from "@/server/actions/platform-pharmacies";
import { inviteOwnerAction } from "@/server/actions/platform-onboarding";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

export type PharmacyFormValues = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  finessNumber: string;
  siret: string;
  brandColor: string;
  postCount: string;
};

const EMPTY: PharmacyFormValues = {
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  postalCode: "",
  city: "",
  finessNumber: "",
  siret: "",
  brandColor: "#0F766E",
  postCount: "",
};

/**
 * Nouvelle officine cliente, deux gestes :
 *  A. « Créer l'officine » : l'éditeur connaît tout, l'officine, son titulaire
 *     et son dossier sont créés ensemble ; la bienvenue part au titulaire.
 *  B. « Inviter le titulaire » : seule l'adresse est connue ; un dossier
 *     « Officine à compléter » s'ouvre et le titulaire le remplit lui-même.
 */
export function CreatePharmacyButton({ openFromAddress = false }: { openFromAddress?: boolean } = {}) {
  const [open, setOpenState] = useState(false);
  // `openFromAddress` : la fenêtre s'ouvre d'elle-même quand l'adresse porte
  // « ?nouveau=officine » (action rapide de l'en-tête), y compris si l'on est
  // déjà sur la page. Ajustement pendant le rendu, sans effet.
  const wanted = useSearchParams().get("nouveau") === "officine" && openFromAddress;
  const [lastWanted, setLastWanted] = useState(false);
  if (wanted !== lastWanted) {
    setLastWanted(wanted);
    if (wanted) setOpenState(true);
  }
  const setOpen = (next: boolean) => {
    setOpenState(next);
    // Une fois refermée, l'adresse perd « nouveau=officine » : recharger la page ne la rouvre pas.
    if (!next && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("nouveau")) {
        url.searchParams.delete("nouveau");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    }
  };
  const [mode, setMode] = useState<"create" | "invite">("create");
  const [values, setValues] = useState<PharmacyFormValues>(EMPTY);
  const [owner, setOwner] = useState({ ownerFirstName: "", ownerLastName: "", ownerEmail: "", lgo: "", referralCode: "" });
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const reset = () => {
    setValues(EMPTY);
    setOwner({ ownerFirstName: "", ownerLastName: "", ownerEmail: "", lgo: "", referralCode: "" });
    setInviteEmail("");
    setError(null);
    setFieldErrors({});
  };

  const submit = () => {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      if (mode === "invite") {
        const result = await inviteOwnerAction({ email: inviteEmail });
        if (!result.ok) {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        push({ tone: result.data.sent ? "success" : "warning", title: result.message ?? "Invitation créée" });
        reset();
        setOpen(false);
        router.push(`/admin/dossiers/${result.data.prospectId}`);
        return;
      }
      const result = await createClientPharmacyAction({ ...values, ...owner });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Officine créée" });
      reset();
      setOpen(false);
      router.push(`/admin/pharmacies/${result.data.pharmacyId}`);
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} leadingIcon={<Plus className="size-[18px]" />}>
        Nouvelle officine
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle officine cliente"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            {mode === "invite" ? (
              <Button onClick={submit} loading={pending} leadingIcon={<Mail className="size-4" />}>
                Envoyer l&apos;invitation
              </Button>
            ) : (
              <Button onClick={submit} loading={pending} leadingIcon={<Building2 className="size-4" />}>
                Créer l&apos;officine
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-sunken p-1" role="tablist" aria-label="Façon d'ajouter l'officine">
            {[
              { key: "create" as const, title: "Créer l'officine", hint: "J'ai toutes les informations" },
              { key: "invite" as const, title: "Inviter le titulaire", hint: "Je n'ai que son e-mail" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={mode === tab.key}
                onClick={() => { setMode(tab.key); setError(null); setFieldErrors({}); }}
                className={cn("rounded-lg px-3 py-2.5 text-left transition-colors", mode === tab.key ? "bg-surface-card shadow-sm" : "hover:bg-surface-card/60")}
              >
                <span className="block text-[13.5px] font-semibold text-text-primary">{tab.title}</span>
                <span className="block text-[12px] text-text-secondary">{tab.hint}</span>
              </button>
            ))}
          </div>

          {error && <Alert tone="danger">{error}</Alert>}

          {mode === "invite" ? (
            <div className="space-y-3">
              <Field label="E-mail du titulaire" htmlFor="inviteEmail" required error={fieldErrors.email}>
                <Input id="inviteEmail" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="titulaire@pharmacie.fr" autoFocus />
              </Field>
              <p className="text-[12.5px] leading-5 text-text-tertiary">
                Il reçoit « Bienvenue chez PharmaBoost » avec un lien personnel, valable 7 jours, pour compléter lui-même la fiche de son officine. La fiche apparaît aussitôt ici, « à compléter ».
              </p>
            </div>
          ) : (
            <>
              <PharmacyFields values={values} onChange={setValues} errors={fieldErrors} />

              <div className="space-y-4 border-t border-border-subtle pt-5">
                <p className="text-[13px] font-semibold text-text-primary">Titulaire</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Prénom" htmlFor="ownerFirstName" required error={fieldErrors.ownerFirstName}>
                    <Input id="ownerFirstName" value={owner.ownerFirstName} onChange={(e) => setOwner({ ...owner, ownerFirstName: e.target.value })} />
                  </Field>
                  <Field label="Nom" htmlFor="ownerLastName" required error={fieldErrors.ownerLastName}>
                    <Input id="ownerLastName" value={owner.ownerLastName} onChange={(e) => setOwner({ ...owner, ownerLastName: e.target.value })} />
                  </Field>
                </div>
                <Field label="E-mail du titulaire (identifiant)" htmlFor="ownerEmail" required hint="Son identifiant de connexion : l'e-mail de bienvenue part à cette adresse." error={fieldErrors.ownerEmail}>
                  <Input id="ownerEmail" type="email" value={owner.ownerEmail} onChange={(e) => setOwner({ ...owner, ownerEmail: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Logiciel de gestion" htmlFor="lgo" hint="Facultatif.">
                    <Select id="lgo" value={owner.lgo} onChange={(e) => setOwner({ ...owner, lgo: e.target.value })}>
                      <option value="">Je ne sais pas encore</option>
                      {LGO_DEFINITIONS.filter((lgo) => lgo.id !== "autre").map((lgo) => (
                        <option key={lgo.id} value={lgo.id}>{lgo.label} — {lgo.editor}</option>
                      ))}
                      <option value="autre">Autre</option>
                    </Select>
                  </Field>
                  <Field label="Code de parrainage" htmlFor="referralCode" hint="Facultatif." error={fieldErrors.referralCode}>
                    <Input id="referralCode" value={owner.referralCode} onChange={(e) => setOwner({ ...owner, referralCode: e.target.value.toUpperCase() })} placeholder="PB-XXXXXX" />
                  </Field>
                </div>
                <p className="text-[12.5px] leading-5 text-text-tertiary">Le titulaire reçoit un lien sécurisé pour choisir son mot de passe. Aucun mot de passe ne transite par ici.</p>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

export function EditPharmacyButton({
  pharmacyId,
  initial,
}: {
  pharmacyId: string;
  initial: PharmacyFormValues;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateClientPharmacyAction({ pharmacyId, ...values });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré" });
      setOpen(false);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Modifier
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Modifier l'officine"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} loading={pending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error && <Alert tone="danger">{error}</Alert>}
          <PharmacyFields values={values} onChange={setValues} errors={fieldErrors} />
        </div>
      </Modal>
    </>
  );
}

function PharmacyFields({
  values,
  onChange,
  errors = {},
}: {
  values: PharmacyFormValues;
  onChange: (values: PharmacyFormValues) => void;
  errors?: Record<string, string>;
}) {
  const set = (key: keyof PharmacyFormValues) => (value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="space-y-4">
      <Field label="Nom de l'officine" htmlFor="name" required error={errors.name}>
        <Input
          id="name"
          value={values.name}
          onChange={(e) => set("name")(e.target.value)}
          placeholder="Pharmacie du Marché"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail de contact de l'officine" htmlFor="email" hint="Coordonnée de l'officine, pas l'identifiant du titulaire." error={errors.email}>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email")(e.target.value)}
          />
        </Field>
        <Field label="Téléphone" htmlFor="phone">
          <Input id="phone" value={values.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
      </div>

      <Field label="Adresse" htmlFor="addressLine1">
        <Input
          id="addressLine1"
          value={values.addressLine1}
          onChange={(e) => set("addressLine1")(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Code postal" htmlFor="postalCode">
          <Input
            id="postalCode"
            value={values.postalCode}
            onChange={(e) => set("postalCode")(e.target.value)}
          />
        </Field>
        <Field label="Ville" htmlFor="city" className="sm:col-span-2">
          <Input id="city" value={values.city} onChange={(e) => set("city")(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SIRET" htmlFor="siret" hint="14 chiffres. Un SIRET déjà connu est refusé." error={errors.siret}>
          <Input id="siret" inputMode="numeric" value={values.siret} onChange={(e) => set("siret")(e.target.value)} />
        </Field>
        <Field label="FINESS (facultatif)" htmlFor="finessNumber" error={errors.finessNumber}>
          <Input id="finessNumber" inputMode="numeric" value={values.finessNumber} onChange={(e) => set("finessNumber")(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de postes" htmlFor="postCount" required hint="Postes de comptoir équipés de PharmaBoost." error={errors.postCount}>
          <Input id="postCount" type="number" min={1} max={99} inputMode="numeric" value={values.postCount} onChange={(e) => set("postCount")(e.target.value)} className="w-28" />
        </Field>
        <Field label="Couleur" htmlFor="brandColor" hint="Reprise sur le plan patient.">
          <Input
            id="brandColor"
            type="color"
            value={values.brandColor || "#0F766E"}
            onChange={(e) => set("brandColor")(e.target.value)}
            className="h-10 w-28 p-1"
          />
        </Field>
      </div>
    </div>
  );
}
