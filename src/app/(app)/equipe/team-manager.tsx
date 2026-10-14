"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Copy, KeyRound, Pencil, Plus, RefreshCw, ShieldOff, UserMinus } from "lucide-react";
import {
  createCollaboratorAction,
  moveCollaboratorAction,
  regenerateTeamPasswordAction,
  removeCollaboratorAction,
  resetCollaboratorPasswordAction,
  setCollaboratorAccessAction,
  setCollaboratorRoleAction,
  updateCollaboratorAction,
} from "@/server/actions/team";
import { TEAM_ROLES, TEAM_ROLE_LABELS, type TeamRole } from "@/core/team/rules";
import { MemberEditModal } from "@/components/team/member-edit-modal";
import { InvitationsPanel, JoinRequestsPanel, type InvitationItem, type JoinRequestItem } from "./access-panels";
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
  phone: string | null;
  rppsNumber: string | null;
  role: TeamRole;
  isActive: boolean;
  /** Le titulaire principal : celui que PharmaBoost contacte (contrat, facture, accès). */
  isPrincipal: boolean;
  /** Le compte travaille aussi dans une autre officine : son identité ne se modifie pas d'ici. */
  sharedAccount: boolean;
  lastLoginAt: string | null;
  isSelf: boolean;
  /** Quand la personne a rejoint l'équipe. */
  joinedAt: string;
  /** Le comptoir où elle travaille (« Comptoir 2 »), s'il y en a un. */
  comptoir: string | null;
};

type AssignableRole = "PHARMACIST" | "TECHNICIAN" | "STUDENT" | "VIEWER";

/** Les postes qu'on peut donner à quelqu'un qu'on AJOUTE : devenir titulaire passe par « Modifier ». */
const ROLE_OPTIONS = TEAM_ROLES.filter((role): role is (typeof TEAM_ROLES)[number] & { value: AssignableRole } => role.value !== "OWNER");

/**
 * L'équipe de l'officine.
 *
 * Un titulaire ne gère pas des « utilisateurs » : il ouvre un accès à quelqu'un qui arrive, le suspend quand il part,
 * corrige un nom, change un poste, choisit qui est le titulaire principal et dans quel ordre l'équipe se présente. Les
 * gestes sont visibles sans ouvrir de sous-écran, et un poste est expliqué en une ligne plutôt qu'une matrice de
 * permissions. Le serveur applique les règles (une officine garde toujours un titulaire actif et un titulaire principal) ;
 * l'écran n'offre que ce qui passera, et dit pourquoi quand un geste est refusé.
 */
