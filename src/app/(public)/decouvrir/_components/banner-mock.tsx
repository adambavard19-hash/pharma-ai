import { useId, type CSSProperties } from "react";
import { BANNER, withCount } from "../../../../../agent/src/banner-design";
import { cn } from "@/lib/utils";

/**
 * La bannière du poste de caisse, redessinée pour les visuels du site : le même dessin que la bannière Windows
 * (agent/src/notice-host.ts) et que son aperçu Mac (agent/src/banner-preview.ts). Couleurs, cotes et phrases viennent de
 * `BANNER` (agent/src/banner-design.ts), importé tel quel : un changement de couleur ou de phrase là-bas se voit ici sans
 * rien retaper, et un test le vérifie.
 *
 * Statique, sans script : une image qui se lit (l'animation vivante est dans la section « Au comptoir »). Les cotes sont
 * celles de Windows à 100 %, multipliées par `--k` — un pixel de bannière, calculé sur la largeur disponible (`cqi`) et
 * plafonné : la bannière remplit la place qu'on lui donne, sans jamais dépasser sa taille réelle ni être rognée.
 */

export type BannerMockStock = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

export type BannerMockItem = {
  name: string;
  /** « 16,90 € » : la bannière n'affiche le prix que si le stock est fiable. */
  price?: string;
  /** Le médicament qui appelle ce conseil, après « Pour : ». */
  drug?: string;
  /** La phrase courte de la règle : une ligne, coupée comme sur Windows. */
  reason?: string;
  challenge?: boolean;
  /** « 30/11/26 » */
  shortDate?: string;
  stock?: BannerMockStock;
  quantity?: number;
  /** Une photo de boîte ; sans elle, le flacon gris de la bannière Windows. */
  image?: string;
  /** La réponse déjà donnée ; sans elle, les boutons Vendu / Non vendu. */
  outcome?: "SOLD" | "NOT_SOLD";
};

export type BannerMockQuestion = { text: string; choices: { label: string; selected?: boolean }[] };

type Mood = "idle" | "happy" | "idea" | "alert" | "think";

const C = BANNER.colors;
const Z = BANNER.sizes;
const T = BANNER.text;

/** Une cote de la bannière (en pixels à 100 %), mise à l'échelle. */
const k = (n: number) => `calc(${n} * var(--k))`;

/**
 * La feuille de style, écrite une fois à partir de BANNER. Les couleurs deviennent des variables CSS (comme dans l'aperçu
 * Mac) ; les cotes reprennent celles de la bannière Windows (notice-host.ts : PaintList, PaintRow, PaintQuestions, PaintFooter).
 */
