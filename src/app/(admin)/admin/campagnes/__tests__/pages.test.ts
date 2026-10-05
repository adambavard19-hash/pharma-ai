import { createElement, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CAMPAIGN_KINDS } from "@/core/admin/campaigns";

/**
 * Les écrans de la console « Campagnes », rendus côté serveur sans navigateur
 * ni base (aucune session console n'est disponible pour les voir en direct) :
 * la liste, la fiche d'une campagne et l'assistant, services simulés. On lit le
 * texte rendu, pas le balisage.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  capability: { value: "SIMULATED" as "SIMULATED" | "LIVE" },
  listCampaigns: vi.fn(),
  loadCampaign: vi.fn(),
  listCampaignRecipients: vi.fn(),
  previewAudience: vi.fn(),
  activeReferralOffer: vi.fn(),
  loadSelectionOptions: vi.fn(),
  loadBonusRecipients: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/campagnes",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { capability: mocks.capability.value, label: "Messagerie de test" } }) }));
vi.mock("@/server/services/admin/campaigns", () => ({
  listCampaigns: mocks.listCampaigns,
  loadCampaign: mocks.loadCampaign,
  listCampaignRecipients: mocks.listCampaignRecipients,
  previewAudience: mocks.previewAudience,
}));
vi.mock("@/server/services/referral-offers", () => ({ activeReferralOffer: mocks.activeReferralOffer }));
vi.mock("../loaders", () => ({ loadSelectionOptions: mocks.loadSelectionOptions, loadBonusRecipients: mocks.loadBonusRecipients }));
vi.mock("@/server/actions/admin-campaigns", () => ({
  saveCampaignAction: vi.fn(),
  previewAudienceAction: vi.fn(),
  previewCampaignEmailAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
  scheduleCampaignAction: vi.fn(),
  unscheduleCampaignAction: vi.fn(),
  startCampaignAction: vi.fn(),
  resumeCampaignAction: vi.fn(),
  cancelCampaignAction: vi.fn(),
  deleteDraftCampaignAction: vi.fn(),
}));

const list = await import("../page");
const detail = await import("../[id]/page");
const edit = await import("../[id]/modifier/page");
const create = await import("../nouvelle/page");
const steps = await import("../wizard-steps");
const previewPane = await import("../preview-pane");

type Props = Record<string, unknown>;

/** Le texte lisible d'un rendu : sans balises, apostrophes et espaces insécables normalisés. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

/** Un composant serveur asynchrone posé en racine (l'écran de l'assistant) est exécuté ici : le rendu statique ne sait pas attendre. */
async function settle(node: ReactNode): Promise<ReactNode> {
  if (isValidElement(node) && typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") return settle(await (node.type as (props: unknown) => Promise<ReactNode>)(node.props));
  return node;
}

const renderPage = async (page: (props: never) => Promise<ReactNode> | ReactNode, props: Props) => renderToStaticMarkup((await settle(await page(props as never))) as React.ReactElement);
const renderList = (search: Record<string, string> = {}) => renderPage(list.default, { searchParams: Promise.resolve(search) });
const renderDetail = (search: Record<string, string> = {}, id = "camp_1") => renderPage(detail.default, { params: Promise.resolve({ id }), searchParams: Promise.resolve(search) });

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "camp_1",
  kind: "BONUS_OFFER",
  name: "Bonus d'automne",
  status: "DRAFT",
  audience: "pharmacies.all_active",
  subject: "Un bonus pour {{officine}}",
  recipientCount: 0,
  sentCount: 0,
  failedCount: 0,
  skippedCount: 0,
  simulated: false,
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  offerAmountCents: 2000,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  ...overrides,
});

const full = (overrides: Record<string, unknown> = {}) => ({
  ...row(),
  title: "Un bonus de {{montant_offre}} pour {{officine}}",
  body: "Bonjour {{prenom}},\n\nUn bonus de {{montant_offre}} jusqu'au {{date_fin_offre}}.\n\nConditions : {{conditions_offre}}",
  buttonLabel: "Ouvrir mon espace",
  buttonTarget: "espace",
  audienceParams: {},
  alsoInApp: false,
  offerEndsAt: new Date("2026-10-31T22:59:59.999Z"),
  offerConditions: "Offre réservée aux officines abonnées.",
  canceledAt: null,
  referralOffer: null,
  ...overrides,
});

