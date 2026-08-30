/**
 * Mesure du parcours comptoir.
 *
 * Le produit promet une chose vérifiable : moins d'une minute entre le scan
 * d'une ordonnance et la fin de la vente. Ce script la vérifie dans un vrai
 * navigateur, sur la vraie application, plutôt que de l'affirmer.
 *
 * Prérequis : l'application doit tourner (`npm run dev` ou `npm run start`) et
 * le jeu de démonstration être installé (`npm run db:seed`).
 *
 * Usage : npm run demo:comptoir
 *   BASE_URL        adresse de l'application (défaut http://localhost:3000)
 *   DEMO_EMAIL      compte utilisé (défaut pharmacien@pharma.ai)
 *   CHROMIUM_PATH   binaire Chromium, si Playwright ne le trouve pas seul
 */

import { chromium, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL ?? "pharmacien@pharma.ai";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo2026!Pharma";

/** Budget de conception, en secondes, du scan à la fin de vente. */
const BUDGET_SECONDS = 60;

const OK = "[32m✓[0m";
const KO = "[31m✗[0m";
const BOLD = "[1m";
const DIM = "[2m";
const RESET = "[0m";

type Step = { label: string; ms: number; detail?: string };

async function main() {
  console.log(`\n${BOLD}Mesure du parcours comptoir${RESET}`);
  console.log(`${DIM}${BASE_URL} · ${EMAIL}${RESET}\n`);

  const reachable = await fetch(`${BASE_URL}/login`)
    .then((response) => response.ok)
    .catch(() => false);

  if (!reachable) {
    console.log(`${KO} ${BASE_URL} ne répond pas.`);
    console.log(`  Lancez l'application dans un autre terminal : ${BOLD}npm run dev${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.getuid?.() === 0 ? ["--no-sandbox"] : [],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const steps: Step[] = [];
  const since = (from: number) => Date.now() - from;

  try {
    // La connexion ne compte pas : le pharmacien est déjà connecté quand le
    // patient arrive au comptoir.
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login")),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForLoadState("networkidle");

    const start = Date.now();

    // 1. Le grand bouton de l'accueil.
    let mark = Date.now();
    await page.click('a[href="/vente/nouvelle"]');
    await page.waitForURL(/\/vente\/nouvelle/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    steps.push({ label: "Accueil → écran de scan", ms: since(mark) });

    // 2. Import de l'ordonnance.
    mark = Date.now();
    const patients = await page.$$eval('select[name="patientId"] option', (options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
    if (patients.length === 0) throw new Error("Aucun patient : lancez `npm run db:seed`.");
    await page.selectOption('select[name="patientId"]', patients[0]);
    await page.click('button[type="submit"]');
    await page.waitForURL(
      (url) => /^\/vente\/[a-z0-9]+$/.test(url.pathname) && !url.pathname.endsWith("/nouvelle"),
      { timeout: 60_000 },
    );
    await page.waitForLoadState("networkidle");
    steps.push({ label: "Scan → ordonnance lue à l'écran", ms: since(mark) });

    // 3. Confirmation des lignes.
    mark = Date.now();
    const confirmed = await confirmAllLines(page);
    steps.push({
      label: "Vérification des lignes",
      ms: since(mark),
      detail: `${confirmed} ligne(s)`,
    });

    // 4. Analyse : sécurité puis conseils, sans changer d'écran.
    mark = Date.now();
    await page.click('button:has-text("Confirmer et analyser")');
    await page.waitForSelector('h2:has-text("Conseils")', { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    // Le cockpit ne propose plus qu'un verbe par carte : « Ajouter ».
    const advice = await page.locator('button:has-text("Ajouter"):not(:has-text("un conseil"))').count();
    steps.push({
      label: "Analyse → sécurité et conseils affichés",
      ms: since(mark),
      detail: `${advice} conseil(s)`,
    });

    // 5. Décision du pharmacien sur le conseil.
    if (advice > 0) {
      mark = Date.now();
      await page.locator('button:has-text("Ajouter"):not(:has-text("un conseil"))').first().click();
      await page.waitForSelector('button:has-text("Dans la vente")', { timeout: 30_000 });
      steps.push({ label: "Conseil ajouté à la vente", ms: since(mark) });
    }

    // 6. Encaissement et passage à la fin de vente.
    mark = Date.now();
    // Panier vide, le comptoir « continue la délivrance » ; panier garni, il
    // « termine la vente ». Les deux mènent à la fiche de fin.
    await page
      .locator('button:has-text("Terminer la vente"), button:has-text("Continuer la délivrance")')
      .first()
      .click();
    await page.waitForURL(/\/fin$/, { timeout: 60_000 });
    steps.push({
      label: advice > 0 ? "Vente enregistrée → fin de vente" : "Vente terminée sans conseil",
      ms: since(mark),
    });

    // 7. Fiche prête à être remise : c'est là que s'arrête le comptoir.
    mark = Date.now();
    await page.waitForLoadState("networkidle");
    steps.push({ label: "Fiche patient prête à l'écran", ms: since(mark) });

    const total = Date.now() - start;

    console.log(`${BOLD}Étapes${RESET}`);
    for (const [index, step] of steps.entries()) {
      const seconds = (step.ms / 1000).toFixed(2).padStart(6);
      console.log(
        `  ${index + 1}. ${step.label.padEnd(42)} ${seconds} s` +
          (step.detail ? `${DIM}  ${step.detail}${RESET}` : ""),
      );
    }

    const seconds = total / 1000;
    const within = seconds <= BUDGET_SECONDS;
    console.log(
      `\n${within ? OK : KO} ${BOLD}Total : ${seconds.toFixed(2)} s${RESET} ` +
        `${DIM}(budget ${BUDGET_SECONDS} s)${RESET}`,
    );

    // Le chiffre mesure la machine, pas le pharmacien : ce qui reste du budget
    // est le temps disponible pour la conversation avec le patient.
    console.log(
      `${DIM}  Temps machine uniquement — la saisie et la conversation ne sont pas simulées.\n` +
        `  Il reste ${(BUDGET_SECONDS - seconds).toFixed(0)} s de budget pour le patient.${RESET}`,
    );

    console.log(
      `\n${errors.length === 0 ? OK : KO} Erreurs JavaScript : ${
        errors.length === 0 ? "aucune" : errors.join(" | ")
      }\n`,
    );

    if (!within || errors.length > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

/** Confirme chaque ligne extraite, comme le ferait le pharmacien. */
async function confirmAllLines(page: Page): Promise<number> {
  let guard = 0;
  while ((await page.locator('button:has-text("À confirmer")').count()) > 0 && guard++ < 20) {
    await page.locator('button:has-text("À confirmer")').first().click();
    await page.waitForTimeout(80);
  }
  return page.locator('button:has-text("Confirmée")').count();
}

main().catch((error) => {
  console.error("\nMesure interrompue :", error);
  process.exit(1);
});
