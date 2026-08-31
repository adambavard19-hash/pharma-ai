/**
 * Ce que l'application a le droit d'affirmer sur les interactions.
 *
 * Une phrase de couverture n'est pas de la décoration : c'est la différence
 * entre « nous avons vérifié » et « nous n'avons rien trouvé dans ce que nous
 * savons regarder ». Elle est donc calculée ici, à partir de faits — un
 * référentiel est chargé ou non, une ligne est rattachée au catalogue national
 * ou non — et jamais rédigée à la main dans un composant.
 */

export type InteractionCatalogState =
  | { status: "NOT_LOADED" }
  | {
      status: "LOADED";
      sourceName: string;
      sourceVersion: string;
      /** Date de la version du référentiel, jamais celle de notre import. */
      sourceUpdatedAt: string | null;
      importedAt: string;
      ruleCount: number;
      classMemberCount: number;
    };

export type InteractionCoverage = {
  /** Le référentiel est-il chargé ? */
  loaded: boolean;
  analysedCount: number;
  unanalysedCount: number;
  /** Phrase principale, affirmative et vérifiable. */
  headline: string;
  /** Précision affichée juste en dessous, plus discrète. */
  detail: string;
};

/**
 * Le thésaurus national n'est plus mis à jour.
 *
 * L'ANSM a arrêté cette édition : la dernière version date de septembre 2023 et
 * le document reste consultable sans actualisation. Un pharmacien qui s'appuie
 * dessus doit le savoir — le taire reviendrait à présenter une base figée comme
 * un référentiel vivant.
 */
export const ANSM_THESAURUS_NOTICE =
  "Le thésaurus national des interactions n'est plus mis à jour par l'ANSM depuis septembre 2023. Vérifiez la version chargée et complétez par votre source habituelle.";

export function describeCoverage(input: {
  catalog: InteractionCatalogState;
  analysedCount: number;
  unanalysedCount: number;
}): InteractionCoverage {
  const { catalog, analysedCount, unanalysedCount } = input;
  const total = analysedCount + unanalysedCount;

  if (catalog.status === "NOT_LOADED") {
    return {
      loaded: false,
      analysedCount,
      unanalysedCount,
      headline: "Les interactions entre médicaments prescrits ne sont pas analysées.",
      detail:
        "Aucun référentiel d'interactions n'est chargé dans Pharma.ai. Seules les redondances de substance active sont détectées, à partir du catalogue national.",
    };
  }

  const source = `${catalog.sourceName} ${catalog.sourceVersion}`;

  if (analysedCount === 0) {
    return {
      loaded: true,
      analysedCount,
      unanalysedCount,
      headline: "Aucune ligne n'a pu être confrontée au référentiel d'interactions.",
      detail:
        total === 0
          ? `Aucune ligne confirmée. Référentiel disponible : ${source}.`
          : `${total === 1 ? "La ligne n'est pas rattachée" : `Les ${total} lignes ne sont pas rattachées`} au catalogue national : leur composition est inconnue, donc invérifiable. Référentiel disponible : ${source}.`,
    };
  }

  // Le cas qui compte le plus : une analyse partielle. Afficher « aucune
  // interaction » alors qu'une ligne n'a pas pu être examinée serait faux.
  if (unanalysedCount > 0) {
    return {
      loaded: true,
      analysedCount,
      unanalysedCount,
      headline: `Interactions vérifiées sur ${analysedCount} ligne${analysedCount > 1 ? "s" : ""} sur ${total}.`,
      detail: `${unanalysedCount} ligne${unanalysedCount > 1 ? "s ne sont pas rattachées" : " n'est pas rattachée"} au catalogue national : sa composition est inconnue, aucune interaction ne peut être recherchée pour elle. Source : ${source}.`,
    };
  }

  return {
    loaded: true,
    analysedCount,
    unanalysedCount,
    headline: `Interactions vérifiées entre les ${analysedCount} médicaments confirmés.`,
    detail: `Source : ${source}. L'absence d'alerte vaut pour ce référentiel seul, et ne dispense pas du jugement professionnel.`,
  };
}
