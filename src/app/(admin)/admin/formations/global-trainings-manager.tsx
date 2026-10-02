"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, GraduationCap, Pencil, Plus, RotateCcw } from "lucide-react";
import { saveGlobalTrainingAction, setGlobalTrainingActiveAction } from "@/server/actions/platform-training";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { universeLabel } from "@/config/universes";
import { brandDisplay } from "@/core/training/content";
import { displayHost } from "@/core/training/video";
import { formatDate } from "@/lib/format";
import { DurationBadge, KindBadge } from "@/app/(app)/formation/_components/badges";
import { formValuesOf, TrainingFormModal, type StoredTraining, type TrainingFormValues } from "@/app/(app)/formation/_components/training-form";

export type GlobalTrainingRow = StoredTraining & {
  isActive: boolean;
  updatedAt: string;
  learners: number;
  completed: number;
  pharmacies: number;
};

function payloadOf(values: TrainingFormValues) {
  return {
    id: values.id,
    title: values.title,
    summary: values.summary,
    kind: values.kind,
    url: values.url,
    body: values.body,
    laboratory: values.laboratory,
    brand: values.brand,
    rangeName: values.rangeName,
    universe: values.universe,
    productCodes: values.productCodes,
    durationMinutes: values.durationMinutes,
    sourceLabel: values.sourceLabel,
  };
}

export function GlobalTrainingsManager({ rows }: { rows: GlobalTrainingRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [editing, setEditing] = useState<TrainingFormValues | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (row: GlobalTrainingRow) => {
    setBusy(row.id);
    start(async () => {
      const result = await setGlobalTrainingActiveAction({ id: row.id, isActive: !row.isActive });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : result.error });
      setBusy(null);
      router.refresh();
    });
  };

  const active = rows.filter((row) => row.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          {rows.length === 0 ? "Aucune formation publiée." : `${active} formation${active > 1 ? "s" : ""} proposée${active > 1 ? "s" : ""} aux officines${rows.length > active ? ` · ${rows.length - active} désactivée${rows.length - active > 1 ? "s" : ""}` : ""}.`}
        </p>
        <Button leadingIcon={<Plus className="size-4" />} onClick={() => setEditing(formValuesOf(null))}>
          Nouvelle formation
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title="Aucune formation publiée"
            description="Ajoutez le lien officiel d'une formation laboratoire, une vidéo ou une fiche courte : elle apparaîtra dans le centre de formation de toutes les officines."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((row) => {
            const facts = [row.laboratory, brandDisplay(row.brandKey), row.rangeName ? `Gamme ${row.rangeName}` : null, row.universe ? universeLabel(row.universe) : null].filter(Boolean);
            const host = displayHost(row.url);
            return (
              <li key={row.id}>
                <Card className={row.isActive ? undefined : "opacity-75"}>
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <KindBadge kind={row.kind} />
                      <DurationBadge minutes={row.durationMinutes} />
                      <Badge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Proposée" : "Désactivée"}</Badge>
                    </div>
                    <p className="text-[15px] leading-5 font-semibold break-words text-text-primary">{row.title}</p>
                    <p className="text-[12.5px] text-text-tertiary">{facts.length > 0 ? facts.join(" · ") : "Sans laboratoire ni univers"}</p>
                    {row.productCodes.length > 0 && (
                      <p className="truncate font-mono text-[12px] text-text-secondary" title={row.productCodes.join(", ")}>
                        {row.productCodes.length} code{row.productCodes.length > 1 ? "s" : ""} produit : {row.productCodes.slice(0, 3).join(", ")}{row.productCodes.length > 3 ? "…" : ""}
                      </p>
                    )}
                    <p className="text-[12px] text-text-tertiary">
                      {row.sourceLabel ?? "Provenance non précisée"}
                      {host && <> · {host}</>}
                    </p>
                    <p className="text-[12px] text-text-tertiary">
                      {row.learners === 0 ? "Pas encore ouverte" : `Commencée ${row.learners} fois dans ${row.pharmacies} officine${row.pharmacies > 1 ? "s" : ""} · terminée ${row.completed} fois`} · modifiée le {formatDate(row.updatedAt)}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(formValuesOf(row))}>
                        Modifier
                      </Button>
                      {row.url && (
                        <Button asChild size="sm" variant="ghost" leadingIcon={<ExternalLink className="size-3.5" />}>
                          <a href={row.url} target="_blank" rel="noopener noreferrer">Ouvrir</a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" loading={pending && busy === row.id} leadingIcon={row.isActive ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={() => toggle(row)}>
                        {row.isActive ? "Désactiver" : "Réactiver"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <TrainingFormModal
          variant="platform"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(values) => saveGlobalTrainingAction(payloadOf(values))}
        />
      )}
    </div>
  );
}
