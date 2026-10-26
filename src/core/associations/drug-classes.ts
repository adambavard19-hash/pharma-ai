/**
 * Les familles de médicaments qu'une association peut prendre pour déclencheur (fondateur, 26 oct. 2026) : taper
 * « amoxicilline » ne doit plus obliger à cocher chaque amoxicilline du stock une par une. Une famille est un préfixe
 * ATC ; une ligne de la vente en fait partie quand le code ATC de son médicament commence par lui (`atcKey`).
 *
 * `substances` sert seulement à la retrouver en tapant : « amox » propose « Pénicillines ».
 */
export type DrugClass = { code: string; label: string; detail: string; substances: string[] };

export const ASSOCIATION_DRUG_CLASSES: readonly DrugClass[] = [
  { code: "J01", label: "Tous les antibiotiques", detail: "Toutes les familles ci-dessous", substances: ["antibiotique"] },
  { code: "J01C", label: "Pénicillines", detail: "Amoxicilline, amoxicilline + acide clavulanique, pivmécillinam…", substances: ["amoxicilline", "augmentin", "clamoxyl", "clavulanique", "pivmecillinam", "selexid", "penicilline", "oracilline", "phenoxymethylpenicilline", "cloxacilline"] },
  { code: "J01D", label: "Céphalosporines", detail: "Céfixime, cefpodoxime, céfuroxime, céfaclor…", substances: ["cefixime", "oroken", "cefpodoxime", "orelox", "cefuroxime", "zinnat", "cefaclor", "cefalexine", "cefadroxil", "ceftriaxone"] },
  { code: "J01F", label: "Macrolides et apparentés", detail: "Azithromycine, clarithromycine, spiramycine, clindamycine, pristinamycine…", substances: ["azithromycine", "zithromax", "clarithromycine", "zeclar", "josamycine", "spiramycine", "rovamycine", "roxithromycine", "erythromycine", "clindamycine", "dalacine", "pristinamycine", "pyostacine", "macrolide"] },
  { code: "J01M", label: "Fluoroquinolones", detail: "Ciprofloxacine, lévofloxacine, ofloxacine…", substances: ["ciprofloxacine", "ciflox", "levofloxacine", "tavanic", "ofloxacine", "moxifloxacine", "norfloxacine", "quinolone"] },
  { code: "J01A", label: "Tétracyclines", detail: "Doxycycline, lymécycline, minocycline", substances: ["doxycycline", "lymecycline", "tetralysal", "minocycline", "tetracycline"] },
  { code: "J01E", label: "Sulfamides", detail: "Sulfaméthoxazole + triméthoprime (Bactrim)", substances: ["sulfamethoxazole", "trimethoprime", "bactrim", "cotrimoxazole", "sulfamide"] },
  { code: "J01X", label: "Autres antibiotiques", detail: "Fosfomycine, nitrofurantoïne…", substances: ["fosfomycine", "monuril", "uridoz", "nitrofurantoine", "furadantine"] },
];

const KNOWN = new Map(ASSOCIATION_DRUG_CLASSES.map((item) => [item.code, item]));

export const drugClassOf = (code: string): DrugClass | undefined => KNOWN.get(code);

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Les familles qui répondent à ce qui est tapé : le nom de la famille (« péni », « macro », « antibio ») ou, dès trois
 * lettres, une de ses substances (« amox » → Pénicillines). La famille précise passe avant « Tous les antibiotiques ».
 */
export function searchDrugClasses(raw: string): DrugClass[] {
  const words = fold(raw).split(/[^a-z0-9]+/).filter(Boolean);
  // Dès trois lettres : « a » ou « ma » ne doivent pas couvrir la liste du stock de familles.
  if (words.length === 0 || words.join("").length < 3) return [];
  const matches = (item: DrugClass) =>
    words.every((word) => {
      const labelWords = fold(`${item.label} ${item.code}`).split(/[^a-z0-9]+/);
      if (labelWords.some((candidate) => candidate.startsWith(word))) return true;
      return word.length >= 3 && item.substances.some((substance) => substance.startsWith(word));
    });
  const found = ASSOCIATION_DRUG_CLASSES.filter(matches);
  const broad = found.filter((item) => item.code === "J01");
  const precise = found.filter((item) => item.code !== "J01");
  // « antibio » : tous les antibiotiques d'abord. Une substance précise (« amoxicilline ») : sa famille, puis tous les
  // antibiotiques en second choix.
  if (broad.length > 0) return [...broad, ...precise];
  return precise.length > 0 ? [...precise, KNOWN.get("J01") as DrugClass] : [];
}
