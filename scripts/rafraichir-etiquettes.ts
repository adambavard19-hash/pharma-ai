/**
 * Réapplique le dictionnaire d'usage aux produits d'une officine, après une
 * mise à jour des règles : les étiquettes nouvelles (nettoyant, lèvres, fer,
 * potassium…) rejoignent les produits déjà classés, sans appel au modèle.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/rafraichir-etiquettes.ts --officine "Pharmacie Test LGPI"
 *   node --env-file=.env --conditions=react-server --import tsx scripts/rafraichir-etiquettes.ts --id cmtt17mnv000104jmpcx7r296
 *   node --env-file=.env --conditions=react-server --import tsx scripts/rafraichir-etiquettes.ts --toutes
 */
import { prisma } from "@/server/db/client";
import { refreshDictionaryTags } from "@/server/services/product-classification";

async function main() {
  const idIndex = process.argv.indexOf("--id");
  const nameIndex = process.argv.indexOf("--officine");
  const all = process.argv.includes("--toutes");
  const pharmacies = all
    ? await prisma.pharmacy.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } })
    : idIndex >= 0
      ? await prisma.pharmacy.findMany({ where: { id: process.argv[idIndex + 1] }, select: { id: true, name: true } })
      : nameIndex >= 0
        ? await prisma.pharmacy.findMany({ where: { name: process.argv[nameIndex + 1] }, select: { id: true, name: true } })
        : [];
  if (pharmacies.length === 0) throw new Error("Indiquez --id <pharmacyId>, --officine <nom>, ou --toutes.");
  for (const pharmacy of pharmacies) {
    const result = await refreshDictionaryTags({ pharmacyId: pharmacy.id });
    console.log(`${pharmacy.name} : ${result.considered} produits, ${result.updated} mis à jour.`);
    const shown = all ? 8 : 40;
    for (const line of result.retagged.slice(0, shown)) console.log("  ", line);
    if (result.retagged.length > shown) console.log(`   … et ${result.retagged.length - shown} autres.`);
  }
}

main().finally(() => prisma.$disconnect());
