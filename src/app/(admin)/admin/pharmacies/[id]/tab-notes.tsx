import { Lock, Pin, StickyNote } from "lucide-react";
import type { Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { listNotes } from "@/server/services/admin/notes";
import { AdminSection } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddNoteButton, NotePinButton } from "./notes";

/** Les notes internes : celles de l'officine et celles de son dossier commercial, épinglées d'abord. */
export async function NotesTab({ base }: { base: Pharmacy360 }) {
  const notes = await listNotes({ pharmacyId: base.pharmacy.id, prospectId: base.pharmacy.prospect?.id ?? null }, { limit: 200 });
  return (
    <AdminSection
      title="Notes internes"
      description={
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden="true" />
          Visibles seulement de l&apos;équipe PharmaBoost : ni l&apos;officine ni les commerciaux ne les voient.
        </span>
      }
      action={<AddNoteButton pharmacyId={base.pharmacy.id} />}
    >
      {notes.length === 0 ? (
        <EmptyState icon={<StickyNote className="size-5" />} title="Aucune note pour l'instant" description="Consignez un appel, un engagement, un point d'attention : l'équipe le retrouvera ici." />
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className={cn("rounded-xl border p-4", note.pinned ? "border-brand-200 bg-brand-50/50 dark:border-brand-800/60 dark:bg-brand-950/30" : "border-border-subtle")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 text-[12px] text-text-tertiary">
                  {note.pinned && (
                    <Badge tone="brand" icon={<Pin className="size-3" aria-hidden="true" />}>
                      Épinglée
                    </Badge>
                  )}
                  {note.prospectId && !note.pharmacyId && <Badge tone="neutral">Dossier commercial</Badge>}
                  <span className="font-medium text-text-secondary">{note.authorLabel}</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                </p>
                <NotePinButton noteId={note.id} pinned={note.pinned} />
              </div>
              <p className="mt-2 text-[13.5px] leading-6 whitespace-pre-line text-text-primary">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
