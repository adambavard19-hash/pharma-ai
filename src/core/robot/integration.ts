import { z } from "zod";

/**
 * L'intégration d'un robot de dispensation (BD Rowa…) : l'architecture, pas la promesse.
 *
 * Aujourd'hui AUCUN robot n'est branché. Ce module ne sait que quatre choses :
 *
 *   1. quels fabricants le titulaire peut désigner (une liste de choix, pas une liste
 *      de compatibilités) ;
 *   2. quels paramètres techniques un connecteur aura besoin de connaître, et comment
 *      les valider avant de les garder ;
 *   3. à quel stade en est l'intégration d'un couple (fabricant, logiciel) — toujours
 *      « en préparation » tant qu'un connecteur n'est pas inscrit dans
 *      `ROBOT_CONNECTORS`, qui est VIDE exprès ;
 *   4. que le logiciel de l'officine (LGO) et le robot sont DEUX flux, qui ne portent
 *      pas les mêmes informations : le stock d'un côté, les produits demandés au robot
 *      de l'autre.
 *
 * Pour brancher un robot le jour venu : ajouter un connecteur dans `ROBOT_CONNECTORS`
 * (fabricant, logiciels, stade, flux, paramètres), et son code côté agent. L'écran, la
 * validation de la configuration et le test de connexion le prennent en compte sans
 * autre changement. Voir docs/robot.md pour ce qu'on sait et ce qu'on ignore.
 *
 * Module pur : aucune base, aucune session, aucun réseau.
 */

// ---- Le choix du fabricant ---------------------------------------------------------------------

export type RobotManufacturer = {
  id: string;
  label: string;
  /** L'interface avec le logiciel quand elle est publiquement documentée (docs/robot.md), sinon `null`. */
  knownInterface: string | null;
};

/**
 * Une liste de CHOIX, pas de compatibilités : désigner un fabricant ne dit pas qu'il est
 * pris en charge. À compléter d'après les officines équipées.
 */
export const ROBOT_MANUFACTURERS: readonly RobotManufacturer[] = [
  { id: "bd-rowa", label: "BD Rowa", knownInterface: "WWKS2" },
  { id: "mach4", label: "Mach4", knownInterface: null },
  { id: "willach", label: "Willach", knownInterface: null },
  { id: "apostore", label: "Apostore", knownInterface: null },
  { id: "autre", label: "Autre fabricant ou je ne sais pas", knownInterface: null },
];

export function robotManufacturerLabel(id: string | null | undefined): string | null {
  return ROBOT_MANUFACTURERS.find((candidate) => candidate.id === id)?.label ?? null;
}

// ---- Les paramètres techniques -----------------------------------------------------------------

/** Comment le logiciel et le robot se parlent chez cette officine, si on le sait. */
export const ROBOT_LINK_KINDS = [
  { id: "unknown", label: "Je ne sais pas" },
  { id: "network", label: "Réseau (TCP/IP)" },
  { id: "file", label: "Fichier ou journal" },
  { id: "serial", label: "Câble série (COM)" },
] as const;

export type RobotLinkKind = (typeof ROBOT_LINK_KINDS)[number]["id"];

const MANUFACTURER_IDS = ROBOT_MANUFACTURERS.map((m) => m.id) as [string, ...string[]];
const LINK_IDS = ROBOT_LINK_KINDS.map((k) => k.id) as [RobotLinkKind, ...RobotLinkKind[]];

