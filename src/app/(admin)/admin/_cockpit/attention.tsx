import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, CheckCircle2, CreditCard, FileSignature, Hourglass, Inbox, LifeBuoy, MessageCircleOff, MoonStar, PenLine, Send, Unplug, UserMinus } from "lucide-react";
import { orderAttention, type AttentionTone } from "@/core/admin/metrics";
import type { AttentionCounts } from "@/server/services/admin/cockpit";
import { cn } from "@/lib/utils";
import { COCKPIT_LINKS } from "./links";

export type AttentionCardSpec = { key: string; count: number; title: string; description: string; href: string; tone: AttentionTone; icon: ReactNode };

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

const ICON = "size-4";

/** Ce que la console sait en dehors du cockpit : des files qui attendent une réponse de l'équipe. */
export type InboxCounts = { supportToAnswer: number; stockToDecide: number };

/**
 * Tous les sujets surveillés, dans un ordre fixe (rouge, puis orange) : un sujet ne change jamais de place, l'œil le retrouve.
 * Chacun ouvre la liste filtrée correspondante, avec le même critère que le chiffre affiché.
 */
export function attentionCards(counts: AttentionCounts, inbox: InboxCounts = { supportToAnswer: 0, stockToDecide: 0 }): AttentionCardSpec[] {
  const technical = counts.technical;
  const technicalParts = [
    technical.connectors > 0 ? plural(technical.connectors, "connecteur à vérifier", "connecteurs à vérifier") : null,
    technical.posts > 0 ? plural(technical.posts, "poste en erreur", "postes en erreur") : null,
    technical.incidents > 0 ? plural(technical.incidents, "incident ouvert", "incidents ouverts") : null,
  ].filter(Boolean);

  return orderAttention<AttentionCardSpec>([
    { key: "paiements", count: counts.paymentsLate, tone: "danger", title: "Paiements en échec", description: "Abonnements en retard ou impayés.", href: "/admin/impayes", icon: <CreditCard className={ICON} /> },
    { key: "resiliations", count: counts.cancellationsOpen, tone: "danger", title: "Demandes de résiliation", description: "Reçues, en traitement ou confirmées.", href: "/admin/resiliations?statut=ouvertes", icon: <UserMinus className={ICON} /> },
    { key: "support", count: inbox.supportToAnswer, tone: "danger", title: "Questions des officines", description: "Une officine attend votre réponse.", href: "/admin/support", icon: <LifeBuoy className={ICON} /> },
    { key: "contresigner", count: counts.contractsToCountersign, tone: "warning", title: "Contrats à contresigner", description: "Une signature reçue, la seconde attendue.", href: COCKPIT_LINKS.contractsToCountersign, icon: <PenLine className={ICON} /> },
    { key: "signer", count: counts.contractsToSign, tone: "warning", title: "Contrats à signer", description: "Envoyés au titulaire, pas encore signés.", href: COCKPIT_LINKS.contractsToSign, icon: <FileSignature className={ICON} /> },
    { key: "relancer", count: counts.contractsToRemind, tone: "warning", title: "Contrats à relancer", description: "Signalés après relances, ou lien qui expire sous 7 jours.", href: COCKPIT_LINKS.contractsToRemind, icon: <BellRing className={ICON} /> },
    { key: "essais", count: counts.trialsEnding, tone: "warning", title: "Essais qui se terminent", description: "Fin d'essai dans les 7 prochains jours.", href: "/admin/abonnements?filtre=fin-essai", icon: <Hourglass className={ICON} /> },
    { key: "relances", count: counts.followUpsLate, tone: "warning", title: "Relances commerciales en retard", description: "Prochaines actions et tâches dépassées.", href: "/admin/relances-commerciales?vue=retard", icon: <CalendarClock className={ICON} /> },
    { key: "sans-reponse", count: counts.prospectsNoReply, tone: "warning", title: "Prospects sans réponse", description: "Dossiers ouverts sans contact depuis 14 jours.", href: "/admin/prospects?filtre=sans-reponse", icon: <MessageCircleOff className={ICON} /> },
    { key: "technique", count: technical.total, tone: "warning", title: "Alertes techniques", description: technicalParts.length > 0 ? `${technicalParts.join(" · ")}.` : "Connecteurs, postes de comptoir, incidents.", href: COCKPIT_LINKS.technical, icon: <Unplug className={ICON} /> },
    { key: "stocks", count: inbox.stockToDecide, tone: "warning", title: "Stocks à trancher", description: "Un fichier de stock attend votre décision ou une relance.", href: "/admin/depots-stock?etat=attention", icon: <Inbox className={ICON} /> },
    { key: "inactives", count: counts.inactivePharmacies, tone: "warning", title: "Officines inactives", description: "Aucune connexion depuis 14 jours.", href: "/admin/activite?filtre=inactives", icon: <MoonStar className={ICON} /> },
    { key: "invitations", count: counts.invitationsPending, tone: "warning", title: "Invitations en attente", description: "Titulaires invités, inscription pas encore terminée.", href: "/admin/acces?filtre=invitations", icon: <Send className={ICON} /> },
  ]);
}

const BUBBLE: Record<AttentionTone, string> = {
  danger: "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500",
  warning: "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500",
  info: "bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-500",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
};

/**
 * « À traiter » : seulement ce qui demande quelque chose. Les sujets à zéro ne prennent aucune place — une ligne discrète dit
 * combien sont surveillés et à jour, et les nomme au clic. Un problème n'est jamais caché : il passe devant.
 */
export function AttentionBlock({ cards }: { cards: AttentionCardSpec[] }) {
  const open = cards.filter((card) => card.count > 0);
  const quiet = cards.filter((card) => card.count === 0);
  return (
    <section aria-labelledby="cockpit-a-traiter" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cockpit-a-traiter" className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">
          À traiter
        </h2>
        {open.length > 0 && <p className="text-[12.5px] text-text-tertiary tabular-nums">{plural(open.length, "sujet ouvert", "sujets ouverts")}</p>}
      </div>

      {open.length === 0 ? (
        <div className="flex items-center gap-3.5 rounded-2xl bg-success-50/70 p-5 dark:bg-success-700/10">
          <CheckCircle2 className="size-6 shrink-0 text-success-700 dark:text-success-500" aria-hidden="true" />
          <div>
            <p className="text-[15px] font-semibold text-text-primary">Tout est à jour</p>
            <p className="text-[13px] text-text-secondary">Aucun paiement en échec, aucune question en attente, aucun contrat bloqué.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-card shadow-xs ring-1 ring-border-subtle">
          {open.map((card) => (
            <li key={card.key}>
              <Link href={card.href} className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken/60 focus-visible:outline-none">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-[16px] font-semibold tabular-nums", BUBBLE[card.tone])}>{card.count}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14.5px] leading-5 font-semibold text-text-primary">
                    <span className="text-text-tertiary" aria-hidden="true">
                      {card.icon}
                    </span>
                    {card.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-5 text-text-secondary">{card.description}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {quiet.length > 0 && open.length > 0 && (
        <details className="group text-[12.5px] text-text-tertiary">
          <summary className="cursor-pointer list-none rounded-md py-1 hover:text-text-secondary">
            <span className="underline-offset-2 group-open:no-underline hover:underline">{plural(quiet.length, "autre sujet surveillé, à jour", "autres sujets surveillés, à jour")}</span>
          </summary>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {quiet.map((card) => (
              <li key={card.key}>
                <Link href={card.href} className="hover:text-text-secondary hover:underline">
                  {card.title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
