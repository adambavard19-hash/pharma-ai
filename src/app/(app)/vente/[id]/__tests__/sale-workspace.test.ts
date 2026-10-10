import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OUTCOME_MESSAGES } from "@/core/ai/outcome";
import type { AdviceView, SaleLineDraft } from "../types";
import { advice, alternative, line, text } from "./fixtures";
import { childOf, descendants, elementWithText, findByAttr, isInside, parseHtml, textOf, type HtmlNode } from "./html-tree";

/**
 * L'écran de vente, rendu côté serveur : où se lit chaque conseil, ce qui reste
 * dans la colonne de droite, et ce que voit un pharmacien devant une analyse
 * enregistrée avant le rattachement par médicament (aucune régression).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/opportunities", () => ({ answerOpportunityAction: vi.fn() }));
vi.mock("@/server/actions/counter-questions", () => ({ answerCounterQuestionAction: vi.fn() }));
vi.mock("@/server/actions/prescriptions", () => ({
  acknowledgeSafetyFindingsAction: vi.fn(),
  addPrescriptionLineAction: vi.fn(),
  confirmLineReadingAction: vi.fn(),
  setLineDosageAction: vi.fn(),
  verifyPrescriptionAction: vi.fn(),
}));
vi.mock("@/server/actions/recommendations", () => ({
  acceptRecommendationAction: vi.fn(),
  addManualRecommendationAction: vi.fn(),
  chooseAdviceAlternativeAction: vi.fn(),
  declineRecommendationAction: vi.fn(),
  modifyRecommendationAction: vi.fn(),
  removeRecommendationAction: vi.fn(),
  reopenRecommendationAction: vi.fn(),
  replaceRecommendationAction: vi.fn(),
  setRecommendationPriceAction: vi.fn(),
}));
vi.mock("@/server/actions/sales", () => ({ recordSaleAction: vi.fn() }));
vi.mock("@/server/actions/documents", () => ({ generateDocumentAction: vi.fn() }));
vi.mock("@/server/actions/regulation", () => ({ setRegulationCheckAction: vi.fn() }));
vi.mock("@/server/actions/counter-scan", () => ({ attachBarcodeAction: vi.fn(), resetCounterAction: vi.fn() }));
vi.mock("@/server/actions/patients", () => ({ updateConsentAction: vi.fn() }));
vi.mock("@/server/actions/drug-identification", () => ({
  attachSpecialtyAction: vi.fn(),
  detachSpecialtyAction: vi.fn(),
  searchSpecialtiesAction: vi.fn(),
}));

const { SaleWorkspace } = await import("../sale-workspace");

type Props = Parameters<typeof SaleWorkspace>[0];

const AMOX = line({ id: "l_amox", position: 0, drugName: "AMOXICILLINE ALMUS" });
const DOLI = line({ id: "l_doli", position: 1, drugName: "DOLIPRANE 1000 mg" });
const LINES: SaleLineDraft[] = [AMOX, DOLI];

const flore = advice({ id: "r_flore", lineIds: ["l_amox"], product: { ...advice().product!, id: "p_flore", name: "Flore Équilibre" } });
const gorge = advice({ id: "r_gorge", lineIds: ["l_doli"], product: { ...advice().product!, id: "p_gorge", name: "Pastilles gorge miel" }, opportunity: { ...advice().opportunity!, id: "opp_2", title: "Gorge irritée" } });

const baseProps = (overrides: Partial<Props> = {}): Props => ({
  prescription: { id: "rx_1", source: "UPLOAD", reference: "ORD-0779", status: "VALIDATED", verifiedAt: "2026-10-05T08:00:00.000Z", patientId: null, patientName: "Claire MARTIN", prescriberName: null, prescribedAt: null },
  patients: [],
  lines: LINES,
  findings: [],
  blockedOpportunities: [],
  recommendations: [],
  analysisRunId: "run_1",
  trace: null,
  understanding: null,
  permissions: { verify: true, decide: true, sell: true },
  catalogAttribution: null,
  identificationChangedSinceAnalysis: false,
  patientFactors: [],
  hasSale: false,
  patientData: true,
  outcome: "PROPOSALS",
  canImportStock: true,
  stockNotice: null,
  partnerCards: [],
  ...overrides,
});

const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(SaleWorkspace, baseProps(overrides)));
const at = (html: string, needle: string) => {
  const index = html.indexOf(needle);
  expect(index, `« ${needle} » introuvable`).toBeGreaterThan(-1);
  return index;
};
const count = (html: string, needle: string) => html.split(needle).length - 1;

beforeEach(() => vi.clearAllMocks());

describe("les conseils se lisent sous leur médicament", () => {
  it("chaque conseil est sous la ligne qui l'a déclenché, dans le cadre de la liste des médicaments", () => {
    const html = render({ recommendations: [flore, gorge] });
    const amox = at(html, "AMOXICILLINE ALMUS");
    const doli = at(html, "DOLIPRANE 1000 mg");
    const floreAt = at(html, "Flore Équilibre");
    const gorgeAt = at(html, "Pastilles gorge miel");
    // Médicament 1, son conseil, médicament 2, son conseil.
    expect(amox).toBeLessThan(floreAt);
    expect(floreAt).toBeLessThan(doli);
    expect(doli).toBeLessThan(gorgeAt);
    expect(count(html, "À proposer avec ce médicament</h3>")).toBe(2);
    expect(html).toContain('aria-label="À proposer avec AMOXICILLINE ALMUS"');
    expect(html).toContain('aria-label="À proposer avec DOLIPRANE 1000 mg"');
  });

  it("la zone générale disparaît quand tout est rattaché ; ne restent que ses éléments globaux, discrets", () => {
    const html = render({ recommendations: [flore, gorge], stockNotice: { tone: "ok", text: "Stock Winpharma vérifié il y a 3 min" } });
    const shown = text(html);
    expect(shown).not.toContain("Conseils pour ce patient");
    expect(shown).toContain("Stock Winpharma vérifié il y a 3 min");
    expect(shown).toContain("Ajouter un conseil de mon choix");
    expect(shown).not.toContain("Rien à proposer");
  });

  it("tout est rattaché, rien de global à dire, aucun droit d'ajouter : pas de zone générale vide", () => {
    const html = render({ recommendations: [flore, gorge], permissions: { verify: true, decide: false, sell: true } });
    expect(html).not.toContain('aria-label="Conseils pour ce patient"');
  });

  it("un médicament sans conseil n'affiche rien de plus : seule sa ligne", () => {
    const html = render({ recommendations: [gorge] });
    const beforeDoli = html.slice(0, at(html, "DOLIPRANE 1000 mg"));
    expect(beforeDoli).not.toContain("À proposer avec ce médicament");
    expect(count(html, "À proposer avec ce médicament</h3>")).toBe(1);
  });

  it("plusieurs lignes déclencheuses : sous la première de l'ordonnance, une seule fois", () => {
    const both = advice({ id: "r_both", lineIds: ["l_doli", "l_amox"], product: { ...advice().product!, id: "p_both", name: "Produit des deux" } });
    const html = render({ recommendations: [both] });
    expect(count(html, "Produit des deux")).toBe(1);
    expect(at(html, "AMOXICILLINE ALMUS")).toBeLessThan(at(html, "Produit des deux"));
    expect(at(html, "Produit des deux")).toBeLessThan(at(html, "DOLIPRANE 1000 mg"));
  });

  it("le lien vers une ligne non confirmée : le conseil ne disparaît pas, il passe dans « Conseils pour ce patient »", () => {
    const excluded = line({ id: "l_exclue", position: 2, drugName: "ORDONNANCE EXCLUE", confirmed: false });
    const orphan = advice({ id: "r_orphan", lineIds: ["l_exclue"], product: { ...advice().product!, id: "p_orphan", name: "Conseil orphelin" } });
    const html = render({ lines: [AMOX, DOLI, excluded], recommendations: [orphan] });
    expect(text(html)).toContain("Conseils pour ce patient");
    expect(count(html, "Conseil orphelin")).toBe(1);
    expect(html).not.toContain("À proposer avec ce médicament");
  });

  it("les alternatives s'affichent sous le conseil rattaché, pas ailleurs", () => {
    const withAlternatives = { ...flore, alternatives: [alternative({ productId: "alt_1", name: "Ultra-Levure 200 mg" }), alternative({ productId: "alt_2", name: "Bion 3 Défense" })] };
    const html = render({ recommendations: [withAlternatives, gorge] });
    expect(count(html, "Autres références possibles")).toBe(1);
    expect(at(html, "Flore Équilibre")).toBeLessThan(at(html, "Ultra-Levure 200 mg"));
    expect(at(html, "Ultra-Levure 200 mg")).toBeLessThan(at(html, "DOLIPRANE 1000 mg"));
    // L'autre conseil n'en a aucune : il le dit, sans en inventer.
    expect(text(html)).toContain("Aucune autre référence adaptée en stock.");
    expect(count(html, "Aucune autre référence adaptée en stock.")).toBe(1);
  });

  it("un médicament sans conseil le dit quand l'analyse rattache ses conseils aux médicaments, et se tait sur une analyse ancienne", () => {
    // Récente : le conseil est lié à l'amoxicilline, le Doliprane n'en a pas.
    const recent = render({ recommendations: [flore] });
    expect(count(recent, "Aucun conseil à proposer avec ce médicament.")).toBe(1);
    // Ancienne : aucun lien, les conseils sont dans la zone générale ; dire « aucun » serait faux.
    const legacy = render({ recommendations: [{ ...flore, lineIds: [] }] });
    expect(text(legacy)).not.toContain("Aucun conseil à proposer avec ce médicament.");
  });

  it("un conseil sans médicament lié montre ses alternatives enregistrées, et n'affirme jamais « aucune » quand rien n'a été enregistré", () => {
    const orphanWith = advice({ id: "r_orph1", lineIds: [], alternatives: [alternative({ productId: "alt_o", name: "Probiotique de repli" })], product: { ...advice().product!, id: "p_o1", name: "Conseil orphelin A" } });
    const orphanWithout = advice({ id: "r_orph2", lineIds: [], alternatives: [], product: { ...advice().product!, id: "p_o2", name: "Conseil orphelin B" } });
    const html = render({ recommendations: [orphanWith, orphanWithout] });
    expect(text(html)).toContain("Conseils pour ce patient");
    expect(count(html, "Autres références possibles")).toBe(1);
    expect(text(html)).toContain("Probiotique de repli");
    // Dans cette zone, l'absence d'alternatives n'est pas une affirmation (une analyse ancienne n'en a pas enregistré).
    expect(text(html)).not.toContain("Aucune autre référence adaptée en stock.");
  });

  it("un conseil déjà accepté (rechargement) entre dans la délivrance, et ses alternatives ne se montrent plus", () => {
    const accepted = { ...flore, status: "ACCEPTED", alternatives: [alternative()] } satisfies AdviceView;
    const html = render({ recommendations: [accepted] });
    expect(html).not.toContain("Choisir celle-ci");
    expect(text(html)).toContain("Ajouté à la délivrance");
    expect(text(html)).toContain("1 vente additionnelle");
  });
});

describe("le conseil complet : bandeau et familles", () => {
  const medicament = advice({ id: "r_med", family: "MEDICAMENT", lineIds: ["l_amox"], product: { ...advice().product!, id: "p_med", presentationId: "pres_1", name: "Spasfon Lyoc" } });
  const parapharmacie = advice({ id: "r_para", family: "PARAPHARMACIE", lineIds: ["l_doli"], product: { ...advice().product!, id: "p_para", name: "Crème apaisante" } });
  const blocking = [{ id: "f_block", severity: "BLOCKING", code: "DRUG_UNREADABLE", message: "Un nom de médicament est illisible.", subjectType: "PRESCRIPTION_LINE", acknowledged: false, details: null }];

  it("le bandeau se lit au-dessus des conseils, avec le mélange des familles", () => {
    const html = render({ recommendations: [flore, medicament, parapharmacie] });
    expect(text(html)).toContain("Conseil complet : 1 médicament conseil · 1 complément alimentaire · 1 produit de parapharmacie");
    expect(at(html, 'aria-label="Conseil complet"')).toBeLessThan(at(html, "À proposer avec ce médicament"));
    expect(at(html, 'aria-label="Conseil complet"')).toBeLessThan(at(html, "Flore Équilibre"));
    expect(count(html, 'aria-label="Conseil complet"')).toBe(1);
  });

  it("il compte les conseils sous les médicaments ET ceux de la zone générale", () => {
    const orphan = advice({ id: "r_orph", family: "COMPLEMENT", lineIds: [], product: { ...advice().product!, id: "p_orph", name: "Conseil orphelin" } });
    expect(text(render({ recommendations: [flore, orphan] }))).toContain("Conseil complet : 2 compléments alimentaires");
  });

  it("aucun conseil : pas de bandeau", () => {
    expect(render({ recommendations: [], outcome: "NO_RELEVANT_NEED" })).not.toContain("Conseil complet");
  });

  it("un seul conseil écarté faute de stock : pas de bandeau", () => {
    const empty = advice({ id: "v", lineIds: [], product: { ...advice().product!, id: "p_v", name: "Probiotique en rupture", quantity: 0 } });
    expect(render({ recommendations: [empty] })).not.toContain('aria-label="Conseil complet"');
  });

  it("alerte bloquante, saisie ou analyse en cours : pas de bandeau, rien ne se propose", () => {
    expect(render({ recommendations: [flore], findings: blocking })).not.toContain("Conseil complet");
    expect(render({ prescription: { ...baseProps().prescription, status: "NEEDS_VERIFICATION", verifiedAt: null }, recommendations: [flore] })).not.toContain("Conseil complet");
  });

  it("un conseil tranché ne compte plus", () => {
    const html = render({ recommendations: [flore, { ...gorge, status: "DECLINED" }] });
    expect(text(html)).toContain("Conseil complet : 1 complément alimentaire");
    expect(text(html)).not.toContain("2 compléments alimentaires");
  });

  it("chaque carte porte la pastille de sa famille, et rien d'autre n'y change", () => {
    const html = render({ recommendations: [medicament, parapharmacie] });
    expect(count(html, 'data-family="MEDICAMENT"')).toBe(1);
    expect(count(html, 'data-family="PARAPHARMACIE"')).toBe(1);
    expect(count(html, "Médicament conseil</span>")).toBe(1);
    expect(count(html, "Parapharmacie</span>")).toBe(1);
    // La pastille est dans la carte du conseil, sous son médicament.
    expect(at(html, "AMOXICILLINE ALMUS")).toBeLessThan(at(html, 'data-family="MEDICAMENT"'));
    expect(at(html, 'data-family="MEDICAMENT"')).toBeLessThan(at(html, "DOLIPRANE 1000 mg"));
    expect(text(html)).toContain("Proposer ce produit");
  });

  it("la question au patient est lue dans le bandeau ET posée sur la carte, qui garde les boutons", () => {
    const asked = advice({
      id: "r_q",
      family: "COMPLEMENT",
      lineIds: ["l_amox"],
      opportunity: { ...advice().opportunity!, id: "opp_q", requiresConfirmation: true, question: "Le patient a-t-il le ventre sensible ?" },
    });
    const html = render({ recommendations: [asked, parapharmacie] });
    const banner = html.slice(at(html, 'aria-label="Conseil complet"'), at(html, 'aria-labelledby="zone-traitement"'));
    // Le complément est derrière la question : il n'est pas affirmé, il est annoncé sous réserve.
    expect(text(banner)).toContain("Conseil complet : 1 produit de parapharmacie");
    expect(text(banner)).toContain("+ 1 de plus selon les réponses du patient (1 complément alimentaire)");
    expect(text(banner)).toContain("1 question pour aller plus loin");
    expect(text(banner)).toContain("Le patient a-t-il le ventre sensible ?");
    expect(banner).not.toContain("<button");
    // La carte pose la question et porte la pastille de la famille du produit.
    expect(count(text(html), "Une question au patient")).toBe(1);
    expect(count(html, 'data-family="COMPLEMENT"')).toBe(1);
    expect(html).toContain("Ne sait pas");
  });
});

describe("le bandeau compte ce que l'écran propose, pas ce qui attend une réponse", () => {
  const withQuestion = (id: string, family: AdviceView["family"], lineId: string, question: string) =>
    advice({ id, family, lineIds: [lineId], product: { ...advice().product!, id: `p_${id}`, name: `Produit ${id}` }, opportunity: { ...advice().opportunity!, id: `opp_${id}`, requiresConfirmation: true, question } });
  const open = (id: string, family: AdviceView["family"], lineId: string) => advice({ id, family, lineIds: [lineId], product: { ...advice().product!, id: `p_${id}`, name: `Produit ${id}` } });

  it("autant de conseils « sous réserve » dans le bandeau que de cartes « Une question au patient » à l'écran", () => {
    const recommendations = [open("a", "COMPLEMENT", "l_amox"), withQuestion("b", "PARAPHARMACIE", "l_amox", "Le nez est-il bouché ?"), withQuestion("c", "PARAPHARMACIE", "l_doli", "La gorge est-elle irritée ?"), open("d", "PARAPHARMACIE", "l_doli")];
    const html = render({ recommendations });
    const banner = text(html.slice(at(html, 'aria-label="Conseil complet"'), at(html, 'aria-labelledby="zone-traitement"')));
    expect(banner).toContain("Conseil complet : 1 complément alimentaire · 1 produit de parapharmacie");
    expect(banner).toContain("+ 2 de plus selon les réponses du patient (2 produits de parapharmacie)");
    expect(count(text(html), "Une question au patient")).toBe(2);
    // Les deux cartes « question » ne montrent pas leur produit comme proposé : ni « Proposer ce produit » pour elles.
    expect(count(text(html), "Proposer ce produit")).toBe(2);
  });

  it("le patient répond oui : le conseil sort de « sous réserve » et le bandeau l'ajoute à ceux qui sont proposés", () => {
    const answered = { ...withQuestion("b", "PARAPHARMACIE", "l_amox", "Le nez est-il bouché ?"), opportunity: { ...withQuestion("b", "PARAPHARMACIE", "l_amox", "Le nez est-il bouché ?").opportunity!, answer: true, answeredAt: "2026-10-06T09:00:00.000Z" } };
    const html = render({ recommendations: [open("a", "COMPLEMENT", "l_amox"), answered] });
    const banner = text(html.slice(at(html, 'aria-label="Conseil complet"'), at(html, 'aria-labelledby="zone-traitement"')));
    expect(banner).toContain("Conseil complet : 1 complément alimentaire · 1 produit de parapharmacie");
    expect(banner).not.toContain("de plus selon les réponses");
    expect(count(text(html), "Une question au patient")).toBe(0);
  });
});

describe("l'en-tête d'une carte : la pastille de famille ne prend pas la place du titre du besoin", () => {
  const medicament = advice({ id: "r_med", family: "MEDICAMENT", lineIds: ["l_amox"], product: { ...advice().product!, id: "p_med", presentationId: "pres_1", name: "Spasfon Lyoc" }, opportunity: { ...advice().opportunity!, id: "opp_med", title: "Tolérance digestive de l'antibiotique" } });
  const routineStep = (id: string, stepIndex: number) =>
    advice({
      id,
      family: "PARAPHARMACIE",
      lineIds: ["l_doli"],
      routine: { key: "routine_peau", title: "Routine peau", stepKey: `s${stepIndex}`, stepLabel: ["Nettoyer", "Hydrater", "Protéger"][stepIndex], stepIndex, stepCount: 3, benefit: "Pour la peau." },
      product: { ...advice().product!, id: `p_${id}`, name: `Soin ${id}` },
    });

  /**
   * Ce que la structure doit garantir, sans nommer une classe de style : la
   * pastille est RANGÉE DANS le bloc du titre, derrière le texte du titre — elle
   * n'est pas une colonne de plus de l'en-tête qui prendrait sa part de la ligne.
   */
  const headerOf = (html: string, kind: string, title: string) => {
    const root = parseHtml(html);
    const pill = findByAttr(root, "data-family").find((candidate) => textOf(candidate.parent?.parent?.parent ?? root).includes(kind) && textOf(candidate.parent!.parent!).includes(title));
    expect(pill, `pastille de l'en-tête « ${kind} » introuvable`).toBeDefined();
    const slot = pill!.parent!; // l'emplacement de la pastille
    const titleBlock = slot.parent!; // le bloc du titre, qui l'abrite
    const band = titleBlock.parent!; // l'en-tête de la carte
    // Le bloc du titre n'est PAS l'en-tête entier : l'icône de la carte est à côté de lui, pas dedans.
    expect(descendants(titleBlock).some((node) => node.tag === "svg")).toBe(false);
    expect(descendants(band).some((node) => node.tag === "svg")).toBe(true);
    expect(band.children.indexOf(titleBlock)).toBeGreaterThan(0);
    return { pill: pill!, slot, titleBlock, band, root };
  };

  it("carte de conseil : le texte du titre, puis la pastille, dans le même bloc ; « Suggestion n° » reste à part", () => {
    const html = render({ recommendations: [medicament] });
    const { pill, slot, titleBlock, band } = headerOf(html, "Conseil associé", "Tolérance digestive de l'antibiotique");
    const text = elementWithText(titleBlock, "Conseil associé Tolérance digestive de l'antibiotique");
    // Le texte (nature du conseil + titre du besoin) et la pastille sont deux enfants du même bloc, dans cet ordre.
    expect(text.parent).toBe(titleBlock);
    expect(titleBlock.children.indexOf(text)).toBeLessThan(titleBlock.children.indexOf(slot));
    expect(textOf(slot)).toBe("Médicament conseil");
    // La pastille n'est pas une colonne de l'en-tête : l'en-tête n'a que l'icône et le bloc du titre.
    expect(findByAttr(band, "data-family")).toHaveLength(1);
    expect(isInside(pill, titleBlock)).toBe(true);
    expect(childOf(band, pill)).toBe(titleBlock);
    // Le titre n'est pas dans l'emplacement de la pastille : elle ne le contient ni ne le suit sur sa ligne par construction.
    expect(textOf(slot)).not.toContain("Tolérance");
  });

  it("« Suggestion n° » (zone générale) est un élément d'en-tête à part : ni dans le bloc du titre, ni avec la pastille", () => {
    const orphan = advice({ id: "r_orph", family: "COMPLEMENT", lineIds: [], product: { ...advice().product!, id: "p_orph", name: "Conseil orphelin" }, opportunity: { ...advice().opportunity!, id: "opp_orph", title: "Besoin sans médicament" } });
    const html = render({ recommendations: [orphan] });
    const { titleBlock, band } = headerOf(html, "Conseil associé", "Besoin sans médicament");
    expect(textOf(titleBlock)).not.toContain("Suggestion");
    expect(textOf(band)).toContain("Suggestion n°1");
    const suggestion = elementWithText(band, "Suggestion n°1");
    expect(childOf(band, suggestion)).not.toBe(titleBlock);
    expect(band.children.indexOf(childOf(band, suggestion)!)).toBeGreaterThan(band.children.indexOf(titleBlock));
  });

  it("carte de routine : même structure (le titre de la routine, puis la pastille de sa première étape)", () => {
    const html = render({ recommendations: [routineStep("s0", 0), routineStep("s1", 1), routineStep("s2", 2)] });
    const { slot, titleBlock, band } = headerOf(html, "Routine associée", "Routine peau");
    const text = elementWithText(titleBlock, "Routine associée Routine peau");
    expect(titleBlock.children.indexOf(text)).toBeLessThan(titleBlock.children.indexOf(slot));
    expect(textOf(slot)).toBe("Parapharmacie");
    expect(findByAttr(band, "data-family")).toHaveLength(1);
  });

  it("une seule pastille par carte : jamais une copie pour téléphone et une autre pour grand écran", () => {
    const html = render({ recommendations: [medicament] });
    expect(count(html, 'data-family="MEDICAMENT"')).toBe(1);
    expect(count(html, "Médicament conseil</span>")).toBe(1);
  });

  it("carte « question au patient » : la pastille est dans l'en-tête, avant la question qu'elle ne réduit pas", () => {
    const asked = advice({ id: "r_q", family: "COMPLEMENT", lineIds: ["l_amox"], opportunity: { ...advice().opportunity!, id: "opp_q", requiresConfirmation: true, question: "Le patient a-t-il le ventre sensible ?" } });
    const html = render({ recommendations: [asked] });
    const root = parseHtml(html);
    const [pill] = findByAttr(root, "data-family");
    const header = pill.parent!;
    expect(textOf(header)).toBe("Une question au patient Complément alimentaire");
    // La question elle-même est un bloc à part, APRÈS cet en-tête : la pastille ne la touche pas.
    const card = header.parent!;
    const question = card.children.find((child) => typeof child !== "string" && textOf(child) === "Le patient a-t-il le ventre sensible ?");
    expect(question).toBeDefined();
    expect(card.children.indexOf(header)).toBeLessThan(card.children.indexOf(question!));
    expect(isInside(pill, question as HtmlNode)).toBe(false);
  });
});

