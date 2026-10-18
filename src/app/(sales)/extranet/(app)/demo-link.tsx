"use client";

import { useState } from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";

/** Le lien de démonstration du commercial : à copier, envoyer par e-mail ou par SMS. Une pharmacie qui réserve par ce lien lui est attribuée. */
export function DemoLink({ url, repName }: { url: string; repName: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Bonjour, je vous propose une démonstration de PharmaBoost (20 minutes, sur votre poste). Choisissez votre créneau ici : ${url} — ${repName}`;
  return (
    <div className="space-y-3" data-lien-demo="">
      <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-sunken/50 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text-secondary">{url}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`mailto:?subject=${encodeURIComponent("Démonstration PharmaBoost")}&body=${encodeURIComponent(text)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-[13px] font-medium text-text-primary hover:bg-surface-sunken">
          <Mail className="size-4" /> Envoyer par e-mail
        </a>
        <a href={`sms:?&body=${encodeURIComponent(text)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-[13px] font-medium text-text-primary hover:bg-surface-sunken">
          <MessageCircle className="size-4" /> Envoyer par SMS
        </a>
      </div>
    </div>
  );
}
