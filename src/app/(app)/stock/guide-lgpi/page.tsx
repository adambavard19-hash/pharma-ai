import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck, Upload } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { CodeScreen, ConfirmScreen, CriteriaScreen, MenuScreen, PreviewScreen, SaveScreen, UploadScreen } from "./lgpi-screens";

export const metadata: Metadata = { title: "Comment envoyer mon inventaire LGPI" };

/**
 * Le guide pas à pas pour sortir l'inventaire de LGPI et l'envoyer à PharmaBoost, dans l'ordre exact où le fondateur
 * l'a fait au comptoir (23 oct. 2026) : B. Gestion Stock → S. Édition de l'inventaire, le code, F5 Imprimer, « Oui » à
 * « aucun critère n'a été saisi », F9 Enregistrer, puis Mon stock. Ce que doit contenir le fichier reprend ce que l'import
 * lit vraiment (core/stock-import/lgpi-inventory.ts).
 */

const CONTENTS: [string, string][] = [
  ["Tout le stock", "L'ensemble des produits gérés en stock, pas seulement les nouveautés : un produit absent du fichier passe à 0 dans PharmaBoost. C'est pour cela qu'on ne remplit aucun critère."],
  ["Le code produit", "Le code du code-barres de la boîte (CIP 13 ou EAN), colonne « Code Produit »."],
  ["La désignation", "Le nom du produit, colonne « Désignation »."],
  ["La quantité en stock", "Le nombre de boîtes, colonne « Qté boîte »."],
  ["Le prix et la TVA", "Colonnes « Prix » et « Taux TVA ». Le prix est celui du « Prix de référence » choisi : « PAMP Net » donne votre prix d'achat, « Prix de vente » votre prix TTC."],
];

export default async function LgpiInventoryGuidePage() {
  await requirePermission(PERMISSIONS.PRODUCT_IMPORT);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-20">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Mon stock</Link>
      </Button>

      <PageHeader
        title="Comment envoyer mon inventaire LGPI"
        description="Cinq minutes, une fois de temps en temps : PharmaBoost ne conseille que ce que vous avez en rayon. L'édition d'inventaire ne modifie rien dans LGPI."
      />

      <ol className="space-y-4">
        <Step n={1} title="Ouvrez « Édition de l'inventaire »" screen={<MenuScreen />}>
          Dans LGPI, menu <strong>B. Gestion Stock</strong>, puis <strong>S. Édition de l&apos;inventaire</strong>.
          <Tip>Plus rapide : tapez « inventaire » dans la recherche en haut à droite, puis cliquez « B - S. Édition de l&apos;inventaire ».</Tip>
        </Step>
        <Step n={2} title="Entrez votre code" screen={<CodeScreen />}>
          LGPI demande votre code opérateur, comme d&apos;habitude. Tapez-le, puis <strong>Entrée</strong>.
        </Step>
        <Step n={3} title="Appuyez sur F5 « Imprimer »" screen={<CriteriaScreen />}>
          L&apos;écran « Saisie des critères d&apos;édition de l&apos;inventaire » s&apos;ouvre. <strong>Ne remplissez rien</strong> : laissez « Détaillée » et le prix de référence « PAMP Net ». Appuyez sur <strong>F5</strong> (Imprimer).
        </Step>
        <Step n={4} title="Répondez « Oui »" screen={<ConfirmScreen />}>
          LGPI demande : « Attention ! Aucun critère n&apos;a été saisi. Voulez-vous éditer la totalité des produits gérés en stock ? » Cliquez <strong>Oui</strong> : c&apos;est justement tout le stock qu&apos;il faut.
        </Step>
        <Step n={5} title="Attendez le chargement, puis F9 « Enregistrer »" screen={<PreviewScreen />}>
          Le stock se charge dans « Aperçu de l&apos;inventaire » (une centaine de pages, quelques secondes). Appuyez sur <strong>F9</strong> (Enregistrer).
        </Step>
        <Step n={6} title="Enregistrez le fichier où vous voulez" screen={<SaveScreen />}>
          Choisissez un dossier facile à retrouver, le <strong>Bureau</strong> par exemple, puis <strong>Enregistrer</strong>. Le nom du fichier n&apos;a pas d&apos;importance.
        </Step>
        <Step n={7} title="Chargez-le dans PharmaBoost" screen={<UploadScreen />}>
          Dans PharmaBoost : <strong>Stock</strong> → <strong>Mettre à jour mon stock</strong> → <strong>Choisir mes fichiers</strong>, et prenez le fichier enregistré. PharmaBoost vous montre ce qui va changer avant que vous confirmiez.
          <div className="pt-1">
            <Button asChild size="sm" leadingIcon={<Upload className="size-4" />}>
              <Link href="/stock/mise-a-jour">Mettre à jour mon stock</Link>
            </Button>
          </div>
        </Step>
      </ol>

      <section aria-labelledby="contenu-inventaire" className="rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-6">
        <h2 id="contenu-inventaire" className="text-[19px] leading-7 font-semibold text-text-primary">Ce que doit contenir l&apos;inventaire</h2>
        <p className="mt-1 text-[14px] leading-5 text-text-secondary">L&apos;édition détaillée de LGPI contient déjà tout cela, avec ses colonnes par défaut : vous n&apos;avez rien à régler.</p>
        <ul className="mt-4 space-y-3">
          {CONTENTS.map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-600" aria-hidden="true" />
              <p className="text-[14.5px] leading-6 text-text-primary">
                <strong>{title}.</strong> <span className="text-text-secondary">{text}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl bg-brand-50 p-3.5 text-[14px] leading-6 text-text-primary dark:bg-brand-950/30">
          <strong>Pour que PharmaBoost connaisse votre marge (conseillé) :</strong> refaites les étapes 3 à 6 en choisissant <strong>« Prix de vente »</strong> dans « Prix de référence », puis envoyez les deux fichiers ensemble à l&apos;étape 7. L&apos;un donne le prix d&apos;achat, l&apos;autre le prix de vente.
        </div>
        <p className="mt-3 flex items-start gap-2 text-[13.5px] leading-5 text-text-secondary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
          Le fichier est au format PDF, tel que LGPI l&apos;enregistre. Aucune validation d&apos;inventaire n&apos;est nécessaire : rien n&apos;est modifié dans LGPI.
        </p>
      </section>

      <p className="text-center text-[13.5px] text-text-tertiary">
        Bloqué à une étape ? Écrivez à {PUBLIC_CONTACT_EMAIL} avec une photo de l&apos;écran : on le fait avec vous, à distance.
      </p>
    </div>
  );
}

function Step({ n, title, screen, children }: { n: number; title: string; screen: ReactNode; children: ReactNode }) {
  return (
    <li className="grid gap-4 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center sm:p-5">
      <div className="min-w-0 space-y-2">
        <p className="flex items-center gap-2.5 text-[17px] leading-6 font-semibold text-text-primary">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[13px] text-white">{n}</span>
          {title}
        </p>
        <div className="space-y-2 text-[14.5px] leading-6 text-text-secondary">{children}</div>
      </div>
      <div className="min-w-0">{screen}</div>
    </li>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[13.5px] leading-5 text-text-secondary">{children}</p>;
}
