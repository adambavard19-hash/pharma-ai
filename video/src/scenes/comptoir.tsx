import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { C, EASE_IN_OUT, sp, tw, useF, usePerSecond } from "../theme";
import { LightStage, At } from "../ui/stage";
import { Kinetic, words, type Word } from "../ui/kinetic";
import { LgoWindow, Laser, MedBox, Ripple, ScannerAt, barcodeCenter } from "../ui/counter";
import { Cursor } from "../ui/product";
import { Sfx, Typing } from "../ui/sfx";
import { Banner, IllustrationNote, SALES, answerTree, bannerPoint, bannerStart, resolveBanner, useBanner, type BannerState, type BannerStep, type BannerView, type DemoSale } from "../ui/banner";

/* ==========================================================================
 * LE COMPTOIR, AVEC LA BANNIÈRE (octobre 2026).
 *
 * Le logiciel de gestion, générique ; on scanne les boîtes comme d'habitude ;
 * la bannière PharmaBoost, en haut à droite, passe de « En attente de scan… »
 * à « Scan détecté ! », puis « 2 conseils disponibles » ; elle s'ouvre sur les
 * conseils ; le pharmacien répond « Vendu » / « Non vendu » ; l'e-mail du
 * patient, avec son accord ; « Vente terminée ! ». Les temps suivent le
 * scénario de la démonstration du site (runScenario() de
 * agent/src/banner-preview.ts), resserrés au rythme de la musique.
 * ======================================================================== */

/** Un temps du scénario : l'état de la bannière change ; `click` nomme le bouton visé par le pointeur (et enfoncé). */
export type Act = { at: number; patch: BannerStep["patch"]; click?: string; sound?: false };
type Caption = { at: number; out?: number; lines: Word[][]; sub?: string; x?: number; y?: number; size?: number; w?: number };
type ScanBox = { at: number; name: string; form: string };

/** Une adresse d'exemple, tapée lettre à lettre dans la carte e-mail (aucun patient réel). */
const EMAIL = "patient@exemple.fr";
function typing(from: number, to: number, text = EMAIL): Act[] {
  const step = (to - from) / text.length;
  return Array.from(text, (_, i) => ({ at: Math.round(from + (i + 1) * step), patch: (s: BannerState) => ({ mail: { text: text.slice(0, i + 1), consent: s.mail?.consent ?? false } }) }));
}

/** Garde ensemble les derniers mots d'une légende : pas de mot seul sur la dernière ligne. */
export const nb = (text: string) => text.replace(/ /g, "\u00A0");

export const sold = (id: string) => (s: BannerState) => ({ answers: { ...s.answers, [id]: "SOLD" as const } });
export const notSold = (id: string) => (s: BannerState) => ({ answers: { ...s.answers, [id]: "NOT_SOLD" as const } });
const consent = (s: BannerState) => ({ mail: { text: s.mail?.text ?? "", consent: true } });

/** Où poser la bannière dans l'image 1080p : son coin haut-droit et son agrandissement. */
export type BannerPlace = { zoom: number; right: number; top: number };

/**
 * La bannière qui joue un scénario, et le pointeur qui va cliquer ses boutons
 * (avec le son du clic). `children` se dessine entre les deux (légendes,
 * mention d'illustration) : le pointeur reste au-dessus de tout.
 */
