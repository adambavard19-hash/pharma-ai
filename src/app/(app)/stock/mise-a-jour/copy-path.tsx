"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Le chemin du dossier PharmaBoost, en gros, avec un bouton pour le copier et le coller dans l'Explorateur. */
export function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const { push } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      push({ tone: "warning", title: "Copie impossible", description: "Sélectionnez le chemin et copiez-le à la main." });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-default bg-surface-sunken px-4 py-3">
      <code className="min-w-0 flex-1 text-[18px] leading-7 font-semibold break-all text-text-primary select-all sm:text-[22px]">{path}</code>
      <Button type="button" variant="outline" size="md" onClick={copy} leadingIcon={copied ? <Check className="size-4 text-success-600" /> : <Copy className="size-4" />}>
        {copied ? "Copié" : "Copier"}
      </Button>
    </div>
  );
}
