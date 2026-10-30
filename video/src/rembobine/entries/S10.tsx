// Écrit par tools/planche.mjs : la scène S10 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s10-patient";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S10", M));
