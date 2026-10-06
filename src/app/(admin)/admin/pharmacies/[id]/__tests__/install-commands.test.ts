import { beforeEach, describe, expect, it, vi } from "vitest";
import { buttonLabelled, find, mount, textOf } from "../../../depots-stock/__tests__/hooks";

/**
 * Les gestes de l'équipe sous AnyDesk : préparer la ligne du serveur, ajouter
 * un poste. Sans navigateur : on lit l'arbre rendu et on appelle les
 * gestionnaires comme le ferait un clic (hooks de React remplacés, voir
 * `depots-stock/__tests__/hooks.ts`).
 */

const mocks = vi.hoisted(() => ({ prepareInstallationAction: vi.fn(), preparePostInstallAction: vi.fn(), refresh: vi.fn(), push: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("../../../depots-stock/__tests__/hooks");
  return { ...actual, useState: hooks.useState, useTransition: hooks.useTransition, useEffect: hooks.useEffect };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock("@/server/actions/admin-install", () => ({ prepareInstallationAction: mocks.prepareInstallationAction, preparePostInstallAction: mocks.preparePostInstallAction }));

const { InstallCommands } = await import("../install-commands");

const LGOS = [
  { id: "lgpi", label: "LGPI" },
  { id: "winpharma", label: "Winpharma" },
  { id: "autre", label: "Autre logiciel" },
];
const props = (overrides: Record<string, unknown> = {}) => ({ pharmacyId: "ph_1", lgos: LGOS, defaultLgo: "lgpi", serverPairedAt: null, unusedServerCode: false, linkedPostIds: [], ...overrides });
const HINT = "Une ligne a été préparée mais n'est plus affichée : cliquez de nouveau sur Préparer l'installation du serveur.";
const COMMAND = 'powershell -ExecutionPolicy Bypass -Command "irm https://pharmaboost.app/api/agent/installer-serveur/123456 | iex"';

beforeEach(() => {
  vi.resetAllMocks();
});

describe("la phrase « une ligne a été préparée mais n'est plus affichée »", () => {
  it("après un rechargement (code en attente, rien à l'écran) : elle dit de préparer de nouveau, et aucune ligne n'est montrée", () => {
    const tree = mount(InstallCommands, props({ unusedServerCode: true })).render();
    expect(textOf(tree)).toContain(HINT);
    expect(() => find(tree, (element) => element.props.title === "Sur le serveur, collez cette ligne", "ligne du serveur")).toThrow();
  });

  it("sans code en attente : pas de phrase", () => {
    expect(textOf(mount(InstallCommands, props()).render())).not.toContain("n'est plus affichée");
  });

  it("dès que la ligne est affichée (même si la fiche se recharge et annonce toujours un code en attente), la phrase disparaît : elle serait fausse", async () => {
    mocks.prepareInstallationAction.mockResolvedValue({ ok: true, data: { serverCommand: COMMAND, serverCodeExpiresAt: "2026-10-06T10:00:00.000Z" } });
    const view = mount(InstallCommands, props({ unusedServerCode: true }));
    expect(textOf(view.render())).toContain(HINT);

    (buttonLabelled(view.render(), "Préparer l'installation du serveur").props.onClick as () => void)();
    await view.settle();

    expect(mocks.prepareInstallationAction).toHaveBeenCalledWith({ pharmacyId: "ph_1", lgo: "lgpi" });
    const tree = view.render();
    expect(textOf(tree)).not.toContain("n'est plus affichée");
    const box = find(tree, (element) => element.props.title === "Sur le serveur, collez cette ligne", "ligne du serveur");
    expect(box.props.command).toBe(COMMAND);
  });

  it("un refus de l'action (officine suspendue…) n'affiche aucune ligne : l'erreur est annoncée, la phrase reste", async () => {
    mocks.prepareInstallationAction.mockResolvedValue({ ok: false, error: "Cette officine est suspendue." });
    const view = mount(InstallCommands, props({ unusedServerCode: true }));
    (buttonLabelled(view.render(), "Préparer l'installation du serveur").props.onClick as () => void)();
    await view.settle();
    expect(mocks.push).toHaveBeenCalledWith({ tone: "error", title: "Cette officine est suspendue." });
    expect(textOf(view.render())).toContain(HINT);
  });
});

describe("le logiciel envoyé avec la demande", () => {
  it("le choix par défaut (LGPI) part avec « Préparer l'installation du serveur »", async () => {
    mocks.prepareInstallationAction.mockResolvedValue({ ok: false, error: "x" });
    const view = mount(InstallCommands, props());
    (buttonLabelled(view.render(), "Préparer l'installation du serveur").props.onClick as () => void)();
    await view.settle();
    expect(mocks.prepareInstallationAction).toHaveBeenCalledWith({ pharmacyId: "ph_1", lgo: "lgpi" });
  });

  it("le logiciel choisi dans la liste est celui qui part", async () => {
    mocks.prepareInstallationAction.mockResolvedValue({ ok: false, error: "x" });
    const view = mount(InstallCommands, props());
    const select = find(view.render(), (element) => element.props.id === "install-lgo", "liste des logiciels");
    (select.props.onChange as (event: unknown) => void)({ target: { value: "winpharma" } });
    (buttonLabelled(view.render(), "Préparer l'installation du serveur").props.onClick as () => void)();
    await view.settle();
    expect(mocks.prepareInstallationAction).toHaveBeenCalledWith({ pharmacyId: "ph_1", lgo: "winpharma" });
  });
});
