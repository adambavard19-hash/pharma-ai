export { Robot, type RobotProps } from "./robot";
export { emitRobotMood, useRobot, useRobotSignal, ROBOT_EVENT } from "./bus";
export { RobotSoundToggle } from "./sound-toggle";
export { cheerOnNextPage } from "./cheer";
// `AppRobotCompanion` s'importe depuis "./app-companion" : ce module tire les actions serveur des
// bulles d'alerte, que le robot du site public, de l'extranet et de la direction n'a pas à charger.
export { playRobotSound, setRobotSound, useRobotSound } from "./sound";
export type { RobotMood, RobotBurst } from "@/core/robot/mascot";
export type { RobotSound, SoundContext } from "@/core/robot/sound";
