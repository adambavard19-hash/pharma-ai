import { AbsoluteFill } from "remotion";
import { C, EASE_IN_OUT, sp, tw, useF } from "../theme";
import type { FilmSpec } from "../FilmShell";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { MedBox } from "../ui/counter";
import { Bubble, EndCard, Panel, Pharmacist, Queue, TitleBlock, Toggle } from "../ui/common";
import { CalendarBanner, PLANS, Phone, PlanScreen } from "../ui/panels";
import { Sfx } from "../ui/sfx";
import { IllustrationNote, SALES } from "../ui/banner";
import { BannerPlay, sold } from "../scenes/comptoir";

/* ==========================================================================
 * « Pourquoi PharmaBoost » — 34 s, 120 BPM (un temps = 15 images, une mesure
 * = 60). Les deux problèmes de la page /decouvrir/pourquoi, en « sans / avec ».
 * Au comptoir, le « avec » est la bannière du poste de caisse : l'amoxicilline
 * est scannée, « 1 conseil disponible », le probiotique, « Vendu » — une vente
 * sans mise en garde, dont le conseil vient d'une règle qui propose dès le scan.
 * À la maison, le plan conseil de la même ordonnance et le rappel de prise —
 * aucune promesse de nouvelles en fin de traitement.
 * ======================================================================== */

const HALF = 180; // la bascule « sans » → « avec », dans chaque problème
/** L'interrupteur « Sans / Avec PharmaBoost », au même endroit dans les deux problèmes. */
const TOGGLE = { x: 1130, y: 110 };
/** La bannière du « avec », coin haut-droit dans l'image 1080p, agrandie 1,6 fois. */
const SUN_PLACE = { zoom: 1.6, right: 120, top: 210 };

function Title({ intro }: { intro: number }) {
  const f = useF();
  const exit = tw(f, [100, 124], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: (1 - exit) * (intro ? tw(f, [-intro, 0], [0, 1]) : 1), transform: `scale(${1 + 0.06 * tw(f, [0, 100], [0, 1]) + 0.25 * exit})` }}>
      <DarkStage>
        <At x={0} y={330} w={1920}>
          <Kinetic at={10} size={104} color={C.white} align="center" stagger={2} lines={[words("Et si chaque délivrance"), words("révélait tout son potentiel"), words("*de conseil ?*", C.brand300)]} />
        </At>
        <Sfx at={10} name="impact" volume={0.4} />
        <Sfx at={13} name="tic" volume={0.5} />
        <Sfx at={22} name="tic" volume={0.5} />
        <Sfx at={28} name="tic" volume={0.5} />
        <Sfx at={34} name="tic" volume={0.5} />
        <Sfx at={100} name="whoosh" volume={0.55} />
      </DarkStage>
    </AbsoluteFill>
  );
}

