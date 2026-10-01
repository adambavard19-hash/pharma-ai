import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { AdminActions, AddAdminForm } from "./admin-team";

export const metadata: Metadata = { title: "Équipe PharmaBoost" };

/** Les comptes qui ont accès à cette console. Chacun reçoit son lien par e-mail. */
export default async function PlatformTeamPage() {
  const session = await requirePlatformSession();
  const admins = await prisma.platformAdmin.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }], select: { id: true, email: true, firstName: true, lastName: true, isActive: true, lastLoginAt: true, createdAt: true } });
  return (
    <div className="space-y-6">
      <PageHeader title="Équipe PharmaBoost" description="Les administrateurs de la console. Un compte, un e-mail, un lien pour définir son mot de passe." />
      <Card>
        <CardHeader title="Ajouter un administrateur" description="Il reçoit un e-mail avec un lien valable quelques heures pour choisir son mot de passe, puis se connecte sur pharmaboost.app/login." />
        <CardContent className="pb-5">
          <AddAdminForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader title={`${admins.length} compte${admins.length > 1 ? "s" : ""}`} />
        <CardContent className="p-0">
          <ul className="divide-y divide-border-subtle">
            {admins.map((admin) => (
              <li key={admin.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-text-primary">{admin.firstName} {admin.lastName.toUpperCase()}{admin.id === session.admin.id ? " (vous)" : ""}</span>
                  <span className="block truncate text-[12px] text-text-tertiary">{admin.email}{admin.lastLoginAt ? ` · vu ${formatRelative(admin.lastLoginAt)}` : " · jamais connecté"}</span>
                </span>
                <Badge tone={admin.isActive ? "success" : "warning"}>{admin.isActive ? "Actif" : "Désactivé"}</Badge>
                <AdminActions adminId={admin.id} isActive={admin.isActive} isSelf={admin.id === session.admin.id} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
