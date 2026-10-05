import { describe, expect, it } from "vitest";
import { CAMPAIGN_KINDS, CAMPAIGN_MAX_RECIPIENTS } from "@/core/admin/campaigns";
import {
  amountProblem,
  audienceVerdict,
  audiencesFor,
  buttonTargetsFor,
  canOpenStep,
  checkDraft,
  describeExcluded,
  filterOptions,
  fingerprint,
  formatAmountInput,
  initialState,
  insertAtCursor,
  nextStep,
  parseAudienceParams,
  parseEuros,
  previewBlockedReason,
  previousStep,
  scheduleBounds,
  scheduleDayProblem,
  scheduleSentence,
  selectAudience,
  selectKind,
  sideOf,
  stateFromCampaign,
  stepProblems,
  stepsFor,
  suggestName,
  toPayload,
  type WizardState,
} from "../wizard-logic";

/** L'assistant de campagne : la logique pure, sans écran ni base. */

const NOW = new Date("2026-10-05T09:00:00Z");

/** Une offre bonus complète : montant, fin, conditions. */
function completeBonus(overrides: Partial<WizardState> = {}): WizardState {
  return { ...selectKind(initialState(), "BONUS_OFFER", NOW), amount: "20", endsOn: "2026-10-31", conditions: "Offre réservée aux officines abonnées.", ...overrides };
}

describe("les étapes", () => {
  it("l'offre n'existe que pour un type qui porte un montant", () => {
    expect(stepsFor("BONUS_OFFER")).toEqual(["type", "audience", "message", "offer", "send"]);
    expect(stepsFor("REFERRAL_OFFER")).toContain("offer");
    expect(stepsFor("PARTNER_INVITATION")).toEqual(["type", "audience", "message", "send"]);
    expect(stepsFor("ANNOUNCEMENT")).not.toContain("offer");
    expect(stepsFor(null)).not.toContain("offer");
  });

  it("la navigation saute l'étape d'offre quand il n'y en a pas", () => {
    const announcement = selectKind(initialState(), "ANNOUNCEMENT", NOW);
    expect(nextStep(announcement, "message")).toBe("send");
    expect(previousStep(announcement, "send")).toBe("message");
    expect(previousStep(announcement, "type")).toBeNull();
    expect(nextStep(announcement, "send")).toBeNull();
    const bonus = selectKind(initialState(), "BONUS_OFFER", NOW);
    expect(nextStep(bonus, "message")).toBe("offer");
  });
});

describe("le type et le public", () => {
  it("un type ne propose que les publics de son côté", () => {
    expect(audiencesFor("BONUS_OFFER").every((key) => key.startsWith("pharmacies."))).toBe(true);
    expect(audiencesFor("REFERRAL_OFFER").every((key) => key.startsWith("pharmacies."))).toBe(true);
    expect(audiencesFor("PARTNER_INVITATION").every((key) => key.startsWith("partners."))).toBe(true);
    const announcement = audiencesFor("ANNOUNCEMENT");
    expect(announcement.some((key) => key.startsWith("pharmacies."))).toBe(true);
    expect(announcement.some((key) => key.startsWith("partners."))).toBe(true);
    expect(audiencesFor(null)).toEqual([]);
  });

  it("choisir un type reprend ses textes, son public et son bouton, et propose un nom", () => {
    const state = selectKind(initialState(), "REFERRAL_OFFER", NOW);
    const defaults = CAMPAIGN_KINDS.REFERRAL_OFFER.defaults;
    expect(state).toMatchObject({ kind: "REFERRAL_OFFER", subject: defaults.subject, title: defaults.title, body: defaults.body, buttonLabel: defaults.buttonLabel, buttonTarget: "parrainage", audience: defaults.audience });
    expect(state.name).toBe("Offre de parrainage, octobre 2026");
    expect(suggestName("BONUS_OFFER", NOW)).toBe("Offre bonus, octobre 2026");
  });

  it("changer de type remplace les textes d'origine, jamais un texte retouché", () => {
    const untouched = selectKind(selectKind(initialState(), "BONUS_OFFER", NOW), "REFERRAL_OFFER", NOW);
    expect(untouched.body).toBe(CAMPAIGN_KINDS.REFERRAL_OFFER.defaults.body);
    expect(untouched.name).toBe("Offre de parrainage, octobre 2026");

    const edited = { ...selectKind(initialState(), "BONUS_OFFER", NOW), body: "Mon propre texte pour les officines.", name: "Ma campagne d'automne" };
    const switched = selectKind(edited, "ANNOUNCEMENT", NOW);
    expect(switched.body).toBe("Mon propre texte pour les officines.");
    expect(switched.name).toBe("Ma campagne d'automne");
  });

  it("changer de type ramène le public à ce que le type permet, et vide l'offre d'un type sans montant", () => {
    const partnerAnnouncement = selectAudience(selectKind(initialState(), "ANNOUNCEMENT", NOW), "partners.contacts");
    const bonus = selectKind(partnerAnnouncement, "BONUS_OFFER", NOW);
    expect(bonus.audience).toBe(CAMPAIGN_KINDS.BONUS_OFFER.defaults.audience);

    const withOffer = completeBonus();
    const announcement = selectKind(withOffer, "ANNOUNCEMENT", NOW);
    expect(announcement).toMatchObject({ amount: "", endsOn: "", conditions: "" });
  });

  it("un public d'un autre côté retire le bouton qui ne lui mène nulle part, et la notification dans l'application", () => {
    const announcement = { ...selectKind(initialState(), "ANNOUNCEMENT", NOW), buttonLabel: "Mon espace", buttonTarget: "espace" as const, alsoInApp: true };
    const toPartners = selectAudience(announcement, "partners.contacts");
    expect(toPartners).toMatchObject({ buttonTarget: "", buttonLabel: "", alsoInApp: false });
    const stays = selectAudience(announcement, "pharmacies.trialing");
    expect(stays).toMatchObject({ buttonTarget: "espace", buttonLabel: "Mon espace", alsoInApp: true });
  });

  it("les destinations du bouton sont celles du côté", () => {
    expect(buttonTargetsFor("PHARMACY").map((t) => t.key)).toEqual(["espace", "parrainage"]);
    expect(buttonTargetsFor("PARTNER").map((t) => t.key)).toEqual(["candidature"]);
    expect(buttonTargetsFor(null)).toEqual([]);
    expect(sideOf(selectKind(initialState(), "PARTNER_INVITATION", NOW))).toBe("PARTNER");
    expect(sideOf(initialState())).toBeNull();
  });
});

