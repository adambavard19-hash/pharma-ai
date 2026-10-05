import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkDraft,
  initialState,
  nextStep,
  selectAudience,
  selectKind,
  stepProblems,
  stepsFor,
  toPayload,
  type WizardState,
  type WizardStep,
} from "../wizard-logic";

/**
 * L'assistant et les actions du serveur parlent la même langue : ce que
 * l'assistant construit passe les contrôles réels des actions (forme zod, règles
 * du domaine), et ce qu'il confirme est ce que l'action attend. Services
 * simulés ; les actions, elles, sont les vraies.
 */

const services = vi.hoisted(() => ({
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteDraftCampaign: vi.fn(),
  previewAudience: vi.fn(),
  previewCampaignEmail: vi.fn(),
  resumeCampaign: vi.fn(),
  scheduleCampaign: vi.fn(),
  sendCampaignTest: vi.fn(),
  startCampaign: vi.fn(),
  unscheduleCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: vi.fn(async () => ({ admin: { id: "adm_1", email: "admin@pharmaboost.test", fullName: "Admin", initials: "AD" }, sessionId: "s1" })) }));
vi.mock("@/server/services/admin/campaigns", () => services);

const actions = await import("@/server/actions/admin-campaigns");

const NOW = new Date();

beforeEach(() => {
  vi.clearAllMocks();
  services.createCampaign.mockResolvedValue({ id: "camp_1" });
  services.updateCampaign.mockResolvedValue({ ok: true, backToDraft: false });
  services.previewAudience.mockResolvedValue({ count: 3, excluded: { optedOut: 0, noEmail: 0, duplicates: 0 }, sample: [] });
  services.previewCampaignEmail.mockResolvedValue({ subject: "S", text: "t", html: "<p>h</p>" });
  services.sendCampaignTest.mockResolvedValue({ status: "SENT", detail: "ok" });
  services.startCampaign.mockResolvedValue({ ok: true, recipientCount: 3, sentCount: 3, failedCount: 0, skippedCount: 0, simulated: false, complete: true });
  services.scheduleCampaign.mockResolvedValue({ ok: true });
});

/** Le jour de fin : dans le futur proche, calculé depuis maintenant (le domaine refuse une date passée). */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Parcourt l'assistant comme le ferait l'écran : chaque étape doit être en règle avant de passer à la suivante. */
function walk(state: WizardState): WizardStep[] {
  const visited: WizardStep[] = [];
  let step: WizardStep | null = stepsFor(state.kind)[0];
  while (step) {
    expect(stepProblems(state, step, NOW), `étape « ${step} »`).toEqual([]);
    visited.push(step);
    step = nextStep(state, step);
  }
  return visited;
}

const flows: Record<string, () => WizardState> = {
  "offre bonus": () => ({ ...selectKind(initialState(), "BONUS_OFFER", NOW), amount: "12,50", endsOn: inDays(20), conditions: "Offre réservée aux officines abonnées." }),
  "offre de parrainage avec fin": () => ({ ...selectKind(initialState(), "REFERRAL_OFFER", NOW), amount: "20", endsOn: inDays(30) }),
  "offre de parrainage sans fin (plus de montant standard : c'est une vraie offre)": () => ({ ...selectKind(initialState(), "REFERRAL_OFFER", NOW), amount: "30" }),
  "offre de parrainage à 10 €, sans fin : inférieure aux 20 %, avertie mais valide": () => ({ ...selectKind(initialState(), "REFERRAL_OFFER", NOW), amount: "10" }),
  "invitation des partenaires": () => selectKind(initialState(), "PARTNER_INVITATION", NOW),
  "annonce aux officines choisies": () => ({ ...selectAudience(selectKind(initialState(), "ANNOUNCEMENT", NOW), "pharmacies.selected"), pharmacyIds: ["ph_1", "ph_2"], body: "Bonjour {{prenom}},\n\nLa pharmacie du port ouvre un samedi par mois.", buttonLabel: "Ouvrir mon espace", buttonTarget: "espace" as const }),
  "annonce aux partenaires choisis": () => ({ ...selectAudience(selectKind(initialState(), "ANNOUNCEMENT", NOW), "partners.selected"), partnerIds: ["pa_1"], body: "Bonjour {{prenom}},\n\nUne nouvelle session de candidatures s'ouvre." }),
};

describe.each(Object.entries(flows))("parcours : %s", (_name, build) => {
  it("chaque étape se franchit, et le brouillon passe les règles du domaine", () => {
    const state = build();
    const visited = walk(state);
    expect(visited[0]).toBe("type");
    expect(visited.at(-1)).toBe("send");
    const checked = checkDraft(state, NOW);
    expect(checked.ok).toBe(true);
  });

  it("l'action d'enregistrement accepte ce que l'assistant envoie, et le serveur crée un brouillon", async () => {
    const state = build();
    const result = await actions.saveCampaignAction(toPayload(state));
    expect(result.ok).toBe(true);
    expect(services.createCampaign).toHaveBeenCalledTimes(1);
    const [draft, adminId] = services.createCampaign.mock.calls[0];
    expect(adminId).toBe("adm_1");
    expect(draft).toMatchObject({ kind: state.kind, audience: state.audience, name: state.name.trim() });
  });

  it("modifier un brouillon passe par la même forme, avec l'identifiant", async () => {
    const result = await actions.saveCampaignAction({ ...toPayload(build()), id: "camp_9" });
    expect(result.ok).toBe(true);
    expect(services.updateCampaign).toHaveBeenCalledWith("camp_9", expect.anything(), "adm_1");
    expect(services.createCampaign).not.toHaveBeenCalled();
  });

  it("le public, l'aperçu et l'essai acceptent la même forme", async () => {
    const state = build();
    const payload = toPayload(state);
    expect((await actions.previewAudienceAction({ audience: payload.audience, audienceParams: payload.audienceParams })).ok).toBe(true);
    expect(services.previewAudience).toHaveBeenCalledWith(state.audience, payload.audienceParams);
    expect((await actions.previewCampaignEmailAction(payload)).ok).toBe(true);
    expect((await actions.sendCampaignTestAction(payload)).ok).toBe(true);
    // L'essai part à l'administrateur connecté, jamais à une adresse venue de l'écran.
    expect(services.sendCampaignTest.mock.calls[0][2]).toBe("admin@pharmaboost.test");
  });
});

