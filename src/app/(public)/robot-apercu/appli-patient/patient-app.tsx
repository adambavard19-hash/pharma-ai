"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, Check, ChevronDown, ChevronRight, Clock, Home, Mail, MapPin, Pill, ScanLine, Search, ShoppingBag, Sparkles, Store, Sun, User, Users } from "lucide-react";
import { Robot } from "@/components/robot";

/**
 * LA MAQUETTE DE L'APPLI GRAND PUBLIC (fondateur, 21 oct. 2026), d'après l'épure de GoodMed, aux couleurs de PharmaBoost
 * (sarcelle, ADN). Deux portes : « Je viens de ma pharmacie » (le lien du bilan reçu par e-mail : compte, médicaments et cures
 * déjà là, « ma pharmacie » reliée) et « Découvrir » (le grand public : scan, fiche, trouver une pharmacie PharmaBoost).
 * Tout est un EXEMPLE : aucune donnée réelle. La fiche reprend des faits de la notice de la doxycycline (photosensibilisation,
 * prise au milieu d'un repas avec un grand verre d'eau) et le conseil associé est celui de la règle « Conseil peau — Série 2 ».
 */

type Screen = "bienvenue" | "mail" | "compte" | "accueil" | "scan" | "fiche" | "pharmacie" | "profil";

const ACCENT = "#0E8A7B";
const GRAD = "linear-gradient(135deg,#0E8A7B 0%,#0796B4 100%)";

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto h-[812px] w-[375px] overflow-hidden rounded-[52px] border-[10px] border-[#0B1513] bg-[#F3F8F6] shadow-[0_40px_90px_-40px_rgba(11,21,19,.6)]">
      <div className="absolute top-2 left-1/2 z-30 h-[30px] w-[120px] -translate-x-1/2 rounded-full bg-[#0B1513]" />
      <div className="flex h-11 items-end justify-between px-7 pb-1 text-[14px] font-semibold text-[#0B1513]">
        <span>9:41</span>
        <span className="text-[12px]">●●● ⌁ ▮</span>
      </div>
      <div className="absolute inset-x-0 top-11 bottom-0 flex flex-col">{children}</div>
    </div>
  );
}