/** Un champ vide du formulaire vaut « non renseigné ». */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au maximum.`)
    // Pas de caractère de contrôle (retour à la ligne, octet nul…) : ces valeurs finiront un jour dans une configuration.
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Caractère non valide.")
    .nullish()
    .transform((value) => value || null);

/**
 * La configuration d'un robot, telle qu'elle est gardée. `strict()` : toute clé inconnue est
 * REFUSÉE — et d'abord un mot de passe, un jeton ou une clé, qu'aucun champ de cet écran ne
 * demande et que rien ne doit stocker en clair. Si un futur connecteur a besoin d'un secret,
 * il aura son propre stockage chiffré, pas cette configuration.
 */
export const robotSetupSchema = z
  .object({
    manufacturer: z.enum(MANUFACTURER_IDS, { message: "Choisissez un fabricant dans la liste." }),
    /** « Autre fabricant » : son nom, tel que le titulaire le connaît. */
    manufacturerOther: optionalText(60),
    model: optionalText(60),
    linkKind: z.enum(LINK_IDS).default("unknown"),
    /** Nom de machine ou adresse IPv4 du poste qui pilote le robot. Jamais d'adresse web, de chemin ni d'espace. */
    host: optionalText(80).refine((value) => value === null || /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value), "Un nom de machine ou une adresse comme 192.168.1.20, sans espace ni « http:// »."),
    port: z
      .union([z.number(), z.string()])
      .nullish()
      .transform((value, ctx) => {
        if (value === null || value === undefined || value === "") return null;
        const port = typeof value === "number" ? value : Number(String(value).trim());
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          ctx.addIssue({ code: "custom", message: "Un port est un nombre entre 1 et 65535." });
          return z.NEVER;
        }
        return port;
      }),
    /** Le dossier ou le fichier où le logiciel du robot écrit ses échanges, s'il y en a un. Lu un jour par le poste, jamais par PharmaBoost. */
    journalPath: optionalText(300),
  })
  .strict();

export type RobotSetup = z.output<typeof robotSetupSchema>;
export type RobotSetupInput = z.input<typeof robotSetupSchema>;

/**
 * Ce que le PHARMACIEN renseigne : le fabricant et le modèle, rien d'autre. Les paramètres techniques ne sont pas à
 * lui : ils se règlent depuis l'espace d'assistance (`robotTechnicalSchema`), et un enregistrement du pharmacien
 * ne les efface pas (voir `mergeRobotSetup`).
 */
export const robotIdentitySchema = z
  .object({
    manufacturer: z.enum(MANUFACTURER_IDS, { message: "Choisissez un fabricant dans la liste." }),
    manufacturerOther: optionalText(60),
    model: optionalText(60),
  })
  .strict();

export type RobotIdentityInput = z.input<typeof robotIdentitySchema>;

/** Les paramètres techniques d'une future intégration : réservés à l'assistance. Même validation que la configuration complète. */
export const robotTechnicalSchema = z
  .object({
    linkKind: robotSetupSchema.shape.linkKind,
    host: robotSetupSchema.shape.host,
    port: robotSetupSchema.shape.port,
    journalPath: robotSetupSchema.shape.journalPath,
  })
  .strict();

export type RobotTechnicalInput = z.input<typeof robotTechnicalSchema>;

/**
 * La configuration complète à partir de ce qui existe déjà et de ce qui change : le pharmacien change l'identité
 * (le fabricant et le modèle) sans effacer les paramètres techniques ; l'assistance change les paramètres sans
 * toucher à l'identité.
 */
export function mergeRobotSetup(current: RobotSetup | null, change: Partial<RobotSetupInput>): ReturnType<typeof robotSetupSchema.safeParse> {
  const base = current ?? { linkKind: "unknown" as const };
  return robotSetupSchema.safeParse({ ...base, ...change });
}

/** La clé sous laquelle la configuration est gardée dans les paramètres de l'officine. */
export const ROBOT_SETTINGS_KEY = "robot";

/** Ce qu'on relit de la base : un contenu abîmé ou périmé se traite comme « rien de renseigné », jamais comme une erreur de page. */
export function readRobotSetup(raw: unknown): RobotSetup | null {
  const parsed = robotSetupSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** « BD Rowa Vmax », ou le nom saisi pour un autre fabricant. */
export function describeRobot(setup: Pick<RobotSetup, "manufacturer" | "manufacturerOther" | "model"> | null): string | null {
  if (!setup) return null;
  const maker = setup.manufacturer === "autre" ? setup.manufacturerOther || "Robot" : (robotManufacturerLabel(setup.manufacturer) ?? "Robot");
  return [maker, setup.model].filter(Boolean).join(" ");
}

// ---- Le stade de l'intégration -----------------------------------------------------------------

export type RobotStage = "PREPARING" | "DIAGNOSING" | "TESTING" | "AVAILABLE";

export const ROBOT_STAGE_LABELS: Record<RobotStage, string> = {
  PREPARING: "Intégration en préparation",
  DIAGNOSING: "Diagnostic en cours dans une officine",
  TESTING: "En essai dans une officine",
  AVAILABLE: "Disponible",
};

/** Ce qu'un flux apporte à PharmaBoost, et comment. */
export type RobotFlow = {
  /** L'information qui circule. */
  carries: string;
  /** Par quel moyen elle arrive. */
  via: string;
  stage: RobotStage;
};

export type RobotConnector = {
  id: string;
  manufacturer: string;
  /** Les logiciels avec lesquels ce connecteur a été essayé. */
  lgos: readonly string[];
  stage: Exclude<RobotStage, "PREPARING">;
  flows: { lgo: RobotFlow; robot: RobotFlow };
  /** Les paramètres que ce connecteur lit dans la configuration. */
  settings: readonly (keyof RobotSetup)[];
};

/**
 * Les connecteurs robot existants. VIDE : aucun robot n'a été branché ni essayé en officine.
 * Y inscrire un connecteur est le SEUL moyen de faire dire « en essai » ou « disponible » à
 * l'application.
 */
export const ROBOT_CONNECTORS: readonly RobotConnector[] = [];

export type RobotIntegration = {
  stage: RobotStage;
  label: string;
  connector: RobotConnector | null;
};

export function resolveRobotIntegration(manufacturer: string | null | undefined, lgo: string | null | undefined, connectors: readonly RobotConnector[] = ROBOT_CONNECTORS): RobotIntegration {
  const connector = connectors.find((candidate) => candidate.manufacturer === manufacturer && (!lgo || candidate.lgos.includes(lgo))) ?? null;
  const stage = connector?.stage ?? "PREPARING";
  return { stage, label: ROBOT_STAGE_LABELS[stage], connector };
}

// ---- Deux flux, deux informations --------------------------------------------------------------

export type FlowDescription = { key: "lgo" | "robot"; title: string; carries: string; via: string; stage: RobotStage; stageLabel: string };

/**
 * Le flux du LOGICIEL (le stock : ce qu'il y a en rayon, en quelle quantité, à quel prix) et
 * celui du ROBOT (les produits que le logiciel lui demande de sortir : la délivrance en
 * cours). Ils ne portent pas les mêmes informations et n'arrivent pas par le même chemin :
 * le premier existe aujourd'hui, par fichier ; le second est en préparation.
 */
export function describeRobotFlows(integration: RobotIntegration): [FlowDescription, FlowDescription] {
  const connector = integration.connector;
  const lgo: RobotFlow = connector?.flows.lgo ?? { carries: "Le stock : les références en rayon, leurs quantités et leurs prix.", via: "Un fichier exporté de votre logiciel, ou le dossier PharmaBoost.", stage: "AVAILABLE" };
  const robot: RobotFlow = connector?.flows.robot ?? { carries: "Les produits que le logiciel demande au robot de sortir : la délivrance en cours.", via: "À établir avec l'éditeur du logiciel et le fabricant du robot.", stage: "PREPARING" };
  return [
    { key: "lgo", title: "Votre logiciel", ...lgo, stageLabel: lgo.stage === "AVAILABLE" ? "Disponible par fichier" : ROBOT_STAGE_LABELS[lgo.stage] },
    { key: "robot", title: "Votre robot", ...robot, stageLabel: ROBOT_STAGE_LABELS[robot.stage] },
  ];
}

// ---- Ce qui déclenche les conseils -------------------------------------------------------------

export type TriggerSource = "SCAN" | "ROBOT";

/**
 * Un jour, une délivrance en cours détectée par le robot suivra le MÊME chemin qu'un bip :
 * des codes de produit, une heure, une source (voir agent/src/robot.ts, qui sait déjà lire un
 * journal quand un technicien en a observé le format). Ce type fixe le contrat ; rien ne
 * l'émet encore côté robot.
 */
export type DispenseSignal = { source: TriggerSource; codes: string[]; at: Date };

export type TriggerStatus = { source: TriggerSource; title: string; state: "ACTIVE" | "INACTIVE" | "PREPARING"; detail: string };

/** Ce qui déclenche aujourd'hui l'affichage des conseils au comptoir : la douchette seulement. */
export function describeTriggers(input: { postsOnline: number; integration: RobotIntegration }): TriggerStatus[] {
  const scan: TriggerStatus =
    input.postsOnline > 0
      ? { source: "SCAN", title: "La douchette", state: "ACTIVE", detail: "Chaque boîte bipée affiche ses conseils." }
      : { source: "SCAN", title: "La douchette", state: "INACTIVE", detail: "Il faut un poste de comptoir relié pour que le bip affiche des conseils." };
  const robot: TriggerStatus =
    input.integration.stage === "AVAILABLE"
      ? { source: "ROBOT", title: "Le robot", state: "ACTIVE", detail: "Une délivrance demandée au robot affiche ses conseils." }
      : { source: "ROBOT", title: "Le robot", state: "PREPARING", detail: "Détecter la délivrance en cours est en préparation : pour l'instant, rien n'est lu du robot." };
  return [scan, robot];
}
