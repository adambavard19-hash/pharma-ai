/**
 * Installe, ou remet à l'état initial, l'officine de démonstration commerciale.
 *
 *   npm run demo:commercial                      installe (ou réinitialise) l'officine de démonstration
 *   npm run demo:commercial -- --mot-de-passe X  fixe le mot de passe du compte
 *   npm run demo:commercial -- --mots-de-passe   remet le mot de passe de l'équipe (sinon on n'y touche pas)
 *
 * Ne touche qu'à l'officine désignée par son identifiant réservé et à son groupe :
 * aucune autre ligne de la base. En production, l'appel doit être confirmé
 * (`--confirmer-production`) et le mot de passe est tiré au hasard si on n'en donne pas.
 */
import { prisma } from "@/server/db/client";
import { appEnvironment } from "@/config/env";
import { installDemoPharmacy } from "@/server/services/demo/provision";
import { DEMO_LOGIN_EMAIL, DEMO_PHARMACY } from "@/core/demo/identity";

async function main() {
  const args = process.argv.slice(2);
  const passwordIndex = args.indexOf("--mot-de-passe");
  const password = passwordIndex >= 0 ? args[passwordIndex + 1] : null;
  if (appEnvironment() === "production" && !args.includes("--confirmer-production")) {
    throw new Error("Environnement de production : ajoutez --confirmer-production pour installer ou réinitialiser l'officine de démonstration.");
  }

  const result = await installDemoPharmacy({ password, setPasswords: args.includes("--mots-de-passe") || password !== null, log: (line) => console.log(`  · ${line}`) });
  console.log(`\n${result.created ? "✓ Officine de démonstration installée" : "✓ Officine de démonstration remise à l'état initial"} : ${DEMO_PHARMACY.name}`);
  console.log(`  ${result.counts.products} produits, ${result.counts.drugs} médicaments en stock, ${result.counts.visits} passages au comptoir, ${result.counts.sales} ventes, ${result.counts.recommendations} conseils.`);
  if (result.missingDrugs.length > 0) console.log(`  ⚠ Introuvables dans le catalogue national de cette base : ${result.missingDrugs.join(" | ")}`);
  console.log("\n  Connexion");
  console.log(`    adresse       ${DEMO_LOGIN_EMAIL}`);
  console.log(`    mot de passe  ${result.password ?? "(inchangé)"}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
