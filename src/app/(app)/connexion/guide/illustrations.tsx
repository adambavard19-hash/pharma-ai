/**
 * Les illustrations du guide pas à pas : des schémas d'écran, pas des captures.
 * Elles montrent OÙ regarder et QUOI cliquer sans dépendre de la version d'un
 * logiciel. Dessinées en SVG avec les couleurs du thème : elles suivent le mode
 * clair et le mode sombre, et ne pèsent rien.
 */

const FRAME = "h-auto w-full max-w-[280px] rounded-xl border border-border-subtle bg-surface-sunken/60";

function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L0 15 L4 11 L7 18 L10 17 L7 10 L12 10 Z" className="fill-ink-950 stroke-white dark:fill-white dark:stroke-ink-950" strokeWidth="1" />
    </g>
  );
}

/** Une fenêtre de logiciel avec son menu : la ligne en couleur est celle à cliquer. */
export function MenuIllustration({ items }: { items: string[] }) {
  const rows = items.slice(0, 4);
  return (
    <svg viewBox="0 0 280 150" className={FRAME} role="img" aria-label="Le menu du logiciel, avec l'entrée à cliquer en couleur">
      <rect x="10" y="10" width="260" height="130" rx="8" className="fill-surface-card stroke-border-default" />
      <rect x="10" y="10" width="260" height="22" rx="8" className="fill-ink-100 dark:fill-ink-800" />
      <circle cx="24" cy="21" r="3.5" className="fill-danger-500" />
      <circle cx="36" cy="21" r="3.5" className="fill-warning-500" />
      <circle cx="48" cy="21" r="3.5" className="fill-success-500" />
      {rows.map((label, index) => {
        const y = 42 + index * 24;
        const active = index === rows.length - 1;
        return (
          <g key={label}>
            <rect x="22" y={y} width="236" height="19" rx="5" className={active ? "fill-brand-600" : "fill-ink-100 dark:fill-ink-800"} />
            <text x="32" y={y + 13} fontSize="9.5" className={active ? "fill-white" : "fill-text-secondary"} fontFamily="system-ui, sans-serif">
              {label.length > 38 ? `${label.slice(0, 37)}…` : label}
            </text>
          </g>
        );
      })}
      <Cursor x={206} y={42 + (rows.length - 1) * 24 + 8} />
    </svg>
  );
}

