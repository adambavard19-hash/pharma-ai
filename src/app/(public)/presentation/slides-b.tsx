"use client";

import { useState } from "react";
import { ArrowRight, CalendarCheck, Check, Database, Download, FileText, GraduationCap, KeyRound, Lock, Megaphone, MousePointerClick, Plus, RefreshCw, ShieldCheck, Sparkles, Star, Store, Trophy, UserRound, Users, Video } from "lucide-react";
import { Robot } from "@/components/robot";
import { ESTIMATE_ASSUMPTIONS, estimateAdditionalRevenue } from "@/core/pricing/revenue-estimate";
import { referrerPriceCents } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";
import { Count, ExampleMark, Glass, Grad, Kick, Lead, Point, Title, d, euros } from "./kit";

/** Diapositives 13 à 25 : la prise de sang, le titulaire, les laboratoires, l'installation, le prix, la suite. */

const PAD = "absolute inset-0 px-[88px] pt-[72px] pb-[64px]";

/* 13 ----------------------------------------------------------------- */
export function BloodSlide() {
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_420px] items-center gap-16")}>
      <div>
        <Kick>Le patient · nouveau</Kick>
        <Title className="text-[56px]">
          Sa prise de sang, <Grad>enfin claire.</Grad>
        </Title>
        <Lead>Le patient dépose sa prise de sang dans l&apos;appli. Il la voit sur une carte du corps, chaque analyse expliquée simplement.</Lead>
        <ul className="mt-8 space-y-3">
          <Point icon={<Sparkles className="size-5" />} delay={350}>Un point de couleur par analyse, sur son organe</Point>
          <Point icon={<Check className="size-5" />} delay={470}>Les compléments validés, à récupérer chez vous</Point>
          <Point icon={<ShieldCheck className="size-5" />} delay={590}>Une valeur haute ou très basse : à montrer au médecin</Point>
          <Point icon={<Lock className="size-5" />} delay={710}>Rien n&apos;est enregistré</Point>
        </ul>
      </div>
      <div className="pz-right relative" style={d(250)}>
        <div className="pz-float">
          {/* eslint-disable-next-line @next/next/no-img-element -- capture de la maquette, locale */}
          <img src="/images/appli-prise-de-sang.png" alt="La prise de sang sur une carte du corps : vert dans les normes, orange un peu bas, rouge à montrer au médecin" className="mx-auto block h-[740px] w-auto drop-shadow-[0_40px_60px_rgba(15,47,42,0.35)]" />
        </div>
        <ExampleMark className="mt-3 block text-center" />
      </div>
    </div>
  );
}

/* 14 ----------------------------------------------------------------- */
const TEAM = [
  { name: "Claire", sold: 42, ca: 1260, margin: 512 },
  { name: "Hugo", sold: 35, ca: 1040, margin: 418 },
  { name: "Léa", sold: 28, ca: 830, margin: 331 },
  { name: "Yanis", sold: 19, ca: 560, margin: 224 },
];

