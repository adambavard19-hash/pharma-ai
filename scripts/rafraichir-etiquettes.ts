/**
 * Réapplique le dictionnaire d'usage aux produits d'une officine, après une
 * mise à jour des règles : les étiquettes nouvelles (nettoyant, lèvres, fer,
 * potassium…) rejoignent les produits déjà classés, sans appel au modèle.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/rafraichir-etiquettes.ts --officine "Pharmacie Test LGPI"
 *   node --env-file=.env --conditions=react-server --import tsx scripts/rafraichir-etiquettes.ts --id cmtt17mnv000104jmpcx7r296
 */
import { prisma } from "@/server/db/client";
import { refreshDictionaryTags } from "@/server/services/product-classification";

async function main() {
  const idIndex = process.argv.indexOf("--id");
  const nameIndex = process.argv.indexOf("--officine");
  const pharmacy = idIndex >= 0
    ? await prisma.pharmacy.findUnique({ where: { id: process.argv[idIndex + 1] }, select: { id: true, name: true } })
    : nameIndex >= 0
      ? await prisma.pharmacy.findFirst({ where: { name: process.argv[nameIndex + 1] }, select: { id: true, name: true } })
      : null;
  if (!pharmacy) throw new Error("Indiquez --id <pharmacyId> ou --officine <nom>.");
  const result = await refreshDictionaryTags({ pharmacyId: pharmacy.id });
  console.log(`${pharmacy.name} : ${result.considered} produits, ${result.updated} mis à jour.`);
  for (const line of result.retagged.slice(0, 40)) console.log("  ", line);
  if (result.retagged.length > 40) console.log(`   … et ${result.retagged.length - 40} autres.`);
}

main().finally(() => prisma.$disconnect());
