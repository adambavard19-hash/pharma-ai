import { AbsoluteFill, interpolate } from "remotion";
import { C, EASE, EASE_IN_OUT, sp, tw, useF } from "../theme";
import { LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { LgoWindow } from "../ui/counter";
import { AdviceCard, Cursor, Toast } from "../ui/product";

/* ==========================================================================
 * 4. LE CONSEIL ET LA DÉCISION (28,8 – 40,8 s)
 * L'avis s'affiche en coin d'écran sur le logiciel de gestion ; un clic
 * l'ouvre dans PharmaBoost ; le pharmacien choisit « Proposer ce produit ».
 * L'avis n'a pas de bouton : la décision se prend dans PharmaBoost.
 * ======================================================================== */

const TOAST = { x: 1220, y: 500, w: 560 };
const TOAST_C = { x: TOAST.x + TOAST.w / 2, y: TOAST.y + 100 };
const CLICK_TOAST = 108;
const CLICK_ACCEPT = 252;
const CARD = { x: 370, y: 214, w: 1180 };

type Pt = [number, number, number]; // [image, x, y]
function path(f: number, pts: Pt[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [fa, xa, ya] = pts[i];
    const [fb, xb, yb] = pts[i + 1];
    if (f <= fb) {
      const p = tw(f, [fa, fb], [0, 1], EASE_IN_OUT);
      return [xa + (xb - xa) * p, ya + (yb - ya) * p];
    }
  }
  const last = pts[pts.length - 1];
  return [last[1], last[2]];
}

export function Decision({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 2], [0, 1]);
  const exit = tw(f, [342, 372], [0, 1], EASE_IN_OUT);

  const toastIn = sp(f, 12, { damping: 22, stiffness: 200 });
  const zoom = tw(f, [30, 84], [0, 1], EASE_IN_OUT);
  const z = interpolate(zoom, [0, 1], [1, 1.75]);
  // Le zoom amène l'avis vers le centre de l'image.
  const tx = (1060 - TOAST_C.x) * zoom;
  const ty = (560 - TOAST_C.y) * zoom;

  const card = sp(f, CLICK_TOAST + 4, { damping: 200, stiffness: 95 });
  const show = (i: number) => sp(f, CLICK_TOAST + 10 + i * 7, { damping: 200, stiffness: 130 });
  const accepted = tw(f, [CLICK_ACCEPT + 2, CLICK_ACCEPT + 14], [0, 1]);
  const press = tw(f, [CLICK_ACCEPT - 4, CLICK_ACCEPT], [0, 1]) - tw(f, [CLICK_ACCEPT + 2, CLICK_ACCEPT + 8], [0, 1]);

  // Le pointeur : vers l'avis, clic ; puis sur les trois choix, clic sur « Proposer ce produit ».
  const BTN_Y = 744;
  const [cx, cy] =
    f < 150
      ? path(f, [[68, 1820, 1040], [100, 1090, 610], [CLICK_TOAST, 1090, 610]])
      : path(f, [[190, 1620, 1010], [212, 1370, BTN_Y], [224, 1370, BTN_Y], [236, 975, BTN_Y], [242, 975, BTN_Y], [CLICK_ACCEPT - 4, 590, BTN_Y]]);
  const cursorOpacity = f < 150 ? Math.min(tw(f, [68, 74], [0, 1]), 1 - tw(f, [CLICK_TOAST + 6, CLICK_TOAST + 14], [0, 1])) : Math.min(tw(f, [190, 198], [0, 1]), 1 - tw(f, [CLICK_ACCEPT + 30, CLICK_ACCEPT + 40], [0, 1]));
  const clickToast = tw(f, [CLICK_TOAST, CLICK_TOAST + 16], [0, 1]);
  const clickAccept = tw(f, [CLICK_ACCEPT, CLICK_ACCEPT + 16], [0, 1]);
  const pressToast = tw(f, [CLICK_TOAST - 4, CLICK_TOAST], [0, 1]) - tw(f, [CLICK_TOAST + 2, CLICK_TOAST + 8], [0, 1]);

  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateX(${-exit * 520}px)`, filter: `blur(${exit * 14}px)` }}>
      <LightStage>
        {/* Le comptoir : logiciel de gestion + avis en coin d'écran */}
        <AbsoluteFill
          style={{
            transformOrigin: `${TOAST_C.x}px ${TOAST_C.y}px`,
            transform: `translate(${tx}px, ${ty}px) scale(${z * (1 + 0.15 * card)})`,
            opacity: 1 - 0.7 * card,
            filter: `blur(${card * 8}px)`,
          }}
        >
          <At x={240} y={250}>
            <LgoWindow w={1280} lines={[{ text: "DOXYCYCLINE 100 mg cp séc. — 1 boîte", at: -999 }, { text: "PARACÉTAMOL 1000 mg cp — 1 boîte", at: -999 }]} />
          </At>
          <At x={TOAST.x} y={TOAST.y} style={{ opacity: toastIn, transform: `translateY(${(1 - toastIn) * 26}px) scale(${1 - 0.03 * pressToast})` }}>
            <Toast w={TOAST.w} />
          </At>
        </AbsoluteFill>

        <At x={240} y={48} w={1400}>
          <Kinetic at={6} out={64} size={52} lines={[words("Le conseil s'affiche *au comptoir,*", C.brand600), words("*sans gêner votre délivrance sur votre LGO.*", C.ink500)]} />
        </At>

        {/* La vente dans PharmaBoost : la carte de conseil */}
        {f >= CLICK_TOAST && (
          <At
            x={CARD.x}
            y={CARD.y}
            style={{
              opacity: Math.min(1, card * 1.5),
              transformOrigin: "50% 40%",
              transform: `translate(${(1 - card) * (1090 - 960)}px, ${(1 - card) * 120}px) scale(${(0.55 + 0.45 * card) * 1.08})`,
            }}
          >
            <AdviceCard w={CARD.w} show={show} accepted={accepted} press={press} stockPulse={tw(f, [170, 196], [0, 1])} />
            <div style={{ position: "absolute", right: 22, top: -30, fontSize: 15, color: C.ink400, opacity: show(2) }}>exemple · produit et prix de démonstration</div>
          </At>
        )}

        <At x={CARD.x} y={70} w={1400}>
          <Kinetic at={150} out={226} size={60} lines={[words("Choisi *dans votre stock.*", C.brand600)]} />
        </At>
        <At x={CARD.x} y={66} w={1400}>
          <Kinetic at={CLICK_ACCEPT + 8} out={338} size={52} lines={[words("Le pharmacien et le préparateur"), words("*gardent la décision.*", C.brand600)]} />
        </At>

        <Cursor x={cx} y={cy} opacity={cursorOpacity} press={Math.max(pressToast, press)} click={f < 150 ? (clickToast > 0 && clickToast < 1 ? clickToast : -1) : clickAccept > 0 && clickAccept < 1 ? clickAccept : -1} />
        <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(circle at 50% 50%, transparent 60%, rgba(15,23,42,${0.06 * tw(f, [CLICK_TOAST, CLICK_TOAST + 30], [0, 1], EASE)}))` }} />
      </LightStage>
    </AbsoluteFill>
  );
}
