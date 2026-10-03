import type { ReactNode } from "react";
import { BellRing, CalendarClock, CreditCard, FileSignature, Hourglass, MessageCircleOff, MoonStar, PenLine, Send, Unplug, UserMinus } from "lucide-react";
import { AttentionCard } from "@/components/admin/kpis";
import { orderAttention, type AttentionTone } from "@/core/admin/metrics";
import type { AttentionCounts } from "@/server/services/admin/cockpit";
import { COCKPIT_LINKS } from "./links";

export type AttentionCardSpec = { key: string; count: number; title: string; description: string; href: string; tone: AttentionTone; icon: ReactNode };

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

const ICON = "size-3.5";

/**
 * Les cartes « À traiter », dans un ordre fixe (rouge, puis orange) : une
 * carte ne change jamais de place, l'œil la retrouve. Chacune ouvre la liste
 * filtrée correspondante, avec le même critère que le chiffre affiché.
 */
export function attentionCards(counts: AttentionCounts): AttentionCardSpec[] {
  const technical = counts.technical;
  const technicalParts = [
    technical.connectors > 0 ? plural(technical.connectors, "connecteur à vérifier", "connecteurs à vérifier") : null,
    technical.posts > 0 ? plural(technical.posts, "poste en erreur", "postes en erreur") : null,
    technical.incidents > 0 ? plural(technical.incidents, "incident ouvert", "incidents ouverts") : null,
  ].filter(Boolean);

  return orderAttention<AttentionCardSpec>([
    { key: "paiements", count: counts.paymentsLate, tone: "danger", title: "Paiements en échec", description: "Abonnements en retard ou impayés.", href: "/admin/impayes", icon: <CreditCard className={ICON} /> },
    { key: "resiliations", count: counts.cancellationsOpen, tone: "danger", title: "Demandes de résiliation", description: "Reçues, en traitement ou confirmées.", href: "/admin/resiliations?statut=ouvertes", icon: <UserMinus className={ICON} /> },
    { key: "contresigner", count: counts.contractsToCountersign, tone: "warning", title: "Contrats à contresigner", description: "Une signature reçue, la seconde attendue.", href: COCKPIT_LINKS.contractsToCountersign, icon: <PenLine className={ICON} /> },
    { key: "signer", count: counts.contractsToSign, tone: "warning", title: "Contrats à signer", description: "Envoyés au titulaire, pas encore signés.", href: COCKPIT_LINKS.contractsToSign, icon: <FileSignature className={ICON} /> },
    { key: "relancer", count: counts.contractsToRemind, tone: "warning", title: "Contrats à relancer", description: "Signalés après relances, ou lien qui expire sous 7 jours.", href: COCKPIT_LINKS.contractsToRemind, icon: <BellRing className={ICON} /> },
    { key: "essais", count: counts.trialsEnding, tone: "warning", title: "Essais qui se terminent", description: "Fin d'essai dans les 7 prochains jours.", href: "/admin/abonnements?filtre=fin-essai", icon: <Hourglass className={ICON} /> },
    { key: "relances", count: counts.followUpsLate, tone: "warning", title: "Relances commerciales en retard", description: "Prochaines actions et tâches dépassées.", href: "/admin/relances-commerciales?vue=retard", icon: <CalendarClock className={ICON} /> },
    { key: "sans-reponse", count: counts.prospectsNoReply, tone: "warning", title: "Prospects sans réponse", description: "Dossiers ouverts sans contact depuis 14 jours.", href: "/admin/prospects?filtre=sans-reponse", icon: <MessageCircleOff className={ICON} /> },
    { key: "technique", count: technical.total, tone: "warning", title: "Alertes techniques", description: technicalParts.length > 0 ? `${technicalParts.join(" · ")}.` : "Connecteurs, postes de comptoir, incidents.", href: COCKPIT_LINKS.technical, icon: <Unplug className={ICON} /> },
    { key: "inactives", count: counts.inactivePharmacies, tone: "warning", title: "Officines inactives", description: "Aucune connexion depuis 14 jours.", href: "/admin/activite?filtre=inactives", icon: <MoonStar className={ICON} /> },
    { key: "invitations", count: counts.invitationsPending, tone: "warning", title: "Invitations en attente", description: "Titulaires invités, inscription pas encore terminée.", href: "/admin/acces?filtre=invitations", icon: <Send className={ICON} /> },
  ]);
}

export function AttentionBlock({ cards }: { cards: AttentionCardSpec[] }) {
  const active = cards.filter((card) => card.count > 0).length;
  return (
    <section aria-labelledby="cockpit-a-traiter" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="cockpit-a-traiter" className="text-[15px] leading-6 font-semibold text-text-primary">
            À traiter
          </h2>
          <p className="text-[13px] leading-5 text-text-secondary">Chaque carte ouvre la liste filtrée. Officines de démonstration exclues.</p>
        </div>
        <p className="text-[12.5px] text-text-tertiary tabular-nums">
          {active === 0 ? "Tout est à jour" : `${plural(active, "sujet ouvert", "sujets ouverts")} sur ${cards.length}`}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2">
        {cards.map((card) => (
          <AttentionCard key={card.key} count={card.count} title={card.title} description={card.description} href={card.href} tone={card.tone} icon={card.icon} />
        ))}
      </div>
    </section>
  );
}
