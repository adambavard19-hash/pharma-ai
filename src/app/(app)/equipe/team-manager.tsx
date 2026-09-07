"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, Plus, ShieldOff, UserPlus } from "lucide-react";
import {
  createCollaboratorAction,
  resetCollaboratorPasswordAction,
  setCollaboratorAccessAction,
  setCollaboratorRoleAction,
} from "@/server/actions/team";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TeamMember = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  isSelf: boolean;
};

type AssignableRole = "PHARMACIST" | "TECHNICIAN" | "STUDENT" | "VIEWER";

const ROLE_OPTIONS: { value: AssignableRole; label: string; hint: string }[] = [
  { value: "PHARMACIST", label: "Pharmacien", hint: "Vérifie les ordonnances et valide les conseils" },
  { value: "TECHNICIAN", label: "Préparateur", hint: "Comptoir, patients et stock" },
  { value: "STUDENT", label: "Étudiant", hint: "Consultation et préparation, sans validation" },
  { value: "VIEWER", label: "Consultation", hint: "Lecture seule" },
];


/**
 * L'équipe de l'officine.
 *
 * Un titulaire ne gère pas des « utilisateurs » : il ouvre un accès à quelqu'un
 * qui arrive, le suspend quand il part. D'où trois gestes seulement, visibles
 * sans ouvrir de sous-écran, et un rôle expliqué en une ligne plutôt qu'une
 * matrice de permissions.
 */
export function TeamManager({ members }: { members: TeamMember[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<TeamMember | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await action();
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Erreur"),
      });
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13.5px] text-text-secondary">
          {members.filter((m) => m.isActive).length} accès actif
          {members.filter((m) => m.isActive).length > 1 ? "s" : ""} sur {members.length}
        </p>
        <Button onClick={() => setAddOpen(true)} leadingIcon={<UserPlus className="size-[18px]" />}>
          Ajouter un collaborateur
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border-subtle">
            {members.map((member) => (
              <li
                key={member.userId}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5",
                  !member.isActive && "bg-surface-sunken/50",
                )}
              >
                <Avatar
                  initials={`${member.firstName.at(0) ?? ""}${member.lastName.at(0) ?? ""}`.toUpperCase()}
                  name={`${member.firstName} ${member.lastName}`}
                  size="md"
                />

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-text-primary">
                    {member.firstName} {member.lastName.toUpperCase()}
                    {member.isSelf && <Badge tone="neutral">Vous</Badge>}
                    {!member.isActive && <Badge tone="warning">Accès suspendu</Badge>}
                  </p>
                  <p className="truncate text-[12.5px] text-text-tertiary">
                    {member.email}
                    {member.lastLoginAt
                      ? ` · vu ${formatRelative(member.lastLoginAt)}`
                      : " · jamais connecté"}
                  </p>
                </div>

                {member.role === "OWNER" ? (
                  <Badge tone="brand">Titulaire</Badge>
                ) : (
                  <Select
                    aria-label={`Rôle de ${member.firstName}`}
                    value={member.role}
                    disabled={pending}
                    onChange={(event) =>
                      run(() =>
                        setCollaboratorRoleAction({
                          userId: member.userId,
                          role: event.target.value as AssignableRole,
                        }),
                      )
                    }
                    className="w-[150px]"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPasswordFor(member)}
                    leadingIcon={<KeyRound className="size-4" />}
                  >
                    Mot de passe
                  </Button>
                  {!member.isSelf && member.role !== "OWNER" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setCollaboratorAccessAction({
                            userId: member.userId,
                            isActive: !member.isActive,
                          }),
                        )
                      }
                      leadingIcon={
                        member.isActive ? (
                          <ShieldOff className="size-4" />
                        ) : (
                          <Check className="size-4" />
                        )
                      }
                    >
                      {member.isActive ? "Suspendre" : "Rétablir"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
      <PasswordModal member={passwordFor} onClose={() => setPasswordFor(null)} />
    </div>
  );
}

function AddMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "PHARMACIST" as AssignableRole,
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createCollaboratorAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Collaborateur ajouté" });
      setForm({ firstName: "", lastName: "", email: "", role: "PHARMACIST", password: "" });
      onClose();
    });
  };

  const hint = ROLE_OPTIONS.find((option) => option.value === form.role)?.hint;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter un collaborateur"
      description="Il se connectera avec son adresse et le mot de passe que vous lui remettez."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending} leadingIcon={<Plus className="size-4" />}>
            Créer l&apos;accès
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="firstName" required>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field label="Nom" htmlFor="lastName" required>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Adresse e-mail" htmlFor="email" required hint="Son identifiant de connexion.">
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Rôle" htmlFor="role" hint={hint}>
          <Select
            id="role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as AssignableRole })}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Mot de passe initial"
          htmlFor="password"
          required
          hint="12 caractères minimum, avec majuscule et chiffre. À lui remettre en main propre."
        >
          <Input
            id="password"
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

function PasswordModal({
  member,
  onClose,
}: {
  member: TeamMember | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    if (!member) return;
    setError(null);
    startTransition(async () => {
      const result = await resetCollaboratorPasswordAction({ userId: member.userId, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Mot de passe défini" });
      setPassword("");
      onClose();
    });
  };

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title="Nouveau mot de passe"
      description={
        member ? `${member.firstName} ${member.lastName} sera déconnecté de ses appareils.` : ""
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending} disabled={!password}>
            Définir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field
          label="Mot de passe"
          htmlFor="new-password"
          hint="12 caractères minimum, avec majuscule et chiffre."
        >
          <Input
            id="new-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
