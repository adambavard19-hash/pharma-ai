import { BellRing, CalendarCheck, FileSearch, QrCode, ScanLine, ShieldCheck, Smartphone, UserX } from "lucide-react";
import { formatEuros } from "@/core/billing/subscription";
import { ProofStory } from "./proof-story";

/**
 * « Vendre plus, et le voir » : la chaîne animée, trois pastilles, et les
 * chiffres réels agrégés quand ils existent. Le moins de texte possible.
 */
export type LiveProof = { acceptedAdvices: number; attributedCents: number; attributedMarginCents: number; pharmacies: number } | null;

export function ProofSection({ live }: { live: LiveProof }) {
  return (
    <section id="preuve" className="scroll-mt-20 bg-brand-900 py-20 text-white">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-300 uppercase">Vendre plus, et le voir</p>
          <h2 className="mt-2 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance md:text-[36px]">Du bip à l&apos;euro, en quatre temps.</h2>
        </div>

        <div className="mt-10">
          <ProofStory />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Vérifié avant d'être proposé" },
            { icon: ScanLine, t: "Au bip, sans second scan" },
            { icon: BellRing, t: "Sans engagement : si ça ne se voit pas, vous arrêtez" },
          ].map((item) => (
            <p key={item.t} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[14px] font-medium">
              <item.icon className="size-5 shrink-0 text-accent-300" aria-hidden="true" />
              {item.t}
            </p>
          ))}
        </div>

        {live ? (
          <div className="mt-8 rounded-2xl border border-accent-400/40 bg-white/5 p-6">
            <p className="text-[12.5px] font-semibold tracking-[0.08em] text-accent-300 uppercase">Chiffres réels, toutes officines équipées</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-4">
              <Stat label="Officines" value={String(live.pharmacies)} />
              <Stat label="Conseils acceptés" value={live.acceptedAdvices.toLocaleString("fr-FR")} />
              <Stat label="Ventes additionnelles" value={formatEuros(live.attributedCents)} />
              <Stat label="Marge additionnelle" value={formatEuros(live.attributedMarginCents)} />
            </dl>
          </div>
        ) : (
          <p className="mt-8 text-[13px] text-brand-200">Les chiffres réels des officines équipées s&apos;afficheront ici dès le premier mois d&apos;usage. Pas avant.</p>
        )}

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-300 uppercase">Un suivi patient qui fait sérieux</p>
            <h3 className="mt-2 text-[22px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">Son plan, ses rappels, sur son téléphone.</h3>
            <ul className="mt-4 grid gap-2">
              {[
                { icon: QrCode, t: "Plan de prise remis par QR code, e-mail ou papier" },
                { icon: Smartphone, t: "Rappels de chaque prise dans son agenda, en un bouton" },
                { icon: CalendarCheck, t: "Le dernier jour : « passez nous voir si ça ne va pas »" },
              ].map((item) => (
                <li key={item.t} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2.5 text-[14px]">
                  <item.icon className="size-4 shrink-0 text-accent-300" aria-hidden="true" />{item.t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-300 uppercase">Ce que nous n&apos;avons vu nulle part ailleurs</p>
            <h3 className="mt-2 text-[22px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">La sécurité et la réglementation avant le conseil.</h3>
            <ul className="mt-4 grid gap-2">
              {[
                { icon: FileSearch, t: "L'ordonnance lue en entier, manuscrite comprise" },
                { icon: ShieldCheck, t: "Interactions, vigilances, ordonnance d'exception : avant, jamais après" },
                { icon: UserX, t: "Aucune donnée de santé conservée sur vos patients" },
              ].map((item) => (
                <li key={item.t} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2.5 text-[14px]">
                  <item.icon className="size-4 shrink-0 text-accent-300" aria-hidden="true" />{item.t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-brand-200">{label}</dt>
      <dd className="mt-1 text-[26px] font-semibold tabular">{value}</dd>
    </div>
  );
}
