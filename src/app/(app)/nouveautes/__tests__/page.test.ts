import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page « Nouveautés », rendue côté serveur sans navigateur ni base : ce que
 * voit le titulaire avant de toucher quoi que ce soit. Les services sont
 * remplacés ; on vérifie l'accès, l'isolation par la session, les états vides,
 * les raisons des boutons grisés et l'honnêteté de l'historique.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getNewsOverview: vi.fn(),
  pharmacyFind: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/patient-news", () => ({ getNewsOverview: mocks.getNewsOverview }));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacy: { findUnique: mocks.pharmacyFind } } }));
vi.mock("@/server/actions/patient-news", () => ({
  previewAnnouncementAction: vi.fn(),
  sendAnnouncementAction: vi.fn(),
  sendAnnouncementTestAction: vi.fn(),
  resumeAnnouncementAction: vi.fn(),
  setPatientNewsEnabledAction: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const page = await import("../page");

const SESSION = { scope: { pharmacyId: "ph_a", organizationId: "org_1", userId: "user_a" }, pharmacy: { name: "Pharmacie Saint-Michel" }, user: { email: "titulaire@pharma.ai" } };

const OVERVIEW = {
  enabled: true,
  activeCount: 12,
  messagingLive: true,
  lastAnnouncementAt: null,
  nextAllowedAt: null,
  announcements: [] as Record<string, unknown>[],
  rangeSuggestions: [{ laboratory: "Avène", rangeName: "Cicalfate" }],
};

const announcement = (overrides: Record<string, unknown> = {}) => ({ id: "ann_1", title: "Une nouvelle gamme", rangeLabel: "Gamme Solaire", status: "SENT", recipientCount: 12, sentCount: 12, failedCount: 0, simulated: false, createdAt: new Date("2026-09-20T09:30:00Z"), ...overrides });

const render = async () => renderToStaticMarkup((await page.default()) as React.ReactElement);
// Le HTML échappe l'apostrophe : on compare le texte que lit le titulaire.
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
/** Le bouton dont le libellé est donné, avec son état. */
const button = (html: string, label: string) => {
  const match = new RegExp(`<button([^>]*)>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`, "s").exec(html);
  return match ? { disabled: /\sdisabled(=|\s|>)/.test(match[1]) } : null;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(SESSION);
  mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, announcements: [] });
  mocks.pharmacyFind.mockResolvedValue({ isDemo: false });
});

describe("l'accès et l'isolation", () => {
  it("exige la permission d'annoncer aux patients, avant toute lecture", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_FORBIDDEN"));
    await expect(render()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(mocks.requirePermission).toHaveBeenCalledWith("news:manage");
    expect(mocks.getNewsOverview).not.toHaveBeenCalled();
    expect(mocks.pharmacyFind).not.toHaveBeenCalled();
  });

  it("lit l'officine de la SESSION, jamais celle de l'adresse", async () => {
    await render();
    expect(mocks.getNewsOverview).toHaveBeenCalledWith(SESSION.scope);
    expect(mocks.pharmacyFind).toHaveBeenCalledWith({ where: { id: "ph_a" }, select: { isDemo: true } });
  });

  it("déclare la durée d'un envoi à l'hébergeur : il peut durer jusqu'à 45 secondes", () => {
    expect(page.maxDuration).toBe(60);
  });
});

