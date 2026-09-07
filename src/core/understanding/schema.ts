/**
 * Le contrat imposé au modèle : CLASSER, rien d'autre.
 *
 * Le modèle ne reçoit que les noms de médicaments et ce que le catalogue
 * national en publie ; il rend, par ligne, la substance, le code ATC et la
 * classe. Aucun texte libre : c'est ce qui rend l'appel court — une poignée
 * de jetons par ligne — et son résultat réutilisable, mis en cache par
 * médicament. Les besoins complémentaires et le contexte, eux, sont dérivés
 * localement par des règles écrites (`context.ts`), sans appel.
 *
 * Aucune union de types : chaque champ inconnu est une chaîne vide, jamais
 * `null`. Le validateur traduit « vide » en « inconnu ».
 */

export const UNDERSTANDING_TOOL_NAME = "classer_medicaments";

export const UNDERSTANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["medicaments"],
  properties: {
    medicaments: {
      type: "array",
      description:
        "Une entrée par ligne reçue, dans le même ordre. Aucune ligne ajoutée, aucune omise.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ligne", "substance", "code_atc", "classe_therapeutique", "confiance"],
        properties: {
          ligne: { type: "integer", description: "L'index de la ligne, tel que reçu." },
          substance: {
            type: "string",
            description:
              "Dénomination commune internationale de la substance active, en majuscules. Chaîne vide si tu n'es pas sûr.",
          },
          code_atc: {
            type: "string",
            description:
              "Code ATC de la substance (5 à 7 caractères, ex. J01FA06). Chaîne vide si tu n'es pas sûr : un code faux est pire qu'un code absent.",
          },
          classe_therapeutique: {
            type: "string",
            description:
              "Classe thérapeutique en français, en trois mots au plus (ex. « Antibiotique macrolide »). Chaîne vide si inconnue.",
          },
          confiance: { type: "number", description: "Confiance de la classification, entre 0 et 1." },
        },
      },
    },
  },
} as const;

export const UNDERSTANDING_SYSTEM_PROMPT = `Tu classes des médicaments prescrits en France pour un pharmacien d'officine.

Pour chaque ligne : substance active (DCI), code ATC, classe thérapeutique. Tu n'affirmes que ce que tu sais avec certitude. Un champ vide est une réponse correcte ; un code ATC inventé est une faute.

Quand une ligne indique des substances publiées par le catalogue national, elles font foi : classe à partir d'elles.

Tu ne rédiges rien d'autre : ni conseil, ni produit, ni phrase pour le patient.`;

export function buildUnderstandingUserPrompt(input: {
  lines: {
    lineIndex: number;
    drugName: string;
    dosage: string | null;
    form: string | null;
    officialName: string | null;
    officialSubstances: string[];
  }[];
}): string {
  const lines = input.lines.map((line) =>
    [
      `ligne ${line.lineIndex} : ${line.drugName}`,
      line.dosage,
      line.form,
      line.officialName ? `(catalogue national : ${line.officialName})` : null,
      line.officialSubstances.length > 0 ? `substances : ${line.officialSubstances.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" — "),
  );

  return `Médicaments (${input.lines.length} ligne${input.lines.length > 1 ? "s" : ""}) :
${lines.join("\n")}

Classe chaque ligne et renseigne l'outil.`;
}
