"use client";

import { useState, useTransition } from "react";
import { Check, Clock, MailPlus, RefreshCw, Send, UserCheck, X } from "lucide-react";
import { approveJoinRequestAction, inviteCollaboratorsAction, refuseJoinRequestAction, resendInvitationAction, revokeInvitationAction } from "@/server/actions/team-access";
import { TEAM_ROLES, TEAM_ROLE_LABELS, type TeamRole } from "@/core/team/rules";
import { INVITABLE_ROLES, MAX_INVITES_AT_ONCE, parseEmails } from "@/core/team/access";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/format";

export type JoinRequestItem = { id: string; name: string; email: string; suggestedRole: TeamRole; requestedAt: string };
export type InvitationItem = { id: string; email: string; role: TeamRole; state: "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED"; sentAt: string; sentCount: number };

const ROLE_CHOICES = TEAM_ROLES.filter((role) => (INVITABLE_ROLES as readonly string[]).includes(role.value));

function useRun() {
  const [pending, start] = useTransition();
  const { push } = useToast();
  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait") : (result.error ?? "Erreur") });
    });
  return { pending, run };
}

/** Les demandes de rattachement : en tête de page tant qu'il y en a, parce que quelqu'un attend la réponse du titulaire. */
export function JoinRequestsPanel({ requests }: { requests: JoinRequestItem[] }) {
  const { pending, run } = useRun();
  const [roles, setRoles] = useState<Record<string, string>>({});
  if (requests.length === 0) return null;
  return (
    <Card className="border-warning-300 dark:border-warning-700">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold text-text-primary">Demandes de rattachement</h2>
          <Badge tone="warning">{requests.length} en attente</Badge>
        </div>
        <p className="text-[13px] text-text-secondary">Ces personnes demandent à rejoindre votre officine. Tant que vous n&apos;avez pas approuvé, elles n&apos;ont accès à rien.</p>
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block text-[14px] font-medium text-text-primary">{request.name}</span>
                <span className="block truncate text-[12.5px] text-text-tertiary">
                  {request.email} · demandé {formatRelative(request.requestedAt)}
                </span>
              </span>
              <Select aria-label={`Poste de ${request.name}`} className="w-[150px]" value={roles[request.id] ?? request.suggestedRole} onChange={(event) => setRoles({ ...roles, [request.id]: event.target.value })}>
                {ROLE_CHOICES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
              <span className="flex gap-2">
                <Button size="sm" disabled={pending} leadingIcon={<Check className="size-4" />} onClick={() => run(() => approveJoinRequestAction({ id: request.id, role: roles[request.id] ?? request.suggestedRole }))}>
                  Approuver
                </Button>
                <Button size="sm" variant="secondary" disabled={pending} leadingIcon={<X className="size-4" />} onClick={() => run(() => refuseJoinRequestAction({ id: request.id }))}>
                  Refuser
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Les invitations envoyées et pas encore acceptées : qui n'a pas encore répondu, avec de quoi relancer ou annuler. */
export function InvitationsPanel({ invitations }: { invitations: InvitationItem[] }) {
  const { pending, run } = useRun();
  if (invitations.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold text-text-primary">Invitations envoyées</h2>
          <Badge tone="info">{invitations.length} sans réponse</Badge>
        </div>
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate text-[14px] font-medium text-text-primary">{invitation.email}</span>
                <span className="block text-[12.5px] text-text-tertiary">
                  {TEAM_ROLE_LABELS[invitation.role]} · envoyée {formatRelative(invitation.sentAt)}
                  {invitation.sentCount > 1 ? ` (${invitation.sentCount} fois)` : ""}
                </span>
              </span>
              {invitation.state === "EXPIRED" ? (
                <Badge tone="warning" className="gap-1">
                  <Clock className="size-3.5" />
                  Lien expiré
                </Badge>
              ) : (
                <Badge tone="neutral">En attente</Badge>
              )}
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={pending} leadingIcon={<RefreshCw className="size-4" />} onClick={() => run(() => resendInvitationAction({ id: invitation.id }))}>
                  Renvoyer
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} leadingIcon={<X className="size-4" />} onClick={() => run(() => revokeInvitationAction({ id: invitation.id }))}>
                  Annuler
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Inviter : on colle les adresses (une ou toute l'équipe), on choisit le poste, chacun reçoit son lien personnel. */
export function InviteModal({ open, onClose, onManual }: { open: boolean; onClose: () => void; onManual: () => void }) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<string>("PHARMACIST");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();
  const parsed = parseEmails(emails);

  const submit = () => {
    setError(null);
    if (parsed.valid.length === 0) return setError("Saisissez au moins une adresse e-mail.");
    start(async () => {
      const result = await inviteCollaboratorsAction({ emails, role });
      if (!result.ok) return setError(result.error);
      push({ tone: "success", title: result.message ?? "Invitations envoyées" });
      setEmails("");
      onClose();
    });
  };

  const hint = ROLE_CHOICES.find((option) => option.value === role)?.hint;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Inviter des collaborateurs"
      description="Chacun reçoit un lien personnel pour créer son compte et rejoindre votre officine avec le poste que vous choisissez."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending} disabled={parsed.valid.length === 0} leadingIcon={<Send className="size-4" />}>
            {parsed.valid.length > 1 ? `Envoyer ${parsed.valid.length} invitations` : "Envoyer l'invitation"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Adresses e-mail" htmlFor="invite-emails" required hint={`Une par ligne, ou séparées par des virgules (${MAX_INVITES_AT_ONCE} au plus).${parsed.invalid.length > 0 ? ` À corriger : ${parsed.invalid.slice(0, 2).join(", ")}` : ""}`}>
          <Textarea id="invite-emails" rows={4} value={emails} onChange={(event) => setEmails(event.target.value)} placeholder={"claire@exemple.fr\nhugo@exemple.fr"} />
        </Field>
        <Field label="Poste" htmlFor="invite-role" hint={hint}>
          <Select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_CHOICES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-[12.5px] text-text-secondary">
          Pas d&apos;adresse e-mail ?{" "}
          <button type="button" onClick={onManual} className="text-brand-700 underline underline-offset-2 dark:text-brand-400">
            Créer l&apos;accès avec un mot de passe que vous remettez
          </button>
          .
        </p>
      </div>
    </Modal>
  );
}

export function InviteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} leadingIcon={<MailPlus className="size-[18px]" />}>
      Inviter des collaborateurs
    </Button>
  );
}

export function AcceptedMark() {
  return <UserCheck className="size-4 text-success-600" aria-hidden />;
}
