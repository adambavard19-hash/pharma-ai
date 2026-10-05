import { describe, expect, it } from "vitest";
import {
  AUDIENCE_KEYS,
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_BUTTON_TARGETS,
  CAMPAIGN_KINDS,
  CAMPAIGN_KIND_KEYS,
  CAMPAIGN_MAX_RECIPIENTS,
  CAMPAIGN_VARIABLES,
  campaignParagraphs,
  campaignValues,
  campaignVariablesFor,
  describeSchedule,
  isCampaignConfirmation,
  renderCampaignEmail,
  sampleCampaignValues,
  validateCampaignDraft,
  validateScheduleDate,
  type CampaignDraftInput,
  type CampaignKindKey,
} from "../campaigns";
import { REFERRAL_DISCOUNT_CENTS } from "@/core/billing/referral";
import { DEFAULT_EMAIL_CONTEXT } from "@/core/platform/email-layout";

const NOW = new Date("2026-10-04T08:00:00Z");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/** Un brouillon valide pour ce type : les textes par défaut, plus ce que ces textes exigent. */
function draftFor(kind: CampaignKindKey, overrides: Record<string, unknown> = {}) {
  const definition = CAMPAIGN_KINDS[kind];
  return {
    kind,
    name: "Campagne d'automne",
    subject: definition.defaults.subject,
    title: definition.defaults.title,
    body: kind === "ANNOUNCEMENT" ? "Bonjour {{prenom}},\n\nUne information pour vous." : definition.defaults.body,
    buttonLabel: definition.defaults.buttonLabel,
    buttonTarget: definition.defaultButton,
    audience: definition.defaults.audience,
    audienceParams: {},
    alsoInApp: false,
    offerAmountCents: definition.needsAmount ? 2000 : null,
    offerEndsAt: definition.needsAmount ? "2026-10-31" : null,
    offerConditions: kind === "BONUS_OFFER" ? "Offre réservée aux officines abonnées." : null,
    ...overrides,
  };
}

const valid = (raw: unknown) => {
  const result = validateCampaignDraft(raw, NOW);
  if (!result.ok) throw new Error(`Brouillon refusé : ${result.error}`);
  return result;
};
const refused = (raw: unknown) => {
  const result = validateCampaignDraft(raw, NOW);
  if (result.ok) throw new Error("Brouillon accepté à tort.");
  return result.error;
};

