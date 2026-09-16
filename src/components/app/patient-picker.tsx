"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Mail, Search, UserPlus, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickPatientForm } from "./quick-patient-form";

export type PatientOption = {
  id: string;
  firstName: string;
  lastName: string;
  reference: string;
  email: string | null;
};

/**
 * Retrouver un patient au comptoir.
 *
 * Une liste déroulante de cent quarante noms n'est pas une base patients : au
 * comptoir on connaît un nom, parfois seulement le début, parfois l'adresse
 * e-mail — jamais le rang dans un menu. La recherche porte donc sur le nom, le
 * prénom, la référence ET l'adresse, sans accent ni casse, et l'adresse est
 * affichée : c'est elle qui décide, plus tard, si le plan part par e-mail ou
 * s'imprime.
 */
export function PatientPicker({
  patients: knownPatients,
  value,
  onChange,
  id = "patientId",
  emptyLabel = "Aucun patient rattaché",
  create,
}: {
  patients: PatientOption[];
  value: string;
  onChange: (patientId: string) => void;
  id?: string;
  emptyLabel?: string;
  /**
   * Autorise la création d'un nouveau patient depuis la recherche : le
   * patient est devant le comptoir, on ne l'envoie pas remplir une fiche
   * ailleurs. Avec `prescriptionId`, il est rattaché à la délivrance aussitôt.
   */
  create?: { prescriptionId?: string | null } | null;
}) {
  const listId = `${id}-resultats`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Les patients créés ici rejoignent la liste sans attendre un rechargement.
  const [created, setCreated] = useState<PatientOption[]>([]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patients = useMemo(() => [...created, ...knownPatients.filter((p) => !created.some((c) => c.id === p.id))], [created, knownPatients]);

  const selected = patients.find((patient) => patient.id === value) ?? null;

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return patients.slice(0, 8);
    return patients
      .filter((patient) =>
        normalize(
          `${patient.lastName} ${patient.firstName} ${patient.reference} ${patient.email ?? ""}`,
        ).includes(needle),
      )
      .slice(0, 8);
  }, [patients, query]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-300 bg-brand-50/60 px-3 py-2.5 dark:border-brand-800 dark:bg-brand-950/50">
        <UserRound className="size-4 shrink-0 text-brand-700 dark:text-brand-400" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-text-primary">
            {selected.lastName.toUpperCase()} {selected.firstName}
          </span>
          <span className="flex items-center gap-1.5 truncate text-[11.5px] text-text-tertiary">
            <span className="tabular">{selected.reference}</span>
            {selected.email ? (
              <>
                <Mail className="size-3" />
                {selected.email}
              </>
            ) : (
              <span>pas d&apos;adresse e-mail</span>
            )}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          aria-label="Détacher le patient"
          className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  if (creating && create) {
    return (
      <div className="rounded-lg border border-brand-300 bg-brand-50/40 px-3.5 py-3 dark:border-brand-800 dark:bg-brand-950/30">
        <p className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <UserPlus className="size-4 text-brand-700 dark:text-brand-400" /> Nouveau patient
        </p>
        <QuickPatientForm
          compact
          prescriptionId={create.prescriptionId ?? null}
          initialQuery={query}
          onCancel={() => setCreating(false)}
          onCreated={(patient) => {
            setCreated((list) => [patient, ...list]);
            onChange(patient.id);
            setCreating(false);
            setQuery("");
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary">
        <Search className="size-4" />
      </span>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder="Nom, référence ou e-mail…"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Laisse le clic sur un résultat se produire avant la fermeture.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        className={cn(
          "w-full rounded-lg border border-border-default bg-surface-card py-2.5 pr-3 pl-9",
          "text-[13.5px] text-text-primary placeholder:text-text-tertiary",
          "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
        )}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-border-default bg-surface-card p-1 shadow-lg"
        >
          <li>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setOpen(false);
                if (blurTimer.current) clearTimeout(blurTimer.current);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-text-secondary transition-colors hover:bg-surface-sunken"
            >
              <Check className={cn("size-3.5", value ? "opacity-0" : "opacity-100")} />
              {emptyLabel}
            </button>
          </li>

          {create && (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setCreating(true);
                  setOpen(false);
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40"
              >
                <UserPlus className="size-3.5" />
                Nouveau patient{query.trim() ? ` « ${query.trim()} »` : ""}
              </button>
            </li>
          )}

          {results.length === 0 ? (
            <li className="px-2.5 py-3 text-[12.5px] text-text-tertiary">
              Aucun patient ne correspond à « {query} ».{create ? " Créez-le ci-dessus." : ""}
            </li>
          ) : (
            results.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(patient.id);
                    setOpen(false);
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                  }}
                  className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-sunken"
                >
                  <span className="block truncate text-[13.5px] text-text-primary">
                    {patient.lastName.toUpperCase()} {patient.firstName}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-[11.5px] text-text-tertiary">
                    <span className="tabular">{patient.reference}</span>
                    {patient.email && (
                      <>
                        <Mail className="size-3" />
                        {patient.email}
                      </>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Sans accents ni casse : « ANDRÉ » se trouve en tapant « andre ». */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
