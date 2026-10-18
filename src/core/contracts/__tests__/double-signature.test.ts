import { describe, expect, it } from "vitest";
import { awaitsCountersignature, DEFAULT_COUNTERSIGNER_EMAIL, doubleSignatureLabel, nextSignatureState, resolveCountersigner, signerLines, type SignatureProgressState } from "../countersignature";
import { resolveContractAmounts } from "../amounts";
import { buildContractDocument } from "../template";
import { buildAffiliateContractDocument, currentAffiliateTerms, affiliateContractReference } from "../affiliate-template";
import { renderContractPdf } from "../pdf";
import { OFFICIAL_OFFER } from "@/core/pricing/official-offer";
import { AFFILIATE_SIGNUP_BONUS_CENTS, AFFILIATE_TIERS } from "@/core/affiliation/terms";
import { DIRECTOR_SIGNUP_BONUS_CENTS } from "@/core/affiliation/director-terms";
import { mapDocusealEvent, mapDocusealSubmission } from "@/core/signature/docuseal";

const T1 = new Date("2026-10-18T09:00:00Z");
const T2 = new Date("2026-10-18T10:00:00Z");
const T3 = new Date("2026-10-18T11:00:00Z");
const sent: SignatureProgressState = { status: "SENT", firstPartySignedAt: null, companySignedAt: null };

/** Applique une suite d'événements comme le ferait le webhook (un événement sans effet laisse l'état tel quel). */
function play(start: SignatureProgressState, events: Parameters<typeof nextSignatureState>[1][]): { state: SignatureProgressState; applied: number } {
  let state = start;
  let applied = 0;
  for (const event of events) {
    const next = nextSignatureState(state, event);
    if (next) {
      state = next;
      applied += 1;
    }
  }
  return { state, applied };
}

describe("double signature : ordre des signatures", () => {
  it("le titulaire signe, puis PharmaBoost contresigne : signé seulement après les deux", () => {
    const afterPharmacy = nextSignatureState(sent, { status: "SIGNED_PHARMACY", role: "PHARMACY", occurredAt: T1 });
    expect(afterPharmacy).toEqual({ status: "SIGNED_PHARMACY", firstPartySignedAt: T1, companySignedAt: null });
    expect(awaitsCountersignature(afterPharmacy!)).toBe(true);
    expect(doubleSignatureLabel(afterPharmacy!.status, "PHARMACY")).toBe("En attente de PharmaBoost");

    const afterCompany = nextSignatureState(afterPharmacy!, { status: "SIGNED_COMPANY", role: "COMPANY", occurredAt: T2 });
    expect(afterCompany).toEqual({ status: "FINALIZED", firstPartySignedAt: T1, companySignedAt: T2 });
    expect(doubleSignatureLabel("FINALIZED", "PHARMACY")).toBe("Signé par les deux");
  });

  it("une signature de PharmaBoost seule ne rend jamais le contrat signé", () => {
    const companyOnly = nextSignatureState(sent, { status: "SIGNED_COMPANY", role: "COMPANY", occurredAt: T1 });
    expect(companyOnly?.status).toBe("SIGNED_COMPANY");
    expect(companyOnly?.status).not.toBe("FINALIZED");
    expect(awaitsCountersignature(companyOnly!)).toBe(false);
    expect(doubleSignatureLabel("SIGNED_COMPANY", "PHARMACY")).toBe("En attente du titulaire");
    // Le titulaire signe ensuite : alors seulement, signé par les deux.
    expect(nextSignatureState(companyOnly!, { status: "SIGNED_PHARMACY", role: "PHARMACY", occurredAt: T2 })?.status).toBe("FINALIZED");
  });

  it("« FINALIZED » annoncé par le prestataire (toutes signatures recueillies) pose les deux dates", () => {
    const afterPharmacy = nextSignatureState(sent, { status: "SIGNED_PHARMACY", occurredAt: T1 })!;
    expect(nextSignatureState(afterPharmacy, { status: "FINALIZED", occurredAt: T3 })).toEqual({ status: "FINALIZED", firstPartySignedAt: T1, companySignedAt: T3 });
  });

  it("le contrat d'affiliation suit la même règle : l'affilié, puis PharmaBoost", () => {
    const { state } = play(sent, [
      { status: "OPENED", occurredAt: T1 },
      { status: "SIGNED_PHARMACY", role: "AFFILIATE", occurredAt: T2 },
    ]);
    expect(state.status).toBe("SIGNED_PHARMACY");
    expect(doubleSignatureLabel(state.status, "AFFILIATE")).toBe("En attente de PharmaBoost");
    expect(doubleSignatureLabel("SENT", "AFFILIATE")).toBe("En attente de l'affilié");
    expect(nextSignatureState(state, { status: "SIGNED_COMPANY", role: "COMPANY", occurredAt: T3 })?.status).toBe("FINALIZED");
  });
});

