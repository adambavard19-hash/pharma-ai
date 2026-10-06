import { Loader2 } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepCard } from "../step-card";
import { RECEIVE_POLL_MAX_MS, RECEIVE_POLL_MS, type LatestDeposit } from "../view";
import { allOfType, find, mount, textOf } from "./hooks";

/**
 * L'étape 3 et son statut en direct, SANS navigateur : minuteries factices, et
 * un `router.refresh()` espionné. On vérifie ce que le titulaire vit — la
 * page se remet à jour toute seule, jusqu'au stock « à jour », sans s'arrêter
 * sur un échec, et sans interroger le serveur indéfiniment.
 */

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { fakeHooks: hooks } = await import("./hooks");
  return { ...actual, useState: hooks.useState, useEffect: hooks.useEffect, useRef: hooks.useRef, useTransition: hooks.useTransition };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const { ReceiveStep } = await import("../receive-step");

const deposit = (overrides: Partial<LatestDeposit> = {}): LatestDeposit => ({ id: "d0", status: "APPLIED", lines: 4235, message: null, stalled: false, ...overrides });

const visibility = { visibilityState: "visible" as "visible" | "hidden" };

const open = (latest: LatestDeposit | null, folderReady = true) => {
  const view = mount(ReceiveStep, { latest, folderReady });
  const tree = view.render();
  return { view, tree, props: (next: LatestDeposit | null) => view.render({ latest: next, folderReady }), rerender: () => view.render() };
};

