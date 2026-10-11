import type { Metadata } from "next";
import { PlayCircle } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { academyViewer, loadCatalogue, loadFeed, loadModules, loadPassport } from "@/server/services/mobile/academy";
import { isAcademyTopic } from "@/core/academy/topics";
import { PROFESSION_LABELS } from "@/core/mobile/profile";
import { QuietState, ScreenTitle } from "../../_components/ui";
import { Feed } from "./_components/feed";
import { isFormationsView, NotDpcNote, Segments } from "./_components/labels";
import { CatalogueView, ModulesView, PassportView } from "./_components/views";
import { discoverViewerFor } from "@/server/services/mobile/discover";
import { loadSponsoredSlot } from "@/server/services/mobile/sponsoring";
import { SponsoredHeroCard } from "../decouvertes/_components/cards";

export const metadata: Metadata = { title: "Formations" };

/**
 * L'Académie PharmaBoost. Quatre vues, chacune à sa propre adresse (`?vue=`) : le fil « Pour vous » de micro-vidéos,
 * le catalogue (recherche et thèmes), les parcours, le passeport. Tout vient de la base, filtré par la règle de
 * visibilité (relu, publié, pas échu, ouvert à ce public). Un compte gratuit ne voit que les contenus gratuits.
 */
export default async function FormationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const view = isFormationsView(one("vue")) ? (one("vue") as "pour-vous" | "catalogue" | "parcours" | "passeport") : "pour-vous";
  const viewer = await academyViewer(session);
  const now = new Date();

  if (view === "pour-vous") {
    const cards = await loadFeed(viewer, now);
    return (
      <div className="space-y-3 lg:space-y-4">
        <h1 className="sr-only">Formations — Pour vous</h1>
        <Segments current="pour-vous" />
        {cards.length > 0 ? (
          <Feed cards={cards} />
        ) : (
          <QuietState
            icon={<PlayCircle className="size-6" aria-hidden="true" />}
            title="Les premières vidéos arrivent"
            body={session.isClientStaff ? "Des vidéos de 1 à 3 minutes, relues avant publication, à regarder entre deux patients." : "Les vidéos ouvertes aux comptes gratuits, relues avant publication, s'afficheront ici."}
          />
        )}
      </div>
    );
  }

  // Une campagne sponsorisée de formation (étape Découvertes) : signalée « Sponsorisé », comptée sans identité, et
  // seulement au-dessus du catalogue et des parcours — jamais mêlée au fil ni aux résultats.
  const sponsored =
    view === "catalogue" || view === "parcours"
      ? await loadSponsoredSlot("TRAINING_FEED", { viewer: await discoverViewerFor(session), profession: session.user.profession, role: session.role }, { now, limit: 1 }).catch(() => [])
      : [];

  let body: React.ReactNode;
  if (view === "catalogue") {
    const q = one("q").slice(0, 80);
    const topic = isAcademyTopic(one("theme")) ? one("theme") : null;
    const format = one("format") === "video" || one("format") === "fiche" ? one("format") : null;
    const { items, total } = await loadCatalogue(viewer, { q, topic, format }, now);
    body = <CatalogueView items={items} total={total} q={q} topic={topic} format={format} isFree={!session.isClientStaff} />;
  } else if (view === "parcours") {
    body = <ModulesView modules={await loadModules(viewer, now)} />;
  } else {
    const passport = await loadPassport(viewer, now);
    const subtitle = session.activePharmacy ? `${session.roleLabel} · ${session.activePharmacy.name}` : session.user.profession ? PROFESSION_LABELS[session.user.profession] : "Compte PharmaBoost";
    body = <PassportView passport={passport} firstName={session.user.firstName} fullName={session.user.fullName} subtitle={subtitle} />;
  }

  return (
    <div className="space-y-5">
      <ScreenTitle title="Formations" subtitle={view === "passeport" ? "Ce que vous avez appris vous suit, d'une officine à l'autre." : view === "parcours" ? "Quelques vidéos et leurs quiz, dans le bon ordre." : "Des formations courtes, relues avant publication."} />
      <Segments current={view} />
      {sponsored.map((card) => (
        <SponsoredHeroCard key={card.campaignId} card={card} />
      ))}
      {body}
      <NotDpcNote />
    </div>
  );
}
