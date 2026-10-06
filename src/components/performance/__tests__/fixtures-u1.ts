import type { SeriesBucket } from "@/core/performance/types";

/** Une tranche de série : tout à zéro sauf ce que le test précise. Le 5 octobre 2026, à minuit UTC, plus `index` jours. */
export const bucket = (index: number, overrides: Partial<SeriesBucket> = {}): SeriesBucket => ({
  index,
  startsAt: new Date(Date.UTC(2026, 9, 5 + index, 0, 0, 0)),
  label: `${5 + index} oct.`,
  proposed: 0,
  accepted: 0,
  purchased: 0,
  revenueTtcCents: 0,
  acceptanceRate: null,
  ...overrides,
});

/** Une série de sept jours avec du chiffre d'affaires et des conseils. */
export const weekSeries = (): SeriesBucket[] =>
  [
    { proposed: 4, accepted: 2, purchased: 1, revenueTtcCents: 1_250, acceptanceRate: 0.5 },
    { proposed: 6, accepted: 3, purchased: 2, revenueTtcCents: 4_000, acceptanceRate: 0.5 },
    { proposed: 2, accepted: 0, purchased: 0, revenueTtcCents: 0, acceptanceRate: null },
    { proposed: 8, accepted: 6, purchased: 3, revenueTtcCents: 9_870, acceptanceRate: 0.75 },
    { proposed: 5, accepted: 4, purchased: 2, revenueTtcCents: 5_400, acceptanceRate: 0.8 },
    { proposed: 9, accepted: 5, purchased: 4, revenueTtcCents: 12_300, acceptanceRate: 0.56 },
    { proposed: 10, accepted: 7, purchased: 5, revenueTtcCents: 28_705, acceptanceRate: 0.7 },
  ].map((values, index) => bucket(index, values));
