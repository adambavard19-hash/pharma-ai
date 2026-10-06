import { beforeEach, describe, expect, it, vi } from "vitest";
import { buttonLabelled, find, mount, textOf } from "./hooks";

/**
 * Le formulaire « Déposer son stock » d'une officine : un bouton, puis un
 * fichier et « Envoyer ». Sans navigateur : les hooks de React sont remplacés
 * (voir `hooks.ts`), on appelle les gestionnaires comme le ferait un clic.
 */

const mocks = vi.hoisted(() => ({
  depositForPharmacyAction: vi.fn(),
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
vi.mock("@/server/actions/admin-stock-deposits", () => ({ depositForPharmacyAction: mocks.depositForPharmacyAction, decideDepositAction: vi.fn(), retryDepositAction: vi.fn() }));

const { DepositForPharmacy } = await import("../_components/deposit-for-pharmacy");

const csv = (name = "stock.csv", size = 2048) => new File([new Uint8Array(size)], name, { type: "text/csv" });

const deposit = (overrides: Record<string, unknown> = {}) => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  fileName: "stock.csv",
  fileSize: 2048,
  status: "APPLIED",
  source: "CONSOLE",
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

/** Ouvre le formulaire : le clic sur « Déposer son stock ». */
function open() {
  const view = mount(DepositForPharmacy, { pharmacyId: "ph_1", pharmacyName: "Pharmacie du Parc" });
  (buttonLabelled(view.render(), "Déposer son stock").props.onClick as () => void)();
  return view;
}

const choose = (view: ReturnType<typeof mount>, file: File | { name: string; size: number }) => {
  const input = find(view.render(), (element) => element.type === "input", "champ fichier");
  (input.props.onChange as (event: unknown) => void)({ target: { files: [file] } });
};

const submit = async (view: ReturnType<typeof mount>) => {
  const form = find(view.render(), (element) => element.type === "form", "formulaire");
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
  await view.settle();
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("avant l'ouverture", () => {
  it("n'est qu'un bouton « Déposer son stock » : pas de champ, pas de formulaire", () => {
    const view = mount(DepositForPharmacy, { pharmacyId: "ph_1", pharmacyName: "Pharmacie du Parc" });
    const tree = view.render();
    expect(textOf(tree)).toBe("Déposer son stock");
    expect(() => find(tree, (element) => element.type === "form", "formulaire")).toThrow();
  });
});

describe("le formulaire ouvert", () => {
  it("dit pour quelle officine, quels fichiers, et rappelle le stock COMPLET", () => {
    const view = open();
    const content = textOf(view.render());
    expect(content).toContain("Déposer le stock de Pharmacie du Parc");
    expect(content).toContain("CSV, Excel (.xlsx) ou PDF d'inventaire");
    expect(content).toContain("8 Mo au plus");
    expect(content).toContain("stock COMPLET");
    expect(content).toContain("Aucun fichier choisi");
    const input = find(view.render(), (element) => element.type === "input", "champ fichier");
    expect(input.props.type).toBe("file");
    expect(input.props.name).toBe("file");
    expect(input.props.accept).toBe(".csv,.txt,.xlsx,.xls,.pdf");
  });

  it("« Envoyer » reste éteint tant qu'aucun fichier n'est choisi, puis s'allume ; le nom du fichier s'affiche", () => {
    const view = open();
    expect(buttonLabelled(view.render(), "Envoyer").props.disabled).toBe(true);
    choose(view, csv("inventaire-oct.csv", 2048));
    const tree = view.render();
    expect(buttonLabelled(tree, "Envoyer").props.disabled).toBe(false);
    expect(textOf(tree)).toContain("inventaire-oct.csv (2 Ko)");
    expect(textOf(tree)).toContain("Changer de fichier");
  });

  it("« Annuler » referme le formulaire et oublie le fichier", () => {
    const view = open();
    choose(view, csv());
    (buttonLabelled(view.render(), "Annuler").props.onClick as () => void)();
    const tree = view.render();
    expect(textOf(tree)).toBe("Déposer son stock");
    // Rouvert, il repart à vide.
    (buttonLabelled(tree, "Déposer son stock").props.onClick as () => void)();
    expect(textOf(view.render())).toContain("Aucun fichier choisi");
  });
});

describe("l'envoi", () => {
  it("envoie l'officine et le fichier à l'action de la console, rafraîchit la page, confirme avec le message de l'action et referme", async () => {
    mocks.depositForPharmacyAction.mockResolvedValue({ ok: true, data: deposit(), message: "Stock de Pharmacie du Parc mis à jour : 4 235 lignes." });
    const view = open();
    const file = csv("inventaire.csv");
    choose(view, file);
    await submit(view);

    expect(mocks.depositForPharmacyAction).toHaveBeenCalledTimes(1);
    const sent = mocks.depositForPharmacyAction.mock.calls[0][0] as FormData;
    expect(sent.get("pharmacyId")).toBe("ph_1");
    expect((sent.get("file") as File).name).toBe("inventaire.csv");
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith({ tone: "success", title: "Stock de Pharmacie du Parc mis à jour : 4 235 lignes." });
    expect(textOf(view.render())).toBe("Déposer son stock");
  });

  it("sans message de l'action, la confirmation nomme tout de même l'officine", async () => {
    mocks.depositForPharmacyAction.mockResolvedValue({ ok: true, data: deposit() });
    const view = open();
    choose(view, csv());
    await submit(view);
    expect(mocks.push).toHaveBeenCalledWith({ tone: "success", title: "Stock de Pharmacie du Parc mis à jour" });
  });

  it("un fichier en attente (HELD) est annoncé en orange, sans prétendre que le stock est à jour", async () => {
    mocks.depositForPharmacyAction.mockResolvedValue({ ok: true, data: deposit({ status: "HELD", lines: 12, created: null, updated: null, zeroed: null, message: "Le fichier contient 12 lignes valides." }), message: "Fichier reçu pour Pharmacie du Parc, mais bien plus petit que son stock : il attend votre décision." });
    const view = open();
    choose(view, csv());
    await submit(view);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith({ tone: "warning", title: "Fichier reçu pour Pharmacie du Parc, mais bien plus petit que son stock : il attend votre décision." });
    expect(mocks.refresh).toHaveBeenCalled();
    expect(textOf(view.render())).toBe("Déposer son stock");
  });

  it("un fichier illisible (FAILED) reste ouvert avec la raison, la liste est rafraîchie", async () => {
    mocks.depositForPharmacyAction.mockResolvedValue({ ok: true, data: deposit({ status: "FAILED", lines: null, message: "Colonnes non reconnues : quantité." }) });
    const view = open();
    choose(view, csv());
    await submit(view);
    const content = textOf(view.render());
    expect(content).toContain("Colonnes non reconnues : quantité.");
    expect(content).toContain("Envoyer");
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("un refus de l'action (pas de titulaire actif, fichier refusé…) s'affiche tel quel, rien n'est confirmé", async () => {
    mocks.depositForPharmacyAction.mockResolvedValue({ ok: false, error: "Cette officine n'a pas de titulaire actif : impossible de déposer son stock." });
    const view = open();
    choose(view, csv());
    await submit(view);
    expect(textOf(view.render())).toContain("Cette officine n'a pas de titulaire actif : impossible de déposer son stock.");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("sans fichier, rien n'est envoyé et on dit quoi faire", async () => {
    const view = open();
    await submit(view);
    expect(mocks.depositForPharmacyAction).not.toHaveBeenCalled();
    expect(textOf(view.render())).toContain("Choisissez d'abord le fichier.");
  });

  it("un fichier au-delà de 8 Mo est refusé avant l'envoi", async () => {
    const view = open();
    choose(view, { name: "enorme.xlsx", size: 9 * 1024 * 1024 });
    await submit(view);
    expect(mocks.depositForPharmacyAction).not.toHaveBeenCalled();
    expect(textOf(view.render())).toContain("Ce fichier fait 9 Mo : le maximum est 8 Mo.");
  });
});

describe("une coupure pendant l'envoi", () => {
  it("s'affiche dans le formulaire (message fixe, rien de technique) au lieu de faire tomber la page ; le formulaire reste ouvert", async () => {
    mocks.depositForPharmacyAction.mockRejectedValue(new Error("fetch failed: ECONNRESET 10.0.0.12:443"));
    const view = open();
    choose(view, csv("inventaire.csv"));
    // Si l'exception n'était pas interceptée, la transition rejetterait ici : c'est ce qui ferait tomber la page console.
    await expect(submit(view)).resolves.toBeUndefined();

    const content = textOf(view.render());
    expect(content).toContain("L'envoi n'a pas abouti. Réessayez.");
    expect(content).not.toContain("ECONNRESET");
    expect(content).toContain("inventaire.csv");
    expect(buttonLabelled(view.render(), "Envoyer").props.disabled).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("on peut réessayer avec le même fichier : l'erreur s'efface et l'envoi réussi referme le formulaire", async () => {
    mocks.depositForPharmacyAction.mockRejectedValueOnce(new Error("timeout"));
    mocks.depositForPharmacyAction.mockResolvedValueOnce({ ok: true, data: deposit(), message: "Stock de Pharmacie du Parc mis à jour : 4 235 lignes." });
    const view = open();
    choose(view, csv());
    await submit(view);
    expect(textOf(view.render())).toContain("L'envoi n'a pas abouti. Réessayez.");

    await submit(view);
    expect(mocks.depositForPharmacyAction).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith({ tone: "success", title: "Stock de Pharmacie du Parc mis à jour : 4 235 lignes." });
    expect(textOf(view.render())).toBe("Déposer son stock");
  });
});

describe("le focus suit le formulaire", () => {
  const fileInput = (view: ReturnType<typeof mount>) => find(view.render(), (element) => element.type === "input", "champ fichier");

  it("au chargement de la page le bouton ne vole pas le focus", () => {
    const view = mount(DepositForPharmacy, { pharmacyId: "ph_1", pharmacyName: "Pharmacie du Parc" });
    expect(buttonLabelled(view.render(), "Déposer son stock").props.autoFocus).toBeFalsy();
  });

  it("à l'ouverture, le focus va au champ fichier (le bouton vient de disparaître)", () => {
    const view = open();
    expect(fileInput(view).props.autoFocus).toBe(true);
  });

  it("« Annuler » rend le focus au bouton « Déposer son stock »", () => {
    const view = open();
    (buttonLabelled(view.render(), "Annuler").props.onClick as () => void)();
    expect(buttonLabelled(view.render(), "Déposer son stock").props.autoFocus).toBe(true);
  });

  it("un envoi réussi, qui referme le formulaire, rend lui aussi le focus au bouton", async () => {
    mocks.depositForPharmacyAction.mockResolvedValue({ ok: true, data: deposit() });
    const view = open();
    choose(view, csv());
    await submit(view);
    expect(buttonLabelled(view.render(), "Déposer son stock").props.autoFocus).toBe(true);
  });

  it("rouvert, le formulaire reprend le focus sur le champ fichier", () => {
    const view = open();
    (buttonLabelled(view.render(), "Annuler").props.onClick as () => void)();
    (buttonLabelled(view.render(), "Déposer son stock").props.onClick as () => void)();
    expect(fileInput(view).props.autoFocus).toBe(true);
  });

  it("un envoi en échec garde le formulaire ouvert : le focus n'est pas déplacé vers le bouton", async () => {
    mocks.depositForPharmacyAction.mockResolvedValue({ ok: false, error: "Fichier refusé." });
    const view = open();
    choose(view, csv());
    await submit(view);
    expect(() => buttonLabelled(view.render(), "Déposer son stock")).toThrow();
  });
});
