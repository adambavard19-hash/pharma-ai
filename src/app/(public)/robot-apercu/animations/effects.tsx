"use client";

import { useState } from "react";

/** Les produits qui ont une photo studio (public/produits-studio), avec leur prix de la Pharmacie du Docteur Nicolas. */
const PRODUCTS = [
  { ean: "0850803002721", name: "THERAPEARL DOS", price: "16,50 €" },
  { ean: "3585550001204", name: "VIT C 1000MG UPSA CPR A CROQUER 15", price: "3,95 €" },
  { ean: "3614810005611", name: "MAG 2 24H CPR 40", price: "10,95 €" },
  { ean: "3401599956742", name: "ERGYNATAL PILULIER GELU BT 60", price: "21,50 €" },
  { ean: "3535400025843", name: "COLLAGENE MARIN NAT & FORM (BT90 CPR)", price: "21,95 €" },
  { ean: "3535400027236", name: "NAT&FORM COLLAG MAR PEAU PDR312,5G", price: "38,95 €" },
  { ean: "3535400008556", name: "NAT&FORM ECO RESP Artichaut Bio Gél B/90", price: "7,95 €" },
  { ean: "3535400009799", name: "NAT&FORM ECO RESP Canneberge Gél B/60 BIO", price: "5,95 €" },
  { ean: "3400300758163", name: "BOIRON ARNICA MONTANA 9CH TU GR.", price: "3,70 €" },
  { ean: "3400930617526", name: "BOIRON PATE PECT MANDARIN 60G BAUDRY", price: "9,25 €" },
  { ean: "3282770140453", name: "KELUAL DS SHAMPOING ANTI PEL 100ML", price: "16,95 €" },
  { ean: "3282770107739", name: "KLORANE SH PIVOINE 400ML", price: "13,50 €" },
  { ean: "3282770394535", name: "KLORANE SH FIGUE BARBARIE 400ML", price: "12,95 €" },
  { ean: "3401597168697", name: "SAFORELLE SOL LAV RECH 400ML", price: "11,95 €" },
  { ean: "3700399100332", name: "SAFORELLE COTON PROT Tamp av appl super B/14", price: "6,30 €" },
  { ean: "3401547573908", name: "APIVITA Cr Philomie pied sec T/150ml", price: "" },
  { ean: "7640178211728", name: "PODERM COLOR CARE VAO MANGUE 227", price: "16,95 €" },
  { ean: "3551101547910", name: "PICOT LAIT EXP BB GOURMAND 1 800G", price: "22,20 €" },
  { ean: "3059948001430", name: "DUREX PLAY Gel nat Fl/100ml", price: "13,50 €" },
  { ean: "0070942507233", name: "BUTLER CIRE ORTHODONTIQ 723R", price: "5,95 €" },
];

const EFFECTS = [
  { id: "aucun", label: "0 · Sans animation", hint: "La photo fixe, pour comparer." },
  { id: "flotte", label: "1 · Flottement", hint: "La boîte monte et descend doucement, comme posée sur l'eau." },
  { id: "respire", label: "2 · Respiration", hint: "Un léger zoom qui va et vient." },
  { id: "reflet", label: "3 · Reflet brillant", hint: "Un éclat de lumière traverse la photo toutes les trois secondes." },
  { id: "incline", label: "4 · Inclinaison 3D", hint: "La boîte pivote un peu à gauche et à droite, en relief." },
  { id: "rebond", label: "5 · Rebond d'arrivée", hint: "La photo arrive en rebondissant, puis se pose." },
  { id: "halo", label: "6 · Halo lumineux", hint: "Un halo vert PharmaBoost pulse autour de la photo." },
  { id: "balance", label: "7 · Petit coucou", hint: "La boîte se dandine un instant, puis attend." },
  { id: "tourne", label: "8 · Tour complet", hint: "La boîte fait un tour sur elle-même de temps en temps." },
  { id: "ombre", label: "9 · Lévitation et ombre", hint: "La boîte s'élève et son ombre s'éloigne sous elle." },
] as const;

type EffectId = (typeof EFFECTS)[number]["id"];

