import Link from "next/link";
import { ArrowRight, UserCog } from "lucide-react";
import { directorInvitationState, type SalesDirectorRow } from "@/server/services/sales/directors";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { AddDirectorForm, DirectorActions } from "./director-admin";

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * L'écran « Directeur commercial », sans accès aux données : il reçoit ce
 * qu'il affiche. La page lit la base derrière la session de la console ; cette
 * séparation permet de relire l'écran sans compte.
 */
export function DirectorsView({ directors, team, now }: { directors: SalesDirectorRow[]; team: { active: number; total: number }; now: Date }) {
  const active = directors.filter((director) => director.isActive).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Commercial", href: "/admin/pipeline" }}
        title="Directeur commercial"
        description="Le compte qui gère l'équipe commerciale depuis son propre espace : commerciaux, candidatures, commissions, factures et challenges."
      />

      <Alert tone="info" title="Une seule équipe, des deux côtés">
        Les commerciaux que vous ajoutez ici apparaissent aussi dans l&apos;espace du directeur.{" "}
        {team.total === 0 ? "Aucun commercial pour l'instant." : `Il voit aujourd'hui ${plural(team.total, "commercial", "commerciaux")}, dont ${plural(team.active, "actif", "actifs")}.`}{" "}
        <Link href="/admin/commerciaux" className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline">
          Voir les commerciaux <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Alert>

      <AdminSection id="ajouter" title="Ajouter un directeur commercial" description="Il reçoit un lien personnel pour choisir son mot de passe, puis se connecte à son espace.">
        <AddDirectorForm />
      </AdminSection>

      <AdminSection
        title="Directeurs commerciaux"
        description={directors.length === 0 ? undefined : `${plural(directors.length, "compte", "comptes")} · ${plural(active, "actif", "actifs")}`}
        action={
          <Link href="/directeur/connexion" className="text-[13px] font-medium text-brand-700 underline underline-offset-2 hover:no-underline dark:text-brand-400">
            Page de connexion du directeur
          </Link>
        }
        padded={false}
      >
        {directors.length === 0 ? (
          <EmptyState icon={<UserCog className="size-5" />} title="Aucun directeur commercial pour l'instant" description="Ajoutez-le ci-dessus : il reçoit un e-mail pour créer son espace, puis gère lui-même l'équipe commerciale." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {directors.map((director) => (
              <DirectorItem key={director.id} director={director} now={now} />
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}

function DirectorItem({ director, now }: { director: SalesDirectorRow; now: Date }) {
  const name = `${director.firstName} ${director.lastName}`;
  const initials = `${director.firstName.at(0) ?? ""}${director.lastName.at(0) ?? ""}`.toUpperCase();
  const invitation = directorInvitationState(director, now);
  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="flex min-w-0 items-center gap-3 lg:basis-1/3">
        <span
          className={director.isActive ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100" : "flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[12px] font-semibold text-text-tertiary"}
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-text-primary">{name}</p>
          <p className="truncate text-[12.5px] text-text-secondary">{director.email}</p>
          {director.phone && <p className="truncate text-[12.5px] text-text-tertiary">{director.phone}</p>}
        </div>
      </div>

      <div className="min-w-0 space-y-1 lg:basis-1/3">
        <p className="flex flex-wrap items-center gap-1.5">
          <Badge tone={director.isActive ? "success" : "warning"}>{director.isActive ? "Actif" : "Désactivé"}</Badge>
          {director.isActive && <Badge tone={invitation.tone}>{invitation.label}</Badge>}
        </p>
        <p className="text-[12.5px] text-text-secondary">
          {director.invitedAt ? `Invitation envoyée le ${formatDate(director.invitedAt)}` : "Invitation jamais envoyée"}
          {" · "}
          {director.lastLoginAt ? <span title={formatDateTime(director.lastLoginAt)}>dernière connexion {formatRelative(director.lastLoginAt)}</span> : "jamais connecté"}
        </p>
        {director.isActive && invitation.hint && <p className="text-[12px] text-text-tertiary">{invitation.hint}</p>}
        {!director.isActive && <p className="text-[12px] text-text-tertiary">Il ne peut plus se connecter.</p>}
      </div>

      <div className="lg:basis-1/3">
        <DirectorActions salesDirectorId={director.id} name={name} isActive={director.isActive} identity={{ firstName: director.firstName, lastName: director.lastName, email: director.email, phone: director.phone ?? "" }} />
      </div>
    </li>
  );
}
