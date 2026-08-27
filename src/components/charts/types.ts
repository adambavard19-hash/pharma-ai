export type SeriesPoint = {
  /** Libellé de l'axe des abscisses (déjà formaté). */
  label: string;
  value: number;
  /** Valeur secondaire, affichée en surimpression (ex. CA additionnel). */
  secondaryValue?: number;
};

export type ChartFormatter = (value: number) => string;
