import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { Baby, BellRing, Heart, Home, Lock, Mail, Pill, ScanLine, Sparkles, Store, Sun, User } from "lucide-react";
import {
  ABOVE_Z,
  City,
  JAKARTA,
  N,
  PB,
  PB_SHOP,
  Passant,
  Sparkle,
  anchors,
  camLerp,
  camLook,
  clamp01,
  cue,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  wobble,
  EXIT,
  IN_OUT,
  SNAP,
  type CityCam,
  type Cue,
} from "../kit";
import { LogoRobot, Phone, PHONE_SIZE, SoonBadge } from "../../rembobine/kit/screens";
import { CAM_LINK, RETURNER, camC5 } from "./c5-le-cercle";

/* ==========================================================================
 * C4 — L'APPLI (24,95 → 30,9), onglet L'APPLI. V10 « Et bientôt, dans l'appli : les offres de sa pharmacie, sur ses
 * gammes préférées. »   VÉRITÉ : l'appli patients et ses offres ne sont PAS sorties → la pastille « BIENTÔT » claque à
 * « bientôt » et reste jusqu'à la fin (collée au téléphone), et l'appli porte aussi « BIENTÔT » dans son en-tête.
 *
 *  24,95  la rue de nuit, PharmaBoost qui brille à gauche (la caméra avance lentement : elle rejoint le cadrage de C5)
 *  25,30  « bientôt » : la pastille BIENTÔT claque au-dessus de la rue
 *  25,82  « dans l'appli » : le téléphone monte en perspective (comme la référence), la pastille s'y colle ; l'appli
 *         s'ouvre et remplit l'écran (Bonjour, le bilan conseil en grand, Ma pharmacie, Ma cure, le rappel de fin de
 *         cure ; le titre des offres pointe en bas)
 *  27,00  « les offres » : l'écran défile jusqu'aux offres ; 27,29 −20 % gamme solaire ; 27,56 2ᵉ produit à −50 %
 *  27,71  « sa pharmacie » : un trait de lumière part de la croix de LA pharmacie et touche le téléphone ; son nom
 *         « Pharmacie du Centre » se surligne en citron (27,86)
 *  28,96  « gammes » : sous les offres, « Mes gammes » se surligne, les trois tuiles (Solaire, Soin visage, Bébé) sautent
 *         et s'allument ; 29,29 « préférées » : un toucher, les cœurs se remplissent (tuiles et offres)
 *  29,66  l'écran se verrouille ; 29,84 la notification « Pharmacie du Centre — Nouvelle offre sur votre gamme Solaire »
 *  30,30  sortie : le téléphone tombe, la rue s'éclaircit, fondu de 30,48 à 30,84 (C5 dessous : même rue, même cadrage,
 *         même passant)
 * Les offres et chiffres sont des EXEMPLES : « Illustration · exemples » en bas, et « Exemple » sur chaque offre.
 * ======================================================================== */

const W = { et: 25.2, bientot: 25.36, dans: 25.97, appli: 26.13, les: 27.0, offres: 27.29, de: 27.56, sa: 27.71, pharmacie: 27.86, sur: 28.54, ses: 28.8, gammes: 28.96, preferees: 29.29 };
const BADGE_AT = 25.3;
const PHONE_AT = 25.82;
const OPEN_AT = 26.0;
const SCROLL_AT = 26.98;
/** Le défilement : l'accueil remplit l'écran, puis « les offres » montent en haut. */
const SCROLL = 524;
/** Le haut de chaque bloc dans le contenu qui défile (px de l'écran du téléphone). */
const Y = { hello: 4, hero: 54, pharma: 212, cure: 296, rappel: 425, offers: SCROLL + 4, o1: SCROLL + 72, o2: SCROLL + 296, gammes: SCROLL + 440 };
const LINK_AT = 27.62;
const TAP_AT = W.preferees - 0.05;
const LOCK = 29.66;
const NOTIF = 29.84;
const OUT = 30.3;
const C5_AT = 30.4;

