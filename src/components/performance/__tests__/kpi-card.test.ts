import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describeMetricDelta, describeRateDelta } from "../format";
import { KpiCard } from "../kpi-card";

/** Une carte de chiffre clé : la valeur, sa variation en mots, sa courbe — jamais une couleur seule. */

const render = (props: Partial<Parameters<typeof KpiCard>[0]> = {}) =>
  renderToStaticMarkup(createElement(KpiCard, { label: "Conseils proposés", value: "34", delta: null, ...props }));

describe("KpiCard", () => {
  it("affiche le nom et la valeur, tels qu'ils arrivent (rien n'est recalculé)", () => {
    const html = render({ label: "Chiffre d'affaires attribué", value: "287,00 €" });
    expect(html).toContain("Chiffre d&#x27;affaires attribué");
    expect(html).toContain("287,00 €");
    expect(html).toContain("tabular");
  });

  it("une hausse : flèche, texte, mots pour le lecteur d'écran", () => {
    const html = render({ delta: describeMetricDelta({ value: 34, previous: 30, deltaPct: 13.3, trend: "up" }), hint: "vs hier" });
    expect(html).toContain('data-trend="up"');
    expect(html).toContain("+13,3 %");
    expect(html).toContain("En hausse de 13,3 %");
    expect(html).toContain("vs hier");
  });

  it("une baisse est rouge et dite en toutes lettres", () => {
    const html = render({ delta: describeMetricDelta({ value: 10, previous: 20, deltaPct: -50, trend: "down" }) });
    expect(html).toContain('data-trend="down"');
    expect(html).toContain("En baisse de 50 %");
    expect(html).toContain("danger");
  });

  it("une période précédente vide : « Nouveau », jamais un pourcentage", () => {
    const html = render({ delta: describeMetricDelta({ value: 12, previous: 0, deltaPct: null, trend: "up" }) });
    expect(html).toContain("Nouveau");
    expect(html).not.toContain("%");
  });

  it("la variation d'un taux est en points, au singulier sous 2", () => {
    const html = render({ delta: describeRateDelta({ value: 0.6, previous: 0.585, deltaPoints: 1.5, trend: "up" }) });
    expect(html).toContain("+1,5 pts");
    expect(html).toContain("En hausse de 1,5 point");
    expect(html).not.toContain("1,5 points");
  });

  it("sans variation (null), pas de pastille ; l'indication reste affichée", () => {
    const html = render({ delta: null, hint: "TTC · vs hier" });
    expect(html).not.toContain("data-trend");
    expect(html).toContain("TTC · vs hier");
  });

  it("ni variation ni indication : pas de ligne vide", () => {
    const html = render({ delta: null });
    expect(html).not.toContain("data-trend");
    expect(html).not.toContain("text-text-tertiary\"></span>");
  });

  it("une mini-courbe nommée quand la série a au moins deux points", () => {
    const html = render({ spark: [1, 4, 2, 6] });
    expect(html).toContain('role="img"');
    expect(html).toContain("Évolution de « Conseils proposés » sur la période");
  });

  it("un seul point ou aucun : pas de courbe", () => {
    expect(render({ spark: [3] })).not.toContain('role="img"');
    expect(render({ spark: [] })).not.toContain('role="img"');
    expect(render({})).not.toContain('role="img"');
  });

  it("la carte mise en avant porte la marque ; les autres restent sobres", () => {
    const brand = render({ emphasis: "brand", spark: [1, 2] });
    const plain = render({ spark: [1, 2] });
    expect(brand).toContain('data-emphasis="brand"');
    expect(brand).toContain("from-brand-50");
    expect(brand).toContain("text-brand-600");
    expect(plain).toContain('data-emphasis="default"');
    expect(plain).not.toContain("from-brand-50");
    expect(plain).toContain("text-text-tertiary");
  });

  it("l'icône est décorative : cachée aux lecteurs d'écran", () => {
    const html = render({ icon: createElement("svg", { "data-icon": "oui" }) });
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-icon="oui"');
  });

  it("une longue valeur ne déborde pas de la carte (fluide, retour à la ligne permis)", () => {
    const html = render({ value: "123 456,78 €" });
    expect(html).toContain("clamp(");
    expect(html).toContain("break-words");
    expect(html).toContain("min-w-0");
  });
});
