import { describe, expect, it } from "vitest";
import { buildNewsOptInBlock, buildNewsWelcomeEmail, buildPatientNewsEmail, newsUnsubscribeHeaders } from "..";

/**
 * Les messages que reçoit un patient abonné. Ils parlent au nom de sa
 * pharmacie, sans nom d'outil, sans donnée de santé, et disent toujours
 * comment se désinscrire.
 */

const UNSUBSCRIBE = "https://pharma.example/nouveautes/desinscription/jeton-abc";

const BASE = {
  pharmacyName: "Pharmacie Saint-Michel",
  pharmacyPhone: "01 23 45 67 89",
  brandColor: "#0F766E",
  title: "Une nouvelle gamme est arrivée",
  rangeLabel: "Gamme Solaire",
  message: "Découvrez notre nouvelle gamme de soins solaires.\n\nElle est disponible dès aujourd'hui en pharmacie.",
  unsubscribeUrl: UNSUBSCRIBE,
};

const everything = (message: { subject: string; text: string; html: string }) => `${message.subject}\n${message.text}\n${message.html}`;

describe("l'annonce d'une nouvelle gamme", () => {
  it("l'objet est celui que le titulaire a écrit, rien d'autre", () => {
    expect(buildPatientNewsEmail(BASE).subject).toBe("Une nouvelle gamme est arrivée");
  });

  it("porte le titre, la gamme, le message et la mention « pas de médicament sur ordonnance »", () => {
    const { text, html } = buildPatientNewsEmail(BASE);
    for (const part of [text, html]) {
      expect(part).toContain("Une nouvelle gamme est arrivée");
      expect(part).toContain("Gamme Solaire");
      expect(part).toContain("Découvrez notre nouvelle gamme de soins solaires.");
      expect(part).toContain("Aucun médicament sur ordonnance n'est présenté dans ce message.");
    }
    expect(text).toContain("Nouvelle gamme : Gamme Solaire");
  });

  it("le pied de page dit pourquoi, comment se désinscrire, combien de temps et à qui s'adresser — en texte et en HTML", () => {
    const { text, html } = buildPatientNewsEmail(BASE);
    expect(text).toContain("Vous recevez ce message parce que vous avez demandé à être informé(e) des nouveautés de Pharmacie Saint-Michel.");
    expect(text).toContain(`Se désinscrire : ${UNSUBSCRIBE}`);
    expect(text).toContain("36 mois au plus après votre accord");
    expect(text).toContain("adressez-vous à votre pharmacie");
    expect(text).toContain("Ce message ne contient aucune information sur votre santé.");
    expect(html).toContain(`href="${UNSUBSCRIBE}"`);
    expect(html).toContain(">Se désinscrire</a>");
    expect(html).toContain("36 mois au plus après votre accord");
    expect(html).toContain("Vous recevez ce message parce que vous avez demandé à être informé(e) des nouveautés de Pharmacie Saint-Michel.");
  });

  it("le patient voit sa pharmacie, jamais un logiciel", () => {
    expect(everything(buildPatientNewsEmail(BASE))).not.toMatch(/pharmaboost|pharma\.ai/i);
    expect(everything(buildNewsWelcomeEmail(BASE))).not.toMatch(/pharmaboost|pharma\.ai/i);
  });

  it("aucun emoji dans les e-mails", () => {
    expect(everything(buildPatientNewsEmail(BASE))).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(everything(buildNewsWelcomeEmail(BASE))).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("sans gamme, aucune ligne « Nouvelle gamme »", () => {
    const message = buildPatientNewsEmail({ ...BASE, rangeLabel: null });
    expect(message.text).not.toContain("Nouvelle gamme");
    expect(message.html).not.toContain("Nouvelle gamme");
  });

  it("le téléphone de la pharmacie, ou à défaut une phrase qui n'en promet pas", () => {
    expect(buildPatientNewsEmail(BASE).text).toContain("Appelez votre pharmacie au 01 23 45 67 89.");
    const without = buildPatientNewsEmail({ ...BASE, pharmacyPhone: null });
    expect(without.text).toContain("Votre pharmacien reste à votre disposition.");
    expect(without.text).not.toContain("Appelez");
  });

  it("les paragraphes du message deviennent des paragraphes, les retours à la ligne des <br>", () => {
    const { html } = buildPatientNewsEmail({ ...BASE, message: "Première ligne\nseconde ligne\n\nAutre paragraphe" });
    expect(html).toContain("Première ligne<br>seconde ligne</p>");
    expect(html).toContain(">Autre paragraphe</p>");
  });

  it("échappe tout ce qui vient de l'officine ou du titulaire", () => {
    const { html } = buildPatientNewsEmail({ ...BASE, pharmacyName: "Pharmacie <Test> & Co", title: "Offre <b>gamme</b>", rangeLabel: "A & B <i>", message: "Un <script>alert(1)</script> message" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<Test>");
    expect(html).not.toContain("<b>gamme</b>");
    expect(html).toContain("Pharmacie &lt;Test&gt; &amp; Co");
    expect(html).toContain("A &amp; B &lt;i&gt;");
  });

  it("reprend la couleur de l'officine, et se replie sur une couleur sûre sinon", () => {
    expect(buildPatientNewsEmail({ ...BASE, brandColor: "#123456" }).html).toContain("background:#123456");
    expect(buildPatientNewsEmail({ ...BASE, brandColor: "url(javascript:x)" }).html).not.toContain("javascript");
    expect(buildPatientNewsEmail({ ...BASE, brandColor: null }).html).toContain("background:#0F766E");
  });

  it("le message de test le dit avant tout, dans l'objet comme dans le corps ; l'envoi réel ne le dit pas", () => {
    const test = buildPatientNewsEmail({ ...BASE, isTest: true });
    expect(test.subject).toBe("[TEST] Une nouvelle gamme est arrivée");
    expect(test.text.startsWith("MESSAGE DE TEST")).toBe(true);
    expect(test.html).toContain("MESSAGE DE TEST");
    const real = buildPatientNewsEmail(BASE);
    expect(real.subject).not.toContain("TEST");
    expect(real.text).not.toContain("TEST");
    expect(real.html).not.toContain("TEST");
  });
});

describe("le message de confirmation", () => {
  it("dit ce que le patient a accepté, sans rien annoncer, et redonne le lien de désinscription", () => {
    const { subject, text, html } = buildNewsWelcomeEmail(BASE);
    expect(subject).toBe("Vous serez prévenu(e) des nouveautés — Pharmacie Saint-Michel");
    expect(text).toContain("votre accord est enregistré");
    expect(text).toContain("au plus un message par semaine");
    expect(text).toContain("Votre adresse n'est reliée ni à votre ordonnance, ni à votre plan, ni à un médicament.");
    expect(text).toContain(UNSUBSCRIBE);
    expect(html).toContain(`href="${UNSUBSCRIBE}"`);
    expect(text).not.toContain("Nouvelle gamme");
  });

  it("porte le même pied de page que les annonces", () => {
    const { text } = buildNewsWelcomeEmail(BASE);
    expect(text).toContain("Vous recevez ce message parce que vous avez demandé à être informé(e) des nouveautés de Pharmacie Saint-Michel.");
    expect(text).toContain("36 mois au plus après votre accord");
  });
});

describe("les en-têtes de désinscription", () => {
  it("List-Unsubscribe pointe sur la route « un clic » du lien, pas sur la page à confirmation", () => {
    expect(newsUnsubscribeHeaders(UNSUBSCRIBE)["List-Unsubscribe"]).toBe(`<${UNSUBSCRIBE}/un-clic>`);
  });

  it("List-Unsubscribe-Post promet le POST en un clic (RFC 8058), que la route traite", () => {
    expect(newsUnsubscribeHeaders(UNSUBSCRIBE)).toEqual({ "List-Unsubscribe": `<${UNSUBSCRIBE}/un-clic>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("le lien visible du message reste celui de la page : le patient qui clique confirme lui-même", () => {
    const { text, html } = buildPatientNewsEmail(BASE);
    expect(text).toContain(`Se désinscrire : ${UNSUBSCRIBE}\n`);
    expect(html).toContain(`href="${UNSUBSCRIBE}"`);
    expect(`${text}${html}`).not.toContain("/un-clic");
  });
});

describe("le bloc facultatif de l'e-mail du plan", () => {
  const block = buildNewsOptInBlock({ pharmacyName: "Pharmacie Saint-Michel", url: "https://pharma.example/nouveautes/abonnement/jeton?a=1&b=2", brandColor: "#0F766E" });

  it("est un lien, jamais une case : aucun champ, rien de pré-coché", () => {
    expect(block.html).toContain('href="https://pharma.example/nouveautes/abonnement/jeton?a=1&amp;b=2"');
    expect(block.html).not.toMatch(/<input|checked|checkbox/i);
    expect(block.text.join("\n")).toContain("https://pharma.example/nouveautes/abonnement/jeton?a=1&b=2");
  });

  it("dit que c'est facultatif, que le plan n'en dépend pas et que rien n'est enregistré avant la confirmation", () => {
    const text = block.text.join("\n");
    expect(text).toContain("Facultatif");
    expect(text).toContain("Ce n'est pas nécessaire pour consulter votre plan");
    expect(text).toContain("rien n'est enregistré tant que vous n'avez pas confirmé");
    expect(block.html).toContain("Facultatif");
  });

  it("est une ligne de tableau, prête à être posée dans la carte du message", () => {
    expect(block.html.startsWith("<tr>")).toBe(true);
    expect(block.html.endsWith("</tr>")).toBe(true);
  });
});
