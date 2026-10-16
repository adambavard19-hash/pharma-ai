import { InstaPost } from "./insta/post";
import { Composition } from "remotion";
import { FilmShell, filmDuration, type FilmSpec } from "./FilmShell";
import { OUT_FPS } from "./theme";
import { LANCEMENT } from "./films/lancement";
import { COMMENT } from "./films/comment";
import { Presentation, PresScene, calculatePresentationMetadata, calculatePresSceneMetadata } from "./films/presentation";
import { KitDemo } from "./presentation/motion/kit-demo";
import { POURQUOI } from "./films/pourquoi";
import { AVANTAGES } from "./films/avantages";
import { SANS_ORDONNANCE } from "./films/sans-ordonnance";
import { PARTENAIRES } from "./films/partenaires";
import { Reel, calculateReelMetadata } from "./films/reel";
import { Tarif, calculateTarifMetadata } from "./films/tarif";
import { RobotFilm, RobotVertical, calculateRobotMetadata } from "./films/robot";
import { PriseEnMain, PRISE_EN_MAIN_FRAMES, PEM_FPS } from "./films/prise-en-main";

/** Les films de la série, 16:9, 60 images/s. L'identifiant sert au rendu (scripts/export.mjs). */
export const FILMS: Record<string, FilmSpec> = {
  Lancement: LANCEMENT,
  CommentCaMarche: COMMENT,
  Pourquoi: POURQUOI,
  Avantages: AVANTAGES,
  SansOrdonnance: SANS_ORDONNANCE,
  Partenaires: PARTENAIRES,
};

const components = Object.fromEntries(
  Object.entries(FILMS).map(([id, spec]) => {
    const Film = () => <FilmShell spec={spec} />;
    Object.defineProperty(Film, "name", { value: id });
    return [id, Film];
  }),
);

export function Root() {
  return (
    <>
      {Object.entries(FILMS).map(([id, spec]) => (
        <Composition key={id} id={id} component={components[id]} durationInFrames={filmDuration(spec)} fps={OUT_FPS} width={1920} height={1080} />
      ))}
      <Composition id="Presentation" component={Presentation} calculateMetadata={calculatePresentationMetadata} defaultProps={{ voices: null, stale: [] }} durationInFrames={2880} fps={OUT_FPS} width={1920} height={1080} />
      {/* L'aperçu d'UNE scène du film « Presentation » (image 0 = début de sa fenêtre) : --props='{"scene":"S6"}'. */}
      <Composition id="PresScene" component={PresScene} calculateMetadata={calculatePresSceneMetadata} defaultProps={{ scene: "S1" as const, voices: null, stale: [] }} durationInFrames={300} fps={OUT_FPS} width={1920} height={1080} />
      {/* La vitrine du kit motion design (src/presentation/motion/kit) : chaque gadget en action. */}
      <Composition id="PresKit" component={KitDemo} durationInFrames={360} fps={OUT_FPS} width={1920} height={1080} />
      {/* Le reel Instagram, vertical : sa durée vient des fichiers de voix (scripts/reel.mjs pour le rendu). */}
      <Composition id="Reel" component={Reel} calculateMetadata={calculateReelMetadata} defaultProps={{ voices: null }} durationInFrames={1700} fps={60} width={1080} height={1920} />
      {/* Le film de la section tarif, 16:9, avec la voix : sa durée vient elle aussi des fichiers de voix (public/voix/tarif). */}
      <Composition id="Tarif" component={Tarif} calculateMetadata={calculateTarifMetadata} defaultProps={{ voices: null, stale: [] }} durationInFrames={2400} fps={OUT_FPS} width={1920} height={1080} />
      {/* Le film « Robot », façon Coucou, avec la voix (public/voix/robot) ; sa déclinaison verticale pour Instagram (scripts/robot.mjs). */}
      <Composition id="Robot" component={RobotFilm} calculateMetadata={calculateRobotMetadata} defaultProps={{ voices: null, stale: [] }} durationInFrames={3360} fps={OUT_FPS} width={1920} height={1080} />
      {/* La publication Instagram « Qu'est-ce que PharmaBoost ? », carrousel 4:5 : une image par page (--props='{"slide":1}'). */}
      <Composition id="PriseEnMain" component={PriseEnMain} durationInFrames={PRISE_EN_MAIN_FRAMES} fps={PEM_FPS} width={1920} height={1080} />
      <Composition id="InstaPost" component={InstaPost} defaultProps={{ slide: 1 }} durationInFrames={1} fps={OUT_FPS} width={1080} height={1350} />
      <Composition id="RobotVertical" component={RobotVertical} calculateMetadata={calculateRobotMetadata} defaultProps={{ voices: null, stale: [] }} durationInFrames={3360} fps={OUT_FPS} width={1080} height={1920} />
    </>
  );
}