describe("la mise en page", () => {
  it("deux colonnes inégales sur grand écran (gauche large, droite environ 370 px), une seule en dessous", () => {
    const html = render({ recommendations: [flore] });
    expect(html).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]");
    expect(html).not.toContain("lg:grid-cols-2");
  });

  it("la colonne de droite ne garde que la délivrance et les gammes partenaires", () => {
    const html = render({
      recommendations: [flore],
      partnerCards: [{ brandId: "b1", slug: "avene", name: "Avène", partnerName: "Pierre Fabre", logoUrl: null, universe: "DERMOCOSMETIQUE" }],
    });
    const delivery = at(html, 'aria-labelledby="zone-delivrance"');
    const partner = at(html, 'aria-labelledby="gammes-partenaires"');
    // Les conseils sont dans la colonne de gauche, avant la délivrance.
    expect(at(html, "Flore Équilibre")).toBeLessThan(delivery);
    expect(at(html, "Ajouter un conseil de mon choix")).toBeLessThan(delivery);
    // La délivrance d'abord ; les gammes partenaires à part, jamais mêlées aux conseils.
    expect(delivery).toBeLessThan(partner);
    const rightColumn = html.slice(delivery);
    expect(rightColumn).not.toContain("À proposer avec ce médicament");
    expect(rightColumn).not.toContain("Proposer ce produit");
    expect(rightColumn).not.toContain("Conseils pour ce patient");
    expect(html.slice(0, delivery)).not.toContain("gamme partenaire");
  });

  it("les vigilances du traitement passent avant la liste, donc avant toute proposition", () => {
    const html = render({
      recommendations: [flore],
      findings: [{ id: "f1", severity: "WARNING", code: "VIGILANCE", message: "Vigilance", subjectType: "OPPORTUNITY", acknowledged: false, details: { key: "hepatique", version: "1", kind: "MONITORING", title: "Surveillance", subtitle: "Bilan hépatique", drugNames: ["DOLIPRANE"], explanation: "Surveiller.", concerned: [], patientAdvice: null, sources: ["ANSM"] } }],
    });
    expect(at(html, "Bilan hépatique")).toBeLessThan(at(html, 'aria-labelledby="zone-traitement"'));
    expect(at(html, 'aria-labelledby="zone-traitement"')).toBeLessThan(at(html, "Flore Équilibre"));
  });
});

