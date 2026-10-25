import { DEMO_SCENARIOS } from "@/core/demo/scenarios";
import { DEMO_DRUG_BY_KEY, DEMO_SHELF } from "@/core/demo/catalog";

const SHELF_NAME = new Map(DEMO_SHELF.map((item) => [item.slug, item.name]));

/** « AUGMENTIN 500 mg/62,5 mg, comprimé pelliculé » devient « Augmentin 500 mg/62,5 mg ». */
export function boxLabel(item: (typeof DEMO_SCENARIOS)[number]["items"][number]): string {
  if ("product" in item) return SHELF_NAME.get(item.product) ?? item.product;
  const search = DEMO_DRUG_BY_KEY.get(item.drug)?.search ?? item.drug;
  // On coupe à la virgule suivie d'une espace (la forme), pas à la virgule décimale de « 62,5 mg ».
  const head = search.split(/,\s/)[0].trim();
  return head.charAt(0) + head.slice(1).toLowerCase();
}
