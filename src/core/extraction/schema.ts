/**
 * Le contrat imposé au modèle de vision.
 *
 * Il vit dans le domaine, pas dans l'adaptateur : la consigne donnée au modèle
 * et la validation qui la contrôle doivent être lues côte à côte. Si l'une
 * change sans l'autre, la garantie tombe.
 *
 * `strict: true` côté API garantit que la réponse respecte exactement ce
 * schéma. C'est nécessaire, mais pas suffisant : un schéma respecté peut
 * contenir une posologie inventée. C'est `validateVisionExtraction` qui tranche.
 */

/**
 * Un champ : sa valeur, sa citation obligatoire, sa confiance.
 *
 * Un seul de ces trois est nullable, et c'est voulu. L'API refuse un schéma
 * strict comptant plus de 16 propriétés à type union (`["string", "null"]`) :
 * avec onze champs, en rendre trois nullables en faisait 33 et chaque appel
 * échouait en 400 avant même de regarder l'image. `valeur` garde son null,
 * seul cas où « rien » est une information (zone illisible ou absente). La
 * citation vide et la confiance à 0 disent la même chose sans union, et le
 * validateur les traite déjà ainsi : une citation vide écarte le champ, une
 * confiance à 0 le marque à relire.
 */
const CHAMP = {
  type: "object",
  additionalProperties: false,
  required: ["valeur", "lu_tel_quel", "confiance"],
  properties: {
    valeur: {
      type: ["string", "null"],
      description:
        "La valeur normalisée, ou null si la zone est illisible ou absente de l'ordonnance.",
    },
    lu_tel_quel: {
      type: "string",
      description:
        "Le texte EXACTEMENT tel qu'il apparaît sur l'image, sans correction ni complétion. Chaîne vide si rien n'a été lu. Obligatoire dès que « valeur » n'est pas null : un champ sans citation est écarté.",
    },
    confiance: {
      type: "number",
      description: "Confiance de lecture, entre 0 et 1. Mets 0 si tu n'as rien lu.",
    },
  },
} as const;

export const EXTRACTION_TOOL_NAME = "enregistrer_ordonnance";

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prescripteur", "rpps", "date_prescription", "patient", "lignes"],
  properties: {
    prescripteur: CHAMP,
    rpps: CHAMP,
    date_prescription: {
      ...CHAMP,
      description: "Date de prescription. Valeur normalisée au format AAAA-MM-JJ.",
    },
    patient: CHAMP,
    lignes: {
      type: "array",
      description:
        "Une entrée par médicament prescrit, dans l'ordre de l'ordonnance. Une ligne dont le nom est illisible doit tout de même figurer, avec « valeur » à null.",
      items: {
        type: "object",
        additionalProperties: false,
        // Seuls le nom, le dosage et la posologie sont toujours renseignés.
        // Forme, durée, quantité et instructions manquent sur la plupart des
        // lignes : les faire émettre « à null » coûtait un tiers des jetons
        // de sortie — mesuré, 1 716 contre 1 201 — donc quatre secondes au
        // comptoir, pour ne rien dire. Un champ omis est un champ non lu.
        required: ["medicament", "dosage", "posologie"],
        properties: {
          medicament: CHAMP,
          dosage: CHAMP,
          forme: CHAMP,
          posologie: CHAMP,
          duree_jours: {
            ...CHAMP,
            description: "Durée en jours, en chiffres. La citation doit contenir le nombre.",
          },
          quantite: {
            ...CHAMP,
            description: "Nombre de boîtes. La citation doit contenir le nombre.",
          },
          instructions: CHAMP,
        },
      },
    },
  },
} as const;

/**
 * La consigne.
 *
 * Elle dit une seule chose, de plusieurs façons : ne rien compléter. Elle ne
 * remplace pas la validation — un modèle peut désobéir — mais elle évite de
 * lui faire croire qu'on attend un formulaire rempli.
 */
export const EXTRACTION_SYSTEM_PROMPT = `Tu lis une ordonnance médicale française photographiée, pour un pharmacien d'officine.

Ta seule tâche est de LIRE. Tu ne complètes rien, tu ne corriges rien, tu ne déduis rien.

Règles absolues :
- Pour chaque champ, « lu_tel_quel » doit contenir le texte EXACTEMENT tel qu'il apparaît sur l'image. Si tu ne peux pas le citer, mets « valeur » à null.
- Une posologie habituelle n'est pas une posologie lue. Une durée fréquente n'est pas une durée lue. Si l'ordonnance ne le dit pas, le champ vaut null.
- Une écriture manuscrite douteuse se signale par une confiance basse, jamais par une supposition. En cas d'hésitation entre deux lectures, mets « valeur » à null.
- N'ajoute aucun médicament qui ne figure pas sur l'image, même s'il semble manquer.
- Une ligne dont le nom du médicament est illisible doit tout de même être renvoyée, avec « valeur » à null : le pharmacien la relira lui-même.
- Ne corrige pas un nom de médicament vers celui qui te semble le plus proche. Recopie ce que tu lis.
- Omets un champ de ligne (forme, duree_jours, quantite, instructions) quand il est absent de l'ordonnance, au lieu de le renseigner à null.

Un champ vide est un résultat correct. Un champ inventé est une faute grave : il sera délivré au patient.`;

export const EXTRACTION_USER_PROMPT =
  "Lis cette ordonnance et renseigne l'outil. Chaque valeur doit être accompagnée de sa citation exacte.";