describe("une analyse enregistrée avant le rattachement par médicament", () => {
  const old = (id: string, name: string) => advice({ id, lineIds: [], alternatives: [], product: { ...advice().product!, id: `p_${id}`, name } });

  it("tous les conseils vont dans « Conseils pour ce patient », sous les médicaments, comme avant et sans erreur", () => {
    const html = render({ recommendations: [old("a", "Produit A"), old("b", "Produit B"), old("c", "Produit C")] });
    const shown = text(html);
    expect(shown).toContain("Conseils pour ce patient");
    expect(shown).toContain("3 à décider");
    expect(at(html, "DOLIPRANE 1000 mg")).toBeLessThan(at(html, "Conseils pour ce patient"));
    expect(at(html, "Conseils pour ce patient")).toBeLessThan(at(html, "Produit A"));
    expect(at(html, "Produit A")).toBeLessThan(at(html, "Produit B"));
    expect(at(html, "Produit B")).toBeLessThan(at(html, "Produit C"));
    expect(at(html, "Produit C")).toBeLessThan(at(html, 'aria-labelledby="zone-delivrance"'));
    expect(html).not.toContain("À proposer avec ce médicament");
  });

  it("aucune promesse sur des alternatives qu'on ne connaît pas : ni liste, ni « aucune autre référence »", () => {
    const html = render({ recommendations: [old("a", "Produit A")] });
    expect(html).not.toContain("Autres références possibles");
    expect(html).not.toContain("Aucune autre référence");
    expect(html).not.toContain("Choisir celle-ci");
  });

  it("plus de plafond de trois cartes : les cinq conseils se lisent, sans « Voir autres propositions »", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => old(id, `Produit ${id.toUpperCase()}`));
    const html = render({ recommendations: five });
    for (const id of ["A", "B", "C", "D", "E"]) expect(html).toContain(`Produit ${id}`);
    expect(text(html)).not.toMatch(/Voir \d+ autres? proposition/);
  });

  it("les suggestions restent numérotées dans cette zone, comme avant", () => {
    const html = render({ recommendations: [old("a", "Produit A"), old("b", "Produit B")] });
    expect(html).toContain("Suggestion n°1");
    expect(html).toContain("Suggestion n°2");
  });

  it("les conseils tranchés orphelins restent dans la zone générale, barrés, avec « Revenir »", () => {
    const declined = advice({ id: "d", status: "DECLINED", lineIds: [], product: { ...advice().product!, id: "p_d", name: "Produit refusé" } });
    const html = render({ recommendations: [declined] });
    expect(text(html)).toContain("Produit refusé");
    expect(text(html)).toContain("Revenir");
    expect(html).toContain("line-through");
  });

  it("rien n'a été proposé du tout : l'issue de l'analyse parle, une seule fois", () => {
    const html = render({ recommendations: [], outcome: "NO_RELEVANT_NEED" });
    const shown = text(html);
    expect(shown).toContain("Ajouter un conseil de mon choix");
    expect(count(shown, OUTCOME_MESSAGES.NO_RELEVANT_NEED.title)).toBe(1);
    expect(shown).not.toContain("Conseils pour ce patient");
  });

  it("des conseils rattachés mais rien en zone générale : l'issue « rien à proposer » ne s'affiche pas", () => {
    const html = render({ recommendations: [flore], outcome: "NO_RELEVANT_NEED" });
    expect(text(html)).not.toContain(OUTCOME_MESSAGES.NO_RELEVANT_NEED.title);
  });

  it("un conseil écarté faute de stock est dit, et ne devient pas une carte", () => {
    const empty = advice({ id: "v", lineIds: [], product: { ...advice().product!, id: "p_v", name: "Probiotique en rupture", quantity: 0 } });
    const html = render({ recommendations: [empty] });
    expect(text(html)).toContain("Non proposé faute de stock : Probiotique en rupture.");
    expect(html).not.toContain("Proposer ce produit");
  });
});