describe("catalogue des campagnes", () => {
  it("quatre types, avec les bornes de montant annoncées (parrainage 1 à 500 €, bonus 1 à 2 000 €)", () => {
    expect(CAMPAIGN_KIND_KEYS).toEqual(["BONUS_OFFER", "REFERRAL_OFFER", "PARTNER_INVITATION", "ANNOUNCEMENT"]);
    expect(CAMPAIGN_KINDS.REFERRAL_OFFER.amountBoundsCents).toEqual({ min: 100, max: 50_000 });
    expect(CAMPAIGN_KINDS.BONUS_OFFER.amountBoundsCents).toEqual({ min: 100, max: 200_000 });
    expect(CAMPAIGN_KINDS.PARTNER_INVITATION.needsAmount).toBe(false);
    expect(CAMPAIGN_KINDS.ANNOUNCEMENT.side).toEqual(["PHARMACY", "PARTNER"]);
  });

  it("chaque public a un côté, et ceux qui se choisissent à la main sont marqués", () => {
    expect(AUDIENCE_KEYS).toHaveLength(9);
    expect(AUDIENCE_KEYS.filter((k) => CAMPAIGN_AUDIENCES[k].needsSelection)).toEqual(["pharmacies.selected", "partners.selected"]);
    expect(AUDIENCE_KEYS.filter((k) => k.startsWith("pharmacies.")).every((k) => CAMPAIGN_AUDIENCES[k].side === "PHARMACY")).toBe(true);
    expect(AUDIENCE_KEYS.filter((k) => k.startsWith("partners.")).every((k) => CAMPAIGN_AUDIENCES[k].side === "PARTNER")).toBe(true);
  });

  it("le public par défaut de chaque type est de son côté, et ses boutons aussi", () => {
    for (const kind of CAMPAIGN_KIND_KEYS) {
      const definition = CAMPAIGN_KINDS[kind];
      expect(definition.side).toContain(CAMPAIGN_AUDIENCES[definition.defaults.audience].side);
      if (definition.defaultButton) expect(CAMPAIGN_BUTTON_TARGETS[definition.defaultButton].side).toBe(CAMPAIGN_AUDIENCES[definition.defaults.audience].side);
    }
  });

  it("les textes par défaut sont valides dès que leurs données le sont, sans emoji", () => {
    for (const kind of CAMPAIGN_KIND_KEYS) {
      const result = valid(draftFor(kind));
      expect(result.value.kind).toBe(kind);
      const { subject, title, body } = CAMPAIGN_KINDS[kind].defaults;
      expect(EMOJI.test(`${subject}${title}${body}`)).toBe(false);
    }
  });

  it("les textes par défaut disent la vérité : bonus appliqué à la main, partenaire n'achète pas de recommandation", () => {
    expect(CAMPAIGN_KINDS.BONUS_OFFER.defaults.body).toContain("appliqué à la main par notre équipe");
    expect(CAMPAIGN_KINDS.BONUS_OFFER.description).toContain("appliqué à la main par l'équipe");
    const invitation = CAMPAIGN_KINDS.PARTNER_INVITATION.defaults.body;
    expect(invitation).toContain("formulaire de candidature");
    expect(invitation).toContain("un partenaire n'achète jamais une recommandation");
    expect(invitation).toContain("PharmaBoost ne vend aucune recommandation");
    // Le rappel de parrainage dit que les filleuls déjà inscrits gardent leur montant.
    expect(CAMPAIGN_KINDS.REFERRAL_OFFER.defaults.body).toContain("gardent le montant prévu à leur inscription");
  });

  it("l'exemple d'annonce n'est pas envoyable tel quel", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { body: CAMPAIGN_KINDS.ANNOUNCEMENT.defaults.body }))).toContain("texte d'exemple");
  });

  it("une variable d'offre n'existe que pour un type d'offre", () => {
    expect(campaignVariablesFor("BONUS_OFFER", "PHARMACY").map((v) => v.key)).toContain("montant_offre");
    expect(campaignVariablesFor("ANNOUNCEMENT", "PHARMACY").map((v) => v.key)).not.toContain("montant_offre");
    expect(campaignVariablesFor("PARTNER_INVITATION", "PARTNER").map((v) => v.key)).toEqual(CAMPAIGN_VARIABLES.PARTNER.map((v) => v.key));
  });

  it("un mot de confirmation retapé : sans égard à la casse, jamais approximatif", () => {
    expect(isCampaignConfirmation("ENVOYER")).toBe(true);
    expect(isCampaignConfirmation("  envoyer ")).toBe(true);
    expect(isCampaignConfirmation("envoie")).toBe(false);
    expect(isCampaignConfirmation("")).toBe(false);
  });
});

describe("validation : montants bornés", () => {
  it("parrainage : 1 € accepté, 0,99 € refusé, 500 € accepté, 500,01 € refusé", () => {
    expect(valid(draftFor("REFERRAL_OFFER", { offerAmountCents: 100 })).value.offerAmountCents).toBe(100);
    expect(refused(draftFor("REFERRAL_OFFER", { offerAmountCents: 99 }))).toContain("entre 1 € et 500 €");
    expect(valid(draftFor("REFERRAL_OFFER", { offerAmountCents: 50_000 })).value.offerAmountCents).toBe(50_000);
    expect(refused(draftFor("REFERRAL_OFFER", { offerAmountCents: 50_001 }))).toContain("entre 1 € et 500 €");
  });

  it("bonus : 1 € à 2 000 €", () => {
    expect(valid(draftFor("BONUS_OFFER", { offerAmountCents: 200_000 })).value.offerAmountCents).toBe(200_000);
    expect(refused(draftFor("BONUS_OFFER", { offerAmountCents: 200_001 }))).toContain("entre 1 € et 2 000 €");
    expect(refused(draftFor("BONUS_OFFER", { offerAmountCents: 0 }))).toContain("entre 1 € et 2 000 €");
    expect(refused(draftFor("BONUS_OFFER", { offerAmountCents: -500 }))).toContain("entre 1 € et 2 000 €");
  });

  it("un montant qui n'est pas un entier de centimes est refusé, quelle que soit sa forme", () => {
    for (const offerAmountCents of [12.5, "2000", null, undefined, Number.NaN, Infinity]) {
      expect(refused(draftFor("REFERRAL_OFFER", { offerAmountCents }))).toContain("Le montant doit être compris");
    }
  });

  it("un type sans offre ignore tout champ d'offre : rien ne traverse", () => {
    const { value } = valid(draftFor("PARTNER_INVITATION", { offerAmountCents: 5000, offerEndsAt: "2026-12-31", offerConditions: "Conditions" }));
    expect(value.offerAmountCents).toBeNull();
    expect(value.offerEndsAt).toBeNull();
    expect(value.offerConditions).toBeNull();
  });
});

