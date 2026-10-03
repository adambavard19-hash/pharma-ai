import { AbsoluteFill } from "remotion";
import { C, EASE_IN_OUT, sp, tw, useF } from "../theme";
import type { FilmSpec } from "../FilmShell";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { MedBox } from "../ui/counter";
import { Bubble, EndCard, Panel, Pharmacist, Queue, TitleBlock, Toggle } from "../ui/common";
import { CalendarBanner, Phone, PlanScreen } from "../ui/panels";
import { Sfx } from "../ui/sfx";
import { EXAMPLE } from "../ui/product";

/* ==========================================================================
 * « Pourquoi PharmaBoost » — 34 s, 120 BPM (un temps = 15 images, une mesure
 * = 60). Les deux problèmes de la page /decouvrir/pourquoi, en « sans / avec ».
 * ======================================================================== */

const HALF = 180; // la bascule « sans » → « avec », dans chaque problème

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
  const doubts = ["Cet antibiotique rend-il sensible au soleil ?", "Une protection solaire en rayon ?", "Une précaution à rappeler ?"];
  const answers = [`${EXAMPLE.product} · ${EXAMPLE.stock} en rayon`, "Précautions vérifiées", "Phrase prête : « la doxycycline rend la peau sensible au soleil… »"];
  const doubtAt = [44, 64, 84];
  const answerAt = [HALF + 18, HALF + 34, HALF + 50];
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateY(${-exit * 120}px)`, filter: `blur(${exit * 10}px)` }}>
      <LightStage>
        <At x={120} y={250} w={820}>
          <TitleBlock chip="Problème 1 · Au comptoir" chipAt={2} at={8} out={HALF - 14} size={70} lines={[words("Des milliers"), words("de produits."), words("*Un patient à la fois.*", C.brand600)]} sub="Impossible de tout avoir en tête : le conseil passe à la trappe." subAt={40} subOut={HALF - 16} />
        </At>
        <At x={120} y={250} w={820} style={{ paddingTop: 88 }}>
          <TitleBlock at={HALF + 4} lines={[words("PharmaBoost"), words("*y pense avec vous.*", C.brand600)]} sub="Les meilleures références de votre rayon, pour chaque ordonnance. Vous décidez." subAt={HALF + 30} />
        </At>
        <At x={980} y={150}>
          <Panel style={{ width: 820, padding: 34 }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Toggle on={on} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 34 }}>
              <Queue count={5} appear={(i) => sp(f, 10 + i * 6, { damping: 16, stiffness: 180 })} />
              <Pharmacist on={on} />
            </div>
            <div style={{ position: "relative", marginTop: 30, height: 430 }}>
              {doubts.map((t, i) => {
                const p = Math.min(sp(f, doubtAt[i], { damping: 18, stiffness: 190 }), 1 - tw(f, [HALF - 10 + i * 2, HALF + i * 2], [0, 1]));
                return <Bubble key={t} text={t} tone="doubt" p={p} style={{ position: "absolute", right: 0, top: i * 110, maxWidth: 700 }} />;
              })}
              {answers.map((t, i) => {
                const p = sp(f, answerAt[i], { damping: 18, stiffness: 190 });
                return f >= answerAt[i] - 1 ? <Bubble key={t} text={t} tone="ok" p={p} style={{ position: "absolute", right: 0, top: i * 110, maxWidth: 720 }} /> : null;
              })}
              <div style={{ position: "absolute", left: 0, bottom: 0, fontSize: 25, fontWeight: 600, color: C.ink500, opacity: Math.min(tw(f, [112, 124], [0, 1]), 1 - tw(f, [HALF - 12, HALF - 4], [0, 1])) }}>Le patient repart sans conseil.</div>
              <div style={{ position: "absolute", left: 0, bottom: 0, fontSize: 25, fontWeight: 600, color: C.brand700, opacity: tw(f, [HALF + 76, HALF + 88], [0, 1]) }}>Le patient repart avec le bon conseil.</div>
            </div>
          </Panel>
        </At>
        {[0, 1, 2, 3, 4].map((i) => <Sfx key={`q${i}`} at={10 + i * 6} name="pop" volume={0.3} />)}
        {doubtAt.map((a) => <Sfx key={`d${a}`} at={a} name="pop" volume={0.5} />)}
        <Sfx at={HALF - 6} name="whoosh" volume={0.6} />
        <Sfx at={HALF} name="clic" volume={0.7} />
        {answerAt.map((a) => <Sfx key={`a${a}`} at={a} name="pop" volume={0.55} />)}
        {answerAt.map((a) => <Sfx key={`t${a}`} at={a + 4} name="tic" volume={0.4} />)}
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
    { name: "DOXYCYCLINE 100 mg", form: "comprimé sécable", x: 0, y: 150, r: -8, at: 14 },
    { name: "PARACÉTAMOL 1000 mg", form: "comprimé", x: 230, y: 60, r: 7, at: 22 },
    { name: "Crème solaire SPF 50+", form: "protection solaire · 50 ml", x: 120, y: 250, r: -3, at: 30 },
  ];
  const phone = sp(f, HALF + 4, { damping: 22, stiffness: 120 });
  const n1 = sp(f, HALF + 48, { damping: 18, stiffness: 170 });
  const n2 = sp(f, HALF + 78, { damping: 18, stiffness: 170 });
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateY(${(1 - enter) * 120}px)` }}>
      <LightStage>
        <AbsoluteFill style={{ opacity: 1 - exit }}>
          <At x={120} y={250} w={820}>
            <TitleBlock chip="Problème 2 · À la maison" chipAt={2} at={8} out={HALF - 14} lines={[words("Plusieurs boîtes."), words("Et beaucoup"), words("*de questions.*", C.brand600)]} />
          </At>
          <At x={120} y={250} w={820} style={{ paddingTop: 88 }}>
            <TitleBlock at={HALF + 4} lines={[words("Il repart"), words("avec son bilan,"), words("*et ses rappels.*", C.brand600)]} sub="Chaque médicament, à quoi il sert, quand le prendre. Et un signe de la pharmacie le dernier jour." subAt={HALF + 96} />
          </At>
          <At x={1060} y={110}>
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
              <PlanScreen show={(i) => sp(f, HALF + 16 + i * 6, { damping: 200, stiffness: 140 })} />
            </Phone>
          </At>
          <At x={1120} y={236} w={600} style={{ opacity: n1, transform: `translateY(${(1 - n1) * -40}px) scale(${0.96 + 0.04 * n1})` }}>
            <CalendarBanner title="Matin — traitement" body="DOXYCYCLINE 100 mg — 1 comprimé" time="08:00" />
          </At>
          <At x={1120} y={348} w={600} style={{ opacity: n2, transform: `translateY(${(1 - n2) * -40}px) scale(${0.96 + 0.04 * n2})` }}>
            <CalendarBanner title="Fin du traitement — votre pharmacien prend de vos nouvelles" body="Fin du traitement : comment allez-vous ?" time="18:00" />
          </At>
        </AbsoluteFill>
        {boxes.map((b) => <Sfx key={b.name} at={b.at + 8} name="pop" volume={0.35} />)}
        {doubtAt.map((a) => <Sfx key={`d${a}`} at={a} name="pop" volume={0.5} />)}
        <Sfx at={HALF - 6} name="whoosh" volume={0.6} />
        <Sfx at={HALF} name="clic" volume={0.7} />
        <Sfx at={HALF + 6} name="swish" volume={0.45} />
        <Sfx at={HALF + 48} name="notif" volume={0.6} />
        <Sfx at={HALF + 78} name="notif" volume={0.5} />
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
