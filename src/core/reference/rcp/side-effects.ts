import { extractRcpSection48, rcpBlocks, type RcpBlock } from "./html";

/**
 * Les effets indésirables fréquents d'un médicament, lus dans son RCP officiel (BDPM, rubrique 4.8).
 *
 * Le RCP classe chaque effet par fréquence, selon la convention MedDRA : très fréquent (≥ 1/10), fréquent (≥ 1/100,
 * < 1/10), peu fréquent, rare, très rare, fréquence indéterminée. On ne retient que les deux premières — ce qu'un
 * patient a de bonnes chances de ressentir — et on les ramène à une LISTE FERMÉE : les effets que les règles du comptoir
 * savent accompagner (`sideEffectTriggers` de `src/core/ai/engines/advice.ts`, besoins de
 * `src/core/understanding/needs.ts`). Tout le reste du RCP est laissé de côté, sans exception.
 *
 * Rien d'inventé :
 *   • un effet n'est retenu que s'il est écrit dans un passage dont la fréquence est explicitement « très fréquent » ou
 *     « fréquent » (ligne « Fréquent : … », colonne « Fréquent » d'un tableau, cellule de fréquence d'une rangée), ou dans
 *     un tableau d'incidences chiffrées à 1 % ou plus — et alors au-dessus du placebo quand le tableau le compare ;
 *   • une phrase de synthèse (« les effets les plus fréquents sont… », « des cas isolés de sécheresse buccale ») ne
 *     compte pas : elle ne donne pas de fréquence ;
 *   • une rubrique introuvable, sans fin, ou sans aucune fréquence ne donne RIEN (statut dit pourquoi) ;
 *   • les symptômes de sevrage (à l'arrêt) et les intitulés de classes d'organes (« Troubles gastro-intestinaux ») ne
 *     sont jamais lus comme des effets du traitement.
 *
 * Les synonymes médicaux sont écrits ci-dessous, terme par terme : « xérostomie » est une sécheresse buccale, « xérose »
 * une sécheresse cutanée, « chéilite » une inflammation sèche des lèvres… Un synonyme absent fait manquer un effet ; il
 * n'en fait jamais inventer un.
 */

export type RcpFrequency = "VERY_COMMON" | "COMMON" | "UNCOMMON" | "RARE" | "UNKNOWN";

/**
 * La liste fermée. `label` est écrit tel quel dans les effets du médicament (`commonSideEffects`) : il doit CONTENIR le
 * déclencheur de la règle qui l'accompagne (le moteur compare par inclusion, sans accents ni casse). Les motifs portent
 * sur le texte replié (minuscules, sans accents), entre limites de mots.
 */
