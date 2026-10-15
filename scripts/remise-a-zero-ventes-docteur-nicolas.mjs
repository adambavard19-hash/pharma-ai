// Remise à zéro des ventes scannées et des analyses de la PHARMACIE DU DOCTEUR NICOLAS (demande du fondateur, 15 oct. 2026).
//
//   node scripts/remise-a-zero-ventes-docteur-nicolas.mjs            → montre ce qui serait fait, sans rien toucher
//   node scripts/remise-a-zero-ventes-docteur-nicolas.mjs --confirmer → le fait, en une seule transaction (tout ou rien)
//
// Supprime : les ventes scannées et leurs analyses, conseils, réponses Vendu / Non vendu, ventes terminées, les ventes
// enregistrées, les demandes du comptoir, les suggestions du robot. Remet à zéro le compteur de scans de chaque comptoir.
// Garde : TOUS les comptoirs (et leur attribution), le stock, les produits, les associations, les challenges, l'équipe.
import pg from "pg";
import { readFileSync } from "node:fs";

const confirm = process.argv.includes("--confirmer");
const env = readFileSync(new URL("../.env.production.local", import.meta.url), "utf8");
const c = new pg.Client({ connectionString: env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1] });
await c.connect();
const PH = "cmtt17mnv000104jmpcx7r296";
const count = async (sql) => (await c.query(sql, [PH])).rows[0].n;
const snapshot = async () => ({
  ventes_scannees: await count(`SELECT count(*)::int n FROM prescriptions WHERE "pharmacyId"=$1`),
  conseils: await count(`SELECT count(*)::int n FROM recommendations WHERE "pharmacyId"=$1`),
  ventes_terminees: await count(`SELECT count(*)::int n FROM counter_sale_follow_ups WHERE "pharmacyId"=$1`),
  ventes_enregistrees: await count(`SELECT count(*)::int n FROM sales WHERE "pharmacyId"=$1`),
  suggestions_robot: await count(`SELECT count(*)::int n FROM robot_suggestions WHERE "pharmacyId"=$1`),
  comptoirs_gardes: await count(`SELECT count(*)::int n FROM counter_posts WHERE "pharmacyId"=$1`),
  stock_garde: await count(`SELECT count(*)::int n FROM stock_items WHERE "pharmacyId"=$1`),
});
const name = (await c.query(`SELECT name FROM pharmacies WHERE id=$1`, [PH])).rows[0]?.name;
console.log("Pharmacie :", name);
console.log("Avant :", await snapshot());
if (!confirm) {
  console.log("Simulation seulement : rien n'a été touché. Relancez avec --confirmer pour le faire.");
  await c.end();
  process.exit(0);
}
await c.query("BEGIN");
try {
  await c.query(`DELETE FROM sales WHERE "pharmacyId"=$1`, [PH]);
  await c.query(`DELETE FROM prescriptions WHERE "pharmacyId"=$1`, [PH]);
  await c.query(`DELETE FROM counter_requests WHERE "pharmacyId"=$1`, [PH]);
  await c.query(`DELETE FROM robot_suggestions WHERE "pharmacyId"=$1`, [PH]);
  await c.query(`UPDATE counter_posts SET "scanCount"=0, "lastScanAt"=NULL, "updatedAt"=now() WHERE "pharmacyId"=$1`, [PH]);
  await c.query("COMMIT");
} catch (error) {
  await c.query("ROLLBACK");
  console.error("Échec, rien n'a été modifié :", error.message);
  process.exit(1);
}
console.log("Après :", await snapshot());
await c.end();
