import type { ReactElement, ReactNode } from "react";

/**
 * Un rendu minimal pour tester les composants client sans navigateur (les
 * tests tournent sans DOM). Les hooks `useState`, `useTransition` et `useEffect`
 * de React sont remplacés (voir `vi.mock("react")` dans les tests) par ceux d'ici : la
 * valeur d'un état survit d'un rendu à l'autre, et une transition lance son
 * travail tout de suite. On rend l'arbre d'éléments, on y trouve un bouton ou
 * un champ, on appelle son gestionnaire, puis on rend à nouveau.
 */

let slots: unknown[] = [];
let cursor = 0;
const running: Promise<unknown>[] = [];

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
    return [false, (work) => void running.push(Promise.resolve(work()))];
  },
  /** Les effets ne tournent pas : il n'y a ni navigateur ni minuterie à brancher ici. */
  useEffect(): void {},
};

/** Monte un composant : chaque `render()` le rejoue avec les états conservés ; `settle()` attend les transitions lancées. */
export function mount<P>(component: (props: P) => ReactNode, props: P) {
  slots = [];
  running.length = 0;
  return {
    render(): ReactNode {
      cursor = 0;
      return component(props);
    },
    async settle() {
      while (running.length) await Promise.all(running.splice(0));
    },
  };
}

const isElement = (node: unknown): node is ReactElement<{ children?: ReactNode; [key: string]: unknown }> => typeof node === "object" && node !== null && "props" in node;

/** Tous les éléments de l'arbre (sans développer les composants : un `Button` reste un `Button`). */
export function allElements(node: ReactNode): ReactElement<{ children?: ReactNode; [key: string]: unknown }>[] {
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
export function find(node: ReactNode, test: (element: ReactElement<{ children?: ReactNode; [key: string]: unknown }>) => boolean, what: string) {
  const found = allElements(node).find(test);
  if (!found) throw new Error(`Élément introuvable : ${what}`);
  return found;
}

/** Le bouton dont le texte est exactement `label`. */
export const buttonLabelled = (node: ReactNode, label: string) => find(node, (element) => typeof element.type !== "string" && textOf(element.props.children).trim() === label, `bouton « ${label} »`);
