import type { ReactElement, ReactNode } from "react";

/**
 * Un rendu minimal pour tester un composant client sans navigateur (les tests
 * tournent sans DOM). `useState` et `useTransition` de React sont remplacés
 * (voir `vi.mock("react")` dans le test) : un état survit d'un rendu à l'autre
 * et une transition lance son travail tout de suite. On rend l'arbre
 * d'éléments, on y trouve un bouton ou un champ, on appelle son gestionnaire,
 * puis on rend à nouveau.
 */

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
  useTransition(): [boolean, (work: () => unknown) => void] {
    return [false, (work) => void work()];
  },
};

type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;

const isElement = (node: unknown): node is Element => typeof node === "object" && node !== null && "props" in node;

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

/** Tous les éléments de l'arbre rendu. */
export function allElements(node: ReactNode): Element[] {
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
export function find(node: ReactNode, test: (element: Element) => boolean, what: string): Element {
  const found = allElements(node).find(test);
  if (!found) throw new Error(`Élément introuvable : ${what}`);
  return found;
}

/** Le `<button>` natif dont le texte est exactement `label`. */
export const nativeButton = (node: ReactNode, label: string) => find(node, (element) => element.type === "button" && textOf(element.props.children).trim() === label, `bouton « ${label} »`);

/** Le champ `<input name="…">`. */
export const field = (node: ReactNode, name: string) => find(node, (element) => element.type === "input" && element.props.name === name, `champ « ${name} »`);
