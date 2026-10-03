import { AbsoluteFill } from "remotion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { C, EASE_IN_OUT, MONO, SHADOW, sp, tw, useF } from "../theme";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { TitleBlock } from "../ui/common";
import { CalendarBanner, Phone, PlanScreen } from "../ui/panels";
import { Sfx } from "../ui/sfx";

/* ==========================================================================
 * Les scènes du site refait (octobre 2026) : les trois questions d'ouverture
 * (« Et si chaque délivrance révélait tout son potentiel de conseil ? »), les
 * trois étapes, les exemples de conseil, le plan conseil du patient et la
 * sécurité. Mêmes mots que le site.
 * ======================================================================== */

/** Durée de l'ouverture : six mesures à 120 BPM. */
export const PROMESSE_FRAMES = 432;

/**
 * Trois questions, puis la réponse : « Et si chaque délivrance révélait tout
 * son potentiel de conseil ? », « Comment ne manquer aucune opportunité de
 * conseil au comptoir ? », « Votre équipe officinale peut-elle penser à tout
 * le potentiel de conseil à chaque délivrance ? » → « PharmaBoost, oui. »
 * 432 images.
 */
export function Promesse({ intro }: { intro: number }) {
  const f = useF();
  const exit = tw(f, [406, 430], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: (1 - exit) * (intro ? tw(f, [-intro, 0], [0, 1]) : 1), transform: `scale(${1 + 0.05 * tw(f, [0, 406], [0, 1]) + 0.22 * exit})` }}>
      <DarkStage>
        <At x={0} y={330} w={1920}>
          <Kinetic at={8} out={104} size={104} color={C.white} align="center" stagger={2} lines={[words("Et si chaque délivrance"), words("révélait tout son potentiel"), words("*de conseil ?*", C.brand300)]} />
        </At>
        <At x={0} y={380} w={1920}>
          <Kinetic at={116} out={204} size={100} color={C.white} align="center" stagger={2} lines={[words("Comment ne manquer aucune"), words("*opportunité de conseil* au comptoir ?", C.brand300)]} />
        </At>
        <At x={0} y={330} w={1920}>
          <Kinetic at={216} out={318} size={84} color={C.white} align="center" stagger={2} lines={[words("Votre équipe officinale peut-elle penser"), words("à tout le potentiel de conseil"), words("*à chaque délivrance ?*", C.brand300)]} />
        </At>
        <At x={0} y={420} w={1920}>
          <Kinetic at={330} size={150} color={C.white} align="center" stagger={3} lines={[words("PharmaBoost, *oui.*", C.accent300)]} />
        </At>
        <Sfx at={8} name="impact" volume={0.45} />
        {[12, 18, 24].map((a) => <Sfx key={a} at={a} name="tic" volume={0.4} />)}
        <Sfx at={104} name="whoosh" volume={0.4} />
        <Sfx at={116} name="tic" volume={0.4} />
        <Sfx at={204} name="whoosh" volume={0.4} />
        <Sfx at={216} name="tic" volume={0.4} />
        <Sfx at={318} name="whoosh" volume={0.45} />
        <Sfx at={330} name="impact" volume={0.5} />
        <Sfx at={406} name="whoosh" volume={0.55} />
      </DarkStage>
    </AbsoluteFill>
  );
}

