import { describe, expect, it } from "vitest";
import {
  actionLabel,
  actionsMatching,
  contextEntries,
  diffEntries,
  entityHref,
  formatJournalValue,
  groupByDay,
  isBusinessAction,
  JOURNAL_FAMILIES,
  journalFamily,
  journalWhere,
  parsePage,
} from "../journal";

describe("journal d'audit : familles autorisées et refusées", () => {
  it("laisse passer les familles business", () => {
    for (const action of ["platform.admin_deleted", "billing.plan_saved", "billing.contract_price_changed", "sales.prospect_status_changed", "sales_application.status_changed", "partner.saved", "training.saved", "challenge.saved"]) {
      expect(isBusinessAction(action), action).toBe(true);
    }
  });

  it("refuse les familles cliniques, même portées par un administrateur", () => {
    for (const action of ["patient.created", "patient.health_viewed", "patient_data.purged", "prescription.validated", "prescription.counter_scan", "recommendation.accepted", "document.generated", "document.viewed", "reminder.sent", "counter.request_advised", "vigilance.product_saved"]) {
      expect(isBusinessAction(action, { platformAdminId: "adm_1" }), action).toBe(false);
    }
  });

  it("refuse tout ce qui n'est pas dans la liste blanche", () => {
    for (const action of ["product.created", "stock.adjusted", "drug_stock.imported", "team.member_created", "pharmacy.updated", "settings.updated", "inconnu.action"]) {
      expect(isBusinessAction(action, { platformAdminId: "adm_1" }), action).toBe(false);
    }
  });

  it("les connexions ne figurent que si un administrateur en est l'auteur", () => {
    expect(isBusinessAction("auth.login", { platformAdminId: "adm_1" })).toBe(true);
    expect(isBusinessAction("auth.login")).toBe(false);
    expect(isBusinessAction("auth.login", { platformAdminId: null })).toBe(false);
  });

  it("écarte le suivi individuel des formations (la console ne voit que des agrégats)", () => {
    expect(isBusinessAction("training.progress_updated", { platformAdminId: "adm_1" })).toBe(false);
  });

  it("refuse les codes vides ou malformés", () => {
    expect(isBusinessAction("")).toBe(false);
    expect(isBusinessAction("billing")).toBe(false);
    expect(isBusinessAction("billing.")).toBe(false);
  });

  it("la famille de l'adresse se lit par sa clé française ou son préfixe", () => {
    expect(journalFamily("facturation")?.prefix).toBe("billing");
    expect(journalFamily("billing")?.key).toBe("facturation");
    expect(journalFamily("patient")).toBeNull();
    expect(journalFamily(null)).toBeNull();
  });
});

describe("journal d'audit : la liste blanche est dans la requête", () => {
  const prefixesOf = (where: ReturnType<typeof journalWhere>) => {
    const or = (where.AND[0] as { OR: { action: { startsWith: string }; platformAdminId?: unknown }[] }).OR;
    return or.map((clause) => ({ prefix: clause.action.startsWith, admin: clause.platformAdminId }));
  };

  it("sans filtre : uniquement les préfixes business, connexions restreintes aux administrateurs", () => {
    const clauses = prefixesOf(journalWhere({ family: null }));
    expect(clauses.map((c) => c.prefix).sort()).toEqual(["auth.", "billing.", "challenge.", "partner.", "platform.", "sales.", "sales_application.", "training."]);
    expect(clauses.find((c) => c.prefix === "auth.")?.admin).toEqual({ not: null });
    expect(clauses.some((c) => /patient|prescription|recommendation|document|reminder/.test(c.prefix))).toBe(false);
    expect(journalWhere({ family: null }).AND[1]).toEqual({ action: { notIn: ["training.progress_updated"] } });
  });

  it("avec une famille : son seul préfixe", () => {
    const clauses = prefixesOf(journalWhere({ family: journalFamily("commercial") }));
    expect(clauses).toEqual([{ prefix: "sales.", admin: undefined }]);
  });

  it("période, auteur et recherche s'ajoutent sans retirer la liste blanche", () => {
    const since = new Date("2026-09-01T00:00:00Z");
    const where = journalWhere({ family: null, adminId: "adm_1", since, q: "tarif" });
    expect(where.AND).toContainEqual({ createdAt: { gte: since } });
    expect(where.AND).toContainEqual({ platformAdminId: "adm_1" });
    const search = where.AND.find((c) => "OR" in c && JSON.stringify(c).includes("entityId")) as { OR: Record<string, unknown>[] };
    expect(search.OR).toContainEqual({ entityId: "tarif" });
    expect(search.OR).toContainEqual({ action: { in: expect.arrayContaining(["billing.contract_price_changed"]) } });
    expect(prefixesOf(where)).toHaveLength(JOURNAL_FAMILIES.length);
  });

  it("une recherche par libellé ne ramène jamais une action clinique", () => {
    expect(actionsMatching("créé").every((code) => isBusinessAction(code, { platformAdminId: "x" }))).toBe(true);
    expect(actionsMatching("ab")).toEqual([]);
  });
});

