import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Les écrans de LGPI redessinés pour le guide « Comment envoyer mon inventaire LGPI » : la même disposition que le vrai
 * logiciel (photos du fondateur au comptoir, 23 oct. 2026), sans aucune donnée d'une vraie pharmacie. La touche ou le
 * bouton à utiliser est en couleur, avec le curseur dessus.
 */

const LGPI = "bg-[#1d8a96]";

function Window({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("w-full overflow-hidden rounded-xl border border-ink-200 bg-[#eef3f3] text-ink-800 shadow-sm select-none dark:border-ink-700", className)}>
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-3 py-1.5">
        <span className="text-[9.5px] text-ink-500">Portail Pharmagest — LGPI</span>
        <span className="ml-auto truncate text-[9.5px] font-semibold text-[#1d8a96]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Cursor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 18" className={cn("pointer-events-none absolute size-4 drop-shadow", className)}>
      <path d="M0 0 L0 15 L4 11 L7 18 L10 17 L7 10 L12 10 Z" fill="#111" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

/** La touche de fonction en bas d'un écran LGPI ; celle à presser est en couleur. */
function Key({ k, label, on }: { k: string; label: string; on?: boolean }) {
  return (
    <span className={cn("relative flex min-w-0 flex-col items-center rounded-md border px-1.5 py-1 leading-none", on ? "border-brand-600 bg-brand-600 text-white ring-4 ring-brand-500/25" : "border-ink-300 bg-white text-ink-500")}>
      <span className="text-[9px] font-bold">{k}</span>
      <span className="mt-0.5 text-[7.5px]">{label}</span>
      {on && <Cursor className="-right-2 -bottom-3" />}
    </span>
  );
}

export function MenuScreen() {
  const menu = ["A. Comptoir", "B. Gestion Stock", "C. Données", "D. Suivi Administratif", "E. Configuration", "F. BDD Médic"];
  return (
    <Window title="Recherche : inventaire">
      <div className={cn("flex items-center px-3 py-1.5 text-[10px] font-semibold text-white", LGPI)}>
        <span>Menu</span>
        <span className="ml-auto rounded bg-white px-2 py-0.5 text-[9px] font-normal text-ink-600">🔍 inventaire</span>
      </div>
      <div className="flex">
        <ul className="w-[38%] space-y-1 bg-[#c9dce8] p-2 text-[9.5px] font-semibold">
          {menu.map((item) => (
            <li key={item} className={cn("rounded px-1.5 py-1", item.startsWith("B.") ? "bg-brand-600 text-white" : "text-ink-700")}>{item}</li>
          ))}
        </ul>
        <div className="grid flex-1 grid-cols-3 gap-2 p-3 text-center text-[8.5px] leading-tight">
          <div className="space-y-1 opacity-60"><div className="mx-auto size-8 rounded bg-[#1d8a96]/70" /><p>B - R. Saisie de l&apos;inventaire</p></div>
          <div className="relative space-y-1 rounded-lg bg-white p-1 ring-2 ring-brand-600">
            <div className="mx-auto size-8 rounded bg-[#1d8a96]" />
            <p className="font-semibold text-brand-700">B - S. Édition de l&apos;inventaire</p>
            <Cursor className="right-0 bottom-1" />
          </div>
          <div className="space-y-1 opacity-60"><div className="mx-auto size-8 rounded bg-[#1d8a96]/70" /><p>E - J - X. Inventaire</p></div>
        </div>
      </div>
    </Window>
  );
}

export function CodeScreen() {
  return (
    <Window title="Édition de l'inventaire">
      <div className="flex h-[150px] items-center justify-center p-4">
        <div className="w-[70%] rounded-lg border border-ink-300 bg-white shadow-md">
          <p className={cn("rounded-t-lg px-3 py-1 text-[9.5px] font-semibold text-white", LGPI)}>Identification</p>
          <div className="space-y-2 p-3">
            <p className="text-[9.5px] text-ink-600">Votre code opérateur</p>
            <p className="rounded border-2 border-brand-600 bg-white px-2 py-1 font-mono text-[13px] tracking-[0.4em] text-ink-800">••••<span className="animate-pulse">|</span></p>
            <p className="text-right text-[9px] font-semibold text-brand-700">Entrée ↵</p>
          </div>
        </div>
      </div>
    </Window>
  );
}

function CriteriaFields() {
  const left = ["Fournisseur direct", "Catalogue", "Classification BDM", "Famille", "Fabricants", "Marque"];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-3 text-[8.5px]">
      <div className="col-span-2 mb-1 flex items-center gap-3">
        <span className="text-ink-500">Édition</span>
        <span className="flex items-center gap-1 font-semibold"><span className="size-2.5 rounded-full border-[3px] border-brand-600 bg-white" />Détaillée</span>
        <span className="flex items-center gap-1 text-ink-500"><span className="size-2.5 rounded-full border border-ink-400 bg-white" />Totaux seuls</span>
      </div>
      <div className="space-y-1.5">
        {left.map((label) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-[52%] truncate text-ink-500">{label}</span>
            <span className="h-2.5 flex-1 rounded-sm border border-ink-300 bg-white" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5"><span className="w-[45%] text-ink-500">TVA</span><span className="h-2.5 flex-1 rounded-sm border border-ink-300 bg-white" /></div>
        <div className="flex items-center gap-1.5">
          <span className="w-[45%] text-ink-500">Prix de référence</span>
          <span className="flex-1 rounded-sm border border-ink-300 bg-white px-1 text-[8px] font-semibold">PAMP Net ▾</span>
        </div>
        <div className="flex items-center gap-1.5"><span className="w-[45%] text-ink-500">Dépôt</span><span className="h-2.5 flex-1 rounded-sm border border-ink-300 bg-white" /></div>
        <div className="mt-2 h-8 rounded-sm border border-ink-300 bg-[#c9dce8]/60" />
      </div>
    </div>
  );
}

export function CriteriaScreen() {
  return (
    <Window title="Saisie des critères d'édition de l'inventaire">
      <CriteriaFields />
      <div className="flex justify-between gap-1 border-t border-ink-200 px-3 py-2">
        <Key k="ESC" label="Retour" />
        <Key k="F2" label="Détail" />
        <Key k="F5" label="Imprimer" on />
        <Key k="F8" label="Tri" />
        <Key k="FIN" label="Valider" />
      </div>
    </Window>
  );
}

export function ConfirmScreen() {
  return (
    <Window title="Saisie des critères d'édition de l'inventaire">
      <div className="relative">
        <div className="opacity-35"><CriteriaFields /></div>
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <div className="w-[88%] rounded-md border border-ink-300 bg-white shadow-xl">
            <p className="border-b border-ink-200 px-2.5 py-1 text-[9px] text-ink-600">Confirmation</p>
            <div className="flex gap-2 p-2.5">
              <span className="text-[16px] leading-none text-success-600">✔</span>
              <p className="text-[9px] leading-snug font-semibold text-ink-800">
                Attention ! Aucun critère n&apos;a été saisi.
                <br />
                Voulez-vous éditer la totalité des produits gérés en stock ?
              </p>
            </div>
            <div className="flex justify-center gap-2 pb-2.5">
              <span className="relative rounded border-2 border-brand-600 bg-brand-600 px-3 py-0.5 text-[9.5px] font-bold text-white ring-4 ring-brand-500/25">
                Oui
                <Cursor className="-right-3 -bottom-3" />
              </span>
              <span className="rounded border border-ink-300 px-3 py-0.5 text-[9.5px] text-ink-500">Non</span>
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

export function PreviewScreen() {
  const rows: [string, string, string, string, string][] = [
    ["3400930000000", "PRODUIT EXEMPLE 1", "12", "4,50", "10 %"],
    ["3400930000001", "PRODUIT EXEMPLE 2", "3", "7,20", "10 %"],
    ["3401500000002", "PRODUIT EXEMPLE 3", "8", "11,90", "20 %"],
    ["3401500000003", "PRODUIT EXEMPLE 4", "25", "2,10", "5,5 %"],
  ];
  return (
    <Window title="Aperçu de l'inventaire">
      <div className="p-2.5">
        <div className="rounded border border-ink-200 bg-white p-2">
          <p className="text-center text-[9px] font-bold">Inventaire du 23/10/2026 valorisé par PAMP net</p>
          <div className="mt-1.5 grid grid-cols-[1.6fr_2fr_0.6fr_0.7fr_0.6fr] gap-x-1 rounded-sm bg-ink-500 px-1 py-0.5 text-[7.5px] font-semibold text-white">
            <span>Code produit</span><span>Désignation</span><span className="text-right">Qté boîte</span><span className="text-right">Prix</span><span className="text-right">TVA</span>
          </div>
          {rows.map((row) => (
            <div key={row[0]} className="grid grid-cols-[1.6fr_2fr_0.6fr_0.7fr_0.6fr] gap-x-1 border-b border-ink-100 px-1 py-0.5 font-mono text-[7.5px]">
              <span>{row[0]}</span><span className="truncate font-sans">{row[1]}</span><span className="text-right">{row[2]}</span><span className="text-right">{row[3]}</span><span className="text-right">{row[4]}</span>
            </div>
          ))}
          <p className="mt-1 text-right text-[7.5px] text-ink-400">Page 1 / 104</p>
        </div>
      </div>
      <div className="flex justify-between gap-1 border-t border-ink-200 px-3 py-2">
        <Key k="ESC" label="Abandon" />
        <Key k="F5" label="Imprimer" />
        <Key k="F8" label="E-mail" />
        <Key k="F9" label="Enregistrer" on />
        <Key k="FIN" label="Valider" />
      </div>
    </Window>
  );
}

export function SaveScreen() {
  return (
    <div aria-hidden className="w-full overflow-hidden rounded-xl border border-ink-200 bg-white text-ink-800 shadow-sm select-none dark:border-ink-700">
      <div className="border-b border-ink-200 bg-[#f3f3f3] px-3 py-1.5 text-[9.5px] text-ink-600">Enregistrer sous</div>
      <div className="flex">
        <ul className="w-[34%] space-y-1 border-r border-ink-100 p-2 text-[9px] text-ink-600">
          <li className="rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700">📁 Bureau</li>
          <li className="px-1.5 py-0.5">📁 Documents</li>
          <li className="px-1.5 py-0.5">📁 Téléchargements</li>
        </ul>
        <div className="flex-1 space-y-1 p-2 text-[9px] text-ink-500">
          <p>📄 inventaire-septembre.pdf</p>
          <p>📄 commande.pdf</p>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-ink-100 p-2.5 text-[9px]">
        <div className="flex items-center gap-2">
          <span className="w-[30%] text-ink-500">Nom du fichier</span>
          <span className="flex-1 rounded-sm border border-brand-600 px-1.5 py-0.5 font-medium">inventaire.pdf</span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <span className="relative rounded bg-brand-600 px-3 py-1 font-semibold text-white ring-4 ring-brand-500/25">
            Enregistrer
            <Cursor className="-right-3 -bottom-3" />
          </span>
          <span className="rounded border border-ink-300 px-3 py-1 text-ink-500">Annuler</span>
        </div>
      </div>
    </div>
  );
}

export function UploadScreen() {
  return (
    <div aria-hidden className="w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-card shadow-sm select-none">
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1.5">
        <span className="size-2 rounded-full bg-brand-600" />
        <span className="text-[9.5px] font-semibold text-text-primary">PharmaBoost · Mettre à jour mon stock</span>
      </div>
      <div className="flex flex-col items-center gap-2 p-4">
        <div className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 p-3 dark:bg-brand-950/20">
          <span className="text-[18px]">📄</span>
          <span className="relative rounded-full bg-brand-600 px-4 py-1.5 text-[10px] font-semibold text-white ring-4 ring-brand-500/25">
            Choisir mes fichiers
            <Cursor className="-right-3 -bottom-3" />
          </span>
          <span className="text-[8.5px] text-text-tertiary">ou glissez-les ici</span>
        </div>
      </div>
    </div>
  );
}
