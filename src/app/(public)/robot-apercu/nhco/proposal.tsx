"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, BadgeCheck, Bell, Check, FileText, Handshake, Lock, Pill, ScanLine, ShieldCheck, Smartphone, Star, Store, Tag, TrendingUp, Users } from "lucide-react";
import { LiveCards, entryItems } from "@/app/(public)/decouvrir/_components/banner-steps";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { SCAN_CSS } from "@/components/island/scan-capsule";
import { ESSAI_ENTRY } from "@/core/poste/island-fixtures";
import type { HostEntry } from "../../../../../agent/src/notice-center";

/**
 * LA PROPOSITION NHCO (fondateur, 11 nov. 2026 : « une maquette bien faite, moderne, épurée, qu'on puisse présenter avec
 * Donna »). Tout est un EXEMPLE : les chiffres du tableau de bord sont fictifs et dits tels, les prix sont relevés en ligne et
 * varient d'une pharmacie à l'autre. La bannière est la vraie (MixIsland), avec la pastille « Partenaire ».
 */

const INK = "#0F2A25";
const SOFT = "#4D6560";
const BRAND = "#0E7C5A";
const LINE = "#E3ECE8";

type Item = HostEntry["items"][number];
const base = ESSAI_ENTRY.items[1];

/** Le premier besoin, le plus important : la flore sous antibiotique. Il reste en tête, partenariat ou pas. */
const FLORE: Item = {
  ...base,
  id: "nhco-flore",
  drug: "AUGMENTIN 1 g",
  challenge: "",
  shortDate: "",
  name: "Lactibiane ATB",
  price: "9,90 €",
  margin: "",
  reason: "Sous antibiotique, protéger la flore intestinale.",
  quantity: "8",
  image: "",
  sheet: {
    name: "Lactibiane ATB",
    reasons: ["Sous antibiotique, protéger la flore intestinale."],
    script: "",
    contraindications: [],
    usage: [{ text: "« Pendant l'antibiotique, pour protéger votre flore. À prendre à distance de la prise de l'antibiotique. »" }],
    description: "",
    more: { contraindications: 0, usage: 0 },
    cut: false,
    ask: [],
    answers: [],
  },
};

/** Le second besoin, les défenses : sans partenariat, un produit d'une autre marque du stock. */
const DEFENSES_SANS: Item = {
  ...base,
  id: "nhco-defenses-sans",
  // Sans médicament : une carte à part de celle de la flore (la bannière regroupe les conseils d'une même boîte).
  drug: "",
  challenge: "",
  shortDate: "",
  name: "Multivitamines défenses",
  price: "12,50 €",
  margin: "",
  reason: "Accompagner les défenses pendant l'infection.",
  quantity: "5",
  image: "",
  sheet: { ...FLORE.sheet!, name: "Multivitamines défenses", reasons: ["Accompagner les défenses pendant l'infection."], usage: [{ text: "« Pour accompagner vos défenses pendant l'hiver. »" }] },
};

/** Avec le partenariat : Endomune passe en tête DE CE BESOIN, l'autre marque reste proposée en repli. */
const DEFENSES_NHCO: Item = {
  ...DEFENSES_SANS,
  id: "nhco-endomune",
  challenge: "NHCO · 1 € par boîte",
  name: "NHCO Endomune 42 gélules",
  price: "19,90 €",
  quantity: "6",
  sheet: {
    ...DEFENSES_SANS.sheet!,
    name: "NHCO Endomune 42 gélules",
    usage: [{ text: "« Un programme de deux semaines pour accompagner vos défenses. »" }],
    ask: ["Le patient a-t-il déjà un produit pour ses défenses ?"],
    answers: [
      { ask: 0, label: "Non", say: "Proposez Endomune, le programme de deux semaines." },
      { ask: 0, label: "Il préfère des vitamines", say: "Autre possibilité du stock :", product: { name: "Multivitamines défenses", price: "12,50 €", margin: "", stock: "IN_STOCK", quantity: 5 } },
    ],
  },
};

function items(withPartner: boolean): IslandAdvice[] {
  const list = entryItems({ items: [FLORE, withPartner ? DEFENSES_NHCO : DEFENSES_SANS] });
  return list.map((item, index) => (withPartner && index === 1 ? { ...item, partner: "NHCO" } : item));
}

