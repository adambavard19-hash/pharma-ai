import Link from "next/link";
import { CreditCard, FileSignature, Send, TimerReset, TrendingUp, XCircle, CheckCircle2, AlertTriangle, Hourglass } from "lucide-react";
import { latestContractOf, listPharmaciesBilling } from "@/server/billing/subscriptions";
import { prisma } from "@/server/db/client";
import { monthlyRecurringRevenueCents, trialEndingSoon, type SubscriptionStatusCode } from "@/core/billing/subscription";
import { SectionHeader } from "@/components/ui/page";
import { formatCents } from "@/lib/format";

/**
 * Le tableau de bord business : chaque chiffre est un lien vers les officines
 * concernées dans Abonnements & Contrats. Le MRR n'est affiché que si des
 * abonnements Stripe existent : sans eux, il n'y a rien à calculer.
 */
/** Les chiffres, calculés hors du rendu : la date « maintenant » n'est lue qu'une fois, ici. */
async function loadBusinessKpis() {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [rows, paidCount, failedCount] = await Promise.all([
    listPharmaciesBilling(),
    prisma.billingPayment.count({ where: { status: "PAID", paidAt: { gte: since } } }),
    prisma.billingPayment.count({ where: { status: "FAILED", failedAt: { gte: since } } }),
  ]);
  return { now, rows, paidCount, failedCount };
}

export async function BusinessKpis() {
  const { now, rows, paidCount, failedCount } = await loadBusinessKpis();
  const subs = rows.map((row) => row.organization.subscription).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const statusOf = (s: (typeof subs)[number]) => s.status as SubscriptionStatusCode;
  const contracts = rows.map((row) => latestContractOf(row));
  const counts = {
    trialing: subs.filter((s) => statusOf(s) === "TRIALING").length,
    active: subs.filter((s) => statusOf(s) === "ACTIVE").length,
    contractsSent: contracts.filter((c) => c && (c.status === "SENT" || c.status === "OPENED")).length,
    contractsPending: contracts.filter((c) => !c || ["DRAFT", "SENT", "OPENED", "SIGNED_PHARMACY"].includes(c.status)).length,
    contractsSigned: contracts.filter((c) => c?.status === "FINALIZED").length,
    trialsEnding: subs.filter((s) => statusOf(s) === "TRIALING" && trialEndingSoon(s.trialEndsAt, now, 7)).length,
    failed: subs.filter((s) => statusOf(s) === "PAST_DUE" || statusOf(s) === "UNPAID").length,
    canceled: subs.filter((s) => statusOf(s) === "CANCELED" || statusOf(s) === "INCOMPLETE_EXPIRED").length,
  };
  const stripeBacked = subs.filter((s) => s.stripeSubscriptionId);
  const mrr = stripeBacked.length > 0 ? monthlyRecurringRevenueCents(stripeBacked.map((s) => ({ status: statusOf(s), monthlyPriceCents: s.plan.monthlyPriceCents, cancelAtPeriodEnd: s.cancelAtPeriodEnd }))) : null;

  const tiles: { label: string; value: string; href: string; icon: React.ReactNode; tone?: "warning" | "danger" | "success" }[] = [
    { label: "En essai", value: String(counts.trialing), href: "/admin/abonnements?filtre=essai", icon: <Hourglass className="size-4" /> },
    { label: "Abonnements actifs", value: String(counts.active), href: "/admin/abonnements?filtre=actifs", icon: <CreditCard className="size-4" />, tone: "success" },
    { label: "Contrats envoyés", value: String(counts.contractsSent), href: "/admin/abonnements?filtre=contrats-envoyes", icon: <Send className="size-4" /> },
    { label: "Contrats en attente", value: String(counts.contractsPending), href: "/admin/abonnements?filtre=contrats-attente", icon: <FileSignature className="size-4" /> },
    { label: "Contrats signés", value: String(counts.contractsSigned), href: "/admin/abonnements?filtre=contrats-signes", icon: <CheckCircle2 className="size-4" />, tone: "success" },
    { label: "Essais se terminant (7 j)", value: String(counts.trialsEnding), href: "/admin/abonnements?filtre=fin-essai", icon: <TimerReset className="size-4" />, tone: counts.trialsEnding > 0 ? "warning" : undefined },
    { label: "Paiements réussis (30 j)", value: String(paidCount), href: "/admin/abonnements?filtre=actifs", icon: <CheckCircle2 className="size-4" /> },
    { label: "Paiements échoués", value: String(Math.max(counts.failed, failedCount)), href: "/admin/abonnements?filtre=impayes", icon: <AlertTriangle className="size-4" />, tone: counts.failed > 0 ? "danger" : undefined },
    { label: "Résiliations", value: String(counts.canceled), href: "/admin/abonnements?filtre=resilies", icon: <XCircle className="size-4" /> },
    { label: "MRR", value: mrr === null ? "—" : formatCents(mrr), href: "/admin/abonnements?filtre=actifs", icon: <TrendingUp className="size-4" /> },
  ];

  return (
    <section className="space-y-3">
      <SectionHeader title="Business" description={mrr === null ? "Le MRR s'affichera dès qu'un abonnement Stripe sera actif. Chaque chiffre ouvre la liste des officines concernées." : "Revenu mensuel récurrent : abonnements actifs et essais avec moyen de paiement, hors résiliations programmées. Chaque chiffre ouvre la liste des officines concernées."} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link href={tile.href} className={`block rounded-xl border px-4 py-3 transition-colors hover:border-brand-400 ${tile.tone === "danger" ? "border-danger-200 bg-danger-50/50" : tile.tone === "warning" ? "border-warning-300 bg-warning-50/50" : tile.tone === "success" ? "border-success-200 bg-success-50/40" : "border-border-subtle bg-surface-card"}`}>
              <span className="flex items-center gap-2 text-[12px] font-medium text-text-secondary">{tile.icon}{tile.label}</span>
              <span className="mt-1 block text-[22px] font-semibold text-text-primary">{tile.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
