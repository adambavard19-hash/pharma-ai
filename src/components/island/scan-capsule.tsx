"use client";

/**
 * Le moment du scan sur la bannière (fondateur, 29 oct. 2026, essais de /robot-apercu/scan) : à la place des lignes qui se
 * cochent, une animation. Deux retenues : la gélule (C, par défaut) qui se remplit puis s'ouvre sur le nombre de conseils, et
 * la croix de pharmacie (A) qui s'allume bras par bras. Le contenu seul : le verre vert est celui de la bannière autour.
 */

export type ScanLook = "gelule" | "croix" | "blanc";
export type ScanPhase = "scan" | "analyse" | "found";

/** Les quatre temps de l'analyse, tels qu'ils s'affichent sous le nom de la boîte. */
export const SCAN_STEPS = ["Boîte lue", "Contre-indications", "Votre stock", "Conseils"] as const;

export type ScanCapsuleProps = {
  look: ScanLook;
  phase: ScanPhase;
  /** Étapes de l'analyse terminées (0 à 4). */
  done: number;
  /** Le nom de la boîte ; vide tant qu'elle n'est pas lue. */
  drug: string;
  /** Une fois trouvé : le nombre de conseils et la marge possible (« 6,69 € »), si on la connaît. */
  count?: number;
  margin?: string | null;
};

const plural = (count: number) => `${count} conseil${count > 1 ? "s" : ""}`;

function subtitle({ phase, done, count = 0, margin }: ScanCapsuleProps): string {
  if (phase === "scan") return "Boîte scannée";
  if (phase === "found") return count === 0 ? "Rien à ajouter" : margin ? `jusqu'à ${margin} de marge` : "Prêts à proposer";
  return SCAN_STEPS[Math.min(done, SCAN_STEPS.length - 1)];
}