describe("validation : la date de fin de l'offre", () => {
  it("elle dure jusqu'à la fin du jour choisi, heure de Paris", () => {
    const { value } = valid(draftFor("REFERRAL_OFFER", { offerEndsAt: "2026-10-31" }));
    // 31 octobre 2026 23 h 59 min 59 s 999, heure d'été : 21 h 59 UTC.
    expect(value.offerEndsAt?.toISOString()).toBe("2026-10-31T22:59:59.999Z");
  });

  it("le changement d'heure ne décale pas la fin (jour du passage à l'heure d'hiver)", () => {
    const { value } = valid(draftFor("REFERRAL_OFFER", { offerEndsAt: "2026-10-25" }));
    // 25 octobre 2026 : retour à l'heure d'hiver à 3 h ; le jour finit à 23 h 59 Paris = 22 h 59 UTC.
    expect(value.offerEndsAt?.toISOString()).toBe("2026-10-25T22:59:59.999Z");
  });

  it("rejouer une valeur déjà normalisée la laisse inchangée", () => {
    const first = valid(draftFor("REFERRAL_OFFER", { offerEndsAt: "2026-10-31" })).value.offerEndsAt;
    const again = valid(draftFor("REFERRAL_OFFER", { offerEndsAt: first })).value.offerEndsAt;
    expect(again?.toISOString()).toBe(first?.toISOString());
  });

  it("une date passée, ou aujourd'hui une fois le jour fini, est refusée ; le jour même reste permis", () => {
    expect(refused(draftFor("REFERRAL_OFFER", { offerEndsAt: "2026-10-03" }))).toContain("dans le futur");
    expect(valid(draftFor("REFERRAL_OFFER", { offerEndsAt: "2026-10-04" })).value.offerEndsAt).toBeInstanceOf(Date);
    const lateEvening = new Date("2026-10-04T21:59:59.998Z");
    const result = validateCampaignDraft(draftFor("REFERRAL_OFFER", { offerEndsAt: "2026-10-04" }), lateEvening);
    expect(result.ok).toBe(true);
    const afterMidnight = new Date("2026-10-04T22:00:00.000Z");
    expect(validateCampaignDraft(draftFor("REFERRAL_OFFER", { offerEndsAt: "2026-10-04" }), afterMidnight).ok).toBe(false);
  });

  it("une date illisible ou inexistante est refusée", () => {
    for (const offerEndsAt of ["2026-02-30", "demain", "31/10/2026", new Date("nope"), 12345]) {
      expect(refused(draftFor("REFERRAL_OFFER", { offerEndsAt }))).toContain("illisible");
    }
  });

  it("une offre de parrainage peut ne pas finir ; un bonus qui cite sa date de fin, non", () => {
    expect(valid(draftFor("REFERRAL_OFFER", { offerEndsAt: null })).value.offerEndsAt).toBeNull();
    expect(refused(draftFor("BONUS_OFFER", { offerEndsAt: null }))).toContain("{{date_fin_offre}}");
  });
});