export function BannerPlay({ sale, start, acts, place, highlight, children }: { sale: DemoSale; start: BannerView; acts: Act[]; place: BannerPlace; highlight?: (f: number) => (key: string) => number; children?: ReactNode }) {
  const f = useF();
  const perSecond = usePerSecond();
  const initial = bannerStart(sale, start);
  const steps: BannerStep[] = acts.map((a) => ({ at: a.at, patch: a.patch, press: a.click }));
  const b = useBanner(initial, steps);

  // Le pointeur : il rejoint chaque bouton juste avant son clic (position prise dans l'état de la bannière à ce moment-là).
  const clicks = acts.filter((a) => a.click).map((a) => ({ at: a.at, key: a.click!, ...bannerPoint(resolveBanner(initial, steps, a.at - 1, perSecond), a.click!, place) }));
  let cursor = null;
  if (clicks.length) {
    const first = clicks[0];
    const last = clicks[clicks.length - 1];
    // Il arrive du bas de l'image, puis va de bouton en bouton : le trajet se termine deux images avant le clic.
    let pos = { x: first.x + 260, y: first.y + 220 };
    for (let i = 0; i < clicks.length; i++) {
      const c = clicks[i];
      const prev = i === 0 ? pos : clicks[i - 1];
      const dur = Math.min(18, Math.max(8, (i === 0 ? 24 : c.at - clicks[i - 1].at) * 0.6));
      const p = tw(f, [c.at - dur - 2, c.at - 2], [0, 1], EASE_IN_OUT);
      if (p <= 0) break;
      pos = { x: prev.x + (c.x - prev.x) * p, y: prev.y + (c.y - prev.y) * p };
    }
    const opacity = Math.min(tw(f, [first.at - 30, first.at - 20], [0, 1]), 1 - tw(f, [last.at + 16, last.at + 26], [0, 1]));
    const near = clicks.find((c) => f >= c.at && f <= c.at + 16);
    const press = Math.max(0, ...clicks.map((c) => tw(f, [c.at - 4, c.at], [0, 1]) - tw(f, [c.at + 1, c.at + 6], [0, 1])));
    if (opacity > 0) cursor = <Cursor x={pos.x - 2} y={pos.y - 2} opacity={opacity} press={press} click={near ? (f - near.at) / 16 : -1} />;
  }

  return (
    <>
      <Banner b={b} {...place} highlight={highlight?.(f)} />
      {children}
      {cursor}
      {acts.filter((a) => a.click && a.sound !== false).map((a) => <Sfx key={`c${a.at}`} at={a.at} name="clic" volume={0.85} />)}
    </>
  );
}