const PH = { x: 724, y: 1044, s: 1.1 };
const ROSE = "#E04E77";

// ---------------------------------------------------------------- la caméra : elle rejoint celle de C5

const CAM_A: CityCam = camLook(PB_SHOP.xc, -3, ABOVE_Z, 1.24, [326, 694]);
function camC4(t: number): CityCam {
  if (t >= C5_AT) return camC5(t);
  const x = clamp01((t - 24.95) / (C5_AT - 24.95));
  return camLerp(CAM_A, CAM_LINK, 1 - (1 - x) * (1 - x));
}

// ---------------------------------------------------------------- l'appli (écran 355 × 792 du téléphone)

const SCREEN_W = PHONE_SIZE.W - 2 * PHONE_SIZE.bezel;
const APP = { bg: "#F3F8F6", ink: "#0F2F2A", soft: "#4B6A62", mute: "#94A3A0", line: "#E3ECE9", tint: "#E8F3EF", green: "#0E8A7B", grad: "linear-gradient(135deg, #0E8A7B 0%, #0796B4 100%)" };
const tx = (size: number, weight = 600, color: string = APP.ink): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size >= 22 ? "-0.03em" : "-0.005em", lineHeight: 1.15 });

/** Entrée échelonnée (montée + fondu). */
function stag(t: number, at: number, i: number, step = 0.06): CSSProperties {
  const e = prog(t, at + i * step, 0.42, SNAP);
  return { opacity: clamp01(e * 1.5), transform: `translateY(${(1 - e) * 24}px)` };
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ borderRadius: 20, background: "#FFFFFF", padding: "13px 15px", boxShadow: "0 8px 22px -14px rgba(15,47,42,.35)", ...style }}>{children}</div>;
}

function Tile({ children, bg = APP.grad, size = 46 }: { children: ReactNode; bg?: string; size?: number }) {
  return <span style={{ display: "inline-flex", width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: Math.round(size * 0.32), background: bg }}>{children}</span>;
}

function Sheen({ k, alpha = 0.5 }: { k: number; alpha?: number }) {
  if (k <= 0 || k >= 1) return null;
  return <span style={{ position: "absolute", top: "-20%", bottom: "-20%", left: `${-45 + k * 160}%`, width: "36%", background: `linear-gradient(100deg, transparent, rgba(255,255,255,${alpha}), transparent)`, transform: "skewX(-18deg)", pointerEvents: "none" }} />;
}

/** Un cœur qui se remplit à `at` (contour avant), avec une petite gerbe. */
function HeartPop({ t, at, size = 22, color = ROSE, outline = APP.mute }: { t: number; at: number; size?: number; color?: string; outline?: string }) {
  const r = ressort(t, at, { damping: 8, stiffness: 320, mass: 0.45 });
  const on = t >= at;
  const burst = prog(t, at, 0.5, SNAP);
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      {on &&
        burst < 1 &&
        Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const d = size * (0.55 + 0.6 * burst);
          return <span key={i} style={{ position: "absolute", left: size / 2 + Math.cos(a) * d - 2.5, top: size / 2 + Math.sin(a) * d - 2.5, width: 5, height: 5, borderRadius: 99, background: i % 2 ? PB.citron : color, opacity: 1 - burst }} />;
        })}
      <Heart size={size} color={on ? color : outline} fill={on ? color : "transparent"} strokeWidth={2.4} style={{ transform: `scale(${on ? Math.max(0, r) : 1})` }} />
    </span>
  );
}