const counts = (overrides: Record<string, number> = {}) => ({ DRAFT: 0, SCHEDULED: 0, SENDING: 0, SENT: 0, CANCELED: 0, ...overrides });
const recipientCounts = (overrides: Record<string, number> = {}) => ({ PENDING: 0, SENDING: 0, SENT: 0, SIMULATED: 0, FAILED: 0, SKIPPED: 0, ...overrides });
const recipientRow = (overrides: Record<string, unknown> = {}) => ({ id: "r1", name: "Pharmacie Martin", email: "titulaire@martin.test", status: "SENT", detail: null, sentAt: new Date("2026-10-05T08:16:00Z"), ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capability.value = "SIMULATED";
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1", email: "admin@pharmaboost.test", fullName: "Admin Test", initials: "AT" }, sessionId: "s1" });
  mocks.listCampaigns.mockResolvedValue({ rows: [], total: 0, counts: counts() });
  mocks.loadCampaign.mockResolvedValue(full());
  mocks.listCampaignRecipients.mockResolvedValue({ rows: [], total: 0, counts: recipientCounts() });
  mocks.previewAudience.mockResolvedValue({ count: 42, excluded: { optedOut: 2, noEmail: 0, duplicates: 1 }, sample: [] });
  mocks.activeReferralOffer.mockResolvedValue(null);
  mocks.loadSelectionOptions.mockResolvedValue({ pharmacies: [{ id: "ph_1", name: "Pharmacie Martin", city: "Lyon" }], partners: [{ id: "pa_1", name: "Laboratoire Exemple" }], truncated: { pharmacies: false, partners: false } });
  mocks.loadBonusRecipients.mockResolvedValue({ rows: [], truncated: false });
});

// ---------------------------------------------------------------- Liste

