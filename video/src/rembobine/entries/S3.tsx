// Écrit par tools/planche.mjs : la scène S3 seule.
import { registerRoot } from "remotion";
import * as M from "../scenes/s03-chaque-jour";
import { soloRoot } from "../SceneSolo";
registerRoot(soloRoot("S3", M));
