import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { IN_OUT, SNAP, prog, tween, wobble } from "../../presentation/motion/kit/ease";
import { JAKARTA, PB } from "./brand";
import {
  AdnBackdrop,
  AppCures,
  AppHome,
  AppOffer,
  AppScan,
  AppWelcome,
  BannerCard,
  BannerHead,
  CalendarCure,
  Chip,
  ChapterTitle,
  Cursor,
  LiveDot,
  MailBilan,
  Notification,
  OfferCard,
  PBLogo,
  Phone,
  SoldCounterCard,
  SoonBadge,
  TeamRank,
  bannerRowCenter,
  cureTicks,
  BANNER_CARD,
  type BannerLine,
  type BannerTab,
  type ChipSpec,
} from "./screens";

/* ==========================================================================
 * DÉMONSTRATION DES ÉCRANS (kit/screens.tsx) — node src/rembobine/tools/planche.mjs --demo screens 0 1 2 3 4 5 6 7
 *
 *   0 → 8 s    les neuf tableaux en même temps (grille 3 × 3, chacun est un cadre 1920 × 1080 réduit au tiers)
 *   10 + 7·k + u   le tableau k (0 → 8) EN GRAND, à son temps u (0 → 7) — pour lire les détails :
 *              k = 0 bannière repliée · 1 grande carte · 2 compteur, classement, direct · 3 titre de chapitre
 *              4 téléphone, e-mail, calendrier · 5 appli (accueil, scan, cures, offre) · 6 logo · 7 pastilles, curseur
 *              8 ADN « noir vivant », bannière au repos, offre, BIENTÔT
 *   ex. … --demo screens 13 14.5 17 19 --echelle 1
 * ======================================================================== */

const LINES: BannerLine[] = [
  { n: 1, drug: "Amoxicilline 1 g", product: "Probiotique", at: 0.6, chips: [{ kind: "stock", text: "12 en stock" }, { kind: "marge", text: "Marge +4,20 €" }, { kind: "challenge", text: "Challenge" }] },
  { n: 2, drug: "Paracétamol 1 g", product: "Pastilles gorge", at: 1.4, chips: [{ kind: "stock", text: "8 en stock" }, { kind: "date", text: "Date courte" }] },
];

function T0Banner({ t }: { t: number }) {
  const sc = 1.15;
  const H = 18 * 2 + 140 * LINES.length;
  const left = 960 - (920 * sc) / 2;
  const top = 430 - (H * sc) / 2;
  const row = bannerRowCenter(LINES, 1, t);
  const tx = left + row.x * sc;
  const ty = top + row.y * sc;
  const cx = tween(t, 3.1, 0.8, 1700, tx, SNAP);
  const cy = tween(t, 3.1, 0.8, 980, ty, SNAP);
  return (
    <AbsoluteFill>
      <AdnBackdrop t={t} />
      <BannerHead t={t} lines={LINES} highlight={{ n: 1, at: 2.4 }} pressed={{ n: 1, at: 4.0 }} x={960} y={430} scale={sc} />
      {t > 3 && <Cursor t={t} x={cx} y={cy} clickAt={4.0} />}
    </AbsoluteFill>
  );
}

const CARD_CHIPS: ChipSpec[] = [
  { kind: "stock", text: "12 en stock", at: 0.6 },
  { kind: "marge", text: "Marge +4,20 €", at: 3.0 },
  { kind: "challenge", text: "Challenge · +1 € par boîte pour l'équipe", at: 3.6 },
  { kind: "date", text: "Date courte", at: 4.2 },
];

