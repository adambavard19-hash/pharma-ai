import type { CatalogProduct } from "./types";
import { AROMATHERAPY_RANGES } from "./engines/advice";

/**
 * Les modules de conseil (fondateur, 29 oct. 2026) : « certains pharmaciens sont plus orientés huiles essentielles et
 * phytothérapie, d'autres médicaments conseils chimiques ; je veux que le pharmacien ait le choix ». Une pharmacie choisit
 * un ou plusieurs modules ; pour chaque conseil, une référence de ses modules passe devant les autres.
 *
 * Le module ne choisit que parmi des références DÉJÀ admises pour ce conseil (pertinentes, sûres pour ce patient, en
 * stock) : il ne fait jamais entrer un produit écarté, et un conseil sans référence du module reste proposé tel quel.
 *
 * Module PUR : la pharmacie garde son choix dans `Pharmacy.settings.modules`, le moteur l'applique ici.
 */

export const ADVICE_MODULES = [
  { code: "PHYTOTHERAPIE", label: "Phytothérapie", short: "Plantes", description: "Gélules, tisanes, extraits et sirops aux plantes." },
  { code: "AROMATHERAPIE", label: "Aromathérapie", short: "Huiles essentielles", description: "Huiles essentielles et complexes aux huiles essentielles." },
  { code: "MEDICAMENT_CONSEIL", label: "Médicaments conseil", short: "Chimiques", description: "Médicaments sans ordonnance d'allopathie : sirops, comprimés, pastilles, crèmes." },
] as const;

export type AdviceModuleCode = (typeof ADVICE_MODULES)[number]["code"];

export const MODULES_SETTING_KEY = "modules";

const CODES = new Set<string>(ADVICE_MODULES.map((item) => item.code));

export const moduleLabel = (code: string): string => ADVICE_MODULES.find((item) => item.code === code)?.label ?? code;

/** Lit le choix enregistré : seuls les codes connus, sans doublon, dans l'ordre des modules. */
export function readModules(value: unknown): AdviceModuleCode[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set(value.filter((code): code is string => typeof code === "string" && CODES.has(code)));
  return ADVICE_MODULES.map((item) => item.code).filter((code) => chosen.has(code));
}

const ESSENTIAL_OIL = new RegExp(String.raw`huiles? essentielles?|\bhe\b|\bhle ess|aromath|${AROMATHERAPY_RANGES}`, "i");
/** L'homéopathie a un code de médicament, mais elle n'est pas un médicament conseil chimique. */
const HOMEOPATHY = /boiron|lehning|\bgranules?\b|\b\d+\s?(?:ch|dh|k)\b|homeop|homéop/i;
/** Un code CIP de médicament (34009…) : une boîte autorisée comme médicament, pas une référence de parapharmacie. */
const MEDICINE_CODE = /^34009\d{8}$/;

/** Le module d'un produit, d'après son libellé, sa catégorie et son code ; null : aucun des trois. */
export function productModule(product: Pick<CatalogProduct, "name" | "brand" | "category" | "ean">): AdviceModuleCode | null {
  const label = `${product.name} ${product.brand ?? ""}`;
  if (ESSENTIAL_OIL.test(label)) return "AROMATHERAPIE";
  if (product.category === "PHYTOTHERAPIE") return "PHYTOTHERAPIE";
  if (product.ean && MEDICINE_CODE.test(product.ean) && !HOMEOPATHY.test(label)) return "MEDICAMENT_CONSEIL";
  return null;
}
