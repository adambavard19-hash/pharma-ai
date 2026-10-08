import { describe, expect, it } from "vitest";
import { buildCounterStatus, counterFigures, describeSaleStage, describeWhen, postDisplayName, summarizeProducts } from "../dashboard";
import type { OverviewPost } from "@/core/stock/connection-overview";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

function post(overrides: Partial<OverviewPost> = {}): OverviewPost {
  return { id: "p1", label: "Poste comptoir 1", hostname: "COMPTOIR-1", pairedAt: ago(86_400), lastSeenAt: ago(30), lastScanAt: null, scanCount: 0, version: "0.4.2", pairingExpiresAt: null, ...overrides };
}

describe("l'état du comptoir ne dit « connecté » que ce qui est prouvé", () => {
  it("un poste appairé qui répond : prêt, connecté", () => {
    const status = buildCounterStatus({ now: NOW, posts: [post()] });
    expect(status.state).toBe("READY");
    expect(status.pill).toEqual({ label: "Connecté", tone: "success" });
    expect(status.title).toBe("Votre comptoir est prêt.");
    expect(status.posts).toEqual([{ id: "p1", label: "Poste comptoir 1", online: true }]);
  });

  it("dit « Poste comptoir N » d'un comptoir numéroté, et garde tel quel un nom choisi par le titulaire", () => {
    expect(postDisplayName("Comptoir 5")).toBe("Poste comptoir 5");
    expect(postDisplayName("comptoir 2")).toBe("Poste comptoir 2");
    expect(postDisplayName("Comptoir")).toBe("Poste comptoir");
    expect(postDisplayName("Poste comptoir 1")).toBe("Poste comptoir 1");
    expect(postDisplayName("Caisse arrière")).toBe("Caisse arrière");
    expect(postDisplayName("Comptoirs du fond")).toBe("Comptoirs du fond");
    expect(postDisplayName("  COMPTOIR-1  ")).toBe("COMPTOIR-1");
  });

  it("un poste qui répond mais n'a jamais bipé : prêt, et le suivi n'est pas encore prouvé", () => {
    expect(buildCounterStatus({ now: NOW, posts: [post({ scanCount: 0 })] }).awaitingFirstScan).toBe(true);
    expect(buildCounterStatus({ now: NOW, posts: [post({ scanCount: 12, lastScanAt: ago(300) })] }).awaitingFirstScan).toBe(false);
  });

  it("un poste sans signe de vie depuis plus de dix minutes : hors ligne, jamais « connecté »", () => {
    const status = buildCounterStatus({ now: NOW, posts: [post({ lastSeenAt: ago(11 * 60) })] });
    expect(status.state).toBe("OFFLINE");
    expect(status.pill).toEqual({ label: "Hors ligne", tone: "warning" });
    expect(status.title).toBe("Votre comptoir ne répond plus.");
    expect(status.subtitle).toMatch(/plus suivies/);
    expect(status.posts[0].online).toBe(false);
    // Pile à dix minutes, il répond encore.
    expect(buildCounterStatus({ now: NOW, posts: [post({ lastSeenAt: ago(10 * 60) })] }).state).toBe("READY");
  });

  it("un poste jamais appairé n'est pas connecté, même s'il a donné signe de vie", () => {
    const status = buildCounterStatus({ now: NOW, posts: [post({ pairedAt: null, lastSeenAt: ago(5), pairingExpiresAt: ago(-3600) })] });
    expect(status.state).toBe("NOT_CONNECTED");
    expect(status.pill.label).toBe("Non connecté");
    expect(status.waitingInstall).toBe(1);
    expect(status.subtitle).toMatch(/installation reste à terminer/);
    expect(status.posts).toEqual([]);
  });

  it("aucun poste : non connecté, avec le chemin pour y remédier", () => {
    const status = buildCounterStatus({ now: NOW, posts: [] });
    expect(status.state).toBe("NOT_CONNECTED");
    expect(status.waitingInstall).toBe(0);
    expect(status.subtitle).toMatch(/poste de caisse/);
  });

  it("deux postes dont un seul répond : prêt, chacun avec son état", () => {
    const status = buildCounterStatus({ now: NOW, posts: [post(), post({ id: "p2", label: "Poste comptoir 2", lastSeenAt: ago(3 * 3600) })] });
    expect(status.state).toBe("READY");
    expect(status.posts.map((p) => p.online)).toEqual([true, false]);
  });
});

