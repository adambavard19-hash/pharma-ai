import type { AdviceRule } from "./advice";

/**
 * Les conseils du bout de l'arbre de questions du comptoir (`core/counter/question-tree.ts`) : la poche chaud/froid DE LA BONNE
 * ZONE, et le thermomètre.
 *
 * Retour d'officine du 10 octobre 2026 : un Fervex bipé avait déclenché « Thérapearl dos », sans rapport. La gamme Thérapearl existe
 * par zone (dos, nuque, épaule, genou, hanche, cheville) : on ne conseille pas une poche ciblée avant d'avoir demandé OÙ le patient a
 * mal, et on ne le demande qu'après avoir demandé POURQUOI il prend son antalgique. Ces règles se déclenchent toujours sur le
 * traitement (leur produit est apparié au stock dès le bip), mais l'avis du comptoir ne les montre qu'une fois la réponse donnée :
 * voir `TREE_RULE_KEYS`. Sur l'écran de la vente, chacune garde sa question « oui / non », qui joue le même rôle.
 *
 * Une zone ne reçoit que sa poche : le nom du produit dit la zone (« THERAPEARL DOS »). Une poche sans zone (multi-zones) répond à
 * « ailleurs ». Un produit pour enfant, une bouillotte, un masque pour les yeux ne sont jamais proposés.
 */

/** Les traitements qui ouvrent l'arbre : paracétamol seul, aspirine, anti-inflammatoires, anti-inflammatoires locaux, myorelaxants. */
const PAIN_ATC = ["N02BE01", "N02BA", "M01A", "M02AA", "M03B"];

/** Un traitement du rhume ou de la grippe contient du paracétamol : il soigne un état grippal, pas une douleur musculaire. */
const COLD_REMEDY = { exclude: ["fervex", "rhume", "grippe", "actifed", "humex", "dolirhume", "rhinadvil", "rhinureflex", "pheniramine", "pseudoephedrine", "rhinofebral", "nurofen rhume"] };

type Zone = { key: string; tag: string; label: string; /** Avec son article : « le dos ». */ the: string; ask: string; words: string; mention: string };

/** `words` : ce que le libellé du stock dit de la zone (sans accents, en minuscules). */
export const PAIN_ZONES: Zone[] = [
  { key: "back", tag: "zone dos", label: "dos", the: "le dos", ask: "Le patient a-t-il mal au dos ?", words: String.raw`\bdos\b|lombaire|lombalg`, mention: "au dos" },
  { key: "neck", tag: "zone nuque", label: "nuque", the: "la nuque", ask: "Le patient a-t-il mal à la nuque ou aux cervicales ?", words: String.raw`nuque|cervical|\bcou\b`, mention: "à la nuque" },
  { key: "shoulder", tag: "zone épaule", label: "épaule", the: "l'épaule", ask: "Le patient a-t-il mal à l'épaule ?", words: String.raw`epaule`, mention: "à l'épaule" },
  { key: "knee", tag: "zone genou", label: "genou", the: "le genou", ask: "Le patient a-t-il mal au genou ?", words: String.raw`genou`, mention: "au genou" },
  { key: "hip", tag: "zone hanche", label: "hanche", the: "la hanche", ask: "Le patient a-t-il mal à la hanche ?", words: String.raw`hanche`, mention: "à la hanche" },
  { key: "ankle", tag: "zone cheville", label: "cheville", the: "la cheville", ask: "Le patient a-t-il mal à la cheville ?", words: String.raw`cheville`, mention: "à la cheville" },
];

/** Les mots de zone, tous ensemble : une poche sans zone ne doit contenir aucun d'eux. */
export const ANY_ZONE_WORDS = PAIN_ZONES.map((zone) => zone.words).join("|");

/** Ce qu'une poche chaud/froid n'est jamais : un produit d'enfant, une bouillotte, un masque pour les yeux. */
const NEVER = String.raw`masq|ocul|\bkids?\b|enfant|bouillotte`;
const PACK_EXCLUDE = [String.raw`\bkids?\b`, String.raw`enfant`, String.raw`bouillotte`, String.raw`masq(?:ue)? ?ocul`, String.raw`oculaire`];

