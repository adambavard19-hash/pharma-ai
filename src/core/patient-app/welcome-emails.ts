import { escapeHtml, type EmailMessage } from "@/core/documents/email";

/**
 * Le mail de bienvenue des inscrits de l'appli, puis des relances de temps en temps (fondateur, 20 nov. 2026) pour leur
 * donner envie de s'en servir : scanner une boîte, comprendre sa prise de sang, retrouver sa pharmacie PharmaBoost, ranger
 * son armoire. Jamais une information sur la santé de la personne : des invitations à ouvrir l'appli, rien d'autre. Chaque
 * e-mail porte le lien « Ne plus recevoir ces conseils ».
 *
 * Module pur : aucune base, aucun réseau.
 */

export type AppEmailKind = "welcome" | "scan" | "blood" | "pharmacy" | "cabinet";

/** Les relances, dans l'ordre, et le nombre de jours après le mail de bienvenue (ou la relance précédente, ensuite). */
const FIRST_STEPS: { kind: AppEmailKind; afterDays: number }[] = [
  { kind: "scan", afterDays: 3 },
  { kind: "blood", afterDays: 10 },
  { kind: "pharmacy", afterDays: 21 },
  { kind: "cabinet", afterDays: 35 },
];
/** Après les quatre premières : une relance tous les 45 jours, à tour de rôle. */
export const REPEAT_EVERY_DAYS = 45;
const CYCLE: AppEmailKind[] = ["scan", "blood", "pharmacy", "cabinet"];

const DAY_MS = 24 * 60 * 60 * 1000;

export type NurtureState = { welcomeSentAt: Date | null; nurtureStep: number; nurtureLastAt: Date | null; nurtureOffAt: Date | null };

/** La relance due maintenant (et son numéro), ou rien. */
export function dueNurture(state: NurtureState, now: Date): { kind: AppEmailKind; step: number } | null {
  if (!state.welcomeSentAt || state.nurtureOffAt) return null;
  const step = state.nurtureStep + 1;
  if (state.nurtureStep < FIRST_STEPS.length) {
    const next = FIRST_STEPS[state.nurtureStep];
    return now.getTime() - state.welcomeSentAt.getTime() >= next.afterDays * DAY_MS ? { kind: next.kind, step } : null;
  }
  const last = state.nurtureLastAt ?? state.welcomeSentAt;
  if (now.getTime() - last.getTime() < REPEAT_EVERY_DAYS * DAY_MS) return null;
  return { kind: CYCLE[(state.nurtureStep - FIRST_STEPS.length) % CYCLE.length], step };
}

export type AppEmailInput = {
  /** La pharmacie PharmaBoost choisie dans l'appli, ou rien. */
  pharmacyName: string | null;
  /** L'adresse d'une page de l'appli (« /app/scanner » → https://pharmaboost.app/app/scanner). */
  appUrl: (path: string) => string;
  appStoreUrl: string;
  unsubscribeUrl: string;
};

type Point = { icon: string; title: string; text: string };
type Content = { subject: string; preheader: string; kicker: string; heading: string; intro: string; points: Point[]; cta: { label: string; path: string }; tip?: string };

