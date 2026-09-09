/**
 * Crée une officine de TEST avec son titulaire, et affiche le lien de mot de
 * passe — pour vérifier le parcours complet sur un environnement réel sans
 * toucher aux vraies officines. Rien n'est envoyé par e-mail.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/officine-test.ts \
 *     --nom "Pharmacie Test PharmaBoost" --email adresse --prenom Prénom --nom-titulaire Nom
 *
 * Idempotent sur l'adresse : si le titulaire existe, seul un nouveau lien est émis.
 */
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { uniqueSlug } from "@/server/services/slugs";
import { issueUserPasswordLink } from "@/server/services/user-password";
import { randomBytes } from "node:crypto";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("nom") ?? "Pharmacie Test PharmaBoost";
  const email = arg("email")?.toLowerCase();
  const firstName = arg("prenom") ?? "Test";
  const lastName = arg("nom-titulaire") ?? "PharmaBoost";
  if (!email) throw new Error("--email est requis.");

  let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    const [organizationSlug, pharmacySlug] = await Promise.all([uniqueSlug(name, "organization"), uniqueSlug(name, "pharmacy")]);
    const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
    user = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name, slug: organizationSlug } });
      const pharmacy = await tx.pharmacy.create({ data: { organizationId: organization.id, name, slug: pharmacySlug, isDemo: false, isActive: true } });
      const owner = await tx.user.create({ data: { organizationId: organization.id, email, firstName, lastName, passwordHash, status: "ACTIVE" } });
      await tx.membership.create({ data: { userId: owner.id, pharmacyId: pharmacy.id, role: "OWNER", isActive: true } });
      console.log(`Officine créée : ${pharmacy.id} (${name})`);
      return { id: owner.id };
    });
  } else {
    console.log("Titulaire existant : nouveau lien émis.");
  }
  const link = await issueUserPasswordLink(user.id);
  console.log(`Lien : ${link.url}`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
