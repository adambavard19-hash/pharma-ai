import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdviceView } from "../types";
import { advice, alternative, text } from "./fixtures";

/**
 * Le bloc « À proposer avec ce médicament », rendu côté serveur : ce que le
 * pharmacien lit sous la ligne d'un médicament. Les actions et le routeur sont
 * remplacés ; on vérifie ce qui s'affiche — et surtout ce qui ne s'affiche pas.
 */

const mocks = vi.hoisted(() => ({
  choose: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock("@/server/actions/opportunities", () => ({ answerOpportunityAction: vi.fn() }));
vi.mock("@/server/actions/recommendations", () => ({
  addManualRecommendationAction: vi.fn(),
  chooseAdviceAlternativeAction: mocks.choose,
  declineRecommendationAction: vi.fn(),
  modifyRecommendationAction: vi.fn(),
  removeRecommendationAction: vi.fn(),
  reopenRecommendationAction: vi.fn(),
  replaceRecommendationAction: vi.fn(),
  setRecommendationPriceAction: vi.fn(),
}));

const { MedicationAdvice } = await import("../medication-advice");
const { chooseAlternative } = await import("../alternatives-list");

type Props = Partial<Parameters<typeof MedicationAdvice>[0]>;

const render = (recommendations: AdviceView[], props: Props = {}) =>
  renderToStaticMarkup(
    createElement(MedicationAdvice, {
      drugName: "AMOXICILLINE ALMUS",
      prescriptionId: "rx_1",
      recommendations,
      canDecide: true,
      canVerify: true,
      presentProductIds: new Set<string>(),
      inBasket: () => false,
      onAccept: vi.fn(),
      onCancelAccept: vi.fn(),
      ...props,
    }),
  );

/** Ce qui se lit sous « Autres références possibles », et seulement cela. */
const alternativesPart = (html: string) => {
  const start = html.indexOf("Autres références possibles");
  return start === -1 ? "" : html.slice(start);
};

const three = [
  alternative({ productId: "alt_1", name: "Ultra-Levure 200 mg", salePriceCents: 1190, quantity: 8 }),
  alternative({ productId: "alt_2", name: "Lactibiane Tolérance", brand: "Pileje", salePriceCents: 1650, quantity: 3, shortReason: null }),
  alternative({ productId: "alt_3", name: "Bion 3 Défense", brand: null, salePriceCents: 0, quantity: 21 }),
];

beforeEach(() => vi.clearAllMocks());

describe("le bloc sous un médicament", () => {
  it("un médicament sans conseil n'affiche rien de plus qu'avant", () => {
    expect(render([])).toBe("");
  });

  it("le titre du bloc, le produit conseillé, son prix, son stock, la raison et ce qu'on dit au patient", () => {
    const shown = text(render([advice({ id: "a", lineIds: ["l1"] })]));
    expect(shown).toContain("À proposer avec ce médicament");
    expect(shown).toContain("1 à décider");
    expect(shown).toContain("Flore Équilibre 10 milliards");
    expect(shown).toContain("14,90");
    expect(shown).toContain("En stock : 12");
    expect(shown).toContain("La flore intestinale peut être perturbée pendant la cure.");
    expect(shown).toContain("À dire au patient");
    expect(shown).toContain("Proposer ce produit");
    expect(shown).toContain("Ignorer");
  });

  it("la section porte le nom du médicament pour les lecteurs d'écran", () => {
    expect(render([advice()])).toContain('aria-label="À proposer avec AMOXICILLINE ALMUS"');
  });

  it("aucun plafond d'affichage : les huit conseils retenus se lisent tous, sous leur médicament", () => {
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => advice({ id, product: { ...advice().product!, id: `p_${id}`, name: `Produit ${id}` } }));
    const shown = text(render(eight));
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) expect(shown).toContain(`Produit ${id}`);
    expect(shown).toContain("8 à décider");
    expect(shown).not.toMatch(/Voir \d+ autres? proposition/);
  });

  it("sous un médicament, les suggestions ne sont pas numérotées", () => {
    expect(render([advice()])).not.toContain("Suggestion n°");
  });

  it("l'état « tout est décidé » quand chaque carte est acceptée", () => {
    expect(text(render([advice({ id: "a" })], { inBasket: () => true }))).toContain("Tout est décidé");
  });
});

describe("la famille du conseil", () => {
  it("la carte porte la pastille de sa famille, au nom du catalogue", () => {
    const html = render([advice({ id: "a", family: "COMPLEMENT" }), advice({ id: "b", family: "MEDICAMENT" }), advice({ id: "c", family: "PARAPHARMACIE" })]);
    expect(html.match(/data-family="COMPLEMENT"/g)).toHaveLength(1);
    expect(html.match(/data-family="MEDICAMENT"/g)).toHaveLength(1);
    expect(html.match(/data-family="PARAPHARMACIE"/g)).toHaveLength(1);
    const shown = text(html);
    for (const label of ["Complément alimentaire", "Médicament conseil", "Parapharmacie"]) expect(shown).toContain(label);
  });

  it("la pastille ne change rien d'autre à la carte : même produit, même prix, mêmes boutons", () => {
    const shown = text(render([advice({ family: "PARAPHARMACIE" })]));
    for (const part of ["Flore Équilibre 10 milliards", "14,90", "En stock : 12", "À dire au patient", "Proposer ce produit", "Ignorer"]) expect(shown).toContain(part);
  });

  it("la carte qui pose une question la porte aussi : on sait de quelle famille est le produit derrière", () => {
    const html = render([advice({ family: "COMPLEMENT", opportunity: { ...advice().opportunity!, requiresConfirmation: true, question: "Le patient a-t-il le ventre sensible ?" } })]);
    expect(text(html)).toContain("Une question au patient");
    expect(html.match(/data-family="COMPLEMENT"/g)).toHaveLength(1);
  });

  it("une routine porte la famille de sa première étape, une seule fois", () => {
    const step = (id: string, stepIndex: number) =>
      advice({ id, family: "PARAPHARMACIE", routine: { key: "routine_peau", title: "Routine peau", stepKey: `s${stepIndex}`, stepLabel: "Étape", stepIndex, stepCount: 3, benefit: "Pour la peau." } });
    expect(render([step("s0", 0), step("s1", 1), step("s2", 2)]).match(/data-family="PARAPHARMACIE"/g)).toHaveLength(1);
  });

  it("un conseil tranché, barré, n'a pas de pastille : il n'est plus proposé", () => {
    expect(render([advice({ status: "DECLINED", family: "COMPLEMENT" })])).not.toContain("data-family");
  });
});

describe("les autres références possibles", () => {
  it("aucune alternative : la phrase honnête, et le bouton « Changer de référence » reste là", () => {
    const html = render([advice({ alternatives: [] })]);
    expect(text(html)).toContain("Aucune autre référence adaptée en stock.");
    expect(html).not.toContain("Autres références possibles");
    expect(html).not.toContain("Choisir celle-ci");
    expect(text(html)).toContain("Changer de référence");
  });

  it("trois alternatives : une ligne chacune, avec nom, marque, prix, stock, raison et « Choisir celle-ci »", () => {
    const html = render([advice({ alternatives: three })]);
    const part = alternativesPart(html);
    const shown = text(part);
    expect(shown).toContain("Autres références possibles");
    expect(part.match(/Choisir celle-ci<\/button>/g)).toHaveLength(3);
    expect(shown).toContain("Ultra-Levure 200 mg");
    expect(shown).toContain("Biocodex");
    expect(shown).toContain("11,90");
    expect(shown).toContain("En stock : 8");
    expect(shown).toContain("Même besoin : soutient la flore pendant l'antibiothérapie.");
    expect(shown).toContain("Lactibiane Tolérance");
    expect(shown).toContain("En stock : 3");
    expect(shown).toContain("Bion 3 Défense");
    expect(shown).toContain("En stock : 21");
    expect(shown).not.toContain("Aucune autre référence");
  });

  it("une référence sans prix connu le dit, au lieu d'afficher 0 €", () => {
    const shown = text(alternativesPart(render([advice({ alternatives: three })])));
    expect(shown).toContain("Prix à renseigner");
    expect(shown).not.toContain("0,00");
  });

  it("une alternative n'a ni score chiffré ni marge", () => {
    const base = advice({ totalScore: 91.5, alternatives: three, product: { ...advice().product!, purchasePriceCents: 500 } });
    const part = text(alternativesPart(render([base])));
    expect(part).not.toMatch(/marge|score|91/i);
    // La carte principale, elle, garde sa marge : le contrôle est bien celui de la partie alternatives.
    expect(text(render([base]))).toContain("marge");
  });

  it("une alternative n'a jamais l'air d'un conseil accepté : le geste d'accepter reste celui de la carte principale", () => {
    const part = alternativesPart(render([advice({ alternatives: three })]));
    expect(part).not.toContain("bg-success-600");
    expect(part).not.toContain("Ajouté à la délivrance");
    expect(part).not.toContain("Proposer ce produit");
    // Le texte l'explique : choisir ne l'ajoute pas à la délivrance.
    expect(text(part)).toContain("sans l'ajouter à la délivrance");
  });

  it("chaque bouton se distingue pour un lecteur d'écran", () => {
    const html = render([advice({ alternatives: three })]);
    expect(html).toContain('aria-label="Choisir celle-ci : Ultra-Levure 200 mg"');
    expect(html).toContain('aria-label="Choisir celle-ci : Lactibiane Tolérance"');
  });

  it("grand écran : toutes visibles ; écran étroit : seule la première, les autres se déplient", () => {
    const html = render([advice({ alternatives: three })]);
    const rows = [...html.matchAll(/<li class="([^"]*gap-y-2[^"]*)"/g)].map((match) => match[1]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/(^| )flex( |$)/);
    expect(rows[0]).not.toContain("hidden");
    // Jamais masquées par défaut sur grand écran : `sm:flex` les remet.
    for (const row of rows.slice(1)) expect(row).toContain("hidden sm:flex");
    // Le bouton qui les déplie n'existe que sur écran étroit.
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*class="[^"]*sm:hidden[^"]*"[^>]*>Voir 2 autres références/);
  });

  it("deux alternatives : « Voir 1 autre référence » ; une seule : rien à déplier", () => {
    expect(text(render([advice({ alternatives: three.slice(0, 2) })]))).toContain("Voir 1 autre référence");
    const single = text(render([advice({ alternatives: three.slice(0, 1) })]));
    expect(single).not.toContain("Voir");
    expect(single).toContain("Choisir celle-ci");
  });

  it("une fois le conseil accepté, les alternatives disparaissent (et la phrase « aucune autre » aussi)", () => {
    const withAlternatives = render([advice({ id: "a", alternatives: three })], { inBasket: (id) => id === "a" });
    expect(withAlternatives).not.toContain("Autres références possibles");
    expect(withAlternatives).not.toContain("Choisir celle-ci");
    expect(text(withAlternatives)).toContain("Ajouté à la délivrance");
    expect(text(withAlternatives)).toContain("Annuler");

    const without = render([advice({ id: "a", alternatives: [] })], { inBasket: (id) => id === "a" });
    expect(without).not.toContain("Aucune autre référence");
  });

  it("le bouton « Annuler » de l'acceptation les fait revenir : le bloc ne dépend que de l'état de la délivrance", () => {
    const rec = advice({ id: "a", alternatives: three });
    expect(render([rec], { inBasket: () => true })).not.toContain("Choisir celle-ci");
    expect(render([rec], { inBasket: () => false })).toContain("Choisir celle-ci");
  });

  it("sans droit de décision : ni alternatives, ni phrase, ni boutons", () => {
    const html = render([advice({ alternatives: three })], { canDecide: false });
    expect(html).not.toContain("Autres références possibles");
    expect(html).not.toContain("Choisir celle-ci");
    expect(html).not.toContain("Proposer ce produit");
  });

  it("la question au patient passe d'abord : ni produit à proposer, ni alternatives, tant que le patient n'a pas répondu", () => {
    const asked = advice({
      alternatives: three,
      opportunity: { ...advice().opportunity!, requiresConfirmation: true, question: "Le patient a-t-il le ventre sensible ?" },
    });
    const html = render([asked]);
    const shown = text(html);
    expect(shown).toContain("Une question au patient");
    expect(shown).toContain("Le patient a-t-il le ventre sensible ?");
    expect(shown).toContain("Si oui, proposer Flore Équilibre 10 milliards");
    expect(html).not.toContain("Choisir celle-ci");
    expect(html).not.toContain("Autres références possibles");
    expect(html).not.toContain("Aucune autre référence");
    expect(shown).not.toContain("Proposer ce produit");
  });

  it("question déjà répondue « oui » : le produit et ses alternatives s'affichent", () => {
    const answered = advice({
      alternatives: three,
      opportunity: { ...advice().opportunity!, requiresConfirmation: true, question: "Le patient a-t-il le ventre sensible ?", answer: true, answeredAt: "2026-10-05T09:00:00.000Z" },
    });
    const html = render([answered]);
    expect(html).toContain("Choisir celle-ci");
    expect(text(html)).not.toContain("Une question au patient");
  });
});