/** Une étape numérotée, plein cadre : « 01 · Vous scannez l'ordonnance ». 108 images. */
export function stepCard(n: string, text: string) {
  function Step({ intro }: { intro: number }) {
    const f = useF();
    const enter = intro ? tw(f, [-intro, 0], [0, 1]) : 1;
    const exit = tw(f, [90, 106], [0, 1], EASE_IN_OUT);
    const num = sp(f, 2, { damping: 14, stiffness: 170 });
    return (
      <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${1 + 0.04 * tw(f, [0, 90], [0, 1]) + 0.15 * exit})` }}>
        <DarkStage>
          <At x={0} y={300} w={1920} style={{ textAlign: "center", fontFamily: MONO, fontSize: 132, fontWeight: 500, color: C.accent300, opacity: Math.min(1, num * 1.4), transform: `translateY(${(1 - num) * 50}px)` }}>
            {n}
          </At>
          <At x={0} y={500} w={1920}>
            <Kinetic at={10} size={92} color={C.white} align="center" stagger={2} lines={[words(text)]} />
          </At>
          <Sfx at={2} name="impact" volume={0.35} />
          <Sfx at={10} name="pop" volume={0.4} />
          <Sfx at={90} name="whoosh" volume={0.5} />
        </DarkStage>
      </AbsoluteFill>
    );
  }
  Object.defineProperty(Step, "name", { value: `Etape${n}` });
  return Step;
}

/** « Le conseil qui va avec l'ordonnance » : les trois exemples du site. 180 images. */
export function Examples({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [160, 178], [0, 1], EASE_IN_OUT);
  const rows = [
    { rx: "Antibiotique photosensibilisant", advice: "Protection solaire SPF 50+", why: "Ce traitement rend la peau plus sensible au soleil.", at: 34 },
    { rx: "Antibiotique, patient fatigué", advice: "Vitamines", why: "Pour accompagner la convalescence.", at: 60 },
    { rx: "Traitement contre l'acné", advice: "Crème hydratante et baume à lèvres", why: "Ce traitement assèche la peau et les lèvres.", at: 86 },
  ];
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 100 - exit * 100}px)` }}>
      <LightStage>
        <At x={160} y={110} w={1600}>
          <TitleBlock chip="Exemples" chipAt={2} at={6} size={80} lines={[words("Le conseil qui va"), words("*avec l'ordonnance.*", C.brand600)]} />
        </At>
        <At x={160} y={470} w={1600}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "520px 60px 480px 1fr", padding: "0 32px", fontSize: 19, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ink400, opacity: tw(f, [20, 32], [0, 1]) }}>
              <span>Sur l&apos;ordonnance</span><span /><span>Vous conseillez</span><span>Pourquoi</span>
            </div>
            {rows.map((r) => {
              const p = sp(f, r.at, { damping: 18, stiffness: 170 });
              return (
                <div key={r.advice} style={{ display: "grid", gridTemplateColumns: "520px 60px 480px 1fr", alignItems: "center", background: C.white, border: `1px solid ${C.ink200}`, borderRadius: 24, padding: "24px 32px", boxShadow: SHADOW.card, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 90}px)` }}>
                  <span style={{ fontSize: 31, color: C.ink600, paddingRight: 16 }}>{r.rx}</span>
                  <ArrowRight size={34} color={C.brand600} />
                  <span style={{ fontSize: 36, fontWeight: 600, color: C.ink900, lineHeight: 1.15, paddingRight: 24 }}><span style={{ color: C.brand600 }}>+</span> {r.advice}</span>
                  <span style={{ fontSize: 26, lineHeight: 1.3, color: C.ink500 }}>{r.why}</span>
                </div>
              );
            })}
          </div>
        </At>
        {rows.map((r) => <Sfx key={r.at} at={r.at} name="pop" volume={0.5} />)}
        {rows.map((r) => <Sfx key={`t${r.at}`} at={r.at + 6} name="tic" volume={0.35} />)}
        <Sfx at={160} name="whoosh" volume={0.5} />
      </LightStage>
    </AbsoluteFill>
  );
}

/** « Il repart avec son plan conseil » : le téléphone du patient et le premier rappel. 216 images. */
export function Bilan({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [196, 214], [0, 1], EASE_IN_OUT);
  const phone = sp(f, 8, { damping: 22, stiffness: 120 });
  const n1 = sp(f, 100, { damping: 18, stiffness: 170 });
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 100 - exit * 100}px)` }}>
      <LightStage>
        <At x={140} y={290} w={880}>
          <TitleBlock chip="Plan conseil patient" chipAt={2} at={8} size={80} lines={[words("Il repart avec"), words("*son plan conseil.*", C.brand600)]} sub="La posologie, l'indication, vos conseils. Sur son téléphone via un QR code, un e-mail ou une version imprimée papier." subAt={44} />
        </At>
        <At x={1210} y={120 + (1 - phone) * 900}>
          <Phone h={840}>
            <PlanScreen show={(i) => sp(f, 26 + i * 9, { damping: 200, stiffness: 140 })} />
          </Phone>
        </At>
        <At x={1090} y={170} w={600} style={{ opacity: n1, transform: `translateY(${(1 - n1) * -40}px) scale(${0.96 + 0.04 * n1})` }}>
          <CalendarBanner title="Matin — traitement" body="DOXYCYCLINE 100 mg — 1 comprimé" time="08:00" />
        </At>
        <Sfx at={8} name="swish" volume={0.45} />
        {[0, 1, 2, 3].map((i) => <Sfx key={i} at={30 + i * 9} name="tic" volume={0.3} />)}
        <Sfx at={100} name="notif" volume={0.6} />
      </LightStage>
    </AbsoluteFill>
  );
}

/** « La sécurité avant la suggestion » : les quatre blocs du site. 216 images. */
export function Security({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 0], [0, 1]);
  const exit = tw(f, [196, 214], [0, 1], EASE_IN_OUT);
  const items = [
    ["Vigilances", "Contrôles intégrés au parcours"],
    ["Réglementation", "Les situations à risque sont signalées"],
    ["Décision", "Le pharmacien garde la validation finale"],
    ["Données", "Aucune donnée patient conservée"],
  ];
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${1 + 0.12 * exit})` }}>
      <DarkStage>
        <At x={0} y={170} w={1920}>
          <Kinetic at={6} size={100} color={C.white} align="center" stagger={2} lines={[words("La sécurité"), words("*avant la suggestion.*", C.brand300)]} />
        </At>
        <At x={150} y={540} w={1620}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {items.map(([label, value], i) => {
              const p = sp(f, 50 + i * 16, { damping: 16, stiffness: 170 });
              return (
                <div key={label} style={{ borderRadius: 26, padding: "30px 30px 34px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 60}px)` }}>
                  <ShieldCheck size={36} color={C.brand300} />
                  <div style={{ marginTop: 22, fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brand200 }}>{label}</div>
                  <div style={{ marginTop: 12, fontSize: 34, lineHeight: 1.22, fontWeight: 600, color: C.white }}>{value}</div>
                </div>
              );
            })}
          </div>
        </At>
        <Sfx at={6} name="impact" volume={0.35} />
        {items.map((_, i) => <Sfx key={i} at={50 + i * 16} name="pop" volume={0.45} />)}
        <Sfx at={196} name="whoosh" volume={0.5} />
      </DarkStage>
    </AbsoluteFill>
  );
}