const euro = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const euro2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function Section({ id, n, kicker, title, intro, children }: { id: string; n: string; kicker: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t py-20" style={{ borderColor: LINE }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-[12px] font-bold tracking-[0.16em] uppercase" style={{ color: BRAND }}>
          {n} · {kicker}
        </p>
        <h2 className="mt-3 max-w-3xl text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[40px]" style={{ color: INK }}>
          {title}
        </h2>
        {intro && <p className="mt-4 max-w-2xl text-[17px] leading-7" style={{ color: SOFT }}>{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border bg-white p-6 shadow-[0_1px_0_rgba(15,42,37,0.04),0_20px_40px_-30px_rgba(15,42,37,0.25)] ${className}`} style={{ borderColor: LINE }}>
      {children}
    </div>
  );
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "#E7F4EE", color: BRAND }}>
        {icon}
      </span>
      <div>
        <p className="text-[15px] font-bold" style={{ color: INK }}>{title}</p>
        <p className="mt-0.5 text-[14px] leading-6" style={{ color: SOFT }}>{children}</p>
      </div>
    </div>
  );
}

function Example() {
  return <span className="rounded-full bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#7A5500] uppercase">Exemple</span>;
}

/* ───────────────────────── 1 · Au comptoir ───────────────────────── */

function Counter() {
  const [partner, setPartner] = useState(true);
  const [sheet, setSheet] = useState(false);
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="relative overflow-hidden rounded-[32px] border bg-[radial-gradient(90%_80%_at_20%_10%,#FFFFFF_0%,#EEF5F2_55%,#E2EEEA_100%)] px-4 py-8 sm:px-8" style={{ borderColor: LINE }}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: SOFT }}>
            <ScanLine className="size-4" /> Ordonnance scannée : AUGMENTIN 1 g
          </p>
          <div className="inline-flex rounded-full border bg-white p-1 text-[13px] font-bold" style={{ borderColor: LINE }}>
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => {
                  setPartner(value);
                  setSheet(false);
                }}
                className="rounded-full px-4 py-1.5 transition"
                style={partner === value ? { background: BRAND, color: "white" } : { color: SOFT }}
              >
                {value ? "Avec NHCO" : "Sans partenariat"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 [&_section]:max-w-full">
          <LiveCards key={`${partner}-${sheet}`} items={items(partner)} startOpen={sheet ? 1 : undefined} />
          <button type="button" onClick={() => setSheet(!sheet)} className="mt-3 rounded-full border bg-white px-4 py-1.5 text-[13px] font-bold" style={{ borderColor: LINE, color: BRAND }}>
            {sheet ? "Refermer la fiche" : partner ? "Ouvrir la fiche NHCO" : "Ouvrir la fiche"}
          </button>
          <p className="mt-1 text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: "#8AA09A" }}>
            La vraie bannière PharmaBoost
          </p>
        </div>
      </div>
      <div className="space-y-6">
        <p className="text-[17px] leading-7" style={{ color: SOFT }}>
          Le pharmacien scanne l&apos;ordonnance. PharmaBoost affiche les conseils <b style={{ color: INK }}>validés par nos pharmaciens</b>.
          Quand un besoin peut être couvert par NHCO, <b style={{ color: INK }}>NHCO passe en premier pour ce besoin</b>, avec la fiche, les questions
          et la phrase à dire.
        </p>
        <div className="space-y-4">
          <Point icon={<ShieldCheck className="size-4.5" />} title="L'ordre de soin est respecté">
            NHCO prend la première place de son besoin, ici les défenses. Le besoin le plus important (la flore sous antibiotique) reste en tête, et rien n&apos;est retiré.
          </Point>
          <Point icon={<BadgeCheck className="size-4.5" />} title="Seulement si c'est juste">
            Conseil validé par nos pharmaciens, produit en stock, aucune contre-indication pour ce patient.
          </Point>
          <Point icon={<Tag className="size-4.5" />} title="Pastille « Partenaire », en toute transparence">
            Le pharmacien sait ce qu&apos;il voit. Les autres marques restent proposées en solution de repli.
          </Point>
          <Point icon={<Star className="size-4.5" />} title="Le challenge de l'équipe">
            « NHCO · 1 € par boîte » : l&apos;équipe du comptoir est motivée à proposer NHCO.
          </Point>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 2 · L'appli des patients ───────────────────────── */

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto h-[600px] w-[300px] overflow-hidden rounded-[44px] border-[9px] border-[#0B1513] bg-[#F3F8F6] shadow-[0_40px_80px_-40px_rgba(11,21,19,.55)]">
      <div className="absolute top-2 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-[#0B1513]" />
      <div className="absolute inset-x-0 top-10 bottom-0 overflow-hidden px-4">{children}</div>
    </div>
  );
}

function PatientApp() {
  const [screen, setScreen] = useState<"bilan" | "rappel" | "decouvrir">("rappel");
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <div className="mb-6 inline-flex flex-wrap rounded-full border bg-white p-1 text-[13px] font-bold" style={{ borderColor: LINE }}>
          {(
            [
              ["bilan", "Le bilan"],
              ["rappel", "Fin de cure + remise"],
              ["decouvrir", "Espace NHCO"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setScreen(key)} className="rounded-full px-4 py-1.5" style={screen === key ? { background: BRAND, color: "white" } : { color: SOFT }}>
              {label}
            </button>
          ))}
        </div>
        <Phone>
          {screen === "bilan" && (
            <div className="space-y-3">
              <p className="text-center text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: BRAND }}>Pharmacie des Lilas</p>
              <p className="text-center text-[17px] font-bold" style={{ color: INK }}>Votre bilan conseil</p>
              {[
                ["AUGMENTIN 1 g", "Votre traitement", "Selon l'ordonnance", false],
                ["Lactibiane ATB", "Protéger la flore", "Pendant l'antibiotique", false],
                ["NHCO Endomune", "Accompagner vos défenses", "Programme de 2 semaines", true],
              ].map(([name, why, when, nhco]) => (
                <div key={String(name)} className="rounded-2xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-bold" style={{ color: INK }}>{name}</p>
                    {nhco && <span className="rounded-full bg-[#E3E9F6] px-2 text-[10px] font-bold text-[#28406E]">Partenaire</span>}
                  </div>
                  <p className="text-[11.5px]" style={{ color: SOFT }}>{why}</p>
                  <span className="mt-1 inline-block rounded-md bg-[#E7F4EE] px-2 py-0.5 text-[11px]" style={{ color: BRAND }}>{when}</span>
                </div>
              ))}
            </div>
          )}
          {screen === "rappel" && (
            <div className="space-y-3 pt-2">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <p className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: BRAND }}><Bell className="size-3.5" /> PharmaBoost · maintenant</p>
                <p className="mt-1 text-[13px] font-bold" style={{ color: INK }}>Votre cure Endomune se termine dans 7 jours</p>
                <p className="text-[12px]" style={{ color: SOFT }}>Votre pharmacie des Lilas vous la garde de côté.</p>
              </div>
              <div className="rounded-3xl p-4 text-white" style={{ background: "linear-gradient(135deg,#0E7C5A,#0796B4)" }}>
                <p className="text-[11px] font-bold tracking-wider uppercase opacity-80">Offre NHCO</p>
                <p className="mt-1 text-[28px] leading-none font-bold">−2 €</p>
                <p className="mt-1 text-[13px]">sur votre prochaine boîte NHCO, dans votre pharmacie</p>
                <div className="mt-3 rounded-xl bg-white p-2 text-center font-mono text-[15px] font-bold tracking-[0.2em] text-[#0F2A25]">NH-7K3M</div>
                <p className="mt-2 text-[10.5px] opacity-80">À montrer au comptoir · valable 30 jours</p>
              </div>
            </div>
          )}
          {screen === "decouvrir" && (
            <div className="space-y-3 pt-1">
              <p className="text-[17px] font-bold" style={{ color: INK }}>Découvrir</p>
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <span className="rounded-full bg-[#E3E9F6] px-2 text-[10px] font-bold text-[#28406E]">Partenaire</span>
                <p className="mt-2 text-[15px] font-bold" style={{ color: INK }}>NHCO, la nutrition à base d&apos;acides aminés</p>
                <p className="mt-1 text-[12px]" style={{ color: SOFT }}>Laboratoire français, compléments vendus en pharmacie.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["Défenses", "Énergie", "Cheveux"].map((label) => (
                    <div key={label} className="rounded-xl bg-[#F3F8F6] py-3 text-center text-[11px] font-bold" style={{ color: INK }}>{label}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <p className="text-[12px] font-bold" style={{ color: BRAND }}>Le conseil de saison</p>
                <p className="mt-1 text-[13px]" style={{ color: INK }}>L&apos;hiver arrive : demandez conseil à votre pharmacien pour vos défenses.</p>
              </div>
            </div>
          )}
        </Phone>
      </div>
      <div className="space-y-4">
        <Point icon={<FileText className="size-4.5" />} title="Le bilan après chaque vente">
          Le patient retrouve son traitement et ses conseils, avec le moment de chaque prise. NHCO y figure avec la pastille Partenaire.
        </Point>
        <Point icon={<Bell className="size-4.5" />} title="Le rappel 7 jours avant la fin de la cure">
          Déjà en place. Le patient revient racheter sa cure, dans la même pharmacie. C&apos;est le moment idéal pour une remise.
        </Point>
        <Point icon={<Tag className="size-4.5" />} title="Les remises NHCO">
          −2 € sur la boîte suivante, financés par NHCO. Le code se montre au comptoir, chaque remise utilisée est comptée, et NHCO la compense à la pharmacie sur sa commande suivante.
        </Point>
        <Point icon={<Smartphone className="size-4.5" />} title="L'espace Découvrir">
          La vitrine NHCO dans l&apos;appli : gammes, conseil de saison, nouveautés. Elle grandit avec le nombre de pharmacies.
        </Point>
        <Point icon={<Lock className="size-4.5" />} title="Rien de médical n'est vendu">
          Pas de publicité pour des médicaments, aucune donnée de santé transmise. Le patient choisit de recevoir les offres.
        </Point>
      </div>
    </div>
  );
}

/* ───────────────────────── Les idées de visibilité ───────────────────────── */

function Ideas() {
  const ideas = [
    [<Smartphone key="a" className="size-5" />, "L'espace Découvrir", "La vitrine NHCO dans l'appli : les gammes, les nouveautés, le laboratoire."],
    [<Bell key="b" className="size-5" />, "Le conseil de saison", "L'hiver pour les défenses, le printemps pour la vitalité : le bon message au bon moment."],
    [<TrendingUp key="c" className="size-5" />, "Le lancement d'une nouveauté", "Poussée au comptoir et dans l'appli la même semaine, dans toutes les pharmacies partenaires."],
    [<FileText key="d" className="size-5" />, "Le produit à découvrir", "Une ligne NHCO dans le bilan envoyé au patient après sa vente, quand elle a du sens."],
    [<Users key="e" className="size-5" />, "La formation des équipes", "De courtes vidéos NHCO dans l'espace des pharmaciens : connaître le produit pour mieux le conseiller."],
    [<Tag key="f" className="size-5" />, "Les offres aux patients", "Une remise à la fin de la cure, pour que le patient renouvelle dans sa pharmacie."],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ideas.map(([icon, title, text]) => (
        <Card key={title}>
          <span className="flex size-11 items-center justify-center rounded-2xl" style={{ background: "#E7F4EE", color: BRAND }}>{icon}</span>
          <p className="mt-4 text-[17px] font-bold" style={{ color: INK }}>{title}</p>
          <p className="mt-1 text-[14px] leading-6" style={{ color: SOFT }}>{text}</p>
        </Card>
      ))}
    </div>
  );
}

/* ───────────────────────── 3 · Le tableau de bord NHCO ───────────────────────── */

function Dashboard() {
  const kpis = [
    ["Conseils NHCO affichés", "4 820"],
    ["Boîtes vendues après conseil", "1 446"],
    ["Taux de vente", "30 %"],
    ["Cures rachetées après rappel", "212"],
  ];
  const products = [
    ["Endomune", 612, 100],
    ["Magnésium amino-chélaté", 438, 72],
    ["Effluvium", 251, 41],
    ["Fer amino-chélaté", 145, 24],
  ] as const;
  const regions = [
    ["Île-de-France", 34],
    ["Auvergne-Rhône-Alpes", 22],
    ["Provence-Alpes-Côte d'Azur", 19],
    ["Occitanie", 14],
    ["Autres", 11],
  ] as const;
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[18px] font-bold" style={{ color: INK }}>Espace NHCO · octobre</p>
          <Example />
        </div>
        <p className="text-[13px]" style={{ color: SOFT }}>48 pharmacies partenaires</p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[#F3F8F6] p-4">
            <p className="text-[12.5px] font-semibold" style={{ color: SOFT }}>{label}</p>
            <p className="mt-1 text-[28px] font-bold tabular-nums" style={{ color: INK }}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <p className="text-[14px] font-bold" style={{ color: INK }}>Boîtes vendues par produit</p>
          <div className="mt-4 space-y-3">
            {products.map(([name, value, width]) => (
              <div key={name}>
                <div className="flex justify-between text-[13px]"><span style={{ color: INK }}>{name}</span><span className="font-bold tabular-nums" style={{ color: INK }}>{value}</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-[#EEF3F1]"><div className="h-full rounded-full" style={{ width: `${width}%`, background: BRAND }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[14px] font-bold" style={{ color: INK }}>Ventes par région</p>
          <div className="mt-4 space-y-3">
            {regions.map(([name, share]) => (
              <div key={name}>
                <div className="flex justify-between text-[13px]"><span style={{ color: INK }}>{name}</span><span className="font-bold tabular-nums" style={{ color: INK }}>{share} %</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-[#EEF3F1]"><div className="h-full rounded-full bg-[#5B8DEF]" style={{ width: `${share * 2.5}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-8 flex items-center gap-2 text-[13px]" style={{ color: SOFT }}>
        <Lock className="size-4" /> Des chiffres agrégés et anonymes : jamais de nom de patient, jamais d&apos;ordonnance.
      </p>
    </Card>
  );
}

/* ───────────────────────── 4 · Comment on compte et on facture ───────────────────────── */

function Billing() {
  const steps = [
    [<Tag key="a" className="size-5" />, "NHCO choisit son opération", "Les produits, le montant (−2 €), la période et un budget maximum : au plafond, plus aucun code n'est distribué."],
    [<Bell key="b" className="size-5" />, "Le bon arrive au bon patient", "Dans l'appli, 7 jours avant la fin de sa cure : un code unique, valable une fois et 30 jours, dans sa pharmacie."],
    [<ScanLine key="c" className="size-5" />, "Au comptoir, la preuve", "Le pharmacien fait −2 €. Le code et la bonne boîte NHCO doivent être dans la même vente, confirmée par la caisse."],
    [<FileText key="d" className="size-5" />, "Le relevé part tout seul", "Chaque mois, au pharmacien dans son espace et au délégué NHCO en PDF : chaque remise, avec sa date et son produit."],
    [<Handshake key="e" className="size-5" />, "NHCO compense la pharmacie", "Comme aujourd'hui, au choix du pharmacien : en avoir sur sa commande suivante, ou en produits."],
  ] as const;
  const wins = [
    ["Le pharmacien", ["Compensé sans listing ni paperasse", "En produits, des boîtes revendues au prix normal", "Les boîtes vendues comptent dans son ouverture de marché", "Ses patients reviennent pour la cure suivante"]],
    ["NHCO", ["Un budget plafonné, ciblé sur les fins de cure", "La preuve de chaque remise, vente par vente", "En produits, chaque euro compensé coûte moins", "Des délégués qui n'ont plus qu'à valider"]],
    ["PharmaBoost", ["1,50 € par boîte vendue grâce au rappel", "Option : 0,30 € par remise traitée", "Jamais d'argent des remises entre nos mains"]],
  ] as const;
  const rows = [
    ["Patients en fin de cure Endomune, rappel reçu", "40"],
    ["Patients revenus avec leur code −2 €", "15"],
    ["Remises faites par la pharmacie", "30 €"],
    ["Compensées par NHCO", "30 € en avoir, ou en boîtes"],
    ["Cures rachetées, prouvées par la caisse", "15 boîtes"],
    ["PharmaBoost : 15 × 1,50 €", "22,50 €"],
  ];
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {steps.map(([icon, title, text], index) => (
          <Card key={title} className="relative">
            <span className="flex size-11 items-center justify-center rounded-2xl text-white" style={{ background: BRAND }}>{icon}</span>
            <p className="mt-4 text-[12px] font-bold" style={{ color: BRAND }}>Étape {index + 1}</p>
            <p className="text-[16px] leading-snug font-bold" style={{ color: INK }}>{title}</p>
            <p className="mt-1 text-[13.5px] leading-6" style={{ color: SOFT }}>{text}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <div className="flex items-center gap-3">
            <p className="text-[16px] font-bold" style={{ color: INK }}>Pharmacie des Lilas · novembre</p>
            <Example />
          </div>
          <div className="mt-4">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b py-2.5 text-[14px] last:border-b-0" style={{ borderColor: LINE }}>
                <span style={{ color: SOFT }}>{label}</span>
                <span className="text-right font-bold tabular-nums" style={{ color: INK }}>{value}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-3">
          {wins.map(([title, list]) => (
            <Card key={title} className="p-5">
              <p className="text-[15px] font-bold" style={{ color: BRAND }}>{title}</p>
              <ul className="mt-3 space-y-2">
                {list.map((text) => (
                  <li key={text} className="flex gap-2 text-[13px] leading-5" style={{ color: SOFT }}><Check className="mt-0.5 size-3.5 shrink-0" style={{ color: BRAND }} />{text}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 5 · Le simulateur ───────────────────────── */

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-[14px]">
        <span style={{ color: SOFT }}>{label}</span>
        <span className="font-bold tabular-nums" style={{ color: INK }}>{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[#0E7C5A]" />
    </label>
  );
}

function feeFor(pharmacies: number) {
  return pharmacies <= 10 ? 0 : pharmacies <= 30 ? 290 : pharmacies <= 50 ? 590 : pharmacies <= 100 ? 990 : 1490;
}

function Simulator() {
  const [pharmacies, setPharmacies] = useState(30);
  const [shown, setShown] = useState(60);
  const [rate, setRate] = useState(30);
  const [price, setPrice] = useState(22);
  const [rebuy, setRebuy] = useState(25);
  const r = useMemo(() => {
    const boxes = Math.round(pharmacies * shown * (rate / 100));
    const rebought = Math.round(boxes * (rebuy / 100));
    const total = boxes + rebought;
    const fee = feeFor(pharmacies);
    const perBox = 1.5;
    const team = 1;
    const discount = 2;
    const cost = boxes * (perBox + team) + rebought * (perBox + discount) + fee;
    return { boxes, rebought, total, sales: total * price, fee, cost, costPerBox: total ? cost / total : 0 };
  }, [pharmacies, shown, rate, price, rebuy]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="space-y-6">
        <Slider label="Pharmacies partenaires" value={pharmacies} min={5} max={200} step={5} onChange={setPharmacies} format={(v) => String(v)} />
        <Slider label="Conseils NHCO affichés par pharmacie et par mois" value={shown} min={10} max={200} step={10} onChange={setShown} format={(v) => String(v)} />
        <Slider label="Taux de vente après conseil" value={rate} min={10} max={60} step={5} onChange={setRate} format={(v) => `${v} %`} />
        <Slider label="Prix moyen d'une boîte NHCO" value={price} min={12} max={45} step={1} onChange={setPrice} format={(v) => `${v} €`} />
        <Slider label="Cures rachetées grâce au rappel" value={rebuy} min={0} max={50} step={5} onChange={setRebuy} format={(v) => `${v} %`} />
      </Card>
      <div className="rounded-3xl p-6 text-white sm:p-8" style={{ background: "linear-gradient(150deg,#0B3D30 0%,#0E7C5A 100%)" }}>
        <p className="text-[13px] font-bold tracking-[0.14em] uppercase opacity-70">Chaque mois</p>
        <p className="mt-3 text-[52px] leading-none font-bold tabular-nums">{r.total.toLocaleString("fr-FR")}</p>
        <p className="mt-1 text-[15px] opacity-85">boîtes NHCO vendues, dont {r.rebought.toLocaleString("fr-FR")} cures rachetées après le rappel</p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-[12.5px] opacity-75">Ventes NHCO en pharmacie</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums">{euro(r.sales)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-[12.5px] opacity-75">Investissement NHCO</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums">{euro(r.cost)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-[12.5px] opacity-75">Coût par boîte vendue</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums">{euro2(r.costPerBox)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-[12.5px] opacity-75">Forfait du palier</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums">{r.fee ? `${euro(r.fee)}/mois` : "Offert"}</p>
          </div>
        </div>
        <p className="mt-6 text-[12.5px] leading-5 opacity-70">
          Calcul : 1,50 € par boîte vendue après conseil pour PharmaBoost, 1 € pour l&apos;équipe (challenge), 2 € de remise sur les cures rachetées,
          plus le forfait du palier. Hypothèses à ajuster ensemble.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── 6 · Les formules ───────────────────────── */

function Plans() {
  const tiers = [
    ["Démarrage", "1 à 10 pharmacies", "Offert", "Essai de 3 mois, bilan chiffré à la fin"],
    ["Croissance", "11 à 30 pharmacies", "290 €/mois", "Espace Découvrir dans l'appli"],
    ["Réseau", "31 à 50 pharmacies", "590 €/mois", "+ conseil de saison, nouveautés"],
    ["National", "51 à 100 pharmacies", "990 €/mois", "+ campagnes d'offres aux patients"],
    ["Grand réseau", "Plus de 100", "Sur mesure", "Plan annuel avec NHCO"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        {tiers.map(([name, range, fee, plus], index) => (
          <div key={name} className="rounded-3xl border p-5" style={index === 0 ? { borderColor: BRAND, background: "#F1FAF6" } : { borderColor: LINE, background: "white" }}>
            <p className="text-[13px] font-bold" style={{ color: BRAND }}>{name}</p>
            <p className="mt-1 text-[13px]" style={{ color: SOFT }}>{range}</p>
            <p className="mt-4 text-[24px] font-bold" style={{ color: INK }}>{fee}</p>
            <p className="mt-3 text-[13px] leading-5" style={{ color: SOFT }}>{plus}</p>
          </div>
        ))}
      </div>
      <Card>
        <p className="text-[15px] font-bold" style={{ color: INK }}>Dans toutes les formules</p>
        <div className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2 lg:grid-cols-4" style={{ color: SOFT }}>
          {[
            "1,50 € par boîte vendue après un conseil PharmaBoost",
            "Pastille Partenaire et challenge de l'équipe",
            "Tableau de bord NHCO et relevé mensuel",
            "Remises compensées par NHCO, preuve fournie par PharmaBoost",
          ].map((text) => (
            <p key={text} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" style={{ color: BRAND }} />{text}</p>
          ))}
        </div>
      </Card>
      <Card className="border-dashed">
        <p className="text-[15px] font-bold" style={{ color: INK }}>Option : le lancement d&apos;une nouveauté</p>
        <p className="mt-1 text-[14px] leading-6" style={{ color: SOFT }}>
          Pendant un mois, une nouveauté NHCO est poussée au comptoir (challenge renforcé pour l&apos;équipe) et dans l&apos;appli (espace Découvrir,
          conseil de saison), la même semaine dans toutes les pharmacies partenaires. Toujours dans les besoins validés par nos pharmaciens.
        </p>
      </Card>
    </div>
  );
}

/* ───────────────────────── 7 · Gagnant pour tous ───────────────────────── */

function Benefits() {
  const columns = [
    [<TrendingUp key="n" className="size-5" />, "NHCO", ["Présent au moment où le pharmacien conseille", "Payé uniquement sur les boîtes vendues", "Des cures rachetées grâce au rappel", "Ses vrais chiffres de vente, en direct", "Une vitrine dans l'appli des patients"]],
    [<Store key="p" className="size-5" />, "Le pharmacien", ["Un conseil validé, prêt à dire", "Une équipe motivée par le challenge", "Des patients qui reviennent", "Des remises compensées sans paperasse", "La transparence : pastille Partenaire"]],
    [<Users key="u" className="size-5" />, "Le patient", ["Le bon conseil avec son traitement", "Un rappel avant la fin de sa cure", "Des remises dans sa pharmacie", "Aucune donnée de santé partagée"]],
    [<Pill key="b" className="size-5" />, "PharmaBoost", ["Un revenu lié aux résultats", "Un laboratoire français de référence", "Des pharmacies présentées par l'équipe NHCO"]],
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {columns.map(([icon, title, list]) => (
        <Card key={title}>
          <span className="flex size-11 items-center justify-center rounded-2xl" style={{ background: "#E7F4EE", color: BRAND }}>{icon}</span>
          <p className="mt-4 text-[18px] font-bold" style={{ color: INK }}>{title}</p>
          <ul className="mt-3 space-y-2">
            {list.map((text) => (
              <li key={text} className="flex gap-2 text-[14px] leading-6" style={{ color: SOFT }}><Check className="mt-1 size-4 shrink-0" style={{ color: BRAND }} />{text}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/* ───────────────────────── La page ───────────────────────── */

const NAV = [
  ["comptoir", "Au comptoir"],
  ["appli", "L'appli"],
  ["visibilite", "Visibilité"],
  ["chiffres", "Vos chiffres"],
  ["facturation", "Remises"],
  ["simulateur", "Simulateur"],
  ["formules", "Formules"],
  ["avantages", "Avantages"],
] as const;

export function NhcoProposal() {
  return (
    <main className="min-h-screen bg-[#FBFDFC]" style={{ color: INK }}>
      <style>{`${ISLAND_CSS}\n${SCAN_CSS}\nhtml{scroll-behavior:smooth}`}</style>
      <header className="sticky top-0 z-40 border-b bg-white/85 backdrop-blur" style={{ borderColor: LINE }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <p className="text-[15px] font-bold whitespace-nowrap">NHCO <span style={{ color: "#9AB0AA" }}>×</span> <span style={{ color: BRAND }}>PharmaBoost</span></p>
          <nav className="hidden gap-1 text-[13px] font-semibold whitespace-nowrap lg:flex">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full px-3 py-1.5 transition hover:bg-[#EEF5F2]" style={{ color: SOFT }}>{label}</a>
            ))}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 right-[-10%] size-[620px] rounded-full bg-[radial-gradient(circle,#D7F0E5_0%,transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28">
          <p className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-[12.5px] font-bold" style={{ borderColor: LINE, color: BRAND }}>
            <Handshake className="size-4" /> Proposition de partenariat
          </p>
          <h1 className="mt-6 max-w-4xl text-[44px] leading-[1.02] font-bold tracking-[-0.04em] sm:text-[68px]">
            NHCO, au moment exact où le pharmacien <span style={{ color: BRAND }}>conseille</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-[19px] leading-8" style={{ color: SOFT }}>
            PharmaBoost lit l&apos;ordonnance au comptoir et affiche les conseils validés par des pharmaciens. Avec ce partenariat, NHCO y apparaît
            en premier quand c&apos;est juste pour le patient, et ne paie que les boîtes vendues.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href="#comptoir" className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold text-white" style={{ background: BRAND }}>
              Voir au comptoir <ArrowRight className="size-4" />
            </a>
            <a href="#simulateur" className="inline-flex h-12 items-center rounded-full border bg-white px-6 text-[15px] font-bold" style={{ borderColor: LINE }}>
              Simuler
            </a>
          </div>
          <div className="mt-16 grid gap-4 sm:grid-cols-4">
            {[
              ["Au comptoir", "En premier dans son besoin"],
              ["Dans l'appli", "Bilan, rappel, remises"],
              ["En chiffres", "Ventes réelles, en direct"],
              ["Au résultat", "Payé à la boîte vendue"],
            ].map(([a, b]) => (
              <div key={a} className="rounded-2xl border bg-white p-4" style={{ borderColor: LINE }}>
                <p className="text-[13px] font-bold" style={{ color: BRAND }}>{a}</p>
                <p className="mt-1 text-[15px] font-semibold">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section id="comptoir" n="01" kicker="Au comptoir" title="Le bon produit NHCO, proposé au bon patient." intro="Basculez entre « Sans partenariat » et « Avec NHCO » : seul le produit du besoin que NHCO couvre change. Le reste du conseil ne bouge pas.">
        <Counter />
      </Section>
      <Section id="appli" n="02" kicker="L'appli des patients" title="Après la vente, NHCO reste dans la poche du patient.">
        <PatientApp />
      </Section>
      <Section id="visibilite" n="03" kicker="Visibilité" title="Toutes les façons de faire connaître NHCO." intro="Au comptoir, dans l'appli, auprès des équipes : la visibilité grandit avec le nombre de pharmacies et de patients.">
        <Ideas />
      </Section>
      <Section id="chiffres" n="04" kicker="Vos chiffres" title="Ce qui se vend vraiment, pharmacie par pharmacie." intro="Un espace NHCO pour suivre, chaque mois, les conseils affichés, les boîtes vendues et les cures rachetées.">
        <Dashboard />
      </Section>
      <Section id="facturation" n="05" kicker="Remises et facturation" title="Le bon de réduction : prouvé, plafonné, compensé." intro="Le bon de réduction immédiate que NHCO connaît déjà, sans listing à préparer ni à croire sur parole : seules les ventes confirmées par la caisse comptent.">
        <Billing />
      </Section>
      <Section id="simulateur" n="06" kicker="Simulateur" title="Combien de boîtes, pour quel investissement ?">
        <Simulator />
      </Section>
      <Section id="formules" n="07" kicker="Formules" title="Un partenariat qui grandit avec le réseau." intro="La rémunération à la boîte ne change pas. Le forfait de visibilité suit le nombre de pharmacies, donc le nombre de patients qui voient NHCO.">
        <Plans />
      </Section>
      <Section id="avantages" n="08" kicker="Avantages" title="Gagnant pour chacun.">
        <Benefits />
      </Section>

      <section className="border-t py-24" style={{ borderColor: LINE }}>
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-[34px] leading-tight font-bold tracking-[-0.03em] sm:text-[44px]">Commençons par un essai de 3 mois.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-[17px] leading-7" style={{ color: SOFT }}>
            10 pharmacies, les produits NHCO choisis ensemble, aucun forfait. Au bout de 90 jours, on regarde les chiffres réels et on décide de la suite.
          </p>
          <div className="mt-10 grid gap-3 text-left sm:grid-cols-3">
            {[
              ["1", "On choisit les produits", "Et les besoins où NHCO est la meilleure réponse."],
              ["2", "Nos pharmaciens valident", "Les conseils, les phrases et les questions."],
              ["3", "On lance et on mesure", "Relevé chaque mois, bilan à 90 jours."],
            ].map(([n, title, text]) => (
              <div key={n} className="rounded-3xl border bg-white p-5" style={{ borderColor: LINE }}>
                <span className="flex size-9 items-center justify-center rounded-xl text-[15px] font-bold text-white" style={{ background: BRAND }}>{n}</span>
                <p className="mt-3 text-[16px] font-bold">{title}</p>
                <p className="mt-1 text-[14px] leading-6" style={{ color: SOFT }}>{text}</p>
              </div>
            ))}
          </div>
          <p className="mt-12 text-[13px]" style={{ color: "#8AA09A" }}>PharmaBoost · contact@pharmaboost.app · pharmaboost.app</p>
        </div>
      </section>
    </main>
  );
}
