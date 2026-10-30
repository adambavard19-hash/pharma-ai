// Écrit par tools/planche.mjs : la scène S8 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s08-je-veux-bien";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S8", M));