/** C · la gélule : elle se remplit avec l'analyse, puis s'ouvre en deux et le nombre de conseils en sort. */
function Pill(props: ScanCapsuleProps) {
  const { phase, done, drug, count = 0 } = props;
  const fill = phase === "found" ? 100 : phase === "analyse" ? Math.round((Math.min(done, SCAN_STEPS.length) / SCAN_STEPS.length) * 100) : 6;
  return (
    <div className="flex items-center gap-3 px-3 py-3" data-ile-scan="gelule" data-ile-scan-phase={phase}>
      <div className={`scn-pill mx-2 shrink-0 ${phase === "found" ? "scn-pill-open" : ""}`} aria-hidden="true">
        <span className="scn-pill-left">
          <span className="scn-pill-fill" style={{ width: `${fill}%` }} />
        </span>
        <span className="scn-pill-right" />
        {phase === "found" && count > 0 && <span className="scn-pill-count scn-pop">{count}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[14px] font-bold text-white">{phase === "found" && count > 0 ? `${plural(count)} pour ce patient` : drug || "Lecture de la boîte"}</p>
        <p className="break-words text-[12px] text-[#9FCBBB]">{subtitle(props)}</p>
      </div>
    </div>
  );
}

/** A · la croix de pharmacie : les quatre bras s'allument un par un, le cœur bat ; trouvé, toute la croix s'allume. */
function Cross(props: ScanCapsuleProps) {
  const { phase, done, drug, count = 0 } = props;
  const arms = [
    { x: 14, y: 2 },
    { x: 26, y: 14 },
    { x: 14, y: 26 },
    { x: 2, y: 14 },
  ];
  const lit = phase === "found" ? 4 : phase === "analyse" ? Math.min(done, 4) : 0;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" data-ile-scan="croix" data-ile-scan-phase={phase}>
      <svg viewBox="0 0 40 40" className={`size-10 shrink-0 ${phase === "found" ? "scn-cross-glow" : ""}`} aria-hidden="true">
        {arms.map((arm, i) => (
          <rect key={i} x={arm.x} y={arm.y} width="12" height="12" rx="2.5" fill={i < lit ? "#3DDC84" : "rgba(255,255,255,.12)"} style={{ transition: "fill .25s" }} />
        ))}
        <rect x="14" y="14" width="12" height="12" rx="2.5" fill="#3DDC84" className="scn-heart" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[14px] font-bold text-white">{phase === "found" ? (count > 0 ? "C'est prêt" : "Rien à ajouter") : drug || "Lecture de la boîte"}</p>
        <p className="break-words text-[12px] text-[#9FCBBB]">{phase === "found" && count > 0 ? `${plural(count)}${props.margin ? ` · jusqu'à ${props.margin}` : ""}` : subtitle(props)}</p>
      </div>
      {phase === "found" && count > 0 && <span className="scn-pop rounded-full bg-[#3DDC84] px-2.5 py-1 text-[12px] font-bold text-[#04261A]">{count}</span>}
    </div>
  );
}

export function ScanCapsule(props: ScanCapsuleProps) {
  return props.look === "croix" ? <Cross {...props} /> : <Pill {...props} />;
}

export const SCAN_CSS = `
section.crd-white.crd-white{background:#FFFFFF!important;border-radius:999px!important;box-shadow:0 12px 26px -16px rgba(14,138,123,.45),0 2px 6px -3px rgba(14,138,123,.2),0 0 0 1px #CDEBE4!important;isolation:isolate}
section.crd-white.crd-white::before{display:none!important}
section.crd-white.crd-white::after{display:none;content:"";position:absolute;inset:-60% -10%;z-index:-1;pointer-events:none;background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat;mix-blend-mode:multiply;opacity:.42;animation:crd-adn 14s ease-in-out infinite alternate}
@keyframes crd-adn{from{transform:translate3d(-6%,-3%,0) scale(1.05) rotate(-2deg)}to{transform:translate3d(6%,3%,0) scale(1.15) rotate(2deg)}}
section.crd-light.crd-light{background:#BDEBD7!important;border-radius:22px!important;box-shadow:0 0 0 1.5px #3DBF8E,0 18px 40px -14px rgba(14,124,90,.5)!important}
.crd-frame.crd-frame{background:linear-gradient(160deg,#BDEBD7,#8FDDBE)!important}
.crd-frame.crd-frame > div:first-child{mix-blend-mode:multiply;opacity:.75}
.crd-pad.crd-pad{padding:8px!important}
section.crd-light.crd-light::before{display:none!important}
section.crd-glass.crd-glass{background:linear-gradient(180deg,#072A25 0%,#03171A 100%)!important;border-radius:22px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 18px 40px -16px rgba(0,0,0,.6)!important}
section.crd-glass.crd-glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:2;background:linear-gradient(110deg,rgba(95,165,148,.5),rgba(232,255,156,.75) 50%,rgba(95,165,148,.5));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.crd-cap-in{animation:crd-cap-in .45s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes crd-cap-in{from{opacity:0;transform:translateY(-14px) scale(.92)}to{opacity:1;transform:none}}
.crd-enter-croix{animation:crd-unfold .55s cubic-bezier(.2,.9,.3,1) both;transform-origin:top center}
@keyframes crd-unfold{from{opacity:.2;clip-path:inset(0 12% 70% 12% round 22px);transform:scaleY(.85)}to{opacity:1;clip-path:inset(0 0 0 0 round 22px);transform:none}}
.crd-enter-gelule{animation:crd-pillopen .55s cubic-bezier(.2,.9,.3,1) both}
@keyframes crd-pillopen{from{opacity:.3;clip-path:inset(0 44% 0 44% round 22px)}to{opacity:1;clip-path:inset(0 0 0 0 round 22px)}}
.scn-pop{animation:scn-pop .4s cubic-bezier(.2,.9,.3,1.4) both}
@keyframes scn-pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
.scn-heart{animation:scn-heart 1s ease-in-out infinite}
@keyframes scn-heart{0%,100%{opacity:1}50%{opacity:.45}}
.scn-cross-glow{filter:drop-shadow(0 0 6px rgba(61,220,132,.9));animation:scn-pop .4s ease both}
.scn-pill{position:relative;display:flex;width:58px;height:24px}
.scn-pill-left,.scn-pill-right{height:24px;width:29px;transition:transform .45s cubic-bezier(.2,.9,.3,1.2)}
.scn-pill-left{position:relative;overflow:hidden;border-radius:12px 0 0 12px;background:rgba(255,255,255,.14)}
.scn-pill-right{border-radius:0 12px 12px 0;background:#F4F8F6}
.scn-pill-fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#3DDC84,#E8FF9C);transition:width .45s ease}
.scn-pill-open .scn-pill-left{transform:translateX(-7px) rotate(-12deg)}
.scn-pill-open .scn-pill-right{transform:translateX(7px) rotate(12deg)}
.scn-pill-count{position:absolute;left:50%;top:50%;margin:-11px 0 0 -11px;width:22px;height:22px;border-radius:999px;background:#E8FF9C;color:#04261A;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
.viv-wave{position:absolute;inset:0;border-radius:999px;background:#14A38F;animation:viv-wave 1s ease-out infinite}
@keyframes viv-wave{0%{transform:scale(.7);opacity:.7}100%{transform:scale(1.9);opacity:0}}
.viv-in{animation:viv-in .4s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes viv-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.viv-count{animation:scn-pop .4s cubic-bezier(.2,.9,.3,1.4) both}
@media (prefers-reduced-motion:reduce){.viv-wave,.viv-in,.viv-count{animation:none}}
@media (prefers-reduced-motion:reduce){section.crd-white.crd-white::after,.scn-pop,.scn-heart,.scn-cross-glow,.crd-cap-in,.crd-enter-croix,.crd-enter-gelule{animation:none}}
`;

/** La largeur de la petite bannière blanche : l'attente et le scan font exactement la même taille. */
export const WHITE_PILL_WIDTH = 214;
/** L'Île vivante (fondateur, 6 nov. 2026, proposition B) : la pilule s'élargit au scan, à la recherche et au résultat. */
export const LIVING_PILL_WIDTH = 300;

/** La croix de pharmacie verte de la petite bannière blanche : ses bras s'allument un à un pendant l'analyse. */
export function GreenCross({ lit, size = 24 }: { lit: number; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size }} className="shrink-0" aria-hidden="true">
      {[
        { x: 14, y: 2 },
        { x: 26, y: 14 },
        { x: 14, y: 26 },
        { x: 2, y: 14 },
      ].map((arm, i) => (
        <rect key={i} x={arm.x} y={arm.y} width="12" height="12" rx="2.5" fill={i < lit ? "#0E8A7B" : "rgba(14,138,123,.16)"} style={{ transition: "fill .25s" }} />
      ))}
      <rect x="14" y="14" width="12" height="12" rx="2.5" fill="#0E8A7B" className="scn-heart" />
    </svg>
  );
}

