"use client";

import { useState, useTransition } from "react";
import { Mail, Send } from "lucide-react";
import { changePharmacyEmailAction, resendOwnerAccessAction } from "@/server/actions/platform-onboarding";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Renvoyer au titulaire son e-mail de bienvenue (ou un lien d'accès s'il s'est déjà connecté). */
export function ResendAccessButton({ pharmacyId, neverLoggedIn }: { pharmacyId: string; neverLoggedIn: boolean }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      leadingIcon={<Send className="size-4" />}
      onClick={() =>
        start(async () => {
          const result = await resendOwnerAccessAction({ pharmacyId });
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Envoyé") : result.error });
        })
      }
    >
      {neverLoggedIn ? "Renvoyer l'invitation" : "Renvoyer un lien d'accès"}
    </Button>
  );
}

/**
 * « Modifier l'e-mail » : deux adresses différentes, choisies explicitement.
 * Le contact est une coordonnée ; la connexion est l'identifiant du titulaire.
 */
export function ChangeEmailButton({ pharmacyId, contactEmail, loginEmail }: { pharmacyId: string; contactEmail: string | null; loginEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"login" | "contact">(loginEmail ? "login" : "contact");
  const [email, setEmail] = useState("");
  const [resend, setResend] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();

  const current = target === "login" ? loginEmail : contactEmail;
  const submit = () => {
    setError(null);
    start(async () => {
      const result = await changePharmacyEmailAction({ pharmacyId, target, email, resend });
      if (!result.ok) return setError(result.error);
      push({ tone: "success", title: result.message ?? "Adresse modifiée" });
      setOpen(false);
      setEmail("");
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" leadingIcon={<Mail className="size-4" />} onClick={() => setOpen(true)}>
        Modifier l&apos;e-mail
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Modifier l'e-mail"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={submit} loading={pending}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Adresse à modifier">
            {[
              { key: "login" as const, title: "Connexion du titulaire", hint: "Son identifiant pour se connecter", disabled: !loginEmail },
              { key: "contact" as const, title: "Contact de l'officine", hint: "Coordonnée, sans effet sur la connexion", disabled: false },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={target === opt.key}
                disabled={opt.disabled}
                onClick={() => setTarget(opt.key)}
                className={cn("rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-40", target === opt.key ? "border-brand-500 bg-brand-50" : "border-border-default hover:bg-surface-sunken")}
              >
                <span className="block text-[13.5px] font-semibold text-text-primary">{opt.title}</span>
                <span className="block text-[12px] text-text-secondary">{opt.hint}</span>
              </button>
            ))}
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-[13px] text-text-secondary">Actuelle : <span className="font-medium text-text-primary">{current ?? "aucune"}</span></p>
          <Field label="Nouvelle adresse" htmlFor="newEmail" required={target === "login"}>
            <Input id="newEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@pharmacie.fr" autoFocus />
          </Field>
          {target === "login" && (
            <>
              <label className="flex items-start gap-2.5 text-[13px] text-text-primary">
                <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} className="mt-0.5" />
                Envoyer l&apos;accès à la nouvelle adresse
              </label>
              <p className="text-[12.5px] leading-5 text-text-tertiary">Le lien d&apos;accès en attente est annulé et les sessions du titulaire sont fermées. L&apos;adresse du dossier suit, sauf si un contrat est déjà parti. Le changement est tracé.</p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
