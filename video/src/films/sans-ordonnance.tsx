import { AbsoluteFill } from "remotion";
import { AlertTriangle, MessageCircleQuestion } from "lucide-react";
import { BUTTON_GRADIENT, C, EASE_IN_OUT, SHADOW, beats, sp, tw, useF } from "../theme";
import type { FilmSpec } from "../FilmShell";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { Cursor, ProductTile } from "../ui/product";
import { EndCard, Panel } from "../ui/common";
import { Sfx, Typing } from "../ui/sfx";

/* ==========================================================================
 * « Sans ordonnance » — 25 s, 124 BPM. La carte « Demande sans ordonnance »
 * de Nouvelle vente (vente/nouvelle/counter-request.tsx) : le client décrit,
 * PharmaBoost reconnaît le besoin (liste fermée, src/core/understanding/needs.ts),
 * dit quoi vérifier, propose des produits en rayon ; et le signal d'alerte qui
 * oriente vers le médecin (src/core/counter/request.ts). Rayons 12 à 16 px,
 * bouton en dégradé, comme l'application. Produits et prix : catalogue de démo.
 * ======================================================================== */

const B = beats(124);
const BAR = B(4);

const ASK = "Nez bouché et mal à la gorge depuis hier, adulte.";
const ALERT = "Toux et gêne pour respirer depuis ce matin.";
const CPS = 30;

function typed(f: number, at: number, text: string, cps = CPS) {
  const n = Math.max(0, Math.min(text.length, Math.floor(((f - at) * cps) / 30)));
  return text.slice(0, n);
}

function Title({ intro }: { intro: number }) {
  const f = useF();
  const exit = tw(f, [2 * BAR - 10, 2 * BAR + 6], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: (intro ? tw(f, [-intro, 0], [0, 1]) : 1) * (1 - exit), transform: `scale(${1 + 0.25 * exit})` }}>
      <DarkStage>
        <At x={0} y={380} w={1920}>
          <Kinetic at={3} out={B(4.5)} size={140} color={C.white} align="center" stagger={3} lines={[words("Pas *d'ordonnance* ?", C.accent300)]} />
        </At>
        <At x={0} y={380} w={1920}>
          <Kinetic at={B(5)} size={140} color={C.white} align="center" stagger={3} lines={[words("Le client *décrit.*", C.brand300)]} />
        </At>
        <Sfx at={3} name="impact" volume={0.35} />
        <Sfx at={3} name="tic" volume={0.5} />
        <Sfx at={6} name="tic" volume={0.5} />
        <Sfx at={B(4.5)} name="swish" volume={0.45} />
        <Sfx at={B(5)} name="tic" volume={0.5} />
        <Sfx at={B(5) + 3} name="tic" volume={0.5} />
        <Sfx at={2 * BAR - 10} name="whoosh" volume={0.5} />
      </DarkStage>
    </AbsoluteFill>
  );
}

/** Un champ de saisie de l'application : rayon 12, bord ink-300, anneau teal quand il a le focus. */
const field = (focus = 0) => ({ borderRadius: 12, border: `1.5px solid ${focus > 0.5 ? C.brand500 : C.ink300}`, boxShadow: focus > 0.5 ? "0 0 0 4px rgba(40,161,145,.16)" : "none", background: C.white, boxSizing: "border-box" as const });

/**
 * La carte « Demande sans ordonnance » de Nouvelle vente (counter-request.tsx) :
 * ce que le client décrit, l'âge, enceinte / allaite, « Conseiller », puis le
 * champ facultatif des traitements en cours.
 */
