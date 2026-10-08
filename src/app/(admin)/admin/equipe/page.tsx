import type { Metadata } from "next";
import { Clock, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/lib/format";
import { formatFrenchDate } from "@/core/billing/subscription";
import { AdminActions, AddAdminForm } from "./admin-team";

export const metadata: Metadata = { title: "Équipe PharmaBoost" };

/** Où en est un compte qui ne s'est jamais connecté : lien encore valable, expiré, ou mot de passe déjà choisi. */
function invitationState(admin: { lastLoginAt: Date | null; passwordResetExpiresAt: Date | null }, now: Date): { label: string; tone: "info" | "warning" | "neutral"; hint?: string } | null {
  if (admin.lastLoginAt) return null;
  if (admin.passwordResetExpiresAt && admin.passwordResetExpiresAt > now) return { label: "Invitation en attente", tone: "info", hint: `lien valable jusqu'au ${formatFrenchDate(admin.passwordResetExpiresAt)}` };
  if (admin.passwordResetExpiresAt) return { label: "Lien expiré", tone: "warning", hint: "renvoyez-lui le lien" };
  return { label: "Jamais connecté", tone: "neutral" };
}

/** Les comptes qui ont accès à cette console. Chacun reçoit son lien par e-mail. */
export default async function PlatformTeamPage() {
  const session = await requirePlatformSession();
  const admins = await prisma.platformAdmin.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true, lastLoginAt: true, createdAt: true, passwordResetExpiresAt: true },
  });
  const now = new Date();
  const active = admins.filter((a) => a.isActive).length;
  const pending = admins.filter((a) => a.isActive && !a.lastLoginAt).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Équipe PharmaBoost"
        description="Les administrateurs de la console. Un compte, un e-mail, un lien pour définir son mot de passe."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Comptes" value={admins.length} icon={<ShieldCheck className="size-4" />} />
        <KpiTile label="Actifs" value={active} tone={active > 0 ? "success" : "danger"} icon={<UserCheck className="size-4" />} />
        <KpiTile label="Jamais connectés" value={pending} hint="comptes actifs" tone={pending > 0 ? "warning" : "default"} icon={<Clock className="size-4" />} />
        <KpiTile label="Désactivés" value={admins.length - active} icon={<UserX className="size-4" />} />
      </div>

      <AdminSection id="inviter" title="Inviter un administrateur" description="Il reçoit un e-mail avec un lien valable 7 jours pour choisir son mot de passe, puis se connecte sur pharmaboost.app/login.">
        <AddAdminForm />
      </AdminSection>

      <AdminSection title="Administrateurs" description={`${admins.length} compte${admins.length > 1 ? "s" : ""} · ${active} actif${active > 1 ? "s" : ""}`} padded={false}>
        {admins.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-5" />} title="Aucun administrateur pour l'instant" description="Invitez le premier compte ci-dessus." />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Nom</TH>
                  <TH>E-mail</TH>
                  <TH>Statut</TH>
                  <TH>Dernière connexion</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {admins.map((admin) => {
                  const isSelf = admin.id === session.admin.id;
                  const invitation = invitationState(admin, now);
                  const initials = `${admin.firstName.at(0) ?? ""}${admin.lastName.at(0) ?? ""}`.toUpperCase();
                  return (
                    <TR key={admin.id} interactive>
                      <TD>
                        <span className="flex items-center gap-2.5">
                          <span className={admin.isActive ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100" : "flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[12px] font-semibold text-text-tertiary"} aria-hidden="true">
                            {initials}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-medium text-text-primary">
                              {admin.firstName} {admin.lastName.toUpperCase()}
                              {isSelf && <span className="ml-1.5 text-[12px] font-normal text-text-tertiary">(vous)</span>}
                            </span>
                            <span className="block text-[12px] text-text-tertiary">depuis le {formatFrenchDate(admin.createdAt)}</span>
                          </span>
                        </span>
                      </TD>
                      <TD className="text-[13px] text-text-secondary">{admin.email}</TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={admin.isActive ? "success" : "warning"}>{admin.isActive ? "Actif" : "Désactivé"}</Badge>
                          {admin.isActive && invitation && <Badge tone={invitation.tone}>{invitation.label}</Badge>}
                        </span>
                        {admin.isActive && invitation?.hint && <span className="mt-1 block text-[12px] text-text-tertiary">{invitation.hint}</span>}
                      </TD>
                      <TD className="text-[13px] text-text-secondary">
                        {admin.lastLoginAt ? <span title={formatDateTime(admin.lastLoginAt)}>{formatRelative(admin.lastLoginAt)}</span> : <span className="text-text-tertiary">Jamais</span>}
                      </TD>
                      <TD className="text-right">
                        <AdminActions adminId={admin.id} name={`${admin.firstName} ${admin.lastName}`} isActive={admin.isActive} isSelf={isSelf} />
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
