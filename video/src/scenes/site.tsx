import { AbsoluteFill } from "remotion";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { C, EASE_IN_OUT, MONO, SHADOW, sp, tw, useF } from "../theme";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { TitleBlock } from "../ui/common";
import { CalendarBanner, Phone, PlanScreen, type PatientPlan } from "../ui/panels";
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

/**
 * Une étape numérotée, plein cadre : « 01 · Vous scannez les boîtes ».
 * `len` images (108 par défaut) ; `kicker` ajoute un surtitre au-dessus du
 * numéro (le nom de la série, sur la première étape).
 */
export function stepCard(n: string, text: string, len = 108, kicker?: string) {
  function Step({ intro }: { intro: number }) {
    const f = useF();
    const enter = intro ? tw(f, [-intro, 0], [0, 1]) : 1;
    const exit = tw(f, [len - 18, len - 2], [0, 1], EASE_IN_OUT);
    const num = sp(f, 2, { damping: 14, stiffness: 170 });
    const kick = sp(f, 0, { damping: 20, stiffness: 160 });
    return (
      <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${1 + 0.04 * tw(f, [0, len - 18], [0, 1]) + 0.15 * exit})` }}>
        <DarkStage>
          {kicker && (
            <At x={0} y={226} w={1920} style={{ display: "flex", justifyContent: "center", opacity: kick, transform: `translateY(${(1 - kick) * -16}px)` }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontFamily: MONO, fontSize: 24, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: BANNER.colors.muted }}>
                <span style={{ width: 34, height: 2, borderRadius: 1, background: BANNER.colors.glow }} />
                {kicker}
                <span style={{ width: 34, height: 2, borderRadius: 1, background: BANNER.colors.glow }} />
              </span>
            </At>
          )}
          <At x={0} y={300} w={1920} style={{ textAlign: "center", fontFamily: MONO, fontSize: 132, fontWeight: 500, color: BANNER.colors.glow, opacity: Math.min(1, num * 1.4), transform: `translateY(${(1 - num) * 50}px)` }}>
            {n}
          </At>
          <At x={0} y={500} w={1920}>
            <Kinetic at={10} size={92} color={C.white} align="center" stagger={2} lines={[words(text)]} />
          </At>
          <Sfx at={2} name="impact" volume={0.35} />
          <Sfx at={10} name="pop" volume={0.4} />
          <Sfx at={len - 18} name="whoosh" volume={0.5} />
        </DarkStage>
      </AbsoluteFill>
    );
  }
  Object.defineProperty(Step, "name", { value: `Etape${n}` });
  return Step;
}

/**
 * « Le conseil qui va avec le traitement » : trois exemples du tableau du site
 * (src/app/(public)/decouvrir/page.tsx, EXAMPLES), mêmes colonnes, mêmes mots —
 * un conseil qui accompagne, une routine avec ce qu'il faut éviter, une mise en
 * garde. `len` images (180 par défaut) ; les entrées se resserrent avec la durée.
 */
export function Examples({ intro, len = 180 }: { intro: number; len?: number }) {
  const f = useF();
  const k = len / 180;
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [len - 20, len - 2], [0, 1], EASE_IN_OUT);
  // Les colonnes du tableau du site ; celle du conseil assez large pour « Routine : nettoyer, hydrater, protéger » sur une ligne.
  const COLS = "330px 650px 1fr";
  const rows: { scan: string; shows: string; note?: string; warning?: boolean; why: string; at: number }[] = [
    { scan: "DOXYCYCLINE", shows: "Protection solaire SPF 50+", why: "Ce traitement rend la peau plus sensible au soleil.", at: 30 * k },
    { scan: "ISOTRÉTINOÏNE", shows: "Routine : nettoyer, hydrater, protéger", note: "À éviter : gommages et peelings", why: "Ce traitement assèche et fragilise la peau.", at: 54 * k },
    { scan: "ANTIPARASITAIRE CHIEN", shows: "Danger pour le chat", warning: true, why: "Selon l'ANSES, la perméthrine des antiparasitaires pour chien est toxique pour le chat.", at: 78 * k },
  ];
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 100 - exit * 100}px)` }}>
      <LightStage>
        <At x={160} y={96} w={1600}>
          <TitleBlock chip="Exemples" chipAt={2} at={6} size={80} lines={[words("Le conseil qui va"), words("*avec le traitement.*", C.brand600)]} />
        </At>
        <At x={160} y={440} w={1600}>
          <div style={{ background: C.white, border: `1px solid ${C.ink200}`, borderRadius: 24, boxShadow: SHADOW.card, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, columnGap: 32, padding: "18px 32px", borderBottom: `1px solid ${C.ink200}`, fontFamily: MONO, fontSize: 17, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ink400, opacity: tw(f, [16 * k, 28 * k], [0, 1]) }}>
              <span>Au scan</span><span>PharmaBoost vous montre</span><span>Pourquoi</span>
            </div>
            {rows.map((r, i) => {
              const p = sp(f, r.at, { damping: 18, stiffness: 170 });
              return (
                <div key={r.scan} style={{ display: "grid", gridTemplateColumns: COLS, columnGap: 32, alignItems: "baseline", padding: "26px 32px", borderTop: i ? `1px solid ${C.ink100}` : undefined, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 90}px)` }}>
                  <span style={{ fontFamily: MONO, fontSize: 25, letterSpacing: "0.02em", color: C.ink600 }}>{r.scan}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontSize: 33, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, color: r.warning ? C.warning700 : C.ink900 }}>
                      {r.warning ? <TriangleAlert size={30} color={C.warning600} style={{ flexShrink: 0, transform: "translateY(4px)" }} /> : <span style={{ color: C.brand600 }}>+</span>}
                      <span>{r.shows}</span>
                    </div>
                    {r.note && <div style={{ marginTop: 6, paddingLeft: 34, fontSize: 23, color: C.ink500 }}>{r.note}</div>}
                  </div>
                  <span style={{ fontSize: 25, lineHeight: 1.35, color: C.ink500 }}>{r.why}</span>
                </div>
              );
            })}
          </div>
        </At>
        {rows.map((r) => <Sfx key={r.at} at={r.at} name="pop" volume={0.5} />)}
        {rows.map((r) => <Sfx key={`t${r.at}`} at={r.at + 6} name="tic" volume={0.35} />)}
        <Sfx at={len - 20} name="whoosh" volume={0.5} />
      </LightStage>
    </AbsoluteFill>
  );
}

/**
 * « Ou, depuis l'écran de vente : son plan conseil complet » : le téléphone du
 * patient et le premier rappel. C'est le plan de l'écran de vente (posologie,
 * indication, rappels), qui vient APRÈS le bilan e-mail de la bannière et ne se
 * confond pas avec lui : la bannière n'envoie que les produits vendus, jamais
 * une posologie. `plan` nomme les médicaments de la vente que le film vient de
 * montrer. `len` images (216).
 */
export function Bilan({ intro, len = 216, plan }: { intro: number; len?: number; plan: PatientPlan }) {
  const f = useF();
  const k = len / 216;
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [len - 20, len - 2], [0, 1], EASE_IN_OUT);
  const phone = sp(f, 8, { damping: 22, stiffness: 120 });
  const n1 = sp(f, 100 * k, { damping: 18, stiffness: 170 });
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 100 - exit * 100}px)` }}>
      <LightStage>
        <At x={140} y={290} w={880}>
          <TitleBlock chip="Ou, depuis l'écran de vente :" chipAt={2} at={8} size={80} lines={[words("Son plan"), words("*conseil complet.*", C.brand600)]} sub="Posologie, indication, rappels : sur son téléphone, par e-mail ou imprimé." subAt={44 * k} />
        </At>
        <At x={1210} y={120 + (1 - phone) * 900}>
          <Phone h={840}>
            <PlanScreen plan={plan} show={(i) => sp(f, (26 + i * 9) * k, { damping: 200, stiffness: 140 })} />
          </Phone>
        </At>
        <At x={1090} y={170} w={600} style={{ opacity: n1, transform: `translateY(${(1 - n1) * -40}px) scale(${0.96 + 0.04 * n1})` }}>
          <CalendarBanner {...plan.reminder} />
        </At>
        <Sfx at={8} name="swish" volume={0.45} />
        {[0, 1, 2, 3].map((i) => <Sfx key={i} at={(30 + i * 9) * k} name="tic" volume={0.3} />)}
        <Sfx at={100 * k} name="notif" volume={0.6} />
      </LightStage>
    </AbsoluteFill>
  );
}

