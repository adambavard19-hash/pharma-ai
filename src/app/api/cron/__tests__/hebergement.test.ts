import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Notre hébergement (Vercel, formule « Hobby ») n'autorise que DEUX tâches planifiées, chacune au plus une fois par jour : une troisième
 * fait échouer tout le déploiement. Ce test lit `vercel.json` et le garde : on peut ajouter du travail à une tâche existante, pas une tâche.
 */
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as { crons?: { path: string; schedule: string }[] };
const crons = config.crons ?? [];

describe("les tâches planifiées tiennent dans la formule Hobby de Vercel", () => {
  it("il y en a deux au plus", () => {
    expect(crons.length).toBeLessThanOrEqual(2);
  });

  it("chacune tourne une fois par jour au plus : minute et heure fixes, tous les jours", () => {
    for (const cron of crons) {
      const [minute, hour, day, month, weekday] = cron.schedule.trim().split(/\s+/);
      expect(/^\d+$/.test(minute) && /^\d+$/.test(hour), cron.schedule).toBe(true);
      expect([day, month, weekday], cron.schedule).toEqual(["*", "*", "*"]);
    }
  });

  it("chacune pointe vers une vraie route, protégée par CRON_SECRET", () => {
    for (const cron of crons) {
      const file = join(ROOT, "src", "app", cron.path.replace(/^\//, ""), "route.ts");
      expect(existsSync(file), cron.path).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source, cron.path).toContain("CRON_SECRET");
      expect(source, cron.path).toContain("export async function GET");
    }
  });

  it("la tâche quotidienne des relances porte aussi le bilan mensuel du comptoir et la connaissance du stock, avec le temps qu'il faut", () => {
    const source = readFileSync(join(ROOT, "src", "app", "api", "cron", "automatisations", "route.ts"), "utf8");
    expect(source).toContain("sendMonthlyCounterReports");
    expect(source).toContain("runStockLearningPass");
    // Les relances d'abord, la connaissance du stock en dernier : elle ne retarde jamais les relances.
    expect(source.indexOf("runAutomations(")).toBeLessThan(source.indexOf("runStockLearningPass("));
    expect(source).toMatch(/maxDuration = 300/);
  });

  it("la tâche quotidienne efface aussi les adresses e-mail du bilan restées en base, EN PREMIER", () => {
    const source = readFileSync(join(ROOT, "src", "app", "api", "cron", "automatisations", "route.ts"), "utf8");
    expect(source).toContain("purgeCounterEmails(now)");
    // La promesse des 48 heures tient si l'étape tourne chaque jour : une étape longue placée avant elle (relances, campagnes)
    // pourrait épuiser maxDuration et la faire sauter. Elle passe donc juste après la vérification du secret, avant tout le reste.
    const purge = source.indexOf("purgeCounterEmails(");
    for (const step of ["runAutomations(", "processDueCampaigns(", "resumeStuckAnnouncements(", "purgeStalePatientNews(", "purgeExpiredDepositFiles(", "closeStalledDeposits(", "sendMonthlyCounterReports(", "runStockLearningPass("]) {
      expect(source.indexOf(step), step).toBeGreaterThan(-1);
      expect(purge, step).toBeLessThan(source.indexOf(step));
    }
    expect(source.indexOf("CRON_SECRET")).toBeLessThan(purge);
  });
});
