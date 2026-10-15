import { Composition, registerRoot } from "remotion";
import { Presentation, calculatePresentationMetadata } from "../films/presentation";

/** Un bundle du seul film « Présentation » (planches d'images sans dépendre des autres films) : npx remotion bundle src/presentation/dev-root.tsx … */
function Root() {
  return <Composition id="Presentation" component={Presentation} calculateMetadata={calculatePresentationMetadata} defaultProps={{ voices: null, stale: [] }} durationInFrames={3360} fps={60} width={1920} height={1080} />;
}

registerRoot(Root);
