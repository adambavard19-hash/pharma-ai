import Link from "next/link";
import { ArrowRight, Check, Crown, Lock, Medal, Sparkles, Trophy } from "lucide-react";
import { BONUS_TIERS, COMMISSION_TIERS, REWARD_STATE_LABELS, nextActivationGain, rankLabel, tierForRank, type EarningsSummary, type Reward, type Simulation } from "@/core/sales/progressive-commission";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Les blocs du tableau de bord « Mes commissions & bonus », rendus côté
 * serveur à partir des VRAIS chiffres du commercial (ses lignes de commission,
 * ses activations) et de la grille progressive. Le simulateur, seul bloc
 * interactif, vit à part (`earnings-simulator.tsx`).
 *
 * Vocabulaire : un palier est « atteint » quand le total d'activations y
 * arrive ; un bonus est « débloqué » quand il est ACQUIS (premier paiement de
 * la pharmacie du palier reçu), puis « versé ».
 */

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

// ---------------------------------------------------------------- Gains cumulés

/**
 * Le bloc de tête, sur le dégradé de marque PROFOND : tout le petit texte y est
 * blanc (6,5:1 au moins) ou blanc à 90 % (5,6:1 au moins), les tuiles sont
 * assombries plutôt qu'éclaircies.
 */
export function EarningsHero({ summary, thisMonthCents, firstSteps }: { summary: EarningsSummary; thisMonthCents: number; firstSteps: boolean }) {
  const figures = [
    ["Acquis ce mois", thisMonthCents],
    ["Déjà versé", summary.paidCents],
    ["À verser", summary.toBePaidCents],
  ] as const;
  const bronze = BONUS_TIERS[0];
  return (
    <section aria-labelledby="gains-cumules" className="relative overflow-hidden rounded-2xl bg-brand-gradient-deep p-5 text-white shadow-card sm:p-7">
      <Trophy className="pointer-events-none absolute -top-4 -right-4 size-32 text-white/10 sm:size-40" aria-hidden="true" strokeWidth={1.5} />
      <div className="relative space-y-4">
        <div>
          <h2 id="gains-cumules" className="text-[12.5px] font-semibold tracking-wide text-white uppercase">
            Gains cumulés
          </h2>
          <p className="mt-1.5 text-[40px] leading-none font-bold tracking-[-0.03em] tabular sm:text-[48px]">{formatPriceEuros(summary.totalCents)}</p>
          <p className="mt-2 text-[13.5px] text-white/90">
            {formatPriceEuros(summary.commissionsCents)} de commissions · {formatPriceEuros(summary.bonusesCents)} de bonus
          </p>
          {summary.upcomingCents > 0 && (
            <p className="mt-2.5 inline-flex rounded-full bg-black/15 px-2.5 py-1 text-[12.5px] font-medium text-white">+{formatPriceEuros(summary.upcomingCents)} à venir (contrats et bonus en cours)</p>
          )}
        </div>
        {firstSteps ? (
          // Premier jour : pas un mur de zéros, mais ce que rapporte la première activation et où agir.
          <div className="max-w-xl space-y-3">
            <p className="text-[14.5px] leading-6 font-medium text-white">
              Votre 1re pharmacie activée vous rapporte {formatPriceEuros(COMMISSION_TIERS[0].rateCents)}. À {bronze.at}, le bonus {bronze.name} ajoute {formatPriceEuros(bronze.cents)}.
            </p>
            <Link href="/extranet/pipeline" className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-brand-800 shadow-xs transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Voir mon pipeline
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <dl className="grid grid-cols-3 gap-2 sm:max-w-md">
            {figures.map(([label, cents]) => (
              <div key={label} className="rounded-xl bg-black/12 px-3 py-2.5">
                <dt className="text-[11.5px] leading-4 text-white">{label}</dt>
                <dd className="mt-0.5 text-[15px] font-semibold tabular text-white">{formatPriceEuros(cents)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Progression vers le prochain bonus

/** Les quatre étapes de la piste : 0→10, 10→25, 25→50, 50→100, chacune remplie selon l'avancement. */
function segments(count: number) {
  return BONUS_TIERS.map((tier, index) => {
    const from = index === 0 ? 0 : BONUS_TIERS[index - 1].at;
    const fill = Math.max(0, Math.min(1, (count - from) / (tier.at - from)));
    return { tier, fill, reached: count >= tier.at };
  });
}

export function BonusProgress({ simulation }: { simulation: Simulation }) {
  const { pharmacies: count, nextBonus, nextTier } = simulation;
  const last = BONUS_TIERS[BONUS_TIERS.length - 1];
  const next = nextActivationGain(count);
  // Le prochain palier de commission tombe pile sur le prochain bonus (à 0 ou à 9 : la 10e) : on ne répète pas « encore N ».
  const tierAtBonus = nextTier !== null && nextBonus !== null && nextTier.from === nextBonus.at;
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-text-secondary">{nextBonus ? "Prochain bonus" : "Paliers de bonus"}</p>
            <h2 className="mt-0.5 text-[20px] leading-7 font-bold text-text-primary">
              {nextBonus ? (
                <>
                  {nextBonus.name} <span className="text-brand-700">+{formatPriceEuros(nextBonus.cents)}</span>
                </>
              ) : (
                "Les quatre paliers sont atteints"
              )}
            </h2>
          </div>
          <p className="text-[26px] leading-none font-bold tabular text-text-primary">
            {count}
            {nextBonus && <span className="text-[16px] font-medium text-text-tertiary"> / {nextBonus.at}</span>}
          </p>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={last.at}
          aria-valuenow={Math.min(count, last.at)}
          aria-valuetext={nextBonus ? `${plural(count, "pharmacie activée", "pharmacies activées")}, prochain bonus ${nextBonus.name} à ${nextBonus.at}` : `${plural(count, "pharmacie activée", "pharmacies activées")}, les quatre paliers sont atteints`}
          aria-label="Progression vers les bonus de palier"
          className="grid grid-cols-4 gap-1.5"
        >
          {segments(count).map(({ tier, fill, reached }) => (
            <div key={tier.at} className="min-w-0 space-y-2">
              <div className="h-2.5 overflow-hidden rounded-full bg-ink-200">
                {/* Remplissages assez foncés pour se lire sur la piste (3:1 au moins) : vert pour un palier atteint, teal pour l'étape en cours. */}
                <div className={cn("h-full rounded-full", reached ? "bg-success-700" : "bg-brand-600")} style={{ width: `${Math.round(fill * 100)}%` }} />
              </div>
              <div className="flex flex-col items-end text-right">
                <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold tabular", reached ? "text-success-700" : "text-text-primary")}>
                  {reached && <Check className="size-3.5" aria-hidden="true" />}
                  {tier.at}
                </span>
                <span className="truncate text-[11.5px] text-text-tertiary">{tier.name}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 text-[13.5px]">
          {nextBonus ? (
            <p className="font-semibold text-text-primary">Encore {plural(nextBonus.remaining, "pharmacie", "pharmacies")} à activer.</p>
          ) : (
            <p className="font-semibold text-success-700">Chaque nouvelle pharmacie vous rapporte {formatPriceEuros(simulation.nextRateCents)}.</p>
          )}
          {nextTier && (
            <p className="text-text-secondary">
              Dès la {rankLabel(nextTier.from)} pharmacie, chaque activation rapporte {formatPriceEuros(nextTier.rateCents)}
              {tierAtBonus ? "." : ` (encore ${plural(nextTier.remaining, "pharmacie", "pharmacies")}).`}
            </p>
          )}
          <p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-brand-50 px-3 py-2 text-[13.5px] text-brand-800 ring-1 ring-brand-200 ring-inset">
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Votre prochaine activation : <span className="font-bold tabular">+{formatPriceEuros(next.totalCents)}</span>
              {next.bonus && (
                <span className="text-brand-700">
                  {" "}
                  ({formatPriceEuros(next.rateCents)} + bonus {next.bonus.name})
                </span>
              )}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- Mes récompenses

/** Quatre médailles qu'on distingue d'un coup d'œil : cuivre, argent, or, teal. */
const MEDAL_TONES: Record<string, string> = {
  Bronze: "bg-warning-700/15 text-warning-800 ring-warning-700/30",
  Argent: "bg-ink-100 text-ink-700 ring-ink-300",
  Or: "bg-accent-100 text-accent-700 ring-accent-300",
  Élite: "bg-brand-100 text-brand-800 ring-brand-300",
};

const STATE_TONES: Record<Reward["state"], "success" | "brand" | "warning" | "neutral" | "danger"> = {
  PAID: "success",
  EARNED: "brand",
  AWAITING_PAYMENT: "warning",
  BEFORE_GRID: "neutral",
  LOCKED: "neutral",
  CANCELLED: "danger",
};

/** Une médaille « en couleur » : le palier est atteint et le bonus existe (versé, acquis ou en attente du premier paiement). */
const LIT: ReadonlySet<Reward["state"]> = new Set(["PAID", "EARNED", "AWAITING_PAYMENT"]);

export function Rewards({ rewards }: { rewards: Reward[] }) {
  return (
    <section aria-labelledby="mes-recompenses" className="space-y-3">
      <div>
        <h2 id="mes-recompenses" className="text-[16px] leading-6 font-semibold text-text-primary">
          Mes récompenses
        </h2>
        <p className="text-[13px] text-text-secondary">Chaque bonus est versé une seule fois, après l&apos;activation et le premier paiement de la pharmacie qui atteint le palier.</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {rewards.map((reward) => {
          const locked = reward.state === "LOCKED";
          const lit = LIT.has(reward.state);
          const Icon = reward.name === "Élite" ? Crown : Medal;
          return (
            <li key={reward.at}>
              <Card className={cn("h-full p-4", lit ? "border-brand-200 bg-gradient-to-br from-brand-50 to-surface-card" : "bg-surface-card")}>
                <span className={cn("relative flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", lit ? MEDAL_TONES[reward.name] : "bg-surface-sunken text-text-tertiary ring-border-subtle")}>
                  <Icon className="size-5" aria-hidden="true" />
                  {locked && (
                    <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-surface-card ring-1 ring-border-subtle">
                      <Lock className="size-3" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <p className="mt-3 text-[15px] leading-5 font-semibold text-text-primary">{reward.name}</p>
                <p className="text-[12px] font-medium text-text-tertiary tabular">{plural(reward.at, "pharmacie", "pharmacies")}</p>
                <p className={cn("mt-1 text-[22px] leading-7 font-bold tabular", lit ? "text-text-primary" : "text-text-secondary")}>+{formatPriceEuros(reward.cents)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {/* « En attente du 1er paiement » passe à la ligne sur un téléphone plutôt que de sortir de la carte. */}
                  <Badge tone={STATE_TONES[reward.state]} className="whitespace-normal">{REWARD_STATE_LABELS[reward.state]}</Badge>
                  {locked && <span className="text-[12px] text-text-tertiary">encore {plural(reward.remaining, "pharmacie", "pharmacies")}</span>}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Grille des paliers

function tierRange(from: number, to: number | null): string {
  return to === null ? `Dès la ${rankLabel(from)} pharmacie` : `De la ${rankLabel(from)} à la ${rankLabel(to)}`;
}

export function TierGrid({ count }: { count: number }) {
  const current = tierForRank(Math.max(1, count));
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div>
          <h2 className="text-[16px] leading-6 font-semibold text-text-primary">Grille des commissions</h2>
          <p className="mt-0.5 text-[13px] text-text-secondary">Chaque pharmacie est payée au palier de son rang, sur votre total historique, sans remise à zéro.</p>
        </div>
        <ol className="space-y-2">
          {COMMISSION_TIERS.map((tier) => {
            const isCurrent = tier === current;
            return (
              <li key={tier.from} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3", isCurrent ? "border-brand-300 bg-brand-50" : "border-border-subtle")} aria-current={isCurrent ? "step" : undefined}>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-text-primary">{tierRange(tier.from, tier.to)}</p>
                  {isCurrent && <p className="text-[12px] font-medium text-brand-700">Votre palier actuel</p>}
                </div>
                <p className="shrink-0 text-right text-[16px] font-bold tabular text-text-primary">
                  {formatPriceEuros(tier.rateCents)} <span className="text-[12px] font-medium text-text-tertiary">/ pharmacie</span>
                </p>
              </li>
            );
          })}
        </ol>
        <div className="rounded-xl bg-surface-sunken px-3.5 py-3">
          <p className="text-[13px] font-semibold text-text-primary">Bonus de palier, cumulables</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] text-text-secondary">
            {BONUS_TIERS.map((bonus) => (
              <li key={bonus.at} className="tabular">
                {bonus.at} pharmacies : <span className="font-semibold text-text-primary">+{formatPriceEuros(bonus.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