describe("double signature : webhooks rejoués et en désordre", () => {
  it("rejouer chaque événement deux fois ne change rien de plus", () => {
    const events = [
      { status: "OPENED" as const, occurredAt: T1 },
      { status: "SIGNED_PHARMACY" as const, role: "PHARMACY" as const, occurredAt: T1 },
      { status: "SIGNED_COMPANY" as const, role: "COMPANY" as const, occurredAt: T2 },
      { status: "FINALIZED" as const, occurredAt: T2 },
    ];
    const once = play(sent, events);
    const twice = play(sent, events.flatMap((e) => [e, { ...e, occurredAt: T3 }]));
    expect(twice.state).toEqual(once.state);
    expect(twice.applied).toBe(once.applied);
    expect(once.state).toEqual({ status: "FINALIZED", firstPartySignedAt: T1, companySignedAt: T2 });
  });

  it("la date d'une signature est la première reçue, jamais celle d'un doublon", () => {
    const signed = nextSignatureState(sent, { status: "SIGNED_PHARMACY", occurredAt: T1 })!;
    expect(nextSignatureState(signed, { status: "SIGNED_PHARMACY", occurredAt: T3 })).toBeNull();
  });

  it("un « consulté » en retard ne fait pas reculer un contrat signé par le titulaire", () => {
    const signed = nextSignatureState(sent, { status: "SIGNED_PHARMACY", occurredAt: T1 })!;
    expect(nextSignatureState(signed, { status: "OPENED", occurredAt: T2 })).toBeNull();
    expect(nextSignatureState(signed, { status: "SENT", occurredAt: T2 })).toBeNull();
  });

  it("refusé et expiré closent le contrat tant qu'il n'est pas signé des deux côtés ; le premier fait l'emporte", () => {
    const signed = nextSignatureState(sent, { status: "SIGNED_PHARMACY", occurredAt: T1 })!;
    const refused = nextSignatureState(signed, { status: "REFUSED", occurredAt: T2 });
    expect(refused?.status).toBe("REFUSED");
    expect(nextSignatureState(refused!, { status: "EXPIRED", occurredAt: T3 })).toBeNull();
    expect(nextSignatureState(refused!, { status: "SIGNED_COMPANY", role: "COMPANY", occurredAt: T3 })).toBeNull();
    expect(nextSignatureState(sent, { status: "EXPIRED", occurredAt: T1 })?.status).toBe("EXPIRED");
    const finalized = { status: "FINALIZED", firstPartySignedAt: T1, companySignedAt: T2 };
    expect(nextSignatureState(finalized, { status: "REFUSED", occurredAt: T3 })).toBeNull();
    expect(nextSignatureState(finalized, { status: "EXPIRED", occurredAt: T3 })).toBeNull();
  });
});

describe("double signature : ce que la console affiche", () => {
  it("chaque signataire, son état et sa date ; le tour de PharmaBoost vient après le titulaire", () => {
    const pharmacy = { role: "PHARMACY" as const, name: "Claire Dumont", email: "claire@officine.fr" };
    const company = { name: "PharmaBoost", email: "contact@pharmaboost.app" };
    const [p1, c1] = signerLines({ status: "SENT", firstPartySignedAt: null, companySignedAt: null }, pharmacy, company);
    expect([p1.state, c1.state]).toEqual(["WAITING", "NOT_YET"]);
    const [p2, c2] = signerLines({ status: "SIGNED_PHARMACY", firstPartySignedAt: T1, companySignedAt: null }, pharmacy, company);
    expect([p2.state, p2.signedAt, c2.state]).toEqual(["SIGNED", T1, "WAITING"]);
    const [p3, c3] = signerLines({ status: "FINALIZED", firstPartySignedAt: T1, companySignedAt: T2 }, pharmacy, company);
    expect([p3.state, c3.state, c3.signedAt]).toEqual(["SIGNED", "SIGNED", T2]);
    const [p4, c4] = signerLines({ status: "REFUSED", firstPartySignedAt: null, companySignedAt: null }, { ...pharmacy, role: "AFFILIATE" }, company);
    expect([p4.label, p4.state, c4.state]).toEqual(["Affilié", "CLOSED", "CLOSED"]);
  });
});

