import type { ReactElement, ReactNode } from "react";

/**
 * Un rendu minimal pour tester les composants client sans navigateur (les
 * tests tournent sans DOM). Les hooks `useState`, `useRef`, `useEffect` et
 * `useTransition` de React sont remplacés (voir `vi.mock("react")` dans les
 * tests) par ceux d'ici : la valeur d'un état survit d'un rendu à l'autre, un
 * effet s'exécute (et son nettoyage avec lui) quand ses dépendances changent, et
 * une transition lance son travail tout de suite. On rend l'arbre d'éléments,
 * on y trouve un bouton ou un champ, on appelle son gestionnaire, puis on rend
 * à nouveau — comme React le ferait après un changement d'état.
 *
 * Même technique que `src/app/(admin)/admin/depots-stock/__tests__/hooks.ts`
 * (copiée ici, pas partagée : la console garde la sienne), complétée des deux
 * hooks dont l'écran du titulaire a besoin (`useRef`, `useEffect`).
 */

type Cleanup = void | (() => void);
type EffectSlot = { deps: readonly unknown[] | undefined; cleanup: Cleanup };

let slots: unknown[] = [];
let cursor = 0;
let effectSlots: EffectSlot[] = [];
let effectCursor = 0;
let queued: { index: number; effect: () => Cleanup; deps: readonly unknown[] | undefined }[] = [];
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
  useRef<T>(initial: T): { current: T } {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index] as { current: T };
  },
  useTransition(): [boolean, (work: () => unknown) => void] {
    return [false, (work) => void running.push(Promise.resolve(work()))];
  },
  useEffect(effect: () => Cleanup, deps?: readonly unknown[]) {
    const index = effectCursor++;
    const previous = effectSlots[index];
    const changed = !previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((dep, position) => !Object.is(dep, (previous.deps as readonly unknown[])[position]));
    if (changed) queued.push({ index, effect, deps });
  },
};

/**
 * Monte un composant : chaque `render()` le rejoue avec les états conservés
 * (et de nouvelles propriétés si on les passe), puis lance les effets dont les
 * dépendances ont changé ; `settle()` attend les transitions lancées ;
 * `unmount()` exécute les nettoyages.
 */
export function mount<P>(component: (props: P) => ReactNode, initialProps: P) {
  slots = [];
  effectSlots = [];
  queued = [];
  running.length = 0;
  let props = initialProps;
  return {
    render(nextProps?: P): ReactNode {
      if (nextProps !== undefined) props = nextProps;
      cursor = 0;
      effectCursor = 0;
      queued = [];
      const tree = component(props);
      for (const { index, effect, deps } of queued) {
        const previous = effectSlots[index];
        if (typeof previous?.cleanup === "function") previous.cleanup();
        effectSlots[index] = { deps, cleanup: effect() };
      }
      queued = [];
      return tree;
    },
    async settle() {
      while (running.length) await Promise.all(running.splice(0));
    },
    unmount() {
      for (const slot of effectSlots) if (typeof slot?.cleanup === "function") slot.cleanup();
      effectSlots = [];
    },
  };
}

type AnyElement = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;

const isElement = (node: unknown): node is AnyElement => typeof node === "object" && node !== null && "props" in node;

/** Tous les éléments de l'arbre (sans développer les composants : un `Button` reste un `Button`). */
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
export function find(node: ReactNode, test: (element: AnyElement) => boolean, what: string) {
  const found = allElements(node).find(test);
  if (!found) throw new Error(`Élément introuvable : ${what}`);
  return found;
}

/** Tous les éléments d'un type (composant ou balise). */
export const allOfType = (node: ReactNode, type: unknown) => allElements(node).filter((element) => element.type === type);

/** Le bouton (composant) dont le texte est exactement `label`. */
export const buttonLabelled = (node: ReactNode, label: string) => find(node, (element) => typeof element.type !== "string" && textOf(element.props.children).trim() === label, `bouton « ${label} »`);
