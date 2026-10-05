import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReferralCard } from "../referral-card";

/**
 * La carte « Parrainage » du titulaire : « Dès qu'une officine que vous parrainez
 * s'abonne, votre abonnement passe à 20 % de moins : X € HT au lieu de Y € HT par
 * mois », avec les vrais montants. Une seule remise, jamais cumulée ; aucun montant
 * fixe de 10 € par filleul ; l'offre de la console reste une exception dite telle.
 * Rendu côté serveur, sans base ni réseau.
 */

type Props = Parameters<typeof ReferralCard>[0]["referral"];

const base = (overrides: Partial<Props> = {}): Props => ({
  code: "PB-ABC234",
  link: "https://pharmaboost.test/decouvrir/abonnement?parrain=PB-ABC234",
  currentOffer: null,
  monthlyPriceCents: 12_600,
  referrals: [],
  activeCount: 0,
  discountCents: 0,
  discountBasis: null,
  referredBy: null,
  ...overrides,
});

const filleul = (name: string, overrides: Partial<Props["referrals"][number]> = {}) => ({ name, city: null, active: true, since: "2026-08-01T00:00:00.000Z", offerAmountCents: null, ...overrides });

const render = (referral: Props) =>
  renderToStaticMarkup(createElement(ReferralCard, { referral }))
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

describe("carte du titulaire : sans filleul actif", () => {
  it("annonce la règle avec les vrais montants : 100,80 € HT au lieu de 126 € HT par mois", () => {
    const html = render(base());
    expect(html).toContain("Dès qu'une officine que vous parrainez s'abonne, votre abonnement passe à 20 % de moins : 100,80 € HT au lieu de 126,00 € HT par mois.");
    expect(html).toContain("Parrainage : parrainez un confrère, payez 20 % de moins");
  });

  it("les montants suivent le tarif contractuel du titulaire : 99 € donnent 79,20 €", () => {
    expect(render(base({ monthlyPriceCents: 9_900 }))).toContain("79,20 € HT au lieu de 99,00 € HT par mois");
  });

  it("sans abonnement suivi : la règle sans montant inventé", () => {
    const html = render(base({ monthlyPriceCents: null }));
    expect(html).toContain("Dès qu'une officine que vous parrainez s'abonne, votre abonnement passe à 20 % de moins par mois.");
    expect(html).not.toContain("au lieu de");
  });

  it("ni « 10 € » par filleul, ni « jusqu'à l'abonnement gratuit », ni « encore N filleuls »", () => {
    const html = render(base());
    expect(html).not.toMatch(/10\s?€/);
    expect(html).not.toMatch(/gratuit|Encore \d|retire .* par mois de votre abonnement, tant qu'elle est abonnée\. Jusqu'à/);
  });

  it("dit que la remise est appliquée par l'équipe PharmaBoost, une seule fois, quel que soit le nombre de filleuls", () => {
    const html = render(base());
    expect(html).toContain("appliquée à votre abonnement par l'équipe PharmaBoost");
    expect(html).toContain("une seule fois : 20 % de moins, que vous ayez un ou plusieurs filleuls");
    expect(html).not.toContain("apparaît sur votre facture");
  });

  it("les chiffres : aucun filleul actif, pas de remise (« — »), l'abonnement à son prix", () => {
    const html = render(base());
    expect(html).toContain("Filleuls actifs 0");
    expect(html).toContain("Remise par mois —");
    expect(html).toContain("Votre abonnement 126,00 € HT");
    expect(html).toContain("Aucun pour l'instant. Partagez votre lien à un confrère.");
  });
});

describe("carte du titulaire : avec des filleuls actifs", () => {
  it("un filleul actif : 20 % de moins, 100,80 € HT au lieu de 126 € HT, et la remise du mois est dite", () => {
    const html = render(base({ referrals: [filleul("Pharmacie A")], activeCount: 1, discountCents: 2_520, discountBasis: "PERCENT" }));
    expect(html).toContain("Une officine que vous parrainez est abonnée : votre abonnement est à 20 % de moins, 100,80 € HT au lieu de 126,00 € HT par mois.");
    expect(html).toContain("Filleuls actifs 1");
    expect(html).toContain("Remise par mois − 25,20 €");
    expect(html).toContain("Votre abonnement 100,80 € HT");
  });

  it("deux filleuls actifs : la MÊME remise, jamais 40 %", () => {
    const one = render(base({ referrals: [filleul("A")], activeCount: 1, discountCents: 2_520, discountBasis: "PERCENT" }));
    const two = render(base({ referrals: [filleul("A"), filleul("B")], activeCount: 2, discountCents: 2_520, discountBasis: "PERCENT" }));
    expect(two).toContain("Filleuls actifs 2");
    expect(two).toContain("Remise par mois − 25,20 €");
    expect(two).toContain("Votre abonnement 100,80 € HT");
    expect(two).not.toContain("50,40");
    expect(two).not.toContain("40 %");
    expect(one).toContain("Votre abonnement 100,80 € HT");
  });

  it("un filleul inactif est listé mais ne compte pas : pas de remise", () => {
    const html = render(base({ referrals: [filleul("Résiliée", { active: false })], activeCount: 0 }));
    expect(html).toContain("Résiliée");
    expect(html).toContain("inactive");
    expect(html).toContain("Filleuls actifs 0");
    expect(html).toContain("Remise par mois —");
  });

  it("le nom du parrain de l'officine est rappelé", () => {
    expect(render(base({ referredBy: "Pharmacie Marraine" }))).toContain("Vous avez été parrainé par Pharmacie Marraine.");
  });
});

describe("carte du titulaire : l'offre de parrainage de la console, exception explicite", () => {
  // La fin est le premier instant où l'offre ne s'applique plus : minuit à Paris le 1er novembre (heure d'hiver).
  const offer = { amountCents: 4_000, endsAt: "2026-10-31T23:00:00.000Z" };

  it("annonce l'offre en cours, sa date limite (jour d'inscription inclus) et le plus avantageux des deux", () => {
    const html = render(base({ currentOffer: offer }));
    expect(html).toContain("Offre de parrainage en cours : chaque officine que vous parrainez et qui s'inscrit jusqu'au 31/10/2026 inclus retire 40,00 € HT par mois de votre abonnement, tant qu'elle est abonnée.");
    expect(html).toContain("plus avantageux entre la somme de ces montants et les 20 % de moins");
    // La règle des 20 % reste annoncée en tête.
    expect(html).toContain("passe à 20 % de moins : 100,80 € HT au lieu de 126,00 € HT par mois.");
  });

  it("sans offre, aucune mention d'offre", () => {
    expect(render(base())).not.toContain("Offre de parrainage en cours");
  });

  it("quand l'offre est plus avantageuse, la remise appliquée l'est avec le bon libellé", () => {
    const html = render(base({ currentOffer: offer, referrals: [filleul("Pendant l'offre", { offerAmountCents: 4_000 })], activeCount: 1, discountCents: 4_000, discountBasis: "OFFERS" }));
    expect(html).toContain("Une offre de parrainage vous est plus favorable que les 20 % : votre abonnement est à 86,00 € HT au lieu de 126,00 € HT par mois.");
    expect(html).toContain("Remise par mois − 40,00 €");
    expect(html).toContain("offre 40,00 € HT/mois");
  });

  it("un filleul hors offre n'affiche aucun montant", () => {
    const html = render(base({ referrals: [filleul("Hors offre")], activeCount: 1, discountCents: 2_520, discountBasis: "PERCENT" }));
    expect(html).toContain("Hors offre");
    expect(html).not.toContain("HT/mois");
  });
});
