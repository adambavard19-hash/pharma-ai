import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import { counterSheetOf, SHEET_MISSING, type AdviceSheetInput } from "@/core/counter/advice-sheet";
import { ROBOT_LABEL } from "@/core/ai/robot-suggestion";
import type { CounterSheet } from "../../../../agent/src/counter-sheet";
import { AdviceCard, CounterIsland, toggleAdvice, unfoldedName, type IslandAdvice } from "../counter-island";

/**
 * « Si on veut appuyer sur le conseil, il doit se déployer pour regarder dessus les infos » (fondateur, 13 oct. 2026) :
 * un appui sur la carte la déploie dans l'île (une seule à la fois, second appui = repli) ; « Fiche complète » garde la
 * page de la vente. Aucune mention de l'origine du conseil.
 */

const SHEET: CounterSheet = {
  name: "GEL LARMES ARTIFICIELLES HYDRATANT SANS CONSERVATEUR 10 G",
  reasons: ["La cétirizine peut assécher les yeux."],
  script: "Un gel pour les yeux, si vous les sentez secs.",
  contraindications: [{ text: "Grossesse", detail: "Avis du médecin.", patient: "CONCERNED" }, { text: "Hypersensibilité à l'un des composants" }],
  usage: [{ text: "Ne pas toucher l'œil avec l'embout." }],
  description: "Gel ophtalmique lubrifiant.",
  more: { contraindications: 2, usage: 0 },
  cut: true,
};

/** Le balisage, apostrophes rendues lisibles (React les écrit &#x27;). */
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element).replaceAll("&#x27;", "'");

const ITEM: IslandAdvice = { name: "GEL LARMES ARTIFICIELLES", price: "8,90 €", reason: "Sécheresse des yeux", stock: "IN_STOCK", quantity: 6, href: "/vente/rx_1?conseil=rec_1#conseil-rec_1", sheet: SHEET };

const card = (props: Partial<Parameters<typeof AdviceCard>[0]> = {}) =>
  html(createElement(AdviceCard, { item: ITEM, outcome: null, onAnswer: vi.fn(), open: false, onToggle: vi.fn(), ...props }));

describe("déployer, replier : une seule carte à la fois", () => {
  const items = [{ name: "A" }, { name: "B" }];
  it("un appui déploie, un second replie, un appui sur une autre carte la déploie à la place", () => {
    const a = toggleAdvice(null, items, "A");
    expect(unfoldedName(a, items)).toBe("A");
    expect(unfoldedName(toggleAdvice(a, items, "A"), items)).toBeNull();
    expect(unfoldedName(toggleAdvice(a, items, "B"), items)).toBe("B");
  });
  it("une autre vente (d'autres conseils) repart repliée", () => {
    expect(unfoldedName(toggleAdvice(null, items, "A"), [{ name: "A" }, { name: "C" }])).toBeNull();
  });
});

describe("la carte repliée", () => {
  it("un bouton de déploiement (pas un lien), sans détail ; Vendu / Non vendu présents", () => {
    const html = card();
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("data-advice-details");
    expect(html).not.toContain("data-advice-link");
    expect(html).toContain(">Vendu</button>");
    expect(html).toContain(">Non vendu</button>");
  });
});