/** L'accueil : le bilan conseil (celui de C3), en carte principale. */
function BilanHero({ t }: { t: number }) {
  return (
    <div style={{ position: "relative", borderRadius: 24, padding: "15px 15px 14px", background: APP.grad, overflow: "hidden", boxShadow: "0 18px 34px -18px rgba(7,150,180,.6)" }}>
      <Sheen k={prog(t, OPEN_AT + 0.4, 0.8, IN_OUT)} alpha={0.3} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
        <Tile bg="#FFFFFF">
          <Mail size={23} color={APP.green} strokeWidth={2.3} />
        </Tile>
        <div style={{ flex: 1 }}>
          <div style={tx(20, 800, "#FFFFFF")}>Votre bilan conseil</div>
          <div style={{ marginTop: 3, ...tx(13.5, 600, "rgba(255,255,255,.86)") }}>Envoyé par votre pharmacie</div>
        </div>
      </div>
      <div style={{ position: "relative", marginTop: 12, display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 16, background: "rgba(255,255,255,.17)" }}>
        <span style={{ display: "inline-flex", width: 38, height: 38, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 99, background: "rgba(255,255,255,.95)" }}>
          <Pill size={20} color={APP.green} strokeWidth={2.4} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={tx(17, 800, "#FFFFFF")}>Probiotique</div>
          <div style={{ marginTop: 2, ...tx(12.5, 600, "rgba(255,255,255,.88)"), whiteSpace: "nowrap" }}>Pourquoi avec votre traitement</div>
        </div>
      </div>
    </div>
  );
}

function OfferSolaire({ t }: { t: number }) {
  const at = W.offres;
  const r = ressort(t, at, { damping: 10, stiffness: 240, mass: 0.6 });
  const sh = ((t - at - 0.2) % 2.4) / 0.8;
  return (
    <div style={{ position: "relative", borderRadius: 24, padding: "14px 16px 16px", background: APP.grad, color: "#FFFFFF", overflow: "hidden", boxShadow: "0 22px 44px -20px rgba(7,150,180,.65)", opacity: clamp01(r * 3), transform: `scale(${lerp(0.6, 1, Math.max(0, r))}) rotate(${(1 - clamp01(r)) * -5}deg)`, transformOrigin: "30% 50%" }}>
      <Sheen k={t > at ? sh : 0} alpha={0.32} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ padding: "5px 10px", borderRadius: 99, background: "rgba(255,255,255,.22)", ...tx(12, 800, "#FFFFFF"), letterSpacing: "0.09em" }}>GAMME SOLAIRE</span>
        <span style={{ padding: "5px 9px", borderRadius: 99, background: "rgba(255,255,255,.14)", ...tx(10.5, 700, "rgba(255,255,255,.92)"), letterSpacing: "0.07em" }}>EXEMPLE</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 99, background: "rgba(255,255,255,.95)" }}>
          <HeartPop t={t} at={W.preferees + 0.08} size={20} />
        </span>
      </div>
      <div style={{ marginTop: 8, ...tx(80, 800, "#FFFFFF"), letterSpacing: "-0.05em", lineHeight: 1 }}>−20 %</div>
      <div style={{ marginTop: 6, ...tx(21, 700, "#FFFFFF"), lineHeight: 1.2 }}>sur la nouvelle gamme solaire</div>
    </div>
  );
}

function OfferSecond({ t }: { t: number }) {
  const at = W.de;
  const r = ressort(t, at, { damping: 10, stiffness: 240, mass: 0.6 });
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, borderRadius: 22, padding: "14px 14px 14px 18px", background: "#FFFFFF", overflow: "hidden", boxShadow: "0 12px 28px -16px rgba(15,47,42,.4)", opacity: clamp01(r * 3), transform: `scale(${lerp(0.6, 1, Math.max(0, r))}) rotate(${(1 - clamp01(r)) * 5}deg)`, transformOrigin: "30% 50%" }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, background: PB.citron }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ padding: "4px 9px", borderRadius: 99, background: APP.tint, ...tx(11.5, 800, PB.teal), letterSpacing: "0.08em" }}>GAMME SOIN VISAGE</span>
          <span style={{ padding: "4px 8px", borderRadius: 99, background: APP.tint, ...tx(10.5, 700, APP.soft), letterSpacing: "0.07em" }}>EXEMPLE</span>
        </div>
        <div style={{ marginTop: 8, ...tx(29, 800), letterSpacing: "-0.035em" }}>
          2<sup style={{ fontSize: 16, verticalAlign: "top", position: "relative", top: 2 }}>e</sup> produit à −50 %
        </div>
        <div style={{ marginTop: 4, ...tx(14.5, 600, APP.soft) }}>Dans votre pharmacie</div>
      </div>
      <span style={{ display: "inline-flex", width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 99, background: APP.tint }}>
        <HeartPop t={t} at={W.preferees + 0.14} size={20} />
      </span>
    </div>
  );
}