describe("validation : variables", () => {
  it("une variable inconnue pour ce public est refusée, avec la liste de celles qui existent", () => {
    const error = refused(draftFor("ANNOUNCEMENT", { body: "Bonjour {{prenom}}, votre {{surnom}}." }));
    expect(error).toContain("{{surnom}}");
    expect(error).toContain("{{prenom}}");
  });

  it("côté partenaire, les variables d'officine n'existent pas, et réciproquement", () => {
    expect(refused(draftFor("PARTNER_INVITATION", { body: "Bonjour {{prenom}}, voici {{lien_parrainage}}." }))).toContain("{{lien_parrainage}}");
    expect(refused(draftFor("ANNOUNCEMENT", { body: "Bonjour {{prenom}}, {{nom_partenaire}}." }))).toContain("{{nom_partenaire}}");
    expect(valid(draftFor("ANNOUNCEMENT", { audience: "partners.contacts", body: "Bonjour {{prenom}}, {{nom_partenaire}}." })).value.audience).toBe("partners.contacts");
  });

  it("une annonce sans offre ne peut pas citer le montant d'une offre qui n'existe pas", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { body: "Bonjour {{prenom}}, {{montant_offre}}." }))).toContain("{{montant_offre}}");
  });

  it("une accolade double mal formée ne part jamais : variable majuscule, non fermée, fermante seule", () => {
    for (const body of ["Bonjour {{Prenom}}, un message.", "Bonjour {{prenom, un message.", "Bonjour prenom}}, un message.", "Bonjour {{ }}, un message.", "Bonjour {{prénom}}, un message."]) {
      expect(refused(draftFor("ANNOUNCEMENT", { body }))).toMatch(/accolade double est mal formée|Variable inconnue/);
    }
  });

  it("les espaces dans une variable sont permis, comme dans les modèles : {{ prenom }}", () => {
    expect(valid(draftFor("ANNOUNCEMENT", { body: "Bonjour {{ prenom }}, une information." })).value.body).toContain("{{ prenom }}");
  });

  it("l'objet et le titre sont contrôlés comme le corps", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { subject: "Bonjour {{inconnue}}" }))).toContain("{{inconnue}}");
    expect(refused(draftFor("ANNOUNCEMENT", { title: "Bonjour {{prenom" }))).toContain("mal formée");
  });

  it("l'objet et le titre tiennent sur une seule ligne : pas d'injection d'en-têtes", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { subject: "Bonjour\r\nBcc: autre@exemple.fr" }))).toContain("une seule ligne");
    expect(refused(draftFor("ANNOUNCEMENT", { title: "Un\ntitre" }))).toContain("une seule ligne");
  });

  it("la date de fin et les conditions citées doivent exister", () => {
    expect(refused(draftFor("BONUS_OFFER", { offerConditions: null }))).toContain("{{conditions_offre}}");
    expect(refused(draftFor("BONUS_OFFER", { offerEndsAt: null }))).toContain("{{date_fin_offre}}");
  });
});

describe("validation : l'offre honnête", () => {
  it("un montant tapé à la main, différent de celui de l'offre, est refusé", () => {
    for (const body of ["Bonjour {{prenom}}, gagnez 50 € par filleul.", "Bonjour {{prenom}}, gagnez 50 euros par filleul.", "Bonjour {{prenom}}, gagnez 19,99 € par mois."]) {
      expect(refused(draftFor("REFERRAL_OFFER", { body, offerAmountCents: 2000 }))).toContain("{{montant_offre}}");
    }
  });

  it("le même montant écrit à la main passe (c'est celui qui est appliqué), sous ses diverses écritures", () => {
    for (const body of ["Bonjour {{prenom}}, gagnez 20 € par filleul.", "Bonjour {{prenom}}, gagnez 20 euros par filleul.", "Bonjour {{prenom}}, gagnez 20,00 € par filleul."]) {
      expect(valid(draftFor("REFERRAL_OFFER", { body, offerAmountCents: 2000 })).warnings).not.toContain("Le message ne mentionne pas le montant de l'offre : écrivez {{montant_offre}}.");
    }
  });

  it("un montant à séparateur de milliers est lu en entier : 1 500 € n'est pas 500 €", () => {
    expect(refused(draftFor("BONUS_OFFER", { body: "Bonjour {{prenom}}, un bonus de 1 500 € jusqu'au {{date_fin_offre}}. {{conditions_offre}}", offerAmountCents: 50_000 }))).toContain("1 500 €");
  });

  it("le montant standard peut être cité dans une offre de parrainage (« au lieu de 10 € »), pas dans un bonus", () => {
    const body = `Bonjour {{prenom}}, {{montant_offre}} par filleul au lieu de ${REFERRAL_DISCOUNT_CENTS / 100} € d'habitude.`;
    expect(valid(draftFor("REFERRAL_OFFER", { body, offerAmountCents: 2000 })).ok).toBe(true);
    expect(refused(draftFor("BONUS_OFFER", { body: "Bonjour {{prenom}}, {{montant_offre}} au lieu de 10 € {{date_fin_offre}} {{conditions_offre}}", offerAmountCents: 2000 }))).toContain("10 €");
  });

  it("un type sans offre n'est pas contraint : une annonce peut parler d'un prix", () => {
    expect(valid(draftFor("ANNOUNCEMENT", { body: "Bonjour {{prenom}}, le tarif reste de 69 € par mois." })).ok).toBe(true);
  });

  it("avertit quand le message ne dit pas l'offre, sa fin ou ses conditions", () => {
    const { warnings } = valid(draftFor("REFERRAL_OFFER", { subject: "Parrainage", title: "Parrainage", body: "Bonjour {{prenom}}, parrainez des officines.", offerConditions: "Conditions écrites" }));
    expect(warnings).toContain("Le message ne mentionne pas le montant de l'offre : écrivez {{montant_offre}}.");
    expect(warnings).toContain("Une date de fin est choisie mais le message ne la dit pas : écrivez {{date_fin_offre}}.");
    expect(warnings).toContain("Des conditions sont écrites mais le message ne les dit pas : écrivez {{conditions_offre}}.");
  });

  it("avertit d'un parrainage inférieur au standard, et d'un parrainage standard sans fin (aucune offre ne sera créée)", () => {
    expect(valid(draftFor("REFERRAL_OFFER", { offerAmountCents: 500 })).warnings.join(" ")).toContain("inférieur au montant standard");
    expect(valid(draftFor("REFERRAL_OFFER", { offerAmountCents: REFERRAL_DISCOUNT_CENTS, offerEndsAt: null })).warnings.join(" ")).toContain("aucune offre ne sera créée");
    expect(valid(draftFor("REFERRAL_OFFER", { offerAmountCents: REFERRAL_DISCOUNT_CENTS, offerEndsAt: "2026-10-31" })).warnings.join(" ")).not.toContain("aucune offre ne sera créée");
  });

  it("le texte par défaut du parrainage ne déclenche aucun avertissement", () => {
    expect(valid(draftFor("REFERRAL_OFFER", { offerEndsAt: null })).warnings).toEqual([]);
  });
});