const PACK_TERMS = [String.raw`chaud ?froid`, String.raw`thera ?pearl`, String.raw`thermcool`, String.raw`poche`];

/** Un motif préféré lève une exclusion (matching.ts) : chacun refuse d'abord ce que la règle exclut. */
const preferring = (refused: string, ...patterns: string[]) => patterns.map((pattern) => `^(?!.*(?:${refused})).*${pattern}`);

const COMMON = {
  kind: "COMFORT" as const,
  version: "1.1",
  validation: { status: "PENDING" as const },
  triggerMode: "CLASS_ONLY" as const,
  category: "DISPOSITIFS_MEDICAUX" as const,
  atcPrefixes: PAIN_ATC,
  nameGate: COLD_REMEDY,
  therapeuticClasses: ["Anti-inflammatoire non stéroïdien", "Myorelaxant"],
  sideEffectTriggers: [] as string[],
  excludeTags: [] as string[],
  // Un conseil caché derrière une question passe après les conseils visibles : il ne leur prend ni la place ni le produit.
  basePriority: 30,
};

function zoneRule(zone: Zone): AdviceRule {
  // Une poche d'une AUTRE zone ne sert pas : la zone demandée garde ses mots, les autres sont refusées.
  const otherZones = PAIN_ZONES.filter((candidate) => candidate.key !== zone.key).map((candidate) => candidate.words).join("|");
  const refused = `${NEVER}|${otherZones}`;
  return {
    ...COMMON,
    key: `pain-pack-${zone.key}`,
    title: `Chaud ou froid — ${zone.label}`,
    question: `${zone.ask} (Oui : douleur ${zone.mention}, musculaire ou articulaire.)`,
    confirmedReasonTemplate: `Douleur ${zone.mention} confirmée sous {drug} : le froid sur une entorse récente, le chaud sur une contracture, complètent l'antalgique.`,
    matchingTags: ["chaud froid", zone.tag],
    productPrefer: preferring(refused, `(?:${zone.words}).*(?:${PACK_TERMS.join("|")})`, `(?:${PACK_TERMS.join("|")}).*(?:${zone.words})`, `(?:${zone.words})`),
    productExclude: [...PACK_EXCLUDE, ...PAIN_ZONES.filter((candidate) => candidate.key !== zone.key).map((candidate) => candidate.words)],
    benefits: ["Froid les 48 premières heures d'une entorse", "Chaud sur une contracture", `Poche pour ${zone.the}`],
    shortReasonTemplate: `Antalgique ou anti-inflammatoire ({drug}) : pour une douleur ${zone.mention}, le froid ou le chaud local complète le traitement.`,
    rationaleTemplate: `Sous {drug}, une douleur ${zone.mention} d'origine musculaire ou articulaire répond aussi à la température : le froid limite l'œdème et la douleur d'une entorse ou d'un traumatisme récent, la chaleur détend une contracture ou une lombalgie. Le pharmacien a demandé où le patient a mal : la poche proposée est celle de cette zone.`,
    counterScriptTemplate: `« En plus de {drug}, pour votre douleur ${zone.mention}, {product} : au froid les deux premiers jours sur une entorse, au chaud sur une contracture, vingt minutes, jamais directement sur la peau. »`,
    patientReasonTemplate: `En complément de {drug}, {product} s'applique vingt minutes sur la zone douloureuse : froid sur une entorse récente, chaud sur une contracture, toujours à travers un linge.`,
    clinicalContext: "Traumatologie bénigne : protocole GREC (glace, repos, élévation, compression) ; thermothérapie des contractures. HAS — prise en charge des entorses de cheville.",
    safetyNotes: ["Jamais directement sur la peau, vingt minutes au plus ; pas de chaud sur une inflammation aiguë ni sur une peau insensible."],
  };
}

