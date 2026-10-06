import "server-only";
import { DEMO_DRUG_BY_KEY } from "@/core/demo/catalog";
import { resolveDrug } from "./provision";

/** Les médicaments de démonstration demandés, retrouvés dans le catalogue national par leur nom. */
export async function resolveDemoDrugsByKey(keys: string[]): Promise<Map<string, { cip13: string; name: string }>> {
  const found = new Map<string, { cip13: string; name: string }>();
  for (const key of new Set(keys)) {
    const entry = DEMO_DRUG_BY_KEY.get(key);
    const resolved = entry ? await resolveDrug(entry) : null;
    if (resolved) found.set(key, { cip13: resolved.cip13, name: resolved.name });
  }
  return found;
}