describe("routine, tranchés, stock", () => {
  const routineStep = (id: string, stepIndex: number) =>
    advice({
      id,
      alternatives: three,
      routine: { key: "routine_peau", title: "Routine peau", stepKey: `s${stepIndex}`, stepLabel: ["Nettoyer", "Hydrater", "Protéger"][stepIndex], stepIndex, stepCount: 3, benefit: "Pour la peau." },
      product: { ...advice().product!, id: `p_${id}`, name: `Soin ${id}` },
    });

  it("une routine est une seule carte, ses étapes ensemble, et n'affiche pas d'alternatives par étape", () => {
    const html = render([routineStep("s0", 0), routineStep("s1", 1), routineStep("s2", 2)]);
    const shown = text(html);
    expect(html.match(/<article/g)).toHaveLength(1);
    expect(shown).toContain("Routine associée");
    expect(shown).toContain("Routine peau");
    for (const label of ["1. Nettoyer", "2. Hydrater", "3. Protéger"]) expect(shown).toContain(label);
    expect(shown).toContain("Proposer la routine");
    expect(shown).toContain("1 à décider");
    expect(html).not.toContain("Autres références possibles");
    expect(html).not.toContain("Choisir celle-ci");
  });

  it("un conseil refusé reste là où il était proposé, barré, avec « Revenir »", () => {
    const html = render([advice({ id: "a", status: "DECLINED", decidedBy: "Claire Martin", alternatives: three })]);
    const shown = text(html);
    expect(shown).toContain("Flore Équilibre 10 milliards");
    expect(shown).toContain("Refusé par le patient · Claire Martin");
    expect(shown).toContain("Revenir");
    expect(html).toContain("line-through");
    expect(html).not.toContain("Choisir celle-ci");
    expect(shown).not.toContain("à décider");
  });

  it("un conseil acheté s'affiche sans « Revenir »", () => {
    const shown = text(render([advice({ status: "PURCHASED" })]));
    expect(shown).toContain("Acheté");
    expect(shown).not.toContain("Revenir");
  });

  it("un conseil à zéro en stock n'est pas proposé, et le bloc le dit", () => {
    const empty = advice({ id: "vide", product: { ...advice().product!, quantity: 0, name: "Probiotique en rupture" } });
    const html = render([empty]);
    expect(text(html)).toContain("Non proposé faute de stock : Probiotique en rupture.");
    expect(html).not.toContain("Proposer ce produit");
    expect(html).not.toContain("Choisir celle-ci");
  });

  it("un conseil ouvert et un conseil refusé côte à côte : la carte d'abord, le tranché dessous", () => {
    const shown = text(render([advice({ id: "ouvert" }), advice({ id: "refuse", status: "DECLINED", product: { ...advice().product!, id: "p_2", name: "Autre probiotique" } })]));
    expect(shown.indexOf("Proposer ce produit")).toBeGreaterThan(-1);
    expect(shown.indexOf("Proposer ce produit")).toBeLessThan(shown.indexOf("Autre probiotique"));
  });
});

describe("choisir une alternative", () => {
  it("appelle l'action avec le conseil et la référence, et rend son message tel quel", async () => {
    mocks.choose.mockResolvedValue({ ok: true, data: null, message: "Conseil remplacé par Ultra-Levure 200 mg." });
    await expect(chooseAlternative("rec_1", "alt_1")).resolves.toEqual({ tone: "success", title: "Conseil remplacé par Ultra-Levure 200 mg." });
    expect(mocks.choose).toHaveBeenCalledWith({ recommendationId: "rec_1", productId: "alt_1" });
  });

  it("sans message de l'action : un libellé neutre, jamais une promesse", async () => {
    mocks.choose.mockResolvedValue({ ok: true, data: null });
    await expect(chooseAlternative("rec_1", "alt_1")).resolves.toEqual({ tone: "success", title: "Conseil remplacé" });
  });

  it("une action refusée : l'erreur du serveur est affichée telle quelle", async () => {
    mocks.choose.mockResolvedValue({ ok: false, error: "Cette référence n'est plus en stock." });
    await expect(chooseAlternative("rec_1", "alt_2")).resolves.toEqual({ tone: "error", title: "Cette référence n'est plus en stock." });
  });
});