export type WhiteFound = { name: string; challenge?: boolean; shortDate?: boolean };

/**
 * La petite bannière blanche sur l'ADN (fondateur, 29 oct. 2026) : au repos, la croix et PHARMABOOST (au survol, « Scannez une
 * boîte » et « Une question ? ») ; au scan, la croix qui s'allume sur le nom de la boîte ; trouvé, le nom des conseils avec
 * l'étoile du challenge ou le sablier de la date courte. Le contenu seul : la capsule blanche est la bannière autour.
 */
export function WhitePill({ phase, done = 0, drug = "", found = [], open = false, total }: { phase: ScanPhase | "idle"; done?: number; drug?: string; found?: WhiteFound[]; open?: boolean; total?: number }) {
  if (phase !== "idle") return <LivingPill phase={phase} done={done} drug={drug} count={total ?? found.length} />;
  return (
    <div className="flex h-10 items-center justify-center gap-2.5 px-4" data-ile-attente="">
      <GreenCross lit={4} />
      {open ? (
        <>
          <span className="text-[10.5px] font-bold tracking-[0.2em] whitespace-nowrap text-[#0F2B26] uppercase">Scannez une boîte</span>
          <span className="ml-1 rounded-full bg-[#0E8A7B] px-2.5 py-[3px] text-[10.5px] font-bold tracking-[0.08em] whitespace-nowrap text-white uppercase">Une question ?</span>
        </>
      ) : (
        <span className="text-[11px] font-bold tracking-[0.22em] whitespace-nowrap text-[#0F2B26] uppercase">
          Pharma<span className="text-[#0E8A7B]">boost</span>
        </span>
      )}
    </div>
  );
}