describe("la carte déployée", () => {
  const html = card({ open: true, outside: true });
  it("nom complet, raison complète, phrase du comptoir, contre-indications (patient concerné dit), conseils d'utilisation", () => {
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("GEL LARMES ARTIFICIELLES HYDRATANT SANS CONSERVATEUR 10 G");
    expect(html).not.toMatch(/line-clamp-2[^"]*">GEL LARMES/);
    expect(html).toContain("La cétirizine peut assécher les yeux.");
    expect(html).toContain("« Un gel pour les yeux, si vous les sentez secs. »");
    expect(html).toContain("Contre-indications");
    expect(html).toContain("Grossesse");
    expect(html).toContain("Concerne ce patient");
    expect(html).toContain("Conseils d'utilisation");
    expect(html).toContain("Ne pas toucher l'œil avec l'embout.");
    expect(html).toContain("Gel ophtalmique lubrifiant.");
    expect(html).toContain("+ 2 dans la fiche complète");
    expect(html).toContain("Texte abrégé");
  });
  it("« Fiche complète » : la page de la vente sur ce conseil, au navigateur du PC au poste", () => {
    const link = /<a [^>]*data-advice-link=""[^>]*>([\s\S]*?)<\/a>/.exec(html);
    expect(link).not.toBeNull();
    expect(link![0]).toContain('href="/vente/rx_1?conseil=rec_1#conseil-rec_1"');
    expect(link![0]).toContain('target="_blank"');
    expect(link![0]).toContain('draggable="false"');
    expect(link![1]).toContain("Fiche complète");
    // Sur l'écran de vente : même page, pas de nouvel onglet.
    const web = card({ open: true, item: { ...ITEM, href: "#conseil-rec_1" } });
    expect(web).toContain('href="#conseil-rec_1"');
    expect(web).not.toContain('target="_blank"');
  });
  it("Vendu / Non vendu / Modifier restent utilisables déployée", () => {
    expect(html).toContain(">Vendu</button>");
    expect(card({ open: true, outcome: "SOLD" })).toContain(">Modifier</button>");
  });
  it("rubriques vides : dites non renseignées, renvoi à la notice ; sans fiche (serveur ancien) : renvoi à la fiche complète", () => {
    const empty = card({ open: true, item: { ...ITEM, sheet: { ...SHEET, script: "", contraindications: [], usage: [], description: "", more: { contraindications: 0, usage: 0 }, cut: false } } });
    expect(empty).toContain(SHEET_MISSING.contraindications);
    expect(empty).toContain(SHEET_MISSING.usage);
    expect(empty).not.toContain("À dire au patient");
    const old = card({ open: true, item: { ...ITEM, sheet: undefined } });
    expect(old).toContain("À lire dans la fiche complète.");
    expect(old).toContain("Sécheresse des yeux");
    const nothing = card({ open: true, item: { ...ITEM, sheet: undefined, href: undefined } });
    expect(nothing).toContain(SHEET_MISSING.contraindications);
    expect(nothing).not.toContain("data-advice-link");
  });
});

describe("dans l'île : liste bornée, glisser, robot", () => {
  const island = renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "advice", outcomes: [null] },
      items: [ITEM],
      drug: "CÉTIRIZINE",
      alert: null,
      pills: [],
      onAnswer: vi.fn(), onEmail: vi.fn(), onSendEmail: vi.fn(), onAddEmail: vi.fn(), onFinish: vi.fn(), onDismissAlert: vi.fn(),
    }),
  );
  it("la carte est dans la liste qui défile, à hauteur bornée", () => {
    expect(island).toMatch(/<ul[^>]*class="isl-scroll[^"]*"[^>]*style="max-height:196px/);
    expect(island).toContain("data-advice-card");
  });
  it("au poste, une carte n'est jamais une prise pour déplacer l'île, et appuyer dessus n'agace pas le robot", () => {
    const poste = readFileSync(join(process.cwd(), "src/app/(poste)/poste/ile/poste-island.tsx"), "utf8");
    expect(poste).toMatch(/function isDragHandle[\s\S]*?\.isl-scroll, \[data-advice-card\]/);
    expect(poste).toContain("sheet: readCounterSheet(item.sheet)");
    const source = readFileSync(join(process.cwd(), "src/components/island/counter-island.tsx"), "utf8");
    expect(source).toContain('closest("button, input, form, a, [data-advice-card]")');
    // Le déploiement passe par isTap : un appui suivi d'un mouvement ne déploie rien.
    expect(source).toMatch(/const tap = isTap\(press\.current[\s\S]*?if \(tap\) onToggle\(\);/);
  });
});

describe("jamais l'origine du conseil sur une carte", () => {
  it("la fiche d'une suggestion du robot ne dit ni « robot » ni « modèle »", () => {
    const input: AdviceSheetInput = {
      shortReason: `${ROBOT_LABEL} · Hydrater la peau pendant le traitement.`,
      counterScript: null,
      patientReason: null,
      precautions: [],
      routine: null,
      opportunity: {
        answer: null,
        confirmedReason: null,
        rationale: `${ROBOT_LABEL}. Hydrater la peau pendant le traitement.`,
        clinicalContext: "Aucune règle écrite pour ce médicament : produit choisi par le modèle dans une liste fermée du stock de l'officine, puis passé par tous les garde-fous du moteur. À confirmer par la pharmacienne.",
        safetyNotes: [],
        benefits: [],
      },
      product: null,
    };
    const sheet = counterSheetOf(input, "CRÈME");
    expect(sheet.reasons).toEqual(["Hydrater la peau pendant le traitement."]);
    expect(JSON.stringify(sheet)).not.toMatch(/robot|modèle|à confirmer/i);
  });
});
