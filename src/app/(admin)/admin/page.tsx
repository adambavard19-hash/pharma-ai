import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Building2, Megaphone, ShieldOff, Sparkles, Store } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadCockpit } from "@/server/services/admin/cockpit";
import { countSupportToAnswer } from "@/server/services/support";
import { countDepositsNeedingAttention } from "@/server/services/stock-deposits";
import { AdminPageHeader } from "@/components/admin/page-header";
import { resolvePeriod } from "@/components/admin/filters";
import { attentionHeadline, attentionTotal, formatLongDate } from "@/core/admin/metrics";
import { cn } from "@/lib/utils";
import { AttentionBlock, attentionCards } from "./_cockpit/attention";
import { TodayBlock } from "./_cockpit/today";
import { FleetKpis, PeriodBlock, hasTrend } from "./_cockpit/indicators";

export const metadata: Metadata = { title: "Accueil" };

const QUICK_LINKS = [
  { href: "/admin/pharmacies", label: "Mes officines", icon: Store },
  { href: "/admin/pipeline?nouveau=prospect", label: "Ajouter un prospect", icon: Briefcase },
  { href: "/admin/pharmacies?nouveau=officine", label: "Nouvelle officine", icon: Building2 },
  { href: "/admin/conseils", label: "Conseils & associations", icon: Sparkles },
  { href: "/admin/campagnes/nouvelle", label: "Nouvelle campagne", icon: Megaphone },
];

/**
 * L'accueil : un cockpit qui dit quoi faire, pas une galerie de compteurs. Dans l'ordre : ce qui demande une décision, ce qui
 * tombe aujourd'hui, les chiffres qui comptent, les accès rapides — et la tendance seulement quand il y a de quoi la tracer.
 *
 * RÈGLE STRUCTURELLE : cette page ne lit aucune donnée médicale. Elle ne connaît que des abonnements, des contrats, des
 * dossiers commerciaux, des connexions, des questions de support et l'état technique ; aucune requête ne touche les patients,
 * les ordonnances ni les analyses (voir `src/server/services/admin/cockpit.ts`).
 */
export default async function AdminCockpitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePlatformSession();
  const params = await searchParams;
  const period = resolvePeriod(typeof params.periode === "string" ? params.periode : null);

  const [admin, cockpit, supportToAnswer, stockToDecide] = await Promise.all([
    prisma.platformAdmin.findUnique({ where: { id: session.admin.id }, select: { firstName: true } }),
    loadCockpit(period),
    countSupportToAnswer(),
    countDepositsNeedingAttention(),
  ]);

  const firstName = admin?.firstName.trim() || session.admin.fullName.split(" ")[0];
  const cards = attentionCards(cockpit.attention, { supportToAnswer, stockToDecide });
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

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <AttentionBlock cards={cards} />
        <TodayBlock items={cockpit.today} now={cockpit.now} />
      </div>

      <FleetKpis kpis={cockpit.kpis} />

      <nav aria-label="Accès rapides" className="space-y-3">
        <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">Accès rapides</h2>
        <ul className="flex flex-wrap gap-2.5">
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="inline-flex items-center gap-2 rounded-xl bg-surface-card px-4 py-2.5 text-[13.5px] font-medium text-text-primary shadow-xs ring-1 ring-border-subtle transition-all hover:-translate-y-px hover:ring-brand-300 motion-reduce:transform-none">
                <link.icon className="size-4 text-text-tertiary" aria-hidden="true" />
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {hasTrend(cockpit.series) ? (
        <PeriodBlock period={period} kpis={cockpit.kpis} series={cockpit.series} />
      ) : (
        <p className="text-[13px] text-text-tertiary">Les courbes d&apos;évolution (revenu, nouveaux abonnements, résiliations) apparaîtront au premier paiement encaissé.</p>
      )}

      <p className="flex items-center justify-center gap-2 pt-2 text-center text-[12px] leading-5 text-text-tertiary">
        <ShieldOff className="size-3.5 shrink-0" aria-hidden="true" />
        Aucun accès aux données médicales : cette console ne lit que des données de compte, d&apos;abonnement et d&apos;activité.
      </p>
    </>
  );
}
