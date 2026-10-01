import { AlertTriangle, Check, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Les illustrations du site : des écrans de PharmaBoost redessinés en HTML,
 * avec des produits et des prix d'exemple. Ce sont des illustrations de
 * l'interface, pas des données d'une officine.
 */

const frame = "overflow-hidden rounded-2xl border border-border-subtle bg-surface-card shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)]";

/** L'avis en coin d'écran, par-dessus le logiciel de gestion. */
export function ToastMock({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden="true">
      <div className="rounded-2xl border border-border-subtle bg-ink-100 p-3 dark:bg-ink-800">
        <div className="flex items-center gap-1.5 px-1 pb-2">
          <span className="size-2.5 rounded-full bg-ink-300" /><span className="size-2.5 rounded-full bg-ink-300" /><span className="size-2.5 rounded-full bg-ink-300" />
          <span className="ml-2 text-[11px] text-ink-500">Logiciel de gestion de l&apos;officine — Vente</span>
        </div>
        <div className="space-y-2 rounded-lg bg-white p-4 dark:bg-ink-900">
          {["AMOXICILLINE 1 g cp — 1 boîte", "DOLIPRANE 1000 mg cp — 1 boîte"].map((line) => (
            <div key={line} className="flex items-center justify-between rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 dark:border-ink-700 dark:text-ink-200">
              <span className="font-mono">{line}</span>
              <span className="text-ink-400">bip</span>
            </div>
          ))}
          <div className="h-16 rounded-md border border-dashed border-ink-200 dark:border-ink-700" />
        </div>
      </div>
      <div className="absolute -right-3 -bottom-4 w-[300px] rounded-xl border border-ink-800 bg-[#18211f] p-3.5 text-white shadow-2xl sm:-right-6">
        <p className="text-[11px] font-semibold text-brand-300">PharmaBoost · ORD-0042</p>
        <p className="mt-0.5 text-[13px] font-semibold">AMOXICILLINE 1 g · DOLIPRANE 1000 mg</p>
        <ul className="mt-2 space-y-1 text-[12.5px] leading-5">
          <li>• Probiotique 30 gélules · 14,90 € · Antibiothérapie : flore à protéger</li>
          <li>• Pastilles gorge · 5,90 € · Contexte ORL : gorge irritée fréquente</li>
        </ul>
        <p className="mt-2 text-[10.5px] text-ink-400">Cliquer pour ouvrir dans PharmaBoost · disparaît dans 15 s</p>
      </div>
    </div>
  );
}

/** La demande sans ordonnance : le besoin reconnu, les questions, la proposition. */
export function RequestMock({ className }: { className?: string }) {
  return (
    <div className={cn(frame, "p-5", className)} aria-hidden="true">
      <div className="rounded-lg border border-border-subtle bg-surface-sunken px-3.5 py-3 text-[13.5px] text-text-primary">
        « Nez bouché et mal à la gorge depuis hier, un peu de toux le soir. » · 34 ans
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {["Nez bouché ou qui coule", "Gorge irritée", "Toux irritante"].map((need) => (
          <span key={need} className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-800 dark:bg-brand-950/40 dark:text-brand-300">{need}</span>
        ))}
      </div>
      <p className="mt-4 text-[11.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">À vérifier avant de proposer</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-text-primary">
        <li>De la fièvre, et depuis combien de temps ?</li>
        <li>Un traitement en cours, une grossesse ?</li>
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          { name: "Spray nasal eau de mer", price: "6,90 €", why: "Lave le nez et aide à le dégager." },
          { name: "Pastilles gorge miel-citron", price: "5,90 €", why: "Apaise la gorge entre les prises." },
        ].map((item) => (
          <div key={item.name} className="rounded-xl border border-border-subtle p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-text-primary">{item.name}</p>
              <p className="text-[13.5px] font-semibold text-text-primary tabular">{item.price}</p>
            </div>
            <p className="mt-1 text-[12.5px] text-text-secondary">{item.why}</p>
            <p className="mt-1 text-[11.5px] text-text-tertiary">En stock · phrase de comptoir prête</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** La sécurité avant le conseil : une alerte qui ferme la zone des conseils. */
export function SafetyMock({ className }: { className?: string }) {
  return (
    <div className={cn(frame, "p-5", className)} aria-hidden="true">
      <div className="flex items-start gap-3 rounded-xl border border-warning-300 bg-warning-50 p-3.5 dark:border-warning-800 dark:bg-warning-950/30">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-700 dark:text-warning-400" />
        <div className="text-[13px] leading-5">
          <p className="font-semibold text-text-primary">Interaction documentée — à vérifier avant tout conseil</p>
          <p className="text-text-secondary">Millepertuis déconseillé avec ce traitement : les références qui en contiennent sont écartées d&apos;office.</p>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-xl border border-border-subtle p-3.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
        <div className="text-[13px] leading-5">
          <p className="font-semibold text-text-primary">Ordonnance d&apos;exception requise</p>
          <p className="text-text-secondary">Médicament d&apos;exception : la délivrance se fait sur formulaire Cerfa 12708, sinon le rejet est certain. Statut lu sur la base de l&apos;Assurance maladie.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-sunken px-3.5 py-2.5 text-[12.5px] text-text-secondary">
        <span>Conseils proposés après ces contrôles</span>
        <span className="flex items-center gap-1 font-medium text-text-primary"><Check className="size-3.5 text-success-600" /> 2 sur 5 retenus</span>
      </div>
    </div>
  );
}

/** Le pilotage : la valeur constatée, pas estimée. */
export function PilotMock({ className }: { className?: string }) {
  const rows = [
    { label: "Conseils proposés", value: "184" },
    { label: "Acceptés par l'équipe", value: "71" },
    { label: "Ventes additionnelles constatées", value: "612,40 €" },
  ];
  return (
    <div className={cn(frame, "p-5", className)} aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-text-primary">Semaine en cours · exemple</p>
        <span className="flex items-center gap-1 text-[12px] text-text-tertiary"><Sparkles className="size-3.5" /> constaté vente par vente</span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-border-subtle p-3.5">
            <dt className="text-[12px] text-text-tertiary">{row.label}</dt>
            <dd className="mt-1 text-[20px] font-semibold text-text-primary tabular">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 space-y-2">
        {[
          { rule: "Antibiotique → probiotique", state: "active" },
          { rule: "Laboratoire préféré : gamme hydratation", state: "active" },
          { rule: "Électrolytes : jamais sur le seul traitement", state: "règle de sécurité" },
        ].map((item) => (
          <div key={item.rule} className="flex items-center justify-between rounded-lg bg-surface-sunken px-3.5 py-2 text-[12.5px]">
            <span className="text-text-primary">{item.rule}</span>
            <span className="text-text-tertiary">{item.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
