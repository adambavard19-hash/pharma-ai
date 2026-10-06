import type { ReactElement, ReactNode } from "react";

/**
 * Un rendu minimal pour tester les composants client (carte de chaleur, barres
 * par univers) sans navigateur : les tests tournent sans DOM. `useState` de
 * React est remplacé (voir `vi.mock("react")` dans les tests) : la valeur d'un
 * état survit d'un rendu à l'autre. On rend l'arbre d'éléments, on y trouve un
 * bouton, on appelle son gestionnaire, puis on rend à nouveau.
 *
 * Même technique que `src/app/(admin)/admin/depots-stock/__tests__/hooks.ts`.
 */

type AnyElement = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;

let slots: unknown[] = [];
let cursor = 0;

export const fakeHooks = {
  useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    const set = (next: T | ((previous: T) => T)) => {
      slots[index] = typeof next === "function" ? (next as (previous: T) => T)(slots[index] as T) : next;
    };
    return [slots[index] as T, set];
  },
};

/** Monte un composant : chaque `render()` le rejoue avec les états conservés. */
export function mount<P>(component: (props: P) => ReactNode, props: P) {
  slots = [];
  return {
    render(): ReactNode {
      cursor = 0;
      return component(props);
    },
  };
}

const isElement = (node: unknown): node is AnyElement => typeof node === "object" && node !== null && "props" in node;

/** Tous les éléments de l'arbre (sans développer les composants). */
export function allElements(node: ReactNode): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => allElements(child));
  if (!isElement(node)) return [];
  return [node, ...allElements(node.props.children)];
}

/** Le texte visible de l'arbre. */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isElement(node)) return textOf(node.props.children);
  return "";
}

/** Le premier élément qui répond au test, ou une erreur claire (un test ne doit jamais passer sur un élément absent). */
export function find(node: ReactNode, test: (element: AnyElement) => boolean, what: string): AnyElement {
  const found = allElements(node).find(test);
  if (!found) throw new Error(`Élément introuvable : ${what}`);
  return found;
}

/** Le `<button>` natif dont le texte est exactement `label`. */
export const nativeButton = (node: ReactNode, label: string) => find(node, (element) => element.type === "button" && textOf(element.props.children).trim() === label, `bouton « ${label} »`);

/** Le `<button>` natif d'une case de la grille (`data-weekday` / `data-hour`). */
export const cellButton = (node: ReactNode, weekday: number, hour: number) =>
  find(node, (element) => element.type === "button" && element.props["data-weekday"] === weekday && element.props["data-hour"] === hour, `case jour ${weekday}, ${hour} h`);
