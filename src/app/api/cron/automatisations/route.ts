import { NextResponse, after } from "next/server";
import { runAutomations } from "@/server/services/admin/automations";
import { processDueCampaigns } from "@/server/services/admin/campaigns";
import { purgeStalePatientNews, resumeStuckAnnouncements } from "@/server/services/patient-news";
import { closeStalledDeposits, purgeExpiredDepositFiles } from "@/server/services/stock-deposits";
import { sendMonthlyCounterReports } from "@/server/services/counter-results";
import { sendDailyDigests } from "@/server/services/weekly-digest";
import { sendDueCureReminders } from "@/server/services/cure-reminders";
import { purgeCounterEmails } from "@/server/services/counter-window";
import { runStockLearningPass } from "@/server/services/stock-learning";
import { scheduleLearningContinuation } from "@/server/services/stock-learning-chain";

export const dynamic = "force-dynamic";
// Le passage quotidien porte aussi la connaissance du stock (plusieurs minutes de lots) : l'hébergement n'autorise que deux tâches planifiées.
export const maxDuration = 300;

/** Le temps laissé à la connaissance du stock, après les relances : on ne commence pas un lot qu'on ne peut pas finir. */
const LEARNING_BUDGET_MS = 230_000;

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
 * D'abord, l'effacement des adresses e-mail données au comptoir pour un bilan
 * et restées en base (vente jamais terminée) : la page Confidentialité promet
 * qu'aucune ne dépasse 48 heures, et cette promesse ne tient que si l'étape
 * tourne CHAQUE jour. Elle est bornée et rapide (quelques écritures, rien de
 * lu) ; placée après les relances, une journée trop longue (la fonction est
 * coupée à maxDuration, ce qu'`attempt` ne rattrape pas) la sauterait.
 *
 * Puis les relances, les campagnes programmées dont le jour est atteint,
 * les annonces aux patients restées en plan, la purge des abonnements
 * expirés, celle des fichiers de stock de plus de 90 jours, et la fermeture
 * des dépôts de stock restés « en cours » (traitement interrompu),
 * le bilan mensuel du comptoir envoyé aux titulaires (une fois par mois et par
 * pharmacie : rejouable sans double envoi), puis — en dernier, avec le temps
 * qui reste — la connaissance du stock des pharmacies. Chaque étape est isolée.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const startedAt = Date.now();
  const now = new Date();
  // En premier, avant toute étape qui peut durer : c'est la promesse de la page Confidentialité (aucune adresse du bilan au-delà
  // de 48 heures), et un échec ici est journalisé sans empêcher la suite.
  const counterEmails = await attempt("adresses e-mail du comptoir", () => purgeCounterEmails(now));
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
  const reachedLots = await attempt("dates courtes atteintes", () => import("@/server/services/stock-lots").then((lots) => lots.retireReachedLots(now)));
  const counterReports = await attempt("bilan mensuel du comptoir", () => sendMonthlyCounterReports(now));
  // Chaque matin, la journée d'hier : au titulaire toute l'officine, à chaque membre ses seules ventes. Deux minutes au plus ;
  // une tâche relancée le même jour reprend sans double envoi.
  const weeklyDigests = await attempt("bilan quotidien de l'équipe", () => sendDailyDigests(now, { deadlineAt: Date.now() + 120_000 }));
  // Les rappels de fin de cure du jour, au nom de chaque pharmacie ; l'adresse est effacée à l'envoi. Une minute au plus.
  const cureReminders = await attempt("rappels de fin de cure", () => sendDueCureReminders(now, { deadlineAt: Date.now() + 60_000 }));
  const stockLearning = await attempt("connaissance du stock", () => runStockLearningPass({ deadlineAt: startedAt + LEARNING_BUDGET_MS }));
  if (stockLearning?.moreToDo) after(() => scheduleLearningContinuation({ depth: 1 }).then(() => undefined));
  if ("error" in automations) throw automations.error;
  // Le détail par officine reste dans la console : la réponse ne porte que les compteurs.
  const { dryRun, enabledRules, planned, sent, failed, simulated, skipped, internal, alreadyDone, errors } = automations.report;
  return NextResponse.json({ dryRun, enabledRules, planned, sent, failed, simulated, skipped, internal, alreadyDone, errors, campaigns, news: { resumed, purged }, stockFiles, stalledDeposits, reachedLots, counterEmails, counterReports, weeklyDigests, cureReminders, stockLearning });
}