/** Un fichier qui part vers PharmaBoost. */
export function FileIllustration() {
  return (
    <svg viewBox="0 0 280 150" className={FRAME} role="img" aria-label="Un fichier de stock envoyé à PharmaBoost">
      <g transform="translate(34 34)">
        <path d="M0 0 H38 L56 18 V74 H0 Z" className="fill-surface-card stroke-border-default" strokeWidth="2" />
        <path d="M38 0 V18 H56" className="fill-none stroke-border-default" strokeWidth="2" />
        <rect x="10" y="32" width="36" height="5" rx="2" className="fill-ink-200 dark:fill-ink-700" />
        <rect x="10" y="44" width="30" height="5" rx="2" className="fill-ink-200 dark:fill-ink-700" />
        <rect x="10" y="56" width="34" height="5" rx="2" className="fill-ink-200 dark:fill-ink-700" />
      </g>
      <path d="M108 75 H160" className="stroke-brand-600" strokeWidth="3" strokeLinecap="round" />
      <path d="M150 65 L162 75 L150 85" className="fill-none stroke-brand-600" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="178" y="38" width="76" height="68" rx="12" className="fill-brand-600" />
      <text x="216" y="66" textAnchor="middle" fontSize="11" fontWeight="600" className="fill-white" fontFamily="system-ui, sans-serif">PharmaBoost</text>
      <circle cx="216" cy="87" r="10" className="fill-white" />
      <path d="M211 87 L215 91 L222 83" className="fill-none stroke-success-600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Le bouton « Télécharger », puis le fichier qu'on double-clique. */
export function DownloadIllustration() {
  return (
    <svg viewBox="0 0 280 150" className={FRAME} role="img" aria-label="Télécharger l'installateur puis double-cliquer le fichier">
      <rect x="10" y="12" width="260" height="126" rx="8" className="fill-surface-card stroke-border-default" />
      <rect x="10" y="12" width="260" height="22" rx="8" className="fill-ink-100 dark:fill-ink-800" />
      <rect x="62" y="17" width="156" height="12" rx="6" className="fill-surface-card stroke-border-default" />
      <text x="72" y="26" fontSize="8" className="fill-text-tertiary" fontFamily="system-ui, sans-serif">pharmaboost.app/installer/…</text>
      <rect x="26" y="52" width="104" height="28" rx="8" className="fill-brand-600" />
      <text x="78" y="70" textAnchor="middle" fontSize="10" fontWeight="600" className="fill-white" fontFamily="system-ui, sans-serif">Télécharger</text>
      <Cursor x={112} y={72} />
      <g transform="translate(176 52)">
        <rect width="64" height="74" rx="6" className="fill-surface-sunken stroke-border-default" strokeWidth="2" />
        <rect x="14" y="14" width="36" height="28" rx="4" className="fill-brand-600" />
        <path d="M32 20 V34 M26 29 L32 35 L38 29" className="fill-none stroke-white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="32" y="60" textAnchor="middle" fontSize="8.5" className="fill-text-secondary" fontFamily="system-ui, sans-serif">.exe</text>
      </g>
      <circle cx="208" cy="82" r="14" className="fill-none stroke-brand-500" strokeWidth="2" opacity="0.7" />
      <circle cx="208" cy="82" r="22" className="fill-none stroke-brand-500" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

/** Le coin de l'écran, près de l'horloge, avec le point vert. */
export function TrayIllustration() {
  return (
    <svg viewBox="0 0 280 150" className={FRAME} role="img" aria-label="L'icône PharmaBoost avec un point vert près de l'horloge">
      <rect x="10" y="12" width="260" height="96" rx="8" className="fill-ink-100 dark:fill-ink-800" />
      <rect x="10" y="108" width="260" height="30" rx="0" className="fill-ink-300 dark:fill-ink-700" />
      <rect x="10" y="108" width="260" height="30" className="fill-none" />
      <g transform="translate(150 114)">
        <rect width="20" height="18" rx="4" className="fill-surface-card" />
        <rect x="26" y="0" width="20" height="18" rx="4" className="fill-brand-600" />
        <circle cx="42" cy="14" r="5" className="fill-success-600 stroke-white" strokeWidth="1.5" />
        <rect x="54" y="0" width="20" height="18" rx="4" className="fill-surface-card" />
      </g>
      <text x="246" y="127" textAnchor="end" fontSize="8" className="fill-text-primary" fontFamily="system-ui, sans-serif">10:42</text>
      <g transform="translate(120 62)">
        <rect width="124" height="34" rx="7" className="fill-surface-card stroke-border-default" />
        <circle cx="16" cy="17" r="5" className="fill-success-600" />
        <text x="28" y="15" fontSize="8.5" fontWeight="600" className="fill-text-primary" fontFamily="system-ui, sans-serif">PharmaBoost</text>
        <text x="28" y="26" fontSize="8" className="fill-text-secondary" fontFamily="system-ui, sans-serif">Relié à PharmaBoost</text>
      </g>
    </svg>
  );
}

/** L'assistant d'installation : une barre qui avance, rien à taper. */
export function InstallerIllustration() {
  return (
    <svg viewBox="0 0 280 150" className={FRAME} role="img" aria-label="L'assistant d'installation de PharmaBoost, une barre de progression">
      <rect x="30" y="18" width="220" height="114" rx="10" className="fill-surface-card stroke-border-default" />
      <rect x="30" y="18" width="220" height="24" rx="10" className="fill-brand-600" />
      <text x="44" y="34" fontSize="9.5" fontWeight="600" className="fill-white" fontFamily="system-ui, sans-serif">Installer PharmaBoost</text>
      <text x="46" y="66" fontSize="9.5" className="fill-text-primary" fontFamily="system-ui, sans-serif">Installation en cours…</text>
      <rect x="46" y="76" width="188" height="10" rx="5" className="fill-ink-100 dark:fill-ink-800" />
      <rect x="46" y="76" width="126" height="10" rx="5" className="fill-success-600" />
      <text x="46" y="104" fontSize="8.5" className="fill-text-secondary" fontFamily="system-ui, sans-serif">Environ une minute · rien à taper</text>
    </svg>
  );
}

/** Le stock est à jour : un voyant vert et une date. */
export function StockOkIllustration() {
  return (
    <svg viewBox="0 0 280 150" className={FRAME} role="img" aria-label="Le stock est à jour, avec l'heure de réception">
      <rect x="30" y="26" width="220" height="98" rx="12" className="fill-surface-card stroke-border-default" />
      <circle cx="70" cy="75" r="20" className="fill-success-600" />
      <path d="M61 75 L68 82 L80 68" className="fill-none stroke-white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <text x="104" y="68" fontSize="14" fontWeight="600" className="fill-text-primary" fontFamily="system-ui, sans-serif">Stock à jour</text>
      <text x="104" y="86" fontSize="9.5" className="fill-text-secondary" fontFamily="system-ui, sans-serif">Reçu aujourd&apos;hui à 08:42</text>
      <text x="104" y="101" fontSize="9.5" className="fill-text-secondary" fontFamily="system-ui, sans-serif">4 200 lignes</text>
    </svg>
  );
}