function Counter({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [344, 364], [0, 1], EASE_IN_OUT);
  const on = tw(f, [HALF - 6, HALF + 6], [0, 1], EASE_IN_OUT);
  // Les questions du pharmacien seul, celles de la page « Pourquoi ».
  const doubts = ["Quel conseil avec cet antibiotique ?", "Un probiotique en rayon ? Lequel ?", "Une précaution à rappeler ?"];
  const doubtAt = [44, 64, 84];
  // La bannière : « Scan détecté ! », puis « 1 conseil disponible » seul 1,1 s (readyPauseMs), puis ouverte ; « Vendu ».
  const SCAN = HALF + 4;
  const READY = HALF + 34;
  const OPEN = READY + 33;
  const SOLD = HALF + 128;
  const panelOut = tw(f, [HALF - 4, HALF + 10], [0, 1], EASE_IN_OUT);
  const bannerIn = sp(f, SCAN - 2, { damping: 22, stiffness: 160 });
  const ring = (key: string) => (key.startsWith("pill:probio:") ? Math.min(tw(f, [OPEN + 16, OPEN + 26], [0, 1]), 1 - tw(f, [SOLD - 14, SOLD - 4], [0, 1])) : 0);
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateY(${-exit * 120}px)`, filter: `blur(${exit * 10}px)` }}>
      <LightStage>
        <At x={120} y={250} w={820}>
          <TitleBlock chip="Problème 1 · Au comptoir" chipAt={2} at={8} out={HALF - 14} size={70} lines={[words("Des milliers"), words("de produits."), words("*Un patient à la fois.*", C.brand600)]} sub="Impossible de tout avoir en tête : le bon conseil passe parfois à la trappe." subAt={40} subOut={HALF - 16} />
        </At>
        <At x={120} y={250} w={820} style={{ paddingTop: 88 }}>
          <TitleBlock at={HALF + 4} lines={[words("PharmaBoost"), words("*y pense avec vous.*", C.brand600)]} sub="Au moment du scan, ce qui accompagne le traitement, pris dans votre rayon. Vous décidez." subAt={HALF + 30} />
        </At>
        <At x={TOGGLE.x} y={TOGGLE.y}>
          <Toggle on={on} />
        </At>
        {/* Sans : la file, le pharmacien seul et ses questions. */}
        {panelOut < 1 && (
          <At x={980} y={200} style={{ opacity: 1 - panelOut, transform: `translateY(${panelOut * 30}px) scale(${1 - 0.03 * panelOut})` }}>
            <Panel style={{ width: 820, padding: 34 }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <Queue count={5} appear={(i) => sp(f, 10 + i * 6, { damping: 16, stiffness: 180 })} />
                <Pharmacist on={0} />
              </div>
              <div style={{ position: "relative", marginTop: 30, height: 400 }}>
                {doubts.map((t, i) => {
                  const p = Math.min(sp(f, doubtAt[i], { damping: 18, stiffness: 190 }), 1 - tw(f, [HALF - 10 + i * 2, HALF + i * 2], [0, 1]));
                  return <Bubble key={t} text={t} tone="doubt" p={p} style={{ position: "absolute", right: 0, top: i * 110, maxWidth: 700 }} />;
                })}
                <div style={{ position: "absolute", left: 0, bottom: 0, fontSize: 25, fontWeight: 600, color: C.ink500, opacity: tw(f, [112, 124], [0, 1]) }}>Le patient repart sans conseil.</div>
              </div>
            </Panel>
          </At>
        )}
        {/* Avec : la bannière du poste de caisse, sur l'amoxicilline. */}
        {f >= SCAN - 4 && (
          <AbsoluteFill style={{ opacity: bannerIn, transform: `translateY(${(1 - bannerIn) * -24}px)` }}>
            <BannerPlay
              sale={SALES.antibiotique}
              start="scan"
              acts={[
                { at: READY, patch: { view: "ready" } },
                { at: OPEN, patch: { view: "expanded" } },
                { at: SOLD, patch: sold("probio"), click: "sold:probio" },
              ]}
              place={SUN_PLACE}
              highlight={() => ring}
            >
              <At x={980} y={800} w={820} style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: C.brand700, opacity: tw(f, [SOLD + 12, SOLD + 24], [0, 1]), transform: `translateY(${(1 - tw(f, [SOLD + 12, SOLD + 24], [0, 1])) * 10}px)` }}>
                Le patient repart avec le bon conseil.
              </At>
              <At x={120} y={1020} w={1100}>
                <IllustrationNote />
              </At>
            </BannerPlay>
          </AbsoluteFill>
        )}
        {[0, 1, 2, 3, 4].map((i) => <Sfx key={`q${i}`} at={10 + i * 6} name="pop" volume={0.3} />)}
        {doubtAt.map((a) => <Sfx key={`d${a}`} at={a} name="pop" volume={0.5} />)}
        <Sfx at={HALF - 6} name="whoosh" volume={0.6} />
        <Sfx at={HALF} name="clic" volume={0.7} />
        <Sfx at={SCAN} name="bip" volume={0.55} />
        <Sfx at={READY} name="pop" volume={0.6} />
        <Sfx at={OPEN} name="swish" volume={0.45} />
        <Sfx at={SOLD + 4} name="pop" volume={0.5} />
      </LightStage>
    </AbsoluteFill>
  );
}

function Home({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [344, 364], [0, 1], EASE_IN_OUT);
  const on = tw(f, [HALF - 6, HALF + 6], [0, 1], EASE_IN_OUT);
  const doubts = ["C'est le matin ou le soir ?", "Pendant combien de jours ?", "Celui-là, il sert à quoi ?"];
  const doubtAt = [64, 84, 104];
  const boxes = [
    { name: "AMOXICILLINE 1 g", form: "comprimé", x: 0, y: 150, r: -8, at: 14 },
    { name: "PARACÉTAMOL 1000 mg", form: "comprimé", x: 230, y: 60, r: 7, at: 22 },
    { name: "PROBIOTIQUE", form: "30 gélules", x: 120, y: 250, r: -3, at: 30 },
  ];
  const phone = sp(f, HALF + 4, { damping: 22, stiffness: 120 });
  // Seul le rappel de prise : la fin de traitement (« comment allez-vous ? ») sonnerait comme une promesse.
  const n1 = sp(f, HALF + 48, { damping: 18, stiffness: 170 });
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateY(${(1 - enter) * 120}px)` }}>
      <LightStage>
        <AbsoluteFill style={{ opacity: 1 - exit }}>
          <At x={120} y={250} w={820}>
            <TitleBlock chip="Problème 2 · À la maison" chipAt={2} at={8} out={HALF - 14} lines={[words("Plusieurs boîtes."), words("Et beaucoup"), words("*de questions.*", C.brand600)]} />
          </At>
          <At x={120} y={250} w={820} style={{ paddingTop: 88 }}>
            <TitleBlock at={HALF + 4} lines={[words("Il repart avec"), words("son plan conseil,"), words("*et ses rappels.*", C.brand600)]} sub="La posologie, l'indication de chaque médicament et vos conseils. Sur son téléphone via un QR code, par e-mail ou en version imprimée, avec des rappels." subAt={HALF + 40} />
          </At>
          <At x={TOGGLE.x} y={TOGGLE.y}>
            <Toggle on={on} />
          </At>
          {/* Sans : les boîtes en vrac et les questions */}
          <AbsoluteFill style={{ opacity: 1 - on }}>
            {boxes.map((b) => {
              const p = sp(f, b.at, { damping: 13, stiffness: 160 });
              return (
                <At key={b.name} x={1080 + b.x} y={420 + b.y - (1 - p) * 300} style={{ transform: `rotate(${b.r}deg)`, opacity: Math.min(1, p * 2) }}>
                  <MedBox name={b.name} form={b.form} w={360} tilt={-8} />
                </At>
              );
            })}
            {doubts.map((t, i) => (
              <At key={t} x={1000 + (i % 2) * 260} y={200 + i * 96} w={620}>
                <Bubble text={t} tone="doubt" p={sp(f, doubtAt[i], { damping: 18, stiffness: 190 })} />
              </At>
            ))}
          </AbsoluteFill>
          {/* Avec : le plan sur le téléphone, les rappels */}
          <At x={1230} y={200 + (1 - phone) * 900} style={{ opacity: f < HALF ? 0 : 1 }}>
            <Phone h={820}>
              <PlanScreen plan={PLANS.antibiotique} show={(i) => sp(f, HALF + 16 + i * 6, { damping: 200, stiffness: 140 })} />
            </Phone>
          </At>
          <At x={1120} y={236} w={600} style={{ opacity: n1, transform: `translateY(${(1 - n1) * -40}px) scale(${0.96 + 0.04 * n1})` }}>
            <CalendarBanner {...PLANS.antibiotique.reminder} />
          </At>
        </AbsoluteFill>
        {boxes.map((b) => <Sfx key={b.name} at={b.at + 8} name="pop" volume={0.35} />)}
        {doubtAt.map((a) => <Sfx key={`d${a}`} at={a} name="pop" volume={0.5} />)}
        <Sfx at={HALF - 6} name="whoosh" volume={0.6} />
        <Sfx at={HALF} name="clic" volume={0.7} />
        <Sfx at={HALF + 6} name="swish" volume={0.45} />
        <Sfx at={HALF + 48} name="notif" volume={0.6} />
        <Sfx at={340} name="montee" volume={0.4} />
      </LightStage>
    </AbsoluteFill>
  );
}

function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Un conseil au bon moment."), words("*Un patient qui sait quoi prendre.*", C.brand300)]} />;
}

export const POURQUOI: FilmSpec = {
  tag: "Pourquoi PharmaBoost",
  scenes: [
    { C: Title, at: 0 },
    { C: Counter, at: 120 },
    { C: Home, at: 480 },
    { C: End, at: 840 },
  ],
  end: 1020,
  overlap: 15,
  speed: 1,
  music: "music/pourquoi.wav",
};