describe("la liste des campagnes", () => {
  it("exige une session administrateur", async () => {
    await renderList();
    expect(mocks.requirePlatformSession).toHaveBeenCalled();
  });

  it("montre les tuiles avec les comptes réels, et les campagnes avec leur état", async () => {
    mocks.listCampaigns.mockResolvedValue({
      rows: [
        row({ id: "a", name: "Bonus d'automne", status: "DRAFT" }),
        row({ id: "b", name: "Parrainage d'octobre", kind: "REFERRAL_OFFER", status: "SCHEDULED", recipientCount: 42, scheduledFor: new Date("2026-10-19T22:00:00Z") }),
        row({ id: "c", name: "Annonce réelle", kind: "ANNOUNCEMENT", status: "SENT", recipientCount: 15, sentCount: 12, failedCount: 1, skippedCount: 2, startedAt: new Date("2026-10-02T08:15:00Z"), completedAt: new Date("2026-10-02T08:16:00Z") }),
        row({ id: "d", name: "Annonce simulée", kind: "ANNOUNCEMENT", status: "SENT", simulated: true, recipientCount: 5, sentCount: 5, startedAt: new Date("2026-10-03T08:15:00Z"), completedAt: new Date("2026-10-03T08:16:00Z") }),
      ],
      total: 4,
      counts: counts({ DRAFT: 3, SCHEDULED: 2, SENDING: 1, SENT: 9, CANCELED: 1 }),
    });
    const html = text(await renderList());
    // Les tuiles : les comptes de la base.
    expect(html).toMatch(/Envoyées 9/);
    expect(html).toMatch(/Programmées 2/);
    expect(html).toMatch(/Brouillons 3/);
    expect(html).toMatch(/En cours d'envoi 1/);
    // Les lignes.
    expect(html).toContain("Bonus d'automne");
    expect(html).toContain("Offre bonus");
    expect(html).toContain("Offre de parrainage");
    expect(html).toContain("Programmée pour le");
    expect(html).toContain("12 envoyés · 1 échec · 2 ignorés");
    // Un brouillon n'a ni destinataires calculés ni résultat : « — », pas un zéro inventé.
    expect(html).toMatch(/Bonus d'automne.*?Offre bonus —/);
  });

  it("un envoi simulé se lit « simulée » et « simulés », jamais « envoyé »", async () => {
    mocks.listCampaigns.mockResolvedValue({
      rows: [row({ id: "d", name: "Annonce simulée", kind: "ANNOUNCEMENT", status: "SENT", simulated: true, recipientCount: 5, sentCount: 5, startedAt: new Date("2026-10-03T08:15:00Z"), completedAt: new Date("2026-10-03T08:16:00Z") })],
      total: 1,
      counts: counts({ SENT: 1 }),
    });
    const html = text(await renderList());
    expect(html).toContain("Simulée le");
    expect(html).toContain("5 simulés · 0 échec · 0 ignoré");
    expect(html).not.toContain("5 envoyés");
    expect(html).not.toContain("Envoyée le");
  });

  it("chaque ligne et chaque tuile mènent quelque part", async () => {
    mocks.listCampaigns.mockResolvedValue({ rows: [row({ id: "camp_9" })], total: 1, counts: counts({ DRAFT: 1 }) });
    const html = await renderList();
    expect(html).toContain('href="/admin/campagnes/camp_9"');
    expect(html).toContain('href="/admin/campagnes/nouvelle"');
    expect(html).toContain('href="/admin/campagnes?statut=brouillon"');
    expect(html).toContain('href="/admin/campagnes?statut=programmee"');
    expect(html).toContain('href="/admin/campagnes?statut=envoyee"');
  });

  it("sans campagne : un état vide utile avec le bouton de création", async () => {
    const html = await renderList();
    expect(text(html)).toContain("Aucune campagne pour l'instant");
    expect(text(html)).toContain("Un brouillon ne contacte personne");
    expect(html).toContain('href="/admin/campagnes/nouvelle"');
    expect(text(html)).toContain("Créer une campagne");
  });

  it("des filtres sans résultat : on le dit, avec le moyen de les retirer", async () => {
    const html = await renderList({ statut: "annulee", type: "annonce" });
    expect(text(html)).toContain("Aucune campagne pour ces filtres");
    expect(html).toContain('href="/admin/campagnes"');
    expect(text(html)).not.toContain("Aucune campagne pour l'instant");
  });

  it("les filtres de l'adresse sont traduits en codes, une valeur inconnue est ignorée", async () => {
    await renderList({ statut: "envoyee", type: "parrainage", page: "2" });
    expect(mocks.listCampaigns).toHaveBeenCalledWith({ status: "SENT", kind: "REFERRAL_OFFER", page: 2 });
    await renderList({ statut: "n'importe-quoi", type: "?", page: "abc" });
    expect(mocks.listCampaigns).toHaveBeenLastCalledWith({ status: undefined, kind: undefined, page: 1 });
  });

  it("les pastilles de filtre portent les comptes, et gardent l'autre filtre", async () => {
    mocks.listCampaigns.mockResolvedValue({ rows: [row()], total: 1, counts: counts({ DRAFT: 3, SENT: 9 }) });
    const html = await renderList({ type: "bonus" });
    expect(html).toContain('href="/admin/campagnes?type=bonus&amp;statut=brouillon"');
    expect(html).toContain('href="/admin/campagnes?type=bonus&amp;statut=envoyee"');
    expect(text(html)).toMatch(/Toutes 12/);
  });

  it("pagine : page suivante tant qu'il en reste, page précédente après la première", async () => {
    mocks.listCampaigns.mockResolvedValue({ rows: [row()], total: 45, counts: counts({ DRAFT: 45 }) });
    const first = await renderList();
    expect(first).toContain('href="/admin/campagnes?page=2"');
    expect(first).not.toContain("Précédentes");
    expect(text(first)).toContain("Page 1 sur 3");
    const last = await renderList({ page: "3" });
    expect(last).not.toContain("Suivantes");
    expect(last).toContain('href="/admin/campagnes?page=2"');
    expect(text(last)).toContain("Page 3 sur 3");
  });

  it("la messagerie non configurée est dite en haut de page ; configurée, elle ne l'est pas", async () => {
    expect(text(await renderList())).toContain("Messagerie non configurée : les envois seront simulés");
    mocks.capability.value = "LIVE";
    expect(text(await renderList())).not.toContain("Messagerie non configurée");
  });

  it("si les campagnes ne se chargent pas, l'erreur est lisible et aucun chiffre n'est inventé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.listCampaigns.mockRejectedValue(new Error("Connexion à la base impossible"));
    const html = text(await renderList());
    expect(html).toContain("Les campagnes n'ont pas pu être chargées");
    expect(html).toContain("Connexion à la base impossible");
    expect(html).toContain("Liste indisponible");
    expect(html).toMatch(/Envoyées —/);
    expect(html).toMatch(/Brouillons —/);
    expect(html).not.toMatch(/Brouillons 0/);
  });
});

// ---------------------------------------------------------------- Fiche

describe("la fiche d'une campagne", () => {
  it("exige une session et rend 404 pour une campagne inconnue", async () => {
    mocks.loadCampaign.mockResolvedValue(null);
    await expect(renderDetail({}, "inconnue")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requirePlatformSession).toHaveBeenCalled();
    expect(mocks.loadCampaign).toHaveBeenCalledWith("inconnue");
  });

  it("un brouillon : les gestes d'un brouillon, des compteurs « — », et ce que l'envoi toucherait aujourd'hui", async () => {
    const html = text(await renderDetail());
    for (const label of ["Modifier", "Envoyer maintenant", "Programmer l'envoi", "Supprimer le brouillon"]) expect(html).toContain(label);
    expect(html).not.toContain("Reprendre l'envoi");
    expect(html).not.toContain("Annuler la campagne");
    expect(html).toMatch(/Envoyés — /);
    expect(html).toMatch(/Simulés — /);
    expect(html).toMatch(/Échecs — /);
    expect(html).toContain("Si l'envoi partait maintenant : 42 destinataires");
    expect(html).toContain("écartés : 2 désinscrits des offres, 1 doublon d'adresse");
    expect(html).toContain("Brouillon");
  });

  it("l'offre bonus dit que l'application est manuelle ; le message est celui qui est enregistré", async () => {
    const html = text(await renderDetail());
    expect(html).toContain("Application manuelle par l'équipe");
    expect(html).toContain("20 € de bonus");
    expect(html).toContain("Offre réservée aux officines abonnées.");
    expect(html).toContain("Un bonus pour {{officine}}");
    expect(html).toContain("les variables entre doubles accolades sont remplacées");
  });

  it("une campagne de parrainage non envoyée dit que l'offre sera créée à l'envoi", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ kind: "REFERRAL_OFFER", name: "Parrainage", offerAmountCents: 2000 }));
    const html = text(await renderDetail());
    expect(html).toContain("sera créée au moment de l'envoi");
    expect(html).toContain("20 € par filleul et par mois");
  });

  it("une campagne envoyée : ni geste, ni compteur inventé ; envoyés, simulés, échecs et ignorés sont distincts", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENT", recipientCount: 15, sentCount: 12, failedCount: 1, skippedCount: 2, startedAt: new Date("2026-10-02T08:15:00Z"), completedAt: new Date("2026-10-02T08:16:00Z") }));
    mocks.listCampaignRecipients.mockResolvedValue({
      rows: [recipientRow(), recipientRow({ id: "r2", name: "Pharmacie du Port", status: "FAILED", detail: "Adresse rejetée", sentAt: null })],
      total: 15,
      counts: recipientCounts({ SENT: 12, FAILED: 1, SKIPPED: 2 }),
    });
    const html = text(await renderDetail());
    expect(html).toMatch(/Destinataires 15 /);
    expect(html).toMatch(/Envoyés 12 /);
    expect(html).toMatch(/Simulés 0 /);
    expect(html).toMatch(/Échecs 1 /);
    expect(html).toMatch(/Ignorés 2 /);
    expect(html).toContain("Pharmacie du Port");
    expect(html).toContain("Adresse rejetée");
    expect(html).toContain("Envoyée");
    for (const gesture of ["Envoyer maintenant", "Reprendre l'envoi", "Annuler la campagne", "Supprimer le brouillon", "Programmer l'envoi"]) expect(html).not.toContain(gesture);
  });

  it("un envoi simulé est dit simulé : état, alerte, compteurs et lignes", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ kind: "ANNOUNCEMENT", status: "SENT", simulated: true, recipientCount: 5, sentCount: 5, startedAt: new Date("2026-10-02T08:15:00Z"), completedAt: new Date("2026-10-02T08:16:00Z"), offerAmountCents: null, offerEndsAt: null, offerConditions: null }));
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [recipientRow({ status: "SIMULATED", sentAt: null })], total: 5, counts: recipientCounts({ SIMULATED: 5 }) });
    const html = text(await renderDetail());
    expect(html).toContain("Envoi simulé : aucun e-mail n'est parti");
    expect(html).toContain("Simulée");
    expect(html).toMatch(/Envoyés 0 /);
    expect(html).toMatch(/Simulés 5 /);
    expect(html).toContain("Simulé, non parti");
    expect(html).not.toContain("Envoyée");
  });

  it("un bonus envoyé : la liste « à appliquer par l'équipe » nomme les officines, avec le montant et les conditions", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENT", recipientCount: 2, sentCount: 2, startedAt: new Date("2026-10-02T08:15:00Z"), completedAt: new Date("2026-10-02T08:16:00Z") }));
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [], total: 2, counts: recipientCounts({ SENT: 2 }) });
    mocks.loadBonusRecipients.mockResolvedValue({ rows: [{ id: "r1", pharmacyId: "ph_1", name: "Pharmacie Martin" }, { id: "r2", pharmacyId: "ph_2", name: "Pharmacie du Port" }], truncated: false });
    const html = await renderDetail();
    const readable = text(html);
    expect(readable).toContain("À appliquer par l'équipe");
    expect(readable).toContain("Aucun crédit automatique n'existe");
    expect(readable).toContain("20 € de bonus");
    expect(readable).toContain("Offre réservée aux officines abonnées.");
    expect(readable).toContain("2 officines à qui le message est réellement parti");
    expect(html).toContain('href="/admin/pharmacies/ph_1"');
    expect(readable).toContain("Pharmacie du Port");
  });

  it("un bonus simulé : rien à appliquer, et on le dit", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENT", simulated: true, recipientCount: 3, sentCount: 3, startedAt: new Date("2026-10-02T08:15:00Z"), completedAt: new Date("2026-10-02T08:16:00Z") }));
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [], total: 3, counts: recipientCounts({ SIMULATED: 3 }) });
    const html = text(await renderDetail());
    expect(html).toContain("Aucune officine n'a reçu le message : il n'y a rien à appliquer");
    expect(html).toContain("3 destinataires ont reçu un message simulé");
  });

  it("une campagne en cours : reprendre et annuler, avec l'avancement", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENDING", recipientCount: 100, sentCount: 40, failedCount: 2, startedAt: new Date("2026-10-02T08:15:00Z") }));
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [], total: 100, counts: recipientCounts({ SENT: 40, FAILED: 2, PENDING: 58 }) });
    const html = text(await renderDetail());
    expect(html).toContain("Reprendre l'envoi");
    expect(html).toContain("Annuler la campagne");
    expect(html).toContain("Envoi en cours");
    expect(html).toContain("42 destinataires traités sur 100");
    expect(html).not.toContain("Supprimer le brouillon");
    expect(html).not.toContain("Envoyer maintenant");
  });

  it("une campagne programmée : retirer la programmation, changer le jour, annuler ; la phrase dit au passage quotidien", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SCHEDULED", recipientCount: 42, scheduledFor: new Date("2036-10-19T22:00:00Z") }));
    const html = text(await renderDetail());
    for (const label of ["Annuler la programmation", "Changer le jour", "Annuler la campagne", "Envoyer maintenant", "Modifier"]) expect(html).toContain(label);
    expect(html).toContain("au passage quotidien du matin (heure de Paris)");
    expect(html).toContain("Nombre de destinataires confirmé : 42");
    expect(html).not.toContain("Supprimer le brouillon");
  });

  it("une campagne annulée : on le dit, sans geste, et l'offre de parrainage liée est arrêtée", async () => {
    mocks.loadCampaign.mockResolvedValue(
      full({
        kind: "REFERRAL_OFFER",
        status: "CANCELED",
        canceledAt: new Date("2026-10-04T10:00:00Z"),
        startedAt: new Date("2026-10-02T08:15:00Z"),
        recipientCount: 10,
        referralOffer: { id: "o1", amountCents: 2000, startsAt: new Date("2026-10-02T08:15:00Z"), endsAt: new Date("2026-10-31T22:59:59.999Z"), canceledAt: new Date("2026-10-04T10:00:00Z") },
      }),
    );
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [], total: 10, counts: recipientCounts({ SENT: 4, SKIPPED: 6 }) });
    const html = text(await renderDetail());
    expect(html).toContain("Campagne annulée");
    expect(html).toContain("Offre de parrainage liée");
    expect(html).toContain("Arrêtée");
    expect(html).toContain("gardent ce montant");
    expect(html).not.toContain("Annuler la campagne");
  });

  it("l'offre de parrainage liée en cours est décrite avec ses dates", async () => {
    mocks.loadCampaign.mockResolvedValue(
      full({ kind: "REFERRAL_OFFER", status: "SENT", startedAt: new Date("2026-10-02T08:15:00Z"), completedAt: new Date("2036-10-02T08:16:00Z"), recipientCount: 3, referralOffer: { id: "o1", amountCents: 2000, startsAt: new Date("2026-10-02T08:15:00Z"), endsAt: new Date("2036-10-31T22:59:59.999Z"), canceledAt: null } }),
    );
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [], total: 3, counts: recipientCounts({ SENT: 3 }) });
    const html = text(await renderDetail());
    expect(html).toContain("Offre de parrainage liée");
    expect(html).toContain("En cours");
    expect(html).toContain("Montant par filleul et par mois 20 €");
  });

  it("le filtre de statut des destinataires est traduit en code, avec la page", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENT", recipientCount: 100, startedAt: new Date("2026-10-02T08:15:00Z") }));
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [recipientRow()], total: 120, counts: recipientCounts({ SENT: 100, FAILED: 20 }) });
    const html = await renderDetail({ statut: "echec", page: "2" });
    expect(mocks.listCampaignRecipients).toHaveBeenCalledWith("camp_1", { status: "FAILED", page: 2 });
    expect(html).toContain('href="/admin/campagnes/camp_1?statut=envoye"');
    expect(text(html)).toContain("Page 2 sur 3");
    expect(html).toContain('href="/admin/campagnes/camp_1?statut=echec&amp;page=3#destinataires"');
  });

  it("un filtre sans destinataire a son état vide", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENT", recipientCount: 5, startedAt: new Date("2026-10-02T08:15:00Z") }));
    mocks.listCampaignRecipients.mockResolvedValue({ rows: [], total: 0, counts: recipientCounts({ SENT: 5 }) });
    expect(text(await renderDetail({ statut: "echec" }))).toContain("Aucun destinataire pour ce filtre");
  });

  it("si les destinataires ne se chargent pas, l'erreur est dite et les compteurs restent « — »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENT", recipientCount: 5, sentCount: 5, startedAt: new Date("2026-10-02T08:15:00Z") }));
    mocks.listCampaignRecipients.mockRejectedValue(new Error("Base indisponible"));
    const html = text(await renderDetail());
    expect(html).toContain("Les destinataires n'ont pas pu être chargés");
    expect(html).toContain("Base indisponible");
    expect(html).toMatch(/Envoyés — /);
  });

  it("les pages qui hébergent l'envoi, sa reprise et la programmation durent 60 secondes", () => {
    expect(detail.maxDuration).toBe(60);
    expect(create.maxDuration).toBe(60);
    expect(edit.maxDuration).toBe(60);
  });
});

