import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OUTCOME_MESSAGES } from "@/core/ai/outcome";
import type { AdviceView, SaleLineDraft } from "../types";
import { advice, alternative, line, text } from "./fixtures";

/**
 * L'écran de vente, rendu côté serveur : où se lit chaque conseil, ce qui reste
 * dans la colonne de droite, et ce que voit un pharmacien devant une analyse
 * enregistrée avant le rattachement par médicament (aucune régression).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/opportunities", () => ({ answerOpportunityAction: vi.fn() }));
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