export function ResultsSlide() {
  const [view, setView] = useState<"titulaire" | "membre">("titulaire");
  const totalSold = TEAM.reduce((s, m) => s + m.sold, 0);
  const totalCa = TEAM.reduce((s, m) => s + m.ca, 0);
  return (
    <div className={cn(PAD, "grid grid-cols-[560px_1fr] items-center gap-12")}>
      <div>
        <Kick>Le titulaire · résultats</Kick>
        <Title className="text-[50px]">
          Ce que PharmaBoost rapporte, <Grad>chaque semaine.</Grad>
        </Title>
        <Lead>Conseils proposés, vendus, chiffre d&apos;affaires ajouté et marge : réservés au titulaire. Chaque collaborateur voit ses seules ventes, sans montant.</Lead>
        <div className="pz-in mt-8 inline-flex rounded-full bg-white/70 p-1.5 backdrop-blur-md" style={d(400)} data-int="">
          {(["titulaire", "membre"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn("rounded-full px-6 py-3 text-[17px] font-semibold transition-all", view === v ? "bg-brand-600 text-white shadow" : "text-text-secondary")}>
              Vue {v === "titulaire" ? "titulaire" : "collaborateur"}
            </button>
          ))}
        </div>
        <p className="pz-in mt-6 flex items-center gap-2 text-[17px] font-semibold text-brand-800" style={d(520)}>
          <CalendarCheck className="size-5" /> Le bilan PDF, chaque dimanche par e-mail
        </p>
      </div>
      <Glass key={view} className="pz-right p-8" style={d(150)}>
        {view === "titulaire" ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Conseils vendus", value: <Count to={totalSold} /> },
                { label: "CA ajouté", value: <Count to={totalCa} format={(n) => euros(Math.round(n))} /> },
                { label: "Collaborateurs", value: <Count to={TEAM.length} /> },
              ].map((k, i) => (
                <div key={k.label} className="pz-pop rounded-2xl bg-white p-5 shadow-sm" style={d(200 + i * 120)}>
                  <p className="text-[15px] text-text-secondary">{k.label}</p>
                  <p className="mt-1 text-[38px] font-bold tracking-[-0.03em] text-brand-700">{k.value}</p>
                </div>
              ))}
            </div>
            <table className="mt-6 w-full text-[18px]">
              <thead>
                <tr className="text-left text-[14px] tracking-[0.08em] text-text-tertiary uppercase">
                  <th className="pb-3 font-semibold">Collaborateur</th>
                  <th className="pb-3 font-semibold">Conseils vendus</th>
                  <th className="pb-3 text-right font-semibold">CA ajouté</th>
                  <th className="pb-3 text-right font-semibold">Marge</th>
                </tr>
              </thead>
              <tbody>
                {TEAM.map((m, i) => (
                  <tr key={m.name} className="pz-in border-t border-black/5" style={d(400 + i * 110)}>
                    <td className="py-3 font-semibold text-text-primary">{m.name}</td>
                    <td className="py-3">
                      <span className="flex items-center gap-3">
                        <span className="h-2.5 w-[180px] overflow-hidden rounded-full bg-brand-50">
                          <span className="pz-bar block h-full rounded-full bg-gradient-to-r from-brand-500 to-[#0796b4]" style={{ width: `${(m.sold / 42) * 100}%`, ...d(600 + i * 110) }} />
                        </span>
                        <span className="tabular-nums">{m.sold}</span>
                      </span>
                    </td>
                    <td className="py-3 text-right tabular-nums">{euros(m.ca)}</td>
                    <td className="py-3 text-right text-brand-700 tabular-nums">{euros(m.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-brand-50 text-brand-700">
              <UserRound className="size-10" />
            </span>
            <p className="mt-4 text-[26px] font-bold text-text-primary">Hugo · mes ventes</p>
            <div className="mt-6 grid w-full grid-cols-2 gap-4">
              <div className="pz-pop rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-[15px] text-text-secondary">Conseils proposés</p>
                <p className="mt-1 text-[44px] font-bold text-brand-700">
                  <Count to={61} />
                </p>
              </div>
              <div className="pz-pop rounded-2xl bg-white p-6 shadow-sm" style={d(120)}>
                <p className="text-[15px] text-text-secondary">Conseils vendus</p>
                <p className="mt-1 text-[44px] font-bold text-brand-700">
                  <Count to={35} />
                </p>
              </div>
            </div>
            <p className="pz-in mt-6 rounded-full bg-[#F1F7F5] px-6 py-3 text-[18px] font-semibold text-text-secondary" style={d(300)}>
              Aucun montant : ni chiffre d&apos;affaires, ni marge
            </p>
          </div>
        )}
        <ExampleMark className="mt-5 block text-right" />
      </Glass>
    </div>
  );
}

/* 15 ----------------------------------------------------------------- */
export function TeamSlide() {
  const [launched, setLaunched] = useState(false);
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_640px] items-center gap-12")}>
      <div>
        <Kick>Le titulaire · mon équipe</Kick>
        <Title className="text-[56px]">
          Toute l&apos;équipe motivée, <Grad>chacun à son comptoir.</Grad>
        </Title>
        <ul className="mt-10 space-y-3">
          <Point icon={<Store className="size-5" />} delay={300}>Un comptoir par personne : ses ventes sont les siennes</Point>
          <Point icon={<Trophy className="size-5" />} delay={420}>Le classement de la semaine ou du mois</Point>
          <Point icon={<Star className="size-5" />} delay={540}>Vos challenges, et ceux des laboratoires</Point>
        </ul>
      </div>
      <Glass className="pz-right p-8" style={d(250)}>
        <p className="text-[15px] font-bold tracking-[0.12em] text-brand-700 uppercase">Classement · ce mois-ci</p>
        <ol className="mt-5 space-y-4">
          {TEAM.map((m, i) => (
            <li key={m.name} className="pz-in flex items-center gap-4" style={d(400 + i * 140)}>
              <span className={cn("grid size-11 place-items-center rounded-full text-[17px] font-bold", i === 0 ? "bg-[#FFE58A] text-[#5A4500]" : "bg-brand-50 text-brand-800")}>{i + 1}</span>
              <span className="w-24 text-[20px] font-semibold text-text-primary">{m.name}</span>
              <span className="h-4 flex-1 overflow-hidden rounded-full bg-brand-50">
                <span className="pz-bar block h-full rounded-full bg-gradient-to-r from-brand-500 to-[#0796b4]" style={{ width: `${(m.sold / 42) * 100}%`, ...d(600 + i * 140) }} />
              </span>
              <span className="w-10 text-right text-[19px] font-bold tabular-nums">{m.sold}</span>
            </li>
          ))}
        </ol>
        <div className="mt-7 grid gap-3" data-int="">
          <div className="flex items-center justify-between rounded-2xl bg-[#E8FF9C] px-5 py-4">
            <span className="flex items-center gap-3 text-[18px] font-bold text-[#14302A]">
              <Star className="size-5 fill-current" /> Challenge Imodium · 1 € par boîte
            </span>
            <span className="text-[15px] font-semibold text-[#3D4F00]">laboratoire</span>
          </div>
          {launched ? (
            <div className="pz-drop rounded-2xl bg-brand-600 px-5 py-4 text-white">
              <p className="flex items-center gap-3 text-[18px] font-bold">
                <Trophy className="size-5" /> Challenge de l&apos;équipe : la routine peau
              </p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/20">
                <span className="pz-bar block h-full w-[64%] rounded-full bg-[#E8FF9C]" style={d(300)} />
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setLaunched(true)} className="pz-glow flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 px-5 py-4 text-[18px] font-semibold text-brand-700">
              <Plus className="size-5" /> Lancer un challenge de l&apos;équipe
            </button>
          )}
        </div>
        <ExampleMark className="mt-4 block text-right" />
      </Glass>
    </div>
  );
}