function RequestCard({ text, caret, age, focus, press }: { text: string; caret: boolean; age: string; focus: number; press: number }) {
  return (
    <Panel style={{ width: 1240, padding: "30px 36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, height: 48 }}>
        <MessageCircleQuestion size={34} color={C.brand600} />
        <span style={{ fontSize: 31, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink900 }}>Demande sans ordonnance</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 19, lineHeight: 1.45, color: C.ink600, maxWidth: 1100 }}>
        Le client décrit ce qu&apos;il ressent. PharmaBoost reconnaît le besoin, pose les questions à vérifier, et propose parmi ce que l&apos;officine a en rayon — après le moteur de sécurité, comme pour une ordonnance.
      </div>
      <div style={{ marginTop: 20, minHeight: 112, ...field(focus), padding: "18px 22px", fontSize: 30, color: text ? C.ink900 : C.ink400 }}>
        {text || "Ex. : nez bouché et mal à la tête depuis hier, adulte."}
        {caret && <span style={{ color: C.brand600 }}>▍</span>}
      </div>
      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ fontSize: 20, color: C.ink600 }}>Âge</span>
        <span style={{ width: 96, height: 56, ...field(), display: "flex", alignItems: "center", padding: "0 16px", fontSize: 24, color: C.ink900 }}>{age}</span>
        {["Enceinte", "Allaite"].map((l) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 21, color: C.ink700 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${C.ink300}`, background: C.white }} /> {l}
          </span>
        ))}
        <span style={{ marginLeft: "auto", height: 62, display: "flex", alignItems: "center", padding: "0 36px", borderRadius: 12, background: BUTTON_GRADIENT, color: C.white, fontSize: 24, fontWeight: 600, boxShadow: "0 1px 2px rgba(23,33,38,.12)", transform: `scale(${1 - 0.05 * press})`, filter: press > 0 ? `brightness(${1 - 0.1 * press})` : undefined }}>Conseiller</span>
      </div>
      <div style={{ marginTop: 18, height: 58, ...field(), display: "flex", alignItems: "center", padding: "0 20px", fontSize: 21, color: C.ink400 }}>Traitements en cours, séparés par des virgules (facultatif)</div>
    </Panel>
  );
}

function Ask({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [3 * BAR - 8, 3 * BAR + 7], [0, 1], EASE_IN_OUT);
  const T0 = 18;
  const text = typed(f, T0, ASK);
  const typedEnd = T0 + (ASK.length * 30) / CPS;
  const AGE = typedEnd + 6;
  const CLICK = AGE + 30;
  const press = tw(f, [CLICK - 4, CLICK], [0, 1]) - tw(f, [CLICK + 2, CLICK + 8], [0, 1]);
  const p = tw(f, [AGE + 8, CLICK - 4], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateY(${(1 - enter) * 80 - exit * 80}px) scale(${1 - 0.04 * exit})`, filter: `blur(${exit * 10}px)` }}>
      <LightStage>
        <At x={340} y={156} w={1300}>
          <Kinetic at={2} size={58} lines={[words("Vous tapez *ce que dit le client.*", C.brand600)]} stagger={2} />
        </At>
        <At x={340} y={310}>
          <RequestCard text={text} caret={f >= T0 - 6 && f < AGE && Math.floor(f / 8) % 2 === 0} age={f >= AGE ? "34" : ""} focus={tw(f, [T0 - 8, T0 - 2], [0, 1])} press={press} />
        </At>
        <Cursor x={1760 + (1440 - 1760) * p} y={1040 + (632 - 1040) * p} press={press} click={f >= CLICK && f < CLICK + 16 ? (f - CLICK) / 16 : -1} opacity={tw(f, [AGE + 4, AGE + 10], [0, 1])} />
        <Typing at={T0} text={ASK} cps={CPS} volume={0.55} />
        <Typing at={AGE} text="34" cps={CPS} volume={0.55} />
        <Sfx at={CLICK} name="clic" volume={0.9} />
        <Sfx at={CLICK + 4} name="montee" volume={0.3} />
      </LightStage>
    </AbsoluteFill>
  );
}

