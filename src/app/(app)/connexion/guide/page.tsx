import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import { connectionMethods } from "@/core/stock/connection-overview";
import { exportGuide, ZERO_ABSENT_NOTICE } from "@/app/(app)/stock/mise-a-jour/view";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DownloadIllustration, FileIllustration, InstallerIllustration, MenuIllustration, StockOkIllustration, TrayIllustration } from "./illustrations";

export const metadata: Metadata = { title: "Guide pas à pas" };

/**
 * Le guide pas à pas, illustré : ce que l'assistant ne dit pas pour rester
 * lisible en dix secondes. Chaque étape a son schéma, sa phrase, et rien de
 * technique. « Si ça bloque » réunit ce qui arrête le plus souvent un titulaire.
 */
const TROUBLES: [string, string][] = [
  ["Windows affiche « Windows a protégé votre ordinateur »", "C'est normal pour un programme qu'il ne connaît pas encore. Cliquez « Informations complémentaires », puis « Exécuter quand même ». Dans le navigateur, si le fichier est signalé, choisissez « Conserver »."],
  ["L'installateur dit « Ce lien d'installation n'est plus valable »", "Un lien dure sept jours et ne sert que pour un poste. Dans Ma connexion, obtenez-en un nouveau, puis téléchargez de nouveau l'installateur."],
  ["L'installateur dit que PharmaBoost est injoignable", "Vérifiez que l'ordinateur a Internet (ouvrez pharmaboost.app dans un navigateur). Si un pare-feu filtre les sites, il doit laisser passer pharmaboost.app et nodejs.org."],
  ["Mon antivirus retire le programme", "Ajoutez une exception sur le dossier PharmaBoost, dans AppData\\Local (tapez %LOCALAPPDATA%\\PharmaBoost dans l'Explorateur), puis relancez l'installateur."],
  ["Le poste n'apparaît pas au bout de deux minutes", "Cherchez l'icône PharmaBoost près de l'horloge (flèche ^ à gauche des icônes). Absente : menu Démarrer, puis PharmaBoost. Point orange ou rouge : passez dessus, elle dit ce qui bloque."],
  ["Mon fichier de stock est refusé", "Il doit contenir au moins un code (CIP ou EAN), une désignation et une quantité. Prenez l'édition la plus complète de votre logiciel, ou envoyez-nous le fichier : on vous dit lequel."],
  ["Le test dit qu'un appareil « ne répond plus »", "PharmaBoost n'a reçu aucun signe de vie depuis plus de 10 minutes. Vérifiez que l'ordinateur est allumé et relié à Internet, puis redémarrez-le : PharmaBoost se relance tout seul. Patientez une minute et relancez le test."],
  ["Le test dit que mon stock est ancien alors que PharmaBoost Connect est en ligne", "Être en ligne ne veut pas dire que le stock arrive : votre logiciel doit enregistrer son édition de stock dans le dossier PharmaBoost. Refaites l'export, ou faites-le programmer par l'éditeur de votre logiciel."],
  ["Je n'y arrive pas", `Écrivez à ${PUBLIC_CONTACT_EMAIL} en disant à quelle étape vous êtes, avec une photo de l'écran : on vous rappelle et on le fait avec vous, à distance.`],
];

/** Le chemin dans le logiciel, en quelques mots, pour le schéma (les phrases complètes sont à côté). */
const MENU_PATH: Record<string, string[]> = {
  lgpi: ["Module Inventaire", "Édition", "Prix de vente", "Enregistrer en PDF"],
};
const GENERIC_MENU_PATH = ["Export ou édition du stock", "CSV, Excel ou PDF", "Enregistrer le fichier"];

