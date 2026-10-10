/**
 * Deux médicaments peuvent partager le même code ATC et ne pas se conseiller pareil : le clobétasol de Dermoval (crème,
 * psoriasis du corps) et celui de Clobex (shampooing, cuir chevelu) sont tous deux D07AD01. Quand l'ATC ne suffit pas,
 * une règle peut ajouter une porte sur le NOM du médicament : le nom prescrit, le nom officiel ou la substance.
 *
 * `include` : au moins un motif doit figurer dans le nom. `exclude` : aucun motif ne doit y figurer. Les motifs sont des
 * expressions régulières écrites sans accents, en minuscules (le nom est ramené à cette forme avant l'essai).
 */
export type NameGate = { include?: string[]; exclude?: string[] };

function plain(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function passesNameGate(gate: NameGate | undefined, ...names: (string | null | undefined)[]): boolean {
  if (!gate) return true;
  const text = plain(names.filter(Boolean).join(" "));
  if (gate.include && gate.include.length > 0 && !gate.include.some((pattern) => new RegExp(pattern).test(text))) return false;
  if (gate.exclude?.some((pattern) => new RegExp(pattern).test(text))) return false;
  return true;
}