/** L'hélice d'ADN en filigrane, en haut des écrans : la signature de PharmaBoost. */
function Dna({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-64 bg-[url(/poste/adn-helice.jpg)] bg-cover bg-[62%_40%] opacity-40 [mask-image:linear-gradient(180deg,#000_30%,transparent)] ${className}`} />;
}

function Tabs({ screen, go, fromPharmacy }: { screen: Screen; go: (s: Screen) => void; fromPharmacy: boolean }) {
  const tabs: { id: Screen; label: string; icon: ReactNode }[] = [
    { id: "accueil", label: "Accueil", icon: <Home className="size-5" /> },
    { id: "scan", label: "Scanner", icon: <ScanLine className="size-5" /> },
    { id: "pharmacie", label: fromPharmacy ? "Ma pharmacie" : "Pharmacies", icon: <Store className="size-5" /> },
    { id: "profil", label: "Profil", icon: <User className="size-5" /> },
  ];
  return (
    <nav className="flex border-t border-[#E3ECE9] bg-white/90 px-3 pt-2 pb-6 backdrop-blur">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => go(t.id)} className="flex flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold" style={{ color: screen === t.id || (screen === "fiche" && t.id === "scan") ? ACCENT : "#94A3A0" }}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[22px] bg-white p-4 shadow-[0_8px_24px_-16px_rgba(15,47,42,.35)] ${className}`}>{children}</div>;
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="mt-5 mb-2.5 text-[12px] font-extrabold tracking-[0.08em] text-[#0F2F2A] uppercase">{children}</h2>;
}

function Example() {
  return <span className="rounded-full bg-[#E8F3EF] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#3F5E57] uppercase">Exemple</span>;
}

// ---- Les écrans ---------------------------------------------------------------------------------------------------

function Welcome({ go, setFromPharmacy }: { go: (s: Screen) => void; setFromPharmacy: (v: boolean) => void }) {
  return (
    <div className="relative flex flex-1 flex-col px-6 pb-10">
      <Dna className="h-96 opacity-60" />
      <div className="relative mt-16 flex flex-col items-center text-center">
        <Robot size={110} mood="happy" label="Le robot PharmaBoost" />
        <p className="mt-4 text-[15px] font-bold text-[#0F2F2A]">Pharma<span style={{ color: ACCENT }}>Boost</span></p>
        <h1 className="mt-6 text-[32px] leading-[1.08] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">
          Votre pharmacie,
          <br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: GRAD }}>dans la poche.</span>
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#4B6A62]">Scannez un médicament, retrouvez vos conseils et vos cures.</p>
      </div>
      <div className="relative mt-auto space-y-3">
        <button type="button" onClick={() => { setFromPharmacy(true); go("mail"); }} className="flex w-full items-center gap-3 rounded-[20px] p-4 text-left text-white shadow-lg" style={{ background: GRAD }}>
          <Mail className="size-6 shrink-0" />
          <span className="flex-1">
            <span className="block text-[16px] font-bold">Je viens de ma pharmacie</span>
            <span className="block text-[12.5px] text-white/80">J&apos;ai reçu mon bilan par e-mail</span>
          </span>
          <ChevronRight className="size-5" />
        </button>
        <button type="button" onClick={() => { setFromPharmacy(false); go("accueil"); }} className="flex w-full items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-[0_8px_24px_-16px_rgba(15,47,42,.35)]">
          <Sparkles className="size-6 shrink-0" style={{ color: ACCENT }} />
          <span className="flex-1">
            <span className="block text-[16px] font-bold text-[#0F2F2A]">Découvrir l&apos;appli</span>
            <span className="block text-[12.5px] text-[#4B6A62]">Scanner un produit, trouver une pharmacie</span>
          </span>
          <ChevronRight className="size-5 text-[#94A3A0]" />
        </button>
      </div>
    </div>
  );
}

function MailScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="flex flex-1 flex-col bg-[#EEF2F1] px-4 pt-4">
      <p className="px-2 text-[13px] font-semibold text-[#64748B]">Boîte de réception</p>
      <Card className="mt-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: GRAD }}>PC</span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-[#0F2F2A]">Pharmacie du Centre</p>
            <p className="truncate text-[12px] text-[#64748B]">Votre bilan conseil du jour</p>
          </div>
          <span className="ml-auto"><Example /></span>
        </div>
        <div className="mt-4 rounded-2xl bg-[#F3F8F6] p-3.5 text-[13.5px] leading-5 text-[#23413B]">
          Bonjour Camille,
          <br />
          voici les conseils de votre pharmacien et le rappel de votre cure. Retrouvez-les à tout moment dans l&apos;appli PharmaBoost.
        </div>
        <button type="button" onClick={() => go("compte")} className="mt-4 h-12 w-full rounded-full text-[15px] font-bold text-white" style={{ background: GRAD }}>
          Ouvrir mon bilan dans l&apos;appli
        </button>
        <p className="mt-2 text-center text-[11.5px] text-[#94A3A0]">Le lien relie votre compte à votre pharmacie.</p>
      </Card>
    </div>
  );
}

function Account({ go }: { go: (s: Screen) => void }) {
  const [keep, setKeep] = useState(true);
  const [news, setNews] = useState(false);
  return (
    <div className="relative flex flex-1 flex-col px-6 pt-6 pb-8">
      <Dna />
      <div className="relative">
        <p className="text-[13px] font-semibold" style={{ color: ACCENT }}>Pharmacie du Centre vous invite</p>
        <h1 className="mt-1 text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">Créez votre compte</h1>
        <div className="mt-6 space-y-3">
          <label className="block rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="block text-[11px] font-semibold text-[#64748B]">Prénom</span><span className="text-[15px] font-semibold text-[#0F2F2A]">Camille</span></label>
          <label className="block rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="block text-[11px] font-semibold text-[#64748B]">E-mail</span><span className="text-[15px] font-semibold text-[#0F2F2A]">camille@exemple.fr</span></label>
          <label className="block rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="block text-[11px] font-semibold text-[#64748B]">Mot de passe</span><span className="text-[15px] font-semibold text-[#0F2F2A]">••••••••</span></label>
        </div>
        <div className="mt-5 space-y-3 text-[13px] leading-5 text-[#23413B]">
          <button type="button" onClick={() => setKeep(!keep)} className="flex items-start gap-2.5 text-left">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2" style={{ borderColor: ACCENT, background: keep ? ACCENT : "transparent" }}>{keep && <Check className="size-3.5 text-white" strokeWidth={3} />}</span>
            J&apos;accepte que PharmaBoost garde mes médicaments, mes conseils et mes cures pour me les montrer (données de santé, hébergement agréé).
          </button>
          <button type="button" onClick={() => setNews(!news)} className="flex items-start gap-2.5 text-left">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2" style={{ borderColor: ACCENT, background: news ? ACCENT : "transparent" }}>{news && <Check className="size-3.5 text-white" strokeWidth={3} />}</span>
            Facultatif : je veux recevoir les nouveautés et les offres de ma pharmacie.
          </button>
        </div>
      </div>
      <button type="button" disabled={!keep} onClick={() => go("accueil")} className="relative mt-auto h-12 w-full rounded-full text-[15px] font-bold text-white disabled:opacity-40" style={{ background: GRAD }}>
        Créer mon compte
      </button>
    </div>
  );
}

function HomeScreen({ go, fromPharmacy }: { go: (s: Screen) => void; fromPharmacy: boolean }) {
  const [who, setWho] = useState("Camille");
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative flex-1 overflow-y-auto px-5 pb-6">
      <Dna />
      <div className="relative">
        <div className="flex items-center justify-between pt-3">
          <div className="relative">
            <button type="button" onClick={() => setMenu(!menu)} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13.5px] font-bold text-[#0F2F2A] shadow-sm">
              <Users className="size-4" style={{ color: ACCENT }} /> {fromPharmacy ? who : "Invité"} <ChevronDown className="size-4 text-[#94A3A0]" />
            </button>
            {menu && fromPharmacy && (
              <div className="absolute top-10 left-0 z-10 w-44 rounded-2xl bg-white p-1.5 shadow-xl">
                {["Camille", "Léo (mon fils)", "Ajouter un proche"].map((n) => (
                  <button key={n} type="button" onClick={() => { if (!n.startsWith("Ajouter")) setWho(n.split(" ")[0]); setMenu(false); }} className="block w-full rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold text-[#0F2F2A] hover:bg-[#F3F8F6]">{n}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="relative grid size-10 place-items-center rounded-full bg-white shadow-sm">
            <Bell className="size-5 text-[#0F2F2A]" />
            {fromPharmacy && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-[#F04438]" />}
          </button>
        </div>
        <h1 className="mt-5 text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">
          {fromPharmacy ? <>Bonjour {who} 👋</> : <>Bienvenue 👋</>}
        </h1>
        <p className="mt-1 text-[14.5px] text-[#4B6A62]">Besoin d&apos;une info sur un médicament ?</p>
        <div className="mt-4 flex gap-2.5">
          <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-white px-4 text-[14px] text-[#94A3A0] shadow-sm"><Search className="size-4" /> Paracétamol, crème…</div>
          <button type="button" onClick={() => go("scan")} className="grid size-12 place-items-center rounded-2xl text-white shadow-md" style={{ background: GRAD }} aria-label="Scanner une boîte"><ScanLine className="size-6" /></button>
        </div>

        {fromPharmacy ? (
          <>
            <Title>Ma pharmacie</Title>
            <Card className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: GRAD }}><Store className="size-5" /></span>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#0F2F2A]">Pharmacie du Centre</p>
                <p className="text-[12.5px] text-[#0E8A7B]">● Ouverte jusqu&apos;à 19 h 30</p>
              </div>
              <ChevronRight className="size-5 text-[#94A3A0]" />
            </Card>

            <Title>Ma cure</Title>
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-bold text-[#0F2F2A]">Magnésium marin B6</p>
                <span className="rounded-full bg-[#FFF4E5] px-2.5 py-1 text-[11.5px] font-bold text-[#B45309]">7 jours restants</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8F3EF]"><div className="h-full w-[77%] rounded-full" style={{ background: GRAD }} /></div>
              <p className="mt-2 text-[12.5px] text-[#4B6A62]">Pensez à repasser à votre pharmacie pour la renouveler.</p>
            </Card>

            <Title>Mes médicaments en cours</Title>
            <Card className="divide-y divide-[#EEF3F1] p-0">
              {[["DOXYCYCLINE 100 mg", "Matin et soir · 10 jours"], ["PARACÉTAMOL 1000 mg", "Si besoin"]].map(([n, d]) => (
                <button key={n} type="button" onClick={() => go("fiche")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#E8F3EF]"><Pill className="size-4" style={{ color: ACCENT }} /></span>
                  <span className="flex-1"><span className="block text-[14px] font-bold text-[#0F2F2A]">{n}</span><span className="block text-[12px] text-[#64748B]">{d}</span></span>
                  <ChevronRight className="size-4 text-[#94A3A0]" />
                </button>
              ))}
            </Card>

            <Title>De la part de votre pharmacie</Title>
            <Card className="overflow-hidden p-0">
              <div className="flex h-24 items-center justify-center bg-[#FFF8E1] text-[34px]">☀️</div>
              <div className="p-4">
                <p className="text-[14.5px] font-bold text-[#0F2F2A]">Nouvelle gamme solaire en pharmacie</p>
                <p className="mt-1 text-[12.5px] text-[#4B6A62]">Demandez conseil au comptoir. <Example /></p>
              </div>
            </Card>
          </>
        ) : (
          <>
            <Title>Près de chez vous</Title>
            <Card className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-[#E8F3EF]"><MapPin className="size-5" style={{ color: ACCENT }} /></span>
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#0F2F2A]">Trouver une pharmacie PharmaBoost</p>
                <p className="text-[12.5px] text-[#4B6A62]">Un conseil personnalisé, un bilan après chaque visite</p>
              </div>
              <ChevronRight className="size-5 text-[#94A3A0]" />
            </Card>
          </>
        )}

        <Title>Les plus scannés</Title>
        <Card className="divide-y divide-[#EEF3F1] p-0">
          {["DOXYCYCLINE 100 mg", "Crème solaire SPF 50+", "Magnésium marin B6"].map((n) => (
            <button key={n} type="button" onClick={() => go("fiche")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="text-[16px]">💊</span>
              <span className="flex-1 text-[14px] font-semibold text-[#0F2F2A]">{n}</span>
              <ChevronRight className="size-4 text-[#94A3A0]" />
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}

function ScanScreen({ go }: { go: (s: Screen) => void }) {
  useEffect(() => {
    const id = setTimeout(() => go("fiche"), 2200);
    return () => clearTimeout(id);
  }, [go]);
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center bg-[#0B1513] text-white">
      <style>{`@keyframes pb-scan{0%,100%{top:12%}50%{top:84%}}`}</style>
      <p className="absolute top-8 text-[15px] font-semibold">Placez le code-barres dans le cadre</p>
      <div className="relative h-56 w-72 rounded-[28px] border-2 border-white/30 bg-[url(/site/produits/creme-solaire-spf50.webp)] bg-contain bg-center bg-no-repeat">
        <span className="absolute inset-x-6 h-[3px] rounded-full bg-[#5EEAD4] shadow-[0_0_18px_#5EEAD4]" style={{ animation: "pb-scan 1.6s ease-in-out infinite" }} />
        {["top-0 left-0 border-t-4 border-l-4 rounded-tl-[28px]", "top-0 right-0 border-t-4 border-r-4 rounded-tr-[28px]", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[28px]", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-[28px]"].map((c) => (
          <span key={c} className={`absolute size-10 border-[#5EEAD4] ${c}`} />
        ))}
      </div>
      <p className="mt-6 text-[13px] text-white/60">Lecture du code…</p>
      <button type="button" onClick={() => go("accueil")} className="absolute bottom-10 text-[14px] font-semibold text-white/80">Annuler</button>
    </div>
  );
}

