import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BANNER, withCount } from "../../../../agent/src/banner-design";
import { BannerMascot } from "./_components/banner-mock";

/**
 * L'image de partage du site (1200 × 630) : celle qu'affichent une messagerie, LinkedIn ou un e-mail quand on colle le lien
 * de pharmaboost.app. La promesse de l'accueil (« Scan. Conseil. Bilan. »), la marque, et la bannière du comptoir en île
 * (capsule noire, le robot dedans), simplifiée — ses couleurs et ses phrases viennent de BANNER, comme la vraie. Produits et prix : « exemple ».
 *
 * Générée une fois au build (aucune donnée de requête). La police est Plus Jakarta Sans, celle du site, en TTF (le moteur
 * d'image ne lit pas le woff2) : deux graisses dans `_og/`, sous licence SIL OFL (`_og/OFL.txt`).
 */

export const alt = "PharmaBoost — Scan. Conseil. Bilan. Le copilote du comptoir officinal.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const OG_DIR = join(process.cwd(), "src/app/(public)/decouvrir/_og");
const C = BANNER.colors;
const T = BANNER.text;

// Les teintes du site (globals.css, converties d'oklch) : le moteur d'image ne lit pas les variables CSS.
const SITE = { ground: "#f8fbfb", tint: "#e2f3f0", ink: "#172126", inkSoft: "#46555c", brand: "#1d8174", brandBlue: "#0796b4" };

const ROWS = [
  { name: "Crème solaire SPF 50+", price: "16,90 €", pills: [{ text: `${T.inStock} · 18`, bg: C.stockBg, fg: C.stockFg }] },
  {
    name: "Ultra-Levure 200 mg",
    price: "8,90 €",
    pills: [
      { text: T.challenge, bg: C.challengeBg, fg: C.challengeFg },
      { text: `${T.shortDate} 30/11/26`, bg: C.dateBg, fg: C.dateFg },
    ],
  },
];

export default async function Image() {
  const [bold, medium, logo] = await Promise.all([
    readFile(join(OG_DIR, "plus-jakarta-sans-700.ttf")),
    readFile(join(OG_DIR, "plus-jakarta-sans-500.ttf")),
    readFile(join(process.cwd(), "src/app/apple-icon.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: `linear-gradient(115deg, ${SITE.ground} 48%, ${SITE.tint} 100%)`, fontFamily: "Jakarta", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, background: `linear-gradient(90deg, ${SITE.brand}, ${SITE.brandBlue})`, display: "flex" }} />

        {/* La promesse */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 70px 76px", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={logoSrc} width={58} height={58} alt="" style={{ borderRadius: 14 }} />
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: SITE.ink, letterSpacing: "-0.01em" }}>
              Pharma<span style={{ color: SITE.brand }}>Boost</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 108, fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.045em", color: SITE.ink }}>
            <span>Scan.</span>
            <span>Conseil.</span>
            <span style={{ color: SITE.brand }}>Bilan.</span>
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: SITE.inkSoft, lineHeight: 1.3 }}>Le copilote du comptoir officinal.</div>
        </div>

        {/* La bannière du comptoir en île (capsule noire, notre robot dedans), simplifiée */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", flex: 1, paddingRight: 64 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 480,
              borderRadius: 34,
              background: "#0B0F14",
              boxShadow: "0 0 0 1.5px rgba(54,232,200,0.35), 0 0 40px rgba(54,232,200,0.25), 0 30px 60px rgba(3,24,38,0.35)",
              padding: "0 12px 12px",
              color: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", height: 96, gap: 14, paddingLeft: 4 }}>
              <BannerMascot uid="og" mood="idea" style={{ width: 80, height: 80 }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 21, fontWeight: 700 }}>{withCount(T.forSaleMany, ROWS.length)}</span>
                <span style={{ fontSize: 17, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>{T.forDrug}DOXYCYCLINE 100 mg</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", background: C.panel, borderRadius: 20, padding: "14px 18px 16px", color: C.ink }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700 }}>
                <span style={{ fontSize: 12, color: C.inkSoft, letterSpacing: "0.04em" }}>MÉDICAMENT DÉTECTÉ</span>
                <span>DOXYCYCLINE 100 mg</span>
              </div>
              {ROWS.map((row, index) => (
                <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: index === 0 ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 18, fontWeight: 700 }}>
                      <span>{row.name}</span>
                      <span style={{ fontSize: 16, color: C.stockFg }}>{row.price}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.inkSoft }}>{T.forDrug}DOXYCYCLINE 100 mg</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {row.pills.map((pill) => (
                        <span key={pill.text} style={{ display: "flex", alignItems: "center", height: 26, padding: "0 11px", borderRadius: 13, fontSize: 13.5, fontWeight: 700, background: pill.bg, color: pill.fg }}>
                          {pill.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 104 }}>
                    <span style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 32, borderRadius: 16, fontSize: 15, fontWeight: 700, background: C.soldBg, color: C.soldFg }}>{T.sold}</span>
                    <span style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 32, borderRadius: 16, fontSize: 14, fontWeight: 700, background: C.notSoldBg, color: C.notSoldFg }}>{T.notSold}</span>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 50, borderRadius: 16, marginTop: 4, fontSize: 18, fontWeight: 700, color: "#fff", background: `linear-gradient(180deg, ${C.accent}, ${C.accentDark})` }}>{T.finish}</div>
            </div>
          </div>
          <span style={{ display: "flex", marginTop: 14, fontSize: 14, fontWeight: 500, letterSpacing: "0.12em", color: SITE.inkSoft }}>EXEMPLE</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Jakarta", data: bold, weight: 700, style: "normal" },
        { name: "Jakarta", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
