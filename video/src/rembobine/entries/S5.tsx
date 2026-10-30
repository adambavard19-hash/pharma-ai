// Écrit par tools/planche.mjs : la scène S5 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s05-meme-ordonnance";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S5", M));