describe("journal d'audit : libellés et liens", () => {
  it("action connue en clair, inconnue gardée telle quelle", () => {
    expect(actionLabel("billing.contract_price_changed")).toBe("Tarif contractuel modifié");
    expect(actionLabel("platform.admin_deleted")).toBe("Administrateur supprimé");
    expect(actionLabel("billing.nouvelle_action")).toBe("billing.nouvelle_action");
  });

  it("lien vers l'officine, le dossier, l'abonnement par sa fiche", () => {
    expect(entityHref({ entityType: "Pharmacy", entityId: "ph_1" })).toBe("/admin/pharmacies/ph_1");
    expect(entityHref({ entityType: "Prospect", entityId: "pr_1" })).toBe("/admin/dossiers/pr_1");
    expect(entityHref({ entityType: "Subscription", entityId: "sub_1", pharmacyId: "ph_1" })).toBe("/admin/pharmacies/ph_1?onglet=abonnement");
    expect(entityHref({ entityType: "Subscription", entityId: "sub_1" })).toBeNull();
    expect(entityHref({ entityType: "Patient", entityId: "pa_1", pharmacyId: "ph_1" })).toBeNull();
  });

  it("la cadence des relances de contrat s'ouvre dans le centre des relances, à sa section", () => {
    expect(entityHref({ entityType: "PlatformSetting", entityId: "contract.reminders" })).toBe("/admin/relances#contrat");
    expect(entityHref({ entityType: "PlatformSetting", entityId: "autre.reglage" })).toBe("/admin/parametres");
  });
});

