import "server-only";
import { prisma } from "@/server/db/client";
import { activityScope } from "@/server/db/demo-scope";
import type { TenantScope } from "@/server/db/tenant";
import { loadCounterDashboard, startOfParisDay } from "@/server/services/counter-dashboard";
import { loadChallengeBoard, loadMyObjectives, loadTeamDesk } from "@/server/services/mobile/personal";
import { loadContinueCard } from "@/server/services/mobile/home";
import { loadTeamRanking } from "@/server/services/team-ranking";
import { listLots, searchStockItems } from "@/server/services/stock-lots";
import { loadRobotAlerts, type AlertViewer } from "@/server/services/robot-alerts";
import { clampDays, PHARMACY_TOOL_NAMES, pharmacyToolsFor, type PharmacyViewer } from "@/core/pharmacy-assistant/assistant";
import { ordonnanceTitle } from "@/core/counter/dashboard";
import { adviseCounterRequest } from "@/server/services/counter-request";

/**
 * Les outils du robot du logiciel officine : LECTURE SEULE, et toujours par la PORTÉE DE LA SESSION (officine active,
 * personne connectée). Aucun outil ne prend d'identifiant d'officine ou de personne venu du modèle : il ne peut lire
 * qu'ici. Aucun nom de patient, aucun contenu d'ordonnance (ni médicament, ni posologie) ne sort : une vente se dit
 * par son numéro, son heure, son étape et son nombre de produits.
 *
 * Seule exception à la lecture : `conseil_comptoir` conserve la demande sans ordonnance (sans patient identifié), comme le
 * fait la « Demande sans ordonnance » de l'écran — c'est le même service, `adviseCounterRequest`.
 */

export type PharmacyToolContext = { scope: TenantScope; viewer: PharmacyViewer; alertViewer: AlertViewer; now?: Date; pharmacyIsDemo?: boolean };
type Input = Record<string, unknown>;
type ToolOutput = Record<string, unknown>;

