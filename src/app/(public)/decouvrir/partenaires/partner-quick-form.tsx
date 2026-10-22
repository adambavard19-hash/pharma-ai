"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, FlaskConical, Tag } from "lucide-react";
import { submitPartnerApplicationAction } from "@/server/actions/partner-applications";
import { cn } from "@/lib/utils";

type Kind = "Laboratoire" | "Marque";

const WISHES = ["Une offre dans l'appli", "De la visibilité", "Être en pharmacie", "Autre"];

const FIELD = "h-12 w-full rounded-xl border border-border-default bg-surface-app px-4 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/**
 * L'inscription partenaire, courte (fondateur, 22 oct. 2026) : laboratoire ou marque, sa demande, ses coordonnées (téléphone
 * facultatif). Elle passe par la même action que la candidature complète : l'équipe la reçoit dans la console, le candidat
 * reçoit l'accusé de réception.
 */
export function PartnerQuickForm() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [company, setCompany] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [wishes, setWishes] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  if (sent)
    return (
      <div data-partenaire-envoye="" className="rounded-3xl border border-brand-200 bg-brand-50 p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-brand-600" aria-hidden="true" />
        <p className="mt-4 text-[24px] font-semibold tracking-[-0.02em] text-text-primary">Merci, c&apos;est reçu !</p>
        <p className="mt-2 text-[16px] leading-7 text-text-secondary">Notre équipe revient vers vous très rapidement.</p>
      </div>
    );

  const submit = () => {
    setError(null);
    if (!kind) return setError("Vous êtes un laboratoire ou une marque ?");
    if (company.trim().length < 2) return setError("Indiquez le nom de votre société ou de votre marque.");
    if (!firstName.trim() || !lastName.trim()) return setError("Indiquez votre prénom et votre nom.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Indiquez une adresse e-mail valide pour que nous puissions vous répondre.");
    if (!consent) return setError("Cochez la case pour que nous puissions traiter votre demande.");
    const text = [`Vous êtes : ${kind}`, wishes.length ? `Demande : ${wishes.join(", ")}` : null].filter(Boolean).join("\n");
    start(async () => {
      const result = await submitPartnerApplicationAction({
        company: company.trim(),
        brand: company.trim().slice(0, 120),
        contactFirstName: firstName.trim(),
        contactLastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: text.slice(0, 2000),
        consent,
        website: trap,
      });
      if (result.ok) setSent(true);
      else setError(result.error ?? "Votre demande n'a pas pu être envoyée.");
    });
  };

  return (
    <form
      data-partenaire-formulaire=""
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="rounded-3xl border border-border-subtle bg-surface-card p-5 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.45)] sm:p-8"
    >
      <p className="text-[14px] font-semibold text-text-primary">Vous êtes</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {([["Laboratoire", FlaskConical], ["Marque", Tag]] as const).map(([value, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={cn("flex h-14 items-center justify-center gap-2 rounded-2xl border text-[15.5px] font-semibold transition-all", kind === value ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-100" : "border-border-default bg-surface-app text-text-primary hover:border-brand-300")}
          >
            <Icon className="size-5" aria-hidden="true" /> {value === "Laboratoire" ? "Un laboratoire" : "Une marque"}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="text-[14px] font-semibold text-text-primary">Société ou marque</span>
        <input className={cn(FIELD, "mt-2")} value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" maxLength={160} />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[14px] font-semibold text-text-primary">Prénom</span>
          <input className={cn(FIELD, "mt-2")} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" maxLength={80} />
        </label>
        <label className="block">
          <span className="text-[14px] font-semibold text-text-primary">Nom</span>
          <input className={cn(FIELD, "mt-2")} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" maxLength={80} />
        </label>
      </div>

      <p className="mt-5 text-[14px] font-semibold text-text-primary">Votre demande</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {WISHES.map((wish) => {
          const on = wishes.includes(wish);
          return (
            <button key={wish} type="button" aria-pressed={on} onClick={() => setWishes(on ? wishes.filter((w) => w !== wish) : [...wishes, wish])} className={cn("rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition-colors", on ? "border-brand-500 bg-brand-600 text-white" : "border-border-default bg-surface-app text-text-primary hover:border-brand-300")}>
              {wish}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[14px] font-semibold text-text-primary">E-mail</span>
          <input className={cn(FIELD, "mt-2")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" maxLength={160} />
        </label>
        <label className="block">
          <span className="text-[14px] font-semibold text-text-primary">
            Téléphone <span className="font-normal text-text-tertiary">· facultatif</span>
          </span>
          <input className={cn(FIELD, "mt-2")} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" maxLength={30} />
        </label>
      </div>
      {/* Pot de miel : invisible pour un humain. */}
      <input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} className="hidden" aria-hidden="true" />

      <label className="mt-5 flex cursor-pointer items-start gap-3 text-[13.5px] leading-5 text-text-secondary">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand-600)]" />
        J&apos;accepte d&apos;être recontacté par PharmaBoost.
      </label>

      {error && <p role="alert" className="mt-4 rounded-xl bg-danger-50 px-4 py-3 text-[14px] text-danger-700">{error}</p>}

      <button type="submit" disabled={pending} className="mt-6 inline-flex h-13 w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3.5 text-[16px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60">
        {pending ? "Envoi…" : "Envoyer ma demande"} <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