const CSS = `
.fx-photo { position: relative; overflow: hidden; }
.fx-flotte img { animation: fx-flotte 2.8s ease-in-out infinite; }
@keyframes fx-flotte { 0%,100% { transform: translateY(2px); } 50% { transform: translateY(-4px); } }
.fx-respire img { animation: fx-respire 2.4s ease-in-out infinite; }
@keyframes fx-respire { 0%,100% { transform: scale(.94); } 50% { transform: scale(1.04); } }
.fx-reflet::after { content: ""; position: absolute; inset: -20% auto -20% -60%; width: 45%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.85), transparent); transform: skewX(-18deg); animation: fx-reflet 3s ease-in-out infinite; }
@keyframes fx-reflet { 0%, 55% { left: -60%; } 85%, 100% { left: 130%; } }
.fx-incline { perspective: 300px; }
.fx-incline img { animation: fx-incline 3.6s ease-in-out infinite; transform-style: preserve-3d; }
@keyframes fx-incline { 0%,100% { transform: rotateY(-16deg) rotateX(4deg); } 50% { transform: rotateY(16deg) rotateX(-4deg); } }
.fx-rebond img { animation: fx-rebond 3.2s cubic-bezier(.3,1.5,.5,1) infinite; }
@keyframes fx-rebond { 0% { transform: translateY(-26px) scale(.7); opacity: 0; } 18% { transform: translateY(4px) scale(1.06); opacity: 1; } 28% { transform: translateY(-3px) scale(.98); } 36%, 100% { transform: none; opacity: 1; } }
.fx-halo { animation: fx-halo 2s ease-in-out infinite; }
@keyframes fx-halo { 0%,100% { box-shadow: 0 0 0 0 rgba(88,242,216,.0); } 50% { box-shadow: 0 0 0 4px rgba(88,242,216,.55), 0 0 18px 4px rgba(88,242,216,.45); } }
.fx-balance img { animation: fx-balance 3.4s ease-in-out infinite; transform-origin: 50% 90%; }
@keyframes fx-balance { 0%, 62%, 100% { transform: rotate(0); } 68% { transform: rotate(-9deg); } 74% { transform: rotate(8deg); } 80% { transform: rotate(-5deg); } 86% { transform: rotate(3deg); } }
.fx-tourne { perspective: 400px; }
.fx-tourne img { animation: fx-tourne 4.5s cubic-bezier(.6,0,.3,1) infinite; }
@keyframes fx-tourne { 0%, 55% { transform: rotateY(0); } 100% { transform: rotateY(360deg); } }
.fx-ombre { overflow: visible; }
.fx-ombre img { animation: fx-ombre 3s ease-in-out infinite; }
.fx-ombre::after { content: ""; position: absolute; left: 22%; right: 22%; bottom: 3px; height: 5px; border-radius: 50%; background: rgba(15,47,42,.35); filter: blur(2px); animation: fx-ombre-sol 3s ease-in-out infinite; }
@keyframes fx-ombre { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes fx-ombre-sol { 0%,100% { transform: scaleX(1); opacity: .9; } 50% { transform: scaleX(.6); opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .fx-photo, .fx-photo img, .fx-photo::after { animation: none !important; } }
`;

function Photo({ ean, effect, size }: { ean: string; effect: EffectId; size: number }) {
  return (
    <span className={`fx-photo fx-${effect} inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale */}
      <img src={`/produits-studio/${ean}.jpg`} alt="" width={size - 8} height={size - 8} className="size-full object-contain" />
    </span>
  );
}

/** Une carte comme celle de la bannière du poste : photo, nom, prix. */
function Card({ product, effect }: { product: (typeof PRODUCTS)[number]; effect: EffectId }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#F4FBF8] p-3 text-[#0F2F2A] shadow-sm">
      <Photo ean={product.ean} effect={effect} size={56} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13.5px] leading-[17px] font-extrabold">{product.name}</p>
        <p className="mt-0.5 text-[11.5px] font-semibold text-[#4B6A62]">Produit conseil</p>
      </div>
      <p className="shrink-0 text-[15px] font-extrabold tabular-nums">{product.price || "—"}</p>
    </div>
  );
}

export function PhotoEffects() {
  const [effect, setEffect] = useState<EffectId>("flotte");
  const current = EFFECTS.find((item) => item.id === effect)!;
  return (
    <main className="min-h-screen bg-[#0B2420] px-4 py-8 text-white">
      <style>{CSS}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[24px] font-bold">Les photos des produits conseil, animées</h1>
        <p className="mt-1 text-[14px] text-white/70">Chaque produit conseil de la bannière avec sa petite photo sur fond blanc. Choisissez un effet : tous les produits le prennent. Seuls les produits qui ont déjà une photo studio sont montrés ({PRODUCTS.length}).</p>

        <section className="mt-6" aria-label="Les effets côte à côte">
          <h2 className="text-[15px] font-semibold text-white/80">Les {EFFECTS.length} effets côte à côte (cliquez pour l&apos;appliquer à tous)</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {EFFECTS.map((item, n) => (
              <button
                key={item.id}
                type="button"
                data-effet={item.id}
                onClick={() => setEffect(item.id)}
                aria-pressed={effect === item.id}
                className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition ${effect === item.id ? "bg-[#1F5A4E] ring-2 ring-[#58F2D8]" : "bg-white/5 hover:bg-white/10"}`}
              >
                <Photo ean={PRODUCTS[n % PRODUCTS.length].ean} effect={item.id} size={84} />
                <span className="text-[13px] font-bold">{item.label}</span>
                <span className="text-[11.5px] leading-4 text-white/60">{item.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8" aria-label="Tous les produits conseil avec l'effet choisi">
          <h2 className="text-[15px] font-semibold text-white/80">Tous les produits conseil · effet « {current.label} »</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCTS.map((product) => (
              <Card key={product.ean} product={product} effect={effect} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
