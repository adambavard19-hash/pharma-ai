import { describe, expect, it } from "vitest";
import type { HostEntry } from "../../../../agent/src/notice-center";
import { answerWord, emailWord, finishWord, INITIAL_POSTE, parseCommand, posteReducer, questionWord, regionRects, sameRegion, stageForEntry, type PosteEvent, type PosteView } from "../island-bridge";
import { ESSAI_SEQUENCE } from "../island-fixtures";

const ENTRY: HostEntry = {
  id: "vente1", reference: "ORD-1", label: "Détecté", subject: "DOLIPRANE", url: "", signature: "s1",
  quiet: false, emailSaved: false, emailError: "", alerts: [], notes: [], questions: [], guidance: [],
  items: [
    { id: "c1", drug: "DOLIPRANE", challenge: "", shortDate: "", outcome: "NONE", name: "SÉRUM", price: "5,90 €", reason: "", availability: "IN_STOCK", quantity: "3", image: "" },
    { id: "c2", drug: "DOLIPRANE", challenge: "Challenge", shortDate: "30/11/2026", outcome: "SOLD", name: "PROBIOTIQUE", price: "14,90 €", reason: "", availability: "LOW_STOCK", quantity: "1", image: "" },
  ],
};

const run = (events: PosteEvent[], start: PosteView = INITIAL_POSTE) => events.reduce(posteReducer, start);
const host = (command: object): PosteEvent => ({ type: "host", command: parseCommand(command)!, now: 1000 });
const ticks = (n: number): PosteEvent[] => Array.from({ length: n }, () => ({ type: "tick" }) as const);

describe("l'île du poste, pilotée par les commandes de l'agent", () => {
  it("un bip : scan, puis l'analyse se coche ; la dernière ligne attend la réponse du serveur", () => {
    const view = run([host({ op: "scan" }), ...ticks(10)]);
    expect(view.island.stage).toBe("analyzing");
    expect(view.island.stepsDone).toBe(3);
  });

  it("la vente arrive pendant l'analyse : les lignes finissent de se cocher, « 2 conseils disponibles », puis les cartes", () => {
    let view = run([host({ op: "scan" }), { type: "tick" }, host({ op: "show", entry: ENTRY })]);
    expect(view.island.stage).toBe("analyzing");
    view = run(ticks(4), view);
    expect(view.island.stage).toBe("ready");
    view = posteReducer(view, { type: "expand" });
    expect(view.island.stage).toBe("advice");
    // La réponse déjà enregistrée par le serveur est reprise.
    expect(view.island.outcomes).toEqual([null, "SOLD"]);
  });

  it("une mise en garde passe avant les conseils ; « Compris » ouvre les conseils", () => {
    const entry = { ...ENTRY, alerts: ["Doxycycline et fer : 2 heures d'écart."] };
    let view = run([host({ op: "show", entry })]);
    expect(view.island.stage).toBe("alert");
    view = posteReducer(view, { type: "readAlert" });
    expect(view.island.stage).toBe("advice");
    // La même vente, mise à jour : la mise en garde lue ne revient pas.
    view = posteReducer(view, host({ op: "show", entry: { ...entry, signature: "s2" } }));
    expect(view.island.stage).toBe("advice");
  });

  it("rien à conseiller : « Rien à ajouter », puis le repos", () => {
    let view = run([host({ op: "show", entry: { ...ENTRY, items: [], quiet: true } })]);
    expect(view.island.stage).toBe("quiet");
    view = posteReducer(view, { type: "settle" });
    expect(view.island.stage).toBe("idle");
  });

  it("e-mail : saisi dans l'île, puis « E-mail envoyé » quand le serveur l'a enregistré, et retour aux conseils", () => {
    let view = run([host({ op: "show", entry: ENTRY }), { type: "openEmail" }, { type: "typeEmail", value: "patient@exemple.fr" }, { type: "sendEmail" }]);
    expect(view.emailPending).toBe(true);
    view = posteReducer(view, host({ op: "show", entry: { ...ENTRY, emailSaved: true } }));
    expect(view.island.stage).toBe("emailSent");
    view = posteReducer(view, { type: "settle" });
    expect(view.island.stage).toBe("advice");
  });

  it("une adresse refusée par le serveur garde le champ ouvert", () => {
    const view = run([host({ op: "show", entry: ENTRY }), { type: "openEmail" }, { type: "typeEmail", value: "patient@exemple.fr" }, { type: "sendEmail" }, host({ op: "show", entry: { ...ENTRY, emailError: "Adresse refusée" } })]);
    expect(view.island.stage).toBe("email");
    expect(view.emailPending).toBe(false);
  });

  it("« Vente terminée » de l'agent, puis le repos ; le robot du comptoir reste le même", () => {
    let view = run([host({ op: "init", look: 7, postLabel: "Comptoir 3" }), host({ op: "show", entry: ENTRY }), host({ op: "done", info: { id: "vente1", title: "", lines: ["1 vendu"], badge: "", warning: false } })]);
    expect(view.island.stage).toBe("done");
    view = posteReducer(view, { type: "settle" });
    expect(view).toMatchObject({ island: { stage: "idle" }, look: 7, postLabel: "Comptoir 3", entry: null });
  });

  it("une analyse sans réponse revient au repos ; « remove » d'une autre vente ne touche à rien", () => {
    expect(run([host({ op: "scan" }), { type: "timeout" }]).island.stage).toBe("idle");
    const view = run([host({ op: "show", entry: ENTRY }), host({ op: "remove", id: "autre" })]);
    expect(view.island.stage).toBe("advice");
    expect(posteReducer(view, host({ op: "remove", id: "vente1" })).island.stage).toBe("idle");
  });

  it("une vente ancienne (lignes de texte seulement) s'affiche en cartes simples", () => {
    const view = run([host({ op: "show", entry: { ...ENTRY, items: [], notes: ["Penser à l'hydratation"] } })]);
    expect(stageForEntry(view.entry!, false)).toBe("advice");
    expect(view.entry!.items[0].name).toBe("Penser à l'hydratation");
  });

  it("le scénario d'essai ne contient que des commandes valides de l'agent", () => {
    for (const step of ESSAI_SEQUENCE) expect(parseCommand(JSON.stringify(step.command)), step.command.op).not.toBeNull();
  });
});

