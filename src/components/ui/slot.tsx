import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type SlotProps = {
  children?: ReactNode;
  className?: string;
  /** Contenu injecté à la place des enfants de l'élément cible. */
  slotContent?: ReactNode;
} & Record<string, unknown>;

/**
 * Fusionne les props du parent dans son unique enfant.
 *
 * Permet d'écrire `<Button asChild><Link …/></Button>` sans imbriquer un
 * `<button>` dans un `<a>`. Ce composant n'utilise aucun hook : il reste
 * utilisable directement depuis un composant serveur.
 */
export function Slot({ children, className, slotContent, ...props }: SlotProps) {
  const child = Children.only(children);
  if (!isValidElement(child)) return null;

  const element = child as ReactElement<{ className?: string; children?: ReactNode }>;

  return cloneElement(element, {
    ...props,
    className: cn(className, element.props.className),
    ...(slotContent !== undefined ? { children: slotContent } : {}),
  } as never);
}
