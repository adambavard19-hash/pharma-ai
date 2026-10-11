/**
 * Le compte des vérificateurs d'Apple pour PharmaBoost Mobile (TestFlight, App Store) : à donner dans App Store Connect.
 *
 *   npm run revue-apple                         base locale : crée ou remet le compte, affiche l'adresse et le mot de passe
 *   npm run revue-apple -- --confirmer-production   même chose sur la production (accord du fondateur)
 *   npm run revue-apple -- --nouveau-mot-de-passe   tire un nouveau mot de passe
 *
 * Le compte est un pharmacien adjoint de l'officine de démonstration (données fictives, isolée) : jamais titulaire, jamais
 * administrateur, aucun accès à une vraie pharmacie. Si l'officine de démonstration manque, elle est installée.
 * Le mot de passe est gardé dans ~/.pharmaboost-revue-apple.txt (lisible par vous seul) : relancer ne le change pas.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/server/db/client";
import { appEnvironment } from "@/config/env";
import { installDemoPharmacy } from "@/server/services/demo/provision";
import { ensureAppReviewAccount } from "@/server/services/demo/app-review";
import { APP_REVIEW_MEMBER, DEMO_PHARMACY, DEMO_PHARMACY_SLUG } from "@/core/demo/identity";

const production = appEnvironment() === "production";
const SECRET_FILE = path.join(os.homedir(), production ? ".pharmaboost-revue-apple.txt" : ".pharmaboost-revue-apple-local.txt");

function password(): string {
  if (!process.argv.includes("--nouveau-mot-de-passe") && existsSync(SECRET_FILE)) {
    const saved = readFileSync(SECRET_FILE, "utf8").trim();
    if (saved) return saved;
  }
  // Facile à recopier (pas de caractère ambigu), et conforme au contrôle de robustesse : majuscule, minuscule, chiffre, symbole.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  const generated = `Revue-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}7a`;
  writeFileSync(SECRET_FILE, `${generated}\n`, { mode: 0o600 });
  chmodSync(SECRET_FILE, 0o600);
  return generated;
}

async function main() {
  if (production && !process.argv.includes("--confirmer-production")) {
    throw new Error("Environnement de production : ajoutez --confirmer-production (accord du fondateur).");
  }
  if (!(await prisma.pharmacy.findUnique({ where: { slug: DEMO_PHARMACY_SLUG }, select: { id: true } }))) {
    console.log("Officine de démonstration absente : installation…");
    await installDemoPharmacy({ log: (line) => console.log(`  · ${line}`) });
  }
  const secret = password();
  const result = await ensureAppReviewAccount(secret);
  console.log(`\n✓ Compte des vérificateurs Apple ${result.created ? "créé" : "remis à jour"} — ${DEMO_PHARMACY.name} (données fictives)`);
  console.log(`    adresse       ${APP_REVIEW_MEMBER.email}`);
  console.log(`    mot de passe  ${secret}`);
  console.log(`    (gardé dans ${SECRET_FILE})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
