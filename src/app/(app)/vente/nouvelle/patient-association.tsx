"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import { savePatientAction } from "@/server/actions/patients";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { PatientOption } from "@/components/app/patient-picker";

/**
 * Associer un patient — à tout moment, jamais en préalable.
 *
 * Chercher et créer vivent dans le même panneau parce que c'est la même
 * intention : mettre un nom sur la délivrance. Ce qu'on tape dans la recherche
 * pré-remplit la création, pour ne pas saisir deux fois.
 */
export function PatientAssociationModal({
  open,
  patients,
  onClose,
  onSelect,
  onDetach,
}: {
  open: boolean;
  patients: PatientOption[];
  onClose: () => void;
  onSelect: (patient: PatientOption) => void;
  onDetach: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creation, setCreation] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);

  // La fenêtre place le focus sur sa croix de fermeture ; au comptoir, on veut
  // taper le nom tout de suite.
  useEffect(() => {
    if (open && !creation) champRef.current?.focus();
  }, [open, creation]);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    return patients
      .filter((patient) =>
        normalize(
          `${patient.lastName} ${patient.firstName} ${patient.reference} ${patient.email ?? ""}`,
        ).includes(needle),
      )
      .slice(0, 8);
  }, [patients, query]);

  return (
    <Modal
      open={open}
      onClose={() => {
        setCreation(false);
        onClose();
      }}
      title={creation ? "Nouveau patient" : "Associer un patient"}
      description={
        creation
          ? "Le nom suffit. L'adresse e-mail permettra de lui envoyer son plan."
          : undefined
      }
      size="lg"
    >
      {creation ? (
        <CreationForm
          initialQuery={query}
          onCancel={() => setCreation(false)}
          onCreated={(patient) => {
            setCreation(false);
            setQuery("");
            onSelect(patient);
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-tertiary">
              <Search className="size-[18px]" />
            </span>
            <input
              ref={champRef}
              type="search"
              value={query}
              autoComplete="off"
              placeholder="Nom, e-mail ou référence"
              aria-label="Rechercher un patient"
              onChange={(event) => setQuery(event.target.value)}
              className={cn(
                "h-13 w-full rounded-xl border border-border-default bg-surface-card py-3.5 pr-4 pl-11",
                "text-[15px] text-text-primary placeholder:text-text-tertiary",
                "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none",
              )}
            />
          </div>

          {results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto rounded-xl border border-border-default">
              {results.map((patient) => (
                <li key={patient.id} className="border-b border-border-subtle last:border-0">
                  <button
                    type="button"
                    onClick={() => onSelect(patient)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-sunken"
                  >
                    <span className="block truncate text-[14px] font-medium text-text-primary">
                      {patient.firstName} {patient.lastName.toUpperCase()}
                    </span>
                    <span className="block truncate text-[12px] text-text-tertiary">
                      {patient.email ?? patient.reference}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.trim().length >= 2 && results.length === 0 && (
            <p className="rounded-xl border border-dashed border-border-default px-4 py-3 text-[13.5px] text-text-secondary">
              Aucun patient ne correspond à « {query.trim()} ».
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="outline"
              onClick={() => setCreation(true)}
              leadingIcon={<UserPlus className="size-[18px]" />}
            >
              Créer un patient
            </Button>
            <button
              type="button"
              onClick={onDetach}
              className="text-[13px] text-text-tertiary underline underline-offset-2 transition-colors hover:text-text-secondary"
            >
              Continuer sans patient
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreationForm({
  initialQuery,
  onCancel,
  onCreated,
}: {
  initialQuery: string;
  onCancel: () => void;
  onCreated: (patient: PatientOption) => void;
}) {
  const guess = splitName(initialQuery);
  const [form, setForm] = useState({
    firstName: guess.firstName,
    lastName: guess.lastName,
    email: "",
    phone: "",
    birthDate: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const data = new FormData();
      data.set("firstName", form.firstName);
      data.set("lastName", form.lastName);
      data.set("email", form.email);
      data.set("phone", form.phone);
      if (form.birthDate) data.set("birthDate", form.birthDate);
      data.set("sex", "UNSPECIFIED");

      const result = await savePatientAction(null, data);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      push({ tone: "success", title: `Fiche de ${form.firstName} créée.` });
      onCreated({
        id: result.data.patientId,
        firstName: form.firstName,
        lastName: form.lastName,
        reference: "",
        email: form.email || null,
      });
    });
  };

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="np-first" required error={fieldErrors.firstName}>
          <Input
            id="np-first"
            value={form.firstName}
            autoFocus
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </Field>
        <Field label="Nom" htmlFor="np-last" required error={fieldErrors.lastName}>
          <Input
            id="np-last"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Adresse e-mail" htmlFor="np-mail" error={fieldErrors.email}>
        <Input
          id="np-mail"
          type="email"
          value={form.email}
          placeholder="prenom.nom@exemple.fr"
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Téléphone" htmlFor="np-tel">
          <Input
            id="np-tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
        <Field label="Date de naissance" htmlFor="np-naissance">
          <Input
            id="np-naissance"
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          Retour
        </Button>
        <Button
          onClick={submit}
          loading={pending}
          disabled={!form.firstName.trim() || !form.lastName.trim()}
        >
          Créer et associer
        </Button>
      </div>
    </div>
  );
}

function splitName(query: string): { firstName: string; lastName: string } {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