function Fiche({ go, fromPharmacy }: { go: (s: Screen) => void; fromPharmacy: boolean }) {
  const [tab, setTab] = useState(0);
  const tabs = [
    { label: "À quoi ça sert", text: "Antibiotique de la famille des cyclines, prescrit par votre médecin pour traiter certaines infections." },
    { label: "Comment le prendre", text: "Au milieu d'un repas, avec un grand verre d'eau, et au moins une heure avant de vous coucher. Suivez la durée prescrite, même si vous allez mieux." },
    { label: "Précautions", text: "Évitez le soleil et les UV pendant le traitement : la peau peut réagir (photosensibilisation)." },
  ];
  return (
    <div className="relative flex-1 overflow-y-auto pb-6">
      <div className="relative px-5 pt-3 pb-5" style={{ background: "linear-gradient(180deg,#DDF1EB,#F3F8F6)" }}>
        <Dna className="opacity-30" />
        <div className="relative">
          <button type="button" onClick={() => go("accueil")} className="flex items-center gap-1 text-[14px] font-semibold text-[#0F2F2A]"><ArrowLeft className="size-4" /> Retour</button>
          <div className="mt-4 flex items-center gap-2"><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold" style={{ color: ACCENT }}>Médicament · sur ordonnance</span><Example /></div>
          <h1 className="mt-2 text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">DOXYCYCLINE 100 mg</h1>
          <p className="text-[13px] text-[#4B6A62]">Comprimé · boîte de 10</p>
        </div>
      </div>
      <div className="px-5">
        <div className="-mt-1 flex gap-1.5 overflow-x-auto">
          {tabs.map((t, i) => (
            <button key={t.label} type="button" onClick={() => setTab(i)} className="shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold" style={tab === i ? { background: GRAD, color: "#fff" } : { background: "#fff", color: "#4B6A62" }}>{t.label}</button>
          ))}
        </div>
        <Card className="mt-3">
          <p className="text-[14.5px] leading-6 text-[#23413B]">{tabs[tab].text}</p>
          <p className="mt-3 text-[11px] text-[#94A3A0]">Extrait de la notice (base officielle des médicaments).</p>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-[12px] font-extrabold tracking-[0.08em] text-[#0F2F2A] uppercase">Le conseil qui l&apos;accompagne</h2>
          <span className="rounded-full bg-[#F1E8FF] px-2 py-0.5 text-[10px] font-bold text-[#6D28D9] uppercase">Partenaire</span>
        </div>
        <Card className="mt-2.5">
          <div className="flex gap-3">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#FFF8E1] bg-[url(/site/produits/creme-solaire-spf50.webp)] bg-contain bg-center bg-no-repeat" />
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-[#0F2F2A]">Crème solaire SPF 50+</p>
              <p className="text-[12.5px] text-[#64748B]">Marque partenaire</p>
              <p className="mt-1 flex items-center gap-1 text-[12.5px] text-[#23413B]"><Sun className="size-3.5 text-[#F59E0B]" /> Protège la peau du soleil pendant le traitement</p>
            </div>
          </div>
          <button type="button" onClick={() => go("pharmacie")} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold text-white" style={{ background: GRAD }}>
            <Store className="size-4" /> {fromPharmacy ? "Le demander à ma pharmacie" : "Le trouver en pharmacie"}
          </button>
          <button type="button" className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#D5E3DF] text-[14px] font-bold text-[#0F2F2A]">
            <ShoppingBag className="size-4" /> Acheter en ligne
          </button>
        </Card>
        <p className="mt-4 text-center text-[11.5px] leading-4 text-[#94A3A0]">Cette fiche ne remplace pas l&apos;avis de votre pharmacien ou de votre médecin.</p>
      </div>
    </div>
  );
}

function Pharmacy({ fromPharmacy }: { fromPharmacy: boolean }) {
  return (
    <div className="relative flex-1 overflow-y-auto px-5 pb-6">
      <Dna />
      <div className="relative pt-4">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">{fromPharmacy ? "Ma pharmacie" : "Pharmacies PharmaBoost"}</h1>
        <Card className="mt-4">
          <p className="text-[16px] font-bold text-[#0F2F2A]">Pharmacie du Centre</p>
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-[#4B6A62]"><MapPin className="size-3.5" /> 12 rue de la République <Example /></p>
          <p className="mt-1 flex items-center gap-1 text-[12.5px] text-[#0E8A7B]"><Clock className="size-3.5" /> Ouverte jusqu&apos;à 19 h 30</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="h-11 rounded-full text-[13.5px] font-bold text-white" style={{ background: GRAD }}>Réserver un produit</button>
            <button type="button" className="h-11 rounded-full border border-[#D5E3DF] text-[13.5px] font-bold text-[#0F2F2A]">Itinéraire</button>
          </div>
        </Card>
        {fromPharmacy && (
          <>
            <Title>Mes bilans</Title>
            <Card className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#E8F3EF]"><Mail className="size-4" style={{ color: ACCENT }} /></span>
              <div className="flex-1"><p className="text-[14px] font-bold text-[#0F2F2A]">Bilan du 21 octobre</p><p className="text-[12px] text-[#64748B]">2 médicaments · 1 conseil · 1 cure</p></div>
              <ChevronRight className="size-4 text-[#94A3A0]" />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Profile({ fromPharmacy, go }: { fromPharmacy: boolean; go: (s: Screen) => void }) {
  return (
    <div className="relative flex-1 overflow-y-auto px-5 pb-6">
      <Dna />
      <div className="relative pt-4">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">Profil</h1>
        <Card className="mt-4 divide-y divide-[#EEF3F1] p-0">
          {(fromPharmacy ? ["Mes proches", "Notifications", "Mes consentements", "Mes données"] : ["Créer un compte", "Notifications", "Mes données"]).map((n) => (
            <div key={n} className="flex items-center justify-between px-4 py-3.5 text-[14.5px] font-semibold text-[#0F2F2A]">{n}<ChevronRight className="size-4 text-[#94A3A0]" /></div>
          ))}
        </Card>
        <button type="button" onClick={() => go("bienvenue")} className="mt-6 w-full text-center text-[13.5px] font-semibold text-[#94A3A0]">Revenir à l&apos;écran d&apos;accueil de la maquette</button>
      </div>
    </div>
  );
}

export function PatientApp() {
  const [screen, setScreen] = useState<Screen>("bienvenue");
  const [fromPharmacy, setFromPharmacy] = useState(true);
  const tabs = !["bienvenue", "mail", "compte", "scan"].includes(screen);
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#EAF4F1,#FFFFFF)] px-4 py-8">
      <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[1fr_400px]">
        <div className="pt-6">
          <p className="text-[13px] font-bold tracking-[0.1em] uppercase" style={{ color: ACCENT }}>Maquette cliquable</p>
          <h1 className="mt-2 text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">PharmaBoost, l&apos;appli des patients</h1>
          <p className="mt-3 max-w-xl text-[16px] leading-7 text-[#4B6A62]">Cliquez dans le téléphone. Deux portes d&apos;entrée : le patient qui vient de sa pharmacie (le lien de son bilan), et le grand public.</p>
          <ol className="mt-6 space-y-2.5 text-[15px] text-[#23413B]">
            {[
              ["Je viens de ma pharmacie", "l'e-mail du bilan → création du compte → médicaments, cure et pharmacie déjà là"],
              ["Découvrir l'appli", "le grand public : scan, fiche, trouver une pharmacie PharmaBoost"],
              ["Le scan", "la boîte scannée ouvre sa fiche : à quoi ça sert, comment le prendre, précautions"],
              ["Le conseil partenaire", "« Le demander à ma pharmacie » d'abord, l'achat en ligne ensuite"],
            ].map(([a, b], i) => (
              <li key={a} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: GRAD }}>{i + 1}</span><span><b>{a}</b> : {b}</span></li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            {(["bienvenue", "mail", "compte", "accueil", "scan", "fiche", "pharmacie", "profil"] as Screen[]).map((s) => (
              <button key={s} type="button" onClick={() => setScreen(s)} className="rounded-full border px-3 py-1.5 text-[12.5px] font-semibold capitalize" style={screen === s ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { borderColor: "#CFE0DB", color: "#3F5E57" }}>{s}</button>
            ))}
            <button type="button" onClick={() => setFromPharmacy(!fromPharmacy)} className="rounded-full border border-[#CFE0DB] px-3 py-1.5 text-[12.5px] font-semibold text-[#3F5E57]">Voir en {fromPharmacy ? "grand public" : "patient d'une pharmacie"}</button>
          </div>
          <p className="mt-4 text-[12.5px] text-[#94A3A0]">Tout est un exemple : aucune donnée réelle.</p>
        </div>
        <Phone>
          {screen === "bienvenue" && <Welcome go={setScreen} setFromPharmacy={setFromPharmacy} />}
          {screen === "mail" && <MailScreen go={setScreen} />}
          {screen === "compte" && <Account go={setScreen} />}
          {screen === "accueil" && <HomeScreen go={setScreen} fromPharmacy={fromPharmacy} />}
          {screen === "scan" && <ScanScreen go={setScreen} />}
          {screen === "fiche" && <Fiche go={setScreen} fromPharmacy={fromPharmacy} />}
          {screen === "pharmacie" && <Pharmacy fromPharmacy={fromPharmacy} />}
          {screen === "profil" && <Profile fromPharmacy={fromPharmacy} go={setScreen} />}
          {tabs && <Tabs screen={screen} go={setScreen} fromPharmacy={fromPharmacy} />}
        </Phone>
      </div>
    </main>
  );
}