export function bannerMockCss(): string {
  const vars = Object.entries(C)
    .filter(([key]) => key !== "cardAlpha")
    .map(([key, value]) => `--pbm-${key}:${value};`)
    .join("");
  const alpha = `${Math.round(C.cardAlpha * 100)}%`;
  return [
    `.pbm-fit{container-type:inline-size;width:100%}`,
    `.pbm{${vars}position:relative;box-sizing:border-box;overflow:hidden;border-radius:${k(Z.radius)};color:var(--pbm-text);text-align:left;font-family:"Segoe UI","Segoe UI Variable Text",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:${k(14)};line-height:1.45;-webkit-font-smoothing:antialiased;` +
      `background:linear-gradient(180deg,color-mix(in srgb,var(--pbm-cardTop) ${alpha},transparent),color-mix(in srgb,var(--pbm-cardBottom) ${alpha},transparent));` +
      `box-shadow:0 0 0 ${k(1.2)} color-mix(in srgb,var(--pbm-glow) 30%,transparent),inset 0 0 0 1px rgba(255,255,255,.1),0 ${k(6)} ${k(14)} rgba(3,24,38,.22),0 ${k(16)} ${k(40)} rgba(3,24,38,.3)}`,
    `.pbm::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at ${k(60)} ${k(50)},color-mix(in srgb,var(--pbm-glow) 23%,transparent),transparent ${k(130)}),linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,0) ${k(46)})}`,
    // Les pastilles seules, hors de la bannière (dans un texte du site) : mêmes couleurs, à leur taille réelle.
    `.pbm-inline{${vars}--k:1px;display:inline-flex;font-family:"Segoe UI","Segoe UI Variable Text",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;line-height:1.45}`,
    `.pbm *,.pbm-inline *{box-sizing:border-box}`,
    `.pbm svg{display:block;flex:none}`,
    `.pbm-end{margin-inline-start:auto}.pbm-center{margin-inline:auto}`,
    // L'en-tête : la mascotte, « PharmaBoost », la phrase d'état, les trois petits boutons.
    `.pbm-head{position:relative;height:${k(Z.header - 4)}}`,
    `.pbm-mascot{position:absolute;left:${k(8)};top:${k(6)};width:${k(76)};height:${k(76)};overflow:visible}`,
    `.pbm-brand{position:absolute;left:${k(96)};top:${k(18)};font-weight:700;font-size:${k(17)};line-height:${k(24)};white-space:nowrap}`,
    `.pbm-sub{position:absolute;left:${k(96)};right:${k(110)};top:${k(45)};font-size:${k(13.5)};line-height:${k(20)};color:var(--pbm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.pbm-icons{position:absolute;top:${k(12)};right:${k(12)};display:flex;flex-direction:row-reverse;gap:${k(4)}}`,
    `.pbm-icon{width:${k(Z.iconButton)};height:${k(Z.iconButton)};display:grid;place-items:center;color:var(--pbm-muted)}`,
    `.pbm-icon svg{width:${k(14)};height:${k(14)};stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}`,
    // Le panneau clair : la liste, puis le pied.
    `.pbm-panel{position:relative;margin:0 ${k(10)} ${k(10)};background:var(--pbm-panel);border-radius:${k(18)};color:var(--pbm-ink)}`,
    `.pbm-list{padding:${k(8)} ${k(14)} 0}`,
    `.pbm-label{display:flex;align-items:baseline;gap:${k(10)};height:${k(24)};padding-top:1px;min-width:0}`,
    `.pbm-label small{font-size:${k(10.5)};font-weight:700;letter-spacing:.04em;color:var(--pbm-inkSoft);text-transform:uppercase;white-space:nowrap}`,
    `.pbm-label b{font-size:${k(13)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.pbm-warn{display:flex;gap:${k(10)};align-items:flex-start;background:var(--pbm-alertBg);color:var(--pbm-alertFg);border-radius:${k(12)};padding:${k(8)} ${k(12)};margin-bottom:${k(8)};font-weight:700;font-size:${k(12.5)};line-height:1.4}`,
    `.pbm-warn svg{width:${k(16)};height:${k(16)};margin-top:${k(1)};stroke:currentColor;fill:none;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}`,
    `.pbm-q{background:var(--pbm-stockBg);border-radius:${k(14)};padding:${k(12)} ${k(12)} ${k(4)};margin-bottom:${k(8)}}`,
    `.pbm-qtext{font-weight:700;font-size:${k(14)};line-height:${k(19)}}`,
    `.pbm-chips{display:flex;flex-wrap:wrap;gap:${k(8)};margin:${k(10)} 0 ${k(8)}}`,
    `.pbm-chip{display:inline-flex;align-items:center;height:${k(30)};padding:0 ${k(15)};border-radius:${k(15)};border:${k(1.3)} solid var(--pbm-accent);background:#fff;color:var(--pbm-accentDark);font-weight:700;font-size:${k(13)};white-space:nowrap}`,
    `.pbm-chip.on{background:linear-gradient(180deg,var(--pbm-accent),var(--pbm-accentDark));color:var(--pbm-soldFg);border-color:transparent}`,
    // Un conseil : la photo, le nom et le prix, « Pour : … », la raison, les pastilles, puis Vendu / Non vendu.
    `.pbm-item{display:grid;grid-template-columns:${k(Z.thumb)} minmax(0,1fr) ${k(88)};gap:${k(12)};padding:${k(12)} 0 ${k(10)};border-bottom:1px solid var(--pbm-line);min-height:${k(78)}}`,
    `.pbm-item:last-child{border-bottom:0}`,
    `.pbm-thumb{display:block;width:${k(Z.thumb)};height:${k(Z.thumb)};border-radius:${k(11)};overflow:hidden;background:#fff}`,
    `.pbm-thumb img{width:100%;height:100%;object-fit:contain;display:block}`,
    `.pbm-thumb svg{width:100%;height:100%}`,
    `.pbm-body{min-width:0;display:grid;grid-template-columns:minmax(0,1fr);align-content:space-between}`,
    `.pbm-l1{display:flex;justify-content:space-between;gap:${k(8)};align-items:baseline;margin-top:${k(-3)}}`,
    `.pbm-name{font-weight:700;font-size:${k(14)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.pbm-price{white-space:nowrap;flex:none;font-weight:700;font-size:${k(12.5)};color:var(--pbm-stockFg)}`,
    `.pbm-meta{display:block;font-size:${k(12)};color:var(--pbm-inkSoft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:${k(16)}}`,
    `.pbm-pills{display:flex;flex-wrap:wrap;gap:${k(6)};margin-top:${k(4)}}`,
    `.pbm-pill{display:inline-flex;align-items:center;gap:${k(5)};height:${k(22)};padding:0 ${k(10)} 0 ${k(9)};border-radius:${k(11)};font-size:${k(11.5)};font-weight:700;white-space:nowrap}`,
    `.pbm-pill svg{width:${k(11)};height:${k(11)};stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}`,
    `.pbm-p-challenge{background:var(--pbm-challengeBg);color:var(--pbm-challengeFg)}.pbm-p-challenge svg{fill:var(--pbm-challengeIcon);stroke:none}`,
    `.pbm-p-date{background:var(--pbm-dateBg);color:var(--pbm-dateFg)}`,
    `.pbm-p-stock{background:var(--pbm-stockBg);color:var(--pbm-stockFg)}.pbm-p-low{background:var(--pbm-lowBg);color:var(--pbm-lowFg)}`,
    `.pbm-p-out{background:var(--pbm-outBg);color:var(--pbm-outFg)}.pbm-p-unknown{background:var(--pbm-unknownBg);color:var(--pbm-unknownFg)}`,
    `.pbm-answer{display:grid;align-content:center;gap:${k(4)}}`,
    `.pbm-btn{display:flex;align-items:center;justify-content:center;gap:${k(6)};height:${k(26)};border-radius:${k(13)};font-weight:700;font-size:${k(13)};white-space:nowrap}`,
    `.pbm-btn svg{width:${k(14)};height:${k(14)};stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}`,
    `.pbm-sold{background:var(--pbm-soldBg);color:var(--pbm-soldFg)}.pbm-not{background:var(--pbm-notSoldBg);color:var(--pbm-notSoldFg);font-size:${k(12.5)}}`,
    `.pbm-done{height:${k(28)};border-radius:${k(14)}}.pbm-done.pbm-sold{background:var(--pbm-stockBg);color:var(--pbm-stockFg)}`,
    `.pbm-change{text-align:center;color:var(--pbm-inkSoft);font-weight:700;font-size:${k(12)}}`,
    // Le pied : l'e-mail du patient, le détail, « Vente terminée ».
    `.pbm-foot{padding:${k(8)} ${k(14)} ${k(12)};border-top:1px solid var(--pbm-line);display:grid;gap:${k(8)}}`,
    `.pbm-two{display:grid;grid-template-columns:minmax(0,1fr) ${k(138)};gap:${k(8)}}`,
    `.pbm-ghost{height:${k(Z.buttonHeight)};border-radius:${k(14)};border:${k(1.4)} solid #bed0da;background:var(--pbm-panel);color:var(--pbm-ink);font-weight:700;font-size:${k(13)};display:flex;align-items:center;justify-content:center;gap:${k(10)};white-space:nowrap;overflow:hidden}`,
    `.pbm-ghost svg{width:${k(16)};height:${k(16)};stroke:var(--pbm-inkSoft);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}`,
    `.pbm-finish{height:${k(Z.finishHeight)};border-radius:${k(16)};background:linear-gradient(180deg,var(--pbm-accent),var(--pbm-accentDark));color:#fff;font-weight:700;font-size:${k(15)};display:flex;align-items:center;justify-content:center;gap:${k(10)}}`,
    `.pbm-finish svg{width:${k(18)};height:${k(18)};stroke:#fff;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}`,
  ].join("\n");
}