/** « Ailleurs » : une poche multi-zones, jamais une poche d'une zone précise. */
const OTHER_RULE: AdviceRule = {
  ...COMMON,
  key: "pain-pack-other",
  title: "Chaud ou froid — autre zone",
  question: "La douleur est-elle musculaire ou articulaire, ailleurs que dos, nuque, épaule, genou, hanche, cheville ? (Oui : douleur musculaire ou articulaire ailleurs.)",
  confirmedReasonTemplate: "Douleur musculaire ou articulaire confirmée sous {drug} : le froid sur une entorse récente, le chaud sur une contracture, complètent l'antalgique.",
  matchingTags: ["chaud froid"],
  productPrefer: preferring(`${NEVER}|${ANY_ZONE_WORDS}`, ...PACK_TERMS),
  productExclude: [...PACK_EXCLUDE, ...PAIN_ZONES.map((zone) => zone.words)],
  benefits: ["Froid les 48 premières heures d'une entorse", "Chaud sur une contracture", "Sans médicament, en plus du traitement"],
  shortReasonTemplate: "Antalgique ou anti-inflammatoire ({drug}) : sur une douleur musculaire ou articulaire, le froid ou le chaud local complète le traitement.",
  rationaleTemplate:
    "Sous {drug}, une douleur d'origine musculaire ou articulaire répond aussi à la température : le froid limite l'œdème et la douleur d'une entorse ou d'un traumatisme récent, la chaleur détend une contracture. Une poche réutilisable multi-zones sert aux deux. Le pharmacien a demandé où le patient a mal : la zone n'est pas une de celles de la gamme ciblée.",
  counterScriptTemplate: "« En plus de {drug}, {product} : au froid les deux premiers jours sur une entorse, au chaud sur une contracture, vingt minutes, jamais directement sur la peau. »",
  patientReasonTemplate: "En complément de {drug}, {product} s'applique vingt minutes : froid sur une entorse récente, chaud sur une contracture, toujours à travers un linge.",
  clinicalContext: "Traumatologie bénigne : protocole GREC (glace, repos, élévation, compression) ; thermothérapie des contractures.",
  safetyNotes: ["Jamais directement sur la peau, vingt minutes au plus ; pas de chaud sur une inflammation aiguë ni sur une peau insensible."],
};

/** Fièvre sans thermomètre à la maison : le thermomètre, après la question de l'arbre. */
const THERMOMETER_RULE: AdviceRule = {
  ...COMMON,
  key: "fever-thermometer-analgesic",
  title: "Thermomètre sous antalgique (fièvre)",
  kind: "COMFORT",
  question: "Le patient a-t-il de la fièvre, sans thermomètre à la maison ? (Oui : fièvre, pas de thermomètre.)",
  confirmedReasonTemplate: "Fièvre sans thermomètre à la maison sous {drug} : un thermomètre est justifié.",
  matchingTags: ["thermomètre", "fièvre", "mesure"],
  productExclude: [],
  benefits: ["Suit la température à la maison", "Savoir quand rappeler le médecin", "Utile surtout pour un enfant ou une personne fragile"],
  shortReasonTemplate: "Antalgique ou antipyrétique ({drug}) : en cas de fièvre, la température se surveille à la maison.",
  rationaleTemplate:
    "Le patient a de la fièvre sous {drug} et n'a pas de thermomètre : mesurer la température permet de suivre l'évolution et de savoir quand rappeler le médecin. Fièvre au-delà de 3 jours ou supérieure à 39 °C : contacter le médecin.",
  counterScriptTemplate: "« Avec {drug}, pour suivre la fièvre à la maison, {product} permet de mesurer la température simplement. Au-delà de trois jours de fièvre, voyez votre médecin. »",
  patientReasonTemplate: "Pour suivre votre fièvre pendant que vous prenez {drug}, {product} mesure la température à la maison.",
  clinicalContext: "Utile surtout pour un enfant, une personne âgée ou fragile.",
  safetyNotes: ["Fièvre au-delà de 3 jours ou supérieure à 39 °C : contacter le médecin."],
};

export const PAIN_ZONE_RULES: AdviceRule[] = [...PAIN_ZONES.map(zoneRule), OTHER_RULE, THERMOMETER_RULE];
