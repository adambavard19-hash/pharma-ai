import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getNewsOverview, type NewsOverview } from "@/server/services/patient-news";
import { PageHeader } from "@/components/ui/page";
import { Alert } from "@/components/ui/feedback";
import { NewsStateCard } from "./news-state-card";
import { AnnouncementComposer } from "./announcement-composer";
import { AnnouncementHistory } from "./announcement-history";

export const metadata: Metadata = { title: "Nouveautés" };

// Un envoi aux abonnés dure jusqu'à 45 secondes avant de reprendre la main : on
// le déclare à l'hébergeur plutôt que d'être coupé en route. Les actions de la
// page (envoi, reprise) héritent de cette durée.
export const maxDuration = 60;

/**
 * Les nouveautés pour les patients — écran de titulaire.
 *
 * L'officine vient de la SESSION, jamais de l'adresse : aucun identifiant
 * d'officine n'est lu dans la requête. L'écran ne montre que des comptes (le
 * nombre d'abonnés, jamais une adresse) ; les règles de l'envoi — contenu,
 * une annonce par semaine, nombre confirmé — sont rejouées par le serveur.
 */
export default async function NewsPage() {
  const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);

  let loaded: { overview: NewsOverview; isDemo: boolean } | null = null;
  try {
    const [overview, pharmacy] = await Promise.all([
      getNewsOverview(session.scope),
      prisma.pharmacy.findUnique({ where: { id: session.scope.pharmacyId }, select: { isDemo: true } }),
    ]);
    loaded = { overview, isDemo: pharmacy?.isDemo ?? false };
  } catch (error) {
    console.error("[nouveautés] chargement impossible", error);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Nouveautés pour vos patients"
        description="Les patients qui l'ont choisi sont prévenus des nouvelles gammes de votre pharmacie. Une annonce est un geste du titulaire : rien ne part tout seul."
      />

      {loaded ? (
        <>
          <NewsStateCard enabled={loaded.overview.enabled} activeCount={loaded.overview.activeCount} messagingLive={loaded.overview.messagingLive} isDemo={loaded.isDemo} />
          <AnnouncementComposer
            pharmacyName={session.pharmacy.name}
            userEmail={session.user.email}
            enabled={loaded.overview.enabled}
            activeCount={loaded.overview.activeCount}
            nextAllowedAt={loaded.overview.nextAllowedAt?.toISOString() ?? null}
            messagingLive={loaded.overview.messagingLive}
            rangeSuggestions={loaded.overview.rangeSuggestions}
          />
          <AnnouncementHistory announcements={loaded.overview.announcements.map((announcement) => ({ ...announcement, createdAt: announcement.createdAt.toISOString() }))} />
        </>
      ) : (
        <Alert tone="danger" title="Les nouveautés ne peuvent pas être affichées pour le moment">
          Rien n&apos;a été envoyé ni modifié. Rechargez la page dans un instant ; si cela persiste, prévenez le support.
        </Alert>
      )}
    </div>
  );
}
