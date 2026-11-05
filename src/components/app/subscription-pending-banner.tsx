import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { prisma } from "@/server/db/client";

/**
 * Le bandeau du titulaire tant que son logiciel attend le paiement (fondateur, 5 nov. 2026) : signer, payer, puis le
 * logiciel arrive. Un clic mène aux trois étapes (Paramètres → Abonnement). Rien pour les autres officines.
 */
export async function SubscriptionPendingBanner({ pharmacyId, owner }: { pharmacyId: string; owner: boolean }) {
  if (!owner) return null;
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { softwareGate: true, softwareUnlockedAt: true } });
  if (!pharmacy?.softwareGate || pharmacy.softwareUnlockedAt) return null;
  return (
    <Link
      href="/parametres?onglet=abonnement"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/80 px-4 py-3 text-[14px] text-text-primary backdrop-blur hover:border-brand-400 dark:border-brand-800 dark:bg-brand-950/30"
    >
      <Lock className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong>Finalisez votre abonnement</strong> : signez votre contrat, réglez l&apos;abonnement, et PharmaBoost arrive aussitôt par e-mail.
      </span>
      <span className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300">
        Continuer <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