describe("signataire PharmaBoost", () => {
  it("console, sinon variable d'environnement, sinon contact@pharmaboost.app ; aucune adresse personnelle en dur", () => {
    expect(DEFAULT_COUNTERSIGNER_EMAIL).toBe("contact@pharmaboost.app");
    expect(resolveCountersigner(null, null, "Adam Bavard")).toEqual({ name: "Adam Bavard", email: "contact@pharmaboost.app", source: "DEFAULT" });
    expect(resolveCountersigner(null, "Fondateur@Exemple.fr", null)).toEqual({ name: "PharmaBoost", email: "fondateur@exemple.fr", source: "ENV" });
    expect(resolveCountersigner({ email: "signature@exemple.fr", name: "A. B." }, "env@exemple.fr", "Adam Bavard")).toEqual({ name: "A. B.", email: "signature@exemple.fr", source: "CONSOLE" });
    // Un réglage illisible ne casse rien : on retombe sur la variable, puis sur la valeur par défaut.
    expect(resolveCountersigner({ email: "pas-une-adresse" }, null, null).source).toBe("DEFAULT");
  });
});

describe("contrat d'abonnement : montants lus depuis la source", () => {
  const company = { legalName: "PharmaBoost", legalForm: "SAS", address: "10 rue de la Santé, 75013 Paris", siren: "123456789", representativeName: "Représentant", representativeTitle: "Président", representativeEmail: "contact@pharmaboost.app" };
  const pharmacy = { name: "Pharmacie du Port", ownerName: "Marc Delaunay", address: "1 quai, 13002 Marseille", email: "marc@port.fr" };
  const text = (amounts: ReturnType<typeof resolveContractAmounts>) =>
    buildContractDocument({ reference: "PB-T", company, pharmacy, terms: { ...amounts, outletCount: 1, startDate: T1 } })
      .sections.flatMap((s) => s.paragraphs)
      .join("\n");

  it("sans offre de la console : l'offre officielle (126 € HT par mois, mise en service 150 € HT, engagement 12 mois)", () => {
    const amounts = resolveContractAmounts(null);
    expect(amounts).toEqual({ monthlyPriceCents: OFFICIAL_OFFER.monthlyPriceCents, setupFeeCents: OFFICIAL_OFFER.setupFeeCents, durationMonths: OFFICIAL_OFFER.commitmentMonths, source: "OFFICIAL" });
    const printed = text(amounts);
    expect(printed).toContain("126,00 € HT par mois");
    expect(printed).toContain("mise en service unique de 150,00 € HT");
    expect(printed).toContain("durée d'engagement ferme de 12 mois");
    expect(printed).not.toContain("290");
  });

  it("avec une offre de la console : ses montants, jamais ceux du code", () => {
    const printed = text(resolveContractAmounts({ monthlyPriceCents: 9900, setupFeeCents: 5000 }));
    expect(printed).toContain("99,00 € HT par mois");
    expect(printed).toContain("mise en service unique de 50,00 € HT");
    expect(printed).not.toContain("126,00");
  });

  it("offre sans mise en service renseignée : la mise en service officielle ; tarif ajusté au dossier prioritaire", () => {
    expect(resolveContractAmounts({ monthlyPriceCents: 9900, setupFeeCents: null }).setupFeeCents).toBe(OFFICIAL_OFFER.setupFeeCents);
    expect(resolveContractAmounts({ monthlyPriceCents: 9900, setupFeeCents: 0 }, { monthlyPriceCents: 11000, durationMonths: 24 })).toMatchObject({ monthlyPriceCents: 11000, setupFeeCents: 0, durationMonths: 24 });
  });

  it("l'ordre des signatures est écrit au contrat et dans les cases", () => {
    const doc = buildContractDocument({ reference: "PB-T", company, pharmacy, terms: { ...resolveContractAmounts(null), outletCount: 1, startDate: T1 }, countersigner: { name: "PharmaBoost", email: "signature@exemple.fr" } });
    expect(doc.signatures.map((s) => s.role)).toEqual(["PHARMACY", "COMPANY"]);
    expect(doc.signatures[1].email).toBe("signature@exemple.fr");
    expect(doc.sections.flatMap((s) => s.paragraphs).join(" ")).toContain("d'abord par l'Officine, puis contresigné par la Société");
  });
});

