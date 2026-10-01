"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Power, Trash2, UserPlus } from "lucide-react";
import { createPlatformAdminAction, deletePlatformAdminAction, resendPlatformAdminLinkAction, setPlatformAdminActiveAction } from "@/server/actions/platform-admins";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function AddAdminForm() {
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
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
      <Field label="Prénom" htmlFor="admin-first"><Input id="admin-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required className="w-40" /></Field>
      <Field label="Nom" htmlFor="admin-last"><Input id="admin-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required className="w-40" /></Field>
      <Field label="E-mail" htmlFor="admin-email"><Input id="admin-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-72" /></Field>
      <Button type="submit" loading={pending} leadingIcon={<UserPlus className="size-4" />}>Inviter</Button>
    </form>
  );
}

export function AdminActions({ adminId, isActive, isSelf }: { adminId: string; isActive: boolean; isSelf: boolean }) {
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
    <span className="flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Mail className="size-3.5" />} onClick={() => run(() => resendPlatformAdminLinkAction({ adminId }))}>Renvoyer le lien</Button>
      {!isSelf && (
        <>
          <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Power className="size-3.5" />} onClick={() => run(() => setPlatformAdminActiveAction({ adminId, isActive: !isActive }))}>{isActive ? "Désactiver" : "Réactiver"}</Button>
          <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Trash2 className="size-3.5" />} onClick={() => { if (window.confirm("Supprimer définitivement ce compte administrateur ?")) run(() => deletePlatformAdminAction({ adminId })); }}>Supprimer</Button>
        </>
      )}
    </span>
  );
}
