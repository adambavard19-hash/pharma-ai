import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);
// Sans ceci, la sortie est étiquetée bt470bg / pleine plage : décalage de couleurs selon le lecteur.
Config.setColorSpace("bt709");
