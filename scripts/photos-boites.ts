/**
 * Cherche la photo des boîtes d'une officine dans les bases ouvertes (Open
 * Beauty Facts, Open Products Facts, Open Food Facts), par code-barres.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/photos-boites.ts --officine "Pharmacie Test LGPI"
 *   node --env-file=.env --conditions=react-server --import tsx scripts/photos-boites.ts --id cmtt17mnv000104jmpcx7r296 --max 3000
 *   node --env-file=.env --conditions=react-server --import tsx scripts/photos-boites.ts --toutes
 *
 * Environ une seconde par référence : les bases limitent le rythme.
 */
import { prisma } from "@/server/db/client";
import { fetchMissingProductImages } from "@/server/services/product-images";

async function main() {
  const idIndex = process.argv.indexOf("--id");
  const nameIndex = process.argv.indexOf("--officine");
  const maxIndex = process.argv.indexOf("--max");
  const max = maxIndex >= 0 ? Number(process.argv[maxIndex + 1]) : 500;
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
    const started = Date.now();
    const summary = await fetchMissingProductImages({ pharmacyId: pharmacy.id, limit: max, log: (line) => console.log("  ", line) });
    console.log(`${pharmacy.name} : ${summary.considered} cherchée(s), ${summary.found} photo(s) trouvée(s), ${summary.remaining} restante(s) — ${Math.round((Date.now() - started) / 1000)} s.`);
  }
}

main().finally(() => prisma.$disconnect());
