import { renderEmail, type EmailBlock, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";
import { PRESENTATION_VIDEO_PAGE, PRESENTATION_VIDEO_POSTER } from "@/core/platform/presentation-video";

/**
 * L'e-mail du JOUR J (fondateur, 18 oct. 2026) : le jour où la pharmacie commence avec PharmaBoost. DEUX e-mails différents :
 *  - le titulaire : ce que PharmaBoost apporte à lui et à sa pharmacie (stock qui tourne, laboratoires qu'il choisit, équipe homogène,
 *    résultats visibles, patients fidélisés) ;
 *  - le pharmacien (et toute l'équipe du comptoir) : son intérêt à lui — il est soulagé, le bon conseil en une seconde, sans y réfléchir.
 * Les deux disent : un nouveau logiciel qui communique avec le LGO, le bilan conseil par e-mail, les deux vidéos.
 */
export type LaunchDayInput = { firstName: string; pharmacyName: string; owner: boolean; dayLabel: string; /** Son adresse de connexion, rappelée dans l'e-mail du pharmacien. */ email?: string | null };

const capital = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

function videos(base: string, owner: boolean): EmailBlock[] {
  return [
    { kind: "video", url: `${base}${PRESENTATION_VIDEO_PAGE}`, imageUrl: `${base}${PRESENTATION_VIDEO_POSTER}`, title: "PharmaBoost en 1 minute", label: "Voir la vidéo de présentation" },
    { kind: "video", url: `${base}${PRESENTATION_VIDEO_PAGE}?film=${owner ? "titulaire" : "pharmacien"}`, imageUrl: `${base}/video/prise-en-main-${owner ? "titulaire" : "pharmacien"}.jpg`, title: "Voir la vidéo sur l'utilisation du logiciel", label: "Voir la vidéo" },
  ];
}

export function buildLaunchDayEmail(input: LaunchDayInput, ctx: EmailContext): RenderedEmail {
  return input.owner ? ownerEmail(input, ctx) : counterEmail(input, ctx);
}

/** L'e-mail du titulaire : ce que PharmaBoost apporte à lui et à sa pharmacie. */
function ownerEmail(input: LaunchDayInput, ctx: EmailContext): RenderedEmail {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const day = capital(input.dayLabel);
  return renderEmail(ctx, {
    subject: `${day}, PharmaBoost démarre dans votre pharmacie`,
    preheader: "Votre stock, vos laboratoires et votre équipe, au service de chaque vente.",
    eyebrow: "Jour J",
    title: `${day}, votre pharmacie démarre PharmaBoost`,
    greeting: `Bonjour ${input.firstName},`,
    blocks: [
      {
        kind: "paragraph",
        text: `À partir de ${input.dayLabel}, un nouveau logiciel intègre ${input.pharmacyName} : PharmaBoost. Il communique avec votre logiciel de gestion (LGO) : votre équipe continue à travailler comme d'habitude, et à chaque boîte scannée, le bon produit conseil s'affiche en 1 seconde.`,
        strong: ["un nouveau logiciel intègre"],
      },
      {
        kind: "list",
        title: "Ce que ça vous apporte, à vous et à votre pharmacie",
        items: [
          "Vous pilotez le conseil : les laboratoires que vous choisissez passent en premier, au comptoir.",
          "Votre stock tourne : les dates courtes et les challenges remontent au bon patient, au bon moment.",
          "Une équipe homogène : remplaçants et étudiants compris, chacun propose le bon conseil, sans y réfléchir.",
          "Vous voyez tout : chaque conseil est enregistré — qui propose, ce qui se vend — dans Performances et dans votre bilan de chaque lundi.",
          "Des patients fidèles : ils repartent conseillés, suivis par e-mail, et reviennent chez vous.",
        ],
      },
      {
        kind: "notice",
        text: "Le bilan conseil par e-mail : avec son accord, le patient reçoit après la vente un bilan au nom de votre pharmacie (ce qu'il a pris, pourquoi, comment l'utiliser). S'il commence une cure (magnésium, probiotiques, vitamines…), un rappel lui arrive avant la fin : il revient chez vous. Encouragez l'équipe à le proposer à chaque patient.",
      },
      ...videos(base, true),
      { kind: "paragraph", text: "Avant le jour J : vérifiez que vos postes affichent « Connecté », et partagez la vidéo de présentation à votre équipe. Bon démarrage !" },
    ],
    reason: `Vous recevez cet e-mail en tant que titulaire de ${input.pharmacyName} sur PharmaBoost.`,
  });
}

/** L'e-mail du pharmacien (et de toute l'équipe du comptoir) : son intérêt à lui. */
function counterEmail(input: LaunchDayInput, ctx: EmailContext): RenderedEmail {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const day = capital(input.dayLabel);
  return renderEmail(ctx, {
    subject: `${day} : le bon conseil en 1 seconde, sans y penser`,
    preheader: "Vous voyez beaucoup de patients : PharmaBoost vous soulage dès la première vente.",
    eyebrow: "Jour J",
    title: `${day}, on démarre !`,
    greeting: `Bonjour ${input.firstName},`,
    blocks: [
      {
        kind: "paragraph",
        text: `À partir de ${input.dayLabel}, un nouveau logiciel intègre votre pharmacie : PharmaBoost. Il communique avec votre logiciel de gestion (LGO) : vous scannez comme d'habitude, rien d'autre à faire.`,
        strong: ["un nouveau logiciel intègre votre pharmacie"],
      },
      {
        kind: "paragraph",
        text: "Vous voyez beaucoup de patients chaque jour. PharmaBoost vous soulage : à chaque boîte scannée, le bon produit conseil s'affiche en 1 seconde, choisi selon le stock, les dates courtes, les challenges et les laboratoires de votre titulaire.",
        strong: ["le bon produit conseil s'affiche en 1 seconde"],
      },
      {
        kind: "list",
        title: "Ce que vous y gagnez, au comptoir",
        items: [
          "Plus besoin d'y penser : le conseil vient tout seul, même en plein rush.",
          "Plus besoin de tout connaître : le produit, son prix, son stock et les précautions sont sous vos yeux.",
          "Vous osez proposer : deux questions simples lancent la discussion, la réponse du patient vous guide.",
          "Votre travail se voit : chaque conseil est enregistré et compte dans vos résultats, que vous recevez chaque lundi.",
          "Vos patients vous remercient : ils repartent mieux accompagnés.",
        ],
      },
      {
        kind: "notice",
        text: "Le bilan conseil par e-mail : avec son accord, le patient reçoit après la vente un bilan au nom de la pharmacie (ce qu'il a pris, pourquoi, comment l'utiliser). S'il commence une cure, un rappel lui arrive avant la fin : il revient vous voir. Pensez à le proposer à chaque patient.",
      },
      {
        kind: "steps",
        title: "Pour vous connecter, depuis votre poste",
        items: [
          "Ouvrez pharmaboost.app dans votre navigateur internet.",
          input.email ? `Saisissez votre adresse e-mail : ${input.email}` : "Saisissez votre adresse e-mail (celle de cet e-mail).",
          "Puis le mot de passe de la pharmacie, donné par votre titulaire.",
        ],
      },
      { kind: "button", url: `${base}/login`, label: "Ouvrir pharmaboost.app" },
      ...videos(base, false),
      { kind: "paragraph", text: "Au comptoir, scannez comme d'habitude : la bannière fait le reste. Bon démarrage !" },
    ],
    reason: `Vous recevez cet e-mail parce que vous faites partie de l'équipe de ${input.pharmacyName} sur PharmaBoost.`,
  });
}
