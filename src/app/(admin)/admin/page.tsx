import type { Metadata } from "next";
import { ShieldOff } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadCockpit } from "@/server/services/admin/cockpit";
import { AdminPageHeader } from "@/components/admin/page-header";
import { resolvePeriod } from "@/components/admin/filters";
import { attentionHeadline, attentionTotal, formatLongDate } from "@/core/admin/metrics";
import { cn } from "@/lib/utils";
import { AttentionBlock, attentionCards } from "./_cockpit/attention";
import { TodayBlock } from "./_cockpit/today";
import { FleetKpis, PeriodBlock } from "./_cockpit/indicators";

export const metadata: Metadata = { title: "Vue d'ensemble" };

/**
 * Le cockpit dirigeant : ce qui demande une décision, ce qui tombe
 * aujourd'hui, l'état du parc et sa tendance.
 *
 * RÈGLE STRUCTURELLE : cette page ne lit aucune donnée médicale. Elle ne
 * connaît que des abonnements, des contrats, des dossiers commerciaux, des
 * connexions et l'état technique ; aucune requête ne touche les patients, les
 * ordonnances ni les analyses (voir `src/server/services/admin/cockpit.ts`).
 */
export default async function AdminCockpitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePlatformSession();
  const params = await searchParams;
  const period = resolvePeriod(typeof params.periode === "string" ? params.periode : null);

  const [admin, cockpit] = await Promise.all([
    prisma.platformAdmin.findUnique({ where: { id: session.admin.id }, select: { firstName: true } }),
    loadCockpit(period),
  ]);

  const firstName = admin?.firstName.trim() || session.admin.fullName.split(" ")[0];
  const cards = attentionCards(cockpit.attention);
  const total = attentionTotal(cards);
  const urgent = cards.some((card) => card.tone === "danger" && card.count > 0);

  return (
    <>
      <AdminPageHeader
        title={`Bonjour ${firstName}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{formatLongDate(cockpit.now)}</span>
            <span aria-hidden="true" className="text-text-tertiary">
              ·
            </span>
            <span className={cn("inline-flex items-center gap-1.5 font-medium", total === 0 ? "text-success-700 dark:text-success-500" : urgent ? "text-danger-700 dark:text-danger-500" : "text-warning-700 dark:text-warning-500")}>
              <span className="size-2 rounded-full bg-current" aria-hidden="true" />
              {attentionHeadline(total)}
            </span>
          </span>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AttentionBlock cards={cards} />
        <TodayBlock items={cockpit.today} now={cockpit.now} />
      </div>

      <FleetKpis kpis={cockpit.kpis} />

      <PeriodBlock period={period} kpis={cockpit.kpis} series={cockpit.series} />

      <p className="flex items-center justify-center gap-2 pt-2 text-center text-[12px] leading-5 text-text-tertiary">
        <ShieldOff className="size-3.5 shrink-0" aria-hidden="true" />
        Aucun accès aux données médicales : cette console ne lit que des données de compte, d&apos;abonnement et d&apos;activité.
      </p>
    </>
  );
}