/** Ses gammes : trois tuiles sous les offres ; elles sautent et s'allument sur « gammes », les cœurs se remplissent sur
 *  « préférées ». */
const GAMMES = [
  { label: "Solaire", Icon: Sun, fav: true },
  { label: "Soin visage", Icon: Sparkles, fav: true },
  { label: "Bébé", Icon: Baby, fav: false },
];

function GammeTile({ t, i }: { t: number; i: number }) {
  const g = GAMMES[i];
  // déjà dans la page (rien de vide sous les offres) ; sur « gammes » elles sautent l'une après l'autre et s'allument
  const wave = pulse(t, W.gammes - 0.03 + i * 0.07, 0.1, 0.06, 0.34);
  const favAt = W.preferees + 0.04 * i;
  const lit = g.fav ? prog(t, favAt, 0.25, SNAP) : 0;
  const ring = lit > 0 ? rgba(ROSE, 0.42 * lit) : wave > 0.01 ? rgba(APP.green, 0.3 + 0.5 * wave) : APP.line;
  return (
    <div style={{ position: "relative", flex: 1, height: 100, borderRadius: 20, background: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `inset 0 0 0 ${2 + 1.5 * wave}px ${ring}, 0 0 ${24 * wave}px ${rgba(PB.citron, 0.9 * wave)}, 0 8px 18px -12px rgba(15,47,42,.4)`, transform: `translateY(${-8 * wave}px) scale(${1 + 0.06 * wave})` }}>
      <span style={{ position: "relative", display: "inline-flex", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, background: APP.tint, overflow: "hidden" }}>
        <span style={{ position: "absolute", inset: 0, background: PB.citron, opacity: wave }} />
        <g.Icon size={24} color={APP.green} strokeWidth={2.2} style={{ position: "relative" }} />
      </span>
      <span style={tx(14.5, 800)}>{g.label}</span>
      <span style={{ position: "absolute", right: 7, top: 7, display: "inline-flex" }}>{g.fav ? <HeartPop t={t} at={favAt} size={18} /> : <Heart size={18} color={APP.mute} strokeWidth={2.4} />}</span>
    </div>
  );
}