function content(kind: AppEmailKind, input: AppEmailInput): Content {
  const pharmacy = input.pharmacyName;
  switch (kind) {
    case "welcome":
      return {
        subject: "Bienvenue dans PharmaBoost 👋",
        preheader: "Votre espace est prêt : scannez, comprenez, retrouvez votre pharmacie.",
        kicker: "Bienvenue",
        heading: "Votre pharmacie, maintenant dans votre poche",
        intro: "Merci d'avoir rejoint PharmaBoost ! L'appli est gratuite et faite pour vous simplifier la santé au quotidien. Voici par où commencer :",
        points: [
          { icon: "📷", title: "Scannez une boîte", text: "Visez le code-barres : à quoi sert le médicament, comment le prendre, et les bons conseils qui vont avec." },
          { icon: "🩸", title: "Comprenez votre prise de sang", text: "Une photo de vos résultats, et chaque valeur est expliquée en mots simples." },
          pharmacy
            ? { icon: "💚", title: `Retrouvez ${pharmacy}`, text: "Vos bilans remis au comptoir, ses offres, et votre conseiller, toujours à portée de main." }
            : { icon: "💚", title: "Choisissez votre pharmacie", text: "Vos bilans remis au comptoir, ses offres, et votre conseiller, toujours à portée de main." },
        ],
        cta: { label: "Ouvrir PharmaBoost", path: "/app" },
        tip: "Astuce : gardez l'appli sur votre écran d'accueil, elle sera là au bon moment.",
      };
    case "scan":
      return {
        subject: "📷 Une boîte à la maison ? Scannez-la",
        preheader: "2 secondes pour tout savoir sur un médicament.",
        kicker: "Le geste du jour",
        heading: "Scannez une boîte, en 2 secondes",
        intro: "Prenez n'importe quelle boîte de votre armoire et visez son code-barres avec l'appli. C'est tout.",
        points: [
          { icon: "📖", title: "La fiche officielle, en clair", text: "À quoi il sert et comment le prendre, tirés de la base officielle des médicaments." },
          { icon: "💡", title: "Les conseils qui vont avec", text: "Ce que votre pharmacien vous recommanderait, pour que tout se passe bien." },
          { icon: "🔒", title: "Rien n'est enregistré", text: "Le scan reste sur votre téléphone. Personne d'autre ne le voit." },
        ],
        cta: { label: "Scanner une boîte", path: "/app/scanner" },
      };
    case "blood":
      return {
        subject: "🩸 Votre prise de sang, enfin claire",
        preheader: "Une photo, et chaque valeur expliquée simplement.",
        kicker: "Nouveau dans l'appli",
        heading: "Votre prise de sang, expliquée simplement",
        intro: "Des chiffres, des flèches, des abréviations… Pas toujours facile de s'y retrouver. L'appli vous aide à y voir clair.",
        points: [
          { icon: "📸", title: "Une photo suffit", text: "Prenez vos résultats en photo, l'appli lit les valeurs." },
          { icon: "🧭", title: "Chaque valeur expliquée", text: "Ce que c'est, pourquoi on la mesure, et où vous vous situez." },
          { icon: "🤝", title: "Vos soignants restent là", text: "Votre médecin et votre pharmacien sont là pour en parler avec vous." },
        ],
        cta: { label: "Comprendre ma prise de sang", path: "/app/prise-de-sang" },
      };
    case "pharmacy":
      return pharmacy
        ? {
            subject: `💚 ${pharmacy}, dans votre poche`,
            preheader: "Vos bilans, ses offres et votre conseiller au même endroit.",
            kicker: "Votre pharmacie",
            heading: `${pharmacy}, toujours avec vous`,
            intro: "Votre pharmacie PharmaBoost vous suit dans l'appli, entre deux passages au comptoir :",
            points: [
              { icon: "📋", title: "Vos bilans du comptoir", text: "Les conseils remis par votre pharmacien, à relire quand vous voulez." },
              { icon: "🏷️", title: "Ses offres", text: "Des remises sur la parapharmacie, avec un code à montrer au comptoir." },
              { icon: "⭐", title: "Votre conseiller", text: "Vous avez été bien conseillé ? Dites-le-lui en laissant un avis." },
            ],
            cta: { label: "Voir ma pharmacie", path: "/app/ma-pharmacie" },
          }
        : {
            subject: "💚 Votre pharmacie est-elle PharmaBoost ?",
            preheader: "Choisissez-la en un geste et profitez de ses offres.",
            kicker: "Votre pharmacie",
            heading: "Choisissez votre pharmacie",
            intro: "Dites à l'appli où vous allez d'habitude, et tout devient plus simple :",
            points: [
              { icon: "📋", title: "Vos bilans du comptoir", text: "Les conseils remis par votre pharmacien s'y retrouvent." },
              { icon: "🏷️", title: "Ses offres", text: "Des remises sur la parapharmacie, rien que pour vous." },
              { icon: "📍", title: "Pas encore PharmaBoost ?", text: "Indiquez-la quand même : nous lui proposerons de nous rejoindre." },
            ],
            cta: { label: "Choisir ma pharmacie", path: "/app/pharmacies" },
          };
    case "cabinet":
      return {
        subject: "🧺 Votre armoire à pharmacie, rangée en 5 minutes",
        preheader: "Les boîtes périmées repérées d'un coup d'œil.",
        kicker: "Petit rangement",
        heading: "Rangez votre armoire à pharmacie",
        intro: "Gardez la liste de vos boîtes dans l'appli. Elle reste sur votre téléphone, nulle part ailleurs.",
        points: [
          { icon: "👀", title: "Tout voir d'un coup d'œil", text: "Ce que vous avez à la maison, sans fouiller les tiroirs." },
          { icon: "⏰", title: "Les dates de péremption", text: "L'appli vous montre les boîtes périmées ou bientôt périmées." },
          { icon: "♻️", title: "Un geste simple", text: "Rapportez les boîtes périmées à votre pharmacie, elle s'en occupe." },
        ],
        cta: { label: "Ouvrir mon armoire", path: "/app/armoire" },
      };
  }
}

