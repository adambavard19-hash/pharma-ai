"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { scheduleDemoAction } from "@/server/actions/admin-commercial";
import type { ActionResult } from "@/server/actions/types";
import { parisInputToDate, toParisInput } from "@/core/sales/board";

export type ProspectOption = { id: string; name: string; city: string | null; repName: string | null };


/** Retire `nouveau=` de l'adresse quand on ferme une fenêtre ouverte par une action rapide. */
export function useClearNewParam(active: boolean) {
  const router = useRouter();
  return () => {
    if (!active || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("nouveau")) return;
    url.searchParams.delete("nouveau");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };
}

/** Choisir un dossier dans une liste longue : un champ de recherche filtre la liste déroulante. */
export function ProspectPicker({ prospects, value, onChange, id }: { prospects: ProspectOption[]; value: string; onChange: (id: string) => void; id: string }) {
  const [search, setSearch] = useState("");
  const text = search.trim().toLowerCase();
  const filtered = text ? prospects.filter((p) => `${p.name} ${p.city ?? ""} ${p.repName ?? ""}`.toLowerCase().includes(text)) : prospects;
  const selected = prospects.find((p) => p.id === value);
  const options = selected && !filtered.includes(selected) ? [selected, ...filtered] : filtered;
  return (
    <div className="space-y-2">
      <Input type="search" placeholder="Rechercher par nom, ville, commercial" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un dossier" />
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{options.length === 0 ? "Aucun dossier ne correspond" : "Choisir un dossier…"}</option>
        {options.slice(0, 300).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.city ? ` · ${p.city}` : ""}
            {` · ${p.repName ?? "Console"}`}
          </option>
        ))}
      </Select>
    </div>
  );
}

export type DemoSubmit = { prospectId: string; at: string; note: string | null };

/**
 * La fenêtre « Programmer une démonstration » : un dossier (imposé ou à
 * choisir), une date et une heure, une note. Elle ne fait qu'appeler
 * `onSubmit` : chaque écran décide de l'action (programmer, ou déplacer sur
 * le pipeline) et la revérification reste côté serveur.
 */
export function DemoDialog({
  onClose,
  onSubmit,
  initialAt,
  prospects,
  fixedProspect,
  initialProspectId,
  title = "Programmer une démonstration",
  submitLabel = "Programmer",
}: {
  onClose: () => void;
  onSubmit: (values: DemoSubmit) => Promise<ActionResult<unknown>>;
  /** Valeur initiale du champ « date et heure », à l'heure de Paris (« AAAA-MM-JJTHH:mm »). */
  initialAt: string;
  prospects?: ProspectOption[];
  fixedProspect?: { id: string; name: string };
  initialProspectId?: string | null;
  title?: string;
  submitLabel?: string;
}) {
  const [prospectId, setProspectId] = useState(fixedProspect?.id ?? (initialProspectId && prospects?.some((p) => p.id === initialProspectId) ? initialProspectId : ""));
  const [at, setAt] = useState(initialAt);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    // Le champ se lit à l'heure de Paris, quel que soit le fuseau du navigateur : c'est l'heure affichée partout.
    const iso = parisInputToDate(at)?.toISOString() ?? null;
    if (!prospectId) return setError("Choisissez le dossier.");
    if (!iso) return setError("Indiquez une date et une heure valides.");
    setError(null);
    setBusy(true);
    const result = await onSubmit({ prospectId, at: iso, note: note.trim() || null });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onClose();
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={title}
      description={fixedProspect ? fixedProspect.name : "Le dossier passe en « Démo programmée ». S'il a un commercial, la démo entre dans son agenda."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={submit} loading={busy} leadingIcon={<CalendarPlus className="size-4" />}>{submitLabel}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {!fixedProspect && prospects && (
          <Field label="Dossier" htmlFor="demo-prospect" required>
            <ProspectPicker id="demo-prospect" prospects={prospects} value={prospectId} onChange={setProspectId} />
          </Field>
        )}
        <Field label="Date et heure" htmlFor="demo-at" required hint="Heure de Paris, quel que soit le fuseau de votre ordinateur.">
          <Input id="demo-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="demo-note" hint="Facultatif : lieu, visio, personnes présentes…">
          <Textarea id="demo-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Le bouton qui ouvre la fenêtre et programme la démo (`scheduleDemoAction`).
 * `currentAt` : pour reprogrammer, la date actuelle sert de valeur de départ
 * (pré-remplie à l'heure de Paris).
 */
export function ScheduleDemoButton({
  defaultAt,
  currentAt,
  prospects,
  fixedProspect,
  initialProspectId,
  defaultOpen = false,
  label = "Programmer une démo",
  variant = "primary",
  size = "md",
}: {
  defaultAt: string;
  currentAt?: string | null;
  prospects?: ProspectOption[];
  fixedProspect?: { id: string; name: string };
  initialProspectId?: string | null;
  defaultOpen?: boolean;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [initialAt, setInitialAt] = useState(defaultAt);
  const router = useRouter();
  const { push } = useToast();
  const clearNewParam = useClearNewParam(defaultOpen);
  const close = () => {
    setOpen(false);
    clearNewParam();
  };
  return (
    <>
      <Button
        variant={variant}
        size={size}
        leadingIcon={<CalendarPlus className="size-4" />}
        onClick={() => {
          setInitialAt(currentAt ? toParisInput(currentAt) : defaultAt);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      {open && (
        <DemoDialog
          onClose={close}
          initialAt={initialAt}
          prospects={prospects}
          fixedProspect={fixedProspect}
          initialProspectId={initialProspectId}
          title={currentAt ? "Reprogrammer la démonstration" : "Programmer une démonstration"}
          submitLabel={currentAt ? "Reprogrammer" : "Programmer"}
          onSubmit={async (values) => {
            const result = await scheduleDemoAction(values);
            if (result.ok) {
              push({ tone: "success", title: result.message ?? "Démonstration programmée." });
              router.refresh();
            }
            return result;
          }}
        />
      )}
    </>
  );
}