export const OFFICIAL_SIDE_EFFECTS = [
  // Règle « dry-mouth-hygiene » (déclencheurs « sécheresse buccale », « bouche sèche »), besoin DRY_MOUTH.
  // Xérostomie = sécheresse de la bouche par manque de salive ; hyposialie / hyposalivation = salive diminuée.
  { key: "DRY_MOUTH", label: "sécheresse buccale", patterns: [/secheresses? (de la bouche|buccales?|des muqueuses buccales)/, /bouche seche/, /xerostomie/, /hyposialie/, /hyposalivation/] },
  // Besoin REHYDRATION. « Nausée » au singulier comme au pluriel.
  { key: "NAUSEA", label: "nausées", patterns: [/nausees?/] },
  { key: "VOMITING", label: "vomissements", patterns: [/vomissements?/] },
  // Règle « digestive-tolerance-antibiotics » (« diarrhée »), besoins ANTIBIOTIC_DIGESTIVE_TOLERANCE, REHYDRATION.
  { key: "DIARRHEA", label: "diarrhée", patterns: [/diarrhees?/] },
  // Besoin CONSTIPATION, règle « iron-absorption-support » (« constipation »).
  { key: "CONSTIPATION", label: "constipation", patterns: [/constipation/] },
  // Déclencheur « troubles digestifs » (probiotiques, fer) : le RCP dit « troubles digestifs » ou « troubles gastro-intestinaux ».
  { key: "DIGESTIVE_DISORDERS", label: "troubles digestifs", patterns: [/troubles? (digestifs?|gastro-? ?intestinaux)/] },
  // Règle « gastric-protection-nsaid » (« gastralgie »), besoin GASTRIC_DISCOMFORT. Épigastralgie = douleur du creux de
  // l'estomac ; dyspepsie = gêne digestive haute ; pyrosis = brûlure d'estomac remontante.
  { key: "GASTRALGIA", label: "gastralgie", patterns: [/gastralgies?/, /epigastralgies?/, /douleurs? epigastriques?/, /dyspepsies?/, /brulures? d.? ?estomac/, /pyrosis/] },
  // Sédation = somnolence dans les RCP de neuroleptiques et d'antihistaminiques (« sédation ou somnolence »).
  { key: "DROWSINESS", label: "somnolence", patterns: [/somnolences?/, /sedation/, /envie de dormir/] },
  // Règle « magnesium-fatigue » (« fatigue », « asthénie »), besoin FATIGUE_CRAMPS. Asthénie = fatigue.
  { key: "FATIGUE", label: "fatigue (asthénie)", patterns: [/fatigue/, /asthenie/] },
  // Même règle (« crampes »). Les « spasmes musculaires » ne sont PAS des crampes au sens du RCP : non retenus.
  { key: "CRAMPS", label: "crampes", patterns: [/crampes?( musculaires?)?/] },
  // Règle « hydration-dermato-topical » (« sécheresse cutanée »), besoin SKIN_DRYNESS. Xérose / xérodermie = peau sèche.
  { key: "SKIN_DRYNESS", label: "sécheresse cutanée", patterns: [/secheresses? (cutanees?|de la peau)/, /peau seche/, /xerose/, /xerodermie/] },
  // Chéilite = inflammation des lèvres, sèches et fissurées (isotrétinoïne). Besoin SKIN_DRYNESS, distinct de la peau.
  { key: "LIP_DRYNESS", label: "sécheresse des lèvres (chéilite)", patterns: [/cheilites?/, /secheresses? des levres/, /levres seches/] },
  // Règle « sun-photosensitivity » (« photosensibilité »), besoin PHOTOSENSITIVITY. Phototoxicité = réaction au soleil.
  { key: "PHOTOSENSITIVITY", label: "photosensibilité", patterns: [/photosensibili(te|sation)s?/, /phototoxicites?/] },
  // Besoin ALLERGIC_EYE_IRRITATION. Xérophtalmie = œil sec ; kératoconjonctivite sèche = œil sec avec atteinte de surface.
  { key: "DRY_EYE", label: "sécheresse oculaire", patterns: [/secheresses? (oculaires?|des yeux)/, /yeux secs/, /xerophtalmie/, /keratoconjonctivites? seches?/] },
  // Même besoin. Libellé choisi pour ne PAS contenir « irritation », déclencheur de la règle d'hydratation de la peau.
  { key: "EYE_IRRITATION", label: "yeux irrités (conjonctivite)", patterns: [/irritations? (oculaires?|des yeux)/, /conjonctivites?/, /blepharites?/] },
  // Topiques : règle « hydration-dermato-topical » (« irritation »). Seule l'irritation de la peau ou du site d'application.
  { key: "SKIN_IRRITATION", label: "irritation cutanée", patterns: [/irritations? (cutanees?|de la peau|au site d.? ?application|au point d.? ?application)/] },
  // Besoin COUGH_COMFORT (toux sèche des IEC, toux des corticoïdes inhalés).
  { key: "COUGH", label: "toux", patterns: [/toux/] },
  // Besoin SORE_THROAT. « Pharyngite » n'est pas retenue : dans un RCP, c'est le plus souvent une infection.
  { key: "SORE_THROAT", label: "maux de gorge", patterns: [/maux? de gorge/, /irritations? (de la gorge|pharyngees?)/, /douleurs? (oro)?pharyngees?/, /secheresses? de la gorge/] },
  // Besoin NASAL_CONGESTION. La « rhinite » n'est pas retenue (écoulement, pas obstruction ; souvent infectieuse).
  { key: "NASAL_CONGESTION", label: "congestion nasale", patterns: [/congestions? nasales?/, /nez bouche/, /obstructions? nasales?/] },
  // Isotrétinoïne : sécheresse de la muqueuse nasale (même besoin d'hygiène du nez).
  { key: "NASAL_DRYNESS", label: "sécheresse nasale", patterns: [/secheresses? (nasales?|du nez|de la muqueuse nasale)/] },
  // Candidose (Candida) = mycose ; muguet = candidose de la bouche (corticoïdes inhalés, antibiotiques).
  { key: "MYCOSIS", label: "mycose (candidose)", patterns: [/candidoses?/, /candida/, /mycoses?/, /infections? fongiques?/, /muguet/] },
] as const satisfies readonly { key: string; label: string; patterns: readonly RegExp[] }[];