function AppScreen({ t }: { t: number }) {
  const scroll = prog(t, SCROLL_AT, 0.6, SNAP) * SCROLL;
  const hl = prog(t, W.pharmacie - 0.02, 0.22, SNAP);
  const tap = t >= TAP_AT ? prog(t, TAP_AT, 0.45, SNAP) : 0;
  const lock = prog(t, LOCK, 0.2, IN_OUT);
  const tabs = [
    { label: "Accueil", Icon: Home },
    { label: "Scanner", Icon: ScanLine },
    { label: "Ma pharmacie", Icon: Store },
    { label: "Profil", Icon: User },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: APP.bg }}>
      {/* une lueur de marque en haut (vectorielle) */}
      <div style={{ position: "absolute", left: -80, top: -120, width: 520, height: 380, background: `radial-gradient(ellipse at 40% 40%, ${rgba("#36E8C8", 0.22)} 0%, transparent 65%)`, transform: `translate(${wobble(t, 4, 10, 0.4)}px, ${wobble(t, 7, 8, 0.35)}px)` }} />

      {/* le contenu qui défile : l'accueil remplit l'écran, puis « les offres » montent en haut */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 96, bottom: 74, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 16, right: 16, top: 0, transform: `translateY(${-scroll}px)` }}>
          <div style={{ position: "absolute", left: 2, top: Y.hello, ...tx(34, 800), ...stag(t, OPEN_AT, 0) }}>Bonjour !</div>
          <div style={{ position: "absolute", left: 0, right: 0, top: Y.hero, ...stag(t, OPEN_AT, 1) }}>
            <BilanHero t={t} />
          </div>
          <Card style={{ position: "absolute", left: 0, right: 0, top: Y.pharma, display: "flex", alignItems: "center", gap: 12, ...stag(t, OPEN_AT, 2) }}>
            <Tile bg={PB.green}>
              <Store size={22} color={PB.citron} />
            </Tile>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={tx(13, 700, APP.soft)}>Ma pharmacie</span>
                <span style={tx(12.5, 700, APP.green)}>● Ouverte</span>
              </div>
              <div style={{ marginTop: 3, ...tx(18.5, 800) }}>Pharmacie du Centre</div>
            </div>
          </Card>
          <Card style={{ position: "absolute", left: 0, right: 0, top: Y.cure, padding: "14px 15px", ...stag(t, OPEN_AT, 3) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={tx(17, 800)}>Ma cure · Probiotique</span>
              <span style={{ padding: "4px 10px", borderRadius: 99, background: APP.tint, ...tx(12.5, 700, APP.green) }}>En cours</span>
            </div>
            <div style={{ position: "relative", marginTop: 12, height: 9, borderRadius: 99, background: APP.tint, overflow: "hidden" }}>
              <div style={{ position: "relative", width: `${62 * prog(t, OPEN_AT + 0.3, 0.9, SNAP)}%`, height: "100%", borderRadius: 99, background: APP.grad, overflow: "hidden" }}>
                <Sheen k={((t * 0.6) % 1.4) / 1} alpha={0.7} />
              </div>
            </div>
            <div style={{ marginTop: 9, ...tx(13.5, 600, APP.soft), lineHeight: 1.3 }}>Avec votre traitement, jusqu'à la fin de la cure.</div>
          </Card>
          <Card style={{ position: "absolute", left: 0, right: 0, top: Y.rappel, display: "flex", alignItems: "center", gap: 12, ...stag(t, OPEN_AT, 4) }}>
            <Tile bg={PB.citron}>
              <BellRing size={21} color={PB.green} strokeWidth={2.4} />
            </Tile>
            <div style={{ flex: 1 }}>
              <div style={tx(16.5, 800)}>Rappel de fin de cure</div>
              <div style={{ marginTop: 3, ...tx(13, 600, APP.soft) }}>Avant la fin de votre cure</div>
            </div>
          </Card>

          {/* les offres de SA pharmacie */}
          <div style={{ position: "absolute", left: 2, top: Y.offers, ...stag(t, OPEN_AT, 5) }}>
            <div style={{ ...tx(12.5, 800, APP.green), letterSpacing: "0.12em" }}>LES OFFRES DE VOTRE PHARMACIE</div>
            <div style={{ position: "relative", display: "inline-block", marginTop: 5, padding: "0 6px", marginLeft: -6 }}>
              <span style={{ position: "absolute", inset: "2px 0 0 0", borderRadius: 9, background: PB.citron, transformOrigin: "left center", transform: `scaleX(${hl})`, boxShadow: hl > 0 ? `0 0 ${18 * hl}px ${rgba(PB.citron, 0.7)}` : undefined }} />
              <span style={{ position: "relative", ...tx(28, 800, hl > 0.5 ? PB.green : APP.ink) }}>Pharmacie du Centre</span>
            </div>
          </div>
          {t >= W.offres && (
            <div style={{ position: "absolute", left: 0, right: 0, top: Y.o1 }}>
              <OfferSolaire t={t} />
            </div>
          )}
          {t >= W.de && (
            <div style={{ position: "absolute", left: 0, right: 0, top: Y.o2 }}>
              <OfferSecond t={t} />
            </div>
          )}

          {/* ses gammes préférées */}
          <div style={{ position: "absolute", left: 0, right: 0, top: Y.gammes }}>
            <div style={{ position: "relative", display: "inline-block", marginLeft: -4, padding: "3px 7px 2px" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: 7, background: PB.citron, transformOrigin: "left center", transform: `scaleX(${prog(t, W.gammes - 0.03, 0.2, SNAP)})` }} />
              <span style={{ position: "relative", ...tx(12.5, 800, t >= W.gammes + 0.05 ? PB.green : APP.green), letterSpacing: "0.12em" }}>MES GAMMES</span>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 9 }}>
              {GAMMES.map((g, i) => (
                <GammeTile key={g.label} t={t} i={i} />
              ))}
            </div>
          </div>
          {/* le toucher sur « Solaire » */}
          {tap > 0 && tap < 1 && <div style={{ position: "absolute", left: 51 - 34 * (0.4 + tap), top: Y.gammes + 76 - 34 * (0.4 + tap), width: 68 * (0.4 + tap), height: 68 * (0.4 + tap), borderRadius: 99, background: rgba(PB.green, 0.22 * (1 - tap)), border: `2px solid ${rgba(PB.green, 0.4 * (1 - tap))}` }} />}
        </div>
      </div>

      {/* l'en-tête fixe : le robot, PharmaBoost, BIENTÔT */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 44, height: 52, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: rgba(APP.bg, 0.94), borderBottom: `1px solid ${rgba(APP.line, scroll > 4 ? 1 : 0)}`, ...stag(t, OPEN_AT - 0.06, 0) }}>
        <LogoRobot t={t} size={32} seed={3} />
        <span style={{ ...tx(16.5, 800) }}>
          Pharma<span style={{ color: APP.green }}>Boost</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ padding: "5px 11px", borderRadius: 99, background: PB.citron, boxShadow: `inset 0 0 0 1.5px ${PB.green}`, ...tx(12, 800, PB.green), letterSpacing: "0.14em" }}>BIENTÔT</span>
      </div>

      {/* la barre d'onglets */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 74, display: "flex", padding: "9px 10px 0", background: "rgba(255,255,255,.96)", borderTop: `1px solid ${APP.line}`, boxSizing: "border-box" }}>
        {tabs.map(({ label, Icon }, i) => {
          const on = i === (scroll > SCROLL * 0.5 ? 2 : 0);
          return (
            <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, ...tx(10.5, 700, on ? APP.green : APP.mute) }}>
              <Icon size={21} strokeWidth={2.1} color={on ? APP.green : APP.mute} />
              {label}
            </div>
          );
        })}
      </div>

      {/* l'écran verrouillé, la notification */}
      {lock > 0 && <LockScreen t={t} k={lock} />}
    </div>
  );
}

