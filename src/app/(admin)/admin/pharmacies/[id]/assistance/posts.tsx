"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderSync, RefreshCw, Trash2 } from "lucide-react";
import { adminRequestPostSyncAction, adminRevokePostAction, adminSetPostExportPathAction } from "@/server/actions/admin-connection";
import { ONLINE_WITHIN_SECONDS } from "@/core/stock/connection-overview";
import { describeAge } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

export type AssistancePost = {
  id: string;
  label: string | null;
  hostname: string;
  paired: boolean;
  pairingExpiresAt: string | null;
  lastSeenAt: string | null;
  lastScanAt: string | null;
  scanCount: number;
  version: string | null;
  exportPath: string | null;
  lastExportAt: string | null;
  lastExportError: string | null;
};

/**
 * Les postes de comptoir, côté assistance : la liste, l'état de chacun, le dossier d'export du stock qu'il relit,
 * « relire maintenant », retirer. Réservé à la console : le pharmacien ne voit ni dossier ni chemin. « En ligne »
 * veut dire un signe de vie de moins de dix minutes, comme partout.
 */
export function AssistancePosts({ pharmacyId, posts }: { pharmacyId: string; posts: AssistancePost[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  // Lu une fois au montage : l'heure n'est pas une valeur de rendu.
  const [now] = useState(() => Date.now());
  const [paths, setPaths] = useState<Record<string, string>>(() => Object.fromEntries(posts.map((post) => [post.id, post.exportPath ?? ""])));
  const [removing, setRemoving] = useState<string | null>(null);

  const act = (run: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await run();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : (result.error ?? "Impossible.") });
      setRemoving(null);
      router.refresh();
    });

  if (posts.length === 0) return <p className="text-[13.5px] text-text-secondary">Aucun poste pour l&apos;instant.</p>;

  return (
    <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
      {posts.map((post) => {
        const seen = post.lastSeenAt ? (now - new Date(post.lastSeenAt).getTime()) / 1000 : null;
        const alive = seen !== null && seen <= ONLINE_WITHIN_SECONDS;
        return (
          <li key={post.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13.5px]">
            <span className="min-w-0 flex-1 basis-48">
              <span className="font-medium text-text-primary">{post.label || post.hostname || "Poste"}</span>
              {post.hostname && post.label && <span className="ml-2 text-text-tertiary">{post.hostname}</span>}
              <span className="block text-[12.5px] text-text-secondary">
                {!post.paired
                  ? post.pairingExpiresAt && new Date(post.pairingExpiresAt).getTime() > now
                    ? `Installation en attente (valable jusqu'au ${formatDateTime(post.pairingExpiresAt)})`
                    : "Lien expiré"
                  : `${post.scanCount} bip${post.scanCount > 1 ? "s" : ""}${post.lastScanAt ? ` · dernier ${describeAge(Math.round((now - new Date(post.lastScanAt).getTime()) / 1000))}` : ""}${post.version ? ` · version ${post.version}` : ""}`}
              </span>
            </span>
            {post.paired && <Badge tone={alive ? "success" : "warning"}>{alive ? "En ligne" : seen === null ? "Jamais vu" : `Hors ligne depuis ${describeAge(Math.round(seen))}`}</Badge>}
            {removing === post.id ? (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="danger" loading={pending} onClick={() => act(() => adminRevokePostAction({ pharmacyId, postId: post.id }))}>Confirmer le retrait</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRemoving(null)}>Annuler</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setRemoving(post.id)}>Retirer</Button>
            )}
            {post.paired && (
              <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                <FolderSync className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                <Input
                  value={paths[post.id] ?? ""}
                  onChange={(e) => setPaths((prev) => ({ ...prev, [post.id]: e.target.value }))}
                  placeholder={"Dossier d'export du stock vu depuis ce poste, ex. \\\\SERVEUR\\PharmaBoost\\Export"}
                  className="min-w-64 flex-1 font-mono text-[12.5px]"
                  aria-label="Dossier d'export du stock"
                />
                <Button size="sm" variant="outline" loading={pending} onClick={() => act(() => adminSetPostExportPathAction({ pharmacyId, postId: post.id, exportPath: paths[post.id] ?? "" }))} disabled={(paths[post.id] ?? "") === (post.exportPath ?? "")}>Enregistrer</Button>
                {post.exportPath && (
                  <Button size="sm" variant="outline" leadingIcon={<RefreshCw className="size-3.5" />} loading={pending} onClick={() => act(() => adminRequestPostSyncAction({ pharmacyId, postId: post.id }))}>Relire le stock maintenant</Button>
                )}
                {post.exportPath && (
                  <span className={`basis-full text-[12.5px] ${post.lastExportError ? "text-danger-700 dark:text-danger-400" : "text-text-secondary"}`}>
                    {post.lastExportError ? `Dernier essai : ${post.lastExportError}` : post.lastExportAt ? `Stock relu ${describeAge(Math.round((now - new Date(post.lastExportAt).getTime()) / 1000))} depuis ce poste.` : "En attente du premier export : l'édition de stock du logiciel doit être enregistrée dans ce dossier."}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