export type OfficialSideEffectKey = (typeof OFFICIAL_SIDE_EFFECTS)[number]["key"];

export type OfficialSideEffect = {
  key: OfficialSideEffectKey;
  label: string;
  frequency: "VERY_COMMON" | "COMMON";
  /** Le passage du RCP où l'effet a été lu, tel qu'écrit (tronqué), pour la trace. */
  evidence: string;
};

export type RcpSideEffectsReading = {
  /**
   * `READ` : la rubrique a été lue et porte des fréquences (`effects` peut être vide : aucun effet de la liste n'y est
   * fréquent). `NO_SECTION` : pas de rubrique 4.8 lisible (RCP absent, renvoi au site de l'EMA, page mal formée).
   * `NO_FREQUENCY` : la rubrique existe mais ne donne aucune fréquence (vieux RCP en prose) — rien n'est retenu.
   */
  status: "READ" | "NO_SECTION" | "NO_FREQUENCY";
  effects: OfficialSideEffect[];
};

/** Repli du texte pour la comparaison : minuscules, sans accents, apostrophes et espaces unifiés. */
export function foldRcpText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const MARKER = /^[*•·\-–\s]*(tres frequent|peu frequent|frequent|tres rare|rare|frequence (?:indeterminee|inconnue|non connue)|de frequence inconnue|indetermine|inconnue)(?:e?s?)(?=$|[\s(:\-–—≥>≤<³/*,.;])/;

function frequencyOfWord(word: string): RcpFrequency {
  if (word === "tres frequent") return "VERY_COMMON";
  if (word === "frequent") return "COMMON";
  if (word === "peu frequent") return "UNCOMMON";
  if (word === "tres rare" || word === "rare") return "RARE";
  return "UNKNOWN";
}

/** Une fréquence en tête de texte, et ce qui la suit (définition entre parenthèses et ponctuation retirées). */
function leadingFrequency(text: string): { frequency: RcpFrequency; rest: string } | null {
  const folded = foldRcpText(text);
  const match = folded.match(MARKER);
  if (!match) return null;
  const rest = folded
    .slice(match[0].length)
    .replace(/^\s*\([^)]*\)?/, "")
    .replace(/^[\s:\-–—*,.;]+/, "")
    .trim();
  return { frequency: frequencyOfWord(match[1]), rest };
}

/** Une cellule ou une ligne qui n'est QU'une fréquence (« Fréquent », « Très fréquent (≥ 1/10) »). */
function pureFrequency(text: string): RcpFrequency | null {
  const lead = leadingFrequency(text);
  return lead && isDefinitionOnly(lead.rest) ? lead.frequency : null;
}

/** Ce qui ne dit qu'un seuil (« ≥ 1/100 à < 1/10 », « (> 1/10) ») : aucun mot hormis « à », « et », « ou ». */
function isDefinitionOnly(text: string): boolean {
  return foldRcpText(text).replace(/\([^)]*\)?/g, "").replace(/\b(a|et|ou)\b/g, "").replace(/[^a-z]/g, "") === "";
}

/** La ligne qui définit la convention (« très fréquent (≥ 1/10) ; fréquent (≥ 1/100…) ; … ») : trois fréquences ou plus. */
function isConventionLine(text: string): boolean {
  const folded = foldRcpText(text);
  return (folded.match(/frequen|\brares?\b|indetermine|inconnue/g) ?? []).length >= 3 || /1 ?\/ ?1 ?000\b|1 ?\/ ?10 ?000\b/.test(folded);
}

/** Un intitulé de classe d'organes MedDRA (« Affections gastro-intestinales », « Troubles cutanés… »), jamais un effet. */
export function isOrganClassHeading(text: string): boolean {
  const folded = foldRcpText(text).replace(/[*:]+$/, "").trim();
  if (folded.length > 110 || folded.includes(":")) return false;
  return /^(affections|infections et infestations|infections\b|investigations|tumeurs|lesions,? intoxications|actes medicaux|caracteristiques socio|problemes de produit|effets musculo|troubles (du |de la |de l'|des |gastro|generaux|cutanes|hepato|renaux|psychiatriques|oculaires|ophtalmo|cardiaques|vasculaires|respiratoires|endocriniens|musculo|auriculaires|hematologiques|congenitaux|nerveux))/.test(folded);
}

/** Un intertitre qui ouvre un passage à ne pas lire comme effets du traitement : symptômes à l'arrêt, surdosage. */
function isExcludedZoneHeading(text: string): boolean {
  const folded = foldRcpText(text);
  return folded.length <= 140 && !folded.includes(":") && /sevrage|a l'arret du traitement|surdosage/.test(folded);
}

/** Un intertitre qui referme le passage en cours (tableau suivant, sous-population, déclaration…). */
function isResetHeading(text: string): boolean {
  const folded = foldRcpText(text);
  return folded.length <= 140 && /^(description|population|declaration|effets indesirables (au cours|chez|rapportes)|essais cliniques|donnees (d'etudes|post|issues)|experience post|resume|liste|tableau|synthese|enfants|patients|sujets)/.test(folded);
}

type Collected = Map<OfficialSideEffectKey, OfficialSideEffect>;

function collect(into: Collected, text: string, frequency: RcpFrequency | null, evidence: string = text): void {
  if (frequency !== "VERY_COMMON" && frequency !== "COMMON") return;
  if (isOrganClassHeading(text)) return;
  const folded = foldRcpText(text);
  for (const effect of OFFICIAL_SIDE_EFFECTS) {
    const hit = effect.patterns.some((pattern) => new RegExp(String.raw`(?:^|[^a-z])(?:${pattern.source})(?![a-z])`).test(folded));
    if (!hit) continue;
    const previous = into.get(effect.key);
    // Le plus fréquent l'emporte, la première trace reste.
    if (previous && (previous.frequency === "VERY_COMMON" || frequency === "COMMON")) continue;
    into.set(effect.key, { key: effect.key, label: effect.label, frequency, evidence: evidence.replace(/\s+/g, " ").trim().slice(0, 160) });
  }
}

/**
 * Une incidence dans une cellule : « 2,09 % », « 24 (2,6 %) », ou un nombre nu quand l'en-tête dit « % de patients ».
 * « 0 » vaut 0 %. Tout autre contenu : `null`.
 */
function incidenceOf(cell: string, headerSaysPercent: boolean): number | null {
  const text = cell.replace(/\s+/g, " ").trim();
  const explicit = text.match(/^(?:\d+\s*)?\(?\s*(\d+(?:[.,]\d+)?)\s*%\s*\)?$/);
  if (explicit) return Number(explicit[1].replace(",", "."));
  if (text === "0") return 0;
  const bare = text.match(/^(\d+(?:[.,]\d+)?)$/);
  return bare && headerSaysPercent ? Number(bare[1].replace(",", ".")) : null;
}

function percentFrequency(value: number): RcpFrequency {
  return value >= 10 ? "VERY_COMMON" : value >= 1 ? "COMMON" : "UNCOMMON";
}

const RANK: Record<RcpFrequency, number> = { VERY_COMMON: 4, COMMON: 3, UNCOMMON: 2, RARE: 1, UNKNOWN: 0 };
const rarest = (frequencies: RcpFrequency[]) => frequencies.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));

/**
 * Les lignes hors tableau, avec un état : la dernière fréquence annoncée vaut pour les lignes qui suivent, jusqu'à la
 * suivante. Selon l'ordre du RCP — classe d'organes puis fréquences, ou l'inverse —, un intitulé de classe referme ou
 * non la fréquence en cours.
 */
function readLines(lines: string[], into: Collected): number {
  let markers = 0;
  const firstMarker = lines.findIndex((line) => !isConventionLine(line) && leadingFrequency(line) !== null);
  const firstOrgan = lines.findIndex(isOrganClassHeading);
  const frequencyFirst = firstMarker >= 0 && (firstOrgan < 0 || firstMarker < firstOrgan);
  let state: RcpFrequency | null = null;
  let excluded = false;

  for (const line of lines) {
    if (isConventionLine(line)) {
      state = null;
      continue;
    }
    if (isOrganClassHeading(line)) {
      excluded = false;
      if (!frequencyFirst) state = null;
      continue;
    }
    if (isExcludedZoneHeading(line)) {
      excluded = true;
      state = null;
      continue;
    }
    if (isResetHeading(line)) {
      excluded = false;
      state = null;
      continue;
    }
    // « Très fréquent : nausées. Fréquent : constipation, diarrhée. » sur une seule ligne : on coupe devant chaque fréquence.
    const pieces = line.split(/(?<=[.;:])\s+(?=[*•]?\s*(?:tr[eè]s\s+fr[ée]quent|peu\s+fr[ée]quent|fr[ée]quent|tr[eè]s\s+rare|rare|fr[ée]quence\s+ind[ée]termin[ée]e)s?\b)/i);
    for (const piece of pieces) {
      const lead = leadingFrequency(piece);
      if (lead) {
        markers += 1;
        state = lead.frequency;
        if (!excluded) collect(into, piece, state);
      } else if (!excluded) {
        collect(into, piece, state);
      }
    }
  }
  return markers;
}

/**
 * Un tableau, sous ses quatre formes rencontrées dans les RCP :
 *   1. fréquences en tête de colonnes (« | Fréquents | Peu fréquents | Rares | », un seuil sous le mot est permis) —
 *      chaque cellule prend celle de sa colonne ;
 *   2. une cellule de fréquence par rangée (« Affections oculaires | Très fréquent | Blépharite, conjonctivite ») — une
 *      cellule à plusieurs fréquences (« Peu fréquent / Rare ») s'aligne ligne à ligne sur la cellule des effets quand
 *      elles ont autant de lignes, sinon la plus rare l'emporte ;
 *   3. une rangée qui n'est qu'une fréquence, valable pour les rangées suivantes jusqu'à la prochaine classe d'organes ;
 *   4. des incidences d'essais (« Sécheresse buccale | 2,09 % | 0,82 % », « Somnolence | 11 (1,4 %) | 49 (5,2 %) ») — la
 *      colonne du médicament est la première chiffrée qui n'est pas celle du placebo, et l'effet doit dépasser le placebo.
 * Une cellule qui porte elle-même « Fréquent : … » est lue comme des lignes.
 */
function readTable(rows: string[][], into: Collected): number {
  let markers = 0;
  let columns: Map<number, RcpFrequency> | null = null;
  let carried: RcpFrequency | null = null;

  // L'en-tête d'un tableau d'incidences : les rangées de tête sans chiffre (deux au plus, « % de patients » puis
  // « Hydroxyzine | Placebo »).
  const head = rows.slice(0, 3).filter((row, index) => index < 2 && row.every((cell) => !/\d+(?:[.,]\d+)?\s*%|^\s*\d+(?:[.,]\d+)?\s*$/.test(cell)));
  const headerSaysPercent = head.some((row) => row.some((cell) => /%/.test(cell)));
  const placeboColumns = new Set(head.flatMap((row) => row.flatMap((cell, index) => (/placebo/i.test(cell) ? [index] : []))));

  for (const row of rows) {
    const cellFrequencies = row.map((cell) => {
      // Les lignes qui ne disent qu'un seuil (« ≥ 1/100 à < 1/10 » sous « Fréquent ») ne comptent pas.
      const lines = cell.split("\n").filter((line) => line.trim() && !(isDefinitionOnly(line) && /\d/.test(line)));
      const each = lines.map(pureFrequency);
      return lines.length > 0 && each.every((frequency) => frequency !== null) ? (each as RcpFrequency[]) : null;
    });
    const markerColumns = cellFrequencies.filter((frequencies) => frequencies !== null).length;

    // 1. Une rangée d'en-tête : deux colonnes de fréquence ou plus.
    if (markerColumns >= 2 && row.every((cell, index) => cellFrequencies[index] !== null || !cell.trim() || index === 0)) {
      columns = new Map(row.flatMap((_, index) => (cellFrequencies[index] ? [[index, cellFrequencies[index]![0]] as const] : [])));
      markers += columns.size;
      carried = null;
      continue;
    }
    if (columns) {
      row.forEach((cell, index) => {
        const frequency = columns!.get(index);
        if (frequency) for (const line of cell.split("\n")) collect(into, line, frequency);
      });
      continue;
    }

    const filled = row.map((cell) => cell.trim()).filter(Boolean);
    if (filled.length === 0) continue;

    // Une classe d'organes seule referme la fréquence reportée.
    if (filled.every((cell) => cell === filled[0]) && isOrganClassHeading(filled[0])) {
      carried = null;
      continue;
    }

    // 2 et 3. Une cellule de fréquence.
    const frequencyAt = cellFrequencies.findIndex((frequencies) => frequencies !== null);
    if (frequencyAt >= 0) {
      markers += 1;
      const frequencies = cellFrequencies[frequencyAt]!;
      const others = row.filter((cell, index) => index !== frequencyAt && cell.trim() && cell !== row[frequencyAt]);
      if (others.length === 0) {
        carried = rarest(frequencies);
        continue;
      }
      carried = null;
      for (const cell of others) {
        if (isOrganClassHeading(cell)) continue;
        const lines = cell.split("\n").filter(Boolean);
        if (frequencies.length > 1 && lines.length === frequencies.length) lines.forEach((line, index) => collect(into, line, frequencies[index]));
        else for (const line of lines) collect(into, line, rarest(frequencies));
      }
      continue;
    }

    // Une cellule qui porte ses propres fréquences (« Fréquent : nausées »).
    if (row.some((cell) => cell.split("\n").some((line) => leadingFrequency(line)))) {
      for (const cell of row) markers += readLines(cell.split("\n").filter(Boolean), into);
      carried = null;
      continue;
    }

    // 4. Incidences d'essais.
    const incidences = row.map((cell) => incidenceOf(cell, headerSaysPercent));
    if (incidences.some((value) => value !== null)) {
      const drugAt = incidences.findIndex((value, index) => value !== null && !placeboColumns.has(index));
      if (drugAt < 0) continue;
      const value = incidences[drugAt]!;
      if ([...placeboColumns].some((index) => (incidences[index] ?? -1) >= value)) continue;
      markers += 1;
      const evidence = `${row.filter((_, index) => incidences[index] === null).join(" ")} — ${row[drugAt]}${placeboColumns.size > 0 ? ` (placebo : ${[...placeboColumns].map((index) => row[index]).join(", ")})` : ""}`;
      row.forEach((cell, index) => {
        if (incidences[index] === null) collect(into, cell, percentFrequency(value), evidence);
      });
      continue;
    }

    // Rangée sans fréquence : celle reportée par une rangée « Fréquent » seule, s'il y en a une.
    for (const cell of row) for (const line of cell.split("\n")) collect(into, line, carried);
  }
  return markers;
}

/** La lecture d'une rubrique 4.8 déjà découpée en blocs. */
export function readSideEffectBlocks(blocks: RcpBlock[]): RcpSideEffectsReading {
  const into: Collected = new Map();
  let markers = 0;
  let pending: string[] = [];
  const flush = () => {
    markers += readLines(pending, into);
    pending = [];
  };
  for (const block of blocks) {
    if (block.kind === "line") pending.push(block.text);
    else {
      flush();
      markers += readTable(block.rows, into);
    }
  }
  flush();
  if (markers === 0) return { status: "NO_FREQUENCY", effects: [] };
  const order = OFFICIAL_SIDE_EFFECTS.map((effect) => effect.key as OfficialSideEffectKey);
  return { status: "READ", effects: [...into.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) };
}

/** La lecture d'une page RCP de la BDPM (ou de sa seule rubrique 4.8). */
export function readRcpSideEffects(html: string): RcpSideEffectsReading {
  const section = extractRcpSection48(html);
  if (!section) return { status: "NO_SECTION", effects: [] };
  return readSideEffectBlocks(rcpBlocks(section));
}

/** Les libellés à écrire dans les effets du médicament, dans l'ordre de la liste fermée. */
export function officialSideEffectLabels(effects: readonly { label: string }[]): string[] {
  return [...new Set(effects.map((effect) => effect.label))];
}

/** La source telle qu'on l'affiche au pharmacien. */
export const RCP_SIDE_EFFECTS_SOURCE = {
  label: "RCP (BDPM)",
  /** La page de la spécialité, onglet « RCP » (l'ancienne adresse `affichageDoc.php?specid=…&typedoc=R` y redirige). */
  urlFor: (cisCode: string) => `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cisCode}/extrait#tab-rcp`,
} as const;