describe("alerte bloquante, saisie et analyse en cours", () => {
  const blocking = [{ id: "f_block", severity: "BLOCKING", code: "DRUG_UNREADABLE", message: "Un nom de médicament est illisible.", subjectType: "PRESCRIPTION_LINE", acknowledged: false, details: null }];

  it("verrouillé : le message s'affiche une fois, en tête de la liste ; aucun conseil, nulle part", () => {
    const html = render({ recommendations: [flore, gorge, advice({ id: "x", lineIds: [] })], findings: blocking });
    expect(count(html, "En attente de la vérification de sécurité")).toBe(1);
    expect(at(html, "En attente de la vérification de sécurité")).toBeLessThan(at(html, 'aria-labelledby="zone-traitement"'));
    expect(html).not.toContain("À proposer avec ce médicament");
    expect(html).not.toContain("Proposer ce produit");
    expect(html).not.toContain("Flore Équilibre");
    expect(html).not.toContain("Ajouter un conseil de mon choix");
    // Les médicaments, eux, restent lisibles.
    expect(html).toContain("AMOXICILLINE ALMUS");
  });

  it("verrouillé : l'avis de stock reste lisible", () => {
    const html = render({ recommendations: [flore], findings: blocking, stockNotice: { tone: "warning", text: "Stock non synchronisé depuis 2 h" } });
    expect(text(html)).toContain("Stock non synchronisé depuis 2 h");
  });

  it("pas verrouillé : le message n'apparaît pas", () => {
    expect(render({ recommendations: [flore] })).not.toContain("En attente de la vérification de sécurité");
  });

  it("ordonnance en cours de saisie : la zone de droite explique que les conseils apparaîtront sous chaque médicament", () => {
    const html = render({ prescription: { ...baseProps().prescription, status: "NEEDS_VERIFICATION", verifiedAt: null }, recommendations: [flore] });
    const shown = text(html);
    expect(shown).toContain("Les conseils apparaîtront sous chaque médicament");
    expect(shown).not.toContain("au plus trois propositions");
    expect(html).not.toContain("À proposer avec ce médicament");
    expect(html).not.toContain("Conseils pour ce patient");
  });
});
