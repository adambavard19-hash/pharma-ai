import { NextResponse } from "next/server";
import { runContractReminders } from "@/server/services/sales/contracts";
import { syncAllProgressiveCommissions } from "@/server/services/sales/progressive-commissions";
import { syncAllReferralDiscounts } from "@/server/billing/referral-discount";
import { createMonthlyAffiliateCommissions, createSignupBonuses } from "@/server/services/sales/affiliate-commissions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Passage quotidien des relances de contrat (tâche planifiée Vercel). Protégé
 * par CRON_SECRET : sans secret configuré, la route refuse, jamais ouverte.
 *
 * Puis, avec le temps qui reste, le rattrapage de la grille progressive des
 * commerciaux : un recalcul manqué (webhook de paiement interrompu, verrou
 * trop long) est refait ici, si bien qu'un bonus dont la pharmacie a payé ne
 * reste pas « en attente du 1er paiement ». L'hébergement n'autorise que deux
 * tâches planifiées : celle-ci porte donc aussi ce passage. Une erreur de
 * l'étape est journalisée, sans faire échouer les relances.
 *
 * Puis le rattrapage des remises de parrainage chez Stripe (webhook manqué).
 *
 * Enfin, l'affiliation mensuelle : les commissions du mois ÉCOULÉ (10 à 20 %,
 * selon le palier de l'affilié, de l'abonnement de chaque pharmacie apportée et
 * abonnée à la fin du mois). La
 * tâche est quotidienne : le 1er, elle les crée ; les jours suivants, elle ne
 * crée que ce qui manque (passage interrompu), jamais un doublon — l'index
 * unique (pharmacie, mois) l'interdit — et jamais un mois plus ancien.
 * Et les primes uniques (100 € à l'affilié, 50 € au directeur commercial) des
 * pharmacies dont la mise en service vient d'être réglée : une par pharmacie.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const startedAt = Date.now();
  const report = await runContractReminders();
  const commissions = await syncAllProgressiveCommissions({ budgetMs: Math.max(5_000, 50_000 - (Date.now() - startedAt)) }).catch((error: unknown) => {
    console.error("[cron] grille progressive : passage quotidien en échec", error instanceof Error ? error.message : "erreur inconnue");
    return null;
  });
  const referrals = await syncAllReferralDiscounts().catch((error: unknown) => {
    console.error("[cron] remises de parrainage : passage quotidien en échec", error instanceof Error ? error.message : "erreur inconnue");
    return null;
  });
  const affiliation = await createMonthlyAffiliateCommissions().catch((error: unknown) => {
    console.error("[cron] affiliation mensuelle : passage en échec", error instanceof Error ? error.message : "erreur inconnue");
    return null;
  });
  const signupBonuses = await createSignupBonuses().catch((error: unknown) => {
    console.error("[cron] primes d'affiliation : passage en échec", error instanceof Error ? error.message : "erreur inconnue");
    return null;
  });
  return NextResponse.json({ ...report, commissions, referrals, affiliation, signupBonuses });
}
