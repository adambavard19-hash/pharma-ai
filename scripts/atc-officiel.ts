/**
 * La famille officielle (code ATC) de chaque spécialité, sans modèle.
 *
 * Exécution : `npm run atc:officiel -- --from <dossier>`
 *
 * Le dossier contient, téléchargés à la main :
 *   • OPEN_MEDIC_<année>.zip — Assurance Maladie, base complète Open Medic (Licence Ouverte) :
 *     https://open-data-assurance-maladie.ameli.fr/medicaments/index.php (Open MEDIC, base complète, une archive par année)
 *     chaque boîte remboursée (CIP13) avec son code ATC. Le CSV fait 470 Mo une fois décompressé et a déjà rempli le
 *     disque : il est lu DANS l'archive, en flux (`unzip -p`), jamais extrait ;
 *   • CIS_CIP_bdpm.txt, CIS_bdpm.txt, CIS_COMPO_bdpm.txt — Base de données publique des médicaments :
 *     https://base-donnees-publique.medicaments.gouv.fr/telechargement
 *     lus par le même lecteur que l'import du catalogue (`src/core/reference/bdpm`) : encodage deviné fichier par fichier
 *     (CIS_CIP en UTF-8, les deux autres en windows-1252), colonnes comptées, libellés repliés recollés.
 *
 * Ce qui est écrit dans `src/core/reference/atc/official-atc-data.ts` :
 *   • B (boîte) — la spécialité a au moins une boîte remboursée : son ATC est celui que l'Assurance Maladie lui donne
 *     (le plus remboursé si ses boîtes en portent plusieurs, ce qui est rare et compté) ;
 *   • S (substance) — spécialité non remboursée (Zyrtecset…) : elle reçoit l'ATC des spécialités remboursées qui ont
 *     EXACTEMENT les mêmes substances actives (codes SA de CIS_COMPO, à défaut FT) et le même groupe de voies, si elles
 *     s'accordent toutes sur un seul code. Un désaccord ne donne rien : jamais deviner. Garde de plus : au moins une de
 *     ces remboursées doit avoir le même dosage — le finastéride 1 mg (chute de cheveux, D11AX10, jamais remboursé) ne
 *     prend pas l'ATC du finastéride 5 mg remboursé (prostate, G04CB01), qui a pourtant la même substance et la même voie.
 */

import { spawn } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import {
  bdpmFileSpec,
  decodeBdpmText,
  decodeWindows1252,
  looksLikeUtf8,
  parseTable,
  toCompositionRow,
  toPresentationRow,
  toSpecialtyRow,
  type BdpmFileKey,
} from "../src/core/reference/bdpm";
import { BDPM_SOURCE, OPEN_MEDIC_SOURCE } from "../src/core/reference/attribution";

const ATC5 = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;
const OUT = path.join(process.cwd(), "src/core/reference/atc/official-atc-data.ts");

function arg(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}

/**
 * Les voies d'administration ramenées à ce qui change l'ATC d'une même substance. Volontairement strict : la voie
 * orale ne se confond ni avec la bouche (bain de bouche, gomme) ni avec la voie sublinguale, la peau ni avec le
 * dispositif transdermique. Un groupe trop large ferait passer une famille d'une voie à l'autre ; un groupe trop
 * étroit ne coûte qu'une famille officielle de moins (le modèle reste là).
 */
export function routeGroup(routes: readonly string[]): string {
  const set = new Set(
    routes
      .map((route) => route.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim())
      .filter(Boolean)
      .map((route) => {
        if (route === "orale") return "oral";
        if (route === "sublinguale") return "sublingual";
        if (/buccale|gingivale|dentaire|laryngopharyngee/.test(route)) return "mouth";
        if (/nasale|endosinusale/.test(route)) return "nasal";
        if (route === "ophtalmique") return "eye";
        if (route === "auriculaire") return "ear";
        if (route === "cutanee" || route === "epilesionnelle") return "skin";
        if (route === "transdermique") return "transdermal";
        if (route === "inhalee" || route === "endotracheobronchique") return "inhaled";
        if (route === "rectale") return "rectal";
        if (route === "vaginale") return "vaginal";
        if (/veineuse|musculaire|sous-cutanee|intra|peri|infiltration|parenterale|sous-|hemo|extracorporelle|implantation/.test(route)) return "injection";
        return route;
      }),
  );
  return [...set].sort().join("+");
}