describe("validation : public, boutons, notification", () => {
  it("le type et le public doivent s'accorder", () => {
    expect(refused(draftFor("PARTNER_INVITATION", { audience: "pharmacies.all_active", buttonTarget: null, buttonLabel: null, body: "Bonjour {{prenom}}, une invitation." }))).toContain("ne s'adresse pas aux officines");
    expect(refused(draftFor("BONUS_OFFER", { audience: "partners.contacts", buttonTarget: null, buttonLabel: null }))).toContain("ne s'adresse pas aux partenaires");
    expect(valid(draftFor("ANNOUNCEMENT", { audience: "partners.applications_open", buttonTarget: null, buttonLabel: null, body: "Bonjour {{prenom}}, une information." })).value.audience).toBe("partners.applications_open");
  });

  it("type et public inconnus, y compris les noms hérités de l'objet : refusés", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { kind: "constructor" }))).toContain("Type de campagne inconnu");
    expect(refused(draftFor("ANNOUNCEMENT", { kind: "__proto__" }))).toContain("Type de campagne inconnu");
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "toString" }))).toContain("Public inconnu");
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "pharmacies.tout_le_monde" }))).toContain("Public inconnu");
    expect(refused(null)).toContain("Demande invalide");
    expect(refused("texte")).toContain("Demande invalide");
  });

  it("la notification dans l'application n'existe que pour les officines", () => {
    expect(valid(draftFor("ANNOUNCEMENT", { alsoInApp: true })).value.alsoInApp).toBe(true);
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "partners.contacts", alsoInApp: true, body: "Bonjour {{prenom}}, une information." }))).toContain("n'existe que pour les officines");
    expect(valid(draftFor("ANNOUNCEMENT", { alsoInApp: "oui" })).value.alsoInApp).toBe(false);
  });

  it("un public choisi exige au moins une sélection, sans doublon, bornée", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "pharmacies.selected", audienceParams: {} }))).toContain("au moins une officine");
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "partners.selected", audienceParams: { partnerIds: [] }, body: "Bonjour {{prenom}}, une information." }))).toContain("au moins un partenaire");
    expect(valid(draftFor("ANNOUNCEMENT", { audience: "pharmacies.selected", audienceParams: { pharmacyIds: ["a", "b", "a"] } })).value.audienceParams).toEqual({ pharmacyIds: ["a", "b"] });
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "pharmacies.selected", audienceParams: { pharmacyIds: ["a", ""] } }))).toContain("Sélection de destinataires invalide");
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "pharmacies.selected", audienceParams: { pharmacyIds: "a" } }))).toContain("Sélection de destinataires invalide");
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "pharmacies.selected", audienceParams: { pharmacyIds: ["x".repeat(61)] } }))).toContain("Sélection de destinataires invalide");
    const tooMany = Array.from({ length: CAMPAIGN_MAX_RECIPIENTS + 1 }, (_, i) => `ph_${i}`);
    expect(refused(draftFor("ANNOUNCEMENT", { audience: "pharmacies.selected", audienceParams: { pharmacyIds: tooMany } }))).toMatch(/2\s000/);
  });

  it("les identifiants ne traversent que pour un public choisi, et seulement ceux de son côté", () => {
    expect(valid(draftFor("ANNOUNCEMENT", { audienceParams: { pharmacyIds: ["a"], partnerIds: ["b"] } })).value.audienceParams).toEqual({});
    expect(valid(draftFor("ANNOUNCEMENT", { audience: "pharmacies.selected", audienceParams: { pharmacyIds: ["a"], partnerIds: ["b"] } })).value.audienceParams).toEqual({ pharmacyIds: ["a"] });
  });

  it("le bouton : libellé et destination vont ensemble, du bon côté", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { buttonLabel: "Ouvrir", buttonTarget: null }))).toContain("où mène le bouton");
    expect(refused(draftFor("ANNOUNCEMENT", { buttonLabel: null, buttonTarget: "espace" }))).toContain("texte du bouton");
    expect(refused(draftFor("ANNOUNCEMENT", { buttonLabel: "Ouvrir", buttonTarget: "candidature" }))).toContain("ne mène nulle part pour ce public");
    expect(refused(draftFor("ANNOUNCEMENT", { buttonLabel: "Ouvrir", buttonTarget: "https://exemple.fr" }))).toContain("Destination du bouton inconnue");
    expect(refused(draftFor("ANNOUNCEMENT", { buttonLabel: "Ouvrir", buttonTarget: "constructor" }))).toContain("Destination du bouton inconnue");
    expect(refused(draftFor("ANNOUNCEMENT", { buttonLabel: "x".repeat(61), buttonTarget: "espace" }))).toContain("60 caractères");
    expect(valid(draftFor("ANNOUNCEMENT", { buttonLabel: "Ouvrir", buttonTarget: "espace" })).value.buttonTarget).toBe("espace");
    expect(valid(draftFor("ANNOUNCEMENT", { buttonLabel: "", buttonTarget: "" })).value.buttonTarget).toBeNull();
  });

  it("longueurs : nom, objet, titre, texte, conditions", () => {
    expect(refused(draftFor("ANNOUNCEMENT", { name: "ab" }))).toContain("nom de la campagne");
    expect(refused(draftFor("ANNOUNCEMENT", { subject: "a".repeat(161) }))).toContain("objet");
    expect(refused(draftFor("ANNOUNCEMENT", { title: "a".repeat(121) }))).toContain("titre");
    expect(refused(draftFor("ANNOUNCEMENT", { body: "court" }))).toContain("texte");
    expect(refused(draftFor("ANNOUNCEMENT", { body: "a".repeat(5001) }))).toContain("texte");
    expect(refused(draftFor("BONUS_OFFER", { offerConditions: "a".repeat(501) }))).toContain("500 caractères");
    expect(refused(draftFor("ANNOUNCEMENT", { name: 12345 }))).toContain("nom de la campagne");
  });

  it("les textes sont rognés et les sauts de ligne Windows normalisés", () => {
    const { value } = valid(draftFor("ANNOUNCEMENT", { name: "  Mon nom  ", subject: " Objet ", body: "Bonjour {{prenom}},\r\n\r\nUne information.  " }));
    expect(value).toMatchObject({ name: "Mon nom", subject: "Objet", body: "Bonjour {{prenom}},\n\nUne information." });
  });

  it("les conditions se lisent sur une ligne", () => {
    expect(valid(draftFor("BONUS_OFFER", { offerConditions: "Pour les officines\nabonnées,   sans impayé." })).value.offerConditions).toBe("Pour les officines abonnées, sans impayé.");
  });
});

