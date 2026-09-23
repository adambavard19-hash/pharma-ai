"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Download, Plus, Trash2 } from "lucide-react";
import { createPostPairingAction, revokePostAction } from "@/server/actions/stock-sync";
import { describeAge } from "@/core/stock/connectors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

type PostRow = { id: string; label: string | null; hostname: string; paired: boolean; pairingExpiresAt: string | null; lastSeenAt: string | null; lastScanAt: string | null; scanCount: number; version: string | null };

/**
 * Les postes de caisse qui écoutent la douchette. Un poste = un code, une
 * installation d'une minute sur l'ordinateur où la douchette est branchée.
 * Ensuite, chaque boîte scannée dans le logiciel de l'officine apparaît au
 * comptoir PharmaBoost, sans second scan.
 */
export function CounterPostsCard({ serverUrl, posts }: { serverUrl: string; posts: PostRow[] }) {
  const [label, setLabel] = useState("");
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  // Lu une fois au montage : l'heure n'est pas une valeur de rendu.
  const [now] = useState(() => Date.now());

  const generate = () =>
    start(async () => {
      const result = await createPostPairingAction({ label: label || null });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setCode(result.data);
      setLabel("");
      router.refresh();
    });

  const revoke = (postId: string) =>
    start(async () => {
      const result = await revokePostAction({ postId });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : result.error });
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Barcode className="size-4 text-brand-600 dark:text-brand-400" /> Postes de caisse — la douchette alimente le comptoir
          </span>
        }
        description="Sur chaque ordinateur où une douchette est branchée, l'agent écoute les bips. Chaque boîte scannée dans votre logiciel apparaît dans PharmaBoost à l'instant, sans second scan. Rien n'est modifié dans votre logiciel ; seuls les codes-barres de boîtes sont transmis."
      />
      <CardContent className="space-y-4">
        {posts.length > 0 && (
          <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
            {posts.map((post) => {
              const seen = post.lastSeenAt ? (now - new Date(post.lastSeenAt).getTime()) / 1000 : null;
              const alive = seen !== null && seen < 180;
              return (
                <li key={post.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-text-primary">{post.label ?? post.hostname ?? "Poste"}</span>
                    {post.hostname && post.label && <span className="ml-2 text-text-tertiary">{post.hostname}</span>}
                    <span className="block text-[12.5px] text-text-secondary">
                      {!post.paired
                        ? post.pairingExpiresAt && new Date(post.pairingExpiresAt).getTime() > now
                          ? `Code en attente d'installation (valable jusqu'à ${formatDateTime(post.pairingExpiresAt)})`
                          : "Code expiré : générez-en un nouveau"
                        : `${post.scanCount} bip${post.scanCount > 1 ? "s" : ""}${post.lastScanAt ? ` · dernier ${describeAge(Math.round((now - new Date(post.lastScanAt).getTime()) / 1000))}` : ""}${post.version ? ` · agent ${post.version}` : ""}`}
                    </span>
                  </span>
                  {post.paired && <Badge tone={alive ? "success" : "warning"}>{alive ? "En ligne" : seen === null ? "Jamais vu" : `Muet depuis ${describeAge(Math.round(seen))}`}</Badge>}
                  <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-3.5" />} loading={pending} onClick={() => revoke(post.id)}>Retirer</Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Field label="Nom du poste" htmlFor="post-label" hint="Facultatif : « Caisse 1 », « Comptoir droite »…">
            <Input id="post-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Caisse 1" className="w-56" />
          </Field>
          <Button loading={pending} leadingIcon={<Plus className="size-4" />} onClick={generate}>Ajouter un poste</Button>
          <Button asChild variant="outline" leadingIcon={<Download className="size-4" />}>
            <a href="/api/agent/telecharger">Télécharger PharmaBoost Connect</a>
          </Button>
        </div>
        {posts.some((post) => post.paired) && (
          <p className="text-[12.5px] leading-5 text-text-tertiary">
            Mettre à jour un poste déjà relié : télécharger, extraire, puis dans le dossier extrait <code className="font-mono">powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -MiseAJour</code>. Aucun nouveau code.
          </p>
        )}

        {code && (
          <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
            <p className="text-[13px] text-text-secondary">Code de ce poste, valable jusqu&apos;à {formatDateTime(new Date(code.expiresAt))} :</p>
            <p className="text-center text-[40px] font-semibold tracking-[0.3em] text-brand-700 tabular dark:text-brand-400">{code.code}</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-5 text-text-primary">
              <li>Sur le poste de caisse, téléchargez <a href="/api/agent/telecharger" className="font-medium text-brand-700 underline dark:text-brand-400">PharmaBoost Connect</a> et décompressez l&apos;archive.</li>
              <li>Ouvrez PowerShell dans le dossier décompressé (clic droit → « Ouvrir dans le Terminal ») et collez :</li>
            </ol>
            <pre className="overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[12.5px] text-white">{`powershell -ExecutionPolicy Bypass -File .\\install-poste-windows.ps1 -Code ${code.code} -Serveur ${serverUrl}`}</pre>
            <p className="text-[12.5px] text-text-secondary">Puis passez une boîte à la douchette dans votre logiciel : elle apparaît dans PharmaBoost, écran Nouvelle vente. Pour vérifier la douchette sans rien envoyer : ajoutez <code className="font-mono">-Test</code> à la commande.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