export default async function GuidePage({ searchParams }: { searchParams: Promise<{ logiciel?: string }> }) {
  await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const { logiciel } = await searchParams;
  const lgo = LGO_DEFINITIONS.find((candidate) => candidate.id === logiciel) ?? LGO_DEFINITIONS[0];
  const guide = exportGuide(lgo.id);
  const methods = connectionMethods(lgo.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
          <Link href="/connexion">Retour à Ma connexion</Link>
        </Button>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.015em] text-text-primary">Guide pas à pas</h1>
        <nav aria-label="Logiciel" className="flex flex-wrap gap-2">
          {LGO_DEFINITIONS.map((candidate) => (
            <Link
              key={candidate.id}
              href={`/connexion/guide?logiciel=${candidate.id}`}
              aria-current={candidate.id === lgo.id ? "page" : undefined}
              className={cn("rounded-full border px-4 py-1.5 text-[14px] font-medium", candidate.id === lgo.id ? "border-brand-600 bg-brand-600 text-white" : "border-border-default text-text-secondary hover:border-brand-400")}
            >
              {candidate.id === "autre" ? "Autre" : candidate.label}
            </Link>
          ))}
        </nav>
      </div>

      <section className="space-y-4">
        <h2 className="text-[20px] font-semibold text-text-primary">Étape 1 — Installer PharmaBoost sur un comptoir</h2>
        <p className="text-[14px] leading-6 text-text-secondary">Pour chaque ordinateur Windows du comptoir, un par un : « Comptoir 1 », « Comptoir 2 »… {methods.connect.note}</p>
        <GuideStep n={1} title="Téléchargez l'installateur" illustration={<DownloadIllustration />}>
          <p className="text-[14.5px] leading-6 text-text-primary">Dans Ma connexion, étape 1, « Envoyer un lien d&apos;installation ». Copiez le lien, ou recevez-le par e-mail, puis ouvrez-le sur l&apos;ordinateur de la douchette et cliquez « Télécharger l&apos;installateur ».</p>
        </GuideStep>
        <GuideStep n={2} title="Double-cliquez le fichier" illustration={<InstallerIllustration />}>
          <p className="text-[14.5px] leading-6 text-text-primary">Suivez l&apos;assistant d&apos;installation : une minute, Internet requis, aucun mot de passe administrateur et rien à taper.</p>
        </GuideStep>
        <GuideStep n={3} title="Cherchez le point vert près de l'horloge" illustration={<TrayIllustration />}>
          <p className="text-[14.5px] leading-6 text-text-primary">L&apos;icône PharmaBoost apparaît avec un point vert quand le poste est relié. Dans Ma connexion, le poste s&apos;affiche « en ligne ».</p>
        </GuideStep>
      </section>

      <section className="space-y-4">
        <h2 className="text-[20px] font-semibold text-text-primary">Étape 2 — Envoyer mon stock</h2>
        <GuideStep n={1} title={`Sortez le stock de ${guide.name}`} illustration={<MenuIllustration items={MENU_PATH[lgo.id] ?? GENERIC_MENU_PATH} />}>
          <ul className="space-y-1.5 text-[14.5px] leading-6 text-text-primary">
            {guide.menuSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <p className="text-[14px] leading-6 font-medium text-text-primary">Prenez tout votre stock, pas seulement les nouveautés. {ZERO_ABSENT_NOTICE}</p>
          {guide.notice && <p className="text-[13px] leading-5 text-text-secondary">{guide.notice}</p>}
        </GuideStep>
        <GuideStep n={2} title="Envoyez le fichier à PharmaBoost" illustration={<FileIllustration />}>
          <p className="text-[14.5px] leading-6 text-text-primary">Dans Ma connexion, étape 2, cliquez « Envoyer mon stock » et choisissez le fichier. Le nom du fichier n&apos;a pas d&apos;importance.</p>
          <Button asChild size="sm"><Link href="/stock/mise-a-jour">Choisir mon fichier</Link></Button>
        </GuideStep>
        <GuideStep n={3} title="Le stock se met à jour" illustration={<StockOkIllustration />}>
          <p className="text-[14.5px] leading-6 text-text-primary">PharmaBoost lit le fichier en une minute. Ma connexion affiche « Stock à jour » avec l&apos;heure de réception et le nombre de références.</p>
        </GuideStep>
      </section>

      <section className="space-y-3">
        <h2 className="text-[20px] font-semibold text-text-primary">Étape 3 — Connecter mon robot</h2>
        <div className="space-y-2 rounded-2xl border border-border-subtle bg-surface-card p-5 text-[14.5px] leading-6 text-text-primary">
          <p><strong>PharmaBoost ne se connecte pas encore à un robot.</strong> L&apos;étape 3 vous laisse désigner le vôtre (fabricant, modèle) pour préparer l&apos;intégration.</p>
          <p className="text-[14px] text-text-secondary">Votre logiciel et votre robot sont deux sources différentes : le logiciel donne le stock, le robot donnera un jour les produits qu&apos;on lui demande de sortir. Aujourd&apos;hui, ce sont les bips de la douchette qui affichent les conseils au comptoir.</p>
          <p className="text-[14px] text-text-secondary">Pour aider à préparer l&apos;intégration, un diagnostic en lecture seule peut être lancé sur l&apos;ordinateur du robot : il écrit un rapport sur le Bureau, n&apos;envoie rien, et vous le relisez avant de nous le transmettre.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[20px] font-semibold text-text-primary">Tester ma connexion (diagnostic technique)</h2>
        <GuideStep n={1} title="Ouvrez « Diagnostic technique », puis « Tester ma connexion »" illustration={<StockOkIllustration />}>
          <p className="text-[14.5px] leading-6 text-text-primary">PharmaBoost contrôle le logiciel choisi, chaque appareil installé, le stock reçu (date, références, lignes illisibles) et les ventes. Chaque contrôle dit ce qui a été constaté et, si ce n&apos;est pas bon, quoi faire.</p>
          <p className="text-[13.5px] leading-5 text-text-secondary">Le test lit ce que vos programmes ont envoyé à PharmaBoost ; il ne se connecte pas à vos ordinateurs. Pour prouver le suivi des ventes, faites l&apos;« essai du bip » : bipez une boîte, PharmaBoost dit s&apos;il l&apos;a reçue.</p>
        </GuideStep>
      </section>

      <section className="space-y-3">
        <h2 className="text-[20px] font-semibold text-text-primary">Si ça bloque</h2>
        <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-card">
          {TROUBLES.map(([question, answer]) => (
            <details key={question} className="group px-5 py-3">
              <summary className="cursor-pointer list-none text-[14.5px] font-medium text-text-primary">{question}</summary>
              <p className="mt-2 text-[14px] leading-6 text-text-secondary">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function GuideStep({ n, title, illustration, children }: { n: number; title: string; illustration: ReactNode; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:flex-row sm:items-center">
      <div className="shrink-0">{illustration}</div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex items-center gap-2.5 text-[17px] font-semibold text-text-primary">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[13px] text-white">{n}</span>
          {title}
        </p>
        {children}
      </div>
    </article>
  );
}
