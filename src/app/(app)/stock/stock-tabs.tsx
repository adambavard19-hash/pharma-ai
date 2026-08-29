import { LinkTabs } from "@/components/ui/tabs";

/**
 * La barre d'onglets du stock, partagée par les deux écrans qui la portent.
 *
 * Les médicaments vivent sur leur propre route parce qu'ils ont leur propre
 * champ de scan et leur propre pagination — mais dans la tête du pharmacien,
 * c'est le même écran. La barre doit donc être rigoureusement identique des
 * deux côtés : un onglet qui change de libellé ou perd son compteur d'une page
 * à l'autre donne l'impression d'avoir changé de logiciel.
 */
export type StockTabCounts = {
  alerts: number;
  items: number;
  catalog: number | null;
  drugs: number;
  movements: number;
};

export function StockTabs({ counts }: { counts: StockTabCounts }) {
  return (
    <LinkTabs
      basePath="/stock"
      items={[
        { key: "alertes", label: "À surveiller", count: counts.alerts },
        { key: "tout", label: "Tout le stock", count: counts.items },
        ...(counts.catalog === null
          ? []
          : [{ key: "catalogue", label: "Catalogue", count: counts.catalog }]),
        {
          key: "medicaments",
          label: "Médicaments",
          count: counts.drugs,
          href: "/stock/medicaments",
        },
        { key: "mouvements", label: "Mouvements", count: counts.movements },
      ]}
    />
  );
}
