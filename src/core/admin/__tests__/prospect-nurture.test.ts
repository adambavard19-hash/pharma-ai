import { describe, expect, it } from "vitest";
import { AUTOMATION_RULES, PROSPECT_NURTURE_STEPS, planAutomations, resolveRules, type DemoProspectCandidate } from "../automations";
import { emailTemplate } from "../email-templates";

/** Les relances des prospects qui ont réservé une démonstration (16 oct. 2026). */

const NOW = new Date("2026-10-20T08:00:00Z");
const demoProspect = (overrides: Partial<DemoProspectCandidate> = {}): DemoProspectCandidate => ({ id: "pr_1", status: "DEMO_DONE", demoAt: new Date("2026-10-19T09:00:00Z"), blockedAt: null, subscriptionRequestedAt: null, excluded: false, ...overrides });
const rules = (enabled: string[]) => resolveRules(AUTOMATION_RULES.filter((rule) => enabled.includes(rule.key)).map((rule) => ({ key: rule.key, enabled: true, offsetDays: rule.defaultOffsetDays })));
const plan = (demoProspects: DemoProspectCandidate[], enabled = ["prospect.demo_thanks"]) => planAutomations({ rules: rules(enabled), subscriptions: [], cancellations: [], prospects: [], demoProspects, alreadyDone: new Set(), now: NOW });

describe("les relances des prospects démo", () => {
  it("cinq messages, chacun avec son modèle, de J+1 à J+30 après la démonstration", () => {
    expect(PROSPECT_NURTURE_STEPS.map((step) => step.offset)).toEqual([1, 4, 8, 15, 30]);
    for (const step of PROSPECT_NURTURE_STEPS) {
      const template = emailTemplate(step.template);
      expect(template?.audience).toBe("Prospect");
      // Chacun dit comment ne plus rien recevoir, et mène à l'abonnement.
      expect(template?.defaults.body).toContain("{{lien_desinscription}}");
      expect(template?.button?.urlVariable).toBe("lien_abonnement");
    }
    expect(new Set(PROSPECT_NURTURE_STEPS.map((step) => emailTemplate(step.template)?.defaults.subject)).size).toBe(5);
  });

  it("le lendemain de la démonstration, le premier message part au prospect", () => {
    const due = plan([demoProspect()]);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ ruleKey: "prospect.demo_thanks", targetType: "Prospect", targetId: "pr_1", templateKey: "prospect.demo_thanks" });
  });

  it("jamais vers une pharmacie déjà inscrite ou abonnée, ni un dossier perdu, bloqué, contrat envoyé ou abonnement demandé", () => {
    expect(plan([demoProspect({ excluded: true })])).toHaveLength(0);
    for (const status of ["CONTRACT_SENT", "CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED", "LOST"]) expect(plan([demoProspect({ status })])).toHaveLength(0);
    expect(plan([demoProspect({ blockedAt: new Date() })])).toHaveLength(0);
    expect(plan([demoProspect({ subscriptionRequestedAt: new Date() })])).toHaveLength(0);
  });

  it("jamais avant la démonstration ; une démonstration ancienne n'est pas rattrapée d'un coup", () => {
    expect(plan([demoProspect({ demoAt: new Date("2026-10-25T09:00:00Z") })])).toHaveLength(0);
    expect(plan([demoProspect({ demoAt: new Date("2026-09-01T09:00:00Z") })], PROSPECT_NURTURE_STEPS.map((step) => step.key))).toHaveLength(0);
  });

  it("une règle désactivée n'envoie rien", () => {
    expect(plan([demoProspect()], [])).toHaveLength(0);
  });
});
