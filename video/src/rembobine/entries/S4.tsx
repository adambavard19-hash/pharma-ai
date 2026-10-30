// Écrit par tools/planche.mjs : la scène S4 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s04-rembobinons";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S4", M));