describe("contrat d'affiliation", () => {
  const company = { legalName: "PharmaBoost", legalForm: "SAS", address: "10 rue de la Santé, 75013 Paris", siren: "123456789", representativeName: "Représentant", representativeEmail: "contact@pharmaboost.app" };
  const doc = buildAffiliateContractDocument({
    reference: affiliateContractReference("Lefèvre", 1, 2026),
    company,
    affiliate: { firstName: "Julie", lastName: "Lefèvre", email: "julie@exemple.fr", phone: "06 00 00 00 00", zone: "Var" },
    terms: currentAffiliateTerms(OFFICIAL_OFFER.monthlyPriceCents, T1),
    countersigner: { name: "PharmaBoost", email: "contact@pharmaboost.app" },
  });
  const printed = doc.sections.flatMap((s) => s.paragraphs).join("\n");

  it("les paliers, le taux appliqué à toutes les pharmacies, le mois abonné à la fin du mois, la prime de 100 € HT, à vie", () => {
    expect(doc.reference).toBe("PB-AFF-2026-LEFEVRE-V1");
    expect(printed).toContain("10 % de 1 à 9 pharmacies abonnées ; 12 % de 10 à 24 pharmacies abonnées ; 15 % de 25 à 49 pharmacies abonnées ; 20 % à partir de 50 pharmacies abonnées");
    expect(printed).toContain("s'applique à toutes les pharmacies apportées");
    expect(printed).toContain("abonnée au dernier jour du mois");
    expect(printed).toContain("prime unique de 100,00 € HT par pharmacie apportée");
    expect(printed).toContain("mise en service de cette pharmacie a été effectivement réglée");
    expect(printed).toContain("due à vie, pour chaque mois où la pharmacie apportée reste abonnée");
    expect(printed).toContain("12,60 € HT par pharmacie au premier palier (10 %)");
    expect(printed).toContain("25,20 € HT par pharmacie au dernier palier (20 %)");
  });

  it("les montants viennent de la source unique de l'affiliation", () => {
    const terms = currentAffiliateTerms(12600, T1);
    expect(terms.tiers).toEqual(AFFILIATE_TIERS.map((t) => ({ ...t })));
    expect(terms.signupBonusCents).toBe(AFFILIATE_SIGNUP_BONUS_CENTS);
  });

  it("jamais la prime du directeur commercial", () => {
    expect(printed.toLowerCase()).not.toContain("directeur");
    expect(printed).not.toContain(`${(DIRECTOR_SIGNUP_BONUS_CENTS / 100).toFixed(2).replace(".", ",")} €`);
  });

  it("signé par l'affilié, puis contresigné par PharmaBoost ; le PDF se rend", async () => {
    expect(doc.signatures.map((s) => s.role)).toEqual(["AFFILIATE", "COMPANY"]);
    expect(printed).toContain("d'abord par l'Affilié, puis contresigné par la Société");
    const bytes = await renderContractPdf(doc);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("DocuSeal : le rôle de l'affilié", () => {
  it("l'affilié signé = en attente de PharmaBoost ; sa signature d'un formulaire aussi", () => {
    expect(mapDocusealSubmission("pending", [{ role: "Affilié", status: "completed" }, { role: "PharmaBoost", status: "sent" }])).toBe("SIGNED_PHARMACY");
    expect(mapDocusealEvent("form.completed", { role: "AFFILIATE", submissionStatus: "pending" })).toBe("SIGNED_PHARMACY");
    expect(mapDocusealEvent("form.completed", { role: "COMPANY", submissionStatus: "pending" })).toBe("SIGNED_COMPANY");
  });
});