/**
 * L'Île vivante (fondateur, 6 nov. 2026 : « mets en place la B ») : une seule pilule blanche qui respire. Au scan, une onde
 * menthe derrière la croix et le nom de la boîte ; à la recherche, un anneau qui se remplit autour de la croix ; trouvé,
 * PHARMABOOST et le nombre de conseils qui surgit. Jamais de chiffre quand il n'y a rien à proposer.
 */
/** `count` : le même nombre que la pilule réduite qui suit (les conseils, plus la routine comptée une fois). */
function LivingPill({ phase, done, drug, count }: { phase: ScanPhase; done: number; drug: string; count: number }) {
  const ratio = Math.max(0, Math.min(1, done / SCAN_STEPS.length));
  return (
    <div className="flex h-10 items-center gap-3 pr-4 pl-1.5" data-ile-scan="vivante" data-ile-scan-phase={phase}>
      <span className="relative flex size-8 shrink-0 items-center justify-center">
        {phase === "scan" && <span className="viv-wave" aria-hidden="true" />}
        {phase === "analyse" && (
          <svg viewBox="0 0 40 40" className="absolute inset-0 size-8 -rotate-90" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="none" stroke="#E3F1EE" strokeWidth="3" />
            <circle cx="20" cy="20" r="18" fill="none" stroke="#0E8A7B" strokeWidth="3" strokeLinecap="round" strokeDasharray="113" strokeDashoffset={113 * (1 - Math.max(0.08, ratio))} style={{ transition: "stroke-dashoffset .45s ease" }} />
          </svg>
        )}
        <span className="relative"><GreenCross lit={4} size={18} /></span>
      </span>
      <span key={phase} className="viv-in min-w-0 flex-1 truncate text-[13.5px] leading-5 font-bold text-[#0F2B26]">
        {phase === "scan" ? (drug || "Lecture de la boîte…")
          : phase === "analyse" ? <span className="font-semibold text-[#3D5E57]">Recherche du meilleur conseil…</span>
          : count > 0 ? <span className="text-[11px] tracking-[0.22em] uppercase">Pharma<span className="text-[#0E8A7B]">boost</span></span>
          : "Rien à ajouter"}
      </span>
      {phase === "found" && count > 0 && (
        <span className="viv-count flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#0E8A7B] px-1.5 text-[12px] font-extrabold text-white" aria-label={`${count} conseil${count > 1 ? "s" : ""}`}>{count}</span>
      )}
    </div>
  );
}

/** La largeur de la bannière blanche quand elle montre le nom des conseils (une estimation au caractère près). */
export function whiteFoundWidth(found: readonly WhiteFound[]): number {
  if (found.length === 0) return WHITE_PILL_WIDTH;
  const text = found.reduce((sum, item) => sum + Math.min(150, item.name.length * 7.4) + (item.challenge || item.shortDate ? 20 : 0), 0);
  return Math.min(420, Math.max(WHITE_PILL_WIDTH, 84 + text + (found.length - 1) * 26));
}

/**
 * Le nom court d'un conseil pour la petite bannière (poste du 29 oct. 2026 : « Hydratis, pastilles d'électrolytes - goût au
 * choix » débordait) : avant la virgule, le tiret ou la parenthèse, sans la forme (« baume », « gel »…), 22 caractères au plus.
 */
export function shortAdviceName(name: string): string {
  const head = name.split(/,|\s[-–]\s|\(/)[0].replace(/\s+(baume|crème|creme|gel|lait|spray|cpr|gél|gel|pdr|sachets?)\b.*$/i, "").trim() || name.trim();
  if (head.length <= 22) return head;
  const cut = head.slice(0, 22);
  return cut.slice(0, cut.lastIndexOf(" ") > 10 ? cut.lastIndexOf(" ") : 22).trim();
}
