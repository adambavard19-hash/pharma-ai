"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Power, Trash2, UserPlus } from "lucide-react";
import { createPlatformAdminAction, deletePlatformAdminAction, resendPlatformAdminLinkAction, setPlatformAdminActiveAction } from "@/server/actions/platform-admins";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/admin/confirm-action";

/** Invitation d'un administrateur : prénom, nom, e-mail. Le mot de passe, il le choisit lui-même. */
export function AddAdminForm() {
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <form
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await createPlatformAdminAction(form);
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Créé.") : result.error });
          if (result.ok) {
            setForm({ email: "", firstName: "", lastName: "" });
            router.refresh();
          }
        });
      }}
    >
      <Field label="Prénom" htmlFor="admin-first">
        <Input id="admin-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required autoComplete="off" />
      </Field>
      <Field label="Nom" htmlFor="admin-last">
        <Input id="admin-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required autoComplete="off" />
      </Field>
      <Field label="E-mail" htmlFor="admin-email" className="sm:col-span-2 lg:col-span-1">
        <Input id="admin-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="off" />
      </Field>
      <Button type="submit" loading={pending} leadingIcon={<UserPlus className="size-4" />} className="sm:col-span-2 lg:col-span-1">
        Inviter
      </Button>
    </form>
  );
}

/**
 * Les gestes sur un compte. Renvoyer le lien et réactiver sont directs ;
 * désactiver et supprimer passent par une confirmation, et la suppression
 * exige de retaper « SUPPRIMER ». Le serveur revérifie chaque garde-fou.
 */
export function AdminActions({ adminId, name, isActive, isSelf }: { adminId: string; name: string; isActive: boolean; isSelf: boolean }) {
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
    <span className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Mail className="size-3.5" />} onClick={() => run(() => resendPlatformAdminLinkAction({ adminId }))}>
        Renvoyer le lien
      </Button>
      {!isSelf && (
        <>
          {isActive ? (
            <ConfirmAction
              label="Désactiver"
              title={`Désactiver le compte de ${name} ?`}
              consequences={["Ses sessions ouvertes sont fermées immédiatement.", "Il ne peut plus se connecter tant que son compte n'est pas réactivé.", "Ses actions passées restent dans le journal d'audit."]}
              confirmLabel="Désactiver le compte"
              tone="danger"
              variant="ghost"
              icon={<Power className="size-3.5" />}
              onConfirm={() => setPlatformAdminActiveAction({ adminId, isActive: false })}
            />
          ) : (
            <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Power className="size-3.5" />} onClick={() => run(() => setPlatformAdminActiveAction({ adminId, isActive: true }))}>
              Réactiver
            </Button>
          )}
          <ConfirmAction
            label="Supprimer"
            title={`Supprimer définitivement le compte de ${name} ?`}
            description="Ce geste est irréversible."
            consequences={["Le compte est supprimé : il ne pourra plus se connecter à la console.", "Ses actions passées restent dans le journal d'audit.", "Il doit rester au moins un autre administrateur actif."]}
            confirmLabel="Supprimer le compte"
            tone="danger"
            variant="ghost"
            typedConfirmation="SUPPRIMER"
            icon={<Trash2 className="size-3.5" />}
            onConfirm={() => deletePlatformAdminAction({ adminId })}
          />
        </>
      )}
    </span>
  );
}
