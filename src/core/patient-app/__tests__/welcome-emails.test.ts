import { describe, expect, it } from "vitest";
import { buildAppEmail, dueNurture } from "../welcome-emails";

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-11-20T09:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);

describe("relances de l'appli", () => {
  it("attend le mail de bienvenue, puis suit le calendrier", () => {
    expect(dueNurture({ welcomeSentAt: null, nurtureStep: 0, nurtureLastAt: null, nurtureOffAt: null }, at(10))).toBeNull();
    const base = { welcomeSentAt: t0, nurtureLastAt: null, nurtureOffAt: null };
    expect(dueNurture({ ...base, nurtureStep: 0 }, at(2))).toBeNull();
    expect(dueNurture({ ...base, nurtureStep: 0 }, at(3))).toEqual({ kind: "scan", step: 1 });
    expect(dueNurture({ ...base, nurtureStep: 1 }, at(10))).toEqual({ kind: "blood", step: 2 });
    expect(dueNurture({ ...base, nurtureStep: 3 }, at(35))).toEqual({ kind: "cabinet", step: 4 });
  });

  it("ensuite tous les 45 jours, à tour de rôle, et jamais après la désinscription", () => {
    const base = { welcomeSentAt: t0, nurtureOffAt: null };
    expect(dueNurture({ ...base, nurtureStep: 4, nurtureLastAt: at(35) }, at(60))).toBeNull();
    expect(dueNurture({ ...base, nurtureStep: 4, nurtureLastAt: at(35) }, at(80))).toEqual({ kind: "scan", step: 5 });
    expect(dueNurture({ ...base, nurtureStep: 5, nurtureLastAt: at(80) }, at(125))).toEqual({ kind: "blood", step: 6 });
    expect(dueNurture({ ...base, nurtureStep: 0, nurtureLastAt: null, nurtureOffAt: at(1) }, at(30))).toBeNull();
  });

  it("chaque e-mail porte le lien de désinscription et le bouton vers l'appli", () => {
    for (const kind of ["welcome", "scan", "blood", "pharmacy", "cabinet"] as const) {
      const mail = buildAppEmail(kind, { pharmacyName: kind === "pharmacy" ? null : "Pharmacie des Lilas", appUrl: (p) => `https://pharmaboost.app${p}`, appStoreUrl: "https://apps.apple.com/app/id1", unsubscribeUrl: "https://x/stop" });
      expect(mail.text).toContain("https://x/stop");
      expect(mail.html).toContain("https://x/stop");
      expect(mail.text).toContain("https://pharmaboost.app/app");
    }
  });
});
