import { activityScope } from "@/server/db/demo-scope";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Clock, FileText, Sparkles, TrendingUp } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getOCRProvider } from "@/server/ai/registry";
import { stockFreshness, describeAge, lgoLabel } from "@/core/stock/connectors";
import { TIME_ZONE } from "@/config/constants";
import { formatCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LiveCounterSales } from "./live-counter-sales";
import { listLiveCounterSales } from "@/server/services/counter-scan";
import { NewPrescriptionForm } from "./new-prescription-form";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const params = await searchParams;

  const patients = await prisma.patient.findMany({
    where: {
      ...activityScope(),
 pharmacyId: session.scope.pharmacyId, deletedAt: null },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, reference: true, email: true },
    take: 500,
  });

  // L'écran ne promet une lecture automatique que si un lecteur est réellement
  // branché. Sinon il propose la saisie, sans expliquer pourquoi.
  const canReadPrescriptions = getOCRProvider().info.capability === "LIVE";

  // Le comptoir du jour : ce qui est en cours, ce qui a été fait, et l'état
  // du stock. Calculé hors du rendu : l'heure n'est pas une valeur de rendu.
  const home = await loadCounterHome(session.scope.pharmacyId);
  // Les délivrances qui arrivent de la douchette du LGO : la carte se met à jour seule.
  const liveSales = (await listLiveCounterSales(session.scope.pharmacyId)).map((sale) => ({ id: sale.id, reference: sale.reference, status: sale.status, post: sale.counterPost, updatedAt: sale.updatedAt.toISOString(), lines: sale.lines.map((line) => ({ drugName: line.drugName ?? "", quantity: line.quantity ?? 1 })), recommendations: sale._count.recommendations }));
  const { openPrescriptions, salesToday, accepted, declined, stockLabel, stockTone, greeting, dateLabel } = home;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[12.5px] font-medium tracking-[0.06em] text-text-tertiary uppercase">{dateLabel}</p>
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-text-primary">
            {greeting} {session.user.firstName}, un patient au comptoir ?
          </h1>
          <p className="text-[14px] text-text-secondary">
            Scannez, saisissez ou joignez l&apos;ordonnance. Le patient peut être associé après, ou créé sur place.
          </p>
        </div>
        <Link
          href="/stock"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
            stockTone === "ok" ? "border-success-200 bg-success-50 text-success-800 dark:border-success-800 dark:bg-success-950/30 dark:text-success-300" : "border-warning-300 bg-warning-50 text-warning-800 dark:border-warning-800 dark:bg-warning-950/30 dark:text-warning-400",
          )}
        >
          <span className={cn("size-2 rounded-full", stockTone === "ok" ? "bg-success-500" : "bg-warning-500")} />
          {stockLabel}
        </Link>
      </div>

      <LiveCounterSales initial={liveSales} />

      <NewPrescriptionForm
        patients={patients}
        preselectedPatientId={params.patient ?? null}
        canReadPrescriptions={canReadPrescriptions}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-border-subtle bg-surface-card">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
              <Clock className="size-4 text-text-tertiary" /> À reprendre
            </h2>
            <Link href="/ordonnances" className="text-[12.5px] text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">Toutes les ordonnances</Link>
          </div>
          {openPrescriptions.length === 0 ? (
            <p className="border-t border-border-subtle px-5 py-5 text-[13.5px] text-text-tertiary">Aucune vente en cours. Tout ce qui a été commencé a été terminé.</p>
          ) : (
            <ul className="divide-y divide-border-subtle border-t border-border-subtle">
              {openPrescriptions.map((prescription) => {
                const stage = prescription.status === "NEEDS_VERIFICATION" ? "à confirmer" : prescription.status === "ANALYZED" ? `${prescription._count.recommendations} conseil${prescription._count.recommendations > 1 ? "s" : ""} à décider` : prescription.status === "VALIDATED" ? "plan à remettre" : "analyse en cours";
                return (
                  <li key={prescription.id}>
                    <Link href={`/vente/${prescription.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken/60">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-secondary"><FileText className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-text-primary">
                          {prescription.patient ? `${prescription.patient.lastName.toUpperCase()} ${prescription.patient.firstName}` : "Patient non rattaché"}
                          <span className="ml-2 text-[12px] font-normal text-text-tertiary tabular">{prescription.reference}</span>
                        </span>
                        <span className="block text-[12.5px] text-text-secondary">{prescription._count.lines} médicament{prescription._count.lines > 1 ? "s" : ""} · {stage} · {formatTime(prescription.createdAt)}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface-card">
          <div className="px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
              <TrendingUp className="size-4 text-text-tertiary" /> Aujourd&apos;hui
            </h2>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle">
            <Figure label="Ventes" value={String(salesToday._count._all)} />
            <Figure label="Ventes additionnelles" value={formatCents(salesToday._sum.attributedCents ?? 0)} accent />
            <Figure label="Conseils acceptés" value={accepted + declined > 0 ? `${accepted} / ${accepted + declined}` : "—"} />
          </dl>
          <p className="flex items-center gap-2 border-t border-border-subtle px-5 py-3 text-[12px] text-text-tertiary">
            {accepted + declined > 0 ? <Check className="size-3.5 text-success-600" /> : <Sparkles className="size-3.5" />}
            {accepted + declined > 0 ? `${Math.round((accepted / (accepted + declined)) * 100)} % des conseils proposés ont été acceptés aujourd'hui.` : "Les conseils acceptés et refusés du jour s'afficheront ici."}
            <Link href="/pilotage" className="ml-auto text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">Pilotage</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

async function loadCounterHome(pharmacyId: string) {
  const now = new Date();
  const startOfDay = startOfParisDay(now);
  const [openPrescriptions, salesToday, decidedToday, pharmacy] = await Promise.all([
    prisma.prescription.findMany({
      where: {
        pharmacyId,
        ...activityScope(),
        status: { in: ["NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED", "VALIDATED"] },
        sales: { none: {} },
        createdAt: { gte: new Date(now.getTime() - 48 * 3600 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, reference: true, status: true, createdAt: true, patient: { select: { firstName: true, lastName: true } }, _count: { select: { lines: true, recommendations: true } } },
    }),
    prisma.sale.aggregate({ where: { pharmacyId, createdAt: { gte: startOfDay } }, _count: { _all: true }, _sum: { attributedCents: true, totalCents: true } }),
    prisma.recommendation.groupBy({ by: ["status"], where: { pharmacyId, decidedAt: { gte: startOfDay } }, _count: { _all: true } }),
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true, stockConnection: { select: { lgo: true, status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true } } } }),
  ]);
  const accepted = decidedToday.filter((row) => row.status === "ACCEPTED" || row.status === "PURCHASED").reduce((sum, row) => sum + row._count._all, 0);
  const declined = decidedToday.filter((row) => row.status === "DECLINED").reduce((sum, row) => sum + row._count._all, 0);
  const connection = pharmacy?.stockConnection && pharmacy.stockConnection.status !== "PENDING" && pharmacy.stockConnection.status !== "DISCONNECTED" ? pharmacy.stockConnection : null;
  const freshness = connection ? stockFreshness({ lastSyncAt: connection.lastSyncAt, lastSeenAt: connection.lastSeenAt, intervalSeconds: connection.intervalSeconds }) : null;
  const stockLabel = connection && freshness
    ? freshness.state === "FRESH"
      ? `Stock ${lgoLabel(connection.lgo)} à jour · ${describeAge(freshness.ageSeconds)}`
      : freshness.state === "STALE"
        ? `Stock ${lgoLabel(connection.lgo)} non rafraîchi ${describeAge(freshness.ageSeconds)}`
        : `Agent ${lgoLabel(connection.lgo)} injoignable`
    : pharmacy?.stockSyncedAt
      ? `Stock importé ${describeAge(Math.round((now.getTime() - pharmacy.stockSyncedAt.getTime()) / 1000))}`
      : "Stock non importé";
  const stockTone: "ok" | "warn" = connection && freshness ? (freshness.state === "FRESH" ? "ok" : "warn") : pharmacy?.stockSyncedAt ? "ok" : "warn";
  const greeting = parisHour(now) < 18 ? "Bonjour" : "Bonsoir";
  const dateLabel = formatParisDate(now);
  return { openPrescriptions, salesToday, accepted, declined, stockLabel, stockTone, greeting, dateLabel };
}

function Figure({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-4 py-4">
      <dt className="text-[11.5px] font-medium tracking-[0.04em] text-text-tertiary uppercase">{label}</dt>
      <dd className={cn("mt-1 text-[22px] leading-7 font-semibold tabular", accent ? "text-brand-700 dark:text-brand-400" : "text-text-primary")}>{value}</dd>
    </div>
  );
}

/** Minuit à Paris, quelle que soit l'heure du serveur. */
function startOfParisDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return new Date(now.getTime() - ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000);
}

function parisHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

function formatParisDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(date);
}
