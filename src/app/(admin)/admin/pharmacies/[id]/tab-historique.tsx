import { loadPharmacyTimeline, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { AdminSection } from "@/components/admin/page-header";
import { FilterChips } from "@/components/admin/filters";
import { Timeline } from "@/components/admin/timeline";
import { TIMELINE_KIND_LABELS, type TimelineKind } from "@/core/admin/timeline";
import { TIMELINE_FILTER_KINDS } from "@/core/admin/clients";

/**
 * La frise complète de l'officine : dossier, journal d'audit, Stripe,
 * contrats, e-mails, notes, résiliation, tarif, jalons d'abonnement.
 */
export async function HistoryTab({ base, kind, now }: { base: Pharmacy360; kind: TimelineKind | null; now: Date }) {
  const entries = await loadPharmacyTimeline(base, { kinds: kind ? [kind] : null, limit: 300, now });
  return (
    <AdminSection
      title="Historique"
      description="Tous les faits datés de l'officine, du plus récent au plus ancien. Les 300 derniers sont affichés."
    >
      <div className="space-y-5">
        <FilterChips
          label="Filtrer l'historique"
          basePath={`/admin/pharmacies/${base.pharmacy.id}`}
          param="type"
          current={kind}
          keep={{ onglet: "historique" }}
          options={[{ value: null, label: "Tout" }, ...TIMELINE_FILTER_KINDS.map((k) => ({ value: k, label: TIMELINE_KIND_LABELS[k] }))]}
        />
        <Timeline entries={entries} emptyText={kind ? `Aucun fait de type « ${TIMELINE_KIND_LABELS[kind]} » pour cette officine.` : "Rien d'enregistré pour l'instant."} />
      </div>
    </AdminSection>
  );
}