function LockScreen({ t, k }: { t: number; k: number }) {
  const r = ressort(t, NOTIF, { damping: 13, stiffness: 210, mass: 0.7 });
  const showN = t >= NOTIF;
  const content = prog(t, LOCK + 0.08, 0.3, SNAP);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: k, background: `radial-gradient(ellipse 120% 70% at 30% 18%, ${PB.teal} 0%, ${PB.green} 45%, #04100D 100%)` }}>
      <div style={{ position: "absolute", left: -60, top: 380, width: 480, height: 420, background: `radial-gradient(ellipse, ${rgba(PB.citron, 0.16)} 0%, transparent 65%)`, transform: `translate(${wobble(t, 2, 12, 0.5)}px, ${wobble(t, 6, 10, 0.4)}px)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 62, display: "flex", flexDirection: "column", alignItems: "center", opacity: content, transform: `translateY(${(1 - content) * 18}px) scale(${0.96 + 0.04 * content})` }}>
        <Lock size={20} color="rgba(255,255,255,.85)" strokeWidth={2.4} />
        <div style={{ marginTop: 10, ...tx(17, 700, "rgba(255,255,255,.85)") }}>lundi 2 novembre</div>
        <div style={{ marginTop: 2, fontFamily: JAKARTA, fontWeight: 700, fontSize: 88, letterSpacing: "-0.04em", lineHeight: 1, color: "rgba(255,255,255,.94)" }}>9:41</div>
      </div>
      {showN && (
        <div style={{ position: "absolute", left: 9, right: 9, top: 262, opacity: clamp01(r * 3), transform: `translateY(${(1 - r) * -150}px) scale(${lerp(0.9, 1, clamp01(r))})` }}>
          <div style={{ display: "flex", gap: 12, padding: "15px 14px 16px", borderRadius: 26, background: "rgba(246,248,247,.96)", boxShadow: `0 20px 40px -14px rgba(0,0,0,.55), 0 0 ${26 * pulse(t, NOTIF + 0.1, 0.1, 0.1, 0.8)}px ${rgba(PB.citron, 0.7)}` }}>
            <span style={{ display: "inline-flex", width: 48, height: 48, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 13, background: PB.green }}>
              <LogoRobot t={t} size={40} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", ...tx(12.5, 700, "#6B7280"), letterSpacing: "0.04em" }}>
                <span>PHARMABOOST</span>
                <span style={{ letterSpacing: 0 }}>maintenant</span>
              </div>
              <div style={{ marginTop: 4, ...tx(20, 800, "#111827") }}>Pharmacie du Centre</div>
              <div style={{ marginTop: 3, ...tx(17, 600, "#374151"), lineHeight: 1.28 }}>Nouvelle offre sur votre gamme Solaire</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- par-dessus la rue

/** Le trait de lumière de LA pharmacie au téléphone (« sa pharmacie »). */
function Link({ t, from, to }: { t: number; from: [number, number]; to: [number, number] }) {
  if (t < LINK_AT || t > 28.7) return null;
  const draw = prog(t, LINK_AT, 0.22, SNAP);
  const dot = prog(t, LINK_AT + 0.02, 0.24, IN_OUT);
  const o = 1 - prog(t, 28.3, 0.35, EXIT);
  const c: [number, number] = [(from[0] + to[0]) / 2 - 30, Math.min(from[1], to[1]) - 120];
  const at = (u: number): [number, number] => [(1 - u) * (1 - u) * from[0] + 2 * u * (1 - u) * c[0] + u * u * to[0], (1 - u) * (1 - u) * from[1] + 2 * u * (1 - u) * c[1] + u * u * to[1]];
  const pts = Array.from({ length: 25 }, (_, i) => at((i / 24) * draw));
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [dx, dy] = at(dot);
  const radar = prog(t, LINK_AT - 0.04, 0.7, SNAP);
  const hit = pulse(t, LINK_AT + 0.26, 0.04, 0.04, 0.4);
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: o, pointerEvents: "none" }}>
      <circle cx={from[0]} cy={from[1]} r={18 + 70 * radar} fill="none" stroke={PB.citron} strokeWidth={3} opacity={0.8 * (1 - radar)} />
      {draw > 0 && <path d={d} fill="none" stroke={rgba(PB.citron, 0.32)} strokeWidth={11} strokeLinecap="round" />}
      {draw > 0 && <path d={d} fill="none" stroke={PB.citron} strokeWidth={5} strokeLinecap="round" strokeDasharray="1 10" />}
      {dot > 0 && dot < 1 && <circle cx={dx} cy={dy} r={9} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 10px ${PB.citron}) drop-shadow(0 0 22px ${rgba(PB.citron, 0.8)})` }} />}
      {hit > 0 && <circle cx={to[0]} cy={to[1]} r={10 + 40 * (1 - hit)} fill={rgba(PB.citron, 0.5 * hit)} />}
    </svg>
  );
}

