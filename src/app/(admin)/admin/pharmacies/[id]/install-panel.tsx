import Link from "next/link";
import { pharmacyInstallState, type InstallState } from "@/server/services/stock-sync";
import { AdminSection } from "@/components/admin/page-header";
import { Dot } from "@/components/ui/badge";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import { LOCALE, TIME_ZONE } from "@/config/constants";
import { formatTime } from "@/lib/format";
import { When } from "../client-ui";
import { InstallCommands } from "./install-commands";

/** « 3 oct. » : le jour où le serveur s'est relié, sans l'année. */
const shortDate = (date: Date) => new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: "numeric", month: "short" }).format(date);

/** Combien de postes on nomme avant de dire « + N autres ». */
const POSTS_SHOWN = 5;

/**
 * « Installation sous AnyDesk » sur la fiche officine : l'état en trois
 * lignes (serveur, postes, stock), puis les deux gestes de l'équipe : préparer
 * la ligne du serveur, ajouter un poste. Aucun code n'est lu ici : il n'existe
 * qu'à l'écran, au moment où l'équipe le demande.
 */
export async function InstallPanel({ pharmacyId, now = new Date() }: { pharmacyId: string; now?: Date }) {
  const state = await pharmacyInstallState(pharmacyId, now);
  return <InstallPanelView pharmacyId={pharmacyId} state={state} />;
}

export function InstallPanelView({ pharmacyId, state }: { pharmacyId: string; state: InstallState }) {
  const { server, posts } = state;
  const shownPosts = posts.filter((post) => post.linked || post.linkValidUntil).slice(0, POSTS_SHOWN);
  const hiddenPosts = posts.filter((post) => post.linked || post.linkValidUntil).length - shownPosts.length;

  return (
    <AdminSection title="Installation sous AnyDesk" description="Une ligne à copier pour le serveur, une ligne par poste. Rien à télécharger ni à décompresser.">
      <div className="space-y-5">
        <ul className="space-y-2 text-[13.5px] leading-5 text-text-primary">
          <li className="flex items-start gap-2">
            <Dot tone={server?.linked ? "success" : "warning"} className="mt-1.5" />
            <span>{serverLine(server)}</span>
          </li>
          <li className="flex items-start gap-2">
            <Dot tone={shownPosts.some((post) => post.linked) ? "success" : "neutral"} className="mt-1.5" />
            <span>
              {shownPosts.length === 0 ? (
                "Aucun poste relié."
              ) : (
                <>
                  Postes :{" "}
                  {shownPosts.map((post, index) => (
                    <span key={post.id}>
                      {index > 0 && ", "}
                      <span className="font-medium">{post.label || post.hostname || "Poste"}</span>{" "}
                      <span className="text-text-secondary">({post.linked ? <>vu <When date={post.lastSeenAt} empty="jamais" /></> : post.linkValidUntil ? `ligne prête jusqu'à ${formatTime(post.linkValidUntil)}` : ""})</span>
                    </span>
                  ))}
                  {hiddenPosts > 0 && <span className="text-text-secondary"> et {hiddenPosts} autre{hiddenPosts > 1 ? "s" : ""}</span>}
                </>
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Dot tone={state.stockSyncedAt ? "success" : "neutral"} className="mt-1.5" />
            <span>
              Stock : {state.stockSyncedAt ? <>dernier fichier reçu <When date={state.stockSyncedAt} /></> : "aucun fichier reçu pour l'instant"}.{" "}
              <Link href="/admin/depots-stock" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
                Voir les stocks reçus
              </Link>
            </span>
          </li>
        </ul>

        <InstallCommands
          pharmacyId={pharmacyId}
          lgos={LGO_DEFINITIONS.map((lgo) => ({ id: lgo.id, label: lgo.label }))}
          // LGPI d'office : c'est le seul logiciel dont la procédure est vérifiée, et celui du script par défaut.
          defaultLgo={server?.lgo ?? "lgpi"}
          serverPairedAt={server?.pairedAt?.toISOString() ?? null}
          unusedServerCode={Boolean(server?.codeValidUntil)}
          linkedPostIds={posts.filter((post) => post.linked).map((post) => post.id)}
        />
      </div>
    </AdminSection>
  );
}

/**
 * La ligne du serveur : relié depuis quand et vu quand, pas encore relié, ou
 * déconnecté. Un code émis et pas encore utilisé n'y est pas annoncé : la
 * commande n'existe qu'en mémoire, dans le navigateur de celui qui l'a
 * demandée (voir `InstallCommands`, qui le dit sous le bouton quand elle n'est
 * plus affichée).
 */
function serverLine(server: InstallState["server"]) {
  if (server?.linked && server.pairedAt) {
    return (
      <>
        Serveur relié{server.hostname ? ` (${server.hostname})` : ""} depuis le {shortDate(server.pairedAt)} — dernier signe <When date={server.lastSeenAt} empty="jamais" />.
      </>
    );
  }
  if (server?.pairedAt) return "Serveur déconnecté : sa clé a été retirée. Préparez une nouvelle installation.";
  return "Serveur pas encore relié.";
}
