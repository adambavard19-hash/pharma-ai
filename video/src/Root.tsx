import { Composition } from "remotion";
import { FilmShell, filmDuration, type FilmSpec } from "./FilmShell";
import { OUT_FPS } from "./theme";
import { LANCEMENT } from "./films/lancement";
import { COMMENT } from "./films/comment";
import { PRESENTATION } from "./films/presentation";
import { POURQUOI } from "./films/pourquoi";
import { AVANTAGES } from "./films/avantages";
import { SANS_ORDONNANCE } from "./films/sans-ordonnance";

/** Les films de la série, 16:9, 60 images/s. L'identifiant sert au rendu (scripts/export.mjs). */
export const FILMS: Record<string, FilmSpec> = {
  Presentation: PRESENTATION,
  Lancement: LANCEMENT,
  CommentCaMarche: COMMENT,
  Pourquoi: POURQUOI,
  Avantages: AVANTAGES,
  SansOrdonnance: SANS_ORDONNANCE,
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
    </>
  );
}