describe("le montant, en euros saisis et en centimes envoyés", () => {
  it.each([
    ["20", 2000],
    ["12,50", 1250],
    ["12.5", 1250],
    ["0,05", 5],
    [" 1 000 € ", 100_000],
    ["20 euros", 2000],
    ["7,05", 705],
  ])("« %s » vaut %i centimes", (input, cents) => {
    expect(parseEuros(input)).toEqual({ ok: true, cents });
  });

  it.each(["", "abc", "-5", "12,345", "1.000", "12,", "1 2 3 4 5 6 7 8"])("« %s » n'est pas un montant : il n'est pas deviné", (input) => {
    expect(parseEuros(input).ok).toBe(false);
  });

  it("des centimes redeviennent un montant lisible, sans erreur d'arrondi", () => {
    expect(formatAmountInput(2000)).toBe("20");
    expect(formatAmountInput(1250)).toBe("12,50");
    expect(formatAmountInput(705)).toBe("7,05");
    expect(formatAmountInput(5)).toBe("0,05");
    for (const cents of [100, 101, 1999, 2000, 50_000, 123_456]) expect(parseEuros(formatAmountInput(cents))).toEqual({ ok: true, cents });
  });

  it("les bornes sont celles du type, dites en euros", () => {
    expect(amountProblem("BONUS_OFFER", "20")).toBeNull();
    expect(amountProblem("BONUS_OFFER", "0,50")).toBe("Le montant doit être compris entre 1 € et 2 000 €.");
    expect(amountProblem("BONUS_OFFER", "2 000,01")).toBe("Le montant doit être compris entre 1 € et 2 000 €.");
    expect(amountProblem("REFERRAL_OFFER", "501")).toBe("Le montant doit être compris entre 1 € et 500 €.");
    expect(amountProblem("REFERRAL_OFFER", "10")).toBeNull();
    expect(amountProblem("BONUS_OFFER", "abc")).toContain("illisible");
    expect(amountProblem("BONUS_OFFER", "")).toBe("Saisissez un montant en euros.");
  });
});

