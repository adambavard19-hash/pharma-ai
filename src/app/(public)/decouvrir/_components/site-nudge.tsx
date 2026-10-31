"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { Robot } from "@/components/robot";
import { NUDGE_PROFILES, PROFILE_INTERESTS, PROFILE_LABEL, type NudgeProfile, type NudgeTrigger } from "@/core/site/site-nudge";
import { chooseNudgeProfileAction, countNudgeAction, sendNudgeDetailsAction } from "@/server/actions/site-nudge";

/**
 * La bulle du site (fondateur, 30 oct. 2026) : après un vrai moment sur le site — 1 min 30, ou dès 30 s quand le visiteur
 * regarde le tarif, lance la vidéo ou ouvre Partenaires / Affiliation —, le robot demande « Vous êtes plutôt… ? ». Une seule
 * fois par visiteur, refermable d'un clic, jamais par-dessus le contenu. `?bulle=1` la montre tout de suite (essai).
 */
const SECONDS_KEY = "pb-site-temps";
const PAGES_KEY = "pb-site-pages";
const DONE_KEY = "pb-bulle-v1";
const SKIP = [/^\/decouvrir\/demo/, /^\/decouvrir\/abonnement/, /^\/abonnement/, /^\/decouvrir\/mentions-legales/, /^\/decouvrir\/confidentialite/];

const CTA: Partial<Record<NudgeProfile, { href: string; label: string }>> = {
  PHARMACIEN: { href: "/decouvrir/demo", label: "Réserver une démo" },
  LABORATOIRE: { href: "/decouvrir/partenaires", label: "Voir l'offre partenaires" },
  COMMERCIAL: { href: "/decouvrir/affiliation", label: "Voir l'affiliation" },
};

const QUESTION: Record<NudgeProfile, string> = {
  PHARMACIEN: "Qu'est-ce qui vous intéresse le plus ?",
  LABORATOIRE: "Qu'aimeriez-vous faire avec PharmaBoost ?",
  COMMERCIAL: "Vous êtes plutôt…",
  DECOUVERTE: "Une question sur PharmaBoost ?",
};

