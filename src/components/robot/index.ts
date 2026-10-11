export { Robot, type RobotProps } from "./robot";
export { emitRobotMood, useRobot, useRobotSignal, ROBOT_EVENT } from "./bus";
export { RobotSoundToggle } from "./sound-toggle";
export { playRobotSound, setRobotSound, useRobotSound } from "./sound";
export type { RobotMood, RobotBurst } from "@/core/robot/mascot";
export type { RobotSound, SoundContext } from "@/core/robot/sound";