describe("le brouillon envoyé au serveur", () => {
  it("le montant part en centimes, la fin en jour, les conditions rognées", () => {
    const payload = toPayload(completeBonus({ amount: "12,50", conditions: "  Pour les officines abonnées.  " }));
    expect(payload).toMatchObject({ kind: "BONUS_OFFER", offerAmountCents: 1250, offerEndsAt: "2026-10-31", offerConditions: "Pour les officines abonnées." });
  });

  it("un type sans offre n'emporte ni montant, ni fin, ni conditions, même si l'écran en gardait", () => {
    const state: WizardState = { ...selectKind(initialState(), "ANNOUNCEMENT", NOW), amount: "20", endsOn: "2026-10-31", conditions: "reste" };
    expect(toPayload(state)).toMatchObject({ offerAmountCents: null, offerEndsAt: null, offerConditions: null });
  });

  it("seuls les identifiants du côté choisi voyagent, et seulement pour un public choisi à la main", () => {
    const base = { ...completeBonus(), pharmacyIds: ["ph_1", "ph_2"], partnerIds: ["pa_1"] };
    expect(toPayload({ ...base, audience: "pharmacies.selected" }).audienceParams).toEqual({ pharmacyIds: ["ph_1", "ph_2"] });
    expect(toPayload({ ...base, audience: "pharmacies.all_active" }).audienceParams).toEqual({});
    const announcement = { ...selectKind(initialState(), "ANNOUNCEMENT", NOW), pharmacyIds: ["ph_1"], partnerIds: ["pa_1"] };
    expect(toPayload({ ...announcement, audience: "partners.selected" }).audienceParams).toEqual({ partnerIds: ["pa_1"] });
  });

  it("un bouton vide n'est pas un bouton", () => {
    expect(toPayload({ ...completeBonus(), buttonLabel: "  ", buttonTarget: "" })).toMatchObject({ buttonLabel: null, buttonTarget: null });
  });

  it("le domaine tranche : une offre complète passe, un montant illisible est refusé avec les bornes", () => {
    expect(checkDraft(completeBonus(), NOW).ok).toBe(true);
    const refused = checkDraft(completeBonus({ amount: "beaucoup" }), NOW);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("Le montant doit être compris entre");
  });

  it("le texte d'exemple d'une annonce n'est jamais accepté tel quel", () => {
    const announcement = { ...selectKind(initialState(), "ANNOUNCEMENT", NOW) };
    const checked = checkDraft(announcement, NOW);
    expect(checked.ok).toBe(false);
  });

  it("l'empreinte change dès qu'un champ change, et pas autrement", () => {
    const a = completeBonus();
    expect(fingerprint(a)).toBe(fingerprint({ ...a }));
    expect(fingerprint({ ...a, subject: `${a.subject} !` })).not.toBe(fingerprint(a));
    expect(fingerprint({ ...a, amount: "21" })).not.toBe(fingerprint(a));
  });
});

describe("ce qui bloque chaque étape", () => {
  it("type : un type et un nom", () => {
    expect(stepProblems(initialState(), "type", NOW)).toEqual(["Choisissez un type de campagne.", "Donnez un nom à la campagne (3 à 120 caractères) : il reste interne."]);
    expect(stepProblems(selectKind(initialState(), "BONUS_OFFER", NOW), "type", NOW)).toEqual([]);
    expect(stepProblems({ ...selectKind(initialState(), "BONUS_OFFER", NOW), name: "ab" }, "type", NOW)).toHaveLength(1);
  });

  it("destinataires : un public, et au moins une personne choisie quand on choisit à la main", () => {
    expect(stepProblems(initialState(), "audience", NOW)).toEqual(["Choisissez à qui s'adresse la campagne."]);
    const manual = selectAudience(completeBonus(), "pharmacies.selected");
    expect(stepProblems(manual, "audience", NOW)).toEqual(["Choisissez au moins une officine."]);
    expect(stepProblems({ ...manual, pharmacyIds: ["ph_1"] }, "audience", NOW)).toEqual([]);
    const partners = selectAudience(selectKind(initialState(), "PARTNER_INVITATION", NOW), "partners.selected");
    expect(stepProblems(partners, "audience", NOW)).toEqual(["Choisissez au moins un partenaire."]);
  });

  it("message : objet, titre, texte, et un bouton cohérent", () => {
    expect(stepProblems(completeBonus(), "message", NOW)).toEqual([]);
    expect(stepProblems({ ...completeBonus(), subject: "", title: "", body: "" }, "message", NOW)).toHaveLength(3);
    expect(stepProblems({ ...completeBonus(), buttonTarget: "" }, "message", NOW)).toEqual(["Choisissez où mène le bouton, ou retirez son texte."]);
    expect(stepProblems({ ...completeBonus(), buttonLabel: "" }, "message", NOW)).toEqual(["Écrivez le texte du bouton, ou retirez sa destination."]);
  });

  it("offre : un montant dans les bornes, une fin qui n'est pas passée", () => {
    expect(stepProblems(completeBonus(), "offer", NOW)).toEqual([]);
    expect(stepProblems(completeBonus({ amount: "" }), "offer", NOW)).toEqual(["Saisissez un montant en euros."]);
    expect(stepProblems(completeBonus({ endsOn: "2026-10-04" }), "offer", NOW)[0]).toContain("ne peut pas être passée");
    // Aujourd'hui convient : l'offre court jusqu'à la fin de ce jour.
    expect(stepProblems(completeBonus({ endsOn: "2026-10-05" }), "offer", NOW)).toEqual([]);
    expect(stepProblems(completeBonus({ endsOn: "" }), "offer", NOW)).toEqual([]);
    expect(stepProblems(completeBonus({ endsOn: "2026-02-31" }), "offer", NOW)).toEqual(["La date de fin est illisible."]);
  });

  it("envoi : reprend la réponse du domaine", () => {
    expect(stepProblems(completeBonus(), "send", NOW)).toEqual([]);
    expect(stepProblems(completeBonus({ conditions: "" }), "send", NOW)[0]).toContain("{{conditions_offre}}");
  });

  it("on ne saute pas une étape inachevée, mais on revient toujours en arrière", () => {
    const state = completeBonus();
    expect(canOpenStep(state, "send", NOW)).toBe(true);
    expect(canOpenStep({ ...state, amount: "" }, "send", NOW)).toBe(false);
    expect(canOpenStep({ ...state, amount: "" }, "message", NOW)).toBe(true);
    expect(canOpenStep(initialState(), "audience", NOW)).toBe(false);
    expect(canOpenStep(selectKind(initialState(), "ANNOUNCEMENT", NOW), "offer", NOW)).toBe(false);
  });
});

