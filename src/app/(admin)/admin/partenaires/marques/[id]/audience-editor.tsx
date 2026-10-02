"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { setPartnerBrandAudienceAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AUDIENCE_LABELS, AUDIENCES, type Audience } from "@/core/partners/status";
import { cn, normalizeForSearch } from "@/lib/utils";

export type AudienceCandidateRow = { id: string; name: string; city: string | null; isDemo: boolean };

const AUDIENCE_HINTS: Record<Audience, string> = {
  ALL_PHARMACIES: "Toutes les officines clientes actives, une fois la marque publiée.",
  SELECTED_PHARMACIES: "Seulement les officines cochées ci-dessous.",
  PILOT_GROUP: "Seulement les officines du groupe pilote, même une fois la marque publiée.",
};

/** À qui la marque est diffusée. En statut Test, seul le groupe pilote la voit, quel que soit ce choix. */
export function AudienceEditorCard({
  brandId,
  initialAudience,
  initialSelected,
  candidates,
  pilotCount,
  isTest,
}: {
  brandId: string;
  initialAudience: Audience;
  initialSelected: string[];
  candidates: AudienceCandidateRow[];
  pilotCount: number;
  isTest: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = normalizeForSearch(query);
    return needle ? candidates.filter((candidate) => normalizeForSearch(`${candidate.name} ${candidate.city ?? ""}`).includes(needle)) : candidates;
  }, [candidates, query]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await setPartnerBrandAudienceAction({ id: brandId, audience, pharmacyIds: [...selected] });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Audience enregistrée." });
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader title="Audience" description="À qui la marque est diffusée une fois publiée." />
      <CardContent className="space-y-4">
        {isTest && (
          <Alert tone="info">
            La marque est en Test : seul le groupe pilote ({pilotCount} officine{pilotCount > 1 ? "s" : ""}) la voit, quel que soit ce choix.
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="space-y-2" role="radiogroup" aria-label="Audience">
          {AUDIENCES.map((key) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 transition-colors",
                audience === key ? "border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950" : "border-border-subtle hover:bg-surface-sunken",
              )}
            >
              <input type="radio" name={`audience-${brandId}`} className="mt-1 size-4 text-brand-600" checked={audience === key} onChange={() => setAudience(key)} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-text-primary">
                  {AUDIENCE_LABELS[key]}
                  {key === "PILOT_GROUP" && <span className="font-normal text-text-tertiary"> · {pilotCount} officine{pilotCount > 1 ? "s" : ""}</span>}
                </span>
                <span className="block text-[12.5px] text-text-secondary">{AUDIENCE_HINTS[key]}</span>
              </span>
            </label>
          ))}
        </div>

        {audience === "SELECTED_PHARMACIES" && (
          <div className="space-y-2.5 rounded-lg border border-border-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-text-primary">
                {selected.size} officine{selected.size > 1 ? "s" : ""} cochée{selected.size > 1 ? "s" : ""}
              </p>
              <div className="w-full sm:w-64">
                <Input leadingIcon={<Search className="size-4" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" aria-label="Rechercher une officine" />
              </div>
            </div>
            {candidates.length === 0 ? (
              <p className="text-[13px] text-text-tertiary">Aucune officine active.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {filtered.map((candidate) => (
                  <li key={candidate.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-sunken">
                      <input type="checkbox" className="size-4 shrink-0 rounded border-border-strong text-brand-600" checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} />
                      <span className="min-w-0 flex-1 truncate text-text-primary">
                        {candidate.name}
                        {candidate.city && <span className="text-text-tertiary"> · {candidate.city}</span>}
                      </span>
                      {candidate.isDemo && <Badge tone="neutral">Démo</Badge>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-text-tertiary">Les officines de démonstration peuvent être cochées pour essai ; elles ne comptent jamais dans les chiffres.</p>
          </div>
        )}
        {audience !== "SELECTED_PHARMACIES" && initialSelected.length > 0 && (
          <p className="text-[12px] text-text-tertiary">La sélection précédente ({initialSelected.length} officine{initialSelected.length > 1 ? "s" : ""}) est conservée, mais ne s&apos;applique qu&apos;avec « Officines sélectionnées ».</p>
        )}

        <div className="flex justify-end">
          <Button loading={pending} onClick={submit}>
            Enregistrer l&apos;audience
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
