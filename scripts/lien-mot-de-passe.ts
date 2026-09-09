/**
 * Émet un lien de définition de mot de passe pour un utilisateur d'officine.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/lien-mot-de-passe.ts --email adresse
 *
 * Le lien remplace tout lien précédent. Rien n'est envoyé : le lien est
 * simplement affiché, pour un test local ou un dépannage.
 */
import { prisma } from "@/server/db/client";
import { issueUserPasswordLink } from "@/server/services/user-password";

async function main() {
  const i = process.argv.indexOf("--email");
  const email = i >= 0 ? process.argv[i + 1]?.toLowerCase() : undefined;
  if (!email) throw new Error("--email est requis.");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, firstName: true } });
  if (!user) throw new Error(`Aucun utilisateur ${email}.`);
  const link = await issueUserPasswordLink(user.id);
  console.log(`${user.firstName} → ${link.url} (valide jusqu'au ${link.expiresAt.toISOString()})`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
