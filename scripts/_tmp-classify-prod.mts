import { prisma } from "@/server/db/client";
import { classifyPharmacyProducts } from "@/server/services/product-classification";
const ph = await prisma.pharmacy.findFirstOrThrow({ where: { id: "cmtt17mnv000104jmpcx7r296" }, select: { id: true, organizationId: true, memberships: { where: { role: "OWNER" }, select: { userId: true } } } });
const scope = { pharmacyId: ph.id, organizationId: ph.organizationId, userId: ph.memberships[0].userId };
for (let round = 0; round < 12; round += 1) {
  const r = await classifyPharmacyProducts({ scope, maxAiBatches: 8 });
  console.log(`${new Date().toISOString()} tour ${round + 1} : ${r.considered} considérés, cache ${r.fromCache}, dico ${r.byHeuristic}, IA ${r.byAi}, sans usage ${r.withoutUsage}, non classés ${r.unclassified}, restants ${r.remaining}${r.warnings.length ? " | " + r.warnings.slice(0, 2).join(" ; ") : ""}`);
  if (r.remaining === 0 || r.considered === 0) break;
}
console.log("à comprendre encore :", await prisma.product.count({ where: { pharmacyId: ph.id, deletedAt: null, classifiedAt: null } }));
await prisma.$disconnect();
