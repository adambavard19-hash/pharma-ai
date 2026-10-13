import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * Un titre de page (`<h1>`) avec son calque animé. Le `<h1>` reste un texte simple (lu, copié, cherché à l'identique) ;
 * juste après lui, un calque décoratif (`aria-hidden`, mêmes classes) reprend les mêmes mots, chacun dans un
 * `<span class="mot-flou">` numéroté. Dans l'espace pharmacie seulement (globals.css), le calque se pose sur le titre,
 * devenu transparent, et ses mots sortent d'un flou l'un après l'autre ; ailleurs le calque est masqué et rien ne change.
 * CSS seul, rendu serveur : le titre est là dès la première image, et immobile pour qui a demandé moins d'animations.
 */
export function PageTitle({ text, className }: { text: string; className?: string }) {
  let index = 0;
  return (
    <div className="pb-titre-boite">
      <h1 className={cn("pb-titre", className)}>{text}</h1>
      <p className={cn("pb-titre mot-calque", className)} aria-hidden="true">
        {text.split(/(\s+)/).map((part, key) =>
          part.trim() === "" ? (
            <Fragment key={key}>{part}</Fragment>
          ) : (
            <span key={key} className="mot-flou" style={{ "--mot": index++ } as React.CSSProperties}>
              {part}
            </span>
          ),
        )}
      </p>
    </div>
  );
}
