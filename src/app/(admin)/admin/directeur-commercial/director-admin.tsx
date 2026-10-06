"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Power, Trash2, UserPlus } from "lucide-react";
import { createSalesDirectorAction, deleteSalesDirectorAction, resendDirectorInvitationAction, setSalesDirectorActiveAction, updateSalesDirectorAction } from "@/server/actions/admin-sales-director";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/admin/confirm-action";

type Identity = { firstName: string; lastName: string; email: string; phone: string };
const EMPTY: Identity = { firstName: "", lastName: "", email: "", phone: "" };

/** L'issue de l'envoi après la création : dite telle quelle, jamais embellie. */
type Outcome = { name: string; email: string; sent: boolean; detail: string };

/**
 * Ajouter un directeur : prénom, nom, e-mail, téléphone. Le compte est créé et
 * l'invitation part toute seule ; le résultat réel de l'envoi reste affiché
 * sous le formulaire (le message qui disparaît d'un toast ne suffit pas).
 */
export function AddDirectorForm() {
  const [values, setValues] = useState<Identity>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const set = (key: keyof Identity) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value });

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setErrors({});
          setFormError(null);
          setOutcome(null);
          start(async () => {
            const result = await createSalesDirectorAction(values);
            if (!result.ok) {
              setErrors(result.fieldErrors ?? {});
              setFormError(result.error);
              return;
            }
            const sent = result.data.invitation.status === "SENT";
            setOutcome({ name: `${values.firstName.trim()} ${values.lastName.trim()}`, email: result.data.email, sent, detail: result.data.invitation.detail });
            push({ tone: sent ? "success" : "warning", title: result.message ?? "Directeur ajouté." });
            setValues(EMPTY);
            router.refresh();
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="dir-first" required error={errors.firstName}>
            <Input id="dir-first" value={values.firstName} onChange={set("firstName")} autoComplete="off" aria-invalid={Boolean(errors.firstName)} />
          </Field>
          <Field label="Nom" htmlFor="dir-last" required error={errors.lastName}>
            <Input id="dir-last" value={values.lastName} onChange={set("lastName")} autoComplete="off" aria-invalid={Boolean(errors.lastName)} />
          </Field>
          <Field label="E-mail" htmlFor="dir-email" required hint="Son identifiant de connexion. L'invitation part à cette adresse." error={errors.email}>
            <Input id="dir-email" type="email" value={values.email} onChange={set("email")} autoComplete="off" aria-invalid={Boolean(errors.email)} />
          </Field>
          <Field label="Téléphone" htmlFor="dir-phone" hint="Facultatif." error={errors.phone}>
            <Input id="dir-phone" type="tel" value={values.phone} onChange={set("phone")} autoComplete="off" aria-invalid={Boolean(errors.phone)} />
          </Field>
        </div>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" loading={pending} leadingIcon={<UserPlus className="size-4" />}>
            Ajouter et inviter
          </Button>
          <p className="text-[13px] text-text-secondary">Un e-mail d&apos;invitation lui est envoyé automatiquement.</p>
        </div>
      </form>

      {outcome &&
        (outcome.sent ? (
          <Alert tone="success" title="Invitation envoyée">
            {outcome.name} a reçu un e-mail à {outcome.email}, avec un lien personnel valable 7 jours pour choisir son mot de passe. Son espace est créé.
          </Alert>
        ) : (
          <Alert tone="warning" title="Compte créé, invitation non envoyée">
            L&apos;espace de {outcome.name} est créé, mais l&apos;e-mail n&apos;est pas parti : {outcome.detail}. Utilisez « Renvoyer l&apos;invitation » dans la liste ci-dessous.
          </Alert>
        ))}
    </div>
  );
}

/** Corriger l'identité. Changer l'adresse invalide le lien déjà envoyé : le dit avant, pas après. */
function EditDirectorButton({ salesDirectorId, initial }: { salesDirectorId: string; initial: Identity }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const set = (key: keyof Identity) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value });

  const close = () => {
    if (pending) return;
    setOpen(false);
    setErrors({});
    setFormError(null);
  };
  const submit = () => {
    setErrors({});
    setFormError(null);
    start(async () => {
      const result = await updateSalesDirectorAction({ salesDirectorId, ...values });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré." });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="ghost" leadingIcon={<Pencil className="size-3.5" />} onClick={() => { setValues(initial); setOpen(true); }}>
        Modifier
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Modifier le directeur commercial"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} loading={pending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="dir-edit-first" required error={errors.firstName}>
              <Input id="dir-edit-first" value={values.firstName} onChange={set("firstName")} autoComplete="off" />
            </Field>
            <Field label="Nom" htmlFor="dir-edit-last" required error={errors.lastName}>
              <Input id="dir-edit-last" value={values.lastName} onChange={set("lastName")} autoComplete="off" />
            </Field>
            <Field label="E-mail" htmlFor="dir-edit-email" required hint="Changer l'adresse invalide le lien déjà envoyé : il faudra renvoyer l'invitation." error={errors.email}>
              <Input id="dir-edit-email" type="email" value={values.email} onChange={set("email")} autoComplete="off" />
            </Field>
            <Field label="Téléphone" htmlFor="dir-edit-phone" error={errors.phone}>
              <Input id="dir-edit-phone" type="tel" value={values.phone} onChange={set("phone")} autoComplete="off" />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Les gestes sur un compte. Renvoyer l'invitation et réactiver sont directs ;
 * désactiver et supprimer passent par une confirmation qui dit ce qui va se
 * passer. Le serveur revérifie tout : ces fenêtres protègent d'un clic
 * malheureux, pas d'un appel malveillant.
 */
export function DirectorActions({ salesDirectorId, name, isActive, identity }: { salesDirectorId: string; name: string; isActive: boolean; identity: Identity }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await fn();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : (result.error ?? "Erreur") });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-1 lg:justify-end">
      {isActive && (
        <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Mail className="size-3.5" />} onClick={() => run(() => resendDirectorInvitationAction({ salesDirectorId }))}>
          Renvoyer l&apos;invitation
        </Button>
      )}
      <EditDirectorButton salesDirectorId={salesDirectorId} initial={identity} />
      {isActive ? (
        <ConfirmAction
          label="Désactiver"
          title={`Désactiver le compte de ${name} ?`}
          consequences={["Ses sessions ouvertes sont fermées immédiatement.", "Il ne peut plus se connecter à son espace tant que son compte n'est pas réactivé.", "Les commerciaux, dossiers, commissions, factures et challenges ne changent pas."]}
          confirmLabel="Désactiver le compte"
          tone="danger"
          variant="ghost"
          icon={<Power className="size-3.5" />}
          onConfirm={() => setSalesDirectorActiveAction({ salesDirectorId, isActive: false })}
        />
      ) : (
        <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Power className="size-3.5" />} onClick={() => run(() => setSalesDirectorActiveAction({ salesDirectorId, isActive: true }))}>
          Réactiver
        </Button>
      )}
      <ConfirmAction
        label="Supprimer"
        title={`Supprimer définitivement le compte de ${name} ?`}
        description="Ce geste est irréversible."
        consequences={["Le compte et ses sessions sont supprimés : il ne pourra plus se connecter.", "Les commerciaux, dossiers, commissions, factures et challenges restent en place.", "Ses gestes passés restent dans le journal d'audit."]}
        confirmLabel="Supprimer le compte"
        tone="danger"
        variant="ghost"
        typedConfirmation="SUPPRIMER"
        icon={<Trash2 className="size-3.5" />}
        onConfirm={() => deleteSalesDirectorAction({ salesDirectorId })}
      />
    </div>
  );
}