function store<T>(kind: "session" | "local", key: string, fallback: T): T {
  try {
    const raw = (kind === "session" ? window.sessionStorage : window.localStorage).getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function save(kind: "session" | "local", key: string, value: unknown) {
  try {
    (kind === "session" ? window.sessionStorage : window.localStorage).setItem(key, JSON.stringify(value));
  } catch {
    // mémoire du navigateur indisponible : la bulle vaut pour la page
  }
}

export function SiteNudge() {
  const pathname = usePathname();
  const [trigger, setTrigger] = useState<NudgeTrigger | null>(null);
  const [step, setStep] = useState<"choix" | "suite" | "merci">("choix");
  const [profile, setProfile] = useState<NudgeProfile | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState({ interest: "", message: "", name: "", email: "", phone: "", website: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const shown = useRef(false);
  // Le profil part au serveur dès le clic : l'envoi de la suite attend sa réponse (l'identifiant de la réponse).
  const choice = useRef<Promise<string | null> | null>(null);

  // Les pages vues, dans l'ordre (le chemin seul, sans les paramètres).
  useEffect(() => {
    const pages = store<string[]>("session", PAGES_KEY, []);
    const page = pathname.replace(/^\/decouvrir/, "") || "/";
    if (pages[pages.length - 1] !== page) save("session", PAGES_KEY, [...pages, page].slice(-20));
  }, [pathname]);

  // Le temps passé sur le site (onglet visible seulement), et les signaux d'intérêt.
  useEffect(() => {
    if (shown.current) return;
    const forced = new URLSearchParams(window.location.search).get("bulle") === "1";
    if (!forced && (store("local", DONE_KEY, false) || SKIP.some((re) => re.test(pathname)))) return;
    const open = (why: NudgeTrigger) => {
      if (shown.current) return;
      shown.current = true;
      save("local", DONE_KEY, true);
      setTrigger(why);
      void countNudgeAction("shown");
    };
    if (forced) {
      open("TEMPS");
      return;
    }
    let interest: NudgeTrigger | null = /^\/decouvrir\/(partenaires|affiliation)/.test(pathname) ? "PAGE" : null;
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const seconds = store<number>("session", SECONDS_KEY, 0) + 1;
      save("session", SECONDS_KEY, seconds);
      if (seconds >= 90) open("TEMPS");
      else if (interest && seconds >= 30) open(interest);
    }, 1000);
    const onPlay = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) interest = "VIDEO";
    };
    document.addEventListener("play", onPlay, true);
    const tarif = document.getElementById("tarif");
    const watcher = tarif ? new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && (interest = interest ?? "TARIF"), { threshold: 0.35 }) : null;
    if (tarif && watcher) watcher.observe(tarif);
    return () => {
      clearInterval(tick);
      document.removeEventListener("play", onPlay, true);
      watcher?.disconnect();
    };
  }, [pathname]);

  if (!trigger) return null;

  const close = () => {
    if (step === "choix") void countNudgeAction("closed");
    setTrigger(null);
  };

  const choose = async (value: NudgeProfile) => {
    setProfile(value);
    setStep("suite");
    choice.current = chooseNudgeProfileAction({ profile: value, trigger, seconds: store<number>("session", SECONDS_KEY, 0), pages: store<string[]>("session", PAGES_KEY, []) }).then((result) => (result.ok ? result.data.id : null));
    setId(await choice.current);
  };

  const send = async () => {
    const answerId = id ?? (await choice.current);
    if (!answerId) return setStep("merci");
    setSending(true);
    setError("");
    const result = await sendNudgeDetailsAction({ id: answerId, ...form });
    setSending(false);
    if (!result.ok) return setError(result.error);
    setStep("merci");
  };

  const field = "h-9 w-full rounded-xl border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand-600";

  return (
    <div data-bulle-site="" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40 w-[min(22rem,calc(100vw-2rem))] animate-[pb-bulle_.35s_cubic-bezier(.2,.8,.2,1)] rounded-3xl border border-border-subtle bg-surface-card p-4 shadow-[0_24px_60px_-20px_rgba(15,43,38,.45)]">
      <style>{"@keyframes pb-bulle{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){[data-bulle-site]{animation:none!important}}"}</style>
      <button type="button" onClick={close} aria-label="Fermer" className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Robot size={40} mood="happy" />
        <p className="pt-1 text-[15px] leading-5 font-semibold text-text-primary">
          {step === "choix" ? "Je peux vous aider ? Vous êtes plutôt…" : step === "suite" && profile ? QUESTION[profile] : "Merci ! Nous revenons vers vous très vite."}
        </p>
      </div>

      {step === "choix" && (
        <div className="mt-3 grid gap-1.5">
          {NUDGE_PROFILES.map((value) => (
            <button key={value} type="button" data-bulle-profil={value} onClick={() => void choose(value)} className="flex h-10 items-center justify-between rounded-xl border border-border-subtle bg-surface-app px-3.5 text-left text-[14px] font-semibold text-text-primary transition-colors hover:border-brand-600 hover:bg-brand-50">
              {PROFILE_LABEL[value]}
              <ArrowRight className="size-4 text-brand-700" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {step === "suite" && profile && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {PROFILE_INTERESTS[profile].length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {PROFILE_INTERESTS[profile].map((interest) => (
                <button key={interest} type="button" onClick={() => setForm((f) => ({ ...f, interest: f.interest === interest ? "" : interest }))} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ${form.interest === interest ? "ring-brand-600" : "bg-surface-app text-text-primary ring-border-subtle hover:ring-brand-600"}`} style={form.interest === interest ? { background: "var(--color-brand-600)", color: "#fff", opacity: 1 } : undefined}>
                  {interest}
                </button>
              ))}
            </div>
          )}
          {(profile === "DECOUVERTE" || form.interest === "Autre chose") && (
            <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} maxLength={600} rows={2} placeholder="Votre question ou votre message" className={`${field} h-auto py-2`} />
          )}
          <p className="pt-1 text-[12px] font-semibold text-text-secondary">Pour vous recontacter (facultatif)</p>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={80} placeholder={profile === "PHARMACIEN" ? "Nom et pharmacie" : profile === "LABORATOIRE" ? "Nom et laboratoire" : "Votre nom"} className={field} />
          <div className="grid grid-cols-2 gap-1.5">
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} maxLength={160} placeholder="E-mail" className={field} />
            <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} maxLength={24} placeholder="Téléphone" className={field} />
          </div>
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} className="hidden" />
          {error && <p className="text-[12.5px] font-semibold text-danger-700">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={sending} className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-brand-600 px-4 text-[14px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {sending ? "Envoi…" : "Envoyer"}
            </button>
            {CTA[profile] && (
              <Link href={CTA[profile]!.href} onClick={() => void send()} className="inline-flex h-10 items-center rounded-full px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
                {CTA[profile]!.label}
              </Link>
            )}
          </div>
          <p className="text-[11px] leading-4 text-text-tertiary">
            Vos coordonnées servent seulement à vous recontacter. <Link href="/decouvrir/confidentialite" className="underline">Confidentialité</Link>
          </p>
        </form>
      )}

      {step === "merci" && profile && CTA[profile] && (
        <Link href={CTA[profile]!.href} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-[14px] font-semibold text-white hover:bg-brand-700">
          {CTA[profile]!.label} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