const DAY_MS = 86_400_000;
const euros = (cents: number | null | undefined): string => `${((cents ?? 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: (cents ?? 0) % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const rate = (validated: number, proposed: number): string | null => (proposed > 0 ? `${Math.round((validated / proposed) * 100)} %` : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null);

/** Du début du jour il y a `days - 1` jours (heure de Paris) à maintenant. */
function windowOf(days: number, now: Date): { start: Date; end: Date } {
  return { start: new Date(startOfParisDay(now).getTime() - (days - 1) * DAY_MS), end: now };
}

async function maJournee(ctx: PharmacyToolContext): Promise<ToolOutput> {
  const now = ctx.now ?? new Date();
  const [dashboard, alerts, training] = await Promise.all([
    loadCounterDashboard(ctx.scope, now),
    loadRobotAlerts(ctx.alertViewer, now).catch(() => []),
    loadContinueCard(ctx.scope.userId, ctx.scope, now).catch(() => null),
  ]);
  const { stats, status, activity } = dashboard;
  return {
    aujourdhui: {
      delivrances_scannees: stats.detected,
      conseils_acceptes: stats.accepted,
      conseils_refuses: stats.declined,
      ventes_enregistrees: stats.salesCount,
      montant_attribue: euros(stats.attributedCents),
    },
    comptoir: { etat: status.pill.label, detail: status.title, comptoirs: status.posts.map((post) => ({ nom: post.label, en_ligne: post.online })) },
    // Jamais le patient ni les médicaments : le numéro, l'heure, l'étape, le nombre de produits.
    dernieres_ventes: activity.map((item) => ({ vente: ordonnanceTitle(item.reference), heure: item.when, etape: item.stage.label, produits: item.lines.length + item.moreLines, comptoir: item.comptoir })),
    alertes: alerts.map((alert) => ({ texte: alert.text, importance: alert.severity, lien: alert.link?.href ?? null })),
    formation_en_cours: training ? { titre: training.title, avancement: training.percent !== null && training.percent !== undefined ? `${training.percent} %` : null, lien: training.href } : null,
    lien: "/",
  };
}

async function conseilsEtVentes(ctx: PharmacyToolContext, input: Input): Promise<ToolOutput> {
  const now = ctx.now ?? new Date();
  const days = clampDays(input.jours);
  const period = windowOf(days, now);
  const team = input.perimetre === "equipe";
  const seeOthers = ctx.viewer.manageTeam || ctx.viewer.teamPerformance;
  const [ranking, sales] = await Promise.all([
    loadTeamRanking(ctx.scope, period),
    prisma.sale.aggregate({
      where: { pharmacyId: ctx.scope.pharmacyId, ...activityScope(ctx.scope), createdAt: { gte: period.start, lt: period.end }, ...(team ? {} : { userId: ctx.scope.userId }) },
      _count: { _all: true },
      _sum: { attributedCents: true },
    }),
  ]);
  const mine = ranking.rows.find((row) => row.userId === ctx.scope.userId) ?? { proposed: 0, validated: 0, rank: null };
  const base = { periode: days === 1 ? "aujourd'hui" : `${days} derniers jours`, ventes_enregistrees: sales._count._all, montant_attribue: euros(sales._sum.attributedCents) };
  if (!team) return { perimetre: "moi", ...base, conseils_proposes: mine.proposed, conseils_acceptes: mine.validated, taux: rate(mine.validated, mine.proposed), lien: "/resultats" };
  return {
    perimetre: "equipe",
    ...base,
    conseils_proposes: ranking.totals.proposed,
    conseils_acceptes: ranking.totals.validated,
    taux: rate(ranking.totals.validated, ranking.totals.proposed),
    // Le détail de chacun : seulement pour qui a le droit de voir la performance de l'équipe.
    par_collaborateur: seeOthers ? ranking.rows.map((row) => ({ nom: row.name, proposes: row.proposed, acceptes: row.validated, taux: rate(row.validated, row.proposed), rang: row.rank })) : "réservé au titulaire",
    ma_part: { proposes: mine.proposed, acceptes: mine.validated },
    lien: seeOthers ? "/equipe" : "/resultats",
  };
}

async function challenges(ctx: PharmacyToolContext): Promise<ToolOutput> {
  const now = ctx.now ?? new Date();
  const [board, objectives] = await Promise.all([loadChallengeBoard(ctx.scope, now), loadMyObjectives(ctx.scope, now)]);
  return {
    en_cours: board.running.map((c) => ({
      titre: c.title,
      laboratoire: c.laboratory,
      fin: c.endsOn,
      jours_restants: c.daysRemaining,
      unites_equipe: c.teamUnits,
      objectif: c.target,
      paliers: c.milestones.map((m) => ({ unites: m.units, atteint: m.reached })),
      reste_avant_prochain_palier: c.unitsToNextMilestone,
      ma_part: c.myUnits,
      mon_rang: c.myRank,
      participants: c.participants,
    })),
    mes_objectifs: objectives
      .filter((o) => o.progress.daysRemaining > 0 || o.progress.state === "DONE")
      .map((o) => ({ titre: o.title, valeur: o.progress.value, cible: o.progress.target, avancement: o.progress.percent !== null ? `${o.progress.percent} %` : null, etat: o.progress.state, jours_restants: o.progress.daysRemaining, fin: o.endsOn })),
    lien: ctx.viewer.manageTeam ? "/equipe" : "/m/challenges",
  };
}

const LEVELS = { urgent: "URGENT", bientot: "SOON", perimes: "EXPIRED" } as const;

async function datesCourtes(ctx: PharmacyToolContext, input: Input): Promise<ToolOutput> {
  const key = typeof input.niveau === "string" && input.niveau in LEVELS ? (input.niveau as keyof typeof LEVELS) : input.niveau === "tous" ? null : "urgent";
  const result = await listLots({ pharmacyId: ctx.scope.pharmacyId, userId: ctx.scope.userId }, { level: key ? LEVELS[key] : null, today: ctx.now });
  const shown = result.lots.filter((lot) => lot.level !== "OK").slice(0, 25);
  return {
    compteurs: { perimes: result.counts.EXPIRED, urgents: result.counts.URGENT, bientot: result.counts.SOON },
    seuils: { urgent_sous_jours: result.thresholds.urgentDays, bientot_sous_jours: result.thresholds.soonDays },
    lots: shown.map((lot) => ({ produit: lot.label, quantite: lot.quantity, peremption: lot.expiresOn, jours_restants: lot.daysLeft, lien: lot.href })),
    plus: Math.max(0, result.lots.length - shown.length),
    lien: "/stock/dates-courtes",
  };
}

async function stockProduit(ctx: PharmacyToolContext, input: Input): Promise<ToolOutput> {
  const text = str(input.texte);
  if (!text || text.length < 2) return { erreur: "Donne au moins 2 caractères." };
  const items = await searchStockItems({ pharmacyId: ctx.scope.pharmacyId, userId: ctx.scope.userId }, text);
  return {
    trouves: items.map((item) => ({ produit: item.label, detail: item.detail, quantite_en_rayon: item.quantity, lien: item.kind === "PRODUCT" ? `/stock/${item.id}` : null })),
    lien: "/stock",
  };
}

async function equipe(ctx: PharmacyToolContext): Promise<ToolOutput> {
  const desk = await loadTeamDesk(ctx.scope, ctx.now ?? new Date());
  if (!desk) return { erreur: "Réservé au titulaire de l'officine." };
  return {
    collaborateurs: desk.members.map((m) => ({ nom: m.name, role: m.role })),
    classement_du_mois: desk.ranking.rows.map((row) => ({ rang: row.rank, nom: row.name, proposes: row.proposed, acceptes: row.validated, taux: rate(row.validated, row.proposed) })),
    objectifs: desk.objectives.filter((o) => o.progress.daysRemaining > 0).map((o) => ({ collaborateur: o.userName, titre: o.title, avancement: o.progress.percent !== null ? `${o.progress.percent} %` : null, etat: o.progress.state })),
    primes: desk.bonuses.filter((b) => b.status === "PROPOSED" || b.status === "VALIDATED").map((b) => ({ collaborateur: b.userName, libelle: b.label, montant: euros(b.amountCents), statut: b.status === "PROPOSED" ? "à valider" : "validée" })),
    lien: "/equipe",
  };
}

/** Les paramètres du patient, relus : le modèle peut envoyer n'importe quoi, et rien n'est supposé (absent = non dit). */
export function counterAdviceInput(input: Input): { text: string; ageYears: number | null; isPregnant: boolean; isBreastfeeding: boolean; treatments: string[] } | null {
  const text = typeof input.demande === "string" ? input.demande.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  if (text.length < 5) return null;
  const age = typeof input.age_ans === "number" && Number.isFinite(input.age_ans) ? Math.round(input.age_ans) : null;
  const treatments = Array.isArray(input.traitements)
    ? [...new Set(input.traitements.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 80)).filter(Boolean))].slice(0, 10)
    : [];
  return { text, ageYears: age !== null && age >= 0 && age <= 120 ? age : null, isPregnant: input.enceinte === true, isBreastfeeding: input.allaitement === true, treatments };
}

/**
 * Le conseil au comptoir depuis la Discussion : le service de la demande sans ordonnance (compréhension, règles validées,
 * stock de CETTE officine, sécurité), et rien d'autre. Seuls ses produits sortent, avec le lien de leur fiche quand c'est
 * un produit du stock de l'officine.
 */
async function conseilComptoir(ctx: PharmacyToolContext, input: Input): Promise<ToolOutput> {
  const parsed = counterAdviceInput(input);
  if (!parsed) return { erreur: "Décris la demande du patient en quelques mots (5 caractères au moins)." };
  const answer = await adviseCounterRequest({ scope: ctx.scope, pharmacyIsDemo: ctx.pharmacyIsDemo ?? ctx.scope.isDemo === true, input: parsed });
  const ids = answer.proposals.map((proposal) => proposal.productId);
  const inStock = ids.length
    ? new Set((await prisma.product.findMany({ where: { id: { in: ids }, pharmacyId: ctx.scope.pharmacyId, deletedAt: null }, select: { id: true } })).map((product) => product.id))
    : new Set<string>();
  return {
    demande_comprise: answer.summary,
    orienter_vers_un_medecin: answer.referToDoctor,
    raison_orientation: answer.referReason,
    besoins: answer.needs.map((need) => need.label),
    questions_a_poser: answer.questions,
    produits_proposes: answer.proposals.map((proposal) => ({
      produit: proposal.name,
      marque: proposal.brand,
      raison: proposal.shortReason,
      phrase_au_comptoir: proposal.counterScript || null,
      question_avant: proposal.question,
      precautions: proposal.precautions,
      vigilances: (proposal.vigilances ?? []).map((vigilance) => vigilance.text),
      prix: proposal.salePriceCents > 0 ? euros(proposal.salePriceCents) : null,
      en_stock: proposal.stockQuantity,
      lien: inStock.has(proposal.productId) ? `/stock/${proposal.productId}` : null,
    })),
    ecartes_par_securite: answer.blocked,
    remarques: answer.notes,
    avertissements: answer.warnings,
    rappel: "Conseils du moteur PharmaBoost (règles validées par la pharmacienne, stock de l'officine). La décision revient au pharmacien.",
  };
}

const HANDLERS: Record<string, (ctx: PharmacyToolContext, input: Input) => Promise<ToolOutput>> = {
  conseil_comptoir: conseilComptoir,
  ma_journee: maJournee,
  conseils_et_ventes: conseilsEtVentes,
  challenges,
  dates_courtes: datesCourtes,
  stock_produit: stockProduit,
  equipe,
};

export const PHARMACY_HANDLER_NAMES = Object.keys(HANDLERS);

/**
 * Exécute un outil pour CETTE personne. Un outil inconnu, ou réservé et non autorisé, est refusé (même si le modèle
 * l'appelle sans qu'on le lui ait proposé). Une lecture qui échoue renvoie une erreur lisible, jamais d'exception.
 */
export async function runPharmacyTool(ctx: PharmacyToolContext, name: string, rawInput: unknown): Promise<{ ok: boolean; output: ToolOutput }> {
  const allowed = new Set(pharmacyToolsFor(ctx.viewer).map((tool) => tool.name));
  const handler = HANDLERS[name];
  if (!handler || !PHARMACY_TOOL_NAMES.includes(name)) return { ok: false, output: { erreur: `Outil inconnu : ${name}.` } };
  if (!allowed.has(name)) return { ok: false, output: { erreur: "Réservé : cette personne n'a pas accès à ces données." } };
  const input = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) ? (rawInput as Input) : {};
  try {
    return { ok: true, output: await handler(ctx, input) };
  } catch (error) {
    console.error(`[robot-officine] outil ${name} en échec`, error);
    return { ok: false, output: { erreur: "Lecture impossible pour l'instant." } };
  }
}
