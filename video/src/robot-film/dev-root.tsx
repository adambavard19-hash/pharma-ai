import { Composition, registerRoot } from "remotion";
import { RobotFilm, RobotVertical, calculateRobotMetadata } from "../films/robot";

/**
 * Le film « Robot » seul, pour un bundle isolé pendant la fabrication (planches d'images, brouillons) :
 *   npx remotion bundle src/robot-film/dev-root.tsx --out-dir=out/bundle-robot
 * Le rendu du site passe, lui, par src/Root.tsx (scripts/export.mjs, scripts/robot.mjs).
 */
function RobotRoot() {
  return (
    <>
      <Composition id="Robot" component={RobotFilm} calculateMetadata={calculateRobotMetadata} defaultProps={{ voices: null, stale: [] }} durationInFrames={3360} fps={60} width={1920} height={1080} />
      <Composition id="RobotVertical" component={RobotVertical} calculateMetadata={calculateRobotMetadata} defaultProps={{ voices: null, stale: [] }} durationInFrames={3360} fps={60} width={1080} height={1920} />
    </>
  );
}

registerRoot(RobotRoot);
