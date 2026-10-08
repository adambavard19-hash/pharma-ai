import type { DrugKnowledge, VeterinaryForm, VeterinaryInfo, VeterinarySpecies } from "../types";

/**
 * Reconnaître un produit pour animaux à son libellé.
 *
 * Un fichier de stock dit « SPOT ON CHIEN 10-25KG 4 PIP » ou « COLLIER ANTI
 * TIQUES GRAND CHIEN » : pour le moteur, c'est une ligne sans fiche, que
 * rien ne rattache au catalogue des médicaments humains. Sans cette lecture,
 * il ne la reconnaît pas — ou, pire, l'IA la rangerait parmi les médicaments
 * humains (un antiparasitaire « externe » déclencherait alors le conseil
 * anti-poux).
 *
 * Règles de la lecture :
 *   • une ESPÈCE écrite dans le libellé est indispensable (chien, chat, lapin) :
 *     la perméthrine et la deltaméthrine existent aussi dans des produits
 *     humains, un mot de substance seul ne prouve rien ;
 *   • il faut en plus un mot d'antiparasitaire (anti-puces, vermifuge, pipette
 *     ou spot-on, une substance connue…) : des croquettes ou un shampooing ordinaire pour
 *     chien ne sont pas reconnus ;
 *   • rien n'est déduit d'une MARQUE. Un libellé « FRONTLINE COMBO » sans
 *     espèce ni forme n'est pas reconnu : l'ajouter exigerait de lire le RCP
 *     de chaque produit, ce que ce module ne prétend pas avoir fait ;
 *   • un tire-tique est un outil, pas un médicament : jamais reconnu.
 */

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SPECIES: [VeterinarySpecies, RegExp][] = [
  ["CHIEN", /\b(chiens?|chiots?|canins?|canine)\b/],
  ["CHAT", /\b(chats?|chatons?|felins?|feline)\b/],
  ["LAPIN", /\blapins?\b/],
];

/** Ordre de lecture : une forme explicite l'emporte sur les suivantes. */
const FORMS: [VeterinaryForm, RegExp][] = [
  ["COLLIER", /\bcollier\b/],
  ["SPOT_ON", /\b(spot ?on|pipettes?|pip)\b/],
  ["SPRAY", /\b(sprays?|aerosol|vaporisateur|pulverisateur)\b/],
  ["SHAMPOOING", /\b(shampooings?|shampoings?|shamp|shp)\b/],
  ["POUDRE", /\bpoudre\b/],
  ["COMPRIME", /\b(comprimes?|cp|cpr|croquables?|tablettes?)\b/],
];

const CUTANEOUS_FORMS: readonly VeterinaryForm[] = ["SPOT_ON", "COLLIER", "SPRAY", "SHAMPOOING", "POUDRE"];

const EXTERNAL_MARKER = /\b(anti ?puces?|anti ?tiques?|anti ?parasitaires?|insecticides?|acaricides?|repulsifs?|puces?|tiques?)\b/;
const WORMER_MARKER = /\b(vermifuges?|antiparasitaire interne|anthelmintiques?)\b/;
const TICK_REMOVER = /\btire ?tiques?\b|\bcrochets? (a )?tiques?\b/;

/** Substances antiparasitaires externes. Lues dans le libellé seulement, jamais déduites d'une marque. */
const EXTERNAL_SUBSTANCES = [
  "permethrine", "deltamethrine", "fipronil", "imidaclopride", "pyriproxyfene", "dinotefurane", "flumethrine",
  "methoprene", "etofenprox", "cyphenothrine", "selamectine", "diazinon", "propoxur", "tetrachlorvinphos",
  // Isoxazolines : parasiticides externes, mais en comprimé comme en pipette selon le produit.
  "fluralaner", "afoxolaner", "sarolaner", "lotilaner",
] as const;
const AMBIGUOUS_FORM_SUBSTANCES: readonly string[] = ["fluralaner", "afoxolaner", "sarolaner", "lotilaner"];
const WORMER_SUBSTANCES = ["milbemycine", "praziquantel", "pyrantel", "fenbendazole", "febantel", "emodepside", "oxantel"] as const;

/**
 * Ce que le libellé dit d'un produit vétérinaire, ou `null` s'il ne s'agit
 * pas (reconnaissablement) d'un antiparasitaire pour animaux.
 */
export function readVeterinaryProduct(name: string): VeterinaryInfo | null {
  const text = normalise(name);
  if (!text || TICK_REMOVER.test(text)) return null;

  const species = SPECIES.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
  if (species.length === 0) return null;

  const externalSubstances = EXTERNAL_SUBSTANCES.filter((substance) => text.includes(substance));
  const wormerSubstances = WORMER_SUBSTANCES.filter((substance) => text.includes(substance));
  const form = FORMS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  // Une pipette (« 4 PIP », « SPOT ON ») pour un animal est, en officine, un antiparasitaire. Un
  // collier seul ne suffit pas : le collier élisabéthain est un accessoire de chirurgie.
  const external = EXTERNAL_MARKER.test(text) || externalSubstances.length > 0 || form === "SPOT_ON";
  const wormer = WORMER_MARKER.test(text) || wormerSubstances.length > 0;
  if (!external && !wormer) return null;

  // Sans forme écrite, un produit « anti-puces » est lu comme cutané, sauf si sa
  // substance existe en comprimé comme en pipette : on ne devine pas.
  const ambiguous = externalSubstances.some((substance) => AMBIGUOUS_FORM_SUBSTANCES.includes(substance));
  const cutaneous = form ? CUTANEOUS_FORMS.includes(form) && external : external && !ambiguous && !wormer;

  return { species, form, substances: [...externalSubstances, ...wormerSubstances], cutaneous };
}

/**
 * La fiche que le moteur reçoit pour un produit vétérinaire reconnu. Elle est
 * volontairement vide : ni code ATC, ni classe thérapeutique, ni effet
 * indésirable — aucune règle de conseil du médicament humain ne peut donc
 * s'y accrocher (la classe « Antiparasitaire externe » du conseil anti-poux,
 * par exemple).
 */
export function veterinaryKnowledge(name: string): DrugKnowledge | null {
  const info = readVeterinaryProduct(name);
  if (!info) return null;
  return {
    id: `vet:${normalise(name)}`,
    name,
    inn: null,
    atcCode: null,
    therapeuticClass: null,
    form: null,
    commonSideEffects: [],
    interactionClasses: [],
    cautionPopulations: [],
    patientExplanation: null,
    intakeAdvice: null,
    sourceName: "Libellé du produit (reconnaissance vétérinaire)",
    sourceVersion: "1.0",
    isDemoData: false,
    origin: "VETERINARY_NAME",
    veterinary: info,
  };
}

export function isVeterinaryKnowledge(drug: Pick<DrugKnowledge, "origin" | "veterinary"> | null | undefined): boolean {
  return drug?.origin === "VETERINARY_NAME" && Boolean(drug.veterinary);
}
