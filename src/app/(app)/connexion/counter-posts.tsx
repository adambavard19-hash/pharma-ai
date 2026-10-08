"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderSync, RefreshCw, Trash2 } from "lucide-react";
import { requestPostSyncAction, revokePostAction, setPostExportPathAction } from "@/server/actions/stock-sync";
import { ONLINE_WITHIN_SECONDS } from "@/core/stock/connection-overview";
import { describeAge } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { PostInstallFlow } from "./install-panels";

type PostRow = { id: string; label: string | null; hostname: string; paired: boolean; pairingExpiresAt: string | null; lastSeenAt: string | null; lastScanAt: string | null; scanCount: number; version: string | null; exportPath: string | null; lastExportAt: string | null; lastExportError: string | null };

/**
 * Les postes de comptoir, côté réglages : la liste, l'état de chacun, le
 * dossier d'export qu'il relit, « mettre à jour maintenant », retirer — et
 * l'ajout d'un poste, qui est le même geste que dans l'assistant. « En ligne »
 * veut dire : un signe de vie de moins de dix minutes, comme partout.
 */
export function CounterPostsCard({ posts }: { posts: PostRow[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  // Lu une fois au montage : l'heure n'est pas une valeur de rendu.
  const [now] = useState(() => Date.now());
  const [paths, setPaths] = useState<Record<string, string>>(() => Object.fromEntries(posts.map((post) => [post.id, post.exportPath ?? ""])));

  const act = (run: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await run();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : (result.error ?? "Impossible.") });
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {posts.length === 0 ? (
        <p className="text-[13.5px] text-text-secondary">Aucun poste pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {posts.map((post) => {
            const seen = post.lastSeenAt ? (now - new Date(post.lastSeenAt).getTime()) / 1000 : null;
            const alive = seen !== null && seen <= ONLINE_WITHIN_SECONDS;
            return (
              <li key={post.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13.5px]">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-text-primary">{post.label ?? post.hostname ?? "Poste"}</span>
                  {post.hostname && post.label && <span className="ml-2 text-text-tertiary">{post.hostname}</span>}
                  <span className="block text-[12.5px] text-text-secondary">
                    {!post.paired
                      ? post.pairingExpiresAt && new Date(post.pairingExpiresAt).getTime() > now
                        ? `Installation en attente (lien valable jusqu'au ${formatDateTime(post.pairingExpiresAt)})`
                        : "Lien expiré : obtenez-en un nouveau"
                      : `${post.scanCount} bip${post.scanCount > 1 ? "s" : ""}${post.lastScanAt ? ` · dernier ${describeAge(Math.round((now - new Date(post.lastScanAt).getTime()) / 1000))}` : ""}${post.version ? ` · version ${post.version}` : ""}`}
                  </span>
                </span>
                {post.paired && <Badge tone={alive ? "success" : "warning"}>{alive ? "En ligne" : seen === null ? "Jamais vu" : `Hors ligne depuis ${describeAge(Math.round(seen))}`}</Badge>}
                <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-3.5" />} loading={pending} onClick={() => act(() => revokePostAction({ postId: post.id }))}>Retirer</Button>
                {post.paired && (
                  <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                    <FolderSync className="size-3.5 shrink-0 text-text-tertiary" />
                    <Input
                      value={paths[post.id] ?? ""}
                      onChange={(e) => setPaths((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      placeholder={"Dossier d'export du stock vu depuis ce poste, ex. \\\\SERVEUR\\PharmaBoost\\Export"}
                      className="min-w-64 flex-1 font-mono text-[12.5px]"
                      aria-label="Dossier d'export du stock"
                    />
                    <Button size="sm" variant="outline" loading={pending} onClick={() => act(() => setPostExportPathAction({ postId: post.id, exportPath: paths[post.id] ?? "" }))} disabled={(paths[post.id] ?? "") === (post.exportPath ?? "")}>Enregistrer</Button>
                    {post.exportPath && (
                      <Button size="sm" variant="outline" leadingIcon={<RefreshCw className="size-3.5" />} loading={pending} onClick={() => act(() => requestPostSyncAction({ postId: post.id }))}>Relire le stock maintenant</Button>
                    )}
                    {post.exportPath && (
                      <span className={`basis-full text-[12.5px] ${post.lastExportError ? "text-danger-700 dark:text-danger-400" : "text-text-secondary"}`}>
                        {post.lastExportError ? `Dernier essai : ${post.lastExportError}` : post.lastExportAt ? `Stock relu ${describeAge(Math.round((now - new Date(post.lastExportAt).getTime()) / 1000))} depuis ce poste.` : "En attente du premier export : enregistrez l'édition de stock du logiciel dans ce dossier."}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="space-y-3 rounded-xl border border-border-subtle p-4">
        <p className="text-[14px] font-semibold text-text-primary">Ajouter un poste</p>
        <PostInstallFlow />
      </div>
      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Un poste installé avec l&apos;installateur se met à jour tout seul. Un poste installé à l&apos;ancienne, en ligne de commande : le réinstaller avec l&apos;installateur, ou relancer <code className="font-mono">install-poste-windows.ps1 -MiseAJour</code> (aucun nouveau code).
      </p>
    </div>
  );
}