describe("les chiffres du jour", () => {
  const money = (cents: number) => `${(cents / 100).toFixed(2)} €`;

  it("« — » tant qu'il n'y a rien à compter, jamais un zéro trompeur", () => {
    expect(counterFigures({ detected: 0, accepted: 0, declined: 0, salesCount: 0, attributedCents: 0 }, money)).toEqual({ detected: "—", accepted: "—", additional: "—" });
  });

  it("les conseils acceptés se disent sur les conseils décidés", () => {
    expect(counterFigures({ detected: 4, accepted: 3, declined: 2, salesCount: 2, attributedCents: 1790 }, money)).toEqual({ detected: "4", accepted: "3 / 5", additional: "17.90 €" });
    expect(counterFigures({ detected: 1, accepted: 0, declined: 2, salesCount: 0, attributedCents: 0 }, money).accepted).toBe("0 / 2");
  });

  it("une vente sans vente additionnelle affiche 0, pas un tiret : il y a eu des ventes", () => {
    expect(counterFigures({ detected: 1, accepted: 0, declined: 0, salesCount: 3, attributedCents: 0 }, money).additional).toBe("0.00 €");
  });
});

describe("l'activité récente", () => {
  it("dit où en est chaque vente", () => {
    expect(describeSaleStage("NEEDS_VERIFICATION", 0).label).toBe("à confirmer");
    expect(describeSaleStage("ANALYZING", 0).label).toBe("analyse en cours");
    expect(describeSaleStage("ANALYZED", 1).label).toBe("1 conseil à décider");
    expect(describeSaleStage("ANALYZED", 3).label).toBe("3 conseils à décider");
    expect(describeSaleStage("ANALYZED", 0).label).toBe("aucun conseil à proposer");
    expect(describeSaleStage("VALIDATED", 2).label).toBe("plan à remettre");
    expect(describeSaleStage("DELIVERED", 0)).toEqual({ label: "terminée", tone: "success" });
    expect(describeSaleStage("CANCELLED", 0).label).toBe("clôturée");
    expect(describeSaleStage("QUELQUE_CHOSE", 0).label).toBe("en cours");
  });

  it("résume les produits : deux au plus, puis « +N »", () => {
    expect(summarizeProducts(["DOLIPRANE 1 g", "AUGMENTIN"])).toBe("DOLIPRANE 1 g · AUGMENTIN");
    expect(summarizeProducts(["A", "B", "C", "D"], 4)).toBe("A · B +2");
    expect(summarizeProducts(["A", "B"], 5)).toBe("A · B +3");
    expect(summarizeProducts(["", "  "], 2)).toBe("2 produits");
    expect(summarizeProducts([], 0)).toBe("Aucun produit");
  });

  it("dit l'heure à Paris : aujourd'hui, hier, ou la date", () => {
    // 12:00 UTC = 14:00 à Paris (heure d'été).
    expect(describeWhen(new Date("2026-10-08T10:32:00.000Z"), NOW)).toBe("12:32");
    expect(describeWhen(new Date("2026-10-07T16:05:00.000Z"), NOW)).toBe("hier 18:05");
    expect(describeWhen(new Date("2026-10-02T07:10:00.000Z"), NOW)).toBe("02/10 09:10");
    // Minuit à Paris n'est pas minuit UTC : 22:30 UTC la veille est déjà le lendemain à Paris.
    expect(describeWhen(new Date("2026-10-07T22:30:00.000Z"), NOW)).toBe("00:30");
  });
});
