"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Search, Send } from "lucide-react";
import { requestToJoinAction, searchPharmaciesAction } from "@/server/actions/team-access";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

type Found = { id: string; label: string };

export function JoinForm() {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [searched, setSearched] = useState(false);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [form, setForm] = useState({ role: "TECHNICIAN", firstName: "", lastName: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // La recherche se lance toute seule, un instant après la dernière frappe ; trois caractères au moins.
  useEffect(() => {
    if (chosen) return;
    if (query.trim().length < 3) return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await searchPharmaciesAction(query);
      if (!live) return;
      setSearched(true);
      setFound(result.ok ? result.data.pharmacies : []);
      if (!result.ok) setError(result.error);
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, chosen]);

  // En dessous de trois caractères, rien à montrer (même si une recherche précédente a laissé des résultats).
  const enough = query.trim().length >= 3;
  const shown = enough ? found : [];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!chosen) return setError("Choisissez votre pharmacie dans la liste.");
    if (form.password !== form.confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    start(async () => {
      const result = await requestToJoinAction({ pharmacyId: chosen.id, firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password, role: form.role });
      if (!result.ok) return setError(result.error);
      setSentTo(result.data.pharmacyName);
    });
  };

  if (sentTo) {
    return (
      <div className="space-y-4" role="status">
        <Alert tone="success" title="Demande envoyée">
          Le titulaire de {sentTo} vient d&apos;être prévenu. Dès qu&apos;il aura approuvé votre demande, vous recevrez un e-mail et pourrez vous connecter avec l&apos;adresse et le mot de passe que vous venez de saisir.
        </Alert>
        <p className="text-[13px] text-text-secondary">En attendant, vous n&apos;avez accès à aucune donnée de l&apos;officine. Un doute ? Appelez directement le titulaire.</p>
        <Link href="/login" className="inline-block text-[13.5px] text-brand-700 underline underline-offset-2 dark:text-brand-400">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="space-y-2">
        <Field label="1. Votre pharmacie" htmlFor="pharmacy" hint="Nom, ville ou code postal (3 caractères au moins).">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden />
            <Input id="pharmacy" className="pl-9" autoComplete="off" value={chosen ? chosen.label : query} readOnly={Boolean(chosen)} onChange={(event) => setQuery(event.target.value)} placeholder="Pharmacie du Port, Nice…" />
          </div>
        </Field>
        {chosen ? (
          <button type="button" onClick={() => { setChosen(null); setQuery(""); }} className="text-[12.5px] text-brand-700 underline underline-offset-2 dark:text-brand-400">
            Ce n&apos;est pas ma pharmacie
          </button>
        ) : (
          <>
            {shown.length > 0 && (
              <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle" role="listbox" aria-label="Pharmacies trouvées">
                {shown.map((pharmacy) => (
                  <li key={pharmacy.id}>
                    <button type="button" role="option" aria-selected={false} onClick={() => setChosen(pharmacy)} className={cn("flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] text-text-primary hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none")}>
                      <span>{pharmacy.label}</span>
                      <Check className="size-4 text-text-tertiary" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {enough && searched && shown.length === 0 && <p className="text-[13px] text-text-secondary">Aucune pharmacie trouvée. Vérifiez l&apos;orthographe, ou demandez à votre titulaire de vous inviter par e-mail.</p>}
          </>
        )}
      </div>

      {chosen && (
        <div className="space-y-4 border-t border-border-subtle pt-5">
          <p className="text-[13px] font-medium text-text-primary">2. Vous</p>
          <Field label="Votre poste" htmlFor="role">
            <Select id="role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="PHARMACIST">Pharmacien</option>
              <option value="TECHNICIAN">Préparateur</option>
              <option value="STUDENT">Étudiant</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="firstName" required>
              <Input id="firstName" required autoComplete="given-name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            </Field>
            <Field label="Nom" htmlFor="lastName" required>
              <Input id="lastName" required autoComplete="family-name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            </Field>
          </div>
          <Field label="Adresse e-mail" htmlFor="email" required hint="Votre identifiant de connexion, et l'adresse où vous recevrez la réponse du titulaire.">
            <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Choisissez votre mot de passe" htmlFor="password" required hint="12 caractères au minimum, avec une majuscule et un chiffre.">
            <Input id="password" type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </Field>
          <Field label="Confirmez-le" htmlFor="confirm" required>
            <Input id="confirm" type="password" required minLength={12} autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={pending} leadingIcon={pending ? undefined : <Send className="size-[18px]" />}>
            Envoyer ma demande
          </Button>
        </div>
      )}
    </form>
  );
}
