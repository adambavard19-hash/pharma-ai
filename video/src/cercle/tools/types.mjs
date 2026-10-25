// La vérification des types (tsc) du film, à tour de rôle (deux à la fois au plus sur la machine).
//   node src/cercle/tools/types.mjs            → toutes les erreurs de src/cercle
//   node src/cercle/tools/types.mjs S3         → seulement celles du fichier de la scène S3
//   node src/cercle/tools/types.mjs kit        → seulement celles du kit
import { spawnSync } from "node:child_process";
import { SCENES } from "../timeline.ts";
import { prendrePlace } from "./verrou.mjs";

const id = process.argv[2];
const filter = !id ? "src/cercle" : id === "kit" ? "src/cercle/kit" : `scenes/${SCENES.find((s) => s.id === id)?.file}`;
const release = await prendrePlace("tsc", 2);
const r = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { encoding: "utf8" });
release();
const lines = (r.stdout + r.stderr).split("\n").filter((l) => l.includes(filter));
console.log(lines.length ? lines.join("\n") : `Aucune erreur de type dans ${filter}.`);
process.exit(lines.length ? 1 : 0);
