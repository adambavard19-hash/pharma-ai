"use client";

import { useId, useState } from "react";
import { Calculator } from "lucide-react";
import { BONUS_TIERS, simulate, simulatorMax, toCount } from "@/core/sales/progressive-commission";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Le bouton du vrai total : un nombre d'activations, jamais un montant. */
function realLabel(count: number): string {
  if (count === 0) return "Aujourd'hui (0)";
  if (count === 1) return "Mon activation (1)";
  return `Mes ${count} activations`;
}

/**
 * « Simulateur de gains » : combien rapportent n pharmacies activées, d'après
 * la grille progressive (le même module que le calcul réel). Il part du vrai
 * total du commercial (ou du premier palier, 10, pour un commercial qui
 * démarre : un simulateur à 0 € ne donne envie de rien) ; le curseur, le champ
 * et les valeurs rapides se répondent. Sa borne dépasse toujours le vrai
 * total. Le résultat est annoncé aux lecteurs d'écran en une phrase.
 *
 * Au vrai total, le simulateur applique la grille à toutes les activations ;
 * les vrais gains, eux, suivent les dossiers (bonus en attente du premier
 * paiement, contrats en cours, montants d'avant la grille) : quand les deux
 * diffèrent, une ligne le dit au lieu de laisser deux « totaux » se contredire.
 */
export function EarningsSimulator({ realCount, realTotalCents, pendingBonusCents }: { realCount: number; realTotalCents: number; pendingBonusCents: number }) {
  const real = toCount(realCount);
  const max = simulatorMax(real);
  const start = real > 0 ? real : BONUS_TIERS[0].at;
  const [count, setCount] = useState(start);
  // Le texte du champ peut être vide ou en cours de saisie ; une valeur hors bornes est ramenée tout de suite dans les bornes.
  const [text, setText] = useState(String(start));
  const id = useId();

  const set = (value: number) => {
    const next = Math.min(max, toCount(value));
    setCount(next);
    setText(String(next));
  };

  const empty = text.trim() === "";
  const result = simulate(count);
  const today = simulate(real);
  const gain = result.totalCents - today.totalCents;
  const presets = [...new Set([real, ...BONUS_TIERS.map((bonus) => bonus.at)])].filter((value) => value <= max).sort((a, b) => a - b);
  const atReal = !empty && count === real;
  const differsFromReal = atReal && result.totalCents !== realTotalCents;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <label htmlFor={`${id}-nombre`} className="text-[13px] font-medium text-text-primary">
              Pharmacies activées
            </label>
            <p id={`${id}-bornes`} className="text-[12px] text-text-tertiary">
              De 0 à {max}
            </p>
          </div>
          <input
            id={`${id}-nombre`}
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={1}
            value={text}
            aria-describedby={`${id}-bornes`}
            onChange={(event) => {
              const raw = event.target.value;
              const value = Number(raw);
              if (raw === "" || !Number.isFinite(value)) {
                setText(raw);
                return;
              }
              // Hors bornes : le champ montre aussitôt la valeur retenue, jamais un nombre que le résultat ne suit pas.
              if (value > max || value < 0) set(value);
              else {
                setText(raw);
                setCount(toCount(value));
              }
            }}
            onBlur={() => setText(String(count))}
            className="w-24 rounded-md border border-border-default bg-surface-card px-3 py-2 text-right text-[18px] font-semibold tabular text-text-primary shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={count}
          onChange={(event) => set(Number(event.target.value))}
          aria-label="Pharmacies activées (curseur)"
          aria-valuetext={plural(count, "pharmacie activée", "pharmacies activées")}
          className="h-2 w-full cursor-pointer accent-brand-600"
        />
        <div className="flex justify-between text-[11.5px] text-text-tertiary tabular" aria-hidden="true">
          <span>0</span>
          <span>{max}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Valeurs rapides">
          {presets.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => set(value)}
              aria-pressed={!empty && count === value}
              className={cn(
                "min-h-11 rounded-full border px-3.5 text-[13px] font-medium tabular transition-colors",
                !empty && count === value ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-secondary hover:border-brand-300 hover:text-text-primary",
              )}
            >
              {value === real ? realLabel(value) : value}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("rounded-xl bg-surface-sunken p-4 transition-opacity", empty && "opacity-60")}>
        <p className="text-[12px] font-semibold tracking-wide text-text-tertiary uppercase">Gains estimés</p>
        <p className="mt-1 text-[32px] leading-none font-bold tracking-[-0.02em] tabular text-text-primary">{empty ? "—" : formatPriceEuros(result.totalCents)}</p>
        {empty ? (
          <p className="mt-1.5 text-[13px] text-text-secondary">Saisissez un nombre de pharmacies.</p>
        ) : (
          <>
            {/* Comparé à la grille au vrai total d'activations du commercial. */}
            {gain > 0 && <p className="mt-1.5 text-[13px] font-medium text-success-700">+{formatPriceEuros(gain)} par rapport à {real === 0 ? "aujourd'hui" : `vos ${plural(real, "activation", "activations")}`}</p>}
            {differsFromReal && (
              <p className="mt-1.5 text-[13px] text-text-secondary">
                Vos gains réels acquis : <span className="font-semibold text-text-primary tabular">{formatPriceEuros(realTotalCents)}</span>
                {pendingBonusCents > 0 ? ` — ${formatPriceEuros(pendingBonusCents)} de bonus attendent le 1er paiement.` : " — ils suivent vos dossiers (contrats en cours, montants d'avant la grille)."}
              </p>
            )}
          </>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <div>
            <dt className="text-text-secondary">Commissions</dt>
            <dd className="font-semibold tabular text-text-primary">{empty ? "—" : formatPriceEuros(result.commissionsCents)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Bonus</dt>
            <dd className="font-semibold tabular text-text-primary">{empty ? "—" : formatPriceEuros(result.bonusesCents)}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Commission à ce niveau</dt>
            <dd className="font-semibold tabular text-text-primary">{empty ? "—" : `${formatPriceEuros(result.rateCents)} / pharmacie`}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Prochain bonus</dt>
            <dd className="font-semibold text-text-primary">{empty ? "—" : result.nextBonus ? `${result.nextBonus.name} +${formatPriceEuros(result.nextBonus.cents)}` : "Tous atteints"}</dd>
          </div>
        </dl>
        {!empty && result.nextBonus && <p className="mt-3 text-[12.5px] text-text-secondary">Encore {plural(result.nextBonus.remaining, "pharmacie", "pharmacies")} pour le bonus {result.nextBonus.name}.</p>}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {empty
          ? "Saisissez un nombre de pharmacies."
          : `Avec ${plural(count, "pharmacie activée", "pharmacies activées")} : ${formatPriceEuros(result.commissionsCents)} de commissions, ${formatPriceEuros(result.bonusesCents)} de bonus, ${formatPriceEuros(result.totalCents)} au total.`}
      </p>

      <p className="flex items-start gap-1.5 text-[12px] leading-4 text-text-tertiary">
        <Calculator className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        Simulation cumulative, hors charges. Bonus attribués une seule fois par palier.
      </p>
    </div>
  );
}