function T1Card({ t }: { t: number }) {
  const tab = (tt: number): BannerTab => (tt < 2.6 ? "questions" : tt < 5.0 ? "discours" : "fiche");
  const sc = 1.05;
  const ox = 960 - (BANNER_CARD.W * sc) / 2;
  const oy = 540 - (BANNER_CARD.H * sc) / 2;
  const at = (p: { x: number; y: number }) => [ox + p.x * sc, oy + p.y * sc] as const;
  const [dx, dy] = at(BANNER_CARD.tab("discours", CARD_CHIPS));
  const [fx, fy] = at(BANNER_CARD.tab("fiche", CARD_CHIPS));
  const [vx, vy] = at(BANNER_CARD.vendu);
  const cx = tween(t, 2.0, 0.5, 1700, dx, SNAP) + tween(t, 4.5, 0.4, 0, fx - dx, SNAP) + tween(t, 5.7, 0.5, 0, vx - fx, SNAP);
  const cy = tween(t, 2.0, 0.5, 1000, dy, SNAP) + tween(t, 4.5, 0.4, 0, fy - dy, SNAP) + tween(t, 5.7, 0.5, 0, vy - fy, SNAP);
  return (
    <AbsoluteFill>
      <AdnBackdrop t={t} focus={[0.3, 0.5]} />
      <BannerCard
        t={t}
        at={0.3}
        x={960}
        y={540}
        scale={sc}
        tab={tab}
        questions={[{ text: "Avez-vous déjà eu des troubles digestifs avec un antibiotique ?", at: 0.9 }, { text: "Prenez-vous déjà un probiotique ?", at: 1.5 }]}
        discours={{ text: "Avec un antibiotique, la flore intestinale peut être perturbée. Je vous conseille un probiotique pendant le traitement.", at: 2.8, dur: 1.8 }}
        chips={CARD_CHIPS}
        sold={6.3}
      />
      {t > 2 && <Cursor t={t} x={cx} y={cy} clickAt={[2.6, 5.0, 6.3]} />}
    </AbsoluteFill>
  );
}

function T2Counter({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(80% 90% at 30% 30%, ${PB.green2}, ${PB.green})` }}>
      <SoldCounterCard t={t} at={0.3} x={700} y={360} scale={0.92} value={(tt) => tween(tt, 2.0, 0.6, 127, 128, IN_OUT)} period={(tt) => (tt < 5.5 ? 0 : 1)} revenue="+ 1 254 €" goal={0.8} />
      <LiveDot t={t} at={3.0} x={1540} y={150} />
      <TeamRank t={t} at={4.2} x={1460} y={720} />
    </AbsoluteFill>
  );
}

function T3Chapter({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: PB.green }}>
      <SoldCounterCard t={t} x={960} y={520} value={127} goal={0.8} />
      <ChapterTitle t={t} at={0.4} n="1/3" text="POUR *L'ÉQUIPE*" exitAt={3.6} />
    </AbsoluteFill>
  );
}

function LockScreen({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, #1C4A42 0%, ${PB.green} 55%, #071A17 100%)` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 82, letterSpacing: "-0.03em", color: "#FFF", transform: `translateY(${wobble(t, 2, 2, 1)}px)` }}>9:41</div>
    </AbsoluteFill>
  );
}

function T4Mail({ t }: { t: number }) {
  const cal = cureTicks(3.3, 7, 0.11);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(80% 90% at 40% 40%, #E9F3EF, ${PB.paper2})` }}>
      <Phone t={t} x={700} y={520} scale={1.12} tilt={-8} buzz={0.6} statusTone={t < 1.7 ? "light" : "dark"}>
        {t < 1.7 ? <LockScreen t={t} /> : <MailBilan t={t} at={1.7} />}
        <Notification t={t} at={0.6} until={1.6} title="Pharmacie du Centre" body="Votre bilan conseil est arrivé." />
        <Notification t={t} at={cal.end + 0.25} title="Rappel" body="Votre cure se termine bientôt." />
      </Phone>
      <CalendarCure t={t} at={3.3} x={1330} y={500} scale={1.2} />
    </AbsoluteFill>
  );
}

