import "server-only";
import { prisma } from "@/server/db/client";
import { interactionKey } from "@/core/interactions";
import {
  ALIASES_FILE,
  CLASSES_FILE,
  INTERACTIONS_FILE,
  META_FILE,
  parseAliasesFile,
  parseClassesFile,
  parseInteractionsFile,
  parseMetaFile,
  type InteractionMeta,
} from "@/core/interactions";

/**
 * Chargement d'un référentiel d'interactions.
 *
 * Trois garanties, dans l'ordre de leur importance.
 *
 * 1. Rien n'est inventé. Le fichier est refusé en entier à la première
 *    anomalie, en citant la ligne : sur des données de sécurité, un import
 *    partiel est pire qu'un import qui échoue.
 * 2. Rien n'est perdu. Le remplacement se fait dans une transaction ; si elle
 *    échoue, l'ancien référentiel est toujours là. Une synchronisation ratée
 *    ne laisse jamais l'officine sans référentiel.
 * 3. Tout est daté. Nom, version et date de la source sont obligatoires et
 *    journalisés — c'est ce qui permet à chaque alerte de citer son origine.
 */

export type InteractionReader = (fileName: string) => Promise<string | null>;

export type InteractionFileReport = {
  file: string;
  rows: number;
};

export type InteractionImportResult = {
  importId: string | null;
  status: "SUCCEEDED" | "FAILED";
  meta: InteractionMeta | null;
  files: InteractionFileReport[];
  rules: number;
  classMembers: number;
  aliases: number;
  /**
   * Substances citées par le référentiel qui ne correspondent à AUCUN libellé
   * du catalogue national. Elles ne pourront jamais déclencher d'alerte : le
   * silence qui en résulterait serait un faux négatif, donc on le compte et on
   * le montre plutôt que de le laisser passer.
   */
  unmatchedSubstances: number;
  unmatchedSamples: string[];
  /** Règles présentes avant l'import et absentes du nouveau fichier. */
  removedRules: number;
  isDryRun: boolean;
  error: string | null;
};

const CHUNK = 1_000;