const REASON = "Vous recevez cet e-mail parce que vous avez créé votre espace dans l'appli PharmaBoost.";
const NO_HEALTH = "Ce message ne contient aucune information sur votre santé.";
const INK = "#0F2F2A";
const GREEN = "#0E8A7B";
const MUTED = "#4B6A62";

export function buildAppEmail(kind: AppEmailKind, input: AppEmailInput): EmailMessage {
  const c = content(kind, input);
  const ctaUrl = input.appUrl(c.cta.path);
  const logo = input.appUrl("/logo-256.png");
  const dna = input.appUrl("/poste/adn-helice.jpg");
  const text = [
    "Bonjour,",
    "",
    c.heading,
    "",
    c.intro,
    "",
    ...c.points.map((point) => `• ${point.title} : ${point.text}`),
    "",
    `${c.cta.label} : ${ctaUrl}`,
    `Sur iPhone, l'appli PharmaBoost : ${input.appStoreUrl}`,
    ...(c.tip ? ["", c.tip] : []),
    "",
    "À très vite,",
    "L'équipe PharmaBoost",
    "",
    REASON,
    `Ne plus recevoir ces conseils : ${input.unsubscribeUrl}`,
    NO_HEALTH,
  ].join("\n");
  const cards = c.points
    .map(
      (point) => `<tr><td style="padding:0 0 10px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F8F6;border-radius:16px"><tr>
          <td width="64" style="padding:16px 0 16px 16px;vertical-align:top"><div style="width:44px;height:44px;border-radius:14px;background:#ffffff;text-align:center;line-height:44px;font-size:22px">${point.icon}</div></td>
          <td style="padding:16px 16px 16px 12px;vertical-align:top">
            <div style="font-size:16px;line-height:22px;font-weight:800;color:${INK}">${escapeHtml(point.title)}</div>
            <div style="margin-top:3px;font-size:14px;line-height:21px;color:${MUTED}">${escapeHtml(point.text)}</div>
          </td>
        </tr></table>
      </td></tr>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#E9F0EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9F0EE;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden">
  <tr><td background="${escapeHtml(dna)}" style="background-color:#EEF3F1;background-image:url('${escapeHtml(dna)}');background-size:cover;background-position:70% 40%;padding:28px 28px 30px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle"><img src="${escapeHtml(logo)}" width="48" height="48" alt="PharmaBoost" style="display:block;border-radius:14px;border:0"></td>
      <td style="vertical-align:middle;padding-left:10px;font-size:19px;font-weight:800;color:${INK};letter-spacing:-.01em">PharmaBoost</td>
    </tr></table>
    <div style="margin-top:26px;display:inline-block;padding:5px 12px;border-radius:999px;background:${GREEN};color:#ffffff;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(c.kicker)}</div>
    <div style="margin-top:12px;font-size:28px;line-height:34px;font-weight:800;color:${INK};letter-spacing:-.02em;max-width:400px">${escapeHtml(c.heading)}</div>
  </td></tr>
  <tr><td style="padding:24px 28px 8px">
    <p style="margin:0 0 18px;font-size:16px;line-height:25px;color:#374151">${escapeHtml(c.intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>
  </td></tr>
  <tr><td align="center" style="padding:14px 28px 6px">
    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:16px 34px;border-radius:999px;background:${GREEN};background-image:linear-gradient(135deg,#12A38F,#0B7467);color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;box-shadow:0 10px 24px -12px rgba(14,138,123,.8)">${escapeHtml(c.cta.label)} →</a>
  </td></tr>
  <tr><td align="center" style="padding:12px 28px 4px">
    <a href="${escapeHtml(input.appStoreUrl)}" style="display:inline-block;padding:9px 16px;border-radius:12px;background:#111111;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">Télécharger l'appli sur l'App Store</a>
  </td></tr>
  ${c.tip ? `<tr><td align="center" style="padding:14px 28px 0;font-size:13px;line-height:19px;color:${MUTED}">${escapeHtml(c.tip)}</td></tr>` : ""}
  <tr><td style="padding:22px 28px 26px">
    <div style="border-top:1px solid #E3ECE9;padding-top:16px;font-size:14px;line-height:21px;color:#374151">À très vite,<br><strong style="color:${INK}">L'équipe PharmaBoost</strong></div>
  </td></tr>
</table>
<p style="margin:16px auto 0;max-width:520px;text-align:center;font-size:12px;line-height:18px;color:#7C948E">${escapeHtml(REASON)}<br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#7C948E">Ne plus recevoir ces conseils</a> · ${escapeHtml(NO_HEALTH)}</p>
</td></tr></table>
</body></html>`;
  return { subject: c.subject, text, html };
}
