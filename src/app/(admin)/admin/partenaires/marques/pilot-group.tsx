"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Search } from "lucide-react";
import { setPartnerPilotAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input, Switch } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { normalizeForSearch } from "@/lib/utils";

export type PilotCandidateRow = { id: string; name: string; city: string | null; partnerPilot: boolean };

/**
 * Le groupe pilote : les officines qui voient les marques et gammes en statut
 * Test avant leur diffusion. Seules les vraies officines actives y entrent.
 */
export function PilotGroupCard({ candidates }: { candidates: PilotCandidateRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Bascule affichée aussitôt, annulée si le serveur refuse.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  const isPilot = (candidate: PilotCandidateRow) => overrides[candidate.id] ?? candidate.partnerPilot;
  const pilots = candidates.filter(isPilot);

  const filtered = useMemo(() => {
    const needle = normalizeForSearch(query);
    return needle ? candidates.filter((candidate) => normalizeForSearch(`${candidate.name} ${candidate.city ?? ""}`).includes(needle)) : candidates;
  }, [candidates, query]);

  const toggle = (candidate: PilotCandidateRow, pilot: boolean) => {
    setBusy(candidate.id);
    setOverrides((current) => ({ ...current, [candidate.id]: pilot }));
    start(async () => {
      const result = await setPartnerPilotAction({ pharmacyId: candidate.id, pilot });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
      if (!result.ok) setOverrides((current) => ({ ...current, [candidate.id]: !pilot }));
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader
        title={`Groupe pilote : ${pilots.length} officine${pilots.length > 1 ? "s" : ""}`}
        description="Elles voient les marques et les gammes en statut Test avant leur diffusion. Seules les vraies officines actives peuvent en faire partie."
        action={
          <Button variant="outline" size="sm" leadingIcon={<FlaskConical className="size-4" />} onClick={() => setOpen(true)}>
            Gérer
          </Button>
        }
      />
      {pilots.length > 0 && (
        <CardContent>
          <p className="text-[13px] text-text-secondary">{pilots.map((pilot) => pilot.name).join(" · ")}</p>
        </CardContent>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Groupe pilote" description={`${pilots.length} officine${pilots.length > 1 ? "s" : ""} sur ${candidates.length}`} size="md">
        {candidates.length === 0 ? (
          <EmptyState title="Aucune officine réelle active" description="Le groupe pilote ne comprend que de vraies officines clientes, actives. Les officines de démonstration n'y entrent pas." />
        ) : (
          <div className="space-y-3">
            <Input leadingIcon={<Search className="size-4" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une officine" aria-label="Rechercher une officine" />
            <ul className="divide-y divide-border-subtle">
              {filtered.map((candidate) => (
                <li key={candidate.id} className="py-2.5">
                  <Switch
                    id={`pilot-${candidate.id}`}
                    label={candidate.name}
                    description={candidate.city ?? undefined}
                    checked={isPilot(candidate)}
                    disabled={busy === candidate.id}
                    onChange={(event) => toggle(candidate, event.target.checked)}
                  />
                </li>
              ))}
            </ul>
            {filtered.length === 0 && <p className="text-[13px] text-text-tertiary">Aucune officine ne correspond.</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}