/* 16 ----------------------------------------------------------------- */
const SHELF = [
  { name: "Lactibiane Imedia", image: "/produits-studio/3401528534805.jpg", stock: "En stock · 7", date: "Date courte 30/11/26", state: "date" },
  { name: "Cicaplast Lèvres", image: "/produits-studio/0000030106659.jpg", stock: "En stock · 12", state: "ok" },
  { name: "Crème solaire SPF 50+", image: "/site/produits/creme-solaire-spf50.webp", stock: "En stock · 18", state: "ok" },
  { name: "Spray nasal eau de mer", image: "/site/produits/spray-nasal-eau-de-mer.webp", stock: "Rupture", state: "out" },
] as const;

export function StockSlide() {
  const [run, setRun] = useState(0);
  return (
    <div className={cn(PAD, "flex flex-col")}>
      <div className="flex items-end justify-between">
        <div>
          <Kick>Le titulaire · le stock</Kick>
          <Title className="max-w-[1000px] text-[56px]">
            Seulement <Grad>ce qui est en rayon.</Grad>
          </Title>
          <Lead className="max-w-[780px]">Votre stock est lu depuis votre logiciel. Une rupture n&apos;est jamais proposée. Les dates courtes passent en premier.</Lead>
        </div>
        <button type="button" onClick={() => setRun((r) => r + 1)} className="pz-in inline-flex h-14 items-center gap-2 rounded-full bg-brand-600 px-7 text-[18px] font-semibold text-white shadow-lg active:scale-95" style={d(400)}>
          <RefreshCw className="size-5" /> Lire mon stock
        </button>
      </div>
      <div key={run} className="mt-12 grid grid-cols-4 gap-6">
        {SHELF.map((p, i) => (
          <Glass key={p.name} className={cn("pz-in relative flex flex-col items-center p-7 text-center", p.state === "out" && "opacity-55 grayscale")} style={d(300 + i * 160)}>
            {p.state === "date" && <span className="pz-pop absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1.5 text-[14px] font-bold whitespace-nowrap text-white" style={d(1200)}>Proposé en premier</span>}
            {/* eslint-disable-next-line @next/next/no-img-element -- photo locale */}
            <img src={p.image} alt="" className="h-[150px] w-[150px] rounded-2xl bg-white object-contain p-3 shadow-sm" />
            <p className="mt-5 text-[21px] font-bold text-text-primary">{p.name}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <span className={cn("rounded-full px-3 py-1 text-[14px] font-bold", p.state === "out" ? "bg-[#FFE4DF] text-[#B4412C]" : "bg-[#D8F5E6] text-[#0B6B4D]")}>{p.stock}</span>
              {"date" in p && <span className="rounded-full bg-[#FFD9D4] px-3 py-1 text-[14px] font-bold text-[#8A2A1B]">⏳ {p.date}</span>}
            </div>
            {p.state === "out" && <span className="pz-pop mt-4 text-[16px] font-semibold text-[#B4412C]" style={d(1300)}>Jamais proposé au comptoir</span>}
          </Glass>
        ))}
      </div>
      <ExampleMark className="mt-6 text-right" />
    </div>
  );
}

