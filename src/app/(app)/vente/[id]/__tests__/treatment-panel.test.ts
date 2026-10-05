import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { line } from "./fixtures";

/**
 * La liste des médicaments : chaque ligne reste telle qu'elle est, et ce que
 * l'écran lui rattache (`renderAdvice`) se lit juste dessous, dans le même
 * cadre, avant la ligne suivante.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/prescriptions", () => ({ confirmLineReadingAction: vi.fn(), setLineDosageAction: vi.fn() }));
vi.mock("@/server/actions/counter-scan", () => ({ attachBarcodeAction: vi.fn() }));
vi.mock("@/server/actions/drug-identification", () => ({ attachSpecialtyAction: vi.fn(), detachSpecialtyAction: vi.fn(), searchSpecialtiesAction: vi.fn() }));

const { TreatmentPanel } = await import("../treatment-panel");

const LINES = [line({ id: "l1", drugName: "AMOXICILLINE ALMUS" }), line({ id: "l2", drugName: "DOLIPRANE 1000 mg" }), line({ id: "l3", drugName: "EXCLU", confirmed: false })];

const render = (renderAdvice?: Parameters<typeof TreatmentPanel>[0]["renderAdvice"]) =>
  renderToStaticMarkup(createElement(TreatmentPanel, { lines: LINES, canEdit: true, onEdit: vi.fn(), catalogAttribution: null, renderAdvice }));

describe("les conseils sous leur ligne", () => {
  it("sans conseils à rattacher, la liste est celle d'avant", () => {
    const html = render();
    expect(html).toContain("2 médicaments");
    expect(html).toContain("AMOXICILLINE ALMUS");
    expect(html).toContain("DOLIPRANE 1000 mg");
    expect(html).not.toContain("data-advice");
  });

  it("le bloc d'une ligne vient après cette ligne et avant la suivante, dans le même <li>", () => {
    const html = render((l) => createElement("p", { "data-advice": l.id }, `conseil de ${l.drugName}`));
    const items = html.split("<li ").slice(1);
    const first = items.find((item) => item.includes("AMOXICILLINE ALMUS"))!;
    const second = items.find((item) => item.includes("DOLIPRANE 1000 mg"))!;
    expect(first.indexOf("AMOXICILLINE ALMUS")).toBeLessThan(first.indexOf("conseil de AMOXICILLINE ALMUS"));
    expect(first).not.toContain("conseil de DOLIPRANE");
    expect(second.indexOf("DOLIPRANE 1000 mg")).toBeLessThan(second.indexOf("conseil de DOLIPRANE 1000 mg"));
  });

  it("une ligne non confirmée n'est pas affichée : on ne lui rattache rien", () => {
    const html = render((l) => createElement("p", { "data-advice": l.id }, `conseil de ${l.drugName}`));
    expect(html).not.toContain("EXCLU");
    expect(html).not.toContain('data-advice="l3"');
  });
});
