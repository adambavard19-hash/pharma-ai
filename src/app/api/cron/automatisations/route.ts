import { NextResponse } from "next/server";
import { runAutomations } from "@/server/services/admin/automations";
import { processDueCampaigns } from "@/server/services/admin/campaigns";
import { purgeStalePatientNews, resumeStuckAnnouncements } from "@/server/services/patient-news";
import { closeStalledDeposits, purgeExpiredDepositFiles } from "@/server/services/stock-deposits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Une étape du passage : un échec est journalisé et rendu `null` (inconnu, jamais un faux zéro) ; il n'empêche pas les autres. */
async function attempt<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[cron] étape « ${label} » en échec`, error);
    return null;
  }
}

/**
 * Passage quotidien des relances automatiques (tâche planifiée Vercel).
 * Protégé par CRON_SECRET : sans secret configuré, la route refuse, jamais
 * ouverte. Sûr par défaut : tant qu'aucune règle n'est activée dans la
 * console, le passage ne lit ni n'envoie rien.
 *
 * Après les relances : les campagnes programmées dont le jour est atteint,
 * les annonces aux patients restées en plan, la purge des abonnements
 * expirés, celle des fichiers de stock de plus de 90 jours, et la fermeture
 * des dépôts de stock restés « en cours » (traitement interrompu). Chaque
 * étape est isolée.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const now = new Date();
  // Une erreur des relances remonte comme avant, mais après les autres étapes : elles ne l'attendent pas.
  const automations = await runAutomations({ now, dryRun: false }).then(
    (report) => ({ report }),
    (error: unknown) => ({ error }),
  );
  const campaigns = await attempt("campagnes", () => processDueCampaigns(now));
  const resumed = await attempt("annonces aux patients", () => resumeStuckAnnouncements(now));
  const purged = await attempt("purge des abonnements aux nouveautés", () => purgeStalePatientNews(now));
  const stockFiles = await attempt("fichiers de stock", () => purgeExpiredDepositFiles(now));
  const stalledDeposits = await attempt("dépôts de stock bloqués", () => closeStalledDeposits(now));
  if ("error" in automations) throw automations.error;
  // Le détail par officine reste dans la console : la réponse ne porte que les compteurs.
  const { dryRun, enabledRules, planned, sent, failed, simulated, skipped, internal, alreadyDone, errors } = automations.report;
  return NextResponse.json({ dryRun, enabledRules, planned, sent, failed, simulated, skipped, internal, alreadyDone, errors, campaigns, news: { resumed, purged }, stockFiles, stalledDeposits });
}
