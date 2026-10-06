import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ADVICE_FAMILIES, FAMILY_LABELS } from "@/core/ai/family";
import type { AdviceView } from "../types";
import { CompleteAdviceBanner, FamilyPill } from "../complete-advice";
import { advice, text } from "./fixtures";

/**
 * Le bandeau « Conseil complet » et la pastille de famille, rendus tels que le
 * pharmacien les lit. Le bandeau ne dit que ce qui est à l'écran : une famille
 * sans conseil n'est pas écrite, et sans conseil il ne s'affiche pas du tout.
 */

const ofFamily = (id: string, family: AdviceView["family"], overrides: Partial<AdviceView> = {}) =>
  advice({ id, family, product: { ...advice().product!, id: `p_${id}`, name: `Produit ${id}` }, ...overrides });

const asking = (id: string, question: string, overrides: Partial<NonNullable<AdviceView["opportunity"]>> = {}, extra: Partial<AdviceView> = {}) =>
  ofFamily(id, "COMPLEMENT", { opportunity: { ...advice().opportunity!, id: `opp_${id}`, requiresConfirmation: true, question, ...overrides }, ...extra });

const banner = (recommendations: AdviceView[]) => renderToStaticMarkup(createElement(CompleteAdviceBanner, { recommendations }));

describe("le bandeau « Conseil complet »", () => {
  it("dit, en une ligne, ce que l'ordonnance reçoit famille par famille", () => {
    const html = banner([ofFamily("a", "MEDICAMENT"), ofFamily("b", "COMPLEMENT"), ofFamily("c", "COMPLEMENT"), ofFamily("d", "PARAPHARMACIE"), ofFamily("e", "PARAPHARMACIE"), ofFamily("f", "PARAPHARMACIE")]);
    const shown = text(html);
    expect(shown).toContain("Conseil complet : 1 médicament conseil · 2 compléments alimentaires · 3 produits de parapharmacie");
    expect(html).toContain('aria-label="Conseil complet"');
  });

  it("une famille sans conseil n'est pas écrite : ni reproche, ni « 0 »", () => {
    const shown = text(banner([ofFamily("a", "COMPLEMENT")]));
    expect(shown).toContain("1 complément alimentaire");
    expect(shown).not.toContain("médicament");
    expect(shown).not.toContain("parapharmacie");
    expect(shown).not.toMatch(/\b0\b/);
  });

  it("aucun conseil : rien n'est affiché", () => {
    expect(banner([])).toBe("");
  });

  it("seulement des conseils tranchés ou écartés faute de stock : rien n'est affiché non plus", () => {
    expect(banner([ofFamily("a", "COMPLEMENT", { status: "DECLINED" }), ofFamily("b", "MEDICAMENT", { status: "PURCHASED" }), ofFamily("c", "PARAPHARMACIE", { product: { ...advice().product!, quantity: 0 } })])).toBe("");
  });

  it("une routine compte pour un conseil", () => {
    const step = (id: string, stepIndex: number) =>
      ofFamily(id, "PARAPHARMACIE", { routine: { key: "routine_peau", title: "Routine peau", stepKey: `s${stepIndex}`, stepLabel: "Étape", stepIndex, stepCount: 3, benefit: "" } });
    expect(text(banner([step("s0", 0), step("s1", 1), step("s2", 2)]))).toContain("Conseil complet : 1 produit de parapharmacie");
  });

  it("sans question en attente, aucune ligne « pour aller plus loin »", () => {
    expect(text(banner([ofFamily("a", "COMPLEMENT")]))).not.toContain("pour aller plus loin");
  });

  it("les questions en attente : leur nombre, puis le texte de chacune, en liste courte", () => {
    const html = banner([asking("a", "Le patient a-t-il le ventre sensible ?"), ofFamily("b", "PARAPHARMACIE"), asking("c", "A-t-il la gorge irritée ?")]);
    const shown = text(html);
    expect(shown).toContain("2 questions pour aller plus loin");
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(shown).toContain("Le patient a-t-il le ventre sensible ?");
    expect(shown).toContain("A-t-il la gorge irritée ?");
    expect(shown.indexOf("Le patient a-t-il le ventre sensible ?")).toBeLessThan(shown.indexOf("A-t-il la gorge irritée ?"));
  });

  it("une seule question : au singulier", () => {
    expect(text(banner([asking("a", "Le nez est-il bouché ?")]))).toContain("1 question pour aller plus loin");
  });

  it("une question déjà répondue (oui, non, ne sait pas) ou d'un conseil tranché n'y figure pas", () => {
    const html = banner([
      ofFamily("ok", "PARAPHARMACIE"),
      asking("oui", "Question répondue oui ?", { answer: true, answeredAt: "2026-10-05T09:00:00.000Z" }),
      asking("non", "Question répondue non ?", { answer: false, answeredAt: "2026-10-05T09:00:00.000Z" }),
      asking("inconnu", "Question sans réponse sûre ?", { answeredAt: "2026-10-05T09:00:00.000Z" }),
      { ...asking("refuse", "Question d'un conseil refusé ?"), status: "DECLINED" },
    ]);
    expect(text(html)).not.toContain("pour aller plus loin");
    expect(html).not.toContain("<li");
  });

  it("sans conseil sous réserve, aucune ligne « de plus selon les réponses »", () => {
    expect(text(banner([ofFamily("a", "COMPLEMENT"), ofFamily("b", "PARAPHARMACIE")]))).not.toContain("de plus selon les réponses");
  });

  it("deux lignes honnêtes : ce qui est proposé, puis ce qui dépend d'une réponse (vente ORD-0770 : 5 conseils dont 2 sous question)", () => {
    const shown = text(
      banner([
        ofFamily("mouth-rinse", "PARAPHARMACIE"),
        asking("sore-throat", "Le patient a-t-il la gorge irritée ou douloureuse ?", { requiresConfirmation: true }, { family: "PARAPHARMACIE" }),
        asking("nasal-hygiene", "Le patient a-t-il aussi le nez bouché ou qui coule ?", { requiresConfirmation: true }, { family: "PARAPHARMACIE" }),
        ofFamily("opioid-transit", "COMPLEMENT"),
        ofFamily("digestive-tolerance", "COMPLEMENT"),
      ]),
    );
    // Avant : « 2 compléments alimentaires · 3 produits de parapharmacie » — trois produits de parapharmacie affirmés, un seul proposable.
    expect(shown).toContain("Conseil complet : 2 compléments alimentaires · 1 produit de parapharmacie");
    expect(shown).not.toContain("3 produits de parapharmacie");
    expect(shown).toContain("+ 2 de plus selon les réponses du patient (2 produits de parapharmacie)");
    expect(shown.indexOf("Conseil complet :")).toBeLessThan(shown.indexOf("+ 2 de plus"));
    expect(shown.indexOf("+ 2 de plus")).toBeLessThan(shown.indexOf("2 questions pour aller plus loin"));
  });

  it("le médicament conseil derrière une question n'est pas affirmé dans la ligne 1, mais annoncé sous réserve", () => {
    const shown = text(banner([ofFamily("a", "COMPLEMENT"), asking("m", "Le patient s'injecte-t-il lui-même ?", {}, { family: "MEDICAMENT" })]));
    const [first] = shown.split("+ 1 de plus");
    expect(first).toContain("Conseil complet : 1 complément alimentaire");
    expect(first).not.toContain("médicament");
    expect(shown).toContain("+ 1 de plus selon les réponses du patient (1 médicament conseil)");
  });

  it("rien d'écrit pour une famille absente, dans l'une comme dans l'autre ligne", () => {
    const shown = text(banner([ofFamily("a", "COMPLEMENT"), asking("b", "Q ?", {}, { family: "PARAPHARMACIE" })]));
    expect(shown).toContain("Conseil complet : 1 complément alimentaire");
    expect(shown).toContain("(1 produit de parapharmacie)");
    expect(shown).not.toContain("médicament");
    expect(shown).not.toMatch(/\b0\b/);
  });

  it("tous les conseils sous question : le bandeau reste, et dit qu'aucun n'est proposable sans réponse", () => {
    const shown = text(banner([asking("a", "Le nez est-il bouché ?", {}, { family: "PARAPHARMACIE" }), asking("b", "La gorge est-elle irritée ?", {}, { family: "PARAPHARMACIE" })]));
    expect(shown).toContain("Conseil complet : aucun conseil sans question pour l'instant");
    expect(shown).toContain("+ 2 de plus selon les réponses du patient (2 produits de parapharmacie)");
    expect(shown).toContain("2 questions pour aller plus loin");
  });

  it("une fois les questions répondues, le bandeau les compte parmi les conseils proposés", () => {
    const answered = { answer: true as boolean | null, answeredAt: "2026-10-05T09:00:00.000Z" as string | null };
    const shown = text(banner([asking("a", "Le nez est-il bouché ?", answered, { family: "PARAPHARMACIE" }), asking("b", "La gorge est-elle irritée ?", { answer: null, answeredAt: "2026-10-05T09:00:00.000Z" }, { family: "PARAPHARMACIE" })]));
    expect(shown).toContain("Conseil complet : 2 produits de parapharmacie");
    expect(shown).not.toContain("de plus selon les réponses");
    expect(shown).not.toContain("pour aller plus loin");
  });

  it("le geste de réponse reste sur la carte : le bandeau ne porte aucun bouton ni lien", () => {
    const html = banner([asking("a", "Le nez est-il bouché ?")]);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Oui");
  });
});

describe("la pastille de famille", () => {
  it("écrit le nom de la famille, tel que le catalogue le donne", () => {
    for (const family of ADVICE_FAMILIES) {
      const html = renderToStaticMarkup(createElement(FamilyPill, { family }));
      expect(text(html).trim()).toBe(FAMILY_LABELS[family]);
      expect(html).toContain(`data-family="${family}"`);
    }
    expect(FAMILY_LABELS).toEqual({ MEDICAMENT: "Médicament conseil", COMPLEMENT: "Complément alimentaire", PARAPHARMACIE: "Parapharmacie" });
  });

  it("reste neutre : jamais en rouge, en vert ni en orange, et lisible en clair comme en sombre (couleurs du thème)", () => {
    for (const family of ADVICE_FAMILIES) {
      const html = renderToStaticMarkup(createElement(FamilyPill, { family }));
      expect(html).not.toMatch(/danger|success|warning|red-|green-|amber-|orange-/);
      expect(html).toContain("text-text-secondary");
      expect(html).toContain("bg-surface-sunken");
    }
  });
});