describe("l'aperçu", () => {
  it("dit pourquoi il manque, au lieu de montrer un message au montant inventé", () => {
    expect(previewBlockedReason(initialState(), "message", NOW)).toContain("Choisissez le type");
    const withoutAmount = completeBonus({ amount: "" });
    expect(previewBlockedReason(withoutAmount, "message", NOW)).toContain("quand l'offre sera renseignée");
    expect(previewBlockedReason(completeBonus(), "message", NOW)).toBeNull();
    // À l'étape de l'offre, c'est la réponse du domaine qui parle.
    expect(previewBlockedReason(withoutAmount, "offer", NOW)).toContain("Le montant doit être compris entre");
  });
});

describe("la programmation : de demain à 90 jours, au jour", () => {
  it("les bornes sont calculées au jour de Paris", () => {
    expect(scheduleBounds(NOW)).toEqual({ min: "2026-10-06", max: "2027-01-03" });
    // 23 h 30 à Paris le 5 octobre = 21 h 30 UTC : le jour de Paris est toujours le 5.
    expect(scheduleBounds(new Date("2026-10-05T21:30:00Z")).min).toBe("2026-10-06");
    // 0 h 30 à Paris le 6 = 22 h 30 UTC le 5 : le jour de Paris est déjà le 6.
    expect(scheduleBounds(new Date("2026-10-05T22:30:00Z")).min).toBe("2026-10-07");
  });

  it("aujourd'hui et au-delà de 90 jours sont refusés, demain et le 90e jour sont permis", () => {
    expect(scheduleDayProblem("2026-10-05", NOW)).toContain("à partir de demain");
    expect(scheduleDayProblem("2026-10-06", NOW)).toBeNull();
    expect(scheduleDayProblem("2027-01-03", NOW)).toBeNull();
    expect(scheduleDayProblem("2027-01-04", NOW)).toContain("90 jours");
    expect(scheduleDayProblem("", NOW)).toBe("Choisissez un jour.");
    expect(scheduleDayProblem("2026-02-31", NOW)).toBe("Choisissez un jour.");
  });

  it("la phrase dit que l'envoi part au passage quotidien du matin, pas à l'heure", () => {
    expect(scheduleSentence("2026-10-06", NOW)).toBe("Envoi demain, mardi 6 octobre 2026, au passage quotidien du matin (heure de Paris).");
    expect(scheduleSentence("2026-10-20", NOW)).toContain("dans 15 jours");
    expect(scheduleSentence("pas une date", NOW)).toBeNull();
  });
});

