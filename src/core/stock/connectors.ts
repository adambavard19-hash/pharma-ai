/**
 * Les sources de synchronisation du stock — l'architecture, pas la promesse.
 *
 * Deux sources fonctionnent réellement : l'import d'un fichier exporté du
 * logiciel de l'officine, et l'agent PharmaBoost Connect, installé sur le
 * serveur de l'officine, qui lit l'export planifié du LGO et le pousse en
 * continu. Chaque LGO a son adaptateur dans l'agent : là où il range son
 * export, comment il l'écrit, où il garde ses scans d'ordonnances. Un LGO
 * dont l'adaptateur n'est pas encore mis au point dans une officine réelle est
 * déclaré comme tel — rien n'est annoncé comme branché tant que ce n'est pas
 * le cas.
 */

export type StockConnectorStatus = "AVAILABLE" | "NOT_CONNECTED";

export type StockSnapshotLine = {
  code: string | null;
  name: string | null;
  quantity: number;
  salePriceCents: number | null;
  purchasePriceCents: number | null;
};

export interface StockConnector {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly status: StockConnectorStatus;
  /** Lit l'état du stock chez la source. Absent tant que le connecteur n'est pas branché. */
  readSnapshot?: (config: Record<string, string>) => Promise<StockSnapshotLine[]>;
}

const FILE_IMPORT: StockConnector = {
  id: "file-import",
  label: "Import de fichier (CSV / Excel)",
  description: "L'export de votre logiciel, déposé et vérifié avant écriture. CIP13, EAN, désignation, quantité, prix, TVA.",
  status: "AVAILABLE",
};

/** Les connecteurs connus, branchés ou non. Ce que voit le titulaire. */
export function listStockConnectors(): StockConnector[] {
  return [
    FILE_IMPORT,
    {
      id: "pharmaboost-connect",
      label: "Agent PharmaBoost Connect",
      description: "Installé sur le serveur de l'officine, il lit l'export planifié du logiciel de gestion et le synchronise en continu.",
      status: "AVAILABLE",
    },
  ];
}

// --- Les logiciels de gestion d'officine (LGO) ------------------------------

export type LgoId = "lgpi" | "smart-rx" | "pharmaland" | "winpharma" | "leo" | "autre";

export type LgoDefinition = {
  id: LgoId;
  label: string;
  editor: string;
  /**
   * `PILOT` : l'adaptateur se met au point dans une officine réelle — l'agent
   * lit l'export planifié, dont l'emplacement est renseigné à l'installation.
   * `GENERIC` : aucun adaptateur spécifique ; export planifié à configurer.
   */
  adapter: "PILOT" | "GENERIC";
  /** Dossier surveillé par l'agent quand rien d'autre n'est indiqué (créé par l'installateur). */
  defaultExportPath: string;
  /** Dossier des ordonnances scannées, surveillé de la même façon. */
  defaultScansPath: string;
  /** Les étapes, dans le logiciel, pour produire l'export — vérifiées en officine quand l'adaptateur est PILOT. */
  exportSteps: string[];
  /** Indication donnée au titulaire pour activer l'export planifié. */
  exportHint: string;
};

/** Les dossiers que l'installateur crée sur le serveur de l'officine. */
export const DEFAULT_EXPORT_PATH = "C:\\PharmaBoost\\Export";
export const DEFAULT_SCANS_PATH = "C:\\PharmaBoost\\Ordonnances";

const GENERIC_EXPORT = {
  defaultExportPath: DEFAULT_EXPORT_PATH,
  defaultScansPath: DEFAULT_SCANS_PATH,
  exportHint: `Programmez, ou faites à la main, un export du stock (CSV, Excel ou PDF) dans ${DEFAULT_EXPORT_PATH} sur le serveur : l'agent le surveille et l'envoie dès qu'il change.`,
  exportSteps: [
    "Dans votre logiciel, lancez l'export ou l'édition du stock : code CIP, désignation, quantité, prix de vente.",
    `Enregistrez le fichier dans ${DEFAULT_EXPORT_PATH}. Un fichier remplacé est relu.`,
    "PharmaBoost Connect l'envoie dans la minute ; refaites l'export quand le stock doit être rafraîchi.",
  ],
};

