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
        text: `À partir de ${input.dayLabel}, un nouveau logiciel intègre votre pharmacie : PharmaBoost. Il communique avec votre logiciel de gestion (LGO) : vous continuez à travailler comme d'habitude.`,
        strong: ["un nouveau logiciel intègre votre pharmacie"],
      },
      {
        kind: "list",
        title: "Ce que c'est : à chaque boîte scannée, le bon produit conseil s'affiche en 1 seconde, choisi selon :",
        items: ["le stock de la pharmacie", "les dates courtes à écouler", "les challenges en cours", owner ? "les laboratoires que vous avez choisis" : "les laboratoires choisis par votre titulaire"],
      },
      {
        kind: "list",
        title: owner ? "Ce que votre pharmacie y gagne" : "Ce que vous y gagnez",
        items: owner
          ? [
              "Une équipe soulagée : beaucoup de patients chaque jour, et le bon conseil sans y réfléchir.",
              "Un stock qui tourne : dates courtes, challenges et laboratoires remontent au bon patient.",
              "Des patients suivis, qui reviennent vers vous.",
              "Chaque conseil est enregistré : qui propose, ce qui se vend, dans Performances et votre bilan du matin.",
            ]
          : [
              "Vous êtes soulagé : beaucoup de patients chaque jour, et le bon conseil sans y réfléchir.",
              "Plus d'assurance : deux questions simples pour lancer la discussion, prix et stock sous les yeux.",
              "Des patients mieux suivis, qui reviennent vers vous.",
              "Votre travail se voit : chaque conseil est enregistré et compte dans vos résultats, chaque matin.",
            ],
      },
      {
        kind: "notice",
        text: `Le bilan conseil par e-mail : avec son accord, le patient reçoit après la vente un bilan au nom de la pharmacie (ce qu'il a pris, pourquoi, comment l'utiliser). S'il commence une cure (magnésium, probiotiques, vitamines…), un rappel lui arrive avant la fin : il revient à la pharmacie. ${owner ? "Encouragez l'équipe à le proposer à chaque patient." : "Pensez à le proposer à chaque patient."}`,
      },
      { kind: "video", url: `${base}${PRESENTATION_VIDEO_PAGE}`, imageUrl: `${base}${PRESENTATION_VIDEO_POSTER}`, title: "PharmaBoost en 1 minute", label: "Voir la vidéo de présentation" },
      {
        kind: "video",
        url: `${base}${PRESENTATION_VIDEO_PAGE}?film=${owner ? "titulaire" : "pharmacien"}`,
        imageUrl: `${base}/video/prise-en-main-${owner ? "titulaire" : "pharmacien"}.jpg`,
        title: "Voir la vidéo sur l'utilisation du logiciel",
        label: "Voir la vidéo",
      },
      owner
        ? { kind: "paragraph", text: "Avant le jour J : vérifiez que vos postes affichent « Connecté », et partagez la vidéo à votre équipe. Bon démarrage !" }
        : { kind: "paragraph", text: "Au comptoir, scannez comme d'habitude : la bannière fait le reste. Bon démarrage !" },
    ],
    reason: `Vous recevez cet e-mail parce que vous faites partie de l'équipe de ${input.pharmacyName} sur PharmaBoost.`,
  });
}