// ---------------------------------------------------------------- Assistant

describe("l'assistant, à l'ouverture", () => {
  const props = { params: Promise.resolve({ id: "camp_1" }), searchParams: Promise.resolve({}) };

  it("exige une session et pose d'abord la première question : le type, quatre cartes aux vraies descriptions", async () => {
    const html = await renderPage(create.default, {});
    const readable = text(html);
    expect(mocks.requirePlatformSession).toHaveBeenCalled();
    expect(readable).toContain("Nouvelle campagne");
    expect(readable).toContain("Quelle campagne voulez-vous envoyer ?");
    for (const definition of Object.values(CAMPAIGN_KINDS)) {
      expect(readable).toContain(definition.label);
      expect(readable).toContain(definition.description);
    }
    expect(html.match(/name="campaign-kind"/g)).toHaveLength(4);
    // Une seule question à la fois : ni nom, ni destinataires, ni message à ce stade.
    expect(readable).not.toContain("Nom de la campagne");
    expect(readable).not.toContain("À qui écrire ?");
  });

  it("les étapes sont annoncées, l'offre n'y figure pas tant qu'un type à montant n'est pas choisi", async () => {
    const readable = text(await renderPage(create.default, {}));
    for (const label of ["Type", "Destinataires", "Message", "Envoi"]) expect(readable).toContain(label);
    expect(readable).not.toMatch(/\b4 Offre\b/);
  });

  it("on ne peut pas continuer sans type, et on dit pourquoi ; le brouillon n'est pas encore enregistré", async () => {
    const html = await renderPage(create.default, {});
    expect(text(html)).toContain("Pour continuer : Choisissez un type de campagne.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Continuer/);
    expect(text(html)).toContain("Pas encore enregistré");
  });

  it("passe les officines et partenaires à choisir, bornés, à l'assistant", async () => {
    await renderPage(create.default, {});
    expect(mocks.loadSelectionOptions).toHaveBeenCalledWith({ pharmacyIds: [], partnerIds: [] });
  });

  it("modifier un brouillon : le type et le nom enregistrés reviennent, avec les étapes du type", async () => {
    const html = await renderPage(edit.default, props);
    const readable = text(html);
    expect(readable).toContain("Modifier la campagne");
    expect(html).toMatch(/name="campaign-kind" checked="" value="BONUS_OFFER"/);
    expect(html).toContain('value="Bonus d&#x27;automne"');
    expect(readable).toContain("Offre");
    expect(readable).toContain("Brouillon enregistré");
    expect(mocks.loadSelectionOptions).toHaveBeenCalledWith({ pharmacyIds: [], partnerIds: [] });
  });

  it("modifier une campagne à public choisi charge ces officines, même hors liste", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ audience: "pharmacies.selected", audienceParams: { pharmacyIds: ["ph_9"] } }));
    await renderPage(edit.default, props);
    expect(mocks.loadSelectionOptions).toHaveBeenCalledWith({ pharmacyIds: ["ph_9"], partnerIds: [] });
  });

  it("une campagne programmée prévient que l'enregistrer la ramène au brouillon", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SCHEDULED", recipientCount: 42, scheduledFor: new Date("2026-10-19T22:00:00Z") }));
    const readable = text(await renderPage(edit.default, props));
    expect(readable).toContain("Cette campagne est programmée");
    expect(readable).toContain("la ramène au brouillon");
    expect(readable).toContain("20/10/2026");
  });

  it("une campagne partie, terminée ou annulée ne se modifie plus : on le dit, sans assistant", async () => {
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENT", startedAt: new Date("2026-10-02T08:15:00Z") }));
    const html = await renderPage(edit.default, props);
    expect(text(html)).toContain("Cette campagne n'est plus modifiable : envoyée");
    expect(html).toContain('href="/admin/campagnes/camp_1"');
    expect(html).not.toContain("campaign-kind");
    mocks.loadCampaign.mockResolvedValue(full({ status: "SENDING" }));
    expect(text(await renderPage(edit.default, props))).toContain("n'est plus modifiable");
  });

  it("une campagne inconnue : 404", async () => {
    mocks.loadCampaign.mockResolvedValue(null);
    await expect(renderPage(edit.default, props)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// ---------------------------------------------------------------- Étapes

const state = (overrides: Record<string, unknown> = {}) => ({
  kind: "BONUS_OFFER",
  name: "Bonus",
  audience: "pharmacies.all_active",
  pharmacyIds: [] as string[],
  partnerIds: [] as string[],
  subject: "Objet",
  title: "Titre",
  body: "Bonjour {{prenom}}, ceci est un texte.",
  buttonLabel: "",
  buttonTarget: "",
  alsoInApp: false,
  amount: "",
  endsOn: "",
  conditions: "",
  ...overrides,
});

const renderStep = (component: unknown, props: Props) => renderToStaticMarkup(createElement(component as never, props as never));
const noop = () => undefined;

describe("l'étape « destinataires »", () => {
  const base = { state: state(), pharmacies: [{ id: "ph_1", name: "Pharmacie Martin", city: "Lyon" }], partners: [{ id: "pa_1", name: "Laboratoire Exemple" }], truncated: { pharmacies: false, partners: false }, onSelectAudience: noop, onSelection: noop };

  it("ne propose que les publics du côté du type, avec leur description", () => {
    const readable = text(renderStep(steps.AudienceStep, { ...base, view: { status: "idle", reason: "Choisissez un public." } }));
    expect(readable).toContain("Toutes les officines actives");
    expect(readable).toContain("Officines en essai");
    expect(readable).not.toContain("Contacts des partenaires");
    expect(readable).toContain("sont écartées");
  });

  it("montre le nombre calculé par le serveur, ce qui est écarté, et un échantillon aux adresses masquées", () => {
    const view = { status: "ok", count: 42, excluded: { optedOut: 2, noEmail: 1, duplicates: 0 }, sample: [{ name: "Pharmacie Martin", emailMasked: "t***@martin.test" }] };
    const readable = text(renderStep(steps.AudienceStep, { ...base, view }));
    expect(readable).toContain("Destinataires 42");
    expect(readable).toContain("Écartés : 2 désinscrits des offres, 1 sans adresse e-mail.");
    expect(readable).toContain("Échantillon (adresses masquées)");
    expect(readable).toContain("t***@martin.test");
    expect(readable).not.toContain("titulaire@martin.test");
  });

  it("au-delà de 2 000 destinataires, le refus est visible ; à zéro, on le dit aussi", () => {
    const tooMany = text(renderStep(steps.AudienceStep, { ...base, view: { status: "ok", count: 2500, excluded: { optedOut: 0, noEmail: 0, duplicates: 0 }, sample: [] } }));
    expect(tooMany).toContain("Trop de destinataires : l'envoi sera refusé");
    expect(tooMany).toContain("au plus 2 000 destinataires");
    const empty = text(renderStep(steps.AudienceStep, { ...base, view: { status: "ok", count: 0, excluded: { optedOut: 3, noEmail: 0, duplicates: 0 }, sample: [] } }));
    expect(empty).toContain("Aucun destinataire");
  });

  it("une erreur de calcul est dite, jamais remplacée par un nombre", () => {
    const readable = text(renderStep(steps.AudienceStep, { ...base, view: { status: "error", message: "Service indisponible" } }));
    expect(readable).toContain("Nombre de destinataires indisponible");
    expect(readable).toContain("Service indisponible");
  });

  it("un public choisi à la main ouvre la sélection : recherche, liste bornée, et ce qui est déjà choisi", () => {
    const html = renderStep(steps.AudienceStep, { ...base, state: state({ audience: "pharmacies.selected", pharmacyIds: ["ph_1"] }), view: { status: "loading" } });
    const readable = text(html);
    expect(html).toContain('aria-label="Rechercher parmi les officines"');
    expect(readable).toContain("Pharmacie Martin");
    expect(readable).toContain("Lyon");
    expect(readable).toContain("1 choisi");
    expect(html).toContain('aria-label="Retirer Pharmacie Martin"');
    expect(readable).toContain("Calcul du nombre de destinataires");
  });

  it("les partenaires se choisissent aussi à la main, côté partenaires", () => {
    const html = renderStep(steps.AudienceStep, { ...base, state: state({ kind: "PARTNER_INVITATION", audience: "partners.selected" }), view: { status: "idle", reason: "Choisissez au moins un partenaire pour voir le nombre de destinataires." } });
    expect(html).toContain('aria-label="Rechercher parmi les partenaires"');
    expect(text(html)).toContain("Laboratoire Exemple");
    expect(text(html)).toContain("Aucune partenaire choisie");
  });
});

describe("l'étape « message »", () => {
  const preview = { ok: true, subject: "Un bonus pour Pharmacie de la Passerelle", html: "<p>Bonjour Camille</p>" };

  it("liste les variables du côté, insérables, et la case « aussi dans l'application » côté officines seulement", () => {
    const html = renderStep(steps.MessageStep, { state: state(), onChange: noop, blockedReason: null, preview });
    const readable = text(html);
    for (const variable of ["{{prenom}}", "{{officine}}", "{{montant_offre}}", "{{date_fin_offre}}", "{{conditions_offre}}"]) expect(readable).toContain(variable);
    expect(readable).toContain("Aussi dans l'application");
    expect(readable).toContain("jamais pour un envoi simulé");
    expect(readable).toContain("Laissez vide pour un message sans bouton");
  });

  it("une annonce n'a pas de variable d'offre, un partenaire n'a pas de notification dans l'application", () => {
    const announcement = text(renderStep(steps.MessageStep, { state: state({ kind: "ANNOUNCEMENT" }), onChange: noop, blockedReason: null, preview }));
    expect(announcement).toContain("{{prenom}}");
    expect(announcement).not.toContain("{{montant_offre}}");
    const partner = text(renderStep(steps.MessageStep, { state: state({ kind: "PARTNER_INVITATION", audience: "partners.without_brand" }), onChange: noop, blockedReason: null, preview }));
    expect(partner).toContain("{{nom_partenaire}}");
    expect(partner).toContain("{{lien_candidature}}");
    expect(partner).not.toContain("{{officine}}");
    expect(partner).not.toContain("Aussi dans l'application");
    expect(partner).toContain("Le formulaire de candidature des partenaires");
  });

  it("l'aperçu est rendu par le serveur dans un cadre isolé, et dit que les valeurs sont des exemples", () => {
    const html = renderStep(steps.MessageStep, { state: state(), onChange: noop, blockedReason: null, preview });
    expect(html).toMatch(/<iframe[^>]*sandbox=""/);
    expect(html).toContain('title="Aperçu du message"');
    expect(text(html)).toContain("Objet : Un bonus pour Pharmacie de la Passerelle");
    expect(text(html)).toContain("Valeurs d'exemple");
    // Le contenu du serveur n'est jamais injecté dans la page elle-même.
    expect(html).not.toContain("<p>Bonjour Camille</p>");
  });

  it("sans aperçu possible, la raison est dite ; un refus du serveur aussi", () => {
    const blocked = text(renderStep(steps.MessageStep, { state: state(), onChange: noop, blockedReason: "L'aperçu s'affichera quand l'offre sera renseignée", preview: null }));
    expect(blocked).toContain("L'aperçu s'affichera quand l'offre sera renseignée");
    expect(blocked).not.toContain("<iframe");
    const refused = text(renderStep(steps.MessageStep, { state: state(), onChange: noop, blockedReason: null, preview: { ok: false, error: "Variable inconnue pour ce public : {{truc}}." } }));
    expect(refused).toContain("Aperçu indisponible");
    expect(refused).toContain("Variable inconnue pour ce public");
    const loading = text(renderStep(steps.MessageStep, { state: state(), onChange: noop, blockedReason: null, preview: null }));
    expect(loading).toContain("Préparation de l'aperçu");
  });
});

describe("l'étape « offre »", () => {
  const base = { amountError: null, endsError: null, warnings: [] as string[], activeOffer: null, blockedReason: null, preview: null, nowIso: "2026-10-05T09:00:00.000Z", onChange: noop };

  it("parrainage : le montant est réellement appliqué, les filleuls déjà inscrits gardent le leur, les bornes sont dites", () => {
    const readable = text(renderStep(steps.OfferStep, { ...base, state: state({ kind: "REFERRAL_OFFER", amount: "20" }) }));
    expect(readable).toContain("Ce montant est réellement appliqué");
    expect(readable).toContain("Les filleuls déjà inscrits gardent leur montant");
    expect(readable).toContain("En euros, entre 1 € et 500 €");
    expect(readable).toContain("Montant par filleul et par mois");
    expect(readable).not.toContain("Application manuelle");
  });

  it("bonus : l'application est manuelle, dite en toutes lettres, avec les bornes du bonus", () => {
    const readable = text(renderStep(steps.OfferStep, { ...base, state: state() }));
    expect(readable).toContain("Application manuelle par l'équipe");
    expect(readable).toContain("aucun crédit automatique n'existe");
    expect(readable).toContain("En euros, entre 1 € et 2 000 €");
    expect(readable).not.toContain("Ce montant est réellement appliqué");
  });

  it("signale une offre de parrainage déjà en cours, et ce qui se passe à l'envoi", () => {
    const readable = text(renderStep(steps.OfferStep, { ...base, state: state({ kind: "REFERRAL_OFFER" }), activeOffer: { label: "Parrainage à 15 € par filleul et par mois jusqu'au 31/10/2026", amountCents: 1500, endsAt: "2026-10-31T22:59:59.999Z" } }));
    expect(readable).toContain("Une offre de parrainage est déjà en cours");
    expect(readable).toContain("15 € par filleul et par mois, jusqu'au 31/10/2026");
    expect(readable).toContain("la plus récente l'emporte");
    // Un bonus n'a rien à voir avec une offre de parrainage en cours.
    expect(text(renderStep(steps.OfferStep, { ...base, state: state(), activeOffer: { label: "x", amountCents: 1500, endsAt: null } }))).not.toContain("déjà en cours");
  });

  it("affiche l'erreur du montant, de la date, et les avertissements du domaine", () => {
    const readable = text(renderStep(steps.OfferStep, { ...base, state: state({ amount: "0,5" }), amountError: "Le montant doit être compris entre 1 € et 2 000 €.", endsError: "La date de fin ne peut pas être passée.", warnings: ["Le message ne mentionne pas le montant de l'offre : écrivez {{montant_offre}}."] }));
    expect(readable).toContain("Le montant doit être compris entre 1 € et 2 000 €.");
    expect(readable).toContain("La date de fin ne peut pas être passée.");
    expect(readable).toContain("À vérifier");
    expect(readable).toContain("écrivez {{montant_offre}}");
  });
});

describe("le récapitulatif", () => {
  it("dit le type, le public et son nombre, l'offre en toutes lettres, la fin, la notification", () => {
    const readable = text(renderStep(steps.RecapFacts, { state: state({ amount: "12,50", endsOn: "2026-10-31", buttonLabel: "Ouvrir mon espace", buttonTarget: "espace", alsoInApp: true }), count: 42 }));
    expect(readable).toContain("Offre bonus");
    expect(readable).toContain("Toutes les officines actives");
    expect(readable).toContain("42 destinataires aujourd'hui");
    expect(readable).toContain("12,50 € de bonus");
    expect(readable).toContain("jusqu'au 31/10/2026");
    expect(readable).toContain("« Ouvrir mon espace » (mène à : L'espace PharmaBoost de l'officine)");
    expect(readable).toContain("Notification dans l'application Oui");
  });

  it("sans nombre calculé, il n'en invente pas", () => {
    const readable = text(renderStep(steps.RecapFacts, { state: state({ amount: "20" }), count: null }));
    expect(readable).not.toContain("destinataires aujourd'hui");
  });
});

describe("l'aperçu isolé", () => {
  it("n'injecte jamais le HTML du serveur dans la page : il vit dans un cadre sans aucun droit", () => {
    const html = renderStep(previewPane.PreviewPane, { blockedReason: null, result: { ok: true, subject: "S", html: "<script>alert(1)</script>" } });
    expect(html).toMatch(/sandbox=""/);
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
