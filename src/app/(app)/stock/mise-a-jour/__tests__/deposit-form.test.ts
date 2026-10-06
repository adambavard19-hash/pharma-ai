import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Le bloc « Envoyer mon fichier » : replié par défaut, ouvert quand le dossier
 * n'est pas là, une zone, un fichier, un seul bouton. Le contrôle du fichier
 * et la réponse du serveur (réussi, en vérification, refusé) sont testés dans
 * `view.test.ts` ; ici, ce que l'écran propose avant tout envoi. Le
 * comportement (fichier trop gros, panne réseau, glisser-déposer) est dans
 * `deposit-form-comportement.test.ts`.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/server/actions/stock-deposits", () => ({ sendStockAction: vi.fn() }));

const { DepositForm } = await import("../deposit-form");

const render = (defaultOpen: boolean) => renderToStaticMarkup(createElement(DepositForm, { defaultOpen }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

describe("le bloc d'envoi du fichier", () => {
  it("replié quand le dossier PharmaBoost est là : seul le titre se voit, le détail est caché", () => {
    const html = render(false);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/id="envoi-fichier"[^>]*hidden/);
    expect(text(html)).toContain("Je n'ai pas le dossier PharmaBoost, ou je préfère envoyer le fichier ici");
  });

  it("ouvert quand il n'y a pas de dossier", () => {
    const html = render(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/id="envoi-fichier"[^>]*hidden/);
  });

  it("rappelle d'envoyer le stock complet, et dit quels fichiers sont lus", () => {
    const t = text(render(true));
    expect(t).toContain("Envoyez toujours votre stock complet (tous les produits en stock), pas seulement ce qui vient d'arriver.");
    expect(t).toContain("Ce qui n'est pas dans le fichier sera mis à 0 en stock.");
    expect(t).toContain("CSV, Excel (.xlsx) ou PDF d'inventaire");
    expect(t).toContain("8 Mo au plus");
    expect(t).toContain("Glissez votre fichier ici");
    expect(t).toContain("Choisir le fichier");
  });

  it("une zone, un champ fichier, un seul bouton — « Envoyer », inactif tant qu'aucun fichier n'est choisi", () => {
    const html = render(true);
    expect(html.match(/type="file"/g)).toHaveLength(1);
    expect(html).toContain('name="file"');
    expect(html).toContain('accept=".csv,.txt,.xlsx,.xls,.pdf');
    const buttons = html.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain("disabled");
    expect(text(html)).toContain("Envoyer");
  });

  it("aucun message d'issue avant l'envoi", () => {
    const t = text(render(true));
    expect(t).not.toContain("Lecture du fichier");
    expect(t).not.toContain("Votre stock est à jour");
    expect(t).not.toContain("n'a pas été mis à jour");
  });
});
