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
        <p className="truncate text-[14px] font-bold text-white">{phase === "found" && count > 0 ? `${plural(count)} pour ce patient` : drug || "Lecture de la boîte"}</p>
        <p className="truncate text-[12px] text-[#9FCBBB]">{subtitle(props)}</p>
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
        <p className="truncate text-[14px] font-bold text-white">{phase === "found" ? (count > 0 ? "C'est prêt" : "Rien à ajouter") : drug || "Lecture de la boîte"}</p>
        <p className="truncate text-[12px] text-[#9FCBBB]">{phase === "found" && count > 0 ? `${plural(count)}${props.margin ? ` · jusqu'à ${props.margin}` : ""}` : subtitle(props)}</p>
      </div>
      {phase === "found" && count > 0 && <span className="scn-pop rounded-full bg-[#3DDC84] px-2.5 py-1 text-[12px] font-bold text-[#04261A]">{count}</span>}
    </div>
  );
}

export function ScanCapsule(props: ScanCapsuleProps) {
  return props.look === "croix" ? <Cross {...props} /> : <Pill {...props} />;
}

export const SCAN_CSS = `
section.crd-white.crd-white{background:#FFFFFF!important;border-radius:999px!important;box-shadow:0 14px 32px -14px rgba(15,43,38,.45),0 0 0 1px rgba(14,138,123,.25)!important;isolation:isolate}
section.crd-white.crd-white::before{display:none!important}
section.crd-white.crd-white::after{content:"";position:absolute;inset:-60% -10%;z-index:-1;pointer-events:none;background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat;mix-blend-mode:multiply;opacity:.42;animation:crd-adn 14s ease-in-out infinite alternate}
@keyframes crd-adn{from{transform:translate3d(-6%,-3%,0) scale(1.05) rotate(-2deg)}to{transform:translate3d(6%,3%,0) scale(1.15) rotate(2deg)}}
section.crd-light.crd-light{background:#BDEBD7!important;border-radius:22px!important;box-shadow:0 0 0 1.5px #3DBF8E,0 18px 40px -14px rgba(14,124,90,.5)!important}
.crd-frame.crd-frame{background:linear-gradient(160deg,#BDEBD7,#8FDDBE)!important}
.crd-frame.crd-frame > div:first-child{mix-blend-mode:multiply;opacity:.75}
.crd-pad.crd-pad{padding:11px!important}
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
@media (prefers-reduced-motion:reduce){section.crd-white.crd-white::after,.scn-pop,.scn-heart,.scn-cross-glow,.crd-cap-in,.crd-enter-croix,.crd-enter-gelule{animation:none}}
`;

/** La largeur de la petite bannière blanche : l'attente et le scan font exactement la même taille. */
export const WHITE_PILL_WIDTH = 214;

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
export function WhitePill({ phase, done = 0, drug = "", found = [], open = false }: { phase: ScanPhase | "idle"; done?: number; drug?: string; found?: WhiteFound[]; open?: boolean }) {
  const lit = phase === "idle" || phase === "found" ? 4 : phase === "analyse" ? Math.min(done, 4) : 0;
  return (
    <div className="flex h-10 items-center justify-center gap-2.5 px-4" data-ile-attente={phase === "idle" ? "" : undefined} data-ile-scan={phase === "idle" ? undefined : "blanc"} data-ile-scan-phase={phase === "idle" ? undefined : phase}>
      <GreenCross lit={lit} />
      {phase === "idle" ? (
        open ? (
          <>
            <span className="text-[10.5px] font-bold tracking-[0.2em] whitespace-nowrap text-[#0F2B26] uppercase">Scannez une boîte</span>
            <span className="ml-1 rounded-full bg-[#0E8A7B] px-2.5 py-[3px] text-[10.5px] font-bold tracking-[0.08em] whitespace-nowrap text-white uppercase">Une question ?</span>
          </>
        ) : (
          <span className="text-[11px] font-bold tracking-[0.22em] whitespace-nowrap text-[#0F2B26] uppercase">
            Pharma<span className="text-[#0E8A7B]">boost</span>
          </span>
        )
      ) : phase === "found" && found.length > 0 ? (
        <span className="scn-pop flex items-center gap-3 whitespace-nowrap">
          {found.map((item, i) => (
            <span key={`${item.name}-${i}`} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="mr-1.5 h-3.5 w-px bg-[#0E8A7B]/25" />}
              {item.challenge ? (
                <svg viewBox="0 0 24 24" className="size-3.5" aria-label="Challenge"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#B8D400" stroke="#8AA000" strokeWidth="1.2" strokeLinejoin="round" /></svg>
              ) : item.shortDate ? (
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="#C23A2B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Date courte"><path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2" /></svg>
              ) : null}
              <span className="max-w-[150px] truncate text-[12px] font-bold text-[#0F2B26]">{item.name}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="truncate text-[11px] font-bold tracking-[0.14em] whitespace-nowrap text-[#0F2B26] uppercase">{phase === "found" ? "Rien à ajouter" : drug || "Lecture de la boîte"}</span>
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
