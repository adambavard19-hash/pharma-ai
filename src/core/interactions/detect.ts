import { normalizeSearchText } from "../reference/search";
import { SEVERITY_ORDER } from "./types";
import type {
  InteractionAnalysis,
  InteractionClassMember,
  InteractionLine,
  InteractionMatch,
  InteractionRule,
  SubstanceOverlap,
} from "./types";

/**
 * Le rapprochement entre une ordonnance et un référentiel d'interactions.
 *
 * Fonction pure : mêmes entrées, mêmes sorties, aucun accès base ni réseau.
 * C'est délibéré — une règle de sécurité doit pouvoir être rejouée à
 * l'identique et testée exhaustivement.
 *
 * Ce que la fonction NE fait pas, et ne fera jamais :
 *   • deviner une interaction absente du référentiel ;
 *   • rapprocher deux substances « proches » ;
 *   • conclure qu'il n'y a pas de risque. Elle rapporte ce qu'elle a trouvé et
 *     ce qu'elle n'a pas pu examiner ; l'interprétation revient au pharmacien.
 */

/** Un couple n'a qu'une écriture, quel que soit l'ordre de lecture. */
export function pairKey(a: string, b: string): string {
  return a <= b ? `${a}${b}` : `${b}${a}`;
}

export function interactionKey(value: string): string {
  return normalizeSearchText(value);
}

export function detectInteractions(input: {
  lines: InteractionLine[];
  rules: InteractionRule[];
  classMembers: InteractionClassMember[];
}): InteractionAnalysis {
  const { lines, rules, classMembers } = input;

  const analysedLineIds: string[] = [];
  const unanalysedLineIds: string[] = [];
  for (const line of lines) {
    (line.substances.length > 0 ? analysedLineIds : unanalysedLineIds).push(line.id);
  }

  // Une substance peut appartenir à plusieurs classes ; une classe peut être
  // citée par plusieurs règles. On indexe dans ce sens-là.
  const classesOfSubstance = new Map<
    string,
    { key: string; label: string; isAlias: boolean }[]
  >();
  for (const member of classMembers) {
    const list = classesOfSubstance.get(member.substanceKey) ?? [];
    list.push({
      key: member.classKey,
      label: member.classLabel,
      isAlias: member.isAlias === true,
    });
    classesOfSubstance.set(member.substanceKey, list);
  }

  /**
   * Toutes les clés sous lesquelles une ligne peut être reconnue : ses
   * substances, et les classes auxquelles ces substances appartiennent.
   */
  const keysOfLine = new Map<string, Map<string, { label: string; viaClass: boolean }>>();
  for (const line of lines) {
    const keys = new Map<string, { label: string; viaClass: boolean }>();
    for (const substance of line.substances) {
      keys.set(substance.key, { label: substance.label, viaClass: false });
      for (const klass of classesOfSubstance.get(substance.key) ?? []) {
        // Une substance nommée directement prime sur son rattachement de
        // classe : c'est plus précis, donc plus utile au comptoir.
        // Un alias dit « ces deux libellés désignent la même substance » : ce
        // n'est pas un raisonnement par classe, et l'écran ne doit pas le
        // présenter comme tel.
        if (!keys.has(klass.key)) {
          keys.set(klass.key, { label: klass.label, viaClass: !klass.isAlias });
        }
      }
    }
    keysOfLine.set(line.id, keys);
  }

  const rulesByPair = new Map<string, InteractionRule[]>();
  for (const rule of rules) {
    const key = pairKey(rule.leftKey, rule.rightKey);
    const list = rulesByPair.get(key) ?? [];
    list.push(rule);
    rulesByPair.set(key, list);
  }

  const matches: InteractionMatch[] = [];
  const overlaps: SubstanceOverlap[] = [];
  const seenMatches = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i];
      const b = lines[j];
      const keysA = keysOfLine.get(a.id)!;
      const keysB = keysOfLine.get(b.id)!;

      // 1. Redondance de substance — un fait de composition, pas une
      //    interaction. Détectable sans le moindre référentiel.
      for (const substance of a.substances) {
        if (b.substances.some((other) => other.key === substance.key)) {
          overlaps.push({
            substanceLabel: substance.label,
            lineIds: [a.id, b.id],
            lineLabels: [a.label, b.label],
          });
        }
      }

      // 2. Interactions déclarées par le référentiel.
      for (const [keyA, infoA] of keysA) {
        for (const [keyB, infoB] of keysB) {
          // Une règle ne s'applique pas à une substance avec elle-même : ce
          // cas relève de la redondance ci-dessus.
          if (keyA === keyB) continue;
          for (const rule of rulesByPair.get(pairKey(keyA, keyB)) ?? []) {
            // Le libellé affiché suit l'ordre de l'ordonnance, pas celui du
            // fichier : le pharmacien lit ses lignes, pas notre index.
            const leftIsA = rule.leftKey === keyA;
            const dedupe = `${a.id}|${b.id}|${rule.severity}|${pairKey(keyA, keyB)}`;
            if (seenMatches.has(dedupe)) continue;
            seenMatches.add(dedupe);

            matches.push({
              severity: rule.severity,
              lineIds: [a.id, b.id],
              leftLabel: leftIsA ? rule.leftLabel : rule.rightLabel,
              rightLabel: leftIsA ? rule.rightLabel : rule.leftLabel,
              viaClass: infoA.viaClass || infoB.viaClass,
              risk: rule.risk,
              guidance: rule.guidance,
              sourceName: rule.sourceName,
              sourceVersion: rule.sourceVersion,
            });
          }
        }
      }
    }
  }

  matches.sort(
    (x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity),
  );

  return { matches, overlaps, analysedLineIds, unanalysedLineIds };
}
