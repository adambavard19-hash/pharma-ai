import { registerRoot } from "remotion";
import { RembobineRoot } from "./Root";

// Point d'entrée À PART du film « Rembobinons » : le Root des autres films PharmaBoost n'est pas touché.
//   npx remotion studio src/rembobine/index.ts
//   node src/rembobine/tools/rendu.mjs brouillon | final
registerRoot(RembobineRoot);
