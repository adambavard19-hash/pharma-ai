// Écrit par tools/planche.mjs : la scène S2 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s02-rien";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S2", M));
