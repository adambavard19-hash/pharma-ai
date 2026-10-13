"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import { searchMedicinesAction } from "@/server/actions/admin-central-advice";
import type { MedicineSearch, PreviewPharmacy, TreeSummary } from "@/server/services/advice-hub";
import { FILTER_PARAMS, HUB_FILTERS, countByFilter, matchesFilter, matchesHubQuery, medicineTerms, parseHubQuery, type HubFacets, type HubFilter } from "@/core/admin/advice-hub";
import type { VigilanceView } from "@/core/ai/vigilance-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProposalCard, type RobotProposalCard } from "../suggestions-robot/robot-proposals-board";
import { AssociationItem, NewAssociationForm, NewRuleForm, RuleItem, type AssociationCard, type RuleCard } from "./advice-control";
import { AvoidList } from "./avoid-list";
import { FamiliesPanel } from "./families-panel";
import type { FamilyView } from "@/server/services/trigger-families";
import { MedicinePanel } from "./medicine-panel";

export type HubItem = { facets: HubFacets } & ({ type: "rule"; rule: RuleCard } | { type: "association"; association: AssociationCard } | { type: "robot"; proposal: RobotProposalCard });

/**
 * « Conseils » : tout ce que PharmaBoost propose au comptoir quand un médicament ou un produit est scanné, au même endroit.
 * Des filtres en mots simples, une barre de recherche qui trouve n'importe quel mot (et part d'un médicament), et chaque
 * conseil se valide, se modifie, se supprime — pour toutes les pharmacies.
 */
