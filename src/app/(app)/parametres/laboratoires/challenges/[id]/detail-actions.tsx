"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { BrandSuggestion, ChallengeRow } from "@/server/services/challenges";
import { Button } from "@/components/ui/button";
import { ChallengeActions } from "../challenge-actions";
import { ChallengeFormModal } from "../challenge-form";

/** « Modifier » et le menu « … » en tête du détail d'un challenge. */
export function DetailActions({ challenge, brands, today }: { challenge: ChallengeRow; brands: BrandSuggestion[]; today: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
        Modifier
      </Button>
      <ChallengeActions
        id={challenge.id}
        title={challenge.title}
        status={challenge.status}
        effectiveStatus={challenge.progress.effectiveStatus}
        afterDelete="/parametres/laboratoires/challenges"
      />
      <ChallengeFormModal open={editing} onClose={() => setEditing(false)} challenge={challenge} brands={brands} today={today} />
    </div>
  );
}