describe("le contenu de l'écran", () => {
  it("l'en-tête, le nombre d'abonnés (le nombre seul) et l'interrupteur", async () => {
    const html = await render();
    const shown = text(html);
    expect(shown).toContain("Nouveautés pour vos patients");
    expect(shown).toContain("Abonnés actifs 12");
    expect(shown).toContain("Seul le nombre est affiché : vous ne voyez jamais leurs adresses.");
    expect(html).toMatch(/<input[^>]*id="news-enabled"[^>]*checked/);
    expect(shown).toContain("Proposer l'abonnement dans l'e-mail du plan");
  });

  it("explique le parcours du patient tel qu'il est : lien facultatif, clic, désinscription, adresse chiffrée 36 mois, aucun lien avec le plan", async () => {
    const shown = text(await render());
    expect(shown).toContain("lien facultatif");
    expect(shown).toContain("Il n'est abonné que s'il clique sur ce lien, puis confirme. Ouvrir l'e-mail ne suffit pas.");
    expect(shown).toContain("Il se désinscrit en un clic, sans compte");
    expect(shown).toContain("Son adresse est chiffrée et conservée 36 mois au plus après son accord, puis supprimée.");
    expect(shown).toContain("Elle n'est reliée ni à son plan, ni à son ordonnance, ni à son traitement.");
  });

  it("aucune adresse, aucune liste d'abonnés : la page ne reçoit que des comptes (la seule adresse montrée est celle du titulaire, pour son test)", async () => {
    const html = (await render()).replace("titulaire@pharma.ai", "");
    expect(html).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
  });

  it("le composeur : objet, gamme et message avec leurs limites, rappel des règles, aperçu et boutons", async () => {
    const html = await render();
    const shown = text(html);
    expect(shown).toContain("0 / 90");
    expect(shown).toContain("0 / 80");
    expect(shown).toContain("0 / 600");
    expect(shown).toContain("Ce qu'une annonce ne peut pas contenir");
    expect(shown).toContain("Aucun médicament sur ordonnance");
    expect(shown).toContain("Aucun lien, aucune adresse e-mail");
    expect(shown).toContain("Aucune donnée de santé");
    expect(shown).toContain("L'aperçu apparaît dès que vous avez écrit un objet et un message.");
    expect(html).toContain('list="news-range-options"');
    expect(html).toContain('<option value="Cicalfate (Avène)"');
    expect(button(html, "M&#x27;envoyer un test")).toEqual({ disabled: true });
  });

  it("le test part à l'adresse de l'utilisateur connecté, et ce n'est pas caché", async () => {
    expect(text(await render())).toContain("Le test part à titulaire@pharma.ai, et à cette adresse seule.");
  });
});

describe("l'envoi aux abonnés : désactivé, avec la raison dite", () => {
  it("texte vide : grisé, et ce qui manque est dit", async () => {
    const html = await render();
    expect(button(html, "Envoyer à 12 abonnés")).toEqual({ disabled: true });
    expect(text(html)).toContain("Donnez un objet à l'annonce.");
  });

  it("aucun abonné : grisé, état vide explicite, et le bouton ne dit pas « 0 »", async () => {
    mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, activeCount: 0 });
    const html = await render();
    const shown = text(html);
    expect(shown).toContain("Abonnés actifs 0");
    expect(shown).toContain("Personne ne s'est abonné pour l'instant.");
    expect(shown).toContain("Aucun patient n'est abonné pour l'instant : il n'y a personne à qui écrire.");
    expect(button(html, "Envoyer aux abonnés")).toEqual({ disabled: true });
    expect(shown).not.toContain("Envoyer à 0");
  });

  it("fonction coupée : grisé, la raison est dite, l'interrupteur est décoché et ses conséquences sont dites", async () => {
    mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, enabled: false });
    const html = await render();
    expect(html).not.toMatch(/<input[^>]*id="news-enabled"[^>]*checked/);
    const shown = text(html);
    expect(shown).toContain("Les nouveautés sont désactivées : réactivez l'abonnement dans l'e-mail du plan pour pouvoir envoyer une annonce.");
    expect(shown).toContain("les liens déjà envoyés ne fonctionnent plus et aucune annonce ne peut partir. Vos abonnés actuels restent abonnés.");
  });

  it("une annonce est déjà partie : grisé, avec la date et l'heure du prochain envoi possible", async () => {
    mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, nextAllowedAt: new Date("2026-10-12T14:30:00Z") });
    expect(text(await render())).toContain("Une annonce est déjà partie cette semaine : la prochaine sera possible le 12 octobre 2026 à 16:30.");
  });
});

describe("la messagerie", () => {
  it("active : dit simplement que les envois partent", async () => {
    const html = await render();
    expect(text(html)).toContain("Messagerie active");
    expect(text(html)).not.toContain("simulés");
  });

  it("non configurée : l'envoi serait simulé, c'est dit clairement, et rien n'est bloqué", async () => {
    mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, messagingLive: false });
    const html = await render();
    const shown = text(html);
    expect(shown).toContain("La messagerie n'est pas configurée : les envois sont simulés");
    expect(shown).toContain("Aucun message ne part, ni vers vos abonnés ni vers vous.");
    expect(shown).toContain("Envoi simulé");
    expect(html).toContain('href="/parametres?onglet=moteur"');
    // Pas bloquant : le seul obstacle d'envoi reste ceux du texte (ici, un texte vide).
    expect(shown).not.toContain("Une annonce est déjà partie");
  });
});

