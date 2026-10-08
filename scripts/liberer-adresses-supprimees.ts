/**
 * Libère les adresses e-mail des comptes supprimés AVANT le correctif d'octobre 2026.
 *
 * L'ancien geste « Supprimer le compte » marquait le compte supprimé mais gardait son adresse : elle restait donc
 * inutilisable (« cette adresse appartient à un compte supprimé »). Le nouveau geste rend le compte anonyme ; ce script
 * applique la même anonymisation aux anciens (adresse, téléphone, RPPS, mot de passe effacés ; le nom reste).
 *
 *   npm run comptes:liberer-adresses                           COMPTE seulement, ne modifie rien
 *   npm run comptes:liberer-adresses -- --appliquer            anonymise les comptes supprimés
 *   npm run comptes:liberer-adresses -- --appliquer --confirmer-production    idem, sur la production
 *
 * Ne touche qu'aux comptes DÉJÀ supprimés (`deletedAt` renseigné) ; idempotent (un compte déjà libéré n'est pas retouché).
 */
import { prisma } from "@/server/db/client";
import { appEnvironment } from "@/config/env";
import { releaseDeletedUserEmails } from "@/server/services/admin/deletion";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--appliquer");
  if (apply && appEnvironment() === "production" && !args.includes("--confirmer-production")) {
    throw new Error("Environnement de production : ajoutez --confirmer-production pour anonymiser les comptes supprimés.");
  }

  const pending = await prisma.user.count({ where: { deletedAt: { not: null }, NOT: { email: { endsWith: "@suppression.pharmaboost.invalid" } } } });
  if (!apply) {
    console.log(`${pending} compte${pending > 1 ? "s supprimés gardent" : " supprimé garde"} encore ${pending > 1 ? "leur adresse" : "son adresse"}.`);
    console.log(pending > 0 ? "Pour les libérer : npm run comptes:liberer-adresses -- --appliquer" : "Rien à faire.");
    return;
  }
  const { released } = await releaseDeletedUserEmails();
  console.log(`✓ ${released} compte${released > 1 ? "s" : ""} anonymisé${released > 1 ? "s" : ""} : ${released > 1 ? "leurs adresses sont" : "son adresse est"} de nouveau disponible${released > 1 ? "s" : ""}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
