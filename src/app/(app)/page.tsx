import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Boxes, Euro, ScanLine, Sparkles } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { prisma } from "@/server/db/client";
import { resolvePeriod } from "@/core/analytics/periods";
import { getRecommendationFunnel, getRevenueSummary } from "@/server/services/analytics";
import { formatCents, formatPercent, formatRelative } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comptoir" };

/** Une ordonnance dont le parcours n'est pas terminé. */
const OPEN_STATUSES = [
  "DRAFT",
  "EXTRACTING",
  "NEEDS_VERIFICATION",
  "VERIFIED",
  "ANALYZING",
  "ANALYZED",
] as const;

/**
 * L'accueil comptoir.
 *
 * Une seule cible évidente : scanner. Le reste est de l'information, pas une
 * invitation — les chiffres sont en bas, en petit, et mènent à la page
 * Performance, qui n'est plus dans le menu. Un pharmacien qui ouvre Pharma.ai
 * a un patient devant lui, pas un rapport à lire.
 */
export default async function CounterHomePage() {
  const session = await requireSession();
  const { scope } = session;

  const canSeeRevenue = session.permissions.has(PERMISSIONS.ANALYTICS_VIEW);
  const canSeeStock = session.permissions.has(PERMISSIONS.STOCK_VIEW);
  const canScan = session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [recent, openCount, week, funnel, outOfStock] = await Promise.all([
    prisma.prescription.findMany({
      where: { pharmacyId: scope.pharmacyId, deletedAt: null, createdAt: { gte: startOfDay } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        reference: true,
        status: true,
        updatedAt: true,
        patient: { select: { firstName: true, lastName: true } },
        sales: { select: { id: true }, take: 1 },
        _count: { select: { recommendations: { where: { status: "PROPOSED" } } } },
      },
    }),
    prisma.prescription.count({
      where: {
        pharmacyId: scope.pharmacyId,
        deletedAt: null,
        status: { in: [...OPEN_STATUSES] },
      },
    }),
    canSeeRevenue ? getRevenueSummary(scope, resolvePeriod("week")) : null,
    canSeeRevenue ? getRecommendationFunnel(scope, resolvePeriod("month")) : null,
    canSeeStock
      ? prisma.stockItem.count({
          where: {
            pharmacyId: scope.pharmacyId,
            quantity: 0,
            product: { isActive: true, deletedAt: null },
          },
        })
      : null,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] text-text-primary">
          Bonjour {session.user.firstName}
        </h1>
        <p className="text-[13.5px] text-text-secondary">
          {session.pharmacy.name}
          {session.pharmacy.city ? ` · ${session.pharmacy.city}` : ""}
        </p>
      </div>

      {canScan ? (
        <Link
          href="/vente/nouvelle"
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl bg-brand-600 px-6 py-10 text-center text-white shadow-sm",
            "transition-colors hover:bg-brand-700 active:bg-brand-800",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          )}
        >
          <ScanLine className="size-8" aria-hidden="true" />
          <span className="text-[19px] leading-6 font-semibold tracking-[-0.01em]">
            Nouveau patient · Scanner une ordonnance
          </span>
          <span className="text-[13px] text-white/80">
            Photo, scan ou fichier — la vérification et les conseils suivent sur le même écran.
          </span>
        </Link>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-[13.5px] text-text-secondary">
            Votre profil ne permet pas de créer une ordonnance. Consultez les patients et le
            stock depuis le menu.
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Aujourd&apos;hui</h2>
            {openCount > 0 && (
              <p className="text-[12.5px] text-text-tertiary">
                {openCount} ordonnance{openCount > 1 ? "s" : ""} en attente au total
              </p>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border-subtle">
                {recent.map((prescription) => {
                  const state = counterState(prescription);
                  return (
                    <li key={prescription.id}>
                      <Link
                        href={`/vente/${prescription.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-text-primary">
                            {prescription.patient
                              ? `${prescription.patient.firstName} ${prescription.patient.lastName.toUpperCase()}`
                              : "Patient non rattaché"}
                          </span>
                          <span className="block text-[12px] text-text-tertiary">
                            {prescription.reference} · {formatRelative(prescription.updatedAt)}
                          </span>
                        </span>
                        <Badge tone={state.tone}>{state.label}</Badge>
                        <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {(canSeeRevenue || canSeeStock) && (
        <section className="grid gap-3 sm:grid-cols-3">
          {funnel && (
            <MiniStat
              href="/performance"
              icon={<Sparkles className="size-4" />}
              label="Conseils suivis"
              value={formatPercent(funnel.conversionRate)}
              detail="achetés / présentés · ce mois"
            />
          )}
          {week && (
            <MiniStat
              href="/performance"
              icon={<Euro className="size-4" />}
              label="CA additionnel"
              value={formatCents(week.attributedCents)}
              detail="cette semaine, via Pharma.ai"
            />
          )}
          {outOfStock !== null && (
            <MiniStat
              href="/stocks"
              icon={
                outOfStock > 0 ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Boxes className="size-4" />
                )
              }
              label="Ruptures"
              value={String(outOfStock)}
              detail={
                outOfStock > 0
                  ? "références non conseillables aujourd'hui"
                  : "tout le catalogue est conseillable"
              }
              tone={outOfStock > 0 ? "warning" : "neutral"}
            />
          )}
        </section>
      )}
    </div>
  );
}

/** Ce que le pharmacien doit faire de cette ordonnance, en un mot. */
function counterState(prescription: {
  status: string;
  sales: { id: string }[];
  _count: { recommendations: number };
}): { label: string; tone: "brand" | "warning" | "success" | "info" | "neutral" } {
  if (prescription.sales.length > 0) return { label: "Vente enregistrée", tone: "success" };

  switch (prescription.status) {
    case "DRAFT":
    case "EXTRACTING":
      return { label: "Extraction en cours", tone: "info" };
    case "NEEDS_VERIFICATION":
      return { label: "À vérifier", tone: "warning" };
    case "VERIFIED":
    case "ANALYZING":
      return { label: "Analyse en cours", tone: "info" };
    case "ANALYZED":
      return prescription._count.recommendations > 0
        ? {
            label: `${prescription._count.recommendations} conseil${prescription._count.recommendations > 1 ? "s" : ""} à décider`,
            tone: "brand",
          }
        : { label: "À terminer", tone: "brand" };
    case "VALIDATED":
    case "DELIVERED":
      return { label: "Fiche remise", tone: "success" };
    case "CANCELLED":
      return { label: "Annulée", tone: "neutral" };
    default:
      return { label: "À reprendre", tone: "neutral" };
  }
}

function MiniStat({
  href,
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3.5 transition-colors hover:border-border-default hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">
        <span className={cn(tone === "warning" && "text-warning-700 dark:text-warning-500")}>
          {icon}
        </span>
        {label}
      </span>
      <span className="mt-1 block text-[22px] leading-7 font-semibold tabular text-text-primary">
        {value}
      </span>
      <span className="mt-0.5 block text-[12px] leading-4 text-text-tertiary">{detail}</span>
    </Link>
  );
}