/* 17 ----------------------------------------------------------------- */
export function OverstockSlide() {
  const [on, setOn] = useState(false);
  const list = on ? ["Spray nasal eau de mer", "Pastilles gorge miel citron", "Levure probiotique"] : ["Pastilles gorge miel citron", "Levure probiotique", "Spray nasal eau de mer"];
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_620px] items-center gap-12")}>
      <div>
        <Kick>Le titulaire · le surstock</Kick>
        <Title className="text-[56px]">
          Écoulez ce qui <Grad>dort en rayon.</Grad>
        </Title>
        <Lead>Un produit acheté en trop ? Mettez-le en campagne : il passe en premier au comptoir, toujours derrière les contrôles de sécurité, jusqu&apos;à l&apos;objectif ou la date.</Lead>
        <button type="button" onClick={() => setOn((v) => !v)} className={cn("pz-in mt-9 inline-flex h-14 items-center gap-2.5 rounded-full px-8 text-[18px] font-semibold shadow-lg active:scale-95", on ? "bg-white text-brand-700" : "pz-glow bg-brand-600 text-white")} style={d(450)}>
          <Megaphone className="size-5" /> {on ? "Campagne lancée" : "Lancer la campagne"}
        </button>
      </div>
      <Glass className="pz-right p-8" style={d(250)}>
        <div className="flex items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- photo locale */}
          <img src="/site/produits/spray-nasal-eau-de-mer.webp" alt="" className="size-24 rounded-2xl bg-white object-contain p-2 shadow-sm" />
          <div className="flex-1">
            <p className="text-[22px] font-bold text-text-primary">Spray nasal eau de mer</p>
            <p className="text-[16px] text-text-secondary">Stock en trop · objectif 12 boîtes</p>
            <div className="mt-3 h-3.5 overflow-hidden rounded-full bg-brand-50">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-brand-500 transition-[width] duration-[2200ms] ease-out" style={{ width: on ? "28%" : "100%" }} />
            </div>
            <p className="mt-1.5 text-right text-[15px] font-semibold text-text-secondary tabular-nums">
              <Count to={on ? 14 : 48} ms={2200} /> en stock
            </p>
          </div>
        </div>
        <p className="mt-8 text-[14px] font-bold tracking-[0.12em] text-brand-700 uppercase">Au comptoir, dans la bannière</p>
        <ol className="mt-3 space-y-2.5">
          {list.map((name, i) => (
            <li key={name} className={cn("flex items-center gap-3 rounded-2xl px-5 py-3.5 text-[18px] font-semibold transition-all duration-700", i === 0 && on ? "bg-brand-600 text-white shadow-lg" : "bg-white text-text-primary")}>
              <span className="tabular-nums opacity-60">{i + 1}</span> {name}
              {i === 0 && on && <span className="ml-auto rounded-full bg-[#E8FF9C] px-3 py-1 text-[13px] font-bold text-[#14302A]">Campagne</span>}
            </li>
          ))}
        </ol>
        <ExampleMark className="mt-4 block text-right" />
      </Glass>
    </div>
  );
}

/* 18 ----------------------------------------------------------------- */
const ASSOC = [
  { drug: "CURACNÉ 20 mg", product: "Cicaplast Lèvres", image: "/produits-studio/0000030106659.jpg" },
  { drug: "IMODIUM 2 mg", product: "Lactibiane Imedia", image: "/produits-studio/3401528534805.jpg" },
  { drug: "DOXYCYCLINE 100 mg", product: "Crème solaire SPF 50+", image: "/site/produits/creme-solaire-spf50.webp" },
];