/** Le fond de chaque plan : le logiciel de gestion, le lecteur et ses boîtes, la bannière, les légendes, le pointeur. */
export function CounterStage({
  intro,
  len,
  sale,
  start,
  acts,
  captions,
  scans = [],
  rowsAt,
  veilAt,
  unveilAt,
  zoom = 1.8,
  highlight,
}: {
  intro: number;
  len: number;
  sale: DemoSale;
  start: BannerView;
  acts: Act[];
  captions: Caption[];
  scans?: ScanBox[];
  /** L'image où chaque ligne de la vente arrive dans le logiciel (avant la scène : déjà là). */
  rowsAt?: number[];
  /** À partir de quand le logiciel passe au second plan (la bannière ouverte prend la place), et quand il revient. */
  veilAt?: number;
  unveilAt?: number;
  zoom?: number;
  highlight?: (f: number) => (key: string) => number;
}) {
  const f = useF();
  const place = { zoom, right: 70, top: 60 };

  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [len - 12, len + 6], [0, 1], EASE_IN_OUT);
  const veil = veilAt === undefined ? 0 : tw(f, [veilAt, veilAt + 18], [0, 1], EASE_IN_OUT) * (unveilAt === undefined ? 1 : 1 - tw(f, [unveilAt, unveilAt + 18], [0, 1], EASE_IN_OUT));

  // Le lecteur et les boîtes, au premier plan en bas à droite.
  const box = { x: 1290, y: 700, w: 330 };
  const [bx, by] = barcodeCenter(box.x, box.y, box.w);
  const nose: [number, number] = [1690, 640];
  const scanner = scans.length ? Math.min(tw(f, [scans[0].at - 34, scans[0].at - 18], [0, 1]), 1 - tw(f, [scans[scans.length - 1].at + 22, scans[scans.length - 1].at + 36], [0, 1])) : 0;
  const lines = sale.lines.map((l, i) => ({ text: l.lgo, qty: l.qty, price: l.price, at: rowsAt?.[i] ?? -999 }));

  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 40}px) scale(${1 - 0.03 * exit})`, filter: exit > 0 ? `blur(${exit * 10}px)` : undefined }}>
      <LightStage>
        <At x={60} y={250}>
          <div style={{ filter: veil > 0 ? `blur(${veil * 3}px)` : undefined, opacity: 1 - 0.45 * veil }}>
            <LgoWindow w={1280} h={760} lines={lines} />
          </div>
        </At>
        <AbsoluteFill style={{ background: `rgba(249,251,251,${0.7 * veil})` }} />

        {scanner > 0 && (
          <AbsoluteFill style={{ opacity: scanner }}>
            {scans.map((s) => {
              const enterBox = sp(f, s.at - 30, { damping: 200, stiffness: 140 });
              const leave = tw(f, [s.at + 10, s.at + 22], [0, 1], EASE_IN_OUT);
              if (f < s.at - 32 || leave >= 1) return null;
              const lit = Math.min(tw(f, [s.at - 2, s.at + 1], [0, 1]), tw(f, [s.at + 4, s.at + 26], [1, 0]));
              return (
                <At key={s.name} x={box.x + (1 - enterBox) * 260 - leave * 260} y={box.y} style={{ opacity: enterBox * (1 - leave) }}>
                  <MedBox name={s.name} form={s.form} w={box.w} lit={lit} tilt={-12} />
                </At>
              );
            })}
            {scans.map((s) => {
              const on = Math.min(tw(f, [s.at - 12, s.at - 6], [0, 1]), tw(f, [s.at + 2, s.at + 7], [1, 0]));
              return <Laser key={s.name} from={nose} to={[bx, by + Math.sin(f / 3) * 14 * on]} spread={160} on={on} />;
            })}
            <ScannerAt nx={nose[0]} ny={nose[1]} w={230} deg={38} led={Math.max(0, ...scans.map((s) => tw(f, [s.at - 1, s.at + 1], [0, 1]) * tw(f, [s.at + 4, s.at + 24], [1, 0])))} />
            {scans.map((s) => <Ripple key={s.name} x={bx} y={by} at={s.at} max={340} />)}
          </AbsoluteFill>
        )}

        <BannerPlay sale={sale} start={start} acts={acts} place={place} highlight={highlight}>
          {captions.map((c, i) => {
            const subP = c.sub ? Math.min(tw(f, [c.at + 14, c.at + 26], [0, 1]), c.out === undefined ? 1 : 1 - tw(f, [c.out, c.out + 10], [0, 1])) : 0;
            return (
              <At key={i} x={c.x ?? 60} y={c.y ?? 56} w={c.w ?? 1000}>
                <Kinetic at={c.at} out={c.out} size={c.size ?? 66} lines={c.lines} stagger={2} />
                {c.sub && <div style={{ marginTop: 22, fontSize: 30, lineHeight: 1.4, color: C.ink600, maxWidth: (c.w ?? 1000) - 80, opacity: subP, transform: `translateY(${(1 - subP) * 10}px)` }}>{c.sub}</div>}
              </At>
            );
          })}

          <At x={60} y={1030} w={1100}>
            <IllustrationNote />
          </At>
        </BannerPlay>

        {scans.map((s) => <Sfx key={s.name} at={s.at} name="bip" volume={0.7} />)}
      </LightStage>
    </AbsoluteFill>
  );
}

/** Les pastilles du premier conseil (Challenge, Date courte, En stock) entourées un instant, pour « choisi dans votre stock ». */
const pillsOfA = (from: number, to: number) => (f: number) => (key: string) => (key.startsWith("pill:a:") ? Math.min(tw(f, [from, from + 10], [0, 1]), 1 - tw(f, [to, to + 10], [0, 1])) : 0);

/* --------------------------------------------------------------------------
 * PRÉSENTATION — le comptoir d'un seul tenant (9 mesures à 120 BPM, 648 images).
 * ------------------------------------------------------------------------ */

export const COMPTOIR_FRAMES = 648;
/** Les deux scans, en images de la scène (pour la musique qui s'efface sous le son du scan). */
export const COMPTOIR_SCANS = [36, 72];

export function Comptoir({ intro }: { intro: number }) {
  const acts: Act[] = [
    { at: 38, patch: { view: "scan" } },
    { at: 150, patch: { view: "ready" } },
    // « 2 conseils disponibles » reste seul readyPauseMs (1,1 s), puis la bannière s'ouvre d'elle-même.
    { at: 190, patch: { view: "expanded" } },
    { at: 270, patch: sold("a"), click: "sold:a" },
    { at: 326, patch: notSold("b"), click: "not:b" },
    { at: 380, patch: { mail: { text: "", consent: false } }, click: "mail" },
    ...typing(396, 432),
    { at: 448, patch: consent, click: "consent" },
    // Plus de troisième conseil : le temps qu'il prenait laisse lire la phrase sur l'adresse effacée.
    { at: 476, patch: { mail: null, emailSaved: true }, click: "mailSave" },
    { at: 548, patch: { finishing: true }, click: "finish" },
    { at: 572, patch: { view: "done", finishing: false } },
  ];
  return (
    <>
      <CounterStage
        intro={intro}
        len={COMPTOIR_FRAMES}
        sale={SALES.ordonnance}
        start="idle"
        acts={acts}
        scans={[
          { at: COMPTOIR_SCANS[0], name: "AMOXICILLINE 1 g", form: "comprimé" },
          { at: COMPTOIR_SCANS[1], name: "VALACICLOVIR 500 mg", form: "comprimé" },
        ]}
        rowsAt={COMPTOIR_SCANS}
        veilAt={176}
        unveilAt={574}
        highlight={pillsOfA(214, 262)}
        captions={[
          { at: 2, out: 118, lines: [words("Vous scannez."), words("*Comme d'habitude.*", C.brand600)] },
          { at: 126, out: 178, lines: [words("Une bannière, à côté"), words("*de votre logiciel.*", C.brand600)] },
          { at: 200, out: 262, y: 330, w: 820, size: 64, lines: [words("Choisi"), words("*dans votre stock.*", C.brand600)], sub: "Uniquement ce que vous avez en rayon, avec le prix et le stock." },
          { at: 268, out: 372, y: 330, w: 820, size: 60, lines: [words("Le pharmacien"), words("et le préparateur"), words("*gardent la décision.*", C.brand600)], sub: "Vendu ou non vendu : un clic, au comptoir." },
          { at: 384, out: 540, y: 150, w: 820, size: 60, lines: [words("Son bilan par e-mail,"), words("*avec son accord.*", C.brand600)], sub: "L'adresse e-mail du bilan est effacée après l'envoi." },
          { at: 580, lines: [words("Une vente suivie"), words("*jusqu'au bout.*", C.brand600)] },
        ]}
      />
      <Sfx at={150} name="pop" volume={0.55} />
      <Sfx at={190} name="swish" volume={0.4} />
      <Typing at={396} text={EMAIL} cps={(EMAIL.length * 30) / 36} volume={0.35} />
      <Sfx at={572} name="pop" volume={0.6} />
      <Sfx at={574} name="notif" volume={0.45} />
    </>
  );
}

/* --------------------------------------------------------------------------
 * COMMENT ÇA MARCHE — les mêmes gestes, en plans courts (136 BPM).
 * ------------------------------------------------------------------------ */

/** 01 · Le scan : la bannière attend, puis « Scan détecté ! » / « Analyse en cours… ». 180 images. */
export const SCAN_SCANS = [34, 70];
export function ScanPlan({ intro }: { intro: number }) {
  return (
    <CounterStage
      intro={intro}
      len={180}
      sale={SALES.ordonnance}
      start="idle"
      acts={[{ at: 36, patch: { view: "scan" } }]}
      scans={[
        { at: SCAN_SCANS[0], name: "AMOXICILLINE 1 g", form: "comprimé" },
        { at: SCAN_SCANS[1], name: "VALACICLOVIR 500 mg", form: "comprimé" },
      ]}
      rowsAt={SCAN_SCANS}
      captions={[
        { at: 4, out: 92, lines: [words("Vous scannez."), words("*Comme d'habitude.*", C.brand600)] },
        { at: 100, lines: [words("La bannière réagit"), words("*dès le premier scan.*", C.brand600)] },
      ]}
    />
  );
}

/** 02 · « 2 conseils disponibles » → la liste → Vendu / Non vendu. 288 images. */
export function ConseilsPlan({ intro }: { intro: number }) {
  return (
    <>
      <CounterStage
        intro={intro}
        len={288}
        sale={SALES.ordonnance}
        start="scan"
        acts={[
          { at: 8, patch: { view: "ready" } },
          { at: 52, patch: { view: "expanded" } },
          { at: 160, patch: sold("a"), click: "sold:a" },
          { at: 198, patch: notSold("b"), click: "not:b" },
        ]}
        veilAt={40}
        highlight={pillsOfA(76, 146)}
        captions={[
          { at: 10, out: 52, lines: [words("Les conseils arrivent"), words("*sur la bannière.*", C.brand600)] },
          { at: 62, out: 150, y: 330, w: 820, size: 64, lines: [words("Choisis"), words("*dans votre stock.*", C.brand600)], sub: `Challenge, date courte, stock : tout se lit ${nb("d'un coup d'œil.")}` },
          { at: 160, y: 330, w: 820, size: 64, lines: [words("Vendu ou non vendu :"), words("*un clic.*", C.brand600)], sub: `Le pharmacien et le préparateur ${nb("gardent la décision.")}` },
        ]}
      />
      <Sfx at={8} name="pop" volume={0.55} />
      <Sfx at={52} name="swish" volume={0.4} />
    </>
  );
}

/** 02 bis · Le paracétamol seul : la bannière pose la question (pourquoi, puis où) avant de proposer. 216 images. */
export function QuestionPlan({ intro }: { intro: number }) {
  return (
    <>
      <CounterStage
        intro={intro}
        len={216}
        sale={SALES.douleur}
        start="scan"
        zoom={1.6}
        rowsAt={[-10]}
        acts={[
          { at: 20, patch: { view: "ready" } },
          { at: 62, patch: { view: "expanded" } },
          { at: 108, patch: answerTree("why", "PAIN"), click: "qa:why:PAIN" },
          { at: 148, patch: answerTree("where", "BACK"), click: "qa:where:BACK" },
        ]}
        veilAt={50}
        captions={[
          { at: 22, out: 64, lines: [words("Parfois, d'abord"), words("*une question.*", C.brand600)] },
          { at: 70, y: 330, w: 900, size: 64, lines: [words("Pourquoi ? Où ?"), words("*Puis le bon produit.*", C.brand600)], sub: "La poche chaud/froid de la bonne zone n'apparaît qu'après la réponse." },
        ]}
      />
      <Sfx at={20} name="pop" volume={0.5} />
      <Sfx at={62} name="swish" volume={0.4} />
      <Sfx at={150} name="pop" volume={0.45} />
    </>
  );
}

/** 02 ter · Un rhume au paracétamol : la mise en garde « 3 g par jour » passe avant le conseil. 144 images. */
export function AlertePlan({ intro }: { intro: number }) {
  return (
    <>
      <CounterStage
        intro={intro}
        len={144}
        sale={SALES.rhume}
        start="ready"
        acts={[{ at: 14, patch: { view: "expanded" } }]}
        veilAt={-30}
        highlight={(f) => (key) => (key.startsWith("alert:") ? Math.min(tw(f, [30, 42], [0, 1]), 1 - tw(f, [118, 130], [0, 1])) : 0)}
        captions={[{ at: 18, y: 330, w: 820, size: 64, lines: [words("Les mises en garde"), words("*passent avant.*", C.brand600)], sub: `Ici : 3 g de paracétamol par jour au maximum, ${nb("tous produits confondus.")}` }]}
      />
      <Sfx at={14} name="swish" volume={0.4} />
      <Sfx at={32} name="tic" volume={0.4} />
    </>
  );
}

/** 03 · L'e-mail du patient, avec son accord, puis « Vente terminée ! ». 180 images. */
export function MailPlan({ intro }: { intro: number }) {
  const answered = { answers: { a: "SOLD", b: "NOT_SOLD" } as BannerState["answers"] };
  return (
    <>
      <CounterStage
        intro={intro}
        len={180}
        sale={SALES.ordonnance}
        start="expanded"
        acts={[
          // Déjà répondu avant le plan (y compris pendant le fondu d'entrée) : la bannière ne change pas d'état sous les yeux.
          { at: -60, patch: answered },
          { at: 14, patch: { mail: { text: "", consent: false } }, click: "mail" },
          ...typing(26, 58),
          { at: 72, patch: consent, click: "consent" },
          { at: 92, patch: { mail: null, emailSaved: true }, click: "mailSave" },
          { at: 114, patch: { finishing: true }, click: "finish" },
          { at: 134, patch: { view: "done", finishing: false } },
        ]}
        veilAt={-30}
        captions={[{ at: 6, y: 150, w: 820, size: 60, lines: [words("Son bilan par e-mail,"), words("*avec son accord.*", C.brand600)], sub: `Seulement les produits vendus. L'adresse e-mail ${nb("du bilan")} est effacée après l'envoi.` }]}
      />
      <Typing at={26} text={EMAIL} cps={(EMAIL.length * 30) / 32} volume={0.35} />
      <Sfx at={134} name="pop" volume={0.6} />
      <Sfx at={136} name="notif" volume={0.45} />
    </>
  );
}