const stepOf = (tree: ReturnType<typeof open>["tree"]) => find(tree, (element) => element.type === StepCard, "l'étape 3");
const spinner = (tree: ReturnType<typeof open>["tree"]) => allOfType(tree, Loader2);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", visibility);
  visibility.visibilityState = "visible";
  mocks.refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("la page se remet à jour toute seule", () => {
  it("un router.refresh() toutes les 10 secondes tant qu'on attend le fichier", () => {
    const { tree } = open(deposit());
    expect(textOf(tree)).toContain("En attente de votre fichier… cette page se met à jour toute seule.");
    expect(spinner(tree)).toHaveLength(1);

    vi.advanceTimersByTime(RECEIVE_POLL_MS - 1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3 * RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(4);
  });

  it("sans dossier installé et sans envoi en cours, rien n'est interrogé", () => {
    const { tree } = open(deposit(), false);
    expect(textOf(tree)).toContain("Quand vous envoyez votre fichier ci-dessous");
    expect(spinner(tree)).toHaveLength(0);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("sans dossier, un fichier envoyé d'ici est suivi : lecture, puis stock à jour — et c'est fini", () => {
    const { props } = open(deposit(), false);
    const reading = props(deposit({ id: "d1", status: "RECEIVED", lines: null }));
    expect(textOf(reading)).toContain("Fichier reçu, lecture en cours…");
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    const done = props(deposit({ id: "d1", status: "APPLIED", lines: 12 }));
    expect(textOf(done)).toContain("Fichier reçu : 12 lignes, stock à jour.");
    vi.advanceTimersByTime(10 * RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("il s'arrête quand le stock est à jour", () => {
  it("à « à jour » : l'étape passe au vert, plus aucune actualisation", () => {
    const { props } = open(deposit());
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    const tree = props(deposit({ id: "d1", status: "APPLIED", lines: 1 }));
    expect(stepOf(tree).props.done).toBe(true);
    expect(textOf(tree)).toContain("Fichier reçu : 1 ligne, stock à jour.");
    expect(spinner(tree)).toHaveLength(0);

    vi.advanceTimersByTime(60 * RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("il ne s'arrête PAS sur une vérification, un échec ou un écart", () => {
  const SCENARIOS: [string, LatestDeposit["status"], string][] = [
    ["en vérification", "HELD", "l'équipe PharmaBoost le vérifie"],
    ["illisible", "FAILED", "impossible à lire"],
    ["écarté", "REJECTED", "Fichier écarté par l'équipe PharmaBoost"],
  ];

  it.each(SCENARIOS)("%s : on affiche l'état, et la page continue de s'actualiser", (_name, status, sentence) => {
    const { props } = open(deposit());
    const tree = props(deposit({ id: "d1", status, lines: null, message: "raison" }));
    expect(textOf(tree)).toContain(sentence);
    expect(stepOf(tree).props.done).toBe(false);

    vi.advanceTimersByTime(3 * RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
  });

  it.each(SCENARIOS)("%s, puis un nouveau fichier appliqué : l'étape 3 passe au vert sans recharger la page", (_name, status) => {
    const { props } = open(deposit());
    props(deposit({ id: "d1", status, lines: null }));
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);

    // Le 2e rafraîchissement ramène le dépôt suivant : stock à jour.
    const tree = props(deposit({ id: "d2", status: "APPLIED", lines: 4300 }));
    expect(stepOf(tree).props.done).toBe(true);
    expect(textOf(tree)).toContain("stock à jour");
    vi.advanceTimersByTime(10 * RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("un fichier en échec à l'ouverture, que l'équipe relance et applique : l'écran le voit", () => {
    const { props } = open(deposit({ id: "d1", status: "FAILED", lines: null }));
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    expect(textOf(props(deposit({ id: "d1", status: "RECEIVED", lines: null })))).toContain("lecture en cours");
    const tree = props(deposit({ id: "d1", status: "APPLIED", lines: 4235 }));
    expect(stepOf(tree).props.done).toBe(true);
  });

  it("un fichier en vérification à l'ouverture, appliqué ensuite par l'équipe (même dépôt) : l'écran le voit", () => {
    const { props } = open(deposit({ id: "d1", status: "HELD", lines: 12 }));
    expect(stepOf(props(deposit({ id: "d1", status: "HELD", lines: 12 }))).props.done).toBe(false);
    const tree = props(deposit({ id: "d1", status: "APPLIED", lines: 4235 }));
    expect(stepOf(tree).props.done).toBe(true);
  });
});

describe("une lecture restée bloquée", () => {
  it("n'est pas un spinner à vie : « Lecture interrompue, renvoyez votre fichier »", () => {
    const { tree } = open(deposit({ id: "d1", status: "RECEIVED", lines: null, stalled: true }));
    expect(textOf(tree)).toContain("Lecture interrompue, renvoyez votre fichier.");
    expect(textOf(tree)).not.toContain("lecture en cours");
    expect(spinner(tree)).toHaveLength(0);
    expect(stepOf(tree).props.done).toBe(false);
  });

  it("la page continue de se rafraîchir : le serveur peut la refermer, ou le titulaire renvoyer un fichier", () => {
    const { props } = open(deposit({ id: "d1", status: "RECEIVED", lines: null, stalled: true }));
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const tree = props(deposit({ id: "d2", status: "APPLIED", lines: 4235 }));
    expect(stepOf(tree).props.done).toBe(true);
  });

  it("une lecture récente, elle, tourne bien : la roue et « lecture en cours »", () => {
    const { tree } = open(deposit({ id: "d1", status: "RECEIVED", lines: null, stalled: false }));
    expect(textOf(tree)).toContain("Fichier reçu, lecture en cours…");
    expect(spinner(tree)).toHaveLength(1);
  });
});

describe("il abandonne au bout de 30 minutes", () => {
  it("plus aucune actualisation, la roue s'arrête, et la page dit de recharger", () => {
    const { rerender } = open(deposit());
    vi.advanceTimersByTime(RECEIVE_POLL_MAX_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(RECEIVE_POLL_MAX_MS / RECEIVE_POLL_MS);

    // Le tour suivant dépasse le plafond : il n'interroge pas, il abandonne.
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(RECEIVE_POLL_MAX_MS / RECEIVE_POLL_MS);
    const tree = rerender();
    expect(textOf(tree)).toContain("Pas de fichier reçu pour l'instant. Rechargez la page pour vérifier de nouveau.");
    expect(spinner(tree)).toHaveLength(0);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(mocks.refresh).toHaveBeenCalledTimes(RECEIVE_POLL_MAX_MS / RECEIVE_POLL_MS);
  });

  it("après un échec aussi : l'état reste affiché, avec l'invitation à recharger", () => {
    const { props, rerender } = open(deposit());
    props(deposit({ id: "d1", status: "FAILED", lines: null }));
    vi.advanceTimersByTime(RECEIVE_POLL_MAX_MS + RECEIVE_POLL_MS);
    const callsAtGiveUp = mocks.refresh.mock.calls.length;

    const tree = rerender();
    expect(textOf(tree)).toContain("Fichier reçu, mais impossible à lire. Votre stock n'a pas changé.");
    expect(textOf(tree)).toContain("Rechargez la page pour vérifier de nouveau.");
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(mocks.refresh).toHaveBeenCalledTimes(callsAtGiveUp);
  });

  it("une lecture trop longue ne tourne pas indéfiniment : « prend plus de temps que prévu »", () => {
    const { rerender } = open(deposit({ id: "d1", status: "RECEIVED", lines: null }));
    vi.advanceTimersByTime(RECEIVE_POLL_MAX_MS + RECEIVE_POLL_MS);
    const tree = rerender();
    expect(textOf(tree)).toContain("La lecture prend plus de temps que prévu. Rechargez la page pour vérifier de nouveau.");
    expect(spinner(tree)).toHaveLength(0);
  });
});

describe("un onglet caché n'interroge pas le serveur", () => {
  it("rien tant qu'il est caché, la mise à jour reprend au tour visible suivant", () => {
    open(deposit());
    visibility.visibilityState = "hidden";
    vi.advanceTimersByTime(5 * RECEIVE_POLL_MS);
    expect(mocks.refresh).not.toHaveBeenCalled();

    visibility.visibilityState = "visible";
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("quand on quitte la page", () => {
  it("la minuterie est arrêtée : plus aucune actualisation", () => {
    const { view } = open(deposit());
    vi.advanceTimersByTime(RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    view.unmount();
    vi.advanceTimersByTime(10 * RECEIVE_POLL_MS);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