function T5App({ t }: { t: number }) {
  const screen: ReactNode = t < 1.5 ? <AppWelcome t={t} at={0.1} /> : t < 3 ? <AppHome t={t} at={1.5} /> : t < 4.9 ? <AppScan t={t} at={3.0} /> : t < 6.2 ? <AppCures t={t} at={4.9} /> : <AppOffer t={t} at={6.3} />;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 80% at 45% 45%, ${PB.green2}, ${PB.green})` }}>
      <Phone t={t} x={760} y={520} scale={1.15} tilt={wobble(t, 4, 10, 0.5) + 8} statusTone={t >= 3 && t < 4.9 ? "light" : "dark"}>
        {screen}
      </Phone>
      <SoonBadge t={t} at={0.5} x={1300} y={210} scale={1.2} />
    </AbsoluteFill>
  );
}

function T6Logo({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: PB.green }}>
      <PBLogo t={t} at={0.8} x={960} y={330} size={150} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 600, bottom: 0, background: PB.paper }} />
      <PBLogo t={t} at={2.0} x={420} y={830} size={90} variant="icon" tone="light" />
      <PBLogo t={t} at={2.6} x={1150} y={830} size={90} variant="wordmark" tone="light" grad />
    </AbsoluteFill>
  );
}

function T7Chips({ t }: { t: number }) {
  const kinds = [
    { kind: "stock", text: "12 en stock" },
    { kind: "marge", text: "Marge +4,20 €" },
    { kind: "challenge", text: "Challenge · +1 € par boîte" },
    { kind: "date", text: "Date courte" },
    { kind: "plain", text: "Rayon B" },
  ] as const;
  const cx = tween(t, 2.6, 0.6, 1500, 1100, SNAP) + tween(t, 3.8, 0.6, 0, -500, SNAP);
  const cy = tween(t, 2.6, 0.6, 950, 760, SNAP);
  return (
    <AbsoluteFill style={{ background: "#FFF" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 540, overflow: "hidden" }}>
        <AdnBackdrop t={t} tone="night" />
      </div>
      {[300, 760].map((yy, row) => (
        <div key={yy} style={{ position: "absolute", left: 0, right: 0, top: yy - 30, display: "flex", justifyContent: "center", gap: 18 }}>
          {kinds.map((c, i) => (
            <Chip key={i} t={t} kind={c.kind} text={c.text} at={0.4 + row * 0.2 + i * 0.35} onDark={row === 0} size={30} />
          ))}
        </div>
      ))}
      <LiveDot t={t} at={2.0} x={960} y={120} />
      {t > 2.5 && <Cursor t={t} x={cx} y={cy} clickAt={[3.3, 4.6]} />}
    </AbsoluteFill>
  );
}

function T8Night({ t }: { t: number }) {
  return (
    <AbsoluteFill>
      <AdnBackdrop t={t} tone="night" />
      <BannerHead t={t} lines={[{ ...LINES[0], at: 4.6 }]} x={960} y={200} />
      <OfferCard t={t} at={1.0} x={620} y={640} scale={1.6} notch="#0B100F" />
      <SoonBadge t={t} at={2.0} x={1340} y={640} scale={1.4} />
    </AbsoluteFill>
  );
}

const TILES = [T0Banner, T1Card, T2Counter, T3Chapter, T4Mail, T5App, T6Logo, T7Chips, T8Night];
const ZOOM0 = 10;
const SLOT = 7;

function Stage({ children, scale = 1, left = 0, top = 0 }: { children: ReactNode; scale?: number; left?: number; top?: number }) {
  return <div style={{ position: "absolute", left, top, width: 1920, height: 1080, overflow: "hidden", transform: `scale(${scale})`, transformOrigin: "0 0" }}>{children}</div>;
}

export function Scene({ t }: { t: number }) {
  if (t >= ZOOM0) {
    const k = Math.min(TILES.length - 1, Math.floor((t - ZOOM0) / SLOT));
    const u = t - ZOOM0 - k * SLOT;
    const Tile = TILES[k];
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <Stage>
          <Tile t={u} />
        </Stage>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {TILES.map((Tile, i) => (
        <Stage key={i} scale={1 / 3} left={(i % 3) * 640} top={Math.floor(i / 3) * 360}>
          <Tile t={t} />
        </Stage>
      ))}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(90deg, transparent 639px, #111 639px, #111 641px, transparent 641px), linear-gradient(180deg, transparent 359px, #111 359px, #111 361px, transparent 361px)", backgroundSize: "640px 360px", opacity: prog(t, 0, 0.01) }} />
    </AbsoluteFill>
  );
}
