import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page « Conseils » de la console, rendue côté serveur sans navigateur ni base : services simulés, session console simulée.
 * On lit le texte rendu. Et l'ancienne adresse « Suggestions du robot » qui y mène.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
  redirect: vi.fn(),
  listCentralRules: vi.fn(),
  listCentralAssociations: vi.fn(),
  loadEditHistory: vi.fn(),
  modifiedAssociations: vi.fn(),
  listRobotProposals: vi.fn(),
  robotOriginKeys: vi.fn(),
  listPreviewPharmacies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/conseils", useSearchParams: () => new URLSearchParams(), redirect: mocks.redirect }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/modal", () => ({ Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? createElement("div", null, children) : null) }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/actions/admin-central-advice", () => ({}));
vi.mock("@/server/actions/admin-robot-proposals", () => ({}));
vi.mock("@/server/services/central-advice", () => ({ listCentralRules: mocks.listCentralRules, listCentralAssociations: mocks.listCentralAssociations, loadEditHistory: mocks.loadEditHistory, modifiedAssociations: mocks.modifiedAssociations }));
vi.mock("@/server/services/robot-proposals", () => ({ listRobotProposals: mocks.listRobotProposals }));
vi.mock("@/server/services/advice-hub", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/advice-hub")>("@/server/services/advice-hub");
  return { ...actual, robotOriginKeys: mocks.robotOriginKeys, listPreviewPharmacies: mocks.listPreviewPharmacies };
});
vi.mock("@/server/db/client", () => ({ prisma: {} }));

const page = await import("../page");
const robotPage = await import("../../suggestions-robot/page");
const { adviceForMedicine } = await import("../medicine-panel");
const { editValuesOf } = await import("@/core/ai/central-advice-edit");
const { ADVICE_RULES } = await import("@/core/ai/engines/advice");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/[\s  ]+/g, " ");
const render = async (query: Record<string, string> = {}) => renderToStaticMarkup((await page.default({ searchParams: Promise.resolve(query) })) as never);

const THROAT = ADVICE_RULES.find((rule) => rule.key === "antihistamine-dry-throat")!;
const ruleView = (overrides: Record<string, unknown> = {}) => ({
  id: `rule:${THROAT.key}`,
  ruleKey: THROAT.key,
  title: THROAT.title,
  version: THROAT.version,
  origin: "CODE",
  status: "ACTIVE",
  outdated: false,
  decidedBy: null,
  decidedAt: null,
  when: "codes ATC R06AE, R06AX",
  sideEffects: [],
  proposes: "Soins — gorge, irritation, miel",
  question: THROAT.question ?? null,
  script: "Le médicament peut assécher la gorge.",
  reason: "Raison.",
  safetyNotes: [],
  source: "Consigne du fondateur",
  feedback: null,
  patientReason: "Votre traitement peut assécher la gorge.",
  edit: editValuesOf(THROAT),
  requiresProduct: true,
  hasRoutine: false,
  codeExclusions: ["Pas avant 12 ans"],
  addedExclusions: [],
  populations: [],
  atcPrefixes: ["R06AE", "R06AX"],
  matchingTags: ["gorge"],
  modified: { by: "Donna", at: new Date("2026-10-13T09:00:00Z"), codeChangedSince: false },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1", fullName: "Donna" } });
  mocks.listCentralRules.mockResolvedValue([ruleView()]);
  mocks.listCentralAssociations.mockResolvedValue([{ id: "as_1", triggerKind: "PRODUCT", triggerLabel: "Crème solaire", adviceLabel: "Après-soleil", adviceEan: "3402222222222", sentence: "Apaisez la peau.", status: "VALIDATED", decidedBy: "Donna", decidedAt: new Date(), createdBy: "Donna", createdAt: new Date() }]);
  mocks.loadEditHistory.mockResolvedValue(new Map([[`rule:${THROAT.key}`, [{ id: "e1", action: "EDIT", changed: ["Ce que dit le pharmacien"], by: "Donna", at: new Date("2026-10-13T09:00:00Z") }]]]));
  mocks.modifiedAssociations.mockResolvedValue(new Map());
  mocks.listRobotProposals.mockResolvedValue({ pending: [], recent: [] });
  mocks.robotOriginKeys.mockResolvedValue(new Set());
  mocks.listPreviewPharmacies.mockResolvedValue([{ id: "ph_1", name: "Pharmacie du Parc" }]);
});