describe("l'officine de démonstration", () => {
  it("dit que le lien d'abonnement n'est pas proposé aux patients d'une officine fictive", async () => {
    mocks.pharmacyFind.mockResolvedValue({ isDemo: true });
    expect(text(await render())).toContain("Le lien d'abonnement n'est pas proposé aux patients d'une officine de démonstration");
  });

  it("une officine réelle n'a pas cette mention", async () => {
    expect(text(await render())).not.toContain("officine de démonstration");
  });
});

describe("l'historique des annonces", () => {
  it("aucune annonce : un état vide explicite", async () => {
    const shown = text(await render());
    expect(shown).toContain("Aucune annonce pour l'instant");
    expect(shown).toContain("Quand vous en enverrez une, elle apparaîtra ici");
  });

  it("une annonce envoyée : objet, gamme, date, pastille « Envoyée », remis et échecs ; aucun bouton de reprise", async () => {
    mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, announcements: [announcement({ sentCount: 11, failedCount: 1, status: "SENT" })] });
    const html = await render();
    const shown = text(html);
    expect(shown).toContain("Une nouvelle gamme");
    expect(shown).toContain("Gamme : Gamme Solaire");
    expect(shown).toContain("20/09/2026 11:30");
    expect(shown).toContain("Envoyée");
    expect(shown).toContain("11 remis · 1 échec");
    expect(html).not.toContain("Reprendre l&#x27;envoi");
  });

  it("une annonce simulée n'est jamais « Envoyée » : « Simulée », « simulés », et aucun message n'est parti", async () => {
    mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, announcements: [announcement({ simulated: true, status: "SENT" })] });
    const shown = text(await render());
    expect(shown).toContain("Simulée");
    expect(shown).toContain("12 simulés · 0 échec · aucun message n'est parti");
    expect(shown).not.toContain("Envoyée");
    expect(shown).not.toContain("remis");
  });

  it("les quatre états ont leur pastille ; seule l'annonce en cours propose de reprendre l'envoi", async () => {
    mocks.getNewsOverview.mockResolvedValue({
      ...OVERVIEW,
      announcements: [
        announcement({ id: "a1", title: "Annonce en cours", status: "SENDING", recipientCount: 300, sentCount: 120, failedCount: 5 }),
        announcement({ id: "a2", title: "Annonce partielle", status: "PARTIAL", sentCount: 10, failedCount: 2 }),
        announcement({ id: "a3", title: "Annonce en échec", status: "FAILED", sentCount: 0, failedCount: 12 }),
        announcement({ id: "a4", title: "Annonce envoyée", status: "SENT" }),
      ],
    });
    const html = await render();
    const shown = text(html);
    for (const label of ["En cours", "Partielle", "Échec", "Envoyée"]) expect(shown).toContain(label);
    expect(shown).toContain("125 sur 300 traités");
    expect(html.match(/Reprendre l&#x27;envoi/g)).toHaveLength(1);
  });

  it("le titre d'une annonce est échappé", async () => {
    mocks.getNewsOverview.mockResolvedValue({ ...OVERVIEW, announcements: [announcement({ title: "<img src=x onerror=alert(1)>" })] });
    const html = await render();
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("l'état d'erreur", () => {
  it("un service qui échoue : un message lisible, aucun composeur, rien n'est présenté comme vide", async () => {
    mocks.getNewsOverview.mockRejectedValue(new Error("base indisponible"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = await render();
    const shown = text(html);
    expect(shown).toContain("Les nouveautés ne peuvent pas être affichées pour le moment");
    expect(shown).toContain("Rien n'a été envoyé ni modifié.");
    expect(shown).not.toContain("Abonnés actifs");
    expect(shown).not.toContain("Aucune annonce pour l'instant");
    expect(html).not.toContain("news-title");
    expect(shown).not.toContain("base indisponible");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
