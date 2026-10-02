"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Barcode, Building2, Check, ChevronDown, Circle, Copy, FileSpreadsheet, FolderSync, LifeBuoy, Loader2, Users } from "lucide-react";
import { createPostInstallLinkAction } from "@/server/actions/stock-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InstallationState } from "@/app/api/installation/etat/route";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

type Lgo = { id: string; label: string; exportHint: string; exportSteps: string[] } | null;

const CONTACT = PUBLIC_CONTACT_EMAIL;

/**
 * Le guide de mise en service. Cinq étapes, chacune avec : quoi faire, ce
 * qu'on doit voir, et « si ça bloque ». L'état (stock importé, poste en
 * ligne…) se relit toutes les cinq secondes : le titulaire voit son poste
 * apparaître pendant qu'il l'installe.
 */
export function InstallationGuide({ initial, firstName, pharmacyName, lgo }: { initial: InstallationState; firstName: string; pharmacyName: string; lgo: Lgo }) {
  const [state, setState] = useState(initial);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/installation/etat", { cache: "no-store" });
        if (response.ok && active) setState((await response.json()) as InstallationState);
      } catch {
        // Une coupure réseau n'a rien à afficher : la prochaine lecture reprendra.
      }
    };
    const id = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const postsPaired = state.posts.filter((post) => post.paired);
  const exportSet = state.posts.some((post) => post.exportPath);
  const steps = [
    { key: "officine", label: "Votre officine", done: state.pharmacyDone, icon: Building2 },
    { key: "stock", label: "Votre stock", done: state.stockDone, icon: FileSpreadsheet },
    { key: "poste", label: "Le poste de comptoir", done: postsPaired.length > 0, icon: Barcode },
    { key: "export", label: "Le stock à jour tout seul", done: exportSet, icon: FolderSync },
    { key: "equipe", label: "Votre équipe", done: state.teamCount > 1, icon: Users },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const current = steps.find((step) => !step.done)?.key ?? "equipe";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">Mise en service</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.015em] text-text-primary">Bonjour {firstName}, mettons {pharmacyName} en service.</h1>
        <p className="mt-1 text-[14px] text-text-secondary">Cinq étapes, à votre rythme, sans toucher au serveur de l&apos;officine. Cette page se met à jour toute seule : quand une étape est faite, elle se coche.</p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.key}>
            <a href={`#${step.key}`} className={cn("flex h-full flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors", step.key === current ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "border-border-subtle bg-surface-card hover:border-border-strong")}>
              <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", step.done ? "bg-success-600 text-white" : "bg-surface-sunken text-text-secondary")}>{step.done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}</span>
              <span className="text-[12.5px] leading-4 font-medium text-text-primary">{step.label}</span>
            </a>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-text-secondary">{doneCount === 5 ? "Tout est en place. PharmaBoost travaille avec vous au comptoir." : `${doneCount} étape${doneCount > 1 ? "s" : ""} sur 5 faite${doneCount > 1 ? "s" : ""}.`}</p>

      {/* ---------------------------------------------------------- 1 */}
      <Step id="officine" number={1} title="Votre officine" done={state.pharmacyDone} open={current === "officine"} icon={Building2}>
        <Do>
          <li>Ouvrez <Link href="/bienvenue?etape=1" className="link">Paramètres de l&apos;officine</Link> et vérifiez le nom, l&apos;adresse, le téléphone et la couleur.</li>
          <li>Ces informations figurent sur le plan remis au patient : c&apos;est votre officine qu&apos;il voit, pas un logiciel.</li>
        </Do>
        <See>L&apos;étape se coche dès que l&apos;adresse et la ville sont renseignées.</See>
      </Step>

      {/* ---------------------------------------------------------- 2 */}
      <Step id="stock" number={2} title="Votre stock" done={state.stockDone} open={current === "stock"} icon={FileSpreadsheet}>
        <p className="text-[13.5px] leading-6 text-text-secondary">Sans votre stock, le comptoir ne peut proposer que ce qu&apos;il ne connaît pas. Une fois importé, PharmaBoost ne propose que ce qui est réellement en rayon, avec vos prix.</p>
        {lgo ? (
          <>
            <p className="mt-3 text-[13.5px] font-semibold text-text-primary">Dans {lgo.label}, pour sortir le stock :</p>
            <p className="mt-1 text-[13px] leading-5 text-text-secondary">{lgo.exportHint}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] leading-6 text-text-primary">
              {lgo.exportSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </>
        ) : (
          <Do>
            <li>Dans votre logiciel de gestion, faites une édition ou un export de l&apos;inventaire : PDF, Excel ou CSV, peu importe. Tout le stock, sans filtre.</li>
            <li>Enregistrez le fichier sur l&apos;ordinateur, par exemple sur le Bureau.</li>
          </Do>
        )}
        <Do title="Puis, la première fois, déposez-le ici :">
          <li>Ouvrez <Link href="/stock" className="link">Stock</Link>, cliquez « Importer », choisissez le fichier. PharmaBoost reconnaît les colonnes et vous montre ce qu&apos;il a compris avant d&apos;écrire quoi que ce soit.</li>
        </Do>
        <See>{state.stockDone && state.stockSyncedAt ? `Stock importé le ${formatDateTime(state.stockSyncedAt)}.` : "En haut de la page Stock : « Stock importé » avec l'heure. Et cette étape se coche."}</See>
        <Trouble items={[
          ["Le fichier est refusé, « colonnes non reconnues »", "Ouvrez-le : il doit contenir au moins un code (CIP ou EAN), une désignation et une quantité. Si votre logiciel propose plusieurs modèles d'édition, prenez le plus complet, ou envoyez-nous le fichier : on vous dit lequel."],
          ["Des produits sont « à classer »", "C'est normal pour la parapharmacie : PharmaBoost les range dans les bonnes familles en arrière-plan. Vous pouvez travailler pendant ce temps."],
          ["Je ne trouve pas l'édition d'inventaire dans mon logiciel", `Écrivez-nous à ${CONTACT} en indiquant votre logiciel : nous vous envoyons le chemin exact, écran par écran.`],
        ]} />
      </Step>

      {/* ---------------------------------------------------------- 3 */}
      <Step id="poste" number={3} title="Le poste de comptoir" done={postsPaired.length > 0} open={current === "poste"} icon={Barcode}>
        <p className="text-[13.5px] leading-6 text-text-secondary">Un petit programme sur l&apos;ordinateur où la douchette est branchée. Il écoute la douchette, et rien d&apos;autre : chaque boîte bipée dans votre logiciel ouvre le conseil sur l&apos;écran. Deux minutes par poste, à refaire sur chaque poste de comptoir.</p>

        <Do title="A. Sur le poste de comptoir, ouvrez PowerShell (la fenêtre où l'on tape une commande) :">
          <li><strong>Le plus simple :</strong> clic droit sur le bouton Windows, en bas à gauche de l&apos;écran, puis « Terminal » ou « Windows PowerShell » dans la liste.</li>
          <li><strong>Sinon :</strong> appuyez sur la touche Windows du clavier, tapez <code>powershell</code>, puis Entrée.</li>
          <li>Une fenêtre bleue ou noire s&apos;ouvre, avec un curseur qui clignote. C&apos;est là qu&apos;on colle la ligne. Pas besoin d&apos;être administrateur.</li>
        </Do>

        <InstallLine />

        <Do title="C. Collez la ligne dans la fenêtre PowerShell, puis Entrée :">
          <li>Clic droit dans la fenêtre colle le texte (ou Ctrl + V). Appuyez sur Entrée.</li>
          <li>Laissez faire : le programme se télécharge, Node.js s&apos;installe s&apos;il manque (une minute), puis le poste se relie.</li>
        </Do>
        <See>Dans la fenêtre : « Le poste est relié ». Et ci-dessous, dans la minute, le poste apparaît « en ligne ». Passez alors une boîte à la douchette dans votre logiciel : elle arrive dans PharmaBoost, écran Nouvelle vente.</See>

        <PostsLive posts={state.posts} />

        <Trouble items={[
          ["Rouge : « l'exécution de scripts est désactivée sur ce système »", "La ligne commence par « powershell -ExecutionPolicy Bypass » justement pour passer outre. Vérifiez qu'elle a été collée en entier, du premier au dernier caractère, puis Entrée."],
          ["Une fenêtre « Windows a protégé votre ordinateur » ou un antivirus", "Cliquez « Informations complémentaires » puis « Exécuter quand même ». Le programme est PharmaBoost Connect, téléchargé depuis pharmaboost.app ; si votre antivirus l'arrête, ajoutez une exception sur le dossier PharmaBoost dans AppData."],
          ["Le poste n'apparaît pas au bout de deux minutes", "Vérifiez que l'ordinateur a Internet (ouvrez pharmaboost.app dans un navigateur). Puis rejouez la ligne : si le lien a déjà servi, générez-en un nouveau, chaque lien ne vaut que pour un poste."],
          ["« Ce lien d'installation n'est plus valable »", "Le lien a expiré (sept jours) ou a déjà relié un poste. Cliquez « Générer ma ligne » pour en obtenir un nouveau."],
          ["La boîte bipée n'apparaît pas dans PharmaBoost", "Le programme écoute la douchette à partir de la prochaine ouverture de session Windows : fermez la session et rouvrez-la, ou redémarrez le poste. Si le poste est « en ligne » mais rien n'arrive, bipez une boîte de médicament (code CIP) : la parapharmacie se reconnaît ensuite."],
          ["Je n'y arrive pas", `Écrivez à ${CONTACT} avec une photo de l'écran : on vous rappelle et on le fait avec vous, à distance.`],
        ]} />
      </Step>

      {/* ---------------------------------------------------------- 4 */}
      <Step id="export" number={4} title="Le stock à jour tout seul" done={exportSet} open={current === "export"} icon={FolderSync}>
        <p className="text-[13.5px] leading-6 text-text-secondary">Les ventes se déduisent à chaque bip. Pour que les livraisons soient comptées aussi, le poste relit l&apos;inventaire de votre logiciel chaque fois qu&apos;un nouveau fichier apparaît dans un dossier. Il faut un dossier que le poste et votre logiciel voient tous les deux.</p>
        <Do title="A. Trouvez un dossier partagé :">
          <li>Sur le poste de comptoir, ouvrez l&apos;Explorateur de fichiers (icône dossier jaune en bas, ou touche Windows + E).</li>
          <li>Dans la colonne de gauche, tout en bas, cliquez « Réseau ». Double-cliquez sur le serveur ou le NAS de l&apos;officine, puis sur un dossier où vous pouvez créer un sous-dossier. Créez-y <code>PharmaBoost</code>, puis <code>Export</code> dedans.</li>
          <li>Cliquez dans la barre d&apos;adresse en haut : elle affiche une adresse du type <code>\\SERVEUR\Partage\PharmaBoost\Export</code>. Copiez-la.</li>
        </Do>
        <Do title="B. Donnez cette adresse à PharmaBoost :">
          <li>Ouvrez <Link href="/stock/connexion" className="link">Stock → Connecter mon logiciel</Link>. Sous le poste relié, collez l&apos;adresse dans « Dossier d&apos;export du stock », puis « Enregistrer ».</li>
        </Do>
        <Do title="C. Faites l'édition d'inventaire dans ce dossier :">
          {lgo ? lgo.exportSteps.map((step) => <li key={step}>{step}</li>) : <li>Dans votre logiciel, faites l&apos;export de l&apos;inventaire et enregistrez-le dans ce dossier, le nom du fichier n&apos;a pas d&apos;importance.</li>}
          <li>Dès que le fichier est dans le dossier, PharmaBoost le relit dans la minute. « Mettre à jour le stock maintenant » force la relecture.</li>
        </Do>
        <See>Sous le poste : « Stock relu il y a quelques secondes depuis ce poste ». Si vous lisez « Dernier essai : … », c&apos;est l&apos;erreur exacte, envoyez-la nous.</See>
        <Trouble items={[
          ["Je ne vois aucun serveur dans « Réseau »", "Cliquez la bande jaune « Le partage de fichiers est désactivé » en haut de l'Explorateur, activez la découverte, puis F5. Sinon tapez directement \\\\ suivi du nom du serveur dans la barre d'adresse."],
          ["« Accès refusé » quand je crée le dossier", "Ce dossier est en lecture seule. Essayez un autre dossier partagé, ou un NAS. Si tout refuse, la personne qui gère l'informatique crée un partage en écriture : dix minutes."],
          ["Mon logiciel ne voit pas le dossier à l'enregistrement", "Dans la fenêtre d'enregistrement, tapez l'adresse complète dans « Nom du fichier » puis Entrée : la fenêtre se place dans le dossier."],
          ["Faut-il le refaire tous les jours ?", "Les ventes sont déduites en direct, sans rien faire. L'inventaire sert aux livraisons : refaites-le après les grosses réceptions, ou chaque matin. Si votre logiciel sait programmer cette édition la nuit, demandez-le à son assistance : alors plus personne n'y touche."],
        ]} />
      </Step>

      {/* ---------------------------------------------------------- 5 */}
      <Step id="equipe" number={5} title="Votre équipe" done={state.teamCount > 1} open={current === "equipe"} icon={Users}>
        <Do>
          <li>Ouvrez <Link href="/equipe" className="link">Équipe</Link> et ajoutez chaque collaborateur : prénom, nom, e-mail, rôle. Chacun reçoit son lien pour choisir son mot de passe.</li>
          <li>Ensuite, dans <Link href="/performance" className="link">Performance</Link>, vous voyez ce que chacun propose, accepte et vend.</li>
        </Do>
        <See>{state.teamCount > 1 ? `${state.teamCount} comptes actifs.` : "Un compte de plus que le vôtre, et l'étape se coche."}</See>
      </Step>

      <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card px-5 py-4">
        <LifeBuoy className="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-400" />
        <p className="text-[13.5px] leading-6 text-text-secondary">
          Bloqué à une étape ? Écrivez à <a href={`mailto:${CONTACT}`} className="link">{CONTACT}</a> en disant laquelle, avec une photo de l&apos;écran si possible. Nous vous rappelons et nous le faisons avec vous, à distance.
        </p>
      </div>
    </div>
  );
}