describe("la page « Conseils »", () => {
  it("explique en une phrase ce qu'est un conseil, puis des filtres en mots simples — tout au même endroit", async () => {
    const html = text(await render());
    expect(html).toContain("Un conseil, c'est ce que PharmaBoost propose au comptoir quand un médicament ou un produit est scanné.");
    for (const label of ["Tous", "Déclenchés par un médicament", "Déclenchés par un produit", "À relire", "Proposés par le robot", "Retirés", "À ne pas associer"]) expect(html).toContain(label);
    expect(html).toContain(THROAT.title);
    expect(html).toContain("Crème solaire");
    expect(html).not.toContain("Conseils & associations");
  });

  it("chaque conseil se modifie, montre qui l'a modifié, son historique, et le retour à la version d'origine", async () => {
    const html = text(await render());
    expect(html).toContain("Modifier");
    expect(html).toContain("Modifié par Donna");
    expect(html).toContain("Revenir à la version d'origine");
    expect(html).toContain("Historique des modifications (1)");
  });

  it("le filtre de l'adresse est appliqué (« ?filtre=produit » : seulement les conseils déclenchés par un produit)", async () => {
    const html = text(await render({ filtre: "produit" }));
    expect(html).toContain("Crème solaire");
    expect(html).not.toContain(THROAT.title);
  });

  it("réservée au super admin : sans session console, rien n'est lu", async () => {
    mocks.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listCentralRules).not.toHaveBeenCalled();
    expect(mocks.listRobotProposals).not.toHaveBeenCalled();
  });
});

describe("les anciennes adresses", () => {
  it("« Suggestions du robot » mène à « Conseils », filtre « Proposés par le robot » — après le contrôle de session", async () => {
    await robotPage.default();
    expect(mocks.requirePlatformSession).toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/conseils?filtre=robot");
  });
});

describe("la vue « Ce médicament »", () => {
  it("rassemble les conseils qui s'appliquent : par la famille, par le nom ; jamais ce qui est retiré", () => {
    const items = [
      { type: "rule", facets: { id: "rule:a", trigger: "MEDICINE", review: false, robot: false, removed: false, atcPrefixes: ["R06AE"], searchText: "" }, rule: {} },
      { type: "rule", facets: { id: "rule:b", trigger: "MEDICINE", review: false, robot: false, removed: true, atcPrefixes: ["R06A"], searchText: "" }, rule: {} },
      { type: "rule", facets: { id: "rule:c", trigger: "MEDICINE", review: false, robot: false, removed: false, atcPrefixes: ["N02BE"], searchText: "" }, rule: {} },
      { type: "association", facets: { id: "association:d", trigger: "MEDICINE", review: false, robot: false, removed: false, atcPrefixes: [], searchText: "" }, association: { triggerKind: "MEDICINE", triggerLabel: "CETIRIZINE BIOGARAN" } },
      { type: "robot", facets: { id: "robot:e", trigger: "MEDICINE", review: true, robot: true, removed: false, atcPrefixes: ["R06AE07"], searchText: "" }, proposal: {} },
    ] as never;
    const found = adviceForMedicine(items, { specialtyId: "sp", name: "CETIRIZINE BIOGARAN 10 mg", substances: [], atcCode: "R06AE07", family: null });
    expect(found.map((item) => item.facets.id)).toEqual(["rule:a", "association:d", "robot:e"]);
  });
});