export const LGO_DEFINITIONS: LgoDefinition[] = [
  {
    id: "lgpi", label: "LGPI", editor: "Pharmagest (Equasens)", adapter: "PILOT",
    defaultExportPath: DEFAULT_EXPORT_PATH, defaultScansPath: DEFAULT_SCANS_PATH,
    exportHint: "LGPI n'exporte pas son stock automatiquement : c'est l'édition d'inventaire, enregistrée en PDF dans le dossier surveillé, qui sert d'export. Aucune validation d'inventaire, rien n'est modifié dans LGPI.",
    exportSteps: [
      "Dans LGPI, ouvrez le module Inventaire, puis Édition.",
      "Dans « Saisie des critères d'édition », choisissez « Prix de vente » comme prix de référence, sur l'ensemble du stock.",
      `Aperçu, puis enregistrez l'édition en PDF dans ${DEFAULT_EXPORT_PATH} — le nom du fichier n'a pas d'importance.`,
      "PharmaBoost Connect envoie le fichier dans la minute. Refaites cette édition quand le stock doit être rafraîchi, chaque matin par exemple.",
    ],
  },
  { id: "smart-rx", label: "Smart Rx", editor: "Cegedim", adapter: "GENERIC", ...GENERIC_EXPORT },
  { id: "pharmaland", label: "Pharmaland", editor: "Pharmaland", adapter: "GENERIC", ...GENERIC_EXPORT },
  { id: "winpharma", label: "Winpharma", editor: "Winpharma", adapter: "GENERIC", ...GENERIC_EXPORT },
  { id: "leo", label: "Léo", editor: "Isipharm", adapter: "GENERIC", ...GENERIC_EXPORT },
  { id: "autre", label: "Autre logiciel", editor: "—", adapter: "GENERIC", ...GENERIC_EXPORT, exportHint: "Tout logiciel capable d'exporter son stock en CSV, Excel ou PDF vers un dossier du serveur." },
];

export function lgoLabel(id: string): string {
  return LGO_DEFINITIONS.find((lgo) => lgo.id === id)?.label ?? id;
}

// --- Fraîcheur du stock synchronisé -------------------------------------------

export type StockFreshness = "FRESH" | "STALE" | "DISCONNECTED";

/**
 * De quand date le stock affiché ? « Frais » tant que la dernière
 * synchronisation est plus récente que trois intervalles ; « périmé » au-delà ;
 * « déconnecté » quand l'agent ne donne plus signe de vie depuis une heure.
 * Un stock périmé reste consultable, mais le comptoir cesse d'affirmer « en
 * stock » et le dit.
 */
export function stockFreshness(input: {
  lastSyncAt: Date | null;
  lastSeenAt: Date | null;
  intervalSeconds: number;
  now?: Date;
}): { state: StockFreshness; ageSeconds: number | null } {
  const now = input.now ?? new Date();
  const ageSeconds = input.lastSyncAt ? Math.max(0, Math.round((now.getTime() - input.lastSyncAt.getTime()) / 1000)) : null;
  const seenAge = input.lastSeenAt ? (now.getTime() - input.lastSeenAt.getTime()) / 1000 : Number.POSITIVE_INFINITY;
  if (seenAge > 3600) return { state: "DISCONNECTED", ageSeconds };
  if (ageSeconds === null || ageSeconds > Math.max(900, input.intervalSeconds * 3)) return { state: "STALE", ageSeconds };
  return { state: "FRESH", ageSeconds };
}

export function describeAge(ageSeconds: number | null): string {
  if (ageSeconds === null) return "jamais";
  if (ageSeconds < 60) return "à l'instant";
  if (ageSeconds < 3600) return `il y a ${Math.round(ageSeconds / 60)} min`;
  if (ageSeconds < 86400) return `il y a ${Math.round(ageSeconds / 3600)} h`;
  return `il y a ${Math.round(ageSeconds / 86400)} j`;
}
