import { Users } from "lucide-react";
import type { Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { ownerAccessSummary } from "@/server/services/pharmacy-admin";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { DispatchStatusBadge, StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatFrenchDate } from "@/core/billing/subscription";
import { ROLE_LABELS, userAccessState } from "@/core/admin/clients";
import { MemberActions } from "../member-actions";
import { When } from "../client-ui";
import { AddOwnerButton } from "./owner-form";
import { ChangeEmailButton, ResendAccessButton } from "./access-actions";

const FAILED = new Set(["FAILED", "BOUNCED", "COMPLAINED", "SIMULATED"]);

/** Les comptes rattachés à l'officine et l'accès du titulaire. */
export async function UsersTab({ base }: { base: Pharmacy360 }) {
  const { pharmacy } = base;
  const access = await ownerAccessSummary(pharmacy.id);

  return (
    <div className="space-y-5">
      <AdminSection
        title="Accès du titulaire"
        description="Son identifiant de connexion et le dernier e-mail d'accès envoyé."
        action={
          <>
            <ChangeEmailButton pharmacyId={pharmacy.id} contactEmail={pharmacy.email} loginEmail={access?.owner.email ?? null} />
            {access ? <ResendAccessButton pharmacyId={pharmacy.id} neverLoggedIn={!access.owner.lastLoginAt} /> : <AddOwnerButton pharmacyId={pharmacy.id} />}
          </>
        }
      >
        {access ? (
          <div className="space-y-4">
            <FactList
              className="lg:grid-cols-3"
              items={[
                { label: "Identifiant de connexion", value: access.owner.email, hint: `${access.owner.firstName} ${access.owner.lastName.toUpperCase()}` },
                { label: "Dernière connexion", value: access.owner.lastLoginAt ? <When date={access.owner.lastLoginAt} /> : <Badge tone="warning">Jamais connecté</Badge> },
                {
                  label: "Dernier e-mail d'accès",
                  value: access.lastDispatch ? <DispatchStatusBadge status={access.lastDispatch.status} /> : "Aucun envoi tracé",
                  hint: access.lastDispatch ? `${formatFrenchDate(access.lastDispatch.createdAt)} · ${access.lastDispatch.recipient}` : undefined,
                },
              ]}
            />
            {access.lastDispatch && FAILED.has(access.lastDispatch.status) && (
              <Alert tone="warning">
                {access.lastDispatch.detail ?? "Envoi en échec."} Corrigez l&apos;adresse avec « Modifier l&apos;e-mail », puis renvoyez l&apos;invitation.
              </Alert>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">Aucun titulaire actif : ajoutez-en un, il recevra son invitation.</p>
        )}
      </AdminSection>

      <AdminSection title="Comptes" description="Qui peut se connecter à cette officine." action={access ? <AddOwnerButton pharmacyId={pharmacy.id} /> : undefined} padded={pharmacy.memberships.length === 0}>
        {pharmacy.memberships.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="Aucun compte pour l'instant" description="Ajoutez un titulaire pour ouvrir l'accès." />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Compte</TH>
                  <TH>Rôle</TH>
                  <TH>Statut</TH>
                  <TH>Dernière connexion</TH>
                  <TH>Rattaché le</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {pharmacy.memberships.map((m) => {
                  const state = userAccessState({ status: m.user.status, memberships: [{ isActive: m.isActive }] });
                  return (
                    <TR key={m.id}>
                      <TD>
                        <span className="block text-[13.5px] font-medium text-text-primary">
                          {m.user.firstName} {m.user.lastName.toUpperCase()}
                        </span>
                        <span className="block text-[12px] text-text-tertiary">{m.user.email}</span>
                      </TD>
                      <TD>
                        <Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{ROLE_LABELS[m.role] ?? m.role}</Badge>
                      </TD>
                      <TD>
                        <StatusBadge status={state} />
                      </TD>
                      <TD>
                        <When date={m.user.lastLoginAt} empty="Jamais" className="text-[13px]" />
                      </TD>
                      <TD className="text-[13px] text-text-secondary">{formatFrenchDate(m.createdAt)}</TD>
                      <TD>
                        <MemberActions pharmacyId={pharmacy.id} membershipId={m.id} isActive={m.isActive} name={`${m.user.firstName} ${m.user.lastName}`} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>
    </div>
  );
}
