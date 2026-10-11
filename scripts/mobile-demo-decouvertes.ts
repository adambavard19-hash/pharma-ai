/**
 * PharmaBoost Mobile, étape Découvertes — données d'EXEMPLE pour l'aperçu local.
 *
 * Crée (ou remet d'aplomb) un partenaire « Laboratoire A (exemple) » et sa marque « Marque A », une gamme, deux
 * produits aux noms génériques, une nouveauté (parapharmacie, marquée « exemple ») et une campagne MISE_EN_AVANT
 * active sur l'accueil (HOME_FEED) et en tête des Découvertes (DISCOVER_TOP). Aucune allégation, aucun fait médical,
 * aucun visuel inventé, aucun chiffre de statistiques : les compteurs se remplissent en naviguant.
 *
 * Le partenaire n'a AUCUN contact : une demande d'information de l'aperçu reste à l'équipe (rien ne part par e-mail).
 *
 *   npm run mobile:demo:decouvertes                créer / réinitialiser
 *   npm run mobile:demo:decouvertes -- --supprimer tout retirer (partenaire, marque, nouveauté, campagne, demandes)
 *
 * Refuse de tourner ailleurs que sur une base locale.
 */
import { prisma } from "@/server/db/client";
import { brandKey } from "@/core/catalog/brand";

const PARTNER_SLUG = "laboratoire-a-exemple";
const BRAND_SLUG = "marque-a-exemple";
const VALIDATOR = "Exemple — validation locale de l'aperçu (non réelle)";

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? "";
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refus : ce script ne s'exécute que sur une base locale (hôte lu : « ${host || "inconnu"} »).`);
  }
}

async function remove() {
  const partner = await prisma.partner.findUnique({ where: { slug: PARTNER_SLUG }, select: { id: true } });
  if (!partner) {
    console.log("Rien à retirer : le partenaire d'exemple n'existe pas.");
    return;
  }
  // Marque, gammes, produits, nouveautés, campagnes (et leurs compteurs), demandes : suppression en cascade.
  await prisma.userFavorite.deleteMany({ where: { targetType: "BRAND", targetId: { in: (await prisma.partnerBrand.findMany({ where: { partnerId: partner.id }, select: { id: true } })).map((b) => b.id) } } });
  await prisma.partner.delete({ where: { id: partner.id } });
  console.log("✓ Partenaire d'exemple retiré (marque, nouveauté, campagne, demandes et compteurs avec lui).");
}

async function create() {
  const now = new Date();
  const partner = await prisma.partner.upsert({
    where: { slug: PARTNER_SLUG },
    update: { status: "ACTIVE", name: "Laboratoire A (exemple)", startsAt: null, endsAt: null },
    create: {
      slug: PARTNER_SLUG,
      name: "Laboratoire A (exemple)",
      description: "Partenaire d'exemple pour l'aperçu local de PharmaBoost Mobile. Aucune donnée réelle.",
      universes: ["DERMOCOSMETIQUE"],
      status: "ACTIVE",
      notes: "Créé par scripts/mobile-demo-decouvertes.ts — à ne jamais reproduire en production.",
    },
    select: { id: true },
  });

  const brand = await prisma.partnerBrand.upsert({
    where: { slug: BRAND_SLUG },
    update: { status: "ACTIVE", audience: "ALL_PHARMACIES", publishedAt: now },
    create: {
      partnerId: partner.id,
      slug: BRAND_SLUG,
      name: "Marque A",
      brandKey: brandKey("Marque A exemple"),
      description: "Marque d'exemple : fiche de démonstration de l'onglet Découvertes, sans produit réel.",
      universes: ["DERMOCOSMETIQUE"],
      status: "ACTIVE",
      audience: "ALL_PHARMACIES",
      publishedAt: now,
    },
    select: { id: true },
  });

  let range = await prisma.partnerRange.findFirst({ where: { brandId: brand.id, name: "Gamme exemple" }, select: { id: true } });
  if (!range) range = await prisma.partnerRange.create({ data: { brandId: brand.id, name: "Gamme exemple", description: "Gamme de démonstration (exemple).", universe: "DERMOCOSMETIQUE", status: "ACTIVE" }, select: { id: true } });
  for (const name of ["Crème exemple 50 ml", "Gel lavant exemple 200 ml"]) {
    const existing = await prisma.partnerProduct.findFirst({ where: { brandId: brand.id, name }, select: { id: true } });
    if (!existing) await prisma.partnerProduct.create({ data: { brandId: brand.id, rangeId: range.id, name, description: "Produit d'exemple (aperçu local).", isActive: true } });
  }

  const launchData = {
    partnerId: partner.id,
    brandId: brand.id,
    title: "Exemple — la Gamme exemple de Marque A",
    summary: "Nouveauté d'exemple pour l'aperçu local : aucune information réelle.",
    body: "Ceci est une nouveauté d'EXEMPLE, créée pour montrer l'onglet Découvertes dans l'aperçu local.\n\nUne vraie nouveauté reprend ici les informations fournies par le laboratoire, relues et validées par PharmaBoost avant publication.",
    universe: "DERMOCOSMETIQUE",
    regulatoryCategory: "PARAPHARMACY" as const,
    regulatoryValidatedBy: VALIDATOR,
    regulatoryValidatedAt: now,
    reviewStatus: "APPROVED" as const,
    publishedAt: now,
    endsAt: null,
  };
  let launch = await prisma.partnerLaunch.findFirst({ where: { brandId: brand.id, title: launchData.title }, select: { id: true } });
  if (launch) await prisma.partnerLaunch.update({ where: { id: launch.id }, data: launchData });
  else launch = await prisma.partnerLaunch.create({ data: launchData, select: { id: true } });

  const campaignData = {
    partnerId: partner.id,
    brandId: brand.id,
    launchId: launch.id,
    name: "Exemple — mise en avant Marque A",
    format: "MISE_EN_AVANT" as const,
    placements: ["HOME_FEED" as const, "DISCOVER_TOP" as const],
    audiences: [],
    startsAt: new Date(now.getTime() - 60 * 60 * 1000),
    endsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    status: "ACTIVE" as const,
    regulatoryCategory: "PARAPHARMACY" as const,
    regulatoryReviewedBy: VALIDATOR,
    regulatoryReviewedAt: now,
    regulatoryNotes: "Campagne d'exemple (aperçu local).",
    priceNote: "Tarif à définir (exemple)",
  };
  const campaign = await prisma.sponsoredCampaign.findFirst({ where: { partnerId: partner.id, name: campaignData.name }, select: { id: true } });
  if (campaign) await prisma.sponsoredCampaign.update({ where: { id: campaign.id }, data: campaignData });
  else await prisma.sponsoredCampaign.create({ data: campaignData });

  console.log("\nPharmaBoost Mobile — Découvertes : données d'exemple prêtes (base locale)\n");
  console.log("  Laboratoire A (exemple) · Marque A · 1 gamme · 2 produits · 1 nouveauté · 1 campagne active (accueil + Découvertes)");
  console.log("  Application : http://localhost:3000/m/decouvertes   ·   Console : http://localhost:3000/admin/partenaires/campagnes");
  console.log("  Retirer : npm run mobile:demo:decouvertes -- --supprimer\n");
}

async function main() {
  assertLocalDatabase();
  if (process.argv.includes("--supprimer")) await remove();
  else await create();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
