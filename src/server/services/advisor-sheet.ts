import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { loadClosedSales } from "@/server/services/counter-history";
import { COUNTER_DECLARED } from "@/server/services/counter-window";
import { myComptoirs } from "@/server/services/comptoirs";
import { certificateCode, computeAdvisorStats, type AdvisorStats } from "@/core/team/advisor-sheet";
import { renderAdvisorSheetPdf } from "@/core/team/advisor-sheet-pdf";
import { TIME_ZONE } from "@/config/constants";

/**
 * La fiche « Conseiller certifié PharmaBoost » d'un collaborateur (19 nov. 2026) : ses chiffres depuis ses débuts, calculés à
 * la demande, puis une fiche émise (code court vérifiable) et son PDF. Seule la personne elle-même la télécharge.
 */

const SITE = "https://pharmaboost.app";
const SINCE = new Date("2026-01-01T00:00:00Z");

export async function loadAdvisorStats(scope: { pharmacyId: string; userId: string }, now = new Date()): Promise<AdvisorStats> {
  const { postIds } = await myComptoirs(scope);
  const onlyFor = { userId: scope.userId, postIds };
  const [sales, soldRecs, reviews] = await Promise.all([
    loadClosedSales({ pharmacyId: scope.pharmacyId, from: SINCE, to: now, take: 20000, onlyFor }),
    prisma.recommendation.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        status: "PURCHASED",
        outcomeSource: COUNTER_DECLARED,
        prescription: { counterFollowUp: { closedAt: { not: null } }, OR: [{ handledByUserId: scope.userId }, { counterPostId: { in: postIds } }] },
      },
      take: 20000,
      select: { product: { select: { category: true } } },
    }),
    prisma.patientReview.findMany({ where: { staffUserId: scope.userId }, select: { rating: true }, take: 5000 }),
  ]);
  const first = sales.length ? sales.reduce((min, sale) => (sale.closedAt < min ? sale.closedAt : min), sales[0].closedAt) : null;
  return computeAdvisorStats({
    sales,
    soldCategories: soldRecs.map((rec) => rec.product?.category).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    ratings: reviews.map((review) => review.rating),
    firstSaleDay: first ? new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE }).format(first) : null,
  });
}

/** Émet une fiche (code unique) et rend son PDF. */
export async function issueAdvisorSheet(input: {
  scope: { pharmacyId: string; userId: string };
  fullName: string;
  roleLabel: string;
  pharmacyName: string;
  pharmacyCity: string | null;
  now?: Date;
}): Promise<{ bytes: Uint8Array; fileName: string; code: string }> {
  const now = input.now ?? new Date();
  const stats = await loadAdvisorStats(input.scope, now);
  let code = certificateCode(randomBytes(8));
  for (let i = 0; i < 5 && (await prisma.advisorCertificate.findUnique({ where: { code }, select: { id: true } })); i += 1) code = certificateCode(randomBytes(8));
  await prisma.advisorCertificate.create({
    data: {
      code,
      userId: input.scope.userId,
      pharmacyId: input.scope.pharmacyId,
      fullName: input.fullName,
      roleLabel: input.roleLabel,
      pharmacyName: input.pharmacyName,
      pharmacyCity: input.pharmacyCity,
      stats: stats as unknown as object,
      issuedAt: now,
    },
  });
  const bytes = await renderAdvisorSheetPdf({
    fullName: input.fullName,
    roleLabel: input.roleLabel,
    pharmacyName: input.pharmacyName,
    pharmacyCity: input.pharmacyCity,
    stats,
    code,
    verifyUrl: `${SITE}/certificat/${code}`,
    issuedAt: now,
    timeZone: TIME_ZONE,
  });
  const slug = input.fullName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return { bytes, fileName: `pharmaboost-fiche-conseiller-${slug}.pdf`, code };
}

export type VerifiedCertificate = { code: string; fullName: string; roleLabel: string; pharmacyName: string; pharmacyCity: string | null; stats: AdvisorStats; issuedAt: Date };

export async function findCertificate(code: string): Promise<VerifiedCertificate | null> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
  if (!/^PB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(clean)) return null;
  const row = await prisma.advisorCertificate.findUnique({ where: { code: clean } });
  if (!row) return null;
  return { code: row.code, fullName: row.fullName, roleLabel: row.roleLabel, pharmacyName: row.pharmacyName, pharmacyCity: row.pharmacyCity, stats: row.stats as unknown as AdvisorStats, issuedAt: row.issuedAt };
}
