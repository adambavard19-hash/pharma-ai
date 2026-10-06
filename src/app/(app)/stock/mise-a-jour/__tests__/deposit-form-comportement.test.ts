import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEPOSIT_MAX_BYTES } from "@/core/stock-deposit/rules";
import type { DepositView } from "@/core/stock-deposit/types";
import { Alert } from "@/components/ui/feedback";
import { HELD_NOTICE, SEND_FAILED } from "../view";
import { allOfType, buttonLabelled, find, mount, textOf } from "./hooks";

/**
 * Le bloc « Envoyer mon fichier », SANS navigateur : les hooks de React sont
 * remplacés (voir `hooks.ts`), on appelle les gestionnaires comme le ferait
 * un clic, un choix de fichier ou un glisser-déposer. On vérifie ce que vit le
 * titulaire : un fichier trop gros ne part pas, une panne réseau se lit à
 * l'écran (jamais une page qui plante), un envoi réussi vide la zone.
 */

const mocks = vi.hoisted(() => ({ sendStockAction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("./hooks");
  return { ...actual, useState: hooks.useState, useRef: hooks.useRef, useEffect: hooks.useEffect, useTransition: hooks.useTransition };
});
vi.mock("@/server/actions/stock-deposits", () => ({ sendStockAction: mocks.sendStockAction }));

const { DepositForm } = await import("../deposit-form");

const deposit = (overrides: Partial<DepositView> = {}): DepositView => ({
  id: "d1",
  pharmacyId: "ph-1",
  fileName: "stock.csv",
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
  receivedAt: new Date("2026-10-05T08:42:00Z"),
  appliedAt: new Date("2026-10-05T08:42:30Z"),
  decidedAt: null,
  hasFile: true,
  stalled: false,
  ...overrides,
});

type Picked = File | { name: string; size: number };
const csv = (name = "stock.csv", size = 2048): Picked => ({ name, size });

const open = (defaultOpen = true) => mount(DepositForm, { defaultOpen });

const choose = (view: ReturnType<typeof open>, file: Picked | null) => {
  const input = find(view.render(), (element) => element.type === "input", "champ fichier");
  (input.props.onChange as (event: unknown) => void)({ target: { files: file ? [file] : [] } });
};

const submit = async (view: ReturnType<typeof open>) => {
  const form = find(view.render(), (element) => element.type === "form", "formulaire");
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
  await view.settle();
};

const alerts = (view: ReturnType<typeof open>) => allOfType(view.render(), Alert).map((element) => ({ tone: element.props.tone as string, title: element.props.title as string | undefined, text: textOf(element.props.children) }));
const sendButton = (view: ReturnType<typeof open>) => buttonLabelled(view.render(), "Envoyer");

beforeEach(() => {
  mocks.sendStockAction.mockReset();
});

describe("l'ouverture du bloc", () => {
  it("replié : seul le titre se voit ; un clic l'ouvre", () => {
    const view = open(false);
    const detail = () => find(view.render(), (element) => element.props.id === "envoi-fichier", "le détail");
    expect(detail().props.hidden).toBe(true);

    const toggle = find(view.render(), (element) => element.type === "button" && element.props["aria-controls"] === "envoi-fichier", "le titre cliquable");
    expect(toggle.props["aria-expanded"]).toBe(false);
    (toggle.props.onClick as () => void)();
    expect(detail().props.hidden).toBe(false);
  });

  it("le rappel dit d'envoyer le stock complet, et que ce qui n'y est pas sera mis à 0", () => {
    const view = open();
    const reminder = alerts(view)[0];
    expect(reminder.text).toContain("Envoyez toujours votre stock complet");
    expect(reminder.text).toContain("Ce qui n'est pas dans le fichier sera mis à 0 en stock.");
  });
});

describe("un fichier refusé avant l'envoi", () => {
  it("trop gros : le titulaire le lit, le bouton reste inactif et rien ne part — même en forçant le formulaire", async () => {
    const view = open();
    choose(view, csv("inventaire.pdf", DEPOSIT_MAX_BYTES + 1));

    const shown = alerts(view).find((alert) => alert.tone === "danger");
    expect(shown?.text).toContain("le maximum est de 8 Mo");
    expect(sendButton(view).props.disabled).toBe(true);

    await submit(view);
    expect(mocks.sendStockAction).not.toHaveBeenCalled();
  });

  it("à la limite exacte : accepté", () => {
    const view = open();
    choose(view, csv("inventaire.pdf", DEPOSIT_MAX_BYTES));
    expect(alerts(view).some((alert) => alert.tone === "danger")).toBe(false);
    expect(sendButton(view).props.disabled).toBe(false);
  });

  it("un autre format, ou un fichier vide : dit, et rien ne part", async () => {
    const view = open();
    choose(view, csv("photo.jpg"));
    expect(alerts(view).find((alert) => alert.tone === "danger")?.text).toContain("Ce format n'est pas lu");
    await submit(view);
    choose(view, csv("stock.csv", 0));
    expect(alerts(view).find((alert) => alert.tone === "danger")?.text).toBe("Ce fichier est vide.");
    await submit(view);
    expect(mocks.sendStockAction).not.toHaveBeenCalled();
  });

  it("choisir un bon fichier efface le refus précédent", () => {
    const view = open();
    choose(view, csv("photo.jpg"));
    choose(view, csv("stock.csv"));
    expect(alerts(view).some((alert) => alert.tone === "danger")).toBe(false);
  });

  it("sans fichier choisi : « Envoyer » est inactif et le formulaire n'envoie rien", async () => {
    const view = open();
    expect(sendButton(view).props.disabled).toBe(true);
    await submit(view);
    expect(mocks.sendStockAction).not.toHaveBeenCalled();
  });
});

describe("l'envoi", () => {
  it("envoie le fichier choisi dans le champ « file », puis dit « votre stock est à jour » et vide la zone", async () => {
    mocks.sendStockAction.mockResolvedValue({ ok: true, data: deposit() });
    const view = open();
    const file = new File(["cip;qte\n1;2"], "stock.csv");
    choose(view, file);
    expect(textOf(view.render())).toContain("stock.csv");

    await submit(view);
    expect(mocks.sendStockAction).toHaveBeenCalledOnce();
    const body = mocks.sendStockAction.mock.calls[0][0] as FormData;
    expect(body.get("file")).toBe(file);

    const shown = alerts(view).find((alert) => alert.tone === "success");
    expect(shown?.title).toBe("Votre stock est à jour");
    expect(textOf(view.render())).toContain("Glissez votre fichier ici");
    expect(textOf(view.render())).not.toContain("stock.csv");
  });

  it("une panne réseau s'affiche à l'écran — jamais une exception — et le fichier reste choisi pour réessayer", async () => {
    mocks.sendStockAction.mockRejectedValue(new Error("fetch failed"));
    const view = open();
    choose(view, new File(["cip;qte\n1;2"], "stock.csv"));

    await expect(submit(view)).resolves.toBeUndefined();

    const shown = alerts(view).find((alert) => alert.tone === "danger");
    expect(shown?.title).toBe("Votre stock n'a pas été mis à jour");
    expect(shown?.text).toBe(SEND_FAILED);
    expect(textOf(view.render())).toContain("stock.csv");
    expect(sendButton(view).props.disabled).toBe(false);
  });

  it("un refus du serveur est dit tel quel, le fichier reste choisi", async () => {
    mocks.sendStockAction.mockResolvedValue({ ok: false, error: "Trop d'envois aujourd'hui. Réessayez demain." });
    const view = open();
    choose(view, new File(["x"], "stock.csv"));
    await submit(view);
    const shown = alerts(view).find((alert) => alert.tone === "danger");
    expect(shown?.text).toBe("Trop d'envois aujourd'hui. Réessayez demain.");
    expect(textOf(view.render())).toContain("stock.csv");
  });

  it("en vérification : jamais présenté comme réussi, la phrase du titulaire, la zone se vide", async () => {
    mocks.sendStockAction.mockResolvedValue({ ok: true, data: deposit({ status: "HELD", message: "raison de la console" }) });
    const view = open();
    choose(view, new File(["x"], "nouveautes.csv"));
    await submit(view);
    const shown = alerts(view).find((alert) => alert.tone === "warning");
    expect(shown?.title).toBe("Fichier reçu, en vérification");
    expect(shown?.text).toBe(HELD_NOTICE);
    expect(shown?.text).not.toContain("raison de la console");
    expect(alerts(view).some((alert) => alert.tone === "success")).toBe(false);
    expect(textOf(view.render())).not.toContain("nouveautes.csv");
  });

  it("choisir un autre fichier efface l'issue précédente", async () => {
    mocks.sendStockAction.mockRejectedValue(new Error("fetch failed"));
    const view = open();
    choose(view, new File(["x"], "stock.csv"));
    await submit(view);
    expect(alerts(view).some((alert) => alert.tone === "danger")).toBe(true);
    choose(view, new File(["y"], "stock2.csv"));
    expect(alerts(view).some((alert) => alert.tone === "danger")).toBe(false);
  });
});

describe("le glisser-déposer", () => {
  const zone = (view: ReturnType<typeof open>) => find(view.render(), (element) => element.type === "label", "la zone de dépôt");

  it("déposer un fichier le choisit, comme le sélecteur", () => {
    const view = open();
    const preventDefault = vi.fn();
    (zone(view).props.onDrop as (event: unknown) => void)({ preventDefault, dataTransfer: { files: [csv("depose.csv")] } });
    expect(preventDefault).toHaveBeenCalled();
    expect(textOf(view.render())).toContain("depose.csv");
    expect(sendButton(view).props.disabled).toBe(false);
  });

  it("déposer un fichier trop gros est refusé avant l'envoi, comme au sélecteur", () => {
    const view = open();
    (zone(view).props.onDrop as (event: unknown) => void)({ preventDefault: vi.fn(), dataTransfer: { files: [csv("gros.csv", DEPOSIT_MAX_BYTES + 1)] } });
    expect(alerts(view).find((alert) => alert.tone === "danger")?.text).toContain("le maximum est de 8 Mo");
    expect(sendButton(view).props.disabled).toBe(true);
  });

  it("la zone s'éclaire au survol et s'éteint en sortant", () => {
    const view = open();
    const highlighted = () => String(zone(view).props.className).includes("border-brand-500 bg-brand-50/60");
    expect(highlighted()).toBe(false);
    (zone(view).props.onDragOver as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(highlighted()).toBe(true);
    (zone(view).props.onDragLeave as () => void)();
    expect(highlighted()).toBe(false);
  });
});