export function AssociationsSlide() {
  const [pick, setPick] = useState(0);
  return (
    <div className={cn(PAD, "flex flex-col")}>
      <Kick>Le titulaire · mes associations</Kick>
      <Title className="max-w-[1200px] text-[56px]">
        Ajoutez <Grad>vos propres conseils.</Grad>
      </Title>
      <Lead className="max-w-[1000px]">Quand ce médicament est dans la vente, proposez le produit que vous préférez : vos laboratoires, votre façon de conseiller. Toujours dans votre stock.</Lead>
      <div className="mt-12 grid flex-1 grid-cols-[420px_1fr_420px] items-center gap-8" data-int="">
        <div className="space-y-3">
          {ASSOC.map((a, i) => (
            <button key={a.drug} type="button" onClick={() => setPick(i)} className={cn("pz-left flex w-full items-center justify-between rounded-3xl border px-6 py-5 text-left font-mono text-[19px] font-semibold transition-all", pick === i ? "border-brand-400 bg-white text-brand-900 shadow-xl" : "border-white/70 bg-white/45 text-text-secondary backdrop-blur-md")} style={d(300 + i * 120)}>
              {a.drug}
              {pick === i && <ArrowRight className="size-5 text-brand-600" />}
            </button>
          ))}
          <p className="pt-2 text-[15px] text-text-tertiary">Quand ce médicament est dans la vente…</p>
        </div>
        <svg key={pick} viewBox="0 0 400 200" className="h-[200px] w-full" aria-hidden="true">
          <path d={`M 0 ${40 + pick * 60} C 200 ${40 + pick * 60}, 200 100, 400 100`} fill="none" stroke="#0E8A7B" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 10" className="pz-draw" style={{ "--len": 520 } as React.CSSProperties} />
          <circle cx="400" cy="100" r="9" fill="#0E8A7B" className="pz-pop" style={d(900)} />
        </svg>
        <Glass key={`p${pick}`} className="pz-pop flex flex-col items-center p-8 text-center" style={d(500)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- photo locale */}
          <img src={ASSOC[pick].image} alt="" className="size-[150px] rounded-2xl bg-white object-contain p-3 shadow-sm" />
          <p className="mt-5 text-[14px] font-bold tracking-[0.12em] text-brand-700 uppercase">…PharmaBoost propose</p>
          <p className="mt-1 text-[26px] font-bold text-text-primary">{ASSOC[pick].product}</p>
          <span className="mt-3 rounded-full bg-[#D8F5E6] px-3 py-1 text-[14px] font-bold text-[#0B6B4D]">En stock</span>
        </Glass>
      </div>
    </div>
  );
}