/**
 * « La sécurité avant la suggestion » : quatre des six cases du site
 * (src/app/(public)/decouvrir/page.tsx, SAFETY), mêmes étiquettes, mêmes
 * phrases — six se liraient mal en six secondes. 216 images.
 */
export function Security({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 0], [0, 1]);
  const exit = tw(f, [196, 214], [0, 1], EASE_IN_OUT);
  const items = [
    // Les deux derniers mots restent ensemble : pas de mot seul sur la dernière ligne d'une case.
    ["Mises en garde", "Ce qu'il ne faut pas ajouter au traitement est\u00A0signalé"],
    ["Posologie", "Les doses qui s'additionnent sont rappelées (3 g de paracétamol par jour au maximum)"],
    ["Décision", "Le pharmacien garde la validation finale"],
    // Le bilan e-mail du comptoir passe par l'adresse du patient, avec son accord : elle est effacée après l'envoi.
    ["Données", "Aucune fiche patient. L'e-mail du bilan est effacé après l'envoi."],
  ];
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${1 + 0.12 * exit})` }}>
      <DarkStage>
        <At x={0} y={160} w={1920}>
          <Kinetic at={6} size={96} color={C.white} align="center" stagger={2} lines={[words("La sécurité"), words("*avant la suggestion.*", C.brand300)]} />
        </At>
        <At x={230} y={480} w={1460}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {items.map(([label, value], i) => {
              const p = sp(f, 50 + i * 16, { damping: 16, stiffness: 170 });
              return (
                <div key={label} style={{ borderRadius: 16, padding: "28px 34px 32px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 60}px)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <ShieldCheck size={32} color={C.brand300} />
                    <span style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brand200 }}>{label}</span>
                  </div>
                  <div style={{ marginTop: 16, fontSize: 31, lineHeight: 1.25, fontWeight: 700, letterSpacing: "-0.015em", color: C.white }}>{value}</div>
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
