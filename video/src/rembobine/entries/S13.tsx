// Écrit par tools/planche.mjs : la scène S13 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s13-signature";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S13", M));
