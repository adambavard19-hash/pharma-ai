"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/** Copie une adresse publique (webhook) pour la coller chez le prestataire. */
export function CopyButton({ value, label = "Copier l'adresse" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { push } = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          push({ tone: "warning", title: "Copie impossible", description: "Sélectionnez l'adresse et copiez-la à la main." });
        }
      }}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary"
      aria-label={label}
      title={label}
    >
      {copied ? <Check className="size-3.5 text-success-600" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </button>
  );
}
