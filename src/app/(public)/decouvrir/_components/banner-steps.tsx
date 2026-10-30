"use client";

import { useState, type ReactNode } from "react";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS, IslandShell } from "@/components/island/island-shell";
import { SCAN_CSS, WhitePill, shortAdviceName, whiteFoundWidth } from "@/components/island/scan-capsule";
import type { HostEntry } from "../../../../../agent/src/notice-center";
import { ESSAI_ENTRY } from "@/core/poste/island-fixtures";
import { readCounterSheet } from "../../../../../agent/src/counter-sheet";

/**
 * « PharmaBoost en trois étapes » avec la bannière d'aujourd'hui (fondateur, 29 oct. 2026 : « la nouvelle bannière, il faut la
 * mettre à jour sur le site ») : la petite bannière blanche au scan, les conseils en cartes, la fiche ouverte d'un clic, la
 * routine, et la bannière réduite. La vente d'EXEMPLE est celle du poste (`?essai=1`) : mêmes produits, mêmes photos studio.
 */
export function entryItems(entry: Pick<HostEntry, "items">): IslandAdvice[] {
  return entry.items.map((item) => ({
    name: item.name,
    price: item.price || undefined,
    margin: item.margin || undefined,
    drug: item.drug || undefined,
    reason: item.reason || undefined,
    challenge: Boolean(item.challenge),
    challengeLabel: item.challenge || undefined,
    shortDate: item.shortDate || undefined,
    stock: item.availability as IslandAdvice["stock"],
    quantity: item.quantity ? Number(item.quantity) : undefined,
    image: item.image || undefined,
    sheet: readCounterSheet(item.sheet) ?? undefined,
  }));
}

const noop = () => undefined;

/** Un temps de la bannière : l'explication à gauche, la bannière à droite, sur le fond clair du site (l'hélice d'ADN, douce). */
function Moment({ n, title, text, chips, children }: { n: number; title: string; text: string; chips: { label: string; tone: string }[]; children: ReactNode }) {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
      <div>
        <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-brand-600 text-[17px] font-bold text-white">{n}</span>
        <h3 className="mt-4 text-[26px] leading-tight font-bold tracking-[-0.03em] text-text-primary">{title}</h3>
        <p className="mt-2 text-[16px] leading-7 text-text-secondary">{text}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip.label} className="rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ background: chip.tone, color: "#14302A" }}>
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(90%_80%_at_20%_10%,#FFFFFF_0%,#EEF5F2_55%,#E2EEEA_100%)] px-4 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
          <HelixBackdrop position="contained" framing="app" lazy />
        </div>
        <div className="relative flex flex-col items-center gap-2 [&_section]:max-w-full">
          {children}
          <p className="mt-1 text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">Exemple d&apos;écran</p>
        </div>
      </div>
    </div>
  );
}

/** La bannière en cartes, vivante : un clic ouvre la fiche, un autre la referme (comme au poste). */
export function LiveCards({ items, startOpen, initialPanel }: { items: IslandAdvice[]; startOpen?: number; initialPanel?: "routine" | "reduced" }) {
  const [open, setOpen] = useState(startOpen !== undefined);
  return (
    <MixIsland
      cards
      reduce="a"
      items={items}
      outcomes={[]}
      open={open}
      startAt={startOpen}
      initialPanel={initialPanel}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onFinish={noop}
      onAnswer={noop}
    />
  );
}

export function BannerSteps({ entry = ESSAI_ENTRY, brand = "PharmaBoost" }: { entry?: Pick<HostEntry, "items">; brand?: string }) {
  const items = entryItems(entry);
  const found = items.filter((item) => !item.sheet?.routine).map((item) => ({ name: shortAdviceName(item.name), challenge: item.challenge, shortDate: Boolean(item.shortDate) }));
  return (
    <div className="space-y-14">
      <style>{`${ISLAND_CSS}\n${SCAN_CSS}`}</style>
      <Moment
        n={1}
        title="Au scan, la petite bannière"
        text={`Vous scannez les boîtes. En haut de l'écran, la petite bannière ${brand} s'allume et nomme les conseils, avec l'étoile du challenge ou le sablier de la date courte.`}
        chips={[{ label: "★ Challenge", tone: "#E8FF9C" }, { label: "⏳ Date courte", tone: "#FFD9D4" }]}
      >
        <IslandShell width={whiteFoundWidth(found)} tone="accent" className="crd-white" contentKey="trouve" label="La petite bannière au scan">
          <WhitePill phase="found" found={found} />
        </IslandShell>
      </Moment>
      <Moment
        n={2}
        title="Les conseils, en cartes"
        text="Une carte par conseil : la photo, le prix, la marge, le stock en couleur. La routine attend juste en dessous. Un bouton « Réduire » libère l'écran à tout moment."
        chips={[{ label: "Stock", tone: "#7BE0B0" }, { label: "Marge", tone: "#FFE58A" }, { label: "Routine", tone: "#E4DDFF" }, { label: "– Réduire", tone: "#DDF3EC" }]}
      >
        <LiveCards items={items} />
      </Moment>
      <Moment
        n={3}
        title="Un clic : le conseil s'ouvre"
        text="La fiche s'ouvre juste en dessous : ce qu'il faut dire, les questions à poser, et les réponses qui mènent à une autre possibilité du stock. Une question du patient ? L'aide répond."
        chips={[{ label: "À dire", tone: "#DDF3EC" }, { label: "Questions", tone: "#DDF3EC" }, { label: "Aide", tone: "#DDF3EC" }]}
      >
        <LiveCards items={items} startOpen={0} />
      </Moment>
      <Moment
        n={4}
        title="Un clic : la routine"
        text="La routine s'ouvre à la place du conseil : un produit de votre stock par étape, avec le prix et la marge de l'ensemble."
        chips={[{ label: "Étape par étape", tone: "#E4DDFF" }, { label: "Prix et marge", tone: "#FFE58A" }]}
      >
        <LiveCards items={items} initialPanel="routine" />
      </Moment>
    </div>
  );
}
