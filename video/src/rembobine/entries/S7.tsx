// Écrit par tools/planche.mjs : la scène S7 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s07-les-mots";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S7", M));
