// Écrit par tools/planche.mjs : la scène S1 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s01-comptoir";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S1", M));