const CSS = bannerMockCss();

/** La feuille de style, une seule fois par page, quel que soit le nombre de bannières (React la remonte dans le <head>). */
function BannerStyle() {
  return (
    <style href="pharmaboost-banner-mock" precedence="default">
      {CSS}
    </style>
  );
}

/* ------------------------------------------------------------------ */
/* Les petits dessins : mascotte, icônes, flacon                        */
/* ------------------------------------------------------------------ */

/** Un arc d'ellipse comme dans GDI+ (angles en degrés, sens horaire, y vers le bas) → chemin SVG. Le même calcul que l'aperçu Mac. */
export function arc(cx: number, cy: number, rx: number, ry: number, start: number, sweep: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)].map((n) => n.toFixed(2)).join(" ");
  };
  return `M ${point(start)} A ${rx} ${ry} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${point(start + sweep)}`;
}

/**
 * La mascotte : le même dessin que Mascot.Draw (notice-host.ts) et que l'aperçu Mac, dans la même boîte de 100 unités. Sans
 * animation ni feuille de style (l'humeur se dessine, elle ne se cache pas) : l'image de partage la dessine aussi. `uid` rend
 * les dégradés uniques quand plusieurs bannières partagent la page.
 */
export function BannerMascot({ uid, mood = "idea", className, style }: { uid: string; mood?: Mood; className?: string; style?: CSSProperties }) {
  const id = (name: string) => `${uid}-${name}`;
  const happy = mood === "happy" || mood === "idea";
  const lamp = mood === "alert" ? "#F5B028" : C.eye;
  const eyes = (cx: number) =>
    happy ? (
      <path key={cx} d={arc(cx, 43, 5.5, 5, 190, 160)} fill="none" stroke={C.eye} strokeWidth={3.2} strokeLinecap="round" />
    ) : (
      <g key={cx}>
        <ellipse cx={cx} cy={42} rx={4.5} ry={6} fill={C.eye} />
        <circle cx={cx - 1.4} cy={39.6} r={1.6} fill="#fff" fillOpacity={0.82} />
      </g>
    );
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id={id("shell")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.shellTop} />
          <stop offset="1" stopColor={C.shellBottom} />
        </linearGradient>
        <linearGradient id={id("screen")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.screenTop} />
          <stop offset="1" stopColor={C.screenBottom} />
        </linearGradient>
        <linearGradient id={id("ear")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.ear} />
          <stop offset="1" stopColor="#12968C" />
        </linearGradient>
        <linearGradient id={id("badge")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.accent} />
          <stop offset="1" stopColor={C.accentDark} />
        </linearGradient>
      </defs>
      <line x1={50} y1={17} x2={50} y2={8} stroke={C.shellEdge} strokeWidth={3} strokeLinecap="round" />
      <circle cx={50} cy={6} r={8} fill={lamp} fillOpacity={0.35} />
      <circle cx={50} cy={6} r={3.6} fill={lamp} />
      <path d={arc(50, 44, 41, 35, 192, 156)} fill="none" stroke={C.ear} strokeWidth={5} strokeLinecap="round" />
      <rect x={3} y={36} width={15} height={28} rx={7} fill={`url(#${id("ear")})`} />
      <rect x={82} y={36} width={15} height={28} rx={7} fill={`url(#${id("ear")})`} />
      <rect x={14} y={16} width={72} height={58} rx={24} fill={`url(#${id("shell")})`} stroke={C.shellEdge} strokeWidth={1.6} />
      <rect x={22} y={25} width={56} height={40} rx={17} fill={`url(#${id("screen")})`} />
      {eyes(38)}
      {eyes(62)}
      {happy && <path d="M 41 53 A 9 7 0 0 0 59 53 Z" fill={C.eye} />}
      {mood === "idle" && <path d={arc(50, 51.5, 7, 4.5, 20, 140)} fill="none" stroke={C.eye} strokeWidth={2.6} strokeLinecap="round" />}
      {mood === "alert" && <ellipse cx={50} cy={55.5} rx={4} ry={4.5} fill="none" stroke={C.eye} strokeWidth={2.4} />}
      {mood === "think" && <line x1={44} y1={55} x2={56} y2={55} stroke={C.eye} strokeWidth={2.6} strokeLinecap="round" />}
      <circle cx={74} cy={69} r={15} fill="#fff" fillOpacity={0.92} />
      <circle cx={74} cy={69} r={13.5} fill={`url(#${id("badge")})`} />
      <rect x={72.2} y={61} width={3.6} height={16} fill="#fff" />
      <rect x={66} y={67.2} width={16} height={3.6} fill="#fff" />
      {mood === "idea" && <path d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z" fill="#FFD65A" />}
    </svg>
  );
}

