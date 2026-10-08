"use client";

import { useState, useTransition } from "react";
import { TEAM_ROLES, type TeamRole } from "@/core/team/rules";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/actions/types";

export type EditableMember = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  rppsNumber: string | null;
  role: TeamRole;
  isPrincipal: boolean;
  /** Le compte travaille aussi dans une autre officine. */
  sharedAccount: boolean;
  /** C'est la personne connectée. */
  isSelf: boolean;
};

/** Ce que la fenêtre envoie : seulement des valeurs ; le serveur compare à l'existant et n'écrit que ce qui change. */
export type MemberEdit = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  rppsNumber?: string | null;
  role: TeamRole;
  isPrincipal: boolean;
};

/**
 * « Modifier » un collaborateur : prénom, nom, adresse, téléphone, RPPS, poste, titulaire principal — dans l'espace du
 * titulaire comme dans celui de l'administrateur. Les changements s'enregistrent ensemble : si l'un est refusé, aucun ne
 * l'est (le serveur applique les règles de l'équipe, voir `core/team/rules.ts`).
 *
 * Dans l'espace du titulaire, l'identité d'un compte partagé avec une autre officine et sa propre adresse de connexion
 * sont verrouillées, avec la raison. L'administrateur (`admin`) peut tout corriger.
 */
export function MemberEditModal({ member, canManageOwners, admin = false, onSave, onClose }: { member: EditableMember | null; canManageOwners: boolean; admin?: boolean; onSave: (changes: MemberEdit) => Promise<ActionResult<unknown>>; onClose: () => void }) {
  // Les champs repartent des valeurs du collaborateur à chaque ouverture : le formulaire est remonté (clé) pour cela.
  return member ? <MemberEditForm key={member.userId} member={member} canManageOwners={canManageOwners} admin={admin} onSave={onSave} onClose={onClose} /> : null;
}

function MemberEditForm({ member, canManageOwners, admin, onSave, onClose }: { member: EditableMember; canManageOwners: boolean; admin: boolean; onSave: (changes: MemberEdit) => Promise<ActionResult<unknown>>; onClose: () => void }) {
  const [form, setForm] = useState({
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone ?? "",
    rppsNumber: member.rppsNumber ?? "",
    role: member.role,
    isPrincipal: member.isPrincipal,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const identityLocked = !admin && member.sharedAccount && !member.isSelf;
  const emailLocked = !admin && (identityLocked || member.isSelf);
  const choices = TEAM_ROLES.filter((role) => canManageOwners || role.value !== "OWNER" || member.role === "OWNER");
  const hint = TEAM_ROLES.find((role) => role.value === form.role)?.hint;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await onSave({
        ...(identityLocked ? {} : { firstName: form.firstName, lastName: form.lastName, phone: form.phone.trim() || null, rppsNumber: form.rppsNumber.trim() || null }),
        ...(emailLocked ? {} : { email: form.email }),
        role: form.role,
        isPrincipal: form.role === "OWNER" ? form.isPrincipal : false,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré" });
      onClose();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Modifier ${member.firstName} ${member.lastName}`}
      description="Les changements s'enregistrent ensemble : si l'un est refusé, aucun ne l'est."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {identityLocked && (
          <Alert tone="info">Ce compte travaille aussi dans une autre officine : son nom, son adresse et ses coordonnées ne se modifient pas depuis la vôtre. Vous pouvez en revanche changer son poste ici.</Alert>
        )}
        {admin && member.sharedAccount && (
          <Alert tone="warning">Ce compte travaille dans plusieurs officines : son nom et ses coordonnées changeront dans toutes.</Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="edit-firstName" required>
            <Input id="edit-firstName" value={form.firstName} disabled={identityLocked} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Nom" htmlFor="edit-lastName" required>
            <Input id="edit-lastName" value={form.lastName} disabled={identityLocked} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>

        <Field
          label="Adresse e-mail"
          htmlFor="edit-email"
          hint={emailLocked && member.isSelf ? "Votre adresse de connexion ne se change pas d'ici (vous seriez déconnecté) : demandez-le à PharmaBoost." : "Son identifiant de connexion. La changer ferme ses sessions ouvertes."}
        >
          <Input id="edit-email" type="email" value={form.email} disabled={emailLocked} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone" htmlFor="edit-phone">
            <Input id="edit-phone" type="tel" value={form.phone} disabled={identityLocked} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="N° RPPS" htmlFor="edit-rpps" hint="Pour un pharmacien.">
            <Input id="edit-rpps" inputMode="numeric" value={form.rppsNumber} disabled={identityLocked} onChange={(e) => setForm({ ...form, rppsNumber: e.target.value })} />
          </Field>
        </div>

        <Field label="Poste" htmlFor="edit-role" hint={hint}>
          <Select
            id="edit-role"
            value={form.role}
            // Le titulaire principal garde son poste : pour le changer, on désigne d'abord un autre principal.
            disabled={member.isPrincipal}
            onChange={(e) => setForm({ ...form, role: e.target.value as TeamRole, isPrincipal: e.target.value === "OWNER" ? form.isPrincipal : false })}
          >
            {choices.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {form.role === "OWNER" && (
          <label className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3", form.isPrincipal ? "border-brand-300 bg-brand-50/60" : "border-border-subtle")}>
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={form.isPrincipal}
              disabled={member.isPrincipal || !canManageOwners}
              onChange={(e) => setForm({ ...form, isPrincipal: e.target.checked })}
            />
            <span>
              <span className="block text-[13.5px] font-medium text-text-primary">Titulaire principal</span>
              <span className="block text-[12.5px] leading-5 text-text-secondary">
                {member.isPrincipal
                  ? "C'est lui que PharmaBoost contacte (contrat, facture, accès). Pour en changer, désignez un autre titulaire principal : il lui passe la main."
                  : "PharmaBoost le contactera pour le contrat, la facture et l'accès. L'actuel titulaire principal reste titulaire."}
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
