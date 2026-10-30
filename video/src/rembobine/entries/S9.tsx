// Écrit par tools/planche.mjs : la scène S9 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s09-equipe";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S9", M));
