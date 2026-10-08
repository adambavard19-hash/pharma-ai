import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, FlaskConical, ShieldOff } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadPlatformHealth, type HealthState } from "@/server/services/admin/platform-health";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { ServiceCard } from "./service-card";

export const metadata: Metadata = { title: "Paramètres" };

/**
 * Les paramètres de la plateforme : messagerie, paiement, signature, tâches
 * planifiées, webhooks, adresse publique, stockage, société exploitante.
 * Une carte par service, son état, et ce qu'il reste à faire. Aucun secret
 * n'est jamais affiché : présent ou absent, et le nom de la variable.
 */
export default async function PlatformSettingsPage() {
  await requirePlatformSession();
  const health = await loadPlatformHealth();
  const firstOf = (state: HealthState) => health.services.find((s) => s.state === state);
  const anchor = (state: HealthState) => {
    const service = firstOf(state);
    return service ? `#service-${service.key}` : undefined;
  };
  const toFix = health.counts.NOT_CONFIGURED + health.counts.INCOMPLETE;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Paramètres"
        description="L'état de chaque service de la plateforme et ce qu'il reste à faire. Les secrets ne s'affichent jamais : seulement s'ils sont présents, et le nom de la variable à renseigner."
        badge={<Badge tone={health.environment === "Production" ? "brand" : "neutral"}>{health.environment}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Configurés" value={health.counts.CONFIGURED} tone={health.counts.CONFIGURED > 0 ? "success" : "default"} href={anchor("CONFIGURED")} icon={<CheckCircle2 className="size-4" />} />
        <KpiTile label="En mode test" value={health.counts.TEST} tone={health.counts.TEST > 0 ? "info" : "default"} href={anchor("TEST")} icon={<FlaskConical className="size-4" />} />
        <KpiTile label="À compléter" value={health.counts.INCOMPLETE} tone={health.counts.INCOMPLETE > 0 ? "warning" : "default"} href={anchor("INCOMPLETE")} icon={<CircleAlert className="size-4" />} />
        <KpiTile label="Non configurés" value={health.counts.NOT_CONFIGURED} tone={health.counts.NOT_CONFIGURED > 0 ? "danger" : "default"} href={anchor("NOT_CONFIGURED")} icon={<ShieldOff className="size-4" />} />
      </div>

      {toFix > 0 ? (
        <Alert tone="warning" title={`${toFix} service${toFix > 1 ? "s" : ""} à configurer`}>
          Chaque carte dit ce qu&apos;il manque et quelle variable renseigner. Une variable d&apos;environnement modifiée n&apos;est prise en compte qu&apos;après un redéploiement.
        </Alert>
      ) : (
        <Alert tone="success" title="Tous les services sont branchés">
          {health.counts.TEST > 0 ? "Certains tournent encore en mode test : aucun paiement ni signature réels tant qu'ils n'en sortent pas." : "Rien à faire pour l'instant."}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {health.services.map((service) => (
          <ServiceCard key={service.key} service={service} />
        ))}
      </div>
    </div>
  );
}
