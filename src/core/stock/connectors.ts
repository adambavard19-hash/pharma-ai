/**
 * Les sources de synchronisation du stock — l'architecture, pas la promesse.
 *
 * Aujourd'hui, une seule source fonctionne : l'import d'un fichier exporté du
 * logiciel de l'officine. Les connecteurs directs (LGO, grossistes) auront
 * cette même forme quand ils existeront : un identifiant, une capacité de
 * lecture du stock, et rien d'annoncé comme branché tant que ce n'est pas le
 * cas. Aucun connecteur fictif n'est déclaré ici.
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
      id: "lgo-direct",
      label: "Connexion directe au logiciel de gestion d'officine",
      description: "Synchronisation automatique des quantités. Aucun éditeur n'est encore raccordé : rien n'est simulé.",
      status: "NOT_CONNECTED",
    },
  ];
}