/** « 1,00 mg » et « 1 mg » ne font qu'un ; « 0,5 g » vaut « 500 mg ». Ce qui ne se lit pas reste tel quel. */
export function doseKey(dosage: string | null): string {
  const text = (dosage ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const match = /^(\d+(?:[.,]\d+)?)\s*(mg|g|microgrammes?|µg|ug)$/.exec(text);
  if (!match) return text;
  const value = Number(match[1].replace(",", "."));
  const factor = match[2] === "g" ? 1000 : match[2] === "mg" ? 1 : 0.001;
  return `${Number((value * factor).toPrecision(6))}mg`;
}

/** Le CSV de l'archive Open Medic, et sa date de publication (celle du fichier dans l'archive, exigée par la licence). */
async function openMedicMember(zip: string): Promise<{ member: string; publishedOn: string | null }> {
  // `unzip -Z -T` : une ligne par fichier, la date au format fixe « aaaammjj.hhmmss », le nom en dernier.
  const listing = await new Promise<string>((resolve, reject) => {
    const child = spawn("unzip", ["-Z", "-T", zip]);
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (out += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`unzip -Z ${path.basename(zip)} a échoué (${code}).`))));
  });
  for (const line of listing.split("\n")) {
    const tokens = line.trim().split(/\s+/);
    const member = tokens.at(-1) ?? "";
    if (!/\.csv$/i.test(member)) continue;
    const date = tokens.find((token) => /^\d{8}\.\d{6}$/.test(token));
    return { member, publishedOn: date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : null };
  }
  throw new Error(`Aucun CSV dans ${path.basename(zip)}.`);
}

/** Le CSV d'Open Medic, ligne à ligne, lu dans l'archive sans jamais l'écrire sur le disque. */
async function* openMedicLines(zip: string, member: string): AsyncGenerator<string> {
  const child = spawn("unzip", ["-p", zip, member], { stdio: ["ignore", "pipe", "inherit"] });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  // Octet pour caractère : les libellés retenus sont décodés plus bas (UTF-8 ou windows-1252, voir `cleanLabel`).
  child.stdout.setEncoding("latin1");
  const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of reader) if (line.trim()) yield line;
  const code = await closed;
  if (code !== 0) throw new Error(`unzip -p ${path.basename(zip)} s'est arrêté avec le code ${code} : lecture incomplète, rien n'est écrit.`);
}

async function bdpmRows<T>(from: string, key: BdpmFileKey, toRow: (columns: string[]) => T | null): Promise<T[]> {
  const spec = bdpmFileSpec(key);
  const { text } = decodeBdpmText(await readFile(path.join(from, spec.fileName)));
  return parseTable(text, spec).rows.map(toRow).filter((row): row is T => row !== null);
}

/**
 * Un libellé ATC d'Open Medic tel qu'il s'écrit dans le fichier généré : en capitales sans accents, comme la grande
 * majorité des libellés de la source, sans séparateur du format. Le CSV mélange les encodages d'une ligne à l'autre
 * (« ULCÃˆRE » : de l'UTF-8 au milieu du latin1) et quelques libellés ont perdu leurs accents en route (octet 0x1A) :
 * l'UTF-8 est reconnu octet par octet, et un libellé abîmé ne sert que s'il n'en existe pas d'intact pour ce code.
 */