export async function importInteractions(options: {
  read: InteractionReader;
  isDryRun?: boolean;
  /** Journalisé et affiché dans le rapport d'import. */
  sourceUrl?: string;
}): Promise<InteractionImportResult> {
  const isDryRun = options.isDryRun ?? false;
  const files: InteractionFileReport[] = [];

  let meta: InteractionMeta | null = null;
  let importId: string | null = null;

  try {
    const metaRaw = await options.read(META_FILE);
    if (metaRaw === null) {
      throw new Error(
        `${META_FILE} est introuvable. Ce fichier est obligatoire : il porte le nom, la version et la date du référentiel.`,
      );
    }
    meta = parseMetaFile(metaRaw);

    const interactionsRaw = await options.read(INTERACTIONS_FILE);
    if (interactionsRaw === null) {
      throw new Error(`${INTERACTIONS_FILE} est introuvable.`);
    }
    const rules = parseInteractionsFile(interactionsRaw);
    files.push({ file: INTERACTIONS_FILE, rows: rules.length });

    // Le fichier de classes est facultatif : un référentiel exprimé uniquement
    // en substances est parfaitement exploitable.
    const classesRaw = await options.read(CLASSES_FILE);
    const classMembers = classesRaw === null ? [] : parseClassesFile(classesRaw);
    files.push({ file: CLASSES_FILE, rows: classMembers.length });

    // Les correspondances de vocabulaire sont facultatives, mais sans elles un
    // référentiel écrit « amoxicilline » ne rencontrera jamais un catalogue qui
    // écrit « AMOXICILLINE TRIHYDRATÉE ».
    const aliasesRaw = await options.read(ALIASES_FILE);
    const aliases = aliasesRaw === null ? [] : parseAliasesFile(aliasesRaw);
    files.push({ file: ALIASES_FILE, rows: aliases.length });

    if (rules.length === 0) {
      throw new Error(
        `${INTERACTIONS_FILE} ne contient aucune règle. Un référentiel vide remplacerait le référentiel en place par rien.`,
      );
    }

    // Confrontation du vocabulaire au catalogue national, avant toute
    // écriture : c'est l'information la plus utile de l'import.
    const gap = await measureVocabularyGap(rules, classMembers, aliases);

    if (isDryRun) {
      return {
        importId: null,
        status: "SUCCEEDED",
        meta,
        files,
        rules: rules.length,
        classMembers: classMembers.length,
        aliases: aliases.length,
        unmatchedSubstances: gap.unmatched.length,
        unmatchedSamples: gap.unmatched.slice(0, 8),
        removedRules: 0,
        isDryRun: true,
        error: null,
      };
    }

    const journal = await prisma.referenceImport.create({
      data: {
        source: "INTERACTIONS",
        sourceUpdatedAt: meta.updatedAt,
        sourceUrl: options.sourceUrl ?? meta.url ?? "",
        status: "RUNNING",
        isDryRun: false,
      },
    });
    importId = journal.id;

    const before = await prisma.drugInteractionRule.count({
      where: { sourceName: meta.name },
    });

    const now = new Date();

    // Une transaction unique : à aucun moment l'officine ne se retrouve avec un
    // référentiel à moitié remplacé.
    await prisma.$transaction(
      async (tx) => {
        await tx.drugInteractionRule.deleteMany({ where: { sourceName: meta!.name } });
        await tx.drugInteractionClassMember.deleteMany({
          where: { sourceName: meta!.name },
        });

        for (let i = 0; i < rules.length; i += CHUNK) {
          await tx.drugInteractionRule.createMany({
            data: rules.slice(i, i + CHUNK).map((rule) => ({
              leftLabel: rule.leftLabel,
              rightLabel: rule.rightLabel,
              leftKey: rule.leftKey,
              rightKey: rule.rightKey,
              leftKind: rule.leftKind,
              rightKind: rule.rightKind,
              severity: rule.severity,
              risk: rule.risk,
              guidance: rule.guidance,
              sourceName: meta!.name,
              sourceVersion: meta!.version,
              sourceUrl: meta!.url,
              sourceUpdatedAt: meta!.updatedAt,
              lastSeenAt: now,
            })),
          });
        }

        const members = [
          ...classMembers.map((member) => ({
            classLabel: member.classLabel,
            classKey: member.classKey,
            substanceLabel: member.substanceLabel,
            substanceKey: member.substanceKey,
            isAlias: false,
            sourceName: meta!.name,
            lastSeenAt: now,
          })),
          // Un alias se range dans la même table : mécaniquement, « ce libellé
          // du catalogue donne accès à ce terme du référentiel » se rapproche
          // exactement comme une appartenance de classe. Le drapeau `isAlias`
          // garde la distinction à l'affichage.
          ...aliases.map((alias) => ({
            classLabel: alias.referentialLabel,
            classKey: alias.referentialKey,
            substanceLabel: alias.catalogLabel,
            substanceKey: alias.catalogKey,
            isAlias: true,
            sourceName: meta!.name,
            lastSeenAt: now,
          })),
        ];

        for (let i = 0; i < members.length; i += CHUNK) {
          await tx.drugInteractionClassMember.createMany({
            data: members.slice(i, i + CHUNK),
            skipDuplicates: true,
          });
        }
      },
      { timeout: 120_000 },
    );

    await prisma.referenceImport.update({
      where: { id: journal.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        fileReports: [
          ...files,
          { file: META_FILE, rows: 1, name: meta.name, version: meta.version },
        ] as never,
      },
    });

    return {
      importId: journal.id,
      status: "SUCCEEDED",
      meta,
      files,
      rules: rules.length,
      classMembers: classMembers.length,
      aliases: aliases.length,
      unmatchedSubstances: gap.unmatched.length,
      unmatchedSamples: gap.unmatched.slice(0, 8),
      removedRules: Math.max(0, before - rules.length),
      isDryRun: false,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    if (importId) {
      await prisma.referenceImport.update({
        where: { id: importId },
        data: { status: "FAILED", finishedAt: new Date(), error: message },
      });
    }
    return {
      importId,
      status: "FAILED",
      meta,
      files,
      rules: 0,
      classMembers: 0,
      aliases: 0,
      unmatchedSubstances: 0,
      unmatchedSamples: [],
      removedRules: 0,
      isDryRun,
      error: message,
    };
  }
}

/**
 * Combien de substances du référentiel ne rencontreront jamais le catalogue.
 *
 * Un référentiel peut être parfaitement valide et pourtant ne rien déclencher,
 * simplement parce qu'il n'écrit pas les substances comme la BDPM. Ce silence
 * est indétectable au comptoir : on le mesure donc à l'import, une bonne fois,
 * et on le montre. C'est ce qui permet à l'officine de fournir un fichier
 * d'alias plutôt que de croire à une couverture qu'elle n'a pas.
 */
async function measureVocabularyGap(
  rules: { leftKind: string; leftLabel: string; rightKind: string; rightLabel: string }[],
  classMembers: { substanceLabel: string }[],
  aliases: { referentialKey: string }[],
): Promise<{ unmatched: string[] }> {
  const wanted = new Map<string, string>();
  for (const rule of rules) {
    if (rule.leftKind === "SUBSTANCE") wanted.set(interactionKey(rule.leftLabel), rule.leftLabel);
    if (rule.rightKind === "SUBSTANCE") {
      wanted.set(interactionKey(rule.rightLabel), rule.rightLabel);
    }
  }
  for (const member of classMembers) {
    wanted.set(interactionKey(member.substanceLabel), member.substanceLabel);
  }
  if (wanted.size === 0) return { unmatched: [] };

  // Un terme couvert par un alias est atteignable, même s'il ne figure pas
  // littéralement dans le catalogue.
  const aliased = new Set(aliases.map((alias) => alias.referentialKey));

  // Les deux graphies officielles d'un composant : la substance active telle
  // que formulée (SA) et sa fraction thérapeutique (FT). Les deux viennent du
  // catalogue national — les retenir n'est pas une interprétation.
  const catalogue = await prisma.drugComposition.findMany({
    where: { nature: { in: ["SA", "FT"] } },
    select: { substanceLabel: true },
    distinct: ["substanceLabel"],
  });
  const known = new Set(catalogue.map((row) => interactionKey(row.substanceLabel)));

  const unmatched: string[] = [];
  for (const [key, label] of wanted) {
    if (known.has(key) || aliased.has(key)) continue;
    unmatched.push(label);
  }
  return { unmatched: unmatched.sort() };
}
