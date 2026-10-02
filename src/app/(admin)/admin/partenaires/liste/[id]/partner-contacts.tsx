"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { deletePartnerContactAction, savePartnerContactAction } from "@/server/actions/platform-partners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export type PartnerContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  receivesOrders: boolean;
};

/** Les contacts du partenaire : un principal, et ceux qui reçoivent les commandes transmises par e-mail. */
export function PartnerContacts({ partnerId, contacts }: { partnerId: string; contacts: PartnerContactRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [editing, setEditing] = useState<PartnerContactRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const remove = (contact: PartnerContactRow) =>
    start(async () => {
      const result = await deletePartnerContactAction({ partnerId, id: contact.id });
      setDeleting(null);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Contact supprimé.") : result.error });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <p className="text-[13px] text-text-secondary">Aucun contact enregistré.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {contacts.map((contact) => (
            <li key={contact.id} className="space-y-1.5 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-text-primary">
                    <UserRound className="size-3.5 text-text-tertiary" aria-hidden="true" />
                    {contact.firstName} {contact.lastName}
                    {contact.isPrimary && <Badge tone="brand">Principal</Badge>}
                    {contact.receivesOrders && <Badge tone="info">Reçoit les commandes</Badge>}
                  </p>
                  {contact.role && <p className="text-[12.5px] text-text-tertiary">{contact.role}</p>}
                  <p className="text-[12.5px] break-all text-text-secondary">{[contact.email, contact.phone].filter(Boolean).join(" · ") || "Ni e-mail ni téléphone"}</p>
                </div>
                {deleting === contact.id ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] text-text-secondary">Supprimer ce contact ?</span>
                    <Button size="sm" variant="danger" loading={pending} leadingIcon={<Check className="size-3.5" />} onClick={() => remove(contact)}>
                      Supprimer
                    </Button>
                    <Button size="sm" variant="ghost" leadingIcon={<X className="size-3.5" />} disabled={pending} onClick={() => setDeleting(null)}>
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(contact)}>
                      Modifier
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Supprimer ${contact.firstName} ${contact.lastName}`} leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(contact.id)}>
                      <span className="sr-only sm:not-sr-only">Supprimer</span>
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="outline" leadingIcon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
        Ajouter un contact
      </Button>
      {editing && <ContactModal partnerId={partnerId} contact={editing === "new" ? null : editing} isFirst={contacts.length === 0} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ContactModal({ partnerId, contact, isFirst, onClose }: { partnerId: string; contact: PartnerContactRow | null; isFirst: boolean; onClose: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [firstName, setFirstName] = useState(contact?.firstName ?? "");
  const [lastName, setLastName] = useState(contact?.lastName ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [isPrimary, setIsPrimary] = useState(contact?.isPrimary ?? isFirst);
  const [receivesOrders, setReceivesOrders] = useState(contact?.receivesOrders ?? false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await savePartnerContactAction({ partnerId, id: contact?.id ?? null, firstName, lastName, role, email, phone, isPrimary, receivesOrders });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Contact enregistré." });
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={contact ? `Modifier ${contact.firstName} ${contact.lastName}` : "Nouveau contact"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} disabled={!firstName.trim() || !lastName.trim()} onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="pc-first" required error={fieldErrors.firstName}>
            <Input id="pc-first" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Nom" htmlFor="pc-last" required error={fieldErrors.lastName}>
            <Input id="pc-last" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={120} autoComplete="off" />
          </Field>
        </div>
        <Field label="Fonction" htmlFor="pc-role" error={fieldErrors.role}>
          <Input id="pc-role" value={role} onChange={(event) => setRole(event.target.value)} maxLength={160} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="E-mail" htmlFor="pc-email" error={fieldErrors.email}>
            <Input id="pc-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="off" />
          </Field>
          <Field label="Téléphone" htmlFor="pc-phone" error={fieldErrors.phone}>
            <Input id="pc-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} autoComplete="off" />
          </Field>
        </div>
        <Checkbox id="pc-primary" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} label="Contact principal" description="Un seul par partenaire : cocher ici retire la mention de l'actuel." />
        <Checkbox id="pc-orders" checked={receivesOrders} onChange={(event) => setReceivesOrders(event.target.checked)} label="Reçoit les commandes" description="Destinataire des commandes et prises de contact transmises par e-mail. Une adresse e-mail est alors nécessaire." />
      </div>
    </Modal>
  );
}
