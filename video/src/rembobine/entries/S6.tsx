// Écrit par tools/planche.mjs : la scène S6 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s06-le-bon-conseil";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S6", M));
