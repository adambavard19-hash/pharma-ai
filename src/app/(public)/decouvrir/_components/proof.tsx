import { BadgeEuro, CalendarCheck, LineChart, ShieldCheck } from "lucide-react";
import { formatEuros } from "@/core/billing/subscription";

/**
 * « Vendre plus, et le prouver » : la section qui dit comment le chiffre
 * d'affaires additionnel est constaté, pas estimé. Les nombres réels
 * n'apparaissent que lorsqu'ils existent (`live`), agrégés sur l'ensemble des
 * officines, jamais une officine seule. Aucun chiffre n'est inventé.
 */
export type LiveProof = { acceptedAdvices: number; attributedCents: number; attributedMarginCents: number; pharmacies: number } | null;

export function ProofSection({ live }: { live: LiveProof }) {
  return (
    <section id="preuve" className="scroll-mt-20 bg-brand-900 py-20 text-white">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-300 uppercase">Vendre plus, et le prouver</p>
          <h2 className="mt-2 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance md:text-[36px]">Chaque euro de vente additionnelle est constaté, pas promis.</h2>
          <p className="mt-4 text-[16.5px] leading-7 text-brand-100">Un conseil accepté au comptoir est rattaché à la vente qui le suit. Le chiffre d&apos;affaires et la marge que PharmaBoost rapporte se lisent dans votre tableau de bord, vente par vente, collaborateur par collaborateur. Pas une estimation, pas un pourcentage de brochure : vos ventes.</p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            { icon: BadgeEuro, t: "Le rattachement est fait à l'instant du geste", d: "Quand le pharmacien accepte un conseil et l'encaisse, la ligne de vente porte la mention « issue d'un conseil PharmaBoost ». Une référence simplement scannée n'est jamais comptée. On aurait pu tout compter et gonfler le chiffre ; c'est précisément ce que l'outil s'interdit." },
            { icon: LineChart, t: "Le tableau de bord du titulaire", d: "Taux de proposition, taux d'acceptation, panier additionnel moyen, chiffre d'affaires et marge additionnels du mois, par collaborateur. Comparés à la période précédente. Vous savez ce que l'outil rapporte avant de décider de le garder." },
            { icon: ShieldCheck, t: "Sans engagement, pour une raison", d: "Si votre tableau de bord ne montre pas que PharmaBoost se paie, vous arrêtez par simple e-mail. Nous préférons une officine qui mesure à une officine qui espère." },
          ].map((item) => (
            <div key={item.t} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <item.icon className="size-5 text-accent-300" aria-hidden="true" />
              <p className="mt-3 text-[15.5px] font-semibold">{item.t}</p>
              <p className="mt-2 text-[14px] leading-6 text-brand-100">{item.d}</p>
            </div>
          ))}
        </div>

        {live ? (
          <div className="mt-10 rounded-2xl border border-accent-400/40 bg-white/5 p-6">
            <p className="text-[12.5px] font-semibold tracking-[0.08em] text-accent-300 uppercase">Chiffres réels, toutes officines équipées</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-4">
              <Stat label="Officines" value={String(live.pharmacies)} />
              <Stat label="Conseils acceptés" value={live.acceptedAdvices.toLocaleString("fr-FR")} />
              <Stat label="Ventes additionnelles" value={formatEuros(live.attributedCents)} />
              <Stat label="Marge additionnelle" value={formatEuros(live.attributedMarginCents)} />
            </dl>
            <p className="mt-3 text-[12.5px] text-brand-200">Lus dans les ventes enregistrées, mis à jour en continu. Hors démonstration.</p>
          </div>
        ) : (
          <p className="mt-10 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-[14px] leading-6 text-brand-100">
            Les chiffres réels des officines équipées s&apos;afficheront ici, lus dans leurs ventes, dès que le premier mois d&apos;usage sera écoulé. Nous ne publions pas de chiffre que nous n&apos;avons pas constaté.
          </p>
        )}

        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-300 uppercase">Un suivi patient qui fait sérieux</p>
            <h3 className="mt-2 text-[24px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">Le patient repart avec son plan, et son téléphone lui rappelle chaque prise.</h3>
            <ul className="mt-5 space-y-3 text-[14.5px] leading-6 text-brand-100">
              <li className="flex gap-3"><CalendarCheck className="mt-1 size-4 shrink-0 text-accent-300" /><span><strong className="text-white">Le plan de prise</strong>, matin, midi, soir, avec la durée et les précautions, remis par QR code, e-mail ou papier, aux couleurs de votre officine.</span></li>
              <li className="flex gap-3"><CalendarCheck className="mt-1 size-4 shrink-0 text-accent-300" /><span><strong className="text-white">Les rappels dans l&apos;agenda du patient</strong>, pour toute la durée du traitement, en un bouton. Sans application à installer.</span></li>
              <li className="flex gap-3"><CalendarCheck className="mt-1 size-4 shrink-0 text-accent-300" /><span><strong className="text-white">Le dernier jour</strong>, un rappel invite à repasser vous voir si quelque chose ne va pas. Le patient voit sa pharmacie, pas un logiciel.</span></li>
            </ul>
          </div>
          <div>
            <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-300 uppercase">Ce que nous n&apos;avons vu nulle part ailleurs</p>
            <h3 className="mt-2 text-[24px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">Un conseil qui passe la sécurité et la réglementation avant d&apos;exister.</h3>
            <ul className="mt-5 space-y-2.5 text-[14.5px] leading-6 text-brand-100">
              {[
                "L'ordonnance lue en entier, manuscrite comprise, et vérifiée ligne par ligne par un professionnel.",
                "Interactions, contre-indications, cent règles de vigilance écrites par un pharmacien : avant tout conseil, jamais après.",
                "Le statut de chaque boîte lu sur les bases officielles : ordonnance d'exception, stupéfiants, prescription restreinte. Fini le rejet qui arrive trois semaines plus tard.",
                "Le conseil arrive au bip de la douchette, par-dessus votre logiciel, sans second scan ni changement d'écran.",
                "Le chiffre d'affaires additionnel constaté, pas estimé. Et aucune donnée de santé conservée sur vos patients.",
              ].map((item) => (
                <li key={item} className="flex gap-3"><span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent-300" aria-hidden="true" />{item}</li>
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
