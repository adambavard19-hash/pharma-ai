import { tw, EASE_IN_OUT, useF, usePerSecond } from "../theme";
import { Cursor } from "../ui/product";
import { Sfx } from "../ui/sfx";
import { Banner, bannerStart, bannerTarget, resolveBanner, type BannerFrame, type BannerState, type BannerStep, type BannerView, type DemoSale } from "../ui/banner";
import { W } from "./stage";

/* ==========================================================================
 * LA BANNIÈRE DU COMPTOIR DANS L'IMAGE VERTICALE.
 *
 * La même bannière que les films 16:9 (ui/banner.tsx : le vrai constructeur de
 * l'avis, l'arbre de questions, les raisons du moteur), posée dans une image de
 * 1080 px de large ; le pointeur rejoint chaque bouton avant de le cliquer.
 * ======================================================================== */

/** Un temps du scénario : l'état change ; `click` nomme le bouton cliqué ; `hover` amène seulement le pointeur. */
export type Act = { at: number; patch?: BannerStep["patch"]; click?: string; hover?: string };
/** Le coin haut-droit de la carte dans l'image verticale, et son agrandissement. */
export type Place = { zoom: number; right: number; top: number };

/** Un point de la bannière (cotes à 100 %) → l'image 1080 × 1920. */
export function reelPoint(b: BannerFrame, key: string, place: Place) {
  const p = bannerTarget(b, key);
  return { x: W - place.right - (b.w - p.x) * place.zoom, y: place.top + p.y * place.zoom };
}

export function stepsOf(acts: Act[]): BannerStep[] {
  return acts.filter((a) => a.patch).map((a) => ({ at: a.at, patch: a.patch!, press: a.click }));
}

/** La bannière qui joue son scénario, et le pointeur (avec le son de chaque clic). */
export function ReelBanner({ sale, start, acts, place, highlight, tree }: { sale: DemoSale; start: BannerView; acts: Act[]; place: Place; highlight?: (key: string) => number; tree?: BannerState["tree"] }) {
  const f = useF();
  const perSecond = usePerSecond();
  const initial = { ...bannerStart(sale, start), ...(tree ? { tree } : {}) };
  const steps = stepsOf(acts);
  const b = resolveBanner(initial, steps, f, perSecond);

  // Le pointeur : de point en point ; il arrive deux images avant chaque clic.
  const targets = acts.filter((a) => a.click || a.hover).map((a) => ({ at: a.at, click: Boolean(a.click), ...reelPoint(resolveBanner(initial, steps, a.at - 1, perSecond), (a.click ?? a.hover)!, place) }));
  let cursor = null;
  if (targets.length) {
    const first = targets[0];
    const last = targets[targets.length - 1];
    let pos = { x: first.x + 220, y: first.y + 260 };
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      const prev = i === 0 ? pos : targets[i - 1];
      const dur = Math.min(14, Math.max(7, (i === 0 ? 20 : c.at - targets[i - 1].at) * 0.6));
      const p = tw(f, [c.at - dur - 2, c.at - 2], [0, 1], EASE_IN_OUT);
      if (p <= 0) break;
      pos = { x: prev.x + (c.x - prev.x) * p, y: prev.y + (c.y - prev.y) * p };
    }
    const clicks = targets.filter((c) => c.click);
    const opacity = Math.min(tw(f, [first.at - 22, first.at - 14], [0, 1]), 1 - tw(f, [last.at + 14, last.at + 22], [0, 1]));
    const near = clicks.find((c) => f >= c.at && f <= c.at + 16);
    const press = Math.max(0, ...clicks.map((c) => tw(f, [c.at - 4, c.at], [0, 1]) - tw(f, [c.at + 1, c.at + 6], [0, 1])));
    if (opacity > 0) cursor = <div style={{ position: "absolute", left: 0, top: 0, transform: "scale(1.5)", transformOrigin: `${pos.x}px ${pos.y}px` }}><Cursor x={pos.x - 2} y={pos.y - 2} opacity={opacity} press={press} click={near ? (f - near.at) / 16 : -1} /></div>;
  }

  return (
    <>
      <Banner b={b} {...place} highlight={highlight} />
      {cursor}
      {acts.filter((a) => a.click).map((a) => <Sfx key={`c${a.at}`} at={a.at} name="clic" volume={0.7} />)}
    </>
  );
}