describe("valeurs et rendu du message", () => {
  const offer = { offerAmountCents: 2000, offerEndsAt: new Date("2026-10-31T22:59:59.999Z"), offerConditions: "Offre réservée aux officines abonnées." };

  it("les valeurs de l'offre : « 20 € », « 31 octobre 2026 », conditions", () => {
    expect(campaignValues(offer)).toEqual({ montant_offre: "20 €", date_fin_offre: "31 octobre 2026", conditions_offre: "Offre réservée aux officines abonnées." });
    expect(campaignValues({ ...offer, offerAmountCents: 1250 }).montant_offre).toBe("12,50 €");
    expect(campaignValues({ offerAmountCents: null, offerEndsAt: null, offerConditions: null })).toEqual({});
  });

  it("les valeurs de l'offre l'emportent sur celles du destinataire", () => {
    expect(campaignValues(offer, { montant_offre: "999 €", prenom: "Camille" })).toMatchObject({ montant_offre: "20 €", prenom: "Camille" });
  });

  it("une valeur absente n'est pas inventée ; une valeur sur plusieurs lignes tient sur une ; aucune accolade double ne passe", () => {
    const values = campaignValues(offer, { prenom: null, officine: "Pharmacie\n  de la {{contact}} Gare", titulaire: undefined });
    expect(values).not.toHaveProperty("prenom");
    expect(values).not.toHaveProperty("titulaire");
    expect(values.officine).toBe("Pharmacie de la contact Gare");
    expect(campaignValues(offer, { officine: "A }} B {{{" }).officine).toBe("A B");
  });

  it("l'aperçu : valeurs d'exemple de chaque côté, l'offre réelle", () => {
    const pharmacy = sampleCampaignValues("PHARMACY", offer);
    expect(pharmacy).toMatchObject({ prenom: "Camille", montant_offre: "20 €", date_fin_offre: "31 octobre 2026" });
    expect(sampleCampaignValues("PARTNER", offer)).toMatchObject({ nom_partenaire: "Laboratoire Exemple", prenom: "Claire" });
  });

  const content = { subject: "Un bonus pour {{officine}}", title: "Bonjour {{officine}}", body: "Bonjour {{prenom}},\n\nVotre bonus : {{montant_offre}}.\n\n{{conditions_offre}}", buttonLabel: "Ouvrir mon espace" };
  const options = { context: DEFAULT_EMAIL_CONTEXT, buttonUrl: "https://pharmaboost.app/parametres?onglet=abonnement", unsubscribeUrl: "https://pharmaboost.app/offres/desinscription/jeton.sig" };

  it("rend l'objet, le titre, le corps, le bouton et le pied de page de désinscription", () => {
    const rendered = renderCampaignEmail(content, campaignValues(offer, { prenom: "Camille", officine: "Pharmacie du Port" }), options);
    expect(rendered.subject).toBe("Un bonus pour Pharmacie du Port");
    expect(rendered.text).toContain("Bonjour Camille,");
    expect(rendered.text).toContain("Votre bonus : 20 €.");
    expect(rendered.text).toContain("Ouvrir mon espace : https://pharmaboost.app/parametres?onglet=abonnement");
    expect(rendered.text).toContain("Ne plus recevoir ces offres : https://pharmaboost.app/offres/desinscription/jeton.sig");
    expect(rendered.html).toContain("Ne plus recevoir ces offres");
    expect(rendered.html).toContain("Ouvrir mon espace");
  });

  it("une variable sans valeur devient vide : jamais « {{x}} » chez le destinataire", () => {
    const rendered = renderCampaignEmail(content, {}, options);
    for (const out of [rendered.subject, rendered.text, rendered.html]) expect(out).not.toMatch(/\{\{|\}\}/);
    expect(rendered.text).toContain("Bonjour ,");
  });

  it("un paragraphe devenu vide disparaît ; sans libellé ou sans adresse, pas de bouton ; sans lien, pas de pied de désinscription", () => {
    const withoutConditions = renderCampaignEmail(content, campaignValues({ ...offer, offerConditions: null }, { prenom: "Camille" }), options);
    expect(campaignParagraphs(content.body, campaignValues({ ...offer, offerConditions: null }, { prenom: "Camille" }))).toHaveLength(2);
    expect(withoutConditions.text).not.toContain("\n\n\n");
    expect(renderCampaignEmail({ ...content, buttonLabel: null }, {}, options).text).not.toContain("Ouvrir mon espace");
    expect(renderCampaignEmail(content, {}, { ...options, buttonUrl: null }).text).not.toContain("Ouvrir mon espace");
    expect(renderCampaignEmail(content, {}, { ...options, unsubscribeUrl: null }).text).not.toContain("Ne plus recevoir");
  });

  it("le HTML échappe les valeurs ; une valeur ne fabrique pas de variable ; l'identité de l'expéditeur est au pied", () => {
    const rendered = renderCampaignEmail(content, campaignValues(offer, { prenom: "<b>Camille</b>", officine: "Dupont & Fils {{contact}}" }), {
      ...options,
      context: { ...DEFAULT_EMAIL_CONTEXT, company: { legalName: "PharmaBoost SAS", address: "10 rue de la Santé, 75013 Paris", siren: "123456789", contactEmail: "contact@pharmaboost.app" } },
    });
    expect(rendered.html).toContain("&lt;b&gt;Camille&lt;/b&gt;");
    expect(rendered.html).not.toContain("<b>Camille</b>");
    expect(rendered.html).toContain("Dupont &amp; Fils contact");
    expect(rendered.text).toContain("PharmaBoost SAS · 10 rue de la Santé, 75013 Paris · SIREN 123456789");
    expect(rendered.text).not.toMatch(/\{\{/);
  });

  it("l'accroche et le motif sont ceux demandés, avec une valeur par défaut honnête", () => {
    const rendered = renderCampaignEmail(content, {}, { ...options, eyebrow: "PharmaBoost Partenaires", reason: "Vous recevez ce message parce que vous êtes partenaire." });
    expect(rendered.html).toContain("PharmaBoost Partenaires");
    expect(rendered.text).toContain("Vous recevez ce message parce que vous êtes partenaire.");
    expect(renderCampaignEmail(content, {}, options).text).toContain("Vous recevez ce message de la part de l'équipe PharmaBoost.");
  });

  it("aucun texte par défaut, rendu avec ses valeurs d'exemple, ne laisse d'accolade ni d'emoji", () => {
    for (const kind of CAMPAIGN_KIND_KEYS) {
      const draft = valid(draftFor(kind)).value as CampaignDraftInput;
      const side = CAMPAIGN_AUDIENCES[draft.audience].side;
      const rendered = renderCampaignEmail(draft, sampleCampaignValues(side, draft), options);
      for (const out of [rendered.subject, rendered.text, rendered.html]) {
        expect(out).not.toMatch(/\{\{|\}\}/);
        expect(EMOJI.test(out)).toBe(false);
      }
    }
  });
});

describe("programmation : des jours calendaires, heure de Paris", () => {
  it("demain est permis, aujourd'hui et hier non", () => {
    expect(validateScheduleDate(new Date("2026-10-05T10:00:00Z"), NOW)).toBeNull();
    expect(validateScheduleDate(new Date("2026-10-04T15:00:00Z"), NOW)).toContain("à partir de demain");
    expect(validateScheduleDate(new Date("2026-10-03T10:00:00Z"), NOW)).toContain("à partir de demain");
  });

  it("le jour se lit à Paris : à 0 h 30 le 5, demain est le 6, pas le 5", () => {
    const justAfterMidnight = new Date("2026-10-04T22:30:00Z");
    expect(validateScheduleDate(new Date("2026-10-05T10:00:00Z"), justAfterMidnight)).toContain("à partir de demain");
    expect(validateScheduleDate(new Date("2026-10-06T10:00:00Z"), justAfterMidnight)).toBeNull();
    // 23 h 30 UTC le 5 est 1 h 30 le 6 à Paris : c'est bien le 6.
    expect(validateScheduleDate(new Date("2026-10-05T23:30:00Z"), justAfterMidnight)).toBeNull();
  });

  it("jusqu'à 90 jours, pas 91", () => {
    expect(validateScheduleDate(new Date("2027-01-02T10:00:00Z"), NOW)).toBeNull();
    expect(validateScheduleDate(new Date("2027-01-03T10:00:00Z"), NOW)).toContain("90 jours");
  });

  it("une date illisible est refusée", () => {
    expect(validateScheduleDate(new Date("nope"), NOW)).toContain("illisible");
  });

  it("décrit l'envoi : demain, dans N jours, au passage quotidien", () => {
    expect(describeSchedule(new Date("2026-10-05T10:00:00Z"), NOW)).toBe("Envoi demain, lundi 5 octobre 2026, au passage quotidien du matin (heure de Paris).");
    expect(describeSchedule(new Date("2026-10-12T10:00:00Z"), NOW)).toContain("dans 8 jours, lundi 12 octobre 2026");
    expect(describeSchedule(new Date("2026-10-04T10:00:00Z"), NOW)).toContain("aujourd'hui");
    expect(describeSchedule(new Date("2026-10-01T10:00:00Z"), NOW)).toContain("dépassée");
  });
});