function cleanLabel(raw: string): string {
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0) & 0xff);
  const text = looksLikeUtf8(bytes) ? new TextDecoder("utf-8").decode(bytes) : decodeWindows1252(bytes);
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/Œ/gi, "OE")
    .replace(/[;=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
const damaged = (label: string) => /[\u001a\ufffd]/.test(label);

async function main() {
  const from = arg("--from");
  if (!from) throw new Error("--from <dossier> manquant.");
  const files = await readdir(from);
  const zip = files.find((file) => /^OPEN_MEDIC_\d{4}\.zip$/i.test(file));
  if (!zip) throw new Error("OPEN_MEDIC_<année>.zip introuvable dans le dossier (l'archive telle que téléchargée, sans l'extraire).");
  const year = zip.match(/\d{4}/)?.[0] ?? "";

  // 1. Open Medic : boîtes (CIP13) → ATC5, pondérées par le nombre de boîtes remboursées ; libellés des niveaux 3 et 4.
  const boxAtc = new Map<string, Map<string, number>>();
  const labels = new Map<string, string>();
  let column: Record<"ATC3" | "L_ATC3" | "ATC4" | "L_ATC4" | "ATC5" | "CIP13" | "BOITES", number> | null = null;
  let rows = 0;
  const { member, publishedOn } = await openMedicMember(path.join(from, zip));
  for await (const line of openMedicLines(path.join(from, zip), member)) {
    const cells = line.split(";");
    if (!column) {
      const header = cells.map((cell) => cell.trim().toUpperCase());
      const at = (name: string) => {
        const index = header.indexOf(name);
        if (index < 0) throw new Error(`Colonne ${name} absente d'Open Medic (en-tête lu : ${header.join(";")}). Le format a changé : rien n'est écrit.`);
        return index;
      };
      column = { ATC3: at("ATC3"), L_ATC3: at("L_ATC3"), ATC4: at("ATC4"), L_ATC4: at("L_ATC4"), ATC5: at("ATC5"), CIP13: at("CIP13"), BOITES: at("BOITES") };
      continue;
    }
    rows += 1;
    const atc = cells[column.ATC5]?.trim() ?? "";
    const cip = cells[column.CIP13]?.trim() ?? "";
    if (!ATC5.test(atc) || !/^\d{13}$/.test(cip)) continue;
    // « 1.234 » : le point sépare les milliers, la virgule les décimales.
    const boxes = Number((cells[column.BOITES] ?? "").trim().replace(/\./g, "").replace(",", ".")) || 0;
    const counts = boxAtc.get(cip) ?? new Map<string, number>();
    counts.set(atc, (counts.get(atc) ?? 0) + boxes);
    boxAtc.set(cip, counts);
    for (const [code, label] of [[column.ATC3, column.L_ATC3], [column.ATC4, column.L_ATC4]] as const) {
      const value = cells[code]?.trim() ?? "";
      const known = labels.get(value);
      if (value && (!known || damaged(known)) && cells[label]?.trim()) {
        const cleaned = cleanLabel(cells[label]);
        if (!known || !damaged(cleaned)) labels.set(value, cleaned);
      }
    }
  }
  if (!column || rows === 0) throw new Error("Open Medic est vide : rien n'est écrit.");

  // 2. BDPM : boîte → spécialité, voies, substances actives et dosages.
  const presentations = await bdpmRows(from, "PRESENTATIONS", toPresentationRow);
  const specialties = await bdpmRows(from, "SPECIALTIES", toSpecialtyRow);
  const compositions = await bdpmRows(from, "COMPOSITIONS", toCompositionRow);

  const cisAtcVotes = new Map<string, Map<string, number>>();
  let matchedBoxes = 0;
  for (const presentation of presentations) {
    const counts = boxAtc.get(presentation.cip13);
    if (!counts) continue;
    matchedBoxes += 1;
    const votes = cisAtcVotes.get(presentation.cisCode) ?? new Map<string, number>();
    // +1 par boîte : une boîte présente mais sans boîte remboursée nette (régularisations) compte encore.
    for (const [atc, boxes] of counts) votes.set(atc, (votes.get(atc) ?? 0) + Math.max(boxes, 0) + 1);
    cisAtcVotes.set(presentation.cisCode, votes);
  }

  const routes = new Map(specialties.map((specialty) => [specialty.cisCode, routeGroup(specialty.administrationRoutes)]));

  const active = new Map<string, { SA: Map<string, Set<string>>; FT: Map<string, Set<string>> }>();
  for (const row of compositions) {
    const entry = active.get(row.cisCode) ?? { SA: new Map<string, Set<string>>(), FT: new Map<string, Set<string>>() };
    const byCode = row.nature === "SA" ? entry.SA : entry.FT;
    const doses = byCode.get(row.substanceCode) ?? new Set<string>();
    doses.add(doseKey(row.dosage));
    byCode.set(row.substanceCode, doses);
    active.set(row.cisCode, entry);
  }
  const chosen = (cis: string) => {
    const entry = active.get(cis);
    if (!entry) return null;
    const byCode = entry.SA.size > 0 ? entry.SA : entry.FT;
    return byCode.size > 0 ? byCode : null;
  };
  const substanceKey = (cis: string): string | null => {
    const byCode = chosen(cis);
    return byCode ? [...byCode.keys()].sort().join(",") : null;
  };
  const dosesKey = (cis: string): string =>
    [...(chosen(cis) ?? new Map<string, Set<string>>())].map(([code, doses]) => `${code}=${[...doses].sort().join("/")}`).sort().join(",");

  // 3. Spécialités remboursées : l'ATC le plus remboursé (un seul, presque toujours).
  const result = new Map<string, { atc: string; basis: "B" | "S" }>();
  const conflictSamples: string[] = [];
  let conflicts = 0;
  for (const [cis, votes] of cisAtcVotes) {
    const ranked = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1) {
      conflicts += 1;
      if (conflictSamples.length < 8) conflictSamples.push(`${cis} ${ranked.map(([atc, n]) => `${atc}×${n}`).join(" ")}`);
    }
    result.set(cis, { atc: ranked[0][0], basis: "B" });
  }

  // 4. Les autres : mêmes substances, même groupe de voies, un seul ATC chez les remboursées, et un même dosage parmi elles.
  const bySignature = new Map<string, { atcs: Set<string>; doses: Set<string> }>();
  for (const [cis, { atc }] of result) {
    const key = substanceKey(cis);
    if (!key) continue;
    const signature = `${key}|${routes.get(cis) ?? ""}`;
    const group = bySignature.get(signature) ?? { atcs: new Set<string>(), doses: new Set<string>() };
    group.atcs.add(atc);
    group.doses.add(dosesKey(cis));
    bySignature.set(signature, group);
  }
  let inferred = 0;
  let ambiguous = 0;
  let otherDose = 0;
  for (const cis of routes.keys()) {
    if (result.has(cis)) continue;
    const key = substanceKey(cis);
    if (!key) continue;
    const group = bySignature.get(`${key}|${routes.get(cis) ?? ""}`);
    if (!group) continue;
    if (group.atcs.size !== 1) {
      ambiguous += 1;
    } else if (!group.doses.has(dosesKey(cis))) {
      otherDose += 1;
    } else {
      result.set(cis, { atc: [...group.atcs][0], basis: "S" });
      inferred += 1;
    }
  }

  const entries = [...result].sort((a, b) => a[0].localeCompare(b[0]));
  const usedPrefixes = new Set(entries.flatMap(([, { atc }]) => [atc.slice(0, 4), atc.slice(0, 5)]));
  // Un libellé resté abîmé (aucune ligne intacte pour ce code) n'est pas publié : la famille garde son code, sans texte faux.
  const usedLabels = [...labels].filter(([code, label]) => usedPrefixes.has(code) && !damaged(label)).sort((a, b) => a[0].localeCompare(b[0]));
  const damagedLabels = [...labels].filter(([code, label]) => usedPrefixes.has(code) && damaged(label)).map(([code]) => code);
  const source = {
    name: OPEN_MEDIC_SOURCE.name,
    year,
    publishedOn,
    licence: OPEN_MEDIC_SOURCE.licence,
    url: OPEN_MEDIC_SOURCE.url,
    joinedWith: BDPM_SOURCE.name,
    specialties: entries.length,
    fromReimbursedBoxes: entries.length - inferred,
    fromSameSubstances: inferred,
  };

  const body = `/**
 * GÉNÉRÉ par scripts/atc-officiel.ts (\`npm run atc:officiel -- --from <dossier>\`) — ne pas modifier à la main.
 *
 * Source : ${source.name}, base complète ${year}${publishedOn ? ` publiée le ${publishedOn}` : ""} — ${source.licence} — ${source.url},
 * jointe à la ${source.joinedWith} (codes CIS, CIP13, compositions, voies).
 * ${source.specialties} spécialités : ${source.fromReimbursedBoxes} d'après leurs boîtes remboursées, ${source.fromSameSubstances} d'après les mêmes substances, la même voie et un même dosage.
 */

export const OFFICIAL_ATC_SOURCE = ${JSON.stringify(source, null, 2)} as const;

/** « CIS:ATC5:B|S » séparés par « ; » — B : boîte remboursée, S : mêmes substances, même voie, même dosage. */
export const OFFICIAL_ATC_BY_CIS =
  ${JSON.stringify(entries.map(([cis, { atc, basis }]) => `${cis}:${atc}:${basis}`).join(";"))};

/** Libellés officiels des niveaux 3 et 4 de l'ATC (Open Medic, en capitales sans accents), « code=libellé » séparés par « ; ». */
export const OFFICIAL_ATC_LABELS =
  ${JSON.stringify(usedLabels.map(([code, label]) => `${code}=${label}`).join(";"))};
`;
  await writeFile(OUT, body);
  console.log(
    [
      `Open Medic ${year} : ${rows} lignes lues, ${boxAtc.size} boîtes (CIP13) avec un ATC5 ; ${matchedBoxes} présentations BDPM rattachées.`,
      `${entries.length} spécialités sur ${routes.size} : ${source.fromReimbursedBoxes} d'après leurs boîtes remboursées, ${inferred} d'après les mêmes substances.`,
      `${conflicts} spécialités remboursées à plusieurs ATC (le plus remboursé retenu)${conflictSamples.length ? ` — ex. ${conflictSamples.join(" ; ")}` : ""}.`,
      `${ambiguous} non remboursées laissées sans ATC (les remboursées se contredisent), ${otherDose} laissées sans ATC (aucun dosage commun).`,
      `${usedLabels.length} libellés${damagedLabels.length ? ` (${damagedLabels.length} illisibles écartés : ${damagedLabels.join(", ")})` : ""} ; ${Math.round(Buffer.byteLength(body) / 1024)} Ko écrits dans ${path.relative(process.cwd(), OUT)}.`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