describe("le montant et la fin de l'offre arrivent au serveur tels que l'écran les a saisis", () => {
  it("euros saisis → centimes ; jour de fin → dernier instant de ce jour à Paris", async () => {
    await actions.saveCampaignAction(toPayload({ ...flows["offre bonus"](), endsOn: "2036-10-20" }));
    const [draft] = services.createCampaign.mock.calls[0];
    expect(draft.offerAmountCents).toBe(1250);
    // 20 octobre : heure d'été à Paris (UTC+2), le jour finit à 21 h 59 min 59,999 s UTC.
    expect(draft.offerEndsAt.toISOString()).toBe("2036-10-20T21:59:59.999Z");
    services.createCampaign.mockClear();
    await actions.saveCampaignAction(toPayload({ ...flows["offre bonus"](), endsOn: "2036-12-20" }));
    // En hiver (UTC+1) : 22 h 59 min 59,999 s UTC.
    expect(services.createCampaign.mock.calls[0][0].offerEndsAt.toISOString()).toBe("2036-12-20T22:59:59.999Z");
  });

  it("un montant hors bornes est refusé par le serveur avec les bornes, comme le dit l'écran", async () => {
    const result = await actions.saveCampaignAction(toPayload({ ...flows["offre bonus"](), amount: "5000" }));
    expect(result).toMatchObject({ ok: false, error: "Le montant doit être compris entre 1 € et 2 000 €." });
    expect(services.createCampaign).not.toHaveBeenCalled();
  });

  it("un brouillon que l'écran juge incomplet est aussi refusé par le serveur : aucune écriture", async () => {
    const state = { ...flows["offre bonus"](), conditions: "" };
    expect(checkDraft(state, NOW).ok).toBe(false);
    const result = await actions.saveCampaignAction(toPayload(state));
    expect(result.ok).toBe(false);
    expect(services.createCampaign).not.toHaveBeenCalled();
  });
});

describe("la confirmation d'envoi et de programmation", () => {
  it("le mot retapé est accepté sans égard à la casse, tel que la fenêtre le laisse passer", async () => {
    const result = await actions.startCampaignAction({ id: "camp_1", confirmedCount: 3, confirmation: "envoyer" });
    expect(result.ok).toBe(true);
    expect(services.startCampaign).toHaveBeenCalledWith("camp_1", "adm_1", 3);
  });

  it("sans le bon mot, rien ne part, même si la fenêtre était contournée", async () => {
    const result = await actions.startCampaignAction({ id: "camp_1", confirmedCount: 3, confirmation: "OUI" });
    expect(result).toMatchObject({ ok: false, error: "Pour confirmer l'envoi, retapez le mot ENVOYER." });
    expect(services.startCampaign).not.toHaveBeenCalled();
    const scheduled = await actions.scheduleCampaignAction({ id: "camp_1", date: inDays(5), confirmedCount: 3, confirmation: "" });
    expect(scheduled.ok).toBe(false);
    expect(services.scheduleCampaign).not.toHaveBeenCalled();
  });

  it("la programmation reçoit le jour choisi, au jour de Paris, avec le nombre confirmé", async () => {
    const result = await actions.scheduleCampaignAction({ id: "camp_1", date: "2036-10-20", confirmedCount: 3, confirmation: "ENVOYER" });
    expect(result.ok).toBe(true);
    const [id, date, adminId, count] = services.scheduleCampaign.mock.calls[0];
    expect([id, adminId, count]).toEqual(["camp_1", "adm_1", 3]);
    // Minuit à Paris le 20 octobre (heure d'été) = 22 h UTC la veille.
    expect(date.toISOString()).toBe("2036-10-19T22:00:00.000Z");
    if (result.ok) expect(result.data.schedule).toContain("au passage quotidien du matin (heure de Paris)");
  });

  it("un refus du serveur (nombre qui a changé) est rendu tel quel à l'écran", async () => {
    services.startCampaign.mockResolvedValue({ ok: false, error: "Le nombre de destinataires a changé : 3 confirmés, 5 aujourd'hui. Relisez l'aperçu, puis confirmez de nouveau." });
    const result = await actions.startCampaignAction({ id: "camp_1", confirmedCount: 3, confirmation: "ENVOYER" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("a changé : 3 confirmés, 5 aujourd'hui") });
  });

  it("un envoi simulé revient comme simulé, jamais comme réussi", async () => {
    services.startCampaign.mockResolvedValue({ ok: true, recipientCount: 3, sentCount: 3, failedCount: 0, skippedCount: 0, simulated: true, complete: true });
    const result = await actions.startCampaignAction({ id: "camp_1", confirmedCount: 3, confirmation: "ENVOYER" });
    expect(result.ok && result.data.simulated).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("Envoi simulé");
      expect(result.message).not.toContain("Campagne envoyée");
    }
  });
});
