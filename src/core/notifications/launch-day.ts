import { renderEmail, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";
import { PRESENTATION_VIDEO_PAGE, PRESENTATION_VIDEO_POSTER } from "@/core/platform/presentation-video";

/**
 * L'e-mail du JOUR J (fondateur, 18 oct. 2026) : le jour où la pharmacie commence avec PharmaBoost. Une idée en avant : ça SOULAGE le
 * pharmacien — il voit beaucoup de patients, et sans y réfléchir il a le bon conseil en une seconde, choisi selon le stock, les dates
 * courtes, les challenges et les laboratoires du titulaire. Puis ce qu'il y gagne, le suivi pharmaceutique des patients par e-mail (bilan,
 * rappel de fin de cure : ils reviennent), et les deux vidéos — présentation et prise en main. Deux versions : titulaire et comptoir.
 */
export type LaunchDayInput = { firstName: string; pharmacyName: string; owner: boolean; dayLabel: string };

const capital = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

export function buildLaunchDayEmail(input: LaunchDayInput, ctx: EmailContext): RenderedEmail {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const day = capital(input.dayLabel);
  const owner = input.owner;
  return renderEmail(ctx, {
    subject: owner ? `${day}, votre équipe démarre PharmaBoost` : `${day} : le bon conseil en 1 seconde, sans y penser`,
    preheader: owner ? "Le bon conseil en 1 seconde pour toute l'équipe, et des patients qui reviennent." : "Vous voyez beaucoup de patients : PharmaBoost vous soulage dès la première vente.",
    eyebrow: "Jour J",
    title: `${day}, on démarre !`,
    greeting: `Bonjour ${input.firstName},`,
    blocks: [
      {
        kind: "paragraph",
        text: `${owner ? "Votre équipe voit" : "Vous voyez"} beaucoup de patients chaque jour. PharmaBoost ${owner ? "la" : "vous"} soulage : à chaque boîte scannée, le bon conseil s'affiche en 1 seconde, sans avoir à y réfléchir.`,
        strong: ["le bon conseil s'affiche en 1 seconde"],
      },
      {
        kind: "list",
        title: "Choisi pour vous, selon :",
        items: ["le stock de la pharmacie", "les dates courtes à écouler", "les challenges en cours", owner ? "les laboratoires que vous avez choisis" : "les laboratoires choisis par votre titulaire"],
      },
      {
        kind: "list",
        title: owner ? "Ce que votre pharmacie y gagne" : "Ce que vous y gagnez",
        items: owner
          ? [
              "Une équipe soulagée, qui conseille au même niveau, remplaçants et étudiants compris.",
              "Un stock qui tourne : dates courtes, challenges et laboratoires remontent au bon patient.",
              "Des patients suivis, qui reviennent vers vous.",
              "Chaque conseil est enregistré : qui propose, ce qui se vend, dans Performances et votre bilan du matin.",
            ]
          : [
              "Moins de charge mentale : plus besoin de chercher quoi proposer.",
              "Plus d'assurance : deux questions simples pour lancer la discussion, prix et stock sous les yeux.",
              "Des patients mieux suivis, qui reviennent vers vous.",
              "Votre travail se voit : chaque conseil est enregistré et compte dans vos résultats, chaque matin.",
            ],
      },
      {
        kind: "notice",
        text: `Le suivi pharmaceutique, par e-mail : avec son accord, le patient reçoit après la vente un bilan au nom de la pharmacie (ce qu'il a pris, pourquoi, comment l'utiliser). S'il commence une cure (magnésium, probiotiques, vitamines…), un rappel lui arrive avant la fin : il revient à la pharmacie. ${owner ? "Encouragez l'équipe à proposer le bilan à chaque patient." : "Pensez à proposer le bilan à chaque patient."}`,
      },
      { kind: "video", url: `${base}${PRESENTATION_VIDEO_PAGE}`, imageUrl: `${base}${PRESENTATION_VIDEO_POSTER}`, title: "PharmaBoost en 1 minute", label: "Voir la vidéo de présentation" },
      {
        kind: "video",
        url: `${base}/prise-en-main`,
        imageUrl: `${base}/video/prise-en-main-${owner ? "titulaire" : "pharmacien"}.jpg`,
        title: owner ? "Votre prise en main (2 min 40)" : "Votre prise en main au comptoir (2 min)",
        label: "Voir la vidéo de prise en main",
      },
      owner
        ? { kind: "paragraph", text: "Avant le jour J : vérifiez que vos postes affichent « Connecté », et partagez la vidéo du comptoir à votre équipe. Bon démarrage !" }
        : { kind: "paragraph", text: "Au comptoir, scannez comme d'habitude : la bannière fait le reste. Bon démarrage !" },
    ],
    reason: `Vous recevez cet e-mail parce que vous faites partie de l'équipe de ${input.pharmacyName} sur PharmaBoost.`,
  });
}
