// Écrit par tools/planche.mjs : la scène S11 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s11-application";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S11", M));