describe("les gestes, en mots de la bannière", () => {
  it("Vendu, Non vendu, Modifier, e-mail en base64, Vente terminée, réponse à une question", () => {
    expect(answerWord("vente1", { id: "c1" }, "SOLD")).toBe("VENDU vente1 c1");
    expect(answerWord("vente1", { id: "c1" }, "NOT_SOLD")).toBe("NONVENDU vente1 c1");
    expect(answerWord("vente1", { id: "c1" }, null)).toBe("ANNULER vente1 c1");
    expect(emailWord("vente1", " patient@exemple.fr ")).toBe(`EMAIL vente1 ${Buffer.from("patient@exemple.fr").toString("base64")}`);
    expect(finishWord("vente1")).toBe("TERMINER vente1");
    expect(questionWord("vente1", "why", "FEVER")).toBe("REPONSE vente1 why:FEVER");
  });

  it("refuse un identifiant ou une adresse douteux (jamais d'espace qui couperait la ligne)", () => {
    expect(answerWord("vente 1", { id: "c1" }, "SOLD")).toBeNull();
    expect(answerWord("vente1", { id: "" }, "SOLD")).toBeNull();
    expect(emailWord("vente1", "pas un e-mail")).toBeNull();
    expect(questionWord("vente1", "why", "a:b")).toBeNull();
  });

  it("ignore une commande inconnue ou malformée", () => {
    expect(parseCommand("pas du json")).toBeNull();
    expect(parseCommand({ op: "effacer" })).toBeNull();
    expect(parseCommand({ op: "show", entry: { id: 3 } })).toBeNull();
  });
});

describe("la forme de la fenêtre Windows", () => {
  it("un rectangle arrondi par panneau, élargi pour le liseré, arrondi au pixel, rayon borné par la hauteur", () => {
    const rects = regionRects([{ x: 177.6, y: 5, width: 244, height: 44, radius: 999 }]);
    expect(rects).toEqual([{ x: 174, y: 2, w: 251, h: 50, r: 25 }]);
    expect(sameRegion(rects, regionRects([{ x: 177.6, y: 5, width: 244, height: 44, radius: 999 }]))).toBe(true);
    expect(regionRects([{ x: 0, y: 0, width: 0, height: 10, radius: 4 }])).toEqual([]);
  });
});
