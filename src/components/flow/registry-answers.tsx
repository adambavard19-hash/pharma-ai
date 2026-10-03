"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Building2, Check, Loader2, MapPin, SearchX } from "lucide-react";
import { digitsOnly, isValidSiret } from "@/core/contracts/identity";
import { SIRENE_SOURCE, type CompanyLookup } from "@/core/registry/sirene";
import { formatSiretInput, type Prefill } from "@/core/registry/prefill";

export { applyCompany, revertCompany, formatSiretInput, type Prefill } from "@/core/registry/prefill";
import { ADDRESS_SOURCE, type AddressSuggestion } from "@/core/registry/address";
import { FieldMessage, TextAnswer } from "./controls";
import { cn } from "@/lib/utils";

/**
 * Les réponses qui s'appuient sur les annuaires publics : le SIRET retrouve
 * l'officine, l'adresse se complète d'elle-même. Les appels passent par le
 * serveur de PharmaBoost ; une panne laisse simplement la saisie libre.
 */

type Lookup = { state: "idle" } | { state: "loading"; siret: string } | { state: "found"; siret: string; company: CompanyLookup } | { state: "missing"; siret: string } | { state: "unavailable"; siret: string };

export function SiretAnswer({ value, onValueChange, error, prefill, onApply, onReject }: { value: string; onValueChange: (value: string) => void; error?: string; prefill: Prefill; onApply: (company: CompanyLookup) => void; onReject: (siret: string) => void }) {
  const digits = digitsOnly(value);
  const complete = digits.length === 14;
  const valid = complete && isValidSiret(digits);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const apply = useRef(onApply);
  const prefillRef = useRef(prefill);
  useEffect(() => {
    apply.current = onApply;
    prefillRef.current = prefill;
  });

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'état de la recherche suit le SIRET saisi
    setLookup({ state: "loading", siret: digits });
    fetch(`/api/public/entreprise?siret=${digits}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { status?: string; company?: CompanyLookup } | null;
        if (body?.status === "FOUND" && body.company) {
          setLookup({ state: "found", siret: digits, company: body.company });
          // Repris d'office, sauf si la personne a déjà écarté cet établissement.
          if (prefillRef.current._rejected !== digits && prefillRef.current._siret !== digits) apply.current(body.company);
        } else if (body?.status === "NOT_FOUND") setLookup({ state: "missing", siret: digits });
        else setLookup({ state: "unavailable", siret: digits });
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setLookup({ state: "unavailable", siret: digits });
      });
    return () => controller.abort();
  }, [valid, digits]);

  const current = "siret" in lookup && lookup.siret === digits ? lookup : null;
  const localError = complete && !valid ? "Ce SIRET ne semble pas valide : vérifiez les 14 chiffres." : undefined;
  const applied = prefill._siret === digits;

  return (
    <div>
      <TextAnswer
        srLabel="SIRET"
        value={formatSiretInput(value)}
        onValueChange={(v) => onValueChange(digitsOnly(v).slice(0, 14))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="123 456 789 00012"
        error={error ?? localError}
        hint={!complete ? `${digits.length} chiffre${digits.length > 1 ? "s" : ""} sur 14 · sur votre Kbis ou votre avis de situation Insee.` : undefined}
        className="max-w-md"
        trailing={current?.state === "loading" ? <Loader2 className="size-5 animate-spin text-brand-600" aria-hidden="true" /> : valid ? <Check className="size-5 text-brand-600" strokeWidth={3} aria-hidden="true" /> : null}
        style={{ letterSpacing: "0.04em" }}
      />

      <div aria-live="polite" className="mt-4">
        {current?.state === "loading" && <p className="text-[14px] text-text-secondary">Recherche dans l&apos;annuaire des entreprises…</p>}
        {current?.state === "found" && (
          <div className={cn("motion-safe:animate-slide-up rounded-2xl border p-4 sm:p-5", applied ? "border-brand-300 bg-brand-50/60 dark:bg-brand-950/30" : "border-border-default bg-surface-app")}>
            <div className="flex items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white" aria-hidden="true">
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] leading-6 font-semibold text-text-primary">{current.company.tradeName ?? current.company.legalName}</p>
                {current.company.tradeName && current.company.tradeName !== current.company.legalName && <p className="text-[13.5px] text-text-secondary">{current.company.legalName}</p>}
                {current.company.addressLine1 && (
                  <p className="mt-1 text-[14px] text-text-secondary">
                    {current.company.addressLine1}, {current.company.postalCode} {current.company.city}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px] font-medium">
                  {current.company.isPharmacy && <span className="rounded-full bg-surface-card px-2.5 py-1 text-text-secondary ring-1 ring-border-subtle">Pharmacie · APE 47.73Z</span>}
                  {current.company.finessNumber && <span className="rounded-full bg-surface-card px-2.5 py-1 text-text-secondary ring-1 ring-border-subtle">FINESS {current.company.finessNumber}</span>}
                  {current.company.active && <span className="rounded-full bg-surface-card px-2.5 py-1 text-text-secondary ring-1 ring-border-subtle">En activité</span>}
                </div>
              </div>
            </div>
            {(!current.company.active || !current.company.isPharmacy) && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2 text-[13px] leading-5 text-warning-800 dark:bg-warning-700/10 dark:text-warning-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {!current.company.active ? "Cet établissement est indiqué fermé dans le répertoire SIRENE. Vérifiez le SIRET." : `Activité déclarée : ${current.company.activityCode ?? "non précisée"}, ce n'est pas le code d'une pharmacie (47.73Z). Vérifiez le SIRET.`}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-3 sm:flex-row sm:items-center sm:justify-between">
              {applied ? (
                <>
                  <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-brand-800 dark:text-brand-200">
                    <Check className="size-4" strokeWidth={3} aria-hidden="true" /> Repris aux questions suivantes : vous vérifierez chaque valeur.
                  </p>
                  <button type="button" onClick={() => onReject(digits)} className="self-start rounded-lg px-2 py-1 text-[13px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline sm:self-auto">
                    Ce n&apos;est pas mon officine
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[13.5px] text-text-secondary">Vous saisirez les informations vous-même.</p>
                  <button type="button" onClick={() => onApply(current.company)} className="self-start rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700 sm:self-auto">
                    Utiliser ces informations
                  </button>
                </>
              )}
            </div>
            <p className="mt-3 text-[11.5px] text-text-tertiary">Source : {SIRENE_SOURCE}.</p>
          </div>
        )}
        {current?.state === "missing" && (
          <p className="flex items-start gap-2 text-[14px] leading-6 text-text-secondary">
            <SearchX className="mt-1 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
            Ce SIRET n&apos;apparaît pas dans l&apos;annuaire public des entreprises. Aucun souci : vous saisirez les informations aux questions suivantes.
          </p>
        )}
        {current?.state === "unavailable" && <p className="text-[14px] leading-6 text-text-secondary">L&apos;annuaire des entreprises ne répond pas pour l&apos;instant : vous saisirez les informations vous-même.</p>}
      </div>
    </div>
  );
}

export function AddressAnswer({
  line,
  postalCode,
  city,
  onChange,
  errors,
  badge,
}: {
  line: string;
  postalCode: string;
  city: string;
  onChange: (partial: { addressLine1?: string; postalCode?: string; city?: string }) => void;
  errors: { addressLine1?: string; postalCode?: string; city?: string };
  badge?: React.ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);

  // Seule une frappe déclenche une recherche : une adresse reprise ou choisie n'en relance pas.
  useEffect(() => {
    if (query === null || query.trim().length < 4) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/public/adresse?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => response.json())
        .then((body: { suggestions?: AddressSuggestion[] }) => {
          setSuggestions(body.suggestions ?? []);
          setActive(-1);
          setOpen((body.suggestions ?? []).length > 0);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pick = (s: AddressSuggestion) => {
    onChange({ addressLine1: s.addressLine1, postalCode: s.postalCode, city: s.city });
    setQuery(null);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={id} className="text-[13.5px] font-medium text-text-secondary">
            Adresse
          </label>
          {badge}
        </div>
        <div className="relative">
          <MapPin className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
          <input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={errors.addressLine1 ? true : undefined}
            aria-describedby={`${id}-message`}
            value={line}
            onChange={(e) => {
              onChange({ addressLine1: e.target.value });
              setQuery(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onFocus={() => suggestions.length > 0 && query !== null && setOpen(true)}
            autoComplete="street-address"
            placeholder="12 rue de la République"
            className={cn(
              "block h-14 w-full rounded-2xl border border-border-default bg-surface-app pr-11 pl-12 text-[18px] text-text-primary shadow-xs placeholder:text-text-tertiary/70",
              "focus:border-brand-500 focus:bg-surface-card focus:ring-4 focus:ring-brand-500/15 focus:outline-none aria-[invalid=true]:border-danger-500",
            )}
          />
          {loading && <Loader2 className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-brand-600" aria-hidden="true" />}
        </div>
        {open && suggestions.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Adresses proposées" className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border-default bg-surface-card py-1.5 shadow-xl">
            {suggestions.map((s, i) => (
              <li
                key={s.label}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5", i === active ? "bg-brand-50 dark:bg-brand-950/40" : "")}
              >
                <MapPin className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-text-primary">{s.addressLine1}</span>
                  <span className="block text-[13px] text-text-secondary">
                    {s.postalCode} {s.city}
                  </span>
                </span>
              </li>
            ))}
            <li role="presentation" className="px-4 pt-1.5 pb-1 text-[11px] text-text-tertiary">Suggestions : {ADDRESS_SOURCE}</li>
          </ul>
        )}
        <FieldMessage id={`${id}-message`} error={errors.addressLine1} hint="Commencez à taper : choisissez votre adresse dans la liste." />
      </div>
      <div className="grid grid-cols-[8.5rem_1fr] gap-3 sm:grid-cols-[10rem_1fr]">
        <TextAnswer label="Code postal" value={postalCode} onValueChange={(v) => onChange({ postalCode: digitsOnly(v).slice(0, 5) })} inputMode="numeric" autoComplete="postal-code" error={errors.postalCode} />
        <TextAnswer label="Ville" value={city} onValueChange={(v) => onChange({ city: v })} autoComplete="address-level2" error={errors.city} />
      </div>
    </div>
  );
}
