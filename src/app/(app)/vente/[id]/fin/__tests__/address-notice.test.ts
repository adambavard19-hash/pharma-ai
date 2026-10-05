import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Ce que le comptoir lit sous le champ de l'adresse, en mode sans patient :
 * ce que devient l'adresse, et, quand l'e-mail du plan propose les nouveautés,
 * que l'abonnement est un acte à part du patient.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/server/actions/sealed-documents", () => ({ emailSealedDocumentAction: vi.fn(), generateSealedDocumentAction: vi.fn() }));
vi.mock("../document-workspace", () => ({ SalePanel: () => null }));

const { AddressNotice } = await import("../sealed-workspace");

const render = (newsOptInOffered: boolean) => renderToStaticMarkup(createElement(AddressNotice, { newsOptInOffered }));
// Le HTML échappe l'apostrophe : on compare le texte que lit le comptoir.
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("la mention sous l'adresse du patient", () => {
  it("sans proposition d'abonnement : la phrase d'origine, et rien de plus", () => {
    const html = render(false);
    expect(text(html)).toBe("L'adresse sert à cet envoi et n'est pas enregistrée. L'e-mail ne contient aucun nom de médicament : seulement le lien et le nombre de prises par moment.");
    expect(html).not.toMatch(/nouveautés/);
  });

  it("avec la proposition : l'envoi du plan n'enregistre toujours rien, et l'abonnement est dit comme un choix à part du patient", () => {
    const shown = text(render(true));
    expect(shown).toContain("L'adresse sert à cet envoi et n'est pas enregistrée.");
    expect(shown).toContain("Le message propose aussi au patient, en option, de recevoir les nouveautés de la pharmacie.");
    expect(shown).toContain("C'est son choix, à part de cet envoi : son adresse n'est conservée que s'il clique sur ce lien et confirme.");
  });

  it("ne promet rien de plus : ni envoi automatique, ni lien avec le plan, ni nom d'outil", () => {
    const shown = text(render(true));
    expect(shown).not.toMatch(/automatique|pharmaboost|pharma\.ai/i);
  });
});