describe("les destinataires", () => {
  it("un envoi suppose de 1 à 2 000 destinataires", () => {
    expect(audienceVerdict(0)).toBe("empty");
    expect(audienceVerdict(1)).toBe("ok");
    expect(audienceVerdict(CAMPAIGN_MAX_RECIPIENTS)).toBe("ok");
    expect(audienceVerdict(CAMPAIGN_MAX_RECIPIENTS + 1)).toBe("too_many");
  });

  it("ce qui est écarté se dit en une phrase", () => {
    expect(describeExcluded({ optedOut: 0, noEmail: 0, duplicates: 0 })).toBe("");
    expect(describeExcluded({ optedOut: 2, noEmail: 1, duplicates: 3 })).toBe("2 désinscrits des offres, 1 sans adresse e-mail, 3 doublons d'adresse");
    expect(describeExcluded({ optedOut: 1, noEmail: 0, duplicates: 1 })).toBe("1 désinscrit des offres, 1 doublon d'adresse");
  });

  it("la recherche par nom ignore la casse et les accents, et borne la liste", () => {
    const options = [
      { id: "1", name: "Pharmacie de l'Étoile", city: "Lyon" },
      { id: "2", name: "Pharmacie du Port", city: "Brest" },
      { id: "3", name: "Grande Pharmacie", city: null },
    ];
    expect(filterOptions(options, "etoile", 10).shown.map((o) => o.id)).toEqual(["1"]);
    expect(filterOptions(options, "BREST", 10).shown.map((o) => o.id)).toEqual(["2"]);
    expect(filterOptions(options, "", 2)).toMatchObject({ total: 3 });
    expect(filterOptions(options, "", 2).shown).toHaveLength(2);
    expect(filterOptions(options, "inconnu", 10)).toEqual({ shown: [], total: 0 });
  });

  it("les identifiants choisis, lus en base, ne sont jamais autre chose que des chaînes", () => {
    expect(parseAudienceParams({ pharmacyIds: ["a", 3, "b"], partnerIds: "x" })).toEqual({ pharmacyIds: ["a", "b"], partnerIds: [] });
    expect(parseAudienceParams(null)).toEqual({ pharmacyIds: [], partnerIds: [] });
    expect(parseAudienceParams([])).toEqual({ pharmacyIds: [], partnerIds: [] });
  });
});

describe("les variables", () => {
  it("s'insèrent à la position du curseur, ou à la place de la sélection", () => {
    expect(insertAtCursor("Bonjour , bienvenue", 8, 8, "{{prenom}}")).toEqual({ value: "Bonjour {{prenom}}, bienvenue", caret: 18 });
    expect(insertAtCursor("Bonjour X", 8, 9, "{{prenom}}")).toEqual({ value: "Bonjour {{prenom}}", caret: 18 });
    expect(insertAtCursor("abc", 99, 99, "{{x}}")).toEqual({ value: "abc{{x}}", caret: 8 });
    expect(insertAtCursor("", 0, 0, "{{x}}")).toEqual({ value: "{{x}}", caret: 5 });
  });
});

describe("une campagne enregistrée, remise dans l'assistant", () => {
  const saved = {
    kind: "BONUS_OFFER",
    name: "Bonus d'automne",
    subject: "Un bonus pour {{officine}}",
    title: "Un bonus de {{montant_offre}}",
    body: "Bonjour {{prenom}}, voici {{montant_offre}} jusqu'au {{date_fin_offre}}. {{conditions_offre}}",
    buttonLabel: "Ouvrir mon espace",
    buttonTarget: "espace",
    audience: "pharmacies.selected",
    audienceParams: { pharmacyIds: ["ph_1", "ph_2"] },
    alsoInApp: true,
    offerAmountCents: 1250,
    // Le dernier instant du 31 octobre, à Paris (heure d'hiver : UTC+1).
    offerEndsAt: new Date("2026-10-31T22:59:59.999Z"),
    offerConditions: "Pour les officines abonnées.",
  };

  it("retrouve les euros saisis, le jour de fin et les officines choisies", () => {
    const state = stateFromCampaign(saved);
    expect(state).toMatchObject({ kind: "BONUS_OFFER", audience: "pharmacies.selected", pharmacyIds: ["ph_1", "ph_2"], amount: "12,50", endsOn: "2026-10-31", conditions: "Pour les officines abonnées.", buttonTarget: "espace", alsoInApp: true });
  });

  it("renvoie au serveur ce qui a été enregistré, sans rien déformer", () => {
    expect(toPayload(stateFromCampaign(saved))).toMatchObject({ offerAmountCents: 1250, offerEndsAt: "2026-10-31", audienceParams: { pharmacyIds: ["ph_1", "ph_2"] }, buttonLabel: "Ouvrir mon espace", buttonTarget: "espace" });
  });

  it("une valeur inattendue en base n'est pas devinée", () => {
    const state = stateFromCampaign({ ...saved, kind: "AUTRE", audience: "nulle.part", buttonTarget: "ailleurs", offerAmountCents: null, offerEndsAt: null, offerConditions: null });
    expect(state).toMatchObject({ kind: null, audience: null, buttonTarget: "", amount: "", endsOn: "", conditions: "" });
  });
});
