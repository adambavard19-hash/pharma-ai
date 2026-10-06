import { beforeEach, describe, expect, it, vi } from "vitest";
import { allElements, buttonLabelled, find, mount, textOf } from "./hooks";

/**
 * Les gestes de la console sur un fichier : les trois choix d'un fichier en
 * attente (HELD) et « Relancer » d'un fichier illisible (FAILED). Sans
 * navigateur : on lit l'arbre rendu et on appelle les gestionnaires comme le
 * ferait un clic, pour vérifier que chaque bouton appelle la bonne action.
 */

const mocks = vi.hoisted(() => ({
  decideDepositAction: vi.fn(),
  retryDepositAction: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("./hooks");
  return { ...actual, useState: hooks.useState, useTransition: hooks.useTransition };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock("@/server/actions/admin-stock-deposits", () => ({ decideDepositAction: mocks.decideDepositAction, retryDepositAction: mocks.retryDepositAction, depositForPharmacyAction: vi.fn() }));

const { HeldActions, RetryButton } = await import("../_components/deposit-actions");

const deposit = (overrides: Record<string, unknown> = {}) => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  fileName: "nouveautes.csv",
  fileSize: 2048,
  status: "APPLIED",
  source: "WEB",
  lines: 4235,
  created: 12,
  updated: 4223,
  invalid: 0,
  zeroed: 0,
  knownLines: 4200,
  message: null,
  receivedAt: new Date("2026-10-12T08:42:00Z"),
  appliedAt: new Date("2026-10-12T08:42:30Z"),
  decidedAt: null,
  hasFile: true,
  stalled: false,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("un fichier en attente (HELD)", () => {
  const tree = () => HeldActions({ id: "dep_1", fileName: "nouveautes.csv", pharmacyName: "Pharmacie du Parc" });
  /** Chaque geste est un bouton confirmé : la fenêtre de confirmation appelle `onConfirm`. */
  const gesture = (label: string) => find(tree(), (element) => element.props.label === label, `geste « ${label} »`);
  const labels = () => allElements(tree()).filter((element) => typeof element.props.label === "string").map((element) => element.props.label);

  it("propose exactement trois gestes, dans cet ordre", () => {
    expect(labels()).toEqual(["Appliquer (stock complet)", "Appliquer sans remettre à zéro", "Écarter"]);
  });

  it("« Appliquer (stock complet) » demande APPLY_FULL pour ce fichier, et le dit : les absents passent à zéro", async () => {
    mocks.decideDepositAction.mockResolvedValue({ ok: true, data: deposit() });
    const element = gesture("Appliquer (stock complet)");
    await (element.props.onConfirm as (reason?: string) => Promise<unknown>)(undefined);
    expect(mocks.decideDepositAction).toHaveBeenCalledTimes(1);
    expect(mocks.decideDepositAction).toHaveBeenCalledWith({ id: "dep_1", decision: "APPLY_FULL" });
    expect(element.props.consequences).toContain("Les produits absents du fichier passent à 0 en stock.");
    expect(element.props.description).toBe("nouveautes.csv · Pharmacie du Parc");
  });

  it("« Appliquer sans remettre à zéro » demande APPLY_PARTIAL, et dit que les autres produits gardent leur quantité", async () => {
    mocks.decideDepositAction.mockResolvedValue({ ok: true, data: deposit() });
    const element = gesture("Appliquer sans remettre à zéro");
    await (element.props.onConfirm as (reason?: string) => Promise<unknown>)(undefined);
    expect(mocks.decideDepositAction).toHaveBeenCalledWith({ id: "dep_1", decision: "APPLY_PARTIAL" });
    expect(element.props.consequences).toContain("Les autres produits gardent leur quantité actuelle.");
  });

  it("« Écarter » demande REJECT, en rouge, et promet que le stock ne change pas", async () => {
    mocks.decideDepositAction.mockResolvedValue({ ok: true, data: deposit({ status: "REJECTED" }) });
    const element = gesture("Écarter");
    await (element.props.onConfirm as (reason?: string) => Promise<unknown>)(undefined);
    expect(mocks.decideDepositAction).toHaveBeenCalledWith({ id: "dep_1", decision: "REJECT" });
    expect(element.props.tone).toBe("danger");
    expect(element.props.consequences).toContain("Le stock de l'officine ne change pas.");
  });

  it("aucun geste n'appelle l'action tant qu'on n'a pas confirmé", () => {
    tree();
    expect(mocks.decideDepositAction).not.toHaveBeenCalled();
  });

  it("l'aide dit quand choisir « sans remettre à zéro » : si le fichier ne contient que les nouveautés", () => {
    expect(textOf(tree())).toContain("« Appliquer sans remettre à zéro » : à choisir si le fichier ne contient que les nouveautés.");
  });

  it("sans nom d'officine (liste d'une seule officine), la fenêtre ne cite que le fichier", () => {
    const element = find(HeldActions({ id: "dep_2", fileName: "complet.csv" }), (candidate) => candidate.props.label === "Écarter", "geste « Écarter »");
    expect(element.props.description).toBe("complet.csv");
  });
});

describe("un fichier en échec (FAILED)", () => {
  const click = async (view: ReturnType<typeof mount>) => {
    (buttonLabelled(view.render(), "Relancer").props.onClick as () => void)();
    await view.settle();
  };

  it("n'est qu'un bouton « Relancer »", () => {
    const view = mount(RetryButton, { id: "dep_1" });
    expect(textOf(view.render())).toBe("Relancer");
    expect(mocks.retryDepositAction).not.toHaveBeenCalled();
  });

  it("« Relancer » appelle l'action de relance pour ce fichier ; réussi : le message de l'action, et la page rafraîchie", async () => {
    mocks.retryDepositAction.mockResolvedValue({ ok: true, data: deposit(), message: "Fichier relu. Stock mis à jour : 4 235 lignes." });
    const view = mount(RetryButton, { id: "dep_1" });
    await click(view);
    expect(mocks.retryDepositAction).toHaveBeenCalledTimes(1);
    expect(mocks.retryDepositAction).toHaveBeenCalledWith({ id: "dep_1" });
    expect(mocks.push).toHaveBeenCalledWith({ tone: "success", title: "Fichier relu. Stock mis à jour : 4 235 lignes." });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("relancé mais trop petit : annoncé en orange, il attend la décision", async () => {
    mocks.retryDepositAction.mockResolvedValue({ ok: true, data: deposit({ status: "HELD", message: "Le fichier contient 12 lignes valides." }), message: "Fichier relu. Il est bien plus petit que le stock connu : à vous de trancher." });
    await click(mount(RetryButton, { id: "dep_1" }));
    expect(mocks.push).toHaveBeenCalledWith({ tone: "warning", title: "Fichier relu. Il est bien plus petit que le stock connu : à vous de trancher." });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("relancé et toujours illisible : l'erreur de l'action s'affiche sous le bouton, avec la raison", async () => {
    mocks.retryDepositAction.mockResolvedValue({ ok: false, error: "Colonnes non reconnues : quantité." });
    const view = mount(RetryButton, { id: "dep_1" });
    await click(view);
    expect(textOf(view.render())).toContain("Colonnes non reconnues : quantité.");
    expect(mocks.push).toHaveBeenCalledWith({ tone: "error", title: "Colonnes non reconnues : quantité." });
  });

  it("sans message de l'action, la confirmation reste claire", async () => {
    mocks.retryDepositAction.mockResolvedValue({ ok: true, data: deposit() });
    await click(mount(RetryButton, { id: "dep_1" }));
    expect(mocks.push).toHaveBeenCalledWith({ tone: "success", title: "Fichier relu, stock à jour" });
  });

  it("un refus de l'action (fichier supprimé, déjà traité…) s'affiche sous le bouton", async () => {
    mocks.retryDepositAction.mockResolvedValue({ ok: false, error: "Le fichier d'origine n'est plus gardé : demandez au titulaire de le renvoyer." });
    const view = mount(RetryButton, { id: "dep_1" });
    await click(view);
    expect(textOf(view.render())).toContain("Le fichier d'origine n'est plus gardé : demandez au titulaire de le renvoyer.");
    expect(mocks.push).toHaveBeenCalledWith({ tone: "error", title: "Le fichier d'origine n'est plus gardé : demandez au titulaire de le renvoyer." });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("une coupure pendant la relance s'affiche sous le bouton (message fixe) et n'abîme pas la page", async () => {
    mocks.retryDepositAction.mockRejectedValue(new Error("fetch failed: ECONNRESET 10.0.0.12:443"));
    const view = mount(RetryButton, { id: "dep_1" });
    // Si l'exception n'était pas interceptée, la transition rejetterait : la frontière d'erreur ferait tomber toute la console.
    await expect(click(view)).resolves.toBeUndefined();
    const content = textOf(view.render());
    expect(content).toContain("L'envoi n'a pas abouti. Réessayez.");
    expect(content).not.toContain("ECONNRESET");
    expect(mocks.push).toHaveBeenCalledWith({ tone: "error", title: "L'envoi n'a pas abouti. Réessayez." });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("après une coupure, « Relancer » reste là et un second essai efface l'erreur", async () => {
    mocks.retryDepositAction.mockRejectedValueOnce(new Error("timeout"));
    mocks.retryDepositAction.mockResolvedValueOnce({ ok: true, data: deposit(), message: "Fichier relu. Stock mis à jour : 4 235 lignes." });
    const view = mount(RetryButton, { id: "dep_1" });
    await click(view);
    expect(textOf(view.render())).toContain("L'envoi n'a pas abouti. Réessayez.");
    await click(view);
    expect(mocks.retryDepositAction).toHaveBeenCalledTimes(2);
    expect(textOf(view.render())).not.toContain("L'envoi n'a pas abouti");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