describe("journal d'audit : l'avant / l'après lisible", () => {
  it("changes { champ: { from, to } } : montants en euros, booléens en clair", () => {
    const diff = diffEntries({ changes: { contractPriceCents: { from: 6900, to: 7900 }, isActive: { from: true, to: false } } }, "billing.contract_price_changed");
    expect(diff).toEqual([
      { field: "contractPriceCents", label: "Tarif contractuel", from: "69 €", to: "79 €" },
      { field: "isActive", label: "Actif", from: "Oui", to: "Non" },
    ]);
  });

  it("before / after : seuls les champs modifiés", () => {
    const diff = diffEntries({ before: { monthlyPriceCents: 12900, trialDays: 30, code: "PRO" }, after: { monthlyPriceCents: 9900, trialDays: 30, code: "PRO" } }, "billing.plan_saved");
    expect(diff).toEqual([{ field: "monthlyPriceCents", label: "Tarif mensuel", from: "129 €", to: "99 €" }]);
  });

  it("changement de tarif contractuel : `changes` fait foi, une seule ligne par champ (défaut corrigé)", () => {
    // La forme exacte consignée par changeContractPrice : un instantané avant / après ET le changement.
    const metadata = {
      before: { contractPriceCents: null, effectiveCents: 29000, source: "CATALOG_FALLBACK" },
      after: { contractPriceCents: 25000 },
      changes: { contractPriceCents: { from: 29000, to: 25000 } },
      reason: "Avenant signé",
      appliedToStripe: true,
      effectiveAt: "2026-11-04T00:00:00.000Z",
    };
    const diff = diffEntries(metadata, "billing.contract_price_changed");
    expect(diff).toEqual([{ field: "contractPriceCents", label: "Tarif contractuel", from: "290 €", to: "250 €" }]);
    // Les clés React de la page (une par champ) restent uniques.
    expect(new Set(diff.map((d) => d.field)).size).toBe(diff.length);
  });

  it("un champ présent dans `changes` et au premier niveau n'est rendu qu'une fois", () => {
    const diff = diffEntries({ changes: { status: { from: "RECEIVED", to: "CONFIRMED" } }, from: "RECEIVED", to: "CONFIRMED" }, "billing.cancellation_status_changed");
    expect(diff.map((d) => d.field)).toEqual(["status"]);
  });

  it("from / to de premier niveau : le statut nommé", () => {
    expect(diffEntries({ from: "CONTACTED", to: "DEMO_SCHEDULED" }, "sales.prospect_status_changed")).toEqual([{ field: "status", label: "Statut", from: "Contacté", to: "Démo programmée" }]);
    expect(diffEntries({ from: "RECEIVED", to: "CONFIRMED" }, "billing.cancellation_status_changed")[0]).toMatchObject({ from: "Demande reçue", to: "Confirmée" });
  });

  it("ignore l'identique, les clés sensibles et les métadonnées absentes", () => {
    expect(diffEntries({ changes: { status: { from: "ACTIVE", to: "ACTIVE" } } })).toEqual([]);
    expect(diffEntries({ changes: { passwordResetTokenHash: { from: "a", to: "b" } } })).toEqual([]);
    expect(diffEntries(null)).toEqual([]);
    expect(diffEntries("texte")).toEqual([]);
    expect(diffEntries([1, 2])).toEqual([]);
  });

  it("le contexte : valeurs simples en clair, sans clé réservée ni secret, liens masqués", () => {
    const context = contextEntries({ status: "SENT", recipient: "titulaire@exemple.fr", token: "abc", from: "X", to: "Y", url: "https://pharmaboost.app/admin-connexion/mot-de-passe/abc", nested: { a: 1 } }, "platform.email_sent");
    expect(context).toEqual([
      { field: "status", label: "Statut", value: "Envoyé" },
      { field: "recipient", label: "Destinataire", value: "titulaire@exemple.fr" },
      { field: "url", label: "url", value: "lien (masqué)" },
    ]);
  });

  it("valeurs : dates au format français, textes longs tronqués", () => {
    expect(formatJournalValue("occurredOn", "2026-10-01")).toBe("01/10/2026");
    expect(formatJournalValue("plannedEndAt", "2026-10-01T10:00:00.000Z")).toBe("01/10/2026 12:00");
    expect(formatJournalValue("body", "x".repeat(400)).length).toBeLessThanOrEqual(160);
    expect(formatJournalValue("fields", ["email", "phone"])).toBe("E-mail, phone");
    expect(formatJournalValue("reason", null)).toBe("—");
  });
});

describe("journal d'audit : regroupement et pagination", () => {
  it("regroupe par jour à l'heure de Paris", () => {
    const groups = groupByDay([{ at: new Date("2026-10-01T22:30:00Z") }, { at: new Date("2026-10-01T21:30:00Z") }, { at: new Date("2026-10-01T08:00:00Z") }]);
    expect(groups.map((g) => [g.day, g.rows.length])).toEqual([
      ["2026-10-02", 1],
      ["2026-10-01", 2],
    ]);
  });

  it("page : entier positif, sinon 1", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(null)).toBe(1);
  });
});
