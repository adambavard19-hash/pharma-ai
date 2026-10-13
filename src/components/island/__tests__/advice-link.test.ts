import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { followAdviceLink, INITIAL_ISLAND, isTap, TAP_SLOP_PX } from "@/core/island/banner-flow";
import { adviceLink } from "@/core/poste/island-bridge";
import { isEssaiSale } from "@/core/poste/island-fixtures";
import { CounterIsland, type IslandAdvice } from "../counter-island";

/**
 * Un conseil de la bannière se lit en entier d'un clic (fondateur, 13 oct. 2026) : la carte (hors Vendu / Non vendu /
 * Modifier) est un lien vers la page de la vente, ouverte sur ce conseil. Au poste, il part au navigateur du PC ; sur
 * l'écran de vente, il déplie la carte de la même page. Un glisser n'ouvre rien.
 */

const ADVICE: IslandAdvice[] = [
  {
    name: "GEL LARMES ARTIFICIELLES HYDRATANT SANS CONSERVATEUR 10 G — LE NOM TRÈS LONG DU FOURNISSEUR",
    price: "8,90 €",
    reason: "Les antihistaminiques comme la cétirizine peuvent assécher les yeux : un gel lubrifiant soulage la sécheresse oculaire.",
    stock: "IN_STOCK",
    quantity: 6,
    href: "/vente/rx_1?conseil=rec_1#conseil-rec_1",
  },
  { name: "SÉRUM PHYSIOLOGIQUE", price: "5,90 €", stock: "LOW_STOCK", quantity: 2 },
];

const render = (props: { outside?: boolean; readOnly?: boolean; items?: IslandAdvice[] } = {}) =>
  renderToStaticMarkup(
    createElement(CounterIsland, {
      state: { ...INITIAL_ISLAND, stage: "advice", outcomes: [null, null] },
      items: props.items ?? ADVICE,
      drug: "CÉTIRIZINE 10 mg",
      alert: null,
      pills: [],
      readOnly: props.readOnly,
      adviceLinksOutside: props.outside,
      onAnswer: vi.fn(),
      onEmail: vi.fn(),
      onSendEmail: vi.fn(),
      onAddEmail: vi.fn(),
      onFinish: vi.fn(),
      onDismissAlert: vi.fn(),
    }),
  );

/** Le contenu du lien de la première carte (entre <a …> et </a>). */
const linkOf = (html: string) => /<a [^>]*data-advice-link=""[^>]*>([\s\S]*?)<\/a>/.exec(html);

describe("le lien d'un conseil, écrit par l'île du poste", () => {
  it("la page de la vente, ouverte sur ce conseil — relatif, donc vers le serveur qui sert l'île", () => {
    expect(adviceLink("rx_1", { id: "rec_1" })).toBe("/vente/rx_1?conseil=rec_1#conseil-rec_1");
  });

  it("pas de lien sans identifiant de conseil (serveur ancien), avec un identifiant douteux, ni pour la vente d'exemple", () => {
    expect(adviceLink("rx_1", { id: "" })).toBeUndefined();
    expect(adviceLink("rx_1", { id: "../admin" })).toBeUndefined();
    expect(adviceLink("rx 1", { id: "rec_1" })).toBeUndefined();
    expect(isEssaiSale("essai")).toBe(true);
    expect(isEssaiSale("essai-garde")).toBe(true);
    expect(isEssaiSale("rx_1")).toBe(false);
  });
});

describe("la carte d'un conseil dans l'île", () => {
  it("repliée, la carte n'est plus un lien : un appui la déploie sur place (le navigateur ne s'ouvre plus d'un appui)", () => {
    const html = render({ outside: true });
    expect(linkOf(html)).toBeNull();
    expect(html).toMatch(/<div role="button" tabindex="0" aria-expanded="false"[^>]*data-advice-toggle=""/);
    expect(html).toContain(">Vendu</button>");
  });

  it("le nom et la raison tiennent sur deux lignes, points de suspension compris — plus une ligne tronquée sèche", () => {
    const html = render({ outside: true });
    expect(html).toMatch(/<p class="[^"]*line-clamp-2[^"]*">GEL LARMES/);
    expect(html).toMatch(/<p class="line-clamp-2[^"]*"[^>]*>Les antihistaminiques/);
  });

  it("une carte sans page (vente d'exemple, site public) se lit sans lien, comme avant", () => {
    const html = render({ items: [ADVICE[1]] });
    expect(html).not.toContain("<a ");
    expect(html).toContain("SÉRUM PHYSIOLOGIQUE");
  });
});

describe("un clic, pas un glisser", () => {
  it(`au-delà de ${TAP_SLOP_PX} pixels entre l'appui et le relâché, ce n'est plus un clic`, () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 102 })).toBe(true);
    expect(isTap({ x: 100, y: 100 }, { x: 105, y: 100 })).toBe(false);
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 160 })).toBe(false);
    // Sans appui connu (clavier) : un clic.
    expect(isTap(null, { x: 0, y: 0 })).toBe(true);
  });

  it("après un glisser, le lien ne s'ouvre pas (ni l'onglet, ni la page n'est prévenue) ; un vrai clic suit le lien", () => {
    const dragged = { screenX: 400, screenY: 130, preventDefault: vi.fn() };
    const onOpen = vi.fn();
    expect(followAdviceLink({ x: 300, y: 120 }, dragged, onOpen)).toBe(false);
    expect(dragged.preventDefault).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    const clicked = { screenX: 301, screenY: 121, preventDefault: vi.fn() };
    expect(followAdviceLink({ x: 300, y: 120 }, clicked, onOpen)).toBe(true);
    expect(clicked.preventDefault).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