/** Les icônes de la bannière, au trait (celles de l'aperçu Mac). */
const ICONS = {
  pin: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M12 13v8" />
    </>
  ),
  min: <path d="M6 12h12" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  tick: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M4 7.5l8 6 8-6" />
    </>
  ),
  star: <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.1L12 17.5 5.7 21.3l1.7-7.1L2 9.5l7.1-.6z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 1.5" />
    </>
  ),
  bang: <path d="M12 6v8M12 18.5v.5" />,
  cross: <path d="M7 7l10 10M17 7L7 17" />,
  warn: (
    <>
      <path d="M12 3L2.5 20h19z" />
      <path d="M12 10v5M12 17.6v.4" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Le flacon gris de la bannière Windows (Gfx.Bottle), à la place d'un produit sans photo. */
function Bottle() {
  const s = Z.thumb;
  const w = s * 0.42;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      <rect width={s} height={s} rx={s * 0.22} fill="rgb(230,238,242)" />
      <rect x={(s - w * 0.5) / 2} y={s * 0.14} width={w * 0.5} height={s * 0.12} rx={2} fill="rgb(190,205,214)" />
      <rect x={(s - w) / 2} y={s * 0.27} width={w} height={s * 0.5} rx={s * 0.1} fill="rgb(190,205,214)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Les pastilles                                                        */
/* ------------------------------------------------------------------ */

/** Le texte de la pastille de stock, comme Availability() dans notice-host.ts. */
export function stockText(stock: BannerMockStock, quantity?: number): string {
  const n = quantity === undefined ? "" : ` · ${quantity}`;
  if (stock === "IN_STOCK") return T.inStock + n;
  if (stock === "LOW_STOCK") return T.lowStock + n;
  if (stock === "OUT_OF_STOCK") return T.outOfStock;
  return T.unknownStock;
}

/** Les pastilles d'un conseil : Challenge, Date courte, puis le stock — dans l'ordre de la bannière. */
export function BannerPills({ item }: { item: Pick<BannerMockItem, "challenge" | "shortDate" | "stock" | "quantity"> }) {
  const stock = item.stock ?? "IN_STOCK";
  const stockClass = { IN_STOCK: "pbm-p-stock", LOW_STOCK: "pbm-p-low", OUT_OF_STOCK: "pbm-p-out", UNKNOWN: "pbm-p-unknown" }[stock];
  const stockIcon = { IN_STOCK: "tick", LOW_STOCK: "bang", OUT_OF_STOCK: "cross", UNKNOWN: null }[stock] as keyof typeof ICONS | null;
  return (
    <span className="pbm-pills">
      {item.challenge && (
        <span className="pbm-pill pbm-p-challenge">
          <Icon name="star" />
          {T.challenge}
        </span>
      )}
      {item.shortDate && (
        <span className="pbm-pill pbm-p-date">
          <Icon name="clock" />
          {`${T.shortDate} ${item.shortDate}`}
        </span>
      )}
      <span className={cn("pbm-pill", stockClass)}>
        {stockIcon && <Icon name={stockIcon} />}
        {stockText(stock, item.quantity)}
      </span>
    </span>
  );
}

/** Les pastilles hors de la bannière, à leur taille réelle : pour montrer, dans un texte, ce que le comptoir affiche. */
export function BannerPillsInline({ item, className }: { item: Pick<BannerMockItem, "challenge" | "shortDate" | "stock" | "quantity">; className?: string }) {
  return (
    <span className={cn("pbm-inline", className)}>
      <BannerStyle />
      <BannerPills item={item} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* La bannière                                                          */
/* ------------------------------------------------------------------ */

/** La phrase sous « PharmaBoost », comme Subtitle() dans notice-host.ts. */
export function bannerSubtitle(items: BannerMockItem[], questions: BannerMockQuestion[], alerts: string[]): string {
  if (items.length === 0) return questions.length > 0 ? T.questionSub : alerts.length > 0 ? T.readFirst : T.quietSub;
  const answered = items.filter((item) => item.outcome).length;
  if (answered === 0) return items.length > 1 ? withCount(T.forSaleMany, items.length) : T.forSaleOne;
  return `${T.duringSale}  ${answered}/${items.length}`;
}

/** Ce qu'un lecteur d'écran entend à la place du dessin. */
function describe(subtitle: string, items: BannerMockItem[], questions: BannerMockQuestion[], alerts: string[]): string {
  const parts = [`Bannière PharmaBoost, exemple : ${subtitle}.`];
  for (const alert of alerts) parts.push(`${alert}.`);
  for (const question of questions) {
    const picked = question.choices.filter((choice) => choice.selected).map((choice) => choice.label);
    parts.push(`${question.text}${picked.length ? ` Réponse : ${picked.join(", ")}.` : ""}`);
  }
  for (const item of items) {
    parts.push(`${[item.name, item.price, item.drug ? `pour ${item.drug}` : null, item.challenge ? T.challenge : null, item.shortDate ? `${T.shortDate} ${item.shortDate}` : null, stockText(item.stock ?? "IN_STOCK", item.quantity)].filter(Boolean).join(", ")}.`);
  }
  return parts.join(" ");
}

export function BannerMock({
  label = "Médicament détecté",
  subject,
  items,
  questions = [],
  alerts = [],
  footer = true,
  width = Z.widthExpanded,
  maxScale = 1,
  align = "start",
  className,
}: {
  /** « Médicament détecté », « Produit détecté »… (detectedLabelOf dans core/counter/notice.ts). */
  label?: string;
  /** Ce qui a été scanné : « DOXYCYCLINE 100 mg ». */
  subject: string;
  items: BannerMockItem[];
  questions?: BannerMockQuestion[];
  /** Les mises en garde, en tête de liste (deux au plus sur Windows). */
  alerts?: string[];
  /** Le pied de la bannière : l'e-mail du patient, le détail, « Vente terminée ». */
  footer?: boolean;
  /** Largeur de la bannière à 100 %, en pixels Windows. */
  width?: number;
  /** Plafond de l'échelle : 1 = la taille réelle. */
  maxScale?: number;
  align?: "start" | "end" | "center";
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const subtitle = bannerSubtitle(items, questions, alerts);
  const unanswered = items.filter((item) => !item.outcome).length;
  const mood: Mood = unanswered > 0 || (items.length === 0 && questions.length > 0) ? "idea" : "happy";
  // Un pixel de bannière : la largeur disponible divisée par la largeur de la bannière, sans dépasser la taille réelle.
  const scale = { "--k": `min(${maxScale}px, calc(100cqi / ${width}))` } as CSSProperties;

  return (
    <div className={cn("pbm-fit", className)}>
      <BannerStyle />
      <div className={cn("pbm", align === "end" && "pbm-end", align === "center" && "pbm-center")} style={{ ...scale, width: k(width) }} role="img" aria-label={describe(subtitle, items, questions, alerts)}>
        <div className="pbm-head">
          <BannerMascot uid={uid} mood={mood} className="pbm-mascot" />
          <span className="pbm-brand">{T.brand}</span>
          <span className="pbm-sub">{subtitle}</span>
          <span className="pbm-icons">
            {(["close", "min", "pin"] as const).map((name) => (
              <span key={name} className="pbm-icon">
                <Icon name={name} />
              </span>
            ))}
          </span>
        </div>
        <div className="pbm-panel">
          <div className="pbm-list">
            <div className="pbm-label">
              <small>{label}</small>
              <b>{subject}</b>
            </div>
            {alerts.map((alert) => (
              <div key={alert} className="pbm-warn">
                <Icon name="warn" />
                <span>{alert}</span>
              </div>
            ))}
            {questions.map((question) => (
              <div key={question.text} className="pbm-q">
                <div className="pbm-qtext">{question.text}</div>
                <div className="pbm-chips">
                  {question.choices.map((choice) => (
                    <span key={choice.label} className={cn("pbm-chip", choice.selected && "on")}>
                      {choice.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {items.map((item) => (
              <div key={item.name} className="pbm-item">
                <span className="pbm-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element -- vignette locale, déjà à la bonne taille */}
                  {item.image ? <img src={item.image} alt="" /> : <Bottle />}
                </span>
                <span className="pbm-body">
                  <span>
                    <span className="pbm-l1">
                      <span className="pbm-name">{item.name}</span>
                      {item.price && <span className="pbm-price">{item.price}</span>}
                    </span>
                    {item.drug && <span className="pbm-meta">{T.forDrug + item.drug}</span>}
                    {item.reason && <span className="pbm-meta">{item.reason}</span>}
                  </span>
                  <BannerPills item={item} />
                </span>
                {item.outcome ? (
                  <span className="pbm-answer">
                    <span className={cn("pbm-btn pbm-done", item.outcome === "SOLD" ? "pbm-sold" : "pbm-not")}>
                      {item.outcome === "SOLD" && <Icon name="tick" />}
                      {item.outcome === "SOLD" ? T.sold : T.notSold}
                    </span>
                    <span className="pbm-change">{T.change}</span>
                  </span>
                ) : (
                  <span className="pbm-answer">
                    <span className="pbm-btn pbm-sold">{T.sold}</span>
                    <span className="pbm-btn pbm-not">{T.notSold}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
          {footer && (
            <div className="pbm-foot">
              <div className="pbm-two">
                <span className="pbm-ghost">
                  <Icon name="mail" />
                  {T.emailAdd}
                </span>
                <span className="pbm-ghost">{T.detail}</span>
              </div>
              <span className="pbm-finish">
                <Icon name="tick" />
                {T.finish}
              </span>
            </div>
          )}
          {!footer && <div style={{ height: k(10) }} />}
        </div>
      </div>
    </div>
  );
}