/** La ligne d'installation : générée à la demande, copiée en un clic. */
function InstallLine() {
  const [link, setLink] = useState<{ command: string; expiresAt: string } | null>(null);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const { push } = useToast();
  const generate = () =>
    start(async () => {
      const result = await createPostInstallLinkAction({ label: label || null });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setLink({ command: result.data.command, expiresAt: result.data.expiresAt });
    });
  return (
    <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
      <p className="text-[13.5px] font-semibold text-text-primary">B. Générez votre ligne, puis copiez-la :</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[12.5px] text-text-secondary">
          Nom du poste (facultatif)
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Caisse 1" className="mt-1 w-44" />
        </label>
        <Button loading={pending} onClick={generate}>{link ? "Générer une autre ligne" : "Générer ma ligne"}</Button>
      </div>
      {link && (
        <div className="mt-3 space-y-2">
          <pre className="overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[12.5px] text-white">{link.command}</pre>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              leadingIcon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              onClick={async () => {
                await navigator.clipboard.writeText(link.command).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }}
            >
              {copied ? "Copiée" : "Copier la ligne"}
            </Button>
            <span className="text-[12.5px] text-text-secondary">Valable jusqu&apos;au {formatDateTime(new Date(link.expiresAt))}, pour un seul poste. Un autre poste : une autre ligne.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PostsLive({ posts }: { posts: InstallationState["posts"] }) {
  const paired = posts.filter((post) => post.paired);
  return (
    <div className="mt-4 rounded-xl border border-border-subtle bg-surface-card p-4">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold tracking-wide text-text-tertiary uppercase">
        <Loader2 className="size-3.5 animate-spin" /> Vos postes, en direct
      </p>
      {paired.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-text-secondary">Aucun poste relié pour l&apos;instant. Dès que la ligne a tourné, il apparaît ici, sans recharger la page.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {paired.map((post) => (
            <li key={post.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
              {post.alive ? <Check className="size-4 text-success-600" /> : <Circle className="size-4 text-text-tertiary" />}
              <span className="font-medium text-text-primary">{post.label ?? (post.hostname || "Poste")}</span>
              <span className="text-text-secondary">{post.alive ? "en ligne" : "relié, mais muet : le programme ne tourne pas sur ce poste"}{post.version ? ` · programme ${post.version}` : ""}{post.scanCount > 0 ? ` · ${post.scanCount} bip${post.scanCount > 1 ? "s" : ""}${post.lastScanAt ? ` (dernier à ${formatTime(post.lastScanAt)})` : ""}` : " · aucun bip reçu encore"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Step({ id, number, title, done, open, icon: Icon, children }: { id: string; number: number; title: string; done: boolean; open: boolean; icon: typeof Building2; children: ReactNode }) {
  return (
    <details id={id} open={open} className="group scroll-mt-20 rounded-2xl border border-border-subtle bg-surface-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", done ? "bg-success-600 text-white" : "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300")}>{done ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-text-primary">{number}. {title}</span>
          <span className="block text-[12.5px] text-text-tertiary">{done ? "Fait" : "À faire"}</span>
        </span>
        <ChevronDown className="size-4 text-text-tertiary transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border-subtle px-5 py-4">{children}</div>
    </details>
  );
}

function Do({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <p className="text-[13.5px] font-semibold text-text-primary">{title}</p>}
      <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-6 text-text-primary [&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12.5px] [&_.link]:font-medium [&_.link]:text-brand-700 [&_.link]:underline [&_.link]:underline-offset-2 dark:[&_.link]:text-brand-400">{children}</ol>
    </div>
  );
}

function See({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-success-50 px-3.5 py-2.5 text-[13px] leading-5 text-success-900 dark:bg-success-950/30 dark:text-success-200"><strong>Ce que vous devez voir :</strong> {children}</p>
  );
}

function Trouble({ items }: { items: [string, string][] }) {
  return (
    <details className="rounded-lg border border-warning-300 bg-warning-50/50 dark:border-warning-800 dark:bg-warning-950/20">
      <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[13.5px] font-semibold text-text-primary">Si ça bloque</summary>
      <dl className="space-y-3 border-t border-warning-200 px-3.5 py-3 dark:border-warning-800">
        {items.map(([q, a]) => (
          <div key={q}>
            <dt className="text-[13px] font-semibold text-text-primary">{q}</dt>
            <dd className="mt-0.5 text-[13px] leading-5 text-text-secondary">{a}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
