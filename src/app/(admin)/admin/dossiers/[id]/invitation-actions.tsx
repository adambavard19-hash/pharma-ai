"use client";

import { useState, useTransition } from "react";
import { Copy, Mail, Send } from "lucide-react";
import { changeInvitationEmailAction, copyInvitationLinkAction, resendInvitationAction } from "@/server/actions/platform-onboarding";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

export function InvitationActions({ prospectId, email }: { prospectId: string; email: string }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" leadingIcon={<Send className="size-4" />} loading={pending} onClick={() => run(async () => {
          const r = await resendInvitationAction({ prospectId });
          push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Invitation envoyée") : r.error });
        })}>
          Renvoyer l&apos;invitation
        </Button>
        <Button size="sm" variant="outline" leadingIcon={<Mail className="size-4" />} onClick={() => { setEditing(true); setError(null); }}>
          Modifier l&apos;e-mail
        </Button>
        <Button size="sm" variant="ghost" leadingIcon={<Copy className="size-4" />} onClick={() => run(async () => {
          const r = await copyInvitationLinkAction({ prospectId });
          if (!r.ok) return push({ tone: "error", title: r.error });
          setLink(r.data.url);
          try { await navigator.clipboard.writeText(r.data.url); push({ tone: "success", title: "Nouveau lien copié. L'ancien ne fonctionne plus." }); } catch { push({ tone: "info", title: "Nouveau lien prêt : copiez-le ci-dessous." }); }
        })}>
          Copier un nouveau lien
        </Button>
      </div>
      {link && <p className="rounded-lg bg-surface-sunken px-3 py-2 font-mono text-[12px] break-all text-text-secondary">{link}</p>}

      <Modal open={editing} onClose={() => setEditing(false)} title="Corriger l'adresse de l'invitation" footer={
        <>
          <Button variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
          <Button loading={pending} onClick={() => run(async () => {
            setError(null);
            const r = await changeInvitationEmailAction({ prospectId, email: newEmail, resend: true });
            if (!r.ok) return setError(r.error);
            push({ tone: "success", title: r.message ?? "Adresse corrigée" });
            setEditing(false);
            setNewEmail("");
          })}>Corriger et renvoyer</Button>
        </>
      }>
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-[13px] text-text-secondary">Actuelle : <span className="font-medium text-text-primary">{email}</span>. L&apos;ancien lien cesse de fonctionner, la nouvelle invitation part aussitôt.</p>
          <Field label="Nouvelle adresse" htmlFor="invitation-email" required>
            <Input id="invitation-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
