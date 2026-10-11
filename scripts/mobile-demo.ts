/**
 * PharmaBoost Mobile — le compte de démonstration GRATUIT, pour l'aperçu local.
 *
 * Crée (ou remet d'aplomb) un compte de la Communauté PharmaBoost, sans officine : c'est l'expérience « compte
 * gratuit » de l'application /m. L'expérience « équipe d'une officine cliente » se montre avec les comptes de
 * démonstration existants (pharmacien@, titulaire@, preparateur@pharma.ai — mot de passe Demo2026!Pharma).
 *
 * Aucune donnée médicale, aucune formation inventée : le compte seul, et ce qu'il a coché (rien).
 *
 *   npm run mobile:demo                créer / réinitialiser
 *   npm run mobile:demo -- --supprimer retirer le compte (et ses sessions, ses accords)
 *
 * Refuse de tourner ailleurs que sur une base locale.
 */
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { ensureCommunityOrganization } from "@/server/services/mobile/community";

const EMAIL = "etudiant.demo@pharmaboost.test";
const PASSWORD = "Etudiant2026!Demo";
const CLIENT_ACCOUNTS = ["pharmacien@pharma.ai", "titulaire@pharma.ai", "preparateur@pharma.ai"];

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? "";
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refus : ce script ne s'exécute que sur une base locale (hôte lu : « ${host || "inconnu"} »).`);
  }
}

async function remove() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, memberships: { select: { id: true } } } });
  if (!user) {
    console.log(`Rien à retirer : ${EMAIL} n'existe pas.`);
    return;
  }
  if (user.memberships.length > 0) throw new Error(`${EMAIL} a rejoint une officine entre-temps : retrait refusé, faites-le depuis la console.`);
  // Sessions, accords, favoris… partent avec le compte (suppression en cascade) ; le journal d'audit garde ses lignes, sans lien.
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`✓ ${EMAIL} retiré.`);
}

async function create() {
  const organizationId = await ensureCommunityOrganization();
  const passwordHash = await hashPassword(PASSWORD);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, organizationId: true } });
  if (existing && existing.organizationId !== organizationId) throw new Error(`${EMAIL} appartient à une organisation cliente : il n'est plus un compte de démonstration gratuit.`);

  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, status: "ACTIVE", deletedAt: null, firstName: "Inès", lastName: "Martin", profession: "PHARMACY_STUDENT", mobileOnboardedAt: new Date() },
    create: {
      organizationId,
      email: EMAIL,
      firstName: "Inès",
      lastName: "Martin",
      passwordHash,
      status: "ACTIVE",
      profession: "PHARMACY_STUDENT",
      declaredPharmacyName: "Faculté de pharmacie (stage en officine)",
      mobileOnboardedAt: new Date(),
    },
  });

  const clients = await prisma.user.findMany({ where: { email: { in: CLIENT_ACCOUNTS } }, select: { email: true, memberships: { where: { isActive: true }, select: { role: true, pharmacy: { select: { name: true } } } } } });

  console.log("\nPharmaBoost Mobile — comptes de l'aperçu local\n");
  console.log("  Compte gratuit (Communauté PharmaBoost, sans officine)");
  console.log(`    ${EMAIL}  ·  ${PASSWORD}`);
  console.log("\n  Équipes d'officine cliente (mot de passe Demo2026!Pharma)");
  for (const email of CLIENT_ACCOUNTS) {
    const client = clients.find((entry) => entry.email === email);
    const where = client?.memberships.map((m) => `${m.pharmacy.name} (${m.role})`).join(", ") || "absent de cette base — lancez npm run db:seed";
    console.log(`    ${email.padEnd(24)} ${where}`);
  }
  console.log("\n  Ouvrir : http://localhost:3000/m  ·  au téléphone : npm run live -- --reseau\n");
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
