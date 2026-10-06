/**
 * La mise à l'échelle des graphiques : de la géométrie, pas du métier.
 * Les valeurs arrivent déjà calculées ; on décide seulement où les dessiner.
 */

export type Point = [number, number];

/** Arrondit un nombre pour l'écrire dans un attribut SVG (deux décimales suffisent). */
const num = (value: number) => String(Math.round(value * 100) / 100);

/**
 * Une graduation « ronde » : 0, 5, 10, 15, 20… jamais 0, 3, 6, 9 pour un maximum de 10.
 * `integer` ne retient que des pas entiers ronds (1, 2, 5, 10, 20, 25, 50…) : on ne
 * compte pas 0,5 conseil, et on n'arrondit jamais 2,5 à 3 — on monte au pas rond suivant (5).
 */
export function niceScale(max: number, options: { integer?: boolean; fallbackMax?: number } = {}): { max: number; ticks: number[] } {
  const safeMax = Number.isFinite(max) && max > 0 ? max : (options.fallbackMax ?? 1);
  const raw = safeMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1, 2, 2.5, 5, 10].map((factor) => Number((factor * magnitude).toPrecision(12)));
  const eligible = options.integer ? candidates.filter((candidate) => Number.isInteger(candidate)) : candidates;
  const found = eligible.find((candidate) => candidate >= raw - 1e-9);
  // Un maximum minuscule en mode entier (moins de 4) : le plus petit pas possible est 1.
  const step = options.integer ? Math.max(1, found ?? 1) : (found ?? magnitude * 10);
  const top = Math.ceil(safeMax / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 1000; value += step) ticks.push(Math.round(value * 1000) / 1000);
  return { max: top, ticks };
}

/**
 * Une courbe lisse qui ne dépasse JAMAIS les valeurs réelles (interpolation
 * monotone de Fritsch–Carlson). Un lissage classique fait plonger la courbe
 * sous zéro entre deux pics : on y lirait un chiffre d'affaires négatif.
 */
export function monotonePath(points: Point[]): string {
  const count = points.length;
  if (count === 0) return "";
  const start = `M ${num(points[0][0])} ${num(points[0][1])}`;
  if (count === 1) return start;
  if (count === 2) return `${start} L ${num(points[1][0])} ${num(points[1][1])}`;

  const widths: number[] = [];
  const slopes: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const width = points[index + 1][0] - points[index][0];
    widths.push(width);
    slopes.push(width === 0 ? 0 : (points[index + 1][1] - points[index][1]) / width);
  }

  const tangents: number[] = new Array(count).fill(0);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    tangents[index] = slopes[index - 1] * slopes[index] <= 0 ? 0 : (slopes[index - 1] + slopes[index]) / 2;
  }
  // Les tangentes sont bridées pour que chaque tronçon reste monotone.
  for (let index = 0; index < count - 1; index += 1) {
    if (slopes[index] === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const a = tangents[index] / slopes[index];
    const b = tangents[index + 1] / slopes[index];
    const squares = a * a + b * b;
    if (squares > 9) {
      const tau = 3 / Math.sqrt(squares);
      tangents[index] = tau * a * slopes[index];
      tangents[index + 1] = tau * b * slopes[index];
    }
  }

  let path = start;
  for (let index = 0; index < count - 1; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[index + 1];
    const third = widths[index] / 3;
    path += ` C ${num(x0 + third)} ${num(y0 + tangents[index] * third)}, ${num(x1 - third)} ${num(y1 - tangents[index + 1] * third)}, ${num(x1)} ${num(y1)}`;
  }
  return path;
}

/** Les suites de valeurs connues : un `null` coupe la courbe, il ne vaut jamais zéro. */
export function splitRuns(values: (number | null)[]): { from: number; indices: number[] }[] {
  const runs: { from: number; indices: number[] }[] = [];
  let current: { from: number; indices: number[] } | null = null;
  values.forEach((value, index) => {
    if (value === null || Number.isNaN(value)) {
      current = null;
      return;
    }
    if (!current) {
      current = { from: index, indices: [] };
      runs.push(current);
    }
    current.indices.push(index);
  });
  return runs;
}

/** Le point du graphique le plus proche du pointeur (0 → count − 1). */
export function indexFromPointer(clientX: number, left: number, width: number, count: number): number {
  if (count <= 1 || !(width > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
  return Math.round(ratio * (count - 1));
}

/** Abscisse d'un point en pourcentage de la largeur (un point seul est centré). */
export function xPercent(index: number, count: number): number {
  return count <= 1 ? 50 : (index / (count - 1)) * 100;
}

/** Ordonnée en pourcentage de la hauteur, 0 en bas (donc 100 − …). */
export function yPercent(value: number, max: number): number {
  return max > 0 ? 100 - Math.min(100, Math.max(0, (value / max) * 100)) : 100;
}

/** Pas entre deux étiquettes de l'axe horizontal, pour n'en garder qu'une demi-douzaine. */
export function labelStride(count: number, maxLabels = 6): number {
  return Math.max(1, Math.ceil(count / maxLabels));
}
