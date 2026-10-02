"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Eye, GraduationCap, Pencil, Plus, RotateCcw } from "lucide-react";
import { savePharmacyTrainingAction, searchTrainingProductsAction, setPharmacyTrainingActiveAction } from "@/server/actions/training";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { universeLabel } from "@/config/universes";
import { brandDisplay } from "@/core/training/content";
import { formatDate } from "@/lib/format";
import { DurationBadge, KindBadge } from "./badges";
import { formValuesOf, TrainingFormModal, type StoredTraining, type TrainingFormValues } from "./training-form";

export type PharmacyTrainingRow = StoredTraining & {
  isActive: boolean;
  updatedAt: string;
  learners: number;
  completed: number;
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
    productIds: values.products.map((product) => product.id),
    durationMinutes: values.durationMinutes,
    sourceLabel: values.sourceLabel,
  };
}

/**
 * Les contenus que le titulaire publie pour son équipe : une fiche maison, le
 * lien officiel d'un laboratoire partenaire, une vidéo de formation. On ne
 * supprime pas : on désactive, et la progression de chacun est conservée.
 */
export function PharmacyTrainingsManager({ rows }: { rows: PharmacyTrainingRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [editing, setEditing] = useState<TrainingFormValues | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (row: PharmacyTrainingRow) => {
    setBusy(row.id);
    start(async () => {
      const result = await setPharmacyTrainingActiveAction({ id: row.id, isActive: !row.isActive });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : result.error });
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-text-secondary">
          Ajoutez vos propres contenus : fiches maison, liens officiels des laboratoires partenaires, vidéos. Ils s&apos;ajoutent au catalogue de votre équipe, à côté de ceux publiés par PharmaBoost.
        </p>
        <Button leadingIcon={<Plus className="size-4" />} onClick={() => setEditing(formValuesOf(null))}>
          Ajouter un contenu
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title="Aucun contenu publié par votre officine"
            description="Une fiche courte sur un produit phare, le lien officiel d'une formation laboratoire : votre équipe la retrouve dans son catalogue."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className={row.isActive ? undefined : "opacity-75"}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={row.kind} />
                    <DurationBadge minutes={row.durationMinutes} />
                    {!row.isActive && <Badge tone="neutral">Désactivé</Badge>}
                  </div>
                  <p className="text-[15px] leading-5 font-semibold break-words text-text-primary">{row.title}</p>
                  <p className="text-[12.5px] text-text-tertiary">
                    {[row.laboratory, brandDisplay(row.brandKey), row.rangeName, row.universe ? universeLabel(row.universe) : null].filter(Boolean).join(" · ") || "Sans laboratoire ni univers"}
                  </p>
                  {row.products && row.products.length > 0 && (
                    <p className="truncate text-[12.5px] text-text-secondary">Produits : {row.products.map((product) => product.name).join(", ")}</p>
                  )}
                  <p className="text-[12px] text-text-tertiary">
                    {row.learners === 0 ? "Pas encore ouvert par l'équipe" : `Commencé par ${row.learners} personne${row.learners > 1 ? "s" : ""} · terminé par ${row.completed}`} · modifié le {formatDate(row.updatedAt)}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(formValuesOf(row))}>
                      Modifier
                    </Button>
                    <Button asChild size="sm" variant="ghost" leadingIcon={<Eye className="size-3.5" />}>
                      <Link href={`/formation/${row.id}`}>Voir</Link>
                    </Button>
                    <Button size="sm" variant="ghost" loading={pending && busy === row.id} leadingIcon={row.isActive ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={() => toggle(row)}>
                      {row.isActive ? "Désactiver" : "Réactiver"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TrainingFormModal
          variant="pharmacy"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(values) => savePharmacyTrainingAction(payloadOf(values))}
          searchProducts={searchTrainingProductsAction}
        />
      )}
    </div>
  );
}