/* 19 ----------------------------------------------------------------- */
export function LabsSlide() {
  const [boxes, setBoxes] = useState(0);
  return (
    <div className={cn(PAD, "flex flex-col")}>
      <Kick>Laboratoires et partenaires</Kick>
      <Title className="max-w-[1200px] text-[56px]">
        Les laboratoires viennent <Grad>jusqu&apos;à votre comptoir.</Grad>
      </Title>
      <div className="mt-12 grid flex-1 grid-cols-3 gap-7">
        <Glass className="pz-in flex flex-col p-8" style={d(300)}>
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-[#E8FF9C] px-4 py-2 text-[16px] font-bold text-[#14302A]">
            <Star className="size-4 fill-current" /> Challenge Imodium · 1 € par boîte
          </span>
          <p className="mt-6 text-[28px] font-bold tracking-[-0.02em] text-text-primary">Les challenges laboratoires</p>
          <p className="mt-2 text-[18px] leading-[1.5] text-text-secondary">L&apos;étoile s&apos;affiche sur la carte conseil. L&apos;équipe voit son gain, vente par vente.</p>
          <div className="mt-auto flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm" data-int="">
            <div>
              <p className="text-[14px] text-text-tertiary">Gain de l&apos;équipe</p>
              <p className="text-[40px] font-bold text-brand-700 tabular-nums">
                <Count to={boxes} ms={500} format={(n) => euros(Math.round(n))} />
              </p>
            </div>
            <button type="button" onClick={() => setBoxes((b) => b + 1)} className="pz-glow inline-flex h-12 items-center gap-2 rounded-full bg-brand-600 px-5 text-[16px] font-semibold text-white active:scale-95">
              <Plus className="size-4" /> 1 boîte vendue
            </button>
          </div>
        </Glass>
        <Glass className="pz-in flex flex-col p-8" style={d(450)}>
          <span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <Store className="size-8" />
          </span>
          <p className="mt-6 text-[28px] font-bold tracking-[-0.02em] text-text-primary">Leurs offres, chez vous</p>
          <p className="mt-2 text-[18px] leading-[1.5] text-text-secondary">Dans l&apos;appli des patients, les offres des laboratoires partenaires ne valent que dans les pharmacies PharmaBoost.</p>
          <div className="mt-auto rounded-2xl bg-white p-5 shadow-sm">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[13px] font-bold text-brand-800">Offre laboratoire partenaire</span>
            <p className="mt-2 text-[22px] font-bold text-text-primary">-20 % · nouvelle gamme</p>
          </div>
        </Glass>
        <Glass className="pz-in flex flex-col p-8" style={d(600)}>
          <span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <GraduationCap className="size-8" />
          </span>
          <p className="mt-6 text-[28px] font-bold tracking-[-0.02em] text-text-primary">Les nouvelles gammes</p>
          <p className="mt-2 text-[18px] leading-[1.5] text-text-secondary">L&apos;application mobile PharmaBoost forme votre équipe aux futures gammes.</p>
          <div className="mt-auto flex items-center gap-3 rounded-2xl bg-white p-5 shadow-sm">
            <Video className="size-6 text-brand-600" />
            <span className="text-[18px] font-semibold text-text-primary">Formation · nouvelle gamme</span>
          </div>
        </Glass>
      </div>
    </div>
  );
}

/* 20 ----------------------------------------------------------------- */
const INSTALL = [
  { icon: <Download className="size-8" />, title: "Un fichier par poste", text: "À télécharger sur chaque comptoir." },
  { icon: <MousePointerClick className="size-8" />, title: "Un double-clic", text: "PharmaBoost s'installe tout seul." },
  { icon: <Database className="size-8" />, title: "À côté de LGPI", text: "Premier déploiement sur LGPI. Les autres logiciels s'installent avec nous." },
  { icon: <RefreshCw className="size-8" />, title: "Mises à jour seules", text: "Automatiques, jamais pendant une vente." },
];

export function InstallSlide() {
  const [step, setStep] = useState(-1);
  const play = () => {
    setStep(-1);
    INSTALL.forEach((_, i) => window.setTimeout(() => setStep(i), 300 + i * 650));
  };
  return (
    <div className={cn(PAD, "flex flex-col")}>
      <div className="flex items-end justify-between">
        <div>
          <Kick>L&apos;installation</Kick>
          <Title className="max-w-[1100px] text-[56px]">
            Un double-clic par poste. <Grad>Votre logiciel ne change pas.</Grad>
          </Title>
        </div>
        <button type="button" onClick={play} className="pz-in pz-glow inline-flex h-14 items-center gap-2 rounded-full bg-brand-600 px-7 text-[18px] font-semibold text-white shadow-lg active:scale-95" style={d(400)}>
          <Download className="size-5" /> Installer
        </button>
      </div>
      <div className="relative mt-16 grid grid-cols-4 gap-6">
        <div className="absolute top-[52px] right-[12%] left-[12%] h-1 rounded-full bg-brand-100">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-[#0796b4] transition-[width] duration-500" style={{ width: `${Math.max(0, step) * 33.4}%` }} />
        </div>
        {INSTALL.map((s, i) => (
          <div key={s.title} className="pz-in relative flex flex-col items-center text-center" style={d(300 + i * 140)}>
            <span className={cn("grid size-[104px] place-items-center rounded-[32px] shadow-xl transition-all duration-500", step >= i ? "scale-105 bg-gradient-to-br from-brand-500 to-brand-700 text-white" : "bg-white text-brand-700")}>{step >= i ? <Check className="size-10" /> : s.icon}</span>
            <p className="mt-6 text-[25px] font-bold tracking-[-0.02em] text-text-primary">{s.title}</p>
            <p className="mt-2 max-w-[300px] text-[18px] leading-[1.5] text-text-secondary">{s.text}</p>
          </div>
        ))}
      </div>
      <p className={cn("mt-auto self-center rounded-full px-8 py-4 text-[21px] font-semibold transition-all duration-500", step >= 3 ? "bg-brand-600 text-white shadow-xl" : "bg-white/60 text-text-secondary")}>
        La mise en service est faite avec vous : installation, réglages, formation de l&apos;équipe.
      </p>
    </div>
  );
}

/* 21 ----------------------------------------------------------------- */
export function DataSlide() {
  return (
    <div className={cn(PAD, "flex flex-col")}>
      <Kick deep>Les données</Kick>
      <Title deep className="max-w-[1100px] text-[60px]">
        Aucune fiche patient. <Grad deep>Le pharmacien décide.</Grad>
      </Title>
      <div className="mt-14 grid grid-cols-3 gap-7">
        {[
          { icon: <Lock className="size-9" />, title: "Pas de dossier patient", text: "PharmaBoost ne crée aucune fiche patient. Le plan conseil remis au patient est chiffré." },
          { icon: <KeyRound className="size-9" />, title: "E-mail effacé", text: "L'adresse donnée pour le bilan est effacée après l'envoi, ou après le rappel de fin de cure." },
          { icon: <ShieldCheck className="size-9" />, title: "Une aide au conseil", text: "Il ne diagnostique pas, il ne prescrit pas. La décision reste au pharmacien." },
        ].map((c, i) => (
          <div key={c.title} className="pz-in rounded-[32px] border border-white/12 bg-white/[0.06] p-9 backdrop-blur-md" style={d(300 + i * 160)}>
            <span className="grid size-[72px] place-items-center rounded-3xl bg-[#7FE0C4]/15 text-[#7FE0C4]">{c.icon}</span>
            <p className="mt-7 text-[28px] font-bold tracking-[-0.02em] text-white">{c.title}</p>
            <p className="mt-3 text-[19px] leading-[1.55] text-white/70">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 22 ----------------------------------------------------------------- */
export function CalculatorSlide() {
  const [clients, setClients] = useState(200);
  const estimate = estimateAdditionalRevenue(clients);
  const perMonth = estimate.perMonthCents / 100;
  const price = 149;
  const max = Math.max(perMonth, price, 1);
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_640px] items-center gap-14")}>
      <div>
        <Kick deep>Ce que ça rapporte</Kick>
        <Title deep className="text-[58px]">
          Faisons le calcul, <Grad deep>avec vos chiffres.</Grad>
        </Title>
        <div className="pz-in mt-10 rounded-[28px] border border-white/12 bg-white/[0.06] p-8" style={d(300)} data-int="">
          <p className="text-[20px] text-white/75">Vos clients par jour</p>
          <p className="mt-1 text-[64px] font-bold text-white tabular-nums">{clients}</p>
          <input type="range" min={20} max={600} step={10} value={clients} onChange={(e) => setClients(Number(e.target.value))} aria-label="Clients par jour" className="mt-3 w-full accent-[#7FE0C4]" style={{ height: 36 }} />
        </div>
        <ol className="pz-in mt-6 space-y-2 text-[19px] text-white/75" style={d(450)}>
          <li className="flex justify-between">
            <span>Clients repartis avec un produit conseillé ({Math.round(ESTIMATE_ASSUMPTIONS.adviceRate * 100)} %)</span>
            <b className="text-white tabular-nums">{estimate.advisedClientsPerDay} par jour</b>
          </li>
          <li className="flex justify-between">
            <span>× {ESTIMATE_ASSUMPTIONS.averageProductCents / 100} € par produit en moyenne</span>
            <b className="text-white tabular-nums">{euros(estimate.perDayCents / 100)} par jour</b>
          </li>
          <li className="flex justify-between">
            <span>× {ESTIMATE_ASSUMPTIONS.openDaysPerMonth} jours d&apos;ouverture</span>
            <b className="text-white tabular-nums">par mois</b>
          </li>
        </ol>
      </div>
      <div className="pz-right flex flex-col" style={d(250)}>
        <p className="text-[20px] text-white/75">Chiffre d&apos;affaires supplémentaire estimé</p>
        <p className="mt-2 text-[120px] leading-none font-bold tracking-[-0.05em] text-[#7FE0C4] tabular-nums">
          <Count to={perMonth} ms={700} format={(n) => euros(Math.round(n))} />
        </p>
        <p className="mt-2 text-[22px] text-white/75">par mois</p>
        <div className="mt-10 flex h-[260px] items-end gap-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-[120px] rounded-t-2xl bg-white/25 transition-[height] duration-700" style={{ height: Math.max(8, (price / max) * 240) }} />
            <span className="text-center text-[16px] text-white/70">
              Abonnement
              <br />
              <b className="text-white">149 € HT</b>
            </span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-[120px] rounded-t-2xl bg-gradient-to-t from-brand-500 to-[#7FE0C4] transition-[height] duration-700" style={{ height: Math.max(8, (perMonth / max) * 240) }} />
            <span className="text-center text-[16px] text-white/70">
              CA estimé
              <br />
              <b className="text-white">par mois</b>
            </span>
          </div>
        </div>
        <p className="mt-6 text-[15px] leading-6 text-white/50">Estimation indicative : 10 % de vos clients prennent un produit conseillé, à 7 € en moyenne, sur 25 jours d&apos;ouverture par mois. Ce n&apos;est pas une promesse de résultat.</p>
      </div>
    </div>
  );
}

/* 23 ----------------------------------------------------------------- */
const INCLUDED = ["Tous vos postes de comptoir", "La bibliothèque de conseils validés", "La Base Claude Bernard et le copilote IA", "Les mises à jour automatiques", "Le support, depuis PharmaBoost", "L'application mobile et ses formations"];

export function PriceSlide() {
  const [referrals, setReferrals] = useState(0);
  const monthly = referrals === 0 ? 14_900 : referrerPriceCents(14_900, referrals * 10);
  return (
    <div className={cn(PAD, "grid grid-cols-[1fr_620px] items-center gap-14")}>
      <div>
        <Kick>Le prix</Kick>
        <Title className="text-[58px]">
          Un seul abonnement. <Grad>Tout est inclus.</Grad>
        </Title>
        <Lead>Un abonnement par officine, quel que soit le nombre de postes de comptoir.</Lead>
        <ul className="mt-8 grid grid-cols-2 gap-3">
          {INCLUDED.map((item, i) => (
            <li key={item} className="pz-left flex items-center gap-3 rounded-2xl bg-white/65 px-4 py-3.5 text-[17px] font-medium text-text-primary backdrop-blur-md" style={d(350 + i * 90)}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                <Check className="size-4" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="pz-right relative rounded-[36px] border-2 border-brand-500 bg-white/90 p-10 shadow-[0_40px_90px_-30px_var(--color-brand-600)]" style={d(250)}>
        <p className="font-mono text-[14px] tracking-[0.14em] text-brand-700 uppercase">PharmaBoost Officine</p>
        <p className="mt-4 flex items-baseline gap-3">
          <span className="text-[110px] leading-none font-bold tracking-[-0.05em] text-text-primary tabular-nums">
            <Count to={monthly / 100} ms={600} format={(n) => n.toLocaleString("fr-FR", { minimumFractionDigits: referrals ? 2 : 0, maximumFractionDigits: 2 })} />
          </span>
          <span className="text-[30px] font-bold text-text-primary">€</span>
          <span className="text-[20px] text-text-secondary">HT / mois</span>
        </p>
        <p className="mt-2 text-[19px] font-semibold text-brand-700">Engagement de 12 mois</p>
        <div className="mt-7 rounded-2xl bg-[#F1F7F5] p-5">
          <p className="text-[18px] font-bold text-text-primary">Mise en service clé en main · 150 € HT</p>
          <p className="mt-1 text-[16px] text-text-secondary">Une seule fois : installation, réglages et formation de l&apos;équipe.</p>
        </div>
        <p className="mt-7 text-[16px] font-semibold text-text-secondary">Parrainez des confrères</p>
        <div className="mt-3 grid grid-cols-3 gap-2" data-int="">
          {[0, 1, 2].map((n) => (
            <button key={n} type="button" onClick={() => setReferrals(n)} className={cn("rounded-2xl border px-2 py-3 text-[15px] leading-tight font-semibold transition-all", referrals === n ? "border-brand-600 bg-brand-600 text-white shadow" : "border-black/10 bg-white text-text-secondary")}>
              {n === 0 ? "Aucun" : n === 1 ? "1 confrère −10 %" : "2 confrères −20 %"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 24 ----------------------------------------------------------------- */
export function NextSlide() {
  return (
    <div className={cn(PAD, "flex flex-col")}>
      <Kick>La suite</Kick>
      <Title className="text-[64px]">
        Voyez-le sur <Grad>votre comptoir.</Grad>
      </Title>
      <div className="mt-14 grid grid-cols-3 gap-7">
        {[
          { icon: <Video className="size-8" />, title: "Une démo", text: "En visio, avec nous. Réservez sur pharmaboost.app." },
          { icon: <Users className="size-8" />, title: "La mise en service", text: "Tous vos postes, les réglages, la formation de l'équipe." },
          { icon: <FileText className="size-8" />, title: "Le premier bilan", text: "Dès le dimanche suivant : ce que votre équipe a conseillé et vendu." },
        ].map((c, i) => (
          <Glass key={c.title} className="pz-in p-9" style={d(300 + i * 160)}>
            <span className="font-mono text-[16px] text-brand-700">0{i + 1}</span>
            <span className="mt-4 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">{c.icon}</span>
            <p className="mt-6 text-[30px] font-bold tracking-[-0.02em] text-text-primary">{c.title}</p>
            <p className="mt-2 text-[19px] leading-[1.5] text-text-secondary">{c.text}</p>
          </Glass>
        ))}
      </div>
      <div className="pz-in mt-auto flex items-center justify-center gap-6" style={d(850)}>
        <span className="rounded-full bg-brand-600 px-8 py-4 text-[22px] font-semibold text-white shadow-lg">pharmaboost.app</span>
        <span className="text-[22px] font-semibold text-brand-800">contact@pharmaboost.app</span>
      </div>
    </div>
  );
}

/* 25 ----------------------------------------------------------------- */
export function QuestionsSlide() {
  return (
    <div className={cn(PAD, "flex flex-col items-center justify-center text-center")}>
      <span className="pz-pop pz-float inline-flex size-[170px] items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
        <Robot size={132} mood="celebrate" />
      </span>
      <div className="mt-8">
        <Kick deep delay={300}>Merci</Kick>
      </div>
      <h2 className="pz-in mt-6 text-[120px] leading-none font-bold tracking-[-0.05em] text-white" style={d(420)}>
        Vos questions.
      </h2>
      <p className="pz-in mt-7 text-[26px] text-white/75" style={d(600)}>
        Le bon conseil, à chaque vente. Le pharmacien décide.
      </p>
      <p className="pz-fade mt-12 text-[20px] font-semibold text-[#7FE0C4]" style={d(900)}>
        pharmaboost.app · contact@pharmaboost.app
      </p>
    </div>
  );
}
