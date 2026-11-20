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

type Content = { subject: string; heading: string; intro: string; points: string[]; cta: { label: string; path: string } };

function content(kind: AppEmailKind, input: AppEmailInput): Content {
  const pharmacy = input.pharmacyName;
  switch (kind) {
    case "welcome":
      return {
        subject: "Bienvenue dans PharmaBoost",
        heading: "Bienvenue ! Votre espace est prêt",
        intro: "Merci d'avoir rejoint PharmaBoost. Voici ce que l'appli fait pour vous, gratuitement :",
        points: [
          "Scanner une boîte : la fiche officielle du médicament, expliquée simplement, et les conseils de votre pharmacien.",
          "Comprendre votre prise de sang : prenez vos résultats en photo, chaque valeur est expliquée en mots simples.",
          pharmacy
            ? `Retrouver ${pharmacy} : vos bilans remis au comptoir, ses offres, et votre conseiller.`
            : "Choisir votre pharmacie PharmaBoost : vos bilans remis au comptoir, ses offres, et votre conseiller.",
        ],
        cta: { label: "Ouvrir PharmaBoost", path: "/app" },
      };
    case "scan":
      return {
        subject: "Une boîte à la maison ? Scannez-la",
        heading: "Scannez une boîte, en 2 secondes",
        intro: "Prenez une boîte de votre armoire et visez son code-barres avec l'appli.",
        points: [
          "Le nom, à quoi il sert et comment le prendre, tirés de la base officielle des médicaments.",
          "Les conseils de votre pharmacien qui vont avec.",
          "Rien n'est enregistré : le scan reste sur votre téléphone.",
        ],
        cta: { label: "Scanner une boîte", path: "/app/scanner" },
      };
    case "blood":
      return {
        subject: "Votre prise de sang, enfin claire",
        heading: "Votre prise de sang, expliquée simplement",
        intro: "Des chiffres, des flèches, des abréviations… L'appli vous aide à y voir clair.",
        points: [
          "Prenez vos résultats en photo.",
          "Chaque valeur est expliquée en mots simples : ce que c'est, et pourquoi on la mesure.",
          "Votre médecin et votre pharmacien restent là pour en parler avec vous.",
        ],
        cta: { label: "Comprendre ma prise de sang", path: "/app/prise-de-sang" },
      };
    case "pharmacy":
      return pharmacy
        ? {
            subject: `${pharmacy} dans votre poche`,
            heading: `${pharmacy}, dans votre poche`,
            intro: "Votre pharmacie PharmaBoost vous suit dans l'appli :",
            points: [
              "Vos bilans remis au comptoir, toujours à portée de main.",
              "Ses offres sur la parapharmacie, avec un code à montrer au comptoir.",
              "Votre conseiller, que vous pouvez remercier en laissant un avis.",
            ],
            cta: { label: "Voir ma pharmacie", path: "/app/ma-pharmacie" },
          }
        : {
            subject: "Votre pharmacie est-elle PharmaBoost ?",
            heading: "Choisissez votre pharmacie",
            intro: "Dites à l'appli où vous allez d'habitude :",
            points: [
              "Vos bilans remis au comptoir s'y retrouvent.",
              "Vous profitez de ses offres sur la parapharmacie.",
              "Votre pharmacie n'y est pas encore ? Indiquez-la : nous lui proposerons de nous rejoindre.",
            ],
            cta: { label: "Choisir ma pharmacie", path: "/app/pharmacies" },
          };
    case "cabinet":
      return {
        subject: "Votre armoire à pharmacie, rangée",
        heading: "Rangez votre armoire à pharmacie",
        intro: "Gardez la liste de vos boîtes dans l'appli : elle reste sur votre téléphone, nulle part ailleurs.",
        points: [
          "Retrouvez d'un coup d'œil ce que vous avez à la maison.",
          "Notez la date de péremption : l'appli vous montre les boîtes périmées ou bientôt périmées.",
          "Rapportez les boîtes périmées à votre pharmacie, elle s'en occupe.",
        ],
        cta: { label: "Ouvrir mon armoire", path: "/app/armoire" },
      };
  }
}

const REASON = "Vous recevez cet e-mail parce que vous avez créé votre espace dans l'appli PharmaBoost.";
const NO_HEALTH = "Ce message ne contient aucune information sur votre santé.";

export function buildAppEmail(kind: AppEmailKind, input: AppEmailInput): EmailMessage {
  const c = content(kind, input);
  const ctaUrl = input.appUrl(c.cta.path);
  const text = [
    "Bonjour,",
    "",
    c.intro,
    "",
    ...c.points.map((point) => `• ${point}`),
    "",
    `${c.cta.label} : ${ctaUrl}`,
    `Sur iPhone, l'appli PharmaBoost : ${input.appStoreUrl}`,
    "",
    "À bientôt,",
    "L'équipe PharmaBoost",
    "",
    REASON,
    `Ne plus recevoir ces conseils : ${input.unsubscribeUrl}`,
    NO_HEALTH,
  ].join("\n");
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;background:#F4F7F6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F2B26">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#0E8A7B;border-radius:16px 16px 0 0;padding:22px 24px">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.85);font-weight:700">PharmaBoost</div>
      <div style="margin-top:6px;font-size:22px;line-height:28px;font-weight:800;color:#fff">${escapeHtml(c.heading)}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:22px 24px">
      <p style="margin:0;font-size:15px;line-height:23px;color:#374151">${escapeHtml(c.intro)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px">
        ${c.points
          .map(
            (point) =>
              `<tr><td style="vertical-align:top;padding:6px 10px 6px 0;color:#0E8A7B;font-weight:800;font-size:16px">✓</td><td style="padding:6px 0;font-size:15px;line-height:22px;color:#374151">${escapeHtml(point)}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="margin:20px 0 0"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:#0E8A7B;color:#fff;font-weight:700;text-decoration:none">${escapeHtml(c.cta.label)}</a></p>
      <p style="margin:14px 0 0;font-size:13px;line-height:19px;color:#64748B">Sur iPhone : <a href="${escapeHtml(input.appStoreUrl)}" style="color:#0E8A7B">l'appli PharmaBoost sur l'App Store</a></p>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:12px;line-height:18px;color:#94A3A0">${escapeHtml(REASON)}<br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#94A3A0">Ne plus recevoir ces conseils</a> · ${escapeHtml(NO_HEALTH)}</p>
  </div>
</body></html>`;
  return { subject: c.subject, text, html };
}