function Results({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [3 * BAR - 8, 3 * BAR + 7], [0, 1], EASE_IN_OUT);
  const needs = ["Nez bouché ou qui coule", "Gorge irritée"];
  const questions = ["S'il s'agit d'une femme : grossesse ou allaitement en cours ?", "Depuis combien de temps, et y a-t-il de la fièvre ?"];
  const products = [
    { tile: "spray-nasal-marin", name: "Spray nasal eau de mer isotonique", price: "6,90 €", stock: 36 },
    { tile: "pastilles-gorge", name: "Pastilles gorge miel-citron", price: "5,90 €", stock: 58 },
  ];
  const NEED = [12, 20], Q = [34, 44], P = [62, 74];
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateY(${(1 - enter) * 80 - exit * 80}px)`, filter: `blur(${exit * 10}px)` }}>
      <LightStage>
        <At x={120} y={166} w={1700}>
          <Kinetic at={2} size={58} lines={[words("Besoin reconnu. *Questions à poser.* Produits en rayon.", C.brand600)]} stagger={2} />
        </At>
        <At x={120} y={300} w={820}>
          <Panel style={{ padding: "28px 30px" }}>
            <div style={{ borderRadius: 12, background: C.ink100, padding: "16px 20px", fontSize: 24, color: C.ink800 }}>« {ASK} » · 34 ans</div>
            {/* Les besoins reconnus : des pastilles seules, sans intitulé, comme dans l'application. */}
            <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {needs.map((n, i) => {
                const p = sp(f, NEED[i], { damping: 14, stiffness: 200 });
                return <span key={n} style={{ fontSize: 22, fontWeight: 500, color: C.brand700, background: C.brand50, boxShadow: `inset 0 0 0 1px ${C.brand200}`, borderRadius: 999, padding: "8px 18px", opacity: p, transform: `scale(${0.6 + 0.4 * p})` }}>{n}</span>;
              })}
            </div>
            <div style={{ marginTop: 26, fontSize: 17, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink500 }}>À vérifier avant de proposer</div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
              {questions.map((q, i) => {
                const p = sp(f, Q[i], { damping: 22, stiffness: 180 });
                return <div key={q} style={{ display: "flex", gap: 12, fontSize: 22, lineHeight: 1.35, color: C.ink800, opacity: p, transform: `translateX(${(1 - p) * 24}px)` }}><span style={{ color: C.warning600, fontWeight: 600 }}>?</span>{q}</div>;
              })}
            </div>
          </Panel>
        </At>
        <At x={1000} y={300} w={800}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {products.map((pr, i) => {
              const p = sp(f, P[i], { damping: 20, stiffness: 170 });
              return (
                <Panel key={pr.name} style={{ padding: "22px 26px", display: "flex", alignItems: "center", gap: 20, boxShadow: SHADOW.card, opacity: p, transform: `translateX(${(1 - p) * 80}px)` }}>
                  <ProductTile name={pr.tile} size={104} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 27, fontWeight: 600, color: C.ink900, lineHeight: 1.2 }}>{pr.name}</div>
                    <div style={{ marginTop: 8, display: "inline-block", fontSize: 18, fontWeight: 500, color: C.success700, background: C.success50, borderRadius: 999, padding: "5px 14px" }}>{pr.stock} en stock</div>
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 600, color: C.ink900, fontVariantNumeric: "tabular-nums" }}>{pr.price}</div>
                </Panel>
              );
            })}
            <div style={{ alignSelf: "flex-end", fontSize: 16, color: C.ink400, opacity: tw(f, [P[1], P[1] + 10], [0, 1]) }}>exemple · produits et prix de démonstration</div>
          </div>
        </At>
        {NEED.map((a) => <Sfx key={`n${a}`} at={a} name="pop" volume={0.55} />)}
        {Q.map((a) => <Sfx key={`q${a}`} at={a} name="tic" volume={0.5} />)}
        {P.map((a) => <Sfx key={`p${a}`} at={a} name="swish" volume={0.45} />)}
        {P.map((a) => <Sfx key={`pp${a}`} at={a + 6} name="pop" volume={0.45} />)}
      </LightStage>
    </AbsoluteFill>
  );
}

function RedFlag({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const T0 = 6;
  const text = typed(f, T0, ALERT, 42);
  const HIT = T0 + (ALERT.length * 30) / 42 + 8;
  const alert = sp(f, HIT, { damping: 12, stiffness: 220 });
  const shake = f >= HIT && f < HIT + 12 ? Math.sin((f - HIT) * 2.2) * (1 - (f - HIT) / 12) * 10 : 0;
  return (
    <AbsoluteFill style={{ opacity: enter, transform: `translateX(${shake}px)` }}>
      <LightStage>
        <At x={340} y={196} w={1300}>
          <Kinetic at={HIT + 4} size={64} lines={[words("Quand il le faut, *le médecin d'abord.*", C.danger700)]} stagger={2} />
        </At>
        <At x={340} y={350}>
          <Panel style={{ width: 1240, padding: "30px 36px" }}>
            <div style={{ minHeight: 100, ...field(1), padding: "18px 22px", fontSize: 30, color: C.ink900 }}>
              {text}
              {f < HIT && <span style={{ color: C.brand600 }}>▍</span>}
            </div>
            <div style={{ marginTop: 22, display: "flex", gap: 18, alignItems: "flex-start", borderRadius: 12, border: `1.5px solid ${C.danger100}`, background: C.danger50, padding: "22px 26px", opacity: alert, transform: `scale(${0.92 + 0.08 * alert})`, transformOrigin: "top center" }}>
              <AlertTriangle size={40} color={C.danger600} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 32, fontWeight: 600, color: C.danger700 }}>Orienter vers le médecin</div>
                <div style={{ marginTop: 4, fontSize: 24, color: C.ink800 }}>Gêne respiratoire signalée.</div>
              </div>
            </div>
          </Panel>
        </At>
        <Typing at={T0} text={ALERT} cps={42} volume={0.55} />
        <Sfx at={HIT} name="impact" volume={0.45} />
        <Sfx at={HIT} name="clic" volume={0.6} />
      </LightStage>
    </AbsoluteFill>
  );
}

function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Le pharmacien et le préparateur"), words("*gardent la décision.*", C.brand300)]} />;
}

export const SANS_ORDONNANCE: FilmSpec = {
  tag: "Sans ordonnance",
  scenes: [
    { C: Title, at: 0 },
    { C: Ask, at: 2 * BAR },
    { C: Results, at: 5 * BAR },
    { C: RedFlag, at: 8 * BAR },
    { C: End, at: 10 * BAR },
  ],
  end: 13 * BAR,
  overlap: B(0.5),
  speed: 1,
  music: "music/sans-ordonnance.wav",
};