export function AdviceHub({
  items,
  vigilances,
  categories,
  tags,
  trees,
  pharmacies,
  families,
  initialFilter,
  initialQuery,
}: {
  items: HubItem[];
  vigilances: VigilanceView[];
  categories: { code: string; label: string }[];
  tags: string[];
  trees: TreeSummary[];
  pharmacies: PreviewPharmacy[];
  families: FamilyView[];
  initialFilter: HubFilter;
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<HubFilter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [found, setFound] = useState<{ lookup: string; result: MedicineSearch } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [adding, setAdding] = useState<{ kind: "RULE"; atc: string[]; title: string } | { kind: "ASSOCIATION"; familyId?: string } | null>(null);

  const parsed = useMemo(() => parseHubQuery(query), [query]);
  const lookup = useMemo(() => medicineTerms(parsed).join(" "), [parsed]);
  // Une réponse ne vaut que pour les mots qui l'ont demandée : la saisie changée, elle ne s'affiche plus.
  const medicines = useMemo<MedicineSearch>(() => (found && found.lookup === lookup ? found.result : { codes: {}, medicines: [] }), [found, lookup]);

  // Les mots qui peuvent être des médicaments partent au catalogue national (familles officielles), après une courte pause de frappe.
  useEffect(() => {
    if (!lookup) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setResolving(true);
      try {
        const result = await searchMedicinesAction({ query });
        if (!cancelled && result.ok) setFound({ lookup, result: result.data });
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `query` est lu au moment de l'envoi ; seul un changement des mots cherchables relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);

  const choose = (next: HubFilter) => {
    setFilter(next);
    const search = new URLSearchParams(params.toString());
    search.set("filtre", FILTER_PARAMS[next]);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };

  const counts = useMemo(() => countByFilter(items.map((item) => item.facets)), [items]);
  const cache = useMemo(() => new Map<string, string[]>(), []);
  const shown = useMemo(() => items.filter((item) => matchesFilter(item.facets, filter) && matchesHubQuery(item.facets, parsed, medicines.codes, cache)), [items, filter, parsed, medicines.codes, cache]);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-1.5 py-4">
          <p className="text-[15px] font-semibold text-text-primary">Un conseil, c&apos;est ce que PharmaBoost propose au comptoir quand un médicament ou un produit est scanné.</p>
          <p className="text-[13px] leading-5 text-text-secondary">
            Tout est déjà en ligne dans toutes les pharmacies. Ici, vous <strong>validez</strong> ce que vous cautionnez, vous <strong>modifiez</strong> ce qui doit l&apos;être, vous <strong>supprimez</strong> ce qui ne va pas (on peut le
            rétablir) et vous <strong>ajoutez</strong> les vôtres. Un conseil décrit un besoin : chaque pharmacie le remplit avec un produit de son propre stock.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher un médicament, un produit, un mot… (Doliprane, cétirizine, allergie, 12 ans)"
            leadingIcon={resolving ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            aria-label="Chercher dans les conseils"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAdding({ kind: "RULE", atc: [], title: "" })} leadingIcon={<Plus className="size-4" />}>
            Ajouter un conseil
          </Button>
          <Button variant="outline" onClick={() => setAdding({ kind: "ASSOCIATION" })} leadingIcon={<Plus className="size-4" />}>
            Ajouter un conseil déclenché par un produit
          </Button>
        </div>
      </div>

      <div role="group" aria-label="Filtrer les conseils" className="flex flex-wrap gap-2">
        {HUB_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => choose(item.key)}
            className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", filter === item.key ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-secondary hover:text-text-primary")}
          >
            {item.label} <span className="tabular-nums opacity-80">{item.key === "AVOID" ? vigilances.length : item.key === "FAMILIES" ? families.filter((family) => family.status !== "REMOVED").length : counts[item.key]}</span>
          </button>
        ))}
      </div>

      {medicines.medicines.length > 0 && filter !== "AVOID" && filter !== "FAMILIES" && (
        <MedicinePanel
          medicines={medicines.medicines}
          items={items}
          trees={trees}
          pharmacies={pharmacies}
          onAdd={(atc, title) => setAdding({ kind: "RULE", atc, title })}
        />
      )}

      {filter === "FAMILIES" ? (
        <FamiliesPanel families={families} onAssociate={(familyId) => setAdding({ kind: "ASSOCIATION", familyId })} />
      ) : filter === "AVOID" ? (
        <AvoidList vigilances={vigilances} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === "REVIEW" && !query ? "Tout est relu. Merci." : "Aucun conseil ne correspond"}
            description={query ? "Essayez un autre mot, ou changez de filtre. Chaque mot tapé doit se retrouver dans le conseil." : "Changez de filtre pour voir le reste."}
          />
        </Card>
      ) : (
        <>
          <p className="text-[12.5px] text-text-tertiary">
            {shown.length} conseil{shown.length > 1 ? "s" : ""}
            {query ? ` pour « ${query.trim()} »` : ""}
          </p>
          <ul className="space-y-3">
            {shown.map((item) =>
              item.type === "rule" ? (
                <RuleItem key={item.facets.id} rule={item.rule} choices={{ categories, tags }} />
              ) : item.type === "association" ? (
                <AssociationItem key={item.facets.id} association={item.association} />
              ) : (
                <li key={item.facets.id}>{item.proposal.status === "PENDING" ? <ProposalCard proposal={item.proposal} /> : <DecidedProposal proposal={item.proposal} />}</li>
              ),
            )}
          </ul>
        </>
      )}

      <Modal
        open={adding?.kind === "RULE"}
        onClose={() => setAdding(null)}
        title="Ajouter un conseil"
        description="Quand un médicament de ces familles est dans la vente, PharmaBoost propose un produit qui répond à ce besoin — dans chaque pharmacie, pris dans son propre stock."
        size="lg"
      >
        {adding?.kind === "RULE" && <NewRuleForm categories={categories} tags={tags} initialAtc={adding.atc} initialTitle={adding.title} onDone={() => setAdding(null)} />}
      </Modal>
      <Modal open={adding?.kind === "ASSOCIATION"} onClose={() => setAdding(null)} title="Ajouter un conseil déclenché par un produit" description="Un produit (ou un médicament précis) en appelle un autre. Chaque pharmacie ne le propose que si elle a le produit en stock." size="lg">
        {adding?.kind === "ASSOCIATION" && (
          <NewAssociationForm
            onDone={() => setAdding(null)}
            families={families.filter((family) => family.status !== "REMOVED").map((family) => ({ id: family.id, name: family.name, count: family.products.length }))}
            initialFamilyId={adding.familyId ?? null}
          />
        )}
      </Modal>
    </div>
  );
}

/** Une suggestion du robot déjà tranchée : refusée, elle ne revient plus jamais. */
function DecidedProposal({ proposal }: { proposal: RobotProposalCard }) {
  return (
    <Card className="opacity-75">
      <CardContent className="flex flex-wrap items-center gap-2 py-3 text-[13px]">
        <Badge tone={proposal.status === "VALIDATED" ? "success" : "neutral"}>{proposal.status === "VALIDATED" ? "Suggestion validée" : "Suggestion refusée"}</Badge>
        <span className="font-medium text-text-primary">
          {proposal.drugLabel.replace(/,.*$/, "")} → {proposal.productName}
        </span>
        {proposal.decidedBy && (
          <span className="text-text-tertiary">
            · {proposal.decidedBy}, {formatDate(proposal.decidedAt)}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