export function TeamManager({ teamPassword, members, canManageOwners, requests, invitations }: { teamPassword: { password: string; updatedAt: string } | null; members: TeamMember[]; canManageOwners: boolean; requests: JoinRequestItem[]; invitations: InvitationItem[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<TeamMember | null>(null);
  const [editFor, setEditFor] = useState<TeamMember | null>(null);
  // Retirer quelqu'un de l'équipe demande une confirmation, sur sa ligne.
  const [removing, setRemoving] = useState<string | null>(null);
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

  // Les postes proposés dans la liste : « Titulaire » seulement à un titulaire (nommer un associé est son affaire).
  const roleChoices = TEAM_ROLES.filter((role) => canManageOwners || role.value !== "OWNER");

  return (
    <div className="space-y-4">
      {teamPassword && <TeamPasswordCard password={teamPassword.password} />}

      <JoinRequestsPanel requests={requests} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13.5px] text-text-secondary">
          {members.filter((m) => m.isActive).length} accès actif
          {members.filter((m) => m.isActive).length > 1 ? "s" : ""} sur {members.length}
          {invitations.length > 0 ? ` · ${invitations.length} invitation${invitations.length > 1 ? "s" : ""} sans réponse` : ""}
        </p>
        <Button onClick={() => setAddOpen(true)} leadingIcon={<Plus className="size-4" />}>
          Ajouter un membre
        </Button>
      </div>

      <InvitationsPanel invitations={invitations} />

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border-subtle">
            {members.map((member, index) => (
              <li
                key={member.userId}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5",
                  !member.isActive && "bg-surface-sunken/50",
                )}
              >
                <span className="flex flex-col" role="group" aria-label={`Place de ${member.firstName} dans la liste`}>
                  <button
                    type="button"
                    disabled={pending || index === 0}
                    aria-label={`Monter ${member.firstName} ${member.lastName}`}
                    title="Monter"
                    onClick={() => run(() => moveCollaboratorAction({ userId: member.userId, direction: "up" }))}
                    className="rounded p-0.5 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === members.length - 1}
                    aria-label={`Descendre ${member.firstName} ${member.lastName}`}
                    title="Descendre"
                    onClick={() => run(() => moveCollaboratorAction({ userId: member.userId, direction: "down" }))}
                    className="rounded p-0.5 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                </span>

                <Avatar
                  initials={`${member.firstName.at(0) ?? ""}${member.lastName.at(0) ?? ""}`.toUpperCase()}
                  name={`${member.firstName} ${member.lastName}`}
                  size="md"
                />

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-text-primary">
                    {member.firstName} {member.lastName.toUpperCase()}
                    {member.isSelf && <Badge tone="neutral">Vous</Badge>}
                    {member.isPrincipal && <Badge tone="brand">Titulaire principal</Badge>}
                    {!member.isActive && <Badge tone="warning">Accès suspendu</Badge>}
                  </p>
                  <p className="truncate text-[12.5px] text-text-tertiary">
                    {member.email}
                    {member.lastLoginAt
                      ? ` · vu ${formatRelative(member.lastLoginAt)}`
                      : " · jamais connecté"}
                  </p>
                  <p className="text-[12.5px] text-text-tertiary">
                    A rejoint l&apos;équipe {formatRelative(member.joinedAt)}
                    {member.comptoir ? <> · <span className="font-medium text-text-secondary">{member.comptoir}</span></> : " · aucun comptoir"}
                  </p>
                </div>

                {member.isPrincipal ? (
                  // Le titulaire principal ne change pas de poste : on en désigne un autre à sa place (« Modifier »).
                  <span className="w-[150px] text-[13.5px] font-medium text-text-primary">{TEAM_ROLE_LABELS[member.role]}</span>
                ) : member.role === "OWNER" && !canManageOwners ? (
                  <Badge tone="brand">Titulaire</Badge>
                ) : (
                  <Select
                    aria-label={`Poste de ${member.firstName}`}
                    value={member.role}
                    disabled={pending}
                    onChange={(event) => run(() => setCollaboratorRoleAction({ userId: member.userId, role: event.target.value as TeamRole }))}
                    className="w-[150px]"
                  >
                    {roleChoices.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditFor(member)} leadingIcon={<Pencil className="size-4" />}>
                    Modifier
                  </Button>
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
                  {!member.isSelf && (member.role !== "OWNER" || canManageOwners) &&
                    (removing === member.userId ? (
                      <span className="flex items-center gap-1.5">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            setRemoving(null);
                            run(() => removeCollaboratorAction({ userId: member.userId }));
                          }}
                        >
                          Confirmer le retrait
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRemoving(null)}>
                          Annuler
                        </Button>
                      </span>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRemoving(member.userId)} leadingIcon={<UserMinus className="size-4" />}>
                        Retirer
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
      <PasswordModal member={passwordFor} onClose={() => setPasswordFor(null)} />
      <MemberEditModal
        member={editFor}
        canManageOwners={canManageOwners}
        onSave={(changes) => updateCollaboratorAction({ userId: editFor!.userId, ...changes })}
        onClose={() => setEditFor(null)}
      />
    </div>
  );
}

function AddMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "PHARMACIST" as AssignableRole,
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
      setForm({ firstName: "", lastName: "", email: "", role: "PHARMACIST" });
      onClose();
    });
  };

  const hint = ROLE_OPTIONS.find((option) => option.value === form.role)?.hint;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter un membre de l'équipe"
      description="Il se connectera sur son poste avec cette adresse e-mail et le mot de passe de l'officine."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending} leadingIcon={<Plus className="size-4" />}>
            Ajouter
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

        <Field label="Adresse e-mail" htmlFor="email" required hint="Celle qu'il tapera sur son poste pour se connecter.">
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

/**
 * Le mot de passe de l'officine, en haut de Mon équipe : le titulaire le lit, le copie, le change. Chaque membre de l'équipe se
 * connecte sur son poste avec SON adresse e-mail et ce mot de passe ; les titulaires gardent leur mot de passe personnel.
 */
function TeamPasswordCard({ password }: { password: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const copy = () => {
    navigator.clipboard
      ?.writeText(password)
      .then(() => push({ tone: "success", title: "Mot de passe copié" }))
      .catch(() => push({ tone: "error", title: "Copie impossible : recopiez-le à la main." }));
  };
  const regenerate = () =>
    startTransition(async () => {
      const result = await regenerateTeamPasswordAction();
      setConfirming(false);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Nouveau mot de passe créé") : (result.error ?? "Erreur") });
    });

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
            <KeyRound className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-text-primary">Mot de passe de l&apos;officine</h2>
            <p className="mt-0.5 text-[13.5px] text-text-secondary">
              Sur chaque poste, chaque membre de l&apos;équipe se connecte avec <strong>son adresse e-mail</strong> et <strong>ce mot de passe</strong>. Ajoutez
              d&apos;abord son adresse ci-dessous. Vous, titulaire, gardez votre mot de passe personnel.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <code aria-label="Mot de passe de l'officine" className="rounded-lg border border-border-default bg-surface-sunken px-4 py-2 font-mono text-[20px] font-semibold tracking-[0.12em] text-text-primary select-all">
            {password}
          </code>
          <Button variant="secondary" onClick={copy} leadingIcon={<Copy className="size-4" />}>
            Copier
          </Button>
          {confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-text-secondary">L&apos;ancien ne marchera plus, l&apos;équipe devra se reconnecter.</span>
              <Button variant="danger" onClick={regenerate} loading={pending}>
                Confirmer
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                Annuler
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)} leadingIcon={<RefreshCw className="size-4" />}>
              Changer le mot de passe
            </Button>
          )}
        </div>
        <p className="text-[12.5px] text-text-tertiary">Quelqu&apos;un quitte l&apos;équipe ? Retirez-le de la liste : il ne peut plus se connecter. Changez le mot de passe s&apos;il l&apos;a noté ailleurs.</p>
      </CardContent>
    </Card>
  );
}