function Mention({ t, from, to }: { t: number; from: number; to: number }) {
  const o = Math.min(prog(t, from, 0.2, SNAP), 1 - prog(t, to, 0.2, EXIT));
  if (o <= 0) return null;
  return <div style={{ position: "absolute", left: 64, top: 1436, fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: "rgba(255,255,255,.55)", opacity: o, textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>Illustration · exemples</div>;
}

// ---------------------------------------------------------------- la scène

export function Scene({ t }: { t: number }) {
  const cam = camC4(t);
  const a = anchors(cam);

  // le téléphone : il monte en perspective, flotte, puis tombe à la sortie
  const up = ressort(t, PHONE_AT, { damping: 18, stiffness: 150, mass: 0.85 });
  const fall = prog(t, OUT, 0.42, (x) => x * x);
  const py = PH.y + (1 - up) * 1100 + fall * 1350;
  const tilt = -13 - (1 - clamp01(up)) * 28 + 3 * Math.sin((t - 26) * 0.7) - fall * 18;
  const pitch = 7 + (1 - clamp01(up)) * 14 + 1.5 * Math.sin((t - 26) * 0.55);
  const rot = 2.5 + (1 - clamp01(up)) * 9 + fall * 16;
  const lockZoom = 1 + 0.05 * prog(t, LOCK, 0.6, SNAP);

  // la pastille BIENTÔT : seule au-dessus de la rue, puis collée au coin du téléphone
  const stick = prog(t, PHONE_AT + 0.1, 0.45, SNAP);
  const bx = lerp(748, 604, stick) + wobble(t, 2, 4, 0.7) * (1 - stick);
  const by = lerp(880, 648, stick) + (py - PH.y) * stick + wobble(t, 5, 5, 0.7) * (1 - stick);
  const bScale = lerp(1.22, 0.8, stick);
  const bRot = lerp(-4, -8, stick) + fall * 16;

  const dim = lerp(0.16, 0.42, prog(t, PHONE_AT, 0.5, IN_OUT)) * (1 - prog(t, OUT - 0.05, 0.4, IN_OUT));
  const fadeOut = prog(t, 30.48, 0.36, IN_OUT);
  const target: [number, number] = [PH.x - 186 * PH.s, PH.y - 290 + wobble(t, 7, 7, 0.75)];

  return (
    <AbsoluteFill style={{ background: N.sky, opacity: 1 - fadeOut }}>
      <City t={t} cam={cam} lights={1} pbLit={1} coteLit={0.75} queue={1} queueCount={7} dim={dim}>
        <Passant t={t} path={RETURNER.path} start={RETURNER.start} dur={RETURNER.dur} color={RETURNER.color} seed={9} enter />
      </City>

      <Link t={t} from={a.pbCross} to={target} />

      {up > 0.001 && (
        <Phone t={t} x={PH.x} y={py} scale={PH.s * lockZoom} tilt={tilt} pitch={pitch} rot={rot} buzz={NOTIF} statusTone={t >= LOCK + 0.1 ? "light" : "dark"} screen={APP.bg}>
          <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN_W, height: PHONE_SIZE.H - 2 * PHONE_SIZE.bezel }}>
            <AppScreen t={t} />
          </div>
        </Phone>
      )}

      <SoonBadge t={t} at={BADGE_AT} x={bx} y={by} scale={bScale} rot={bRot} />
      <Sparkle t={t} at={BADGE_AT + 0.05} x={850} y={842} size={60} color={PB.citron} />
      <Sparkle t={t} at={BADGE_AT + 0.12} x={636} y={918} size={40} color="#FFFFFF" />

      <Mention t={t} from={W.offres - 0.05} to={OUT} />
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("tampon", BADGE_AT + 0.02, 0.55),
  cue("whoosh-pb", PHONE_AT - 0.04, 0.42),
  cue("ui-pop", W.appli, 0.3),
  cue("swipe-tel", SCROLL_AT, 0.38),
  cue("carte-ping", W.offres, 0.45),
  cue("carte-ping", W.de, 0.38, 1.12),
  cue("ui-ding", W.pharmacie, 0.32),
  cue("pop-leger", W.gammes, 0.32),
  cue("bulle", W.preferees, 0.5),
  cue("tic-sec", LOCK, 0.3),
  cue("notif-douce", NOTIF, 0.55),
  cue("telephone-vibre", NOTIF + 0.02, 0.3, 1, 0.7),
  cue("swoosh", OUT, 0.4),
];
