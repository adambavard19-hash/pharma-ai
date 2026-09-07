"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Mail, Search, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  patients,
  value,
  onChange,
  id = "patientId",
  emptyLabel = "Aucun patient rattaché",
}: {
  patients: PatientOption[];
  value: string;
  onChange: (patientId: string) => void;
  id?: string;
  emptyLabel?: string;
}) {
  const listId = `${id}-resultats`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

          {results.length === 0 ? (
            <li className="px-2.5 py-3 text-[12.5px] text-text-tertiary">
              Aucun patient ne correspond à « {query} ».
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
