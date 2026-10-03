/**
 * Graphiques simples, en SVG, rendus côté serveur : une courbe et des barres.
 * Pas de bibliothèque : peu de points, lisibles, et toujours accompagnés de
 * leur tableau pour les lecteurs d'écran. Une série vide affiche un état vide,
 * jamais une courbe inventée.
 */
export type ChartPoint = { label: string; value: number };

const W = 640;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

function scale(points: ChartPoint[]) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  return { max, innerW, innerH, x: (i: number) => PAD.left + (points.length > 1 ? i * step : innerW / 2), y: (v: number) => PAD.top + innerH - (v / max) * innerH };
}

function labelEvery(count: number): number {
  return count <= 7 ? 1 : count <= 14 ? 2 : Math.ceil(count / 6);
}

function SrTable({ title, points, format }: { title: string; points: ChartPoint[]; format: (n: number) => string }) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <tbody>
        {points.map((p) => (
          <tr key={p.label}>
            <th scope="row">{p.label}</th>
            <td>{format(p.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LineChart({ title, points, format = (n) => String(n), emptyText = "Pas encore de donnée sur cette période." }: { title: string; points: ChartPoint[]; format?: (n: number) => string; emptyText?: string }) {
  if (points.length === 0 || points.every((p) => p.value === 0)) return <p className="flex h-[180px] items-center justify-center rounded-xl bg-surface-sunken/60 text-[13px] text-text-tertiary">{emptyText}</p>;
  const s = scale(points);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${s.x(i).toFixed(1)},${s.y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${s.x(points.length - 1).toFixed(1)},${(PAD.top + s.innerH).toFixed(1)} L${s.x(0).toFixed(1)},${(PAD.top + s.innerH).toFixed(1)} Z`;
  const every = labelEvery(points.length);
  const last = points[points.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" role="img" aria-label={title} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + s.innerH * f} y2={PAD.top + s.innerH * f} className="stroke-border-subtle" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} className="fill-brand-500/10" />
        <path d={path} className="stroke-brand-600" fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={s.x(points.length - 1)} cy={s.y(last.value)} r={3.5} className="fill-brand-600" />
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[10.5px] text-text-tertiary tabular-nums">
        {points.map((p, i) => (
          <span key={p.label} className={i % every === 0 || i === points.length - 1 ? "" : "invisible"}>
            {p.label}
          </span>
        ))}
      </div>
      <SrTable title={title} points={points} format={format} />
    </figure>
  );
}

export function BarChart({ title, points, format = (n) => String(n), tone = "brand", emptyText = "Pas encore de donnée sur cette période." }: { title: string; points: ChartPoint[]; format?: (n: number) => string; tone?: "brand" | "danger" | "info"; emptyText?: string }) {
  if (points.length === 0 || points.every((p) => p.value === 0)) return <p className="flex h-[180px] items-center justify-center rounded-xl bg-surface-sunken/60 text-[13px] text-text-tertiary">{emptyText}</p>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const every = labelEvery(points.length);
  const fill = { brand: "bg-brand-500", danger: "bg-danger-500", info: "bg-info-500" }[tone];
  return (
    <figure>
      <div className="flex h-[150px] items-end gap-1" role="img" aria-label={title}>
        {points.map((p) => (
          <div key={p.label} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className={`${fill} min-h-[2px] rounded-t-md opacity-80 transition-opacity group-hover:opacity-100`} style={{ height: `${(p.value / max) * 100}%` }} />
            <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-ink-900 px-1.5 py-0.5 text-[10.5px] whitespace-nowrap text-white group-hover:block">{format(p.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-1 text-[10.5px] text-text-tertiary tabular-nums">
        {points.map((p, i) => (
          <span key={p.label} className={`flex-1 text-center ${i % every === 0 || i === points.length - 1 ? "" : "invisible"}`}>
            {p.label}
          </span>
        ))}
      </div>
      <SrTable title={title} points={points} format={format} />
    </figure>
  );
}
